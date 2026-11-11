# 锈潮断链 · 港区小道具 / 招工横幅 / 华晨达货迹（作者：Jack · 原创建模）
# /home/box/blender/blender -b --factory-startup -P art/build_yard_props.py
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix, Euler

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models')
os.makedirs(OUT, exist_ok=True)
MATS = {}
SEGS = [2]

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True); MATS.clear()

def mat(name, col=(0.5, 0.5, 0.5), metal=0.0, rough=0.6):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.blend_method = 'OPAQUE'
    if hasattr(m, 'use_backface_culling'): m.use_backface_culling = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    MATS[name] = m; return m

def _finish(o, m, bevel, segs=None):
    o.data.materials.append(m)
    if bevel > 0:
        md = o.modifiers.new('bv', 'BEVEL'); md.width = bevel; md.segments = segs or SEGS[0]
        md.limit_method = 'ANGLE'; md.angle_limit = math.radians(40)
    return o

def box(name, size, loc, m, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, m, bevel)

def cyl(name, r, depth, loc, m, rot=(0, 0, 0), verts=12, bevel=0.0, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, vertices=verts, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name
    return _finish(o, m, bevel)

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

def set_uv_atlas(o, rect, flip_v=False, proj='auto'):
    """rect = (u0,v0,u1,v1) in 0-1 atlas space. Maps the dominant front faces to the full rect."""
    u0, v0, u1, v1 = rect
    if flip_v:
        v0, v1 = 1 - v0, 1 - v1
    me = o.data; bm = bmesh.new(); bm.from_mesh(me)
    uvl = bm.loops.layers.uv.verify()
    mw = o.matrix_world
    # bounds in local
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    minx, maxx, miny, maxy, minz, maxz = min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)
    for f in bm.faces:
        n = f.normal
        for l in f.loops:
            p = l.vert.co
            if abs(n.y) >= abs(n.x) and abs(n.y) >= abs(n.z):
                # face ±Y (front/back after?); use XZ
                uu = (p.x - minx) / max(1e-6, maxx - minx)
                vv = (p.z - minz) / max(1e-6, maxz - minz)
            elif abs(n.x) >= abs(n.z):
                uu = (p.y - miny) / max(1e-6, maxy - miny)
                vv = (p.z - minz) / max(1e-6, maxz - minz)
            else:
                uu = (p.x - minx) / max(1e-6, maxx - minx)
                vv = (p.y - miny) / max(1e-6, maxy - miny)
            l[uvl].uv = (u0 + (1.0 - uu) * (u1 - u0), v0 + vv * (v1 - v0))
    bm.to_mesh(me); bm.free()

def export(path, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
        for c in o.children_recursive: c.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_texcoords=True, export_normals=True,
        export_vertex_color='ACTIVE', export_all_vertex_colors=True, export_materials='EXPORT', export_animations=False)
    print('exported', path, os.path.getsize(os.path.join(OUT, path)))

# materials
def M():
    return dict(
        wood=mat('M_yp_wood', (0.45, 0.32, 0.18), 0.0, 0.75),
        card=mat('M_yp_card', (0.62, 0.5, 0.32), 0.0, 0.85),
        steel=mat('M_yp_steel', (0.4, 0.4, 0.42), 0.7, 0.4),
        paint=mat('M_yp_paint', (0.55, 0.52, 0.48), 0.2, 0.5),
        rubber=mat('M_yp_rubber', (0.08, 0.08, 0.08), 0.0, 0.85),
        conc=mat('M_yp_conc', (0.48, 0.47, 0.44), 0.0, 0.9),
        plas=mat('M_yp_plas', (0.2, 0.32, 0.28), 0.0, 0.55),
        orange=mat('M_yp_orange', (0.72, 0.38, 0.1), 0.15, 0.5),
        yellow=mat('M_yp_yellow', (0.78, 0.62, 0.12), 0.1, 0.5),
        navy=mat('M_yp_navy', (0.14, 0.26, 0.36), 0.15, 0.5),
        red=mat('M_yp_red', (0.55, 0.1, 0.1), 0.1, 0.5),
        glass=mat('M_yp_glass', (0.15, 0.2, 0.22), 0.0, 0.08),
        dark=mat('M_yp_dark', (0.08, 0.08, 0.09), 0.4, 0.5),
        decal=mat('M_yp_decal', (1, 1, 1), 0.0, 0.65),
        hazard=mat('M_yp_hazard', (0.75, 0.62, 0.1), 0.1, 0.45),
    )

