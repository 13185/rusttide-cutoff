// 港区失控机械：机械猎犬 / 机械飞鸥 / 机械守卫（程序化建模，原创设计）
import * as THREE from '../vendor/three/three.module.js';
import { RELAYS, QUAY_Z } from './world.js';

export const TYPES = {
  hound: { name: '机械猎犬', hp: 70, speed: 7.2, weakMul: 2.5, score: 100 },
  gull: { name: '机械飞鸥', hp: 42, speed: 9, weakMul: 2.5, score: 120 },
  warden: { name: '机械守卫', hp: 460, speed: 2.3, weakMul: 3, score: 400 }
};

function mats() {
  return {
    hull: new THREE.MeshStandardMaterial({ color: 0x5f656b, roughness: 0.38, metalness: 0.55 }),
    plate: new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 0.45, metalness: 0.45 }),
    hazard: new THREE.MeshStandardMaterial({ color: 0xc8922e, roughness: 0.55, metalness: 0.4 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x26282a, roughness: 0.5, metalness: 0.6 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a28, emissiveIntensity: 6, roughness: 0.3 }),
    core: new THREE.MeshStandardMaterial({ color: 0x221000, emissive: 0xffb347, emissiveIntensity: 5, roughness: 0.3 })
  };
}
const M = mats();
const flashMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.5 });

function part(geo, mat, x, y, z, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }

function buildHound() {
  const g = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.78; g.add(body);
  part(new THREE.BoxGeometry(0.62, 0.42, 1.25), M.hull, 0, 0, 0, body);
  part(new THREE.BoxGeometry(0.66, 0.08, 1.0), M.hazard, 0, 0.24, -0.05, body);
  part(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), M.joint, 0, -0.05, 0.2, body).rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) part(new THREE.BoxGeometry(0.7, 0.04, 0.08), M.plate, 0, 0.12 - i * 0.07, 0.62, body);
  const head = new THREE.Group(); head.position.set(0, 0.12, -0.72); body.add(head);
  part(new THREE.BoxGeometry(0.42, 0.3, 0.5), M.plate, 0, 0, -0.1, head);
  part(new THREE.BoxGeometry(0.34, 0.1, 0.42), M.joint, 0, -0.2, -0.16, head); // 下颚
  const eye = part(new THREE.SphereGeometry(0.1, 12, 8), M.eye, 0, 0.04, -0.36, head);
  part(new THREE.BoxGeometry(0.05, 0.25, 0.05), M.joint, 0.14, 0.25, 0.05, head).rotation.z = -0.3;
  part(new THREE.BoxGeometry(0.05, 0.25, 0.05), M.joint, -0.14, 0.25, 0.05, head).rotation.z = 0.3;
  const legs = [];
  for (const [x, z] of [[-0.3, -0.45], [0.3, -0.45], [-0.3, 0.45], [0.3, 0.45]]) {
    const hip = new THREE.Group(); hip.position.set(x, -0.1, z); body.add(hip);
    part(new THREE.BoxGeometry(0.1, 0.45, 0.14), M.hull, 0, -0.2, 0, hip);
    const knee = new THREE.Group(); knee.position.set(0, -0.42, 0); hip.add(knee);
    part(new THREE.BoxGeometry(0.08, 0.42, 0.1), M.joint, 0, -0.2, 0, knee);
    part(new THREE.BoxGeometry(0.14, 0.05, 0.2), M.hull, 0, -0.42, -0.04, knee);
    legs.push({ hip, knee, ph: (x > 0 ? 0 : Math.PI) + (z > 0 ? Math.PI : 0) });
  }
  const tail = part(new THREE.CylinderGeometry(0.02, 0.02, 0.8), M.joint, 0, 0.35, 0.8, body); tail.rotation.x = 0.7;
  return { g, body, head, legs, eye, hit: [
    { obj: eye, r: 0.2, weak: true }, { obj: body, r: 0.5, weak: false, off: new THREE.Vector3(0, 0, -0.2) }, { obj: body, r: 0.45, weak: false, off: new THREE.Vector3(0, 0, 0.45) }
  ] };
}

