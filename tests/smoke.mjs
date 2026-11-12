// 锈潮断链 · Playwright 冒烟测试（开局 / 移动 / 开火换弹 / 弱点 / 切中继 / 撤离结算 / 死亡重开 / 暂停 / 画质）
import { chromium } from 'playwright';
const PORT = process.env.PORT || '4190';
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS !== '0';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--ignore-gpu-blocklist'] });
const fails = []; const errors = [];
const ok = (c, m) => { if (!c) { fails.push(m); console.error('FAIL', m); } else console.log('OK  ', m); };
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
page.on('pageerror', (e) => { errors.push(e.message); console.error('pageerror', e.message); });
const st = () => page.evaluate(() => window.__rt.state());
const shot = async (n) => { if (SHOTS) await page.screenshot({ path: `screenshots/${n}.png` }); };
const face = (x, z, pitch = 0) => page.evaluate(([x, z, pitch]) => { const p = window.__game.player; p.yaw = Math.atan2(-(x - p.position.x), -(z - p.position.z)); p.pitch = pitch; }, [x, z, pitch]);
const tp = (x, z) => page.evaluate(([x, z]) => { const p = window.__game.player; p.position.set(x, 0, z); p.vel.set(0, 0, 0); }, [x, z]);

await page.goto(BASE + '/?quality=' + (process.env.Q || 'low'));
await page.waitForFunction(() => window.__rt && window.__rt.ready, null, { timeout: 120000 });
await page.waitForTimeout(2500);
const h1 = await page.locator('h1').first().textContent();
ok(h1.includes('锈潮'), 'title visible: ' + h1);
ok((await page.locator('.title-sub').first().textContent()).includes('午夜禁区'), 'subtitle 午夜禁区');
ok((await page.content()).includes('作者：Jack'), 'credit 作者：Jack present');
ok((await page.content()).includes('手电筒') || (await page.content()).includes('KeyF') || (await page.content()).includes('>F</'), 'help/keys mention flashlight');
await shot('01-title');

await page.click('#btnStart');
await page.waitForFunction(() => window.__rt.state().mode === 'play');
let s = await st();
ok(s.lockCalls >= 1, 'pointer lock requested x' + s.lockCalls + ' (locked=' + s.locked + ')');
await page.evaluate(() => { window.__game.player.godMode = true; });

const p0 = s.pos;
await page.keyboard.down('KeyW');
await page.waitForFunction((p0) => { const p = window.__rt.state().pos; return Math.hypot(p.x - p0.x, p.z - p0.z) > 0.5; }, p0, { timeout: 20000 }).catch(() => {});
await page.keyboard.up('KeyW');
s = await st();
ok(Math.hypot(s.pos.x - p0.x, s.pos.z - p0.z) > 0.5, 'moved forward ' + Math.hypot(s.pos.x - p0.x, s.pos.z - p0.z).toFixed(2));
await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await page.waitForTimeout(400); await page.keyboard.press('Space'); await page.waitForTimeout(300); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
await page.keyboard.down('KeyC'); await page.waitForTimeout(300); ok(await page.evaluate(() => window.__game.player.crouch), 'crouch with C'); await page.keyboard.up('KeyC');
await page.waitForTimeout(2500);
await shot('02-port');

