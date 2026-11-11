# 锈潮断链 · 第三方枪械模型改装（Blender 4.2 headless；作者：Jack）
# 源模型：Gintoki1234「M16 A4」「Remington 870 FieldMaster」，CC BY 4.0（署名见 NOTICE）。原始包不入库（staging/guns/）。
# 改装：去弹匣内子弹 / 提把与提把骨架；按骨骼权重拆出可动件（拉机柄、枪机、泵把+枪栓）；统一朝向（枪口 -Y、Z 上、抛壳口在 -X 即屏幕右侧）、
#       米制原寸、原点在握把；上导轨装原创全息瞄具（方形半透明窗）；挂第一人称双手（art/build_assets.py 原创手模）与锚点空物体；
#       换用 art/gun_textures.py 处理后的贴图（去铭文 + 原创铭牌 + 锈湿做旧，ORM 打包），导出 WebP 贴图的 glb（高/低两档）。
# 用法：python3 art/gun_textures.py && /home/box/blender/blender -b --factory-startup -P art/gun_convert.py [-- rifle shotgun] [--preview]
import bpy, bmesh, math, os, sys, importlib.util
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
SRC = os.path.join(ROOT, 'staging', 'guns')
BUILD = os.path.join(SRC, '_build')
OUT = os.path.join(ROOT, 'models')
spec = importlib.util.spec_from_file_location('build_assets', os.path.join(HERE, 'build_assets.py'))
ba = importlib.util.module_from_spec(spec); spec.loader.exec_module(ba)

RIFLE_FBX = os.path.join(SRC, 'R2-gintoki-m16a4', 'M16 A4 by Gintoki1234', 'M16 A4.fbx')
SG_DIR = os.path.join(SRC, 'S2-gintoki-remington870', 'Remington 870 FieldMaster by Gintoki1234')
SG_FBX = os.path.join(SG_DIR, 'Remington 870 FieldMaster.fbx')
SHELL_FIRED = os.path.join(SG_DIR, 'Remington 12 GA Shotgun Shell (Fired).fbx')
SHELL_LIVE = os.path.join(SG_DIR, 'Remington 12 GA Shotgun Shell.fbx')

def objs_after_import(fn):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=fn)
    return [o for o in bpy.data.objects if o not in before]

def bake_world(o):
    """去父级、去骨骼修改器、把世界变换烘进网格"""
    mw = o.matrix_world.copy()
    o.parent = None
    for m in list(o.modifiers): o.modifiers.remove(m)
    if o.type == 'MESH':
        o.data.transform(mw)
    o.matrix_world = Matrix.Identity(4)

def split_groups(o, groups, name):
    """把主导权重属于 groups 的面拆成新对象"""
    vg = {g.index: g.name for g in o.vertex_groups}
    bm = bmesh.new(); bm.from_mesh(o.data)
    dl = bm.verts.layers.deform.active
    sel = set()
    for v in bm.verts:
        d = v[dl]
        if d:
            gi = max(d.items(), key=lambda kv: kv[1])[0]
            if vg.get(gi) in groups: sel.add(v.index)
    if not sel: bm.free(); return None
    me_new = bpy.data.meshes.new(name)
    bm2 = bm.copy()
    bm2.verts.ensure_lookup_table()
    rm = [f for f in bm2.faces if not all(v.index in sel for v in f.verts)]
    bmesh.ops.delete(bm2, geom=rm, context='FACES')
    bmesh.ops.delete(bm2, geom=[v for v in bm2.verts if not v.link_faces], context='VERTS')
    bm2.to_mesh(me_new); bm2.free()
    faces = [f for f in bm.faces if all(v.index in sel for v in f.verts)]
    bmesh.ops.delete(bm, geom=faces, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(o.data); bm.free()
    on = bpy.data.objects.new(name, me_new); bpy.context.collection.objects.link(on)
    return on

def verts_world(o):
    return [o.matrix_world @ v.co for v in o.data.vertices]

def bbox(pts):
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])

def set_origin(o, p):
    """原点移到 p（世界），几何不动"""
    p = Vector(p)
    o.data.transform(Matrix.Translation(-(p - o.matrix_world.translation))); o.location = p

