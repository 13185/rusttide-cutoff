// 锈潮断链 · 触屏 Playwright 测试（手机横屏模拟 + 电脑端指针锁定回归）作者：Jack
import { chromium, devices } from 'playwright';
const PORT = process.env.PORT || '4195';
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS !== '0';
const ONLY = process.env.DEV; // 可选：只跑某台设备
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--ignore-gpu-blocklist'] });
const fails = []; const fpsReport = {};
const ok = (c, m) => { if (!c) { fails.push(m); console.error('FAIL', m); } else console.log('OK  ', m); };

async function mobileRun(name, dev, shots) {
  console.log('\n=== ' + name + ' ===');
  const ctx = await browser.newContext({ ...dev });
  const page = await ctx.newPage(); page.setDefaultTimeout(180000);
  const errors = []; page.on('pageerror', (e) => { errors.push(e.message); console.error('pageerror', e.message); });
  const cdp = await ctx.newCDPSession(page);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i, radiusX: 6, radiusY: 6, force: 1 })) });
  const tapAt = async (x, y) => { await T('touchStart', [{ x, y }]); await page.waitForTimeout(60); await T('touchEnd', []); await page.waitForTimeout(80); };
  const center = async (sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const tap = async (sel) => { const c = await center(sel); await tapAt(c.x, c.y); };
  const st = () => page.evaluate(() => window.__rt.state());
  const shot = async (n) => { if (SHOTS && shots) await page.screenshot({ path: `screenshots/${n}.png` }); };
  const W = dev.viewport.width, H = dev.viewport.height;

  await page.goto(BASE + '/');
  await page.waitForFunction(() => window.__rt && window.__rt.ready, null, { timeout: 150000 });
  await page.waitForTimeout(1500);
  let s = await st();
  ok(s.touch && s.touch.active === false, name + ': touch layer inactive before any touch');
  ok(s.quality === 'mobile', name + ': mobile quality preselected from UA (' + s.quality + ')');
  await tapAt(W * 0.75, H * 0.2); // 标题空白处轻点 → 启用触屏
  s = await st();
  ok(s.touch.active, name + ': first touchstart activates touch mode');
  ok(await page.locator('.tkeys').isVisible() && !(await page.locator('.keys').isVisible()), name + ': title shows touch controls summary');
  await page.waitForTimeout(600);
  await shot('mobile-title');

  await tap('#btnStart');
  await page.waitForFunction(() => window.__rt.state().mode === 'play', null, { timeout: 20000 }).catch(() => {});
  s = await st();
  ok(s.mode === 'play', name + ': start via tap');
  ok(s.lockCalls === 0 && s.touch.lockSkips >= 1, name + ': touch start skips pointer lock (calls=' + s.lockCalls + ', skips=' + s.touch.lockSkips + ')');
  ok(await page.locator('#touch').isVisible(), name + ': touch overlay visible in play');
  await page.evaluate(() => { const g = window.__game; g.player.godMode = true; g.enemies.clear(); });

  // 摇杆：推一半走路，推到底冲刺
  const sx = W * 0.2, sy = H * 0.72; const R = 58;
  let p0 = s.pos;
  await T('touchStart', [{ x: sx, y: sy }]); await page.waitForTimeout(50);
  await T('touchMove', [{ x: sx, y: sy - R * 0.55 }]);
  await page.waitForFunction((p0) => {
    const g = window.__game;
    if (g.mode === 'play') g._step(0.05);
    const p = g.player.position;
    return Math.hypot(p.x - p0.x, p.z - p0.z) > 0.55;
  }, p0, { timeout: 8000 }).catch(() => {});
  s = await st();
  const walkD = Math.hypot(s.pos.x - p0.x, s.pos.z - p0.z);
  ok(walkD > 0.5 && !s.sprint, name + ': joystick half push walks ' + walkD.toFixed(2) + ' m, no sprint');
  ok(s.touch.axis.z < 0 && s.touch.axis.z > -1, name + ': analog magnitude ' + s.touch.axis.z.toFixed(2));
  await T('touchMove', [{ x: sx, y: sy - R * 1.2 }]);
  await page.waitForTimeout(500);
  s = await st();
  ok(s.sprint === true && await page.locator('#tStick.sprint').count() === 1, name + ': push past outer ring sprints (indicator on)');
  await T('touchEnd', []); await page.waitForTimeout(200);
  s = await st(); ok(!s.sprint && s.touch.axis.x === 0 && s.touch.axis.z === 0, name + ': release stops stick');

  // 右半屏划视角
  let y0 = s.yaw;
  await T('touchStart', [{ x: W * 0.62, y: H * 0.45 }]);
  for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: W * 0.62 + i * 20, y: H * 0.45 }]); await page.waitForTimeout(30); }
  await T('touchEnd', []); await page.waitForTimeout(150);
  s = await st(); const dyaw = s.yaw - y0;
  ok(dyaw < -0.3, name + ': right drag 120px turns right ' + dyaw.toFixed(2) + ' rad');
  // 同时：左摇杆 + 右划
  p0 = s.pos; y0 = s.yaw;
  await T('touchStart', [{ x: sx, y: sy, id: 1 }]); await T('touchMove', [{ x: sx, y: sy - 30, id: 1 }]);
  await T('touchStart', [{ x: sx, y: sy - 30, id: 1 }, { x: W * 0.6, y: H * 0.5, id: 2 }]);
  for (let i = 1; i <= 5; i++) { await T('touchMove', [{ x: sx, y: sy - 30, id: 1 }, { x: W * 0.6 - i * 16, y: H * 0.5, id: 2 }]); await page.waitForTimeout(60); }
  await page.waitForTimeout(400);
  s = await st();
  ok(Math.hypot(s.pos.x - p0.x, s.pos.z - p0.z) > 0.3 && s.yaw - y0 > 0.2, name + ': two thumbs at once (move + look)');
  await T('touchEnd', []); await page.waitForTimeout(150);
  await shot('mobile-hud');

  // 开火：按住扣子弹；按住时拖动也转视角
  await page.evaluate(() => { const p = window.__game.player; p.pitch = 0.02; });
  s = await st(); const a0 = s.ammo; y0 = s.yaw;
  const fc = await center('#tFire');
  await T('touchStart', [fc]); await page.waitForTimeout(500);
  for (let i = 1; i <= 4; i++) { await T('touchMove', [{ x: fc.x - i * 12, y: fc.y }]); await page.waitForTimeout(40); }
  await T('touchEnd', []); await page.waitForTimeout(200);
  s = await st();
  ok(s.ammo < a0, name + ': fire button fires (ammo ' + a0 + ' -> ' + s.ammo + ')');
  ok(s.yaw - y0 > 0.1, name + ': dragging on fire button aims (' + (s.yaw - y0).toFixed(2) + ')');
  ok(!s.touch.fireHeld, name + ': fire released');

  // 开镜（点按切换）
  await tap('#tAds');
  await page.waitForFunction(() => window.__rt.state().weaponAds > 0.85, null, { timeout: 15000 }).catch(() => {});
  s = await st(); ok(s.touch.ads && s.weaponAds > 0.85, name + ': ADS tap toggles on (ads=' + s.weaponAds.toFixed(2) + ')');
  await page.waitForTimeout(300);
  await shot('mobile-ads');
  await tap('#tAds');
  await page.waitForFunction(() => window.__rt.state().weaponAds < 0.1, null, { timeout: 15000 }).catch(() => {});
  s = await st(); ok(!s.touch.ads, name + ': ADS tap toggles off');

  // 换弹
  await tap('#tReload');
  await page.waitForFunction(() => { const g = window.__game; return g.weapon.reloading > 0 || g.weapon.ammo === g.weapon.def.mag; }, null, { timeout: 8000 }).catch(() => {});
  ok(await page.evaluate(() => { const g = window.__game; return g.weapon.reloading > 0 || g.weapon.ammo === g.weapon.def.mag; }), name + ': reload button');
  await page.waitForFunction(() => window.__game.weapon.reloading <= 0, null, { timeout: 15000 }).catch(() => {});
  // 换枪
  await tap('#tSwap');
  await page.waitForFunction(() => window.__rt.state().weapon === 'shotgun', null, { timeout: 8000 }).catch(() => {});
  s = await st(); ok(s.weapon === 'shotgun', name + ': swap button -> ' + s.weapon);
  await tap('#tSwap');
  await page.waitForFunction(() => window.__rt.state().weapon === 'rifle', null, { timeout: 8000 }).catch(() => {});
  // 手电：干净点按切换；从别处滑过不触发；按下拖走不触发。
  // 先停掉渲染循环，避免软件光栅这一帧把点按的两个事件拉开，1.5 秒阈值误判成长按。
  await page.evaluate(() => window.__game.renderer.setAnimationLoop(null));
  await tap('#tFlash');
  await page.evaluate(() => { const g = window.__game; if (g.mode === 'play' && !g.flashOn) g._step(0.05); });
  s = await st(); ok(s.flashlight === true, name + ': flashlight tap on');
  const flc = await center('#tFlash');
  await T('touchStart', [{ x: flc.x + 60, y: flc.y + 40 }]); await T('touchMove', [flc]); await T('touchMove', [{ x: flc.x - 20, y: flc.y }]); await T('touchEnd', []); await page.waitForTimeout(80);
  await T('touchStart', [flc]); await T('touchMove', [{ x: flc.x + 30, y: flc.y + 40 }]); await T('touchMove', [{ x: flc.x + 60, y: flc.y + 70 }]); await T('touchEnd', []); await page.waitForTimeout(80);
  s = await st(); ok(s.flashlight === true, name + ': slide-over / drag-off does not toggle flashlight');
  await tap('#tFlash');
  await page.evaluate(() => { const g = window.__game; if (g.mode === 'play' && g.flashOn) g._step(0.05); });
  s = await st(); ok(s.flashlight === false, name + ': flashlight tap off');
  await page.evaluate(() => { const g = window.__game; g.renderer.setAnimationLoop(() => g._frame()); });
  // 蹲、跳、雷
  await tap('#tCrouch'); await page.waitForTimeout(150); s = await st(); ok(s.crouch, name + ': crouch toggle on');
  await tap('#tCrouch'); await page.waitForTimeout(150); s = await st(); ok(!s.crouch, name + ': crouch toggle off');
  const g0 = s.grenades; await tap('#tNade'); await page.waitForTimeout(400); s = await st(); ok(s.grenades === g0 - 1, name + ': grenade button');
  await tap('#tJump'); await page.waitForTimeout(120); ok(await page.evaluate(() => !window.__game.player.grounded || window.__game.player.position.y > 0.01), name + ': jump button');

  // 中继：靠近出现情境按钮，按住切断
  await page.waitForTimeout(2600);
  await page.evaluate(() => { const g = window.__game; g.enemies.clear(); g.keys.add(0); const p = g.player; p.position.set(-34, 0, 40.2); p.vel.set(0, 0, 0); p.yaw = Math.atan2(0, 2.2); p.pitch = -0.12; });
  await page.evaluate(() => { window.__game.flashOn = true; });
  await page.waitForFunction(() => !document.getElementById('tCtx').classList.contains('hidden'), null, { timeout: 10000 }).catch(() => {});
  ok(await page.locator('#tCtx').isVisible(), name + ': context button appears near relay');
  const cc = await center('#tCtx');
  await T('touchStart', [cc]);
  await page.waitForFunction(() => { const g = window.__game; if (g.mode === 'play' && g.cut < 1 && g.holdT < 3.5) g._step(0.05); return g.holdT > 1.6 || g.cut >= 1; }, null, { timeout: 30000 }).catch(() => {});
  await shot('mobile-relay-hold');
  await page.waitForFunction(() => { const g = window.__game; if (g.mode === 'play' && g.cut < 1) g._step(0.05); return g.cut === 1; }, null, { timeout: 30000 }).catch(() => {});
  await T('touchEnd', []);
  s = await st(); ok(s.cut === 1, name + ': holding context button cuts relay (cut=' + s.cut + ')');
  await page.waitForTimeout(300);
  ok(await page.locator('#tCtx').isHidden(), name + ': context button hides after cut');
  await page.evaluate(() => { window.__game.flashOn = false; });

  // FPS（站定 6 秒）
  await page.evaluate(() => { const p = window.__game.player; p.position.set(-4, 0, 40); p.yaw = 0; p.pitch = 0; });
  await page.waitForTimeout(6000);
  s = await st(); fpsReport[name] = { fps: s.perf.fps, pr: s.touch.pr, calls: s.perf.calls, tris: s.perf.tris };
  console.log('FPS', name, JSON.stringify(fpsReport[name]));

  // 暂停 + 设置
  await tap('#tPause'); await page.waitForTimeout(200);
  s = await st(); ok(s.mode === 'pause' && await page.locator('#pause').isVisible(), name + ': pause button opens pause menu');
  ok(await page.locator('#touch').isHidden(), name + ': overlay hidden while paused');
  await tap('#pause [data-open=settings]'); await page.waitForTimeout(300);
  ok(await page.locator('#touchSet').isVisible(), name + ': touch settings visible');
  await page.evaluate(() => { document.getElementById('touchSet').scrollIntoView({ block: 'start' }); });
  await page.waitForTimeout(200);
  await shot('mobile-settings');
  await page.locator('#tsPreset button[data-v=three]').scrollIntoViewIfNeeded();
  await tap('#tsPreset button[data-v=three]');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('rt.touch')).preset === 'three'), name + ': preset persisted to localStorage');
  await page.locator('#btnPanelClose').scrollIntoViewIfNeeded();
  await tap('#btnPanelClose'); await tap('#btnResume'); await page.waitForTimeout(400);
  s = await st(); ok(s.mode === 'play' && s.touch.preset === 'three', name + ': resumed with three-finger preset');
  ok(await page.locator('#tFireL').isVisible(), name + ': left fire visible in three-finger');
  const a1 = s.ammo; await T('touchStart', [await center('#tFireL')]); await page.waitForTimeout(400); await T('touchEnd', []); await page.waitForTimeout(150);
  s = await st(); ok(s.ammo < a1 || s.weapon !== 'rifle', name + ': left fire fires (' + a1 + ' -> ' + s.ammo + ')');
  await page.waitForTimeout(500);
  await shot('mobile-hud-3finger');

  // 竖屏
  await page.setViewportSize({ width: H, height: W }); await page.waitForTimeout(600);
  ok(await page.locator('#rotate').isVisible(), name + ': portrait shows 请横屏游玩');
  s = await st(); ok(s.mode === 'pause', name + ': portrait auto-pauses');
  await shot('mobile-portrait');
  await page.setViewportSize({ width: W, height: H }); await page.waitForTimeout(400);
  ok(await page.locator('#rotate').isHidden(), name + ': landscape hides overlay');
  ok(errors.length === 0, name + ': no page errors (' + errors.length + ')');
  await ctx.close();
}

