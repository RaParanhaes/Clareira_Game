"""Urso-da-caverna (caveBear), familia urso, fatia D5 do plano masmorra v2.

Urso marrom-escuro, robusto, com focinho mais claro, garras visiveis e um pouco de musgo nos ombros.
Escala FISICA do personagem A7 (43,92 px/m na celula 96), sem autofit: ombro em ~1,0 m e cabeca em ~1,3 m
(altura do peito do camponese, que tem ~1,75 m), comprimento ~1,9 m. Pivo na linha 78 (a pegada tem ~0,5 m
de raio na projecao iso; na linha 84 a base cairia para 100 e cortaria a celula). Sem espelho: 8 direcoes renderizadas.

Render: 8 direcoes na ordem GAME_DIRS (S, SE, L, NE, N, NO, O, SO). O corpo gira inteiro com a direcao; a
cabeca e a frente ficam no lado de -Y local, que aponta para a direcao do giro.
Animacoes: parado 4 (respira, orelhas), andar 6 (passada em trote diagonal), atacar 6 (ergue, golpeia com a
pata dianteira e abaixa a cabeca; golpe no quadro 2), morrer 6 (tomba de lado).
Saida: uma folha crua por animacao (linhas = direcoes na ordem de GAME_DIRS, colunas = quadros) em OUTDIR,
e spec.json ao lado deste arquivo.

Ambiente: REPO (raiz do worktree), OUTDIR (saida crua), ANIMS (ex.: parado,andar; padrao todas), TAG (log),
ESCREVER_SPEC (1 grava spec.json).
Rodar: REPO=... OUTDIR=... ANIMS=parado timeout 1500 blender -b --factory-startup -P build.py
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

ESPECIE = "caveBear"
TILE = int(os.environ.get("TILE", "96"))
OUTDIR = os.environ["OUTDIR"]
os.makedirs(OUTDIR, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
TAG = os.environ.get("TAG", "run")
DIRS = PP.GAME_DIRS                        # S, SE, L, NE, N, NO, O, SO: 8 renders, sem espelho
ORIGEM_Y = 78.0                            # patas no chao na linha 78: a pegada larga (1,9 m) desce ate ~94 sem cortar
ESCALA_JOGO = 0.95

# ------------------------------------------------------------------ paleta por material (tons claro -> escuro)
MATS = {
    "sombra_meia": dict(r=[(96, 86, 76)], layer="sombra_meia", w=1.0, dith=0.0, bias=0.0, ao=0.0),
    "sombra": dict(r=[(64, 56, 50), (46, 40, 36)], layer="sombra", w=1.0, dith=0.0, bias=0.0, ao=0.0),
    "pelo_escuro": dict(r=[(96, 62, 40), (74, 46, 30), (56, 36, 26)], layer="corpo", w=1.0, dith=0.02, bias=0.0, ao=0.5),
    "pelo": dict(r=[(124, 82, 52), (100, 64, 40), (76, 48, 32)], layer="corpo", w=1.0, dith=0.02, bias=0.0, ao=0.4),
    "pelo_claro": dict(r=[(164, 120, 80), (138, 98, 64)], layer="corpo", w=1.0, dith=0.02, bias=0.0, ao=0.2),
    "rim": dict(r=[(216, 172, 122)], layer="corpo", w=1.0, dith=0.0, bias=0.0, ao=0.0),
    "focinho": dict(r=[(226, 194, 148), (192, 158, 116)], layer="corpo", w=1.0, dith=0.02, bias=0.0, ao=0.2),
    "musgo": dict(r=[(108, 140, 74), (76, 108, 52)], layer="corpo", w=1.2, dith=0.02, bias=0.0, ao=0.6),
    "garra": dict(r=[(244, 232, 204), (206, 188, 150)], layer="olhos", w=1.5, dith=0.0, bias=0.0, ao=0.1),
    "olho": dict(r=[(44, 34, 30), (20, 16, 16)], layer="olhos", w=2.0, dith=0.0, bias=0.0, ao=0.1),
    "brilho": dict(r=[(255, 252, 236)], layer="olhos", w=3.0, dith=0.0, bias=0.0, ao=0.0),
    "nariz": dict(r=[(38, 30, 28), (18, 14, 14)], layer="olhos", w=2.0, dith=0.0, bias=0.0, ao=0.1),
}
CAMADAS = ["sombra_meia", "sombra", "corpo", "olhos"]                     # ordem de baixo para cima
ESTILO = PP.Estilo(tile=TILE, mats=MATS, camadas=CAMADAS, sem_linha=("sombra", "sombra_meia"),
                   origem_y=ORIGEM_Y, pivo=(TILE // 2, ORIGEM_Y))


# ------------------------------------------------------------------ formas (malhas puras: (verts, faces))
def orientar(verts, faces):
    """Faces voltadas para fora do centroide (normais consistentes para o passe de normal)."""
    v = np.array(verts, np.float64)
    c0 = v.mean(0)
    out = []
    for f in faces:
        p = v[list(f)]
        n = np.cross(p[1] - p[0], p[2] - p[0])
        cen = p.mean(0) - c0
        if np.dot(n, cen) < 0:
            f = tuple(reversed(f))
        out.append(tuple(f))
    return [tuple(x) for x in verts], out


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


def elipsoide(c, rx, ry, rz, sub=1):
    v, f = icosfera(sub)
    return orientar([(c[0] + x * rx, c[1] + y * ry, c[2] + z * rz) for x, y, z in v], f)


def tubo(a, b, r, lados=8):
    """Cilindro de raio r entre a e b, com tampas (perna, pescoco)."""
    a, b = np.array(a, np.float64), np.array(b, np.float64)
    w = (b - a) / np.linalg.norm(b - a)
    ref = np.array([0, 0, 1.0]) if abs(w[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(w, ref)
    u /= np.linalg.norm(u)
    v = np.cross(w, u)
    verts = []
    for ponta in (a, b):
        for j in range(lados):
            t = 2 * math.pi * j / lados
            verts.append(tuple(ponta + r * (math.cos(t) * u + math.sin(t) * v)))
    verts.append(tuple(a))
    verts.append(tuple(b))
    faces = []
    ca, cb = 2 * lados, 2 * lados + 1
    for j in range(lados):
        j2 = (j + 1) % lados
        faces.append((j, j2, lados + j2, lados + j))
        faces.append((ca, j2, j))
        faces.append((cb, lados + j, lados + j2))
    return orientar(verts, faces)


def tubo_afinado(a, b, ra, rb, lados=8):
    """Tronco de cone entre a e b (raio ra na ponta a, rb na ponta b), com tampas."""
    a, b = np.array(a, np.float64), np.array(b, np.float64)
    w = (b - a) / np.linalg.norm(b - a)
    ref = np.array([0, 0, 1.0]) if abs(w[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(w, ref)
    u /= np.linalg.norm(u)
    v = np.cross(w, u)
    verts = []
    for ponta, r in ((a, ra), (b, rb)):
        for j in range(lados):
            t = 2 * math.pi * j / lados
            verts.append(tuple(ponta + r * (math.cos(t) * u + math.sin(t) * v)))
    verts.append(tuple(a))
    verts.append(tuple(b))
    faces = []
    ca, cb = 2 * lados, 2 * lados + 1
    for j in range(lados):
        j2 = (j + 1) % lados
        faces.append((j, j2, lados + j2, lados + j))
        faces.append((ca, j2, j))
        faces.append((cb, lados + j, lados + j2))
    return orientar(verts, faces)


def juntar(*malhas):
    verts, faces = [], []
    for vs, fs in malhas:
        off = len(verts)
        verts.extend(vs)
        faces.extend(tuple(i + off for i in f) for f in fs)
    return verts, faces


# ------------------------------------------------------------------ partes do urso (formas organicas)
# tipo: "fixo" (sombra), "corpo" (tronco e enfeites, gira com a direcao), "cabeca" (gira em torno do pescoco),
# "perna" (gira em torno do quadril; perna = 0..3, FL, FR, BL, BR)
PARTES = []
PERNAS = [
    dict(H=(-0.19, -0.26, 0.70), fase=0.0, dianteira=True),     # dianteira esquerda (x negativo)
    dict(H=(0.19, -0.26, 0.70), fase=math.pi, dianteira=True),  # dianteira direita
    dict(H=(-0.19, 0.42, 0.70), fase=math.pi, dianteira=False), # traseira esquerda
    dict(H=(0.19, 0.42, 0.70), fase=0.0, dianteira=False),      # traseira direita
]
PIVO_PESCOCO = (0.0, -0.30, 0.90)


def add(nome, layer, mat, grp, malha, tipo="corpo", perna=None):
    PARTES.append(dict(nome=nome, layer=layer, mat=mat, grp=grp, malha=malha, tipo=tipo, perna=perna))


add("sombra_meia", "sombra_meia", "sombra_meia", 30, elipsoide((0.0, 0.0, 0.001), 0.42, 0.66, 0.001, 1), "fixo")
add("sombra", "sombra", "sombra", 31, elipsoide((0.0, 0.0, 0.002), 0.30, 0.52, 0.002, 2), "fixo")

# tronco arredondado: massa media, costas escuras por cima, barriga clara por baixo, corcunda e traseiro mais baixo
add("tronco", "corpo", "pelo", 1, elipsoide((0.0, 0.10, 0.80), 0.30, 0.50, 0.26, 2))
add("costas", "corpo", "pelo_escuro", 1, elipsoide((0.0, 0.08, 0.92), 0.27, 0.44, 0.16, 2))
add("barriga", "corpo", "pelo_claro", 8, elipsoide((0.0, 0.12, 0.62), 0.25, 0.42, 0.13, 2))
add("corcunda", "corpo", "pelo_escuro", 1, elipsoide((0.0, -0.18, 0.98), 0.27, 0.25, 0.19, 2))
add("traseiro", "corpo", "pelo", 1, elipsoide((0.0, 0.42, 0.74), 0.28, 0.23, 0.21, 2))
add("cauda", "corpo", "pelo_claro", 1, elipsoide((0.0, 0.70, 0.76), 0.065, 0.065, 0.065, 1))
add("luz_ombro", "corpo", "rim", 9, elipsoide((-0.12, -0.20, 1.12), 0.07, 0.22, 0.02, 1))

# tufo de musgo: 3 bolinhas irregulares no alto da corcunda (nao um bloco)
add("musgo0", "corpo", "musgo", 7, elipsoide((-0.10, -0.10, 1.13), 0.050, 0.055, 0.040, 1))
add("musgo1", "corpo", "musgo", 7, elipsoide((0.02, -0.18, 1.17), 0.040, 0.045, 0.034, 1))
add("musgo2", "corpo", "musgo", 7, elipsoide((0.09, -0.07, 1.11), 0.032, 0.036, 0.028, 1))

# pescoco, cranio com testa, orelhas redondas, focinho claro, olhos escuros com brilho de 1 px
add("pescoco", "corpo", "pelo", 2, elipsoide((0.0, -0.40, 0.96), 0.20, 0.22, 0.20, 2), "cabeca")
add("cranio", "corpo", "pelo", 2, elipsoide((0.0, -0.58, 1.10), 0.19, 0.20, 0.19, 2), "cabeca")
add("testa", "corpo", "pelo_escuro", 2, elipsoide((0.0, -0.66, 1.21), 0.15, 0.12, 0.08, 2), "cabeca")
add("orelha0", "corpo", "pelo_escuro", 2, elipsoide((-0.14, -0.48, 1.27), 0.075, 0.07, 0.07, 2), "cabeca")
add("orelha1", "corpo", "pelo_escuro", 2, elipsoide((0.14, -0.48, 1.27), 0.075, 0.07, 0.07, 2), "cabeca")
add("focinho", "corpo", "focinho", 3, elipsoide((0.0, -0.83, 1.00), 0.12, 0.13, 0.10, 2), "cabeca")
add("nariz", "olhos", "nariz", 4, elipsoide((0.0, -0.94, 1.04), 0.05, 0.04, 0.035, 1), "cabeca")
add("olho0", "olhos", "olho", 5, elipsoide((-0.10, -0.74, 1.15), 0.036, 0.034, 0.036, 1), "cabeca")
add("olho1", "olhos", "olho", 6, elipsoide((0.10, -0.74, 1.15), 0.036, 0.034, 0.036, 1), "cabeca")
add("brilho0", "olhos", "brilho", 25, elipsoide((-0.11, -0.77, 1.18), 0.012, 0.012, 0.012, 0), "cabeca")
add("brilho1", "olhos", "brilho", 26, elipsoide((0.09, -0.77, 1.18), 0.012, 0.012, 0.012, 0), "cabeca")

# 4 pernas grossas em cima que afinam ate a pata; pata clara; 3 garras claras por pata
for k, pe in enumerate(PERNAS):
    hx, hy, hz = pe["H"]
    grp = 10 + k
    coxa = juntar(tubo_afinado((hx, hy, hz), (hx, hy, 0.36), 0.14, 0.095),
                  tubo_afinado((hx, hy, 0.36), (hx, hy - 0.01, 0.10), 0.095, 0.07),
                  elipsoide((hx, hy, hz), 0.14, 0.14, 0.14, 1),
                  elipsoide((hx, hy, 0.36), 0.095, 0.095, 0.095, 1))
    add("perna%d" % k, "corpo", "pelo", grp, coxa, "perna", perna=k)
    px, py = hx, hy - 0.03
    add("pata%d" % k, "corpo", "pelo_claro", grp, elipsoide((px, py, 0.075), 0.115, 0.12, 0.075, 2), "perna", perna=k)
    for j, dx in enumerate((-0.05, 0.0, 0.05)):
        add("garra%d_%d" % (k, j), "olhos", "garra", 20 + 3 * k + j,
            elipsoide((px + dx, py - 0.12, 0.035), 0.022, 0.024, 0.022, 0), "perna", perna=k)


# ------------------------------------------------------------------ poses (locais; base no z = 0)
def T(v):
    return Matrix.Translation(Vector(v))


def Rx_em(a, p):
    return T(p) @ Matrix.Rotation(a, 4, "X") @ T((-p[0], -p[1], -p[2]))


def Ry_em(a, p):
    return T(p) @ Matrix.Rotation(a, 4, "Y") @ T((-p[0], -p[1], -p[2]))


ANIMS = {"parado": (4, 4, True), "andar": (6, 10, True), "atacar": (6, 12, False), "morrer": (6, 10, False)}
ANIMS_EXEC = os.environ.get("ANIMS", ",".join(ANIMS)).split(",")
GOLPE_QUADRO = {"atacar": 2}
AMP_PASSO = 0.30                                                  # rad, amplitude da passada
ANGULO_PATA_ATAQUE = [0.0, 0.55, -0.85, -0.45, -0.15, 0.0]        # rad, pata dianteira: ergue, golpeia, recolhe
CABECA_ATAQUE = [-0.10, -0.20, 0.38, 0.22, 0.08, 0.0]             # rad, cabeca: recua, abaixa no golpe
AVANCO_ATAQUE = [0.0, -0.02, -0.07, -0.04, -0.01, 0.0]            # m, tronco avanca para -Y
TOMBAR_MORTE = [0.0, 0.35, 0.80, 1.20, 1.45, 1.57]                # rad, tomba de lado (giro em torno de Y)
CABECA_MORTE = [0.0, 0.10, 0.25, 0.40, 0.50, 0.60]                # rad, cabeca cai
PIVO_MORTE = (0.0, 0.0, 0.55)


def corpo_T(anim, f):
    if anim == "parado":
        return T((0, 0, [0.0, 0.008, 0.012, 0.006][f]))
    if anim == "andar":
        return T((0, 0, 0.012 * (1 - math.cos(4 * math.pi * f / 6)) / 2))
    if anim == "atacar":
        return T((0, AVANCO_ATAQUE[f], 0))
    return Matrix.Identity(4)


def cabeca_rx(anim, f):
    if anim == "parado":
        return [0.0, 0.03, 0.05, 0.02][f]
    if anim == "andar":
        return 0.03 * math.sin(2 * math.pi * f / 6)
    if anim == "atacar":
        return CABECA_ATAQUE[f]
    return CABECA_MORTE[f]


def perna_rx(p, anim, f):
    if anim == "andar":
        return AMP_PASSO * math.sin(2 * math.pi * f / 6 + p["fase"])
    if anim == "atacar" and p["dianteira"]:
        return ANGULO_PATA_ATAQUE[f] if p["H"][0] > 0 else ANGULO_PATA_ATAQUE[f] * 0.6
    return 0.0


def matrizes(anim, f):
    """Matriz (sem o giro da direcao) de cada parte neste quadro. Morrer: tomba e encosta no chao (z = 0)."""
    corpo = corpo_T(anim, f)
    G = Ry_em(TOMBAR_MORTE[f], PIVO_MORTE) if anim == "morrer" else Matrix.Identity(4)
    mats = []
    for p in PARTES:
        if p["tipo"] == "fixo":
            mats.append(Matrix.Identity(4))
        elif p["tipo"] == "corpo":
            mats.append(G @ corpo)
        elif p["tipo"] == "cabeca":
            mats.append(G @ corpo @ Rx_em(cabeca_rx(anim, f), PIVO_PESCOCO))
        else:
            pe = PERNAS[p["perna"]]
            mats.append(G @ corpo @ Rx_em(perna_rx(pe, anim, f), pe["H"]))
    if anim == "morrer":
        zs = []
        for p, M in zip(PARTES, mats):
            if p["tipo"] == "fixo":
                continue
            for x, y, z in p["malha"][0]:
                zs.append((M @ Vector((x, y, z)))[2])
        dz = -min(zs)
        mats = [T((0, 0, dz)) @ M if p["tipo"] != "fixo" else M for p, M in zip(PARTES, mats)]
    return mats


# ------------------------------------------------------------------ cena Blender
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
for p in PARTES:
    (verts, faces) = p["malha"]
    me = bpy.data.meshes.new(p["nome"])
    me.from_pydata(verts, [], faces)
    me.update()
    for an in PP.ATTRS:
        me.color_attributes.new(an, "FLOAT_COLOR", "POINT")
    PP.set_active_attr(me, "nd")
    n = len(me.vertices)
    co = np.array([v.co[:] for v in me.vertices], np.float32)
    uvc = np.stack([0.5 + co[:, 0] / 0.8, 0.5 + co[:, 1] / 0.8, np.clip(co[:, 2] / 2.0, 0, 1), np.ones(n)], 1)
    me.color_attributes["uv"].data.foreach_set("color", uvc.astype(np.float32).ravel())
    gpc = np.stack([np.full(n, p["grp"] / 32.0), np.zeros(n), np.zeros(n), np.ones(n)], 1).astype(np.float32)
    me.color_attributes["gp"].data.foreach_set("color", gpc.ravel())
    me.materials.append(BMAT[p["mat"]])
    ob = bpy.data.objects.new(p["nome"], me)
    coll.objects.link(ob)
    ob["layer"], ob["only"], ob["grp"] = p["layer"], "", p["grp"]
    PARTS.append(ob)

# ------------------------------------------------------------------ camera: escala fisica, pe no pivo
pontos = []
for anim, (nf, _, _) in ANIMS.items():
    for f in range(nf):
        for p, M in zip(PARTES, matrizes(anim, f)):
            for x, y, z in p["malha"][0]:
                pontos.append(tuple(M @ Vector((x, y, z))))
pontos = np.array(pontos, np.float64)
PIPE = PP.Pipeline(ESTILO, PARTS, os.path.join(OUTDIR, "_tmp_%s_%s.png" % (ESPECIE, TAG)))
PIPE.camera_iso(pontos)                                # confere que a silhueta cabe na celula (altura)
PIPE.preparar_render()
PIPE.modo = "livre"


def checar_largura(pts):
    """Largura: em todas as 8 direcoes de giro, a silhueta tem de caber na celula (sem corte horizontal)."""
    worst = 0.0
    for k in range(8):
        Rk = np.array(Matrix.Rotation(k * math.pi / 4, 3, "Z"))
        q = pts @ Rk.T
        xs = PIPE.ppu * (q @ PIPE.right_np) + TILE / 2
        worst = max(worst, float(xs.max() - TILE + 0.5), float(0.5 - xs.min()))
    if worst > 0.5:                                    # meio pixel de folga: borda sem anti-alias
        raise ValueError("silhueta corta na horizontal em %.2f px" % worst)
    print("LARGURA ok", flush=True)


checar_largura(pontos)


def yaw_para(dname):
    dx, dy = PP.DIR_SCREEN[dname]
    rh = Vector((PIPE.right.x, PIPE.right.y, 0)).normalized()
    dh = Vector((PIPE.back.x, PIPE.back.y, 0)).normalized()
    f = rh * dx + dh * dy
    return math.atan2(f.x, -f.y)


# ------------------------------------------------------------------ renders: 8 direcoes x quadros x camadas
def meia_tinta(rgba):
    """Meio-tom com alfa binario: apaga metade dos pixels (xadrez) da camada de sombra exterior."""
    a = rgba.copy()
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    a[((xx + yy) % 2 == 1), 3] = 0
    return a


for anim in ANIMS_EXEC:
    nf, fps, loop = ANIMS[anim]
    linhas = []
    for dname in DIRS:
        cels = []
        yaw = yaw_para(dname)
        for f in range(nf):
            for M, ob in zip(matrizes(anim, f), PARTS):
                ob.matrix_world = Matrix.Rotation(yaw, 4, "Z") @ M
            PIPE.set_attrs()
            partes = [PIPE.estagio(CAMADAS, camada)[0] for camada in CAMADAS]
            partes = [meia_tinta(r) if c == "sombra_meia" else r for c, r in zip(CAMADAS, partes)]
            cels.append(PP.compose(partes))
        linhas.append(cels)
    PP.save_png(PP.montar_atlas(linhas), os.path.join(OUTDIR, "%s.png" % anim))
    print("ANIM", anim, "quadros", nf, "dirs", DIRS, flush=True)

# ------------------------------------------------------------------ especificacao (lida por scripts/build-monster-atlases.mjs)
if os.environ.get("ESCREVER_SPEC", "1") == "1":
    spec = {
        "especie": ESPECIE,
        "familia": "urso",
        "cell": TILE,
        "pivo": list(ESTILO.pivo),
        "dirs": "8",
        "direcoes": DIRS,
        "escala": ESCALA_JOGO,
        "altura_m": 1.31,
        "camadas": CAMADAS,
        "escala_fisica": {"ppu_por_metro_96": PP.PPU_REF_96, "ppu_tile": PIPE.ppu, "origem_y": PIPE.origin_y},
        "anims": {a: {"frames": ANIMS[a][0], "fps": ANIMS[a][1], "loop": ANIMS[a][2],
                      **({"golpe_quadro": GOLPE_QUADRO[a]} if a in GOLPE_QUADRO else {})} for a in ANIMS},
        "paleta": sorted([list(c) for c in ESTILO.paleta]),
        "paleta_max": PP.PALETA_MAX,
        "nota": "urso marrom-escuro de 4 patas, focinho creme, garras, musgo nos ombros; 8 direcoes renderizadas "
                "(sem espelho); alfa binario; sombra com meia-tinta (xadrez) e nucleo solido.",
    }
    with open(os.path.join(HERE, "spec.json"), "w", encoding="utf-8") as fh:
        json.dump(spec, fh, indent=1, ensure_ascii=False)
tmp = PIPE.tmp
if os.path.exists(tmp):
    os.remove(tmp)
print("DONE", ESPECIE, TAG, repr(PIPE.ppu), flush=True)