def node_group_occlusion():
    ng = bpy.data.node_groups.get('glTF Material Output')
    if ng: return ng
    ng = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    ng.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    ng.nodes.new('NodeGroupInput')
    return ng

def pbr_mat(name, tex_prefix):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    bsdf = N.get('Principled BSDF')
    def img(path, color):
        n = N.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(path, check_existing=True)
        n.image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
        return n
    b = img(tex_prefix + '_base.png', True); L.new(b.outputs['Color'], bsdf.inputs['Base Color'])
    o = img(tex_prefix + '_orm.png', False)
    sep = N.new('ShaderNodeSeparateColor'); L.new(o.outputs['Color'], sep.inputs['Color'])
    L.new(sep.outputs['Green'], bsdf.inputs['Roughness']); L.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    g = N.new('ShaderNodeGroup'); g.node_tree = node_group_occlusion(); L.new(sep.outputs['Red'], g.inputs['Occlusion'])
    n = img(tex_prefix + '_normal.png', False)
    nm = N.new('ShaderNodeNormalMap'); L.new(n.outputs['Color'], nm.inputs['Color']); L.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m

def retex(tag):
    """切换所有处理后贴图到 hi / lo"""
    for img in bpy.data.images:
        p = img.filepath
        for t in ('_hi_', '_lo_'):
            if t in p:
                img.filepath = p.replace(t, f'_{tag}_'); img.reload()

def tris(objs):
    n = 0
    for o in objs:
        if o.type == 'MESH':
            for p in o.data.polygons: n += len(p.vertices) - 2
    return n

def export(path, root):
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for c in root.children_recursive: c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_texcoords=True, export_normals=True, export_tangents=False,
        export_vertex_color='ACTIVE', export_all_vertex_colors=True, export_materials='EXPORT', export_animations=False,
        export_image_format='WEBP', export_image_quality=88)
    print('exported', path, os.path.getsize(os.path.join(OUT, path)))

def holo_sight(M, cx, cy, rail_z):
    """原创全息瞄具：方形镜窗、前罩、导轨座。造型参考通用全息窗，不复制任何商业品牌网格/贴图。"""
    z = rail_z + 0.030  # 镜窗中心
    P = []
    # 导轨座与锁夹
    P.append(ba.box('holo_mount', (0.030, 0.078, 0.016), (cx, cy, rail_z + 0.008), M['dark'], 0.002))
    P.append(ba.box('holo_clamp', (0.038, 0.052, 0.008), (cx, cy + 0.004, rail_z + 0.003), M['metal'], 0.0015))
    P.append(ba.cyl('holo_nut', 0.006, 0.046, (cx + 0.022, cy, rail_z + 0.005), M['metal'], rot=(0, math.radians(90), 0), verts=10))
    # 窗框（内空 0.034 × 0.026，进深 0.06）
    t, iw, ih, d = 0.005, 0.034, 0.026, 0.062
    P.append(ba.box('holo_top', (iw + t * 2, d, t), (cx, cy, z + ih / 2 + t / 2), M['dark'], 0.001))
    P.append(ba.box('holo_bot', (iw + t * 2, d, t), (cx, cy, z - ih / 2 - t / 2), M['dark'], 0.001))
    P.append(ba.box('holo_l', (t, d, ih), (cx - iw / 2 - t / 2, cy, z), M['dark'], 0.001))
    P.append(ba.box('holo_r', (t, d, ih), (cx + iw / 2 + t / 2, cy, z), M['dark'], 0.001))
    # 前罩（朝枪口 -Y）略前伸，挡住杂光，仍留方形窗
    P.append(ba.box('holo_hood_t', (iw + t * 2 + 0.008, 0.018, 0.008), (cx, cy - d / 2 - 0.006, z + ih / 2 + 0.006), M['dark'], 0.0015))
    P.append(ba.box('holo_hood_b', (iw + t * 2 + 0.008, 0.018, 0.006), (cx, cy - d / 2 - 0.006, z - ih / 2 - 0.005), M['dark'], 0.0015))
    P.append(ba.box('holo_hood_l', (0.007, 0.018, ih + 0.01), (cx - iw / 2 - 0.008, cy - d / 2 - 0.006, z), M['dark'], 0.0015))
    P.append(ba.box('holo_hood_r', (0.007, 0.018, ih + 0.01), (cx + iw / 2 + 0.008, cy - d / 2 - 0.006, z), M['dark'], 0.0015))
    # 后沿与侧边调节钮（通用圆柱，无厂商品牌）
    P.append(ba.box('holo_rear', (iw + t * 2, 0.008, ih + t * 2), (cx, cy + d / 2, z), M['metal'], 0.001))
    P.append(ba.cyl('holo_btn1', 0.007, 0.012, (cx + iw / 2 + t + 0.008, cy, z + 0.004), M['metal'], rot=(0, math.radians(90), 0), verts=12, bevel=0.001))
    P.append(ba.cyl('holo_btn2', 0.006, 0.010, (cx + iw / 2 + t + 0.008, cy + 0.016, z - 0.006), M['metal'], rot=(0, math.radians(90), 0), verts=12, bevel=0.001))
    lens = ba.box('dot_lens', (iw - 0.001, 0.002, ih - 0.001), (cx, cy - 0.008, z), M['lens'])
    body = ba.join(P, 'holo')
    return body, lens, Vector((cx, cy, z))


