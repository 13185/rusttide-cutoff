import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(240000);
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://127.0.0.1:4190/?quality=high');
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
const look = (x, z, tx, tz, pitch = 0.06) => p.evaluate(({ x, z, tx, tz, pitch }) => {
  const P = window.__game.player, w = window.__game.weapon, g = window.__game;
  g.input.adsHeld = false; w.ads = 0; w.cur = 0; w.switchT = 0; w.reloading = 0; w._showGun();
  P.position.set(x, 0, z); P.vel.set(0, 0, 0);
  P.yaw = Math.atan2(-(tx - x), -(tz - z)); P.pitch = pitch;
}, { x, z, tx, tz, pitch });

// ---- guns ----
await p.evaluate(() => { const P = window.__game.player; P.position.set(-2, 0, 80); P.vel.set(0,0,0); P.yaw = 0; P.pitch = -0.03; });
await shot('new-rifle-hip');
await p.evaluate(() => { const w = window.__game.weapon; window.__game.input.adsHeld = true; w.ads = 1; });
await shot('new-rifle-ads');
const reloadAt = async (rp, name) => {
  await p.evaluate((rp) => {
    const g = window.__game, w = g.weapon;
    g.input.adsHeld = false; w.ads = 0; w.ammo = 8; w.startReload();
    w.reloading = w.reloadTotal * (1 - rp); window.__freeze = true;
  }, rp);
  await shot(name);
};
await reloadAt(0.18, 'new-rifle-reload-out');
await reloadAt(0.40, 'new-rifle-reload');
await reloadAt(0.52, 'new-rifle-reload-in');
await reloadAt(0.80, 'new-rifle-reload-charge');

await p.evaluate(() => {
  const w = window.__game.weapon; window.__freeze = false; w.reloading = 0; w.ammo = 30;
  w.switchTo(1); w.cur = 1; w.next = 1; w.switchT = 0; w._showGun(); w.kick = 0; w.ads = 0;
  window.__game.input.adsHeld = false;
});
await p.waitForTimeout(700);
await shot('new-shotgun-hip');
await p.evaluate(() => { const w = window.__game.weapon; window.__game.input.adsHeld = true; w.ads = 1; });
await shot('new-shotgun-ads');
await p.evaluate(() => { const w = window.__game.weapon; window.__game.input.adsHeld = false; w.ads = 0; w.pumpT = 0.2; w.kick = 0; window.__freeze = true; });
await shot('new-shotgun-pump');
await p.evaluate(() => { const w = window.__game.weapon; window.__freeze = false; w.pumpT = 0; w.ammo = 2; w.startReload(); w.reloading = w.reloadTotal - 0.6; w.shellT = 0.25; window.__freeze = true; });
await shot('new-shotgun-load');

// ---- post / sharpness ----
await p.evaluate(() => {
  const P = window.__game.player, w = window.__game.weapon;
  window.__freeze = false; w.reloading = 0; w.ads = 0; w.cur = 0; w.switchT = 0; w._showGun();
  window.__game.input.adsHeld = false;
  document.getElementById('hud').classList.remove('hidden');
  P.position.set(-2, 0, 8); P.yaw = 0; P.pitch = 0.02;
});
await shot('post-port-distant');
await shot('post-hip');
await p.evaluate(() => { const w = window.__game.weapon; window.__game.input.adsHeld = true; w.ads = 1; });
await shot('post-ads');
await p.evaluate(() => { document.getElementById('hud').classList.add('hidden'); window.__game.input.adsHeld = false; window.__game.weapon.ads = 0; });

// ---- HCD all faces ----
// 南侧（-Z 面，朝外）
await look(42.0, 7.15, 42.0, 10.2, 0.12);
await shot('yard-hcd-south');
// 北侧（+Z 面）
await look(42.0, 16.3, 42.0, 12.95, 0.12);
await shot('yard-hcd-north');
// 箱门（+X 面）
await look(49.6, 11.5, 42.0, 11.5, 0.08);
await shot('yard-hcd-door');
// 西端（无门）
await look(34.6, 11.5, 42.0, 11.5, 0.08);
await shot('yard-hcd-west');
// 货垛 / 叉车
await look(43.5, 5.8, 47.2, 11.5, 0.08);
await shot('yard-forklift');
await look(30.5, 8.0, 42.0, 11.5, 0.04);
await shot('yard-hcd');

// 仓库内部（不应再有雨）
await look(51.4, 0.2, 62, 0.2, 0.04);
await shot('yard-warehouse');
await p.evaluate(() => {
  const P = window.__game.player;
  P.position.set(51.4, 0, 0.2); P.yaw = -Math.PI / 2; P.pitch = 0.04;
});
await shot('yard-warehouse-in');
// 再进深处看货架
await look(58, 0.2, 68, 0.2, 0.06);
await shot('yard-warehouse-deep');

await b.close();
