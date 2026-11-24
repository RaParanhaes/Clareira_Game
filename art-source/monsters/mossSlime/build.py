"""Gosma-de-musgo (mossSlime), familia slime, fatia D1 do plano masmorra v2.

Gota gelatinosa verde-musgo com pedrinhas e folhas presas na superficie, dois olhos e um brilho umido.
Escala FISICA do personagem A7 (43,92 px por metro na celula 96): a gota tem ~0,45 m de altura, ~0,25 do
jogador (1,9 m). Nada de autofit.

Render: 4 direcoes radiais (SE, NE, SO, NO), sem espelho (a luz da biblioteca e assimetrica).
Animacoes: parado 4 (pulsar), andar 6 (esticar e saltar), atacar 4 (bote, golpe no quadro 2),
morrer 6 (derreter; fica no ultimo quadro). Saida: uma folha crua por animacao (linhas = direcoes na ordem de
RADIAL4, colunas = quadros) em OUTDIR, e spec.json ao lado deste arquivo.

Ambiente: REPO (raiz do worktree), OUTDIR (saida crua), ANIMS (ex.: parado,andar; padrao todas), TAG (log).
Rodar: REPO=... OUTDIR=... ANIMS=parado timeout 900 blender -b --factory-startup -P build.py
"""
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO = os.environ["REPO"]
LIB = os.path.join(REPO, "art-source", "monsters", "_lib")
sys.path.insert(0, LIB)
import pixel_pipeline as PP  # noqa: E402

