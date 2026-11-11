# 锈潮断链 · 程序化 PBR 贴图烘焙（作者：Jack · 原创，禁止转载）
# 用法：python3 art/bake_textures.py  → textures/*.jpg
# 每组输出：<name>_a.jpg（反照率）、<name>_n.jpg（切线空间法线）、<name>_orm.jpg（R=磨损噪声 G=粗糙度 B=金属度）
import numpy as np, os
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'textures')
os.makedirs(OUT, exist_ok=True)

def vnoise(S, fx, fy, rng):
    """可平铺值噪声，x/y 频率可不同（各向异性 → 竖向流痕）"""
    g = rng.random((fy, fx))
    y = np.linspace(0, fy, S, endpoint=False); x = np.linspace(0, fx, S, endpoint=False)
    y0 = np.floor(y).astype(int); x0 = np.floor(x).astype(int)
    ty = y - y0; tx = x - x0
    ty = ty * ty * (3 - 2 * ty); tx = tx * tx * (3 - 2 * tx)
    y1 = (y0 + 1) % fy; x1 = (x0 + 1) % fx
    a = g[y0][:, x0]; b = g[y0][:, x1]; c = g[y1][:, x0]; d = g[y1][:, x1]
    tx = tx[None, :]; ty = ty[:, None]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty

def fbm(S, f, oct, rng, aniso=1.0, gain=0.5):
    out = np.zeros((S, S)); amp = 1; tot = 0
    for i in range(oct):
        fx = int(f * 2 ** i); fy = max(1, int(f * 2 ** i / aniso))
        out += vnoise(S, fx, fy, rng) * amp; tot += amp; amp *= gain
    return out / tot

def smear_down(src, decay):
    """自上而下拖尾（图像行向下 = 物体向下）"""
    s = src.copy()
    for _ in range(2):
        for y in range(1, s.shape[0]):
            np.maximum(s[y], s[y - 1] * decay, out=s[y])
        s[0] = np.maximum(s[0], s[-1] * decay)
    return s

