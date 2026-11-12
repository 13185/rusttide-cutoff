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
    this._portLife();
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
      M_lamp_emit: M.amberLamp,
      M_yp_wood: pbr('wood', { wet: 0.7, wear: 0.4, env: 0.4 }),
      M_yp_card: pbr('cardboard', { metal: 0, wet: 0.25, wear: 0.2, env: 0.25 }),
      M_yp_steel: M.steel,
      M_yp_paint: pbr('paint', { color: 0x9a9890, wear: 0.6, wet: 0.8, env: 0.5 }),
      M_yp_rubber: M.rubber,
      M_yp_conc: M.concrete,
      M_yp_plas: pbr('polymer', { color: 0x3a5a52, metal: 0, rough: 0.7, wet: 0.4, env: 0.35 }),
      M_yp_orange: M.orange,
      M_yp_yellow: M.yellow,
      M_yp_navy: pbr('paint', { color: 0x2a4a62, wear: 0.55, wet: 0.7, env: 0.45 }),
      M_yp_red: pbr('paint', { color: 0x8a2424, wear: 0.4, wet: 0.5, env: 0.4 }),
      M_yp_glass: M.glass,
      M_yp_dark: M.dark,
      M_yp_hazard: M.yellow,
      M_yp_decal: new THREE.MeshStandardMaterial({
        map: A.tex.decals, normalMap: A.tex.decalsN, normalScale: new THREE.Vector2(0.55, 0.55),
        roughness: 0.72, metalness: 0.04, envMapIntensity: 0.45, color: 0xffffff, side: THREE.DoubleSide,
        emissive: new THREE.Color(0xffffff), emissiveMap: A.tex.decals, emissiveIntensity: 0.4
      })
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
    // ≥80% 饱和箱蓝/信号红/橙/绿/白，灰与脏棕是少数。波纹脊的顶点磨损很高，不能再拿它把整面漆洗成灰石头。
    const palette = ['#1E6FD0', '#D32020', '#F05A12', '#2E9A3A', '#F7F4EE', '#1565C0', '#E53935', '#F9A825', '#6D6458', '#5A4332'];
    const cols = palette.map((c) => new THREE.Color(c));
    // 板面：干净工业漆，几乎不吃顶点磨损；框和锁杆才露锈和冷金属高光
    const paint = pbr('contpaint', { wear: 0.04, wet: 0.22, env: 1.05, normal: 0.14, rough: 0.58, metal: 0.08 });
    const frame = pbr('steel', { color: 0xb4bcc4, wear: 0.62, wearColor: 0x7a3c22, wet: 0.3, env: 1.15, normal: 0.4, rough: 0.5, metal: 0.9 });
    const steel = pbr('steel', { color: 0xe4ebf1, wear: 0.1, wearColor: 0x8a4528, wet: 0.18, env: 1.35, normal: 0.35, rough: 0.4, metal: 1 });
    const liner = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95, metalness: 0, envMapIntensity: 0.12 });
    const markMat = new THREE.MeshStandardMaterial({
      map: A.tex.mark, transparent: true, alphaTest: 0.08, depthWrite: false,
      metalness: 0.08, roughness: 0.5, envMapIntensity: 0.55,
      emissive: new THREE.Color(0xffffff), emissiveMap: A.tex.mark, emissiveIntensity: 0.28,
      polygonOffset: true, polygonOffsetFactor: -1
    });
    const matOf = { M_cont_paint: paint, M_cont_frame: frame, M_cont_steel: steel, M_cont_liner: liner };
    const mkLod = (node) => meshParts('containers', node).map((p) => {
      const im = new THREE.InstancedMesh(p.geometry, matOf[p.mat] || paint, 900);
      im.count = 0; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; this.root.add(im); this.refl.hidden.push(im);
      return { im, frame: p.mat === 'M_cont_frame', liner: p.mat === 'M_cont_liner' };
    });
    const mkMark = (node) => {
      const parts = meshParts('containers', node);
      if (!parts.length) return null;
      const im = new THREE.InstancedMesh(parts[0].geometry, markMat, 400);
      im.count = 0; im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false; im.renderOrder = 2;
      this.root.add(im); this.refl.hidden.push(im); return im;
    };
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
      const mat = kind === 'shadow' ? new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }) : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.18, map: (A.tex.contpaint && A.tex.contpaint.a) || A.tex.paint.a });
      const im = new THREE.InstancedMesh(g, mat, 900); im.count = 0; im.frustumCulled = false; im.castShadow = kind === 'shadow'; this.root.add(im);
      if (kind === 'refl') { im.visible = false; this.refl.only.push(im); } else this.refl.hidden.push(im);
      return im;
    };
    this.cont = { near: [mkLod('cont40'), mkLod('cont20')], far: [far(12.19), far(6.06)], shadow: [proxy(12.19, 'shadow'), proxy(6.06, 'shadow')], refl: [proxy(12.19, 'refl'), proxy(6.06, 'refl')], marks: [[0,1,2,3].map((v) => mkMark('mark40_' + v)), [0,1,2,3].map((v) => mkMark('mark20_' + v))], list: [], cols };
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
      const mark = Math.floor(r() * 4);
      const yaw = r() < 0.5 ? 0 : Math.PI;
      for (let k = 0; k < levels; k++) {
        const ci = Math.floor(r() * cols.length);
        const weathered = ci >= cols.length - 2;
        const c = cols[ci].clone().multiplyScalar(weathered ? (0.8 + r() * 0.1) : (1.02 + r() * 0.12));
        const m = new THREE.Matrix4();
        _q.setFromEuler(new THREE.Euler(0, yaw, 0));
        m.compose(_p.set(x, k * 2.591, z), _q, _s.set(1, 1, 1));
        this.cont.list.push({ m, c, long: long ? 0 : 1, x, z, y: k * 2.591 + 1.295, mark, yaw });
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
            this.addBox(x0, x1, z0, z1, Math.max(lv, lv2) * 2.591);
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
    for (const set of C.marks) for (const im of set) if (im) im.count = 0;
    const fc = new THREE.Color();
    const white = new THREE.Color(0xffffff);
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
          p.im.setColorAt(i, p.liner ? white : (p.frame ? fc.copy(it.c).multiplyScalar(0.78) : it.c));
        }
        const mk = C.marks[it.long][it.mark];
        if (mk) { const i = mk.count++; mk.setMatrixAt(i, it.m); }
      } else {
        const im = C.far[it.long]; const i = im.count++;
        im.setMatrixAt(i, it.m); im.setColorAt(i, it.c);
      }
    }
    for (const im of [...C.near.flat().map((p) => p.im), ...C.far, ...C.marks.flat().filter(Boolean)]) {
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
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshStandardMaterial({ map: TX.signTexture(['三号货栈 · 乍浦港区', '冷链 · 散货 · 危险品隔离'], { w: 512, h: 128, size: 44 }), roughness: 0.6 }));
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
      s.userData.streakMesh = m;
    }
    return s;
  }

  _lamps() {
    // 10 根灯杆都在，但真正的动态灯只给主通道 4 盏高压钠，总动态灯预算见 applyLightBudget
    const pts = [[-4.5, 66], [4.5, 30], [-4.5, -6], [4.5, -36], [-24, -30], [24, -28], [-48, 22], [48, 26], [-30, 64], [40, -10]];
    this.lights = [];
    this.streetLamps = [];
    const parts = meshParts('props', 'lamppost');
    const ims = parts.map((p) => { const im = new THREE.InstancedMesh(p.geometry, this.matFor(p.mat) || this.mat.steel, pts.length); im.castShadow = true; im.receiveShadow = true; this.root.add(im); return im; });
    pts.forEach(([x, z], i) => {
      const h = 16;
      _m.compose(_p.set(x, 0, z), _q.identity(), _s.set(1, 1, 1));
      ims.forEach((im) => im.setMatrixAt(i, _m));
      this.addBox(x - 0.3, x + 0.3, z - 0.3, z + 0.3, h);
      const sodium = i < 4;
      const glowCol = sodium ? 0xffb366 : 0xc5d4e2;
      const glow = this._lampGlow(x, h - 0.3, z, glowCol, sodium ? 5.5 : 3.6, true, sodium ? 1 : 0.55);
      let L = null;
      if (i < 4) {
        L = new THREE.PointLight(0xffa040, 20, 24, 1.6);
        L.position.set(x, h - 1, z); this.root.add(L); this.lights.push(L);
      }
      this.streetLamps.push({ light: L, glow, x, z, h, baseIntensity: L ? 20 : 0, on: true, lit: !!L, flicker: i === 1 || i === 3, glowCol });
    });
    ims.forEach((im) => { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); });
  }
  extinguishLamp(i) {
    const s = this.streetLamps && this.streetLamps[i];
    if (!s || !s.on) return false;
    s.on = false;
    if (s.light) s.light.intensity = 0;
    if (s.glow) { s.glow.material.opacity = 0.04; s.glow.material.color.set(0x1a140e); const st = s.glow.userData.streakMesh; if (st) st.visible = false; }
    return true;
  }
  resetLamps() {
    if (!this.streetLamps) return;
    for (const s of this.streetLamps) {
      s.on = true;
      if (s.light) { s.light.intensity = s.lit ? s.baseIntensity : 0; }
      if (s.glow) { s.glow.material.opacity = (s.glowCol === 0xc5d4e2 ? 0.55 : 0.9); s.glow.material.color.set(s.glowCol); const st = s.glow.userData.streakMesh; if (st) st.visible = true; }
    }
  }
  applyLightBudget(q) {
    // 场景有效动态灯 ≤ 8（另加手电 1）。低画质再收一档。
    const nStreet = q === 'low' || q === 'mobile' ? 2 : q === 'medium' ? 3 : 4;
    if (this.streetLamps) {
      this.streetLamps.forEach((s, i) => {
        s.lit = i < nStreet;
        if (s.light) s.light.intensity = (s.on && s.lit) ? s.baseIntensity : 0;
      });
    }
    if (this.doorSpot) this.doorSpot.intensity = q === 'low' || q === 'mobile' ? 18 : 28;
    if (this.relays) for (const r of this.relays) {
      if (!r.light) continue;
      const on = q !== 'low';
      r.light.visible = on;
      if (!r.cut) r.light.intensity = on ? 11 : 0;
    }
  }
  updateLamps(t) {
    if (!this.streetLamps) return;
    for (const s of this.streetLamps) {
      if (!s.on || !s.light || !s.lit) continue;
      let k = 1;
      if (s.flicker) {
        const dip = (Math.sin(t * 13.7 + s.x) > 0.93) ? 0.28 : 1;
        k = (0.93 + 0.07 * Math.sin(t * 2.2 + s.z)) * dip;
      }
      s.light.intensity = s.baseIntensity * k;
    }
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
    // 锥桶 / 托盘 / 木箱等改由 _portLife 实例化原创小道具
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
    sg(['限速 15', '乍浦港区道路'], -4.4, 10, 0.4, '#e8e4da', '#14110d');
  }


  _instParts(node, items, box = null) {
    const parts = meshParts('yardprops', node);
    if (!parts.length || !items.length) return [];
    const ims = parts.map((p) => {
      const im = new THREE.InstancedMesh(p.geometry, this.matFor(p.mat) || this.mat.steel, items.length);
      im.count = items.length; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      this.root.add(im); this.refl.hidden.push(im); return im;
    });
    items.forEach((it, i) => {
      const x = it[0], z = it[1], ry = it[2] || 0, y = it[3] || 0;
      _q.setFromEuler(new THREE.Euler(0, ry, 0));
      _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
      for (const im of ims) im.setMatrixAt(i, _m);
      if (box) {
        const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
        const hx = box[0] * c + box[1] * s, hz = box[0] * s + box[1] * c;
        this.addBox(x - hx, x + hx, z - hz, z + hz, box[2], box[3] || 0);
      }
    });
    ims.forEach((im) => { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); });
    return ims;
  }
  _put(node, x, z, ry = 0, y = 0) {
    const g = instance('yardprops', node, this.matFor);
    g.position.set(x, y, z); g.rotation.y = ry; this.root.add(g);
    return g;
  }

  // 三号货栈 shed(61, 0, 22, 34, 11)：西侧卷帘门以内、屋檐以下
  isIndoors(x, y, z) {
    return x > 50.2 && x < 72.15 && z > -16.95 && z < 16.95 && y > -0.2 && y < 11.15;
  }

  /** 从图集切一块正向平面（u/y 为像素，y 自上而下）。正面朝 +Z，需要朝外时由调用方旋转。 */
  _atlasDecal(u0, y0, u1, y1, w, h) {
    const t = A.tex.decals.clone();
    t.repeat.set((u1 - u0) / 2048, (y1 - y0) / 2048);
    t.offset.set(u0 / 2048, 1 - y1 / 2048);
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshStandardMaterial({
      map: t, roughness: 0.55, metalness: 0.08, side: THREE.FrontSide,
      envMapIntensity: 0.4, color: 0xffffff,
      emissive: new THREE.Color(0xffffff), emissiveMap: t, emissiveIntensity: 0.28
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.castShadow = false; m.receiveShadow = false;
    return m;
  }


  _bannerMap(row) {
    const t = A.tex.decals.clone();
    t.repeat.set(1, 256 / 2048);
    t.offset.set(0, 1 - (row + 1) * 256 / 2048);
    t.needsUpdate = true;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }
  _hangBanner(row, x, z, ry, poles = true) {
    const map = this._bannerMap(row);
    const mat = new THREE.MeshStandardMaterial({
      map, roughness: 0.7, metalness: 0.02, side: THREE.DoubleSide,
      envMapIntensity: 0.45, color: 0xffffff,
      emissive: new THREE.Color(0xffffff), emissiveMap: map, emissiveIntensity: 0.5
    });
    const geo = new THREE.PlaneGeometry(5.2, 0.82, 16, 4);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / 5.2 + 0.5;
      const sag = (1 - Math.cos((u - 0.5) * Math.PI)) * 0.12;
      pos.setZ(i, pos.getZ(i) - sag * 0.4);
      pos.setY(i, pos.getY(i) - sag);
    }
    pos.needsUpdate = true; geo.computeVertexNormals();
    const g = new THREE.Group();
    const cloth = new THREE.Mesh(geo, mat);
    cloth.position.y = 2.45; cloth.castShadow = true; g.add(cloth);
    if (poles) {
      const poleM = this.mat.steel;
      for (const sx of [-2.68, 2.68]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.2, 8), poleM);
        pole.position.set(sx, 1.6, 0.04); pole.castShadow = true; g.add(pole);
        const ropeM = this.mat.rubber;
        for (const y of [2.8, 2.1]) {
          const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 6), ropeM);
          rope.position.set(sx * 0.98, y, -0.04); rope.rotation.x = 0.6; g.add(rope);
        }
      }
    }
    g.position.set(x, 0, z); g.rotation.y = ry; this.root.add(g);
    return g;
  }

  _portLife() {
    const r = mulberry(77);
    // —— 岗亭（入口西侧，面向主通道）+ 吉利达铁皮牌
    const booth = this._put('booth', -8.4, 100.2, Math.PI / 2);
    this.addBox(-9.7, -7.1, 99.0, 101.4, 2.5);
    const plate = this._put('plate', 0, 0, 0);
    plate.position.set(0, 1.85, 1.22); plate.scale.x = -1; booth.add(plate);
    const plateS = this._put('plate_s', -8.4, 98.6, Math.PI / 2, 1.35);
    // 招工横幅 1：岗亭旁，略侧向主路，不挡通道
    this._hangBanner(0, -5.8, 101.6, Math.PI / 2, true);
    this.addBox(-6.1, -5.5, 98.9, 104.3, 0.2);
    // 招工横幅 2：横向通道转角
    this._hangBanner(1, -7.6, 21.5, Math.PI / 2 + 0.15, true);
    this.addBox(-10.3, -4.9, 21.2, 21.8, 0.2);
    // 招工横幅 3：三号货栈南墙外侧（无杆，贴墙，面向堆场）
    this._hangBanner(2, 58, -17.35, Math.PI, false);

    // —— 华晨达装卸角（仓库西门外北侧，不堵卷帘门）
    const navy = pbr('contpaint', { wear: 0.05, wet: 0.22, env: 1.0, normal: 0.14, rough: 0.58, metal: 0.08, color: 0x1a4e86 });
    const frameN = pbr('steel', { wear: 0.5, wearColor: 0x7a3c22, wet: 0.28, env: 1.15, normal: 0.4, rough: 0.5, metal: 0.9, color: 0xb4bcc4 });
    const liner = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95, metalness: 0 });
    const matC = { M_cont_paint: navy, M_cont_frame: frameN, M_cont_steel: pbr('steel', { color: 0xe4ebf1, wear: 0.1, wearColor: 0x8a4528, wet: 0.18, env: 1.35, normal: 0.35, rough: 0.4, metal: 1 }), M_cont_liner: liner };
    const placeHcd = (x, z, yaw) => {
      const g = new THREE.Group();
      for (const p of meshParts('containers', 'cont40')) {
        const mesh = new THREE.Mesh(p.geometry, matC[p.mat] || navy);
        mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
      }
      // 运行时正向平面，避免 Blender 盒体贴花 UV / 负缩放镜像
      const sideP = this._atlasDecal(0, 1024, 1536, 1536, 6.0, 1.55);
      sideP.position.set(0.15, 1.38, 1.245); g.add(sideP);
      const sideN = this._atlasDecal(0, 1024, 1536, 1536, 6.0, 1.55);
      sideN.position.set(0.15, 1.38, -1.245); sideN.rotation.y = Math.PI; g.add(sideN);
      const door = this._atlasDecal(1536, 1024, 2048, 1536, 1.9, 1.9);
      door.position.set(6.14, 1.32, 0); door.rotation.y = Math.PI / 2; g.add(door);
      g.position.set(x, 0, z); g.rotation.y = yaw; this.root.add(g);
      const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
      const hx = 6.2 * c + 1.3 * s, hz = 6.2 * s + 1.3 * c;
      this.addBox(x - hx, x + hx, z - hz, z + hz, 2.6);
    };
    placeHcd(42.0, 10.2, 0);
    placeHcd(42.0, 12.95, 0);

    // 货垛：托盘 + 木箱/纸箱（华晨达唛头）+ 叉车刚卸/待运
    this._instParts('pallet_stack', [[47.2, 12.4, 0.1], [48.5, 13.3, 1.4]], [0.7, 0.6, 0.75]);
    this._instParts('pallet', [[47.3, 11.2, 0.2], [48.6, 11.3, 0], [46.2, 12.6, 0.4], [10.4, 36.2, 0], [11.6, 36.4, 0.2], [-28.5, 40.2, 0], [3.6, 63.5, 0.1], [44, 4.2, 0], [-4.2, 19.5, 0]], [0.65, 0.55, 0.16]);
    const crates = [[47.2, 12.4, 0, 0.75], [47.2, 12.4, 0.05, 1.35], [48.5, 13.3, 0.2, 0.75], [48.4, 13.2, 0, 1.35], [46.3, 12.5, 0.3, 0.15]];
    this._instParts('crate', crates, [0.5, 0.4, 0.6]);
    crates.forEach(([x, z, ry, y]) => {
      const d = this._atlasDecal(0, 1536, 1024, 1792, 0.85, 0.28);
      d.position.set(x, (y || 0) + 0.42, z + Math.cos(ry) * 0.38);
      d.rotation.y = ry; this.root.add(d);
    });
    this._instParts('carton', [[46.4, 11.4, 0.2, 0], [46.4, 11.4, 0.1, 0.4], [46.9, 11.5, 0.4, 0], [47.8, 11.15, 0, 0.15], [45.6, 12.8, 0.2]], [0.35, 0.25, 0.4]);
    // 叉车：货叉朝向货垛
    this._put('forklift', 47.0, 8.4, 0.08);
    this.addBox(45.9, 48.1, 6.6, 10.4, 2.2);
    this._put('forklift', 10.8, 33.6, 0.15);
    this.addBox(9.6, 12.0, 31.8, 35.6, 2.2);
    this._put('forklift', 54.8, 8.6, -Math.PI / 2); // 仓库门外侧
    this.addBox(52.9, 56.8, 7.5, 9.8, 2.2);

    // 厢货（华晨达），停在仓库南侧，不挡门
    const truck = this._put('truck', 52.5, -13.5, Math.PI / 2);
    this.addBox(49.2, 55.8, -14.8, -12.2, 2.6);
    const td = this._atlasDecal(1024, 1536, 2048, 1792, 3.5, 1.15);
    td.position.set(0, 1.5, 1.16); truck.add(td);
    const td2 = this._atlasDecal(1024, 1536, 2048, 1792, 3.5, 1.15);
    td2.position.set(0, 1.5, -1.16); td2.rotation.y = Math.PI; truck.add(td2);

    // 指示牌
    this._put('sign_hcd_a', 6.4, 21.0, -Math.PI / 2);
    this.addBox(6.2, 6.6, 20.8, 21.2, 2.1);
    this._put('sign_hcd_b', 6.4, -22.0, 0.15);
    this.addBox(6.2, 6.6, -22.2, -21.8, 2.1);

    // —— 巷道与维修区道具（成组，避开主通道 |x|<5.3）
    this._instParts('cone', [
      [3.7, 52, 0], [4.0, 50.2, 0.2], [3.6, 48.5, 0], [3.9, -14.5, 0], [4.1, -16, 0.1],
      [-3.8, 51, 0], [-3.7, -13.8, 0], [8.6, -46, 0], [-15.5, -43, 0], [47.6, 9.2, 0.2],
      [46.8, 7.4, 0], [8.8, 36, 0], [12.6, 36.8, 0.3], [-8.8, 82.5, 0], [-8.6, 86.5, 0.2],
      [50.4, -15.5, 0], [54.8, -15.2, 0.1], [3.8, 22, 0], [-7.2, 24, 0.2]
    ], [0.22, 0.22, 0.75]);
    this._instParts('impact', [[4.5, 46.5, 0], [-4.4, 46.8, 0], [9.2, -48, 0.1], [48, 6.5, 0], [-16, 50, 0]], [0.35, 0.35, 1.0]);
    this._instParts('bollard', [[5.0, 58, 0], [-5.0, 58, 0], [5.0, -36, 0], [-5.0, -36, 0], [50.2, -10, 0], [50.2, 8, 0]], [0.18, 0.18, 0.9]);
    this._instParts('drum', [[-29.5, 39.2, 0.2], [-29.0, 40.0, 0], [44.2, 5.1, 0.4], [12.2, 37.4, 0], [45.4, 13.6, 0.3], [70.2, -12.4, 0], [-28.8, 39.5, 0.5], [12.8, 37.0, 0.35]], [0.35, 0.35, 0.9]);
    this._instParts('drum_plas', [[-30.2, 39.8, 0.1], [44.8, 4.4, 0], [70.8, -12.4, 0.2], [55.6, 12.5, 0]], [0.35, 0.35, 0.9]);
    this._instParts('ibc', [[45.5, 14.6, 0.1], [-31.2, 38.6, 0.2], [70.4, -10.6, 0], [13.4, 37.6, 0.15]], [0.65, 0.55, 1.2]);
    this._instParts('reel', [[-32, 41, 0.4], [14.6, -31, 0], [49, 15.5, 0.2]], [0.7, 0.55, 1.2]);
    this._instParts('tire', [[11.2, 32.2, 0], [11.2, 32.2, 0, 0.45], [11.2, 32.2, 0.2, 0.9], [49.6, 7.2, 0], [-8.2, 81.5, 0]], [0.4, 0.4, 0.7]);
    this._instParts('jack', [[46.0, 10.2, 0.6], [11.0, 35.0, -0.2], [55.2, 11.2, 1.2]], [0.4, 0.8, 0.5]);
    this._instParts('dumpster', [[-12.2, 100.5, 0.2], [72, -16.5, 0], [-40, 46, 0.3]], [0.9, 0.55, 1.15]);
    this._instParts('planks', [[48.8, 14.8, 0.3], [-27.8, 41.5, 0.5], [13.8, 35.2, 0]], [0.7, 0.3, 0.45]);
    this._instParts('block', [[-6.8, 86.8, 0.2], [50.6, 9.6, 0], [-16.5, 49, 0.1]], [0.45, 0.25, 0.6]);
    this._instParts('firebox', [[-8.6, 80.6, Math.PI / 2, 0], [50.3, -8, Math.PI / 2, 0], [5.2, -36, 0, 0]], [0.4, 0.2, 1.0]);
    this._instParts('pallet_worn', [[-4.2, 18.8, 0.3], [14.2, -30.5, 0.1], [-33, -52, 0]], [0.65, 0.55, 0.16]);

    // 铁丝网围出西侧一小块禁行/堆料区
    this._instParts('fence', [
      [-16.5, 50, Math.PI / 2], [-16.5, 52.4, Math.PI / 2], [-16.5, 54.8, Math.PI / 2],
      [-13.0, 56.0, 0], [-10.6, 56.0, 0],
      [-9.2, 53.6, Math.PI / 2], [-9.2, 51.2, Math.PI / 2]
    ], [1.3, 0.12, 2.05]);

    // 冷藏箱机组：部分落地 40ft 箱端部（不挂华晨达那两只）
    const reefItems = [];
    for (const it of this.cont.list) {
      if (it.long !== 0 || it.y > 1.6) continue;
      if (Math.abs(it.x - 36.2) < 8 && Math.abs(it.z - 12.6) < 5) continue;
      if (Math.abs(it.x) < 8) continue;
      if (r() > 0.18) continue;
      const dir = Math.cos(it.yaw || 0);
      reefItems.push([it.x + dir * 6.32, it.z, it.yaw || 0, it.y - 1.295]);
      if (reefItems.length >= 10) break;
    }
    this._instParts('reefer', reefItems, [1.2, 0.35, 2.2]);

    // —— 仓库内部（已有西侧卷帘门可进入）
    const racks = [[69.5, -10, Math.PI / 2], [69.5, 0, Math.PI / 2], [69.5, 10, Math.PI / 2],
      [57, 15.2, 0], [63, 15.2, 0], [57, -15.2, Math.PI], [63, -15.2, Math.PI]];
    this._instParts('rack', racks, [1.3, 0.55, 3.2]);
    // 加两排货架，避开门口到后墙的中间通道 |z|<3.5
    this._instParts('rack', [[69.5, -5, Math.PI / 2], [69.5, 5, Math.PI / 2], [60, 15.2, 0], [60, -15.2, Math.PI]], [1.3, 0.55, 3.2]);
    this._put('bench', 53.5, -14.2, 0.1);
    this.addBox(52.5, 54.5, -14.7, -13.7, 1.0);
    this._instParts('pipes', [[68, -8, 0, 8.6], [68, 6, 0.2, 8.6], [55, 14.8, Math.PI / 2, 8.4]], null);
    this._instParts('elecbox', [[70.6, -14, -Math.PI / 2, 1.2], [70.6, 14, -Math.PI / 2, 1.2]], [0.3, 0.15, 1.2]);
    this._instParts('pallet_stack', [[54, 13.5, 0.2], [66, -12, 0.4], [67.5, 13.2, 0], [54.5, -13.6, 0.3]], [0.7, 0.6, 0.75]);
    this._instParts('ibc', [[66.5, 12.8, 0.1], [54.2, -12.6, 0], [68.2, -14.4, 0.15]], [0.65, 0.55, 1.2]);
    this._instParts('drum', [[55.2, -13.4, 0], [55.8, -13.1, 0.3], [66.8, 11.8, 0.2], [67.4, 11.5, 0], [68.0, 11.9, 0.25], [54.8, 14.4, 0.2]], [0.35, 0.35, 0.9]);
    this._instParts('drum_plas', [[55.4, 14.0, 0], [66.2, -14.6, 0.15], [67.0, -14.2, 0]], [0.35, 0.35, 0.9]);
    this._instParts('carton', [
      [54.4, 12.6, 0.2, 0], [54.4, 12.6, 0, 0.4], [65.5, -11.2, 0.3],
      [69.0, -10.2, 0, 0.2], [69.0, -10.2, 0.1, 0.6], [69.2, 0.0, 0.2, 0.2],
      [69.0, 10.2, 0, 0.2], [57.2, 14.6, 0.2, 0], [57.2, 14.6, 0, 0.4],
      [63.2, -14.6, 0.15, 0], [63.2, -14.6, 0, 0.4], [54.8, -14.0, 0.3, 0.15]
    ], [0.35, 0.25, 0.4]);
    this._instParts('pallet', [[54.2, 11.6, 0], [66.4, 13.6, 0.2], [66.8, -13.2, 0.1], [55.6, 13.8, 0.3]], [0.65, 0.55, 0.16]);
    // 室内叉车靠北侧货架，不挡门口直线
    this._put('forklift', 58.5, 8.6, -0.35);
    this.addBox(57.3, 59.7, 6.8, 10.6, 2.2);

    // 大门射灯：只留 Spotlight + 门口微光精灵，不再放几何锥体/硬边体积光网格
    const spot = new THREE.SpotLight(0xdde8f4, 28, 28, 0.55, 0.82, 1.15);
    spot.position.set(49.2, 7.4, 0); spot.target.position.set(63, 0.2, 0);
    this.root.add(spot); this.root.add(spot.target);
    this.doorSpot = spot; this.lights.push(spot);
    this._lampGlow(50.4, 6.8, 0, 0xd8e4f0, 4.2, false, 0.55);
    this._lampGlow(56, 2.4, 0, 0xc8d4e0, 6.5, true, 0.28);
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
      const light = new THREE.PointLight(0xffa040, 11, 11, 1.8); light.position.set(0, 3.4, 0.9); g.add(light);
      this.lights.push(light);
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
      r.cut = false; r.lightMat.color.set(0xffb347); r.glow.material.color.set(0xffb347); r.glow.material.opacity = 0.9; r.light.color.set(0xffa040); r.light.intensity = r.light.visible ? 11 : 0;
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
    this.updateLamps(t);
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
