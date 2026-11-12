// 锈潮断链 · 主循环与任务逻辑（作者：Jack · 禁止转载）
import * as THREE from '../vendor/three/three.module.js';
import { World, RELAYS, BOAT, SPAWN, QUAY_Z } from './world.js';
import { Sky } from './sky.js';
import { PlanarReflection } from './reflect.js';
import { FX, Rain } from './fx.js';
import { Enemies } from './enemies.js';
import { Weapon, RIFLE, SHOTGUN, GUNS, GRENADE, MELEE } from './weapon.js';
import { loadAssets, instance, pbr, setAssetQuality } from './assets.js';
import { NavGrid } from './nav.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { TouchControls } from './touch.js';
import { Audio } from './audio.js';
import { PostFX } from './postfx.js';
import { damp, fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const QUAL = {
  low: { pr: 0.75, shadow: 0, refl: 0, post: false, rain: 1600, lod: 8 },
  medium: { pr: 1, shadow: 1024, refl: 0.35, post: true, rain: 3000, lod: 12 },
  high: { pr: 1.25, shadow: 2048, refl: 0.5, post: true, rain: 4200, lod: 14 },
  ultra: { pr: 2, shadow: 4096, refl: 0.65, post: true, rain: 5000, lod: 18 },
  // 手机：限分辨率（自适应 0.8–1.25）、无阴影无反射、轻后期（保留 ACES/雾/锐化，去 SSAO 与泛光）、少雨、近 LOD
  mobile: { pr: 1.25, shadow: 0, refl: 0, post: true, rain: 900, lod: 8 }
};
// 仅用于「首次打开时预选手机画质与低模枪」的资源判断，绝不用来关闭指针锁定
const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|MicroMessenger/i.test(navigator.userAgent || '');
const PHASES = [
  { max: 5, every: 6.5, mix: { hound: 1 }, wardens: 0 },
  { max: 7, every: 5.2, mix: { hound: 0.72, gull: 0.28 }, wardens: 0 },
  { max: 8, every: 4.2, mix: { hound: 0.5, gull: 0.3, warden: 0.2 }, wardens: 1 },
  { max: 9, every: 3.4, mix: { hound: 0.45, gull: 0.3, warden: 0.25 }, wardens: 2 }
];
const RADIO = {
  start: ['潮汐七号，这里是潮汐台。乍浦港区刚刚失去联系，现场人员失踪，监控出现无法解释的异常。', '三座异常中继各有一只巡夜者看守。打死它，捡起中继钥匙卡，才能切断机器。撤离艇仍在码头东侧。不要往后看。'],
  cut1: ['第一座中继已关闭。区域电力在掉……东南方向，像是沉重的金属脚步。'],
  cut2: ['第二座中继已关闭。残缺录音：「别关最后一个……那些东西不是靠中继控……」系统仍要求关闭最后一座才能启动撤离艇。'],
  cut3: ['第三座中继已关闭。你把它放出来了。立刻前往码头东侧登艇。'],
  lowhp: ['生命体征在下降，先找掩体。', '你在流血，七号，退到箱子后面。'],
  boat: ['看到你了，跳上来，我们马上离岸。'],
  ammo: ['弹药不多，省着点用。']
};
// 源源不断的巡夜者。手机档在 spawnCap() 里再压低同时存在的数量。
const WAVES_ENABLED = true;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.quality = new URLSearchParams(location.search).get('quality') || localStorage.getItem('rt.quality') || (MOBILE_UA ? 'mobile' : 'high');
    if (!QUAL[this.quality]) this.quality = 'high';
    setAssetQuality(this.quality);
    this.mode = 'boot';
    this.fov = 74;
    this.adsFovCut = 0.18; // 开镜时主视野收窄的比例；窗内另有约 1.55× 放大（weapon.js）
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fov, innerWidth / innerHeight, 0.05, 1200);
    // 低空暖阳正对巷道（f4ab086 的黎明方向）。只改方向和颜色，不增减灯。
    this.sunDir = new THREE.Vector3(0.13, 0.085, -1).normalize();
    this.scene.fog = new THREE.FogExp2(0x6c7178, 0.008);
    this.input = new Input(canvas);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); const el = document.getElementById('glLost'); if (el) el.classList.remove('hidden'); this.renderer.setAnimationLoop(null); });
    this.audio = new Audio();
    this.stats = { shots: 0, hits: 0, weak: 0, kills: 0, time: 0 };
  }

  async boot(progress) {
    const step = async (txt, p) => { progress(txt, p); await new Promise((r) => setTimeout(r, 16)); };
    await step('正在载入模型与材质', 0.02);
    await loadAssets((p) => progress('正在载入模型与材质 ' + Math.round(p * 100) + '%', 0.02 + p * 0.3));
    await step('正在铺设乍浦港区路面', 0.35);
    this.refl = new PlanarReflection(this.renderer, 0.5);
    this.sky = new Sky(this.sunDir);
    this.scene.add(this.sky.mesh);
    this.refl.hidden = []; this.refl.only = [];
    await step('正在布置集装箱与港区灯光', 0.3);
    this.world = new World(this.scene, this.refl, this.quality);
    this.nav = new NavGrid(this.world);
    await step('正在架设岸桥起重机', 0.5);
    this._lights();
    await step('正在生成天空与雨幕', 0.65);
    this._env();
    this.fx = new FX(this.scene, this.world.glowTex);
    this.fx.world = this.world;
    this.rain = new Rain(this.scene, 5000);
    this.refl.hidden.push(this.rain.mesh);
    await step('正在校准黎明光照与手电', 0.8);
    this.enemies = new Enemies(this.scene, this.world, this.fx, this.audio);
    this.enemies.onKill = (e) => this._onKill(e);
    this.enemies.nav = this.nav;
    this.weapon = new Weapon(this.camera, this.world.glowTex);
    this.weapon.scene.environment = this.scene.environment;
    // 雨丝贴在相机前，塞进几度宽的瞄具窗会变成满窗裂纹。镜内不画雨。
    this.weapon.scopeHide = [this.rain.mesh];
    this.player = new Player(this.camera, this.world, this.input);
    this.player.onHurt = (n) => { this.audio.hurt(); this.shake = Math.min(1, this.shake + 0.25 + n * 0.01); };
    this.weapon.onShell = () => this.audio.shellIn();
    this.shake = 0; this.recoilP = 0; this.recoilY = 0; this.recoilPV = 0; this.recoilYV = 0; this.nades = []; this.perf = { calls: 0, tris: 0, fps: 0 };
    this.input.onLook = (dx, dy) => this.weapon.addSway(dx, dy);
    this.input.onLockChange = (l) => this._onLock(l);
    this.post = new PostFX(this.renderer, { quality: 'high' });
    this.post.uSSAO.cameraFar.value = 1200;
    this.post.uComp.exposure.value = 1.34;
    this.post.uComp.lift.value.set(0.004, 0.008, 0.020);
    this.post.uComp.gain.value.set(0.92, 0.98, 1.08);
    this.post.uComp.contrast.value = 1.12;
    this.post.uComp.saturation.value = 0.86;
    this.post.uComp.vignette.value = 0.28;
    this.post.uComp.grain.value = 0.034;
    this.post.uComp.sharpen.value = 0.36;
    this.post.uComp.shafts.value = 0.22;
    this.pickups = [];
    await step('正在准备首帧画面', 0.95);
    this.applyQuality(this.quality);
    addEventListener('resize', () => this._resize());
    this._resize();
    this._ui();
    this.mode = 'title';
    this._titleCam(0);
    await this._warmEnemyPrograms();
    this.clock = new THREE.Clock();
    this.time = 0; this.fpsAcc = 0; this.fpsN = 0;
    this.renderer.setAnimationLoop(() => this._frame());
    this.ready = true;
  }

  // 点光源数量是着色器关键字。看守和后来刷出的巡夜者如果各 new 一盏灯，整批材质会在走路中途重编译。
  // 灯池在加载时就固定好，这里再把三种敌人和看守的材质编译进缓存，开打后不再出新程序。
  async _warmEnemyPrograms() {
    const cam = this.camera;
    const pos = cam.position.clone();
    const quat = cam.quaternion.clone();
    cam.position.set(SPAWN.x, 1.65, 72);
    cam.lookAt(SPAWN.x, 1.2, 66);
    cam.updateMatrixWorld(true);
    const dummy = { position: { x: SPAWN.x, y: 0, z: 72 }, yaw: 0 };
    const audio = this.enemies.audio;
    this.enemies.audio = null;
    for (const type of ['boss', 'hound', 'gull', 'warden']) {
      const e = this.enemies.spawn(type, dummy, { x: SPAWN.x, z: 66 });
      e.g.traverse((o) => { o.frustumCulled = false; });
      e.g.updateMatrixWorld(true);
    }
    this.enemies.audio = audio;
    // 侧面和身后的材质如果等转到才编译，第一次转头会卡一下，接着把积下来的视角一次性甩出去。
    const hiddenCull = [];
    const reveal = (root) => root.traverse((o) => {
      if (o.isMesh && o.frustumCulled) { hiddenCull.push(o); o.frustumCulled = false; }
    });
    reveal(this.scene);
    if (this.weapon && this.weapon.scene) reveal(this.weapon.scene);
    await this.renderer.compileAsync(this.scene, cam);
    if (this.weapon && this.weapon.scene) await this.renderer.compileAsync(this.weapon.scene, cam);
    // compile 只按当前画布的色彩空间出程序。正式画面画进线性的后期目标，没进过画面的那一档要等第一次转过去才编。
    if (this.post && this.post.enabled) {
      this.post.updateSun(cam, this.sunDir.clone().negate());
      this.post.render(this.scene, cam, this.weapon ? this.weapon.scene : null);
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, cam);
    }
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    hiddenCull.forEach((o) => { o.frustumCulled = true; });
    this.enemies.clear();
    cam.position.copy(pos);
    cam.quaternion.copy(quat);
    cam.updateMatrixWorld(true);
    this._titleCam(0);
  }

  _lights() {
    // 黎明低阳：暖色、够亮，巷道和箱色不用手电也能看清。阴影半径收一点，边更清楚。
    const sun = new THREE.DirectionalLight(0xffb878, 2.6);
    sun.position.copy(this.sunDir).multiplyScalar(120);
    sun.castShadow = true;
    const sc = sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 1.5; sun.shadow.blurSamples = 12;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.hemi = new THREE.HemisphereLight(0xb7c4d4, 0x6e5c48, 2.0);
    this.scene.add(this.hemi);
    // 手电筒：绑相机，窄锥远衰减。不占用右键开镜 / Q 换枪
    const fl = new THREE.SpotLight(0xeef4ff, 0, 28, 34 * Math.PI / 180, 0.5, 1.0);
    fl.castShadow = false;
    this.camera.add(fl);
    this.camera.add(fl.target);
    fl.position.set(0.16, -0.14, 0.08);
    fl.target.position.set(0.05, -0.1, -8);
    this.flashLight = fl;
    this.flashOn = false;
    if (!this.camera.parent) this.scene.add(this.camera);
  }
  _env() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const es = new THREE.Scene();
    const sky2 = new Sky(this.sunDir); sky2.mesh.material.uniforms = this.sky.uniforms; es.add(sky2.mesh);
    const groundCol = new THREE.Mesh(new THREE.CircleGeometry(800, 16), new THREE.MeshBasicMaterial({ color: 0x4d4943 }));
    groundCol.rotation.x = -Math.PI / 2; groundCol.position.y = -5; es.add(groundCol);
    this.scene.environment = pm.fromScene(es, 0.02).texture;
    this.scene.environmentIntensity = 1.6;
    pm.dispose();
  }

  applyQuality(q) {
    this.quality = q; localStorage.setItem('rt.quality', q);
    const c = QUAL[q]; const mob = q === 'mobile';
    this.mobilePR = mob ? Math.min(devicePixelRatio || 1, c.pr) : 0;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, c.pr));
    this.renderer.shadowMap.enabled = c.shadow > 0;
    this.sun.castShadow = c.shadow > 0;
    if (c.shadow) { this.sun.shadow.mapSize.set(c.shadow, c.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.refl.scale = c.refl || 0.25;
    this.refl.setEnabled(c.refl > 0);
    this.post.enabled = c.post;
    this.post.applyQuality(q === 'ultra' ? 'high' : q === 'medium' ? 'medium' : mob ? 'low' : q);
    if (this.hemi) {
      // 黎明补光：天光偏冷、地面反弹偏暖。手机和电脑同一套，只是手机没有阴影。
      this.baseHemi = q === 'low' ? 1.7 : 2.0;
      this.hemi.intensity = this.baseHemi;
    }
    if (this.enemies) {
      this.enemies.lightCap = mob ? 3 : 6;
      if (this.enemies._ensurePool) this.enemies._ensurePool();
    }
    // 手机：雾在远处仍能看见岸桥轮廓，远裁剪收到 170 米省掉看不见的远景；天空球随之缩小（只按方向着色）
    this.camera.far = mob ? 170 : 1200; this.camera.updateProjectionMatrix();
    if (this.sky) this.sky.mesh.scale.setScalar(mob ? 0.17 : 1);
    if (this.post && this.post.uSSAO) this.post.uSSAO.cameraFar.value = this.camera.far;
    if (this.weapon && this.weapon.setScopeRes) this.weapon.setScopeRes(mob ? 320 : 640);
    this.rain.setCount(c.rain);
    this.world.setLodDistance(c.lod); this.world.updateLOD(this.camera.position);
    this.world.applyLightBudget(q);
    // 黎明调色：f4ab086 的曝光和lift，再把体积光加强一档。锐度保持。
    if (this.post && this.post.uComp) {
      this.post.uComp.lift.value.set(0.006, 0.010, 0.016);
      this.post.uComp.gain.value.set(1.03, 1.0, 0.97);
      this.post.uComp.contrast.value = 1.18;
      this.post.uComp.saturation.value = 0.82;
      this.post.uComp.grain.value = mob || q === 'low' ? 0.012 : 0.028;
      this.post.uComp.sharpen.value = q === 'low' ? 0.22 : mob ? 0.32 : 0.36;
      this.post.uComp.shafts.value = q === 'low' || mob ? 0 : q === 'medium' ? 0.75 : 1.15;
      this.baseExposure = 1.42;
      this.post.uComp.exposure.value = this.baseExposure;
      this.post.uComp.vignette.value = mob ? 0.12 : 0.16;
    }
    this.scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; });
    this._resize();
    document.querySelectorAll('#qualSeg button').forEach((b) => b.classList.toggle('on', b.dataset.q === q));
  }
  // 手机档自适应分辨率：帧率低于 27 降一档，高于 45 回升（0.8–1.25）
  _adaptPR() {
    if (this.quality !== 'mobile' || !this.perf.fps) return;
    if (this.time < (this._prCool || 0)) return;
    const cap = Math.min(devicePixelRatio || 1, QUAL.mobile.pr);
    let pr = this.mobilePR || cap;
    if (this.perf.fps < 24 && pr > 0.8) pr = Math.max(0.8, +(pr - 0.15).toFixed(2));
    else if (this.perf.fps > 50 && pr < cap - 0.05) pr = Math.min(cap, +(pr + 0.1).toFixed(2));
    else return;
    if (Math.abs(pr - (this.mobilePR || cap)) < 0.04) return;
    this._prCool = this.time + 8;
    this.mobilePR = pr; this.renderer.setPixelRatio(pr); this._resize();
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
    this._weapHud();
    const unlock = () => this.audio.resume();
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
    this.touch = new TouchControls(this);
    const fs = () => this.touch.goFullscreen();
    document.querySelectorAll('[data-fs]').forEach((b) => (b.onclick = fs));
    const rot = $('rotate'); if (rot) rot.addEventListener('click', fs);
    const gl = $('glLost'); if (gl) gl.addEventListener('click', () => location.reload());
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
      document.querySelectorAll('#qualSeg button').forEach((b) => { b.classList.toggle('on', b.dataset.q === this.quality); b.onclick = () => { localStorage.setItem('rt.qualityManual', '1'); this.applyQuality(b.dataset.q); }; });
      if (this.touch) this.touch.bindSettings();
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
    this.wavesEnabled = WAVES_ENABLED;
    this.keys = new Set();
    this.surge = 0;
    this.boltWait = 16 + Math.random() * 12;
    this.flashLife = 0;
    this.flashOn = false; if (this.flashLight) this.flashLight.intensity = 0;
    this.world.resetLamps(); this.world.applyLightBudget(this.quality);
    this.lampOutDone = false; this.lampOutAt = 18 + Math.random() * 70;
    this.stats = { shots: 0, hits: 0, weak: 0, kills: 0, time: 0 };
    this.radioQ = []; this.radioT = 0; this.lowHpTold = 0; this.ammoTold = false; this.boatTold = false;
    this.coverT = 0; this.inCover = false;
    for (const n of this.nades) this.scene.remove(n.m); this.nades = []; this.shake = 0; this.recoilP = 0; this.recoilY = 0; this.recoilPV = 0; this.recoilYV = 0;
    this._weapHud();
    this.mode = 'play';
    this._show(null);
    $('caption').classList.remove('hidden'); $('caption').style.animation = 'none'; void $('caption').offsetWidth; $('caption').style.animation = '';
    this._objective();
    this.say(RADIO.start, 1.2);
    if (this.touch && this.touch.active && this.input.lastPointerType === 'touch') {
      this.touch.goFullscreen();
      if (!localStorage.getItem('rt.hpHint')) { localStorage.setItem('rt.hpHint', '1'); this.touch.hint('建议戴耳机游玩 · 声音能听出东西在哪个方向'); }
    }
    this.input.requestLock();
    this.input.clearPressed();
    this.spawnT = 8;
    this._spawnBosses();
  }
  spawnCap() { return this.quality === 'mobile' ? 4 : 8; }
  _spawnBosses() {
    const offs = [[6, -4], [-6, 6], [5, 6]];
    RELAYS.forEach((r, i) => {
      const [ox, oz] = offs[i];
      const e = this.enemies.spawn('boss', this.player, { x: r.x + ox, z: r.z + oz }, { boss: true, relay: i, label: '巡夜者·' + r.id });
      e.label = '巡夜者·' + r.id;
    });
  }
  pause() { if (this.mode !== 'play') return; this.mode = 'pause'; this._show('pause'); if (this.touch) this.touch.releaseAll(); this.input.exitLock(); this.audio.relayLoop(false); }
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
    setTimeout(() => { if (this.audio) this.audio.knocks(); }, 1600);
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
    let title = '登上码头撤离艇';
    if (this.cut < 3) {
      let i = 0;
      const p = this.player && this.player.position;
      if (p) {
        let best = 1e9;
        this.world.relays.forEach((r, n) => {
          if (r.cut) return;
          const d = Math.hypot(r.x - p.x, r.z - p.z);
          if (d < best) { best = d; i = n; }
        });
      } else i = this.world.relays.findIndex((r) => !r.cut);
      const r = this.world.relays[Math.max(0, i)];
      title = (this.keys && this.keys.has(i))
        ? `持钥匙卡 ${r.id}，切断${r.name}`
        : `击毁巡夜者·${r.id}，取得中继钥匙卡`;
    }
    $('objTitle').textContent = title;
    $('relayCount').textContent = `${this.cut}/3`;
    document.querySelectorAll('#relayBoxes i').forEach((b, i) => b.classList.toggle('on', i < this.cut));
    document.querySelectorAll('#keyPips i').forEach((b, i) => b.classList.toggle('on', !!(this.keys && this.keys.has(i))));
  }

  _onKill(e) {
    this.stats.kills++;
    this._hitmark('kill');
    if (e.boss) {
      this._dropKey(e.pos.x, e.pos.z, e.relay);
      this.weapon.addReserveAll(70, 14);
      this._objective();
    }
    const drop = e.boss ? 1 : e.type === 'warden' ? 0.85 : e.type === 'gull' ? 0.45 : 0.62;
    const w = this.weapon; const low = w.slots[0].reserve < 50 || w.slots[1].reserve < 10 || w.grenades === 0;
    if (Math.random() < drop || (low && Math.random() < 0.85)) this._spawnPickup(e.pos.x + (e.boss ? 1.2 : 0), e.pos.z);
  }
  _dropKey(x, z, relay) {
    if (relay === undefined || relay === null) return;
    const g = new THREE.Group();
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.025, 0.2), new THREE.MeshStandardMaterial({ color: 0xffc56a, emissive: 0xff8a2a, emissiveIntensity: 1.4, roughness: 0.35, metalness: 0.4 }));
    g.add(card);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.world.glowTex, color: 0xffb347, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
    glow.scale.setScalar(1.1); g.add(glow);
    g.position.set(x, 0.45, Math.max(QUAY_Z + 1.5, z));
    this.scene.add(g);
    this.pickups.push({ m: g, t: 0, kind: 'key', relay });
  }
  _spawnPickup(x, z) {
    const g = new THREE.Group();
    this.crateMat = this.crateMat || pbr('enemy', { color: 0x5a6a44, wearColor: 0x8a8a80 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.32), this.crateMat);
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

  _weapHud() {
    const w = this.weapon; if (!w) return;
    $('magTicks').innerHTML = '<i></i>'.repeat(w.def.mag);
    $('magTicks').classList.toggle('big', w.def.mag < 10);
    $('weapName').textContent = (w.cur + 1) + ' · ' + w.def.name;
    this._hudWeap = w.cur;
  }
  _fire() {
    const w = this.weapon; const d = w.def;
    const r = w.tryFire();
    if (r === 'empty') {
      this.audio.dry();
      if (w.startReload()) this.audio.reload(w.reloadTotal);
      return;
    }
    if (r !== 'fire') return;
    this.stats.shots++;
    if (d.id === 'shotgun') { this.audio.shotgun(); setTimeout(() => this.audio.pump(), 260); } else this.audio.shot();
    const cam = this.camera;
    const o = cam.position.clone();
    w.holder.updateMatrixWorld(true);
    const muzzle = w.muzzleWorld();
    const sp = w.spread(Math.min(1, this.player.speed / 5), this.player.crouch);
    const dmgBy = new Map(); let anyHit = false, anyWeak = false;
    for (let k = 0; k < d.pellets; k++) {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      // 霰弹：圆盘内均匀分布
      const a = Math.random() * Math.PI * 2, rr = d.pellets > 1 ? Math.sqrt(Math.random()) * sp : (Math.random() - 0.5) * sp * 2;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      if (d.pellets > 1) dir.addScaledVector(right, Math.cos(a) * rr).addScaledVector(up, Math.sin(a) * rr);
      else { dir.x += rr; dir.y += (Math.random() - 0.5) * sp * 2; dir.z += (Math.random() - 0.5) * sp * 2; }
      dir.normalize();
      const wh = this.world.raycast(o, dir, d.range);
      const eh = this.enemies.raycast(o, dir, wh.t);
      let end;
      if (eh) {
        end = eh.point; anyHit = true; if (eh.weak) anyWeak = true;
        const falloff = d.pellets > 1 ? Math.max(0.35, 1 - eh.t / 30) : 1;
        const cur = dmgBy.get(eh.e) || { dmg: 0, weak: false, point: eh.point };
        cur.dmg += d.dmg * falloff * (0.92 + Math.random() * 0.16) * (eh.weak ? eh.e.def.weakMul : 1);
        cur.weak = cur.weak || eh.weak; dmgBy.set(eh.e, cur);
        this.fx.spark(eh.point, eh.weak ? 10 : 5, eh.weak ? [1, 0.55, 0.2] : [1, 0.85, 0.6], eh.weak ? 7 : 5, 0.35, 0.06);
      } else {
        end = o.clone().addScaledVector(dir, wh.t);
        if (wh.hit) {
          // 击中钢面：火花沿法线反弹
          const n = new THREE.Vector3(...wh.normal);
          this.fx.spark(end.clone().addScaledVector(n, 0.05), d.pellets > 1 ? 3 : 7, [1, 0.8, 0.5], 5, 0.35, 0.05);
          if (k % 3 === 0) this.fx.puff(end, 0.6, 0.6);
          if (Math.random() < 0.4) this.audio.impact(end);
        }
      }
      if (k === 0 ? Math.random() < 0.6 : Math.random() < 0.25) this.fx.tracer(muzzle, end);
    }
    if (anyHit) {
      this.stats.hits++; if (anyWeak) this.stats.weak++;
      let killedAny = false;
      for (const [e, v] of dmgBy) { if (this.enemies.damage(e, v.dmg, false, v.point, true)) killedAny = true; }
      if (!killedAny) this._hitmark(anyWeak ? 'weak' : 'hit');
      this.audio.hit(anyWeak);
    }
    this.fx.light(muzzle, 0xffa050, d.pellets > 1 ? 30 : 14, 0.05, 8);
    if (d.pellets > 1) this.fx.puff(muzzle.clone().add(new THREE.Vector3(0, 0.05, 0)), 0.5, 0.8);
    // 后坐：上跳 + 部分自动回落
    const adsK = 1 - w.ads * 0.45;
    const kick = (d.recoil + Math.random() * d.recoil * 0.45) * adsK;
    this.recoilPV += kick * 18;
    this.recoilYV += (Math.random() - 0.5) * d.recoil * 0.7 * adsK * 18;
    this.shake = Math.min(1, this.shake + (d.pellets > 1 ? 0.22 : 0.05));
    if (w.ammo === 0 && w.reserve > 0 && w.startReload()) this.audio.reload(w.reloadTotal);
  }

  _melee() {
    const w = this.weapon;
    if (!w.melee()) return;
    this.audio.swing();
    const pl = this.player; const fwd = new THREE.Vector3(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw));
    let hit = null, best = 1e9;
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      const ex = e.pos.x - pl.position.x, ez = e.pos.z - pl.position.z, ey = e.pos.y - pl.position.y;
      const d = Math.hypot(ex, ez); const reach = MELEE.range + (e.type === 'warden' ? 0.8 : 0.3);
      if (d > reach || Math.abs(ey) > 3) continue;
      const cos = (ex * fwd.x + ez * fwd.z) / (d || 1);
      if (cos < 0.55 && d > 0.9) continue;
      if (d < best) { best = d; hit = e; }
    }
    this.stats.melee = (this.stats.melee || 0) + 1;
    if (hit) {
      const p = hit.pos.clone(); p.y += hit.type === 'warden' ? 1.6 : hit.type === 'gull' ? 0 : 0.8;
      setTimeout(() => {
        if (!hit.alive) return;
        this.audio.bash(); this.shake = Math.min(1, this.shake + 0.3);
        this.stats.meleeHits = (this.stats.meleeHits || 0) + 1;
        const killed = this.enemies.damage(hit, MELEE.dmg, false, p);
        if (!killed) this._hitmark('hit');
        // 击退
        if (hit.alive && hit.type !== 'warden') { const k = 1.6; const dx = hit.pos.x - pl.position.x, dz = hit.pos.z - pl.position.z, L = Math.hypot(dx, dz) || 1; const c = this.world.collide(hit.pos.x + dx / L * k, hit.pos.z + dz / L * k, 0, 0.55, 2); hit.pos.x = c.x; hit.pos.z = c.z; hit.cool = Math.max(hit.cool, 0.8); }
      }, 120);
    }
  }

  _throw() {
    const w = this.weapon;
    if (!w.throwGrenade()) return;
    this.audio.throwG();
    setTimeout(() => {
      if (this.mode !== 'play') return;
      const cam = this.camera;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const p = cam.position.clone().addScaledVector(fwd, 0.6).add(new THREE.Vector3(0, -0.15, 0));
      const v = fwd.clone().multiplyScalar(17).add(new THREE.Vector3(0, 4.2, 0)).add(new THREE.Vector3(this.player.vel.x, 0, this.player.vel.z));
      const m = instance('grenade', null, () => this._nadeMat || (this._nadeMat = pbr('enemy', { color: 0x4c5a3a })), { shadow: true });
      m.position.copy(p); this.scene.add(m);
      this.nades.push({ m, v, t: 0, spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, 0), bounces: 0 });
      this.stats.grenades = (this.stats.grenades || 0) + 1;
    }, 260);
  }
  _nades(dt) {
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i]; n.t += dt;
      n.v.y -= 16 * dt;
      const step = n.v.clone().multiplyScalar(dt); const L = step.length();
      if (L > 1e-5) {
        const dir = step.clone().divideScalar(L);
        const h = this.world.raycast(n.m.position, dir, L + 0.08);
        if (h.hit && h.t <= L + 0.08) {
          const nn = new THREE.Vector3(...h.normal);
          n.m.position.addScaledVector(dir, Math.max(0, h.t - 0.08));
          n.v.reflect(nn).multiplyScalar(0.42);
          if (nn.y > 0.5 && Math.abs(n.v.y) < 1.2) { n.v.y = 0; }
          if (n.bounces++ < 6 && L > 0.02) this.audio.bounce(n.m.position);
        } else n.m.position.add(step);
      }
      const floor = this.world.groundHeight(n.m.position.x, n.m.position.z, n.m.position.y, 0.05);
      if (n.m.position.y < floor + 0.05) { n.m.position.y = floor + 0.05; if (n.v.y < 0) n.v.y *= -0.35; n.v.x *= 0.7; n.v.z *= 0.7; }
      n.m.rotation.x += n.spin.x * dt * Math.min(1, n.v.length() / 3); n.m.rotation.y += n.spin.y * dt * Math.min(1, n.v.length() / 3);
      if (n.t >= GRENADE.fuse) { this._explode(n.m.position.clone()); this.scene.remove(n.m); this.nades.splice(i, 1); }
    }
  }
  _explode(p) {
    this.fx.explosion(p.clone().add(new THREE.Vector3(0, 0.3, 0)), 1);
    this.fx.debrisBurst(p.clone().add(new THREE.Vector3(0, 0.2, 0)), [this.world.mat.concrete, this.world.mat.dark], 8, 8);
    this.audio.explode(p, 1.3);
    this.stats.explosions = (this.stats.explosions || 0) + 1;
    const c = p.clone().add(new THREE.Vector3(0, 0.5, 0));
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      const ep = e.pos.clone(); ep.y += e.type === 'warden' ? 1.6 : e.type === 'gull' ? 0 : 0.7;
      const d = ep.distanceTo(c); if (d > GRENADE.radius) continue;
      if (!this.world.los(c, ep)) continue;
      const k = Math.pow(1 - d / GRENADE.radius, 0.7);
      this.stats.nadeHits = (this.stats.nadeHits || 0) + 1;
      this.enemies.damage(e, GRENADE.dmg * k, false, ep);
    }
    const pl = this.player; const pe = new THREE.Vector3(pl.position.x, pl.position.y + 1, pl.position.z);
    const dp = pe.distanceTo(c);
    if (dp < GRENADE.radius && this.world.los(c, pe)) pl.hurt(70 * Math.pow(1 - dp / GRENADE.radius, 1.2), p);
    this.shake = Math.min(1.4, this.shake + Math.max(0, 1.2 - dp / 25));
  }

  _trashAlive() { return this.enemies.list.filter((e) => e.alive && !e.boss).length; }
  _director(dt) {
    if (!this.wavesEnabled || this.mode !== 'play') return;
    const P = PHASES[Math.min(this.phase, PHASES.length - 1)];
    const cap = Math.min(P.max, this.spawnCap());
    this.spawnT -= dt;
    if (this.surge > 0 && this._trashAlive() < cap) {
      this.surge--;
      this.enemies.spawn(Math.random() < 0.7 ? 'hound' : 'gull', this.player);
      this.spawnT = Math.min(this.spawnT, 1.4);
    }
    if (this.spawnT <= 0) {
      this.spawnT = P.every * (0.75 + Math.random() * 0.5);
      if (this._trashAlive() < cap) {
        let pick = 'hound'; let r = Math.random();
        for (const [k, v] of Object.entries(P.mix)) { if (r < v) { pick = k; break; } r -= v; }
        if (pick === 'warden' && this.enemies.countType('warden') >= P.wardens) pick = 'hound';
        this.enemies.spawn(pick, this.player);
      }
    }
  }
  _reinforce() {
    if (!this.wavesEnabled) return;
    this.surge = (this.surge || 0) + (this.quality === 'mobile' ? 2 : 3);
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
    this.nearRelay = near;
    if (near === null) { ui.classList.add('hidden'); this.relayPrompt = ''; if (this.holdT > 0) this.audio.relayLoop(false); this.holdT = 0; return; }
    ui.classList.remove('hidden');
    const id = this.world.relays[near].id;
    const have = this.keys && this.keys.has(near);
    if (!have) {
      if (this.holdT > 0) this.audio.relayLoop(false);
      this.holdT = 0;
      this.relayPrompt = '需要中继钥匙卡 ' + id + ' · 先击毁看守的巡夜者';
      $('intText').textContent = this.relayPrompt;
      $('intRing').style.strokeDashoffset = 119.4;
      return;
    }
    const holding = !!(this.input.keys.KeyE || this.input.touch.interact);
    if (holding) {
      if (this.holdT === 0) this.audio.relayLoop(true);
      this.holdT += dt;
      this.audio.relayProgress(this.holdT / 3.5);
      this.relayPrompt = '正在切断 ' + id + ' 号中继…';
      $('intText').textContent = this.relayPrompt;
      if (this.holdT >= 3.5) this.cutRelay(near);
    } else {
      if (this.holdT > 0) this.audio.relayLoop(false);
      this.holdT = 0;
      this.relayPrompt = '按住 · 切断中继 ' + id;
      $('intText').textContent = this.relayPrompt;
    }
    $('intRing').style.strokeDashoffset = 119.4 * (1 - Math.min(1, this.holdT / 3.5));
  }
  cutRelay(i) {
    const r = this.world.relays[i]; if (r.cut) return;
    if (!this.keys || !this.keys.has(i)) return;
    this.world.setRelayCut(i); this.holdT = 0; this.audio.relayLoop(false);
    this.audio.relayCut(new THREE.Vector3(r.x, 2, r.z));
    this.fx.spark(new THREE.Vector3(r.x, 1.6, r.z - 0.6), 40, [1, 0.75, 0.35], 6, 0.9, 0.08);
    this.fx.light(new THREE.Vector3(r.x, 2, r.z - 1), 0x9ad0ff, 40, 0.4, 14);
    this.cut++; this.phase = Math.min(3, this.cut);
    this.weapon.addReserveAll(60, 12);
    this.say(RADIO['cut' + this.cut]);
    if (this.cut === 1) this.audio.nearFarFoot(this.camera.position);
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
    if (this._hudWeap !== w.cur) this._weapHud();
    $('ammoNum').textContent = w.ammo; $('reserveNum').textContent = w.reserve;
    $('gren').textContent = '手雷 ×' + w.grenades;
    $('ammoNum').classList.toggle('low', w.ammo <= Math.ceil(w.def.mag / 5));
    const ticks = $('magTicks').children; for (let i = 0; i < ticks.length; i++) ticks[i].classList.toggle('off', i >= w.ammo);
    $('reloadTip').classList.toggle('hidden', !(w.reloading > 0));
    if (w.reloading > 0) $('reloadTip').textContent = (w.def.perShell ? '装填中 ' : '换弹中 ') + Math.round(w.reloadProgress() * 100) + '%';
    $('lowTip').classList.toggle('hidden', !(w.reloading <= 0 && w.ammo <= Math.ceil(w.def.mag / 5) && w.reserve > 0));
    $('cross').style.opacity = w.ads > 0.25 ? 0 : (1 - w.ads * 3);
    const sp = w.spread(Math.min(1, pl.speed / 5), pl.crouch) * 900;
    for (const [c, x, y] of [['t', 0, -1], ['b', 0, 1], ['l', -1, 0], ['r', 1, 0]]) $('cross').querySelector('.' + c).style.transform = `translate(${x * (6 + sp)}px,${y * (6 + sp)}px)`;
    $('hurtVig').style.opacity = Math.max(pl.hurtFlash * 1.6, pl.hp < 35 ? (1 - pl.hp / 35) * 0.8 : 0);
    const rel = pl.hurtDir - pl.yaw - Math.PI;
    const hd = $('hurtDir'); hd.style.opacity = pl.hurtFlash * 1.8; hd.style.transform = `rotate(${-rel}rad)`;
    $('lockTip').classList.toggle('hidden', this.input.locked || this.mode !== 'play' || this.input.touch.active);
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
    const bar = $('bossBar');
    if (bar) {
      let boss = null, bd = 1e9;
      for (const e of this.enemies.list) {
        if (!e.alive || !e.boss) continue;
        const d = Math.hypot(e.pos.x - pl.position.x, e.pos.z - pl.position.z);
        if (d < bd && d < 48) { bd = d; boss = e; }
      }
      bar.classList.toggle('hidden', !boss);
      if (boss) {
        $('bossName').textContent = boss.label || '巡夜者';
        $('bossFill').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
      }
    }
  }

  // 闪电：0.38 秒内两三次明灭，然后按距离延迟打雷。不做长时间频闪。
  _storm(dt) {
    if (this.mode === 'play') {
      this.boltWait = (this.boltWait || 20) - dt;
      if (this.boltWait <= 0) { this._strike(); this.boltWait = 15 + Math.random() * 25; }
    }
    let k = 0;
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      const u = 1 - Math.max(0, this.flashLife) / 0.38;
      k = u < 0.16 ? 1 : u < 0.28 ? 0.12 : u < 0.46 ? 0.78 : u < 0.58 ? 0.18 : Math.max(0, (1 - u) / 0.42);
      if (this.flashLife <= 0) k = 0;
    }
    // 白天里，闪的间隙先压暗，峰值再打满，亮底上才看得出全屏一白。
    const dip = this.flashLife > 0 && k < 0.5 ? 0.7 : 1;
    if (this.sky && this.sky.uniforms.uFlash) this.sky.uniforms.uFlash.value = k * 2.1;
    if (this.sky && this.sky.uniforms.cover) this.sky.uniforms.cover.value = 0.62 + (this.flashLife > 0 ? (1 - k) * 0.22 : 0);
    if (this.post && this.post.uComp && this.baseExposure) this.post.uComp.exposure.value = this.baseExposure * dip * (1 + k * 1.85);
    if (this.hemi && this.baseHemi) this.hemi.intensity = this.baseHemi * dip * (1 + k * 1.15);
    if (this.sun) this.sun.intensity = 2.6 * dip * (1 + k * 0.45);
    if (this.boltLines) {
      this.boltLines.material.opacity = Math.max(0.15, k);
      if (k === 0) { this.scene.remove(this.boltLines); this.boltLines.geometry.dispose(); this.boltLines = null; }
    }
  }
  _strike() {
    this.flashLife = 0.38;
    const ang = Math.random() * Math.PI * 2;
    const dist = 55 + Math.random() * 80;
    const x = this.player.position.x + Math.cos(ang) * Math.min(dist, 90);
    const z = this.player.position.z + Math.sin(ang) * Math.min(dist, 90);
    if (this.boltLines) { this.scene.remove(this.boltLines); this.boltLines.geometry.dispose(); }
    const pts = [];
    let y = 78, px = x, pz = z;
    pts.push(new THREE.Vector3(px, y, pz));
    while (y > 2) {
      y -= 8 + Math.random() * 7;
      px += (Math.random() - 0.5) * 7;
      pz += (Math.random() - 0.5) * 7;
      pts.push(new THREE.Vector3(px, Math.max(0.4, y), pz));
    }
    this.boltLines = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xe7f1ff, transparent: true, opacity: 1 }));
    this.scene.add(this.boltLines);
    this.audio.thunder(dist / 340);
    this.shake = Math.min(1, (this.shake || 0) + 0.22);
  }

  _titleCam(t) {
    const c = this.camera;
    c.position.set(SPAWN.x + Math.sin(t * 0.05) * 1.5, 1.7, SPAWN.z - 6 - t * 0.12 % 10);
    c.rotation.order = 'YXZ'; c.rotation.set(0.04, -0.08 + Math.sin(t * 0.07) * 0.06, 0);
  }

  _frame() {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(0.05, rawDt);
    this.time += dt;
    this.fpsAcc += rawDt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.perf.fps = Math.round(this.fpsN / this.fpsAcc); if ((this.prT = (this.prT || 0) + 1) % 4 === 0) this._adaptPR(); $('fps').textContent = `${this.perf.fps} FPS · ${this.perf.calls} DC · ${(this.perf.tris / 1000).toFixed(0)}k △`; this.fpsAcc = 0; this.fpsN = 0; }
    this.renderer.info.reset();
    if (this.touch) this.touch.update(dt);
    const playing = this.mode === 'play';
    if (playing) this._step(dt);
    else if (this.mode === 'title') this._titleCam(this.time);
    else if (this.mode === 'dead') { this.camera.position.y = damp(this.camera.position.y, 0.4, 2, dt); this.camera.rotation.z = damp(this.camera.rotation.z, 0.5, 2, dt); }
    if (this.mode !== 'pause') { this.fx.update(dt); }
    if (this.mode === 'dead' || this.mode === 'win' || this.mode === 'title') this.enemies.update(dt * (this.mode === 'title' ? 0 : 1), this.player, this.time);
    this.world.update(dt, this.time, this.camera);
    if (this.sky) this._storm(dt);
    this.sky.update(this.time, this.camera.position);
    this.rain.update(dt, this.camera, this.world);
    // 阴影相机按 4 米对齐，走路时不再每帧重摆整张阴影图
    const cp = this.camera.position;
    const gx = Math.round(cp.x / 4) * 4, gz = Math.round(cp.z / 4) * 4;
    this.sun.target.position.set(gx, 0, gz);
    this.sun.position.set(gx + this.sunDir.x * 150, this.sunDir.y * 150 + 20, gz + this.sunDir.z * 150);
    const adsEase = this.weapon.ads * this.weapon.ads * (3 - 2 * this.weapon.ads);
    this.camera.fov = damp(this.camera.fov, this.fov * (1 - adsEase * this.adsFovCut) + (this.player.sprint ? 3 : 0), 8, dt);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    const fwd = this._fwd || (this._fwd = new THREE.Vector3());
    fwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.audio.update(dt, { mode: this.mode, enemies: this.enemies.alive(), phase: this.phase || 0, hp: this.player.hp, cam: this.camera, fwd });
    // 渲染（先画瞄准镜内放大画面，再画主视角；镜外不做全黑遮幅）
    if ((playing || this.mode === 'pause') && this.weapon.renderScope) this.weapon.renderScope(this.renderer, this.scene, this.camera);
    this.refl.update(this.scene, this.camera);
    if (this.post.enabled) this.post.updateSun(this.camera, this._sunAim || (this._sunAim = this.sunDir.clone().negate()));
    const gun = playing || this.mode === 'pause' ? this.weapon.scene : null;
    if (this.post.enabled) this.post.render(this.scene, this.camera, gun);
    else { this.renderer.setRenderTarget(null); this.renderer.clear(); this.renderer.render(this.scene, this.camera); if (gun) { this.renderer.clearDepth(); this.renderer.render(gun, this.camera); } }
    this.perf.calls = this.renderer.info.render.calls; this.perf.tris = this.renderer.info.render.triangles;
  }

  _step(dt) {
    this.elapsed += dt;
    const pl = this.player, w = this.weapon, inp = this.input;
    if (inp.take('KeyR') && w.startReload()) { if (!w.def.perShell) this.audio.reload(w.reloadTotal); }
    let sw = -1;
    if (inp.take('Digit1')) sw = 0; if (inp.take('Digit2')) sw = 1;
    const wheel = inp.takeWheel(); if (wheel) sw = (w.cur + (wheel > 0 ? 1 : -1) + GUNS.length) % GUNS.length;
    if (inp.take('KeyQ')) sw = (w.cur + 1) % GUNS.length;
    if (sw >= 0 && w.switchTo(sw)) this.audio.switchW();
    if (inp.take('KeyF')) { this.flashOn = !this.flashOn; this.audio.ui(); }
    if (inp.take('KeyV')) this._melee();
    if (inp.take('KeyG')) this._throw();
    const mv = pl.update(dt, this.inCover, w.ads);
    if (mv.foot) this.audio.foot(pl.sprint);
    const firePress = inp.takeFire();
    if (!pl.sprint && (w.def.auto ? inp.fireHeld : firePress)) this._fire();
    // 后坐：弹簧回正，收尾干净
    const rk = 38, rd = 11;
    this.recoilPV += -rk * this.recoilP * dt - rd * this.recoilPV * dt;
    this.recoilYV += -rk * this.recoilY * dt - rd * this.recoilYV * dt;
    this.recoilP += this.recoilPV * dt;
    this.recoilY += this.recoilYV * dt;
    if (Math.abs(this.recoilP) < 1e-5 && Math.abs(this.recoilPV) < 1e-4) { this.recoilP = 0; this.recoilPV = 0; }
    if (Math.abs(this.recoilY) < 1e-5 && Math.abs(this.recoilYV) < 1e-4) { this.recoilY = 0; this.recoilYV = 0; }
    this.camera.rotation.x += this.recoilP;
    this.camera.rotation.y += this.recoilY;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.shake = this.shake < 0.004 ? 0 : this.shake;
    if (this.shake > 0.001) { const k = this.shake * this.shake * 0.028, t = this.time * 47; this.camera.rotation.x += Math.sin(t) * k; this.camera.rotation.y += Math.sin(t * 1.37 + 1) * k; this.camera.rotation.z += Math.sin(t * 0.83 + 2) * k * 0.5; }
    this._nades(dt);
    w.update(dt, inp, { speed: pl.speed });
    this._updateFlashlight(dt, pl);
    if (!this.lampOutDone && this.elapsed >= this.lampOutAt) {
      if (this.world.extinguishLamp(0)) this.audio.lampOut();
      this.lampOutDone = true;
    }
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
      if (Math.hypot(p.m.position.x - pl.position.x, p.m.position.z - pl.position.z) < 1.6) {
        if (p.kind === 'key') { this.keys.add(p.relay); this._objective(); }
        else { w.resupply(); w.addReserveAll(18, 4); }
        this.stats.pickups = (this.stats.pickups || 0) + 1; this.audio.pickup(); this.scene.remove(p.m); this.pickups.splice(i, 1);
      } else if (p.kind !== 'key' && p.t > 60) { this.scene.remove(p.m); this.pickups.splice(i, 1); }
    }
    // 无线电提醒
    if (pl.hp < 30 && this.time - this.lowHpTold > 25) { this.lowHpTold = this.time; this.say([RADIO.lowhp[Math.floor(Math.random() * 2)]]); }
    if (!this.ammoTold && w.slots[0].reserve + w.slots[0].ammo < 40) { this.ammoTold = true; this.say(RADIO.ammo); }
    // 撤离
    if (this.cut >= 3) {
      const d = Math.hypot(BOAT.boardX - pl.position.x, BOAT.boardZ - pl.position.z);
      if (d < 12 && !this.boatTold) { this.boatTold = true; this.say(RADIO.boat); }
      if (d < 2.6) this.win();
    }
    if (!pl.alive) this.die();
    this._hud(dt);
  }

  _updateFlashlight(dt, pl) {
    if (!this.flashLight) return;
    const on = !!this.flashOn;
    const target = on ? 24 : 0;
    this.flashLight.intensity = damp(this.flashLight.intensity, target, 10, dt);
    const st = pl.stepT || 0, k = Math.min(1, (pl.speed || 0) / 5);
    this.flashLight.position.set(
      0.16 + Math.sin(st * Math.PI * 2) * 0.03 * k,
      -0.14 + Math.abs(Math.cos(st * Math.PI * 2)) * 0.024 * k,
      0.08
    );
  }

  // —— 测试接口 ——
  debugState() {
    const w = this.weapon;
    return { weapon: w.def.id, slots: w.slots.map((x) => ({ ...x })), grenades: w.grenades, switching: w.switchT > 0, nades: this.nades.length, perf: { ...this.perf, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures }, nav: { ...this.enemies.navStats, lastMs: this.nav.lastMs }, shake: this.shake,
      mode: this.mode, hp: this.player.hp, ammo: this.weapon.ammo, reserve: this.weapon.reserve, cut: this.cut, phase: this.phase, enemies: this.enemies.alive(), pos: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z }, locked: this.input.locked, lockCalls: this.input.lockCalls, stats: { ...this.stats }, result: this.lastResult || null, quality: this.quality, flashlight: !!this.flashOn, flashlightInt: this.flashLight ? this.flashLight.intensity : 0, wavesEnabled: !!this.wavesEnabled, lampOut: !!this.lampOutDone, keys: this.keys ? [...this.keys] : [], bosses: this.enemies.list.filter((e) => e.boss).map((e) => ({ hp: e.hp, max: e.maxHp, alive: e.alive, relay: e.relay })), prompt: this.relayPrompt || '', touch: this.touch ? { active: this.touch.active, preset: this.touch.cfg.preset, lockSkips: this.input.lockSkips, axis: { ...this.input.touch }, ads: this.input.adsHeld, fireHeld: this.input.fireHeld, pr: this.renderer.getPixelRatio() } : null, crouch: this.player.crouch, sprint: this.player.sprint, yaw: this.player.yaw, pitch: this.player.pitch, weaponAds: this.weapon.ads, holdT: this.holdT };
  }
}
