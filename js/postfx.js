// 后期：SSAO + 泛光 + 体积光 + 调色 + 胶片颗粒（作者：Jack，自尘线突击管线演进）

import * as THREE from '../vendor/three/three.module.js';

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BRIGHT = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float threshold;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec3 s = max(c - threshold, 0.0);
  gl_FragColor = vec4(s * 1.12, 1.0);
}`;

const BLUR = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 direction;
uniform vec2 resolution;
void main() {
  vec2 off = direction / resolution;
  vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
  sum += texture2D(tDiffuse, vUv + off * 1.3846).rgb * 0.316216;
  sum += texture2D(tDiffuse, vUv - off * 1.3846).rgb * 0.316216;
  sum += texture2D(tDiffuse, vUv + off * 3.2308).rgb * 0.070270;
  sum += texture2D(tDiffuse, vUv - off * 3.2308).rgb * 0.070270;
  gl_FragColor = vec4(sum, 1.0);
}`;

const COMP = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform float bloomStr;
uniform float time;
uniform float grain;
uniform float vignette;
uniform float exposure;
uniform vec2 sunPos;
uniform float shafts;
uniform vec3 lift;
uniform vec3 gain;
uniform float contrast;
uniform float saturation;
uniform float sharpen;
uniform vec2 resolution;

vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// 轻度反锐化遮罩：恢复降锐度之前的清晰度，避免 FXAA 把边缘抹平
vec3 unsharp(sampler2D tex, vec2 uv, float amt) {
  vec2 px = 1.0 / resolution;
  vec3 c = texture2D(tex, uv).rgb;
  if (amt < 0.001) return c;
  vec3 b = (
    texture2D(tex, uv + vec2(px.x, 0.0)).rgb +
    texture2D(tex, uv - vec2(px.x, 0.0)).rgb +
    texture2D(tex, uv + vec2(0.0, px.y)).rgb +
    texture2D(tex, uv - vec2(0.0, px.y)).rgb
  ) * 0.25;
  return c + (c - b) * amt;
}

void main() {
  vec3 col = unsharp(tDiffuse, vUv, sharpen) * exposure;
  col += texture2D(tBloom, vUv).rgb * bloomStr;

  if (shafts > 0.001 && sunPos.x > -0.2 && sunPos.x < 1.2) {
    vec2 dir = sunPos - vUv;
    float dist = length(dir);
    vec2 stepv = dir / 12.0;
    float decay = 1.0;
    float acc = 0.0;
    vec2 uv = vUv;
    for (int i = 0; i < 12; i++) {
      uv += stepv;
      vec3 s = texture2D(tBloom, clamp(uv, 0.0, 1.0)).rgb;
      acc += (s.r + s.g + s.b) * decay;
      decay *= 0.78;
    }
    float fall = smoothstep(1.1, 0.05, dist);
    col += vec3(1.0, 0.72, 0.42) * acc * 0.020 * shafts * fall;
  }

  col = mix(vec3(luma(col)), col, saturation);
  col = (col - 0.5) * contrast + 0.5;
  col = col * gain + lift;
  col = aces(col);
  col = pow(col, vec3(0.95));

  vec2 vc = vUv * (1.0 - vUv);
  float vig = vc.x * vc.y * 16.0;
  vig = pow(clamp(vig, 0.0, 1.0), vignette);
  col *= mix(0.88, 1.0, vig);

  float n = fract(sin(dot(vUv * resolution + time * 5.1, vec2(12.9898, 78.233))) * 43758.5453);
  float n2 = fract(sin(dot(vUv * resolution * 0.5 + time * 2.3, vec2(39.346, 11.135))) * 23421.631);
  col += (n - 0.5) * grain * 0.7 + (n2 - 0.5) * grain * 0.35;

  gl_FragColor = vec4(col, 1.0);
}`;


const SSAO = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float strength;

float linearize(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}

void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  float depth = linearize(texture2D(tDepth, vUv).x);
  vec2 texel = 1.0 / resolution;
  float farF = smoothstep(55.0, 130.0, depth);
  float occ = 0.0;
  vec2 o0 = vec2(1.0, 0.0);
  vec2 o1 = vec2(-1.0, 0.0);
  vec2 o2 = vec2(0.0, 1.0);
  vec2 o3 = vec2(0.0, -1.0);
  vec2 o4 = vec2(0.707, 0.707);
  vec2 o5 = vec2(-0.707, 0.707);
  vec2 o6 = vec2(0.707, -0.707);
  vec2 o7 = vec2(-0.707, -0.707);
  vec2 offs[8];
  offs[0] = o0; offs[1] = o1; offs[2] = o2; offs[3] = o3;
  offs[4] = o4; offs[5] = o5; offs[6] = o6; offs[7] = o7;
  for (int i = 0; i < 8; i++) {
    float sd = linearize(texture2D(tDepth, vUv + offs[i] * texel * 3.2).x);
    occ += clamp((depth - sd) * 0.28, 0.0, 1.0);
  }
  float ao = 1.0 - (occ / 8.0) * strength;
  ao = mix(ao, 1.0, farF);
  gl_FragColor = vec4(col * mix(1.0, ao, 0.75), 1.0);
}
`;

