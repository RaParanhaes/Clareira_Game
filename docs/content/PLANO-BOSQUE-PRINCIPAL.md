# Plano do Bosque das Brasas

Pedido: organizar o bosque principal segundo o estudo de assentamentos, executar e validar. O estudo é [ESTUDO-ARQUITETURA-ASSENTAMENTOS-MEDIEVAIS.md](ESTUDO-ARQUITETURA-ASSENTAMENTOS-MEDIEVAIS.md). Trata-se de uma adaptação de fantasia: não se pretende reproduzir uma vila histórica específica.

## Situação observada

A região inicial tem recepção, fogueira, área aberta, hotel, duas hospedagens e três cabanas. As construções e seus interiores são definidos pelo catálogo persistido; caminhos e clareiras são gerados em coordenadas compartilhadas e o relevo é contínuo. O jogo usa projeção isométrica e mantém árvores, água, portas e pilares em regras físicas separadas.

Uma leitura somente de consulta em 28/10 registrou mundo revisão 1754, seed 32452843 e catálogo revisão 5. Na simulação com esses dados, havia percurso da chegada até a área frontal das sete entradas. A recepção, porém, estava sem caminho marcado no ponto de chegada, apesar de ser acessível. Evidência: `logs/forest-structure/baseline.json`. Revisões são voláteis; conferir novamente antes de qualquer alteração persistente.

## Organização proposta

1. **Chegada e recepção:** caminho visível para a entrada, mantendo o espaço de orientação e a fogueira legíveis.
2. **Espaço comum e circulação:** caminhos que ligam os núcleos existentes sem transformar toda a área em praça pavimentada; permitir curvas, vegetação e passagem entre entradas.
3. **Hospedagens e cabanas:** acessos identificáveis, preservando portas, jardins potenciais, propriedades e interações atuais. Não criar comércio ou quartos fictícios.
4. **Borda natural:** manter bosque e terreno naturais, rotas para exploração e transição gradual de clareiras para árvores.
5. **Futuras etapas:** estudar lotes, espaços de serviço e marcos de orientação após inspeção dos percursos e recursos persistidos; não mover construções ou árvores persistidas sem migração e avaliação dos saves.

## Garantias e validação

A malha de caminhos também participa da geração determinística de árvores e recursos. Uma alteração precisa ser comparada contra o mundo salvo e aplicada com cliente e física do servidor coerentes. Preservar posições e itens dos jogadores; não sobrescrever documentos de mundo ou catálogo. Revisar caminhos com as funções reais de colisão e busca, inspecionar desktop e celular e medir o custo do terreno segundo `docs/PERFORMANCE-STANDARD.md` antes de declarar a revisão completa. Evidência técnica, visual e mapa real devem ser registradas separadamente.

## Progresso

- Levantamento e proposta inicial: concluídos.
- Revisão dos acessos: sete trajetos examinados no catálogo e mundo da linha de base; natureza e demais conexões ainda em análise.
- Primeiro ajuste: caminho visual da recepção à via existente, sem mudar colisão ou geração de recursos; depende da planta correspondente e da revisão do catálogo para invalidar o cache do terreno.
- Caminho da recepção: 46 testes focados aprovados; suíte completa com 556 aprovados, 10 ignorados e 32 testes Python aprovados. Amostragem de 123 pontos no eixo sem bloqueios no mundo consultado; visita normal e toque no mapa em desktop/celular sem erro JavaScript. Evidências em `logs/forest-structure/`. A captura mostra um tronco próximo e a composição deve ser revista no plano completo.
- Execução completa, medição de desempenho antes/depois e validação das demais áreas: pendentes; não considerar a reorganização concluída pela primeira intervenção. O cache de terreno segue o orçamento existente de 160 superfícies, sem novo atlas ou efeito; falta medir o impacto em quadros e memória nos cenários exigidos.
- O mapa detalhado abre no bosque inicial, tem zoom máximo 64× e grade de coordenadas. O detalhamento sob demanda agora funciona em qualquer região; **Bosque inicial** enquadra o bosque e o inventário está identificado por revisão do mundo e do catálogo.
- A praça está marcada como uma elipse pavimentada em torno do centro da clareira, e duas áreas de floresta prolongam a borda para leste e sul, sem deslocar edifícios ou jogadores. As expansões entram por IDs aditivos no semeador, preservando as edições existentes; o snapshot rev. 1771 confirma que estão no documento compartilhado.
- O snapshot regenerado depois da expansão está em mundo rev. 1771/catálogo rev. 7: limites X 50–185, Y 52–193, com 7 edifícios, 714 árvores, 75 recursos, 4 troncos caídos, 36 tiles de praça e 2.188 amostras de caminho. Esse número é uma fotografia do estado salvo, não uma constante do gerador.

## Mapa de levantamento para reorganização

O minimapa abre o mapa detalhado centrado no bosque inicial. O limite de aproximação é 64×; use roda, gesto de pinça ou os botões. **Bosque inicial** enquadra a área pesquisada, e **Ver o mundo** retorna à visão geral. O detalhamento agora é geral: ao aproximar qualquer região explorada, o jogo levanta sob demanda terreno por tile, trilhas, árvores, mudas, recursos, rochas, troncos caídos e água. O levantamento se limita à área visível, é dividido em fatias ociosas e reutilizado em cache; isso mantém a interação responsiva enquanto o jogador desloca o mapa. A grade de coordenadas acompanha cada área. Áreas ainda encobertas continuam cobertas; o detalhe não serve para revelar exploração.

Para atualizar o registro de posições depois de mudanças no mundo ou no catálogo, execute `npm run forest:inventory`. O comando consulta os dados atuais e gera `logs/forest-structure/initial-forest-position-inventory.json` (lista com IDs e coordenadas) e `initial-forest-position-map.svg` (planta visual com grade de coordenadas, edifícios, portas e elementos ambientais). O cabeçalho dos arquivos registra as revisões de mundo e catálogo que foram levantadas; refaça o levantamento antes de reorganizar.

As coordenadas existentes são a referência; não mova elementos persistidos por causa da ampliação/zoom do mapa. A intenção anterior de trazer o bosque para mais dentro do mundo e expandir a área continua como proposta de planejamento, pois mover dados compartilhados exige migração revisada e teste de todos os acessos. O inventário não contém posições de jogadores.
