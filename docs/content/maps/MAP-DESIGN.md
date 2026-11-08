# Mapa de exploração — 29/10/2026

Objetivo: um único mapa ligado à geometria do mundo, com visão geral, terreno local e inspeção próxima de copas, trilhas, água, espaços abertos e construções. A visão total é uma opção de apresentação; não altera a exploração persistida.

## Pesquisa e decisões

- MapLibre documenta camadas cuja aparência e densidade mudam com o zoom: https://maplibre.org/maplibre-style-spec/expressions/#camera-expressions. Aplicar esse princípio ao Canvas 2D existente: síntese distante, terreno por célula no nível local e copas por objeto na aproximação. Não é necessária uma biblioteca cartográfica nova.
- O mapa local existente usa árvores, recursos e terrenos reais. O defeito era descartar regiões com qualquer lado acima de 320 células, além de esperar uma janela ociosa em cada consulta de pequenos blocos.
- Manter orientação norte, escala, busca, destinos, névoa, teleporte condicionado e pinça. Adicionar controle contínuo logarítmico de zoom e indicadores de preparo. A grade de coordenadas é opcional para reduzir ruído.

## Implementação

1. Recorte visível limitado a 200.000 células e lado máximo de 768; dividido em blocos estáveis de 64×64 células, com até 96 blocos no cache. A chave considera dimensão, revisão do catálogo e geometria. O centro é priorizado; blocos prontos aparecem enquanto o restante mantém a visão geral. Consultas e terreno cedem a execução cooperativamente após cerca de 3 ms, com retomada por timer; não há Web Worker. Uma tarefa por vez é cancelada quando fica fora do recorte ou muda o mundo. Nenhuma varredura do mundo inteiro.
2. Água da mesma consulta usada na física, incluindo rios e margens; altura da superfície real. Materiais de mapa por tema. Relevos antigos desativados não são desenhados como montanhas fictícias.
3. Aproximação até 256 vezes a visão geral. Copas vistas de cima a partir de 2,8 pixels/célula, pontos simplificados abaixo disso. Construções usam seus limites reais. Nenhuma mudança na colisão ou nos objetos do mundo.
4. Interface móvel prioriza o mapa, com painel inferior rolável e legenda recolhível. Desktop mantém ferramentas laterais. Indicadores distinguem visão geral, preparo e detalhes prontos.

## Validação

Regressão específica do recorte largo móvel, limite de trabalho, preservação do ponto sob o zoom e cancelamento ao trocar de mundo. Capturas reais em 390×844, 844×390 e 1440×900 com detalhe pronto, aproximação, visão geral e retorno. Usar sessão descartável/estado temporário para não modificar contas. Registrar erros e duração de preparo; navegador sem GPU não certifica FPS em telefone físico.

## Resultado observado antes do carregamento progressivo

27 testes focados e catálogo aprovados; dados das sete dimensões verificados. Navegador com sessão descartável passou em 390×844, 844×390 e 1440×900, incluindo busca, distância, caminhada disponível, zoom 256× e retorno da visão geral. Capturas e relatório em `logs/20261029-map-design/`. Suíte geral interrompida pelo limite de 300 s após 584 testes aprovados, sem falhas registradas. O preparo frio de novos recortes levou cerca de 5–7 s no último ensaio da VPS; os dados são preparados por etapas, mas esse resultado não certifica FPS nem latência de telefone físico.

## Carregamento progressivo — 30/10

30 testes focados e validação de conteúdo aprovados. Navegador isolado passou em celular vertical e horizontal e desktop, com arraste durante o carregamento, zoom e troca real para O Breu sem pixels do terreno do bosque. Na VPS, o primeiro bloco apareceu após 426 ms em um ensaio; a janela horizontal levou cerca de 8,5 s para completar uma ampliação. A observação não mede FPS nem desempenho de um telefone físico. Suíte geral incompleta após 554 testes aprovados e limite de 300 s, sem falhas registradas. Evidências em `logs/20261029-map-progressive/`.