await page.keyboard.press('KeyF');
await page.waitForFunction(() => window.__rt.state().flashlight === true, null, { timeout: 8000 }).catch(() => {});
s = await st();
ok(s.flashlight === true, 'F turns flashlight on');
await page.waitForTimeout(400);
s = await st();
ok(s.flashlightInt > 2, 'flashlight cone intensity ' + (s.flashlightInt && s.flashlightInt.toFixed(2)));
await page.keyboard.press('KeyF');
await page.waitForFunction(() => window.__rt.state().flashlight === false, null, { timeout: 8000 }).catch(() => {});
s = await st();
ok(s.flashlight === false, 'F toggles flashlight off');
ok(s.wavesEnabled === true, 'continuous spawns enabled');
const diff = await page.evaluate(() => {
  const g = window.__game;
  const bosses = g.enemies.list.filter((e) => e.boss && e.alive).map((e) => e.maxHp);
  const before = g.enemies.alive();
  g.spawnT = 0;
  g._director(0.05);
  const after = g.enemies.alive();
  const p = g.player;
  p.position.set(-34, 0, 40.2); p.vel.set(0, 0, 0);
  g.keys = new Set();
  g.input.keys.KeyE = true;
  const cut0 = g.cut;
  for (let i = 0; i < 90; i++) g._step(0.05);
  const prompt = document.getElementById('intText').textContent || '';
  g.input.keys.KeyE = false;
  g.holdT = 0;
  return { bosses, before, after, cut: g.cut, cut0, prompt, cap: g.spawnCap() };
});
ok(diff.bosses.length === 3 && Math.min(...diff.bosses) >= 1200, 'three bosses with substantial HP ' + diff.bosses.join(','));
ok(diff.after > diff.before, 'spawner keeps producing monsters (' + diff.before + ' -> ' + diff.after + ', cap ' + diff.cap + ')');
ok(diff.cut === diff.cut0 && diff.prompt.includes('钥匙'), 'relay cannot be cut without key: ' + diff.prompt);

await page.evaluate(() => { window.__game.enemies.clear(); });
await page.evaluate(() => {
  const g = window.__game; const i = g.input;
  i.adsHeld = true; i.fireHeld = true;
  // 软件渲染帧率很低时 dt 被钳在 0.05，墙钟 20s 可能只跑几帧。这里按游戏时间推进以验证连发。
  for (let n = 0; n < 30; n++) g._step(0.05);
});
await page.waitForFunction(() => {
  const i = window.__game.input; i.adsHeld = true; i.fireHeld = true;
  return window.__rt.state().stats.shots > 3;
}, null, { timeout: 8000 }).catch(() => {});
await page.evaluate(() => { const i = window.__game.input; i.fireHeld = false; });
s = await st();
const adsV = await page.evaluate(() => window.__game.weapon.ads);
ok(s.stats.shots > 2 && s.ammo < 30, 'fired ' + s.stats.shots + ' shots, ammo ' + s.ammo);
ok(adsV > 0.6, 'hold-RMB ADS ' + adsV.toFixed(2));
const zoom = await page.evaluate(() => {
  const g = window.__game, w = g.weapon;
  g.input.adsHeld = true; w.cur = 0; w.ads = 1; w._showGun();
  for (let i = 0; i < 12; i++) w.update(0.05, g.input, { speed: 0 });
  w.renderScope(g.renderer, g.scene, g.camera);
  return { mag: w.scopeMag, fov: w.scopeCam.fov, cut: g.adsFovCut, base: g.fov };
});
ok(zoom.mag > 1.25, 'ADS optic magnifies x' + (zoom.mag ? zoom.mag.toFixed(2) : zoom.mag) + ' (scope fov ' + (zoom.fov && zoom.fov.toFixed(1)) + ', not a shrink)');
ok(zoom.cut >= 0.15 && zoom.cut <= 0.35 && zoom.base * (1 - zoom.cut) < zoom.base - 8, 'ADS view FOV narrows (cut ' + zoom.cut + ')');
await page.evaluate(() => { window.__game.input.adsHeld = false; });
await page.keyboard.press('KeyR');
await page.waitForTimeout(150);
ok(await page.evaluate(() => window.__game.weapon.reloading > 0), 'R starts reload');
ok(await page.locator('#reloadTip').isVisible(), 'HUD 换弹中 visible');
await page.waitForFunction(() => {
  const g = window.__game;
  // 软件渲染时墙钟跑不满换弹所需的游戏时间，按游戏步长补帧（与上面连发测试同一原因）。
  if (g.weapon.reloading > 0 && g.weapon.ammo < 30) g._step(0.05);
  return g.weapon.ammo === 30;
}, null, { timeout: 30000 }).catch(() => {});
s = await st();
ok(s.ammo === 30 && s.reserve < 150, 'reload refills mag 30 / reserve ' + s.reserve);

