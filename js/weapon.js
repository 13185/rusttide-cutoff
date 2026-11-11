// 武器：潮汐-7 突击步枪 / 港务-12 泵动霰弹枪 + 手雷 + 近战（Blender 建模，作者：Jack · 原创）
import * as THREE from '../vendor/three/three.module.js';
import { damp } from './util.js';
import { A, pbr, instance } from './assets.js';

export const RIFLE = { id: 'rifle', name: '潮汐-7 突击步枪', mag: 30, reserve: 150, maxReserve: 240, rpm: 640, dmg: 26, pellets: 1, reload: 2.15, hipSpread: 0.022, adsSpread: 0.0035, range: 220, auto: true, kick: 0.45, recoil: 0.011 };
export const SHOTGUN = { id: 'shotgun', name: '港务-12 泵动霰弹枪', mag: 6, reserve: 30, maxReserve: 48, rpm: 75, dmg: 15, pellets: 9, reload: 0.5, perShell: true, hipSpread: 0.075, adsSpread: 0.05, range: 60, auto: false, kick: 1.2, recoil: 0.045 };
export const GUNS = [RIFLE, SHOTGUN];
export const GRENADE = { max: 3, fuse: 2.2, radius: 7.5, dmg: 190 };
export const MELEE = { dmg: 60, range: 2.4, cool: 0.75 };