def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.stack([-dx, dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5

def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def save(name, alb, nrm, orm, q=88):
    Image.fromarray((np.clip(alb, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).save(f'{OUT}/{name}_a.jpg', quality=q)
    Image.fromarray((np.clip(nrm, 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/{name}_n.jpg', quality=q)
    Image.fromarray((np.clip(orm, 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/{name}_orm.jpg', quality=q)
    print('baked', name)

def lerp(a, b, t): return a + (b - a) * t[..., None] if np.ndim(t) == 2 and np.ndim(a) else a + (b - a) * t
def col(c): return np.array(c, dtype=np.float64)[None, None, :]

def painted(name, S, seed, chip_amt=0.5, rust_amt=0.5, rain_amt=0.6, metal_paint=0.25):
    """漆面钢：中性浅灰底色（运行时乘以实例颜色）+ 掉漆 + 锈流痕 + 雨痕 + 底部污垢"""
    rng = np.random.default_rng(seed)
    base = fbm(S, 4, 6, rng)
    micro = fbm(S, 64, 3, rng)
    chipN = fbm(S, 20, 5, rng)
    chips = ss(0.75 - chip_amt * 0.08, 0.765 - chip_amt * 0.08, chipN * 0.8 + micro * 0.2)
    rustSrc = chips * ss(0.55, 0.7, fbm(S, 6, 3, rng)) * rust_amt
    streakN = fbm(S, 96, 3, rng, aniso=24)
    dots = (rng.random((S, S)) > 0.99985).astype(float) * rust_amt
    dots = np.maximum(dots, np.roll(dots, 1, 1)); dots = np.maximum(dots, np.roll(dots, 2, 1))
    rustStreak = np.clip(smear_down(np.maximum(rustSrc, dots), 0.9965) * ss(0.3, 0.7, streakN) * 1.1, 0, 0.85)
    rain = ss(0.45, 0.85, fbm(S, 128, 3, rng, aniso=32)) * rain_amt
    grime = ss(0.4, 0.8, fbm(S, 3, 4, rng)) * 0.5
    paintC = col((0.78, 0.78, 0.76)) * (0.86 + base[..., None] * 0.22 + micro[..., None] * 0.05)
    primer = col((0.30, 0.20, 0.13))
    rustC = col((0.33, 0.13, 0.05)) * (0.7 + micro[..., None] * 0.6)
    alb = paintC * (1 - rain[..., None] * 0.18) * (1 - grime[..., None] * 0.35)
    alb = alb * (1 - rustStreak[..., None]) + rustC * rustStreak[..., None]
    alb = alb * (1 - chips[..., None]) + (primer * (1 - rustSrc[..., None]) + rustC * rustSrc[..., None]) * chips[..., None]
    h = base * 0.4 + micro * 0.25 - chips * 0.9 + rustSrc * 0.4 * micro
    nrm = normal_from_height(h, 6.0 * S / 1024)
    rough = 0.42 + base * 0.12 + micro * 0.06 + chips * 0.25 + rustStreak * 0.25 - rain * 0.22 + grime * 0.1
    metal = metal_paint * (1 - chips) + chips * (0.75 * (1 - rustSrc)) * 1.0
    wear = fbm(S, 24, 4, rng)
    orm = np.stack([wear, rough, metal], -1)
    save(name, alb, nrm, orm)

def steel(name, S, seed, tint=(0.32, 0.32, 0.33), rough0=0.38, metal=0.9, scratch=True):
    rng = np.random.default_rng(seed)
    base = fbm(S, 5, 6, rng); micro = fbm(S, 96, 3, rng)
    alb = col(tint) * (0.8 + base[..., None] * 0.35 + micro[..., None] * 0.1)
    h = micro * 0.3 + base * 0.2
    rough = rough0 + base * 0.18 + micro * 0.08
    if scratch:
        sc = np.zeros((S, S))
        for _ in range(500):
            x, y = rng.random(2) * S; a = rng.random() * np.pi; L = 10 + rng.random() * 80
            t = np.linspace(0, L, int(L))
            xs = ((x + np.cos(a) * t) % S).astype(int); ys = ((y + np.sin(a) * t) % S).astype(int)
            sc[ys, xs] = np.maximum(sc[ys, xs], 0.4 + rng.random() * 0.6)
        alb = alb + sc[..., None] * 0.08; rough = rough - sc * 0.12; h = h - sc * 0.3
    oil = ss(0.6, 0.8, fbm(S, 4, 4, rng))
    alb = alb * (1 - oil[..., None] * 0.4); rough = rough - oil * 0.15
    nrm = normal_from_height(h, 3.0 * S / 1024)
    orm = np.stack([fbm(S, 24, 3, rng), rough, np.full((S, S), metal)], -1)
    save(name, alb, nrm, orm)

def polymer(name, S, seed, tint, rough0=0.62):
    """枪械聚合物 / 手套布料：细颗粒"""
    rng = np.random.default_rng(seed)
    base = fbm(S, 6, 4, rng); grain = rng.random((S, S)); micro = fbm(S, 128, 2, rng)
    alb = col(tint) * (0.85 + base[..., None] * 0.2 + grain[..., None] * 0.06)
    h = grain * 0.3 + micro * 0.4
    nrm = normal_from_height(h, 1.2 * S / 1024)
    rough = rough0 + base * 0.1 + grain * 0.06 - ss(0.6, 0.8, fbm(S, 8, 3, rng)) * 0.15
    orm = np.stack([fbm(S, 24, 3, rng), rough, np.zeros((S, S))], -1)
    save(name, alb, nrm, orm)

def concrete(name, S, seed):
    """港区路面：骨料 + 接缝 + 裂缝 + 油污 + 轮胎痕 + 积水（低粗糙）"""
    rng = np.random.default_rng(seed)
    base = fbm(S, 4, 7, rng); micro = fbm(S, 160, 2, rng); grain = rng.random((S, S))
    agg = ss(0.62, 0.7, fbm(S, 90, 2, rng)) * 0.5
    alb = col((0.30, 0.29, 0.27)) * (0.75 + base[..., None] * 0.45 + micro[..., None] * 0.12 + grain[..., None] * 0.06 + agg[..., None] * 0.2)
    h = base * 0.3 + micro * 0.25 + grain * 0.1 + agg * 0.2
    # 板块接缝（4×4 m 分块）
    seam = np.zeros((S, S)); w = max(2, S // 400)
    for k in range(4):
        p = k * S // 4; seam[:, p:p + w] = 1; seam[p:p + w, :] = 1
    # 裂缝
    cr = np.zeros((S, S))
    for _ in range(60):
        x, y = rng.random(2) * S; a = rng.random() * 6.28
        for _ in range(int(40 + rng.random() * 120)):
            a += rng.normal() * 0.35; x = (x + np.cos(a) * 2) % S; y = (y + np.sin(a) * 2) % S
            cr[int(y), int(x)] = 1
    cr = np.maximum(cr, np.roll(cr, 1, 1) * 0.6)
    oil = ss(0.62, 0.85, fbm(S, 6, 5, rng))
    tyre = ss(0.55, 0.9, fbm(S, 64, 3, rng, aniso=0.04)) * 0.5
    alb = alb * (1 - seam[..., None] * 0.55) * (1 - cr[..., None] * 0.6) * (1 - oil[..., None] * 0.45) * (1 - tyre[..., None] * 0.35)
    h = h - seam * 0.8 - cr * 0.6
    puddle = ss(0.62, 0.68, fbm(S, 5, 5, rng) - h * 0.05)
    h = h * (1 - puddle) + puddle * 0.25
    alb = alb * (1 - puddle[..., None] * 0.35)
    nrm = normal_from_height(h, 5.0 * S / 1024)
    rough = 0.82 - base * 0.1 + micro * 0.06 - oil * 0.25 - tyre * 0.1
    rough = rough * (1 - puddle) + 0.03 * puddle
    orm = np.stack([puddle, rough, np.zeros((S, S))], -1)
    save(name, alb, nrm, orm)

def puddle_mask(S, seed):
    rng = np.random.default_rng(seed)
    m = ss(0.56, 0.64, fbm(S, 8, 5, rng))
    Image.fromarray((m * 255).astype(np.uint8)).save(f'{OUT}/puddles.png')
    print('baked puddles')

painted('paint', 1024, 11, 0.55, 0.6, 0.7, 0.2)
painted('enemy', 1024, 23, 0.7, 0.35, 0.3, 0.55)
steel('steel', 1024, 31)
steel('gunmetal', 1024, 37, (0.09, 0.09, 0.095), 0.34, 0.85)
polymer('polymer', 512, 41, (0.5, 0.5, 0.5))
concrete('concrete', 2048, 53)
puddle_mask(512, 59)
