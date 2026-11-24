"""Cubo de teste da biblioteca pixel_pipeline (fatia D0 do plano masmorra v2).

Quatro animacoes (parado 4, andar 6, atacar 6, morrer 6), 8 direcoes: 5 renders bilaterais
(S, SE, L, NE, N) e 3 espelhos horizontais (O, SO, NO). Sai um atlas por animacao (linhas = 8 direcoes,
colunas = quadros), manifest.json e uma folha de contato com todas as animacoes.

Ambiente: REPO (raiz do worktree), OUTDIR (pasta de saida), TILE (96 ou 192).
Rodar: REPO=... OUTDIR=... TILE=96 timeout 300 blender -b --factory-startup -P cubo_teste.py
"""
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO = os.environ["REPO"]
sys.path.insert(0, os.path.join(REPO, "art-source", "monsters", "_lib"))
import pixel_pipeline as PP  # noqa: E402

TILE = int(os.environ.get("TILE", "96"))
OUTDIR = os.environ["OUTDIR"]
SAIDA = os.path.join(OUTDIR, "cubo-%d" % TILE)
os.makedirs(SAIDA, exist_ok=True)
H = 0.30                                  # meia aresta do cubo (m); altura 2H, base no chao

MATS = {
    "topo": dict(r=[(240, 210, 156), (218, 184, 124), (186, 150, 96)], layer="corpo", w=1.0, dith=0.02, bias=0.0, ao=0.4),
    "lado_claro": dict(r=[(196, 144, 94), (164, 116, 74), (132, 90, 58)], layer="corpo", w=1.0, dith=0.03, bias=0.0, ao=0.6),
    "lado_escuro": dict(r=[(124, 84, 56), (100, 66, 44), (76, 50, 36)], layer="corpo", w=1.0, dith=0.03, bias=0.0, ao=0.6),
}
ESTILO = PP.Estilo(tile=TILE, mats=MATS, camadas=["corpo"])

# ------------------------------------------------------------------ malha: quatro objetos, um material cada
QUADS = {
    "cubo_topo": ("topo", [[(-H, -H, 2 * H), (H, -H, 2 * H), (H, H, 2 * H), (-H, H, 2 * H)]]),
    "cubo_lados_x": ("lado_claro", [
        [(H, -H, 0), (H, H, 0), (H, H, 2 * H), (H, -H, 2 * H)],
        [(-H, -H, 0), (-H, -H, 2 * H), (-H, H, 2 * H), (-H, H, 0)]]),
    "cubo_lados_y": ("lado_escuro", [
        [(-H, H, 0), (H, H, 0), (H, H, 2 * H), (-H, H, 2 * H)],
        [(-H, -H, 0), (H, -H, 0), (H, -H, 2 * H), (-H, -H, 2 * H)]]),
    "cubo_fundo": ("lado_escuro", [[(-H, -H, 0), (-H, H, 0), (H, H, 0), (H, -H, 0)]]),
}
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
coll = bpy.context.scene.collection
BMAT = {}
for i, nome in enumerate(ESTILO.nomes):
    m = bpy.data.materials.new(nome)
    v = (i + 1) / 32.0                    # id de material, como no build do camponese
    m.diffuse_color = (v, v, v, 1.0)
    BMAT[nome] = m
PARTS = []
for nome, (mat, quads) in QUADS.items():
    verts, faces = [], []
    for q in quads:
        idx = []
        for p in q:
            verts.append(p)
            idx.append(len(verts) - 1)
        faces.append(idx)
    me = bpy.data.meshes.new(nome)
    me.from_pydata(verts, [], faces)
    me.update()
    for an in PP.ATTRS:
        me.color_attributes.new(an, "FLOAT_COLOR", "POINT")
    PP.set_active_attr(me, "nd")
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(n, 3)
    uvc = np.stack([0.5 + co[:, 0] / 0.8, 0.5 + co[:, 1] / 0.8, np.clip(co[:, 2] / 2.0, 0, 1), np.ones(n)], 1)
    me.color_attributes["uv"].data.foreach_set("color", uvc.astype(np.float32).ravel())
    gpc = np.stack([np.full(n, 1 / 32.0), np.zeros(n), np.zeros(n), np.ones(n)], 1).astype(np.float32)
    me.color_attributes["gp"].data.foreach_set("color", gpc.ravel())
    me.materials.append(BMAT[mat])
    ob = bpy.data.objects.new(nome, me)
    coll.objects.link(ob)
    ob["layer"], ob["only"], ob["grp"] = "corpo", "", 1
    PARTS.append(ob)


