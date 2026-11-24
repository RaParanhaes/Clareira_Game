"""Biblioteca de pixel art 3D (Blender headless) para monstros e outros sprites isometricos.

Extraida de art-source/character-paperdoll/build-blender.py (rodada A7). A aritmetica dos estagios
e a mesma do build do campones: com Estilo(tile=96) e as mesmas regras, o resultado e identico pixel a pixel.

O que a biblioteca faz (o que e comum a qualquer especie):
- camera ortografica isometrica (X=60, Z=45), escala medida pela silhueta da propria malha;
- preparo de render (Workbench, 4x de supersampling, alfa binario, sem AA);
- passes de render: id de material, normal/profundidade, uv e grupo (cor de vertice);
- sombreamento em 4x com luz fixa de tela e oclusao por profundidade;
- reducao por bloco 4x4 (material dominante) para a celula final TILE (96 ou 192);
- tons por material (4-5 no maximo), dithering Bayer, remocao de pixels isolados;
- contorno de 1 px e linhas internas, alfa binario, paleta limitada por especie;
- composicao de camadas, espelho horizontal e montagem de atlas.

O que fica com a especie (passado ao Estilo):
- materiais (cores por tom, camada, peso, tremor, bias, oclusao), camadas de desenho;
- grupos de contorno (matriz linha_ok), materiais de pele, materiais sem linha interna;
- textura de tecido ou de superficie (funcao textura(mat, ex) -> (tex, add)), opcional.

Uso (dentro do Blender, com a cena montada):
    import sys; sys.path.insert(0, "<pasta>/art-source/monsters/_lib")
    import pixel_pipeline as PP
    e = PP.Estilo(tile=96, mats=MATS, camadas=["corpo"], ...)
    pipe = PP.Pipeline(e, partes, "/caminho/tmp.png")
    pipe.camera_iso(pontos_da_malha); pipe.preparar_render()
    rgba, Dfull, D96, mat, grp = pipe.estagio(["corpo"], "corpo")
"""
import math
import os

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view  # noqa: F401  (usado pelas especies)
from mathutils import Euler, Matrix, Vector

SS = 4                                   # supersampling: render = tile * SS
ATTRS = ("nd", "uv", "gp")               # passes de cor de vertice (normal, uv, grupo)
GAME_DIRS = ["S", "SE", "L", "NE", "N", "NO", "O", "SO"]
DIR_SCREEN = {"S": (0, 1), "SE": (1, 1), "L": (1, 0), "NE": (1, -1), "N": (0, -1), "NO": (-1, -1),
              "O": (-1, 0), "SO": (-1, 1)}
# Direcoes bilaterais: 5 renders (S, SE, L, NE, N) e 3 espelhos horizontais.
ESPELHO_DE = {"O": "L", "SO": "SE", "NO": "NE"}
BILATERAL_RENDER = ["S", "SE", "L", "NE", "N"]
RADIAL4 = ["SE", "NE", "SO", "NO"]          # modo radial (slime, aranha): mesma ordem de FOUR em game/monster-sprites.mjs

# Escala fisica do personagem A7: 43.92 px por metro na celula 96 (camera ortografica, mesma do build-blender.py).
# Todas as especies usam esta mesma escala; o tamanho do monstro sai da malha em metros, sem autofit.
# Valor exato confirmado por prova/bloco_pela_lib.py (ppu_silhueta do A7) antes do uso.
PPU_REF_96 = 43.915583775317494          # exato: ppu_silhueta(rest do A7, 5, 83) medido pela prova (PROVA_ESCALA)
ORIGEM_Y_96 = 84                         # pe (z = 0) do modelo cai na linha 84 da celula 96 (pivo do jogo)
THR_T = {5: [0.84, 0.68, 0.50, 0.33], 4: [0.78, 0.58, 0.38], 3: [0.62, 0.40], 2: [0.5], 1: []}
OUTLINE = (30, 19, 17)                   # contorno externo 1 px
INNER = (56, 40, 33)                     # linhas internas 1 px
LK = np.array((-0.50, 0.35, 0.80))
LK /= np.linalg.norm(LK)
LF = np.array((0.62, -0.10, 0.50))
LF /= np.linalg.norm(LF)
AMB, KEY, FILL = 0.14, 0.64, 0.16
AO_D, AO_K = 0.055, 0.26
AO_R_BASE = 11                           # raio da oclusao na escala 96 (escala com TILE)
THR_LINE = 0.07
THR_CABECA = 0.11
PALETA_MAX = 48
BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16.0 - 0.5
N4 = ((-1, 0), (1, 0), (0, -1), (0, 1))
N8 = tuple((dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy, dx) != (0, 0))


