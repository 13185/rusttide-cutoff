# 锈潮断链 · Blender 4.2 资产构建脚本（作者：Jack · 原创建模，禁止转载）
# 用法：/home/box/blender/blender -b -P art/build_assets.py
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Euler

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models')
os.makedirs(OUT, exist_ok=True)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True); MATS.clear()

MATS = {}
SEGS = [2]
def mat(name, col=(0.5, 0.5, 0.5), metal=0.0, rough=0.6):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.blend_method = 'OPAQUE'
    if hasattr(m, 'use_backface_culling'): m.use_backface_culling = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    MATS[name] = m; return m

def _finish(o, m, bevel, segs=None):
    o.data.materials.append(m)
    if bevel > 0:
        mod = o.modifiers.new('bv', 'BEVEL'); mod.width = bevel; mod.segments = segs or SEGS[0]; mod.limit_method = 'ANGLE'; mod.angle_limit = math.radians(40)
    return o

def box(name, size, loc, m, bevel=0.0, rot=(0, 0, 0), segs=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, m, bevel, segs)

def cyl(name, r, depth, loc, m, rot=(0, 0, 0), verts=16, bevel=0.0, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, vertices=verts, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name
    return _finish(o, m, bevel)

def beam(name, a, b, t, m, square=True):
    a = Vector(a); b = Vector(b); d = b - a; L = d.length
    if square:
        bpy.ops.mesh.primitive_cube_add(size=1, location=(a + b) / 2)
    else:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=1, vertices=8, location=(a + b) / 2)
    o = bpy.context.active_object; o.name = name
    o.scale = (t, t, L)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    o.data.materials.append(m)
    return o