const weak = await page.evaluate(() => {
  const g = window.__game; const p = g.player.position;
  const e = g.enemies.spawn('hound', g.player, { x: p.x, z: p.z - 8 });
  e.cool = 99; e.yaw = Math.atan2(-(p.x - e.pos.x), -(p.z - e.pos.z)); e.g.rotation.y = e.yaw;
  e.g.position.copy(e.pos); e.g.updateMatrixWorld(true);
  const eye = e.eye.getWorldPosition(g.camera.position.clone());
  const cam = g.camera.position; const d = eye.clone().sub(cam).normalize();
  const hit = g.enemies.raycast(cam.clone(), d, 50);
  const hp0 = e.hp;
  g.enemies.damage(e, 26, !!(hit && hit.weak), eye);
  return { weak: !!(hit && hit.weak), dmg: hp0 - e.hp };
});
ok(weak.weak && weak.dmg > 60, 'weak-spot raycast + x2.5 damage ' + weak.dmg.toFixed(1));
await page.evaluate(() => { const g = window.__game; g.weapon.ammo = 30; for (const e of g.enemies.list) e.hp = 5; });
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => { const g = window.__game; const pp0 = g.player.position; const e = g.enemies.list.filter((x) => x.alive).sort((a, b) => a.pos.distanceTo(pp0) - b.pos.distanceTo(pp0))[0]; if (!e) return; const p = g.player; const c = e.g.position; p.yaw = Math.atan2(-(c.x - p.position.x), -(c.z - p.position.z)); p.pitch = Math.atan2(c.y + 0.8 - 1.65, Math.hypot(c.x - p.position.x, c.z - p.position.z)); g.player.update(0.016, false, 0); g.camera.updateMatrixWorld(); g.weapon.cool = 0; g._fire(); return JSON.stringify({ n: g.enemies.list.length, d: Math.hypot(c.x - p.position.x, c.z - p.position.z), rl: g.weapon.reloading, am: g.weapon.ammo, hits: g.stats.hits }); }).then((r) => { if (process.env.DBG) console.log(r); });
  await page.waitForTimeout(60);
}
s = await st();
ok(s.stats.kills >= 1 && s.stats.hits >= 1, 'shot kills ' + s.stats.kills + ' hits ' + s.stats.hits);

