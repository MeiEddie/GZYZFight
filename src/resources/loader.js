/**
 * 异步资源管理器
 * ------------------------------------------------------------
 * 能力：
 *   1. 按需加载   assets.image(key) / assets.audio(key)
 *   2. 批量预加载 assets.preload([key], onProgress)
 *   3. 真实进度   fetch 读流，按字节上报（不是「假装转圈」）
 *   4. 释放内存   release(key) —— 图片 close() 掉 ImageBitmap，
 *                 音频 pause + revokeObjectURL，真正归还显存/解码缓存
 *
 * 为什么用 fetch + Blob 而不是直接给 <img>/<audio> 赋 src？
 *   - 能拿到 content-length，进度是真实的；
 *   - 图片可以走 createImageBitmap，离屏解码、不占 DOM，close() 即释放；
 *   - 音频用 objectURL，卸载时 revoke 掉，不会残留已解码的音频数据。
 *
 * 注意：模块化开发时需要 http 环境（ES Module 不允许 file:// 直接加载），
 *       本地请用 `npx serve`（见 README）；打包后的单文件会内联素材，file:// 也能跑。
 */
import { MANIFEST, keysOfGroup } from './manifest.js';
import { ASSET_BYTES } from './sizes.js';

/**
 * 「无进展」超时（毫秒）：只要还有字节在流动就重新计时。
 * 不能设固定总时长——启动路径里有 5.3 MB 的校歌，
 * 1.2 Mbps 下光它就要 35 秒以上，固定 30 秒会反复把它打断。
 */
const STALE_TIMEOUT = 20000;

/** 失败重试退避（毫秒），逐次递增到上限 */
const BACKOFF_BASE = 800;
const BACKOFF_MAX = 4000;

/** 音频解码超时（毫秒）：到点判失败并重新下载，绝不带着半成品进游戏 */
const AUDIO_DECODE_TIMEOUT = 6000;

/** 体积表里查不到的资源按这个权重估算（小图标的量级） */
const DEFAULT_WEIGHT = 48 * 1024;

/** 下载阶段的进度占比，剩下 10% 留给解码 */
const DOWNLOAD_SHARE = .9;

/**
 * 同时最多几个请求在途。
 * 不能把 50 个资源一次性全发出去：慢网下大文件会吃满带宽，
 * 排在后面的小图标几十秒拿不到一个字节，被「无进展超时」误判为卡死并重下。
 * 6 与浏览器常见的 HTTP/1.1 连接数一致，且总时长仍由总字节 / 带宽决定。
 */
const MAX_CONCURRENT = 6;

/** 有限并发池：一个 worker 做完一个再取下一个 */
async function runPool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

/** 取某资源的权重（字节）；查不到就给一个保守默认值 */
function weightOf(key) {
  const n = ASSET_BYTES && ASSET_BYTES[key];
  return n > 0 ? n : DEFAULT_WEIGHT;
}

