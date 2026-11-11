// 程序化贴图：全部在 canvas 上实时绘制（原创，无外部图片）
import * as THREE from '../vendor/three/three.module.js';
import { mulberry } from './util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, srgb = true, rep = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// 集装箱侧板：波纹 + 锈流痕 + 编号
export function containerTextures(base, seed, code) {
  const r = mulberry(seed);
  const W = 512, H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  // 波纹明暗
  for (let x = 0; x < W; x += 8) {
    const shade = (Math.sin(x / 8 * Math.PI) * 0.5 + 0.5);
    g.fillStyle = `rgba(0,0,0,${0.06 + shade * 0.1})`;
    g.fillRect(x, 0, 3, H);
    g.fillStyle = `rgba(255,255,255,${0.04})`;
    g.fillRect(x + 4, 0, 2, H);
  }
  // 污渍与褪色斑块
  for (let i = 0; i < 40; i++) {
    const x = r() * W, y = r() * H, s = 6 + r() * 34;
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    const rust = r() < 0.6;
    gr.addColorStop(0, rust ? `rgba(${110 + r() * 40},${48 + r() * 20},${20},${0.15 + r() * 0.22})` : `rgba(30,28,24,${0.12 + r() * 0.15})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  // 锈流痕（自上而下）
  for (let i = 0; i < 46; i++) {
    const x = r() * W, len = 30 + r() * 180, w = 1 + r() * 4;
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, `rgba(120,52,20,${0.5 + r() * 0.3})`);
    gr.addColorStop(1, 'rgba(90,40,15,0)');
    g.fillStyle = gr; g.fillRect(x, r() * 20, w, len);
  }
  // 底部泥水
  const gb = g.createLinearGradient(0, H * 0.7, 0, H);
  gb.addColorStop(0, 'rgba(25,20,15,0)'); gb.addColorStop(1, 'rgba(25,20,15,0.6)');
  g.fillStyle = gb; g.fillRect(0, H * 0.7, W, H * 0.3);
  // 框边
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, W, 9); g.fillRect(0, H - 11, W, 11); g.fillRect(0, 0, 10, H); g.fillRect(W - 10, 0, 10, H);
  // 编号
  if (code) {
    g.font = 'bold 16px monospace';
    g.fillStyle = 'rgba(235,230,215,0.38)';
    g.fillText(code, W - 190, 40);
    g.font = '10px monospace';
    g.fillText('最大总重 30 480 KG', W - 190, 60);
    g.fillText('皮重 3 750 KG', W - 190, 76);
  }
  const map = tex(c);
  // 法线（只有波纹）
  const [nc, ng] = canvas(128, 4);
  for (let x = 0; x < 128; x++) {
    const d = Math.cos((x / 2) * Math.PI);
    const nx = Math.round(128 + d * 90);
    ng.fillStyle = `rgb(${nx},128,255)`; ng.fillRect(x, 0, 1, 4);
  }
  const normal = tex(nc, false);
  normal.repeat.set(1, 1);
  // 粗糙度：锈处粗糙，漆面较光滑+雨水
  const [rc, rg] = canvas(256, 128);
  rg.fillStyle = 'rgb(140,140,140)'; rg.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 60; i++) {
    rg.fillStyle = r() < 0.5 ? 'rgba(230,230,230,0.35)' : 'rgba(70,70,70,0.4)';
    rg.fillRect(r() * 256, r() * 128, 2 + r() * 30, 3 + r() * 60);
  }
  const rough = tex(rc, false);
  return { map, normal, rough };
}

// 港区路面：混凝土 + 积水（粗糙度低处=积水反光）
export function groundTextures() {
  const r = mulberry(77);
  const S = 1024;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#4a4741'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const v = 50 + r() * 40;
    g.fillStyle = `rgba(${v},${v - 2},${v - 6},${0.25})`;
    g.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3);
  }
  // 板块接缝
  g.strokeStyle = 'rgba(20,18,15,0.55)'; g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * S / 4, 0); g.lineTo(i * S / 4, S); g.stroke();
    g.beginPath(); g.moveTo(0, i * S / 4); g.lineTo(S, i * S / 4); g.stroke();
  }
  // 油污、轮胎痕
  for (let i = 0; i < 40; i++) {
    const x = r() * S, y = r() * S, s = 20 + r() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, `rgba(15,14,12,${0.25 + r() * 0.3})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2);
  }
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = 'rgba(18,16,14,0.25)'; g.lineWidth = 10 + r() * 8;
    g.beginPath(); const x = r() * S; g.moveTo(x, 0); g.bezierCurveTo(x + r() * 200 - 100, S / 3, x + r() * 200 - 100, S * 2 / 3, x + r() * 100 - 50, S); g.stroke();
  }
  // 裂缝
  g.strokeStyle = 'rgba(10,9,8,0.6)'; g.lineWidth = 1.2;
  for (let i = 0; i < 30; i++) {
    let x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += r() * 40 - 20; y += r() * 40 - 20; g.lineTo(x, y); }
    g.stroke();
  }
  const map = tex(c);
  // 粗糙度 + 积水
  const [rc, rg] = canvas(512, 512);
  rg.fillStyle = 'rgb(150,150,150)'; rg.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 400; i++) { const v = 110 + r() * 90; rg.fillStyle = `rgba(${v},${v},${v},0.25)`; rg.beginPath(); rg.arc(r() * 512, r() * 512, 6 + r() * 30, 0, 7); rg.fill(); }
  for (let i = 0; i < 34; i++) {
    const x = r() * 512, y = r() * 512, s = 20 + r() * 80;
    const gr = rg.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, 'rgba(10,10,10,0.95)'); gr.addColorStop(0.5, 'rgba(30,30,30,0.7)'); gr.addColorStop(1, 'rgba(150,150,150,0)');
    rg.fillStyle = gr; rg.beginPath(); rg.ellipse(x, y, s, s * (0.4 + r() * 0.6), r() * 3, 0, 7); rg.fill();
  }
  for (let i = 0; i < 3000; i++) {
    rg.fillStyle = `rgba(${r() < 0.5 ? 255 : 90},0,0,0.08)`;
    rg.fillRect(r() * 512, r() * 512, 2, 2);
  }
  const rough = tex(rc, false);
  return { map, rough };
}

