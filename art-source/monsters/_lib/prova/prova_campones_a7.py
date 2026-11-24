"""Prova de que a biblioteca nao muda o camponese A7.

Roda o build-blender.py do camponese sem alterar o arquivo. Dois modos (env MODO):
- orig: o build original, so com a pasta de saida apontada para OUTDIR;
- lib:  o mesmo arquivo, mas camera e estagios de render substituidos pelo bloco_pela_lib.py,
        que usa art-source/monsters/_lib/pixel_pipeline.py. Geometria, poses e laco principal
        continuam os do build original.

Ambiente: REPO (raiz do worktree), OUTDIR (pasta de saida), OUTABS (pasta dos quadros), TAG,
ANIMS, DIRS, FMAX (ver build-blender.py).

Rodar: REPO=... OUTDIR=... MODO=lib timeout 300 blender -b --factory-startup -P prova_campones_a7.py
"""
import os

REPO = os.environ["REPO"]
LIB_DIR = os.path.join(REPO, "art-source", "monsters", "_lib")
BB = os.path.join(REPO, "art-source", "character-paperdoll", "build-blender.py")
MODO = os.environ.get("MODO", "orig")

with open(BB, encoding="utf-8") as fh:
    src = fh.read().split("\n")

out = []
for ln in src:
    out.append('OUT = os.environ["OUTDIR"]' if ln.startswith('OUT = "') else ln)

if MODO == "lib":
    ini = next(i for i, ln in enumerate(src) if "câmera ortográfica" in ln)
    fim = next(i for i, ln in enumerate(src) if ln.startswith("# ---") and "poses (A7" in ln)
    h0 = next(i for i, ln in enumerate(src) if ln.startswith("THR_LINE = "))
    h1 = next(i for i, ln in enumerate(src) if ln.startswith("def inner_lines("))
    with open(os.path.join(LIB_DIR, "prova", "bloco_pela_lib.py"), encoding="utf-8") as fh:
        bloco = fh.read().replace("#@HOOKS@#", "\n".join(src[h0:h1]))
    out = out[:ini] + bloco.split("\n") + out[fim:]

code = "\n".join(out)
g = {"__name__": "__main__", "LIB_DIR": LIB_DIR}
exec(compile(code, BB + " [" + MODO + "]", "exec"), g)
