# Referência de arquitetura de quartos: lições do Nitro

Este guia registra práticas observáveis no projeto aberto `nitro-renderer`, compatível com clientes de Habbo, e define como adaptá-las à Clareira. Nitro é uma implementação comunitária do cliente/renderizador; este código não é uma especificação oficial de todos os clientes ou servidores do Habbo. Fontes e caminhos foram consultados em 2026-10-26. Princípios marcados como obrigatórios complementam [ISOMETRIC-DEPTH.md](ISOMETRIC-DEPTH.md), [UV-MATERIALS.md](UV-MATERIALS.md), [SCENE-OBJECTS.md](SCENE-OBJECTS.md) e [LIGHTING-AND-FURNITURE.md](LIGHTING-AND-FURNITURE.md); não os substituem.

## Limite entre cliente, renderer e servidor

O Nitro Renderer declara-se uma biblioteca JavaScript que desenha Nitro no navegador usando PixiJS. Suas classes de visualização preparam sprites e planos, enquanto classes de comunicação enviam mensagens com dados como item, categoria, posição e direção. Por exemplo, `FurniturePlaceComposer` envia ID/categoria, posição e direção para um móvel de piso; `RoomUnitWalkComposer` envia uma coordenada-alvo. Esses composers mostram o formato de pedido do cliente; não provam que o pedido foi autorizado ou salvo.

Na Clareira, aplicar a separação abaixo em toda funcionalidade de quarto:

- **Definição de conteúdo:** ID estável, dimensões, material/assets, orientações, partes, uso, apoios e parâmetros de colisão. Fonte persistente versionada em PostgreSQL conforme `SCENE-OBJECTS.md`.
- **Estado autoritativo:** instância, posição/elevação, orientação, dono/permissões, ocupantes, estado de uso, vínculos de apoio e revisões. O servidor valida cada mudança e persiste o estado permanente.
- **Apresentação do cliente:** transforma estado confirmado em desenho, animação, cursor, prévia e feedback. Pode prever visualmente uma ação de baixa latência, mas precisa reconciliar rejeição/ACK e não concede permissão nem altera a verdade persistente.

Uma captura ou preview verde de colocação não substitui a validação do servidor. A rotação também valida a nova base e os objetos apoiados antes de confirmar; uma falha não pode deixar desenho, física e save divergentes.

## Quarto, piso, paredes e orientação

O `RoomVisualization` do Nitro trata planos estruturais do quarto e distingue planos de piso e parede, com tags próprias. O modelo de dados do renderer também expõe mapa da sala, tipos/visibilidade de piso, parede e paisagem, espessuras e coordenadas/direção da porta. A mensagem de colocação separa móveis de piso, posicionados por coordenada e direção, de itens de parede, posicionados por uma localização de parede.

Práticas obrigatórias para a Clareira:

1. Manter planta, projeção, posição da porta, espessuras, alturas, circulação e faces da construção num modelo local coerente. O desenho do piso/parede e a projeção do clique devem partir dessa planta; colisão e navegação usam as regras físicas correspondentes, não os pixels da arte.
2. Tratar piso, parede, abertura e paisagem como elementos com papel e plano declarados. Parede decorativa não vira obstáculo/cômodo caminhável por estar visível; porta e passagem mantêm abertura e colisão/uso próprios.
3. Separar coordenadas de colocação de piso e de parede. Um item de parede precisa de parede hospedeira, lado, ponto/altura e regra de encaixe; um móvel de piso precisa de base, orientação, footprint e ponto de apoio. Conversão da tela para espaço local da sala deve ser única e usada pelo clique, preview, salvamento e render.
4. Construir parede por trechos e variantes explícitas de canto, extremidade, junção, vão e porta quando a geometria assim exigir. A peça de canto fecha faces e espessura; não é apenas um segmento reto girado.
5. Separar a transformação estrutural da decoração e dos itens posicionados. Alterar textura, iluminação ou paisagem não deve deslocar a planta física salva.

O Nitro é útil como referência de separação entre planos e categorias de item, mas sua representação de sala não obriga a Clareira a usar o mesmo mapa, formato de pacote, escala ou mecanismo de plano.

## Móveis: colocar, girar, selecionar e empilhar