// 通用金属/混凝土噪声
export function noiseTexture(base, seed, streaks = true, size = 256) {
  const r = mulberry(seed);
  const [c, g] = canvas(size, size);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 6; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.08 + r() * 0.1})` : `rgba(255,240,220,${0.03 + r() * 0.04})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 4, 1 + r() * 4);
  }
  if (streaks) {
    for (let i = 0; i < 24; i++) {
      const x = r() * size, len = 20 + r() * size * 0.6;
      const gr = g.createLinearGradient(0, 0, 0, len);
      gr.addColorStop(0, `rgba(110,48,18,${0.35 + r() * 0.3})`); gr.addColorStop(1, 'rgba(110,48,18,0)');
      g.fillStyle = gr; g.fillRect(x, r() * size * 0.3, 1 + r() * 3, len);
    }
  }
  return tex(c);
}

// 波纹钢板墙（仓库）
export function corrugatedTexture(base, seed) {
  const r = mulberry(seed);
  const [c, g] = canvas(256, 256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 8) {
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 3, 256);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 4, 0, 2, 256);
  }
  for (let i = 0; i < 30; i++) {
    const x = r() * 256, len = 30 + r() * 200;
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, 'rgba(100,44,16,0.55)'); gr.addColorStop(1, 'rgba(100,44,16,0)');
    g.fillStyle = gr; g.fillRect(x, 0, 2 + r() * 3, len);
  }
  return tex(c);
}

// 水面法线（流动）
export function waterNormal() {
  const r = mulberry(5);
  const S = 256;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  const waves = [];
  for (let i = 0; i < 14; i++) waves.push([r() * 6.28, 1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6), r() * 6.28]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let dx = 0, dy = 0;
    for (const [, kx, ky, ph] of waves) {
      const a = (x / S) * kx * 6.283 + (y / S) * ky * 6.283 + ph;
      const c0 = Math.cos(a) / (kx + ky);
      dx += c0 * kx; dy += c0 * ky;
    }
    const i = (y * S + x) * 4;
    img.data[i] = 128 + dx * 22; img.data[i + 1] = 128 + dy * 22; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}

// 标牌文字
export function signTexture(lines, opts = {}) {
  const W = opts.w || 512, H = opts.h || 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = opts.bg || '#d9a531'; g.fillRect(0, 0, W, H);
  g.fillStyle = opts.fg || '#14110d';
  let y = H * 0.38;
  lines.forEach((l, i) => {
    g.font = `bold ${i === 0 ? (opts.size || 64) : Math.round((opts.size || 64) * 0.5)}px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif`;
    g.fillText(l, 24, y);
    y += i === 0 ? (opts.size || 64) * 0.95 : (opts.size || 64) * 0.62;
  });
  const r = mulberry(lines.join('').length * 31);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(40,20,10,${r() * 0.18})`; g.fillRect(r() * W, r() * H, 2 + r() * 6, 2 + r() * 10); }
  return tex(c, true, false);
}

// 发光圆斑
export function glowTexture() {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c, true, false);
}
// 竖向倒影条（湿地上灯光拉长倒影）
export function streakTexture() {
  const [c, g] = canvas(64, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  const img = g.getImageData(0, 0, 64, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
    const f = Math.exp(-Math.pow((x - 32) / 12, 2)) * (0.75 + 0.25 * Math.sin(y * 0.5 + x));
    img.data[(y * 64 + x) * 4 + 3] *= f;
  }
  g.putImageData(img, 0, 0);
  return tex(c, true, false);
}
