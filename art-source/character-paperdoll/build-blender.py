"""A7 (A6 + corpo contínuo, IK, andar novo): camponês adulto (proporção real) -> pixel art 96x96, 8 direções, camadas separadas.
Render em 4x (384) no Workbench (id de material + normal/profundidade por cor de vértice), luz própria em numpy
(chave quente + preenchimento frio + oclusão por profundidade), redução por bloco 4x4 (material dominante),
4-5 tons por material com agrupamento, paleta única, contorno 1 px marrom escuro, alfa binário.
Rodar: timeout 300 blender -b --factory-startup -P script.py
Env: ANIMS=parado,andar,golpear  DIRS=S,SE,...  FMAX=n  CHECK=1 (só mede extensão)  TAG=nome  OUTSUB=frames
"""
import bpy
import bmesh
import math
import os
import json
import time
import sys
import numpy as np
from mathutils import Vector, Matrix, Euler
from bpy_extras.object_utils import world_to_camera_view

T0 = time.time()
OUT = "/home/rafael/clareira-evidencias/2026-11-17-character-teste-camadas/A7-blender"
FR = os.environ["OUTABS"] if os.environ.get("OUTABS") else os.path.join(OUT, os.environ.get("OUTSUB", "frames"))
os.makedirs(FR, exist_ok=True)
TAG = os.environ.get("TAG", "run")
TMP = os.path.join(OUT, "_tmp_%s.png" % TAG)
CHECK = os.environ.get("CHECK") == "1"
TILE, SS = 96, 4
RES = TILE * SS
PIVOT = (48, 84)
ANIMS_ALL = {"parado": 4, "andar": 8, "golpear": 8}
ANIMS = {k: ANIMS_ALL[k] for k in os.environ.get("ANIMS", "parado,andar,golpear").split(",")}
FMAX = int(os.environ.get("FMAX", "99"))
GAME_DIRS = ["S", "SE", "L", "NE", "N", "NO", "O", "SO"]
DIR_SCREEN = {"S": (0, 1), "SE": (1, 1), "L": (1, 0), "NE": (1, -1), "N": (0, -1), "NO": (-1, -1),
              "O": (-1, 0), "SO": (-1, 1)}
DIRS = os.environ.get("DIRS", ",".join(GAME_DIRS)).split(",")

# ------------------------------------------------------------------ paleta (tons claro -> escuro)
COOL = np.array((42, 51, 69), float)   # #2a3345
WARM = np.array((255, 214, 160), float)


def ramp(cols, cool=None):
    cols = [np.array(c, float) for c in cols]
    n = len(cols)
    out = []
    for i, c in enumerate(cols):
        t = i / max(1, n - 1)
        c = c * (1 - 0.05 * (1 - t) ** 2) + WARM * 0.05 * (1 - t) ** 2 if i == 0 else c
        a = (cool if cool is not None else 0.22) * t ** 1.6
        c = c * (1 - a) + COOL * a
        out.append(tuple(int(round(v)) for v in np.clip(c, 0, 255)))
    return out


OUTLINE = (30, 19, 17)
INNER = (56, 40, 33)     # linhas internas 1 px, marrom escuro
BOTA_R = [(138, 100, 69), (107, 74, 53), (82, 56, 43), (58, 40, 35), (40, 29, 30)]
STEEL = [(176, 184, 192), (136, 146, 158), (98, 108, 124), (66, 75, 92)]
PELE_R = [(224, 172, 132), (201, 146, 114), (176, 122, 98), (146, 98, 82), (112, 76, 68)]
LINHO_R = [(222, 209, 184), (203, 187, 160), (166, 152, 132), (122, 112, 102)]
MATS = {
    # r = tons do mais claro ao mais escuro; w = peso na redução 4x4; dith = tremor Bayer; bias = sobe/desce o tom; ao = força da oclusão
    "pele":   dict(r=PELE_R, layer="corpo", w=1.0, dith=0.02, bias=0.0, ao=0.35),
    "cabelo": dict(r=[(98, 74, 56), (72, 53, 42), (52, 38, 34), (36, 27, 26)], layer="corpo", w=1.35, dith=0.03, bias=0.0, ao=0.6),
    "barba":  dict(r=[(98, 74, 56), (72, 53, 42), (52, 38, 34), (36, 27, 26)], layer="corpo", w=1.9, dith=0.03, bias=0.0, ao=0.6),
    "sobr":   dict(r=[(72, 53, 42), (52, 38, 34)], layer="corpo", w=2.6, dith=0.0, bias=0.0, ao=0.0),
    "iris":   dict(r=[(46, 40, 48)], layer="corpo", w=3.4, dith=0.0, bias=0.0, ao=0.0),
    "olhob":  dict(r=[LINHO_R[1]], layer="corpo", w=2.8, dith=0.0, bias=0.0, ao=0.0),
    "boca":   dict(r=[PELE_R[3]], layer="corpo", w=3.6, dith=0.0, bias=0.0, ao=0.0),
    "tunica": dict(r=[(100, 103, 72), (82, 85, 59), (66, 69, 48), (52, 54, 40), (39, 41, 32)], layer="tunica", w=1.0, dith=0.05, bias=0.04, ao=1.0),
    "linho":  dict(r=LINHO_R, layer="tunica", w=1.0, dith=0.04, bias=0.10, ao=1.0),
    "couro":  dict(r=BOTA_R[:4], layer="tunica", w=1.15, dith=0.03, bias=0.0, ao=1.0),
    "fivela": dict(r=STEEL, layer="tunica", w=1.3, dith=0.0, bias=0.0, ao=1.0),
    "calca":  dict(r=[(96, 85, 71), (76, 67, 56), (59, 52, 45), (44, 39, 36)], layer="calca_botas", w=1.0, dith=0.05, bias=-0.07, ao=1.0),
    "bota":   dict(r=BOTA_R, layer="calca_botas", w=1.0, dith=0.03, bias=0.0, ao=1.0),
    "sola":   dict(r=[BOTA_R[3], BOTA_R[4], BOTA_R[4]], layer="calca_botas", w=1.1, dith=0.0, bias=0.0, ao=1.0),
    "gorro":  dict(r=[(104, 90, 72), (84, 72, 58), (62, 53, 45), (44, 37, 34)], layer="gorro", w=1.0, dith=0.05, bias=0.0, ao=0.8),
    "cabo":   dict(r=[(168, 122, 80), (138, 98, 64), (104, 70, 50), (72, 48, 40)], layer="ferramenta", w=1.1, dith=0.0, bias=0.0, ao=1.0),
    "ferro":  dict(r=STEEL, layer="ferramenta", w=1.3, dith=0.0, bias=0.0, ao=1.0),
}
MAT_NAMES = list(MATS.keys())
NM = len(MAT_NAMES)
MID = {k: i for i, k in enumerate(MAT_NAMES)}
LAYERS = ["corpo", "calca_botas", "tunica", "gorro", "ferramenta"]
LID = {k: i for i, k in enumerate(LAYERS)}
MAT_LAYER = np.array([LID[MATS[k]["layer"]] for k in MAT_NAMES])
MAT_W = np.array([MATS[k]["w"] for k in MAT_NAMES], float)
MAT_DITH = np.array([MATS[k]["dith"] for k in MAT_NAMES], float)
MAT_BIAS = np.array([MATS[k]["bias"] for k in MAT_NAMES], float)
MAT_AO = np.array([MATS[k]["ao"] for k in MAT_NAMES], float)
MAT_NT = np.array([len(MATS[k]["r"]) for k in MAT_NAMES])
THR_T = {5: [0.84, 0.68, 0.50, 0.33], 4: [0.78, 0.58, 0.38], 3: [0.62, 0.40], 2: [0.5], 1: []}
PALETTE = sorted({c for k in MATS for c in MATS[k]["r"]} | {OUTLINE, INNER})
print("PALETA", len(PALETTE), "cores")
assert len(PALETTE) <= 48

# ------------------------------------------------------------------ cena
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for m in list(bpy.data.meshes):
    bpy.data.meshes.remove(m)
coll = bpy.context.scene.collection
BMAT = {}
for i, k in enumerate(MAT_NAMES):
    m = bpy.data.materials.new(k)
    v = (i + 1) / 32.0
    m.diffuse_color = (v, v, v, 1.0)
    BMAT[k] = m

X_SH, Z_SH, Z_EL, Z_WR = 0.225, 1.46, 1.17, 0.90
X_HIP, Z_HIP, Z_KN, Z_AN = 0.095, 0.92, 0.505, 0.088
L1, L2 = Z_HIP - Z_KN, Z_KN - Z_AN
HS = 1.25                      # cabeça maior e mais funda (A7); A6 era 1.17
CH_Z = 0.156                   # do centro da cabeça ao fundo do queixo
HC = 1.580 + CH_Z              # centro da cabeça: queixo a 1.58 m
PEL, SPN = (0, 0, Z_HIP), (0, 0, 1.05)
NECK = (0.0, 0.010, HC - 0.100)   # pivô da cabeça: base do crânio (A6 girava a 1.52, o que projetava o rosto)
HAND_C = 0.855
BONES = {
    "pelvis": ((0, 0, Z_HIP), (0, 0, 1.05)), "coluna": ((0, 0, 1.05), (0, 0, 1.50)),
    "cabeca": ((0, 0, 1.50), (0, 0, 1.80)),
    "saia_f": ((0, -0.12, 1.00), (0, -0.15, 0.76)), "saia_t": ((0, 0.12, 1.00), (0, 0.15, 0.76)),
    "saia_l": ((0, 0.0, 1.00), (0.0, 0.0, 0.76)),
}
for sx, s in ((1, "e"), (-1, "d")):
    BONES["ombro_" + s] = ((0.05 * sx, 0, 1.49), (X_SH * sx, 0, Z_SH))
    BONES["braco_" + s] = ((X_SH * sx, 0, Z_SH), (X_SH * sx, 0, Z_EL))
    BONES["antebraco_" + s] = ((X_SH * sx, 0, Z_EL), (X_SH * sx, 0, Z_WR))
    BONES["mao_" + s] = ((X_SH * sx, 0, Z_WR), (X_SH * sx, 0, 0.78))
    BONES["coxa_" + s] = ((X_HIP * sx, 0, Z_HIP), (X_HIP * sx, 0, Z_KN))
    BONES["canela_" + s] = ((X_HIP * sx, 0, Z_KN), (X_HIP * sx, 0, Z_AN))
    BONES["pe_" + s] = ((X_HIP * sx, 0, Z_AN), (X_HIP * sx, -0.1, 0.02))
    BONES["ponta_" + s] = ((X_HIP * sx, -0.1, 0.02), (X_HIP * sx, -0.21, 0.02))
arm_data = bpy.data.armatures.new("Camponês")
ARM = bpy.data.objects.new("Camponês", arm_data)
coll.objects.link(ARM)
bpy.context.view_layer.objects.active = ARM
ARM.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
for n, (h, t) in BONES.items():
    eb = arm_data.edit_bones.new(n)
    eb.head, eb.tail = Vector(h), Vector(t)
bpy.ops.object.mode_set(mode="OBJECT")

PARTS = []
ATTR = "nd"
ATTRS = ["nd", "uv", "gp"]
ONLY = ""   # "" = todas as animacoes; "golpear" ou "livre" = so nessa pose (mao em punho + machado x mao relaxada)
GRP_NAMES = ["", "head", "neck", "torso", "cap", "tun", "gola", "manga_e", "manga_d", "linho_e", "linho_d", "arm_e", "arm_d",
             "mao_e", "mao_d", "machado", "cinto", "bolsa", "quadril", "perna_e", "perna_d", "bota_e", "bota_d", "legskin"]
GID = {k: i for i, k in enumerate(GRP_NAMES)}
import re as _re
AUTO_OBJS = []