def mk_pallet(m, worn=False):
    P = []
    # ISO-ish 1.20 x 1.00 x 0.144, boards along Y
    for i, y in enumerate((-0.46, -0.23, 0, 0.23, 0.46)):
        P.append(box('str', (1.2, 0.1, 0.08), (0, y, 0.04), m['wood'], 0.002))
    for i in range(7):
        x = -0.56 + i * 0.186
        z = 0.122
        sy = 1.0 if not (worn and i in (0, 6)) else 0.92
        P.append(box('deck', (0.1, sy, 0.022), (x, 0 if not (worn and i == 0) else 0.02, z), m['wood'], 0.001))
    # bottom boards
    for y in (-0.42, 0, 0.42):
        P.append(box('bot', (1.16, 0.1, 0.018), (0, y, 0.01), m['wood'], 0.001))
    return join(P, 'pallet_worn' if worn else 'pallet')

def mk_stack(m):
    P = []
    for k in range(5):
        dy = (k % 2) * 0.03
        dx = (k % 3 - 1) * 0.015
        z = 0.144 * k
        for i, y in enumerate((-0.46, -0.23, 0, 0.23, 0.46)):
            P.append(box('s', (1.2, 0.1, 0.08), (dx, y + dy, z + 0.04), m['wood'], 0.002))
        for i in range(7):
            x = -0.56 + i * 0.186 + dx
            P.append(box('d', (0.1, 1.0, 0.022), (x, dy, z + 0.122), m['wood'], 0.001))
    return join(P, 'pallet_stack')

def mk_forklift(m):
    # origin ground, forks toward +Y (glTF -Z)
    P = []
    # body / counterweight
    P.append(box('body', (1.12, 1.55, 0.85), (0, -0.15, 0.72), m['orange'], 0.02))
    P.append(box('cwt', (1.14, 0.55, 0.95), (0, -1.05, 0.62), m['dark'], 0.03))
    P.append(box('belly', (1.0, 1.3, 0.22), (0, -0.2, 0.28), m['dark'], 0.01))
    # overhead guard
    for sx in (-0.48, 0.48):
        P.append(box('leg', (0.06, 0.06, 1.15), (sx, 0.35, 1.55), m['steel'], 0.004))
        P.append(box('legb', (0.06, 0.06, 1.0), (sx, -0.7, 1.48), m['steel'], 0.004))
    P.append(box('roof', (1.14, 1.25, 0.05), (0, -0.15, 2.14), m['steel'], 0.004))
    for i in range(4):
        P.append(box('rbar', (0.03, 1.15, 0.02), (-0.4 + i * 0.27, -0.15, 2.18), m['steel']))
    # seat + column
    P.append(box('seat', (0.42, 0.38, 0.12), (0, -0.35, 1.2), m['rubber'], 0.01))
    P.append(box('back', (0.42, 0.08, 0.38), (0, -0.52, 1.42), m['rubber'], 0.01))
    P.append(cyl('col', 0.03, 0.7, (0, 0.15, 1.15), m['steel'], verts=8))
    P.append(cyl('wheel', 0.12, 0.04, (0, 0.15, 1.52), m['rubber'], rot=(math.radians(90), 0, 0), verts=10))
    # mast
    for sx in (-0.28, 0.28):
        P.append(box('mast', (0.07, 0.12, 2.05), (sx, 0.85, 1.15), m['steel'], 0.004))
        P.append(box('mast2', (0.05, 0.1, 1.85), (sx, 0.95, 1.1), m['yellow'], 0.003))
    P.append(box('car', (0.95, 0.08, 0.7), (0, 1.08, 0.7), m['steel'], 0.006))
    P.append(box('rest', (0.9, 0.04, 0.85), (0, 1.14, 1.15), m['steel'], 0.004))
    # forks
    for sx in (-0.22, 0.22):
        P.append(box('fork', (0.1, 1.15, 0.045), (sx, 1.68, 0.12), m['steel'], 0.003))
        P.append(box('forkup', (0.1, 0.06, 0.55), (sx, 1.12, 0.38), m['steel'], 0.003))
    # rams
    P.append(cyl('ram', 0.04, 1.1, (0, 0.9, 1.1), m['steel'], verts=8))
    # tires: front larger
    for sx in (-0.5, 0.5):
        P.append(cyl('tf', 0.28, 0.18, (sx, 0.55, 0.28), m['rubber'], rot=(0, math.radians(90), 0), verts=12))
        P.append(cyl('hubf', 0.1, 0.2, (sx, 0.55, 0.28), m['steel'], rot=(0, math.radians(90), 0), verts=8))
        P.append(cyl('tr', 0.22, 0.16, (sx, -0.85, 0.22), m['rubber'], rot=(0, math.radians(90), 0), verts=12))
        P.append(cyl('hubr', 0.08, 0.18, (sx, -0.85, 0.22), m['steel'], rot=(0, math.radians(90), 0), verts=8))
    # lights
    for sx in (-0.35, 0.35):
        P.append(box('hl', (0.1, 0.06, 0.08), (sx, 0.65, 1.15), m['yellow'], 0.004))
    P.append(box('step', (0.25, 0.35, 0.08), (0.55, -0.1, 0.55), m['steel'], 0.004))
    return join(P, 'forklift')

