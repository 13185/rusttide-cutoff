// 高画质展示截图（标题 / 港区 / 切中继 / 战斗 / 撤离 / 结算）
import { chromium } from 'playwright';
const PORT = process.env.PORT || '4190';
const Q = process.env.Q || 'high';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const b = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(240000);
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://127.0.0.1:${PORT}/?quality=${Q}`);
await p.waitForFunction(() => window.__rt && window.__rt.ready, null, { timeout: 120000 });
await p.waitForTimeout(2000);
const want = (n) => !ONLY || ONLY.includes(n);
const shot = async (n) => { await p.screenshot({ path: `screenshots/${n}.png` }); console.log('shot', n); };
const ev = (f, a) => p.evaluate(f, a);
const settle = async (ms = 1500) => { await p.waitForTimeout(ms); };
if (want('title')) await shot('title');
await ev(() => document.getElementById('btnStart').click());
await ev(() => { const g = window.__game; g.player.godMode = true; g.enemies.clear(); g.spawnT = 9999; g._director = () => {}; });
const place = (a) => ev(([x, z, tx, tz, pitch]) => { const g = window.__game; const P = g.player; P.position.set(x, 0, z); P.vel.set(0, 0, 0); P.yaw = Math.atan2(-(tx - x), -(tz - z)); P.pitch = pitch || 0; }, a);
if (want('port')) { await place([-2, 76, -2, 0, 0.03]); await settle(2500); await shot('port'); }
if (want('port2')) { await ev(() => document.getElementById('caption').classList.add('hidden')); await place([-20, -28, 20, -60, 0.08]); await settle(2000); await shot('port2'); }
if (want('relay')) {
  await ev(() => document.getElementById('caption').classList.add('hidden'));
  await place([-35.3, 40.3, -34, 38, -0.05]);
  await p.keyboard.down('KeyE');
  await p.waitForFunction(() => window.__game.holdT > 1.6, null, { timeout: 60000 });
  await shot('relay');
  await p.keyboard.up('KeyE');
}
if (want('combat')) {
  await ev(() => document.getElementById('caption').classList.add('hidden'));
  await place([-2, 34, -2.6, 0, 0.06]);
  await ev(() => { const g = window.__game; g.enemies.clear(); const p = g.player.position;
    const w = g.enemies.spawn('warden', g.player, { x: p.x - 0.8, z: p.z - 15 });
    g.enemies.spawn('hound', g.player, { x: p.x - 3.4, z: p.z - 8 });
    g.enemies.spawn('hound', g.player, { x: p.x + 0.6, z: p.z - 10 });
    const gl = g.enemies.spawn('gull', g.player, { x: p.x - 2.2, z: p.z - 12 }); gl.pos.y = 4.6;
    for (const e of g.enemies.list) { e.cool = 0.2; } g.enemies.freeze = true;
    g.input.fireHeld = true; });
  await p.waitForFunction(() => window.__rt.state().stats.shots > 3, null, { timeout: 60000 });
  await shot('combat');
  await ev(() => { window.__game.input.fireHeld = false; window.__game.enemies.freeze = false; });
}
if (want('extract')) {
  await ev(() => { const g = window.__game; g.enemies.clear(); for (let i = 0; i < 3; i++) g.cutRelay(i); g.enemies.clear(); g.radioQ.length = 0; });
  await place([24, -56, 34, -68, -0.1]);
  await settle(2500);
  await shot('extract');
}
if (want('result')) {
  await ev(() => { const g = window.__game; if (g.cut < 3) for (let i = 0; i < 3; i++) g.cutRelay(i); g.stats = { shots: 412, hits: 233, weak: 71, kills: 38, time: 0 }; g.elapsed = 402; g.win(); });
  await settle(800);
  await shot('result');
}
await b.close();