def mk_empty(name, loc, parent):
    e = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(e)
    bpy.context.view_layer.update()
    if parent:
        e.parent = parent
        e.matrix_world = Matrix.Translation(Vector(loc))
    else:
        e.location = loc
    return e

def parent_keep(o, parent):
    bpy.context.view_layer.update()
    mw = o.matrix_world.copy(); o.parent = parent; o.matrix_world = mw

def add_hands(M, root):
    hr = ba.build_hand('R', M); hl = ba.build_hand('L', M)
    hr.parent = root; hl.parent = root
    return hr, hl

def finalize_meshes(objs):
    """原创件（手、全息瞄具）用世界盒式 UV + 凸边 wear 顶点色（JS 侧 pbr 材质）"""
    for o in objs:
        if o.type == 'MESH':
            for md in list(o.modifiers):
                bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=md.name)
            ba.box_uv_and_wear(o, 6.0)

def report(root, label):
    ms = [o for o in root.children_recursive if o.type == 'MESH']
    gun = [o for o in ms if o.data.materials and o.data.materials[0].name.startswith('G_')]
    print(f'TRIS {label}: gun {tris(gun)} / all {tris(ms)}', [(o.name, tris([o])) for o in gun])

def place(objs, off, root):
    for o in objs:
        o.location = o.location + off; o.parent = root