# ------------------------------------------------------------------ poses (matriz local, antes do giro da direcao)
def pose(anim, f):
    if anim == "parado":                  # respiracao: achata e estica no eixo Z, base fixa
        s = [1.00, 0.985, 1.00, 1.015][f]
        return Matrix.Diagonal(Vector((1, 1, s, 1)))
    if anim == "andar":                   # saltinho com inclinacao leve
        hop = 0.05 * abs(math.sin(math.pi * f / 6))
        tilt = math.radians(4) * math.sin(2 * math.pi * f / 6)
        return Matrix.Translation(Vector((0, 0, hop))) @ Matrix.Rotation(tilt, 4, "X")
    if anim == "atacar":                  # recua, avanca (golpe no quadro 3) e volta
        y = [0.0, -0.05, 0.10, 0.22, 0.12, 0.02][f]
        sz = [1.0, 0.95, 1.0, 0.88, 1.0, 1.0][f]
        return Matrix.Translation(Vector((0, y, 0))) @ Matrix.Diagonal(Vector((1, 1, sz, 1)))
    if anim == "morrer":                  # tomba pela aresta frontal da base ate ficar de lado
        a = math.radians([0, 15, 35, 60, 80, 90][f])
        P = Vector((0, -H, 0))
        return Matrix.Translation(P) @ Matrix.Rotation(a, 4, "X") @ Matrix.Translation(-P)
    raise ValueError(anim)


ANIMS = [("parado", 4, 4, True), ("andar", 6, 10, True), ("atacar", 6, 12, False), ("morrer", 6, 10, False)]

# ------------------------------------------------------------------ camera: escala pela silhueta de todas as poses
pontos = []
for anim, nf, _, _ in ANIMS:
    for f in range(nf):
        M = pose(anim, f)
        for ob in PARTS:
            for v in ob.data.vertices:
                pontos.append(tuple(M @ v.co))
pontos = np.array(pontos, np.float64)
PIPE = PP.Pipeline(ESTILO, PARTS, os.path.join(OUTDIR, "_tmp_cubo_%d.png" % TILE))
PIPE.camera_iso(pontos)
PIPE.preparar_render()
RIGHT_V, BACK_V = PIPE.right, PIPE.back


def yaw_para(dname):
    dx, dy = PP.DIR_SCREEN[dname]
    rh = Vector((RIGHT_V.x, RIGHT_V.y, 0)).normalized()
    dh = Vector((BACK_V.x, BACK_V.y, 0)).normalized()
    f = rh * dx + dh * dy
    return math.atan2(f.x, -f.y)


def pousar(M_local, yaw):
    M = Matrix.Rotation(yaw, 4, "Z") @ M_local
    for ob in PARTS:
        ob.matrix_world = M


# ------------------------------------------------------------------ renders
atlas = {}
manifest_anims = {}
PIPE.modo = "livre"
for anim, nf, fps, loop in ANIMS:
    frames = {}
    for dname in PP.BILATERAL_RENDER:
        cels = []
        for f in range(nf):
            pousar(pose(anim, f), yaw_para(dname))
            PIPE.set_attrs()
            rgba, _, _, _, _ = PIPE.estagio(["corpo"], "corpo")
            cels.append(rgba)
        frames[dname] = cels
    linhas = []
    for d in PP.GAME_DIRS:
        if d in frames:
            linhas.append(frames[d])
        else:
            linhas.append([PP.espelhar(c) for c in frames[PP.ESPELHO_DE[d]]])
    atlas[anim] = linhas
    PP.save_png(PP.montar_atlas(linhas), os.path.join(SAIDA, "%s.png" % anim))
    manifest_anims[anim] = {"frames": nf, "fps": fps, "loop": loop}
    if anim == "atacar":
        manifest_anims[anim]["golpe_quadro"] = 3
    print("ANIM", anim, "quadros", nf, "t", flush=True)


# ------------------------------------------------------------------ folha de contato (todas as animacoes, fundo neutro)
def folha(atlas_por_anim, caminho):
    blocos =[PP.montar_atlas(atlas_por_anim[a]) for a in atlas_por_anim]
    arr = np.concatenate(blocos, axis=1)
    h, w = arr.shape[:2]
    fundo = np.array([92, 104, 96], np.uint8)
    canvas = np.zeros((h, w, 4), np.uint8)
    canvas[..., :3] = fundo
    canvas[..., 3] = 255
    m = arr[..., 3] > 0
    canvas[m, :3] = arr[m, :3]
    lin_cor = np.array([60, 70, 64], np.uint8)
    for y in range(0, h, TILE):
        canvas[y, :, :3] = lin_cor
    for x in range(0, w, TILE):
        canvas[:, x, :3] = lin_cor
    PP.save_png(canvas, caminho)


folha(atlas, os.path.join(OUTDIR, "folha-cubo-%d.png" % TILE))

manifest = {
    "versao": 1,
    "especie": "cubo_teste",
    "tile": TILE,
    "pivo": list(ESTILO.pivo),
    "dirs": "8e",
    "direcoes": PP.GAME_DIRS,
    "espelho": PP.ESPELHO_DE,
    "render_pelo_menos": PP.BILATERAL_RENDER,
    "escala_camera": round(float(PIPE.ppu), 3),
    "anims": manifest_anims,
    "atlas": {a: "%s.png" % a for a in atlas},
    "nota": "teste da biblioteca: cubo de 0,6 m, sem contorno de especie; nao e arte de monstro",
}
with open(os.path.join(SAIDA, "manifest.json"), "w", encoding="utf-8") as fh:
    json.dump(manifest, fh, indent=1, ensure_ascii=False)
tmp = PIPE.tmp
if os.path.exists(tmp):
    os.remove(tmp)
print("DONE tile", TILE, "ppu", round(PIPE.ppu, 2))