def prism(name, pts, width, m, axis='X', bevel=0.004, loc=(0, 0, 0)):
    """侧视轮廓 (u=前后(-y为前), v=上下) 沿 X 挤出 width"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((-width / 2, u, v)) for (u, v) in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    nv = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(width, 0, 0), verts=nv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); o.location = loc
    return _finish(o, m, bevel)

def empty(name, loc, parent=None):
    o = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(o); o.location = loc
    if parent: o.parent = parent
    return o

def join(objs, name):
    objs = [o for o in objs if o]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name; o.data.name = name
    return o

def box_uv_and_wear(o, scale=1.0):
    """世界尺度盒式 UV + 顶点色 wear（凸边越尖越亮，用于边角磨亮）"""
    me = o.data; bm = bmesh.new(); bm.from_mesh(me)
    uvl = bm.loops.layers.uv.verify()
    mw = o.matrix_world
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            p = mw @ l.vert.co
            if ax == 0: uv = (p.y, p.z)
            elif ax == 1: uv = (p.x, p.z)
            else: uv = (p.x, p.y)
            l[uvl].uv = (uv[0] * scale, uv[1] * scale)
    col = bm.loops.layers.color.new('wear') if 'wear' not in bm.loops.layers.color else bm.loops.layers.color['wear']
    fl = bm.verts.layers.float.verify()
    for v in bm.verts:
        if not v.link_faces: continue
        c = 0.0
        for e in v.link_edges:
            if len(e.link_faces) == 2:
                a = e.calc_face_angle(0.0)
                if e.is_convex: c = max(c, min(1.0, a / 1.4))
        v[fl] = c
    for f in bm.faces:
        for l in f.loops:
            w = l.vert[fl]; l[col] = (w, w, w, 1)
    bm.to_mesh(me); bm.free()

def finalize(root_objs, scale=1.0):
    for o in root_objs:
        if o.type == 'MESH': box_uv_and_wear(o, scale)

def export(path, objs):
    if path in ('rifle.glb', 'shotgun.glb'): path = path.replace('.glb', '_legacy.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
        for c in o.children_recursive: c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_texcoords=True, export_normals=True,
        export_vertex_color='ACTIVE', export_all_vertex_colors=True, export_materials='EXPORT', export_animations=False)
    print('exported', path)

# ----------------------------------------------------------------- 武器

def tube(name, r_out, r_in, depth, loc, m, rot=(0, 0, 0), verts=20, bevel=0.0):
    """沿局部 Z 的空心圆管（两端开口，可透视瞄准镜）"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    n, ro, ri, h = verts, r_out, r_in, depth / 2
    def ring(r, z):
        return [bm.verts.new((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z)) for i in range(n)]
    o0, o1, i0, i1 = ring(ro, -h), ring(ro, h), ring(ri, -h), ring(ri, h)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((o0[i], o0[j], o1[j], o1[i]))
        bm.faces.new((i1[i], i1[j], i0[j], i0[i]))
        bm.faces.new((o0[i], i0[i], i0[j], o0[j]))
        bm.faces.new((o1[j], i1[j], i1[i], o1[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.location = loc; o.rotation_euler = rot
    return _finish(o, m, bevel)

def shade_soft(o, sub=0):
    for p in o.data.polygons: p.use_smooth = True
    if sub:
        md = o.modifiers.new('sub', 'SUBSURF'); md.levels = sub; md.render_levels = sub; md.subdivision_type = 'CATMULL_CLARK'
    return o

def gun_mats():
    return dict(
        metal=mat('M_gun_metal', (0.09, 0.095, 0.1), 0.85, 0.35),
        dark=mat('M_gun_dark', (0.03, 0.03, 0.032), 0.7, 0.45),
        poly=mat('M_gun_poly', (0.06, 0.06, 0.055), 0.0, 0.6),
        fde=mat('M_gun_fde', (0.32, 0.26, 0.17), 0.0, 0.65),
        glove=mat('M_glove', (0.05, 0.05, 0.05), 0.0, 0.85),
        skin=mat('M_skin', (0.45, 0.30, 0.23), 0.0, 0.58),
        knuckle=mat('M_knuckle', (0.48, 0.28, 0.24), 0.0, 0.62),
        nail=mat('M_nail', (0.36, 0.24, 0.20), 0.0, 0.45),
        sleeve=mat('M_sleeve', (0.12, 0.14, 0.11), 0.0, 0.9),
        lens=mat('M_lens', (0.02, 0.05, 0.06), 1.0, 0.05),
        wood=mat('M_gun_wood', (0.25, 0.14, 0.07), 0.0, 0.55),
        brass=mat('M_brass', (0.7, 0.5, 0.2), 1.0, 0.3),
        red=mat('M_shell_red', (0.5, 0.06, 0.04), 0.0, 0.5))


def _bone(name, length, r0, r1, m, parent, axis='Y'):
    """沿父级 +Y 的指节锥体，中心在 length/2"""
    o = cyl(name, r0, length * 0.92, (0, length * 0.5, 0), m, rot=(-math.pi / 2, 0, 0), verts=10, bevel=r0 * 0.15, r2=r1)
    o.parent = parent
    return shade_soft(o, 1)

def _ball(name, r, m, parent, loc=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=12, ring_count=8, location=loc)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m)
    o.parent = parent
    return shade_soft(o, 1)

def _palm(name, m, s):
    """带大鱼际/小鱼际、掌心凹陷与掌骨走向的手掌。+Y 指尖、+Z 手背、+X 拇指侧（右手）。"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    o = bpy.context.active_object; o.name = name
    o.scale = (0.040, 0.050, 0.0135)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.subdivide(number_cuts=4); bpy.ops.object.mode_set(mode='OBJECT')
    for v in o.data.vertices:
        x, y, z = v.co.x, v.co.y, v.co.z
        xs = x * s
        # 远端略收、近端略宽
        taper = 1.0 - 0.16 * max(0.0, (y + 0.02) / 0.07)
        heel = 1.0 + 0.12 * max(0.0, (-y) / 0.05)
        x = x * taper * heel
        # 大鱼际（拇指根）
        thenar = math.exp(-((xs - 0.022) ** 2) / 0.00055 - ((y + 0.012) ** 2) / 0.0008)
        # 小鱼际（掌根尺侧）
        hypo = math.exp(-((xs + 0.024) ** 2) / 0.0005 - ((y + 0.028) ** 2) / 0.0007)
        # 掌心凹陷（掌侧 -Z）
        cup = math.exp(-(x ** 2) / 0.0009 - ((y - 0.0) ** 2) / 0.0014)
        # 掌骨远端背侧隆起
        meta = math.exp(-((abs(xs) - 0.016) ** 2) / 0.00035 - ((y - 0.036) ** 2) / 0.00028)
        z = z + (0.007 * thenar + 0.0055 * hypo) * (1 if z < 0.002 else 0.4)
        if z < 0:
            z = z - 0.0045 * cup
        else:
            z = z + 0.0038 * meta + 0.0018 * (1 - cup)
        # 拇指侧外扩
        if xs > 0.018 and y < 0.01:
            x = x + s * 0.006
        v.co.x, v.co.y, v.co.z = x, y, z
    o.data.update()
    o.data.materials.append(m)
    return shade_soft(o, 1)

def _tendon(name, m, parent, s, i):
    # 手背四条肌腱，从掌中到掌指关节
    x = s * (-0.024 + i * 0.016)
    o = cyl(name, 0.0016, 0.046, (x, 0.018, 0.012), m, rot=(-math.pi / 2, 0, 0), verts=6, bevel=0.0006, r2=0.0022)
    o.parent = parent
    return shade_soft(o, 0)

def _finger(parent, prefix, loc, yaw, splay, lengths, radii, curls, M, s):
    """一条手指：空级链（prefix, prefixb, prefixc），供 JS 做握紧动画。局部 +Y 沿指骨，+X 为屈伸轴。"""
    prev, acc = parent, loc
    nodes = []
    for i, (L, r0, curl) in enumerate(zip(lengths, radii, curls)):
        nm = prefix + ('b' * i)
        j = empty(nm, acc if i == 0 else (0, lengths[i - 1], 0), prev)
        if i == 0:
            j.location = loc
            j.rotation_euler = (curl, yaw, splay)
        else:
            j.rotation_euler = (curl, 0, 0)
        r1 = radii[min(i + 1, len(radii) - 1)] * 0.92
        _bone(nm + '_m', L, r0, r1, M['skin'], j)
        _ball(nm + '_k', r0 * (1.18 if i == 0 else 1.08), M['knuckle'] if i == 0 else M['skin'], j, (0, 0, 0.0008))
        if i == len(lengths) - 1:
            # 指腹略鼓 + 短甲
            pad = cyl(nm + '_pad', r1 * 0.95, r1 * 1.1, (0, L - r1 * 0.2, -r1 * 0.15), M['skin'], rot=(-math.pi / 2, 0, 0), verts=8, bevel=r1 * 0.3)
            pad.parent = j; shade_soft(pad, 1)
            nail = box(nm + '_nail', (r1 * 1.1, r1 * 0.9, r1 * 0.18), (0, L - r1 * 0.15, r1 * 0.55), M['nail'], bevel=r1 * 0.2)
            nail.parent = j; shade_soft(nail, 0)
        prev = j
        nodes.append(j)
    return nodes

def build_hand(side, M):
    """完整的第一人称手：肌腱、指节、前臂肌腹。side='R'/'L'。"""
    s = 1 if side == 'R' else -1
    root = empty('hand' + side, (0, 0, 0))
    palm = empty('palm' + side, (0, 0, 0), root)
    pm = _palm('palm' + side + '_m', M['skin'], s)
    pm.parent = palm
    for i in range(4):
        _tendon('ten' + side + str(i), M['skin'], palm, s, i)
    # 腕部与前臂（-Y 指向肘，可单独缩放做发力膨胀）
    arm = empty('arm' + side, (0, -0.052, -0.002), root)
    # 前臂肌：两根错开的锥体模拟尺桡与屈肌隆起
    mus = cyl('muscle' + side, 0.024, 0.13, (s * 0.004, -0.08, -0.004), M['skin'], rot=(-math.pi / 2, 0, 0), verts=12, bevel=0.006, r2=0.019)
    mus.parent = arm; shade_soft(mus, 1)
    mus2 = cyl('flexor' + side, 0.016, 0.09, (s * -0.006, -0.06, -0.012), M['skin'], rot=(-math.pi / 2, 0.08 * s, 0.12), verts=10, bevel=0.005, r2=0.012)
    mus2.parent = arm; shade_soft(mus2, 1)
    wrist = cyl('wrist' + side, 0.017, 0.028, (0, -0.008, 0), M['skin'], rot=(-math.pi / 2, 0, 0), verts=12, bevel=0.004, r2=0.020)
    wrist.parent = arm; shade_soft(wrist, 1)
    slv = cyl('sleeve' + side, 0.032, 0.20, (0, -0.20, 0.0), M['sleeve'], rot=(-math.pi / 2, 0, 0), verts=12, bevel=0.006, r2=0.028)
    slv.parent = arm; shade_soft(slv, 1)
    cuff = cyl('cuff' + side, 0.033, 0.024, (0, -0.108, 0.0), M['sleeve'], rot=(-math.pi / 2, 0, 0), verts=12, bevel=0.004)
    cuff.parent = arm; shade_soft(cuff, 1)
    # 四指：食指略伸（扣扳机），其余握把卷曲。位置沿掌骨远端。
    # lengths 近节/中节/远节；curls 为休息握持角
    specs = [
        # prefix, x, y, z, yaw, splay, lengths, radii, curls
        ('f' + side + '0', s * 0.012, 0.046, 0.002, 0.0, -0.04 * s, (0.028, 0.022, 0.018), (0.0095, 0.0085, 0.0072), (0.22, 0.55, 0.35)),  # 食指
        ('f' + side + '1', s * -0.002, 0.050, 0.003, 0.0, 0.0,       (0.030, 0.024, 0.019), (0.0100, 0.0088, 0.0074), (0.55, 0.85, 0.45)),  # 中
        ('f' + side + '2', s * -0.016, 0.047, 0.002, 0.0, 0.05 * s,  (0.028, 0.022, 0.018), (0.0092, 0.0080, 0.0070), (0.62, 0.90, 0.48)),  # 无
        ('f' + side + '3', s * -0.028, 0.040, 0.000, 0.0, 0.12 * s,  (0.022, 0.017, 0.015), (0.0078, 0.0070, 0.0062), (0.70, 0.85, 0.40)),  # 小
    ]
    for pref, x, y, z, yaw, spl, L, R, C in specs:
        _finger(palm, pref, (x, y, z), yaw, spl, L, R, C, M, s)
    # 拇指：对掌，两节
    th = empty('th' + side, (s * 0.028, -0.004, -0.004), palm)
    # 第一掌骨对掌：朝向掌心前方略上
    th.rotation_euler = (0.35, 0.55 * s, -1.05 * s)
    _bone('th' + side + '_m', 0.034, 0.011, 0.009, M['skin'], th)
    _ball('th' + side + '_k', 0.012, M['knuckle'], th, (0, 0, 0.001))
    th2 = empty('th' + side + 'b', (0, 0.034, 0), th)
    th2.rotation_euler = (0.45, 0.1 * s, -0.15 * s)
    _bone('th' + side + 'b_m', 0.026, 0.009, 0.0075, M['skin'], th2)
    _ball('th' + side + 'b_k', 0.009, M['skin'], th2)
    pad = cyl('th' + side + '_pad', 0.008, 0.012, (0, 0.022, -0.003), M['skin'], rot=(-math.pi / 2, 0, 0), verts=8, bevel=0.003)
    pad.parent = th2; shade_soft(pad, 1)
    return root

def _mat_from_axes(x, y, z):
    """列向量为局部轴的旋转（世界）"""
    x, y, z = Vector(x).normalized(), Vector(y).normalized(), Vector(z).normalized()
    return Matrix((x, y, z)).transposed().to_euler()

def hands(M, root, grip_r, fore_l):
    """右手紧握枪把、左手握护木；保留分层骨骼空物体供开枪收缩动画。"""
    # 右手：手背朝 +X，手指绕握把向前（-Y）再向下卷
    hr = build_hand('R', M)
    hr.parent = root
    gx, gy, gz = grip_r
    hr.location = (0.034, gy - 0.008, gz + 0.01)
    hr.rotation_euler = _mat_from_axes((0, 0, -1), (0, -0.95, -0.31), (1, 0, 0))
    # 再沿握把后倾约 18°（绕世界 X）
    extra = Euler((math.radians(18), math.radians(6), math.radians(8)), 'XYZ')
    e = hr.rotation_euler.copy(); e.rotate(extra); hr.rotation_euler = e
    # 左手：手背朝左（-X），手指从下方包住护木，拇指沿导轨向前
    hl = build_hand('L', M)
    hl.parent = root
    lx, ly, lz = fore_l
    hl.location = (-0.040, ly + 0.02, lz + 0.01)
    hl.rotation_euler = _mat_from_axes((0, 1, 0.1), (0.15, 0, -1), (-1, 0, 0))
    return hr

def build_rifle():
    reset(); M = gun_mats()
    root = empty('rifle', (0, 0, 0))
    P = []
    # 上机匣（-Y 为枪口方向，Z 向上）
    P.append(prism('upper', [(-0.2, 0.0), (0.14, 0.0), (0.15, 0.028), (0.13, 0.052), (-0.2, 0.052)], 0.056, M['metal'], bevel=0.005))
    P.append(box('ejport', (0.004, 0.06, 0.02), (0.029, 0.02, 0.026), M['dark']))
    P.append(cyl('fassist', 0.009, 0.03, (0.034, 0.075, 0.036), M['metal'], rot=(math.radians(90), 0, 0), verts=12, bevel=0.002))
    # 下机匣、弹匣井、扳机护圈、扳机
    P.append(prism('lower', [(-0.17, -0.002), (0.12, -0.002), (0.12, -0.045), (0.02, -0.05), (-0.03, -0.062), (-0.1, -0.062), (-0.13, -0.036), (-0.17, -0.03)], 0.05, M['metal'], bevel=0.005))
    P.append(prism('tguard', [(-0.02, -0.05), (0.045, -0.05), (0.05, -0.078), (-0.02, -0.078), (-0.02, -0.072), (0.04, -0.072), (0.038, -0.056), (-0.02, -0.056)], 0.012, M['dark'], bevel=0.002))
    P.append(box('trigger', (0.006, 0.006, 0.022), (0, 0.012, -0.062), M['dark'], rot=(math.radians(15), 0, 0)))
    P.append(box('magrel', (0.008, 0.016, 0.016), (0.03, -0.01, -0.03), M['dark'], 0.002))
    # 握把（带防滑纹）
    P.append(prism('grip', [(0.04, -0.045), (0.085, -0.045), (0.125, -0.17), (0.11, -0.188), (0.075, -0.182), (0.05, -0.062)], 0.042, M['poly'], bevel=0.008))
    for i in range(6):
        P.append(box(f'gr{i}', (0.044, 0.004, 0.006), (0, 0.06 + i * 0.008, -0.08 - i * 0.017), M['dark'], rot=(math.radians(-18), 0, 0)))
    # 枪托：缓冲管 + 伸缩托
    P.append(cyl('tube', 0.015, 0.2, (0, 0.24, 0.02), M['dark'], rot=(math.radians(90), 0, 0), verts=16, bevel=0.002))
    P.append(prism('stock', [(0.2, 0.052), (0.43, 0.064), (0.45, 0.044), (0.45, -0.1), (0.41, -0.112), (0.37, -0.04), (0.27, -0.012), (0.2, -0.004)], 0.052, M['fde'], bevel=0.008))
    P.append(box('butt', (0.056, 0.024, 0.16), (0, 0.458, -0.025), M['poly'], 0.006))
    P.append(box('qd', (0.02, 0.02, 0.012), (0.03, 0.3, 0.0), M['dark'], 0.003))
    # 护木：八角 + M-LOK 槽
    hg = cyl('handguard', 0.038, 0.42, (0, -0.41, 0.022), M['fde'], rot=(math.radians(90), 0, math.radians(22.5)), verts=8, bevel=0.003)
    P.append(hg)
    for i in range(6):
        for sx in (-1, 1):
            P.append(box(f'mlok{i}{sx}', (0.006, 0.03, 0.01), (sx * 0.036, -0.28 - i * 0.055, 0.02), M['dark'], 0.002))
        P.append(box(f'mlokb{i}', (0.01, 0.03, 0.006), (0, -0.28 - i * 0.055, -0.016), M['dark'], 0.002))
    # 顶部皮卡汀尼导轨（全长）
    P.append(box('railbase', (0.024, 0.74, 0.008), (0, -0.18, 0.058), M['dark'], 0.001))
    for i in range(30):
        P.append(box(f'rt{i}', (0.03, 0.01, 0.007), (0, 0.17 - i * 0.0245, 0.0655), M['dark'], 0.0015))
    # 导气箍、枪管、制退器
    P.append(box('gasblock', (0.03, 0.03, 0.03), (0, -0.66, 0.022), M['dark'], 0.004))
    P.append(cyl('barrel', 0.011, 0.36, (0, -0.79, 0.022), M['dark'], rot=(math.radians(90), 0, 0), verts=14))
    P.append(cyl('brake', 0.018, 0.08, (0, -0.99, 0.022), M['metal'], rot=(math.radians(90), 0, 0), verts=14, bevel=0.003))
    for i in range(3):
        for sx in (-1, 1):
            P.append(box(f'port{i}{sx}', (0.004, 0.012, 0.022), (sx * 0.017, -0.97 - i * 0.02, 0.022), M['dark']))
    # 前握把
    P.append(cyl('vgrip', 0.017, 0.085, (0, -0.4, -0.035), M['poly'], verts=14, bevel=0.004))
    P.append(box('vgripmount', (0.03, 0.04, 0.012), (0, -0.4, 0.0), M['dark'], 0.002))
    # 折叠后照门
    P.append(box('rsight', (0.03, 0.012, 0.03), (0, 0.11, 0.084), M['dark'], 0.003))
    P.append(box('fsight', (0.026, 0.012, 0.034), (0, -0.52, 0.086), M['dark'], 0.003))
    # 管式红点镜（空心镜筒，两端开口，可透过镜片看见目标）
    P.append(tube('dot_tube', 0.026, 0.021, 0.11, (0, -0.03, 0.112), M['metal'], rot=(math.radians(90), 0, 0), verts=20, bevel=0.001))
    P.append(tube('dot_hood', 0.031, 0.022, 0.022, (0, -0.088, 0.112), M['dark'], rot=(math.radians(90), 0, 0), verts=20, bevel=0.001))
    P.append(tube('dot_rear', 0.029, 0.020, 0.018, (0, 0.03, 0.112), M['dark'], rot=(math.radians(90), 0, 0), verts=20, bevel=0.001))
    P.append(box('dot_mount', (0.026, 0.07, 0.034), (0, -0.03, 0.08), M['dark'], 0.004))
    P.append(cyl('dot_knob', 0.01, 0.016, (0.032, -0.03, 0.112), M['metal'], rot=(0, math.radians(90), 0), verts=12, bevel=0.002))
    P.append(cyl('dot_knob2', 0.009, 0.014, (0, -0.03, 0.142), M['metal'], verts=12, bevel=0.002))
    lens = cyl('dot_lens', 0.021, 0.002, (0, -0.075, 0.112), M['lens'], rot=(math.radians(90), 0, 0), verts=20)
    body = join(P, 'rifle_body'); body.parent = root
    lens.parent = root
    # 弹匣（弧形分段，独立节点用于换弹动画）
    magP = []
    for i in range(6):
        a = math.radians(i * 4)
        magP.append(box(f'mg{i}', (0.034, 0.068, 0.036), (0, -0.075 - i * 0.008, -0.07 - i * 0.033), M['poly'], 0.005, rot=(a, 0, 0)))
        magP.append(box(f'mgr{i}', (0.036, 0.004, 0.03), (0, -0.075 - i * 0.008 - 0.03, -0.07 - i * 0.033), M['dark'], 0.0, rot=(a, 0, 0)))
    magP.append(box('mgbase', (0.04, 0.08, 0.014), (0, -0.12, -0.27), M['dark'], 0.004, rot=(math.radians(22), 0, 0)))
    mg = join(magP, 'mag'); mg.parent = root
    # 拉机柄（独立节点）
    ch = join([box('chandle', (0.04, 0.012, 0.012), (0, 0.15, 0.045), M['dark'], 0.003)], 'bolt'); ch.parent = root
    empty('muzzle', (0, -1.04, 0.022), root)
    empty('dot', (0, -0.02, 0.112), root)
    empty('eject', (0.035, 0.02, 0.028), root)
    hands(M, root, (0.0, 0.1, -0.11), (0.0, -0.4, -0.012))
    finalize([o for o in bpy.data.objects if o.type == 'MESH'], 6.0)
    export('rifle.glb', [root])

def build_shotgun():
    reset(); M = gun_mats()
    root = empty('shotgun', (0, 0, 0))
    P = []
    P.append(prism('recv', [(-0.18, -0.045), (0.12, -0.045), (0.14, -0.02), (0.14, 0.045), (-0.18, 0.045)], 0.05, M['metal'], bevel=0.005))
    P.append(box('ejp', (0.004, 0.07, 0.03), (0.026, -0.03, 0.01), M['dark']))
    P.append(cyl('barrel', 0.016, 0.62, (0, -0.49, 0.025), M['dark'], rot=(math.radians(90), 0, 0), verts=16, bevel=0.002))
    P.append(cyl('magtube', 0.015, 0.5, (0, -0.43, -0.012), M['dark'], rot=(math.radians(90), 0, 0), verts=16, bevel=0.002))
    P.append(box('clamp', (0.04, 0.03, 0.06), (0, -0.66, 0.008), M['metal'], 0.004))
    P.append(cyl('bead', 0.004, 0.008, (0, -0.79, 0.044), M['brass'], verts=8))
    P.append(box('ribrail', (0.012, 0.6, 0.006), (0, -0.48, 0.043), M['dark']))
    P.append(prism('tguard', [(-0.02, -0.045), (0.05, -0.045), (0.055, -0.075), (-0.02, -0.075), (-0.02, -0.069), (0.045, -0.069), (0.043, -0.051), (-0.02, -0.051)], 0.012, M['dark'], bevel=0.002))
    P.append(prism('stock', [(0.12, 0.04), (0.24, -0.02), (0.48, -0.03), (0.5, -0.05), (0.5, -0.17), (0.46, -0.17), (0.25, -0.1), (0.14, -0.08), (0.12, -0.045)], 0.048, M['wood'], bevel=0.008))
    P.append(box('pad', (0.052, 0.026, 0.15), (0, 0.51, -0.1), M['poly'], 0.008))
    # 侧挂弹托 + 红色霰弹
    P.append(box('saddle', (0.008, 0.11, 0.05), (0.03, -0.02, 0.0), M['poly'], 0.003))
    for i in range(4):
        P.append(cyl(f'sh{i}', 0.0095, 0.05, (0.038, -0.06 + i * 0.026, 0.0), M['red'], verts=12))
        P.append(cyl(f'shb{i}', 0.0098, 0.012, (0.038, -0.06 + i * 0.026, -0.025), M['brass'], verts=12))
    body = join(P, 'shotgun_body'); body.parent = root
    pump = prism('pumpw', [(-0.42, -0.04), (-0.24, -0.04), (-0.235, 0.012), (-0.425, 0.012)], 0.05, M['poly'], bevel=0.008)
    rid = [pump] + [box(f'pr{i}', (0.054, 0.006, 0.04), (0, -0.4 + i * 0.02, -0.014), M['dark']) for i in range(8)]
    pj = join(rid, 'pump'); pj.parent = root
    empty('muzzle', (0, -0.81, 0.025), root)
    empty('eject', (0.03, -0.03, 0.01), root)
    hands(M, root, (0.0, 0.09, -0.11), (0.0, -0.33, -0.03))
    finalize([o for o in bpy.data.objects if o.type == 'MESH'], 6.0)
    export('shotgun.glb', [root])

def build_grenade():
    reset(); M = gun_mats()
    od = mat('M_gren', (0.13, 0.16, 0.1), 0.2, 0.6)
    root = empty('grenade', (0, 0, 0))
    P = [cyl('gb', 0.032, 0.075, (0, 0, 0), od, verts=16, bevel=0.012),
         cyl('gt', 0.016, 0.02, (0, 0, 0.046), M['metal'], verts=12, bevel=0.002),
         box('lever', (0.012, 0.006, 0.07), (0.022, 0, 0.03), M['metal'], 0.002, rot=(0, math.radians(-12), 0))]
    bpy.ops.mesh.primitive_torus_add(major_radius=0.012, minor_radius=0.002, location=(-0.02, 0, 0.055)); r = bpy.context.active_object; r.data.materials.append(M['metal']); P.append(r)
    g = join(P, 'grenade_body'); g.parent = root
    finalize([g], 6.0)
    export('grenade.glb', [root])

# ----------------------------------------------------------------- 集装箱
def corrugated_panel(name, L, H, pitch, depth, m, x=0, y=0, z=0, axis='X', outward=1, thick=0.012):
    """沿 axis 展开的梯形波纹板。outward=+1/-1 为外凸方向（不用负缩放，避免法线翻转）。
    挤出 thick 形成有厚度的壳体，法线朝外。"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    n = max(2, int(round(L / pitch))); pitch = L / n
    prof = []
    for i in range(n):
        u0 = -L / 2 + i * pitch
        prof += [(u0, 0), (u0 + pitch * 0.18, depth), (u0 + pitch * 0.52, depth), (u0 + pitch * 0.70, 0)]
    prof.append((L / 2, 0))
    def vert(u, d, zc, inset=0.0):
        off = d * outward - inset * outward
        if axis == 'X':
            return bm.verts.new((u, off, zc))
        return bm.verts.new((off, u, zc))
    outer_b, outer_t, inner_b, inner_t = [], [], [], []
    for (u, d) in prof:
        outer_b.append(vert(u, d, -H / 2, 0)); outer_t.append(vert(u, d,  H / 2, 0))
        inner_b.append(vert(u, d, -H / 2, thick)); inner_t.append(vert(u, d,  H / 2, thick))
    def quad(a, b, c, d):
        try: bm.faces.new((a, b, c, d))
        except: pass
    for i in range(len(prof) - 1):
        if outward > 0:
            quad(outer_b[i], outer_b[i + 1], outer_t[i + 1], outer_t[i])
            quad(inner_b[i + 1], inner_b[i], inner_t[i], inner_t[i + 1])
        else:
            quad(outer_b[i + 1], outer_b[i], outer_t[i], outer_t[i + 1])
            quad(inner_b[i], inner_b[i + 1], inner_t[i + 1], inner_t[i])
    if outward > 0:
        quad(outer_b[0], outer_t[0], inner_t[0], inner_b[0])
        quad(outer_t[-1], outer_b[-1], inner_b[-1], inner_t[-1])
        for i in range(len(prof) - 1):
            quad(outer_t[i], outer_t[i + 1], inner_t[i + 1], inner_t[i])
            quad(outer_b[i + 1], outer_b[i], inner_b[i], inner_b[i + 1])
    else:
        quad(outer_t[0], outer_b[0], inner_b[0], inner_t[0])
        quad(outer_b[-1], outer_t[-1], inner_t[-1], inner_b[-1])
        for i in range(len(prof) - 1):
            quad(outer_t[i + 1], outer_t[i], inner_t[i], inner_t[i + 1])
            quad(outer_b[i], outer_b[i + 1], inner_b[i + 1], inner_b[i])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    o.location = (x, y, z); o.data.materials.append(m)
    return o

def _corner_casting(name, loc, m, sx, sy, sz):
    """ISO 角件近似：178×162×118 mm 量级的空心角件，开长圆孔。"""
    P = []
    cx, cy, cz = loc
    P.append(box(name + '_b', (0.178, 0.162, 0.118), loc, m, 0.004))
    # 三向孔：用内缩凹槽表示（不走 Boolean，避免 headless 不稳）
    P.append(box(name + '_hx', (0.12, 0.055, 0.045), (cx + sx * 0.04, cy, cz), m))
    P.append(box(name + '_hy', (0.055, 0.11, 0.045), (cx, cy + sy * 0.03, cz), m))
    P.append(box(name + '_hz', (0.055, 0.045, 0.09), (cx, cy, cz + sz * 0.02), m))
    return P

def _door_marks(L, W, H, variant, m):
    """门板与侧板上的原创箱号/船司贴纸（UV 映射到图集对应格）。不使用真实船东商标。"""
    dx = L / 2 - 0.018
    # atlas 2×2
    col, row = variant % 2, variant // 2
    u0, v0, u1, v1 = col * 0.5 + 0.02, row * 0.5 + 0.02, col * 0.5 + 0.48, row * 0.5 + 0.48
    objs = []
    def plane(name, size, loc, rot, uv):
        # size = (width along local X after rot, height along local Z)
        o = box(name, (size[0], 0.004, size[1]), loc, m, 0.0, rot=rot)
        # rewrite UVs to atlas cell (box_uv will be overwritten in finalize; we tag and fix later)
        o['uv_cell'] = uv
        return o
    # 右门公司标志（箱门朝 +X）
    objs.append(plane('logo', (0.55, 0.55), (dx + 0.025, 0.38, 0.35), (0, 0, 0), (u0, v0 + 0.18, u1, v1)))
    # 左门箱号
    objs.append(plane('code', (0.7, 0.18), (dx + 0.025, -0.4, 0.55), (0, 0, 0), (u0, v0, u1, v0 + 0.16)))
    # 侧面「乍浦港区」模板字（+Y 侧）
    objs.append(plane('side', (1.2, 0.22), (0.8, W / 2 - 0.01, 0.7), (0, 0, math.radians(90)), (u0, v0 + 0.16, u1, v0 + 0.28)))
    return objs

def _apply_mark_uv(o):
    cell = o.get('uv_cell')
    if not cell: return
    u0, v0, u1, v1 = cell
    me = o.data; bm = bmesh.new(); bm.from_mesh(me)
    uvl = bm.loops.layers.uv.verify()
    # project the largest face pair onto the cell
    for f in bm.faces:
        xs = [l.vert.co.x for l in f.loops]; ys = [l.vert.co.y for l in f.loops]; zs = [l.vert.co.z for l in f.loops]
        # use the two largest extents
        for l in f.loops:
            p = l.vert.co
            # local box originally size around origin; after transform_apply, use face-local AABB
            pass
    # simpler: each decal is a thin box; take the face with largest area whose normal is outward
    areas = [(f.calc_area(), f) for f in bm.faces]
    areas.sort(key=lambda x: x[0], reverse=True)
    # map both big faces (front and back of thin box)
    for _, f in areas[:2]:
        n = f.normal
        ax = 0 if abs(n.x) > 0.5 else (1 if abs(n.y) > 0.5 else 2)
        pts = [l.vert.co for l in f.loops]
        if ax == 0:
            a = [p.y for p in pts]; b = [p.z for p in pts]
        elif ax == 1:
            a = [p.x for p in pts]; b = [p.z for p in pts]
        else:
            a = [p.x for p in pts]; b = [p.y for p in pts]
        amin, amax, bmin, bmax = min(a), max(a), min(b), max(b)
        for l, p in zip(f.loops, pts):
            aa = p.y if ax == 0 else p.x
            bb = p.z if ax != 2 else p.y
            uu = u0 + (aa - amin) / max(1e-6, amax - amin) * (u1 - u0)
            vv = v0 + (bb - bmin) / max(1e-6, bmax - bmin) * (v1 - v0)
            l[uvl].uv = (uu, vv)
    bm.to_mesh(me); bm.free()

def _fix_outward_normals(o):
    """把法线翻成远离物体包围盒中心（壳体向外）。波纹谷底仍大致朝外。"""
    mw = o.matrix_world.copy()
    me = o.data; bm = bmesh.new(); bm.from_mesh(me)
    bm.transform(mw); bm.normal_update()
    pts = [v.co for v in bm.verts]
    if not pts: bm.free(); return
    c = sum(pts, Vector((0, 0, 0))) / len(pts)
    flipped = 0
    for f in bm.faces:
        mid = f.calc_center_median()
        if f.normal.dot(mid - c) < 0:
            f.normal_flip(); flipped += 1
    bm.normal_update()
    # transform back
    inv = mw.inverted()
    bm.transform(inv)
    bm.to_mesh(me); bm.free(); me.update()
    if flipped:
        print('flipped', o.name, flipped)

def build_container(L, name, mark_variant=0):
    W, H = 2.438, 2.591  # ISO 标准宽 / 8'6" 高
    paint = mat('M_cont_paint', (0.62, 0.62, 0.6), 0.18, 0.62)
    frame = mat('M_cont_frame', (0.45, 0.42, 0.38), 0.35, 0.55)
    steel = mat('M_cont_steel', (0.22, 0.18, 0.14), 0.7, 0.48)
    mark = mat('M_cont_mark', (1, 1, 1), 0.0, 0.55)
    P, marks = [], []
    # 角柱、上下梁（略粗，更接近实物）
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.append(box('post', (0.15, 0.15, H - 0.24), (sx * (L / 2 - 0.075), sy * (W / 2 - 0.075), 0), frame, 0.008))
            for sz in (-1, 1):
                P += _corner_casting('cast', (sx * (L / 2 - 0.09), sy * (W / 2 - 0.082), sz * (H / 2 - 0.059)), steel, sx, sy, sz)
    for sy in (-1, 1):
        for sz in (-1, 1):
            P.append(box('rail', (L - 0.36, 0.13, 0.15 if sz < 0 else 0.11), (0, sy * (W / 2 - 0.065), sz * (H / 2 - (0.075 if sz < 0 else 0.055))), frame, 0.006))
    for sx in (-1, 1):
        P.append(box('endrail_t', (0.13, W - 0.36, 0.11), (sx * (L / 2 - 0.065), 0, H / 2 - 0.055), frame, 0.006))
        P.append(box('endrail_b', (0.13, W - 0.36, 0.15), (sx * (L / 2 - 0.065), 0, -H / 2 + 0.075), frame, 0.006))
    # 侧板：两侧都外凸，带厚度
    for sy in (-1, 1):
        P.append(corrugated_panel('side', L - 0.34, H - 0.28, 0.28, 0.035, paint,
                                  0, sy * (W / 2 - 0.07), 0, 'X', outward=sy, thick=0.014))
    # 顶板 + 纵向顶梁（浅槽）
    P.append(box('roof', (L - 0.28, W - 0.28, 0.028), (0, 0, H / 2 - 0.02), paint))
    for i in range(int(L / 1.15)):
        P.append(box('roofrib', (0.06, W - 0.34, 0.014), (-L / 2 + 0.55 + i * 1.15, 0, H / 2 - 0.004), paint))
    # 底板 + 横梁 + 叉槽
    P.append(box('floor', (L - 0.28, W - 0.28, 0.03), (0, 0, -H / 2 + 0.085), frame, 0.002))
    for i in range(int(L / 0.7)):
        P.append(box('xmem', (0.08, W - 0.32, 0.08), (-L / 2 + 0.4 + i * 0.7, 0, -H / 2 + 0.05), steel))
    if L < 8:
        for sx in (-1, 1):
            P.append(box('fork', (0.36, W - 0.2, 0.12), (sx * 0.91, 0, -H / 2 + 0.11), steel, 0.004))
    # 前端（封闭端）竖向波纹
    P.append(corrugated_panel('front', W - 0.34, H - 0.28, 0.28, 0.03, paint,
                              -L / 2 + 0.07, 0, 0, 'Y', outward=-1, thick=0.014))
    # 内衬：略小的封闭壳，法线向内，从缝隙里看到的是暗舱而不是天空
    liner = box('liner', (L - 0.22, W - 0.22, H - 0.22), (0, 0, 0), mat('M_cont_liner', (0.07, 0.07, 0.07), 0.0, 0.9), 0.0)
    # 翻转内衬法线（朝内）——稍后单独处理
    liner['inward'] = 1
    P.append(liner)
    # 门端：对开箱门 + 锁杆/凸轮/铰链/门封条
    dx = L / 2 - 0.035
    for sy in (-1, 1):
        P.append(box('door', (0.036, W / 2 - 0.16, H - 0.28), (dx, sy * (W / 4 - 0.01), 0), paint, 0.004))
        P.append(box('gasket', (0.01, W / 2 - 0.18, H - 0.32), (dx - 0.02, sy * (W / 4 - 0.01), 0), frame))
        for k in range(5):
            P.append(box(f'drib{k}', (0.016, W / 2 - 0.22, 0.045), (dx + 0.022, sy * (W / 4 - 0.01), -0.95 + k * 0.48), paint, 0.003))
    for i, yy in enumerate((-0.84, -0.34, 0.34, 0.84)):
        P.append(cyl('lockbar', 0.024, H - 0.26, (dx + 0.055, yy, 0), steel, verts=8, bevel=0.002))
        for zz in (-1.12, 1.12):
            P.append(box('cam', (0.07, 0.08, 0.08), (dx + 0.055, yy, zz), steel, 0.004))
        P.append(box('handle', (0.035, 0.045, 0.34), (dx + 0.1, yy + 0.05, -0.15), steel, 0.004))
        P.append(box('hbrkt', (0.055, 0.05, 0.07), (dx + 0.07, yy, -0.15), steel, 0.003))
    for sy in (-1, 1):
        for zz in (-0.95, -0.3, 0.3, 0.95):
            P.append(cyl('hinge', 0.032, 0.13, (dx + 0.02, sy * (W / 2 - 0.13), zz), steel, verts=8, bevel=0.003))
    # 门缝中立柱
    P.append(box('mullion', (0.03, 0.04, H - 0.3), (dx, 0, 0), frame, 0.002))
    marks = _door_marks(L, W, H, mark_variant, mark)
    body = join(P, name)
    # 原点在箱底中心（three: y 向上）
    for v in body.data.vertices: v.co.z += H / 2
    _fix_outward_normals(body)
    # 内衬朝内：再翻一次名为 liner 的部分已经并进 body，用材质 M_cont_liner 区分
    # 整体 _fix_outward_normals 会把内衬也朝外，需要把 liner 材质面再翻回去
    me = body.data; bm = bmesh.new(); bm.from_mesh(me)
    # find liner material index
    li = next((i for i, m in enumerate(body.data.materials) if m and m.name == 'M_cont_liner'), None)
    if li is not None:
        for f in bm.faces:
            if f.material_index == li:
                f.normal_flip()
        bm.to_mesh(me)
    bm.free(); me.update()
    # 贴纸是独立物体，随箱一起升高
    for o in marks:
        o.location.z += H / 2
        _apply_mark_uv(o)
    return body, marks

def build_containers():
    reset(); SEGS[0] = 1
    paint_mark = mat('M_cont_mark', (1, 1, 1), 0.0, 0.55)
    a, ma0 = build_container(12.192, 'cont40', 0)
    a.location = (0, 0, 0)
    for o in ma0:
        bpy.data.objects.remove(o, do_unlink=True)
    b, mb0 = build_container(6.058, 'cont20', 0)
    b.location = (0, 6, 0)
    for o in mb0:
        bpy.data.objects.remove(o, do_unlink=True)
    marks = []
    H40, H20, W = 2.591, 2.591, 2.438
    for v in range(4):
        mk = _door_marks(12.192, W, H40, v, paint_mark)
        for o in mk:
            o.location.z += H40 / 2; _apply_mark_uv(o)
        j = join(mk, f'mark40_{v}'); marks.append(j)
        mk = _door_marks(6.058, W, H20, v, paint_mark)
        for o in mk:
            o.location.y += 6; o.location.z += H20 / 2; _apply_mark_uv(o)
        j = join(mk, f'mark20_{v}'); marks.append(j)
    finalize([a, b], 0.45)
    export('containers.glb', [a, b] + marks); SEGS[0] = 2

# ----------------------------------------------------------------- 起重机
def truss(name, a, b, w, h, seg, m, t=0.12, diag=True):
    """矩形截面桁架：沿 a->b，宽 w 高 h，分段 seg"""
    a = Vector(a); b = Vector(b); d = (b - a); L = d.length; f = d.normalized()
    side = f.cross(Vector((0, 0, 1)))
    if side.length < 1e-3: side = Vector((1, 0, 0))
    side.normalize(); up = side.cross(f).normalized()
    cs = [side * (w / 2) + up * (h / 2), -side * (w / 2) + up * (h / 2), -side * (w / 2) - up * (h / 2), side * (w / 2) - up * (h / 2)]
    P = []
    for c in cs: P.append(beam(name + 'ch', a + c, b + c, t * 1.6, m))
    for i in range(seg + 1):
        p = a + f * (L * i / seg)
        for k in range(4): P.append(beam(name + 'rg', p + cs[k], p + cs[(k + 1) % 4], t, m))
        if diag and i < seg:
            q = a + f * (L * (i + 1) / seg)
            for k in range(4):
                if (i + k) % 2 == 0: P.append(beam(name + 'dg', p + cs[k], q + cs[(k + 1) % 4], t * 0.8, m))
                else: P.append(beam(name + 'dg', p + cs[(k + 1) % 4], q + cs[k], t * 0.8, m))
    return P

def ladder(name, x, y, z0, z1, m):
    P = [beam(name, (x - 0.22, y, z0), (x - 0.22, y, z1), 0.05, m), beam(name, (x + 0.22, y, z0), (x + 0.22, y, z1), 0.05, m)]
    z = z0 + 0.3
    while z < z1:
        P.append(beam(name, (x - 0.22, y, z), (x + 0.22, y, z), 0.03, m, square=False)); z += 0.3
    # 护笼
    z = z0 + 2.2
    while z < z1:
        bpy.ops.mesh.primitive_torus_add(major_radius=0.38, minor_radius=0.02, location=(x, y + 0.3, z), major_segments=12, minor_segments=4)
        o = bpy.context.active_object; o.data.materials.append(m); P.append(o); z += 0.9
    return P

def railing(name, a, b, m, h=1.1):
    a = Vector(a); b = Vector(b); L = (b - a).length; n = max(1, int(L / 1.5)); P = []
    for i in range(n + 1):
        p = a + (b - a) * (i / n); P.append(beam(name, p, p + Vector((0, 0, h)), 0.05, m))
    P.append(beam(name, a + Vector((0, 0, h)), b + Vector((0, 0, h)), 0.05, m, square=False))
    P.append(beam(name, a + Vector((0, 0, h * 0.5)), b + Vector((0, 0, h * 0.5)), 0.035, m, square=False))
    return P

def build_cranes():
    reset()
    paint = mat('M_crane_paint', (0.62, 0.6, 0.56), 0.3, 0.55)
    red = mat('M_crane_red', (0.45, 0.12, 0.08), 0.3, 0.55)
    steel = mat('M_crane_steel', (0.12, 0.12, 0.12), 0.8, 0.4)
    cable = mat('M_cable', (0.05, 0.05, 0.05), 0.9, 0.35)
    yellow = mat('M_rtg_yellow', (0.7, 0.5, 0.1), 0.3, 0.5)
    # STS 岸桥：海侧 -Y（three 中为 -Z）。坐标：x 横向，y 前后，z 高
    h = 38.0
    P = []
    legs = [(-8, 0), (8, 0), (-8, 20), (8, 20)]
    for (x, y) in legs:
        P += truss('leg', (x, y, 0.8), (x, y, h), 1.6, 1.6, 12, paint, 0.1)
        P.append(box('bogie', (2.6, 5.0, 1.0), (x, y, 0.5), red, 0.05))
        for k in (-1.6, 0, 1.6):
            P.append(cyl('wheel', 0.42, 0.3, (x, y + k, 0.42), steel, rot=(0, math.radians(90), 0), verts=14))
    for y in (0, 20):
        P += truss('portal', (-8.8, y, h), (8.8, y, h), 1.8, 2.2, 8, paint, 0.12)
        P += truss('sill', (-8, y, h * 0.42), (8, y, h * 0.42), 1.0, 1.2, 6, paint, 0.08)
    for x in (-8, 8):
        P += truss('side', (x, 0, h * 0.42), (x, 20, h * 0.42), 1.0, 1.2, 6, paint, 0.08)
        P.append(beam('brace', (x, 0, 2), (x, 20, h * 0.42), 0.4, paint))
    bh = h + 4
    P += truss('boom_sea', (0, -72, bh), (0, 0, bh), 6.0, 3.0, 24, paint, 0.14)
    P += truss('girder_land', (0, 0, bh), (0, 30, bh), 6.0, 3.0, 10, paint, 0.14)
    apex = Vector((0, 17, h + 22))
    for x in (-3, 3):
        P.append(beam('aframe', (x, 20, h), apex + Vector((x * 0.3, 0, 0)), 0.9, paint))
        P.append(beam('aframe2', (x, 0, h), apex + Vector((x * 0.3, 0, 0)), 0.7, paint))
        P.append(beam('stay', apex, (x, -50, bh + 1.5), 0.12, cable, square=False))
        P.append(beam('stay2', apex, (x, -24, bh + 1.5), 0.12, cable, square=False))
        P.append(beam('stay3', apex, (x, 30, bh + 1.5), 0.12, cable, square=False))
    P.append(box('machinery', (8, 8, 5), (0, 24, h + 4.5), paint, 0.1))
    P.append(box('mroof', (8.4, 8.4, 0.3), (0, 24, h + 7.15), red, 0.05))
    P += railing('rail', (-4, -72, bh + 1.5), (-4, 30, bh + 1.5), steel)
    P += railing('rail', (4, -72, bh + 1.5), (4, 30, bh + 1.5), steel)
    P += ladder('ladder', 8.9, 10, 1, h, steel)
    # 司机室小车、钢缆、吊具
    P.append(box('trolley', (5, 4, 2.4), (0, -6, bh - 2.6), red, 0.06))
    P.append(box('cab', (2.2, 2.6, 2.4), (2.2, -6, bh - 4.8), paint, 0.06))
    glass = mat('M_crane_glass', (0.05, 0.07, 0.08), 0.9, 0.1)
    P.append(box('cabglass', (2.25, 2.0, 1.0), (2.2, -6.2, bh - 4.6), glass))
    for x in (-1.5, -0.5, 0.5, 1.5):
        P.append(beam('hoist', (x, -6, bh - 3.8), (x, -6, 16.5), 0.06, cable, square=False))
    P.append(box('spreader', (12.2, 2.4, 0.8), (0, -6, 16), yellow, 0.05))
    for sx in (-1, 1):
        P.append(box('flipper', (0.2, 2.6, 0.9), (sx * 6.1, -6, 15.6), yellow, 0.02))
    # 航空灯
    P.append(cyl('aviation', 0.25, 0.3, (0, 17, h + 22.4), red, verts=10))
    sts = join(P, 'sts')
    finalize([sts], 0.25)
    # RTG 轮胎吊
    P = []
    for x in (-11, 11):
        for y in (-3.5, 3.5):
            P += truss('rleg', (x, y, 1.4), (x, y, 18), 0.9, 0.9, 6, yellow, 0.08)
            P.append(cyl('tyre', 0.75, 0.6, (x, y, 0.75), mat('M_tyre', (0.03, 0.03, 0.03), 0.0, 0.85), rot=(0, math.radians(90), 0), verts=18, bevel=0.06))
        P.append(box('rsill', (1.4, 8.2, 1.2), (x, 0, 1.6), yellow, 0.05))
        P += truss('rside', (x, -3.5, 18), (x, 3.5, 18), 1.0, 1.2, 3, yellow, 0.08)
    for y in (-3.5, 3.5):
        P += truss('rgird', (-11.5, y, 18.6), (11.5, y, 18.6), 1.0, 1.6, 10, yellow, 0.08)
    P.append(box('rtrolley', (3, 7.6, 2), (4, 0, 17.6), yellow, 0.05))
    P.append(box('rcab', (1.8, 2, 2), (6, -2.5, 15.8), yellow, 0.05))
    P.append(box('rengine', (2.2, 4, 2.4), (11, 0, 4), mat('M_rtg_engine', (0.25, 0.25, 0.25), 0.4, 0.5), 0.05))
    for x in (3, 5):
        P.append(beam('rh', (x, 0, 16.6), (x, 0, 9), 0.05, cable, square=False))
    P.append(box('rspreader', (6.1, 2.4, 0.6), (4, 0, 8.7), yellow, 0.04))
    P += ladder('rladder', -11.9, 0, 0.5, 18, steel)
    rtg = join(P, 'rtg'); rtg.location = (0, 120, 0)
    finalize([rtg], 0.25)
    rtg.location = (0, 0, 0)
    export('cranes.glb', [sts, rtg])

# ----------------------------------------------------------------- 撤离艇 / 中继柜 / 道具
def build_boat_relay_props():
    reset()
    hull = mat('M_hull', (0.12, 0.16, 0.19), 0.5, 0.45)
    white = mat('M_cabin', (0.62, 0.63, 0.6), 0.15, 0.5)
    orange = mat('M_orange', (0.75, 0.25, 0.05), 0.1, 0.55)
    glass = mat('M_boat_glass', (0.03, 0.04, 0.05), 0.9, 0.06)
    steel = mat('M_steel', (0.25, 0.25, 0.25), 0.8, 0.4)
    rubber = mat('M_rubber', (0.03, 0.03, 0.03), 0.0, 0.85)
    deck = mat('M_deck', (0.15, 0.15, 0.14), 0.2, 0.75)
    # 船体：放样（多截面）
    me = bpy.data.meshes.new('hull'); bm = bmesh.new()
    sections = []
    for i in range(13):
        t = i / 12; x = -9 + t * 17
        bw = 2.7 * (1 - max(0, (0.35 - t)) ** 2 * 7) if t < 0.35 else 2.7
        bw = max(0.15, bw)
        keel = -0.2 + (0.9 if t < 0.15 else 0) * (0.15 - t) / 0.15
        sec = [(x, -bw, 1.9), (x, -bw * 0.92, 0.6), (x, -bw * 0.45, keel + 0.1), (x, 0, keel), (x, bw * 0.45, keel + 0.1), (x, bw * 0.92, 0.6), (x, bw, 1.9)]
        sections.append([bm.verts.new(p) for p in sec])
    for i in range(len(sections) - 1):
        for k in range(6):
            bm.faces.new((sections[i][k], sections[i + 1][k], sections[i + 1][k + 1], sections[i][k + 1]))
    bm.faces.new(list(reversed(sections[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    h = bpy.data.objects.new('hullmesh', me); bpy.context.collection.objects.link(h); h.data.materials.append(hull)
    mod = h.modifiers.new('ss', 'SUBSURF'); mod.levels = 1
    P = [h]
    P.append(box('deck', (16.2, 5.1, 0.12), (-0.6, 0, 1.86), deck))
    P.append(box('rubstrake', (17.2, 5.7, 0.3), (-0.5, 0, 1.75), orange, 0.08))
    P.append(box('cabin', (5.2, 3.6, 2.0), (1.6, 0, 2.9), white, 0.08))
    P.append(box('cabroof', (5.8, 4.0, 0.18), (1.4, 0, 3.98), white, 0.04))
    P.append(box('wind', (5.25, 3.65, 0.7), (1.6, 0, 3.35), glass))
    P.append(box('wfront', (0.12, 3.2, 0.9), (-1.05, 0, 3.3), glass, 0.0, rot=(0, math.radians(-20), 0)))
    P.append(cyl('mast', 0.07, 3.2, (2.6, 0, 5.6), steel, verts=10))
    P.append(box('yard', (0.1, 1.8, 0.08), (2.6, 0, 6.6), steel))
    P.append(cyl('radar', 0.45, 0.25, (1.0, 0, 4.25), white, verts=16, bevel=0.03))
    for x in [i * 1.5 - 8 for i in range(11)]:
        for y in (-2.45, 2.45):
            P.append(beam('stanchion', (x, y, 1.9), (x, y, 2.85), 0.04, steel, square=False))
    for y in (-2.45, 2.45):
        P.append(beam('rail', (-8, y, 2.85), (7, y, 2.85), 0.045, steel, square=False))
    for x in (-6, -2, 5):
        for y in (-2.85, 2.85):
            P.append(cyl('fender', 0.3, 0.9, (x, y, 1.0), rubber, rot=(math.radians(90), 0, 0), verts=12))
    P.append(cyl('bollardA', 0.12, 0.3, (-7, 1, 2.05), steel, verts=10))
    boat = join(P, 'boat')
    empty('beacon', (2.6, 0, 7.1), boat)
    finalize([boat], 0.5)
    # 中继柜
    cab = mat('M_relay_cab', (0.45, 0.46, 0.44), 0.35, 0.5)
    stripe = mat('M_relay_stripe', (0.7, 0.5, 0.08), 0.2, 0.55)
    dark = mat('M_relay_dark', (0.04, 0.04, 0.04), 0.5, 0.5)
    R = [box('base', (2.4, 1.8, 0.3), (0, 0, 0.15), mat('M_concrete', (0.45, 0.44, 0.42), 0.0, 0.9), 0.04),
         box('body', (1.6, 1.0, 2.2), (0, 0, 1.4), cab, 0.03),
         box('roof', (1.75, 1.15, 0.08), (0, 0, 2.54), cab, 0.02),
         box('stripe', (1.62, 1.02, 0.16), (0, 0, 0.62), stripe)]
    for sy in (-1, 1):
        R.append(box('door', (1.4, 0.03, 1.8), (0, sy * 0.51, 1.45), cab, 0.01))
        for k in range(6):
            R.append(box('vent', (0.6, 0.02, 0.025), (0, sy * 0.53, 0.9 + k * 0.07), dark))
        R.append(box('handle', (0.03, 0.04, 0.2), (0.55, sy * 0.54, 1.5), steel, 0.008))
        R.append(cyl('lock', 0.025, 0.02, (0.55, sy * 0.535, 1.68), steel, rot=(math.radians(90), 0, 0), verts=10))
    for x in (-0.5, 0, 0.5):
        R.append(beam('conduit', (x, 0.3, 0.3), (x, 1.0, 0.0), 0.08, rubber, square=False))
    # 天线塔（格构）
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        R.append(beam('mastleg', (math.cos(a) * 0.5, -1.3 + math.sin(a) * 0.5, 0), (math.cos(a) * 0.15, -1.3 + math.sin(a) * 0.15, 9), 0.07, steel))
    zz = 0.6
    while zz < 9:
        rr = 0.5 - zz * 0.039
        for i in range(4):
            a = i * math.pi / 2 + math.pi / 4; b2 = a + math.pi / 2
            R.append(beam('mastring', (math.cos(a) * rr, -1.3 + math.sin(a) * rr, zz), (math.cos(b2) * rr, -1.3 + math.sin(b2) * rr, zz), 0.035, steel))
            R.append(beam('mastdiag', (math.cos(a) * rr, -1.3 + math.sin(a) * rr, zz), (math.cos(b2) * (rr - 0.04), -1.3 + math.sin(b2) * (rr - 0.04), zz + 0.9), 0.025, steel))
        zz += 0.9
    R.append(cyl('dish', 0.55, 0.22, (0, -1.1, 7.2), mat('M_dish', (0.7, 0.7, 0.68), 0.1, 0.4), rot=(math.radians(60), 0, 0), verts=20, r2=0.15))
    relay = join(R, 'relay')
    empty('screen', (0, -0.53, 1.55), relay); empty('beaconpos', (0, -1.3, 9.2), relay)
    finalize([relay], 1.0)
    # 灯塔、隔离墩、系缆桩、灯具
    L = [beam('pole', (0, 0, 0), (0, 0, 16), 0.32, steel, square=False)]
    L.append(box('pbase', (0.8, 0.8, 0.5), (0, 0, 0.25), mat('M_concrete', (0.45, 0.44, 0.42), 0.0, 0.9), 0.04))
    L.append(box('arm', (2.8, 0.25, 0.25), (0, 0, 15.9), steel, 0.02))
    for x in (-1, 1):
        L.append(box('lamp', (0.8, 0.45, 0.2), (x * 1.0, 0, 15.7), dark, 0.03))
        L.append(box('lampface', (0.7, 0.38, 0.02), (x * 1.0, 0, 15.59), mat('M_lamp_emit', (1.0, 0.75, 0.45), 0.0, 0.3)))
    lampm = join(L, 'lamppost'); finalize([lampm], 1.0)
    J = [prism('jersey', [(-0.3, 0), (0.3, 0), (0.25, 0.08), (0.1, 0.3), (0.08, 0.82), (-0.08, 0.82), (-0.1, 0.3), (-0.25, 0.08)], 3.0, mat('M_concrete', (0.45, 0.44, 0.42), 0.0, 0.9), bevel=0.02)]
    jersey = join(J, 'barrier'); finalize([jersey], 1.0)
    export('props.glb', [boat, relay, lampm, jersey])

# ----------------------------------------------------------------- 机械敌人
def enemy_mats():
    return dict(
        hull=mat('M_en_hull', (0.18, 0.2, 0.22), 0.65, 0.38),
        plate=mat('M_en_plate', (0.5, 0.48, 0.44), 0.45, 0.45),
        joint=mat('M_en_joint', (0.04, 0.04, 0.045), 0.7, 0.5),
        hazard=mat('M_en_hazard', (0.75, 0.5, 0.1), 0.3, 0.5),
        piston=mat('M_en_piston', (0.7, 0.7, 0.72), 1.0, 0.2),
        weak_red=mat('M_weak_red', (1.0, 0.2, 0.05), 0.0, 0.3),
        weak_amber=mat('M_weak_amber', (1.0, 0.6, 0.15), 0.0, 0.3),
        cable=mat('M_en_cable', (0.03, 0.03, 0.03), 0.2, 0.7))

def piston(name, a, b, M):
    a = Vector(a); b = Vector(b); m = (a + b) / 2
    return [beam(name + 'c', a, m + (b - a) * 0.1, 0.05, M['joint'], square=False), beam(name + 'r', m - (b - a) * 0.1, b, 0.028, M['piston'], square=False)]

def leg_chain(prefix, root, hipLoc, M, upper=0.42, lower=0.44, thick=0.11, foot=(0.14, 0.2), sx=1):
    hip = empty(prefix + '_hip', hipLoc, root)
    P = [box(prefix + 'thigh', (thick * 0.9, thick * 1.3, upper), (0, 0, -upper / 2), M['hull'], 0.015)]
    P.append(cyl(prefix + 'hipj', thick * 0.65, thick * 1.4, (0, 0, 0), M['joint'], rot=(0, math.radians(90), 0), verts=12))
    P += piston(prefix + 'pst', (0, thick * 0.8, -0.05), (0, thick * 0.6, -upper * 0.85), M)
    th = join(P, prefix + '_thighm'); th.parent = hip
    knee = empty(prefix + '_knee', (0, 0, -upper), hip)
    Q = [box(prefix + 'shin', (thick * 0.75, thick, lower), (0, 0, -lower / 2), M['joint'], 0.012),
         box(prefix + 'shinplate', (thick * 0.8, thick * 0.5, lower * 0.6), (0, -thick * 0.45, -lower * 0.4), M['plate'], 0.01),
         cyl(prefix + 'kneej', thick * 0.55, thick * 1.2, (0, 0, 0), M['joint'], rot=(0, math.radians(90), 0), verts=12),
         box(prefix + 'foot', (foot[0], foot[1], 0.05), (0, -0.03, -lower - 0.02), M['hull'], 0.012)]
    sh = join(Q, prefix + '_shinm'); sh.parent = knee
    return hip

def build_enemies():
    reset(); M = enemy_mats()
    # —— 机械猎犬（四足）
    hound = empty('hound', (0, 0, 0))
    body = empty('hound_body', (0, 0, 0.78), hound)
    B = [box('chassis', (0.58, 1.2, 0.36), (0, 0, 0), M['hull'], 0.04),
         box('spine', (0.36, 1.05, 0.08), (0, 0, 0.22), M['plate'], 0.02),
         box('hz1', (0.6, 0.12, 0.37), (0, 0.32, 0), M['hazard'], 0.01),
         box('battery', (0.42, 0.4, 0.2), (0, 0.32, 0.26), M['joint'], 0.02),
         box('sidepanelL', (0.03, 0.8, 0.24), (0.3, -0.05, 0.0), M['plate'], 0.01),
         box('sidepanelR', (0.03, 0.8, 0.24), (-0.3, -0.05, 0.0), M['plate'], 0.01)]
    for i in range(5): B.append(box('vent', (0.3, 0.025, 0.02), (0, 0.48 + 0.0, 0.1 - i * 0.04), M['joint']))
    for sx in (-1, 1): B.append(beam('cablebody', (sx * 0.22, -0.4, 0.2), (sx * 0.15, 0.5, 0.25), 0.03, M['cable'], square=False))
    B.append(beam('antenna', (0.15, 0.55, 0.2), (0.2, 0.9, 0.75), 0.015, M['joint'], square=False))
    bm_ = join(B, 'hound_chassis'); bm_.parent = body
    head = empty('hound_head', (0, -0.66, 0.1), body)
    H = [box('skull', (0.38, 0.46, 0.28), (0, -0.12, 0.02), M['plate'], 0.04),
         box('jaw', (0.32, 0.4, 0.09), (0, -0.16, -0.16), M['joint'], 0.02),
         box('visorframe', (0.3, 0.06, 0.16), (0, -0.36, 0.04), M['joint'], 0.02),
         cyl('neck', 0.09, 0.3, (0, 0.12, -0.02), M['joint'], rot=(math.radians(90), 0, 0), verts=12)]
    for sx in (-1, 1): H.append(box('ear', (0.04, 0.12, 0.2), (sx * 0.17, 0.02, 0.2), M['hull'], 0.01, rot=(math.radians(-20), 0, 0)))
    hm = join(H, 'hound_headm'); hm.parent = head
    eye = cyl('hound_eye', 0.085, 0.06, (0, -0.4, 0.04), M['weak_red'], rot=(math.radians(90), 0, 0), verts=16); eye.parent = head; eye.name = 'weak_eye'
    for (n, x, y) in (('FL', 0.3, -0.42), ('FR', -0.3, -0.42), ('BL', 0.3, 0.42), ('BR', -0.3, 0.42)):
        leg_chain('hleg' + n, body, (x, y, -0.08), M, 0.42, 0.42, 0.1, (0.13, 0.2))
    # —— 机械飞鸥
    gull = empty('gull', (0, 0, 0))
    gb = empty('gull_body', (0, 0, 0), gull)
    G = [cyl('fus', 0.2, 0.9, (0, 0, 0), M['hull'], rot=(math.radians(90), 0, 0), verts=14, bevel=0.03),
         cyl('nose', 0.2, 0.36, (0, -0.62, 0), M['plate'], rot=(math.radians(-90), 0, 0), verts=14, r2=0.04),
         box('tailfin', (0.04, 0.4, 0.3), (0, 0.5, 0.15), M['plate'], 0.01),
         box('tailplane', (0.6, 0.2, 0.03), (0, 0.55, 0.04), M['hull'], 0.01),
         box('hz', (0.42, 0.1, 0.42), (0, 0.18, 0), M['hazard'], 0.01),
         cyl('gimbal', 0.1, 0.1, (0, -0.25, -0.2), M['joint'], verts=12)]
    gm = join(G, 'gull_fus'); gm.parent = gb
    core = bpy.ops.mesh.primitive_uv_sphere_add(radius=0.11, location=(0, -0.3, -0.24), segments=16, ring_count=8)
    co = bpy.context.active_object; co.name = 'weak_core'; co.data.materials.append(M['weak_amber']); co.parent = gb
    for (n, s) in (('L', 1), ('R', -1)):
        piv = empty('gull_wing' + n, (s * 0.18, 0, 0.05), gb)
        W1 = [prism('wroot' + n, [(-0.28, 0), (0.22, 0), (0.18, 0.03), (-0.24, 0.03)], 1.0, M['plate'], bevel=0.008)]
        W1[0].location = (s * 0.5, 0, 0)
        W1.append(cyl('rotor' + n, 0.16, 0.05, (s * 0.85, -0.05, 0.05), M['joint'], verts=16))
        W1.append(box('rotorguard' + n, (0.36, 0.36, 0.02), (s * 0.85, -0.05, 0.08), M['hull'], 0.005))
        w1 = join(W1, 'gull_w1' + n); w1.parent = piv
        tip = empty('gull_tip' + n, (s * 1.0, 0, 0), piv)
        W2 = [prism('wtip' + n, [(-0.18, 0), (0.18, 0), (0.12, 0.022), (-0.15, 0.022)], 0.9, M['hull'], bevel=0.006)]
        W2[0].location = (s * 0.45, 0.05, 0)
        W2.append(box('wtiphz' + n, (0.18, 0.34, 0.025), (s * 0.85, 0.05, 0.0), M['hazard'], 0.004))
        w2 = join(W2, 'gull_w2' + n); w2.parent = tip
    # —— 机械守卫（重型双足）
    ward = empty('warden', (0, 0, 0))
    pel = empty('warden_pelvis', (0, 0, 1.55), ward)
    pm = join([box('pelv', (0.9, 0.7, 0.4), (0, 0, 0), M['joint'], 0.04), box('codplate', (0.5, 0.1, 0.35), (0, -0.38, -0.05), M['plate'], 0.02)], 'warden_pelvm'); pm.parent = pel
    tor = empty('warden_torso', (0, 0, 0.75), pel)
    T = [box('chest', (1.5, 1.0, 1.1), (0, 0, 0), M['hull'], 0.08),
         box('chestplate', (1.1, 0.2, 0.75), (0, -0.55, 0.1), M['plate'], 0.05),
         box('hzband', (1.56, 1.06, 0.2), (0, 0, -0.34), M['hazard'], 0.02),
         box('backpack', (0.9, 0.2, 0.95), (0, 0.6, 0.12), M['joint'], 0.03),
         box('collar', (0.8, 0.6, 0.15), (0, -0.05, 0.6), M['joint'], 0.03)]
    for i in range(4): T.append(box('fin', (0.04, 0.16, 0.8), (-0.3 + i * 0.2, 0.75, 0.12), M['plate'], 0.01))
    for sx in (-1, 1): T.append(beam('hose', (sx * 0.4, 0.55, 0.5), (sx * 0.72, 0.2, 0.42), 0.06, M['cable'], square=False))
    tm = join(T, 'warden_chest'); tm.parent = tor
    back = cyl('weak_back', 0.26, 0.2, (0, 0.72, 0.12), M['weak_amber'], rot=(math.radians(90), 0, 0), verts=20); back.parent = tor
    hd = empty('warden_head', (0, -0.15, 0.72), tor)
    hm2 = join([box('helm', (0.56, 0.52, 0.38), (0, 0, 0), M['plate'], 0.05), box('chin', (0.4, 0.2, 0.12), (0, -0.2, -0.16), M['joint'], 0.02)], 'warden_helm'); hm2.parent = hd
    visor = box('weak_visor', (0.46, 0.05, 0.09), (0, -0.27, 0.03), M['weak_red'], 0.01); visor.parent = hd
    for (n, s) in (('R', 1), ('L', -1)):
        sh = empty('warden_sh' + n, (s * 0.98, 0, 0.25), tor)
        S = [box('pauldron' + n, (0.62, 0.84, 0.5), (s * 0.08, 0, 0.12), M['plate'], 0.06),
             cyl('shj' + n, 0.2, 0.3, (0, 0, 0), M['joint'], rot=(0, math.radians(90), 0), verts=14),
             box('upperarm' + n, (0.26, 0.3, 0.8), (0, 0, -0.48), M['hull'], 0.03)]
        S += piston('ap' + n, (s * 0.12, 0.1, -0.1), (s * 0.12, 0.08, -0.82), M)
        sm = join(S, 'warden_upper' + n); sm.parent = sh
        fo = empty('warden_fore' + n, (0, 0, -0.9), sh)
        if s > 0:
            F = [box('gunbody', (0.38, 1.0, 0.38), (0, -0.35, 0), M['joint'], 0.04),
                 box('gunhz', (0.4, 0.15, 0.4), (0, 0.05, 0), M['hazard'], 0.01),
                 box('ammo', (0.24, 0.4, 0.3), (0.26, -0.1, 0), M['hull'], 0.03)]
            for dx in (-0.08, 0.08):
                F.append(cyl('bar' + str(dx), 0.055, 0.6, (dx, -1.05, 0.04), M['hull'], rot=(math.radians(90), 0, 0), verts=12))
            fm = join(F, 'warden_gun'); fm.parent = fo
            empty('warden_muzzle', (0, -1.4, 0.04), fo)
        else:
            F = [box('forearm', (0.3, 0.3, 0.7), (0, 0, -0.3), M['hull'], 0.03),
                 box('shield', (0.1, 0.95, 1.2), (-0.2, -0.05, -0.32), M['hazard'], 0.03),
                 box('shieldrim', (0.12, 0.99, 0.06), (-0.2, -0.05, 0.27), M['joint'], 0.01)]
            fm = join(F, 'warden_shield'); fm.parent = fo
    for (n, s) in (('R', 1), ('L', -1)):
        leg_chain('wleg' + n, pel, (s * 0.38, 0, -0.15), M, 0.75, 0.72, 0.36, (0.46, 0.72))
    finalize([o for o in bpy.data.objects if o.type == 'MESH'], 2.0)
    export('enemies.glb', [hound, gull, ward])

ALL = dict(rifle=build_rifle, shotgun=build_shotgun, grenade=build_grenade, containers=build_containers, cranes=build_cranes, props=build_boat_relay_props, enemies=build_enemies)
# rifle / shotgun 已改为第三方 CC BY 模型改装（art/gun_convert.py）；这里保留原创旧枪构建函数供对照（rifle_legacy / shotgun_legacy）。
ALL['rifle_legacy'] = ALL.pop('rifle'); ALL['shotgun_legacy'] = ALL.pop('shotgun')
DEFAULT = [k for k in ALL if not k.endswith('_legacy')]
if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else DEFAULT
    for a in args: ALL[a]()
    print('ALL DONE')