// —— 新内容：霰弹枪 / 切枪 / 手雷 / 近战 / 弹药箱 ——
await page.evaluate(() => { const g = window.__game; g.enemies.clear(); g.spawnT = 1e9; g._directorOff = g._director; g._director = () => {}; g.player.position.set(-2, 0, 40); g.player.vel.set(0, 0, 0); g.player.yaw = 0; g.player.pitch = 0; });
await page.keyboard.press('Digit2');
await page.waitForFunction(() => { const s = window.__rt.state(); return s.weapon === 'shotgun' && !s.switching; }, null, { timeout: 30000 }).catch(() => {});
s = await st(); ok(s.weapon === 'shotgun', 'Digit2 switches to shotgun (' + s.weapon + ')');
ok((await page.locator('#weapName').textContent()).includes('霰弹枪'), 'HUD shows shotgun name');
const sg = await page.evaluate(() => {
  const g = window.__game; const p = g.player.position;
  const e = g.enemies.spawn('hound', g.player, { x: p.x, z: p.z - 5 }); e.cool = 99; g.enemies.freeze = true;
  e.g.position.copy(e.pos); e.g.updateMatrixWorld(true);
  const pl = g.player; pl.yaw = Math.atan2(-(e.pos.x - p.x), -(e.pos.z - p.z)); pl.pitch = Math.atan2(0.8 - 1.65, Math.hypot(e.pos.x - p.x, e.pos.z - p.z));
  pl.update(0.016, false, 0); g.camera.updateMatrixWorld();
  const hp0 = e.hp; const shots0 = g.stats.shots; g.weapon.cool = 0; g._fire();
  return { dmg: hp0 - Math.max(0, e.hp), alive: e.alive, shots: g.stats.shots - shots0, ammo: g.weapon.ammo };
});
ok(sg.shots === 1 && sg.ammo === 5, 'shotgun fires one shell (ammo ' + sg.ammo + ')');
ok(sg.dmg >= 60 || !sg.alive, 'shotgun pellets hit hard at 5 m: dmg ' + sg.dmg.toFixed(0) + (sg.alive ? '' : ' (killed)'));
await page.evaluate(() => { const g = window.__game; g.input.firePressed = true; g.weapon.cool = 0.5; });
await page.waitForTimeout(100);
await page.keyboard.press('KeyR');
await page.waitForFunction(() => window.__rt.state().ammo === 6, null, { timeout: 30000 }).catch(() => {});
s = await st(); ok(s.ammo === 6, 'shotgun shell-by-shell reload -> 6 (reserve ' + s.reserve + ')');
await page.keyboard.press('Digit1');
await page.waitForFunction(() => { const s = window.__rt.state(); return s.weapon === 'rifle' && !s.switching; }, null, { timeout: 30000 }).catch(() => {});
s = await st(); ok(s.weapon === 'rifle', 'Digit1 switches back to rifle');
await page.evaluate(() => { window.__game.input.wheel = 1; });
await page.waitForFunction(() => window.__rt.state().weapon === 'shotgun', null, { timeout: 30000 }).catch(() => {});
s = await st(); ok(s.weapon === 'shotgun', 'mouse wheel cycles weapon');
await page.waitForFunction(() => !window.__rt.state().switching, null, { timeout: 30000 }).catch(() => {});
await page.keyboard.press('Digit1');
await page.waitForFunction(() => { const s = window.__rt.state(); return s.weapon === 'rifle' && !s.switching; }, null, { timeout: 30000 }).catch(() => {});

await page.keyboard.press('KeyQ');
await page.waitForFunction(() => { const s = window.__rt.state(); return s.weapon === 'shotgun' && !s.switching; }, null, { timeout: 30000 }).catch(() => {});
s = await st(); ok(s.weapon === 'shotgun', 'KeyQ cycles to shotgun');
await page.keyboard.press('KeyQ');
await page.waitForFunction(() => { const s = window.__rt.state(); return s.weapon === 'rifle' && !s.switching; }, null, { timeout: 30000 }).catch(() => {});
s = await st(); ok(s.weapon === 'rifle', 'KeyQ cycles back to rifle');

// 近战
const mel = await page.evaluate(() => {
  const g = window.__game; g.enemies.clear(); const p = g.player.position;
  const e = g.enemies.spawn('hound', g.player, { x: p.x, z: p.z - 1.8 }); e.pos.set(p.x, 0, p.z - 1.8); e.cool = 99; g.enemies.freeze = true;
  g.player.yaw = 0; g.player.pitch = 0; window.__mel = e; return e.hp;
});
await page.keyboard.press('KeyV');
await page.waitForFunction(() => (window.__rt.state().stats.meleeHits || 0) >= 1, null, { timeout: 30000 }).catch(() => {});
s = await st();
const melHp = await page.evaluate(() => window.__mel.hp);
ok((s.stats.meleeHits || 0) >= 1 && melHp < mel, 'V melee hits hound (hp ' + mel + ' -> ' + melHp.toFixed(0) + ')');

// 手雷
await page.evaluate(() => { const g = window.__game; g.enemies.clear(); const p = g.player.position;
  const e = g.enemies.spawn('warden', g.player, { x: p.x, z: p.z - 10 }); e.pos.set(p.x, 0, p.z - 10); e.cool = 99; g.enemies.freeze = true; window.__gw = e;
  g.player.yaw = 0; g.player.pitch = -0.12; });
