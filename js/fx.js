// 粒子、曳光、枪口火光、爆炸（原创）
import * as THREE from '../vendor/three/three.module.js';

export class FX {
  constructor(scene, glowTex) {
    this.scene = scene;
    this.glowTex = glowTex;
    this.max = 900;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.size = new Float32Array(this.max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTex }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float scale;
        void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ vec4 t=texture2D(map, gl_PointCoord); gl_FragColor=vec4(vC*t.a, t.a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.parts = [];
    // 曳光
    this.tracers = [];
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true); this.tracerGeo.rotateX(Math.PI / 2);
    this.flashes = [];
    // 一盏常驻枪口灯。每次 new PointLight 都会让整批材质按新的光源数量重编译，走路开枪时画面会卡住。
    this._muzzle = new THREE.PointLight(0xff9a40, 0, 10, 2);
    this._muzzle.position.set(0, -40, 0);
    scene.add(this._muzzle);
    // 烟（普通混合）
    this.smoke = [];
    this.smokeMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x2a2a2a, transparent: true, depthWrite: false, opacity: 0.5 });
    // 机械残骸碎片（几种不规则块，共享几何）
    this.debrisGeo = [new THREE.BoxGeometry(0.22, 0.05, 0.16), new THREE.BoxGeometry(0.1, 0.1, 0.3), new THREE.CylinderGeometry(0.05, 0.05, 0.28, 6), new THREE.TetrahedronGeometry(0.14)];
    this.debris = [];
    this.world = null;
  }
  debrisBurst(p, mats, n = 10, speed = 7) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.debrisGeo[i % this.debrisGeo.length], mats[i % mats.length]);
      m.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4, (Math.random() - 0.5) * 0.6));
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const s = 0.6 + Math.random() * 1.0; m.scale.setScalar(s);
      m.castShadow = true;
      this.scene.add(m);
      const v = new THREE.Vector3(Math.random() - 0.5, 0.6 + Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.debris.push({ m, v, w: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16), t: 0, life: 5 + Math.random() * 2, smoke: Math.random() < 0.4 });
      if (this.debris.length > 90) { const d = this.debris.shift(); this.scene.remove(d.m); }
    }
  }
  explosion(p, scale = 1) {
    this.spark(p, 70 * scale, [1, 0.62, 0.25], 14 * scale, 1.0, 0.18, 7);
    this.spark(p, 24, [1, 0.92, 0.75], 4, 0.3, 1.6 * scale, 0);
    this.light(p, 0xff9a40, 160 * scale, 0.35, 26);
    for (let i = 0; i < 10 * scale; i++) this.puff(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3)), 3 + Math.random() * 3, 3.2);
    this.ring(p, 7 * scale);
  }
  // 地面冲击波环
  ring(p, r) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffc080, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.08, p.z); this.scene.add(m);
    this.rings = this.rings || []; this.rings.push({ m, r, t: 0 });
  }
  spark(p, n = 10, color = [1, 0.7, 0.35], speed = 6, life = 0.45, size = 0.08, grav = 9) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.max) this.parts.shift();
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      this.parts.push({ p: p.clone(), v, life: life * (0.5 + Math.random() * 0.8), t: 0, c: color, s: size * (0.6 + Math.random() * 0.8), g: grav });
    }
  }
  burst(p, color = [1, 0.6, 0.25], scale = 1) {
    this.spark(p, 40 * scale, color, 11 * scale, 0.9, 0.16, 6);
    this.spark(p, 16, [1, 0.9, 0.7], 3, 0.25, 0.9 * scale, 0);
    this.light(p, 0xff9a40, 70 * scale, 0.25, 18);
    for (let i = 0; i < 6 * scale; i++) this.puff(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random(), (Math.random() - 0.5) * 1.5)), 2.2 + Math.random() * 2, 2.5);
  }
  puff(p, size = 1, life = 1.5) {
    const s = new THREE.Sprite(this.smokeMat.clone());
    s.position.copy(p); s.scale.setScalar(size * 0.5);
    this.scene.add(s);
    this.smoke.push({ s, life, t: 0, size });
  }
  light(p, color, intensity, life, dist = 10) {
    const l = this._muzzle;
    l.color.set(color); l.intensity = intensity; l.distance = dist; l.position.copy(p);
    this.flashes.push({ l, life, t: 0, i0: intensity });
  }
  tracer(a, b, color) {
    const m = new THREE.Mesh(this.tracerGeo, color ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }) : this.tracerMat);
    const d = new THREE.Vector3().subVectors(b, a); const L = d.length();
    m.position.copy(a).addScaledVector(d, 0.5); m.lookAt(b); m.scale.set(1, 1, L);
    this.scene.add(m);
    this.tracers.push({ m, t: 0, life: 0.06, own: !!color });
  }
  update(dt) {
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i]; q.t += dt;
      if (q.t >= q.life) { this.parts.splice(i, 1); continue; }
      q.v.y -= q.g * dt; q.p.addScaledVector(q.v, dt);
      if (q.p.y < 0.02) { q.p.y = 0.02; q.v.y *= -0.3; q.v.x *= 0.6; q.v.z *= 0.6; }
    }
    for (const q of this.parts) {
      const k = 1 - q.t / q.life;
      this.pos[n * 3] = q.p.x; this.pos[n * 3 + 1] = q.p.y; this.pos[n * 3 + 2] = q.p.z;
      this.col[n * 3] = q.c[0] * k; this.col[n * 3 + 1] = q.c[1] * k; this.col[n * 3 + 2] = q.c[2] * k;
      this.size[n] = q.s; n++;
    }
    this.points.geometry.setDrawRange(0, n);
    for (const a of ['position', 'color', 'size']) this.points.geometry.attributes[a].needsUpdate = true;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.t += dt;
      if (t.t > t.life) { this.scene.remove(t.m); if (t.own) t.m.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]; f.t += dt;
      if (f.t > f.life) { if (f.l === this._muzzle) { f.l.intensity = 0; f.l.position.set(0, -40, 0); } this.flashes.splice(i, 1); continue; }
      f.l.intensity = f.i0 * Math.max(0, 1 - f.t / f.life);
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]; d.t += dt;
      if (d.t > d.life) { this.scene.remove(d.m); this.debris.splice(i, 1); continue; }
      const floor = this.world ? this.world.groundHeight(d.m.position.x, d.m.position.z, d.m.position.y, 0.05) : 0;
      d.v.y -= 14 * dt; d.m.position.addScaledVector(d.v, dt);
      if (d.m.position.y < floor + 0.04) { d.m.position.y = floor + 0.04; d.v.y *= -0.32; d.v.x *= 0.55; d.v.z *= 0.55; d.w.multiplyScalar(0.5); }
      d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
      if (d.smoke && d.t < 2.5 && Math.random() < dt * 6) this.puff(d.m.position.clone(), 0.5, 1.2);
      if (d.t > d.life - 1) d.m.scale.multiplyScalar(1 - dt * 2);
    }
    if (this.rings) for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const k = r.t / 0.45;
      r.m.scale.setScalar(0.5 + k * r.r); r.m.material.opacity = 0.6 * (1 - k);
      if (k >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i]; s.t += dt;
      const k = s.t / s.life;
      s.s.position.y += dt * 0.8; s.s.scale.setScalar(s.size * (0.5 + k));
      s.s.material.opacity = 0.45 * (1 - k);
      if (k >= 1) { this.scene.remove(s.s); s.s.material.dispose(); this.smoke.splice(i, 1); }
    }
  }
  clear() {
    this.parts.length = 0;
    for (const t of this.tracers) this.scene.remove(t.m);
    for (const f of this.flashes) this.scene.remove(f.l);
    for (const s of this.smoke) this.scene.remove(s.s);
    for (const d of this.debris) this.scene.remove(d.m); this.debris.length = 0;
    if (this.rings) { for (const r of this.rings) this.scene.remove(r.m); this.rings.length = 0; }
    this.tracers.length = 0; this.flashes.length = 0; this.smoke.length = 0;
  }
}