ESPECIE = "mossSlime"
TILE = int(os.environ.get("TILE", "96"))
OUTDIR = os.environ["OUTDIR"]
os.makedirs(OUTDIR, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
TAG = os.environ.get("TAG", "run")
DIRS = PP.RADIAL4                          # SE, NE, SO, NO (ordem de FOUR em game/monster-sprites.mjs)

ALTURA = 0.45                              # m
RAIO = 0.26                                # m, meia largura da base
# ------------------------------------------------------------------ paleta por material (tons claro -> escuro)
MATS = {
    "gelatina": dict(r=[(186, 226, 132), (140, 192, 100), (98, 150, 72), (66, 104, 52)], layer="corpo",
                     w=1.0, dith=0.02, bias=0.0, ao=0.45),
    "pedra": dict(r=[(164, 146, 122), (120, 104, 88), (84, 72, 60)], layer="corpo", w=0.9, dith=0.02, bias=0.0, ao=0.6),
    "folha": dict(r=[(92, 150, 70), (60, 110, 48), (40, 76, 36)], layer="corpo", w=0.9, dith=0.02, bias=0.0, ao=0.6),
    "olho": dict(r=[(44, 34, 34), (22, 18, 18)], layer="olhos", w=1.0, dith=0.0, bias=0.0, ao=0.2),
    "brilho": dict(r=[(248, 252, 230), (214, 236, 196)], layer="brilho", w=1.0, dith=0.0, bias=0.0, ao=0.0),
}
CAMADAS = ["corpo", "olhos", "brilho"]
ESTILO = PP.Estilo(tile=TILE, mats=MATS, camadas=CAMADAS, sem_linha=("brilho",))


# ------------------------------------------------------------------ malhas (metros, base no z = 0, olhos na frente = -Y)
def icosfera(sub):
    t = (1 + 5 ** 0.5) / 2
    v = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
         (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2),
         (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11),
         (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    v = [tuple(np.array(p) / np.linalg.norm(p)) for p in v]
    for _ in range(sub):
        cache, nf = {}, []
        def meio(a, b):
            k = (min(a, b), max(a, b))
            if k not in cache:
                m = (np.array(v[a]) + np.array(v[b])) / 2
                v.append(tuple(m / np.linalg.norm(m)))
                cache[k] = len(v) - 1
            return cache[k]
        for a, b, c in f:
            ab, bc, ca = meio(a, b), meio(b, c), meio(c, a)
            nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        f = nf
    return [tuple(p) for p in v], f


def corpo_gelatina():
    """Icosfera de 80 faces (sub=1): cupula com base plana; base larga, topo mais estreito."""
    v, f = icosfera(1)
    out = []
    for x, y, z in v:
        t = min(1.0, max(0.0, (z + 0.85) / 1.7))          # 0 na base, 1 no topo (aprox.; icosfera tem z em [-0.85, 0.85])
        h = t * ALTURA
        fat = 1.0 - 0.35 * t * t
        out.append((x * RAIO * fat, y * RAIO * fat, h))
    return out, f


def pedrinha(c, r):
    v, f = icosfera(0)
    return [(c[0] + x * r, c[1] + y * r, c[2] + z * r * 0.7) for x, y, z in v], f


def raio_superficie(z):
    """Raio da superficie do corpo na altura z (mesma forma de corpo_gelatina)."""
    t = min(1.0, max(0.0, z / ALTURA))
    return RAIO * (1.0 - 0.35 * t * t)


def sobre_superficie(theta, z, afasta=0.0):
    r = raio_superficie(z) + afasta
    return (r * math.cos(theta), r * math.sin(theta), z)


def folha(theta, z, comp=0.05, larg=0.032):
    """Folha vertical presa na superficie: losango no plano tangente (T, Z), afastado 0,012 m da casca."""
    u = (math.cos(theta), math.sin(theta), 0.0)
    T = (-math.sin(theta), math.cos(theta), 0.0)
    c = sobre_superficie(theta, z, 0.012)
    def ponto(a, b):
        return (c[0] + u[0] * 0 + T[0] * a, c[1] + T[1] * a, c[2] + b)
    return [ponto(0, comp), ponto(larg, 0), ponto(0, -comp * 0.6), ponto(-larg, 0)], [(0, 1, 2, 3)]


def olho(theta, z):
    v, f = icosfera(1)
    c = sobre_superficie(theta, z, 0.01)
    return [(c[0] + x * 0.06, c[1] + y * 0.06, c[2] + z2 * 0.06) for x, y, z2 in v], f


def brilho_umido(theta, z):
    v, f = icosfera(1)
    c = sobre_superficie(theta, z, 0.004)
    return [(c[0] + x * 0.045, c[1] + y * 0.03, c[2] + z2 * 0.018) for x, y, z2 in v], f


def pedrinha(theta, z, r):
    v, f = icosfera(0)
    c = sobre_superficie(theta, z, r * 0.35)
    return [(c[0] + x * r, c[1] + y * r, c[2] + z2 * r * 0.8) for x, y, z2 in v], f


# superficie: pedrinhas e folhas presas na casca (angulo em rad: -pi/2 = frente, -Y; z em m)
PEDRAS = [(math.radians(-75), 0.14, 0.030), (math.radians(-120), 0.11, 0.024), (math.radians(-98), 0.27, 0.022)]
FOLHAS = [(math.radians(-140), 0.20), (math.radians(-40), 0.10)]
OLHOS = [(math.radians(-112), 0.16), (math.radians(-68), 0.16)]
BRILHO = (math.radians(-62), 0.36)

PARTES = []  # (nome, layer, material, grupo, (verts, faces))


def add(nome, layer, mat, grp, malha):
    PARTES.append((nome, layer, mat, grp, malha))


add("corpo", "corpo", "gelatina", 1, corpo_gelatina())
for i, (th, z, r) in enumerate(PEDRAS):
    add("pedra%d" % i, "corpo", "pedra", 3, pedrinha(th, z, r))
for i, (th, z) in enumerate(FOLHAS):
    add("folha%d" % i, "corpo", "folha", 4, folha(th, z))
for i, (th, z) in enumerate(OLHOS):
    add("olho%d" % i, "olhos", "olho", 2, olho(th, z))
add("brilho", "brilho", "brilho", 5, brilho_umido(*BRILHO))

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
coll = bpy.context.scene.collection
BMAT = {}
for nome in ESTILO.nomes:
    m = bpy.data.materials.new(nome)
    v = (ESTILO.nomes.index(nome) + 1) / 32.0          # id de material (mesma convencao do cubo)
    m.diffuse_color = (v, v, v, 1.0)
    BMAT[nome] = m

PARTS = []
for nome, layer, mat, grp, (verts, faces) in PARTES:
    me = bpy.data.meshes.new(nome)
    me.from_pydata(verts, [], faces)
    me.update()
    for an in PP.ATTRS:
        me.color_attributes.new(an, "FLOAT_COLOR", "POINT")
    PP.set_active_attr(me, "nd")
    n = len(me.vertices)
    co = np.array([v.co[:] for v in me.vertices], np.float32)
    uvc = np.stack([0.5 + co[:, 0] / 0.8, 0.5 + co[:, 1] / 0.8, np.clip(co[:, 2] / 2.0, 0, 1), np.ones(n)], 1)
    me.color_attributes["uv"].data.foreach_set("color", uvc.astype(np.float32).ravel())
    gpc = np.stack([np.full(n, grp / 32.0), np.zeros(n), np.zeros(n), np.ones(n)], 1).astype(np.float32)
    me.color_attributes["gp"].data.foreach_set("color", gpc.ravel())
    me.materials.append(BMAT[mat])
    ob = bpy.data.objects.new(nome, me)
    coll.objects.link(ob)
    ob["layer"], ob["only"], ob["grp"] = layer, "", grp
    PARTS.append(ob)


# ------------------------------------------------------------------ poses (locais, base no z = 0; a frente e -Y)
def escala(sz):
    """Estica em Z e mantem o volume aproximado nos eixos X/Y."""
    return Matrix.Diagonal(Vector((1 / math.sqrt(sz), 1 / math.sqrt(sz), sz, 1)))


def pose(anim, f):
    if anim == "parado":                      # pulsar: inspira e expira, base fixa
        sz = [1.00, 1.05, 1.00, 0.96][f]
        return escala(sz)
    if anim == "andar":                       # esticar e saltar: agacha, estica, sobe, cai
        sz = [0.85, 1.15, 1.10, 0.85, 1.08, 0.97][f]
        hop = [0.0, 0.03, 0.06, 0.0, 0.02, 0.0][f]
        return Matrix.Translation(Vector((0, 0, hop))) @ escala(sz)
    if anim == "atacar":                      # bote: recua, avanca (golpe no quadro 2), recolhe
        sz = [0.80, 1.20, 1.10, 1.00][f]
        y = [0.02, -0.10, -0.16, -0.04][f]
        return Matrix.Translation(Vector((0, y, 0))) @ escala(sz)
    if anim == "morrer":                      # derreter: achata e alarga ate virar poca
        sz = [1.00, 0.82, 0.60, 0.42, 0.28, 0.16][f]
        alarga = [1.00, 1.12, 1.28, 1.45, 1.60, 1.80][f]
        return Matrix.Diagonal(Vector((alarga, alarga, sz, 1)))
    raise ValueError(anim)


ANIMS = {"parado": (4, 4, True), "andar": (6, 10, True), "atacar": (4, 12, False), "morrer": (6, 10, False)}
ANIMS_EXEC = os.environ.get("ANIMS", ",".join(ANIMS)).split(",")
GOLPE_QUADRO = {"atacar": 2}

# ------------------------------------------------------------------ camera: escala fisica, pe no pivo
pontos = []
for anim, (nf, _, _) in ANIMS.items():
    for f in range(nf):
        M = pose(anim, f)
        for ob in PARTS:
            for v in ob.data.vertices:
                pontos.append(tuple(M @ v.co))
pontos = np.array(pontos, np.float64)
PIPE = PP.Pipeline(ESTILO, PARTS, os.path.join(OUTDIR, "_tmp_%s_%s.png" % (ESPECIE, TAG)))
PIPE.camera_iso(pontos)                       # confere que a silhueta cabe na celula
PIPE.preparar_render()
PIPE.modo = "livre"


def yaw_para(dname):
    dx, dy = PP.DIR_SCREEN[dname]
    rh = Vector((PIPE.right.x, PIPE.right.y, 0)).normalized()
    dh = Vector((PIPE.back.x, PIPE.back.y, 0)).normalized()
    f = rh * dx + dh * dy
    return math.atan2(f.x, -f.y)


def pousar(M_local, yaw):
    M = Matrix.Rotation(yaw, 4, "Z") @ M_local
    for ob in PARTS:
        ob.matrix_world = M


# ------------------------------------------------------------------ renders: 4 direcoes x quadros x camadas
for anim in ANIMS_EXEC:
    nf, fps, loop = ANIMS[anim]
    linhas = []
    for dname in DIRS:
        cels = []
        for f in range(nf):
            pousar(pose(anim, f), yaw_para(dname))
            PIPE.set_attrs()
            partes = [PIPE.estagio(CAMADAS, camada)[0] for camada in CAMADAS]
            cels.append(PP.compose(partes))
        linhas.append(cels)
    PP.save_png(PP.montar_atlas(linhas), os.path.join(OUTDIR, "%s.png" % anim))
    print("ANIM", anim, "quadros", nf, "dirs", DIRS, flush=True)

# ------------------------------------------------------------------ especificacao (lida por scripts/build-monster-atlases.mjs)
if os.environ.get("ESCREVER_SPEC", "1") == "1":
    spec = {
        "especie": ESPECIE,
        "familia": "slime",
        "cell": TILE,
        "pivo": list(ESTILO.pivo),
        "dirs": "4",
        "direcoes": DIRS,
        "escala": 0.25,
        "altura_m": ALTURA,
        "camadas": CAMADAS,
        "escala_fisica": {"ppu_por_metro_96": PP.PPU_REF_96, "ppu_tile": PIPE.ppu, "origem_y": PIPE.origin_y},
        "anims": {a: {"frames": ANIMS[a][0], "fps": ANIMS[a][1], "loop": ANIMS[a][2],
                      **({"golpe_quadro": GOLPE_QUADRO[a]} if a in GOLPE_QUADRO else {})} for a in ANIMS},
        "paleta": sorted([list(c) for c in ESTILO.paleta]),
        "paleta_max": PP.PALETA_MAX,
        "nota": "translucidez simulada por tons e brilho (a biblioteca tem alfa binario); pedrinhas e folhas sao "
                "inclusoes na superficie",
    }
    with open(os.path.join(HERE, "spec.json"), "w", encoding="utf-8") as fh:
        json.dump(spec, fh, indent=1, ensure_ascii=False)
tmp = PIPE.tmp
if os.path.exists(tmp):
    os.remove(tmp)
print("DONE", ESPECIE, TAG, repr(PIPE.ppu), flush=True)