def grp_of(name):
    m = _re.search(r"_(e|d)(_|$)", name)
    sd = m.group(1) if m else ""
    if name.startswith(("cabeca", "mandibula", "nariz", "olho_", "sobrancelha", "orelha", "bochecha", "barba", "cabelo", "boca", "labio")):
        return GID["head"]
    if name == "pescoco":
        return GID["neck"]
    if name in ("torso", "corpo_pele"):
        return GID["torso"]
    if name.startswith("gorro"):
        return GID["cap"]
    if name == "tunica_corpo":
        return GID["tun"]
    if name in ("tunica_gola", "tunica_peito_v"):
        return GID["gola"]
    if name.startswith("tunica_manga"):
        return GID["manga_" + sd]
    if name.startswith("tunica_linho"):
        return GID["linho_" + sd]
    if name.startswith(("braco_pele", "ombro_pele")):
        return GID["arm_" + sd]
    if name.startswith("mao_"):
        return GID["mao_" + sd]
    if name.startswith("machado"):
        return GID["machado"]
    if name.startswith("cinto"):
        return GID["cinto"]
    if name.startswith("bolsa"):
        return GID["bolsa"]
    if name == "calca_quadril":
        return GID["quadril"]
    if name.startswith("calca_perna"):
        return GID["perna_" + sd]
    if name.startswith("bota"):
        return GID["bota_" + sd]
    if name.startswith("perna_pele"):
        return GID["legskin"]
    return 0


def center_x(name):
    m = _re.search(r"_(e|d)(_|$)", name)
    if not m:
        return 0.0
    sgn = 1 if m.group(1) == "e" else -1
    if name.startswith(("tunica_manga", "tunica_linho", "braco_pele", "ombro_pele", "mao_")):
        return X_SH * sgn
    if name.startswith(("calca_perna", "bota", "perna_pele")):
        return X_HIP * sgn
    return 0.0


def set_active_attr(me, an):
    a = me.color_attributes[an]
    me.color_attributes.active_color = a
    me.color_attributes.render_color_index = list(me.color_attributes).index(a)


def bm_via_modifiers(bm, mods):
    """Aplica modificadores (lista de (tipo, dict)) num bmesh pelo grafo avaliado e devolve um bmesh novo (sem operadores)."""
    me = bpy.data.meshes.new("tmp_mod")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("tmp_mod", me)
    coll.objects.link(ob)
    for typ, props in mods:
        m = ob.modifiers.new(typ.lower(), typ)
        for k, v in props.items():
            setattr(m, k, v)
    bpy.context.view_layer.update()
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me2 = bpy.data.meshes.new_from_object(ev)
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)
    bm2 = bmesh.new()
    bm2.from_mesh(me2)
    bpy.data.meshes.remove(me2)
    return bm2


def subsurf_bm(bm, levels):
    if levels <= 0:
        return bm
    return bm_via_modifiers(bm, [("SUBSURF", dict(levels=levels, render_levels=levels, subdivision_type="CATMULL_CLARK"))])


def finish(name, bm, mat, wfun, smooth=True, sub=0, gfun=None, auto=False, cxfun=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm = subsurf_bm(bm, sub)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.shade_smooth()
    for an in ATTRS:
        me.color_attributes.new(an, "FLOAT_COLOR", "POINT")
    set_active_attr(me, ATTR)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    me.materials.append(BMAT[mat])
    ob["layer"] = MATS[mat]["layer"]
    ob["only"] = ONLY
    gid = grp_of(name)
    ob["grp"] = gid
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(n, 3)
    cx = cxfun(co) if cxfun else center_x(name)
    uvc = np.stack([0.5 + (co[:, 0] - cx) / 0.8, 0.5 + co[:, 1] / 0.8, np.clip(co[:, 2] / 2.0, 0, 1), np.ones(n)], 1).astype(np.float32)
    me.color_attributes["uv"].data.foreach_set("color", uvc.ravel())
    gids = np.array([gfun(c) for c in co], float) if gfun else np.full(n, gid, float)
    gpc = np.stack([gids / 32.0, np.zeros(n), np.zeros(n), np.ones(n)], 1).astype(np.float32)
    me.color_attributes["gp"].data.foreach_set("color", gpc.ravel())
    PARTS.append(ob)
    if auto:
        AUTO_OBJS.append(ob)
        return ob
    groups = {}
    for i in range(n):
        w = wfun(co[i]) if callable(wfun) else wfun
        if isinstance(w, str):
            w = {w: 1.0}
        for b, val in w.items():
            if val > 1e-4:
                groups.setdefault(b, []).append((i, val))
    for b, lst in groups.items():
        vg = ob.vertex_groups.new(name=b)
        for i, val in lst:
            vg.add([i], float(val), "REPLACE")
    mod = ob.modifiers.new("Esq", "ARMATURE")
    mod.object = ARM
    ob.parent = ARM
    return ob


def cr_dense(a, sub):
    """Catmull-Rom: 'sub' pontos por segmento (inclui o último)."""
    a = np.asarray(a, float)
    one = a.ndim == 1
    if one:
        a = a[:, None]
    n = len(a)
    if sub <= 1 or n < 3:
        return a[:, 0] if one else a
    P = np.vstack([2 * a[0] - a[1], a, 2 * a[-1] - a[-2]])
    out = []
    for i in range(n - 1):
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        for s in range(sub):
            t = s / sub
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(a[-1])
    out = np.array(out)
    return out[:, 0] if one else out


def loft_into(bm, path, rx, ry, n=12, front=(0, -1, 0), cap0=True, cap1=True, rmod=None, tmod=None, dens=1):
    path = np.array(path, float)
    m0 = len(path)
    rx = np.broadcast_to(np.array(rx, float), (m0,)).copy()
    ry = np.broadcast_to(np.array(ry, float), (m0,)).copy()
    if dens > 1:
        path, rx, ry = cr_dense(path, dens), cr_dense(rx, dens), cr_dense(ry, dens)
    m = len(path)
    T = np.zeros_like(path)
    for i in range(m):
        a = path[min(i + 1, m - 1)] - path[max(i - 1, 0)]
        nrm = np.linalg.norm(a)
        if nrm < 1e-9:
            print('LOFT DEGENERADO', path[max(i-1,0)], path[min(i+1,m-1)], flush=True)
        T[i] = a / max(nrm, 1e-9)
    f = np.array(front, float)
    rings = []
    for i in range(m):
        t = T[i]
        side = np.cross(f, t)
        if np.linalg.norm(side) < 1e-6:
            side = np.cross(np.array([1.0, 0, 0]), t)
        side /= np.linalg.norm(side)
        fv = np.cross(t, side)
        ring = []
        for k in range(n):
            th = 2 * math.pi * k / n
            sc = rmod(i, th, path[i]) if rmod else 1.0
            p = path[i] + (rx[i] * math.cos(th) * side + ry[i] * math.sin(th) * fv) * sc
            if tmod:
                p = p + t * tmod(i, th, path[i], m)
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for i in range(m - 1):
        for k in range(n):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % n], rings[i + 1][(k + 1) % n], rings[i + 1][k]))
    for ring, on in ((rings[0], cap0), (rings[-1], cap1)):
        if on:
            cv = [bm.verts.new(v.co) for v in ring]
            c = bm.verts.new(sum((v.co for v in ring), Vector()) / n)
            for k in range(n):
                bm.faces.new((c, cv[(k + 1) % n], cv[k]))
    return bm


def loft(name, path, rx, ry, mat, wfun, n=12, front=(0, -1, 0), cap0=True, cap1=True, rmod=None, tmod=None, cut=None,
         dens=1, sub=0, gfun=None, auto=False):
    bm = bmesh.new()
    loft_into(bm, path, rx, ry, n, front, cap0, cap1, rmod, tmod, dens)
    if cut is not None:
        dele = [fc for fc in bm.faces if cut(fc.calc_center_median())]
        bmesh.ops.delete(bm, geom=dele, context="FACES")
    return finish(name, bm, mat, wfun, sub=sub, gfun=gfun, auto=auto)


def ellipsoid_into(bm, center, radii, u=16, v=12, rot=None):
    r = bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    vs = r["verts"]
    bmesh.ops.scale(bm, vec=radii, verts=vs)
    if rot is not None:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot, verts=vs)
    bmesh.ops.translate(bm, vec=center, verts=vs)


def ellipsoid(name, center, radii, mat, wfun, u=16, v=12, keep=None, sub=0):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    bmesh.ops.scale(bm, vec=radii, verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    if keep is not None:
        dele = [f for f in bm.faces if not keep(f.calc_center_median())]
        bmesh.ops.delete(bm, geom=dele, context="FACES")
    return finish(name, bm, mat, wfun, sub=sub)


def rbox(name, center, size, mat, wfun, bev=None, seg=2, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bev = bev if bev is not None else min(size) * 0.35
    bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=bev, segments=seg, profile=0.5, affect="EDGES")
    if rot is not None:
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=center, verts=bm.verts)
    return finish(name, bm, mat, wfun)


