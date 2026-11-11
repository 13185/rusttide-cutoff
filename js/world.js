// 港区场景：堆场、仓库、码头、起重机、中继与撤离艇（全部程序化建模，原创）
import * as THREE from '../vendor/three/three.module.js';
import { mulberry } from './util.js';
import * as TX from './textures.js';

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
  }

  _mats() {
    const r = this.rng;
    this.mat = {
      steel: new THREE.MeshStandardMaterial({ color: 0x3b3d3f, roughness: 0.55, metalness: 0.7, map: TX.noiseTexture('#5a5550', 11) }),
      craneRed: new THREE.MeshStandardMaterial({ color: 0xb4aca0, roughness: 0.55, metalness: 0.3, map: TX.noiseTexture('#a9a196', 12) }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.9, map: TX.noiseTexture('#77736c', 13, false) }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6, metalness: 0.5 }),
      yellow: new THREE.MeshStandardMaterial({ color: 0xc89a2e, roughness: 0.55, metalness: 0.3, map: TX.noiseTexture('#c89a2e', 14) }),
      wall: new THREE.MeshStandardMaterial({ color: 0x8c8e8c, roughness: 0.6, metalness: 0.2, map: TX.corrugatedTexture('#6f7675', 15) }),
      roof: new THREE.MeshStandardMaterial({ color: 0x4a4a48, roughness: 0.5, metalness: 0.6, map: TX.corrugatedTexture('#4c4a46', 16) }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 }),
      white: new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.4 }),
      amberLamp: new THREE.MeshBasicMaterial({ color: 0xffc27a }),
      orange: new THREE.MeshStandardMaterial({ color: 0xd2622a, roughness: 0.6 })
    };
    this.mat.wall.map.repeat.set(6, 1);
    this.mat.roof.map.repeat.set(8, 4);
  }

  addBox(x0, x1, z0, z1, y1, y0 = 0) { this.boxes.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1 }); }

  _ground() {
    const t = TX.groundTextures();
    t.map.repeat.set(36, 36); t.rough.repeat.set(22, 22);
    const mat = new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.rough, roughness: 1.0, metalness: 0.0, color: 0x8a857c });
    this.groundMat = mat;
    this.refl.patch(mat, { amount: 1.0 });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(240, 170, 1, 1), mat);
    g.rotation.x = -Math.PI / 2; g.position.set(0, 0, 10 - 0.0);
    g.position.z = (QUAY_Z + 108) / 2; // 从岸线到南端
    g.geometry = new THREE.PlaneGeometry(240, 108 - QUAY_Z, 1, 1);
    g.receiveShadow = true;
    this.root.add(g);
    this.ground = g;
    this.refl.hidden.push(g);
    // 车道线、斑马线（贴花）
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.35, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    const yMat = new THREE.MeshStandardMaterial({ color: 0xd4a23a, roughness: 0.4, transparent: true, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
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
    const palette = ['#9a4a2e', '#40647a', '#4d6e56', '#85847c', '#a8692f', '#74393a', '#bdb7a7', '#4f5b68'];
    const prefix = ['HGKU', 'JKXU', 'RTCU', 'MNBU', 'TOLU', 'QEAU', 'WDLU', 'PCHU'];
    const variants = palette.map((c, i) => {
      const t = TX.containerTextures(c, 100 + i, `${prefix[i]} ${String(100000 + Math.floor(r() * 899999))} ${Math.floor(r() * 9)}`);
      const mat = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, roughnessMap: t.rough, roughness: 0.62, metalness: 0.22, normalScale: new THREE.Vector2(0.9, 0.9) });
      t.normal.repeat.set(4, 1);
      return mat;
    });
    // 端面/顶面只取贴图左侧无文字区域，避免编号被拉伸
    const fixUV = (geo, long) => {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4);
        let u = uv.getX(i), v = uv.getY(i);
        if (face === 0 || face === 1) u = u * 0.22;            // 端门
        else if (face === 2 || face === 3) { u = u * (long ? 1 : 0.5); v = v * 0.25 + 0.4; } // 顶/底
        else if (!long) u = u * 0.5 + 0.5;                     // 20 尺箱取右半（含编号）
        uv.setXY(i, u, v);
      }
      uv.needsUpdate = true; return geo;
    };
    const geo40 = fixUV(new THREE.BoxGeometry(12.19, 2.59, 2.44), true);
    const geo20 = fixUV(new THREE.BoxGeometry(6.06, 2.59, 2.44), false);
    const inst = variants.map((m) => [new THREE.InstancedMesh(geo40, m, 700), new THREE.InstancedMesh(geo20, m, 300)]);
    inst.flat().forEach((im) => { im.count = 0; im.castShadow = true; im.receiveShadow = true; this.root.add(im); });
    this.containers = inst;
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
    const place = (x, z, long, levels, variantSeed) => {
      const L = long ? 12.19 : 6.06;
      for (let k = 0; k < levels; k++) {
        const v = Math.floor(r() * variants.length);
        const im = inst[v][long ? 0 : 1];
        const jitter = (r() - 0.5) * 0.18;
        _q.setFromEuler(new THREE.Euler(0, (r() - 0.5) * 0.012, 0));
        _m.compose(_p.set(x + jitter, 1.295 + k * 2.6, z + (r() - 0.5) * 0.08), _q, _s.set(r() < 0.5 ? 1 : -1, 1, 1));
        im.setMatrixAt(im.count++, _m);
      }
      return L;
    };
    // 行：沿 x 方向排布，每行两列（宽 4.9m）
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
    inst.flat().forEach((im) => { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); });
  }

  _crane(cx, h = 38) {
    const B = new BeamSet(this.mat.craneRed, 400);
    const z0 = QUAY_Z + 2, z1 = QUAY_Z + 22;
    const legs = [[-8, z0], [8, z0], [-8, z1], [8, z1]];
    for (const [x, z] of legs) {
      B.box(cx + x, h / 2, z, 1.4, h, 1.4);
      this.addBox(cx + x - 1, cx + x + 1, z - 1, z + 1, h);
      B.box(cx + x, 0.6, z, 2.4, 1.2, 4.5);
    }
    // 门框横梁 + 斜撑
    for (const z of [z0, z1]) {
      B.box(cx, h, z, 18, 1.6, 1.6); B.box(cx, h * 0.45, z, 16, 1.0, 1.0);
      B.beam(new THREE.Vector3(cx - 8, h * 0.45, z), new THREE.Vector3(cx, h, z), 0.6);
      B.beam(new THREE.Vector3(cx + 8, h * 0.45, z), new THREE.Vector3(cx, h, z), 0.6);
    }
    for (const x of [-8, 8]) {
      B.box(cx + x, h * 0.45, (z0 + z1) / 2, 1, 1, z1 - z0);
      B.beam(new THREE.Vector3(cx + x, 2, z0), new THREE.Vector3(cx + x, h * 0.45, z1), 0.5);
    }
    // 大臂：伸向海面
    const bh = h + 4;
    for (const x of [-3, 3]) {
      B.box(cx + x, bh, QUAY_Z - 20, 1.2, 2.4, 110);
      for (let z = QUAY_Z - 72; z < QUAY_Z + 32; z += 6) B.beam(new THREE.Vector3(cx + x, bh - 1.1, z), new THREE.Vector3(cx + x, bh + 1.1, z + 6), 0.25);
    }
    for (let z = QUAY_Z - 72; z < QUAY_Z + 32; z += 6) B.box(cx, bh - 1.2, z, 6, 0.3, 0.3);
    // A 字塔 + 拉杆
    const apex = new THREE.Vector3(cx, h + 22, z1 - 3);
    for (const x of [-3, 3]) {
      B.beam(new THREE.Vector3(cx + x, h, z1), apex, 1.0);
      B.beam(new THREE.Vector3(cx + x, h, z0), apex, 0.8);
      B.beam(apex, new THREE.Vector3(cx + x, bh + 1, QUAY_Z - 50), 0.25);
      B.beam(apex, new THREE.Vector3(cx + x, bh + 1, QUAY_Z + 30), 0.25);
    }
    // 机房、小车、吊具
    B.box(cx, h + 4, z1 + 4, 8, 5, 8);
    B.box(cx, bh - 2.4, QUAY_Z - 6, 5, 2.6, 4);
    const steelSet = new BeamSet(this.mat.dark, 20);
    for (let i = 0; i < 4; i++) steelSet.beam(new THREE.Vector3(cx - 1.6 + i * 1.07, bh - 3.7, QUAY_Z - 6), new THREE.Vector3(cx - 1.6 + i * 1.07, 16, QUAY_Z - 6), 0.08);
    steelSet.box(cx, 15.5, QUAY_Z - 6, 12, 1, 2.6);
    this.root.add(B.done(), steelSet.done());
    // 航空障碍灯
    this._lampGlow(cx, h + 22.5, z1 - 3, 0xff3a28, 2.2, false);
  }

  _cranes() {
    this._crane(-34); this._crane(-2); this._crane(30, 40);
    // 堆场轮胎吊（RTG）
    const rtg = (cx, cz) => {
      const B = new BeamSet(this.mat.yellow, 60);
      for (const x of [-11, 11]) for (const z of [-3.5, 3.5]) { B.box(cx + x, 9, cz + z, 0.9, 18, 0.9); B.box(cx + x, 0.7, cz + z, 1.6, 1.4, 1.6); }
      for (const x of [-11, 11]) { B.box(cx + x, 18, cz, 1.2, 1.4, 8); B.box(cx + x, 6, cz, 0.6, 0.6, 7); }
      for (const z of [-3.5, 3.5]) B.box(cx, 18.6, cz + z, 24, 1.4, 1.2);
      B.box(cx + 4, 17.6, cz, 3, 2, 6);
      this.root.add(B.done());
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
    const B = new BeamSet(this.mat.steel, 200);
    this.lights = [];
    pts.forEach(([x, z], i) => {
      const h = 16;
      B.box(x, h / 2, z, 0.35, h, 0.35);
      B.box(x, h, z, 2.6, 0.25, 0.5);
      B.box(x, 0.4, z, 0.8, 0.8, 0.8);
      this.addBox(x - 0.3, x + 0.3, z - 0.3, z + 0.3, h);
      for (const dx of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.4), this.mat.amberLamp);
        lamp.position.set(x + dx * 0.9, h - 0.15, z); this.root.add(lamp);
      }
      this._lampGlow(x, h - 0.3, z, 0xffb366, 5.5);
      if (i < 6) {
        const L = new THREE.PointLight(0xffa860, 26, 26, 1.7);
        L.position.set(x, h - 1, z); this.root.add(L); this.lights.push(L);
      }
    });
    this.root.add(B.done());
  }

  _props() {
    const r = mulberry(91);
    // 混凝土隔离墩（掩体）
    const jersey = new THREE.CylinderGeometry(0.25, 0.5, 0.9, 4, 1); jersey.rotateY(Math.PI / 4); jersey.scale(1, 1, 1);
    const barrierGeo = new THREE.BoxGeometry(3, 0.95, 0.6);
    const barriers = [[-3.6, 50, 1.57], [3.6, 12, 1.57], [-3.6, -14, 1.57], [8, -46, 0.1], [-16, -44, 1.57], [20, -50, 0], [-40, -40, 0.3], [30, 10, 1.57], [-24, 30, 1.57], [-44, 44, 0], [48, -6, 0], [-36, -56, 0], [-26, -55, 1.2], [44, 9, 1.57], [-30, 32, 0]];
    const bm = new THREE.InstancedMesh(barrierGeo, this.mat.concrete, barriers.length); bm.castShadow = bm.receiveShadow = true;
    barriers.forEach(([x, z, ry], i) => {
      _m.compose(_p.set(x, 0.47, z), _q.setFromEuler(new THREE.Euler(0, ry, 0)), _s.set(1, 1, 1)); bm.setMatrixAt(i, _m);
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
    const crate = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.85, map: TX.noiseTexture('#6b5236', 33, false) });
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
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 1.0), new THREE.MeshStandardMaterial({ color: 0xa8aaa4, roughness: 0.5, metalness: 0.2, emissive: 0x2a2620, emissiveIntensity: 1.0, map: TX.noiseTexture('#6a6c6c', 70 + def.id.charCodeAt(0)) }));
      cab.position.y = 1.1; cab.castShadow = cab.receiveShadow = true; g.add(cab);
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 1.8), this.mat.concrete); base.position.y = 0.15; base.receiveShadow = true; g.add(base);
      const mast = new BeamSet(this.mat.steel, 64);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; mast.beam(new THREE.Vector3(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5 - 1.3), new THREE.Vector3(Math.cos(a) * 0.15, 9, Math.sin(a) * 0.15 - 1.3), 0.07); }
      for (let y = 1; y < 9; y += 1.2) mast.box(0, y, -1.3, 0.8 - y * 0.07, 0.05, 0.05);
      g.add(mast.done());
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.2, 0.25, 16), this.mat.white); dish.position.set(0, 7.2, -1.1); dish.rotation.x = Math.PI / 2.4; g.add(dish);
      // 状态灯 / 屏幕
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.32), lightMat); panel.position.set(0, 1.5, -0.51); panel.rotation.y = Math.PI; g.add(panel);
      const panel2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.32), lightMat); panel2.position.set(0, 1.5, 0.51); g.add(panel2);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.16, 1.04), this.mat.yellow); stripe.position.y = 0.45; g.add(stripe);
      for (let k = 0; k < 5; k++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.02), this.mat.dark); v.position.set(0, 0.8 + k * 0.08, 0.52); g.add(v); }
      const lab2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.38), new THREE.MeshStandardMaterial({ map: TX.signTexture(['中继 ' + def.id, '主控上行'], { w: 256, h: 112, size: 40, bg: '#ffb347', fg: '#14110d' }) })); lab2.position.set(0, 2.0, 0.51); g.add(lab2);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), lightMat); beacon.position.set(0, 9.2, -1.3); g.add(beacon);
      const glow = this._lampGlow(def.x, 9.2, def.z - 1.3, 0xffb347, 3.5, false);
      const sideLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.38), new THREE.MeshStandardMaterial({ map: TX.signTexture(['中继 ' + def.id, '主控上行'], { w: 256, h: 112, size: 40, bg: '#ffb347', fg: '#14110d' }) }));
      sideLabel.position.set(0, 2.0, -0.51); sideLabel.rotation.y = Math.PI; g.add(sideLabel);
      const cable = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.05, 6, 20, Math.PI), this.mat.rubber); cable.position.set(1.0, 0, 0.6); cable.rotation.y = 1.2; g.add(cable);
      const light = new THREE.PointLight(0xffa040, 16, 12, 1.8); light.position.set(0, 3.4, 0.9); g.add(light);
      this.root.add(g);
      this.addBox(def.x - 0.85, def.x + 0.85, def.z - 0.55, def.z + 0.55, 2.2);
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
    const g = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x34424a, roughness: 0.4, metalness: 0.55, map: TX.noiseTexture('#46545c', 81) });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xb9bcb8, roughness: 0.5, metalness: 0.2, map: TX.noiseTexture('#c4c6c0', 82) });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1216, roughness: 0.05, metalness: 0.9, emissive: 0xffb36a, emissiveIntensity: 0.55 });
    // 俯视轮廓（船头朝 -x），向上挤出成船体
    const sh = new THREE.Shape();
    sh.moveTo(7, -2.6); sh.lineTo(-3, -2.6); sh.quadraticCurveTo(-7.5, -2.2, -10, 0); sh.quadraticCurveTo(-7.5, 2.2, -3, 2.6); sh.lineTo(7, 2.6); sh.closePath();
    const hullGeo = new THREE.ExtrudeGeometry(sh, { depth: 1.8, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.2, bevelSegments: 2 });
    hullGeo.rotateX(-Math.PI / 2);
    const hull = new THREE.Mesh(hullGeo, hullMat); hull.position.y = -0.4; hull.castShadow = hull.receiveShadow = true; g.add(hull);
    const bandGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.28, bevelEnabled: false }); bandGeo.rotateX(-Math.PI / 2); bandGeo.scale(1.03, 1, 1.06);
    const band = new THREE.Mesh(bandGeo, this.mat.orange); band.position.y = 1.15; g.add(band);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(15.5, 0.12, 4.8), this.mat.dark); deck.position.set(-0.8, 1.45, 0); g.add(deck);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.0, 3.6), whiteMat); cabin.position.set(1.5, 2.5, 0); cabin.castShadow = true; g.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.18, 4.0), whiteMat); roof.position.set(1.3, 3.58, 0); g.add(roof);
    const win = new THREE.Mesh(new THREE.BoxGeometry(5.25, 0.7, 3.65), glassMat); win.position.set(1.5, 2.95, 0); g.add(win);
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 3.2), glassMat); front.position.set(-1.12, 2.9, 0); front.rotation.z = -0.35; g.add(front);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2), this.mat.steel); mast.position.set(2.5, 5.2, 0); g.add(mast);
    const yard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 1.6), this.mat.steel); yard.position.set(2.5, 6.2, 0); g.add(yard);
    const posts = new BeamSet(this.mat.steel, 80);
    for (let x = -7; x <= 6.5; x += 1.5) for (const z of [-2.4, 2.4]) posts.box(x, 1.95, z, 0.05, 0.9, 0.05);
    for (const z of [-2.4, 2.4]) posts.box(-0.25, 2.4, z, 13.6, 0.05, 0.05);
    g.add(posts.done());
    for (const x of [-6, -2, 5]) for (const z of [-2.75, 2.75]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10), this.mat.rubber); f.rotation.x = Math.PI / 2; f.position.set(x, 0.7, z); g.add(f); }
    g.position.set(BOAT.x, -1.45, BOAT.z + 2.4); g.rotation.y = 0;
    this.root.add(g);
    this.boat = g;
    // 跳板（从岸边斜向甲板）
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 5.2), this.mat.steel); ramp.position.set(BOAT.x, -0.25, QUAY_Z - 2.3); ramp.rotation.x = -0.12; this.root.add(ramp);
    const rails = new BeamSet(this.mat.yellow, 20);
    for (const dx of [-0.7, 0.7]) rails.box(BOAT.x + dx, 0.55, QUAY_Z - 2.3, 0.05, 0.05, 5.2);
    this.root.add(rails.done());
    this.boatBeacon = this._lampGlow(BOAT.x + 2.5, 5.0, BOAT.z + 2.4, 0x6ad1ff, 4.5, false);
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
