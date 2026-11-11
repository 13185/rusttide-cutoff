// 突击队员：移动、冲刺、跳跃、蹲伏、掩体回血
import * as THREE from '../vendor/three/three.module.js';
import { damp } from './util.js';
import { SPAWN } from './world.js';

export class Player {
  constructor(camera, world, input) {
    this.camera = camera; this.world = world; this.input = input;
    this.position = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.radius = 0.38;
    this.reset();
  }
  reset() {
    this.position.set(SPAWN.x, 0, SPAWN.z); this.vel.set(0, 0, 0);
    this.yaw = SPAWN.yaw; this.pitch = 0.02;
    this.hp = 100; this.maxHp = 100; this.alive = true;
    this.sinceHurt = 99; this.hurtFlash = 0; this.hurtDir = 0;
    this.grounded = true; this.crouch = false; this.sprint = false; this.eye = 1.65;
    this.stepT = 0; this.godMode = false; this.speed = 0; this.landed = 0;
  }
  hurt(n, from) {
    if (!this.alive || this.godMode) return;
    this.hp -= n; this.sinceHurt = 0; this.hurtFlash = 0.5;
    if (from) { const a = Math.atan2(from.x - this.position.x, from.z - this.position.z); this.hurtDir = a; }
    if (this.onHurt) this.onHurt(n);
    if (this.hp <= 0) { this.hp = 0; this.alive = false; }
  }
  update(dt, inCover, ads) {
    if (!this.alive) return { foot: false };
    const look = this.input.consumeLook();
    const sens = this.input.sensitivity * (1 - ads * 0.45);
    this.yaw -= look.x * sens; this.pitch -= look.y * sens;
    this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch));
    const k = this.input.keys;
    const t = this.input.touch;
    this.crouch = !!(k.ControlLeft || k.ControlRight || k.KeyC || t.crouch);
    const ax = this.input.axis();
    this.sprint = !!(k.ShiftLeft || k.ShiftRight || t.sprint) && ax.z < 0 && !this.crouch && ads < 0.3;
    const sp = this.crouch ? 2.4 : this.sprint ? 7.6 : ads > 0.5 ? 3.2 : 5.0;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = ax.x * cy + ax.z * sy, wz = -ax.x * sy + ax.z * cy;
    const accel = this.grounded ? 11 : 3;
    this.vel.x = damp(this.vel.x, wx * sp, accel, dt); this.vel.z = damp(this.vel.z, wz * sp, accel, dt);
    const jump = k.Space || t.jump; t.jump = false;
    if (this.grounded && jump) { this.vel.y = 5.6; this.grounded = false; }
    this.vel.y -= 18 * dt;
    let ny = this.position.y + this.vel.y * dt;
    const c = this.world.collide(this.position.x + this.vel.x * dt, this.position.z + this.vel.z * dt, this.position.y, this.radius, this.crouch ? 1.2 : 1.8);
    this.position.x = c.x; this.position.z = c.z;
    const gh = this.world.groundHeight(c.x, c.z, this.position.y, this.radius * 0.7);
    if (ny <= gh) { if (!this.grounded && this.vel.y < -4) this.landed = 0.2; ny = gh; this.vel.y = 0; this.grounded = true; } else if (ny > gh + 0.05) this.grounded = false;
    this.position.y = ny;
    this.position.x = Math.max(-74, Math.min(74, this.position.x));
    this.position.z = Math.max(-61.2, Math.min(103, this.position.z));
    this.eye = damp(this.eye, this.crouch ? 1.05 : 1.65, 12, dt);
    // 回血：受伤 4 秒后开始，掩体后更快
    this.sinceHurt += dt; this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.sinceHurt > 4 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * (inCover ? 12 : 4));
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.landed = Math.max(0, this.landed - dt);
    const bobT = this.grounded ? Math.sin(this.stepT * Math.PI * 2) * 0.028 * Math.min(1, this.speed / 5) * (1 - ads * 0.8) : 0;
    this.bobY = damp(this.bobY || 0, bobT, 16, dt);
    this.landS = damp(this.landS || 0, this.landed > 0 ? 0.14 : 0, 14, dt);
    this.camera.position.set(this.position.x, this.position.y + this.eye + this.bobY - this.landS, this.position.z);
    this.camera.rotation.order = 'YXZ'; this.camera.rotation.set(this.pitch, this.yaw, 0);
    let foot = false;
    if (this.grounded && this.speed > 1) { this.stepT += dt * (this.sprint ? 2.4 : 1.7) * Math.min(1.3, this.speed / 4); if (this.stepT >= 1) { this.stepT -= 1; foot = true; } }
    return { foot };
  }
}