def sstep(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def lerpw(z, z0, z1, a, b):
    t = min(1.0, max(0.0, (z - z0) / (z1 - z0)))
    return {a: 1 - t, b: t}


def lerps(z, z0, z1, a, b):
    t = sstep((z - z0) / (z1 - z0))
    return {a: 1 - t, b: t}


# ------------------------------------------------------------------ CORPO: UMA malha contínua (tronco + pescoço + trapézios + braços)
# Casca de cada parte (loft/elipsoide) -> remalhagem por voxel (une tudo numa superfície só, sem vãos nas juntas)
# -> suavização -> pesos por Automatic Weights (calor de osso) num esqueleto de tronco -> reaponta para o esqueleto completo.
bm = bmesh.new()
tz_ = [0.90, 1.02, 1.20, 1.36, 1.45, 1.50, 1.535, 1.56]
loft_into(bm, [(0, 0, z) for z in tz_], [0.150, 0.142, 0.165, 0.183, 0.182, 0.130, 0.085, 0.055],
          [0.100, 0.096, 0.104, 0.108, 0.100, 0.086, 0.066, 0.052], n=20, dens=2)
neck_p = [(0, 0.006, 1.46), (0, 0.009, 1.52), (0, 0.012, 1.58), (0, 0.014, 1.66)]
loft_into(bm, neck_p, [0.060, 0.046, 0.042, 0.044], [0.060, 0.050, 0.046, 0.048], n=16, dens=3)
for sx in (1, -1):
    # trapézio: inclinação do pescoço ao ombro; deltoide: ombro cheio
    ellipsoid_into(bm, (0.085 * sx, 0.010, 1.485), (0.078, 0.056, 0.034), 14, 10,
                   rot=Matrix.Rotation(math.radians(22 * sx), 3, "Y"))
    ellipsoid_into(bm, (0.205 * sx, 0.0, 1.425), (0.070, 0.064, 0.070), 14, 10)
    ap = [(X_SH * sx, 0, z) for z in (1.44, 1.38, 1.30, 1.22, 1.17, 1.10, 1.00, 0.93, 0.89)]
    loft_into(bm, ap, [0.066, 0.061, 0.056, 0.050, 0.046, 0.047, 0.040, 0.033, 0.031],
              [0.068, 0.063, 0.058, 0.052, 0.048, 0.048, 0.041, 0.034, 0.031], n=14, dens=2)
bm = bm_via_modifiers(bm, [("REMESH", dict(mode="VOXEL", voxel_size=0.0095, adaptivity=0.0, use_smooth_shade=True)),
                           ("SMOOTH", dict(factor=0.7, iterations=8))])
print("CORPO malha continua: verts", len(bm.verts), "faces", len(bm.faces), flush=True)


def g_skin(c):
    ax = abs(c[0])
    if c[2] > 1.485 and ax < 0.075:
        return GID["neck"]
    if ax > 0.19 and c[2] < 1.47:
        return GID["arm_e"] if c[0] > 0 else GID["arm_d"]
    return GID["torso"]


def cx_skin(co):
    return np.where(np.abs(co[:, 0]) > 0.17, np.sign(co[:, 0]) * X_SH, 0.0)


finish("corpo_pele", bm, "pele", None, auto=True, gfun=g_skin, cxfun=cx_skin)
RX, RY, RZ = 0.077 * HS, 0.088 * HS, 0.108 * HS
CY = 0.006


def skull_y(x, z):
    return CY - RY * math.sqrt(max(0.0, 1 - (x / RX) ** 2 - ((z - HC) / RZ) ** 2))


H = {"cabeca": 1.0}
ellipsoid("cabeca", (0, CY, HC), (RX, RY, RZ), "pele", H, u=22, v=16)
ellipsoid("mandibula", (0, -0.030, HC - 0.096), (0.070, 0.074, 0.060), "pele", H, u=16, v=10)
ellipsoid("nariz", (0, -0.1105, HC - 0.040), (0.0165, 0.030, 0.038), "pele", H, u=10, v=8)
ellipsoid("nariz_ponta", (0, -0.1345, HC - 0.060), (0.0145, 0.016, 0.013), "pele", H, u=8, v=6)
for sx, s in ((1, "e"), (-1, "d")):
    ez = HC + 0.002
    ex = 0.042
    ey = skull_y(ex, ez)
    ellipsoid("olho_b_" + s, (ex * sx, ey - 0.0015, ez), (0.0245, 0.009, 0.0125), "olhob", H, u=10, v=8)
    ellipsoid("olho_" + s, (ex * sx, ey - 0.0050, ez), (0.0130, 0.0075, 0.0130), "iris", H, u=10, v=8)
    ellipsoid("sobrancelha_" + s, (0.042 * sx, skull_y(0.042, HC + 0.034) - 0.0025, HC + 0.034), (0.024, 0.010, 0.0085), "sobr", H, u=10, v=8)
    ellipsoid("orelha_" + s, (0.0935 * sx, 0.012, HC - 0.018), (0.0115, 0.021, 0.033), "pele", H, u=10, v=8)
    ellipsoid("bochecha_" + s, (0.055 * sx, skull_y(0.055, HC - 0.050) + 0.004, HC - 0.050), (0.033, 0.029, 0.031), "pele", H, u=10, v=8)
ellipsoid("boca", (0, -0.1045, HC - 0.104), (0.025, 0.010, 0.0065), "boca", H, u=10, v=6)
ellipsoid("boca_nariz", (0, -0.126, HC - 0.080), (0.012, 0.008, 0.007), "boca", H, u=8, v=6)


def beard_keep(p):
    zr = p.z - HC
    if p.y > 0.028:
        return False
    if abs(p.x) > 0.076:
        return zr < -0.086
    return zr < -0.110


ellipsoid("barba", (0, -0.036, HC - 0.098), (0.090, 0.096, 0.082), "barba", H, u=24, v=14, keep=beard_keep)
HAIR_LB = 0.096


def hair_keep(p):
    zr = p.z - HC
    y = p.y
    lb = HAIR_LB if y < -0.050 else (-0.08 if y > 0.0 else HAIR_LB + (y + 0.050) / 0.050 * (-0.08 - HAIR_LB))
    if abs(p.x) > 0.080 and y < 0.03:
        lb = min(lb, -0.020)
    return zr > lb


ellipsoid("cabelo", (0, CY + 0.004, HC + 0.002), (RX * 1.045, RY * 1.04, RZ * 1.035), "cabelo", H, u=24, v=16, keep=hair_keep)

for sx, s in ((1, "e"), (-1, "d")):
    def w_leg(co, s=s):
        return lerps(co[2], 0.40, 0.62, "canela_" + s, "coxa_" + s)
    loft("perna_pele_" + s, [(X_HIP * sx, 0, 0.95), (X_HIP * sx, 0, 0.72), (X_HIP * sx, 0, 0.505), (X_HIP * sx, 0, 0.30), (X_HIP * sx, 0, 0.10)],
         [0.080, 0.070, 0.056, 0.046, 0.038], [0.085, 0.074, 0.060, 0.050, 0.040], "pele", w_leg, n=10, dens=2)

# ------------------------------------------------------------------ MAOS (pele) e FERRAMENTA
def hand_right():
    # punho fechado (so no golpear), dedos empilhados ao longo do cabo (eixo -Y), cabo atravessa
    cx, cz = -X_SH, HAND_C
    W = {"mao_d": 1.0}
    rbox("mao_d_palma", (cx, 0.0, cz), (0.050, 0.092, 0.060), "pele", W, bev=0.018)
    for i, yy in enumerate((-0.033, -0.011, 0.011, 0.033)):
        ellipsoid("mao_d_dedo%d" % i, (cx, yy, cz - 0.026), (0.026, 0.0115, 0.0185), "pele", W, u=8, v=6)
    ellipsoid("mao_d_polegar", (cx + 0.016, -0.050, cz + 0.015), (0.0125, 0.026, 0.014), "pele", W, u=8, v=6)
    ellipsoid("mao_d_pulso", (cx, 0.0, cz + 0.040), (0.036, 0.040, 0.036), "pele", {"mao_d": 0.5, "antebraco_d": 0.5}, u=8, v=6)


def hand_relaxed(sx):
    s_ = "e" if sx > 0 else "d"
    cx, cz = X_SH * sx, 0.845
    W = {"mao_" + s_: 1.0}
    rbox("mao_%s_palma" % s_, (cx - 0.004 * sx, 0.0, cz + 0.012), (0.040, 0.084, 0.060), "pele", W, bev=0.016)
    for i, yy in enumerate((-0.030, -0.010, 0.010, 0.030)):
        ln = (0.062, 0.070, 0.066, 0.052)[i]
        loft("mao_%s_dedo%d" % (s_, i), [(cx - 0.004 * sx, yy - 0.004, cz - 0.010), (cx - 0.004 * sx, yy - 0.012, cz - 0.010 - ln * 0.6),
                                         (cx - 0.001 * sx, yy - 0.020, cz - 0.010 - ln)], [0.0125, 0.0105, 0.008], [0.0115, 0.0095, 0.0075], "pele", W, n=6)
    loft("mao_%s_polegar" % s_, [(cx - 0.020 * sx, -0.042, cz + 0.020), (cx - 0.020 * sx, -0.050, cz - 0.008), (cx - 0.018 * sx, -0.056, cz - 0.036)],
         [0.0125, 0.011, 0.009], [0.0125, 0.011, 0.009], "pele", W, n=6)
    ellipsoid("mao_%s_pulso" % s_, (cx, 0.0, cz + 0.040), (0.036, 0.040, 0.036), "pele", {"mao_" + s_: 0.5, "antebraco_" + s_: 0.5}, u=8, v=6)


hand_relaxed(1)
ONLY = "livre"
hand_relaxed(-1)
ONLY = "golpear"
hand_right()

# machado (so no golpear): cabo ao longo de -Y a partir da mao direita; lamina no fim, gume para baixo (-Z local)
AX = np.array((-X_SH, 0.0, HAND_C))
Wm = {"mao_d": 1.0}
hp = [AX + np.array((0, 0.060, 0)), AX + np.array((0, -0.06, 0.003)), AX + np.array((0, -0.15, 0.008)), AX + np.array((0, -0.235, 0.010)), AX + np.array((0, -0.300, 0.009))]
loft("machado_cabo", hp, [0.022, 0.0185, 0.0185, 0.020, 0.023], [0.025, 0.021, 0.0185, 0.019, 0.022], "cabo", Wm, n=8, front=(0, 0, 1))
ellipsoid("machado_pomo", tuple(AX + np.array((0, 0.063, 0))), (0.023, 0.015, 0.021), "cabo", Wm, u=8, v=6)
# cabeca: poll (acima) + olho + lamina (para baixo)
HY = -0.282
rbox("machado_olho", tuple(AX + np.array((0, HY, 0.010))), (0.034, 0.066, 0.046), "ferro", Wm, bev=0.009)
rbox("machado_poll", tuple(AX + np.array((0, HY + 0.010, 0.042))), (0.032, 0.040, 0.028), "ferro", Wm, bev=0.008)
th_top, th_bot = 0.028, 0.004
bm = bmesh.new()
top_r = [bm.verts.new((th_top / 2, 0.034, -0.016)), bm.verts.new((th_top / 2, -0.034, -0.016))]
top_l = [bm.verts.new((-th_top / 2, 0.034, -0.016)), bm.verts.new((-th_top / 2, -0.034, -0.016))]
mid_r = [bm.verts.new((th_top / 2 * 0.75, 0.044, -0.060)), bm.verts.new((th_top / 2 * 0.75, -0.052, -0.060))]
mid_l = [bm.verts.new((-th_top / 2 * 0.75, 0.044, -0.060)), bm.verts.new((-th_top / 2 * 0.75, -0.052, -0.060))]
ed_r = [bm.verts.new((th_bot / 2, 0.054, -0.100)), bm.verts.new((th_bot / 2, -0.070, -0.100))]
ed_l = [bm.verts.new((-th_bot / 2, 0.054, -0.100)), bm.verts.new((-th_bot / 2, -0.070, -0.100))]
rows_r = [top_r, mid_r, ed_r]
rows_l = [top_l, mid_l, ed_l]
for rows in (rows_r, rows_l):
    for a_, b_ in zip(rows[:-1], rows[1:]):
        bm.faces.new((a_[0], a_[1], b_[1], b_[0]))
for i in range(2):
    bm.faces.new((rows_r[i][0], rows_r[i + 1][0], rows_l[i + 1][0], rows_l[i][0]))
    bm.faces.new((rows_r[i][1], rows_l[i][1], rows_l[i + 1][1], rows_r[i + 1][1]))
bm.faces.new((top_r[0], top_l[0], top_l[1], top_r[1]))
bm.faces.new((ed_r[0], ed_r[1], ed_l[1], ed_l[0]))
bmesh.ops.translate(bm, vec=tuple(AX + np.array((0, HY, 0.0))), verts=bm.verts)
finish("machado_lamina", bm, "ferro", Wm, smooth=False)
ONLY = ""

# ------------------------------------------------------------------ CALÇA + BOTAS
loft("calca_quadril", [(0, 0, 1.06), (0, 0, 0.96), (0, 0, 0.86)], [0.172, 0.183, 0.186], [0.114, 0.120, 0.122], "calca",
     {"pelvis": 1.0}, n=16, dens=2, sub=1)


def pant_rmod(i, th, p):
    z = p[2]
    a = 0.025 if 0.33 <= z <= 0.47 else 0.0075
    return 1.0 + a * math.sin(3 * th + 8 * z)


for sx, s in ((1, "e"), (-1, "d")):
    zs = [0.90, 0.78, 0.64, 0.545, 0.46, 0.38, 0.335, 0.31, 0.28]
    rxs = [0.104, 0.100, 0.094, 0.087, 0.083, 0.079, 0.086, 0.082, 0.074]
    rys = [0.106, 0.102, 0.096, 0.089, 0.085, 0.081, 0.089, 0.085, 0.076]
    path = [(X_HIP * sx, 0.004, z) for z in zs]
    loft("calca_perna_" + s, path, rxs, rys, "calca", (lambda co, s=s: lerps(co[2], 0.40, 0.62, "canela_" + s, "coxa_" + s)), n=14,
         rmod=pant_rmod, dens=3, sub=1)

    def w_shaft(co, s=s):
        return lerpw(co[2], 0.14, 0.24, "pe_" + s, "canela_" + s)
    loft("bota_cano_" + s, [(X_HIP * sx, 0.006, 0.31), (X_HIP * sx, 0.006, 0.285), (X_HIP * sx, 0.006, 0.20), (X_HIP * sx, 0.008, 0.10)],
         [0.079, 0.072, 0.064, 0.058], [0.080, 0.073, 0.066, 0.062], "bota", w_shaft, n=14, dens=3, sub=1)
    loft("bota_pe_" + s, [(X_HIP * sx, 0.054, 0.058), (X_HIP * sx, -0.020, 0.052), (X_HIP * sx, -0.110, 0.043), (X_HIP * sx, -0.192, 0.034)],
         [0.054, 0.058, 0.062, 0.052], [0.056, 0.052, 0.041, 0.033], "bota", (lambda co, s=s: lerps(-co[1], 0.095, 0.145, "pe_" + s, "ponta_" + s)), n=14, front=(0, 0, 1), dens=2, sub=1)
    rbox("bota_sola_a_" + s, (X_HIP * sx, -0.004, 0.0115), (0.122, 0.196, 0.024), "sola", {"pe_" + s: 1.0}, bev=0.008)
    rbox("bota_sola_p_" + s, (X_HIP * sx, -0.150, 0.0115), (0.116, 0.112, 0.024), "sola", {"ponta_" + s: 1.0}, bev=0.008)
    rbox("bota_salto_" + s, (X_HIP * sx, 0.062, 0.020), (0.104, 0.072, 0.042), "sola", {"pe_" + s: 1.0}, bev=0.008)

# ------------------------------------------------------------------ TÚNICA (corpo, saia curta, mangas, gola, cinto, bolsinha)
Z_HEM = 0.745
Z_BELT = 1.00


def w_tun(co):
    return lerpw(co[2], 0.98, 1.12, "pelvis", "coluna")


def w_tun_skirt(co):
    """acima da cintura segue o tronco; abaixo, 3 ossos de saia (frente, costas, lados) entram aos poucos."""
    z = co[2]
    base = w_tun(co) if z > Z_BELT else {"pelvis": 1.0}
    k = sstep((Z_BELT + 0.02 - z) / 0.20)   # 0 na cintura -> 1 na barra
    if k <= 1e-4:
        return base
    r = math.hypot(co[0] / 0.23, co[1] / 0.15) + 1e-6
    fr = max(0.0, -co[1] / 0.15 / r)
    bk = max(0.0, co[1] / 0.15 / r)
    sd = abs(co[0] / 0.23) / r
    t = fr ** 2 + bk ** 2 + sd ** 2
    out = {k_: v * (1 - 0.92 * k) for k_, v in base.items()}
    out["saia_f"] = 0.92 * k * fr ** 2 / t
    out["saia_t"] = 0.92 * k * bk ** 2 / t
    out["saia_l"] = 0.92 * k * sd ** 2 / t
    return out


tz = [1.552, 1.532, 1.508, 1.466, 1.40, 1.30, 1.18, 1.08, 1.00, 0.88, 0.80, Z_HEM]
trx = [0.066, 0.100, 0.152, 0.208, 0.200, 0.190, 0.178, 0.172, 0.184, 0.206, 0.226, 0.232]
try_ = [0.062, 0.084, 0.102, 0.114, 0.122, 0.122, 0.118, 0.114, 0.122, 0.135, 0.144, 0.148]
tpath = [(0, 0.0, z) for z in tz]


def tun_rmod(i, th, p):
    a = float(np.interp(p[2], [0.745, 0.80, 0.88, 1.00, 1.08, 1.18], [0.052, 0.042, 0.030, 0.012, 0.006, 0.004]))
    return 1.0 + a * math.sin(6 * th + 0.6) + a * 0.5 * math.sin(11 * th + 1.7)


def tun_tmod(i, th, p, m):
    return 0.011 * math.sin(6 * th + 0.6) if i == m - 1 else 0.0


def vcut(p):
    zq = p.z - 1.462
    return p.y < -0.04 and zq > 0 and abs(p.x) < zq * 0.80


loft("tunica_corpo", tpath, trx, try_, "tunica", w_tun_skirt, n=24, cap0=False, cap1=False, rmod=tun_rmod, tmod=tun_tmod, cut=vcut,
     dens=3, sub=1)
# gola de linho: anel baixo e grosso que envolve a base do pescoço; peito em V curto
loft("tunica_gola", [(0, 0.011, 1.500), (0, 0.011, 1.532), (0, 0.011, 1.556)], [0.078, 0.067, 0.061], [0.075, 0.064, 0.058], "linho",
     {"coluna": 1.0}, n=16, cap0=False, cap1=False, dens=2, sub=1)
ellipsoid("tunica_peito_v", (0, -0.096, 1.490), (0.034, 0.016, 0.038), "linho", {"coluna": 1.0}, u=10, v=8)
for sx, s in ((1, "e"), (-1, "d")):
    def w_sleeve_top(co, s=s):
        return lerps(co[2], 1.30, 1.42, "braco_" + s, "coluna") if co[2] > 1.42 else {"braco_" + s: 1.0}
    loft("tunica_manga_" + s, [(X_SH * sx, 0, 1.50), (X_SH * sx, 0, 1.485), (X_SH * sx, 0, 1.43), (X_SH * sx, 0, 1.37), (X_SH * sx, 0, 1.325)],
         [0.050, 0.075, 0.083, 0.086, 0.088], [0.050, 0.074, 0.082, 0.085, 0.087], "tunica", {"braco_" + s: 1.0}, n=14,
         rmod=lambda i, th, p: 1.0 + 0.02 * math.sin(4 * th) * (p[2] < 1.40), dens=2, sub=1)

    def w_sleeve(co, s=s):
        return lerps(co[2], 1.08, 1.27, "antebraco_" + s, "braco_" + s)
    loft("tunica_linho_" + s, [(X_SH * sx, 0, 1.335), (X_SH * sx, 0, 1.29), (X_SH * sx, 0, 1.23), (X_SH * sx, 0, 1.18), (X_SH * sx, 0, 1.145), (X_SH * sx, 0, 1.10)],
         [0.071, 0.073, 0.070, 0.072, 0.079, 0.074], [0.070, 0.072, 0.069, 0.072, 0.079, 0.074], "linho", w_sleeve, n=14,
         rmod=lambda i, th, p: 1.0 + 0.03 * math.sin(3 * th + 6 * p[2]) * (1.15 < p[2] < 1.31), dens=4, sub=1)
# cinto
loft("cinto", [(0, 0, 1.125), (0, 0, 1.065)], [0.184, 0.184], [0.124, 0.124], "couro", w_tun, n=20, cap0=False, cap1=False, dens=2)
rbox("cinto_fivela", (0, -0.126, 1.095), (0.034, 0.014, 0.046), "fivela", w_tun, bev=0.005)
rbox("cinto_ponta", (0.03, -0.126, 1.03), (0.026, 0.010, 0.085), "couro", w_tun, bev=0.004)
# bolsinha no quadril direito (-X)
rbox("bolsa_corpo", (-0.168, -0.020, 0.985), (0.062, 0.098, 0.100), "couro", w_tun, bev=0.018)
rbox("bolsa_aba", (-0.172, -0.020, 1.024), (0.066, 0.104, 0.042), "couro", w_tun, bev=0.014)
rbox("bolsa_fecho", (-0.176, -0.020, 1.001), (0.016, 0.022, 0.020), "fivela", w_tun, bev=0.004)

# ------------------------------------------------------------------ BONÉ (feltro, aba curta) - mais recuado: testa livre
CAP_C = (0, CY + 0.016, HC + 0.050)
CAP_R = (RX * 1.13, RY * 1.11, 0.095 * HS)


def cap_keep(p):
    zr = p.z - HC
    if p.y < -0.05:
        lb = HAIR_LB + 0.006
    elif p.y > 0.02:
        lb = -0.012
    else:
        t = (p.y + 0.05) / 0.07
        lb = (HAIR_LB + 0.006) + t * (-0.012 - (HAIR_LB + 0.006))
    if abs(p.x) > 0.066:
        lb = max(lb, 0.0) if p.y < -0.02 else lb
    return zr > lb


ellipsoid("gorro_copa", CAP_C, CAP_R, "gorro", H, u=26, v=14, keep=cap_keep)
# aba curta: meia-lua achatada na frente
bm = bmesh.new()
rings = []
for ri, (rr, zz) in enumerate(((0.0, HAIR_LB + 0.010), (0.018, HAIR_LB + 0.006), (0.034, HAIR_LB))):
    ring = []
    for k in range(9):
        ang = math.pi * (0.22 + 0.56 * k / 8)   # frente
        x = math.cos(ang) * (RX * 1.12 + rr * 0.3)
        y = -math.sin(ang) * (RY * 1.08 + rr)
        ring.append(bm.verts.new((x, y + CY + 0.012, HC + zz)))
    rings.append(ring)
for a, b in zip(rings[:-1], rings[1:]):
    for k in range(8):
        bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
under = [[bm.verts.new((v.co.x, v.co.y, v.co.z - 0.014)) for v in r] for r in rings]
for a, b in zip(under[:-1], under[1:]):
    for k in range(8):
        bm.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
for k in range(8):
    bm.faces.new((rings[2][k], under[2][k], under[2][k + 1], rings[2][k + 1]))
finish("gorro_aba", bm, "gorro", H, smooth=True)


# ------------------------------------------------------------------ Automatic Weights do corpo (esqueleto de tronco) -> esqueleto completo
def auto_weights(objs, names):
    ad = bpy.data.armatures.new("W")
    AW = bpy.data.objects.new("W", ad)
    coll.objects.link(AW)
    bpy.context.view_layer.objects.active = AW
    AW.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for n in names:
        eb = ad.edit_bones.new(n)
        eb.head, eb.tail = Vector(BONES[n][0]), Vector(BONES[n][1])
    bpy.ops.object.mode_set(mode="OBJECT")
    for ob in objs:
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        AW.select_set(True)
        bpy.context.view_layer.objects.active = AW
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        for m in ob.modifiers:
            if m.type == "ARMATURE":
                m.object = ARM
        ob.parent = ARM
        ob.matrix_parent_inverse = Matrix.Identity(4)
        me = ob.data
        n = len(me.vertices)
        tot = np.zeros(n)
        for v in me.vertices:
            tot[v.index] = sum(g.weight for g in v.groups)
        print("AUTOWEIGHT", ob.name, "verts", n, "sem peso", int((tot < 1e-4).sum()), "grupos", len(ob.vertex_groups), flush=True)
        miss = np.nonzero(tot < 1e-4)[0]
        if len(miss):   # reserva: osso mais próximo (nunca deve acontecer)
            for i in miss:
                p = np.array(me.vertices[i].co)
                best, bd = None, 1e9
                for nme in names:
                    h, t = np.array(BONES[nme][0]), np.array(BONES[nme][1])
                    d_ = t - h
                    u = np.clip(np.dot(p - h, d_) / np.dot(d_, d_), 0, 1)
                    dd = np.linalg.norm(p - (h + u * d_))
                    if dd < bd:
                        best, bd = nme, dd
                vg = ob.vertex_groups.get(best) or ob.vertex_groups.new(name=best)
                vg.add([int(i)], 1.0, "REPLACE")
    bpy.data.objects.remove(AW, do_unlink=True)


auto_weights(AUTO_OBJS, ["pelvis", "coluna", "cabeca", "braco_e", "braco_d", "antebraco_e", "antebraco_d", "mao_e", "mao_d"])

# ------------------------------------------------------------------ câmera ortográfica (X=60, Z=45)
cam_data = bpy.data.cameras.new("CamIso")
cam_data.type = "ORTHO"
cam_data.clip_start, cam_data.clip_end = 0.1, 100
cam = bpy.data.objects.new("CamIso", cam_data)
coll.objects.link(cam)
cam.rotation_euler = Euler((math.radians(60), 0, math.radians(45)), "XYZ")
Rcam = cam.rotation_euler.to_matrix()
UP = Rcam @ Vector((0, 1, 0))
BACK = Rcam @ Vector((0, 0, 1))
RIGHT = Rcam @ Vector((1, 0, 0))
BACK_NP, UP_NP, RIGHT_NP = (np.array(v, np.float64) for v in (BACK, UP, RIGHT))

rest = np.concatenate([np.array([v.co[:] for v in ob.data.vertices]) for ob in PARTS if ob["layer"] != "ferramenta"])
ups = []
for k in range(8):
    Rz = np.array(Matrix.Rotation(k * math.pi / 4, 3, "Z"))
    ups.append((rest @ Rz.T) @ UP_NP)
ups = np.concatenate(ups)
max_up, min_up = ups.max(), ups.min()
SIL_TOP, SIL_BASE = 5, 83
PPU = (SIL_BASE - SIL_TOP + 1) / (max_up - min_up)
ORIGIN_Y = SIL_TOP + max_up * PPU
PIX = 1.0 / PPU
cam_data.ortho_scale = TILE / PPU
cam.location = UP * ((ORIGIN_Y - TILE / 2) / PPU) + BACK * 10
print("PPU", round(PPU, 2), "origem_y", round(ORIGIN_Y, 2), "altura m", round(rest[:, 2].max() - rest[:, 2].min(), 3))

sc = bpy.context.scene
sc.camera = cam
sc.render.engine = "BLENDER_WORKBENCH"
sc.render.resolution_x = sc.render.resolution_y = RES
sc.render.resolution_percentage = 100
sc.render.film_transparent = True
sc.render.filter_size = 0.0
sc.render.dither_intensity = 0.0
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGBA"
sc.render.image_settings.color_depth = "16"
sc.view_settings.view_transform = "Standard"
sc.view_settings.look = "None"
sc.display.render_aa = "OFF"
shd = sc.display.shading
shd.show_shadows = shd.show_cavity = shd.show_object_outline = shd.show_specular_highlight = False
shd.use_world_space_lighting = False
shd.show_backface_culling = False
sc.render.filepath = TMP
sc.render.threads_mode = "FIXED"
sc.render.threads = 2


def load_png(path):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = "Non-Color"
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)[::-1].copy()