const g0 = (await st()).grenades;
await page.keyboard.press('KeyG');
await page.waitForFunction(() => window.__rt.state().nades >= 1, null, { timeout: 30000 }).catch(() => {});
s = await st(); ok(s.grenades === g0 - 1 && s.nades >= 1, 'G throws grenade (' + g0 + ' -> ' + s.grenades + ')');
await page.waitForFunction(() => (window.__rt.state().stats.explosions || 0) >= 1, null, { timeout: 60000 }).catch(() => {});
s = await st();
const gwHp = await page.evaluate(() => window.__gw.hp);
ok((s.stats.explosions || 0) >= 1, 'grenade fuse -> explosion');
ok(gwHp < 460, 'grenade blast damages warden (hp 460 -> ' + gwHp.toFixed(0) + ')');
await shot('08-grenade');

// 弹药箱：两把枪 + 手雷一起补
const before = await st();
await page.evaluate(() => { const g = window.__game; g.enemies.clear(); g.enemies.freeze = false; g._spawnPickup(g.player.position.x, g.player.position.z); });
await page.waitForFunction(() => (window.__rt.state().stats.pickups || 0) >= 1, null, { timeout: 30000 }).catch(() => {});
s = await st();
ok(s.slots[0].reserve > before.slots[0].reserve && s.slots[1].reserve > before.slots[1].reserve && s.grenades === before.grenades + 1, `ammo crate resupplies both guns + grenade (rifle ${before.slots[0].reserve}->${s.slots[0].reserve}, shotgun ${before.slots[1].reserve}->${s.slots[1].reserve}, nade ${before.grenades}->${s.grenades})`);

// —— 寻路：猎犬从被集装箱挡住的位置绕行追到玩家，不卡墙 ——
const navSetup = await page.evaluate(() => {
  const g = window.__game; const N = g.nav; g.enemies.clear(); g.enemies.freeze = false;
  const P = g.player; P.position.set(-2, 0, 40); P.vel.set(0, 0, 0);
  let best = null;
  for (let r = 16; r <= 30 && !best; r += 2) for (let a = 0; a < 64 && !best; a++) {
    const x = P.position.x + Math.cos(a / 64 * 6.283) * r, z = P.position.z + Math.sin(a / 64 * 6.283) * r;
    const k = N.idx(x, z); if (k < 0 || N.clear[k] < 3) continue;
    if (N.clearLine(x, z, P.position.x, P.position.z, 1)) continue; // 要求直线被挡
    const path = N.find(x, z, P.position.x, P.position.z, 2); if (!path || !path.complete) continue;
    let L = 0; for (let i = 1; i < path.pts.length; i++) L += Math.hypot(path.pts[i].x - path.pts[i - 1].x, path.pts[i].z - path.pts[i - 1].z);
    if (L > r * 1.25) best = { x, z, r, L, n: path.pts.length };
  }
  if (!best) return null;
  const e = g.enemies.spawn('hound', P, best); e.cool = 99; window.__nh = e; window.__nt0 = g.time;
  g.enemies.navStats.stuck = 0;
  return best;
});
ok(!!navSetup, 'found blocked spawn for nav test ' + JSON.stringify(navSetup && { r: navSetup.r, pathLen: navSetup.L.toFixed(1), wps: navSetup.n }));
if (navSetup) {
  await page.waitForFunction(() => { const g = window.__game; const e = window.__nh; return !e.alive || Math.hypot(e.pos.x - g.player.position.x, e.pos.z - g.player.position.z) < 2.5; }, null, { timeout: 150000 }).catch(() => {});
  const nr = await page.evaluate(() => { const g = window.__game; const e = window.__nh; return { d: Math.hypot(e.pos.x - g.player.position.x, e.pos.z - g.player.position.z), t: g.time - window.__nt0, stuck: g.enemies.navStats.stuck, paths: g.enemies.navStats.paths }; });
  ok(nr.d < 2.5, `hound routed around containers to player (d=${nr.d.toFixed(1)} m in ${nr.t.toFixed(1)} s game time, paths ${nr.paths})`);
  ok(nr.stuck <= 2, 'hound not stuck on walls (stuck events ' + nr.stuck + ')');
}
// 守卫找掩体移动、飞鸥弧线俯冲
const wg = await page.evaluate(() => { const g = window.__game; g.enemies.clear(); const P = g.player; P.position.set(-2, 0, 40);
  const w = g.enemies.spawn('warden', P, { x: -2, z: 14 }); window.__ww = w; window.__w0 = { x: w.pos.x, z: w.pos.z };
  const gl = g.enemies.spawn('gull', P, { x: 10, z: 30 }); gl.cool = 0.2; window.__gg = gl; window.__gdive = false; return true; });
