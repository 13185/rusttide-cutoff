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

export class Weapon {
  constructor(camera, glowTex) {
    this.camera = camera;
    this.scene = new THREE.Scene();
    this.ads = 0; this.kick = 0; this.squeeze = 0; this.sway = new THREE.Vector2(); this.bob = 0; this.flash = 0;
    this.switchT = 0; this.meleeT = 0; this.throwT = 0; this.pumpT = 0;
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
    // 磷化钢：低反射、偏粗糙；边角磨出亮钢
    const gm = pbr('gunmetal', { color: 0x7a7c80, metal: 0.6, rough: 1.25, env: 0.45, wear: 0.4, wearColor: 0x6c6f74, wet: 0 });
    const dark = pbr('gunmetal', { color: 0x6a6a6a, metal: 0.55, rough: 1.4, env: 0.45, wear: 0.3, wearColor: 0x55585c, wet: 0 });
    const poly = pbr('polymer', { color: 0x2a2b28, metal: 0, env: 0.5, wear: 0.2, wearColor: 0x45453f, wet: 0 });
    const fde = pbr('polymer', { color: 0x6e5d45, metal: 0, env: 0.45, wear: 0.25, wearColor: 0x857559, wet: 0 });
    const glove = pbr('polymer', { color: 0x232524, metal: 0, rough: 1.3, env: 0.4, wear: 0, wet: 0, normal: 1.6 });
    const sleeve = pbr('polymer', { color: 0x3d4a38, metal: 0, rough: 1.2, env: 0.4, wear: 0.15, wearColor: 0x5a6550, wet: 0.2, normal: 1.4 });
    const skin = pbr('polymer', { color: 0xa07862, metal: 0, rough: 0.85, env: 0.5, wear: 0.1, wearColor: 0x7a5648, wet: 0.35, normal: 0.65 });
    const knuckle = pbr('polymer', { color: 0x86584c, metal: 0, rough: 0.95, env: 0.3, wear: 0, wet: 0.3, normal: 0.5 });
    const nail = new THREE.MeshStandardMaterial({ color: 0x6a4a42, roughness: 0.5, metalness: 0 });
    const lens = new THREE.MeshStandardMaterial({ color: 0x6a8a94, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.9 });
    const wood = pbr('polymer', { color: 0x6a4024, metal: 0, rough: 0.8, wear: 0.5, wearColor: 0x9a6a40, wet: 0 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.3, metalness: 1 });
    const red = new THREE.MeshStandardMaterial({ color: 0x8a1a10, roughness: 0.5 });
    const byName = { M_gun_metal: gm, M_gun_dark: dark, M_gun_poly: poly, M_gun_fde: fde, M_glove: skin, M_sleeve: sleeve, M_skin: skin, M_knuckle: knuckle, M_nail: nail, M_lens: lens, M_gun_wood: wood, M_brass: brass, M_shell_red: red };
    this.brass = brass; this.red = red;
    this.views = [];
    const ftex = flashTexture(), stex = sideFlashTexture();
    for (const def of GUNS) {
      const inner = instance(def.id, null, (n) => byName[n], { shadow: false, receive: false });
      inner.rotation.y = Math.PI; // Blender 模型枪口朝 +Z，转到 -Z
      const g = new THREE.Group(); g.add(inner); g.scale.setScalar(0.95);
      const by = (n) => inner.getObjectByName(n);
      const muz = by('muzzle'), ej = by('eject');
      // 枪口火焰
      const fl = new THREE.Group(); muz.add(fl);
      const add = (geo, tex, rx, ry) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.set(rx, ry, 0); fl.add(m); return m; };
      const front = add(new THREE.PlaneGeometry(0.22, 0.22), ftex, 0, 0); // 正对相机的星形
      const s1 = add(new THREE.PlaneGeometry(0.34, 0.08).translate(0.17, 0, 0), stex, 0, Math.PI / 2);
      const s2 = add(new THREE.PlaneGeometry(0.34, 0.08).translate(0.17, 0, 0), stex, Math.PI / 2, Math.PI / 2);
      fl.visible = false;
      const view = { def, g, inner, muz, ej, fl, front, mag: by('mag'), bolt: by('bolt'), pump: by('pump') };
      if (view.mag) view.magY = view.mag.position.y;
      if (view.pump) view.pumpZ = view.pump.position.z;
      if (def.id === 'rifle') {
        const lensMesh = by('dot_lens'); if (lensMesh) lensMesh.visible = false;
        const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3a20, transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        dot.scale.setScalar(0.0055); dot.position.z = -0.048; by('dot').add(dot);
        this._setupScope(view, by('dot'));
      }
      this._poseHands(view);
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
    // 抛壳：世界坐标，渲染在枪层
    this.shellGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.03, 8); this.shellGeo.rotateZ(Math.PI / 2);
    this.shotShellGeo = new THREE.CylinderGeometry(0.0095, 0.0095, 0.06, 10); this.shotShellGeo.rotateZ(Math.PI / 2);
    // 视角模型灯光
    this.scene.add(new THREE.HemisphereLight(0x9aa6b6, 0x3a322a, 1.0));
    // 视角模型灯光挂在 holder 上，随镜头转动保持稳定的造型光（主光左上后方、轮廓光右前、补光下方）
    const L = (col, int, pos, tgt) => { const l = new THREE.DirectionalLight(col, int); l.position.set(...pos); l.target.position.set(...tgt); this.holder.add(l, l.target); return l; };
    L(0xffe2c4, 1.7, [-1.4, 1.8, 0.8], [0.2, -0.2, -0.6]);
    L(0x9ab0c8, 1.4, [1.6, 0.9, -2.2], [0, -0.1, -0.4]);
    L(0xb0bccc, 0.35, [0.5, -1.5, 0.5], [0, 0, -0.5]);
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
    if (d.id === 'shotgun') this.pumpT = 0.55;
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
      const m = new THREE.Mesh(this.def.id === 'shotgun' ? this.shotShellGeo : this.shellGeo, this.def.id === 'shotgun' ? this.red : this.brass);
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
    this.ads = damp(this.ads, input.adsHeld && this.reloading <= 0 && !busy ? 1 : 0, 14, dt);
    this.kick = damp(this.kick, 0, d.id === 'shotgun' ? 6 : 9, dt);
    this.flash -= dt;
    const v = this.views[this.cur];
    v.fl.visible = this.flash > 0;
    if (v.fl.visible) { v.front.rotation.z = Math.random() * 6; const s = (d.id === 'shotgun' ? 1.5 : 1) * (0.8 + Math.random() * 0.5); v.fl.scale.set(s, s, s * (0.8 + Math.random() * 0.6)); }
    v.muz.updateWorldMatrix(true, false);
    this.flashLight.position.setFromMatrixPosition(v.muz.matrixWorld).sub(this.holder.position).applyQuaternion(this.holder.quaternion.clone().invert());
    this.flashLight.intensity = this.flash > 0 ? 7 : 0;
    // 摆动与晃动
    this.bob += dt * playerMove.speed * 1.6;
    const bobA = Math.min(1, playerMove.speed / 5) * (1 - this.ads * 0.85);
    const hip = d.id === 'shotgun' ? new THREE.Vector3(0.2, -0.2, -0.46) : new THREE.Vector3(0.2, -0.215, -0.5);
    const aim = d.id === 'shotgun' ? new THREE.Vector3(0, -0.047, -0.36) : new THREE.Vector3(0, -0.1065, -0.32);
    const p = hip.lerp(aim, this.ads);
    p.x += Math.sin(this.bob) * 0.012 * bobA + this.sway.x;
    p.y += Math.abs(Math.cos(this.bob)) * 0.01 * bobA + this.sway.y;
    p.z += this.kick * (d.id === 'shotgun' ? 0.05 : 0.035);
    let rx = this.kick * (d.id === 'shotgun' ? 0.12 : 0.06), ry = (1 - this.ads) * 0.11, rz = (1 - this.ads) * -0.07;
    // 换弹动作
    const rp = this.reloadProgress();
    let magDrop = 0;
    if (this.reloading > 0) {
      if (d.perShell) { rz += 0.35; rx -= 0.05; p.y -= 0.03; ry -= 0.1; }
      else { const rot = Math.sin(rp * Math.PI) * 0.6; rx += rot * 0.3; rz += rot * 0.5; magDrop = rp < 0.5 ? Math.min(1, rp * 4) : Math.max(0, 1 - (rp - 0.5) * 3.5); p.y -= Math.sin(rp * Math.PI) * 0.05; }
    }
    if (v.mag) v.mag.position.y = v.magY - magDrop * 0.25;
    // 泵动
    if (this.pumpT > 0) { this.pumpT -= dt; }
    if (v.pump) { const k = this.pumpT > 0 && this.pumpT < 0.4 ? Math.sin((0.4 - this.pumpT) / 0.4 * Math.PI) : 0; v.pump.position.z = v.pumpZ + k * 0.09; }
    // 切枪：下沉再抬起
    if (this.switchT > 0) { const k = this.switchT > 0.25 ? (0.5 - this.switchT) / 0.25 : this.switchT / 0.25; p.y -= k * 0.3; rx -= k * 0.6; }
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
    this.squeeze = damp(this.squeeze, 0, 6.5, dt);
    const pumpK = v.pump && this.pumpT > 0 && this.pumpT < 0.4 ? Math.sin((0.4 - this.pumpT) / 0.4 * Math.PI) : 0;
    this._applyHands(v, this.squeeze, this.reloading > 0 ? this.reloadProgress() : 0, pumpK);
    v.g.position.copy(p);
    v.g.rotation.set(rx, ry, rz);
    this.sway.x = damp(this.sway.x, 0, 6, dt); this.sway.y = damp(this.sway.y, 0, 6, dt);
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
    const rifle = view.def.id === 'rifle';
    const fixCurl = (root) => root && root.traverse((o) => {
      // 建模时屈伸绕 +X 朝向了手背，这里翻成向掌心握紧
      if (/^(f[RL]\d(b|bb)?|th[RL]b?)$/.test(o.name)) o.rotation.x = -o.rotation.x;
    });
    fixCurl(hr); fixCurl(hl);
    const slim = (root, side) => {
      for (const n of ['sleeve','muscle','flexor','cuff','wrist']) {
        const o = root.getObjectByName(n + side);
        if (o) o.scale.set(0.62, 1, 0.62);
      }
    };
    if (hr) {
      // 右手：手背朝右露出指节，掌心贴握把右侧，手指向下扣把
      hr.position.set(0.068, rifle ? -0.116 : -0.108, rifle ? 0.110 : 0.100);
      this._axesFromFinger(hr, new THREE.Vector3(0.3, -1, 0.12), new THREE.Vector3(0.85, 0.2, 0.45));
      const arm = hr.getObjectByName('armR');
      if (arm) arm.rotation.x = -0.95;
      slim(hr, 'R');
    }
    if (hl) {
      // 左手贴紧护木，手背朝左上，手指从下方包住
      hl.position.set(-0.010, rifle ? -0.032 : -0.038, rifle ? -0.362 : -0.296);
      this._axesFromFinger(hl, new THREE.Vector3(0.7, -0.7, 0.1), new THREE.Vector3(-0.65, 0.5, 0.45));
      const arm = hl.getObjectByName('armL');
      if (arm) arm.rotation.x = -0.85;
      slim(hl, 'L');
    }
    view.hands = this._bindHands(hr, hl);
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

