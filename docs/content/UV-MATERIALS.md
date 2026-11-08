# Padrão obrigatório de materiais, atlas e UV

Este documento define como produzir e revisar as superfícies do mundo da Clareira. É obrigatório para novos objetos e alterações de arte: móveis, construções, vegetação, terreno, personagens, equipamentos e superfícies de efeitos. A ordem entre essas partes segue [ISOMETRIC-DEPTH.md](ISOMETRIC-DEPTH.md). Interface DOM, textos e luzes sem superfície usam suas próprias coordenadas; a ficha do efeito deve declarar essa condição.

## Responsabilidades

| Conceito | Define |
|---|---|
| Geometria e faces | Forma, dimensões e orientação da peça |
| Atlas de materiais | Regiões da imagem usadas por madeira, tecido, pedra e outros materiais |
| UV | Qual região da textura ocupa cada ponto da face |
| Atlas de sprites | Imagens finais por direção, estado e quadro |
| Iluminação | Luz e sombra aplicadas ao material |
| Profundidade | Partes que encobrem outras partes |

O UV acompanha a superfície no espaço local do objeto. Girar, mover ou animar uma peça transforma a geometria e preserva a ligação da textura com ela. Uma correção de sobreposição deve alterar geometria ou profundidade, conforme a causa; mudar a textura não resolve a visibilidade de uma face sólida.

## Contrato de autoria

Cada modelo deve declarar:

- Eixos locais, largura, profundidade, altura, pivô de contato e direções disponíveis.
- As quatro orientações-base e a correspondência entre cada orientação e a geometria/variante usada; para conjuntos modulares, identificar separadamente segmento reto, canto, extremidade, junção ou abertura.
- Faces ou partes nomeadas, material e coordenadas UV de cada superfície texturizada; registrar espelhamento intencional.
- Atlas, regiões, escala do texel, transparência, versão e fonte editável ou exportador reproduzível.
- Estados e quadros que alteram a superfície, preservando o pivô e a textura nos pontos de ligação.
- Camadas de oclusão e ordem por direção, conforme o padrão de profundidade.

O desenho procedural deve usar coordenadas locais equivalentes e documentar a projeção do material. Ao migrar uma face para UV, manter sua escala, orientação e identidade visual. Faces ainda sem mapeamento devem constar como pendentes; isso não certifica o objeto inteiro como convertido.

## Regras de produção

1. Definir silhueta, dimensões e faces antes de adicionar textura. Forma, física e interação partem do mesmo modelo de referência.
2. Distribuir materiais no atlas e registrar regiões. Reutilizar regiões entre peças compatíveis; evitar duplicar imagens somente para mudar paleta.
3. Mapear UV no espaço local. Escala do texel deve ser consistente entre faces vizinhas; distorções e emendas precisam de revisão visual.
4. Separar cor-base, detalhes de material e iluminação. Os detalhes devem explicar o material sem ocultar a forma. Materiais emissivos ou com iluminação incorporada exigem declaração explícita.
5. Exportar pixel art com amostragem nearest-neighbor, pivôs estáveis e margens entre regiões quando houver risco de vazamento de pixels. Preservar alpha sem halos.
6. Gerar as quatro orientações-base, os estados e quadros necessários. Vincular os mesmos materiais às partes correspondentes; espelhamento deve preservar detalhes assimétricos. Quando a rotação da forma-base não resolver uma junção ou silhueta, produzir uma variante geométrica própria e mapear suas faces ao mesmo contrato de materiais/UV.

PNG é o formato atual dos atlas de móveis. UV pode ser aplicado durante a exportação e incorporado aos sprites finais: o jogo continua usando imagens 2D, sem exigir uma engine 3D ou cálculo de textura por quadro.

## Implementação atual dos móveis

Fontes: `game/room-fixture-renderer.mjs`, `game/room-fixture-materials.mjs` e `scripts/export-room-furniture-atlas.mjs`.

O atlas `game/art/room-furniture/room-materials-v1.png` tem células de 8×8 pixels, seis colunas (wood, fabric, stone, metal, glass, leaf) e quatro linhas (cedar, pine, hotel, vista). Seus detalhes transparentes sobrepõem a cor iluminada da face. `materials-manifest.json` registra o contrato; `manifest.json` referencia a fonte usada no atlas final de sprites.

As coordenadas de vértice expostas pelo renderer são `[telaX, telaY, u, v, z]`. `u` e `v` são normalizados nas dimensões locais; `z` está em unidades do mundo. A escala atual é 16 pixels de material por unidade:

| Plano local | Coordenadas da textura em pixels |
|---|---|
| Topo, z constante | `(u × largura × 16, v × profundidade × 16)` |
| Frente/fundo, v constante | `(u × largura × 16, −z × 16)` |
| Lateral, u constante | `(v × profundidade × 16, −z × 16)` |

