"""Aranhinha-do-po (dustSpider), familia aranha, fatia D5 do plano masmorra v2.

Aranha pequena e magra: cefalotorax e abdomen, 8 patas finas em 2 segmentos, cinza-po e areia, olhos vermelhos.
Escala FISICA do personagem A7 (43,92 px/m na celula 96), sem autofit: extensao de ~0,38 m (escala 0,22 do
jogador), menor que a gosma-de-musgo. Sem espelho: a luz da biblioteca e assimetrica.

Render: 4 direcoes radiais (SE, NE, SO, NO). O corpo inteiro gira com a direcao (olhos na frente).
Animacoes: parado 4 (respira), andar 6 (passada alternada em tripe), atacar 4 (bote com as patas dianteiras,
golpe no quadro 2), morrer 6 (vira de costas e encolhe as patas).
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

ESPECIE = "dustSpider"
TILE = int(os.environ.get("TILE", "96"))
OUTDIR = os.environ["OUTDIR"]
os.makedirs(OUTDIR, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
TAG = os.environ.get("TAG", "run")
DIRS = PP.RADIAL4                          # SE, NE, SO, NO (ordem de FOUR em game/monster-sprites.mjs)
ORIGEM_Y = 84.0                            # pe (patas no chao) na linha 84, pivo do A7
ESCALA_JOGO = 0.22

# ------------------------------------------------------------------ paleta por material (tons claro -> escuro)
MATS = {
    "sombra_meia": dict(r=[(96, 86, 76)], layer="sombra_meia", w=1.0, dith=0.0, bias=0.0, ao=0.0),
    "sombra": dict(r=[(64, 56, 50), (46, 40, 36)], layer="sombra", w=1.0, dith=0.0, bias=0.0, ao=0.0),
    "po": dict(r=[(184, 174, 158), (150, 140, 126), (118, 108, 96)], layer="corpo", w=1.0, dith=0.02, bias=0.0, ao=0.3),
    "areia": dict(r=[(222, 200, 152), (190, 168, 124)], layer="corpo", w=1.0, dith=0.02, bias=0.0, ao=0.2),
    "perna": dict(r=[(156, 146, 132), (118, 108, 96), (86, 78, 70)], layer="corpo", w=0.9, dith=0.0, bias=0.0, ao=0.4),
    "olho": dict(r=[(255, 118, 96), (222, 52, 50), (150, 26, 34)], layer="olhos", w=3.0, dith=0.0, bias=0.0, ao=0.1),
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


def tubo(a, b, r, lados=6):
    """Cilindro de raio r entre os pontos a e b, com tampas (corpo de perna)."""
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


def juntar(*malhas):
    verts, faces = [], []
    for vs, fs in malhas:
        off = len(verts)
        verts.extend(vs)
        faces.extend(tuple(i + off for i in f) for f in fs)
    return verts, faces


# ------------------------------------------------------------------ corpo, olhos e patas
PARTES = []          # dicts: nome, layer, mat, grp, malha, tipo ("fixo" | "corpo" | "perna"), perna (0..7)
PERNAS = []          # 8 pivos: attach A, lado (-1/+1), fase (0 ou pi), dianteira (bool)


def add(nome, layer, mat, grp, malha, tipo="corpo", perna=None):
    PARTES.append(dict(nome=nome, layer=layer, mat=mat, grp=grp, malha=malha, tipo=tipo, perna=perna))


# sombra de contato no chao (so gira com a direcao)
add("sombra_meia", "sombra_meia", "sombra_meia", 8, elipsoide((0.0, 0.0, 0.001), 0.27, 0.27, 0.001, 1), "fixo")
add("sombra", "sombra", "sombra", 9, elipsoide((0.0, 0.0, 0.002), 0.17, 0.17, 0.002, 1), "fixo")

# cefalotorax (frente, -Y) e abdomen (tras, +Y): duas partes bem separadas
add("cefalotorax", "corpo", "areia", 1, elipsoide((0.0, -0.07, 0.10), 0.062, 0.068, 0.050, 2))
add("abdomen", "corpo", "po", 2, elipsoide((0.0, 0.10, 0.105), 0.082, 0.108, 0.080, 2))

# olhos vermelhos brilhantes: 2 grandes e 2 pequenos, na frente do cefalotorax
OLHOS = [((-0.030, -0.130, 0.118), 0.034), ((0.030, -0.130, 0.118), 0.034),
         ((-0.058, -0.108, 0.112), 0.021), ((0.058, -0.108, 0.112), 0.021)]
for i, (c, r) in enumerate(OLHOS):
    add("olho%d" % i, "olhos", "olho", 4 + i, elipsoide(c, r, r, r, 1))

# 8 patas: 4 de cada lado, cada uma com femur (A -> joelho) e tibia (joelho -> pe), no mesmo grupo
ANCORAS = [-0.10, -0.07, -0.03, 0.00]                  # posicao em Y das 4 insercoes no cefalotorax
ESPALHO = [-0.13, -0.05, 0.04, 0.12]                  # deslocamento em Y do pe em relacao a insercao
k = 0
for lado in (-1, 1):
    for i in range(4):
        ya, sp = ANCORAS[i], ESPALHO[i]
        A = (lado * 0.050, ya, 0.100)
        J = (lado * 0.20, ya + 0.5 * sp, 0.13)
        P = (lado * 0.29, ya + 1.15 * sp, 0.012)
        malha = juntar(tubo(A, J, 0.024), tubo(J, P, 0.019), elipsoide(J, 0.027, 0.027, 0.027, 0))
        PERNAS.append(dict(A=A, lado=lado, fase=0.0 if (i + (lado > 0)) % 2 == 0 else math.pi, dianteira=i < 2))
        add("perna%d" % k, "corpo", "perna", 10 + k, malha, "perna", perna=k)
        k += 1

# ------------------------------------------------------------------ poses (locais; base no z = 0)
def T(v):
    return Matrix.Translation(Vector(v))


def Rz_em(a, p):
    return T(p) @ Matrix.Rotation(a, 4, "Z") @ T((-p[0], -p[1], -p[2]))


def Rx_em(a, p):
    return T(p) @ Matrix.Rotation(a, 4, "X") @ T((-p[0], -p[1], -p[2]))


def Ry_em(a, p):
    return T(p) @ Matrix.Rotation(a, 4, "Y") @ T((-p[0], -p[1], -p[2]))


ANIMS = {"parado": (4, 4, True), "andar": (6, 10, True), "atacar": (4, 12, False), "morrer": (6, 10, False)}
ANIMS_EXEC = os.environ.get("ANIMS", ",".join(ANIMS)).split(",")
GOLPE_QUADRO = {"atacar": 2}
AMP_PASSO = 0.30                                       # rad, amplitude da passada
ABRIR_ATAQUE = [0.0, 0.30, 0.50, 0.20]                # patas dianteiras abrem no bote (golpe no quadro 2)
LUNGA_ATAQUE = [0.0, -0.02, -0.06, -0.03]             # m, corpo avanca para -Y
FLEXAO_MORTE = [0.0, 0.25, 0.55, 0.85, 1.05, 1.15]    # rad, patas encolhem para dentro
VIRAR_MORTE = [0.0, 0.5, 1.0, 1.6, 2.3, 3.0]          # rad, vira de costas em torno de X
PIVO_MORTE = (0.0, 0.0, 0.09)


def local_corpo(anim, f):
    if anim == "parado":
        return Matrix.Diagonal(Vector((1.0, 1.0, [1.0, 1.04, 1.02, 0.98][f], 1.0)))
    if anim == "andar":
        return T((0, 0, [0.0, 0.008, 0.004, 0.0, 0.008, 0.004][f]))
    if anim == "atacar":
        return T((0, LUNGA_ATAQUE[f], 0))
    return Matrix.Identity(4)                          # morrer: so o giro global


def angulo_perna(p, anim, f):
    """Angulo de giro (em Z, em torno da insercao) de uma pata."""
    lado = p["lado"]
    if anim == "parado":
        return lado * [0.0, 0.05, 0.0, -0.05][f]
    if anim == "andar":
        return AMP_PASSO * math.sin(2 * math.pi * f / 6 + p["fase"])
    if anim == "atacar":
        return lado * ABRIR_ATAQUE[f] if p["dianteira"] else 0.0
    return -lado * FLEXAO_MORTE[f]                     # morrer


def global_morte(f):
    return Rx_em(VIRAR_MORTE[f], PIVO_MORTE)


def matrizes(anim, f):
    """Matriz (sem o giro da direcao) de cada parte neste quadro, com o chao em z = 0."""
    corpo = local_corpo(anim, f)
    G = global_morte(f) if anim == "morrer" else Matrix.Identity(4)
    mats = []
    for p in PARTES:
        if p["tipo"] == "fixo":
            mats.append(Matrix.Identity(4))
        elif p["tipo"] == "corpo":
            mats.append(G @ corpo)
        else:
            L = corpo @ Rz_em(angulo_perna(PERNAS[p["perna"]], anim, f), PERNAS[p["perna"]]["A"])
            mats.append(G @ L)
    if anim == "morrer":                               # encosta no chao: menor z das partes moveis vai a zero
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


# ------------------------------------------------------------------ renders: 4 direcoes x quadros x camadas
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
            for p, M, ob in zip(PARTES, matrizes(anim, f), PARTS):
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
        "familia": "aranha",
        "cell": TILE,
        "pivo": list(ESTILO.pivo),
        "dirs": "4",
        "direcoes": DIRS,
        "escala": ESCALA_JOGO,
        "altura_m": 0.13,
        "camadas": CAMADAS,
        "escala_fisica": {"ppu_por_metro_96": PP.PPU_REF_96, "ppu_tile": PIPE.ppu, "origem_y": PIPE.origin_y},
        "anims": {a: {"frames": ANIMS[a][0], "fps": ANIMS[a][1], "loop": ANIMS[a][2],
                      **({"golpe_quadro": GOLPE_QUADRO[a]} if a in GOLPE_QUADRO else {})} for a in ANIMS},
        "paleta": sorted([list(c) for c in ESTILO.paleta]),
        "paleta_max": PP.PALETA_MAX,
        "nota": "aranha magra em 2 partes (cefalotorax e abdomen), 8 patas em 2 segmentos, po cinza-areia e olhos "
                "vermelhos; alfa binario; sombra com meia-tinta (xadrez de pixels) e nucleo solido.",
    }
    with open(os.path.join(HERE, "spec.json"), "w", encoding="utf-8") as fh:
        json.dump(spec, fh, indent=1, ensure_ascii=False)
tmp = PIPE.tmp
if os.path.exists(tmp):
    os.remove(tmp)
print("DONE", ESPECIE, TAG, repr(PIPE.ppu), flush=True)