await page.waitForFunction(() => { if (window.__gg.mode === 'dive') window.__gdive = true; const w = window.__ww; return window.__gdive && w.cover && Math.hypot(w.pos.x - window.__w0.x, w.pos.z - window.__w0.z) > 2; }, null, { timeout: 120000, polling: 50 }).catch(() => {});
const wr = await page.evaluate(() => ({ moved: Math.hypot(window.__ww.pos.x - window.__w0.x, window.__ww.pos.z - window.__w0.z), cover: window.__ww.cover, dive: window.__gdive }));
ok(wr.cover && wr.moved > 2, 'warden picks cover point and moves ' + wr.moved.toFixed(1) + ' m');
ok(wr.dive, 'gull performs bezier dive');
await page.evaluate(() => { const g = window.__game; g.enemies.clear(); g._director = g._directorOff; });

await page.evaluate(() => { const g = window.__game; g.enemies.clear(); g.player.position.set(-2, 0, 30); });
await page.evaluate(() => { const g = window.__game; const p = g.player.position;
  g.enemies.spawn('warden', g.player, { x: p.x + 1.5, z: p.z - 17 });
  g.enemies.spawn('hound', g.player, { x: p.x - 2.5, z: p.z - 9 });
  g.enemies.spawn('hound', g.player, { x: p.x + 3, z: p.z - 12 });
  const gl = g.enemies.spawn('gull', g.player, { x: p.x - 4, z: p.z - 14 }); gl.pos.y = 7; });
await face(-0.5, 0, 0.04);
await page.evaluate(() => { const i = window.__game.input; i.fireHeld = true; });
await page.waitForTimeout(900);
await shot('04-combat');
await page.evaluate(() => { const i = window.__game.input; i.fireHeld = false; });

await page.evaluate(() => { const g = window.__game; g.enemies.clear(); g.keys = new Set([0, 1, 2]); });
await tp(-34, 40.2); await face(-34, 38, -0.12);
await page.waitForTimeout(300);
ok(await page.locator('#interact').isVisible(), 'interact prompt near relay A');
await page.keyboard.down('KeyE');
await page.waitForFunction(() => window.__game.holdT > 1.5, null, { timeout: 30000 }).catch(() => {});
await shot('03-relay');
await page.waitForFunction(() => { const g = window.__game; if (g.mode === 'play' && g.cut < 1) g._step(0.05); return g.cut === 1; }, null, { timeout: 30000 }).catch(() => {});
await page.keyboard.up('KeyE');
s = await st();
ok(s.cut === 1 && s.phase === 1, 'relay A cut by holding E (cut=' + s.cut + ')');
await tp(44, 4.2); await face(44, 2);
await page.keyboard.down('KeyE'); await page.waitForFunction(() => window.__game.holdT > 0.8, null, { timeout: 30000 }).catch(() => {}); await page.keyboard.up('KeyE'); await page.waitForTimeout(300);
s = await st(); ok(s.cut === 1, 'releasing E early does not cut');
await page.keyboard.down('KeyE'); await page.waitForFunction(() => { const g = window.__game; if (g.mode === 'play' && g.cut < 2) g._step(0.05); return g.cut === 2; }, null, { timeout: 30000 }).catch(() => {}); await page.keyboard.up('KeyE');
s = await st(); ok(s.cut === 2, 'relay B cut');
await page.waitForTimeout(800);
s = await st(); ok(s.wavesEnabled === true, 'spawner still armed after a relay cut (alive ' + s.enemies + ')');
await tp(-30, -47.8); await face(-30, -50);
await page.keyboard.down('KeyE'); await page.waitForFunction(() => { const g = window.__game; if (g.mode === 'play' && g.cut < 3) g._step(0.05); return g.cut === 3; }, null, { timeout: 30000 }).catch(() => {}); await page.keyboard.up('KeyE');
s = await st(); ok(s.cut === 3, 'relay C cut, objective -> boat');
ok((await page.locator('#objTitle').textContent()).includes('撤离艇'), 'objective text: 登上码头撤离艇');
await tp(36, -52); await face(36, -70, -0.05);
await page.keyboard.down('KeyW'); await page.waitForTimeout(1200);
await shot('05-extract');
await page.waitForFunction(() => { const g = window.__game; if (g.mode === 'play') g._step(0.05); return g.mode === 'win'; }, null, { timeout: 60000 }).catch(() => {});
await page.keyboard.up('KeyW');
s = await st();
ok(s.mode === 'win' && s.result && /[SABC]/.test(s.result.rank), 'boarded boat -> result rank ' + (s.result && s.result.rank));
ok(await page.locator('#result').isVisible(), 'result screen visible');
await page.waitForTimeout(600);
await shot('06-result');