Os dados do Nitro incluem propriedades de objeto como dimensões/centro, direções permitidas e variáveis de estado; a visualização interpreta os dados para gerar partes. Isso sugere que os parâmetros de cada tipo devem ser explícitos, mas não que todos os móveis precisem do mesmo colisor ou do mesmo comportamento.

Contrato obrigatório para cada móvel novo ou alterado:

- Definir footprint de chão, altura, eixo local, pivô, orientações válidas, superfície de apoio e volume visual; declarar frente/fundo e assimetria.
- Manter as quatro orientações-base de móveis da Clareira, mais variantes geométricas modulares necessárias, conforme [orientações e variantes](ISOMETRIC-DEPTH.md#orientações-e-variantes-de-forma). A prévia de giro usa os mesmos dados de forma e colisão que o servidor.
- Validar no servidor posição no quarto, limites, parede/porta, colisões, propriedade/permissão, altura e espaço livre. Preservar ID e propriedades já salvas quando o modelo evoluir; adicionar migração/operação versionada quando a estrutura persistida exigir.
- Definir o apoio como uma superfície real: largura, profundidade, altura, footprint permitido, categorias/tipos aceitos e limite de altura. Para empilhar, validar a cadeia inteira de apoios, ocupação, estabilidade e teto. Um objeto apoiado guarda vínculo e offset local ao pai.
- Mover ou girar um apoio recalcula filhos na mesma operação autoritativa. Retirar um apoio com filhos deve aplicar política explícita (recusar, mover filhos para destinos válidos ou removê-los de modo autorizado); nunca deixar peças flutuando, com colisão antiga ou vínculo órfão.
- Seleção usa parte/footprint e prioridade por camada. Alpha transparente, sombra e adorno não selecionável não devem interceptar toque/clique como se fossem a superfície sólida; o estado de construção distingue prévia, seleção, confirmação e rejeição.

O renderer Nitro não é, sozinho, a autoridade das regras de empilhamento. O contrato da Clareira continua sendo `supports.top` e validação física no servidor, como descrito em `SCENE-OBJECTS.md` e `LIGHTING-AND-FURNITURE.md`.

## Usar móveis e sincronizar ocupantes

Separar **comando**, **estado do móvel** e **pose do personagem**. Uma cadeira pode aceitar sentar; uma cama, deitar; uma banheira/ducha, banho; uma luminária, ligar/desligar. O servidor verifica permissão, alcance, disponibilidade/ocupação e compatibilidade, e confirma o objeto e o estado da interação. A pose é calculada a partir do ponto e direção locais do móvel, transformados pela rotação e elevação confirmadas. A saída da pose usa um ponto de saída válido, recalculado se necessário.

Para multiplayer, a mudança confirmada de ocupante/estado deve chegar a todos os clientes na mesma revisão. Definir concorrência para duas pessoas tentando ocupar o mesmo lugar, cancelamento/interrupção, queda de conexão, remoção ou rotação do móvel ocupado. O cliente pode antecipar feedback, mas deve restaurar a pose/estado do servidor em caso de rejeição. Não deduzir sentar/deitar apenas pela ordem visual do sprite ou por um emote local.

## Personagem, rumos, movimento e animação

No Nitro, o renderer do avatar compõe partes do corpo a partir de definições de figura, ação, direção e frame; `AvatarImage` mantém direção principal e direção da cabeça, escolhe partes visíveis conforme geometria e ação, e reutiliza imagens em cache. Há suporte a oito rumos isométricos e ações compostas. O composer de caminhada transporta um destino; o renderer, por si só, não constitui pathfinding ou autoridade de movimento.

Na Clareira, as regras obrigatórias são:

1. Posição/elevação, rumo do corpo, rumo da cabeça, ação, parâmetros de ação, relógio/frame e ponto de apoio são campos distintos. Posição física do servidor governa pé, colisão e ordenação; a animação nunca empurra o avatar para compensar um pivô errado.
2. O servidor valida caminhada/caminho e colisões, atualiza estado compartilhado; o cliente interpola entre estados confirmados. Predição usa sequência/ACK e reconcilia. Entrada por clique/toque e teclado compartilha o mesmo espaço e regras de movimento.
3. A pose de uso recebe a transformação do móvel e continua ligada ao seu ID enquanto ativa. Emotes e direção da cabeça não substituem o estado de locomoção ou postura persistido/sincronizado.
4. Assets do personagem declaram direção, ação, frame, pivô/registro, escala e camadas corporais. Cabeça, corpo, equipamento e efeitos devem compor sem saltos de registro; espelhamento de rumos só é permitido se preservar detalhes assimétricos.
5. Testar oito rumos de avatar, transições iniciar/parar/inverter, corrida e ações de móvel; inspecionar sequência de quadros, pivô dos pés e cruzamento à frente/atrás de móveis em desktop e celular.

Não é obrigatório copiar o formato de figura, as classes, a nomenclatura de ações ou o fallback por espelhamento do Nitro. A Clareira mantém o renderer Canvas 2D e seu contrato atual de atlas e personagem.

## Sprites 2D, UV de malha e materiais

O fluxo de móveis do Nitro mostrado por `FurnitureVisualization` usa imagens/sprites por orientação e camada, com recortes e ajustes de desenho. Isso é uma técnica de sprites 2D; não é uma malha 3D em que cada face recebe coordenadas UV de superfície. Para o pipeline da Clareira, identificar explicitamente qual dos casos se aplica:

| Conteúdo | Mapeamento correto | Obrigação |
|---|---|---|
| Móvel de geometria com faces ou malha 3D | UV local por face/superfície, apontando para atlas/material | Manter escala do texel, orientação do material, emendas, alpha e correspondência com as faces após rotação; documentar faces ainda sem UV. |
| Móvel, peça arquitetônica ou personagem como sprite 2D | Frames/retângulos de atlas por direção, ação, estado e camada, mais pivô de registro | Manter pixel scale, pivô, semântica da camada, alpha e nomes/manifesto estáveis; não chamar o recorte do sprite de UV de malha. |
| Piso, parede ou paisagem desenhados em planos/texturas | Coordenada no plano local ou tiles/atlas de superfície, conforme o renderer | Declarar eixos, escala repetível, origem e continuidade em bordas; conferir transições, recorte de portas e relação com geometria física. |

Para qualquer troca entre sprites e superfícies texturizadas, reutilizar o mesmo vocabulário local de materiais sempre que apropriado, mas não presumir que um atlas de sprites possa ser projetado em qualquer face sem conversão e revisão. Textura não corrige profundidade, forma, colisor ou encaixe de peças. Seguir os cálculos de [UV-MATERIALS.md](UV-MATERIALS.md) para UV verdadeiro e seu checklist para sprites/atlas; manter coordenadas de material independentes de coordenadas da tela.

## Performance, cache e carregamento

O `RoomSpriteCanvas` mantém cache por objeto/camadas, atualiza visualização quando há mudança relevante e ordena os sprites visíveis; `AvatarImage` também evita recompor o mesmo corpo/ação/direção/frame sem necessidade. Adaptar como princípios: compartilhar assets e definições, cachear rasterização derivada por chave explícita (modelo, orientação, estado, escala/tema), limitar memória, invalidar quando os dados-base mudarem e descartar trabalho fora da tela. Nunca fazer consulta PostgreSQL por quadro nem enviar imagens renderizadas pela rede.

Recursos necessários ao primeiro quadro devem seguir o [carregamento de cenas](README.md#preparação-de-cenas-e-transições): manifesto com versão/hash/tamanho, preparar antes do uso, manter pacote anterior em falha e carregar conteúdo distante incrementalmente. Asset ausente não pode virar um substituto silencioso que altera colisão, aparência ou estado.

## Revisão obrigatória antes de concluir

Para uma mudança em quarto, objeto ou avatar, declarar o conjunto de validação pertinente antes de implementá-la e verificar:

- quarto vazio e mobiliado: planta, parede, canto, vão, escala e chegada/saída;
- posicionar, rotacionar e remover móvel em todas as orientações afetadas; paredes, ocupação, apoio, altura e persistência;
- personagem caminhando por trás, na frente e pelos lados; assento/deitar/uso, saída e outro jogador observando;
- clique/toque em partes visíveis, inclusive áreas transparentes e sobrepostas;
- ação/rumo/frame, pivô e materiais em prancha e cena; desktop e celular;
- estado autoritativo, ACK/rejeição, reconexão e ausência de regressão em objetos já salvos quando aplicável;
- tempo de primeiro quadro e cache em quarto vazio e carregado, se assets/renderização/carregamento mudaram.

Testes unitários provam regras isoladas; inspeção no runtime comprova a composição visual e a ação jogável. Registrar diferenças entre princípio observado no Nitro e requisito adotado pela Clareira, além de pendências de migração de conteúdo antigo.

**Primeira aplicação (2026-10-26):** cadeiras e tronos são desenhados como duas camadas independentes: encosto, assento e pernas de trás usam a profundidade traseira do móvel; as duas pernas voltadas à câmera usam a profundidade dianteira. O avatar pode então ser ordenado entre essas partes. A cadeira completa continua sendo usada em previews. A regra é implementada em `roomFurnitureDrawLayers`, `drawRoomFurnitureLayer` e nas linhas `chair-back`/`chair-front` do atlas v2. `game/depth-order.test.mjs` valida as quatro rotações. A validação visual no `/dev/` ainda é necessária antes de estender o padrão a outros móveis; o Nitro inspira o conceito de camadas ordenáveis, mas esta divisão geométrica específica é uma regra da Clareira.

## Fontes primárias consultadas

- [README do nitro-renderer](https://github.com/billsonnn/nitro-renderer/blob/main/README.md): identifica o projeto como biblioteca de renderização JavaScript para Nitro usando PixiJS.
- [RoomVisualization.ts](https://github.com/billsonnn/nitro-renderer/blob/main/src/nitro/room/object/visualization/room/RoomVisualization.ts): construção e apresentação dos planos estruturais de sala.
- [RoomObjectVariable.ts](https://github.com/billsonnn/nitro-renderer/blob/main/src/api/nitro/room/object/RoomObjectVariable.ts): variáveis separadas para estado de sala, móvel, avatar, direções, dimensões e parâmetros de visualização.
- [FurnitureVisualization.ts](https://github.com/billsonnn/nitro-renderer/blob/main/src/nitro/room/object/visualization/furniture/FurnitureVisualization.ts) e [FurnitureVisualizationData.ts](https://github.com/billsonnn/nitro-renderer/blob/main/src/nitro/room/object/visualization/furniture/FurnitureVisualizationData.ts): sprites e parâmetros/offsets de camadas por orientação.
- [RoomSpriteCanvas.ts](https://github.com/billsonnn/nitro-renderer/blob/main/src/room/renderer/RoomSpriteCanvas.ts): preparação, cache e ordenação global das partes de sprite.
- [AvatarImage.ts](https://github.com/billsonnn/nitro-renderer/blob/main/src/nitro/avatar/AvatarImage.ts): ações, direção, composição, frames e cache do avatar.
- [FurniturePlaceComposer.ts](https://github.com/billsonnn/nitro-renderer/blob/main/src/nitro/communication/messages/outgoing/room/furniture/FurniturePlaceComposer.ts) e [RoomUnitWalkComposer.ts](https://github.com/billsonnn/nitro-renderer/blob/main/src/nitro/communication/messages/outgoing/room/unit/RoomUnitWalkComposer.ts): exemplos de pedidos de colocação e destino enviados pelo cliente.
- [package.json](https://github.com/billsonnn/nitro-renderer/blob/main/package.json): identifica a licença do pacote publicado como GPL-3.0. Esta pesquisa documenta conceitos; não copia código ou assets. Qualquer reutilização direta exige revisão de licença antes.

### Primeiro corredor interno: recepção do hotel

A recepção do hotel usa um primeiro exemplo de contorno não retangular: o salão tem um prolongamento central até a entrada, com recortes nos dois lados. `game/interior-architecture.mjs` define o polígono visível e as áreas sem piso; a colisão de personagens e a colocação de móveis usam esses mesmos recortes. A geometria só se aplica à planta pública conhecida, sem modificar quartos privados salvos. A entrada e saída continuam usando o portal existente. Este exemplo ainda não é um editor de plantas por células, nem implementa quartos separados ou portas internas.

Para interiores futuros com quartos separados, registrar explicitamente os ambientes e portais, seus destinos e regras de acesso; testar ida e volta, diâmetro dos personagens, posições de chegada, móveis existentes e ordenação em ambos os lados. Não substituir plantas de quartos já ocupados nem transformar aberturas decorativas em portas que não funcionam.
