import { chromium } from 'playwright';
import { spawnSync } from 'child_process';
const PORT = process.env.PORT || '4190';
const b = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(240000);
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await p.goto(`http://127.0.0.1:${PORT}/?quality=high`);
await p.waitForFunction(() => window.__rt && window.__rt.ready, null, { timeout: 120000 });
await p.waitForTimeout(800);
await p.evaluate(() => document.getElementById('btnStart').click());
await p.waitForFunction(() => window.__rt.state().mode === 'play', null, { timeout: 30000 });
await p.evaluate(() => {
  const g = window.__game; g.player.godMode = true; g.enemies.clear(); g.spawnT = 9999; g._director = () => {};
  document.getElementById('caption').classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
  const w = g.weapon; const orig = w.update.bind(w);
  window.__freeze = false;
  w.update = (dt, i, m) => {
    if (!window.__freeze) return orig(dt, i, { ...m, speed: 0 });
    const k = { reloading: w.reloading, shellT: w.shellT, pumpT: w.pumpT, cycleT: w.cycleT };
    orig(dt, i, { ...m, speed: 0 }); Object.assign(w, k);
  };
});
const shot = async (n) => { await p.waitForTimeout(900); await p.screenshot({ path: `screenshots/${n}.png` }); console.log('shot', n); };

// ---- guns at spawn ----
await p.evaluate(() => { const P = window.__game.player; P.position.set(-2, 0, 80); P.vel.set(0,0,0); P.yaw = 0; P.pitch = -0.03; });
await shot('new-rifle-hip');
await p.evaluate(() => { const w = window.__game.weapon; window.__game.input.adsHeld = true; w.ads = 1; });
await shot('new-rifle-ads');
await p.evaluate(() => { const g = window.__game; g.input.adsHeld = false; const w = g.weapon; w.ads = 0; w.ammo = 8; w.startReload(); w.reloading = w.reloadTotal * (1 - 0.42); window.__freeze = true; });
await shot('new-rifle-reload');
await p.evaluate(() => { const w = window.__game.weapon; window.__freeze = false; w.reloading = 0; w.ammo = 30; w.switchTo(1); w.cur = 1; w.next = 1; w.switchT = 0; w._showGun(); w.kick = 0; });
await p.waitForTimeout(800);
await shot('new-shotgun-hip');
await p.evaluate(() => { const w = window.__game.weapon; w.pumpT = 0.2; w.kick = 0; window.__freeze = true; });
await shot('new-shotgun-pump');
await p.evaluate(() => { const w = window.__game.weapon; window.__freeze = false; w.pumpT = 0; w.ammo = 2; w.startReload(); w.reloading = w.reloadTotal - 0.6; w.shellT = 0.25; window.__freeze = true; });
await shot('new-shotgun-load');

// ---- containers: pick a near stack ----
const box = await p.evaluate(() => {
  const g = window.__game;
  const list = g.world.cont.list;
  // prefer a 40ft mid-height near center aisle
  let best = list[0], score = 1e9;
  for (const it of list) {
    const s = Math.abs(it.x) + Math.abs(it.z - 40) * 0.3 + (it.y > 3 ? 2 : 0);
    if (s < score) { score = s; best = it; }
  }
  return { x: best.x, y: best.y, z: best.z, long: best.long };
});
console.log('box', box);
await p.evaluate((b) => {
  const g = window.__game, P = g.player, w = g.weapon;
  window.__freeze = false; w.reloading = 0; w.ads = 0; g.input.adsHeld = false;
  w.switchTo(0); w.cur = 0; w.next = 0; w.switchT = 0; w._showGun();
  // stand in the lane, look at the long side
  P.position.set(Math.sign(b.x) * 2.2, 0, b.z);
  P.yaw = Math.atan2(b.x - P.position.x, -(b.z - P.position.z));
  P.pitch = 0.05;
}, box);
await shot('container-side');
await p.evaluate((b) => {
  const P = window.__game.player;
  const end = b.x + (b.long === 0 ? 6.4 : 3.2);
  P.position.set(end, 0, b.z + 3.4);
  P.yaw = Math.atan2(b.x - P.position.x, -(b.z - P.position.z));
  P.pitch = 0.12;
}, box);
await shot('container-end');
await p.evaluate((b) => {
  const P = window.__game.player;
  P.position.set(b.x + (b.x > 0 ? -1.6 : 1.6), 0, b.z + 1.7);
  P.yaw = Math.atan2(b.x - P.position.x, -(b.z - P.position.z));
  P.pitch = 0.35;
}, box);
await shot('container-close');
await p.evaluate((b) => {
  const P = window.__game.player;
  // look slightly up a 2-4 stack to check corner alignment
  P.position.set(Math.sign(b.x || 1) * 2.0, 0, b.z - 4);
  P.yaw = Math.atan2(b.x - P.position.x, -(b.z - P.position.z));
  P.pitch = -0.25;
}, box);
await shot('container-stack');

