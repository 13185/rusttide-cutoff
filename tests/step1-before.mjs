import { chromium } from 'playwright';
const PORT = process.env.PORT || '4190';
const b = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(240000);
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://127.0.0.1:${PORT}/?quality=high`);
await p.waitForFunction(() => window.__rt && window.__rt.ready, null, { timeout: 120000 });
await p.waitForTimeout(800);
await p.evaluate(() => document.getElementById('btnStart').click());
await p.waitForFunction(() => window.__rt.state().mode === 'play', null, { timeout: 30000 });
await p.evaluate(() => {
  const g = window.__game; g.player.godMode = true; g.enemies.clear(); g.spawnT = 9999; g._director = () => {};
  document.getElementById('caption').classList.add('hidden');
});
const shot = async (n) => { await p.waitForTimeout(1100); await p.screenshot({ path: `screenshots/${n}.png` }); console.log('shot', n); };

// 港口巷道
await p.evaluate(() => { const P = window.__game.player; P.position.set(-2, 0, 72); P.vel.set(0,0,0); P.yaw = 0; P.pitch = 0.04; const w = window.__game.weapon; w.ads = 0; w.cur = 0; w.switchT = 0; w._showGun(); });
await shot('step1-before-alley');

// 腰射持枪（同机位略近）
await p.evaluate(() => { const P = window.__game.player; P.position.set(-2, 0, 80); P.vel.set(0,0,0); P.yaw = 0; P.pitch = -0.03; });
await shot('step1-before-hip');

// 箱体：选靠近主通道的 40ft
const box = await p.evaluate(() => {
  const list = window.__game.world.cont.list;
  let best = list[0], score = 1e9;
  for (const it of list) {
    const s = Math.abs(it.x) + Math.abs(it.z - 40) * 0.3 + (it.y > 3 ? 2 : 0);
    if (s < score) { score = s; best = it; }
  }
  return { x: best.x, y: best.y, z: best.z, long: best.long };
});
console.log('box', box);
await p.evaluate((b) => {
  const P = window.__game.player, w = window.__game.weapon;
  w.ads = 0; w.cur = 0; w.switchT = 0; w._showGun();
  document.getElementById('hud').classList.add('hidden');
  P.position.set(Math.sign(b.x) * 2.2, 0, b.z);
  P.yaw = Math.atan2(b.x - P.position.x, -(b.z - P.position.z));
  P.pitch = 0.05;
}, box);
await shot('step1-before-side');
await p.evaluate((b) => {
  const P = window.__game.player;
  const end = b.x + (b.long === 0 ? 6.4 : 3.2);
  P.position.set(end, 0, b.z + 3.4);
  P.yaw = Math.atan2(b.x - P.position.x, -(b.z - P.position.z));
  P.pitch = 0.12;
}, box);
await shot('step1-before-end');
await b.close();
