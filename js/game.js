// 锈潮断链 · 主循环与任务逻辑（作者：Jack · 禁止转载）
import * as THREE from '../vendor/three/three.module.js';
import { World, RELAYS, BOAT, SPAWN, QUAY_Z } from './world.js';
import { Sky } from './sky.js';
import { PlanarReflection } from './reflect.js';
import { FX, Rain } from './fx.js';
import { Enemies } from './enemies.js';
import { Weapon, RIFLE } from './weapon.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { PostFX } from './postfx.js';
import { damp, fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const QUAL = {
  low: { pr: 0.75, shadow: 0, refl: 0, post: false, rain: 1600 },
  medium: { pr: 1, shadow: 1024, refl: 0.35, post: true, rain: 3000 },
  high: { pr: 1.25, shadow: 2048, refl: 0.5, post: true, rain: 4200 },
  ultra: { pr: 2, shadow: 4096, refl: 0.65, post: true, rain: 5000 }
};
const PHASES = [
  { max: 4, every: 7, mix: { hound: 1 }, wardens: 0 },
  { max: 6, every: 5.5, mix: { hound: 0.7, warden: 0.3 }, wardens: 1 },
  { max: 8, every: 4.5, mix: { hound: 0.5, gull: 0.3, warden: 0.2 }, wardens: 2 },
  { max: 10, every: 3.2, mix: { hound: 0.45, gull: 0.3, warden: 0.25 }, wardens: 3 }
];
const RADIO = {
  start: ['潮汐七号，这里是潮汐台。港区自动化网络被入侵，所有巡检机械已转为攻击模式。', '三处上行中继分别在西堆场、东仓库和一号岸桥下。逐个切断，撤离艇在码头东侧待命。'],
  cut1: ['第一处中继下线。网络正在重新路由——重型守卫单元被唤醒了，利用集装箱掩护。'],
  cut2: ['第二处中继下线。它们放出了空中单元，注意头顶。'],
  cut3: ['最后一处中继已断开！整个港区都在朝你压过来——立刻去码头东侧登艇！'],
  lowhp: ['生命体征在下降，先找掩体，别硬拼。', '你在流血，七号，退到箱子后面！'],
  boat: ['看到你了，跳上来，我们马上离岸！'],
  ammo: ['弹药告急，击毁的机械身上有港务局的弹药箱。']
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.quality = new URLSearchParams(location.search).get('quality') || localStorage.getItem('rt.quality') || 'high';
    if (!QUAL[this.quality]) this.quality = 'high';
    this.mode = 'boot';
    this.fov = 74;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fov, innerWidth / innerHeight, 0.05, 1200);
    this.sunDir = new THREE.Vector3(0.24, 0.09, -1).normalize();
    this.scene.fog = new THREE.FogExp2(0x6c7178, 0.0085);
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.stats = { shots: 0, hits: 0, weak: 0, kills: 0, time: 0 };
  }

  async boot(progress) {
    const step = async (txt, p) => { progress(txt, p); await new Promise((r) => setTimeout(r, 16)); };
    await step('正在铺设港区路面', 0.1);
    this.refl = new PlanarReflection(this.renderer, 0.5);
    this.sky = new Sky(this.sunDir);
    this.scene.add(this.sky.mesh);
    this.refl.hidden = [];
    await step('正在布置集装箱与锈迹', 0.3);
    this.world = new World(this.scene, this.refl, this.quality);
    await step('正在架设岸桥起重机', 0.5);
    this._lights();
    await step('正在生成天空与雨幕', 0.65);
    this._env();
    this.fx = new FX(this.scene, this.world.glowTex);
    this.rain = new Rain(this.scene, 5000);
    this.refl.hidden.push(this.rain.mesh);
    await step('正在唤醒机械单元', 0.8);
    this.enemies = new Enemies(this.scene, this.world, this.fx, this.audio);
    this.enemies.onKill = (e) => this._onKill(e);
    this.weapon = new Weapon(this.camera, this.world.glowTex);
    this.weapon.scene.environment = this.scene.environment;
    this.player = new Player(this.camera, this.world, this.input);
    this.player.onHurt = () => { this.audio.hurt(); };
    this.input.onLook = (dx, dy) => this.weapon.addSway(dx, dy);
    this.input.onLockChange = (l) => this._onLock(l);
    this.post = new PostFX(this.renderer, { quality: 'high' });
    this.post.uSSAO.cameraFar.value = 1200;
    this.post.uComp.exposure.value = 1.45;
    this.pickups = [];
    await step('正在准备首帧画面', 0.95);
    this.applyQuality(this.quality);
    addEventListener('resize', () => this._resize());
    this._resize();
    this._ui();
    this.mode = 'title';
    this._titleCam(0);
    this.clock = new THREE.Clock();
    this.time = 0; this.fpsAcc = 0; this.fpsN = 0;
    this.renderer.setAnimationLoop(() => this._frame());
    this.ready = true;
  }

  _lights() {
    const sun = new THREE.DirectionalLight(0xffb878, 2.6);
    sun.position.copy(this.sunDir).multiplyScalar(120);
    sun.castShadow = true;
    const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.hemi = new THREE.HemisphereLight(0xa9bad2, 0x5e5448, 2.6);
    this.scene.add(this.hemi);
  }
  _env() {
    // 用天空本身生成环境光照（PMREM）
    const pm = new THREE.PMREMGenerator(this.renderer);
    const es = new THREE.Scene();
    const sky2 = new Sky(this.sunDir); sky2.mesh.material.uniforms = this.sky.uniforms; es.add(sky2.mesh);
    const groundCol = new THREE.Mesh(new THREE.CircleGeometry(800, 16), new THREE.MeshBasicMaterial({ color: 0x2b2824 }));
    groundCol.rotation.x = -Math.PI / 2; groundCol.position.y = -5; es.add(groundCol);
    this.scene.environment = pm.fromScene(es, 0.02).texture;
    this.scene.environmentIntensity = 1.6;
    pm.dispose();
  }

  applyQuality(q) {
    this.quality = q; localStorage.setItem('rt.quality', q);
    const c = QUAL[q];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, c.pr));
    this.renderer.shadowMap.enabled = c.shadow > 0;
    this.sun.castShadow = c.shadow > 0;
    if (c.shadow) { this.sun.shadow.mapSize.set(c.shadow, c.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.refl.scale = c.refl || 0.25;
    this.refl.setEnabled(c.refl > 0);
    this.post.enabled = c.post;
    this.post.applyQuality(q === 'ultra' ? 'high' : q === 'medium' ? 'medium' : q);
    this.rain.setCount(c.rain);
    this.scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; });
    this._resize();
    document.querySelectorAll('#qualSeg button').forEach((b) => b.classList.toggle('on', b.dataset.q === q));
  }
  _resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.post && this.post.setSize(w, h);
    this.refl && this.refl.setSize(w, h);
  }

  // —— 界面 ——
  _ui() {
    const strip = $('compassStrip');
    const names = { 0: '北', 45: '东北', 90: '东', 135: '东南', 180: '南', 225: '西南', 270: '西', 315: '西北' };
    let html = '';
    for (let d = -360; d <= 720; d += 15) { const n = ((d % 360) + 360) % 360; html += `<span class="${names[n] ? 'card' : ''}" style="left:${(d + 360) * 4}px">${names[n] || String(n).padStart(3, '0')}</span>`; }
    strip.innerHTML = html;
    $('compassMarks').innerHTML = RELAYS.map((r) => `<span data-id="${r.id}"><b>${r.id}</b><em></em></span>`).join('') + '<span data-id="boat" class="boat hidden"><b>艇</b><em></em></span>';
    $('magTicks').innerHTML = '<i></i>'.repeat(RIFLE.mag);
    const unlock = () => this.audio.resume();
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
    $('btnStart').onclick = () => { this.audio.ui(); this.start(); };
    $('btnResume').onclick = () => this.resume();
    $('btnRestart').onclick = () => this.start();
    $('btnRetry').onclick = () => this.start();
    $('btnAgain').onclick = () => this.start();
    for (const id of ['btnQuit', 'btnDeadQuit', 'btnResQuit']) $(id).onclick = () => this.toTitle();
    document.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => this.openPanel(b.dataset.open)));
    $('btnPanelClose').onclick = () => $('panel').classList.add('hidden');
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.mode === 'play' && !this.input.locked) this.pause();
        else if (this.mode === 'pause' && e.code === 'KeyP') this.resume();
      }
    });
  }
  openPanel(name) {
    $('panelBody').innerHTML = $('tpl-' + name).innerHTML;
    $('panel').classList.remove('hidden');
    if (name === 'settings') {
      document.querySelectorAll('#qualSeg button').forEach((b) => { b.classList.toggle('on', b.dataset.q === this.quality); b.onclick = () => this.applyQuality(b.dataset.q); });
      const s = $('sens'); s.value = this.input.sensitivity / 0.0021; s.oninput = () => (this.input.sensitivity = 0.0021 * +s.value);
      const f = $('fov'); f.value = this.fov; f.oninput = () => (this.fov = +f.value);
      const v = this.audio.vol;
      $('volMaster').value = v.master * 100; $('volMusic').value = v.music * 100; $('volSfx').value = v.sfx * 100; $('mute').checked = this.audio.muted;
      const sync = () => { this.audio.resume(); this.audio.setVolumes({ master: $('volMaster').value / 100, music: $('volMusic').value / 100, sfx: $('volSfx').value / 100 }); };
      ['volMaster', 'volMusic', 'volSfx'].forEach((id) => ($(id).oninput = sync));
      $('mute').onchange = () => this.audio.setMute($('mute').checked);
    }
  }
  _show(id) { for (const m of ['title', 'pause', 'dead', 'result']) $(m).classList.toggle('hidden', m !== id); $('hud').classList.toggle('hidden', !(id === null || id === 'pause')); }

  // —— 流程 ——
  start() {
    this.audio.resume();
    this.enemies.clear(); this.fx.clear();
    for (const p of this.pickups) this.scene.remove(p.m); this.pickups = [];
    this.player.reset(); this.weapon.reset();
    this.world.resetRelays(); this.world.setBoatReady(false);
    this.cut = 0; this.phase = 0; this.holdT = 0; this.spawnT = 4; this.elapsed = 0;
    this.stats = { shots: 0, hits: 0, weak: 0, kills: 0, time: 0 };
    this.radioQ = []; this.radioT = 0; this.lowHpTold = 0; this.ammoTold = false; this.boatTold = false;
    this.coverT = 0; this.inCover = false;
    this.mode = 'play';
    this._show(null);
    $('caption').classList.remove('hidden'); $('caption').style.animation = 'none'; void $('caption').offsetWidth; $('caption').style.animation = '';
    this._objective();
    this.say(RADIO.start, 1.2);
    this.input.requestLock();
    this.input.clearPressed();
    // 开局：远处三只猎犬
    setTimeout(() => { if (this.mode === 'play') for (let i = 0; i < 2; i++) this.enemies.spawn('hound', this.player); }, 3500);
  }
  pause() { if (this.mode !== 'play') return; this.mode = 'pause'; this._show('pause'); this.input.exitLock(); this.audio.relayLoop(false); }
  resume() { if (this.mode !== 'pause') return; this.mode = 'play'; this._show(null); this.input.requestLock(); }
  toTitle() { this.mode = 'title'; this.enemies.clear(); this.fx.clear(); this._show('title'); this.input.exitLock(); this.audio.relayLoop(false); }
  _onLock(l) {
    if (l) { this.wasLocked = true; $('lockTip').classList.add('hidden'); }
    else if (this.mode === 'play' && this.wasLocked) this.pause();
  }
  die() {
    this.mode = 'dead'; this.input.exitLock(); this.audio.relayLoop(false);
    $('deadInfo').textContent = `坚持 ${fmtTime(this.elapsed)} · 已切断中继 ${this.cut}/3 · 击毁 ${this.stats.kills}`;
    setTimeout(() => this._show('dead'), 900);
  }
  win() {
    this.mode = 'win'; this.input.exitLock(); this.audio.relayLoop(false); this.audio.win();
    const s = this.stats; s.time = this.elapsed;
    const acc = s.shots ? s.hits / s.shots : 0; const wr = s.hits ? s.weak / s.hits : 0;
    const score = Math.max(0, Math.min(40, (720 - s.time) / 360 * 40)) + Math.min(30, acc * 55) + Math.min(30, wr * 75);
    const rank = score >= 80 ? 'S' : score >= 64 ? 'A' : score >= 48 ? 'B' : 'C';
    const word = { S: '潮头破浪 · 无可挑剔', A: '利落收线 · 干脆漂亮', B: '稳步推进 · 任务完成', C: '九死一生 · 活着回来就好' }[rank];
    this.lastResult = { rank, score, acc, wr, ...s };
    $('resRank').textContent = rank; $('resWord').textContent = word;
    $('resTable').innerHTML = [['用时', fmtTime(s.time)], ['命中率', (acc * 100).toFixed(1) + '%'], ['弱点命中', `${s.weak} 次（${(wr * 100).toFixed(0)}%）`], ['击毁机械', s.kills], ['评分', Math.round(score)]].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
    this._show('result');
  }

  say(lines, delay = 0) {
    for (const l of lines) this.radioQ.push(l);
    this.radioT = Math.min(this.radioT, -delay);
    if (this.radioT === 0) this.radioT = -delay;
  }
  _radio(dt) {
    if (this.radioCur) {
      this.radioCur.t += dt;
      const n = Math.floor(this.radioCur.t * 26);
      $('radioText').textContent = this.radioCur.text.slice(0, n);
      if (this.radioCur.t > this.radioCur.text.length / 26 + 3.2) { this.radioCur = null; $('radio').classList.add('hidden'); this.radioT = -0.4; }
      return;
    }
    this.radioT += dt;
    if (this.radioT >= 0 && this.radioQ.length) { this.radioCur = { text: this.radioQ.shift(), t: 0 }; $('radio').classList.remove('hidden'); this.audio.radio(); }
  }
  _objective() {
    $('objTitle').textContent = this.cut < 3 ? '切断三处上行中继' : '登上码头撤离艇';
    $('relayCount').textContent = `${this.cut}/3`;
    document.querySelectorAll('#relayBoxes i').forEach((b, i) => b.classList.toggle('on', i < this.cut));
  }

  _onKill(e) {
    this.stats.kills++;
    this._hitmark('kill');
    const drop = e.type === 'warden' ? 1 : e.type === 'gull' ? 0.3 : 0.38;
    if (Math.random() < drop || (this.weapon.reserve < 40 && Math.random() < 0.7)) this._spawnPickup(e.pos.x, e.pos.z);
  }
  _spawnPickup(x, z) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.32), new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.6, metalness: 0.3 }));
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.34), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    g.add(box, band);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.world.glowTex, color: 0xffb347, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 })); glow.scale.setScalar(1.4); g.add(glow);
    g.position.set(x, 0.3, Math.max(QUAY_Z + 1.5, z)); this.scene.add(g);
    this.pickups.push({ m: g, t: 0 });
  }

  _hitmark(kind) {
    const h = $('hitmark'); h.className = kind === 'weak' ? 'weak' : kind === 'kill' ? 'kill' : '';
    h.style.transition = 'none'; h.style.opacity = 1; void h.offsetWidth; h.style.transition = 'opacity .35s'; h.style.opacity = 0;
  }

  _fire() {
    const w = this.weapon;
    const r = w.tryFire();
    if (r === 'empty') {
      this.audio.dry();
      if (w.startReload()) this.audio.reload(RIFLE.reload);
      return;
    }
    if (r !== 'fire') return;
    this.stats.shots++;
    this.audio.shot();
    const cam = this.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const sp = w.spread(Math.min(1, this.player.speed / 5), this.player.crouch);
    dir.x += (Math.random() - 0.5) * sp * 2; dir.y += (Math.random() - 0.5) * sp * 2; dir.z += (Math.random() - 0.5) * sp * 2; dir.normalize();
    const o = cam.position.clone();
    const wh = this.world.raycast(o, dir, RIFLE.range);
    const eh = this.enemies.raycast(o, dir, wh.t);
    w.holder.updateMatrixWorld(true);
    const muzzle = w.muzzleWorld();
    let end;
    if (eh) {
      end = eh.point; this.stats.hits++; if (eh.weak) this.stats.weak++;
      const killed = this.enemies.damage(eh.e, RIFLE.dmg * (0.92 + Math.random() * 0.16), eh.weak, eh.point);
      if (!killed) this._hitmark(eh.weak ? 'weak' : 'hit');
      this.audio.hit(eh.weak);
    } else {
      end = o.clone().addScaledVector(dir, wh.t);
      if (wh.hit) { this.fx.spark(end, 5, [1, 0.8, 0.5], 4, 0.3, 0.05); this.fx.puff(end, 0.6, 0.6); if (Math.random() < 0.4) this.audio.impact(end); }
    }
    if (Math.random() < 0.55) this.fx.tracer(muzzle, end);
    this.fx.light(muzzle, 0xffa050, 14, 0.05, 7);
    // 后坐
    const adsK = w.ads > 0.5 ? 0.55 : 1;
    this.player.pitch += (0.011 + Math.random() * 0.005) * adsK;
    this.player.yaw += (Math.random() - 0.5) * 0.008 * adsK;
    if (w.ammo === 0 && w.reserve > 0 && w.startReload()) this.audio.reload(RIFLE.reload);
  }

  _director(dt) {
    const P = PHASES[this.phase];
    this.spawnT -= dt;
    const alive = this.enemies.alive();
    if (this.spawnT <= 0) {
      this.spawnT = P.every * (0.8 + Math.random() * 0.4);
      if (alive < P.max) {
        let pick = 'hound'; let r = Math.random();
        for (const [k, v] of Object.entries(P.mix)) { if (r < v) { pick = k; break; } r -= v; }
        if (pick === 'warden' && this.enemies.countType('warden') >= P.wardens) pick = 'hound';
        this.enemies.spawn(pick, this.player);
      }
    }
  }
  _reinforce() {
    const sets = [null, ['hound', 'hound', 'warden'], ['gull', 'gull', 'hound', 'hound'], ['hound', 'hound', 'gull', 'gull', 'warden']];
    (sets[this.phase] || []).forEach((t, i) => setTimeout(() => { if (this.mode === 'play') this.enemies.spawn(t, this.player); }, 600 + i * 900));
  }

  _relays(dt) {
    const p = this.player.position;
    let near = null;
    for (let i = 0; i < this.world.relays.length; i++) {
      const r = this.world.relays[i];
      if (r.cut) continue;
      if (Math.hypot(r.x - p.x, r.z - p.z) < 2.8) { near = i; break; }
    }
    const ui = $('interact');
    if (near === null) { ui.classList.add('hidden'); if (this.holdT > 0) this.audio.relayLoop(false); this.holdT = 0; return; }
    ui.classList.remove('hidden');
    const holding = !!this.input.keys.KeyE;
    if (holding) {
      if (this.holdT === 0) this.audio.relayLoop(true);
      this.holdT += dt;
      this.audio.relayProgress(this.holdT / 3.5);
      $('intText').textContent = '正在切断 ' + this.world.relays[near].id + ' 号中继…';
      if (this.holdT >= 3.5) this.cutRelay(near);
    } else {
      if (this.holdT > 0) this.audio.relayLoop(false);
      this.holdT = 0; $('intText').textContent = '按住 · 切断中继 ' + this.world.relays[near].id;
    }
    $('intRing').style.strokeDashoffset = 119.4 * (1 - Math.min(1, this.holdT / 3.5));
  }
  cutRelay(i) {
    const r = this.world.relays[i]; if (r.cut) return;
    this.world.setRelayCut(i); this.holdT = 0; this.audio.relayLoop(false);
    this.audio.relayCut(new THREE.Vector3(r.x, 2, r.z));
    this.fx.spark(new THREE.Vector3(r.x, 1.6, r.z - 0.6), 40, [1, 0.75, 0.35], 6, 0.9, 0.08);
    this.fx.light(new THREE.Vector3(r.x, 2, r.z - 1), 0x9ad0ff, 40, 0.4, 14);
    this.cut++; this.phase = Math.min(3, this.cut);
    this.weapon.reserve = Math.min(240, this.weapon.reserve + 60);
    this.say(RADIO['cut' + this.cut]);
    this._reinforce();
    this._objective();
    if (this.cut >= 3) { this.world.setBoatReady(true); $('compassMarks').querySelector('[data-id=boat]').classList.remove('hidden'); }
    else this.spawnT = 2;
  }

  _hud(dt) {
    const pl = this.player, w = this.weapon;
    const hp = Math.ceil(pl.hp);
    $('hpNum').textContent = hp; const f = $('hpFill'); f.style.width = pl.hp + '%'; f.classList.toggle('low', pl.hp < 35);
    $('regenTip').classList.toggle('hidden', !(this.inCover && pl.sinceHurt > 4 && pl.hp < 100));
    $('ammoNum').textContent = w.ammo; $('reserveNum').textContent = w.reserve;
    $('ammoNum').classList.toggle('low', w.ammo <= 6);
    const ticks = $('magTicks').children; for (let i = 0; i < ticks.length; i++) ticks[i].classList.toggle('off', i >= w.ammo);
    $('reloadTip').classList.toggle('hidden', !(w.reloading > 0));
    if (w.reloading > 0) $('reloadTip').textContent = '换弹中 ' + Math.round(w.reloadProgress() * 100) + '%';
    $('lowTip').classList.toggle('hidden', !(w.reloading <= 0 && w.ammo <= 6 && w.reserve > 0));
    $('cross').style.opacity = w.ads > 0.5 ? 0 : 1;
    const sp = w.spread(Math.min(1, pl.speed / 5), pl.crouch) * 900;
    for (const [c, x, y] of [['t', 0, -1], ['b', 0, 1], ['l', -1, 0], ['r', 1, 0]]) $('cross').querySelector('.' + c).style.transform = `translate(${x * (6 + sp)}px,${y * (6 + sp)}px)`;
    $('hurtVig').style.opacity = Math.max(pl.hurtFlash * 1.6, pl.hp < 35 ? (1 - pl.hp / 35) * 0.8 : 0);
    const rel = pl.hurtDir - pl.yaw - Math.PI;
    const hd = $('hurtDir'); hd.style.opacity = pl.hurtFlash * 1.8; hd.style.transform = `rotate(${-rel}rad)`;
    $('lockTip').classList.toggle('hidden', this.input.locked || this.mode !== 'play');
    // 罗盘
    const heading = ((-pl.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const W = $('compass').clientWidth;
    $('compassStrip').style.transform = `translateX(${W / 2 - (heading + 360) * 4}px)`;
    const marks = $('compassMarks').children;
    const targets = [...this.world.relays.map((r) => ({ x: r.x, z: r.z, done: r.cut })), { x: BOAT.boardX, z: BOAT.boardZ, done: false }];
    targets.forEach((t, i) => {
      const m = marks[i]; const dx = t.x - pl.position.x, dz = t.z - pl.position.z;
      const brg = Math.atan2(dx, -dz) * 180 / Math.PI;
      let rel2 = brg - heading; while (rel2 > 180) rel2 -= 360; while (rel2 < -180) rel2 += 360;
      m.style.left = (W / 2 + Math.max(-W / 2 + 20, Math.min(W / 2 - 20, rel2 * 4))) + 'px';
      m.classList.toggle('done', t.done);
      m.querySelector('em').textContent = t.done ? '已断开' : Math.round(Math.hypot(dx, dz)) + '米';
    });
    $('capClock').textContent = fmtTime(5 * 60 + 18 + Math.floor(this.elapsed / 60));
  }

  _titleCam(t) {
    const c = this.camera;
    c.position.set(SPAWN.x + Math.sin(t * 0.05) * 1.5, 1.7, SPAWN.z - 6 - t * 0.12 % 10);
    c.rotation.order = 'YXZ'; c.rotation.set(0.04, -0.08 + Math.sin(t * 0.07) * 0.06, 0);
  }

  _frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { $('fps').textContent = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    const playing = this.mode === 'play';
    if (playing) this._step(dt);
    else if (this.mode === 'title') this._titleCam(this.time);
    else if (this.mode === 'dead') { this.camera.position.y = damp(this.camera.position.y, 0.4, 2, dt); this.camera.rotation.z = damp(this.camera.rotation.z, 0.5, 2, dt); }
    if (this.mode !== 'pause') { this.fx.update(dt); }
    if (this.mode === 'dead' || this.mode === 'win' || this.mode === 'title') this.enemies.update(dt * (this.mode === 'title' ? 0 : 1), this.player, this.time);
    this.world.update(dt, this.time, this.camera);
    this.sky.update(this.time, this.camera.position);
    this.rain.update(dt, this.camera);
    // 阴影相机跟随
    const cp = this.camera.position;
    this.sun.target.position.set(cp.x, 0, cp.z); this.sun.position.set(cp.x + this.sunDir.x * 150, this.sunDir.y * 150 + 20, cp.z + this.sunDir.z * 150);
    this.camera.fov = damp(this.camera.fov, this.fov * (1 - this.weapon.ads * 0.36) + (this.player.sprint ? 4 : 0), 12, dt);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.audio.update(dt, { mode: this.mode, enemies: this.enemies.alive(), phase: this.phase || 0, hp: this.player.hp, cam: this.camera, fwd });
    // 渲染
    this.refl.update(this.scene, this.camera);
    if (this.post.enabled) this.post.updateSun(this.camera, this.sunDir.clone().negate());
    const gun = playing || this.mode === 'pause' ? this.weapon.scene : null;
    if (this.post.enabled) this.post.render(this.scene, this.camera, gun);
    else { this.renderer.setRenderTarget(null); this.renderer.clear(); this.renderer.render(this.scene, this.camera); if (gun) { this.renderer.clearDepth(); this.renderer.render(gun, this.camera); } }
  }

  _step(dt) {
    this.elapsed += dt;
    const pl = this.player, w = this.weapon, inp = this.input;
    if (inp.take('KeyR') && w.startReload()) this.audio.reload(RIFLE.reload);
    const mv = pl.update(dt, this.inCover, w.ads);
    if (mv.foot) this.audio.foot(pl.sprint);
    if (inp.fireHeld && !pl.sprint) this._fire();
    w.update(dt, inp, { speed: pl.speed });
    this.enemies.update(dt, pl, this.time);
    this._director(dt);
    this._relays(dt);
    this._radio(dt);
    // 掩体判定
    this.coverT -= dt;
    if (this.coverT <= 0) {
      this.coverT = 0.3;
      const eye = new THREE.Vector3(pl.position.x, pl.position.y + 1.4, pl.position.z);
      this.inCover = !this.enemies.list.some((e) => e.alive && e.pos.distanceTo(eye) < 70 && this.world.los(new THREE.Vector3(e.pos.x, e.pos.y + 1.2, e.pos.z), eye));
    }
    // 拾取
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]; p.t += dt; p.m.rotation.y += dt * 1.5; p.m.position.y = 0.3 + Math.sin(p.t * 3) * 0.06;
      if (Math.hypot(p.m.position.x - pl.position.x, p.m.position.z - pl.position.z) < 1.6) { w.reserve = Math.min(240, w.reserve + 30); this.audio.pickup(); this.scene.remove(p.m); this.pickups.splice(i, 1); }
      else if (p.t > 60) { this.scene.remove(p.m); this.pickups.splice(i, 1); }
    }
    // 无线电提醒
    if (pl.hp < 30 && this.time - this.lowHpTold > 25) { this.lowHpTold = this.time; this.say([RADIO.lowhp[Math.floor(Math.random() * 2)]]); }
    if (!this.ammoTold && w.reserve + w.ammo < 40) { this.ammoTold = true; this.say(RADIO.ammo); }
    // 撤离
    if (this.cut >= 3) {
      const d = Math.hypot(BOAT.boardX - pl.position.x, BOAT.boardZ - pl.position.z);
      if (d < 12 && !this.boatTold) { this.boatTold = true; this.say(RADIO.boat); }
      if (d < 2.6) this.win();
    }
    if (!pl.alive) this.die();
    this._hud(dt);
  }

  // —— 测试接口 ——
  debugState() {
    return { mode: this.mode, hp: this.player.hp, ammo: this.weapon.ammo, reserve: this.weapon.reserve, cut: this.cut, phase: this.phase, enemies: this.enemies.alive(), pos: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z }, locked: this.input.locked, lockCalls: this.input.lockCalls, stats: { ...this.stats }, result: this.lastResult || null, quality: this.quality };
  }
}
