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
ok((await page.content()).includes('作者：Jack'), 'credit 作者：Jack present');
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

await page.evaluate(() => { window.__game.enemies.clear(); });
await page.evaluate(() => { const i = window.__game.input; i.adsHeld = true; i.fireHeld = true; });
await page.waitForFunction(() => window.__rt.state().stats.shots > 3, null, { timeout: 20000 }).catch(() => {});
await page.evaluate(() => { const i = window.__game.input; i.fireHeld = false; });
s = await st();
const adsV = await page.evaluate(() => window.__game.weapon.ads);
ok(s.stats.shots > 2 && s.ammo < 30, 'fired ' + s.stats.shots + ' shots, ammo ' + s.ammo);
ok(adsV > 0.6, 'hold-RMB ADS ' + adsV.toFixed(2));
await page.evaluate(() => { window.__game.input.adsHeld = false; });
await page.keyboard.press('KeyR');
await page.waitForTimeout(150);
ok(await page.evaluate(() => window.__game.weapon.reloading > 0), 'R starts reload');
ok(await page.locator('#reloadTip').isVisible(), 'HUD 换弹中 visible');
await page.waitForFunction(() => window.__rt.state().ammo === 30, null, { timeout: 30000 }).catch(() => {});
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

await page.evaluate(() => window.__game.enemies.clear());
await tp(-34, 40.2); await face(-34, 38, -0.12);
await page.waitForTimeout(300);
ok(await page.locator('#interact').isVisible(), 'interact prompt near relay A');
await page.keyboard.down('KeyE');
await page.waitForFunction(() => window.__game.holdT > 1.5, null, { timeout: 30000 }).catch(() => {});
await shot('03-relay');
await page.waitForFunction(() => window.__rt.state().cut === 1, null, { timeout: 30000 }).catch(() => {});
await page.keyboard.up('KeyE');
s = await st();
ok(s.cut === 1 && s.phase === 1, 'relay A cut by holding E (cut=' + s.cut + ')');
await tp(44, 4.2); await face(44, 2);
await page.keyboard.down('KeyE'); await page.waitForFunction(() => window.__game.holdT > 0.8, null, { timeout: 30000 }).catch(() => {}); await page.keyboard.up('KeyE'); await page.waitForTimeout(300);
s = await st(); ok(s.cut === 1, 'releasing E early does not cut');
await page.keyboard.down('KeyE'); await page.waitForFunction(() => window.__rt.state().cut === 2, null, { timeout: 30000 }).catch(() => {}); await page.keyboard.up('KeyE');
s = await st(); ok(s.cut === 2, 'relay B cut');
await page.waitForFunction(() => window.__rt.state().enemies >= 1, null, { timeout: 30000 }).catch(() => {});
s = await st(); ok(s.enemies >= 1, 'reinforcements spawned after cut: ' + s.enemies);
await tp(-30, -47.8); await face(-30, -50);
await page.keyboard.down('KeyE'); await page.waitForFunction(() => window.__rt.state().cut === 3, null, { timeout: 30000 }).catch(() => {}); await page.keyboard.up('KeyE');
s = await st(); ok(s.cut === 3, 'relay C cut, objective -> boat');
ok((await page.locator('#objTitle').textContent()).includes('撤离艇'), 'objective text: 登上码头撤离艇');
await tp(36, -52); await face(36, -70, -0.05);
await page.keyboard.down('KeyW'); await page.waitForTimeout(1200);
await shot('05-extract');
await page.waitForFunction(() => window.__rt.state().mode === 'win', null, { timeout: 60000 }).catch(() => {});
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
await page.evaluate(() => { const el = document.getElementById('volSfx'); el.value = 40; el.dispatchEvent(new Event('input')); });
ok(await page.evaluate(() => Math.abs(window.__game.audio.vol.sfx - 0.4) < 0.01), 'sfx slider');
ok(await page.evaluate(() => !!window.__game.audio.ctx && !!window.__game.audio.sfx), 'audio context + buses created');
await page.click('#btnPanelClose');
await page.click('#btnResume');
s = await st(); ok(s.mode === 'play', 'resume');

ok(errors.length === 0, 'no page errors (' + errors.length + ')');
await browser.close();
if (fails.length) { console.error('\nSmoke FAILED:', fails.length); process.exit(1); }
console.log('\nSmoke passed');
