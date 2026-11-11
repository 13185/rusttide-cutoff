# 锈潮断链 · 第三方枪械贴图改装（作者：Jack）
# 源素材：Gintoki1234「M16 A4」「Remington 870 FieldMaster」（CC BY 4.0，见 NOTICE）。原始包不入库，放在 staging/guns/。
# 处理：逐块抹除厂牌/型号/产地/序列号等铭文（高度图高通检测笔画 → 全部贴图同步 inpaint）
#       → 刻上游戏内原创铭牌 → 港口锈湿轻度做旧 → 打包 ORM（R=AO G=粗糙 B=金属）→ 2048/1024 两档输出。
# 依赖：python3 + pillow + numpy + scipy + opencv-python-headless
# 用法：python3 art/gun_textures.py   （输出到 staging/guns/_build/，再由 art/gun_convert.py 打进 glb）
import os, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import gaussian_filter
Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'staging', 'guns')
OUT = os.path.join(SRC, '_build'); os.makedirs(OUT, exist_ok=True)
G = 'R2-gintoki-m16a4/M16 A4 by Gintoki1234/M16 A4 Textures/'
RM = 'S2-gintoki-remington870/Remington 870 FieldMaster by Gintoki1234/Remington 870 \u2018FIELDMASTER\u2019 Textures/'
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
if not os.path.exists(FONT): FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'

SETS = {
  # 名称: (前缀, 原始尺寸, 铭文矩形 [x0,y0,x1,y1]（原始像素）, 整块抹除矩形, 原创铭牌, 输出尺寸 (hi, lo))
  'rifle_body': dict(pre=G + 'M16 A4 Gun Textures/M16 A4 Main Body_', text=[
      (1405, 175, 1470, 225),    # UP
      (1115, 740, 1160, 778),    # A
      (940, 1095, 1030, 1180),   # BURST
      (1030, 1012, 1112, 1064),  # SEMI
      (1150, 1046, 1240, 1106),  # SAFE
      (1018, 1118, 1042, 1162),  # 截断字母
      (1650, 985, 1800, 1066),   # BURST（另一侧）
      (1836, 1046, 1900, 1094),  # SAFE
      (1724, 1104, 1792, 1150),  # SEMI
      (1846, 1166, 2048, 1272),  # 厂商名 + 产地
      (3650, 1380, 3700, 1424),  # F
      (3955, 1370, 4015, 1450),  # L/L
      (3448, 2262, 3625, 2568),  # 所有权/型号/口径/序列号 + 厂徽
      (2650, 3712, 2740, 4072),  # 枪管口径/膛线铭文 + 徽记
      (3684, 3108, 3726, 3192),  # <B>
    ], plates=[
      # (x0, y0, x1, y1, 文本行, 旋转角)：原「所有权/型号」铭文处刻原创铭牌
      (3452, 2280, 3622, 2560, ['潮汐-7', 'RT-7  5.8×42', '乍浦港区'], 180),
    ], size=(2048, 1024)),
  'rifle_mag': dict(pre=G + 'M16 A4 Magazine and Bullet Textures/M16 A4 Magazine And Cartridge_', text=[
      (672, 198, 758, 282),      # 弹壳底火铭文
      (428, 892, 538, 988),      # 批号
      (1598, 1258, 1782, 1482),  # 厂商名 + 产地 + 徽记
    ], plates=[(1610, 1280, 1740, 1470, ['潮汐-7  30发', 'RT-7 MAG'], 90)], size=(1024, 512)),
  'shotgun': dict(pre=RM + 'Shotgun_', text=[
      (1166, 506, 1202, 544),    # R
            (3462, 482, 3548, 518),
      (2322, 2072, 2512, 2128),  # 厂名
      (2112, 2462, 2182, 2752),  # 厂名 + 型号
      (138, 2775, 340, 3318),    # 枪管口径/厂址
      (2158, 3142, 2228, 3308),  # 二维码 + 序列号
      (2922, 3708, 2960, 3862), (3000, 3758, 3040, 3862),
      (3492, 3276, 3592, 3318),
    ], full=[(2645, 230, 2970, 282)],  # 枪托底板凸字厂名：整块重绘
    plates=[(2116, 2470, 2178, 2745, ['港务-12  ZP'], -90)], size=(2048, 1024)),
  'shell': dict(pre=RM + 'Remington Shotgun Shell Textures/Shotgun Shell_', text=[], wipe=[
      (0, 0, 420, 2048),         # 壳身环绕印字
      (1270, 500, 1840, 1930),   # 壳身印字
    ], plates=[], size=(512, 256)),
}

def load(pre, name, mode=None):
    im = Image.open(pre + name + '.png')
    if im.mode == 'I;16' or im.mode == 'I': return np.array(im).astype(np.float32) / 65535.0
    if mode: im = im.convert(mode)
    return np.array(im).astype(np.float32) / 255.0