function fsMat(frag, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: frag,
    depthTest: false,
    depthWrite: false
  });
}

export class PostFX {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.enabled = opts.enabled !== false;
    this.quality = opts.quality || 'medium';
    this.size = new THREE.Vector2();
    renderer.getSize(this.size);
    const w = Math.max(2, Math.floor(this.size.x));
    const h = Math.max(2, Math.floor(this.size.y));
    const pr = renderer.getPixelRatio();
    this.sceneRT = new THREE.WebGLRenderTarget(w * pr, h * pr, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true
    });
    this.sceneRT.depthTexture = new THREE.DepthTexture(w * pr, h * pr);
    const bw = Math.max(2, Math.floor(w * pr * 0.5));
    const bh = Math.max(2, Math.floor(h * pr * 0.5));
    this.brightRT = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType });
    this.blurRT = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType });
    this.blurRT2 = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType });
    this.ssaoRT = new THREE.WebGLRenderTarget(w * pr, h * pr, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
    this.fsScene = new THREE.Scene();
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsScene.add(this.quad);

    this.uBright = { tDiffuse: { value: null }, threshold: { value: 0.88 } };
    this.brightMat = fsMat(BRIGHT, this.uBright);
    this.uBlur = { tDiffuse: { value: null }, direction: { value: new THREE.Vector2(1, 0) }, resolution: { value: new THREE.Vector2(bw, bh) } };
    this.blurMat = fsMat(BLUR, this.uBlur);
    this.uSSAO = {
      tDiffuse: { value: null },
      tDepth: { value: null },
      resolution: { value: new THREE.Vector2(w * pr, h * pr) },
      cameraNear: { value: 0.05 },
      cameraFar: { value: 220 },
      strength: { value: 0.55 }
    };
    this.ssaoMat = fsMat(SSAO, this.uSSAO);
    this.uComp = {
      tDiffuse: { value: null },
      tBloom: { value: null },
      bloomStr: { value: 0.42 },
      time: { value: 0 },
      grain: { value: 0.028 },
      vignette: { value: 0.18 },
      exposure: { value: 1.0 },
      sunPos: { value: new THREE.Vector2(0.2, 0.72) },
      shafts: { value: 0.85 },
      lift: { value: new THREE.Vector3(0.006, 0.010, 0.016) },
      gain: { value: new THREE.Vector3(1.03, 1.0, 0.97) },
      contrast: { value: 1.18 },
      saturation: { value: 0.78 },
      sharpen: { value: 0.34 },
      resolution: { value: new THREE.Vector2(1280, 720) }
    };
    this.compMat = fsMat(COMP, this.uComp);
    this.compMat.toneMapped = false;
    this.exposureSmooth = 1.05;
    this.applyQuality(this.quality);
  }

  applyQuality(q) {
    this.quality = q;
    const high = q === 'high';
    const low = q === 'low';
    this.uComp.bloomStr.value = low ? 0.0 : high ? 0.44 : 0.34;
    this.uComp.grain.value = low ? 0.012 : 0.028;
    this.uComp.shafts.value = low ? 0.0 : high ? 0.88 : 0.62;
    this.uComp.sharpen.value = low ? 0.18 : high ? 0.36 : 0.28;
    this.doBloom = !low;
    this.doSSAO = !low;
    this.uSSAO.strength.value = high ? 0.48 : 0.4;
  }

  setSize(w, h) {
    const pr = this.renderer.getPixelRatio();
    this.sceneRT.setSize(Math.max(2, w * pr), Math.max(2, h * pr));
    const bw = Math.max(2, Math.floor(w * pr * 0.5));
    const bh = Math.max(2, Math.floor(h * pr * 0.5));
    this.brightRT.setSize(bw, bh);
    this.blurRT.setSize(bw, bh);
    this.blurRT2.setSize(bw, bh);
    const sw = Math.max(2, Math.floor(w * pr * 0.5));
    const sh = Math.max(2, Math.floor(h * pr * 0.5));
    this.ssaoRT.setSize(sw, sh);
    this.uBlur.resolution.value.set(bw, bh);
    this.uSSAO.resolution.value.set(sw, sh);
    this.uComp.resolution.value.set(Math.max(2, w * pr), Math.max(2, h * pr));
  }

  updateSun(camera, sunDir) {
    const v = this._sunV || (this._sunV = new THREE.Vector3());
    v.copy(sunDir).normalize().multiplyScalar(-80);
    v.project(camera);
    this.uComp.sunPos.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
  }

  render(worldScene, camera, gunScene) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(worldScene, camera);
    if (gunScene) {
      r.clearDepth();
      r.render(gunScene, camera);
    }
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(worldScene, camera);
      if (gunScene) { r.clearDepth(); r.render(gunScene, camera); }
      return;
    }
    let colorTex = this.sceneRT.texture;
    if (this.doSSAO) {
      this.uSSAO.tDiffuse.value = this.sceneRT.texture;
      this.uSSAO.tDepth.value = this.sceneRT.depthTexture;
      this.uSSAO.resolution.value.set(this.ssaoRT.width, this.ssaoRT.height);
      this.quad.material = this.ssaoMat;
      r.setRenderTarget(this.ssaoRT);
      r.render(this.fsScene, this.fsCam);
      colorTex = this.ssaoRT.texture;
    }
    if (this.doBloom) {
      this.uBright.tDiffuse.value = this.sceneRT.texture;
      this.quad.material = this.brightMat;
      r.setRenderTarget(this.brightRT);
      r.render(this.fsScene, this.fsCam);
      this.uBlur.tDiffuse.value = this.brightRT.texture;
      this.uBlur.direction.value.set(1, 0);
      this.quad.material = this.blurMat;
      r.setRenderTarget(this.blurRT);
      r.render(this.fsScene, this.fsCam);
      this.uBlur.tDiffuse.value = this.blurRT.texture;
      this.uBlur.direction.value.set(0, 1);
      r.setRenderTarget(this.blurRT2);
      r.render(this.fsScene, this.fsCam);
      this.uBlur.tDiffuse.value = this.blurRT2.texture;
      this.uBlur.direction.value.set(1, 0);
      r.setRenderTarget(this.blurRT);
      r.render(this.fsScene, this.fsCam);
      this.uBlur.tDiffuse.value = this.blurRT.texture;
      this.uBlur.direction.value.set(0, 1);
      r.setRenderTarget(this.blurRT2);
      r.render(this.fsScene, this.fsCam);
      this.uComp.tBloom.value = this.blurRT2.texture;
    } else {
      this.uComp.tBloom.value = this.brightRT.texture;
    }
    this.uComp.tDiffuse.value = colorTex;
    this.uComp.time.value = performance.now() * 0.001;
    this.uComp.resolution.value.set(this.sceneRT.width, this.sceneRT.height);
    this.quad.material = this.compMat;
    r.setRenderTarget(null);
    r.render(this.fsScene, this.fsCam);
  }

  dispose() {
    this.sceneRT.dispose();
    this.brightRT.dispose();
    this.blurRT.dispose();
    this.blurRT2.dispose();
    this.ssaoRT.dispose();
  }
}
