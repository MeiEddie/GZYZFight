/**
 * 端到端冒烟检查（Chrome DevTools Protocol）
 * ------------------------------------------------------------
 * 用真实浏览器跑一遍「启动 → 菜单 → 说明 → 选人 → 战斗 → 暂停 → 静音」，
 * 同时收集所有 JS 异常与控制台报错，并在关键节点截图。
 *
 * 用法：
 *   1) 先起静态服务： npx serve -l 3000 .
 *   2) node tools/e2e-check.mjs http://127.0.0.1:3000
 *      （不传参数默认 http://127.0.0.1:8123）
 *
 * 依赖：本机装有 Edge（Windows 默认自带）或 Chrome。
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] || 'http://127.0.0.1:8123';
const SHOT_DIR = join(ROOT, '.screenshots');
const PORT = 9333;

const EDGE_PATHS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function findBrowser() {
  for (const p of EDGE_PATHS) if (existsSync(p)) return p;
  throw new Error('未找到 Edge / Chrome，请手动指定浏览器路径');
}

/* ---------------- 极简 CDP 客户端 ---------------- */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        const list = this.handlers.get(msg.method);
        if (list) list.forEach(fn => fn(msg.params));
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP 超时: ' + method));
        }
      }, 20000);
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  /** 在页面里求值（支持 Promise） */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) {
      throw new Error('页面求值异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  }

  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(SHOT_DIR, { recursive: true });
    const file = join(SHOT_DIR, name + '.png');
    writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }

  /** 真实按键：按下 + 抬起 */
  async press(code, key, vk) {
    const base = { code, key: key || code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
    await sleep(60);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(140);
  }
}

/* ---------------- 主流程 ---------------- */
const results = [];
const errors = [];
const ok = (cond, label, extra) => {
  results.push((cond ? 'PASS  ' : 'FAIL  ') + label + (extra !== undefined ? '  → ' + extra : ''));
};

let browser;
let cdp;

try {
  /* 1. 起浏览器 */
  const bin = findBrowser();
  browser = spawn(bin, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--mute-audio',
    '--window-size=1400,800',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + join(ROOT, '.screenshots', '.cdp-profile'),
    'about:blank'
  ], { stdio: 'ignore' });

  /* 2. 等调试端口就绪 */
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find(t => t.type === 'page');
    } catch { /* 还没起来 */ }
  }
  if (!target) throw new Error('浏览器调试端口未就绪');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  cdp = new CDP(ws);

  cdp.on('Runtime.exceptionThrown', p => {
    errors.push('未捕获异常: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
  });
  cdp.on('Runtime.consoleAPICalled', p => {
    if (p.type === 'error') errors.push('console.error: ' + p.args.map(a => a.value ?? a.description).join(' '));
    if (p.type === 'warning') errors.push('console.warn: ' + p.args.map(a => a.value ?? a.description).join(' '));
  });
  cdp.on('Log.entryAdded', p => {
    if (p.entry.level === 'error') errors.push('log: ' + p.entry.text);
  });

  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  // 每次都取最新代码：本地服务给了 max-age=600，不禁用缓存会跑到改动前的旧模块
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  // 固定视口，保证截图尺寸稳定（headless 默认窗口只有 500x320）
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1400, height: 800, deviceScaleFactor: 1, mobile: false
  });

  /* 3. 打开游戏 */
  await cdp.send('Page.navigate', { url: BASE + '/index.html' });

  /* 4. 等启动完成：GZYZ 存在 + 加载层淡出 + 主循环在跑 */
  let booted = false;
  for (let i = 0; i < 80 && !booted; i++) {
    await sleep(250);
    try {
      booted = await cdp.eval(`!!window.GZYZ && document.getElementById('boot').classList.contains('is-done')`);
    } catch { /* 页面还在导航 */ }
  }
  ok(booted, '启动完成，加载层已淡出');

  /* 4.1 启动完成时 boot 组必须全部就绪：不允许「下载失败被当成成功」 */
  const bootState = await cdp.eval(`(() => {
    const m = GZYZ.assets.manifest;
    const keys = Object.keys(m).filter(k => m[k].group === 'boot');
    return { total: keys.length, missing: keys.filter(k => !GZYZ.assets.has(k)) };
  })()`);
  ok(bootState && bootState.missing.length === 0,
    '启动完成时 boot 组素材全部就绪（无静默缺失）',
    JSON.stringify(bootState));

  /* 4.2 校歌已移出启动路径：进菜单后才后台加载 */
  ok(await cdp.eval(`GZYZ.assets.manifest['audio.school-anthem'].group !== 'boot'`),
    '校歌不在 boot 组（不阻塞启动）');

  /* 4.3 身体底模：恰好四个，且命名只描述体型、不再带人物名 */
  const bodyState = await cdp.eval(`(() => {
    const keys = Object.keys(GZYZ.assets.manifest).filter(k => k.startsWith('sprites.'));
    return {
      ids: keys.map(k => k.slice(8)),
      missing: keys.filter(k => !GZYZ.assets.has(k)),
      legacy: keys.filter(k => /(lan|zang|man|zhuang)/.test(k))
    };
  })()`);
  ok(bodyState && bodyState.ids.length === 4 && bodyState.missing.length === 0,
    '四种体型底模全部就绪', JSON.stringify(bodyState));
  ok(bodyState && bodyState.legacy.length === 0,
    '体型命名已不含旧人物名', bodyState ? bodyState.ids.join(',') : '');

  let bgmOk = false;
  for (let i = 0; i < 60 && !bgmOk; i++) {
    bgmOk = await cdp.eval(`GZYZ.BGM.ok`);
    if (!bgmOk) await sleep(250);
  }
  ok(bgmOk === true, '校歌在后台加载完成后接管原声轨', String(bgmOk));
  ok(await cdp.eval(`GZYZ.BGM.status`) === 'ok', 'BGM 状态机进入 ok（菜单显示「原声」）');
  const assets = await cdp.eval(`JSON.stringify(GZYZ.assets.inspect())`);
  ok(assets.includes('audio.school-anthem'), '校歌原声已加入资源缓存');

  await sleep(700);
  await cdp.shot('e2e-1-menu');

  /* 5. 菜单 → 操作说明 → 返回 */
  await cdp.press('ArrowDown', 'ArrowDown', 40);
  await cdp.press('ArrowDown', 'ArrowDown', 40);
  ok(await cdp.eval(`GZYZ.game.menuIndex`) === 2, '键盘可切换菜单项');
  await cdp.press('Enter', 'Enter', 13);
  ok(await cdp.eval(`GZYZ.game.scene`) === 'help', '进入操作说明');
  await cdp.shot('e2e-2-help');
  await cdp.press('Escape', 'Escape', 27);
  ok(await cdp.eval(`GZYZ.game.scene`) === 'menu', 'ESC 返回主菜单');

  /* 6. 双人对战：菜单 → 选人 → 选人确认 → 战斗 */
  await cdp.eval(`GZYZ.game.menuIndex = 0`);
  await cdp.press('Enter', 'Enter', 13);
  ok(await cdp.eval(`GZYZ.game.scene`) === 'select', '进入选人');
  await cdp.shot('e2e-3-select');

  await cdp.press('Enter', 'Enter', 13);      // 1P 确认 → phase 2（光标默认落在有人的座位）
  ok(await cdp.eval(`GZYZ.game.sel.phase`) === 2, '1P 确认后进入 2P 选人');
  await cdp.press('Enter', 'Enter', 13);      // 2P 确认 → phase 4
  let inBattle = false;
  for (let i = 0; i < 60 && !inBattle; i++) {
    await sleep(150);
    inBattle = await cdp.eval(`GZYZ.game.scene === 'battle'`);
  }
  ok(inBattle, '进入战斗场景');

  // 开场演出（intro 1.6s）期间游戏不接受输入，
  // headless 帧率只有实时的六成左右，固定 sleep 会踩进演出里把攻击吞掉，
  // 所以这里等真实状态而不是赌时间。
  for (let i = 0; i < 80; i++) {
    if (await cdp.eval(`!!GZYZ.game.battle && GZYZ.game.battle.intro === 0`)) break;
    await sleep(150);
  }
  ok(await cdp.eval(`GZYZ.game.battle.intro === 0`), '开场演出结束，可以出拳');
  await cdp.shot('e2e-4-battle');

  /* 7. 打一拳，确认伤害与特效链路 */
  const hpBefore = await cdp.eval(`GZYZ.game.battle.p2.hp`);
  await cdp.eval(`GZYZ.game.battle.p1.x = GZYZ.game.battle.p2.x - 70`);
  await cdp.press('KeyJ', 'j', 74);

  let particles = 0;
  for (let i = 0; i < 24 && !particles; i++) {
    await sleep(50);
    particles = await cdp.eval(`GZYZ.game.battle.particles.length`);
  }
  ok(particles > 0, '命中特效粒子已生成', particles + ' 个');
  await sleep(600);
  const hpAfter = await cdp.eval(`GZYZ.game.battle.p2.hp`);
  ok(hpAfter < hpBefore, '攻击命中造成伤害', hpBefore + ' → ' + hpAfter);

  /* 8. M 键在战斗中只切换一次（原版有重复处理导致静音失效的 bug） */
  const enabledBefore = await cdp.eval(`GZYZ.Sound.enabled`);
  await cdp.press('KeyM', 'm', 77);
  const enabledAfter = await cdp.eval(`GZYZ.Sound.enabled`);
  ok(enabledBefore !== enabledAfter, '战斗中 M 键可正常静音（不再被切换两次抵消）');
  await cdp.press('KeyM', 'm', 77);

  /* 9. 暂停菜单 */
  await cdp.press('Escape', 'Escape', 27);
  ok(await cdp.eval(`GZYZ.game.paused`) === true, 'ESC 可以暂停');
  await cdp.shot('e2e-5-pause');
  await cdp.press('Escape', 'Escape', 27);
  ok(await cdp.eval(`GZYZ.game.paused`) === false, '再按 ESC 继续');

  /* 10. KO → 结算 → 再战 */
  await cdp.eval(`GZYZ.game.battle.p2.hp = 5; GZYZ.game.battle.p2.displayHp = 5;`);
  await cdp.eval(`GZYZ.game.battle.p1.x = GZYZ.game.battle.p2.x - 70`);
  await cdp.press('KeyJ', 'j', 74);
  let toResult = false;
  for (let i = 0; i < 100 && !toResult; i++) {
    await sleep(150);
    toResult = await cdp.eval(`GZYZ.game.scene === 'result'`);
  }
  ok(toResult, 'KO 后进入结算界面');
  await cdp.shot('e2e-6-result');
  await cdp.press('Enter', 'Enter', 13);
  await sleep(400);
  ok(await cdp.eval(`GZYZ.game.scene`) === 'battle', '结算「再战」重新开打');

  /* 11. 人机模式：菜单 → 选人 → CPU 摇人 → 战斗 */
  await cdp.press('Escape', 'Escape', 27);      // 暂停
  await cdp.press('ArrowDown', 'ArrowDown', 40);
  await cdp.press('ArrowDown', 'ArrowDown', 40);
  await cdp.press('Enter', 'Enter', 13);        // 返回主菜单
  ok(await cdp.eval(`GZYZ.game.scene`) === 'menu', '暂停菜单可返回主菜单');
  await cdp.eval(`GZYZ.game.menuIndex = 1`);    // 人机对战
  await cdp.press('Enter', 'Enter', 13);
  ok(await cdp.eval(`GZYZ.game.mode`) === 'pve', '进入人机模式');
  await cdp.press('KeyJ', 'j', 74);             // 1P 确认 → 摇人
  let cpuStarted = false;
  for (let i = 0; i < 30 && !cpuStarted; i++) {
    await sleep(100);
    cpuStarted = await cdp.eval(`GZYZ.game.sel.phase === 3`);
  }
  ok(cpuStarted, 'CPU 开始摇人');
  let pveBattle = false;
  for (let i = 0; i < 100 && !pveBattle; i++) {
    await sleep(150);
    pveBattle = await cdp.eval(`GZYZ.game.scene === 'battle'`);
  }
  ok(pveBattle, '人机对战进入战斗');

  /* 12. 资源释放能力 */
  const released = await cdp.eval(`(() => {
    const okRelease = GZYZ.assets.release('images.does-not-exist');
    return { released: okRelease, after: GZYZ.assets.inspect().length };
  })()`);
  ok(released.released === false, '未加载的资源释放返回 false（不会误删）');

} catch (e) {
  errors.push('脚本异常: ' + e.message);
} finally {
  if (cdp) { try { await cdp.send('Browser.close'); } catch { /* ignore */ } }
  if (browser) { try { browser.kill(); } catch { /* ignore */ } }
}

/* ---------------- 输出 ---------------- */
console.log(results.join('\n'));
if (errors.length) {
  console.log('\n控制台 / 异常信息：');
  [...new Set(errors)].forEach(e => console.log('  - ' + e));
}
const passed = results.filter(r => r.startsWith('PASS')).length;
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${passed} passed, ${failed} failed${errors.length ? `, ${new Set(errors).size} 条控制台告警` : ''}`);
process.exit(failed || errors.length ? 1 : 0);
