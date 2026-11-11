// 港区失控机械：机械猎犬 / 机械飞鸥 / 机械守卫（程序化建模，原创设计）
import * as THREE from '../vendor/three/three.module.js';
import { RELAYS, QUAY_Z } from './world.js';
import { A, pbr, instance } from './assets.js';


export const TYPES = {
  hound: { name: '机械猎犬', hp: 70, speed: 7.2, weakMul: 2.5, score: 100 },
  gull: { name: '机械飞鸥', hp: 42, speed: 9, weakMul: 2.5, score: 120 },
  warden: { name: '机械守卫', hp: 460, speed: 2.3, weakMul: 3, score: 400 }
};


let M = null;
function mats() {
  if (M) return M;
  M = {
    hull: pbr('enemy', { color: 0x8a9096, wearColor: 0xb5b7b8, env: 1.5 }),
    plate: pbr('enemy', { color: 0xc2bdb2, wearColor: 0xa9aaab, env: 1.5 }),
    hazard: pbr('enemy', { color: 0xe0a83e, wearColor: 0x9d9e9f, env: 1.4 }),
    joint: pbr('steel', { color: 0x666666 }),
    piston: new THREE.MeshStandardMaterial({ color: 0xd8dadc, roughness: 0.18, metalness: 1 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6, metalness: 0.2 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a28, emissiveIntensity: 6, roughness: 0.3 }),
    core: new THREE.MeshStandardMaterial({ color: 0x221000, emissive: 0xffb347, emissiveIntensity: 5, roughness: 0.3 })
  };
  M.byName = { M_en_hull: M.hull, M_en_plate: M.plate, M_en_hazard: M.hazard, M_en_joint: M.joint, M_en_piston: M.piston, M_en_cable: M.cable, M_weak_red: M.eye, M_weak_amber: M.core };
  return M;
}
const flashMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.5 });

// Blender 模型（正面朝 +Z），外面包一层旋转 π 的节点使其朝 -Z，与游戏坐标一致
function model(name) {
  const m = mats();
  const inner = instance('enemies', name, (n) => m.byName[n]);
  inner.rotation.y = Math.PI;
  const g = new THREE.Group(); g.add(inner);
  const by = (n) => inner.getObjectByName(n);
  return { g, inner, by };
}

function buildHound() {
  const { g, by } = model('hound');
  const body = by('hound_body'), head = by('hound_head'), eye = by('weak_eye');
  const legs = [];
  for (const n of ['FL', 'FR', 'BL', 'BR']) {
    const hip = by(`hleg${n}_hip`), knee = by(`hleg${n}_knee`);
    legs.push({ hip, knee, ph: (n[1] === 'L' ? 0 : Math.PI) + (n[0] === 'B' ? Math.PI : 0) });
  }
  return { g, body, head, legs, eye, hit: [
    { obj: eye, r: 0.2, weak: true }, { obj: body, r: 0.5, weak: false, off: new THREE.Vector3(0, 0, 0.2) }, { obj: body, r: 0.45, weak: false, off: new THREE.Vector3(0, 0, -0.45) }
  ] };
}

function buildGull() {
  const { g, by } = model('gull');
  const body = by('gull_body'), eye = by('weak_core');
  const wings = [];
  for (const n of ['L', 'R']) { const piv = by('gull_wing' + n); wings.push({ piv, tip: by('gull_tip' + n), s: piv.position.x > 0 ? 1 : -1 }); }
  return { g, body, wings, eye, hit: [{ obj: eye, r: 0.2, weak: true }, { obj: body, r: 0.42, weak: false }, { obj: body, r: 0.5, weak: false, off: new THREE.Vector3(0.9, 0, 0) }, { obj: body, r: 0.5, weak: false, off: new THREE.Vector3(-0.9, 0, 0) }] };
}