function buildGull() {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  part(new THREE.CapsuleGeometry(0.22, 0.7, 4, 10), M.hull, 0, 0, 0, body).rotation.x = Math.PI / 2;
  part(new THREE.ConeGeometry(0.2, 0.4, 10), M.plate, 0, 0, -0.6, body).rotation.x = -Math.PI / 2;
  const eye = part(new THREE.SphereGeometry(0.13, 12, 8), M.core, 0, -0.08, -0.38, body);
  part(new THREE.BoxGeometry(0.05, 0.3, 0.45), M.joint, 0, 0.12, 0.5, body);
  const wings = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(0.18 * s, 0.05, 0); body.add(piv);
    const w1 = part(new THREE.BoxGeometry(1.0, 0.04, 0.5), M.plate, 0.5 * s, 0, 0, piv);
    const tip = new THREE.Group(); tip.position.set(1.0 * s, 0, 0); piv.add(tip);
    part(new THREE.BoxGeometry(0.9, 0.03, 0.34), M.hull, 0.45 * s, 0, 0.06, tip);
    part(new THREE.BoxGeometry(0.2, 0.05, 0.36), M.hazard, 0.85 * s, 0, 0.06, tip);
    part(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), M.joint, 0.45 * s, 0.05, 0, piv);
    wings.push({ piv, tip, s });
  }
  return { g, body, wings, eye, hit: [{ obj: eye, r: 0.2, weak: true }, { obj: body, r: 0.42, weak: false }, { obj: body, r: 0.5, weak: false, off: new THREE.Vector3(0.9, 0, 0) }, { obj: body, r: 0.5, weak: false, off: new THREE.Vector3(-0.9, 0, 0) }] };
}

