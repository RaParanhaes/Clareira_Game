"""Gosma-de-musgo (mossSlime), familia slime, fatia D1 do plano masmorra v2.

Gota gelatinosa verde-musgo: base larga que se espalha no chao, topo arredondado com bico leve; nucleo mais
escuro na frente, borda clara; 3 pedrinhas e 2 folhas claras presas na casca; tufo de musgo no topo; olhos
com brilho e boca voltados para a frente nas 4 direcoes; sombra de contato no chao.
Escala FISICA do personagem A7 (43,92 px/m na celula 96): gota de ~0,48 m, cerca de 0,25 do jogador. Sem autofit.

Render: 4 direcoes radiais (SE, NE, SO, NO), sem espelho (a luz da biblioteca e assimetrica).
Corpo e enfeites giram com a direcao; rosto e boca ficam voltados para a camera. A sombra fica no chao.
Animacoes: parado 4 (pulsar), andar 6 (esticar e saltar), atacar 4 (bote, golpe no quadro 2), morrer 6 (derreter).
Saida: uma folha crua por animacao (linhas = direcoes na ordem de RADIAL4, colunas = quadros) em OUTDIR, e
spec.json ao lado deste arquivo.

Ambiente: REPO (raiz do worktree), OUTDIR (saida crua), ANIMS (ex.: parado,andar; padrao todas), TAG (log),
ESCREVER_SPEC (1 grava spec.json).
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

ALTURA = 0.45                              # m (corpo, sem o bico)
RAIO = 0.26                                # m, raio de referencia
BICO = 0.03                                # m, bico leve no topo

# ------------------------------------------------------------------ paleta por material (tons claro -> escuro)
MATS = {
    "gelatina": dict(r=[(238, 252, 214), (206, 240, 170), (170, 214, 136)], layer="corpo", w=1.0, dith=0.02, bias=0.0, ao=0.3),
    "nucleo": dict(r=[(92, 150, 72), (66, 112, 52), (44, 80, 40)], layer="corpo", w=1.0, dith=0.02, bias=0.0, ao=0.4),
    "pedra_clara": dict(r=[(255, 252, 236), (236, 230, 206), (206, 200, 178)], layer="corpo", w=0.9, dith=0.02, bias=0.0, ao=0.4),
    "folha_clara": dict(r=[(230, 248, 178), (196, 230, 140)], layer="corpo", w=0.9, dith=0.02, bias=0.0, ao=0.4),
    "musgo": dict(r=[(70, 122, 52), (46, 92, 38)], layer="corpo", w=1.0, dith=0.02, bias=0.0, ao=0.6),
    "sombra_meia": dict(r=[(92, 104, 92)], layer="sombra_meia", w=1.0, dith=0.0, bias=0.0, ao=0.0),
    "sombra": dict(r=[(56, 66, 56), (40, 48, 40)], layer="sombra", w=1.0, dith=0.0, bias=0.0, ao=0.0),
    "olho": dict(r=[(30, 26, 28), (14, 12, 14)], layer="olhos", w=1.0, dith=0.0, bias=0.0, ao=0.2),
    "brilho": dict(r=[(255, 255, 240), (230, 246, 210)], layer="brilho", w=1.0, dith=0.0, bias=0.0, ao=0.0),
}
CAMADAS = ["sombra_meia", "sombra", "corpo", "olhos", "brilho"]          # ordem de baixo para cima
# pe do modelo na linha 80 (pivo (48, 80)): a sombra de contato precisa de folga abaixo da base iso
ESTILO = PP.Estilo(tile=TILE, mats=MATS, camadas=CAMADAS, sem_linha=("brilho", "sombra", "sombra_meia"),
                   origem_y=80.0, pivo=(TILE // 2, 80))


# ------------------------------------------------------------------ perfil do corpo (anel por anel, exato)
N_ANEIS = 10
M_LADOS = 14


def perfil():
    """Anel i (1..N): s = i/N de 0 (topo) a 1 (base). Base larga (1,1 R), topo arredondado (0,5 R) com bico."""
    zs, rs = [], []
    for i in range(1, N_ANEIS + 1):
        s = i / N_ANEIS
        z = ALTURA * math.cos(s * math.pi / 2) ** 0.9 + BICO * max(0.0, 1 - s / 0.2) ** 2
        r = RAIO * (0.5 + 0.6 * math.sin(s * math.pi / 2))
        zs.append(z)
        rs.append(r)
    return zs, rs


ZS, RS = perfil()
ZS_ASC, RS_ASC = list(reversed(ZS)), list(reversed(RS))


def raio_superficie(z):
    """Raio da casca na altura z (interpolado entre os aneis exatos)."""
    return float(np.interp(min(max(z, 0.0), ZS[0]), ZS_ASC, RS_ASC))


def sobre_superficie(theta, z, afasta=0.0):
    r = raio_superficie(z) + afasta
    return (r * math.cos(theta), r * math.sin(theta), z)


def gelatina():
    verts = [(0.0, 0.0, ZS[0] + 0.0)]                         # polo do topo (com bico)
    verts[0] = (0.0, 0.0, ZS[0] + 0.0)
    for i in range(N_ANEIS):
        for j in range(M_LADOS):
            a = 2 * math.pi * j / M_LADOS
            verts.append((RS[i] * math.cos(a), RS[i] * math.sin(a), ZS[i]))
    centro_base = len(verts)
    verts.append((0.0, 0.0, 0.0))

    def idx(i, j):                                            # i = 0..N-1 (anel i+1), j modulo M
        return 1 + i * M_LADOS + (j % M_LADOS)

    faces = []
    for j in range(M_LADOS):
        faces.append((0, idx(0, j), idx(0, j + 1)))
    for i in range(N_ANEIS - 1):
        for j in range(M_LADOS):
            faces.append((idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j)))
    for j in range(M_LADOS):
        faces.append((centro_base, idx(N_ANEIS - 1, j + 1), idx(N_ANEIS - 1, j)))
    return verts, faces


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
    return [(c[0] + x * rx, c[1] + y * ry, c[2] + z * rz) for x, y, z in v], f


def folha(theta, z, comp=0.055, larg=0.034):
    """Folha vertical presa na casca: losango no plano tangente, afastado da casca."""
    T = (-math.sin(theta), math.cos(theta), 0.0)
    c = sobre_superficie(theta, z, 0.008)

    def ponto(a, b):
        return (c[0] + T[0] * a, c[1] + T[1] * a, c[2] + b)
    return [ponto(0, comp), ponto(larg, 0), ponto(0, -comp * 0.6), ponto(-larg, 0)], [(0, 1, 2, 3)]


# ------------------------------------------------------------------ partes: (nome, layer, material, grupo, malha, grupo_de_pose)
# grupo_de_pose: "corpo" gira com a direcao e recebe a pose; "rosto" fica voltado para a camera; "fixo" so gira
PARTES = []


def add(nome, layer, mat, grp, malha, pose_grp="corpo"):
    PARTES.append((nome, layer, mat, grp, malha, pose_grp))


add("sombra_meia", "sombra_meia", "sombra_meia", 10, elipsoide((0.0, 0.0, 0.001), 0.35, 0.23, 0.001, 1), "fixo")
add("sombra", "sombra", "sombra", 8, elipsoide((0.0, 0.0, 0.004), 0.22, 0.15, 0.002, 1), "fixo")
add("casca", "corpo", "gelatina", 1, gelatina())
add("nucleo", "corpo", "nucleo", 6, elipsoide((0.0, -0.19, 0.10), 0.16, 0.12, 0.12, 1), "rosto")
PEDRAS = [(math.radians(-70), 0.13, 0.045, "pedra_clara"), (math.radians(-120), 0.25, 0.038, "pedra_clara"),
          (math.radians(-98), 0.36, 0.032, "pedra_clara")]
for i, (th, z, r, mat) in enumerate(PEDRAS):
    c = sobre_superficie(th, z, r * 0.5)
    add("pedra%d" % i, "corpo", mat, 3, elipsoide(c, r, r, r * 0.8, 0))
FOLHAS = [(math.radians(-150), 0.20), (math.radians(-40), 0.16)]
for i, (th, z) in enumerate(FOLHAS):
    add("folha%d" % i, "corpo", "folha_clara", 4, folha(th, z))
MUSGO = [((0.00, 0.00), 0.455, 0.040), ((0.05, 0.03), 0.430, 0.030), ((-0.05, 0.02), 0.420, 0.030), ((0.01, -0.05), 0.440, 0.026)]
for i, ((dx, dy), z, r) in enumerate(MUSGO):
    add("musgo%d" % i, "corpo", "musgo", 7, elipsoide((dx, dy, z), r, r, r * 0.7, 0))
# rosto (frente = camera): olhos maiores, brilho branco de 1 px e boca simples
OLHOS = [(math.radians(-110), 0.26), (math.radians(-70), 0.26)]
for i, (th, z) in enumerate(OLHOS):
    c = sobre_superficie(th, z, 0.05)
    add("olho%d" % i, "olhos", "olho", 2, elipsoide(c, 0.07, 0.07, 0.07, 1), "rosto")
    add("brilho%d" % i, "brilho", "brilho", 5, elipsoide((c[0] - 0.028, c[1] - 0.045, c[2] + 0.030), 0.024, 0.024, 0.024, 0), "rosto")
boca_c = sobre_superficie(math.radians(-90), 0.175, 0.014)
add("boca", "olhos", "olho", 9, elipsoide(boca_c, 0.05, 0.013, 0.013, 0), "rosto")
# brilho umido no topo (segue o corpo)
add("brilho_topo", "brilho", "brilho", 5, elipsoide(sobre_superficie(math.radians(-62), 0.39, 0.004), 0.055, 0.022, 0.012, 0), "corpo")

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
for nome, layer, mat, grp, (verts, faces), pose_grp in PARTES:
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
    ob["layer"], ob["only"], ob["grp"], ob["pose"] = layer, "", grp, pose_grp
    PARTS.append(ob)

# ------------------------------------------------------------------ poses (locais, base no z = 0)
def escala(sz):
    """Estica em Z e mantem o volume aproximado nos eixos X/Y."""
    return Matrix.Diagonal(Vector((1 / math.sqrt(sz), 1 / math.sqrt(sz), sz, 1)))


def pose(anim, f):
    if anim == "parado":                      # pulsar: inspira e expira, base fixa
        return escala([1.00, 1.05, 1.00, 0.96][f])
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


# o rosto (-Y local) aponta para a camera: a camera fica em +BACK (cam.location = ... + BACK * 10)
_v = Vector((PIPE.back.x, PIPE.back.y, 0)).normalized()
YAW_ROSTO = math.atan2(_v.x, -_v.y)


def pousar(M_local, yaw, grupo):
    if grupo == "rosto":
        M = Matrix.Rotation(YAW_ROSTO, 4, "Z") @ M_local
    elif grupo == "fixo":                       # sombra: so gira com a direcao, sem pose
        M = Matrix.Rotation(yaw, 4, "Z")
    else:
        M = Matrix.Rotation(yaw, 4, "Z") @ M_local
    for ob in PARTS:
        if ob["pose"] == grupo:
            ob.matrix_world = M


def pousar_todos(M_local, yaw):
    pousar(M_local, yaw, "corpo")
    pousar(M_local, yaw, "rosto")
    pousar(M_local, yaw, "fixo")


def meia_tinta(rgba):
    """Meio-tom com alfa binario: apaga metade dos pixels (xadrez) da camada de sombra exterior."""
    a = rgba.copy()
    yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    a[((xx + yy) % 2 == 1), 3] = 0
    return a


# ------------------------------------------------------------------ renders: 4 direcoes x quadros x camadas
for anim in ANIMS_EXEC:
    nf, fps, loop = ANIMS[anim]
    linhas = []
    for dname in DIRS:
        cels = []
        for f in range(nf):
            pousar_todos(pose(anim, f), yaw_para(dname))
            PIPE.set_attrs()
            partes = [meia_tinta(PIPE.estagio(CAMADAS, camada)[0]) if camada == "sombra_meia"
                      else PIPE.estagio(CAMADAS, camada)[0] for camada in CAMADAS]
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
        "nota": "translucidez simulada por tons (corpo claro, nucleo escuro visivel, pedrinhas e folhas claras, brilho no topo); "
                "alfa binario. Sombra: nucleo solido e anel com meia-tinta (xadrez de pixels).",
    }
    with open(os.path.join(HERE, "spec.json"), "w", encoding="utf-8") as fh:
        json.dump(spec, fh, indent=1, ensure_ascii=False)
tmp = PIPE.tmp
if os.path.exists(tmp):
    os.remove(tmp)
print("DONE", ESPECIE, TAG, repr(PIPE.ppu), flush=True)