def text_mask(h, base, rects, wipes):
    """在矩形内用高度图/反照率高通找出笔画，膨胀后作为 inpaint 掩码。"""
    H, W = h.shape
    m = np.zeros((H, W), np.uint8)
    lum = base.mean(-1)
    for (x0, y0, x1, y1) in rects:
        hh = h[y0:y1, x0:x1]; ll = lum[y0:y1, x0:x1]
        hp = np.abs(hh - gaussian_filter(hh, 5)); lp = np.abs(ll - gaussian_filter(ll, 4))
        t = (hp > max(np.percentile(hp, 60) * 2.5, 0.0015)) | (lp > max(np.percentile(lp, 60) * 3, 0.025))
        m[y0:y1, x0:x1] = np.maximum(m[y0:y1, x0:x1], t.astype(np.uint8))
    m = cv2.dilate(m, np.ones((7, 7), np.uint8))
    # 只在矩形内
    keep = np.zeros_like(m)
    for (x0, y0, x1, y1) in rects: keep[y0:y1, x0:x1] = 1
    m = m * keep
    for (x0, y0, x1, y1) in wipes: m[y0:y1, x0:x1] = 1
    return m

def full_mask(m, rects):
    for (x0, y0, x1, y1) in rects: m[y0:y1, x0:x1] = 1
    return m

def inpaint(a, m, r=7):
    """a: float32 HxW(xC) 0..1；逐通道 16 位 inpaint"""
    two = a.ndim == 2
    if two: a = a[..., None]
    out = np.empty_like(a)
    for c in range(a.shape[-1]):
        ch = (np.clip(a[..., c], 0, 1) * 255).astype(np.uint8)
        out[..., c] = cv2.inpaint(ch, m, r, cv2.INPAINT_TELEA).astype(np.float32) / 255.0
        # 掩码外保留原精度
        out[..., c] = np.where(m > 0, out[..., c], a[..., c])
    return out[..., 0] if two else out

def wipe_fill(a, m, rects):
    """大块抹除：用矩形外一圈的模糊色填充，保留低频"""
    two = a.ndim == 2
    if two: a = a[..., None]
    b = a.copy()
    for (x0, y0, x1, y1) in rects:
        blk = a[y0:y1, x0:x1]
        med = np.median(blk.reshape(-1, blk.shape[-1]), 0)
        lf = np.stack([gaussian_filter(blk[..., c], 24) for c in range(blk.shape[-1])], -1)
        b[y0:y1, x0:x1] = lf * 0.5 + med * 0.5
    return b[..., 0] if two else b

def plate_mask(shape, plates):
    H, W = shape
    canvas = Image.new('L', (W, H), 0)
    for (x0, y0, x1, y1, lines, rot) in plates:
        w, h = x1 - x0, y1 - y0
        if rot in (90, -90): w, h = h, w
        tile = Image.new('L', (w, h), 0); d = ImageDraw.Draw(tile)
        n = len(lines); lh = h / (n + 0.4)
        for i, s in enumerate(lines):
            fs = int(lh * (0.78 if i == 0 else 0.6))
            f = ImageFont.truetype(FONT, fs)
            while d.textlength(s, font=f) > w * 0.94 and fs > 6:
                fs -= 1; f = ImageFont.truetype(FONT, fs)
            tw = d.textlength(s, font=f)
            d.text(((w - tw) / 2, lh * (i + 0.2) + (lh - fs) / 2 - fs * 0.12), s, fill=255, font=f)
        tile = tile.rotate(rot, expand=True)
        canvas.paste(tile, (x0, y0), tile)
    return np.array(canvas).astype(np.float32) / 255.0

def engrave(base, rough, ao, nrm, pm, k=2.2):
    """原创铭牌：凹刻（法线扰动 + AO 加深 + 反照率略暗 + 略粗糙）"""
    hgt = -gaussian_filter(pm, 1.6)
    gy, gx = np.gradient(hgt)
    dx, dy = -gx * k * 4, gy * k * 4  # OpenGL 法线：+Y 朝 v 上（图像行向下）
    n = nrm * 2 - 1
    n[..., 0] += dx; n[..., 1] += dy
    n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6
    nrm = n * 0.5 + 0.5
    s = gaussian_filter(pm, 1.0)
    ao = ao * (1 - 0.45 * s)
    base = base * (1 - 0.3 * s[..., None])
    rough = np.clip(rough + 0.12 * s, 0, 1)
    return base, rough, ao, nrm