function buildWarden() {
  const g = new THREE.Group();
  const pelvis = new THREE.Group(); pelvis.position.y = 1.55; g.add(pelvis);
  part(new THREE.BoxGeometry(0.9, 0.4, 0.7), M.joint, 0, 0, 0, pelvis);
  const torso = new THREE.Group(); torso.position.y = 0.75; pelvis.add(torso);
  part(new THREE.BoxGeometry(1.5, 1.1, 1.0), M.hull, 0, 0, 0, torso);
  part(new THREE.BoxGeometry(1.56, 0.22, 1.06), M.hazard, 0, -0.32, 0, torso);
  part(new THREE.BoxGeometry(1.1, 0.7, 0.2), M.plate, 0, 0.1, -0.56, torso);
  const back = part(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 14), M.core, 0, 0.1, 0.62, torso); back.rotation.x = Math.PI / 2; // 背部散热核心（弱点）
  part(new THREE.BoxGeometry(0.8, 0.9, 0.16), M.joint, 0, 0.12, 0.98, torso);
  const head = new THREE.Group(); head.position.set(0, 0.72, -0.15); torso.add(head);
  part(new THREE.BoxGeometry(0.55, 0.36, 0.5), M.plate, 0, 0, 0, head);
  const visor = part(new THREE.BoxGeometry(0.46, 0.09, 0.05), M.eye, 0, 0.02, -0.27, head);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.95 * s, 0.25, 0); torso.add(sh);
    part(new THREE.BoxGeometry(0.6, 0.5, 0.8), M.plate, 0.08 * s, 0.1, 0, sh);
    part(new THREE.BoxGeometry(0.26, 0.85, 0.3), M.hull, 0, -0.5, 0, sh);
    const fore = new THREE.Group(); fore.position.set(0, -0.9, 0); sh.add(fore);
    if (s > 0) {
      part(new THREE.BoxGeometry(0.36, 0.36, 1.1), M.joint, 0, 0, -0.35, fore);
      for (const dx of [-0.08, 0.08]) part(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8), M.hull, dx, 0.05, -1.1, fore).rotation.x = Math.PI / 2;
    } else {
      part(new THREE.BoxGeometry(0.3, 0.7, 0.3), M.hull, 0, -0.3, 0, fore);
      part(new THREE.BoxGeometry(0.1, 1.1, 0.9), M.hazard, -0.18, -0.3, 0, fore); // 盾板
    }
    arms.push({ sh, fore, s });
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(0.38 * s, -0.15, 0); pelvis.add(hip);
    part(new THREE.BoxGeometry(0.34, 0.75, 0.42), M.hull, 0, -0.35, 0, hip);
    const knee = new THREE.Group(); knee.position.set(0, -0.72, 0); hip.add(knee);
    part(new THREE.BoxGeometry(0.28, 0.7, 0.34), M.joint, 0, -0.32, 0.05, knee);
    part(new THREE.BoxGeometry(0.44, 0.14, 0.7), M.plate, 0, -0.7, -0.08, knee);
    legs.push({ hip, knee, s });
  }
  return { g, pelvis, torso, head, arms, legs, eye: visor, back, hit: [
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
    e.pos = new THREE.Vector3(p.x, type === 'gull' ? 12 + Math.random() * 5 : 0, p.z);
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

  damage(e, amount, weak, point) {
    if (!e.alive) return false;
    const dmg = amount * (weak ? e.def.weakMul : 1);
    e.hp -= dmg; e.flash = 0.08;
    this.fx.spark(point, weak ? 14 : 6, weak ? [1, 0.55, 0.2] : [1, 0.85, 0.6], weak ? 7 : 5, 0.35, 0.07);
    if (e.state === 'idle') e.state = 'hunt';
    if (e.hp <= 0) { this.kill(e); return true; }
    return false;
  }
  kill(e) {
    e.alive = false; e.dying = 1.2;
    const c = e.g.position.clone(); c.y += e.type === 'warden' ? 2 : e.type === 'gull' ? 0 : 0.8;
    this.fx.burst(c, [1, 0.6, 0.25], e.type === 'warden' ? 1.6 : 0.8);
    this.audio && this.audio.explode(c, e.type === 'warden' ? 1.4 : 0.7);
    this.audio && this.audio.enemyVoice(e.type, 'death', c);
    if (this.onKill) this.onKill(e);
  }

  update(dt, player, t) {
    const pp = player.position;
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
    // 被卡住时绕行
    if (Math.hypot(c.x - nx, c.z - nz) > 0.01) { e.stuck = (e.stuck || 0) + dt; } else e.stuck = Math.max(0, (e.stuck || 0) - dt);
    e.pos.x = c.x; e.pos.z = Math.max(QUAY_Z + 1, c.z);
    // 敌人之间简单分离
    for (const o of this.list) {
      if (o === e || !o.alive || o.type === 'gull') continue;
      const ddx = e.pos.x - o.pos.x, ddz = e.pos.z - o.pos.z; const d = Math.hypot(ddx, ddz);
      if (d > 0.01 && d < 1.4) { e.pos.x += ddx / d * (1.4 - d) * 0.5; e.pos.z += ddz / d * (1.4 - d) * 0.5; }
    }
  }
  _steer(e, dx, dz, dist) {
    // 被墙挡住时沿切线偏移
    let ax = dx / dist, az = dz / dist;
    if (e.stuck > 0.25) { const s = (Math.floor(e.t / 2) % 2) ? 1 : -1; const tx = -az * s, tz = ax * s; ax = ax * 0.25 + tx; az = az * 0.25 + tz; const n = Math.hypot(ax, az); ax /= n; az /= n; }
    return [ax, az];
  }

  _hound(e, dt, player, dist, dx, dz, dyaw) {
    e.yaw += Math.sign(dyaw) * Math.min(Math.abs(dyaw), dt * 7);
    let sp = e.def.speed;
    if (e.dash > 0) { e.dash -= dt; sp = 15; }
    else if (dist < 9 && e.cool <= 0) { e.dash = 0.45; e.cool = 2.2; this.audio && this.audio.enemyVoice('hound', 'attack', e.pos); }
    if (dist > 1.3) { const [ax, az] = this._steer(e, dx, dz, dist); this._move(e, dt, ax * sp, az * sp); }
    if (dist < 1.6 && (e.bite || 0) <= 0) { player.hurt(e.dash > 0 ? 16 : 10, e.pos); e.bite = 0.9; }
    e.bite = (e.bite || 0) - dt;
    const gait = e.t * (e.dash > 0 ? 22 : 14);
    for (const L of e.legs) { L.hip.rotation.x = Math.sin(gait + L.ph) * 0.7; L.knee.rotation.x = Math.max(0, Math.sin(gait + L.ph + 1.2)) * 0.9; }
    e.body.position.y = 0.78 + Math.abs(Math.sin(gait)) * 0.06; e.body.rotation.x = e.dash > 0 ? 0.12 : 0.04;
    e.head.rotation.x = Math.sin(e.t * 3) * 0.1;
  }

  _gull(e, dt, player, dist, dx, dz, dyaw, eyeP) {
    e.orbit += dt * 0.55;
    const r = 15 + Math.sin(e.t * 0.3) * 4;
    const tx = player.position.x + Math.cos(e.orbit) * r, tz = player.position.z + Math.sin(e.orbit) * r;
    const ty = 9 + Math.sin(e.t * 0.8) * 2.5 + (e.dive > 0 ? -6 : 0);
    const vx = tx - e.pos.x, vz = tz - e.pos.z, vy = ty - e.pos.y; const L = Math.hypot(vx, vz) || 1;
    const sp = Math.min(e.def.speed, L * 1.5);
    e.pos.x += vx / L * sp * dt; e.pos.z += vz / L * sp * dt; e.pos.y += vy * dt * 1.2;
    e.pos.x = Math.max(-74, Math.min(74, e.pos.x)); e.pos.z = Math.max(QUAY_Z - 20, Math.min(104, e.pos.z));
    e.yaw += Math.sign(dyaw) * Math.min(Math.abs(dyaw), dt * 4);
    e.body.rotation.z = Math.sin(e.t * 1.3) * 0.25;
    const flap = Math.sin(e.t * 9);
    for (const w of e.wings) { w.piv.rotation.z = w.s * flap * 0.35; w.tip.rotation.z = w.s * flap * 0.3; }
    if (e.cool <= 0) {
      const from = e.pos.clone(); from.y -= 0.1;
      if (this.world.los(from, eyeP)) {
        this.shoot(from, eyeP, 30, 7, 0.06, 0xffb347);
        this.audio && this.audio.enemyShot('gull', e.pos);
        e.cool = 1.6 + Math.random() * 1.6;
      } else e.cool = 0.5;
    }
  }

  _warden(e, dt, player, dist, dx, dz, dyaw, eyeP) {
    e.yaw += Math.sign(dyaw) * Math.min(Math.abs(dyaw), dt * 1.6);
    const muzzle = new THREE.Vector3(0.95, 1.55 + 0.75 + 0.25 - 0.9, -1.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), e.yaw).add(e.pos);
    const see = dist < 55 && this.world.los(muzzle, eyeP);
    let moving = 0;
    if (!see || dist > 22) { const [ax, az] = this._steer(e, dx, dz, dist); this._move(e, dt, ax * e.def.speed, az * e.def.speed); moving = 1; }
    else if (dist < 9) { this._move(e, dt, -dx / dist * 1.4, -dz / dist * 1.4); moving = 0.6; }
    if (see && e.cool <= 0 && Math.abs(dyaw) < 0.5) { e.burst = 4; e.burstT = 0; e.cool = 3.2 + Math.random() * 1.5; this.audio && this.audio.enemyVoice('warden', 'attack', e.pos); }
    if (e.burst > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burst--; e.burstT = 0.16;
        this.shoot(muzzle, eyeP, 46, 8, 0.045, 0xff5a40);
        this.fx.light(muzzle, 0xff6a3a, 25, 0.06, 8);
        this.audio && this.audio.enemyShot('warden', e.pos);
      }
    }
    const gait = e.t * 4.5 * moving;
    for (const L of e.legs) { L.hip.rotation.x = Math.sin(gait + (L.s > 0 ? 0 : Math.PI)) * 0.45 * moving; L.knee.rotation.x = Math.max(0, Math.sin(gait + (L.s > 0 ? 0 : Math.PI) + 1.3)) * 0.6 * moving; }
    e.pelvis.position.y = 1.55 + Math.abs(Math.cos(gait)) * 0.05 * moving;
    e.torso.rotation.y = Math.sin(e.t * 0.7) * 0.1;
    for (const a of e.arms) if (a.s > 0) a.sh.rotation.x = e.burst > 0 ? -0.12 + Math.random() * 0.05 : -0.05;
  }
}