function buildWarden() {
  const { g, by } = model('warden');
  const pelvis = by('warden_pelvis'), torso = by('warden_torso'), head = by('warden_head');
  const visor = by('weak_visor'), back = by('weak_back');
  const arms = [];
  for (const n of ['R', 'L']) arms.push({ sh: by('warden_sh' + n), fore: by('warden_fore' + n), s: n === 'R' ? 1 : -1 });
  const legs = [];
  for (const n of ['R', 'L']) legs.push({ hip: by(`wleg${n}_hip`), knee: by(`wleg${n}_knee`), s: n === 'R' ? 1 : -1 });
  return { g, pelvis, torso, head, arms, legs, eye: visor, back, muzzle: by('warden_muzzle'), hit: [
    { obj: back, r: 0.42, weak: true }, { obj: visor, r: 0.28, weak: true }, { obj: torso, r: 0.85, weak: false }, { obj: pelvis, r: 0.6, weak: false, off: new THREE.Vector3(0, -0.6, 0) }, { obj: pelvis, r: 0.5, weak: false, off: new THREE.Vector3(0, -1.2, 0) }
  ] };
}

const BUILD = { hound: buildHound, gull: buildGull, warden: buildWarden };

// 刷新点：港区各处
const SPAWNS = [
  [-60, 60], [-60, 20], [-62, -10], [-50, -34], [-14, -56], [16, -56], [52, -40], [64, -30], [66, 34], [60, 66], [30, 72], [-30, 74], [-20, -32], [24, 30], [-44, 0], [12, -6], [40, 60], [-66, 44], [-8, 40], [8, -50]
];

