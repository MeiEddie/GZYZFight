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

  const assets = await cdp.eval(`JSON.stringify(GZYZ.assets.inspect())`);
  ok(assets.includes('audio.school-anthem'), '校歌原声已加载进资源缓存', assets);
  const bgmOk = await cdp.eval(`GZYZ.BGM.ok`);
  ok(bgmOk === true, 'BGM 原声轨接管成功（菜单应显示「原声」）', String(bgmOk));

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
  await sleep(1400);
  ok(await cdp.eval(`GZYZ.game.scene`) === 'battle', '进入战斗场景');
  await sleep(1200);
  await cdp.shot('e2e-4-battle');

  /* 7. 打一拳，确认伤害与特效链路 */
  const hpBefore = await cdp.eval(`GZYZ.game.battle.p2.hp`);
  await cdp.eval(`GZYZ.game.battle.p1.x = GZYZ.game.battle.p2.x - 70`);
  await cdp.press('KeyJ', 'j', 74);
  await sleep(150);
  const particles = await cdp.eval(`GZYZ.game.battle.particles.length`);
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
  await sleep(3400);
  ok(await cdp.eval(`GZYZ.game.scene`) === 'result', 'KO 后进入结算界面');
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
  ok(await cdp.eval(`GZYZ.game.sel.phase`) === 3, 'CPU 开始摇人');
  await sleep(2600);
  ok(await cdp.eval(`GZYZ.game.scene`) === 'battle', '人机对战进入战斗');

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
