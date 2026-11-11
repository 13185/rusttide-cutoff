// 港区场景：堆场、仓库、码头、起重机、中继与撤离艇（全部程序化建模，原创）
import * as THREE from '../vendor/three/three.module.js';
import { mulberry } from './util.js';
import * as TX from './textures.js';
import { A, pbr, instance, meshParts } from './assets.js';

export const QUAY_Z = -62;
export const RELAYS = [
  { id: 'A', name: '甲号中继 · 西堆场', x: -34, z: 38 },
  { id: 'B', name: '乙号中继 · 东仓库', x: 44, z: 2 },
  { id: 'C', name: '丙号中继 · 岸桥下', x: -30, z: -50 }
];
export const BOAT = { x: 36, z: -70, boardX: 36, boardZ: -60.5 };
export const SPAWN = { x: -2, z: 80, yaw: 0 };

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// 用单位立方体实例拼装钢结构
class BeamSet {
  constructor(mat, cap = 2048) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, cap);
    this.mesh.count = 0; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
  }
  box(x, y, z, sx, sy, sz, rotY = 0) {
    _q.setFromEuler(new THREE.Euler(0, rotY, 0));
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.mesh.setMatrixAt(this.mesh.count++, _m);
  }
  beam(a, b, t) {
    const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    _m.compose(_p.addVectors(a, b).multiplyScalar(0.5), _q, _s.set(t, len, t));
    this.mesh.setMatrixAt(this.mesh.count++, _m);
  }
  done() { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.computeBoundingSphere(); return this.mesh; }
}

export class World {
  constructor(scene, reflection, quality) {
    this.scene = scene;
    this.refl = reflection;
    this.quality = quality;
    this.boxes = [];      // 碰撞 AABB {x0,x1,z0,z1,y0,y1}
    this.lamps = [];
    this.relays = [];
    this.anim = [];
    this.rng = mulberry(2026);
    this.root = new THREE.Group();
    scene.add(this.root);
    this.glowTex = TX.glowTexture();
    this.streakTex = TX.streakTexture();
    this._mats();
    this._ground();
    this._water();
    this._yard();
    this._cranes();
    this._warehouses();
    this._lamps();
    this._props();
    this._relays();
    this._boat();
    this._distant();
    this.lodT = 0;
  }

