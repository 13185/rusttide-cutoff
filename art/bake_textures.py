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

def corten(name, S, seed):
    """集装箱专用：更重的剥漆、沿槽流锈、盐雾白斑、擦伤。中性底色供实例着色。"""
    rng = np.random.default_rng(seed)
    base = fbm(S, 4, 6, rng)
    micro = fbm(S, 64, 3, rng)
    chipN = fbm(S, 16, 5, rng)
    chips = ss(0.68, 0.74, chipN * 0.85 + micro * 0.15)
    rustSrc = np.clip(chips * ss(0.45, 0.7, fbm(S, 5, 3, rng)) + ss(0.72, 0.85, fbm(S, 8, 3, rng)) * 0.35, 0, 1)
    streakN = fbm(S, 80, 3, rng, aniso=28)
    dots = (rng.random((S, S)) > 0.9997).astype(float)
    dots = np.maximum(dots, np.roll(dots, 1, 1))
    rustStreak = np.clip(smear_down(np.maximum(rustSrc * 0.8, dots), 0.9972) * ss(0.25, 0.75, streakN) * 1.25, 0, 0.9)
    rain = ss(0.4, 0.88, fbm(S, 140, 3, rng, aniso=36))
    grime = ss(0.35, 0.8, fbm(S, 3, 4, rng)) * 0.55
    salt = ss(0.78, 0.9, fbm(S, 40, 3, rng)) * 0.45
    scratch = np.zeros((S, S))
    for _ in range(220):
        x, y = rng.random(2) * S; a = rng.random() * np.pi; L = 8 + rng.random() * 90
        t = np.linspace(0, L, int(L))
        xs = ((x + np.cos(a) * t) % S).astype(int); ys = ((y + np.sin(a) * t) % S).astype(int)
        scratch[ys, xs] = np.maximum(scratch[ys, xs], 0.3 + rng.random() * 0.5)
    paintC = col((0.76, 0.75, 0.72)) * (0.84 + base[..., None] * 0.22 + micro[..., None] * 0.05)
    primer = col((0.38, 0.22, 0.12))
    rustC = col((0.36, 0.14, 0.055)) * (0.65 + micro[..., None] * 0.7)
    alb = paintC * (1 - rain[..., None] * 0.16) * (1 - grime[..., None] * 0.4)
    alb = alb * (1 - rustStreak[..., None]) + rustC * rustStreak[..., None]
    alb = alb * (1 - chips[..., None]) + (primer * (1 - rustSrc[..., None]) + rustC * rustSrc[..., None]) * chips[..., None]
    alb = alb + scratch[..., None] * col((0.15, 0.15, 0.14)) * 0.35
    alb = alb * (1 - salt[..., None] * 0.2) + col((0.82, 0.82, 0.78)) * salt[..., None] * 0.35
    h = base * 0.35 + micro * 0.28 - chips * 1.0 + rustStreak * 0.35 * micro - scratch * 0.25
    nrm = normal_from_height(h, 7.0 * S / 1024)
    rough = 0.50 + base * 0.12 + micro * 0.07 + chips * 0.28 + rustStreak * 0.22 - rain * 0.18 + grime * 0.1 - salt * 0.05
    metal = 0.16 * (1 - chips) + chips * (0.55 * (1 - rustSrc))
    wear = fbm(S, 20, 4, rng)
    orm = np.stack([wear, rough, metal], -1)
    save(name, alb, nrm, orm)

def container_marks(path, S=2048):
    """2×2 图集：虚构船司标志 + 箱号 + 乍浦港区模板，带透明通道。"""
    from PIL import ImageDraw, ImageFont, ImageFilter
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    try:
        fontB = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 92)
        fontS = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 48)
        fontM = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 64)
        fontC = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 56)
        fontCS = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 40)
    except Exception:
        fontB = fontS = fontM = fontC = fontCS = ImageFont.load_default()
    cells = [
        dict(logo='乍潮', en='ZHACHAO LINE', code='ZCLU 258173 4', port='乍浦港区', badge=(0.15, 0.32, 0.42)),
        dict(logo='潮运', en='TIDE HAUL', code='TDHU 419226 1', port='乍浦港区', badge=(0.45, 0.18, 0.14)),
        dict(logo='浦航', en='PUHANG SHIPPING', code='PHSU 863054 7', port='乍浦港区', badge=(0.12, 0.28, 0.22)),
        dict(logo='七泊', en='BERTH SEVEN', code='BT7U 102938 6', port='乍浦港区', badge=(0.10, 0.16, 0.28)),
    ]
    cell = S // 2
    rng = np.random.default_rng(9)
    for i, c in enumerate(cells):
        x0, y0 = (i % 2) * cell, (i // 2) * cell
        layer = Image.new('RGBA', (cell, cell), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        col = tuple(int(v * 255) for v in c['badge']) + (230,)
        # 徽章块
        d.rounded_rectangle((80, 80, cell - 80, 420), radius=18, outline=col, width=10)
        d.rectangle((80, 80, cell - 80, 200), fill=col)
        # 中文名
        tw = d.textlength(c['logo'], font=fontB)
        d.text(((cell - tw) / 2, 100), c['logo'], font=fontB, fill=(245, 242, 235, 255))
        tw = d.textlength(c['en'], font=fontCS)
        d.text(((cell - tw) / 2, 250), c['en'], font=fontCS, fill=col)
        # 箱号
        d.rectangle((90, 460, cell - 90, 560), outline=(230, 230, 220, 220), width=4)
        tw = d.textlength(c['code'], font=fontC)
        d.text(((cell - tw) / 2, 478), c['code'], font=fontC, fill=(235, 232, 220, 255))
        # 港名模板
        tw = d.textlength(c['port'], font=fontM)
        d.text(((cell - tw) / 2, 620), c['port'], font=fontM, fill=(230, 228, 220, 200))
        # CSC / 重量框（虚构）
        d.rectangle((90, 740, 420, 960), outline=(200, 200, 190, 200), width=3)
        d.text((110, 760), 'MAX GROSS 30480 KG', font=fontS, fill=(210, 210, 200, 220))
        d.text((110, 820), 'TARE 2180 KG', font=fontS, fill=(210, 210, 200, 220))
        d.text((110, 880), 'CSC 2024/ZP', font=fontS, fill=(210, 210, 200, 220))
        im.paste(layer, (x0, y0), layer)
    im.save(path)
    print('baked container marks', path)

if __name__ == '__main__' or True:
    pass
