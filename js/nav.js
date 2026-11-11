// 导航网格：由碰撞盒栅格化（1 m 格），带净空距离场；8 邻接 A* + 视线拉直（原创实现）
export class NavGrid {
  constructor(world, x0 = -76, x1 = 76, z0 = -61, z1 = 106, cell = 1) {
    this.x0 = x0; this.z0 = z0; this.cell = cell;
    this.w = Math.ceil((x1 - x0) / cell); this.h = Math.ceil((z1 - z0) / cell);
    const N = this.w * this.h;
    this.block = new Uint8Array(N);
    for (const b of world.boxes) {
      if (b.y0 > 1.6 || b.y1 < 0.6) continue; // 头顶横梁或低矮路沿不挡路
      const i0 = Math.max(0, Math.floor((b.x0 - x0) / cell)), i1 = Math.min(this.w - 1, Math.floor((b.x1 - x0 - 1e-6) / cell));
      const j0 = Math.max(0, Math.floor((b.z0 - z0) / cell)), j1 = Math.min(this.h - 1, Math.floor((b.z1 - z0 - 1e-6) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.block[j * this.w + i] = 1;
    }
    // 净空：到最近阻挡格的切比雪夫距离（格）
    this.clear = new Uint8Array(N).fill(255);
    const q = new Int32Array(N); let qh = 0, qt = 0;
    for (let k = 0; k < N; k++) if (this.block[k]) { this.clear[k] = 0; q[qt++] = k; }
    for (let i = 0; i < this.w; i++) for (const j of [0, this.h - 1]) { const k = j * this.w + i; if (this.clear[k] > 1) { this.clear[k] = 1; q[qt++] = k; } }
    for (let j = 0; j < this.h; j++) for (const i of [0, this.w - 1]) { const k = j * this.w + i; if (this.clear[k] > 1) { this.clear[k] = 1; q[qt++] = k; } }
    while (qh < qt) {
      const k = q[qh++]; const i = k % this.w, j = (k / this.w) | 0; const c = this.clear[k] + 1;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= this.w || nj >= this.h) continue;
        const nk = nj * this.w + ni; if (this.clear[nk] > c) { this.clear[nk] = c; q[qt++] = nk; }
      }
    }
    this.g = new Float32Array(N); this.f = new Float32Array(N); this.from = new Int32Array(N); this.seen = new Uint32Array(N); this.closed = new Uint32Array(N); this.stamp = 1;
    this.heap = new Int32Array(N * 2); this.paths = 0; this.lastMs = 0;
  }
  idx(x, z) { const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell); if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1; return j * this.w + i; }
  center(k) { return { x: this.x0 + (k % this.w + 0.5) * this.cell, z: this.z0 + (((k / this.w) | 0) + 0.5) * this.cell }; }
  ok(k, need) { return k >= 0 && this.clear[k] >= need; }
  // 最近可走格（螺旋搜索）
  nearest(x, z, need = 1, maxR = 12) {
    const k0 = this.idx(Math.max(this.x0 + 0.5, Math.min(this.x0 + this.w - 0.5, x)), Math.max(this.z0 + 0.5, Math.min(this.z0 + this.h - 0.5, z)));
    if (this.ok(k0, need)) return k0;
    const i0 = k0 % this.w, j0 = (k0 / this.w) | 0;
    for (let r = 1; r <= maxR; r++) {
      let best = -1, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const k = j * this.w + i; if (!this.ok(k, need)) continue;
        const d = di * di + dj * dj; if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  // 格子上的直线是否全程有净空（Bresenham 超采样）
  clearLine(ax, az, bx, bz, need) {
    const L = Math.hypot(bx - ax, bz - az); const n = Math.ceil(L / (this.cell * 0.4)) + 1;
    for (let s = 0; s <= n; s++) { const t = s / n; if (!this.ok(this.idx(ax + (bx - ax) * t, az + (bz - az) * t), need)) return false; }
    return true;
  }
  find(ax, az, bx, bz, need = 1, maxIter = 9000) {
    const t0 = performance.now();
    const s = this.nearest(ax, az, need), e = this.nearest(bx, bz, need);
    if (s < 0 || e < 0) return null;
    this.paths++;
    const st = ++this.stamp; const W = this.w;
    const ei = e % W, ej = (e / W) | 0;
    const H = (k) => { const dx = Math.abs(k % W - ei), dz = Math.abs(((k / W) | 0) - ej); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
    const heap = this.heap; let hn = 0;
    const push = (k) => { let i = hn++; heap[i] = k; while (i > 0) { const p = (i - 1) >> 1; if (this.f[heap[p]] <= this.f[k]) break; heap[i] = heap[p]; heap[p] = k; i = p; } };
    const pop = () => { const top = heap[0]; const last = heap[--hn]; let i = 0; heap[0] = last; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < hn && this.f[heap[l]] < this.f[heap[m]]) m = l; if (r < hn && this.f[heap[r]] < this.f[heap[m]]) m = r; if (m === i) break; const t = heap[i]; heap[i] = heap[m]; heap[m] = t; i = m; } return top; };
    this.g[s] = 0; this.f[s] = H(s); this.from[s] = -1; this.seen[s] = st; push(s);
    let found = false, it = 0, bestK = s, bestH = H(s);
    while (hn > 0 && it++ < maxIter) {
      const k = pop(); if (this.closed[k] === st) continue; this.closed[k] = st;
      if (k === e) { found = true; break; }
      const hk = this.f[k] - this.g[k]; if (hk < bestH) { bestH = hk; bestK = k; }
      const i = k % W, j = (k / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= this.h) continue;
        const nk = nj * W + ni; if (this.clear[nk] < need || this.closed[nk] === st) continue;
        if (di && dj && (this.clear[j * W + ni] < need || this.clear[nj * W + i] < need)) continue; // 不切角
        // 贴墙代价：净空越小越贵，让路径走通道中线
        const wall = this.clear[nk] <= need ? 0.6 : this.clear[nk] === need + 1 ? 0.2 : 0;
        const ng = this.g[k] + (di && dj ? 1.4142 : 1) + wall;
        if (this.seen[nk] !== st || ng < this.g[nk]) { this.seen[nk] = st; this.g[nk] = ng; this.f[nk] = ng + H(nk); this.from[nk] = k; push(nk); }
      }
    }
    const end = found ? e : bestK;
    const cells = []; for (let k = end; k >= 0; k = this.from[k]) { cells.push(k); if (k === s) break; }
    cells.reverse();
    // 视线拉直
    const pts = cells.map((k) => this.center(k));
    const out = [pts[0]]; let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1 && !this.clearLine(pts[a].x, pts[a].z, pts[b].x, pts[b].z, need)) b--;
      out.push(pts[b]); a = b;
    }
    this.lastMs = performance.now() - t0;
    return { pts: out, complete: found };
  }
}