def build_rifle():
    ba.reset(); M = ba.gun_mats()
    new = objs_after_import(RIFLE_FBX)
    for o in new:
        if o.type == 'MESH': bake_world(o)
    keep = {}
    for o in new:
        n = o.name
        if o.type != 'MESH' or 'Carrying Handle' in n or n in ('Magazine Ammo', '5.56×45mm Bullet', '5.56×45mm Cartridge'):
            bpy.data.objects.remove(o, do_unlink=True); continue
        keep[n] = o
    body = keep['M16 A4']; mag = keep['M16 A4 Magazine']; shell = keep['5.56×45mm Fired Shell']
    R = Matrix.Rotation(math.pi, 4, 'Z')
    for o in (body, mag, shell): o.data.transform(R)
    ch = split_groups(body, {'Charging Handle', 'Charging Handle Lock'}, 'bolt')
    carrier = split_groups(body, {'Bolt'}, 'carrier')
    body.name = body.data.name = 'rifle_body'; mag.name = mag.data.name = 'mag'
    bv = verts_world(body)
    grip = [p for p in bv if -0.02 < p.y < 0.07 and -0.08 < p.z < 0.02]
    gmn, gmx = bbox(grip)
    gripR = Vector((0, (gmn.y + gmx.y) / 2, (gmn.z + gmx.z) / 2))
    hg = [p for p in bv if -0.36 < p.y < -0.30]
    hmn, hmx = bbox(hg)
    rail = [p for p in bv if -0.15 < p.y < -0.02 and abs(p.x) < 0.006]
    rmn, rmx = bbox(rail)
    muz = [p for p in bv if p.y < -0.66]
    mmn, mmx = bbox(muz)
    print('RIFLE grip bb', gmn, gmx, 'handguard bb', hmn, hmx, 'rail top', rmx.z, 'muzzle', mmn, mmx)
    smn, smx = bbox(verts_world(shell)); set_origin(shell, (smn + smx) / 2); shell.name = shell.data.name = 'shell_model'
    cmn, cmx = bbox(verts_world(ch)); set_origin(ch, (cmn + cmx) / 2)
    kmn, kmx = bbox(verts_world(carrier)); set_origin(carrier, (kmn + kmx) / 2)
    amn, amx = bbox(verts_world(mag)); set_origin(mag, Vector(((amn.x + amx.x) / 2, (amn.y + amx.y) / 2, amx.z)))
    mb = pbr_mat('G_rifle_body', f'{BUILD}/rifle_body_hi'); mm = pbr_mat('G_rifle_mag', f'{BUILD}/rifle_mag_hi')
    for o in (body, ch, carrier): o.data.materials.clear(); o.data.materials.append(mb)
    for o in (mag, shell): o.data.materials.clear(); o.data.materials.append(mm)
    for o in (body, ch, carrier, mag, shell):
        for p in o.data.polygons: p.use_smooth = True
    dot_body, lens, dotc = holo_sight(M, 0.0, -0.075, rmx.z)
    finalize_meshes([dot_body, lens])
    off = -gripR
    root = ba.empty('rifle', (0, 0, 0))
    place([body, ch, carrier, mag, shell, dot_body, lens], off, root)
    bpy.context.view_layer.update()
    hr, hl = add_hands(M, root)
    finalize_meshes([c for c in hr.children_recursive] + [c for c in hl.children_recursive])
    G = lambda v: Vector(v) + off
    mk_empty('muzzle', G((0, mmn.y - 0.005, (mmn.z + mmx.z) / 2)), root)
    mk_empty('eject', G((-0.02, -0.095, 0.08)), root)
    mk_empty('dot', G(dotc), root)
    mk_empty('sight', G(dotc), root)
    mk_empty('gripR', G(gripR), root)
    mk_empty('gripL', G((0, -0.33, hmn.z)), root)
    bpy.context.view_layer.update()
    mk_empty('magGrip', mag.matrix_world.translation + Vector((0, 0.01, -0.13)), mag)
    mk_empty('chGrip', ch.matrix_world.translation + Vector((0.0, 0.02, 0.0)), ch)
    report(root, 'rifle')
    return root