def mk_drum(m, plastic=False):
    matl = m['plas'] if plastic else m['steel']
    P = [cyl('body', 0.292, 0.82, (0, 0, 0.45), matl, verts=16, bevel=0.004)]
    for z in (0.14, 0.45, 0.76):
        P.append(cyl('ring', 0.3, 0.03, (0, 0, z), m['dark'] if not plastic else matl, verts=16))
    P.append(cyl('top', 0.292, 0.02, (0, 0, 0.87), matl, verts=16))
    P.append(cyl('bung', 0.03, 0.03, (0.1, 0, 0.89), m['dark'], verts=8))
    return join(P, 'drum_plas' if plastic else 'drum')

def mk_ibc(m):
    P = []
    # tank on a pallet footprint
    P.append(box('tank', (1.1, 0.9, 0.95), (0, 0, 0.66), m['plas'], 0.02))
    P.append(box('cage', (1.16, 0.96, 0.04), (0, 0, 0.2), m['steel']))
    for sx in (-0.54, 0.54):
        P.append(box('cp', (0.03, 0.96, 1.0), (sx, 0, 0.7), m['steel']))
    for sy in (-0.45, 0.45):
        P.append(box('cq', (1.16, 0.03, 1.0), (0, sy, 0.7), m['steel']))
    P.append(cyl('cap', 0.08, 0.06, (0, 0, 1.16), m['dark'], verts=10))
    P.append(cyl('valve', 0.03, 0.1, (0, 0.4, 0.3), m['steel'], rot=(math.radians(90), 0, 0), verts=8))
    # mini pallet
    P.append(box('base', (1.2, 1.0, 0.12), (0, 0, 0.06), m['wood'], 0.002))
    return join(P, 'ibc')

def mk_carton(m):
    P = [box('box', (0.62, 0.42, 0.38), (0, 0, 0.19), m['card'], 0.002)]
    P.append(box('tape', (0.63, 0.04, 0.39), (0, 0, 0.19), m['yellow']))
    return join(P, 'carton')

def mk_crate(m):
    P = [box('bot', (0.9, 0.7, 0.05), (0, 0, 0.03), m['wood'], 0.002)]
    for sx in (-0.42, 0.42):
        P.append(box('s', (0.04, 0.7, 0.55), (sx, 0, 0.32), m['wood'], 0.002))
    for sy in (-0.33, 0.33):
        P.append(box('s2', (0.9, 0.04, 0.55), (0, sy, 0.32), m['wood'], 0.002))
    for z in (0.18, 0.34, 0.5):
        P.append(box('slat', (0.86, 0.66, 0.03), (0, 0, z), m['wood']))
    return join(P, 'crate')

def mk_cone(m):
    P = [cyl('c', 0.2, 0.72, (0, 0, 0.4), m['orange'], verts=12, r2=0.04)]
    P.append(cyl('base', 0.22, 0.04, (0, 0, 0.02), m['dark'], verts=12))
    P.append(cyl('ring', 0.14, 0.06, (0, 0, 0.42), m['paint'], verts=12, r2=0.11))
    return join(P, 'cone')