def save_png(arr8, path):
    h, w = arr8.shape[:2]
    img = bpy.data.images.new("tmp_out", w, h, alpha=True)
    img.colorspace_settings.name = "Non-Color"
    img.alpha_mode = "STRAIGHT"
    img.pixels.foreach_set((arr8.astype(np.float32) / 255.0)[::-1].ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def srgb_to_lin(e):
    return np.where(e <= 0.04045, e / 12.92, ((e + 0.055) / 1.055) ** 2.4)


def lin_in(c, i):
    return srgb_to_lin(c[..., i])


def render_all():
    shd.light, shd.color_type = "FLAT", "MATERIAL"
    bpy.ops.render.render(write_still=True)
    a = load_png(TMP)
    al = a[..., 3] > 0.5
    idv = np.where(al, np.rint(lin_in(a, 0) * 32).astype(np.int32) - 1, -1)
    vis = [ob for ob in PARTS if not ob.hide_render]
    out = []
    shd.light, shd.color_type = "FLAT", "VERTEX"
    for an in ATTRS:
        for ob in vis:
            set_active_attr(ob.data, an)
        bpy.ops.render.render(write_still=True)
        out.append(load_png(TMP))
    b, c, d = out
    nx = ((lin_in(b, 0) - 0.5) * 2).astype(np.float32)
    ny = ((lin_in(b, 1) - 0.5) * 2).astype(np.float32)
    D = ((lin_in(b, 2) - 0.5) * 4.0).astype(np.float32)
    ux = ((lin_in(c, 0) - 0.5) * 0.8).astype(np.float32)
    uy = ((lin_in(c, 1) - 0.5) * 0.8).astype(np.float32)
    uz = (lin_in(c, 2) * 2.0).astype(np.float32)
    gp = np.where(al, np.rint(lin_in(d, 0) * 32).astype(np.int32), 0)
    return idv, nx, ny, D, ux, uy, uz, gp


def render_pair():
    r = render_all()
    return r[:4]


def set_attrs():
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in PARTS:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        n = len(me.vertices)
        co = np.empty(n * 3, np.float32)
        me.vertices.foreach_get("co", co)
        nr = np.empty(n * 3, np.float32)
        me.vertex_normals.foreach_get("vector", nr)
        M = np.array(ev.matrix_world, np.float64)
        w = co.reshape(n, 3).astype(np.float64) @ M[:3, :3].T + M[:3, 3]
        nw = nr.reshape(n, 3).astype(np.float64) @ M[:3, :3].T
        nw /= np.maximum(np.linalg.norm(nw, axis=1, keepdims=True), 1e-9)
        c = np.stack([0.5 + 0.5 * (nw @ RIGHT_NP), 0.5 + 0.5 * (nw @ UP_NP), np.clip(0.5 + (w @ BACK_NP) / 4.0, 0, 1), np.ones(n)], 1).astype(np.float32)
        ob.data.color_attributes[ATTR].data.foreach_set("color", c.ravel())
        ob.data.update()
        ev.to_mesh_clear()
    bpy.context.view_layer.update()


# ------------------------------------------------------------------ sombreamento em 4x e redução
LK = np.array((-0.50, 0.35, 0.80))
LK /= np.linalg.norm(LK)
LF = np.array((0.62, -0.10, 0.50))
LF /= np.linalg.norm(LF)
AMB, KEY, FILL = 0.14, 0.64, 0.16
AO_R, AO_D, AO_K = 11, 0.055, 0.26


def box_mean(a, w, r):
    def csum(x, axis):
        c = np.cumsum(np.pad(x, [(r + 1, r) if i == axis else (0, 0) for i in range(2)]), axis=axis)
        n = x.shape[axis]
        sl = lambda s: tuple(s if i == axis else slice(None) for i in range(2))
        return c[sl(slice(2 * r + 1, 2 * r + 1 + n))] - c[sl(slice(0, n))]
    num = csum(csum(a * w, 0), 1)
    den = csum(csum(w.astype(np.float64), 0), 1)
    return num / np.maximum(den, 1e-6)


def shade384(idv, nx, ny, D):
    aok = MAT_AO[np.maximum(idv, 0)]
    m = idv >= 0
    L = np.sqrt(np.maximum(nx * nx + ny * ny, 1e-9))
    sc_ = np.where(L > 1, 1 / L, 1.0)
    nx, ny = nx * sc_, ny * sc_
    nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
    k = np.clip(nx * LK[0] + ny * LK[1] + nz * LK[2], 0, 1)
    f = np.clip(nx * LF[0] + ny * LF[1] + nz * LF[2], 0, 1)
    s = AMB + KEY * k + FILL * f
    Dm = np.where(m, D, 0).astype(np.float64)
    mean = box_mean(Dm, m.astype(np.float64), AO_R)
    ao = np.clip((mean - D) / AO_D, 0, 1) * m
    return (s - AO_K * aok * ao).astype(np.float32)


BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16.0 - 0.5


def blocks(a):
    return a.reshape(TILE, SS, TILE, SS)


def reduce96(idv, s, D, extras=(), gp=None):
    cnt = np.zeros((NM, TILE, TILE), np.float32)
    ssum = np.zeros_like(cnt)
    dsum = np.zeros_like(cnt)
    for m in range(NM):
        sel = idv == m
        if not sel.any():
            continue
        cnt[m] = blocks(sel).sum((1, 3))
        ssum[m] = blocks(np.where(sel, s, 0)).sum((1, 3))
        dsum[m] = blocks(np.where(sel, D, 0)).sum((1, 3))
    tot = cnt.sum(0)
    dom = (cnt * MAT_W[:, None, None]).argmax(0)
    cd = np.take_along_axis(cnt, dom[None], 0)[0]
    alpha = tot >= 8
    s96 = np.take_along_axis(ssum, dom[None], 0)[0] / np.maximum(cd, 1)
    d96 = np.take_along_axis(dsum, dom[None], 0)[0] / np.maximum(cd, 1)
    mat = np.where(alpha, dom, -1)
    ex96 = []
    if extras:
        dom_up = np.repeat(np.repeat(dom, SS, 0), SS, 1)
        selD = idv == dom_up
        nsel = np.maximum(blocks(selD).sum((1, 3)), 1)
        for e in extras:
            ex96.append((blocks(np.where(selD, e, 0)).sum((1, 3)) / nsel).astype(np.float32))
        gbest = np.zeros((TILE, TILE), np.int32)
        gcnt = np.full((TILE, TILE), -1.0, np.float32)
        for g in np.unique(gp[selD]):
            c = blocks(selD & (gp == g)).sum((1, 3)).astype(np.float32)
            upd = c > gcnt
            gbest = np.where(upd, g, gbest)
            gcnt = np.where(upd, c, gcnt)
        ex96.append(gbest)
    return mat, s96, np.where(alpha, d96, -9.0).astype(np.float32), ex96


def shift(a, dy, dx, fill):
    h, w = a.shape[-2:]
    p = np.pad(a, [(0, 0)] * (a.ndim - 2) + [(1, 1), (1, 1)], constant_values=fill)
    return p[..., 1 + dy:1 + dy + h, 1 + dx:1 + dx + w]


N4 = ((-1, 0), (1, 0), (0, -1), (0, 1))
N8 = tuple((dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0))


def tones96(mat, s96, tex=0.0):
    num = np.zeros_like(s96)
    den = np.zeros_like(s96)
    kern = {(0, 0): 4, (-1, 0): 2, (1, 0): 2, (0, -1): 2, (0, 1): 2, (-1, -1): 1, (-1, 1): 1, (1, -1): 1, (1, 1): 1}
    for (dy, dx), wk in kern.items():
        nm = shift(mat, dy, dx, -1)
        sv = shift(s96, dy, dx, 0.0)
        sel = (nm == mat) & (mat >= 0)
        num += wk * sel * sv
        den += wk * sel
    sm = num / np.maximum(den, 1e-6)
    sf = 0.45 * s96 + 0.55 * sm + tex - MAT_BIAS[np.maximum(mat, 0)]
    yy, xx = np.mgrid[0:TILE, 0:TILE]
    bay = BAYER[yy % 4, xx % 4]
    sf = sf + bay * MAT_DITH[np.maximum(mat, 0)]
    tone = np.zeros(mat.shape, np.int32)
    for m in range(NM):
        sel = mat == m
        if not sel.any():
            continue
        thr = THR_T[MAT_NT[m]]
        t = np.zeros(mat.shape, np.int32)
        for th in thr:
            t += (sf < th)
        tone = np.where(sel, t, tone)
    for _ in range(2):  # remove pixels isolados (nenhum vizinho igual em material e tom)
        same = np.zeros(mat.shape, np.int32)
        stack = []
        for dy, dx in N8:
            nm = shift(mat, dy, dx, -1)
            nt = shift(tone, dy, dx, -1)
            same += (nm == mat) & (nt == tone)
            stack.append(np.where(nm == mat, nt, np.nan))
        iso = (same == 0) & (mat >= 0)
        if iso.any():
            med = np.nanmedian(np.stack(stack), axis=0)
            rep = np.where(np.isnan(med), tone, np.rint(med)).astype(np.int32)
            tone = np.where(iso, rep, tone)
    return np.minimum(tone, np.maximum(MAT_NT[np.maximum(mat, 0)] - 1, 0))


THR_LINE = 0.07
HEAD_MATS = np.array([MID[k] for k in ("pele", "cabelo", "barba", "sobr", "iris", "olhob", "boca")])
LINE_OK = np.ones((32, 32), bool)
for g1, g2 in (("head", "neck"), ("head", "torso"), ("neck", "torso"), ("mao_e", "arm_e"), ("mao_d", "arm_d"),
               ("machado", "mao_d"), ("quadril", "perna_e"), ("quadril", "perna_d"), ("legskin", "perna_e"), ("legskin", "perna_d"),
               ("legskin", "bota_e"), ("legskin", "bota_d"), ("legskin", "quadril"), ("torso", "tun"), ("mao_d", "machado"),
               ("tun", "manga_e"), ("tun", "manga_d"), ("tun", "linho_e"), ("tun", "linho_d")):
    LINE_OK[GID[g1], GID[g2]] = LINE_OK[GID[g2], GID[g1]] = False


def hsh(i, j, k=0):
    x = (np.asarray(i).astype(np.int64) * 73856093) ^ (np.asarray(j).astype(np.int64) * 19349663) ^ (int(k) * 83492791)
    x = (x ^ (x >> 13)) * 1274126177
    x &= 0xFFFFFFFF
    x ^= x >> 16
    return (x & 0xFFFF) / 65535.0


def cloth(mat, ex):
    """Textura pintada a mao (clusters ~2x2 presos ao tecido, em coordenadas do modelo) e costuras/dobras.
    Retorna (tex aditivo na luz, add de tons mais escuros)."""
    nz, ux, uy, uz, grp = ex
    P = PIX
    th = np.arctan2(ux, -uy)
    r = np.hypot(ux, uy)
    u = th * r
    face = np.clip((nz - 0.30) / 0.45, 0, 1)
    isT, isL, isP = mat == MID["tunica"], mat == MID["linho"], mat == MID["calca"]
    isB, isC, isG = mat == MID["bota"], mat == MID["couro"], mat == MID["gorro"]
    cloth_m = isT | isL | isP | isG
    leather = isB | isC
    tex = np.zeros(mat.shape, np.float32)
    add = np.zeros(mat.shape, np.int32)
    # trama: xadrez de clusters 2x2 + manchas
    c = 2.0 * P
    ci, cj = np.floor(u / c), np.floor(uz / c)
    weave = (((ci + cj) % 2) - 0.5)
    h = hsh(ci, cj, 1)
    blot = np.where(h < 0.17, -0.05, np.where(h > 0.90, 0.045, 0.0))
    tex += np.where(cloth_m, 0.022 * weave + blot, 0.0) * face
    tex += np.where(leather, 0.014 * weave + 0.7 * blot, 0.0) * face
    # dobras verticais (saia da tunica, tunica, calca, manga)
    cu = np.floor(u / (1.3 * P))
    jit = hsh(cu, 0, 7) * 5 * P
    cv = np.floor((uz + jit) / (5 * P))
    hv = hsh(cu, cv, 3)
    vz = (isT & (uz < 1.38)) | isP | (isT & (grp == GID["manga_e"])) | (isT & (grp == GID["manga_d"]))
    tex -= np.where(vz & (hv < 0.20), 0.10, 0.0) * face
    # dobras horizontais: linho arregacado, joelho/tornozelo da calca, cano da bota
    cuh = np.floor(u / (3.5 * P))
    jh = hsh(cuh, 0, 9) * 2 * P
    czh = np.floor((uz + jh) / (1.7 * P))
    hh = hsh(cuh, czh, 5)
    hz = isL | (isP & (uz > 0.36) & (uz < 0.62)) | (isB & (uz > 0.17) & (uz < 0.30))
    tex -= np.where(hz & (hh < 0.34), 0.11, 0.0) * face
    # costuras (tom +1): bainha da tunica tracejada, costuras laterais, remendo no joelho, dobras da bota
    dash = (np.floor(u / (2 * P)) % 2) == 0
    add += (isT & (grp == GID["tun"]) & (np.abs(uz - (Z_HEM + 0.034)) < 0.62 * P) & dash).astype(np.int32)
    side = (np.abs(np.abs(th) - math.pi / 2) * r < 0.55 * P)
    add += (side & ((isT & (grp == GID["tun"]) & (uz < 1.38)) | (isP & (uz > 0.34)))).astype(np.int32)
    hw, z0, z1 = 0.050, 0.468, 0.575
    knee = isP & (np.abs(th) < 1.1) & (np.abs(u) < hw) & (uz > z0) & (uz < z1) & (uz < 0.60)
    edge = knee & ((np.abs(u) > hw - 0.9 * P) | (uz < z0 + 0.95 * P) | (uz > z1 - 0.95 * P))
    add += edge.astype(np.int32)
    tex += np.where(knee & ~edge, 0.07, 0.0) * face
    front = np.abs(th) < 1.2
    for zb in (0.232, 0.190):
        add += (isB & front & (np.abs(uz - zb) < 0.55 * P) & (grp >= GID["bota_e"])).astype(np.int32)
    tex += np.where(isB & front & (uz > 0.282) & (uz < 0.312), -0.20, 0.0)   # borda do cano: luz
    add += (isB & front & (np.abs(uz - 0.262) < 0.55 * P) & (uz < 0.30)).astype(np.int32)
    toe = isB & (uz < 0.10) & (np.abs(uy + 0.092) < 0.55 * P) & (grp >= GID["bota_e"])
    add += toe.astype(np.int32)
    return tex.astype(np.float32), np.minimum(add, 2)


def inner_lines(grp, mat, Dc, layerC, K):
    mark = np.zeros(mat.shape, bool)
    g = np.clip(grp, 0, 31)
    for dy, dx in N4:
        qg = np.clip(shift(grp, dy, dx, 0), 0, 31)
        qm = shift(mat, dy, dx, -1)
        qd = shift(Dc, dy, dx, -9.0)
        ql = shift(layerC, dy, dx, -1)
        diff = (qm >= 0) & (qg != g) & LINE_OK[g, qg]
        far = (Dc < qd - 0.003) | ((np.abs(Dc - qd) <= 0.003) & (g < qg))
        mark |= K & diff & (((ql == layerC) & far) | ((ql >= 0) & (ql < layerC)))
    return mark


def paint_layer(mat, tone, Dc, layerC, K, grp, with_ring=True):
    """K = pixels desta camada. Retorna rgba 96x96 e mapa de profundidade (com anel)."""
    t2 = tone.copy()
    mark = np.zeros(mat.shape, bool)
    thr = np.where(np.isin(mat, HEAD_MATS), 0.11, THR_LINE)
    for dy, dx in N4:
        qm = shift(mat, dy, dx, -1)
        qd = shift(Dc, dy, dx, -9.0)
        ql = shift(layerC, dy, dx, -1)
        q_alpha = qm >= 0
        nearer = q_alpha & (qd - Dc > thr)
        mine_nearer_other = q_alpha & (ql != layerC) & (Dc - qd > thr)
        mark |= K & (nearer | mine_nearer_other)
    nt = np.maximum(MAT_NT[np.maximum(mat, 0)] - 1, 0)
    t2 = np.where(mark, np.minimum(t2 + 2, nt), t2)
    out = np.zeros((TILE, TILE, 4), np.uint8)
    for m in range(NM):
        sel = K & (mat == m)
        if not sel.any():
            continue
        r = MATS[MAT_NAMES[m]]["r"]
        for t in range(len(r)):
            out[sel & (t2 == t), :3] = r[t]
    out[K, 3] = 255
    lines = inner_lines(grp, mat, Dc, layerC, K) & ~np.isin(mat, [MID["iris"], MID["olhob"], MID["boca"], MID["sobr"]])
    out[lines, :3] = INNER
    Dfull = np.where(K, Dc, -9.0).astype(np.float32)
    if with_ring:
        dil = np.zeros(K.shape, bool)
        Dn = np.full(K.shape, -9.0, np.float32)
        for dy, dx in N4:
            qk = shift(K, dy, dx, False)
            dil |= qk
            Dn = np.where(qk, np.maximum(Dn, shift(np.where(K, Dc, -9.0).astype(np.float32), dy, dx, -9.0)), Dn)
        ring = dil & ~K & ~(mat >= 0)
        out[ring, :3] = OUTLINE
        out[ring, 3] = 255
        Dfull = np.where(ring, Dn, Dfull)
    return out, Dfull


CUR_MODE = "livre"


def show(layers):
    for ob in PARTS:
        ob.hide_render = (ob["layer"] not in layers) or (ob["only"] not in ("", CUR_MODE)) or any(ob.name.startswith(h) for h in os.environ.get("HIDE", "~").split(","))


def process_stage(layers, keep_layer):
    show(layers)
    idv, nx, ny, D, ux, uy, uz, gp = render_all()
    s = shade384(idv, nx, ny, D)
    L = np.sqrt(np.maximum(nx * nx + ny * ny, 1e-9))
    k_ = np.where(L > 1, 1 / L, 1.0)
    nz = np.sqrt(np.clip(1 - (nx * k_) ** 2 - (ny * k_) ** 2, 0, 1)).astype(np.float32)
    mat, s96, D96, ex = reduce96(idv, s, D, extras=[nz, ux, uy, uz], gp=gp)
    if os.environ.get("DBG") and keep_layer == os.environ.get("DBG"):
        ch = {m: k[0] for k, m in MID.items()}
        ch[MID["sobr"]] = "S"; ch[MID["barba"]] = "b"; ch[MID["iris"]] = "I"; ch[MID["olhob"]] = "o"; ch[MID["boca"]] = "B"; ch[MID["cabelo"]] = "h"; ch[MID["pele"]] = "."
        for r in range(2, 26):
            print("%2d " % r + "".join(" " if mat[r, c] < 0 else ch[mat[r, c]] for c in range(36, 60)))
    tex, add = cloth(mat, ex)
    tone = tones96(mat, s96, tex)
    nt = np.maximum(MAT_NT[np.maximum(mat, 0)] - 1, 0)
    tone = np.minimum(tone + add, nt)
    layerC = np.where(mat >= 0, MAT_LAYER[np.maximum(mat, 0)], -1)
    K = layerC == LID[keep_layer]
    rgba, Dfull = paint_layer(mat, tone, D96, layerC, K, ex[4])
    return rgba, Dfull, D96, mat, ex[4]


# ------------------------------------------------------------------ poses (A7: IK 3D das pernas, pés plantados, ciclo de marcha clássico)
def Rot(piv, axis, deg):
    return Matrix.Translation(piv) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-Vector(piv))


