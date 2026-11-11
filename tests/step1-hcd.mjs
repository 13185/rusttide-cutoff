import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(240000);
await p.goto('http://127.0.0.1:4190/?quality=high');
await p.waitForFunction(() => window.__rt && window.__rt.ready, null, { timeout: 120000 });
await p.waitForTimeout(500);
await p.evaluate(() => document.getElementById('btnStart').click());
await p.waitForFunction(() => window.__rt.state().mode === 'play', null, { timeout: 30000 });
await p.evaluate(() => {
  const g = window.__game; g.player.godMode = true; g.enemies.clear(); g.spawnT = 9999; g._director = () => {};
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('caption').classList.add('hidden');
  g.flashOn = true; g.flashLight.intensity = 24;
});
const shot = async (n) => { await p.waitForTimeout(1100); await p.screenshot({ path: `screenshots/${n}.png` }); console.log('shot', n); };
// 箱门在 x≈48.14，仓库西墙在 x=50，只能站在缝里对准 10.2 那只
await p.evaluate(() => {
  const P = window.__game.player;
  P.position.set(49.45, 0, 10.2); P.vel.set(0,0,0);
  P.yaw = Math.PI / 2; P.pitch = 0.04;
});
await shot('step1-after-hcd-door');
await p.evaluate(() => {
  const P = window.__game.player;
  P.position.set(49.45, 0, 10.2);
  P.yaw = Math.PI / 2; P.pitch = 0.18;
});
await shot('step1-after-hcd-close');
await b.close();