def mk_impact(m):
    P = [cyl('b', 0.3, 0.95, (0, 0, 0.5), m['yellow'], verts=14)]
    for i, z in enumerate((0.22, 0.42, 0.62, 0.82)):
        P.append(cyl('s', 0.305, 0.08, (0, 0, z), m['dark'] if i % 2 == 0 else m['yellow'], verts=14))
    P.append(cyl('lid', 0.3, 0.04, (0, 0, 0.98), m['dark'], verts=14))
    return join(P, 'impact')

def mk_bollard(m):
    P = [cyl('p', 0.08, 0.85, (0, 0, 0.45), m['yellow'], verts=10)]
    P.append(cyl('base', 0.16, 0.08, (0, 0, 0.04), m['dark'], verts=10))
    for z in (0.25, 0.5, 0.75):
        P.append(cyl('r', 0.085, 0.07, (0, 0, z), m['dark'], verts=10))
    return join(P, 'bollard')

def mk_fence(m):
    P = []
    for x in (-1.2, 1.2):
        P.append(box('post', (0.07, 0.07, 2.05), (x, 0, 1.05), m['steel'], 0.003))
    for z in (0.15, 1.0, 1.9):
        P.append(box('rail', (2.4, 0.03, 0.03), (0, 0, z), m['steel']))
    # wire grid (coarse)
    for i in range(-4, 5):
        P.append(box('v', (0.012, 0.012, 1.75), (i * 0.24, 0, 1.05), m['steel']))
    for z in (0.4, 0.7, 1.3, 1.6):
        P.append(box('h', (2.3, 0.012, 0.012), (0, 0, z), m['steel']))
    return join(P, 'fence')

def mk_booth(m):
    P = []
    P.append(box('floor', (2.4, 2.4, 0.1), (0, 0, 0.05), m['conc'], 0.01))
    # walls with window holes approximated by frames
    P.append(box('back', (2.4, 0.1, 2.2), (0, 1.15, 1.2), m['paint'], 0.01))
    P.append(box('left', (0.1, 2.4, 2.2), (-1.15, 0, 1.2), m['paint'], 0.01))
    P.append(box('right', (0.1, 2.4, 2.2), (1.15, 0, 1.2), m['paint'], 0.01))
    # front: door gap + sides
    P.append(box('fl', (0.7, 0.1, 2.2), (-0.85, -1.15, 1.2), m['paint'], 0.01))
    P.append(box('fr', (0.7, 0.1, 2.2), (0.85, -1.15, 1.2), m['paint'], 0.01))
    P.append(box('flintel', (0.9, 0.1, 0.5), (0, -1.15, 2.05), m['paint'], 0.01))
    P.append(box('door', (0.8, 0.05, 1.7), (0, -1.12, 0.95), m['dark'], 0.004))
    P.append(box('roof', (2.6, 2.6, 0.12), (0, 0, 2.4), m['steel'], 0.01))
    P.append(box('eave', (2.7, 2.7, 0.06), (0, 0, 2.32), m['dark'], 0.004))
    # windows
    for (x, y, ry) in ((-1.16, 0, 0), (1.16, 0, 0), (0, 1.16, 0)):
        P.append(box('win', (0.04 if abs(x) > 0.5 else 0.9, 0.9 if abs(x) > 0.5 else 0.04, 0.6), (x, y, 1.55), m['glass'], 0.002))
    P.append(box('sill', (0.08, 0.08, 0.9), (-1.2, -1.16, 1.1), m['steel']))
    return join(P, 'booth')

