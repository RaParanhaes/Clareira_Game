# Aparências, itens e efeitos do personagem

Este conjunto adiciona cinco aparências de personagem, nove itens de mão e cinco efeitos animados ao pipeline do jogo.

## Contrato dos PNGs

- Cada célula mede `96 × 96` px, com amostragem nearest-neighbor.
- A sola fica alinhada ao pivô `(48, 84)`.
- A ordem horizontal das oito direções é: sul, sudeste, leste, nordeste, norte, noroeste, oeste, sudoeste.
- As aparências usam um PNG completo por direção. Corpo, roupa, cabelo e detalhes estão juntos no mesmo quadro; isso evita vazamentos da base branca quando o traje cobre o corpo.
- A aparência padrão `white-base` usa o PNG completo do viajante da Clareira, com rosto e roupa detalhados; não usa mais a silhueta branca de `neutral-body-v2`.
- Itens de mão são PNGs transparentes independentes, com posição de encaixe por direção no `manifest.json`.
- Cada efeito tem oito quadros em ordem temporal, `90 ms` por quadro. Auras repetem o ciclo; conjuração e ativação dimensional são sequências de uma execução.

## Aparências

| ID | Papel | Perfil de movimento | Ajuste compatível |
| --- | --- | --- | --- |
| `commoner` | `character.peasant` | padrão | médio |
| `mage-robe` | `character.mage` | conjurador | médio, estreito, encurvado |
| `dimension-coat` | `character.dimensional-traveler` | ágil | médio, estreito, largo, reforçado, encurvado |
| `dark-armor` | `character.dark-knight` | pesado | largo |
| `light-armor` | `character.light-knight` | treinado | largo |

Cada aparência está exportada nas variantes masculina e feminina e nas oito direções. As variantes têm silhueta adulta e cobertura completa.

## Itens e efeitos

O catálogo de itens inclui machado, espada, faca, luminária, galho, cajado, dispositivo dimensional e versões sombrias e luminosas da espada. O manifesto registra encaixe, tipo de empunhadura, ações permitidas, perfil de movimento e camada de desenho.

Os efeitos são `aura-flow`, `aura-void`, `aura-radiance`, `spellcast-blue` e `rift-activate`. `aura-flow` tem oito rumos e oito quadros por rumo, com energia percorrendo o corpo. As propriedades de ciclo, gatilho, personagem e camada ficam em `manifest.json` e no catálogo do jogo.

## Animação disponível

- Os atlas de roupa têm uma pose parada para cada direção. Os GIFs `*-turnaround.gif` servem para revisar a sequência de direções; não são ciclos de caminhada.
- As auras sombria e radiante têm animações de oito quadros ligadas aos cavaleiros. A energia em fluxo pode ser escolhida para qualquer aparência.
- As folhas de conjuração e ativação têm oito quadros e GIFs de revisão, mas ainda não são acionadas por comandos.
- O ciclo de caminhada PNG do personagem masculino está ligado ao jogo, mas o manifesto ainda marca a sequência como `revision-required`. As demais ações continuam animadas pelo renderizador atual até terem ciclos PNG próprios e revisados.
- O estado de movimento distingue início e parada de caminhada e corrida, decolagem, salto, aterrissagem, sentar, levantar, acenar e dançar. Essas ações ainda precisam de quadros PNG próprios para substituir o renderizador de transição atual.
- Na Clareira, filetes discretos de vento passam atrás do personagem seguindo direção, força e oscilação do vento naquele ponto. Eles desaparecem em locais fechados e com movimento reduzido ativado.
- O manifesto marca esse estado em `movementClips.status`; propriedades de compatibilidade de item não significam que a animação da ação já existe.

## Arquivos de revisão e rebuild

- `source/`: imagens fonte selecionadas para as oito vistas.
- `frames/`: quadros PNG individuais, em ordem por direção ou número de quadro.
- `atlases/`: PNGs horizontais usados pelo renderizador.
- `review-gifs/`: GIFs de conferência visual.
- `sheets/`: folhas de comparação.
- `manifest.json`: dimensões, pivô, direções, encaixes, perfis e ciclos.

Para refazer as exportações a partir das fontes, execute `python3 scripts/build-character-costumes.py` na raiz do projeto. Depois, `python3 scripts/build-avatar-energy.py` recria os 64 quadros direcionais da energia e as imagens de revisão. A exportação dos trajes falha se uma fonte não resultar em exatamente oito figuras completas.