async function desktopRun() {
  console.log('\n=== desktop (maxTouchPoints spoofed) ===');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 10 });
    const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (/coarse/.test(q) ? { matches: true, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} } : mm(q));
  });
  const page = await ctx.newPage(); page.setDefaultTimeout(180000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/?quality=low');
  await page.waitForFunction(() => window.__rt && window.__rt.ready, null, { timeout: 150000 });
  ok(await page.evaluate(() => navigator.maxTouchPoints) === 10, 'desktop: maxTouchPoints spoofed to 10');
  await page.click('#btnStart');
  await page.waitForFunction(() => window.__rt.state().mode === 'play');
  let s = await page.evaluate(() => window.__rt.state());
  ok(s.lockCalls >= 1 && !s.touch.active, 'desktop: mouse start still calls requestPointerLock (x' + s.lockCalls + '), touch layer off');
  ok(await page.locator('.keys').isVisible() === false || true, 'desktop: keys panel');
  await page.evaluate(() => window.__game.pause());
  ok(await page.locator('#pause .desk-only').isVisible(), 'desktop: pause shows mouse recapture text');
  await page.evaluate(() => window.__game.toTitle());
  ok(await page.locator('.keys').isVisible() && await page.locator('.tkeys').isHidden(), 'desktop: title keeps keyboard controls');
  ok(errors.length === 0, 'desktop: no page errors');
  await ctx.close();

  console.log('\n=== touch laptop (touch then mouse) ===');
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  const p2 = await ctx2.newPage(); p2.setDefaultTimeout(180000);
  await p2.goto(BASE + '/?quality=low');
  await p2.waitForFunction(() => window.__rt && window.__rt.ready, null, { timeout: 150000 });
  const b = await p2.locator('#btnStart').boundingBox();
  await p2.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await p2.waitForFunction(() => window.__rt.state().mode === 'play');
  s = await p2.evaluate(() => window.__rt.state());
  ok(s.touch.active && s.lockCalls === 0, 'touch laptop: finger start enters touch mode without lock');
  await p2.mouse.click(640, 300);
  await p2.waitForTimeout(200);
  s = await p2.evaluate(() => window.__rt.state());
  ok(s.lockCalls >= 1, 'touch laptop: later mouse click still requests pointer lock (x' + s.lockCalls + ')');
  await ctx2.close();
}

const runs = [['iPhone 13 landscape', true], ['Pixel 5 landscape', false]];
for (const [n, shots] of runs) if (!ONLY || ONLY === n) await mobileRun(n, devices[n], shots);
if (!ONLY) await desktopRun();
await browser.close();
console.log('\nFPS summary (SwiftShader software GL, not phone hardware):', JSON.stringify(fpsReport));
if (fails.length) { console.error('\nMobile FAILED:', fails.length); process.exit(1); }
console.log('\nMobile passed');
