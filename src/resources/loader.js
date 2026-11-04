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

/** 单个资源的加载超时（毫秒），避免坏文件把启动卡死 */
const LOAD_TIMEOUT = 30000;

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
  const timer = setTimeout(() => ctrl.abort(), LOAD_TIMEOUT);
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
      if (onBytes) onBytes(Math.min(1, received / total));
    }
    return new Blob(chunks, { type: res.headers.get('content-type') || '' });
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
 * 另外加一个超时兜底：到点仍未就绪也放行，让 play() 自己去报错，
 * 保证启动流程永远不会被一个坏素材卡死。
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
      // 解码失败时这个 objectURL 不会再被记录到缓存里，就地回收避免泄漏
      URL.revokeObjectURL(url);
      reject(new Error('音频解码失败'));
    };

    el.addEventListener('loadedmetadata', onReady, { once: true });
    el.addEventListener('canplay', onReady, { once: true });
    el.addEventListener('error', onError, { once: true });
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      console.warn('[assets] 音频元数据超时，已放行：' + spec.src);
      resolve();
    }, 6000);

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
   * 加载一个资源（幂等，重复调用复用同一个 Promise）。
   * @param {string} key
   * @param {(ratio:number)=>void} [onBytes] 单文件字节进度 0..1
   */
  load(key, onBytes) {
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    if (this.inflight.has(key)) return this.inflight.get(key);

    const spec = this.manifest[key];
    if (!spec) return Promise.reject(new Error(`未在 manifest 登记的资源: ${key}`));

    const task = (async () => {
      const blob = await fetchBlob(spec.src, onBytes);
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
   * 批量预加载，带聚合进度。
   * 单个资源失败只记日志，不阻断启动（游戏可以退化运行）。
   * @param {string[]} keys
   * @param {(ratio:number, total:number, key:string)=>void} [onProgress]
   */
  async preload(keys, onProgress) {
    const list = keys.filter(k => !this.cache.has(k));
    if (!list.length) {
      if (onProgress) onProgress(1, 0, '');
      return;
    }

    const frac = new Map(list.map(k => [k, 0]));
    const report = key => {
      if (!onProgress) return;
      let sum = 0;
      for (const v of frac.values()) sum += v;
      onProgress(sum / list.length, list.length, key);
    };

    report(list[0]);
    await Promise.all(list.map(async key => {
      try {
        await this.load(key, r => { frac.set(key, r); report(key); });
        frac.set(key, 1);
      } catch (e) {
        console.warn('[assets] 加载失败:', key, e.message);
        frac.set(key, 1);
      }
      report(key);
    }));
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