def ppu_extensao(pontos, ppu, origin_y):
    """Topo e base (em pixels, y para baixo) da silhueta de `pontos` com a camera de escala ppu.

    Usa os 8 giros em Z, como o build do camponese. Projecao: y = origin_y - (p . UP) * ppu.
    """
    Rcam = Euler((math.radians(60), 0, math.radians(45)), "XYZ").to_matrix()
    UP_NP = np.array(Rcam @ Vector((0, 1, 0)), np.float64)
    ups = []
    for k in range(8):
        Rz = np.array(Matrix.Rotation(k * math.pi / 4, 3, "Z"))
        ups.append((pontos @ Rz.T) @ UP_NP)
    ups = np.concatenate(ups)
    return origin_y - ups.max() * ppu, origin_y - ups.min() * ppu


def ppu_silhueta(pontos, sil_top, sil_base):
    """Escala do build do camponese (autofit antigo, so para a prova): cabe a silhueta em [sil_top, sil_base]."""
    Rcam = Euler((math.radians(60), 0, math.radians(45)), "XYZ").to_matrix()
    UP_NP = np.array(Rcam @ Vector((0, 1, 0)), np.float64)
    ups = []
    for k in range(8):
        Rz = np.array(Matrix.Rotation(k * math.pi / 4, 3, "Z"))
        ups.append((pontos @ Rz.T) @ UP_NP)
    ups = np.concatenate(ups)
    ppu = (sil_base - sil_top + 1) / (ups.max() - ups.min())
    return ppu, sil_top + ups.max() * ppu