  _applyHands(view, squeeze, rp, pumpK) {
    const H = view.hands; if (!H) return;
    const set = (n, dx = 0, dy = 0, dz = 0) => { const h = H[n]; if (h) h.o.rotation.set(h.rx + dx, h.ry + dy, h.rz + dz); };
    const k = squeeze;
    for (const side of ['R', 'L']) {
      for (let i = 0; i < 4; i++) {
        const a = (i === 0 ? 0.16 : 0.26) * k;
        set(`f${side}${i}`, a * 0.7);
        set(`f${side}${i}b`, a);
        set(`f${side}${i}bb`, a * 0.8);
      }
      set('th' + side, 0.12 * k, 0.05 * k, 0);
      set('th' + side + 'b', 0.16 * k);
      const arm = H['arm' + side];
      if (arm) arm.o.scale.set(arm.sx * (1 + 0.11 * k), arm.sy * (1 + 0.03 * k), arm.sz * (1 + 0.1 * k));
      const palm = H['palm' + side];
      if (palm) palm.o.scale.set(palm.sx * (1 + 0.035 * k), palm.sy * (1 + 0.02 * k), palm.sz * (1 + 0.055 * k));
    }
    const hL = H.handL;
    if (hL) {
      let ox = 0, oy = 0, oz = 0;
      if (rp > 0 && view.def.id === 'rifle') {
        const t = Math.sin(rp * Math.PI);
        oy -= t * 0.07; oz += t * 0.12; ox += t * 0.02;
      }
      if (rp > 0 && view.def.id === 'shotgun') {
        const t = Math.sin(rp * Math.PI);
        oy -= t * 0.03; oz += t * 0.06;
      }
      if (pumpK > 0) oz -= pumpK * 0.09;
      hL.o.position.set(hL.px + ox, hL.py + oy, hL.pz + oz);
    }
  }