def build_shotgun():
    ba.reset(); M = ba.gun_mats()
    new = objs_after_import(SG_FBX)
    for o in new:
        if o.type == 'MESH': bake_world(o)
    for o in list(new):
        if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
    body = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    sf = objs_after_import(SHELL_FIRED); sl = objs_after_import(SHELL_LIVE)
    for o in sf + sl:
        if o.type == 'MESH': bake_world(o)
    shell = [o for o in sf if o.type == 'MESH'][0]; live = [o for o in sl if o.type == 'MESH'][0]
    for o in sf + sl:
        if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
    R = Matrix.Rotation(math.pi, 4, 'Z')
    body.data.transform(R)
    pump = split_groups(body, {'Fore-End'}, 'pump')
    sbolt = split_groups(body, {'Hammer/Ejector'}, 'sbolt')
    body.name = body.data.name = 'shotgun_body'
    bv = verts_world(body) + verts_world(pump)
    front = [p for p in bv if p.y < -0.955]
    fz = max(p.z for p in front); fy = min(p.y for p in front)
    rear = [p for p in bv if -0.30 < p.y < -0.12]
    rz = max(p.z for p in rear)
    ry = max(p.y for p in rear if p.z > rz - 0.002)
    ang = math.atan2(rz - fz, ry - fy)
    if abs(ang) < math.radians(0.3): ang = 0.0  # 机匣顶与准星珠已基本同高
    T = Matrix.Rotation(ang, 4, 'X')
    for o in (body, pump, sbolt): o.data.transform(T)
    bv = verts_world(body); pv = verts_world(pump)
    front = [p for p in bv if p.y < -0.955]; fz2 = max(p.z for p in front); fy = min(p.y for p in front)
    rear = [p for p in bv if -0.30 < p.y < -0.12]; rz2 = max(p.z for p in rear); ry = max(p.y for p in rear if p.z > rz2 - 0.002)
    print('SHOTGUN sight before', fz, rz, 'after', fz2, rz2, 'angle deg', math.degrees(ang))
    grip = [p for p in bv if -0.085 < p.y < -0.05]  # 枪托握颈（扳机护圈后方）
    gmn, gmx = bbox(grip)
    pmn, pmx = bbox(pv)
    print('SHOTGUN grip bb', gmn, gmx, 'pump bb', pmn, pmx)
    gripR = Vector((0, (gmn.y + gmx.y) / 2, (gmn.z + gmx.z) / 2))
    set_origin(pump, (pmn + pmx) / 2)
    bmn, bmx = bbox(verts_world(sbolt)); set_origin(sbolt, (bmn + bmx) / 2)
    for s, nm in ((shell, 'shell_model'), (live, 'shell_live')):
        smn, smx = bbox(verts_world(s)); set_origin(s, (smn + smx) / 2); s.name = s.data.name = nm
    ms = pbr_mat('G_shotgun', f'{BUILD}/shotgun_hi'); mshell = pbr_mat('G_shell', f'{BUILD}/shell_hi')
    for o in (body, pump, sbolt): o.data.materials.clear(); o.data.materials.append(ms)
    for o in (shell, live): o.data.materials.clear(); o.data.materials.append(mshell)
    for o in (body, pump, sbolt, shell, live):
        for p in o.data.polygons: p.use_smooth = True
    off = -gripR
    root = ba.empty('shotgun', (0, 0, 0))
    place([body, pump, shell, live, sbolt], off, root)
    bpy.context.view_layer.update()
    parent_keep(sbolt, pump)
    hr, hl = add_hands(M, root)
    finalize_meshes([c for c in hr.children_recursive] + [c for c in hl.children_recursive])
    G = lambda v: Vector(v) + off
    mk_empty('muzzle', G((0, fy - 0.004, fz2 - 0.012)), root)
    mk_empty('eject', G((-0.02, -0.22, 0.035)), root)
    mk_empty('sight', G((0, ry, rz2 + 0.002)), root)
    mk_empty('bead', G((0, fy + 0.01, fz2)), root)
    mk_empty('gripR', G(gripR), root)
    mk_empty('loadPort', G((0, -0.2, 0.0)), root)
    bpy.context.view_layer.update()
    mk_empty('gripL', G(Vector(((pmn.x + pmx.x) / 2, (pmn.y + pmx.y) / 2, pmn.z))), pump)
    report(root, 'shotgun')
    return root

def preview(root, path):
    """侧视检查图（Cycles 少采样，红点 = 锚点）"""
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 16; sc.cycles.device = 'CPU'
    sc.render.resolution_x = 1600; sc.render.resolution_y = 700
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.6, 0.6, 0.6, 1)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.5
    cam.location = (-2.0, -0.4, 0.0); cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
    marks = []
    for e in root.children_recursive:
        if e.type == 'EMPTY' and e.name in ('muzzle', 'eject', 'dot', 'sight', 'gripR', 'gripL', 'magGrip', 'chGrip', 'bead', 'loadPort'):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.007, location=e.matrix_world.translation)
            s = bpy.context.active_object; m = bpy.data.materials.new('mk'); m.use_nodes = True
            b = m.node_tree.nodes['Principled BSDF']; b.inputs['Emission Color'].default_value = (1, 0, 0, 1); b.inputs['Emission Strength'].default_value = 5
            s.data.materials.append(m); marks.append(s)
    hid = []
    for n in ('handR', 'handL'):
        h = bpy.data.objects.get(n)
        if h:
            for c in [h] + list(h.children_recursive): c.hide_render = True; hid.append(c)
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    for s in marks: bpy.data.objects.remove(s, do_unlink=True)
    for c in hid: c.hide_render = False

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    pv = '--preview' in args
    which = [a for a in args if a in ('rifle', 'shotgun')] or ['rifle', 'shotgun']
    for w in which:
        root = build_rifle() if w == 'rifle' else build_shotgun()
        if pv: preview(root, os.path.join(BUILD, f'{w}_side.png'))
        export(f'{w}.glb', root)
        retex('lo'); export(f'{w}_lo.glb', root); retex('hi')
    print('GUNS DONE')