// 雨：种子写死在顶点里，位置在着色器里随时间走。不再每帧改几千个顶点、也不再整缓冲上传。
const RAIN_VS = `
attribute float seedX;
attribute float seedY;
attribute float seedZ;
attribute float tip;
uniform float time;
uniform vec3 camPos;
varying float vDist;
void main() {
  float y = mod(seedY - time * 16.0, 22.0);
  float x = mod(seedX + time * 2.2 - camPos.x, 40.0);
  float z = mod(seedZ - camPos.z, 40.0);
  x = x - 20.0;
  z = z - 20.0;
  vec3 p = vec3(camPos.x + x, camPos.y - 6.0 + y, camPos.z + z);
  if (tip > 0.5) p += vec3(-0.077, 0.55, 0.0);
  if (p.x > 50.2 && p.x < 72.15 && p.z > -16.95 && p.z < 16.95 && p.y > -0.2 && p.y < 11.15) p.y = -40.0;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vDist = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}`;
const RAIN_FS = `
varying float vDist;
void main() {
  float fog = clamp(exp(-vDist * 0.008), 0.0, 1.0);
  gl_FragColor = vec4(0.82, 0.80, 0.76, 0.16 * fog);
}`;
export class Rain {
  constructor(scene, count = 5000) {
    this.count = count;
    const g = new THREE.BufferGeometry();
    const sx = new Float32Array(count * 2), sy = new Float32Array(count * 2), sz = new Float32Array(count * 2), tip = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * 40 - 20, y = Math.random() * 22, z = Math.random() * 40 - 20;
      sx[i * 2] = sx[i * 2 + 1] = x;
      sy[i * 2] = sy[i * 2 + 1] = y;
      sz[i * 2] = sz[i * 2 + 1] = z;
      tip[i * 2] = 0; tip[i * 2 + 1] = 1;
    }
    g.setAttribute('seedX', new THREE.BufferAttribute(sx, 1));
    g.setAttribute('seedY', new THREE.BufferAttribute(sy, 1));
    g.setAttribute('seedZ', new THREE.BufferAttribute(sz, 1));
    g.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
    this.geo = g;
    this.timeU = { value: 0 };
    this.camU = { value: new THREE.Vector3() };
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: this.timeU, camPos: this.camU },
      vertexShader: RAIN_VS, fragmentShader: RAIN_FS,
      transparent: true, depthWrite: false, fog: false
    });
    this.mesh = new THREE.LineSegments(g, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.t = 0;
  }
  setCount(n) { this.active = Math.min(this.count, n); this.geo.setDrawRange(0, this.active * 2); }
  update(dt, cam) {
    this.t += dt;
    this.timeU.value = this.t;
    this.camU.value.copy(cam.position);
  }
}
