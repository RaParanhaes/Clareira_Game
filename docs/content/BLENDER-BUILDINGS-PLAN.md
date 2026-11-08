# Construções do Bosque das Brasas: produção em Blender

Pedido do dono em 28/10/2026: desenvolver as cabanas, hospedagens, edifícios e hotéis seguindo `BLENDER-ASSET-WORKFLOW.md` e a skill `clareira-blender-assets`. As sete construções atualmente cadastradas são o escopo inicial. Outras localidades planejadas ainda não têm estruturas jogáveis completas e devem ser inventariadas quando forem implementadas.

Os interiores e seus serviços existentes também precisam ser conferidos na validação de cada edifício. O desenho novo não altera automaticamente plantas, permissões, propriedades, chaves, reservas ou móveis persistidos.

## Montagens existentes

| ID | Uso | Base em unidades | Linguagem atual | Estado desta revisão |
|---|---|---:|---|
| `cabin-cedar-one` | Cabana privada do Cedro | 7 × 7 | Madeira, uma janela e cobertura assimétrica | Fonte Blender existente; evidências em `logs/cottage-art-revision/`. |
| `cabin-cedar-two` | Cabana privada da Samambaia | 7 × 7 | Pedra, verde e cobertura de quatro águas | Integrada com proteção de compatibilidade do catálogo; auditoria técnica, renderer isolado e visita real aprovados; interior pendente. |
| `cabin-cedar-three` | Cabana privada do Mirante | 7 × 7 | Madeira, tons frios e chaminé | Rascunho Blender em `logs/lookout-cabin-revision/`; revisão e integração pendentes. |
| `lodging-rill-guesthouse` | Hospedaria do Riacho | 7 × 6 | Pedra, cobertura vegetal e ala à direita | Pendente. |
| `lodging-pine-inn` | Pousada dos Pinheiros | 8 × 6 | Madeira, telhas e duas águas-furtadas | Pendente. |
| `lodging-ember-hotel` | Hotel das Brasas | 14 × 10 | Pedra, dois pavimentos, cobertura de quatro águas e ala à esquerda | Pendente. |
| `arrival` | Recepção da vila | 7,6 × 7,6 | Madeira, cobertura vegetal e ala à direita | Pendente. |

As medidas acima são dos defaults compartilhados; a revisão vigente do catálogo PostgreSQL pode conter valores ou overrides diferentes. Antes de integrar uma montagem, comparar a revisão real sem sobrescrever o catálogo ou os saves. `game/village-buildings.mjs`, `game/architectural-elements.mjs` e `game/building-standard.mjs` definem os pontos e a geometria consultados pelo runtime.

Na leitura de 28/10, a revisão persistida 4 contém quatro janelas também para o Cedro, enquanto a fonte Blender registrada acima representa uma única janela. A diferença ainda precisa de conciliação entre a planta, a luz e o catálogo persistido; a revisão visual anterior não comprova essa conciliação. A Samambaia também tinha uma janela em posição diferente no default em código e na revisão salva. Inventário somente leitura: `logs/fern-cabin-revision/all-live-buildings.json`.

Para referências históricas de formas, materiais e organização de assentamentos, consultar [Estudo de arquitetura e assentamentos medievais](ESTUDO-ARQUITETURA-ASSENTAMENTOS-MEDIEVAIS.md).

## Direção visual indicada pelo dono

O Cedro é a referência de qualidade para materiais e acabamento. Observar a variação das telhas, o relevo e as juntas da pedra, a estrutura de madeira, o encaixe das peças e o acabamento da chaminé. Cada construção deve manter silhueta, materiais, paleta e detalhes próprios conforme seu uso e o catálogo persistido. A referência não substitui a revisão das quatro vistas, nem autoriza repetir a mesma fachada em todas as famílias.

## Evidências exigidas por construção

1. Registrar planta física, porta, janelas, pilares, camadas, invariantes, uso e referências visuais abertas.
2. Produzir malha editável com UV, materiais, cobertura e aberturas, gerando frente, fundos, laterais, topo, hero e quatro rotações do mesmo modelo.
3. Reabrir o `.blend`; verificar geometria avaliada, UV, aberturas e posições dos apoios. A auditoria deve corresponder às janelas e peças daquela construção.
4. Gerar sprites com pivô e escala compatíveis com a projeção do jogo, separando partes que intercalam o personagem. Integrar estados de iluminação e assets versionados.
5. Revisar visualmente as imagens, conferir ordenação no renderer e verificar desktop, celular e acesso no mapa real. Registrar cada estado de validação separadamente.

Uma fachada aprovada não certifica outra família, nem comprova que o interior ou a persistência foram exercitados. O hotel precisa manter legíveis seus dois pavimentos e janelas, sem criar um andar caminhável ou serviços inexistentes por efeito da arte.