def mk_reefer(m):
    # 2.2 W x 0.46 D x 2.2 H, sits on container end; depth along Y
    P = [box('hous', (2.18, 0.42, 2.15), (0, 0, 1.1), m['paint'], 0.01)]
    P.append(box('grille', (1.6, 0.04, 0.9), (0, -0.22, 1.4), m['dark'], 0.002))
    for i in range(8):
        P.append(box('sl', (1.5, 0.01, 0.04), (0, -0.24, 1.05 + i * 0.09), m['steel']))
    P.append(cyl('fan', 0.28, 0.06, (0.65, -0.22, 0.55), m['dark'], rot=(math.radians(90), 0, 0), verts=12))
    P.append(cyl('fan2', 0.22, 0.02, (0.65, -0.25, 0.55), m['steel'], rot=(math.radians(90), 0, 0), verts=10))
    P.append(box('door', (0.7, 0.04, 1.1), (-0.6, -0.22, 0.7), m['steel'], 0.004))
    P.append(box('pipe', (0.08, 0.08, 0.7), (0.9, 0.1, 1.8), m['steel'], 0.004))
    P.append(cyl('tank', 0.12, 0.7, (0.95, 0.05, 0.45), m['steel'], rot=(math.radians(90), 0, 0), verts=10))
    return join(P, 'reefer')

def mk_reel(m):
    P = [cyl('drum', 0.18, 0.55, (0, 0, 0.7), m['dark'], rot=(0, math.radians(90), 0), verts=12)]
    for sx in (-0.3, 0.3):
        P.append(cyl('flange', 0.6, 0.04, (sx, 0, 0.7), m['steel'], rot=(0, math.radians(90), 0), verts=14))
    P.append(cyl('ax', 0.05, 0.7, (0, 0, 0.7), m['steel'], rot=(0, math.radians(90), 0), verts=8))
    P.append(box('stand', (0.7, 0.4, 0.12), (0, 0, 0.08), m['steel'], 0.006))
    P.append(cyl('cable', 0.48, 0.5, (0, 0, 0.7), m['rubber'], rot=(0, math.radians(90), 0), verts=12))
    return join(P, 'reel')

def mk_jack(m):
    P = []
    for sx in (-0.22, 0.22):
        P.append(box('fk', (0.1, 1.15, 0.05), (sx, 0.35, 0.07), m['steel'], 0.003))
    P.append(box('cross', (0.55, 0.12, 0.1), (0, -0.25, 0.1), m['steel'], 0.004))
    P.append(box('body', (0.4, 0.25, 0.28), (0, -0.4, 0.22), m['orange'], 0.006))
    P.append(cyl('till', 0.02, 0.95, (0, -0.7, 0.7), m['steel'], rot=(math.radians(55), 0, 0), verts=8))
    P.append(box('hdl', (0.32, 0.04, 0.04), (0, -1.05, 1.05), m['rubber'], 0.003))
    P.append(cyl('whl', 0.07, 0.08, (0, -0.45, 0.07), m['rubber'], rot=(0, math.radians(90), 0), verts=8))
    return join(P, 'jack')

def mk_tire(m):
    P = [cyl('t', 0.35, 0.22, (0, 0, 0.35), m['rubber'], verts=14)]
    P.append(cyl('rim', 0.18, 0.24, (0, 0, 0.35), m['steel'], verts=12))
    return join(P, 'tire')

def mk_firebox(m):
    P = [box('cab', (0.7, 0.28, 0.9), (0, 0, 0.55), m['red'], 0.008)]
    P.append(box('door', (0.62, 0.04, 0.8), (0, -0.15, 0.55), m['red'], 0.004))
    P.append(box('post', (0.06, 0.06, 0.2), (0, 0, 0.08), m['steel']))
    return join(P, 'firebox')

def mk_dumpster(m):
    P = [box('bin', (1.6, 0.9, 1.0), (0, 0, 0.55), m['steel'], 0.015)]
    P.append(box('lid', (1.64, 0.94, 0.06), (0, 0, 1.08), m['dark'], 0.006))
    P.append(box('lid2', (0.7, 0.94, 0.06), (0.4, 0, 1.1), m['dark'], rot=(0, math.radians(-12), 0)))
    for sx in (-0.7, 0.7):
        P.append(cyl('w', 0.1, 0.12, (sx, 0.4, 0.1), m['rubber'], rot=(0, math.radians(90), 0), verts=8))
    return join(P, 'dumpster')

def mk_planks(m):
    P = []
    for k in range(8):
        P.append(box('p', (1.2, 0.18, 0.04), (0.01 * (k % 3), 0.01 * (k % 2), 0.03 + k * 0.045), m['wood'], 0.001))
    return join(P, 'planks')