await page.click('#btnAgain');
await page.waitForFunction(() => window.__rt.state().mode === 'play');
s = await st(); ok(s.cut === 0 && s.hp === 100, 'restart resets relays and hp');
await page.evaluate(() => { const p = window.__game.player; p.godMode = false; p.hp = 5; p.hurt(20); });
await page.waitForFunction(() => window.__rt.state().mode === 'dead', null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(1300);
s = await st(); ok(s.mode === 'dead' && await page.locator('#dead').isVisible(), 'death screen');
await shot('07-dead');
await page.click('#btnRetry');
await page.waitForFunction(() => window.__rt.state().mode === 'play');
ok(true, 'retry after death');

await page.evaluate(() => window.__game.pause());
s = await st(); ok(s.mode === 'pause' && await page.locator('#pause').isVisible(), 'pause menu');
await page.click('#pause [data-open=settings]');
await page.click('#qualSeg button[data-q=low]');
await page.waitForTimeout(800);
s = await st(); ok(s.quality === 'low', 'quality switch to low');
await page.click('#qualSeg button[data-q=high]');
await page.waitForTimeout(200);
const grade = await page.evaluate(() => {
  const g = window.__game;
  return { q: g.quality, exp: g.baseExposure, hemi: g.baseHemi, shadow: g.renderer.shadowMap.enabled, refl: g.refl.enabled, ssao: !!(g.post && g.post.doSSAO) };
});
ok(grade.q === 'high' && grade.shadow && grade.refl && grade.ssao && grade.exp >= 1.35 && grade.exp <= 1.6 && grade.hemi >= 1.8, 'high stays the dawn grade (exp ' + grade.exp + ', hemi ' + grade.hemi + ', shadow ' + grade.shadow + ')');
await page.evaluate(() => { const el = document.getElementById('volSfx'); el.value = 40; el.dispatchEvent(new Event('input')); });
ok(await page.evaluate(() => Math.abs(window.__game.audio.vol.sfx - 0.4) < 0.01), 'sfx slider');
ok(await page.evaluate(() => !!window.__game.audio.ctx && !!window.__game.audio.sfx), 'audio context + buses created');
await page.click('#btnPanelClose');
await page.click('#btnResume');
s = await st(); ok(s.mode === 'play', 'resume');

const perf = await page.evaluate(() => window.__rt.state().perf);
console.log('PERF(low)', JSON.stringify(perf));
ok(errors.length === 0, 'no page errors (' + errors.length + ')');
await browser.close();
if (fails.length) { console.error('\nSmoke FAILED:', fails.length); process.exit(1); }
console.log('\nSmoke passed');
