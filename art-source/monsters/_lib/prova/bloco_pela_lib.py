# ===== Bloco pela biblioteca (inserido por prova_campones_a7.py no lugar da camera e dos estagios de build-blender.py) =====
# Os ganchos de superficie (linha de contorno, tecido) sao do camponese e vem do proprio build-blender.py (copiados por leitura).
import sys as _sys
_sys.path.insert(0, LIB_DIR)
import pixel_pipeline as PP

#@HOOKS@#

rest = np.concatenate([np.array([v.co[:] for v in ob.data.vertices]) for ob in PARTS if ob["layer"] != "ferramenta"])
# Referencia A7: o autofit antigo (so aqui, na prova) deve bater com a escala fisica fixa da biblioteca.
PPU_AUTOFIT, ORIGEM_AUTOFIT = PP.ppu_silhueta(rest, 5, 83)
print("PROVA_ESCALA autofit_A7", repr(PPU_AUTOFIT), repr(ORIGEM_AUTOFIT), "biblioteca", repr(PP.PPU_REF_96))
assert abs(PPU_AUTOFIT - PP.PPU_REF_96) < 0.005, "PPU_REF_96 diferente da escala do A7"
ESTILO = PP.Estilo(tile=TILE, mats=MATS, camadas=LAYERS, linha_ok=LINE_OK, textura=cloth,
                   pele=("pele", "cabelo", "barba", "sobr", "iris", "olhob", "boca"),
                   sem_linha=("iris", "olhob", "boca", "sobr"),
                   ppu=PP.PPU_REF_96, origem_y=ORIGEM_AUTOFIT)
PIPE = PP.Pipeline(ESTILO, PARTS, TMP)
cam = PIPE.camera_iso(rest)
PIPE.preparar_render()
sc = PIPE.sc
shd = sc.display.shading
PPU, ORIGIN_Y, PIX = PIPE.ppu, PIPE.origin_y, PIPE.pix
RIGHT, UP, BACK = PIPE.right, PIPE.up, PIPE.back
load_png, save_png, lin_in = PP.load_png, PP.save_png, PP.lin_in
blocks, shift, N8 = (lambda a: PP.blocos(ESTILO, a)), PP.shift, PP.N8
extent, compose = PP.extent, PP.compose
CUR_MODE = "livre"


def set_attrs():
    PIPE.set_attrs()


def process_stage(layers, keep_layer):
    PIPE.modo = CUR_MODE
    PIPE.ocultar = tuple(os.environ.get("HIDE", "~").split(","))
    return PIPE.estagio(layers, keep_layer)
# ===== fim do bloco pela biblioteca =====