O exportador mapeia o padrão repetível sobre cada polígono. Faces inclinadas sem plano reconhecido ainda mantêm cor autoral: precisam de UV explícito em futuras revisões que as convertam. Essa implementação não equivale a uma malha completa com UV individual de todas as faces.

### Primeira cama com fonte 3D e UV

`furniture.bed` agora usa uma malha-fonte própria em `game/art/room-furniture/bed-3d-prototype/medieval-bed.blend`. A malha usa um atlas UV pixelado de 32×8, pivô no centro do contato com o piso e footprint cadastrado de 1,9×1,25. Blender renderiza as quatro rotações na câmera ortográfica do jogo; a exportação espelha o eixo horizontal da câmera para corresponder à projeção Canvas. O jogo continua consumindo PNGs no atlas `room-furniture-v3.png`.

O exportador da cama substitui as linhas `bed`, `bed-open` e `bed-cover` pelas saídas reproduzíveis em `bed-3d-prototype/frames/`; as quatro paletas reutilizam essa versão de madeira medieval. `bed` contém o conjunto completo, `bed-open` omite a coberta e `bed-cover` contém apenas a coberta, acrescentando a cabeceira nas rotações 2/3 em que ela fica próxima. Assim, o desenho ordena cama, avatar deitado e coberta/cabeceira dianteira em camadas distintas. A malha e o buffer de profundidade são usados durante a autoria/exportação, não no quadro do jogo.

### Catálogo medieval completo

Os 200 modelos de `MEDIEVAL_FURNITURE` agora seguem o mesmo princípio com malhas Blender paramétricas por família e perfil: cada peça recebe dimensões, silhueta, material UV próprio e quatro renders ortográficos do mesmo pivô. `scripts/export-medieval-furniture-3d.mjs` gera as fontes editáveis em `game/art/room-furniture/medieval-3d-v1/`, o atlas PNG e o manifesto. O runtime seleciona o quadro por ID estável, rotação e estado: camas têm base coberta/aberta e camada de coberta para deitar; fontes de fogo têm estados aceso/apagado. A antiga geometria Canvas fica como fallback se o atlas não carregar. A cama-base já aprovada conserva sua fonte detalhada original.

### Primeira fachada residencial 3D

`game/art/buildings/medieval-cottage-3d/medieval-cottage.blend` é a fonte editável da Cabana do Cedro. `scripts/blender/build-medieval-cottage.py` gera o atlas UV empacotado e quatro sprites isométricos com pivô comum, além de uma variante noturna emissiva e vistas frontal, posterior, laterais, superior e hero. O Canvas 2D seleciona dia/noite para `cabin-cedar-one`; nenhuma malha ou shader 3D roda por quadro. A fonte mantém medidas 3D; somente os sprites de jogo recebem a compensação vertical da projeção não uniforme da Clareira.

Para qualquer objeto 3D→sprite, manter a malha editável, atlas/UV, pivô, câmera, frames exportados, estados semânticos e camadas de oclusão junto à definição do asset. Gerar as orientações a partir de um pivô comum; validar as quatro faces e o corte de cada estado; separar em sprites as partes que precisam intercalar atores. Um PNG único continua sem profundidade por pixel depois da exportação.

Para editar: alterar o atlas sem suavização e executar `node scripts/export-room-furniture-atlas.mjs`. A exportação preserva o PNG de materiais existente. `--reset-materials` recria os padrões iniciais e substitui edições desse arquivo. O runtime consome `room-furniture-v1.png`, com as texturas incorporadas, respeitando o carregamento e versionamento de [README.md](README.md).

## Critérios de aceitação

- Prancha identificada de todas as direções e estados alterados, em tamanho nativo e ampliação nearest-neighbor.
- Ausência de textura deslizando, invertida sem intenção, esticada, com emendas incoerentes, halos ou vazamento entre regiões.
- Verificação de pivô, recorte, transparência, dimensões, manifesto e orçamento de arquivo/memória.
- Inspeção no quarto ou mundo, em desktop e celular, com a iluminação da cena.
- Para mudanças no mapeamento: teste que confirme que os mesmos pontos locais mantêm as coordenadas UV durante a rotação.

Registrar pendências por face/estado. Aprovação de PNG, hash ou teste unitário comprova a parte técnica verificada; a aprovação visual exige inspeção dos pixels exportados e da cena.

A revisão 2 da cabana exporta parede diurna/noturna, pilares independentes e cobertura do alpendre; todos usam frame 320×320 e pivô (160,207). A projeção UV descarta o eixo dominante da normal, e a auditoria verifica área UV não nula. Consulte [BLENDER-ASSET-WORKFLOW.md](BLENDER-ASSET-WORKFLOW.md) para as etapas obrigatórias de autoria e evidência.
