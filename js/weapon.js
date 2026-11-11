// 港务突击步枪「潮汐-7」：逻辑 + 第一人称模型（程序化建模，原创）
import * as THREE from '../vendor/three/three.module.js';
import { damp } from './util.js';
import { noiseTexture } from './textures.js';

export const RIFLE = { name: '潮汐-7 突击步枪', mag: 30, reserve: 150, rpm: 640, dmg: 26, reload: 2.15, hipSpread: 0.022, adsSpread: 0.0035, range: 220 };

export class Weapon {
  constructor(camera, glowTex) {
    this.camera = camera;
    this.scene = new THREE.Scene();
    this.reset();
    this.ads = 0; this.kick = 0; this.sway = new THREE.Vector2(); this.bob = 0;
    this.flash = 0;
    this._build(glowTex);
  }
  reset() { this.ammo = RIFLE.mag; this.reserve = RIFLE.reserve; this.reloading = 0; this.cool = 0; this.shots = 0; }

  _build(glowTex) {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x575c61, roughness: 0.32, metalness: 0.75, map: noiseTexture('#5a5f64', 501, false, 128) });
    const dark = new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.45, metalness: 0.6 });
    const poly = new THREE.MeshStandardMaterial({ color: 0x34352f, roughness: 0.62, metalness: 0.15 });
    const tan = new THREE.MeshStandardMaterial({ color: 0x7c6d52, roughness: 0.7, metalness: 0.1 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.85 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x3b4238, roughness: 0.92 });
    const lens = new THREE.MeshStandardMaterial({ color: 0x0c1a1e, roughness: 0.05, metalness: 1, emissive: 0x401006, emissiveIntensity: 0.5 });
    // 侧面轮廓挤出：shape 的 x 对应枪身前后（负为枪口方向），y 为上下
    const prof = (pts, width, mat, bevel = 0.004) => {
      const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
      geo.translate(0, 0, -width / 2); geo.rotateY(-Math.PI / 2);
      const m = new THREE.Mesh(geo, mat); g.add(m); return m;
    };
    const B = (w, h, d, m, x, y, z, p = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; };
    const C = (r, l, m, x, y, z, p = g, seg = 14) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); p.add(o); return o; };
    // 上机匣（带抛壳窗凹槽）
    prof([[-0.2, 0.0], [0.14, 0.0], [0.15, 0.03], [0.13, 0.05], [-0.2, 0.05]], 0.056, metal);
    B(0.058, 0.018, 0.07, dark, 0, 0.022, 0.02);
    // 下机匣 + 弹匣井 + 扳机护圈
    prof([[-0.17, -0.002], [0.12, -0.002], [0.12, -0.045], [0.02, -0.05], [-0.03, -0.06], [-0.1, -0.06], [-0.13, -0.035], [-0.17, -0.03]], 0.05, metal);
    prof([[-0.02, -0.05], [0.04, -0.05], [0.045, -0.075], [-0.02, -0.075]], 0.012, dark, 0.002);
    // 握把（后倾）
    prof([[0.04, -0.045], [0.085, -0.045], [0.125, -0.17], [0.11, -0.185], [0.075, -0.18], [0.05, -0.06]], 0.042, poly, 0.006);
    // 伸缩枪托
    C(0.014, 0.16, dark, 0, 0.018, 0.22);
    prof([[0.2, 0.05], [0.42, 0.06], [0.44, 0.04], [0.44, -0.1], [0.4, -0.11], [0.36, -0.04], [0.26, -0.01], [0.2, 0.0]], 0.05, tan, 0.007);
    B(0.056, 0.15, 0.02, poly, 0, -0.025, 0.445);
    // 护木（八角）+ 散热槽
    const hg = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.4, 8), tan); hg.rotation.set(Math.PI / 2, 0, Math.PI / 8); hg.position.set(0, 0.022, -0.4); g.add(hg);
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) B(0.006, 0.012, 0.045, dark, sx * 0.036, 0.022, -0.28 - i * 0.065);
    // 皮卡汀尼导轨（顶部连续）
    B(0.026, 0.008, 0.72, dark, 0, 0.058, -0.17);
    for (let i = 0; i < 26; i++) B(0.03, 0.006, 0.012, dark, 0, 0.064, 0.17 - i * 0.026);
    // 枪管 + 制退器
    C(0.011, 0.32, dark, 0, 0.022, -0.74);
    C(0.019, 0.1, dark, 0, 0.022, -0.92, g, 10);
    for (let i = 0; i < 3; i++) B(0.042, 0.006, 0.012, metal, 0, 0.022, -0.89 - i * 0.025);
    // 前握把
    C(0.017, 0.08, poly, 0, -0.03, -0.38, g, 10).rotation.x = 0;
    // 管式红点镜
    const sight = new THREE.Group(); sight.position.set(0, 0.105, -0.03); g.add(sight);
    C(0.026, 0.11, metal, 0, 0, 0, sight, 18);
    C(0.029, 0.02, dark, 0, 0, -0.055, sight, 18); C(0.029, 0.02, dark, 0, 0, 0.055, sight, 18);
    B(0.024, 0.03, 0.06, dark, 0, -0.032, 0, sight);
    B(0.014, 0.018, 0.02, metal, 0.03, 0.002, 0.005, sight);
    const ln = C(0.022, 0.002, lens, 0, 0, -0.05, sight, 18);
    const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3a20, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
    dot.scale.setScalar(0.006); dot.position.set(0, 0.0, 0.03); sight.add(dot);
    this.sight = sight;
    // 弹匣（弧形，分段）
    const mag = new THREE.Group(); mag.position.set(0, -0.06, -0.075); g.add(mag);
    for (let i = 0; i < 5; i++) { const sgm = B(0.036, 0.04, 0.07, poly, 0, -i * 0.036, -i * 0.009, mag); sgm.rotation.x = i * 0.07; }
    B(0.04, 0.012, 0.08, dark, 0, -0.18, -0.045, mag);
    this.mag = mag;
    // 手与袖子
    const cap = (r, l, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), m);
    const rh = cap(0.034, 0.05, glove); rh.position.set(0.012, -0.105, 0.09); rh.rotation.x = -0.35; g.add(rh);
    const rf = cap(0.012, 0.035, glove); rf.position.set(-0.03, -0.065, 0.06); rf.rotation.set(0, 0, 1.5); g.add(rf);
    
    const lhand = cap(0.034, 0.06, glove); lhand.position.set(-0.012, -0.05, -0.39); lhand.rotation.set(0.1, 0, 0.35); g.add(lhand);
        const limb = (a, b, r, m) => { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b); const d = Bv.clone().sub(A); const L = d.length(); const o = cap(r, L, m); o.position.copy(A).add(Bv).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(o); return o; };
    limb([0.02, -0.12, 0.11], [0.16, -0.36, 0.42], 0.045, sleeve);
    limb([-0.02, -0.07, -0.37], [-0.24, -0.34, -0.06], 0.045, sleeve);

    this.muzzleLocal = new THREE.Vector3(0, 0.005, -1.0);
    // 枪口火焰
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb060, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    fl.position.copy(this.muzzleLocal); fl.scale.setScalar(0.28); fl.visible = false; g.add(fl);
    this.flashSprite = fl;
    this.flashLight = new THREE.PointLight(0xffa050, 0, 6, 2); this.flashLight.position.set(0, 0, -1.0); g.add(this.flashLight);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
    g.scale.setScalar(0.95);
    this.gun = g;
    this.holder = new THREE.Group(); this.holder.add(g);
    this.scene.add(this.holder);
    // 视角模型灯光
    this.scene.add(new THREE.HemisphereLight(0x9aa6b6, 0x3a322a, 1.8));
    const key = new THREE.DirectionalLight(0xffe0c0, 1.6); key.position.set(1.5, 1.2, -3); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ab0c8, 1.4); rim.position.set(2, 2, 2); this.scene.add(rim);
  }

  canFire() { return this.reloading <= 0 && this.cool <= 0 && this.ammo > 0; }
  startReload() {
    if (this.reloading > 0 || this.ammo >= RIFLE.mag || this.reserve <= 0) return false;
    this.reloading = RIFLE.reload; return true;
  }
  reloadProgress() { return this.reloading > 0 ? 1 - this.reloading / RIFLE.reload : 0; }
  tryFire() {
    if (this.reloading > 0 || this.cool > 0) return null;
    if (this.ammo <= 0) { this.cool = 0.25; return 'empty'; }
    this.ammo--; this.shots++;
    this.cool = 60 / RIFLE.rpm;
    this.kick = Math.min(1.4, this.kick + 0.45);
    this.flash = 0.05;
    return 'fire';
  }
  spread(moving, crouch) {
    const base = this.ads > 0.6 ? RIFLE.adsSpread : RIFLE.hipSpread;
    return base * (1 + moving * 0.6) * (crouch ? 0.7 : 1) * (1 + this.kick * 0.5);
  }
  update(dt, input, playerMove) {
    if (this.cool > 0) this.cool -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const need = RIFLE.mag - this.ammo; const take = Math.min(need, this.reserve);
        this.ammo += take; this.reserve -= take; this.reloading = 0;
      }
    }
    this.ads = damp(this.ads, input.adsHeld && this.reloading <= 0 ? 1 : 0, 14, dt);
    this.kick = damp(this.kick, 0, 9, dt);
    this.flash -= dt;
    this.flashSprite.visible = this.flash > 0;
    this.flashSprite.material.rotation = Math.random() * 6;
    this.flashSprite.scale.setScalar(0.22 + Math.random() * 0.14);
    this.flashLight.intensity = this.flash > 0 ? 6 : 0;
    // 摆动与晃动
    this.bob += dt * playerMove.speed * 1.6;
    const bobA = Math.min(1, playerMove.speed / 5) * (1 - this.ads * 0.85);
    const hip = new THREE.Vector3(0.2, -0.215, -0.5), aim = new THREE.Vector3(0, -0.1, -0.32);
    const p = hip.lerp(aim, this.ads);
    p.x += Math.sin(this.bob) * 0.012 * bobA + this.sway.x;
    p.y += Math.abs(Math.cos(this.bob)) * 0.01 * bobA + this.sway.y;
    p.z += this.kick * 0.035;
    // 换弹动作
    const rp = this.reloadProgress();
    let rot = 0, magDrop = 0;
    if (this.reloading > 0) { rot = Math.sin(rp * Math.PI) * 0.6; magDrop = rp < 0.5 ? Math.min(1, rp * 4) : Math.max(0, 1 - (rp - 0.5) * 3.5); p.y -= Math.sin(rp * Math.PI) * 0.05; }
    this.mag.position.y = -0.08 - magDrop * 0.25;
    this.gun.position.copy(p);
    this.gun.rotation.set(this.kick * 0.06 + rot * 0.3, (1 - this.ads) * 0.11, rot * 0.5 + (1 - this.ads) * -0.07);
    this.sway.x = damp(this.sway.x, 0, 6, dt); this.sway.y = damp(this.sway.y, 0, 6, dt);
    this.holder.position.copy(this.camera.position);
    this.holder.quaternion.copy(this.camera.quaternion);
  }
  addSway(dx, dy) { this.sway.x = Math.max(-0.03, Math.min(0.03, this.sway.x - dx * 0.00012)); this.sway.y = Math.max(-0.03, Math.min(0.03, this.sway.y + dy * 0.00012)); }
  muzzleWorld() { return this.muzzleLocal.clone().applyMatrix4(this.gun.matrixWorld); }
}
