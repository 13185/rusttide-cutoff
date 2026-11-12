// 资产加载：Blender 导出的 glb 模型 + 烘焙 PBR 贴图（作者：Jack；枪械为改装的第三方 CC BY 4.0 模型，见 NOTICE）
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';

const MODELS = ['rifle', 'shotgun', 'grenade', 'containers', 'cranes', 'props', 'enemies', 'yardprops'];
const TEXSETS = ['paint', 'enemy', 'steel', 'gunmetal', 'polymer', 'concrete', 'corten', 'contpaint', 'wood', 'cardboard'];

export const A = { models: {}, tex: {}, wet: { value: 1.0 } };
let assetQ = null;
export function setAssetQuality(q) { assetQ = q; }

export async function loadAssets(progress) {
  const gl = new GLTFLoader();
  const tl = new THREE.TextureLoader();
  let done = 0; const total = MODELS.length + TEXSETS.length * 3 + 4;
  const tick = () => progress && progress(++done / total);
  const tex = (url, srgb) => new Promise((res, rej) => tl.load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    tick(); res(t);
  }, undefined, rej));
  const jobs = [];
  // 低画质：枪械用 1024 贴图版本（*_lo.glb）
  const q = assetQ || new URLSearchParams(location.search).get('quality') || localStorage.getItem('rt.quality') || 'high';
  const file = (m) => ((q === 'low' || q === 'mobile') && (m === 'rifle' || m === 'shotgun') ? `${m}_lo` : m);
  for (const m of MODELS) jobs.push(new Promise((res, rej) => gl.load(`models/${file(m)}.glb`, (g) => { A.models[m] = g.scene; tick(); res(); }, undefined, rej)));
  for (const s of TEXSETS) {
    jobs.push(Promise.all([tex(`textures/${s}_a.jpg`, true), tex(`textures/${s}_n.jpg`, false), tex(`textures/${s}_orm.jpg`, false)]).then(([a, n, orm]) => { A.tex[s] = { a, n, orm }; }));
  }
  jobs.push(tex('textures/puddles.png', false).then((t) => { A.tex.puddles = t; }));
  jobs.push(new Promise((res, rej) => tl.load('textures/container_mark.png', (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8;
    A.tex.mark = t; tick(); res();
  }, undefined, rej)));
  jobs.push(new Promise((res, rej) => tl.load('textures/yard_decals.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8;
    A.tex.decals = t; tick(); res();
  }, undefined, rej)));
  jobs.push(new Promise((res, rej) => tl.load('textures/yard_decals_n.jpg', (t) => {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8;
    A.tex.decalsN = t; tick(); res();
  }, undefined, rej)));
  await Promise.all(jobs);
  // glTF 顶点色 → 自定义 wear 属性（不让它当作颜色乘进去）
  for (const k of MODELS) A.models[k].traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    // Blender 导出时 COLOR_0 是默认白色层，COLOR_1 才是烘焙的凸边磨损
    const w = g.attributes.color_1 || g.attributes.color;
    if (w) g.setAttribute('wear', w);
    g.deleteAttribute('color'); g.deleteAttribute('color_1');
  });
  return A;
}

// 共享贴图在不同 repeat 下需要克隆
const cache = new Map();
function rep(t, r) {
  if (r === 1) return t;
  const k = t.uuid + ':' + r;
  if (!cache.has(k)) { const c = t.clone(); c.repeat.set(r, r); c.needsUpdate = true; cache.set(k, c); }
  return cache.get(k);
}

/**
 * PBR 材质：反照率 × 颜色、法线、ORM（R=磨损噪声 G=粗糙 B=金属）
 * 顶点 wear（Blender 按凸边夹角烘焙）+ 噪声 → 边角掉漆露出亮钢；朝上表面受雨淋变湿（更暗、更光滑）
 */
export function pbr(set, o = {}) {
  const t = A.tex[set]; const r = o.repeat || 1;
  const m = new THREE.MeshStandardMaterial({
    color: o.color ?? 0xffffff, map: rep(t.a, r), normalMap: rep(t.n, r), roughnessMap: rep(t.orm, r), metalnessMap: rep(t.orm, r),
    roughness: o.rough ?? 1, metalness: o.metal ?? 1, normalScale: new THREE.Vector2(o.normal ?? 1, o.normal ?? 1),
    envMapIntensity: o.env ?? 1
  });
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  const wearAmt = o.wear ?? 0.8, wearCol = new THREE.Color(o.wearColor ?? 0x8e8f90), wet = o.wet ?? 1;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = A.wet; sh.uniforms.wearCol = { value: wearCol };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 wear; varying float vWear; varying float vUp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vWear = wear.r;
{ vec3 wn = mat3(modelMatrix) * objectNormal;
#ifdef USE_INSTANCING
  wn = mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal;
#endif
  vUp = normalize(wn).y; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet; uniform vec3 wearCol; varying float vWear; varying float vUp;')
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
{
  float wn = texture2D(roughnessMap, vRoughnessMapUv).r;
  float em = smoothstep(0.5, 0.78, vWear * 0.9 + (wn - 0.5) * 0.75) * ${wearAmt.toFixed(3)};
  diffuseColor.rgb = mix(diffuseColor.rgb, wearCol, em);
  metalnessFactor = mix(metalnessFactor, 0.85, em);
  roughnessFactor = mix(roughnessFactor, 0.35, em);
  float wet = uWet * ${wet.toFixed(3)} * (0.3 + 0.7 * smoothstep(0.2, 0.9, vUp));
  diffuseColor.rgb *= mix(1.0, 0.72, wet * (1.0 - metalnessFactor * 0.6));
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, wet);
}`);
  };
  m.customProgramCacheKey = () => `pbr-${wearAmt}-${wet}`;
  return m;
}

/** 克隆一个 glb 子树并按材质名替换材质 */
export function instance(modelName, nodeName, matFor, opts = {}) {
  const src = nodeName ? A.models[modelName].getObjectByName(nodeName) : A.models[modelName];
  const c = src.clone(true);
  c.position.set(0, 0, 0);
  c.traverse((o) => {
    if (!o.isMesh) return;
    const nm = o.material.name;
    o.material = matFor(nm, o) || o.material;
    o.castShadow = opts.shadow ?? true; o.receiveShadow = opts.receive ?? true;
  });
  return c;
}

/** 取单个网格节点的几何（多材质时 glTF 会拆成 Group 下多个 Mesh） */
export function meshParts(modelName, nodeName) {
  const n = A.models[modelName].getObjectByName(nodeName);
  const out = [];
  n.traverse((o) => { if (o.isMesh) out.push({ geometry: o.geometry, mat: o.material.name }); });
  return out;
}