def BMAT_(n):
    return ARM.data.bones[n].matrix_local


ZA, HEEL, BALL, TOE = 0.088, -0.082, 0.100, 0.198   # tornozelo->solado; calcanhar, junta da ponta (antepé) e bico (coordenada para frente)
HP0 = 3.0                                  # cabeça NIVELADA (+ = leve para baixo; nunca para cima)


def leg_solve(hip, ank, fwd):
    """IK de duas juntas em 3D. Joelho dobra para frente (plano da coxa e do 'fwd' do quadril).
    Devolve (R_coxa 3x3, joelho_flexao_deg, coxa_frente_deg, erro_alcance_m)."""
    v = ank - hip
    d = v.length
    dmax = (L1 + L2) * 0.9995
    err = max(0.0, d - dmax)
    d = min(d, dmax)
    vd = v.normalized()
    k = math.pi - math.acos(max(-1.0, min(1.0, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))))
    b = math.acos(max(-1.0, min(1.0, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))))
    ax = vd.cross(fwd)
    if ax.length < 1e-6:
        ax = Vector((1, 0, 0))
    ax.normalize()
    t = (Matrix.Rotation(b, 3, ax) @ vd).normalized()
    s = fwd.cross(t).normalized()
    y = (-t).cross(s)
    R = Matrix((s, y, -t)).transposed()
    a1 = math.degrees(math.atan2(t.dot(fwd), -t.z))
    return R, math.degrees(k), a1, err


