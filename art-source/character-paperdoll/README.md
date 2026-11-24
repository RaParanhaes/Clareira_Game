# Personagem em camadas (paper doll) - fonte da arte

Fonte do personagem camponês em camadas, renderizado no Blender (5.2.3, modo headless) em pixel art 96x96, pivô (48, 84), 8 direções, alfa binário e paleta única de 35 cores na composta. A arte foi aprovada pelo dono (rodada A7); a integração no jogo ainda depende da aprovação das provas de imagem (`status: owner-review-pending` no manifest).

## Arquivos

- `build-blender.py`: script Blender que modela, anima (parado, andar, golpear) e renderiza os quadros. É o `script.py` da rodada A7, sem alterações.
- `mao_anchors.json`: âncora do punho direito por animação, direção e quadro (`mao_x`, `mao_y` em pixels da célula, y para baixo; `profundidade` = distância ao eixo do corpo em direção à câmera, + = mais perto). Vai para `sockets.hand` do manifest.

Os quadros (1280 PNG) não ficam no repositório; ficam nas evidências do dono e se regeneram com os passos abaixo.

## O que cada passagem é

Cada quadro sai em oito PNG `<anim>_<direcao>_<quadro>_<passagem>.png` (anim `parado` 4 quadros, `andar` 8, `golpear` 8; direção `S,SE,L,NE,N,NO,O,SO` = `south, southeast, east, northeast, north, northwest, west, southwest`):

| Passagem | Conteúdo |
| --- | --- |
| `corpo` | Pele, rosto, cabelo, barba, sobrancelhas, olhos e mãos. |
| `calca_botas` | Calça e botas. |
| `tunica` | Túnica, gola e mangas de linho, cinto, fivela e bolsa. |
| `gorro` | Gorro. |
| `ferramenta` | Machado inteiro na mão (só no golpear); é a união de `ferramenta_frente` e `ferramenta_tras`. |
| `ferramenta_frente` / `ferramenta_tras` | Partes do machado à frente / atrás do corpo. |
| `composta` | Tudo junto, referência para conferir a soma das camadas. |

Ordem de desenho: `ferramenta_tras`, `corpo`, `calca_botas`, `tunica`, `gorro`, `ferramenta_frente`.

## Como regenerar

1. Renderizar os quadros. O script tem o caminho de saída do dono fixo em `OUT` (linha 20); ajuste-o ou aponte `OUTABS` para a pasta de quadros. Cada processo leva de 115 a 170 s (limite do `timeout`: 300 s), então a rodada original usou metades das direções, dois processos em paralelo:

   ```sh
   # variáveis: ANIMS=parado,andar,golpear  DIRS=S,SE,L,NE,N,NO,O,SO  FMAX=n  TAG=nome  OUTABS=<pasta>
   TAG=andar1 ANIMS=andar DIRS=S,SE,L,NE   OUTABS=/caminho/frames timeout 300 blender -b --factory-startup -P art-source/character-paperdoll/build-blender.py &
   TAG=andar2 ANIMS=andar DIRS=N,NO,O,SO   OUTABS=/caminho/frames timeout 300 blender -b --factory-startup -P art-source/character-paperdoll/build-blender.py &
   wait
   # repetir para golpear (golpear1/golpear2) e rodar parado com as 8 direções
   ```

   Cada processo também grava `mao_anchors_<TAG>.json` em `OUT`; a união deles é o `mao_anchors.json` deste diretório (o `merge_anchors.py` da rodada A7 faz a união e fica nas evidências).

   **Reprodutibilidade:** o build dos atlas depende da pasta de quadros passada em `--frames`, que não está no repositório. Sem rodar o Blender de novo (comando acima, 115 a 170 s por processo, `timeout 300`), os atlas só se reproduzem a partir de uma cópia dessa pasta; os atlas versionados em `game/art/` são o resultado aprovado.

2. Montar os atlas, o manifest e conferir as camadas:

   ```sh
   npm run art:paperdoll:build -- --frames /caminho/frames
   # ou: node scripts/build-paperdoll-atlases.mjs --frames /caminho/frames --out game/art/avatar-frames/character-paperdoll-v1
   ```

   O script `art:paperdoll:build` não tem caminho fixo: sem `--frames` falha com mensagem clara. O build (15 s, Node puro, sem dependências) falha se algum quadro não for 96x96, se houver alfa parcial, se existir cor fora das rampas do manifest ou se a soma das camadas diferir da `composta`.

## Conferência da soma das camadas

Resultado da última execução: somando as camadas na ordem de desenho acima, o resultado é igual à `composta` nos 160 quadros (3 animações x 8 direções x 4, 8 e 8 quadros), com **diferença de 0 pixels**. A ordem fixa já basta; não foi preciso particionar os pixels por visibilidade. O resultado também fica em `verification` no manifest e é refeito por `game/character/paperdoll-assets.test.mjs` a partir dos atlas versionados (`reference/<anim>-composta.png`).

## Saída

`game/art/avatar-frames/character-paperdoll-v1/`: `manifest.json`, `atlases/<anim>/<camada>.png` (parado 384x768; andar e golpear 768x768; linhas = 8 direções, colunas = quadros; camadas vazias não geram arquivo) e `reference/<anim>-composta.png`. O renderizador está em `game/character/` (ainda não ligado ao `game/main.js`).
