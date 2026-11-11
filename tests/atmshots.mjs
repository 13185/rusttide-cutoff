import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(240000);
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await p.goto('http://127.0.0.1:4190/?quality=high');
await p.waitForFunction(() => window.__rt && window.__rt.ready, null, { timeout: 120000 });
await p.waitForTimeout(800);
await p.evaluate(() => document.getElementById('btnStart').click());
await p.waitForFunction(() => window.__rt.state().mode === 'play', null, { timeout: 30000 });
await p.evaluate(() => {
  const g = window.__game; g.player.godMode = true; g.enemies.clear(); g.spawnT = 9999; g._director = () => {};
  document.getElementById('caption').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
});
const shot = async (n) => { await p.waitForTimeout(1000); await p.screenshot({ path: `screenshots/${n}.png` }); console.log('shot', n); };
const look = (x, z, tx, tz, pitch = 0.06) => p.evaluate(({ x, z, tx, tz, pitch }) => {
  const P = window.__game.player, w = window.__game.weapon;
  w.ads = 0; w.cur = 0; w.switchT = 0; w._showGun();
  P.position.set(x, 0, z); P.vel.set(0,0,0);
  P.yaw = Math.atan2(-(tx - x), -(tz - z)); P.pitch = pitch;
}, { x, z, tx, tz, pitch });

// 岗亭 + 吉利达横幅（南端空地）
await look(-1.6, 101.6, -5.8, 101.6, 0.08);
await shot('yard-banner');
await look(-3.2, 101.6, -5.8, 101.6, 0.1);
await shot('yard-banner-close');

// 横幅 2：横向通道
await look(-2.0, 22.0, -7.6, 21.5, 0.08);
await shot('yard-banner-corner');

// 货栈南墙横幅：站在墙外南侧朝北看
await look(58, -22.5, 58, -17.35, 0.1);
await shot('yard-banner-wall');

// 华晨达集装箱
await look(30.5, 8.0, 42.0, 11.5, 0.04);
await shot('yard-hcd');

// 叉车 + 货垛
await look(43.5, 5.8, 47.2, 11.5, 0.08);
await shot('yard-forklift');

// 仓库内部
await look(51.4, 0.2, 62, 0.2, 0.04);
await shot('yard-warehouse');

await p.evaluate(() => {
  const P = window.__game.player;
  P.position.set(51.4, 0, 0.2); P.yaw = -Math.PI / 2; P.pitch = 0.04;
});
await shot('yard-warehouse-in');

await b.close();