class Estilo:
    """Parametros de uma especie. Valores de tile=96 reproduzem o camponese A7 sem mudanca."""

    def __init__(self, tile, mats, camadas, linha_ok=None, textura=None, pele=(), sem_linha=(),
                 sil=(5, 83), pivo=None, paleta_max=PALETA_MAX, ppu=None, origem_y=None):
        self.tile = int(tile)
        self.ss = SS
        self.res = self.tile * SS
        k = self.tile / 96.0
        self.sil_top = int(round(sil[0] * k))
        self.sil_base = int(round(sil[1] * k))
        self.pivo = pivo if pivo is not None else (self.tile // 2, int(round(84 * k)))
        # escala fisica: px por metro no tile dado (sem autofit). origem_y = linha do pe do modelo.
        self.ppu = float(ppu) if ppu is not None else PPU_REF_96 * k
        self.origem_y = float(origem_y) if origem_y is not None else float(self.pivo[1])
        self.ao_r = int(round(AO_R_BASE * k))
        self.nomes = list(mats.keys())
        self.nm = len(self.nomes)
        self.mid = {n: i for i, n in enumerate(self.nomes)}
        self.camadas = list(camadas)
        self.lid = {n: i for i, n in enumerate(self.camadas)}
        self.mat_layer = np.array([self.lid[mats[n]["layer"]] for n in self.nomes])
        self.mat_w = np.array([mats[n]["w"] for n in self.nomes], float)
        self.mat_dith = np.array([mats[n]["dith"] for n in self.nomes], float)
        self.mat_bias = np.array([mats[n]["bias"] for n in self.nomes], float)
        self.mat_ao = np.array([mats[n]["ao"] for n in self.nomes], float)
        self.mat_nt = np.array([len(mats[n]["r"]) for n in self.nomes])
        self.mats = mats
        self.paleta = sorted({c for n in mats for c in mats[n]["r"]} | {OUTLINE, INNER})
        if len(self.paleta) > paleta_max:
            raise ValueError("paleta com %d cores (limite %d)" % (len(self.paleta), paleta_max))
        self.cabeca = np.array([self.mid[n] for n in pele], int)
        self.sem_linha = [self.mid[n] for n in sem_linha]
        self.linha_ok = linha_ok if linha_ok is not None else np.ones((32, 32), bool)
        self.textura = textura


# ------------------------------------------------------------------ utilitarios de imagem (Blender)
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


def set_active_attr(me, an):
    a = me.color_attributes[an]
    me.color_attributes.active_color = a
    me.color_attributes.render_color_index = list(me.color_attributes).index(a)


def blocos(e, a):
    return a.reshape(e.tile, e.ss, e.tile, e.ss)


def shift(a, dy, dx, fill):
    h, w = a.shape[-2:]
    p = np.pad(a, [(0, 0)] * (a.ndim - 2) + [(1, 1), (1, 1)], constant_values=fill)
    return p[..., 1 + dy:1 + dy + h, 1 + dx:1 + dx + w]


def box_mean(a, w, r):
    def csum(x, axis):
        c = np.cumsum(np.pad(x, [(r + 1, r) if i == axis else (0, 0) for i in range(2)]), axis=axis)
        n = x.shape[axis]
        sl = lambda s: tuple(s if i == axis else slice(None) for i in range(2))
        return c[sl(slice(2 * r + 1, 2 * r + 1 + n))] - c[sl(slice(0, n))]
    num = csum(csum(a * w, 0), 1)
    den = csum(csum(w.astype(np.float64), 0), 1)
    return num / np.maximum(den, 1e-6)


# ------------------------------------------------------------------ estagios puros (recebem o Estilo)
def shade(e, idv, nx, ny, D):
    aok = e.mat_ao[np.maximum(idv, 0)]
    m = idv >= 0
    L = np.sqrt(np.maximum(nx * nx + ny * ny, 1e-9))
    sc_ = np.where(L > 1, 1 / L, 1.0)
    nx, ny = nx * sc_, ny * sc_
    nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
    k = np.clip(nx * LK[0] + ny * LK[1] + nz * LK[2], 0, 1)
    f = np.clip(nx * LF[0] + ny * LF[1] + nz * LF[2], 0, 1)
    s = AMB + KEY * k + FILL * f
    Dm = np.where(m, D, 0).astype(np.float64)
    mean = box_mean(Dm, m.astype(np.float64), e.ao_r)
    ao = np.clip((mean - D) / AO_D, 0, 1) * m
    return (s - AO_K * aok * ao).astype(np.float32)


def reduce(e, idv, s, D, extras=(), gp=None):
    T = e.tile
    cnt = np.zeros((e.nm, T, T), np.float32)
    ssum = np.zeros_like(cnt)
    dsum = np.zeros_like(cnt)
    for m in range(e.nm):
        sel = idv == m
        if not sel.any():
            continue
        cnt[m] = blocos(e, sel).sum((1, 3))
        ssum[m] = blocos(e, np.where(sel, s, 0)).sum((1, 3))
        dsum[m] = blocos(e, np.where(sel, D, 0)).sum((1, 3))
    tot = cnt.sum(0)
    dom = (cnt * e.mat_w[:, None, None]).argmax(0)
    cd = np.take_along_axis(cnt, dom[None], 0)[0]
    alpha = tot >= 8
    s96 = np.take_along_axis(ssum, dom[None], 0)[0] / np.maximum(cd, 1)
    d96 = np.take_along_axis(dsum, dom[None], 0)[0] / np.maximum(cd, 1)
    mat = np.where(alpha, dom, -1)
    ex96 = []
    if extras:
        dom_up = np.repeat(np.repeat(dom, e.ss, 0), e.ss, 1)
        selD = idv == dom_up
        nsel = np.maximum(blocos(e, selD).sum((1, 3)), 1)
        for x in extras:
            ex96.append((blocos(e, np.where(selD, x, 0)).sum((1, 3)) / nsel).astype(np.float32))
        gbest = np.zeros((T, T), np.int32)
        gcnt = np.full((T, T), -1.0, np.float32)
        for g in np.unique(gp[selD]):
            c = blocos(e, selD & (gp == g)).sum((1, 3)).astype(np.float32)
            upd = c > gcnt
            gbest = np.where(upd, g, gbest)
            gcnt = np.where(upd, c, gcnt)
        ex96.append(gbest)
    return mat, s96, np.where(alpha, d96, -9.0).astype(np.float32), ex96


def tones(e, mat, s96, tex=0.0):
    T = e.tile
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
    sf = 0.45 * s96 + 0.55 * sm + tex - e.mat_bias[np.maximum(mat, 0)]
    yy, xx = np.mgrid[0:T, 0:T]
    bay = BAYER[yy % 4, xx % 4]
    sf = sf + bay * e.mat_dith[np.maximum(mat, 0)]
    tone = np.zeros(mat.shape, np.int32)
    for m in range(e.nm):
        sel = mat == m
        if not sel.any():
            continue
        thr = THR_T[int(e.mat_nt[m])]
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
    return np.minimum(tone, np.maximum(e.mat_nt[np.maximum(mat, 0)] - 1, 0))


def inner_lines(e, grp, mat, Dc, layerC, K):
    mark = np.zeros(mat.shape, bool)
    g = np.clip(grp, 0, 31)
    for dy, dx in N4:
        qg = np.clip(shift(grp, dy, dx, 0), 0, 31)
        qm = shift(mat, dy, dx, -1)
        qd = shift(Dc, dy, dx, -9.0)
        ql = shift(layerC, dy, dx, -1)
        diff = (qm >= 0) & (qg != g) & e.linha_ok[g, qg]
        far = (Dc < qd - 0.003) | ((np.abs(Dc - qd) <= 0.003) & (g < qg))
        mark |= K & diff & (((ql == layerC) & far) | ((ql >= 0) & (ql < layerC)))
    return mark


def paint_layer(e, mat, tone, Dc, layerC, K, grp, with_ring=True):
    """K = pixels desta camada. Retorna rgba TILExTILE e mapa de profundidade (com anel)."""
    T = e.tile
    t2 = tone.copy()
    mark = np.zeros(mat.shape, bool)
    thr = np.where(np.isin(mat, e.cabeca), THR_CABECA, THR_LINE)
    for dy, dx in N4:
        qm = shift(mat, dy, dx, -1)
        qd = shift(Dc, dy, dx, -9.0)
        ql = shift(layerC, dy, dx, -1)
        q_alpha = qm >= 0
        nearer = q_alpha & (qd - Dc > thr)
        mine_nearer_other = q_alpha & (ql != layerC) & (Dc - qd > thr)
        mark |= K & (nearer | mine_nearer_other)
    nt = np.maximum(e.mat_nt[np.maximum(mat, 0)] - 1, 0)
    t2 = np.where(mark, np.minimum(t2 + 2, nt), t2)
    out = np.zeros((T, T, 4), np.uint8)
    for m in range(e.nm):
        sel = K & (mat == m)
        if not sel.any():
            continue
        r = e.mats[e.nomes[m]]["r"]
        for t in range(len(r)):
            out[sel & (t2 == t), :3] = r[t]
    out[K, 3] = 255
    lines = inner_lines(e, grp, mat, Dc, layerC, K) & ~np.isin(mat, e.sem_linha)
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


def compose(order):
    """Empilha imagens RGBA na ordem dada (a ultima fica por cima onde tem alfa)."""
    out = np.zeros(order[0].shape, np.uint8)
    for im in order:
        m = im[..., 3] > 0
        out[m] = im[m]
    return out


def extent(img):
    ys, xs = np.nonzero(img[..., 3])
    return (int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())) if len(ys) else (0, 0, 0, 0)