// 枪口火焰：十字插片 + 星形贴图（运行时 canvas 绘制）
function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.15, 'rgba(255,200,110,0.9)'); gr.addColorStop(0.45, 'rgba(255,120,40,0.35)'); gr.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    g.save(); g.translate(64, 64); g.rotate(i / 7 * Math.PI * 2 + Math.random() * 0.4);
    const sg = g.createLinearGradient(0, 0, 60, 0); sg.addColorStop(0, 'rgba(255,220,150,0.9)'); sg.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = sg; g.beginPath(); g.moveTo(0, -5); g.lineTo(58 * (0.6 + Math.random() * 0.4), 0); g.lineTo(0, 5); g.fill(); g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function sideFlashTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.3, 'rgba(255,170,80,0.8)'); gr.addColorStop(1, 'rgba(255,90,30,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 16); g.quadraticCurveTo(40, 0, 128, 14); g.lineTo(128, 18); g.quadraticCurveTo(40, 32, 0, 16); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// 双手握持（g 空间，相对模型里的 gripR / gripL 锚点）：off=掌心偏移，finger=手指伸展方向，dorsal=手背朝向，arm=前臂方向
const HAND_CFG = {
  rifle: {
    R: { off: [0.016, 0.012, 0.022], finger: [0.02, -0.28, -0.96], dorsal: [1, 0.04, 0], arm: [0.28, -0.48, 1], curl: [[0.12, 0.32, 0.28], [0.72, 0.68, 0.48], [0.78, 0.72, 0.52], [0.72, 0.66, 0.46]], thumb: [0.82, 0.55, 0.55] },
    L: { off: [-0.02, 0.004, 0.0], finger: [0.75, 0.05, -0.65], dorsal: [-0.4, -0.9, 0], arm: [-0.45, -0.5, 1], curl: [[0.48, 0.58, 0.4], [0.5, 0.6, 0.42], [0.5, 0.6, 0.42], [0.48, 0.58, 0.4]], thumb: [0.25, 0, 0.25] },
  },
  shotgun: {
    R: { off: [0.02, -0.002, 0.002], finger: [0.02, -0.82, -0.55], dorsal: [1, 0.04, 0], arm: [0.28, -0.42, 1], curl: [[0.12, 0.32, 0.28], [0.72, 0.68, 0.48], [0.78, 0.72, 0.52], [0.72, 0.66, 0.46]], thumb: [0.82, 0.55, 0.55] },
    L: { off: [-0.016, 0.006, 0.0], finger: [0.75, 0.05, -0.65], dorsal: [-0.4, -0.9, 0], arm: [-0.45, -0.5, 1], curl: [[0.48, 0.58, 0.4], [0.5, 0.6, 0.42], [0.5, 0.6, 0.42], [0.48, 0.58, 0.4]], thumb: [0.25, 0, 0.25] },
  },
};

export class Weapon {
  constructor(camera, glowTex) {
    this.camera = camera;
    this.scene = new THREE.Scene();
    this.ads = 0; this.kick = 0; this.squeeze = 0; this.sway = new THREE.Vector2(); this.bob = 0; this.flash = 0;
    this.switchT = 0; this.meleeT = 0; this.throwT = 0; this.pumpT = 0; this.cycleT = 0;
    this.shells = [];
    this._build(glowTex);
    this.reset();
  }
  get def() { return GUNS[this.cur]; }
  get ammo() { return this.slots[this.cur].ammo; }
  set ammo(v) { this.slots[this.cur].ammo = v; }
  get reserve() { return this.slots[this.cur].reserve; }
  set reserve(v) { this.slots[this.cur].reserve = v; }
  reset() {
    this.slots = GUNS.map((g) => ({ ammo: g.mag, reserve: g.reserve }));
    this.cur = 0; this.reloading = 0; this.cool = 0; this.shots = 0; this.grenades = 2; this.meleeCool = 0;
    this.switchT = 0; this.meleeT = 0; this.throwT = 0;
    this._showGun();
  }
  // 弹药箱：两把枪都补，手雷 +1
  resupply() {
    GUNS.forEach((g, i) => { this.slots[i].reserve = Math.min(g.maxReserve, this.slots[i].reserve + (i === 0 ? 30 : 8)); });
    this.grenades = Math.min(GRENADE.max, this.grenades + 1);
  }
  addReserveAll(rifle, shot) {
    this.slots[0].reserve = Math.min(RIFLE.maxReserve, this.slots[0].reserve + rifle);
    this.slots[1].reserve = Math.min(SHOTGUN.maxReserve, this.slots[1].reserve + shot);
  }

  _build(glowTex) {
    // 原创件（红点镜 / 双手）用项目 PBR；枪身用改装后的 CC BY 模型自带 glTF PBR（反照率 sRGB、ORM/法线线性，由 GLTFLoader 正确标注）
    const dark = pbr('gunmetal', { color: 0x26282c, metal: 0.55, rough: 1.3, env: 0.4, wear: 0.25, wearColor: 0x56595e, wet: 0 });
    const gm = pbr('gunmetal', { color: 0x33363a, metal: 0.6, rough: 1.2, env: 0.42, wear: 0.3, wearColor: 0x6a6d72, wet: 0 });
    const sleeve = pbr('polymer', { color: 0x3a4334, metal: 0, rough: 1.15, env: 0.4, wear: 0.18, wearColor: 0x5a6450, wet: 0.15, normal: 1.3 });
    const skin = pbr('polymer', { color: 0x6a5a48, metal: 0, rough: 0.78, env: 0.55, wear: 0.18, wearColor: 0x4a4034, wet: 0.2, normal: 0.85 });
    const knuckle = pbr('polymer', { color: 0x5a4c3c, metal: 0, rough: 0.82, env: 0.4, wear: 0.1, wet: 0.18, normal: 0.6 });
    const nail = new THREE.MeshStandardMaterial({ color: 0x6a4a42, roughness: 0.5, metalness: 0 });
    const lens = new THREE.MeshStandardMaterial({ color: 0x6a8a94, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.9 });
    const byName = { M_gun_metal: gm, M_gun_dark: dark, M_gun_poly: dark, M_gun_fde: dark, M_glove: skin, M_sleeve: sleeve, M_skin: skin, M_knuckle: knuckle, M_nail: nail, M_lens: lens };
    // 改装枪身材质：湿冷港口光下偏沉稳——环境反射略收、AO 全开
    const tuneGun = (m) => { if (!m || m.userData.tuned) return m; m.userData.tuned = true; m.color.multiplyScalar(0.88); if (m.color.r > m.color.b * 1.08) m.color.r *= 0.9; m.metalness = Math.min(0.88, (m.metalness || 0.55) * 1.02); m.roughness = Math.min(0.92, Math.max(0.28, (m.roughness || 0.45) * 0.96)); m.envMapIntensity = 0.72; m.aoMapIntensity = 0.95; if (m.normalScale) m.normalScale.set(1.05, 1.05); return m; };
    this.views = [];
    const ftex = flashTexture(), stex = sideFlashTexture();
    const tmp = new THREE.Vector3();
    for (const def of GUNS) {
      const inner = instance(def.id, null, (n, o) => byName[n] || tuneGun(o.material), { shadow: false, receive: false });
      inner.rotation.y = Math.PI; // Blender 中枪口朝 -Y（glTF +Z），转到 -Z
      const g = new THREE.Group(); g.add(inner);
      const by = (n) => inner.getObjectByName(n);
      const muz = by('muzzle'), ej = by('eject');
      // 枪口火焰
      const fl = new THREE.Group(); muz.add(fl);
      const add = (geo, tex, rx, ry) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.set(rx, ry, 0); fl.add(m); return m; };
      const front = add(new THREE.PlaneGeometry(0.22, 0.22), ftex, 0, 0); // 正对相机的星形
      add(new THREE.PlaneGeometry(0.34, 0.08).translate(0.17, 0, 0), stex, 0, Math.PI / 2);
      add(new THREE.PlaneGeometry(0.34, 0.08).translate(0.17, 0, 0), stex, Math.PI / 2, Math.PI / 2);
      fl.visible = false;
      const view = { def, g, inner, muz, ej, fl, front, mag: by('mag'), bolt: by('bolt'), carrier: by('carrier'), pump: by('pump') };
      // 抛壳 / 装填用弹壳模型（模型自带，隐藏作模板）
      const sm = by('shell_model'); if (sm) { sm.visible = false; view.shellTpl = sm; }
      const sl = by('shell_live'); if (sl) { sl.visible = false; view.liveTpl = sl; }
      for (const k of ['mag', 'bolt', 'carrier', 'pump']) if (view[k]) view[k + '0'] = view[k].position.clone();
      g.updateMatrixWorld(true);
      const gp = (n) => { const o = by(n); return o ? g.worldToLocal(o.getWorldPosition(tmp.set(0, 0, 0))).clone() : null; };
      view.anchor = { sight: gp('sight'), gripR: gp('gripR'), gripL: gp('gripL'), magGrip: gp('magGrip'), chGrip: gp('chGrip'), loadPort: gp('loadPort') };
      // 腰射：握把落在屏幕右下；开镜：瞄准线（红点镜中心 / 机匣顶→准星珠）与相机轴重合
      const rifle = def.id === 'rifle', S = view.anchor.sight;
      view.hip = rifle ? new THREE.Vector3(0.15, -0.205, -0.34) : new THREE.Vector3(0.15, -0.19, -0.33);
      view.aim = rifle ? new THREE.Vector3(-S.x, -S.y, -S.z - 0.18) : new THREE.Vector3(-S.x, -S.y - 0.011, -S.z - 0.14);
      if (rifle) {
        const lensMesh = by('dot_lens'); if (lensMesh) lensMesh.visible = false;
        const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3a20, transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        dot.scale.setScalar(0.0055); dot.position.z = -0.048; by('dot').add(dot);
        this._setupScope(view, by('dot'));
      }
      this._poseHands(view);
      // 霰弹逐发装填：左手持一枚弹
      if (view.liveTpl && view.hands && view.hands.handL) {
        const hs = view.liveTpl.clone(); hs.visible = false; hs.position.set(0, 0.012, 0.075); hs.rotation.set(Math.PI / 2, 0, 0);
        view.hands.handL.o.add(hs); view.handShell = hs;
      }
      this.views.push(view);
    }
    this.flashLight = new THREE.PointLight(0xffa050, 0, 6, 2);
    // 手雷（投掷动作中左手持握）
    this.grenadeMesh = instance('grenade', null, () => pbr('enemy', { color: 0x4c5a3a, wet: 0 }), { shadow: false });
    this.grenadeMesh.visible = false; this.grenadeMesh.scale.setScalar(1.0);
    this.holder = new THREE.Group();
    for (const v of this.views) this.holder.add(v.g);
    this.holder.add(this.flashLight, this.grenadeMesh);
    this.scene.add(this.holder);
    // 视角模型灯光：冷色天光为主、暖色只作弱轮廓（避免枪身偏亮偏粉）；注意枪层与世界一起进 HDR 后处理（曝光 ×1.45 + ACES），这里的强度按此折算
    this.scene.add(new THREE.HemisphereLight(0xb4bec8, 0x3a3530, 1.05));
    // 视角模型灯光挂在 holder 上：冷色主光 + 轮廓 + 近处补光，让枪身/手套细节可读，避免粉塑料
    const L = (col, int, pos, tgt) => { const l = new THREE.DirectionalLight(col, int); l.position.set(...pos); l.target.position.set(...tgt); this.holder.add(l, l.target); return l; };
    L(0xe4e8ee, 1.25, [-1.2, 1.9, 1.0], [0.15, -0.15, -0.55]);
    L(0x9aafc2, 0.85, [1.7, 0.8, -2.0], [0, -0.08, -0.4]);
    L(0xb8c0c6, 0.42, [0.2, -1.2, 0.8], [0, 0, -0.45]);
    const fill = new THREE.PointLight(0xc9d2da, 1.15, 2.4, 1.6);
    fill.position.set(0.12, 0.08, 0.15); this.holder.add(fill);
    this.gun = this.views[0].g;
  }
  _showGun() { if (!this.views) return; this.views.forEach((v, i) => (v.g.visible = i === this.cur)); this.gun = this.views[this.cur].g; }

  switchTo(i) {
    if (i === this.cur || i < 0 || i >= GUNS.length || this.switchT > 0) return false;
    this.next = i; this.switchT = 0.5; this.reloading = 0; return true;
  }
  canFire() { return this.reloading <= 0 && this.cool <= 0 && this.ammo > 0 && this.switchT <= 0 && this.meleeT <= 0 && this.throwT <= 0; }
  startReload() {
    const d = this.def;
    if (this.reloading > 0 || this.ammo >= d.mag || this.reserve <= 0 || this.switchT > 0) return false;
    this.reloadTotal = d.perShell ? 0.35 + d.reload * Math.min(d.mag - this.ammo, this.reserve) : d.reload;
    this.reloading = this.reloadTotal; this.shellT = d.perShell ? 0.35 + d.reload : 0; return true;
  }
  reloadProgress() { return this.reloading > 0 ? 1 - this.reloading / this.reloadTotal : 0; }
  tryFire() {
    const d = this.def;
    if (this.switchT > 0 || this.meleeT > 0 || this.throwT > 0) return null;
    if (d.perShell && this.reloading > 0 && this.ammo > 0) this.reloading = 0; // 霰弹枪可打断装填
    if (this.reloading > 0 || this.cool > 0) return null;
    if (this.ammo <= 0) { this.cool = 0.25; return 'empty'; }
    this.ammo--; this.shots++;
    this.cool = 60 / d.rpm;
    this.kick = Math.min(1.6, this.kick + d.kick);
    this.flash = d.id === 'shotgun' ? 0.06 : 0.04;
    this.squeeze = 1;
    if (d.id === 'shotgun') this.pumpT = 0.55; else this.cycleT = 0.06;
    this._eject(d.id === 'shotgun' ? 0.3 : 0);
    return 'fire';
  }
  melee() { if (this.meleeCool > 0 || this.switchT > 0 || this.throwT > 0) return false; this.meleeT = 0.45; this.meleeCool = MELEE.cool; this.reloading = 0; return true; }
  throwGrenade() { if (this.grenades <= 0 || this.throwT > 0 || this.switchT > 0) return false; this.grenades--; this.throwT = 0.6; this.reloading = 0; return true; }
  spread(moving, crouch) {
    const d = this.def; const base = this.ads > 0.6 ? d.adsSpread : d.hipSpread;
    return base * (1 + moving * 0.6) * (crouch ? 0.7 : 1) * (1 + Math.min(1, this.kick) * (d.pellets > 1 ? 0.1 : 0.5));
  }
  _eject(delay) {
    const v = this.views[this.cur];
    const go = () => {
      v.ej.updateWorldMatrix(true, false);
      const p = new THREE.Vector3().setFromMatrixPosition(v.ej.matrixWorld);
      const q = this.camera.quaternion;
      const vel = new THREE.Vector3(1.6 + Math.random() * 0.8, 1.4 + Math.random() * 0.6, 0.3 + Math.random() * 0.4).applyQuaternion(q);
      const m = v.shellTpl.clone(); m.visible = true;
      m.position.copy(p); m.quaternion.copy(q);
      this.scene.add(m);
      this.shells.push({ m, v: vel, w: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20), t: 0 });
      if (this.shells.length > 14) { const s = this.shells.shift(); this.scene.remove(s.m); }
    };
    if (delay) setTimeout(go, delay * 1000); else go();
  }
  update(dt, input, playerMove) {
    const d = this.def;
    if (this.cool > 0) this.cool -= dt;
    this.meleeCool -= dt;
    if (this.switchT > 0) {
      this.switchT -= dt;
      if (this.switchT <= 0.25 && this.next !== undefined && this.next !== this.cur) { this.cur = this.next; this._showGun(); }
      if (this.switchT <= 0) this.switchT = 0;
    }
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (d.perShell) {
        this.shellT -= dt;
        if (this.shellT <= 0 && this.ammo < d.mag && this.reserve > 0) { this.ammo++; this.reserve--; this.shellT = d.reload; this.onShell && this.onShell(); }
        if (this.ammo >= d.mag || this.reserve <= 0) this.reloading = 0;
      } else if (this.reloading <= 0) {
        const need = d.mag - this.ammo; const take = Math.min(need, this.reserve);
        this.ammo += take; this.reserve -= take;
      }
      if (this.reloading < 0) this.reloading = 0;
    }
    const busy = this.meleeT > 0 || this.throwT > 0 || this.switchT > 0;
    this.ads = damp(this.ads, input.adsHeld && this.reloading <= 0 && !busy ? 1 : 0, 10, dt);
    this.kick = damp(this.kick, 0, d.id === 'shotgun' ? 7 : 11, dt);
    if (this.kick < 0.001) this.kick = 0;
    this.flash -= dt;
    const v = this.views[this.cur];
    v.fl.visible = this.flash > 0;
    if (v.fl.visible) { v.front.rotation.z = Math.random() * 6; const s = (d.id === 'shotgun' ? 1.5 : 1) * (0.8 + Math.random() * 0.5); v.fl.scale.set(s, s, s * (0.8 + Math.random() * 0.6)); }
    v.muz.updateWorldMatrix(true, false);
    this.flashLight.position.setFromMatrixPosition(v.muz.matrixWorld).sub(this.holder.position).applyQuaternion(this.holder.quaternion.clone().invert());
    this.flashLight.intensity = this.flash > 0 ? 7 : 0;
    // 摆动与晃动
    this.bob += dt * playerMove.speed * 1.6;
    const adsE = this.ads * this.ads * (3 - 2 * this.ads);
    const bobA = Math.min(1, playerMove.speed / 5) * (1 - adsE * 0.85);
    const p = v.hip.clone().lerp(v.aim, adsE);
    p.x += Math.sin(this.bob) * 0.012 * bobA + this.sway.x;
    p.y += Math.abs(Math.cos(this.bob)) * 0.01 * bobA + this.sway.y;
    p.z += this.kick * (d.id === 'shotgun' ? 0.05 : 0.035);
    let rx = this.kick * (d.id === 'shotgun' ? 0.12 : 0.06), ry = (1 - adsE) * 0.11, rz = (1 - adsE) * -0.07;
    const A = v.anchor;
    const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const seg = (x, a, b) => ease((x - a) / (b - a));
    const lt = A.gripL.clone(); // 左手目标（g 空间）
    // 换弹动作：步枪 = 退匣 → 换新匣 → 拍入 → 拉机柄；霰弹 = 逐发从下方装填口压入
    const rp = this.reloadProgress();
    let magDy = 0, chZ = 0, magVis = true, handShell = false;
    if (this.reloading > 0 && !d.perShell) {
      const tilt = seg(rp, 0, 0.10) * (1 - seg(rp, 0.88, 1));
      rz += tilt * 0.55; rx += tilt * 0.18; ry -= tilt * 0.28;
      p.y += tilt * 0.05; p.z += tilt * 0.16; p.x -= tilt * 0.13;
      const mg = A.magGrip, ch = A.chGrip, pouch = mg.clone().add(new THREE.Vector3(0.02, -0.32, 0.12));
      if (rp < 0.1) lt.lerpVectors(A.gripL, mg, seg(rp, 0, 0.1));
      else if (rp < 0.3) { const k = (rp - 0.1) / 0.2; magDy = -k * k * 0.5; magVis = rp < 0.22; lt.lerpVectors(mg, pouch, ease(k)); }
      else if (rp < 0.5) { magDy = -0.3 * (1 - seg(rp, 0.3, 0.49)); lt.copy(mg).y += magDy; }
      else if (rp < 0.6) { magDy = rp < 0.53 ? 0.006 * Math.sin((rp - 0.5) / 0.03 * Math.PI) : 0; lt.copy(mg); lt.y -= 0.01 * Math.sin(seg(rp, 0.5, 0.6) * Math.PI); }
      else if (rp < 0.74) lt.lerpVectors(mg, ch, seg(rp, 0.6, 0.74));
      else if (rp < 0.9) { chZ = 0.065 * seg(rp, 0.76, 0.81) * (1 - seg(rp, 0.85, 0.875)); lt.copy(ch); lt.z += chZ; }
      else lt.lerpVectors(ch, A.gripL, seg(rp, 0.9, 1));
    } else if (this.reloading > 0 && d.perShell) {
      const tilt = seg(this.reloadTotal - this.reloading, 0, 0.3) * (1 - seg(0.25 - this.reloading, 0, 0.25));
      rz += tilt * 0.52; rx -= tilt * 0.1; ry -= tilt * 0.18; p.y -= tilt * 0.01; p.z += tilt * 0.12; p.x -= tilt * 0.08;
      const port = A.loadPort, pick = port.clone().add(new THREE.Vector3(0.05, -0.13, 0.12));
      const ph = Math.max(0, Math.min(1, 1 - this.shellT / d.reload));
      if (this.reloadTotal - this.reloading < 0.35) { lt.copy(pick); }
      else if (ph < 0.4) { lt.lerpVectors(pick, port.clone().add(new THREE.Vector3(0, -0.035, 0.03)), seg(ph, 0, 0.4)); handShell = true; }
      else if (ph < 0.85) { lt.copy(port).add(new THREE.Vector3(0, -0.035 + 0.02 * seg(ph, 0.4, 0.6), 0.03 - 0.07 * seg(ph, 0.5, 0.85))); handShell = ph < 0.8; }
      else lt.lerpVectors(port.clone().add(new THREE.Vector3(0, -0.015, -0.04)), pick, seg(ph, 0.85, 1));
    }
    if (v.mag) { v.mag.position.y = v.mag0.y + magDy; v.mag.visible = magVis; }
    if (v.bolt && v.bolt0) v.bolt.position.z = v.bolt0.z - chZ;
    // 枪机：每发后坐循环
    if (this.cycleT > 0) this.cycleT -= dt;
    if (v.carrier) v.carrier.position.z = v.carrier0.z - (this.cycleT > 0 ? Math.sin((0.06 - this.cycleT) / 0.06 * Math.PI) * 0.03 : 0);
    // 泵动：开火后 0.2s 后拉、0.3–0.4s 停在后位抛壳、0.5s 推回（与合成音效对齐）
    if (this.pumpT > 0) { this.pumpT -= dt; }
    let pumpK = 0;
    if (v.pump && this.pumpT > 0) { const t = 0.55 - this.pumpT; pumpK = seg(t, 0.2, 0.29) * (1 - seg(t, 0.4, 0.5)); }
    if (v.pump) { v.pump.position.z = v.pump0.z - pumpK * 0.085; lt.z += pumpK * 0.085; }
        if (v.handShell) v.handShell.visible = handShell;
    if (v.heldMag) {
      const showHeld = this.reloading > 0 && !d.perShell && rp >= 0.12 && rp < 0.5;
      v.heldMag.visible = showHeld;
      if (showHeld) {
        const hold = (v.lh || lt).clone().add(new THREE.Vector3(0.05, -0.08, 0.06));
        v.heldMag.position.copy(hold);
        v.heldMag.rotation.set(0.25, 0.15, 0.55);
      }
    }
    // 左手位置做阻尼，避免各段之间跳变
    if (!v.lh) v.lh = lt.clone();
    const handK = this.reloading > 0 ? 22 : 16;
    v.lh.x = damp(v.lh.x, lt.x, handK, dt); v.lh.y = damp(v.lh.y, lt.y, handK, dt); v.lh.z = damp(v.lh.z, lt.z, handK, dt);
    if (pumpK > 0) v.lh.z = Math.max(v.lh.z, lt.z - 0.004);
    // 切枪：下沉再抬起
    if (this.switchT > 0) { const raw = this.switchT > 0.25 ? (0.5 - this.switchT) / 0.25 : this.switchT / 0.25; const k = raw * raw * (3 - 2 * raw); p.y -= k * 0.3; rx -= k * 0.6; }
    // 近战：枪托横扫
    if (this.meleeT > 0) {
      this.meleeT -= dt; const k = Math.sin(Math.min(1, (0.45 - this.meleeT) / 0.45) * Math.PI);
      p.x -= k * 0.22; p.z -= k * 0.12; p.y += k * 0.03; ry += k * 0.9; rz += k * 0.5;
    }
    // 投掷手雷：枪下沉，左手甩出
    this.grenadeMesh.visible = false;
    if (this.throwT > 0) {
      this.throwT -= dt; const k = Math.sin(Math.min(1, (0.6 - this.throwT) / 0.6) * Math.PI);
      p.y -= k * 0.16; rx -= k * 0.3;
      const t = (0.6 - this.throwT) / 0.6;
      if (t < 0.55) { this.grenadeMesh.visible = true; this.grenadeMesh.position.set(-0.18 + t * 0.2, -0.16 + t * 0.25, -0.32 - t * 0.2); this.grenadeMesh.rotation.set(t * 3, 0, 0.3); }
    }
    this.squeeze = damp(this.squeeze, 0, 7.5, dt);
    if (this.squeeze < 0.002) this.squeeze = 0;
    this._applyHands(v, this.squeeze, v.lh);
    if (!v.gp) { v.gp = p.clone(); v.gr = new THREE.Vector3(rx, ry, rz); }
    v.gp.x = damp(v.gp.x, p.x, 18, dt); v.gp.y = damp(v.gp.y, p.y, 18, dt); v.gp.z = damp(v.gp.z, p.z, 18, dt);
    v.gr.x = damp(v.gr.x, rx, 18, dt); v.gr.y = damp(v.gr.y, ry, 18, dt); v.gr.z = damp(v.gr.z, rz, 18, dt);
    v.g.position.copy(v.gp);
    v.g.rotation.set(v.gr.x, v.gr.y, v.gr.z);
    this.sway.x = damp(this.sway.x, 0, 7, dt); this.sway.y = damp(this.sway.y, 0, 7, dt);
    this.holder.position.copy(this.camera.position);
    this.holder.quaternion.copy(this.camera.quaternion);
    // 弹壳
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i]; s.t += dt;
      s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.w.x * dt; s.m.rotation.y += s.w.y * dt; s.m.rotation.z += s.w.z * dt;
      if (s.t > 0.7) { this.scene.remove(s.m); this.shells.splice(i, 1); }
    }
  }
  addSway(dx, dy) { this.sway.x = Math.max(-0.03, Math.min(0.03, this.sway.x - dx * 0.00012)); this.sway.y = Math.max(-0.03, Math.min(0.03, this.sway.y + dy * 0.00012)); }
  muzzleWorld() { const v = this.views[this.cur]; v.muz.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(v.muz.matrixWorld); }

  _axes(obj, x, y) {
    const X = new THREE.Vector3().copy(x).normalize();
    const Y = new THREE.Vector3().copy(y).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
    Y.crossVectors(Z, X).normalize();
    const m = new THREE.Matrix4(); m.makeBasis(X, Y, Z);
    obj.quaternion.setFromRotationMatrix(m);
  }
  /** 几何约定（glTF yup）：-Z 为指尖方向，+Y 为手背，+Z 为肘侧；再单独转腕。 */
  _axesFromFinger(obj, finger, dorsal) {
    const Z = new THREE.Vector3().copy(finger).multiplyScalar(-1).normalize();
    const Y = new THREE.Vector3().copy(dorsal).normalize();
    const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
    Y.crossVectors(Z, X).normalize();
    const m = new THREE.Matrix4(); m.makeBasis(X, Y, Z);
    obj.quaternion.setFromRotationMatrix(m);
  }

  _poseHands(view) {
    const g = view.g, inner = view.inner;
    inner.updateWorldMatrix(true, true);
    const hr = inner.getObjectByName('handR');
    const hl = inner.getObjectByName('handL');
    if (hr) g.attach(hr);
    if (hl) g.attach(hl);
    const C = HAND_CFG[view.def.id];
    const V = (a) => new THREE.Vector3(...a);
    const fixCurl = (root) => root && root.traverse((o) => {
      // 建模时屈伸绕 +X 朝向了手背，这里翻成向掌心握紧
      if (/^(f[RL]\d(b|bb)?|th[RL]b?)$/.test(o.name)) o.rotation.x = -o.rotation.x;
    });
    // 袖管 / 前臂收细，袖口不再显得臃肿
    const slim = (root, side) => {
      for (const [n, k] of [['sleeve', 0.40], ['cuff', 0.40], ['muscle', 0.52], ['flexor', 0.52], ['wrist', 0.58]]) {
        const o = root.getObjectByName(n + side);
        if (o) o.scale.set(k, 1, k);
      }
    };
    const pose = (root, side, c, anchor) => {
      fixCurl(root);
      // 手模型左右几何是对调的（拇指在外侧），镜像 X 让拇指回到正确一侧
      root.scale.set(-1, 1, 1);
      root.position.copy(anchor).add(V(c.off));
      this._axesFromFinger(root, V(c.finger), V(c.dorsal));
      // 前臂朝向（g 空间方向 → 手局部），腕部自然折角
      const arm = root.getObjectByName('arm' + side);
      if (arm) {
        arm.position.z = c.wrist ?? 0.036; // 腕关节前移，弯腕时手掌与前臂不脱节
        const dir = V(c.arm).normalize().applyQuaternion(root.quaternion.clone().invert());
        dir.x = -dir.x; // 抵消镜像
        arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      }
      // 手指逐节扣紧（c.curl[i] = [近节, 中节, 远节] 追加屈曲）
      for (let i = 0; i < 4; i++) {
        const cu = c.curl[i];
        ['', 'b', 'bb'].forEach((sfx, j) => { const o = root.getObjectByName(`f${side}${i}${sfx}`); if (o) { if (c.spread) o.rotation.y = 0; o.rotation.x -= cu[j]; } });
      }
      const th = root.getObjectByName('th' + side), thb = root.getObjectByName('th' + side + 'b');
      if (th && c.thumb) { th.rotation.x -= c.thumb[0]; th.rotation.y += (side === 'R' ? 1 : -1) * c.thumb[1]; }
      if (thb && c.thumb) thb.rotation.x -= c.thumb[2];
      slim(root, side);
    };
    if (hr) { view.offR = V(C.R.off); pose(hr, 'R', C.R, view.anchor.gripR); }
    if (hl) { view.offL = V(C.L.off); pose(hl, 'L', C.L, view.anchor.gripL); }
    view.hands = this._bindHands(hr, hl);
    if (view.mag && hl) {
      const hm = view.mag.clone();
      hm.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      hm.visible = false;
      view.g.add(hm);
      view.heldMag = hm;
    }
  }

  _bindHands(hr, hl) {
    const names = [];
    for (const side of ['R', 'L']) {
      names.push('hand' + side, 'palm' + side, 'arm' + side, 'th' + side, 'th' + side + 'b');
      for (let i = 0; i < 4; i++) names.push(`f${side}${i}`, `f${side}${i}b`, `f${side}${i}bb`);
    }
    const roots = { R: hr, L: hl };
    const nodes = {};
    for (const n of names) {
      const side = n.includes('L') || n.startsWith('fL') || n.startsWith('thL') || n.startsWith('palmL') || n.startsWith('armL') || n === 'handL' ? 'L' : 'R';
      const root = roots[side];
      const o = n === 'hand' + side ? root : (root && root.getObjectByName(n));
      if (o) nodes[n] = { o, rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z, px: o.position.x, py: o.position.y, pz: o.position.z, sx: o.scale.x, sy: o.scale.y, sz: o.scale.z };
    }
    return nodes;
  }

  _applyHands(view, squeeze, lh) {
    const H = view.hands; if (!H) return;
    const set = (n, dx = 0, dy = 0, dz = 0) => { const h = H[n]; if (h) h.o.rotation.set(h.rx + dx, h.ry + dy, h.rz + dz); };
    const k = squeeze;
    for (const side of ['R', 'L']) {
      for (let i = 0; i < 4; i++) {
        const a = (i === 0 ? 0.16 : 0.26) * k;
        set(`f${side}${i}`, -a * 0.5);
        set(`f${side}${i}b`, -a * 0.6);
        set(`f${side}${i}bb`, -a * 0.4);
      }
      set('th' + side, -0.08 * k, 0, 0);
      set('th' + side + 'b', -0.1 * k);
      const arm = H['arm' + side];
      if (arm) arm.o.scale.set(arm.sx * (1 + 0.11 * k), arm.sy * (1 + 0.03 * k), arm.sz * (1 + 0.1 * k));
      const palm = H['palm' + side];
      if (palm) palm.o.scale.set(palm.sx * (1 + 0.035 * k), palm.sy * (1 + 0.02 * k), palm.sz * (1 + 0.055 * k));
    }
    const hL = H.handL;
    if (hL && lh) hL.o.position.copy(lh).add(view.offL);
  }

  _setupScope(view, dot) {
    if (!dot) return;
    if (!this.scopeRT) {
      this.scopeRT = new THREE.WebGLRenderTarget(640, 640, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType });
      this.scopeCam = new THREE.PerspectiveCamera(52, 1, 0.25, 1200);
    }
    const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
    const FRAG = `
      uniform sampler2D tScope; uniform float uFade; varying vec2 vUv;
      float sdRound(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }
      void main() {
        vec2 p = vUv - 0.5;
        float d = sdRound(p, vec2(0.495, 0.495), 0.07);
        if (d > 0.0) discard;
        vec3 scene = texture2D(tScope, vUv).rgb * 1.7;
        scene = max(scene, vec3(0.0));
        vec3 col = mix(vec3(0.55, 0.66, 0.68), scene, 0.98);
        col = mix(col * 0.97, col, uFade);
        vec2 q = vec2(p.x * 1.30, p.y);
        float r = length(q);
        float ring = smoothstep(0.018, 0.006, abs(r - 0.13));
        float core = smoothstep(0.02, 0.0, r);
        vec3 ret = vec3(1.0, 0.18, 0.08);
        float glow = (ring * 1.15 + core * 1.35) * mix(0.2, 1.0, uFade);
        col += ret * glow;
        // 玻璃近乎通透，只留一圈微弱边缘
        float edge = 1.0 - smoothstep(-0.02, 0.0, d);
        float a = mix(0.55, 0.82, uFade) * edge;
        gl_FragColor = vec4(col, a);
      }`;
    const unis = { tScope: { value: this.scopeRT.texture }, uFade: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: unis, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.027), mat);
    disc.position.set(0, 0, 0.008); disc.rotation.y = Math.PI; disc.renderOrder = 3;
    dot.add(disc);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.026), new THREE.MeshStandardMaterial({
      color: 0x8aa8b0, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.5
    }));
    glass.position.set(0, 0, 0.001); glass.rotation.y = Math.PI; glass.renderOrder = 2;
    dot.add(glass);
    // 藏起模型自带的暗色镜片，只留我们的通透窗
    const hideRoot = dot.parent || dot;
    hideRoot.traverse((o) => {
      if (o.isMesh && o !== disc && o !== glass && /lens|glass|window|optic|reticle/i.test(o.name)) o.visible = false;
    });
    view.scopeDisc = disc; view.scopeFade = unis.uFade;
  }

  renderScope(renderer, worldScene, camera) {
    const v = this.views && this.views[this.cur];
    if (!v || !this.scopeRT) return;
    const ads = this.ads;
    const fade = Math.max(0, Math.min(1, (ads - 0.15) / 0.55));
    if (v.scopeFade) v.scopeFade.value = fade;
    if (v.scopeDisc) v.scopeDisc.visible = true;
    if (ads < 0.12) return;
    this.scopeCam.position.copy(camera.position);
    this.scopeCam.quaternion.copy(camera.quaternion);
    this.scopeCam.fov = camera.fov / 1.4;
    this.scopeCam.aspect = 0.033 / 0.025;
    this.scopeCam.far = camera.far;
    this.scopeCam.updateProjectionMatrix();
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.scopeRT);
    renderer.clear();
    renderer.render(worldScene, this.scopeCam);
    renderer.setRenderTarget(prev);
  }
}