def mk_block(m):
    return join([box('b', (0.8, 0.4, 0.6), (0, 0, 0.3), m['conc'], 0.01)], 'block')

def mk_rack(m):
    # one bay 2.4m wide, 1.0 deep, 3.2 high, 3 shelves
    P = []
    for sx in (-1.15, 1.15):
        for sy in (-0.45, 0.45):
            P.append(box('up', (0.06, 0.06, 3.2), (sx, sy, 1.6), m['steel'], 0.003))
    for z in (0.15, 1.15, 2.15, 3.1):
        P.append(box('beam', (2.36, 0.06, 0.08), (0, -0.45, z), m['orange'], 0.003))
        P.append(box('beamb', (2.36, 0.06, 0.08), (0, 0.45, z), m['orange'], 0.003))
        P.append(box('deck', (2.3, 0.9, 0.03), (0, 0, z + 0.06), m['wood'] if z > 0.2 else m['steel'], 0.002))
    return join(P, 'rack')

def mk_bench(m):
    P = [box('top', (1.8, 0.7, 0.06), (0, 0, 0.9), m['wood'], 0.004)]
    for sx in (-0.8, 0.8):
        for sy in (-0.28, 0.28):
            P.append(box('leg', (0.07, 0.07, 0.9), (sx, sy, 0.45), m['steel'], 0.003))
    P.append(box('vice', (0.25, 0.2, 0.16), (0.7, 0.2, 0.98), m['steel'], 0.006))
    P.append(box('shelf', (1.7, 0.6, 0.04), (0, 0, 0.3), m['wood'], 0.002))
    return join(P, 'bench')

def mk_pipes(m):
    P = []
    P.append(cyl('m', 0.06, 3.2, (0, 0, 0), m['steel'], rot=(0, math.radians(90), 0), verts=8))
    P.append(cyl('v', 0.05, 1.2, (1.4, 0, -0.5), m['steel'], verts=8))
    P.append(cyl('el', 0.06, 0.2, (1.4, 0, 0), m['dark'], verts=8))
    P.append(box('val', (0.14, 0.14, 0.18), (0.4, 0, 0.12), m['dark'], 0.004))
    P.append(cyl('m2', 0.04, 2.4, (0, 0.2, 0.15), m['paint'], rot=(0, math.radians(90), 0), verts=8))
    return join(P, 'pipes')

def mk_elec(m):
    P = [box('box', (0.55, 0.22, 0.75), (0, 0, 0.4), m['paint'], 0.006)]
    P.append(box('door', (0.5, 0.04, 0.68), (0, -0.12, 0.4), m['paint'], 0.003))
    P.append(box('lugs', (0.12, 0.08, 0.2), (0, -0.16, 0.5), m['dark']))
    return join(P, 'elecbox')

def mk_banner(m, name, sag=0.1, with_poles=True):
    # cloth 5.2 x 0.82, hangs in X, faces -Y, sag in Z and Y
    w, h, cols, rows = 5.2, 0.82, 14, 4
    hang = 2.45  # 布面中心离地，杆立在 z=0
    me = bpy.data.meshes.new(name + '_m')
    bm = bmesh.new()
    vs = []
    for j in range(rows + 1):
        v = j / rows
        row = []
        for i in range(cols + 1):
            u = i / cols
            x = (u - 0.5) * w
            s = 1 - math.cos((u - 0.5) * math.pi)
            y = -s * sag * 0.45
            z = hang - s * sag + (v - 0.5) * h
            row.append(bm.verts.new((x, y, z)))
        vs.append(row)
    for j in range(rows):
        for i in range(cols):
            bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    # thickness: solidify slightly by a second sheet
    bm.normal_update()
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.012)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # uvs 0-1 (caller remaps)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            p = l.vert.co
            uu = (p.x / w) + 0.5
            vv = (p.z / h) + 0.5
            l[uvl].uv = (uu, vv)
    bm.to_mesh(me); bm.free()
    cloth = bpy.data.objects.new(name + '_c', me)
    bpy.context.collection.objects.link(cloth)
    cloth.data.materials.append(m['decal'])
    P = [cloth]
    if with_poles:
        for sx in (-2.7, 2.7):
            P.append(cyl('pole', 0.035, 3.2, (sx, 0.02, 1.6), m['steel'], verts=8))
            # ropes from cloth corners to pole
            P.append(cyl('rope', 0.008, 0.35, (sx * 0.98, -0.02, hang + 0.38), m['rubber'], rot=(math.radians(55), 0, 0), verts=6))
            P.append(cyl('rope2', 0.008, 0.35, (sx * 0.98, -0.02, hang - 0.38), m['rubber'], rot=(math.radians(125), 0, 0), verts=6))
    o = join(P, name)
    return o