// ---- port distant + post hip/ads in yard ----
await p.evaluate(() => {
  const P = window.__game.player;
  document.getElementById('hud').classList.remove('hidden');
  P.position.set(-2, 0, 8); P.yaw = 0; P.pitch = 0.02;
});
await shot('post-port-distant');
await p.evaluate(() => { const w = window.__game.weapon; w.ads = 0; window.__game.input.adsHeld = false; });
await shot('post-hip');
await p.evaluate(() => { const w = window.__game.weapon; window.__game.input.adsHeld = true; w.ads = 1; });
await shot('post-ads');

const hideHud = async (hide) => p.evaluate((h) => document.getElementById('hud').classList.toggle('hidden', h), hide);

// ---- 招工横幅（岗亭旁）
await hideHud(true);
await p.evaluate(() => {
  const P = window.__game.player, w = window.__game.weapon;
  w.ads = 0; window.__game.input.adsHeld = false; w.cur = 0; w._showGun();
  P.position.set(-5.4, 0, 80.6); P.vel.set(0,0,0);
  P.yaw = Math.atan2(-9.6 + 5.4, -(78.2 - 80.6)); P.pitch = 0.06;
});
await shot('yard-banner');

// ---- 华晨达集装箱 + 货垛叉车
await p.evaluate(() => {
  const P = window.__game.player;
  P.position.set(28.5, 0, 8.2);
  P.yaw = Math.atan2(36.2 - 28.5, -(12.6 - 8.2)); P.pitch = 0.04;
});
await shot('yard-hcd');
await p.evaluate(() => {
  const P = window.__game.player;
  P.position.set(43.6, 0, 6.2);
  P.yaw = Math.atan2(47.4 - 43.6, -(11.5 - 6.2)); P.pitch = 0.08;
});
await shot('yard-forklift');

// ---- 仓库内部（卷帘门向里看体积光）
await p.evaluate(() => {
  const P = window.__game.player;
  P.position.set(51.4, 0, 0.2);
  P.yaw = -Math.PI / 2; P.pitch = 0.04;
});
await shot('yard-warehouse');

// container close / stack if not already this run
await p.evaluate(() => {
  const P = window.__game.player;
  const list = window.__game.world.cont.list;
  let best = list[0], score = 1e9;
  for (const it of list) {
    const s = Math.abs(it.x) + Math.abs(it.z - 40) * 0.3;
    if (s < score) { score = s; best = it; }
  }
  P.position.set(best.x + (best.x > 0 ? -1.6 : 1.6), 0, best.z + 1.7);
  P.yaw = Math.atan2(best.x - P.position.x, -(best.z - P.position.z));
  P.pitch = 0.35;
  window.__box = best;
});
await shot('container-close');
await p.evaluate(() => {
  const P = window.__game.player, b = window.__box;
  P.position.set(Math.sign(b.x || 1) * 2.0, 0, b.z - 4);
  P.yaw = Math.atan2(b.x - P.position.x, -(b.z - P.position.z));
  P.pitch = -0.25;
});
await shot('container-stack');

await b.close();