/** data: URI → Blob（单文件版内联素材时使用，避免依赖 fetch） */
function dataUriToBlob(uri) {
  const comma = uri.indexOf(',');
  const head = uri.slice(0, comma);
  const body = uri.slice(comma + 1);
  const mime = (/:(.*?);/.exec(head) || [])[1] || 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** 读流下载并上报字节进度 */
async function fetchBlob(url, onBytes) {
  // 单文件打包版会把素材以 data: URI 注入 window.__ASSET_DATA，
  // 这里直接本地解码，不发起任何网络请求（file:// 也能跑）。
  const inline = typeof window !== 'undefined' && window.__ASSET_DATA && window.__ASSET_DATA[url];
  if (inline) {
    const blob = dataUriToBlob(inline);
    if (onBytes) onBytes(1);
    return blob;
  }

  const ctrl = new AbortController();
  let timer = 0;
  let stalled = false;
  // 每来一批字节就重新计时：慢网可以慢慢下，但完全卡住不能一直等
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { stalled = true; ctrl.abort(); }, STALE_TIMEOUT);
  };
  arm();
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} · ${url}`);

    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !total) {
      const blob = await res.blob();
      if (onBytes) onBytes(1);
      return blob;
    }

    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      arm();
      if (onBytes) onBytes(Math.min(1, received / total));
    }
    // 连接提前掐断时不能把半截文件交去解码
    if (received < total) throw new Error(`响应提前结束 ${received}/${total} · ${url}`);
    return new Blob(chunks, { type: res.headers.get('content-type') || '' });
  } catch (e) {
    if (stalled) throw new Error('下载停滞超时 · ' + url);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** 解码图片：优先 ImageBitmap（可 close 释放），退化到 HTMLImageElement */
async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return { drawable: bitmap, kind: 'bitmap' };
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = url;
  });
  return { drawable: img, kind: 'img', url };
}

/**
 * 解码音频：挂到 <audio> 上，走 objectURL 便于彻底释放。
 * 只要 loadedmetadata 到达就算成功（已经能证明文件可解析），
 * 不等 canplaythrough —— 大文件会白等好几秒，还可能永远不触发。
 * 超时或报错一律判失败并回收 objectURL，由启动层重新下载重试：
 * 元数据都没就绪的半成品绝不能被当成「已加载」。
 */
async function decodeAudio(blob, spec) {
  const url = URL.createObjectURL(blob);
  const el = new Audio();
  el.preload = 'auto';
  el.src = url;
  el.loop = !!spec.loop;
  el.volume = spec.volume !== undefined ? spec.volume : .55;

  await new Promise((resolve, reject) => {
    let settled = false;
    let timer = 0;

    const cleanup = () => {
      el.removeEventListener('loadedmetadata', onReady);
      el.removeEventListener('canplay', onReady);
      el.removeEventListener('error', onError);
      clearTimeout(timer);
    };
    const onReady = () => { if (settled) return; settled = true; cleanup(); resolve(); };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error('音频解码失败 · ' + spec.src));
    };

    el.addEventListener('loadedmetadata', onReady, { once: true });
    el.addEventListener('canplay', onReady, { once: true });
    el.addEventListener('error', onError, { once: true });
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error('音频解码超时 · ' + spec.src));
    }, AUDIO_DECODE_TIMEOUT);

    el.load();
  });
  return { drawable: el, kind: 'audio', url };
}

/**
 * 资源管理器。
 * 每个缓存项：{ key, type, data, kind, url, bytes }
 */
export class AssetManager {
  constructor(manifest) {
    this.manifest = manifest;
    /** @type {Map<string, object>} */
    this.cache = new Map();
    /** @type {Map<string, Promise<object>>} 正在加载的任务，避免重复请求 */
    this.inflight = new Map();
  }

  /** 同步取已加载资源（未加载返回 null） */
  get(key) {
    const rec = this.cache.get(key);
    return rec ? rec.data : null;
  }

  /** 是否已加载 */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * 只下载、不解码。预加载时先把字节全部拿到，再统一解码，
   * 这样「下载进度」和「准备画面」是两个阶段，进度条不会假装走完。
   * @param {string} key
   * @param {(ratio:number)=>void} [onBytes] 单文件字节进度 0..1
   * @returns {Promise<Blob>}
   */
  download(key, onBytes) {
    const spec = this.manifest[key];
    if (!spec) return Promise.reject(new Error(`未在 manifest 登记的资源: ${key}`));
    return fetchBlob(spec.src, onBytes);
  }

  /**
   * 把已下载的字节解码并写入缓存。
   * @param {string} key
   * @param {Blob} blob
   * @returns {Promise<object>} 缓存记录
   */
  async commit(key, blob) {
    const spec = this.manifest[key];
    const decoded = spec.type === 'audio'
      ? await decodeAudio(blob, spec)
      : await decodeImage(blob);

    const rec = {
      key,
      type: spec.type,
      data: decoded.drawable,
      kind: decoded.kind,
      url: decoded.url || null,
      bytes: blob.size
    };
    this.cache.set(key, rec);
    return rec;
  }

  /**
   * 加载一个资源（幂等，重复调用复用同一个 Promise）。
   * @param {string} key
   * @param {(ratio:number)=>void} [onBytes] 单文件字节进度 0..1
   */
  load(key, onBytes) {
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    if (this.inflight.has(key)) return this.inflight.get(key);
    if (!this.manifest[key]) {
      return Promise.reject(new Error(`未在 manifest 登记的资源: ${key}`));
    }

    const task = (async () => {
      const blob = await this.download(key, onBytes);
      return this.commit(key, blob);
    })();

    this.inflight.set(key, task);
    task.catch(() => {}).finally(() => this.inflight.delete(key));
    return task;
  }

  /** 取图片（ImageBitmap 或 HTMLImageElement，均可直接 drawImage） */
  async image(key) {
    const rec = await this.load(key);
    return rec.data;
  }

  /** 取音频元素（HTMLAudioElement） */
  async audio(key) {
    const rec = await this.load(key);
    return rec.data;
  }

  /**
   * 批量预加载，带聚合进度，且严格保证完整性。
   * ------------------------------------------------------------
   * 两个阶段：
   *   1. 下载 0 → 90%，按「字节权重」聚合（大文件自然占大头）
   *   2. 解码 90 → 100%，全部字节到手后才开始
   *
   * 任何一个资源下载或解码失败，都会退避后重新下载，直到真正写入缓存。
   * Promise 只在「全部资源都可用」时才 resolve，调用方可以放心地把
   * 「淡出加载层」直接挂在它后面，绝不会出现缺件界面。
   * 失败资源的字节权重保持 0，进度条如实停住、不假装走完。
   *
   * @param {string[]} keys
   * @param {(ratio:number, total:number, key:string, phase:'download'|'retry'|'decode'|'done', info?:object)=>void} [onProgress]
   * @returns {Promise<{loaded:string[], failed:string[], attempts:number}>}
   */
  async preload(keys, onProgress) {
    const list = keys.filter(k => !this.cache.has(k));
    if (!list.length) {
      if (onProgress) onProgress(1, 0, '', 'done');
      return { loaded: [], failed: [], attempts: 0 };
    }

    const total = list.length;
    const weights = new Map(list.map(k => [k, weightOf(k)]));
    const totalBytes = list.reduce((s, k) => s + weights.get(k), 0) || 1;
    const frac = new Map(list.map(k => [k, 0]));
    const blobs = new Map();
    let attempts = 0;
    let shownRatio = 0;

    const backoff = n => Math.min(BACKOFF_MAX, Math.round(BACKOFF_BASE * Math.pow(1.5, Math.min(n, 6))));
    const waitFor = ms => new Promise(r => setTimeout(r, ms));
    const notifyRetry = (key, n, wait) => {
      if (onProgress) onProgress(shownRatio, total, key, 'retry', { attempt: n, wait });
    };

    /* 进度只增不减：重试时停住，不让进度条倒退吓人 */
    const reportDownload = key => {
      if (!onProgress) return;
      let sum = 0;
      for (const [k, v] of frac) sum += weights.get(k) * v;
      const ratio = DOWNLOAD_SHARE * Math.min(1, sum / totalBytes);
      if (ratio - shownRatio < .004) return;
      shownRatio = ratio;
      onProgress(ratio, total, key, 'download');
    };

    /* ---------------- 阶段 1：下载 ---------------- */
    reportDownload(list[0]);
    await runPool(list, MAX_CONCURRENT, async key => {
      let n = 0;
      for (;;) {
        try {
          const blob = await this.download(key, r => { frac.set(key, r); reportDownload(key); });
          frac.set(key, 1);            // 只有真的拿到完整字节才记完成
          blobs.set(key, blob);
          reportDownload(key);
          return;
        } catch (e) {
          n += 1; attempts += 1;
          frac.set(key, 0);            // 失败不冒充成功
          console.warn(`[assets] 下载失败，重试 #${n}:`, key, e && e.message);
          const wait = backoff(n);
          notifyRetry(key, attempts, wait);
          await waitFor(wait);
        }
      }
    });

    /* ---------------- 阶段 2：解码 ---------------- */
    shownRatio = DOWNLOAD_SHARE;
    if (onProgress) onProgress(DOWNLOAD_SHARE, total, list[0], 'decode');

    let done = 0;
    await Promise.all(list.map(async key => {
      let n = 0;
      for (;;) {
        try {
          const blob = blobs.get(key) || await this.download(key);
          await this.commit(key, blob);
          break;
        } catch (e) {
          n += 1; attempts += 1;
          blobs.delete(key);           // 这批字节作废，重新下载再解
          console.warn(`[assets] 解码失败，重新下载 #${n}:`, key, e && e.message);
          const wait = backoff(n);
          notifyRetry(key, attempts, wait);
          await waitFor(wait);
        }
      }
      done += 1;
      if (onProgress) {
        onProgress(DOWNLOAD_SHARE + (1 - DOWNLOAD_SHARE) * (done / total), total, key, 'decode');
      }
    }));

    // 最后一道闸：只要还有一件没进缓存就抛错，调用方不会淡出加载层
    const failed = list.filter(k => !this.cache.has(k));
    if (failed.length) throw new Error('以下资源未能就绪: ' + failed.join(', '));

    if (onProgress) onProgress(1, total, '', 'done');
    return { loaded: list, failed: [], attempts };
  }

  /** 按 manifest 的 group 预加载 */
  preloadGroup(group, onProgress) {
    return this.preload(keysOfGroup(group), onProgress);
  }

  /**
   * 释放单个资源。
   * 图片：ImageBitmap.close() 立即释放；<img> 则断开 src 交给 GC。
   * 音频：暂停 → 清 src → load() → revokeObjectURL。
   */
  release(key) {
    const rec = this.cache.get(key);
    if (!rec) return false;

    if (rec.type === 'image') {
      if (rec.kind === 'bitmap' && rec.data && rec.data.close) rec.data.close();
      if (rec.kind === 'img' && rec.data) rec.data.src = '';
      if (rec.url) URL.revokeObjectURL(rec.url);
    } else if (rec.type === 'audio') {
      const el = rec.data;
      if (el) {
        try { el.pause(); } catch (e) { /* 忽略 */ }
        el.removeAttribute('src');
        try { el.load(); } catch (e) { /* 忽略 */ }
      }
      if (rec.url) URL.revokeObjectURL(rec.url);
    }

    this.cache.delete(key);
    return true;
  }

  /** 调试用：当前缓存状况 */
  inspect() {
    return Array.from(this.cache.values()).map(r => ({
      key: r.key, type: r.type, kind: r.kind, kb: Math.round(r.bytes / 1024)
    }));
  }
}

/** 全工程共用的资源管理器单例 */
export const assets = new AssetManager(MANIFEST);
