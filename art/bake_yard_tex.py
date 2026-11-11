#!/usr/bin/env python3
# 码头小道具与招工/厂标贴图（作者：Jack · 原创绘制，非抓取真实商标）
import os, math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageChops

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'textures')
os.makedirs(OUT, exist_ok=True)
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
FONT_R = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'

def font(sz, bold=True, idx=2):
    return ImageFont.truetype(FONT if bold else FONT_R, sz, index=idx)

def rng(seed):
    r = random.Random(seed)
    return r

def noise(w, h, seed, octaves=4, scale=8):
    r = rng(seed)
    base = Image.new('L', (max(8, w // scale), max(8, h // scale)))
    px = base.load()
    bw, bh = base.size
    for y in range(bh):
        for x in range(bw):
            px[x, y] = r.randint(0, 255)
    img = base.resize((w, h), Image.Resampling.BICUBIC)
    acc = img
    for i in range(1, octaves):
        s = scale * (2 ** i)
        b = Image.new('L', (max(4, w // s), max(4, h // s)))
        p = b.load(); bw, bh = b.size
        for y in range(bh):
            for x in range(bw):
                p[x, y] = r.randint(0, 255)
        acc = ImageChops.add_modulo(acc, b.resize((w, h), Image.Resampling.BICUBIC).point(lambda v: v // (i + 1)))
    return acc

def height_to_normal(himg, strength=2.2):
    w, h = himg.size
    src = himg.convert('L')
    px = src.load()
    out = Image.new('RGB', (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            l = px[x - 1 if x else 0, y]
            r = px[x + 1 if x < w - 1 else w - 1, y]
            u = px[x, y - 1 if y else 0]
            d = px[x, y + 1 if y < h - 1 else h - 1]
            nx = (l - r) * strength / 255.0
            ny = (d - u) * strength / 255.0
            nz = 1.0
            lgt = math.sqrt(nx * nx + ny * ny + nz * nz) or 1
            op[x, y] = (int((nx / lgt * 0.5 + 0.5) * 255), int((ny / lgt * 0.5 + 0.5) * 255), int((nz / lgt * 0.5 + 0.5) * 255))
    return out

def save_jpg(img, name, q=86):
    p = os.path.join(OUT, name)
    img.convert('RGB').save(p, 'JPEG', quality=q, optimize=True)
    print('wrote', name, os.path.getsize(p))

def save_png(img, name):
    p = os.path.join(OUT, name)
    img.save(p, 'PNG', optimize=True)
    print('wrote', name, os.path.getsize(p))

# ---------- wood ----------
def bake_wood():
    w = h = 1024
    r = rng(2026)
    img = Image.new('RGB', (w, h), (118, 86, 52))
    px = img.load()
    n1 = noise(w, h, 11, 5, 6)
    n2 = noise(w, h, 22, 3, 24)
    # 8 horizontal planks
    ph = h // 8
    for i in range(8):
        y0 = i * ph
        base = (102 + r.randint(-10, 12), 74 + r.randint(-8, 10), 44 + r.randint(-8, 8))
        for y in range(y0, y0 + ph):
            for x in range(w):
                g = n1.getpixel((x, y)) / 255.0
                grain = math.sin((x * 0.045 + y * 0.008 + n2.getpixel((x, y)) * 0.02) + i) * 0.12
                k = 0.78 + g * 0.28 + grain
                # plank gap
                if y - y0 < 5 or y0 + ph - y < 3:
                    k *= 0.35
                # knots
                px[x, y] = (int(base[0] * k), int(base[1] * k), int(base[2] * k))
        if r.random() < 0.5:
            # oil stain
            cx, cy, rad = r.randint(40, w - 40), y0 + r.randint(10, ph - 10), r.randint(20, 60)
            for y in range(max(0, cy - rad), min(h, cy + rad)):
                for x in range(max(0, cx - rad), min(w, cx + rad)):
                    d = math.hypot(x - cx, (y - cy) * 1.4) / rad
                    if d < 1:
                        p = px[x, y]
                        f = 0.55 + 0.45 * d
                        px[x, y] = (int(p[0] * f), int(p[1] * f * 0.95), int(p[2] * f * 0.8))
    # nails
    d = ImageDraw.Draw(img)
    for i in range(8):
        y = i * ph + 8
        for x in (40, w // 2, w - 40):
            d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(60, 48, 36))
    save_jpg(img, 'wood_a.jpg', 88)
    ht = n1.point(lambda v: int(v * 0.55 + 80))
    # deepen gaps in height
    hpx = ht.load()
    for i in range(8):
        for y in range(i * ph, i * ph + 5):
            for x in range(w):
                hpx[x, y] = int(hpx[x, y] * 0.25)
    save_jpg(height_to_normal(ht, 3.0), 'wood_n.jpg', 90)
    orm = Image.merge('RGB', (
        Image.new('L', (w, h), 210),
        n1.point(lambda v: 150 + v // 5),
        Image.new('L', (w, h), 8)
    ))
    save_jpg(orm, 'wood_orm.jpg', 86)

# ---------- cardboard ----------
def bake_cardboard():
    w = h = 512
    r = rng(77)
    img = Image.new('RGB', (w, h), (176, 142, 96))
    px = img.load()
    n = noise(w, h, 5, 4, 8)
    for y in range(h):
        for x in range(w):
            g = n.getpixel((x, y)) / 255.0
            wave = 0.92 + 0.08 * math.sin(x * 0.4)
            k = (0.85 + g * 0.2) * wave
            px[x, y] = (int(176 * k), int(142 * k), int(96 * k))
    d = ImageDraw.Draw(img)
    # packing tape
    d.rectangle((0, h // 2 - 18, w, h // 2 + 18), fill=(196, 168, 104))
    d.rectangle((w // 2 - 16, 0, w // 2 + 16, h), fill=(196, 168, 104))
    # worn edges
    for i in range(400):
        x, y = r.randint(0, w - 1), r.randint(0, h - 1)
        if x < 12 or y < 12 or x > w - 12 or y > h - 12:
            px[x, y] = (int(px[x, y][0] * 0.7), int(px[x, y][1] * 0.7), int(px[x, y][2] * 0.65))
    save_jpg(img, 'cardboard_a.jpg', 86)
    ht = n.point(lambda v: 120 + v // 4)
    save_jpg(height_to_normal(ht, 1.6), 'cardboard_n.jpg', 90)
    orm = Image.merge('RGB', (Image.new('L', (w, h), 200), Image.new('L', (w, h), 200), Image.new('L', (w, h), 4)))
    save_jpg(orm, 'cardboard_orm.jpg', 86)

def wrinkle_height(w, h, seed):
    r = rng(seed)
    ht = noise(w, h, seed, 5, 10)
    # long fold bands
    px = ht.load()
    for _ in range(7):
        y0 = r.randint(20, h - 20)
        amp = r.randint(18, 50)
        for y in range(h):
            k = math.exp(-((y - y0) ** 2) / (2 * amp * amp))
            for x in range(w):
                px[x, y] = min(255, max(0, int(px[x, y] + k * (70 if ((x // 80) % 2 == 0) else -40))))
    return ht

def stain_banner(img, seed, wet=True):
    r = rng(seed)
    w, h = img.size
    px = img.load()
    n = noise(w, h, seed + 3, 4, 8)
    for y in range(h):
        fade_y = 0.78 + 0.22 * (y / h)
        edge = min(x / w, (w - 1 - x) / w, y / h, (h - 1 - y) / h) if False else 1
        for x in range(w):
            e = min(x / (w * 0.08), (w - 1 - x) / (w * 0.08), y / (h * 0.12), (h - 1 - y) / (h * 0.12), 1.0)
            e = 0.62 + 0.38 * e  # faded edges
            g = n.getpixel((x, y)) / 255.0
            p = px[x, y]
            k = fade_y * e * (0.9 + g * 0.14)
            px[x, y] = (int(p[0] * k), int(p[1] * k), int(p[2] * k))
    # rain streaks
    if wet:
        for _ in range(80):
            x = r.randint(0, w - 1)
            y0 = r.randint(0, h // 3)
            length = r.randint(h // 4, h)
            a = r.randint(18, 40)
            for y in range(y0, min(h, y0 + length)):
                for dx in range(-1, 2):
                    xx = min(max(0, x + dx), w - 1)
                    p = px[xx, y]
                    px[xx, y] = (min(255, p[0] + a // 4), min(255, p[1] + a // 5), min(255, p[2] + a // 6))
    # mildew corners
    for _ in range(3):
        cx, cy = r.choice([0, w - 1]), r.choice([0, h - 1])
        rad = r.randint(40, 110)
        for y in range(max(0, cy - rad), min(h, cy + rad + 1)):
            for x in range(max(0, cx - rad), min(w, cx + rad + 1)):
                if math.hypot(x - cx, y - cy) < rad:
                    p = px[x, y]
                    f = 0.7
                    px[x, y] = (int(p[0] * f), int(p[1] * f * 1.05), int(p[2] * f * 0.85))
    return img

def draw_centered_lines(d, lines, box, fill, fonts, spacing=1.05, stroke=None):
    x0, y0, x1, y1 = box
    tws, ths = [], []
    for i, t in enumerate(lines):
        f = fonts[min(i, len(fonts) - 1)]
        b = d.textbbox((0, 0), t, font=f)
        tws.append(b[2] - b[0]); ths.append(b[3] - b[1])
    total_h = sum(ths) + int(sum(ths) * (spacing - 1) * 0.5)
    y = y0 + (y1 - y0 - total_h) // 2
    for i, t in enumerate(lines):
        f = fonts[min(i, len(fonts) - 1)]
        x = x0 + (x1 - x0 - tws[i]) // 2
        if stroke:
            d.text((x, y), t, font=f, fill=stroke, stroke_width=2)
        d.text((x, y), t, font=f, fill=fill)
        y += int(ths[i] * spacing)

def bake_decals():
    """2048 atlas:
    0-255 banner1, 256-511 banner2, 512-767 banner3,
    768-1023 jld plate,
    1024-1535 hcd container side+door (1024x512 split 768+256? use 1024x256 side + 256x256 door + 256x256 mark)
    1536-1791 crate labels + truck side
    1792-2047 direction signs
    """
    S = 2048
    img = Image.new('RGB', (S, S), (40, 36, 32))
    ht = Image.new('L', (S, S), 128)

    def paste(im, x, y, hmap=None):
        img.paste(im, (x, y))
        if hmap is not None:
            ht.paste(hmap, (x, y))

    # banners 2048 x 256
    def make_banner(lines, seed, accent='yellow'):
        w, h = 2048, 256
        bg = (158, 28, 30)  # faded crimson
        im = Image.new('RGB', (w, h), bg)
        # yellow inner border, slightly uneven
        d = ImageDraw.Draw(im)
        d.rectangle((10, 8, w - 11, h - 9), outline=(214, 176, 64), width=6)
        d.rectangle((20, 16, w - 21, h - 17), outline=(140, 24, 26), width=2)
        fill = (228, 196, 72) if accent == 'yellow' else (236, 228, 210)
        f1 = font(92 if len(lines[0]) <= 14 else 72, True)
        f2 = font(70 if (len(lines) > 1 and len(lines[1]) <= 18) else 56, True)
        draw_centered_lines(d, lines, (40, 20, w - 40, h - 20), fill, [f1, f2], 1.08)
        him = wrinkle_height(w, h, seed)
        im = stain_banner(im, seed)
        # multiply wrinkle slightly
        sh = him.point(lambda v: 180 + (v - 128) // 3)
        im = ImageChops.multiply(im, sh.convert('RGB'))
        return im, him

    b1, h1 = make_banner(['乍浦吉利达服装辅料', '招聘挡车工 / 缝纫工    待遇从优'], 101)
    b2, h2 = make_banner(['吉利达罗纹辅料', '领口 · 袖口 · 下摆    出口乍浦港'], 202)
    b3, h3 = make_banner(['乍浦吉利达服装辅料', '急聘挡车工、缝纫工    岗亭登记'], 303)
    paste(b1, 0, 0, h1); paste(b2, 0, 256, h2); paste(b3, 0, 512, h3)

    # enamel plate 1024 x 256 at (0,768), rest of row dark
    plate = Image.new('RGB', (1024, 256), (214, 206, 192))
    d = ImageDraw.Draw(plate)
    d.rectangle((8, 8, 1015, 247), outline=(132, 24, 26), width=8)
    d.rectangle((18, 18, 1005, 237), fill=(176, 32, 34))
    d.rectangle((26, 26, 997, 229), outline=(214, 176, 64), width=3)
    draw_centered_lines(d, ['乍浦吉利达服装辅料', '招工登记  ·  岗亭问询'], (40, 30, 984, 226), (236, 220, 150), [font(54, True), font(36, True)], 1.15)
    plate = stain_banner(plate, 404, wet=True)
    paste(plate, 0, 768, noise(1024, 256, 9, 3, 8))
    # small square plate 256x256
    sp = Image.new('RGB', (256, 256), (170, 30, 32))
    d = ImageDraw.Draw(sp)
    d.rectangle((8, 8, 247, 247), outline=(214, 176, 64), width=6)
    draw_centered_lines(d, ['乍浦', '吉利达', '服装辅料'], (16, 24, 240, 232), (236, 220, 150), [font(40, True)], 1.12)
    sp = stain_banner(sp, 414, True)
    paste(sp, 1024, 768, noise(256, 256, 10, 3, 8))

    # ---- Huachenda (navy, distinct from red banners) ----
    # side panel 1536 x 512 at y=1024
    side = Image.new('RGB', (1536, 512), (28, 58, 86))
    d = ImageDraw.Draw(side)
    # original geometric mark: nested diamonds + 3 weft bars (not a real logo)
    def hcd_mark(draw, cx, cy, s, col):
        pts = [(cx, cy - s), (cx + s * 0.72, cy), (cx, cy + s), (cx - s * 0.72, cy)]
        draw.polygon(pts, outline=col)
        pts2 = [(cx, cy - s * 0.55), (cx + s * 0.4, cy), (cx, cy + s * 0.55), (cx - s * 0.4, cy)]
        draw.polygon(pts2, fill=col)
        for i, yy in enumerate((-s * 0.22, 0, s * 0.22)):
            draw.rectangle((cx + s * 0.9, cy + yy - 4, cx + s * 1.85, cy + yy + 4), fill=col)
    hcd_mark(d, 180, 256, 90, (228, 222, 210))
    d.text((320, 140), '华晨达纺织', font=font(120, True), fill=(232, 226, 214))
    d.text((324, 300), 'HUACHENDA  TEXTILE', font=font(52, True, idx=0), fill=(196, 208, 214))
    d.rectangle((0, 0, 1535, 28), fill=(42, 110, 112))
    d.rectangle((0, 483, 1535, 511), fill=(42, 110, 112))
    side = stain_banner(side, 501, True)
    paste(side, 0, 1024, wrinkle_height(1536, 512, 501))

    # door 512x512
    door = Image.new('RGB', (512, 512), (28, 58, 86))
    d = ImageDraw.Draw(door)
    d.rectangle((0, 0, 511, 24), fill=(42, 110, 112))
    d.rectangle((0, 487, 511, 511), fill=(42, 110, 112))
    hcd_mark(d, 256, 150, 70, (228, 222, 210))
    draw_centered_lines(d, ['华晨达纺织', 'HUACHENDA'], (20, 250, 492, 470), (232, 226, 214), [font(52, True), font(28, True, 0)], 1.15)
    door = stain_banner(door, 502, True)
    paste(door, 1536, 1024, noise(512, 512, 12, 3, 8))

    # crate / carton stamps + truck side  y=1536  (2048x256)
    crate = Image.new('RGB', (1024, 256), (168, 132, 88))
    d = ImageDraw.Draw(crate)
    d.rectangle((12, 12, 1011, 243), outline=(40, 32, 24), width=4)
    draw_centered_lines(d, ['华晨达纺织厂', '坯布 / 纱线  出口'], (20, 16, 1004, 240), (36, 28, 22), [font(56, True), font(40, True)], 1.12)
    crate = stain_banner(crate, 601, True)
    paste(crate, 0, 1536, noise(1024, 256, 13, 3, 8))

    truck = Image.new('RGB', (1024, 256), (32, 64, 92))
    d = ImageDraw.Draw(truck)
    d.rectangle((0, 0, 1023, 18), fill=(42, 110, 112))
    d.rectangle((0, 237, 1023, 255), fill=(42, 110, 112))
    hcd_mark(d, 90, 128, 48, (228, 222, 210))
    d.text((160, 70), '华晨达纺织', font=font(72, True), fill=(232, 226, 214))
    d.text((164, 155), 'HUACHENDA TEXTILE  ·  乍浦港出口', font=font(28, True), fill=(196, 208, 214))
    truck = stain_banner(truck, 602, True)
    paste(truck, 1024, 1536, noise(1024, 256, 14, 3, 8))

    # direction signs y=1792  two 1024x256
    def road_sign(title, sub, arrow=True, w=1024, h=256):
        im = Image.new('RGB', (w, h), (36, 72, 64))
        d = ImageDraw.Draw(im)
        d.rectangle((6, 6, w - 7, h - 7), outline=(220, 220, 210), width=6)
        txt = title + ('  →' if arrow else '')
        draw_centered_lines(d, [txt, sub], (24, 16, w - 24, h - 16), (236, 236, 228), [font(52, True), font(28, True)], 1.2)
        return stain_banner(im, hash(title) % 999, True)

    paste(road_sign('华晨达纺织厂', 'HUACHENDA TEXTILE'), 0, 1792, noise(1024, 256, 15, 3, 8))
    paste(road_sign('乍浦港区 · 华晨达装卸区', 'ZHAPU PORT  ·  HCD YARD', arrow=True), 1024, 1792, noise(1024, 256, 16, 3, 8))

    # atlas albedo as PNG for sharp text
    save_png(img, 'yard_decals.png')
    save_jpg(height_to_normal(ht, 1.8), 'yard_decals_n.jpg', 88)
    # also write a UV cheat sheet comment in a tiny json? skip

if __name__ == '__main__':
    bake_wood()
    bake_cardboard()
    bake_decals()
    print('YARD TEX DONE')