def pelvis_G(P):
    return Matrix.Translation((P.get("dx", 0.0), P.get("dy", 0.0), P.get("dz", 0.0))) @ Rot(PEL, "Z", P.get("ptw", 0.0)) @ Rot(PEL, "Y", P.get("proll", 0.0))


def leg_data(P, sx, s):
    Gp = pelvis_G(P)
    hip = Gp @ Vector((X_HIP * sx, 0, Z_HIP))
    f, z, psi, toe = P["leg_" + s][:4]
    ank = Vector((sx * X_HIP + P.get("fx_" + s, 0.0), -f, z))
    fwd = (Gp.to_3x3() @ Vector((0, -1, 0))).normalized()
    return hip, ank, fwd


INFO = {}


def apply_pose(P):
    T = Matrix.Translation((P.get("dx", 0.0), P.get("dy", 0.0), P.get("dz", 0.0)))
    Gp = pelvis_G(P)
    Gc = T @ Rot((0, 0, 1.0), "X", P.get("lean", 0.0)) @ Rot(SPN, "Z", P.get("ctw", 0.0)) @ Rot(SPN, "Y", P.get("croll", 0.0)) \
        @ Matrix.Translation((0, 0, P.get("breath", 0.0)))
    Gh = Gc @ Rot(NECK, "Z", P.get("hyaw", 0.0)) @ Rot(NECK, "X", P.get("hpitch", 0.0)) @ Rot(NECK, "Y", P.get("hroll", 0.0))
    G = {"pelvis": Gp, "coluna": Gc, "cabeca": Gh}
    sp = P.get("skirt", (0.0, 0.0, 0.0))
    G["saia_f"] = Gp @ Rot((0, -0.12, Z_BELT), "X", -sp[0])
    G["saia_t"] = Gp @ Rot((0, 0.12, Z_BELT), "X", sp[1])
    G["saia_l"] = Gp @ Rot((0, 0, Z_BELT), "Y", sp[2])
    info = {}
    for sx, s in ((1, "e"), (-1, "d")):
        G["ombro_" + s] = Gc
        a, phi, e, w = P["arm_" + s]
        S_ = Vector((X_SH * sx, 0, Z_SH))
        E_ = Vector((X_SH * sx, 0, Z_EL))
        W_ = Vector((X_SH * sx, 0, Z_WR))
        Ga = Gc @ Rot(S_, "Y", (-phi if sx > 0 else phi)) @ Rot(S_, "X", -a)
        Gf = Ga @ Rot(E_, "X", -e)
        Gm = Gf @ Rot(W_, "X", -w)
        G["braco_" + s], G["antebraco_" + s], G["mao_" + s] = Ga, Gf, Gm
        hip, ank, fwd = leg_data(P, sx, s)
        R, k, a1, err = leg_solve(hip, ank, fwd)
        H_ = Vector((X_HIP * sx, 0, Z_HIP))
        K_ = Vector((X_HIP * sx, 0, Z_KN))
        A_ = Vector((X_HIP * sx, 0, Z_AN))
        Gt = Matrix.Translation(hip) @ R.to_4x4() @ Matrix.Translation(-H_)
        Gs = Gt @ Rot(K_, "X", k)
        psi, toe = P["leg_" + s][2], P["leg_" + s][3]
        Rf = Matrix.Rotation(math.radians(toe * sx), 3, "Z") @ Matrix.Rotation(math.radians(-psi), 3, "X")
        Gfoot = Matrix.Translation(ank) @ Rf.to_4x4() @ Matrix.Translation(-A_)
        beta = P["leg_" + s][4] if len(P["leg_" + s]) > 4 else 0.0
        Gtoe = Gfoot @ Rot(Vector((X_HIP * sx, -BALL, 0.0)), "X", -beta)
        G["coxa_" + s], G["canela_" + s], G["pe_" + s], G["ponta_" + s] = Gt, Gs, Gfoot, Gtoe
        heel = Gfoot @ Vector((X_HIP * sx, -HEEL, 0.0))
        toep = Gtoe @ Vector((X_HIP * sx, -TOE, 0.0))
        info[s] = dict(k=k, a1=a1, err=err, ank=tuple(Gs @ A_), heel=tuple(heel), toe=tuple(toep))
    INFO.clear()
    INFO.update(info)
    for n, M in G.items():
        ARM.pose.bones[n].matrix = M @ BMAT_(n)
    bpy.context.view_layer.update()
    return G