def remap_banner_uv(o, row):
    # atlas: row 0,1,2 at v = [0,256,512]/2048, height 256
    v0 = row * 256 / 2048
    v1 = (row + 1) * 256 / 2048
    # blender V often exported flipped; set_uv on existing 0-1
    me = o.data; bm = bmesh.new(); bm.from_mesh(me)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            u, v = l[uvl].uv
            # only cloth faces that were 0-1; poles will also get remapped — keep poles on unused dark area or leave
            if 0 <= u <= 1 and 0 <= v <= 1:
                l[uvl].uv = (1.0 - u, 1 - (v0 + v * (v1 - v0)))
    bm.to_mesh(me); bm.free()

def mk_decal_plane(name, size, m, rect):
    # size = (sx, sy, sz) thin in Y
    o = box(name, size, (0, 0, 0), m['decal'], 0.0)
    set_uv_atlas(o, rect, flip_v=False)
    return o

def mk_plate(m, small=False):
    if small:
        o = box('plate_s', (0.42, 0.03, 0.42), (0, 0, 0), m['decal'])
        set_uv_atlas(o, (1024/2048, 768/2048, 1280/2048, 1024/2048))
        return join([o, box('frm', (0.44, 0.02, 0.44), (0, 0.01, 0), m['steel'])], 'plate_s')
    o = box('plate', (1.1, 0.03, 0.32), (0, 0, 0), m['decal'])
    set_uv_atlas(o, (0, 768/2048, 1024/2048, 1024/2048))
    return join([o, box('frm', (1.14, 0.02, 0.36), (0, 0.01, 0), m['steel'])], 'plate')

def mk_truck(m):
    # cab + box, length along Y, origin ground mid
    P = []
    P.append(box('cab', (2.2, 1.5, 1.5), (0, 1.6, 1.15), m['navy'], 0.03))
    P.append(box('wind', (2.05, 0.08, 0.7), (0, 2.35, 1.55), m['glass'], 0.004, rot=(math.radians(-15), 0, 0)))
    P.append(box('hood', (2.15, 0.9, 0.7), (0, 2.55, 0.75), m['navy'], 0.02))
    P.append(box('cargo', (2.28, 4.2, 2.3), (0, -1.2, 1.45), m['navy'], 0.02))
    P.append(box('rail', (2.32, 4.24, 0.08), (0, -1.2, 0.35), m['steel']))
    for sx in (-0.9, 0.9):
        for y in (2.2, 1.0, -0.4, -2.4):
            rr = 0.38 if y > 1.5 or y < -2 else 0.42
            P.append(cyl('wh', rr, 0.28, (sx, y, rr), m['rubber'], rot=(0, math.radians(90), 0), verts=12))
    P.append(box('bump', (2.2, 0.2, 0.25), (0, 3.05, 0.4), m['dark'], 0.01))
    return join(P, 'truck')

def mk_signboard(m, name):
    P = [box('board', (1.8, 0.05, 0.5), (0, 0, 0), m['decal'])]
    P.append(box('post', (0.07, 0.07, 2.0), (0, 0.05, -0.9), m['steel'], 0.004))
    o = join(P, name)
    return o

