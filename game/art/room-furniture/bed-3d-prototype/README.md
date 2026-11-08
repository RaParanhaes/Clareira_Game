# Protótipo 3D/UV da cama medieval

Fonte 3D aprovada para a primeira cama medieval com autoria por geometria e UV. O jogo continua usando Canvas 2D e sprites rasterizados; não há malha 3D em tempo de execução.

- Fonte editável: `medieval-bed.blend` (Blender 4.x).
- Textura: `bed-material-atlas.png`, atlas pixelado de 32×8 com quatro faixas de material. As faces das malhas têm UVs locais para esse atlas.
- Dimensão de base alinhada ao catálogo: 1,9 × 1,25 unidades; pivô no centro do contato com o piso.
- Câmera ortográfica isométrica e quadros transparentes de 192×192.
- `scripts/build-bed-3d-prototype.py` recria o modelo e doze quadros: quatro rotações completas, quatro sem coberta e quatro camadas de coberta para o avatar deitado.
- Os recortes consumidos pelo atlas ficam em `frames/`; `node scripts/export-room-furniture-atlas.mjs` os incorpora nas linhas `bed`, `bed-open` e `bed-cover` do atlas v3.
- Revisão: `logs/bed-3d-prototype/bed-atlas-vs-3d-uv.png`, `logs/bed-3d-prototype/bed-3d-directions.png` e `logs/bed-3d-prototype/bed-cover-layer.png`.

O buffer de profundidade do render resolve a oclusão entre as peças da cama durante a exportação. O jogo intercala a base da cama, o avatar e a camada de coberta; nas rotações em que a cabeceira fica próxima, essa camada também inclui a cabeceira para que o avatar não a atravesse. O teste de uso, rotação e movimento no quarto continua sendo o critério para validar o asset final.