def fbm(H, W, seed, octaves=5, base=8):
    rng = np.random.default_rng(seed)
    acc = np.zeros((H, W), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        r = base * 2 ** o
        z = rng.random((r, r)).astype(np.float32)
        acc += amp * cv2.resize(z, (W, H), interpolation=cv2.INTER_CUBIC); tot += amp; amp *= 0.5
    return acc / tot

def weather(base, rough, metal, ao, name):
    """港口锈湿：缝隙/凹处少量锈迹（仅金属）、整体略暗偏冷、雨水斑驳让粗糙度局部降低"""
    H, W = rough.shape
    n1 = fbm(H, W, 7 + len(name)); n2 = fbm(H, W, 99 + len(name), base=16)
    cav = np.clip((0.85 - ao) / 0.6, 0, 1)
    rust = np.clip((cav * 0.8 + (n1 - 0.5) * 1.4 - 0.05), 0, 1) * (metal > 0.5)
    rust = gaussian_filter(rust, 1.2) * (0.42 if name != 'shell' else 0.0)
    rust_col = np.array([0.30, 0.17, 0.10], np.float32)
    base = base * (1 - rust[..., None]) + rust_col * rust[..., None]
    rough = np.clip(rough * (1 - rust) + 0.82 * rust, 0, 1)
    metal = np.clip(metal * (1 - 0.7 * rust), 0, 1)
    # 湿：整体略暗、略偏冷；雨痕斑驳处更光滑
    wet = np.clip((n2 - 0.45) * 2.2, 0, 1)
    base = base * np.array([0.9, 0.92, 0.95], np.float32) * (1 - 0.08 * wet[..., None])
    rough = np.clip(rough * (1.08 - 0.28 * wet), 0.08, 1)
    return base, rough, metal

def save_set(name, base, orm, nrm, sizes):
    for tag, s in zip(('hi', 'lo'), sizes):
        b = Image.fromarray((np.clip(base, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((s, s), Image.LANCZOS)
        o = Image.fromarray((np.clip(orm, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((s, s), Image.LANCZOS)
        n = np.array(Image.fromarray((np.clip(nrm, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((s, s), Image.LANCZOS)).astype(np.float32) / 127.5 - 1
        n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6
        n = Image.fromarray((n * 127.5 + 127.5).clip(0, 255).astype(np.uint8))
        b.save(f'{OUT}/{name}_{tag}_base.png'); o.save(f'{OUT}/{name}_{tag}_orm.png'); n.save(f'{OUT}/{name}_{tag}_normal.png')
    print('saved', name, sizes)

def srgb_to_lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin_to_srgb(c): return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - 0.055)

def process(name, cfg):
    pre = os.path.join(SRC, cfg['pre'])
    base = load(pre, 'Base_color', 'RGB'); rough = load(pre, 'Roughness', 'L'); metal = load(pre, 'Metallic', 'L')
    ao = load(pre, 'Mixed_AO', 'L'); nrm = load(pre, 'Normal_OpenGL', 'RGB'); h = load(pre, 'Height')
    m = full_mask(text_mask(h, base, cfg['text'], cfg.get('wipe', [])), cfg.get('full', []))
    Image.fromarray(m * 255).resize((1024, 1024)).save(f'{OUT}/{name}_mask_preview.png')
    if m.any():
        maps = [base, rough, metal, ao, nrm, h]
        maps = [inpaint(a, m) for a in maps]
        if cfg.get('wipe'):
            maps = [wipe_fill(a, m, cfg['wipe']) for a in maps]
        base, rough, metal, ao, nrm, h = maps
        n = nrm * 2 - 1; n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6; nrm = n * 0.5 + 0.5
    if cfg['plates']:
        pm = plate_mask(rough.shape, cfg['plates'])
        base, rough, ao, nrm = engrave(base, rough, ao, nrm, pm)
    lb = srgb_to_lin(base)
    lb, rough, metal = weather(lb, rough, metal, ao, name)
    base = lin_to_srgb(lb)
    # 检查用高通图（铭文是否抹干净）
    hp = h - gaussian_filter(h, 6); s = np.percentile(np.abs(hp), 99.5) + 1e-6
    Image.fromarray(np.clip(128 + hp / s * 127, 0, 255).astype(np.uint8)).save(f'{OUT}/{name}_check_height_hp.png')
    nn = nrm[..., 0] - gaussian_filter(nrm[..., 0], 6) + nrm[..., 1] - gaussian_filter(nrm[..., 1], 6)
    s = np.percentile(np.abs(nn), 99.5) + 1e-6
    Image.fromarray(np.clip(128 + nn / s * 127, 0, 255).astype(np.uint8)).save(f'{OUT}/{name}_check_normal_hp.png')
    orm = np.stack([ao, rough, metal], -1)
    save_set(name, base, orm, nrm, cfg['size'])

if __name__ == '__main__':
    import sys
    only = sys.argv[1:] or list(SETS)
    for k in only: process(k, SETS[k])