def ease(v):
    return v * v * (3 - 2 * v)


PSI_ST = [(0.0, 18.0), (0.10, 2.0), (0.32, 0.0), (0.42, -8.0), (0.50, -20.0), (0.60, -32.0)]
PSI_SW = [(0.0, -32.0), (0.20, -20.0), (0.45, -4.0), (0.80, 10.0), (1.0, 18.0)]
PH_FLAT = 0.32
WALK = dict(step=0.30, clear=0.050, bob=0.046, sway=0.022, ptw=6.0, ctw=8.0, proll=3.0, croll=2.0, lean=3.0, arm=17.0, arm_back=23.0)


def kint(k, x):
    return float(np.interp(x, [a for a, _ in k], [b for _, b in k]))


def stance_raw(ph, v):
    psi = kint(PSI_ST, ph)
    r = math.radians(psi)
    if ph <= PH_FLAT:
        X, c = -v * ph, HEEL
    else:
        X, c = -v * PH_FLAT + (BALL - HEEL) - v * (ph - PH_FLAT), BALL
    return X - (c * math.cos(r) + ZA * math.sin(r)), ZA * math.cos(r) - c * math.sin(r), psi


def toe_bend(psi, t=None):
    """O antepé (osso 'ponta') fica chato no chão enquanto o calcanhar sobe; solta depois do toe-off."""
    b = max(0.0, -psi)
    if t is not None:
        b *= max(0.0, 1.0 - t / 0.30)
    return b


def sole_min(za, psi, beta=0.0):
    r, rb = math.radians(psi), math.radians(psi + beta)
    ball_z = za + BALL * math.sin(r) - ZA * math.cos(r)
    return min(za + HEEL * math.sin(r) - ZA * math.cos(r), ball_z, ball_z + (TOE - BALL) * math.sin(rb))


def foot_walk(ph, v, clear):
    ph = ph % 1.0
    f_off = -stance_raw(0.25, v)[0]
    if ph < 0.6:
        f, z, psi = stance_raw(ph, v)
    else:
        t = (ph - 0.6) / 0.4
        f0, z0, p0 = stance_raw(0.6, v)
        f1, z1, p1 = stance_raw(0.0, v)
        f = f0 + (f1 - f0) * ease(t)
        psi = kint(PSI_SW, t)
        z = z0 + (z1 - z0) * t + clear * math.sin(math.pi * t ** 0.8)
        beta = toe_bend(psi, t)
        z = max(z, z - sole_min(z, psi, beta) + 0.004)
        return f + f_off, z, psi, beta
    return f + f_off, z, psi, toe_bend(psi)


def walk_series(gain=1.0, W=WALK):
    W = dict(W, sway=W["sway"] * gain, proll=W["proll"] * gain, croll=W["croll"] * gain)   # S/N: mais balanço para ler de frente/costas
    ell = W["step"] * gain
    v = 2 * ell
    out = []
    for f in range(8):
        P = dict(hpitch=0.0, breath=0.0)
        phe, phd = (f / 8.0) % 1.0, (f / 8.0 + 0.5) % 1.0
        fe, ze, se, be = foot_walk(phe, v, W["clear"])
        fd, zd, sd, bd = foot_walk(phd, v, W["clear"])
        P["leg_e"] = (fe, ze, se, 7.0, be)
        P["leg_d"] = (fd, zd, sd, 7.0, bd)
        c = math.cos(2 * math.pi * phe)           # +1 quando o pé esquerdo está à frente (contato)
        sn = math.sin(2 * math.pi * f / 8.0)
        P["ptw"] = -W["ptw"] * c
        P["ctw"] = W["ctw"] * c
        P["proll"] = -W["proll"] * sn
        P["croll"] = W["croll"] * sn
        P["dx"] = W["sway"] * sn
        P["lean"] = W["lean"]
        bob = (-0.13, -1.0, -0.35, 0.0)[f % 4] * W["bob"]
        # alcance: a perna de apoio nunca estica além de 99,8% (pé plantado, sem deslizar nem flutuar)
        lim = 9.0
        for s_, ph_, ff, zz in (("e", phe, fe, ze), ("d", phd, fd, zd)):
            if ph_ < 0.6:
                hx = math.hypot(ff, P["dx"])
                lim = min(lim, zz + math.sqrt(((L1 + L2) * 0.998) ** 2 - hx * hx) - Z_HIP)
        P["dz"] = min(bob, lim)
        P["hroll"] = -0.8 * P["croll"]
        out.append(P)
    # cabeça estabilizada: contra-gira com atraso de 1 quadro, nivelada (inclinação total = HP0)
    for i, P in enumerate(out):
        Pp = out[(i - 1) % 8]
        P["hyaw"] = -0.7 * Pp["ctw"]
        P["hpitch"] = HP0 - P["lean"]
    # braços: opostos às pernas; cotovelo sempre dobrado (15-35 graus) e fecha quando o braço vai à frente; antebraço atrasa 1 quadro
    for i, P in enumerate(out):
        for s_ in ("e", "d"):
            ph = ((i / 8.0) + (0.0 if s_ == "e" else 0.5)) % 1.0
            u = -math.cos(2 * math.pi * ph)                         # +1 = braço à frente
            ul = -math.cos(2 * math.pi * (((i - 1) / 8.0 + (0.0 if s_ == "e" else 0.5)) % 1.0))
            ull = -math.cos(2 * math.pi * (((i - 2) / 8.0 + (0.0 if s_ == "e" else 0.5)) % 1.0))
            P["arm_" + s_] = (3.0 + (W["arm"] if u > 0 else W["arm_back"]) * u, 6.0 + 1.5 * abs(u), 24.0 + 9.0 * ul, -5.0 * ull)
    add_skirt(out, walk=True)
    return out


def leg_angles(P):
    r = {}
    for sx, s in ((1, "e"), (-1, "d")):
        hip, ank, fwd = leg_data(P, sx, s)
        R, k, a1, err = leg_solve(hip, ank, fwd)
        r[s] = (a1, k, err)
    return r


def add_skirt(series, walk=False, c=1.0):
    n = len(series)
    for P in series:
        la = leg_angles(P)
        P["a1_e"], P["a1_d"] = la["e"][0], la["d"][0]
    for i, P in enumerate(series):
        Pf, Pt = series[(i - 1) % n], series[(i - 2) % n]
        if walk:
            thf = 0.85 * max(Pf["a1_e"], Pf["a1_d"], 0.0)
            tht = 0.60 * max(-Pt["a1_e"], -Pt["a1_d"], 0.0)
            thl = 3.0 * math.sin(2 * math.pi * (i - 1.5) / 8.0)
        else:
            dl = Pf.get("lean", 0.0) - series[(i - 2) % n].get("lean", 0.0)
            thf, tht, thl = -c * dl, c * dl, 0.0
            if "breath" in P:
                thf += 40.0 * (Pf["breath"] - 0.0)
        P["skirt"] = (thf, tht, thl)


def idle_series():
    out = []
    for f in range(4):
        P = dict(breath=[0.0, 0.004, 0.009, 0.004][f], lean=0.0, ctw=0.0, ptw=0.0, dz=-0.002, dx=0.002 * [0, 1, 0, -1][f], proll=0.0)
        sw = [0.0, 0.5, 1.0, 0.5][f]
        P["arm_e"] = (2.0 + sw * 1.0, 5.0, 12.0 + sw * 1.5, 0.0)
        P["arm_d"] = (2.0 + sw * 1.0, 5.0, 12.0 + sw * 1.5, 0.0)
        P["leg_e"] = (0.0, ZA, 0.0, 7.0)
        P["leg_d"] = (0.0, ZA, 0.0, 7.0)
        P["hyaw"], P["hpitch"] = 0.0, HP0 - 0.0 + 0.4 * [0, 1, 2, 1][f]
        out.append(P)
    add_skirt(out, walk=False, c=0.0)
    for P in out:
        P["skirt"] = (0.6 * P["breath"] / 0.009, 0.0, 0.0)
    return out


# Ajuste por direção do arco do machado (dphi, dcotovelo, drho): em N e NO a lâmina ficava atrás da cabeça na projeção;
# cotovelo mais aberto / cabo mais para a frente afasta a lâmina da cabeça (medido por tool_metrics: folga >= 4 px).
STRIKE_ADJ = {
    "N": [(0, 0, 0), (0, 0, 0), (0, -25, -30), (0, -25, -30), (0, -25, -30), (0, 0, 0), (0, 0, 0), (0, 0, 0)],
    "NO": [(0, 0, -30), (0, 0, -45), (0, 0, -30), (0, 0, -30), (0, 0, -30), (0, 0, -30), (0, 0, 0), (0, 0, 0)],
}