  _setupScope(view, dot) {
    if (!dot) return;
    if (!this.scopeRT) {
      this.scopeRT = new THREE.WebGLRenderTarget(448, 448, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType });
      this.scopeCam = new THREE.PerspectiveCamera(22, 1, 0.25, 1200);
    }
    const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
    const FRAG = `
      uniform sampler2D tScope; uniform float uFade; varying vec2 vUv;
      void main() {
        vec2 c = vUv - 0.5; float r = length(c);
        if (r > 0.5) discard;
        vec3 col = texture2D(tScope, vUv).rgb;
        float vig = smoothstep(0.5, 0.28, r);
        col *= vec3(0.88, 1.0, 0.90) * mix(0.5, 1.06, vig);
        gl_FragColor = vec4(col, uFade);
      }`;
    const unis = { tScope: { value: this.scopeRT.texture }, uFade: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: unis, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: true, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.0205, 32), mat);
    // glTF 中 +Z 为枪口；parent 已绕 Y 转 π，再把片子转过来正对相机，放在前方镜片处，形成“从镜筒里看放大画面”
    disc.position.set(0, 0, 0.054); disc.rotation.y = Math.PI;
    dot.add(disc);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.0212, 32), new THREE.MeshStandardMaterial({
      color: 0x7a9aaa, roughness: 0.06, metalness: 0.12, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 0.8
    }));
    glass.position.set(0, 0, 0.050); glass.rotation.y = Math.PI;
    dot.add(glass);
    view.scopeDisc = disc; view.scopeFade = unis.uFade;
  }

  renderScope(renderer, worldScene, camera) {
    const v = this.views && this.views[this.cur];
    if (!v || !this.scopeRT) return;
    const ads = this.ads;
    if (v.scopeFade) v.scopeFade.value = Math.max(0, Math.min(1, (ads - 0.22) / 0.55));
    if (v.scopeDisc) v.scopeDisc.visible = ads > 0.2;
    if (ads < 0.2) return;
    this.scopeCam.position.copy(camera.position);
    this.scopeCam.quaternion.copy(camera.quaternion);
    this.scopeCam.fov = 22;
    this.scopeCam.far = camera.far;
    this.scopeCam.updateProjectionMatrix();
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.scopeRT);
    renderer.clear();
    renderer.render(worldScene, this.scopeCam);
    renderer.setRenderTarget(prev);
  }
}
