// 第一人称武器截图：步枪腰射 / 开镜 / 换弹中 / 霰弹腰射 / 泵动（PFX 前缀区分新旧）
import { chromium } from 'playwright';
const PORT = process.env.PORT || '4190';
const Q = process.env.Q || 'high';
const PFX = process.env.PFX || 'gun-';
const b = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.setDefaultTimeout(240000);
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.addInitScript(`window.__spot = ${JSON.stringify(process.env.SPOT || 'spawn')};`);
await p.goto(`http://127.0.0.1:${PORT}/?quality=${Q}`);
await p.waitForFunction(() => window.__rt && window.__rt.ready, null, { timeout: 120000 });
await p.waitForTimeout(1500);
await p.evaluate(() => document.getElementById('btnStart').click());
await p.evaluate(() => {
  const g = window.__game; g.player.godMode = true; g.enemies.clear(); g.spawnT = 9999; g._director = () => {};
  document.getElementById('caption').classList.add('hidden');
  const w = g.weapon; const orig = w.update.bind(w);
  window.__freeze = false;
  // 冻结：保持换弹/泵动进度不变，但阻尼（手位）照常收敛
  w.update = (dt, i, m) => {
    if (!window.__freeze) return orig(dt, i, { ...m, speed: 0 });
    const k = { reloading: w.reloading, shellT: w.shellT, pumpT: w.pumpT, cycleT: w.cycleT };
    orig(dt, i, { ...m, speed: 0 }); Object.assign(w, k);
  };
  const P = g.player; if (window.__spot === 'spawn') { P.pitch = -0.03; return; } P.position.set(-2, 0, 46); P.vel.set(0, 0, 0); P.yaw = Math.atan2(-(30 + 2), -(30 - 46)); P.pitch = 0.02;
});
const shot = async (n) => { await p.waitForTimeout(1200); await p.screenshot({ path: `screenshots/${PFX}${n}.png` }); console.log('shot', PFX + n); };
const ev = (f, a) => p.evaluate(f, a);
const RP = process.env.RP || '0.4';
await p.waitForTimeout(2500);
await shot('rifle-hip');
await ev(() => { const w = window.__game.weapon; window.__game.input.adsHeld = true; w.ads = 1; });
await p.waitForTimeout(800);
await shot('rifle-ads');
await ev((rp) => { const g = window.__game; g.input.adsHeld = false; const w = g.weapon; w.ads = 0; w.ammo = 8; w.startReload(); w.reloading = w.reloadTotal * (1 - Number(rp)); window.__freeze = true; }, RP);
await shot('rifle-reload');
await ev(() => { const g = window.__game; const w = g.weapon; window.__freeze = false; w.reloading = 0; w.ammo = 30; w.switchTo(1); w.cur = 1; w.next = 1; w.switchT = 0; w._showGun(); });
await p.waitForTimeout(1500);
await ev(() => { const w = window.__game.weapon; w.switchT = 0; w.kick = 0; });
await shot('shotgun-hip');
await ev(() => { const w = window.__game.weapon; w.pumpT = 0.2; w.kick = 0; window.__freeze = true; });
await shot('shotgun-pump');
await ev(() => { const w = window.__game.weapon; window.__freeze = false; w.pumpT = 0; w.ammo = 2; w.startReload(); w.reloading = w.reloadTotal - 0.6; w.shellT = 0.25; window.__freeze = true; });
await shot('shotgun-load');
await b.close();
