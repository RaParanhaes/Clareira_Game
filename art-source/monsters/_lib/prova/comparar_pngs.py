"""Compara PNGs RGBA 8 bits pixel a pixel (sem dependencias: zlib do Python).

Uso: python3 comparar_pngs.py <pasta_a> <pasta_b> [--nomes padrao] [--esperar N] > relatorio.json (exit 1 se falhar)
Compara todos os PNG de <pasta_a> que existem com o mesmo nome em <pasta_b>.
Saida: JSON com, por arquivo, total de pixels diferentes (RGBA) e a maior diferenca por canal.
"""
import glob
import json
import os
import struct
import sys
import zlib


def ler_png(caminho):
    with open(caminho, "rb") as fh:
        dados = fh.read()
    assert dados[:8] == b"\x89PNG\r\n\x1a\n", caminho
    pos, idat, w, h, bd, ct = 8, [], 0, 0, 0, 0
    while pos < len(dados):
        n, tipo = struct.unpack(">I4s", dados[pos:pos + 8])
        corpo = dados[pos + 8:pos + 8 + n]
        if tipo == b"IHDR":
            w, h, bd, ct, _, _, il = struct.unpack(">IIBBBBB", corpo)
            assert bd == 8 and ct == 6 and il == 0, (bd, ct, il)
        elif tipo == b"IDAT":
            idat.append(corpo)
        pos += 12 + n
    raw = zlib.decompress(b"".join(idat))
    bpp, stride = 4, w * 4
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]
        linha = bytearray(raw[p + 1:p + 1 + stride])
        p += 1 + stride
        for x in range(stride):
            a = linha[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                linha[x] = (linha[x] + a) & 255
            elif f == 2:
                linha[x] = (linha[x] + b) & 255
            elif f == 3:
                linha[x] = (linha[x] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                linha[x] = (linha[x] + pr) & 255
        out[y * stride:(y + 1) * stride] = linha
        prev = linha
    return w, h, bytes(out)


def comparar(a, b):
    wa, ha, da = ler_png(a)
    wb, hb, db = ler_png(b)
    if (wa, ha) != (wb, hb):
        return {"erro": "tamanho %sx%s vs %sx%s" % (wa, ha, wb, hb)}
    dif_px = 0
    max_canal = [0, 0, 0, 0]
    for i in range(0, len(da), 4):
        ca, cb = da[i:i + 4], db[i:i + 4]
        if ca != cb:
            dif_px += 1
            for k in range(4):
                max_canal[k] = max(max_canal[k], abs(ca[k] - cb[k]))
    return {"pixels": wa * ha, "pixels_diferentes": dif_px, "maior_diferenca_RGBA": max_canal}


def main(argv):
    """Uso: comparar_pngs.py <pasta_a> <pasta_b> [--nomes padrao] [--esperar N]

    Sai com codigo 1 (e nao so JSON) se: nenhum arquivo foi comparado, falta arquivo de A em B, houver erro
    de leitura ou tamanho, houver pixel diferente, ou se --esperar N e a quantidade comparada nao for N.
    """
    pa, pb = argv[1], argv[2]
    padrao = argv[argv.index("--nomes") + 1] if "--nomes" in argv else "*.png"
    esperar = int(argv[argv.index("--esperar") + 1]) if "--esperar" in argv else None
    arquivos_a = sorted(glob.glob(os.path.join(pa, padrao)))
    res = {}
    for arq in arquivos_a:
        nome = os.path.basename(arq)
        alvo = os.path.join(pb, nome)
        if not os.path.exists(alvo):
            res[nome] = {"erro": "ausente em B"}
            continue
        res[nome] = comparar(arq, alvo)
    comparados = [k for k, r in res.items() if "erro" not in r]
    total = sum(res[k]["pixels_diferentes"] for k in comparados)
    erros = [k for k, r in res.items() if "erro" in r]
    falhas = []
    if not arquivos_a:
        falhas.append("nenhum arquivo em A (%s)" % pa)
    if erros:
        falhas.append("arquivos com erro ou ausentes: %d" % len(erros))
    if total:
        falhas.append("pixels diferentes: %d" % total)
    if esperar is not None and len(comparados) != esperar:
        falhas.append("cobertura: comparados %d, esperados %d" % (len(comparados), esperar))
    print(json.dumps({"arquivos": len(res), "comparados": len(comparados), "pixels_diferentes_total": total,
                      "com_erro": erros, "falhas": falhas, "detalhe": res}, ensure_ascii=False, indent=1))
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
