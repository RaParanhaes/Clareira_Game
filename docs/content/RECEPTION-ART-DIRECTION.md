# Recepção do Hotel das Brasas

A recepção pública usa as peças 3D/UV do catálogo medieval existente. O arquivo `game/hotel-reception.mjs` mantém a composição padrão; a versão aplicada ao preview vive no catálogo PostgreSQL, com revisão e histórico. Alterar o padrão em código não atualiza automaticamente uma composição já persistida.

## Composição e medidas

- Banco estofado verde à esquerda, mesa e duas cadeiras orientadas para ela; o segundo grupo tem divã voltado para sua mesa.
- Aparadores medievais unidos formam o balcão. O retângulo de colisão deve coincidir com a soma das larguras e a profundidade dos três módulos; a validação rejeita divergências.
- Estantes e cadeira de atendimento atrás do balcão. Baús de viagem ficam nas áreas laterais. Candelabros usam seus sprites e parâmetros reais de luz.
- A lareira arquitetônica e as plantas existentes complementam os móveis; não são apresentados como modelos novos do catálogo medieval.
- Manter livre o trajeto entre o prolongamento de entrada, o balcão e os dois lados. Respeitar os recortes do piso. Não editar quartos privados para compor esta recepção pública.

Cada móvel medieval tem `catalogId`, rotação e dimensões canônicas do modelo. Usar o mesmo ID como `templateId` da instância fixa. O sprite está previamente renderizado: mudar só `width`, `depth` ou `height` não muda sua imagem. Não substituir uma instância medieval por `fixture.chair`, `fixture.sofa` ou outro modelo antigo genérico.

## Projeção do atlas

A câmera do Blender existente foi medida com `world_to_camera_view`: origem projetada em `(64, 89.57807)`; a unidade X do piso desloca aproximadamente `(12.92995, 8.75038)` pixels após o espelhamento da exportação. O antigo pivô `(64,97)` e a escala `32×128/192` não correspondiam a essa câmera.

`game/medieval-sprite-projection.mjs` guarda a base ortográfica e a transformação para o piso do runtime. Renderer, contrato de exportação e manifesto compartilham esses valores. O eixo vertical é reamostrado conforme a base do piso; existe uma diferença de aproximadamente 2,5% entre a projeção de altura dessa câmera e a unidade vertical procedural da engine. Uma futura reexportação pode eliminá-la; isso não muda a base física dos móveis. Não alterar arbitrariamente a escala para fazer um objeto caber.

Os PNGs e as malhas existentes foram reutilizados. A correção é da integração/projeção; não equivale a produzir ou remodelar 200 assets novos.

## Verificação

Executar os testes de `hotel-reception`, `medieval-sprite-projection`, `object-catalog`, `room-layout`, `scene-lights` e `room-fixture-renderer`. O roteiro `scripts/browser-room-fade-check.mjs` aceita `CHECK_RECEPTION=1` para conferir as referências medievais e percorrer o balcão e as duas áreas por cliques/toques normais. `CATALOG_FILE` permite testar uma revisão candidata isolada antes de aplicá-la ao preview.

Abrir as capturas atuais e avaliar altura das cadeiras junto ao personagem, orientação de cada assento em relação à mesa, apoio no piso, sobreposição, acesso e visibilidade. Testes técnicos não aprovam beleza nem autorizam alegar que todos os objetos têm interação de sentar implementada.