  _mats() {
    this.mat = {
      steel: pbr('steel', { repeat: 1 }),
      craneRed: pbr('paint', { color: 0xb4aca0 }),
      concrete: pbr('concrete', { metal: 0, normal: 0.8, wet: 0.6, wear: 0 }),
      dark: pbr('steel', { color: 0x555555 }),
      yellow: pbr('paint', { color: 0xd0a030 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x8c8e8c, roughness: 0.6, metalness: 0.2, map: TX.corrugatedTexture('#6f7675', 15), normalMap: A.tex.paint.n }),
      roof: new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 0.5, metalness: 0.6, map: TX.corrugatedTexture('#4c4a46', 16) }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 }),
      white: pbr('paint', { color: 0xd8d4c8 }),
      amberLamp: new THREE.MeshBasicMaterial({ color: 0xffc27a }),
      orange: pbr('paint', { color: 0xd2622a, wear: 0.5 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x0b1014, roughness: 0.05, metalness: 0.9 }),
      cable: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.4, metalness: 0.8 })
    };
    this.mat.wall.map.repeat.set(6, 1);
    this.mat.roof.map.repeat.set(8, 4);
    // Blender 材质名 → 运行时 PBR 材质
    const M = this.mat;
    const map = {
      M_crane_paint: M.craneRed, M_crane_red: pbr('paint', { color: 0x8c3a26 }), M_crane_steel: M.steel, M_cable: M.cable, M_crane_glass: M.glass,
      M_rtg_yellow: M.yellow, M_tyre: M.rubber, M_rtg_engine: pbr('paint', { color: 0x55585a }),
      M_hull: pbr('paint', { color: 0x3c4d58 }), M_cabin: M.white, M_orange: M.orange, M_boat_glass: new THREE.MeshStandardMaterial({ color: 0x0d1216, roughness: 0.05, metalness: 0.9, emissive: 0xffb36a, emissiveIntensity: 0.45 }),
      M_steel: M.steel, M_rubber: M.rubber, M_deck: pbr('steel', { color: 0x777570 }),
      M_relay_cab: pbr('paint', { color: 0x9a9c96 }), M_relay_stripe: M.yellow, M_relay_dark: M.dark, M_concrete: M.concrete, M_dish: M.white,
      M_lamp_emit: M.amberLamp
    };
    this.matFor = (n) => map[n];
  }

  addBox(x0, x1, z0, z1, y1, y0 = 0) { this.boxes.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1 }); }

  _ground() {
    const c = A.tex.concrete;
    const rp = (t) => { const k = t.clone(); k.repeat.set(12, 8.5); k.needsUpdate = true; return k; };
    const mat = new THREE.MeshStandardMaterial({ map: rp(c.a), normalMap: rp(c.n), roughnessMap: rp(c.orm), roughness: 1.0, metalness: 0.0, color: 0xb0aba2, normalScale: new THREE.Vector2(0.9, 0.9) });
    this.groundMat = mat;
    this.refl.patch(mat, { amount: 1.0, puddle: A.tex.puddles });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(240, 170, 1, 1), mat);
    g.rotation.x = -Math.PI / 2; g.position.set(0, 0, 10 - 0.0);
    g.position.z = (QUAY_Z + 108) / 2; // 从岸线到南端
    g.geometry = new THREE.PlaneGeometry(240, 108 - QUAY_Z, 1, 1);
    g.receiveShadow = true;
    this.root.add(g);
    this.ground = g;
    this.refl.hidden.push(g);
    // 车道线、斑马线（贴花）
    // 磨损标线：alphaMap 由噪声挖洞，车轮常压处更斑驳
    const worn = TX.wornMask(91);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.35, transparent: true, opacity: 0.6, alphaMap: worn, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    const yMat = new THREE.MeshStandardMaterial({ color: 0xd4a23a, roughness: 0.4, transparent: true, opacity: 0.65, alphaMap: worn, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    const decal = (m, x, z, w, d, rot = 0) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); p.rotation.set(-Math.PI / 2, 0, rot); p.position.set(x, 0.012, z); p.receiveShadow = true; this.root.add(p); };
    for (let i = 0; i < 8; i++) decal(lineMat, -5 + i * 1.4, 60, 0.7, 4.2);
    for (let i = 0; i < 8; i++) decal(lineMat, -5 + i * 1.4, -22, 0.7, 4.2);
    for (let z = 74; z > -56; z -= 7) decal(yMat, 0, z, 0.16, 3.6);
    decal(yMat, 0, QUAY_Z + 3.5, 230, 0.3);
    for (let x = -60; x < 70; x += 8) decal(lineMat, x, -40, 3.5, 0.18);
  }

  _water() {
    const n = TX.waterNormal();
    n.repeat.set(30, 12);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1c2326, roughness: 0.12, metalness: 0.0, normalMap: n, normalScale: new THREE.Vector2(0.35, 0.35) });
    this.refl.patch(mat, { amount: 1.0, distort: 0.03 });
    this.waterMat = mat;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), mat);
    w.rotation.x = -Math.PI / 2; w.position.set(0, -1.9, QUAY_Z - 250);
    this.root.add(w); this.refl.hidden.push(w);
    this.water = w;
    // 岸壁
    const wall = new THREE.Mesh(new THREE.BoxGeometry(240, 2.4, 3), this.mat.concrete);
    wall.position.set(0, -1.2, QUAY_Z + 1.5); wall.receiveShadow = true; this.root.add(wall);
    this.addBox(-200, 200, QUAY_Z - 60, QUAY_Z - 0.3, 6); // 不可下水
    // 系缆桩、护舷
    const bol = new THREE.CylinderGeometry(0.28, 0.36, 0.7, 12);
    for (let x = -110; x < 110; x += 14) {
      const b = new THREE.Mesh(bol, this.mat.dark); b.position.set(x, 0.35, QUAY_Z + 0.8); b.castShadow = true; this.root.add(b);
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 0.6), this.mat.rubber); f.position.set(x + 7, -0.9, QUAY_Z - 0.2); this.root.add(f);
    }
  }

  _yard() {
    const r = mulberry(404);
    const palette = ['#9a4a2e', '#40647a', '#4d6e56', '#85847c', '#a8692f', '#74393a', '#bdb7a7', '#4f5b68', '#2f4f6e', '#8a2f2a'];
    const cols = palette.map((c) => new THREE.Color(c));
    // 近景：Blender 波纹钢箱（框架/锁杆/板面三种材质）；远景：低模盒体。按相机距离逐帧分配实例
    const paint = pbr('paint', { wear: 0.9 });
    const frame = pbr('paint', { wear: 1.0 });
    const steel = pbr('steel', { color: 0x9a9a9a });
    const matOf = { M_cont_paint: paint, M_cont_frame: frame, M_cont_steel: steel };
    const mkLod = (node) => meshParts('containers', node).map((p) => {
      const im = new THREE.InstancedMesh(p.geometry, matOf[p.mat], 900);
      im.count = 0; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; this.root.add(im); this.refl.hidden.push(im); return { im, frame: p.mat === 'M_cont_frame' };
    });
    const far = (L) => {
      const g = new THREE.BoxGeometry(L, 2.59, 2.44); g.translate(0, 1.295, 0);
      const uv = g.attributes.uv, pos = g.attributes.position, nor = g.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
        const u = nx > 0.5 ? pos.getZ(i) : pos.getX(i), v = ny > 0.5 ? pos.getZ(i) : pos.getY(i);
        uv.setXY(i, u * 0.5, v * 0.5);
      }
      const im = new THREE.InstancedMesh(g, paint, 900); im.count = 0; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; this.root.add(im); this.refl.hidden.push(im);
      return im;
    };
    // 代理：全部箱子的盒体。shadow = 只投影不着色（主通道零像素开销）；refl = 只在反射通道出现
    const proxy = (L, kind) => {
      const g = new THREE.BoxGeometry(L * 0.985, 2.55, 2.4); g.translate(0, 1.275, 0);
      const mat = kind === 'shadow' ? new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }) : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.2, map: A.tex.paint.a });
      const im = new THREE.InstancedMesh(g, mat, 900); im.count = 0; im.frustumCulled = false; im.castShadow = kind === 'shadow'; this.root.add(im);
      if (kind === 'refl') { im.visible = false; this.refl.only.push(im); } else this.refl.hidden.push(im);
      return im;
    };
    this.cont = { near: [mkLod('cont40'), mkLod('cont20')], far: [far(12.19), far(6.06)], shadow: [proxy(12.19, 'shadow'), proxy(6.06, 'shadow')], refl: [proxy(12.19, 'refl'), proxy(6.06, 'refl')], list: [], cols };
    const excl = [
      ...RELAYS.map((rl) => ({ x: rl.x, z: rl.z, r: 10 })),
      { x: 61, z: 0, r: 26 } // 仓库
    ];
    const blocked = (x0, x1, z0, z1) => {
      if (x1 > -5.3 && x0 < 5.3) return true; // 主通道
      if (z1 > -26 && z0 < -18) return true; // 横向通道
      if (z1 > 18 && z0 < 24) return true;
      if (z0 < -36) return true; // 码头前沿留空
      for (const e of excl) {
        const cx = Math.max(x0, Math.min(e.x, x1)), cz = Math.max(z0, Math.min(e.z, z1));
        if (Math.hypot(cx - e.x, cz - e.z) < e.r) return true;
      }
      return false;
    };
    const place = (x, z, long, levels) => {
      for (let k = 0; k < levels; k++) {
        const ci = Math.floor(r() * cols.length);
        const c = cols[ci].clone().multiplyScalar(0.85 + r() * 0.3);
        const m = new THREE.Matrix4();
        _q.setFromEuler(new THREE.Euler(0, (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.012, 0));
        m.compose(_p.set(x + (r() - 0.5) * 0.18, k * 2.6, z + (r() - 0.5) * 0.08), _q, _s.set(1, 1, 1));
        this.cont.list.push({ m, c, long: long ? 0 : 1, x, z, y: k * 2.6 + 1.3 });
      }
    };
    for (let z = -34; z < 100; z += 9.2) {
      for (const side of [-1, 1]) {
        let x = side < 0 ? -5.4 : 5.4;
        while (Math.abs(x) < 72) {
          const long = r() < 0.72;
          const L = long ? 12.19 : 6.06;
          const gap = r() < 0.22 ? 3 + r() * 5 : 0.3;
          const x0 = side < 0 ? x - L : x, x1 = side < 0 ? x : x + L;
          const z0 = z - 2.45, z1 = z + 2.45;
          if (!blocked(x0, x1, z0, z1) && r() > 0.08) {
            const nearAve = Math.abs(side < 0 ? x1 : x0) < 7;
            const lv = nearAve ? 3 + Math.floor(r() * 1.8) : 1 + Math.floor(r() * r() * 4.2);
            const lv2 = Math.max(1, lv - (r() < 0.5 ? 1 : 0));
            place((x0 + x1) / 2, z - 1.23, long, lv);
            place((x0 + x1) / 2, z + 1.23, long, lv2);
            this.addBox(x0, x1, z0, z1, Math.max(lv, lv2) * 2.6);
          }
          x += side * (L + gap);
        }
      }
    }
    this.lodDist = 40;
    // 代理实例只需写一次
    for (const it of this.cont.list) for (const im of [this.cont.shadow[it.long], this.cont.refl[it.long]]) { const i = im.count++; im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); }
    for (const im of [...this.cont.shadow, ...this.cont.refl]) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
    this.updateLOD(new THREE.Vector3(SPAWN.x, 1.7, SPAWN.z));
  }
  setLodDistance(d) { this.lodDist = d; this._lodCam = null; }
  updateLOD(cam, fwd) {
    const C = this.cont; const d2 = this.lodDist * this.lodDist;
    this.lodStats = { near: 0, far: 0 };
    const cnt = [[0, 0], [0, 0]];
    for (const set of C.near) for (const p of set) p.im.count = 0;
    C.far[0].count = 0; C.far[1].count = 0;
    const fc = new THREE.Color();
    for (const it of C.list) {
      const dx = it.x - cam.x, dy = it.y - cam.y, dz = it.z - cam.z;
      const dd = dx * dx + dy * dy * 0.5 + dz * dz;
      // 近景高模只给视野前方（含 ±95° 余量）与身边 14 m 内的箱子
      let near = dd < d2;
      if (near && fwd && dd > 196) { const L = Math.sqrt(dx * dx + dz * dz) || 1; if ((dx * fwd.x + dz * fwd.z) / L < -0.1) near = false; }
      if (near) this.lodStats.near++; else this.lodStats.far++;
      if (near) {
        for (const p of C.near[it.long]) {
          const i = p.im.count++;
          p.im.setMatrixAt(i, it.m);
          p.im.setColorAt(i, p.frame ? fc.copy(it.c).multiplyScalar(0.78) : it.c);
        }
      } else {
        const im = C.far[it.long]; const i = im.count++;
        im.setMatrixAt(i, it.m); im.setColorAt(i, it.c);
      }
    }
    for (const im of [...C.near.flat().map((p) => p.im), ...C.far]) {
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  _crane(cx, h = 38) {
    const z0 = QUAY_Z + 2, z1 = QUAY_Z + 22;
    const m = instance('cranes', 'sts', this.matFor);
    m.rotation.y = Math.PI; m.position.set(cx, 0, z0);
    if (h !== 38) m.scale.set(1, h / 38, 1);
    this.root.add(m);
    for (const [x, z] of [[-8, z0], [8, z0], [-8, z1], [8, z1]]) this.addBox(cx + x - 1, cx + x + 1, z - 1, z + 1, h);
    // 航空障碍灯
    this._lampGlow(cx, h + 22.5, z1 - 3, 0xff3a28, 2.2, false);
  }

  _cranes() {
    this._crane(-34); this._crane(-2); this._crane(30, 40);
    // 堆场轮胎吊（RTG）
    const rtg = (cx, cz) => {
      const m = instance('cranes', 'rtg', this.matFor); m.position.set(cx, 0, cz); this.root.add(m);
      for (const x of [-11, 11]) for (const z of [-3.5, 3.5]) this.addBox(cx + x - 0.6, cx + x + 0.6, cz + z - 0.6, cz + z + 0.6, 18);
    };
    rtg(-40, 8.6); rtg(38, 45);
  }

  _warehouses() {
    const shed = (cx, cz, w, d, h) => {
      const g = new THREE.Group();
      const wallN = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), this.mat.wall);
      const mk = (geo, x, y, z) => { const m = new THREE.Mesh(geo, this.mat.wall); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
      mk(wallN.geometry, cx, h / 2, cz - d / 2); mk(wallN.geometry, cx, h / 2, cz + d / 2);
      mk(new THREE.BoxGeometry(0.4, h, d), cx + w / 2, h / 2, cz);
      // 西墙：卷帘门洞
      mk(new THREE.BoxGeometry(0.4, h, d * 0.3), cx - w / 2, h / 2, cz - d * 0.35);
      mk(new THREE.BoxGeometry(0.4, h, d * 0.3), cx - w / 2, h / 2, cz + d * 0.35);
      mk(new THREE.BoxGeometry(0.4, h * 0.35, d * 0.4), cx - w / 2, h * 0.825, cz);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.4, d + 1.2), this.mat.roof);
      roof.position.set(cx, h + 0.2, cz); roof.castShadow = true; g.add(roof);
      this.root.add(g);
      // 碰撞
      this.addBox(cx - w / 2, cx + w / 2, cz - d / 2 - 0.3, cz - d / 2 + 0.3, h);
      this.addBox(cx - w / 2, cx + w / 2, cz + d / 2 - 0.3, cz + d / 2 + 0.3, h);
      this.addBox(cx + w / 2 - 0.3, cx + w / 2 + 0.3, cz - d / 2, cz + d / 2, h);
      this.addBox(cx - w / 2 - 0.3, cx - w / 2 + 0.3, cz - d / 2, cz - d * 0.2, h);
      this.addBox(cx - w / 2 - 0.3, cx - w / 2 + 0.3, cz + d * 0.2, cz + d / 2, h);
      this.addBox(cx - w / 2 - 0.3, cx - w / 2 + 0.3, cz - d * 0.2, cz + d * 0.2, h, h * 0.65);
      this.addBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h + 0.4, h);
      // 标识牌
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshStandardMaterial({ map: TX.signTexture(['三号货栈', '冷链 · 散货 · 危险品隔离'], { w: 512, h: 128, size: 48 }), roughness: 0.6 }));
      sign.position.set(cx - w / 2 - 0.25, h * 0.84, cz); sign.rotation.y = -Math.PI / 2; this.root.add(sign);
      // 室内灯
      this._lampGlow(cx, h - 0.5, cz, 0xffd9a0, 3, true, 0.5);
    };
    shed(61, 0, 22, 34, 11);
    // 码头调度楼（远端）
    const tower = new THREE.Mesh(new THREE.BoxGeometry(10, 18, 10), this.mat.concrete);
    tower.position.set(-62, 9, -46); tower.castShadow = true; this.root.add(tower);
    this.addBox(-67, -57, -51, -41, 18);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(10.4, 3, 10.4), new THREE.MeshStandardMaterial({ color: 0x1b2328, roughness: 0.08, metalness: 0.9, emissive: 0x3a2a14, emissiveIntensity: 0.6 }));
    glass.position.set(-62, 16, -46); this.root.add(glass);
  }

  _lampGlow(x, y, z, color, size, streak = true, intensity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 * intensity, fog: true }));
    s.position.set(x, y, z); s.scale.setScalar(size); this.root.add(s);
    if (streak) {
      // 地面上的拉长倒影（随视角朝向相机）
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 12), new THREE.MeshBasicMaterial({ map: this.streakTex, color, transparent: true, opacity: 0.32 * intensity, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
      m.position.set(x, 0.03, z); m.userData.streak = true; m.userData.base = new THREE.Vector3(x, 0.03, z);
      this.root.add(m); this.refl.hidden.push(m);
      this.lamps.push(m);
    }
    return s;
  }

  _lamps() {
    const pts = [[-4.5, 66], [4.5, 30], [-4.5, -6], [4.5, -36], [-24, -30], [24, -28], [-48, 22], [48, 26], [-30, 64], [40, -10]];
    this.lights = [];
    const parts = meshParts('props', 'lamppost');
    const ims = parts.map((p) => { const im = new THREE.InstancedMesh(p.geometry, this.matFor(p.mat) || this.mat.steel, pts.length); im.castShadow = true; im.receiveShadow = true; this.root.add(im); return im; });
    pts.forEach(([x, z], i) => {
      const h = 16;
      _m.compose(_p.set(x, 0, z), _q.identity(), _s.set(1, 1, 1));
      ims.forEach((im) => im.setMatrixAt(i, _m));
      this.addBox(x - 0.3, x + 0.3, z - 0.3, z + 0.3, h);
      this._lampGlow(x, h - 0.3, z, 0xffb366, 5.5);
      if (i < 6) {
        const L = new THREE.PointLight(0xffa860, 26, 26, 1.7);
        L.position.set(x, h - 1, z); this.root.add(L); this.lights.push(L);
      }
    });
    ims.forEach((im) => { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); });
  }

  _props() {
    const r = mulberry(91);
    // 混凝土隔离墩（掩体）
    const barrierGeo = meshParts('props', 'barrier')[0].geometry;
    const barriers = [[-3.6, 50, 1.57], [3.6, 12, 1.57], [-3.6, -14, 1.57], [8, -46, 0.1], [-16, -44, 1.57], [20, -50, 0], [-40, -40, 0.3], [30, 10, 1.57], [-24, 30, 1.57], [-44, 44, 0], [48, -6, 0], [-36, -56, 0], [-26, -55, 1.2], [44, 9, 1.57], [-30, 32, 0]];
    const bm = new THREE.InstancedMesh(barrierGeo, this.mat.concrete, barriers.length); bm.castShadow = bm.receiveShadow = true;
    barriers.forEach(([x, z, ry], i) => {
      _m.compose(_p.set(x, 0, z), _q.setFromEuler(new THREE.Euler(0, ry, 0)), _s.set(1, 1, 1)); bm.setMatrixAt(i, _m);
      const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
      const hx = 1.5 * c + 0.3 * s, hz = 1.5 * s + 0.3 * c;
      this.addBox(x - hx, x + hx, z - hz, z + hz, 0.95);
    });
    this.root.add(bm);
    // 锥桶
    const cone = new THREE.ConeGeometry(0.22, 0.7, 10);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(cone, this.mat.orange);
      m.position.set((r() < 0.5 ? -1 : 1) * (3.4 + r() * 1.4), 0.35, -50 + r() * 120); m.castShadow = true; this.root.add(m);
    }
    // 托盘与木箱
    const crate = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.85, map: TX.noiseTexture('#6b5236', 33, false), normalMap: A.tex.polymer.n });
    const crates = [[-30, 41], [-37, 34], [41, 5], [47, -1], [-27, -47], [-33, -53], [33, -57], [3.8, 64], [-4, 20], [14, -30]];
    for (const [x, z] of crates) {
      const sz = 1.1 + r() * 0.3;
      const m = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), crate); m.position.set(x, sz / 2, z); m.rotation.y = r(); m.castShadow = m.receiveShadow = true; this.root.add(m);
      this.addBox(x - sz * 0.6, x + sz * 0.6, z - sz * 0.6, z + sz * 0.6, sz);
    }
    // 围栏（南端边界）
    const fence = new BeamSet(this.mat.steel, 200);
    for (let x = -118; x <= 118; x += 4) fence.box(x, 1.4, 106, 0.08, 2.8, 0.08);
    fence.box(0, 2.7, 106, 236, 0.06, 0.06); fence.box(0, 0.4, 106, 236, 0.06, 0.06);
    this.root.add(fence.done());
    this.addBox(-120, 120, 104, 110, 5);
    this.addBox(-122, -76, -70, 110, 30); this.addBox(76, 122, -70, 110, 30);
    // 边界墙：外侧集装箱墙
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.8, map: TX.corrugatedTexture('#3a3532', 50) });
    wallMat.map.repeat.set(30, 1);
    for (const x of [-77, 77]) { const w = new THREE.Mesh(new THREE.BoxGeometry(2, 8, 170), wallMat); w.position.set(x, 4, 20); w.castShadow = w.receiveShadow = true; this.root.add(w); }
    // 告示牌
    const sg = (lines, x, z, ry, bg, fg) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: TX.signTexture(lines, { w: 256, h: 128, size: 34, bg, fg }), roughness: 0.5 }));
      m.position.set(x, 2.1, z); m.rotation.y = ry; this.root.add(m);
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 0.08), this.mat.steel); p.position.set(x, 1.05, z - 0.05); this.root.add(p);
    };
    sg(['禁止通行', '作业区 · 机械巡检中'], -4.4, 58, 0.5, '#c8302a', '#f2ece0');
    sg(['码头前沿', '小心落水'], 4.4, -38, -0.3, '#d9a531', '#14110d');
    sg(['限速 15', '堆场内道路'], -4.4, 10, 0.4, '#e8e4da', '#14110d');
  }

  _relays() {
    for (const def of RELAYS) {
      const g = new THREE.Group();
      g.position.set(def.x, 0, def.z);
      // Blender 模型：机柜、百叶、门锁、线管、格构天线塔。无自发光，靠环境光 + 补光照亮
      const m = instance('props', 'relay', this.matFor); m.rotation.y = Math.PI; g.add(m);
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
      for (const sz of [-1, 1]) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.26), lightMat); panel.position.set(0, 1.62, sz * 0.545); if (sz < 0) panel.rotation.y = Math.PI; g.add(panel);
        const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.38), new THREE.MeshStandardMaterial({ map: TX.signTexture(['中继 ' + def.id, '主控上行'], { w: 256, h: 112, size: 40, bg: '#ffb347', fg: '#14110d' }), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }));
        lab.position.set(0, 2.12, sz * 0.545); if (sz < 0) lab.rotation.y = Math.PI; g.add(lab);
      }
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), lightMat); beacon.position.set(0, 9.2, -1.3); g.add(beacon);
      const glow = this._lampGlow(def.x, 9.2, def.z - 1.3, 0xffb347, 3.5, false);
      const cable = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.05, 6, 20, Math.PI), this.mat.rubber); cable.position.set(1.0, 0, 0.6); cable.rotation.y = 1.2; g.add(cable);
      const light = new THREE.PointLight(0xffa040, 16, 12, 1.8); light.position.set(0, 3.4, 0.9); g.add(light);
      // 背侧冷色补光（模拟天光反弹），避免背光面死黑
      const fill = new THREE.PointLight(0x9fb4cc, 5, 7, 1.6); fill.position.set(0.6, 2.6, -2.2); g.add(fill);
      this.root.add(g);
      this.addBox(def.x - 0.85, def.x + 0.85, def.z - 0.55, def.z + 0.55, 2.55);
      this.addBox(def.x - 0.5, def.x + 0.5, def.z - 1.8, def.z - 0.8, 9);
      this.relays.push({ ...def, group: g, lightMat, glow, light, cut: false, blink: Math.random() * 6 });
    }
  }

  setRelayCut(i) {
    const r = this.relays[i];
    r.cut = true;
    r.lightMat.color.set(0x3a1410);
    r.glow.material.color.set(0x551a10);
    r.glow.material.opacity = 0.35;
    r.light.color.set(0xff3020); r.light.intensity = 3;
  }
  resetRelays() {
    for (const r of this.relays) {
      r.cut = false; r.lightMat.color.set(0xffb347); r.glow.material.color.set(0xffb347); r.glow.material.opacity = 0.9; r.light.color.set(0xffa040); r.light.intensity = 18;
    }
  }

  _boat() {
    const g = instance('props', 'boat', this.matFor);
    g.position.set(BOAT.x, -2.45, BOAT.z + 2.4);
    this.root.add(g);
    this.boat = g;
    // 跳板（从岸边斜向甲板）
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 5.4), this.mat.steel); ramp.position.set(BOAT.x, -0.32, QUAY_Z - 2.3); ramp.rotation.x = -0.12; ramp.castShadow = ramp.receiveShadow = true; this.root.add(ramp);
    const rails = new BeamSet(this.mat.yellow, 20);
    for (const dx of [-0.7, 0.7]) rails.box(BOAT.x + dx, 0.5, QUAY_Z - 2.3, 0.05, 0.05, 5.2);
    this.root.add(rails.done());
    this.boatBeacon = this._lampGlow(BOAT.x + 2.6, -2.45 + 7.2, BOAT.z + 2.4, 0x6ad1ff, 4.5, false);
    this.boatBeacon.visible = false;
    const bl = new THREE.PointLight(0x9adfff, 0, 16, 1.8); bl.position.set(BOAT.x, 3, BOAT.z + 5); this.root.add(bl); this.boatLight = bl;
  }
  setBoatReady(on) { this.boatBeacon.visible = on; this.boatLight.intensity = on ? 10 : 0; }

  _distant() {
    // 对岸剪影：远处岸桥与楼群
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 1, fog: true });
    const B = new BeamSet(mat, 400);
    const r = mulberry(7);
    for (let i = 0; i < 26; i++) {
      const x = -300 + i * 24 + r() * 10, z = -330 - r() * 60, h = 10 + r() * 50;
      B.box(x, h / 2, z, 10 + r() * 20, h, 10 + r() * 20);
    }
    for (let i = 0; i < 7; i++) {
      const x = -200 + i * 60, z = -280;
      B.box(x - 6, 20, z, 1.5, 40, 1.5); B.box(x + 6, 20, z, 1.5, 40, 1.5); B.box(x, 42, z - 20, 2, 2, 80);
    }
    this.root.add(B.done());
  }

  update(dt, t, camera) {
    this.lodT -= dt;
    if (this.lodT <= 0) { this.lodT = 0.12; camera.getWorldDirection(this._fwd || (this._fwd = new THREE.Vector3())); this.updateLOD(camera.position, this._fwd); }
    this.groundMat.userData.rippleTime.value = t;
    this.waterMat.userData.rippleTime.value = t;
    this.waterMat.normalMap.offset.set(t * 0.004, t * 0.01);
    // 湿地灯光倒影：放在灯与相机之间地面，朝向相机拉长
    for (const s of this.lamps) {
      const b = s.userData.base;
      const dx = camera.position.x - b.x, dz = camera.position.z - b.z;
      const d = Math.hypot(dx, dz) || 1;
      const len = Math.min(16, 5 + d * 0.22);
      s.position.set(b.x + dx / d * len * 0.5, 0.03, b.z + dz / d * len * 0.5);
      s.rotation.set(-Math.PI / 2, 0, Math.atan2(dx, dz));
      s.scale.set(1, len / 12, 1);
    }
    for (const r of this.relays) {
      if (r.cut) continue;
      r.blink += dt;
      const on = (r.blink % 1.2) < 0.6;
      r.glow.material.opacity = on ? 0.95 : 0.35;
    }
    if (this.boatBeacon.visible) this.boatBeacon.material.opacity = 0.5 + 0.5 * Math.sin(t * 5);
  }

  // —— 碰撞与射线 ——
  groundHeight(x, z, feetY, r = 0.35) {
    let h = 0;
    for (const b of this.boxes) {
      if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && b.y1 <= feetY + 0.5 && b.y1 > h) h = b.y1;
    }
    return h;
  }
  collide(x, z, feetY, r, height) {
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.boxes) {
        if (b.y1 <= feetY + 0.45 || b.y0 >= feetY + height) continue;
        const cx = Math.max(b.x0, Math.min(x, b.x1)), cz = Math.max(b.z0, Math.min(z, b.z1));
        const dx = x - cx, dz = z - cz; const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2); x = cx + dx / d * r; z = cz + dz / d * r; }
          else {
            const pen = [x - b.x0, b.x1 - x, z - b.z0, b.z1 - z]; const m = Math.min(...pen);
            if (m === pen[0]) x = b.x0 - r; else if (m === pen[1]) x = b.x1 + r; else if (m === pen[2]) z = b.z0 - r; else z = b.z1 + r;
          }
        }
      }
    }
    return { x, z };
  }
  raycast(o, d, maxD) {
    let best = maxD, hitN = null;
    // 地面
    if (d.y < -1e-5) { const t = -o.y / d.y; if (t > 0 && t < best) { best = t; hitN = [0, 1, 0]; } }
    for (const b of this.boxes) {
      let t0 = 0, t1 = best, n = null;
      const ax = [['x', b.x0, b.x1, 0], ['y', b.y0, b.y1, 1], ['z', b.z0, b.z1, 2]];
      let ok = true;
      for (const [k, lo, hi, idx] of ax) {
        const dv = d[k], ov = o[k];
        if (Math.abs(dv) < 1e-9) { if (ov < lo || ov > hi) { ok = false; break; } continue; }
        let ta = (lo - ov) / dv, tb = (hi - ov) / dv; let sgn = -1;
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; sgn = 1; }
        if (ta > t0) { t0 = ta; n = [0, 0, 0]; n[idx] = sgn; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 > 0 && t0 < best) { best = t0; hitN = n || [0, 1, 0]; }
    }
    return { t: best, hit: hitN !== null, normal: hitN };
  }
  los(a, b) {
    const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); d.divideScalar(L);
    return this.raycast(a, d, L - 0.3).t >= L - 0.31;
  }
}