def espelhar(cel):
    """Espelho horizontal de uma celula. ATENCAO: so e fiel se a luz for simetrica no eixo do espelho.

    A luz da biblioteca (LK, LF) e assimetrica; espelhar uma direcao inverte a luz. Por isso os monstros
    renderizam todas as direcoes que usam (8 ou 4), sem espelho. Esta funcao fica para o camponese A7.
    """
    return cel[:, ::-1].copy()


def montar_atlas(linhas):
    """linhas[i][j] = celula da direcao i e quadro j (todas do mesmo tamanho). Devolve a folha RGBA."""
    return np.concatenate([np.concatenate(list(lin), axis=1) for lin in linhas], axis=0)


# ------------------------------------------------------------------ pipeline com cena Blender
class Pipeline:
    def __init__(self, estilo, partes, caminho_tmp):
        self.e = estilo
        self.partes = partes          # lista viva: objetos com custom props layer, only, grp
        self.tmp = caminho_tmp
        self.sc = bpy.context.scene
        self.cam = None
        self.modo = "livre"           # modo atual (filtra partes com custom prop only)
        self.ocultar = ()             # prefixos de nome a esconder (ex.: ferramenta de teste)

    # --- camera e render
    def camera_iso(self, pontos=None):
        """Camera ortografica X=60, Z=45 com escala FISICA fixa (e.ppu, px por metro) e pe do modelo em e.origem_y.

        Sem autofit: o tamanho da especie e o tamanho real em metros. Se `pontos` (N x 3, coordenadas de modelo)
        for dado, confere que a silhueta cabe na celula e falha se nao couber.
        """
        e = self.e
        cam_data = bpy.data.cameras.new("CamIso")
        cam_data.type = "ORTHO"
        cam_data.clip_start, cam_data.clip_end = 0.1, 100
        cam = bpy.data.objects.new("CamIso", cam_data)
        self.sc.collection.objects.link(cam)
        cam.rotation_euler = Euler((math.radians(60), 0, math.radians(45)), "XYZ")
        Rcam = cam.rotation_euler.to_matrix()
        UP = Rcam @ Vector((0, 1, 0))
        BACK = Rcam @ Vector((0, 0, 1))
        RIGHT = Rcam @ Vector((1, 0, 0))
        ppu, origin_y = e.ppu, e.origem_y
        if pontos is not None:
            top, base = ppu_extensao(pontos, ppu, origin_y)
            if top < 0 or base > e.tile:
                raise ValueError("silhueta fora da celula: topo %.1f base %.1f (celula %d)" % (top, base, e.tile))
        cam_data.ortho_scale = e.tile / ppu
        cam.location = UP * ((origin_y - e.tile / 2) / ppu) + BACK * 10
        self.cam = cam
        self.up, self.back, self.right = UP, BACK, RIGHT
        self.up_np, self.back_np, self.right_np = (np.array(v, np.float64) for v in (UP, BACK, RIGHT))
        self.ppu, self.origin_y, self.pix = ppu, origin_y, 1.0 / ppu
        print("PPU", repr(ppu), "origem_y", repr(origin_y))
        return cam

    def preparar_render(self):
        sc, e = self.sc, self.e
        sc.camera = self.cam
        sc.render.engine = "BLENDER_WORKBENCH"
        sc.render.resolution_x = sc.render.resolution_y = e.res
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
        sc.render.filepath = self.tmp
        sc.render.threads_mode = "FIXED"
        sc.render.threads = 2

    def _shd(self):
        return self.sc.display.shading

    def mostrar(self, camadas):
        for ob in self.partes:
            ob.hide_render = (ob["layer"] not in camadas) or (ob["only"] not in ("", self.modo)) or \
                any(ob.name.startswith(h) for h in self.ocultar)

    def render_all(self):
        e = self.e
        shd = self._shd()
        shd.light, shd.color_type = "FLAT", "MATERIAL"
        bpy.ops.render.render(write_still=True)
        a = load_png(self.tmp)
        al = a[..., 3] > 0.5
        idv = np.where(al, np.rint(lin_in(a, 0) * 32).astype(np.int32) - 1, -1)
        vis = [ob for ob in self.partes if not ob.hide_render]
        out = []
        shd.light, shd.color_type = "FLAT", "VERTEX"
        for an in ATTRS:
            for ob in vis:
                set_active_attr(ob.data, an)
            bpy.ops.render.render(write_still=True)
            out.append(load_png(self.tmp))
        b, c, d = out
        nx = ((lin_in(b, 0) - 0.5) * 2).astype(np.float32)
        ny = ((lin_in(b, 1) - 0.5) * 2).astype(np.float32)
        D = ((lin_in(b, 2) - 0.5) * 4.0).astype(np.float32)
        ux = ((lin_in(c, 0) - 0.5) * 0.8).astype(np.float32)
        uy = ((lin_in(c, 1) - 0.5) * 0.8).astype(np.float32)
        uz = (lin_in(c, 2) * 2.0).astype(np.float32)
        gp = np.where(al, np.rint(lin_in(d, 0) * 32).astype(np.int32), 0)
        return idv, nx, ny, D, ux, uy, uz, gp

    def set_attrs(self):
        """Grava em cada malha a normal (nd) e a profundidade no mundo, na camera atual."""
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        for ob in self.partes:
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
            c = np.stack([0.5 + 0.5 * (nw @ self.right_np), 0.5 + 0.5 * (nw @ self.up_np),
                          np.clip(0.5 + (w @ self.back_np) / 4.0, 0, 1), np.ones(n)], 1).astype(np.float32)
            ob.data.color_attributes["nd"].data.foreach_set("color", c.ravel())
            ob.data.update()
            ev.to_mesh_clear()
        bpy.context.view_layer.update()

    def renderizar_ids(self, pred):
        for ob in self.partes:
            ob.hide_render = not pred(ob)
        shd = self._shd()
        shd.light, shd.color_type = "FLAT", "MATERIAL"
        bpy.ops.render.render(write_still=True)
        a = load_png(self.tmp)
        al = a[..., 3] > 0.5
        return np.where(al, np.rint(lin_in(a, 0) * 32).astype(np.int32) - 1, -1)

    # --- estagio: camadas visiveis -> material, tom, contorno
    def estagio(self, camadas, camada_keep):
        e = self.e
        self.mostrar(camadas)
        idv, nx, ny, D, ux, uy, uz, gp = self.render_all()
        s = shade(e, idv, nx, ny, D)
        L = np.sqrt(np.maximum(nx * nx + ny * ny, 1e-9))
        k_ = np.where(L > 1, 1 / L, 1.0)
        nz = np.sqrt(np.clip(1 - (nx * k_) ** 2 - (ny * k_) ** 2, 0, 1)).astype(np.float32)
        mat, s96, D96, ex = reduce(e, idv, s, D, extras=[nz, ux, uy, uz], gp=gp)
        if e.textura is not None:
            tex, add = e.textura(mat, ex)
        else:
            tex, add = 0.0, 0
        tone = tones(e, mat, s96, tex)
        nt = np.maximum(e.mat_nt[np.maximum(mat, 0)] - 1, 0)
        tone = np.minimum(tone + add, nt)
        layerC = np.where(mat >= 0, e.mat_layer[np.maximum(mat, 0)], -1)
        K = layerC == e.lid[camada_keep]
        rgba, Dfull = paint_layer(e, mat, tone, D96, layerC, K, ex[4])
        return rgba, Dfull, D96, mat, ex[4]