def build():
    reset()
    m = M()
    objs = []
    pallet = mk_pallet(m, False); objs.append(pallet)
    pallet_w = mk_pallet(m, True); pallet_w.location.x = 3; objs.append(pallet_w)
    stack = mk_stack(m); stack.location.x = 6; objs.append(stack)
    fl = mk_forklift(m); fl.location.x = 10; objs.append(fl)
    drum = mk_drum(m, False); drum.location.x = 14; objs.append(drum)
    dplas = mk_drum(m, True); dplas.location.x = 15; objs.append(dplas)
    ibc = mk_ibc(m); ibc.location.x = 17; objs.append(ibc)
    carton = mk_carton(m); carton.location.x = 19; objs.append(carton)
    crate = mk_crate(m); crate.location.x = 21; objs.append(crate)
    cone = mk_cone(m); cone.location.x = 23; objs.append(cone)
    impact = mk_impact(m); impact.location.x = 24; objs.append(impact)
    bollard = mk_bollard(m); bollard.location.x = 25; objs.append(bollard)
    fence = mk_fence(m); fence.location.x = 28; objs.append(fence)
    booth = mk_booth(m); booth.location.x = 32; objs.append(booth)
    reefer = mk_reefer(m); reefer.location.x = 36; objs.append(reefer)
    reel = mk_reel(m); reel.location.x = 39; objs.append(reel)
    jack = mk_jack(m); jack.location.x = 41; objs.append(jack)
    tire = mk_tire(m); tire.location.x = 43; objs.append(tire)
    firebox = mk_firebox(m); firebox.location.x = 44; objs.append(firebox)
    dumpster = mk_dumpster(m); dumpster.location.x = 46; objs.append(dumpster)
    planks = mk_planks(m); planks.location.x = 49; objs.append(planks)
    block = mk_block(m); block.location.x = 51; objs.append(block)
    rack = mk_rack(m); rack.location.x = 54; objs.append(rack)
    bench = mk_bench(m); bench.location.x = 58; objs.append(bench)
    pipes = mk_pipes(m); pipes.location.x = 61; objs.append(pipes)
    elec = mk_elec(m); elec.location.x = 64; objs.append(elec)
    # banners with poles / wall
    for i, poles in ((0, True), (1, True), (2, False)):
        b = mk_banner(m, 'banner' + str(i), sag=0.1 + i * 0.02, with_poles=poles)
        b.location.x = 68 + i * 6
        # lift so origin is at mid cloth; poles go down
        remap_banner_uv(b, i)
        objs.append(b)
    plate = mk_plate(m, False); plate.location.x = 88; objs.append(plate)
    plate_s = mk_plate(m, True); plate_s.location.x = 90; objs.append(plate_s)
    # decal planes for containers / crates / truck / signs
    # atlas rects (u0,v0,u1,v1) in image space top-left origin? set_uv_atlas uses v0 bottom if flip
    # Our atlas y=1024-1536 is HCD side. In image coords y down from top: 1024/2048=0.5 to 1536/2048=0.75
    d_side = mk_decal_plane('hcd_side', (6.0, 0.02, 1.55), m, (0, 1024/2048, 1536/2048, 1536/2048)); d_side.location.x = 92; objs.append(d_side)
    d_door = mk_decal_plane('hcd_door', (0.02, 1.9, 1.9), m, (1536/2048, 1024/2048, 1, 1536/2048)); d_door.location.x = 96; objs.append(d_door)
    d_crate = mk_decal_plane('hcd_crate', (0.85, 0.02, 0.28), m, (0, 1536/2048, 1024/2048, 1792/2048)); d_crate.location.x = 98; objs.append(d_crate)
    d_truck = mk_decal_plane('hcd_truck', (0.02, 3.6, 1.2), m, (1024/2048, 1536/2048, 1, 1792/2048)); d_truck.location.x = 100; objs.append(d_truck)
    sign_a = mk_signboard(m, 'sign_hcd_a'); set_uv_atlas(sign_a, (0, 1792/2048, 1024/2048, 1)); sign_a.location.x = 104; objs.append(sign_a)
    sign_b = mk_signboard(m, 'sign_hcd_b'); set_uv_atlas(sign_b, (1024/2048, 1792/2048, 1, 1)); sign_b.location.x = 107; objs.append(sign_b)
    truck = mk_truck(m); truck.location.x = 112; objs.append(truck)

    bpy.context.view_layer.update()
    for o in objs:
        if o.type == 'MESH' and not o.name.startswith('banner') and not o.name.startswith('hcd_') and not o.name.startswith('sign_') and o.name not in ('plate', 'plate_s'):
            box_uv_and_wear(o, 1.0)
    export('yardprops.glb', objs)
    print('YARD PROPS DONE', len(objs))

if __name__ == '__main__':
    build()
