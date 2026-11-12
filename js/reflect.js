// 平面反射：为湿地/水面渲染镜像视图（原创实现）
import * as THREE from '../vendor/three/three.module.js';

export class PlanarReflection {
  constructor(renderer, scale = 0.5) {
    this.renderer = renderer;
    this.scale = scale;
    this.enabled = true;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 0 });
    this.cam = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.hidden = [];
    this.only = []; // 仅在反射中出现的低模代理
    this.planeY = 0;
    this._v = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.blank.needsUpdate = true;
    this.uniform = { value: this.rt.texture };
    this.strength = { value: 1 };
  }
  setSize(w, h) {
    const pr = this.renderer.getPixelRatio();
    this.rt.setSize(Math.max(2, Math.floor(w * pr * this.scale)), Math.max(2, Math.floor(h * pr * this.scale)));
  }
  setEnabled(on) {
    this.enabled = on;
    this.uniform.value = on ? this.rt.texture : this.blank;
    this.strength.value = on ? 1 : 0;
  }
  update(scene, camera) {
    if (!this.enabled) return;
    const c = this.cam;
    c.copy(camera);
    const y = this.planeY;
    camera.getWorldPosition(this._v);
    camera.getWorldDirection(this._t);
    this._u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    c.position.set(this._v.x, 2 * y - this._v.y, this._v.z);
    const target = this._t.add(this._v);
    target.y = 2 * y - target.y;
    c.up.set(this._u.x, -this._u.y, this._u.z);
    c.lookAt(target);
    c.updateMatrixWorld();
    c.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
    for (const o of this.hidden) o.visible = false;
    for (const o of this.only) o.visible = true;
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, c);
    r.setRenderTarget(prevRT);
    r.shadowMap.autoUpdate = prevShadow;
    for (const o of this.hidden) o.visible = true;
    for (const o of this.only) o.visible = false;
  }
  // 把反射注入 MeshStandardMaterial
  patch(material, opts = {}) {
    const self = this;
    const amount = opts.amount ?? 1.0;
    const distort = opts.distort ?? 0.012;
    material.userData.rippleTime = material.userData.rippleTime || { value: 0 };
    material.onBeforeCompile = (sh) => {
      sh.uniforms.tRefl = self.uniform;
      sh.uniforms.reflStrength = self.strength;
      sh.uniforms.textureMatrix = { value: self.textureMatrix };
      sh.uniforms.rippleTime = material.userData.rippleTime;
      sh.uniforms.tPuddle = { value: opts.puddle || self.blank };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 textureMatrix;\nvarying vec4 vReflUv;\nvarying vec3 vWPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvec4 wp4 = modelMatrix * vec4(transformed,1.0);\nvReflUv = textureMatrix * wp4;\nvWPos = wp4.xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D tRefl; uniform float reflStrength; uniform float rippleTime; uniform sampler2D tPuddle;
varying vec4 vReflUv; varying vec3 vWPos;
float rh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
vec2 ripple(vec2 p, float t){
  vec2 acc = vec2(0.0);
  for(int i=0;i<3;i++){
    vec2 cell = floor(p*1.6 + float(i)*7.3);
    vec2 f = fract(p*1.6 + float(i)*7.3) - 0.5 - (vec2(rh(cell), rh(cell+3.1))-0.5)*0.5;
    float ph = fract(t*0.9 + rh(cell+9.7));
    float d = length(f);
    float ring = sin((d - ph*0.45)*55.0) * smoothstep(0.45*ph+0.05, 0.45*ph, d) * (1.0-ph);
    acc += normalize(f+1e-4) * ring;
  }
  return acc;
}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float pud = ${opts.puddle ? 'smoothstep(0.2, 0.8, texture2D(tPuddle, vWPos.xz / 150.0 + 0.5).r)' : '0.0'};
roughnessFactor = mix(roughnessFactor, 0.025, pud);
diffuseColor.rgb *= mix(1.0, 0.5, pud);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(mix(normal, nonPerturbedNormal, pud * 0.9));`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
{
  float wet = clamp(1.0 - roughnessFactor * 1.15, 0.0, 1.0);
  vec2 rp = ripple(vWPos.xz, rippleTime) * ${distort.toFixed(4)} * (0.4 + wet);
  vec2 ruv = vReflUv.xy / vReflUv.w + rp + vec2(0.0, (1.0-wet)*0.004);
  float blur = (1.0 - wet) * 0.012 + 0.0015;
  vec3 rc = texture2D(tRefl, ruv).rgb * 0.4;
  rc += texture2D(tRefl, ruv + vec2(blur, 0.0)).rgb * 0.15;
  rc += texture2D(tRefl, ruv - vec2(blur, 0.0)).rgb * 0.15;
  rc += texture2D(tRefl, ruv + vec2(0.0, blur*2.0)).rgb * 0.15;
  rc += texture2D(tRefl, ruv - vec2(0.0, blur*2.0)).rgb * 0.15;
  vec3 V = normalize(cameraPosition - vWPos);
  float fres = 0.08 + 0.92 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
  float k = clamp(fres * (0.32 + wet * 1.28), 0.0, 0.95) * ${amount.toFixed(3)} * reflStrength;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, rc, k);
}`);
    };
    material.needsUpdate = true;
  }
}