export class Enemies {
  constructor(scene, world, fx, audio) {
    this.scene = scene; this.world = world; this.fx = fx; this.audio = audio;
    this.list = [];
    this.bolts = [];
    this.boltGeo = new THREE.SphereGeometry(0.09, 8, 6);
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xff7a3a });
    this.onKill = null;
    this.nav = null; this.pathBudget = 0; this.navStats = { paths: 0, stuck: 0, unstuck: 0 };
    this.flankSide = 1;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3();
  }
  clear() {
    for (const e of this.list) this.scene.remove(e.g);
    for (const b of this.bolts) this.scene.remove(b.m);
    this.list.length = 0; this.bolts.length = 0;
  }
  alive() { return this.list.filter((e) => e.alive).length; }
  countType(t) { return this.list.filter((e) => e.alive && e.type === t).length; }

  pickSpawn(player, minD = 30) {
    const pp = player.position;
    const cands = SPAWNS.map(([x, z]) => ({ x, z, d: Math.hypot(x - pp.x, z - pp.z) })).filter((c) => c.d > minD && c.d < 95);
    if (!cands.length) return { x: SPAWNS[0][0], z: SPAWNS[0][1] };
    cands.sort((a, b) => a.d - b.d);
    const pool = cands.slice(0, Math.max(3, Math.ceil(cands.length / 2)));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  spawn(type, player, at) {
    const def = TYPES[type];
    const p = at || this.pickSpawn(player, type === 'gull' ? 26 : 30);
    const b = BUILD[type]();
    const e = { type, def, ...b, hp: def.hp, maxHp: def.hp, alive: true, t: Math.random() * 10, cool: 1.5 + Math.random() * 2, state: 'hunt', dash: 0, flash: 0, burst: 0, burstT: 0, orbit: Math.random() * 6.28, dying: 0 };
    let sx = p.x, sz = p.z;
    if (this.nav && type !== 'gull') { const k = this.nav.nearest(sx, sz, 2, 16); if (k >= 0) { const c = this.nav.center(k); sx = c.x; sz = c.z; } }
    e.pos = new THREE.Vector3(sx, type === 'gull' ? 12 + Math.random() * 5 : 0, sz);
    e.flank = (this.flankSide = -this.flankSide); e.path = null; e.repath = 0; e.prog = { x: sx, z: sz, t: 0 }; e.stuck = 0; e.mode = 'orbit';
    e.yaw = 0;
    e.g.position.copy(e.pos);
    e.g.traverse((o) => { if (o.isMesh) o.userData.baseMat = o.material; });
    this.scene.add(e.g);
    this.list.push(e);
    this.audio && this.audio.enemyVoice(type, 'spawn', e.pos);
    return e;
  }

  // 射线命中：返回最近命中 {e, t, weak, point}
  raycast(o, d, maxT) {
    let best = null;
    for (const e of this.list) {
      if (!e.alive) continue;
      // 粗筛
      const cx = e.pos.x - o.x, cy = e.pos.y + 1 - o.y, cz = e.pos.z - o.z;
      const along = cx * d.x + cy * d.y + cz * d.z;
      if (along < 0 || along > maxT + 3) continue;
      for (const h of e.hit) {
        const c = this._v;
        if (h.off) c.copy(h.off).applyMatrix4(h.obj.matrixWorld); else h.obj.getWorldPosition(c);
        const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
        const bq = ox * d.x + oy * d.y + oz * d.z; const cq = ox * ox + oy * oy + oz * oz - h.r * h.r;
        const disc = bq * bq - cq; if (disc < 0) continue;
        let t = -bq - Math.sqrt(disc);
        if (t <= 0 && -bq + Math.sqrt(disc) > 0) t = 0.05; // 贴脸射击
        const tt = h.weak ? t - 0.2 : t;
        if (t > 0 && t < maxT && (!best || tt < best.tt)) best = { e, t, tt, weak: h.weak, point: o.clone().addScaledVector(d, t) };
      }
    }
    return best;
  }

  damage(e, amount, weak, point, preMul = false) {
    if (!e.alive) return false;
    const dmg = preMul ? amount : amount * (weak ? e.def.weakMul : 1);
    e.hp -= dmg; e.flash = 0.08;
    if (!preMul) this.fx.spark(point, weak ? 14 : 6, weak ? [1, 0.55, 0.2] : [1, 0.85, 0.6], weak ? 7 : 5, 0.35, 0.07);
    if (e.state === 'idle') e.state = 'hunt';
    if (e.hp <= 0) { this.kill(e); return true; }
    return false;
  }
  kill(e) {
    e.alive = false; e.dying = 1.2;
    const c = e.g.position.clone(); c.y += e.type === 'warden' ? 2 : e.type === 'gull' ? 0 : 0.8;
    this.fx.burst(c, [1, 0.6, 0.25], e.type === 'warden' ? 1.6 : 0.8);
    const m = mats(); this.fx.debrisBurst(c, [m.hull, m.plate, m.joint, m.hazard], e.type === 'warden' ? 16 : 9, e.type === 'warden' ? 9 : 7);
    this.audio && this.audio.explode(c, e.type === 'warden' ? 1.4 : 0.7);
    this.audio && this.audio.enemyVoice(e.type, 'death', c);
    if (this.onKill) this.onKill(e);
  }

  update(dt, player, t) {
    const pp = player.position;
    this.pathBudget = 4;
    const eyeP = this._w.set(pp.x, pp.y + 1.5, pp.z);
    for (const e of this.list) {
      e.t += dt;
      if (!e.alive) {
        e.dying -= dt;
        if (e.type === 'gull') { e.pos.y = Math.max(0.2, e.pos.y - dt * 12); e.g.rotation.z += dt * 6; }
        else { e.g.rotation.z = Math.min(1.3, e.g.rotation.z + dt * 2.2); e.g.position.y = Math.max(-0.3, e.g.position.y - dt * 0.4); }
        e.g.position.x = e.pos.x; e.g.position.z = e.pos.z; if (e.type === 'gull') e.g.position.y = e.pos.y;
        if (e.dying < 0.6 && Math.random() < 0.3) this.fx.spark(e.g.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 1, [1, 0.6, 0.2], 3, 0.4, 0.05);
        continue;
      }
      const dx = pp.x - e.pos.x, dz = pp.z - e.pos.z; const dist = Math.hypot(dx, dz) || 0.001;
      const want = Math.atan2(-dx, -dz);
      let dyaw = want - e.yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      e.cool -= dt;
      if (this.freeze) { e.g.position.copy(e.pos); e.yaw += Math.sign(dyaw) * Math.min(Math.abs(dyaw), 1); e.g.rotation.y = e.yaw; continue; }
      if (e.type === 'hound') this._hound(e, dt, player, dist, dx, dz, dyaw);
      else if (e.type === 'gull') this._gull(e, dt, player, dist, dx, dz, dyaw, eyeP);
      else this._warden(e, dt, player, dist, dx, dz, dyaw, eyeP);
      e.g.position.copy(e.pos); e.g.rotation.y = e.yaw;
      // 受击闪白
      if (e.flash > 0) { e.flash -= dt; e.g.traverse((o) => { if (o.isMesh && o.userData.baseMat !== M.eye && o.userData.baseMat !== M.core) o.material = flashMat; }); }
      else e.g.traverse((o) => { if (o.isMesh) o.material = o.userData.baseMat; });
      if (Math.random() < dt * 0.06) this.audio && this.audio.enemyVoice(e.type, 'idle', e.pos);
    }
    // 清除尸体
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (!e.alive && e.dying <= 0) { this.scene.remove(e.g); this.list.splice(i, 1); }
    }
    // 敌方光弹
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.life -= dt;
      const step = b.v.clone().multiplyScalar(dt); const L = step.length();
      const dir = step.clone().divideScalar(L);
      const hitW = this.world.raycast(b.m.position, dir, L);
      const toP = new THREE.Vector3(pp.x, pp.y + 1.2, pp.z).sub(b.m.position);
      const proj = Math.max(0, Math.min(L, toP.dot(dir)));
      const closest = b.m.position.clone().addScaledVector(dir, proj);
      const pd = closest.distanceTo(new THREE.Vector3(pp.x, pp.y + 1.2, pp.z));
      if (pd < 0.55 && proj <= hitW.t) {
        player.hurt(b.dmg, b.m.position);
        this._dropBolt(i); continue;
      }
      if (hitW.hit || b.life <= 0) { if (hitW.hit) this.fx.spark(b.m.position.clone().addScaledVector(dir, hitW.t), 6, [1, 0.5, 0.2], 4, 0.3, 0.06); this._dropBolt(i); continue; }
      b.m.position.add(step);
    }
  }
  _dropBolt(i) { this.scene.remove(this.bolts[i].m); this.bolts.splice(i, 1); }
  shoot(from, target, speed, dmg, spread, color) {
    const d = new THREE.Vector3().subVectors(target, from).normalize();
    d.x += (Math.random() - 0.5) * spread; d.y += (Math.random() - 0.5) * spread; d.z += (Math.random() - 0.5) * spread; d.normalize();
    const m = new THREE.Mesh(this.boltGeo, color ? new THREE.MeshBasicMaterial({ color }) : this.boltMat);
    m.position.copy(from);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.glowTex, color: color || 0xff7a3a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    glow.scale.setScalar(0.9); m.add(glow);
    this.scene.add(m);
    this.bolts.push({ m, v: d.multiplyScalar(speed), dmg, life: 3 });
  }

  _move(e, dt, vx, vz) {
    const nx = e.pos.x + vx * dt, nz = e.pos.z + vz * dt;
    const r = e.type === 'warden' ? 0.9 : 0.55;
    const c = this.world.collide(nx, nz, 0, r, 2);
    e.pos.x = c.x; e.pos.z = Math.max(QUAY_Z + 1, c.z);
    // 敌人之间分离
    for (const o of this.list) {
      if (o === e || !o.alive || o.type === 'gull') continue;
      const ddx = e.pos.x - o.pos.x, ddz = e.pos.z - o.pos.z; const d = Math.hypot(ddx, ddz);
      const md = (e.type === 'warden' || o.type === 'warden') ? 2.0 : 1.4;
      if (d > 0.01 && d < md) { e.pos.x += ddx / d * (md - d) * 0.5; e.pos.z += ddz / d * (md - d) * 0.5; }
    }
  }

  // 沿 A* 路径前进到 (tx,tz)。返回实际移动方向（用于朝向与步态）
  _nav(e, dt, tx, tz, speed, stopAt = 0.8) {
    const need = 2;
    const tgtMoved = !e.pathTarget || Math.hypot(e.pathTarget.x - tx, e.pathTarget.z - tz) > 2.5;
    e.repath -= dt;
    if (this.nav && (!e.path || e.repath <= 0 || tgtMoved) && this.pathBudget > 0) {
      this.pathBudget--;
      const r = this.nav.find(e.pos.x, e.pos.z, tx, tz, need);
      this.navStats.paths++;
      e.path = r ? r.pts : null; e.pi = 1; e.repath = 0.8 + Math.random() * 0.6; e.pathTarget = { x: tx, z: tz };
    }
    let wx = tx, wz = tz;
    if (e.path) {
      while (e.pi < e.path.length - 1 && Math.hypot(e.path[e.pi].x - e.pos.x, e.path[e.pi].z - e.pos.z) < 1.0) e.pi++;
      const last = e.pi >= e.path.length - 1;
      const wp = e.path[Math.min(e.pi, e.path.length - 1)];
      // 最后一段若直线可达，直接冲向目标
      if (last && this.nav.clearLine(e.pos.x, e.pos.z, tx, tz, 1)) { wx = tx; wz = tz; } else { wx = wp.x; wz = wp.z; }
    }
    const dx = wx - e.pos.x, dz = wz - e.pos.z; const d = Math.hypot(dx, dz);
    const full = Math.hypot(tx - e.pos.x, tz - e.pos.z);
    if (full < stopAt || d < 0.05) { e.moving = 0; return null; }
    const ax = dx / d, az = dz / d;
    this._move(e, dt, ax * speed, az * speed);
    e.moving = 1;
    // 卡住检测：1.2 秒内几乎没前进 → 强制重算路径并挪到最近的开阔格
    e.prog.t += dt;
    if (e.prog.t > 1.2) {
      const moved = Math.hypot(e.pos.x - e.prog.x, e.pos.z - e.prog.z);
      if (moved < 0.35 * speed * 0.3) {
        e.stuck++; this.navStats.stuck++; e.path = null; e.repath = 0;
        if (this.nav && e.stuck >= 2) {
          const k = this.nav.nearest(e.pos.x, e.pos.z, 3, 6);
          if (k >= 0) { const c = this.nav.center(k); e.pos.x += (c.x - e.pos.x) * 0.5; e.pos.z += (c.z - e.pos.z) * 0.5; this.navStats.unstuck++; }
        }
      } else e.stuck = 0;
      e.prog.x = e.pos.x; e.prog.z = e.pos.z; e.prog.t = 0;
    }
    return [ax, az];
  }
  _face(e, ax, az, rate, dt) {
    const want = Math.atan2(-ax, -az);
    let dy = want - e.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    e.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * rate);
    return dy;
  }

  _hound(e, dt, player, dist, dx, dz, dyaw) {
    const pp = player.position;
    let sp = e.def.speed;
    if (e.dash > 0) { e.dash -= dt; sp = 15; }
    // 包抄：远处时朝玩家侧翼的点跑（左右交替），近了再正面扑咬
    let tx = pp.x, tz = pp.z;
    if (dist > 11 && !(e.dash > 0)) {
      const px = -dz / dist, pz = dx / dist; const off = Math.min(8, dist * 0.45) * e.flank;
      tx = pp.x + px * off - dx / dist * 3; tz = pp.z + pz * off - dz / dist * 3;
    }
    const eye = this._v.set(e.pos.x, 0.9, e.pos.z);
    const see = dist < 14 && this.world.los(eye, this._w);
    if (!(e.dash > 0) && dist < 9 && e.cool <= 0 && see) { e.dash = 0.45; e.cool = 2.2; this.audio && this.audio.enemyVoice('hound', 'attack', e.pos); }
    const dir = dist > 1.3 ? this._nav(e, dt, tx, tz, sp, 1.0) : null;
    if (dir && dist > 4) this._face(e, dir[0], dir[1], 8, dt); else e.yaw += Math.sign(dyaw) * Math.min(Math.abs(dyaw), dt * 8);
    if (dist < 1.6 && (e.bite || 0) <= 0) { player.hurt(e.dash > 0 ? 16 : 10, e.pos); e.bite = 0.9; }
    e.bite = (e.bite || 0) - dt;
    const mv = dir ? 1 : 0.15;
    e.gait = (e.gait || 0) + dt * (e.dash > 0 ? 22 : 14) * mv;
    const gait = e.gait;
    for (const L of e.legs) { L.hip.rotation.x = Math.sin(gait + L.ph) * 0.7 * mv; L.knee.rotation.x = -Math.max(0, Math.sin(gait + L.ph + 1.2)) * 0.9 * mv; }
    e.body.position.y = 0.78 + Math.abs(Math.sin(gait)) * 0.06 * mv; e.body.rotation.x = e.dash > 0 ? -0.12 : -0.04;
    e.head.rotation.x = Math.sin(e.t * 3) * 0.1;
  }

  _gull(e, dt, player, dist, dx, dz, dyaw, eyeP) {
    const pp = player.position;
    const floor = (x, z) => this.world.groundHeight(x, z, 200, 0.6);
    if (e.mode === 'dive') {
      // 二次贝塞尔俯冲：起点 → 玩家上方低空控制点 → 远端拉起
      e.dt2 += dt / e.dur;
      const t = Math.min(1, e.dt2), u = 1 - t;
      const P0 = e.bz[0], P1 = e.bz[1], P2 = e.bz[2];
      const nx = u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x;
      const ny = u * u * P0.y + 2 * u * t * P1.y + t * t * P2.y;
      const nz = u * u * P0.z + 2 * u * t * P1.z + t * t * P2.z;
      const tx = nx - e.pos.x, tz = nz - e.pos.z;
      e.pos.set(nx, Math.max(ny, floor(nx, nz) + 1.6), nz);
      if (Math.hypot(tx, tz) > 1e-4) this._face(e, tx, tz, 10, dt);
      e.body.rotation.x = (u - 0.5) * 0.9; e.body.rotation.z = 0;
      if (!e.fired && t > 0.3) {
        const from = e.pos.clone(); from.y -= 0.2;
        if (this.world.los(from, eyeP)) { this.shoot(from, eyeP, 34, 7, 0.05, 0xffb347); this.audio && this.audio.enemyShot('gull', e.pos); }
        e.fired = true;
      }
      if (t >= 1) { e.mode = 'orbit'; e.cool = 2.4 + Math.random() * 2; e.orbit = Math.atan2(e.pos.z - pp.z, e.pos.x - pp.x); }
    } else {
      e.orbit += dt * 0.55;
      const r = 15 + Math.sin(e.t * 0.3) * 4;
      const tx = pp.x + Math.cos(e.orbit) * r, tz = pp.z + Math.sin(e.orbit) * r;
      const ty = Math.max(9 + Math.sin(e.t * 0.8) * 2.5, floor(tx, tz) + 4);
      const vx = tx - e.pos.x, vz = tz - e.pos.z, vy = ty - e.pos.y; const L = Math.hypot(vx, vz) || 1;
      const sp = Math.min(e.def.speed, L * 1.5);
      e.pos.x += vx / L * sp * dt; e.pos.z += vz / L * sp * dt; e.pos.y += vy * dt * 1.2;
      e.yaw += Math.sign(dyaw) * Math.min(Math.abs(dyaw), dt * 4);
      e.body.rotation.z = Math.sin(e.t * 1.3) * 0.25; e.body.rotation.x = 0;
      if (e.cool <= 0 && dist < 38) {
        const away = new THREE.Vector3(pp.x - e.pos.x, 0, pp.z - e.pos.z).normalize();
        const lowY = Math.max(3.2, floor(pp.x, pp.z) + 3);
        e.bz = [e.pos.clone(), new THREE.Vector3(pp.x - away.x * 3, lowY - 2.5, pp.z - away.z * 3), new THREE.Vector3(pp.x + away.x * 14, 10, pp.z + away.z * 14)];
        e.dur = Math.max(1.4, e.pos.distanceTo(e.bz[2]) / 16); e.dt2 = 0; e.mode = 'dive'; e.fired = false;
        this.audio && this.audio.enemyVoice('gull', 'attack', e.pos);
      }
    }
    e.pos.x = Math.max(-74, Math.min(74, e.pos.x)); e.pos.z = Math.max(QUAY_Z - 20, Math.min(104, e.pos.z));
    const flap = Math.sin(e.t * (e.mode === 'dive' ? 4 : 9));
    const amp = e.mode === 'dive' ? 0.12 : 0.35;
    for (const w of e.wings) { w.piv.rotation.z = w.s * flap * amp; w.tip.rotation.z = w.s * flap * amp * 0.85; }
  }

  // 守卫：挑选靠近障碍物、又能探身射击的掩体点；到位后点射，打完换位
  _pickCover(e, pp) {
    if (!this.nav) return null;
    let best = null, bs = -1e9;
    const eye = new THREE.Vector3(pp.x, pp.y + 1.5, pp.z), p = new THREE.Vector3();
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 14;
      const k = this.nav.nearest(pp.x + Math.cos(a) * r, pp.z + Math.sin(a) * r, 2, 3); if (k < 0) continue;
      const c = this.nav.center(k); const cl = this.nav.clear[k];
      let sc = (cl <= 3 ? 3 : 0) - Math.hypot(c.x - e.pos.x, c.z - e.pos.z) * 0.12;
      p.set(c.x, 2.3, c.z); if (this.world.los(p, eye)) sc += 4; else continue;
      p.set(c.x, 1.0, c.z); if (!this.world.los(p, eye)) sc += 2; // 下半身有遮挡
      if (sc > bs) { bs = sc; best = c; }
    }
    return best;
  }
  _warden(e, dt, player, dist, dx, dz, dyaw, eyeP) {
    const pp = player.position;
    e.muzzle.getWorldPosition(this._v); const muzzle = this._v.clone();
    const see = dist < 55 && this.world.los(muzzle, eyeP);
    e.coverT = (e.coverT || 0) - dt;
    if (!e.cover || e.coverT <= 0 || Math.hypot(e.cover.x - pp.x, e.cover.z - pp.z) < 8) { e.cover = this._pickCover(e, pp) || { x: pp.x, z: pp.z }; e.coverT = 6 + Math.random() * 4; }
    let moving = 0;
    if (dist < 8) { this._move(e, dt, -dx / dist * 1.6, -dz / dist * 1.6); moving = 0.6; }
    else if (e.burst <= 0) { const dir = this._nav(e, dt, e.cover.x, e.cover.z, e.def.speed, 1.2); if (dir) moving = 1; }
    e.yaw += Math.sign(dyaw) * Math.min(Math.abs(dyaw), dt * 1.6);
    if (see && e.cool <= 0 && Math.abs(dyaw) < 0.5) { e.burst = 4; e.burstT = 0; e.cool = 3.2 + Math.random() * 1.5; this.audio && this.audio.enemyVoice('warden', 'attack', e.pos); }
    if (e.burst > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burst--; e.burstT = 0.16;
        this.shoot(muzzle, eyeP, 46, 8, 0.045, 0xff5a40);
        this.fx.light(muzzle, 0xff6a3a, 25, 0.06, 8);
        this.audio && this.audio.enemyShot('warden', e.pos);
        if (e.burst === 0) e.coverT = Math.min(e.coverT, 1.5 + Math.random()); // 打完一轮就换位
      }
    }
    e.gait = (e.gait || 0) + dt * 4.5 * moving;
    const gait = e.gait;
    for (const L of e.legs) { L.hip.rotation.x = Math.sin(gait + (L.s > 0 ? 0 : Math.PI)) * 0.45 * moving; L.knee.rotation.x = -Math.max(0, Math.sin(gait + (L.s > 0 ? 0 : Math.PI) + 1.3)) * 0.6 * moving; }
    e.pelvis.position.y = 1.55 + Math.abs(Math.cos(gait)) * 0.05 * moving;
    e.torso.rotation.y = Math.sin(e.t * 0.7) * 0.1;
    for (const a of e.arms) if (a.s > 0) a.sh.rotation.x = e.burst > 0 ? 0.12 - Math.random() * 0.05 : 0.05;
  }
}
