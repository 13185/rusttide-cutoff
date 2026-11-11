import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(240000);
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:4190/?quality=high');
await p.waitForFunction(() => window.__rt && window.__rt.ready, null, { timeout: 120000 });
await p.waitForTimeout(600);
await p.evaluate(() => document.getElementById('btnStart').click());
await p.waitForFunction(() => window.__rt.state().mode === 'play', null, { timeout: 30000 });
await p.evaluate(() => {
  const g = window.__game; g.player.godMode = true; g.enemies.clear(); g.spawnT = 9999; g._director = () => {};
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('caption').classList.add('hidden');
  g.flashOn = true; g.flashLight.intensity = 24;
});
const shot = async (n) => { await p.waitForTimeout(1100); await p.screenshot({ path: `screenshots/${n}.png` }); console.log('shot', n); };

await p.evaluate(() => {
  const P = window.__game.player;
  P.position.set(53.2, 0, 10.2); P.vel.set(0,0,0);
  P.yaw = Math.PI / 2; // look toward -X, door of HCD
  P.pitch = 0.05;
});
await shot('step1-after-hcd-door');

await p.evaluate(() => {
  const P = window.__game.player;
  P.position.set(51.4, 0, 10.2); P.yaw = Math.PI / 2; P.pitch = 0.08;
});
await shot('step1-after-hcd-close');

const box = await p.evaluate(() => {
  const list = window.__game.world.cont.list;
  let best = list[0], score = 1e9;
  for (const it of list) {
    const s = Math.abs(it.x) + Math.abs(it.z - 40) * 0.3 + (it.y > 3 ? 2 : 0);
    if (s < score) { score = s; best = it; }
  }
  return { x: best.x, y: best.y, z: best.z, long: best.long, yaw: best.yaw };
});
console.log('box', box);
await p.evaluate((b) => {
  const P = window.__game.player;
  const half = b.long === 0 ? 6.2 : 3.1;
  const dir = Math.cos(b.yaw || 0); // 1 or -1 along local +X of box
  // stand off the door end
  P.position.set(b.x + dir * (half + 3.4), 0, b.z);
  P.yaw = Math.atan2(b.x - P.position.x, -(b.z - P.position.z));
  P.pitch = 0.1;
}, box);
await shot('step1-after-door');
await b.close();