def strike_series(dname=None):
    out = []
    #       a    phi   e     rho   lean  ctw  dz     dy
    KS = [(20, 10, 50, 160, 0.0, 0.0, 0.000, 0.000),
          (30, 30, 70, 188, -2.0, -4.0, 0.000, 0.000),
          (32, 56, 88, 190, -4.0, -8.0, -0.004, 0.000),
          (32, 78, 98, 184, -5.0, -11.0, -0.008, 0.004),
          (32, 80, 100, 184, -5.5, -12.0, -0.008, 0.005),
          (36, 20, 36, 155, 4.0, -2.0, -0.034, -0.012),
          (30, 12, 16, 100, 7.0, 7.0, -0.070, -0.030),
          (26, 10, 44, 130, 3.0, 3.0, -0.030, -0.015)]
    if os.environ.get("GK"):
        KS = json.loads(os.environ["GK"])
    for f in range(8):
        a, phi, e, rho, lean, ctw, dz, dy = KS[f]
        P = dict(lean=lean, ctw=ctw, dz=dz, dy=dy, ptw=-ctw * 0.5, hyaw=-ctw * 0.5, breath=0.0)
        P["hpitch"] = HP0 - lean * 0.85
        P["arm_e"] = (8.0 - 0.15 * a, 6.0, 22.0 + 0.25 * a, 0.0)
        dphi, de, drho = STRIKE_ADJ.get(dname, [(0, 0, 0)] * 8)[f]
        phi, e, rho = phi + dphi, e + de, rho + drho
        w = max(-70.0, min(70.0, rho - 90.0 - (a + e)))
        P["arm_d"] = (a, phi, e, w)
        P["leg_e"] = (0.12, ZA, 3.0, 7.0)
        P["leg_d"] = (-0.14, ZA, 0.0, 7.0)
        out.append(P)
    add_skirt(out, walk=False, c=1.0)
    return out


STRIDE_GAIN = {"S": 1.30, "SE": 1.12, "L": 1.0, "NE": 1.12, "N": 1.30, "NO": 1.12, "O": 1.0, "SO": 1.12}
SERIES_CACHE = {}


def build_series(anim, dname):
    key = (anim, STRIDE_GAIN[dname] if anim == "andar" else 1.0, dname if anim == "golpear" else "")
    if key not in SERIES_CACHE:
        SERIES_CACHE[key] = {"parado": idle_series, "golpear": lambda: strike_series(dname)}.get(anim, lambda: walk_series(key[1]))()
    return SERIES_CACHE[key]


def yaw_for(dname):
    dx, dy = DIR_SCREEN[dname]
    rh = Vector((RIGHT.x, RIGHT.y, 0)).normalized()
    dh = Vector((BACK.x, BACK.y, 0)).normalized()
    f = rh * dx + dh * dy
    return math.atan2(f.x, -f.y)


def project_hand(G):
    p = ARM.matrix_world @ (G["mao_d"] @ Vector((-X_SH, 0, HAND_C)))
    c = world_to_camera_view(sc, cam, p)
    bh = Vector((BACK.x, BACK.y, 0)).normalized()
    depth = (p - ARM.matrix_world.translation).dot(bh)
    return float(c.x * TILE), float((1.0 - c.y) * TILE), float(depth)


def extent(img):
    ys, xs = np.nonzero(img[..., 3])
    return (int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())) if len(ys) else (0, 0, 0, 0)


def compose(order):
    out = np.zeros((TILE, TILE, 4), np.uint8)
    for im in order:
        m = im[..., 3] > 0
        out[m] = im[m]
    return out


# ------------------------------------------------------------------ metricas do golpear (topo e folga ate a cabeca)
def render_ids(pred):
    for ob in PARTS:
        ob.hide_render = not pred(ob)
    shd.light, shd.color_type = "FLAT", "MATERIAL"
    bpy.ops.render.render(write_still=True)
    a = load_png(TMP)
    al = a[..., 3] > 0.5
    return np.where(al, np.rint(lin_in(a, 0) * 32).astype(np.int32) - 1, -1)


def tool_metrics():
    """(topo_y da ferramenta sem contorno, folga Chebyshev lamina-cabeca em px, topo_y da lamina)"""
    ids = render_ids(lambda ob: ob["layer"] == "ferramenta" and ob["only"] in ("", CUR_MODE))
    tm = blocks(ids >= 0).sum((1, 3)) >= 8
    bl = blocks(ids == MID["ferro"]).sum((1, 3)) >= 6
    hd = blocks(render_ids(lambda ob: ob["grp"] in (GID["head"], GID["cap"])) >= 0).sum((1, 3)) >= 8
    if not tm.any():
        return 99, 99, 99
    top = int(np.nonzero(tm.any(1))[0].min())
    btop = int(np.nonzero(bl.any(1))[0].min()) if bl.any() else 99
    gap = 99
    if bl.any() and hd.any():
        cur = hd.copy()
        for k in range(0, 8):
            if (cur & bl).any():
                gap = k
                break
            nxt = cur.copy()
            for dy, dx in N8:
                nxt |= shift(cur, dy, dx, False)
            cur = nxt
    return top, gap, btop


# ------------------------------------------------------------------ laço principal
if os.environ.get("SEARCH"):
    import itertools
    CUR_MODE = "golpear"
    base = strike_series(None)
    res = []
    for dname in os.environ["SEARCH"].split(","):
        ARM.rotation_euler = (0, 0, yaw_for(dname))
        for f in range(0, 7):
            a0, ph0, e0, w0 = base[f]["arm_d"]
            rho0 = w0 + 90 + a0 + e0
            for dphi, de, drho in itertools.product((0, 20, 40, 60), (0, -25, -50), (-60, -30, 0, 30)):
                P = dict(base[f])
                e1 = max(5.0, e0 + de)
                w1 = max(-70.0, min(70.0, rho0 + drho - 90.0 - (a0 + e1)))
                P["arm_d"] = (a0, ph0 + dphi, e1, w1)
                apply_pose(P)
                set_attrs()
                t = tool_metrics()
                res.append((dname, f, dphi, de, drho, t[0], t[1], t[2], round(w1, 1)))
    json.dump(res, open(os.path.join(OUT, "search_%s.json" % TAG), "w"))
    print("SEARCH FEITO", len(res), "t=%.0fs" % (time.time() - T0))
    sys.exit(0)

anchors = {"celula": TILE, "pivo": list(PIVOT), "origem_chao_y": round(ORIGIN_Y, 2),
           "nota": "mao_x/mao_y em pixels da celula 96x96 (y para baixo), centro do punho direito (onde o cabo atravessaria no golpear); "
                   "profundidade = distancia ao eixo do corpo em direcao a camera (+ = mais perto). "
                   "Parado/andar: sem ferramenta (camadas ferramenta* vazias), ancora mantida para equipar depois. "
                   "Ordem de desenho: ferramenta_tras, corpo, calca_botas, tunica, gorro, ferramenta_frente.",
           "anims": {}}
stats = []
FOOT_LOG = []
ANCH_PATH = os.path.join(OUT, "mao_anchors_%s.json" % TAG)
nr = 0
TM = []
EMPTY = np.zeros((TILE, TILE, 4), np.uint8)
for anim, nf in ANIMS.items():
    CUR_MODE = "golpear" if anim == "golpear" else "livre"
    nf = min(nf, FMAX)
    anchors["anims"][anim] = {}
    for dname in DIRS:
        ARM.rotation_euler = (0, 0, yaw_for(dname))
        lst = []
        series = build_series(anim, dname)
        for f in range(nf):
            P = series[f]
            G = apply_pose(P)
            FOOT_LOG.append((anim, dname, f, {k: dict(v) for k, v in INFO.items()}, float(P.get("dz", 0.0)), float(P.get("dx", 0.0)),
                             list(P["arm_e"]), list(P["arm_d"]), float(P.get("hpitch", 0.0) + P.get("lean", 0.0)), float(P.get("ptw", 0.0)), float(P.get("ctw", 0.0))))
            hx, hy, depth = project_hand(G)
            lst.append({"quadro": f, "mao_x": round(hx, 2), "mao_y": round(hy, 2), "profundidade": round(depth, 3)})
            set_attrs()
            if CHECK:
                idv = render_ids(lambda ob: ob["only"] in ("", CUR_MODE))
                m96 = blocks(idv >= 0).sum((1, 3)) >= 8
                ys, xs = np.nonzero(m96)
                stats.append((anim, dname, f, int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())))
                nr += 1
                if anim == "golpear":
                    TM.append((anim, dname, f) + tool_metrics())
                    nr += 2
                continue
            res = {}
            Dc4 = None
            grp4 = None
            for lay, stage in (("corpo", {"corpo"}), ("calca_botas", {"corpo", "calca_botas"}),
                               ("tunica", {"corpo", "calca_botas", "tunica"}),
                               ("gorro", {"corpo", "calca_botas", "tunica", "gorro"})):
                rgba, Df, D96, mat, grp4 = process_stage(stage, lay)
                res[lay] = rgba
                Dc4 = D96
                nr += 4
            if anim == "golpear":
                tool, Dt, _, _, _ = process_stage({"ferramenta"}, "ferramenta")
                nr += 4
                TM.append((anim, dname, f) + tool_metrics())
                nr += 2
            else:
                tool, Dt = EMPTY.copy(), np.full((TILE, TILE), -9.0, np.float32)
            tm = tool[..., 3] > 0
            front = tm & ((Dt >= Dc4 - 0.004) | (Dc4 < -8))
            tf = np.zeros_like(tool)
            tf[front] = tool[front]
            tb = np.zeros_like(tool)
            tb[tm & ~front] = tool[tm & ~front]
            res["ferramenta"] = tool
            res["ferramenta_frente"], res["ferramenta_tras"] = tf, tb
            comp = compose([tb, res["corpo"], res["calca_botas"], res["tunica"], res["gorro"], tf])
            res["composta"] = comp
            for pn, arr in res.items():
                save_png(arr, os.path.join(FR, "%s_%s_%02d_%s.png" % (anim, dname, f, pn)))
            stats.append((anim, dname, f) + extent(comp))
        anchors["anims"][anim][dname] = lst
        print("OK", anim, dname, "t=%.0fs" % (time.time() - T0), "renders", nr, flush=True)
with open(ANCH_PATH, "w") as fh:
    json.dump(anchors, fh, indent=1, ensure_ascii=False)
with open(os.path.join(OUT, "stats_%s.json" % TAG), "w") as fh:
    json.dump(stats, fh)
with open(os.path.join(OUT, "pes_%s.json" % TAG), "w") as fh:
    json.dump(FOOT_LOG, fh)
if TM:
    with open(os.path.join(OUT, "tool_%s.json" % TAG), "w") as fh:
        json.dump(TM, fh)
    print("FERRAMENTA topo_min", min(t[3] for t in TM), "folga_min", min(t[4] for t in TM), "lamina_topo_min", min(t[5] for t in TM))
    bad = [t for t in TM if t[3] < 4 or t[4] < 4]
    for t in bad:
        print("  RUIM", t)
if stats:
    print("BBOX y[%d..%d] x[%d..%d]" % (min(s[3] for s in stats), max(s[4] for s in stats), min(s[5] for s in stats), max(s[6] for s in stats)))
    for anim in ANIMS:
        rows = [s for s in stats if s[0] == anim]
        if rows:
            print("ANIM", anim, "topo", min(r[3] for r in rows), max(r[3] for r in rows), "base", min(r[4] for r in rows), max(r[4] for r in rows))
if os.path.exists(TMP):
    os.remove(TMP)
print("DONE t=%.1fs" % (time.time() - T0))
