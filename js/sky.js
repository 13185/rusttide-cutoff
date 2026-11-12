// 破晓前冷青夜空：自写着色器（深青灰渐变 + 极弱月光 + 程序化云层）
import * as THREE from '../vendor/three/three.module.js';

const VS = `
varying vec3 vDir;
void main(){
  vDir = normalize((modelMatrix * vec4(position,0.0)).xyz);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  gl_Position = p.xyww;
}`;
const FS = `
precision highp float;
varying vec3 vDir;
uniform vec3 sunDir;
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 sunCol;
uniform vec3 cloudDark;
uniform vec3 cloudLit;
uniform float time;
uniform float cover;
uniform float uFlash;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*n2(p); p=p*2.03+vec2(1.7,9.2); a*=0.5;} return s; }
void main(){
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -0.2, 1.0);
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  vec3 col = mix(horizon, zenith, pow(clamp(up,0.0,1.0), 0.45));
  // 极弱冷月光晕（无日出暖边）
  col += sunCol * (pow(sd, 6.0) * 0.55 + pow(sd, 48.0) * 1.4) * smoothstep(-0.1, 0.25, 1.0 - up);
  // 云：投影到平面
  if (d.y > -0.05) {
    vec2 uv = d.xz / (d.y + 0.08) * 0.55 + vec2(time * 0.004, time * 0.0015);
    float c = fbm(uv * 1.3);
    float c2 = fbm(uv * 3.1 + 4.0);
    float dens = smoothstep(1.0 - cover - 0.15, 1.0 - cover + 0.35, c * 0.75 + c2 * 0.35);
    float edge = pow(sd, 3.0) * (1.0 - dens) * 1.5 + pow(sd, 10.0) * 0.8;
    vec3 cc = mix(cloudDark, cloudLit, clamp(edge + c2 * 0.25, 0.0, 1.0));
    float fade = smoothstep(-0.02, 0.18, d.y);
    col = mix(col, cc, dens * fade * 0.92);
    // 云缝透光条纹
    col += sunCol * pow(sd, 20.0) * (1.0 - dens) * 0.6;
  }
  // 地平线以下：雾色
  col = mix(col, horizon * 0.75, smoothstep(0.0, -0.12, d.y));
  col += vec3(0.72, 0.8, 0.92) * uFlash;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(sunDir) {
    this.uniforms = {
      sunDir: { value: sunDir.clone() },
      zenith: { value: new THREE.Color('#141c24') },
      horizon: { value: new THREE.Color('#2a3540') },
      sunCol: { value: new THREE.Color('#7a8ea0') },
      cloudDark: { value: new THREE.Color('#1a222c') },
      cloudLit: { value: new THREE.Color('#3a4654') },
      time: { value: 0 },
      cover: { value: 0.78 },
      uFlash: { value: 0 }
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }
  update(t, camPos) { this.uniforms.time.value = t; this.mesh.position.copy(camPos); }
}
