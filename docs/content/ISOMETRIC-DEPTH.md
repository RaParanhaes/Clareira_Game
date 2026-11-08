# Padrão obrigatório de profundidade, camadas e apoio

Este documento é obrigatório ao criar ou alterar desenho, rotação, interação ou posição de qualquer elemento do mundo: personagens, móveis, arquitetura, vegetação, terreno e efeitos. Ele define oclusão e relação espacial; as superfícies seguem [UV-MATERIALS.md](UV-MATERIALS.md). As regras valem também para revisões de conteúdo existente. A documentação não certifica que todos os objetos antigos já foram adaptados.

## Modelo espacial e visual

O jogo usa posições no espaço e desenho isométrico 2,5D. X e Y localizam a base no piso; a elevação física indica sua altura. Eixos locais do modelo definem faces e rotação. A posição projetada de um pixel, a altura física e a chave de ordenação são dados distintos.

**Depth sorting** ordena as partes desenhadas. O **algoritmo do pintor** desenha partes distantes primeiro e próximas depois. **Oclusão** é a superfície próxima encobrindo a distante. Um objeto pode precisar de vários sprites ou partes para permitir que o personagem fique entre elas.

A referência aberta é o Nitro, uma implementação comunitária compatível com Habbo: [FurnitureVisualization](https://github.com/billsonnn/nitro-renderer/blob/main/src/nitro/room/object/visualization/furniture/FurnitureVisualization.ts) atribui profundidade relativa às camadas por direção; [RoomSpriteCanvas](https://github.com/billsonnn/nitro-renderer/blob/main/src/room/renderer/RoomSpriteCanvas.ts) combina profundidade do objeto e da camada e ordena os sprites. Isso documenta o código consultado, não todas as versões dos clientes oficiais do Habbo. As regras abaixo são o contrato da Clareira.

## Contrato de cada objeto

| Informação obrigatória | Finalidade |
|---|---|
| Posição, base física e dimensões | Localização, colisão e área ocupada |
| Eixos, rotação e faces | Identificar frente, fundo e laterais sem depender da tela |
| Pivô e âncora de profundidade | Ordenar pelo contato ou plano de referência declarado |
| Partes/camadas por direção e estado | Definir o que fica antes e depois do personagem e de outros objetos |
| Volume visual | Detectar sobreposição mesmo fora da base física |
| Superfície e vínculo de apoio, se aplicáveis | Definir sobre o que a peça está apoiada e a altura correta |
| Pontos de interação, se aplicáveis | Posicionar sentar, deitar, entrada, saída e uso |

## Orientações e variantes de forma

Quatro orientações de rotação são a base para móveis e peças de construção. Elas representam quartos de volta no espaço local do objeto; não significam necessariamente quatro imagens distintas nem quatro cópias de uma geometria simétrica. A rotação transforma em conjunto a base, as faces, os detalhes assimétricos, os pontos de apoio, os pontos de interação e as camadas de oclusão. Personagens podem usar mais direções para caminhar e animar; essa necessidade não obriga móveis a terem oito orientações.

Escolher uma forma-base adequada ao uso e declarar variantes geométricas quando a rotação simples não representar a peça corretamente. Uma divisória, por exemplo, precisa de segmentos retos alinhados aos eixos da sala e de uma peça de canto própria, com espessura, junção e faces expostas corretas. O canto não é apenas a mesma parede girada: ele é outro componente que se conecta ao segmento reto. Portas, extremidades, junções em T e aberturas também devem ser variantes explícitas quando fizerem parte do conjunto. A montagem posiciona os componentes na grade, e cada um continua sujeito à sua própria colisão, pivô e ordenação.

Para móveis assimétricos — como cama com cabeceira, escrivaninha com frente definida ou armário com portas — as quatro rotações preservam a identidade dos lados e geram as vistas necessárias. Se uma vista exigir uma silhueta ou junção que não exista na forma-base, declarar uma variante por tipo de peça e orientação; não deformar, espelhar detalhes direcionais sem revisão, nem contar uma vista incorreta como rotação válida. Registrar quais orientações reutilizam a mesma geometria e quais exigem variante dedicada.

## Lições do Nitro aplicáveis à Clareira

O Nitro é um renderizador comunitário compatível com quartos do Habbo; o código aberto consultado demonstra como essa implementação organiza cenas, não é uma especificação oficial de todas as versões do cliente Habbo. Em `FurnitureVisualization`, cada camada do móvel pode ter dados próprios por direção, como sprite, deslocamento, alpha, tag e profundidade relativa. Em `RoomSpriteCanvas`, as camadas visíveis dos objetos são reunidas, recebem a profundidade da posição do objeto mais o ajuste da camada e são ordenadas em conjunto. Isso permite intercalar camadas de móveis e personagens; ordenar somente um sprite indivisível por móvel não permite a mesma relação.

Os princípios abaixo são obrigatórios para qualquer nova arte ou mudança de renderização, profundidade, seleção ou interação espacial:

1. **Separar modelo e apresentação.** O estado espacial/físico (posição, elevação, orientação, dimensão/colisor, apoio, estado e interação) não pode depender de offsets visuais. O renderer consome esse estado e declara as partes visuais; um ajuste de desenho não desloca colisão, ponto salvo ou altura real.
2. **Declarar camadas quando a oclusão exigir.** Cada parte visual relevante tem nome estável, orientação/variante, deslocamento a partir de um pivô comum e relação de profundidade relativa à âncora do objeto. Sombra, corpo, partes traseiras, partes frontais, ocupante e efeitos são camadas separadas quando precisam intercalar com outro elemento. Objetos simples podem permanecer em um único sprite se a revisão comprovar que uma só ordem funciona em todos os cruzamentos relevantes.
3. **Ordenar as partes visíveis globalmente.** A camada de um móvel deve poder ficar atrás ou à frente de personagem, outro móvel ou parte arquitetônica conforme a relação espacial declarada. Calcular uma lista de desenho a partir da âncora física e do ajuste relativo de cada camada, com desempate estável; não resolver cruzamentos com offsets arbitrários sobre o objeto inteiro. Se a ordenação simples falhar, decompor a peça ou implementar e documentar uma regra geométrica mais expressiva.
4. **Manter propriedades por direção sem quebrar UV ou pivô.** Registrar, para cada orientação aplicável, geometria/asset e ordem das camadas; offsets de imagem não podem alterar base, colisão, UV local, apoio nem ponto de interação. As quatro orientações-base e as variantes modulares seguem a seção anterior.
5. **Fazer seleção corresponder à peça visível e interativa.** Áreas transparentes, sombras e adornos decorativos não devem roubar clique/toque quando não são selecionáveis. O hit test segue a parte ou footprint declarada, com regra explícita para prioridade quando as camadas se sobrepõem.
6. **Atualizar e reutilizar o desenho com controle.** Alterações de posição, direção, estado ou asset invalidam somente as camadas/caches dependentes; conteúdo fora da tela pode ser excluído do desenho. A otimização nunca pode manter profundidade, seleção ou aparência antigas depois da mudança.
7. **Validar sequência, não só imagem.** Para cada direção e estado afetado, testar personagem aproximando-se por trás/frente/lado, uso da peça, seleção por toque/clique, rotação e objetos empilhados quando aplicável. Confirmar ausência de cintilação, saltos de profundidade, clique através de partes opacas e textura atravessando faces.

Esses requisitos adaptam os conceitos de camada/profundidade do Nitro ao Canvas 2D e às regras de autoridade da Clareira. Não tornam obrigatório adotar PixiJS, protocolo de rede, formato de asset, nomes de sprite, estrutura de classes ou número de camadas do Nitro. Também não substituem a física, UV, carregamento de cenas ou testes da Clareira.

## Regras de oclusão

1. Ordenar objetos pelo contato no chão ou por uma âncora geométrica estável declarada. Copas, cabeceiras e tetos altos continuam vinculados à base; sua altura na imagem não determina sozinha a ordem.
2. Separar partes quando houver relações diferentes de oclusão: encosto/assento, tampo/pés, parede/vão, tronco/copa, vidro/armação. Um sprite único só atende quando uma única posição na ordem representa corretamente suas interseções.
3. Definir as camadas para todas as direções e estados. Girar transforma faces, base, apoios e interações em conjunto; detalhes da face traseira permanecem ocultos pelo corpo opaco.
4. Dentro de uma montagem, desenhar partes próximas depois das distantes. Um personagem pode ficar entre essas camadas. Superfícies transparentes preservam sua ordem e alpha; transparência decorativa não corrige sobreposição de peças opacas.
5. Usar desempate estável para evitar cintilação. Deslocamentos pequenos de profundidade devem representar camadas declaradas, sem mudar a altura física ou a posição salva.
6. Se A precisa ficar antes de B em uma região e depois em outra, dividir A/B em partes ou resolver a visibilidade pela geometria. Aumentar um offset global não resolve essa relação.
7. Manter as âncoras estáveis ao mover câmera e personagem. Alterações de desenho devem acompanhar movimento/rotação sem saltos de camada indevidos.

Uma chave simples como X+Y é útil em cenas restritas, mas não resolve sozinha volumes largos, cruzamentos, partes intercaladas e pavimentos. Cada caso deve cumprir as relações de oclusão acima.

## Apoio, altura e interação

Ficar visualmente na frente de uma mesa não coloca um objeto sobre ela. O servidor valida a superfície, altura, área disponível, ocupação e tipos aceitos. A base da peça apoiada recebe a altura da superfície; o vínculo com o apoio é persistido quando necessário. Desenho, colisão e interação consomem esse estado compartilhado.

Mover/girar um apoio atualiza as peças vinculadas conforme as regras do móvel. Retirar o apoio exige a regra explícita de seus ocupantes. Sentar/deitar usa pontos e direções locais da peça, transformados pela rotação. O renderer aplica a pose confirmada sem inventar uma posição física para esconder defeitos visuais.

## Cama: caso obrigatório de referência

A cama atual tem comprimento no eixo local u e largura em v. Cabeceira em u=0, travesseiro em u=0,12–0,31 e coberta a partir de u=0,33. Essas medidas pertencem a esse modelo; não são dimensões universais de todas as camas.

| Cabeceira em relação à câmera | Relações de desenho necessárias |
|---|---|
| Distante | Cabeceira antes do travesseiro e do ocupante; colchão antes do ocupante; coberta depois do ocupante |
| Próxima | Colchão antes do ocupante; coberta depois do ocupante; cabeceira depois do travesseiro, ocupante e coberta |

O teste é geométrico: o lado da cabeceira é próximo quando seu contato projetado está à frente do centro da cama na projeção atual. Com a câmera atual isso ocorre nas rotações 2/3; nas rotações 0/1 ela é distante. Uma nova câmera deve recalcular essa relação.

O asset v3 da cama é autorado como malha 3D com UV e exportado em quatro vistas. O renderer desenha a base completa sem a coberta quando há ocupante; depois intercala o avatar; por fim, a linha `bed-cover` desenha a coberta e, nas rotações 2/3, a cabeceira próxima. A cabeceira distante fica apenas na imagem-base. A malha usa pivô único para todas as rotações e preserva o mesmo registro entre estados. `paintRoomFixture` continua como fallback procedural, não como fonte do atlas ativo da cama.

Erros da revisão anterior: inverter os eixos deixou a cama larga e curta; desenhar a cabeceira sempre antes do enxoval permitiu que ele aparecesse sobre a madeira nas vistas traseiras. A correção combina geometria coerente e camadas por orientação. UV apenas mantém as texturas nas faces corretas.

## Implementação atual e limites

- `game/depth-order.mjs`: compara `sortX+sortY` (ou X+Y), depois `sortZ`, prioridade de ator e ID estável. `sortZ` é desempate, não um teste geral de visibilidade 3D.
- `game/furniture.mjs`: móveis com regra `footprint-front` usam o canto frontal da base rotacionada. O ocupante da cama compartilha essa âncora; offsets pequenos intercalam base, ocupante e coberta.
- `game/room-fixture-renderer.mjs`: seleção de frames e cache do atlas; `bed-3d-prototype/medieval-bed.blend` e `frames/` são as fontes da cama no atlas v3. `game/building-depth.mjs`: âncoras específicas de arquitetura e vegetação junto aos edifícios.
- Referência comunitária consultada em 2026-10-26: [Nitro Renderer README](https://github.com/billsonnn/nitro-renderer/blob/main/README.md), [FurnitureVisualization.ts](https://github.com/billsonnn/nitro-renderer/blob/main/src/nitro/room/object/visualization/furniture/FurnitureVisualization.ts) (camadas e parâmetros por direção) e [RoomSpriteCanvas.ts](https://github.com/billsonnn/nitro-renderer/blob/main/src/room/renderer/RoomSpriteCanvas.ts) (lista global de sprites e ordenação por profundidade). São referências de uma implementação aberta, não fonte oficial do cliente Habbo.

O runtime atual não tem um buffer de profundidade por pixel nem um solucionador universal de interseções. Relações que o comparador atual não expressar exigem decomposição ou evolução explícita da ordenação. Edifícios existentes com uma superfície caminhável por X/Y não passam a suportar vários pavimentos pela simples mudança da chave de desenho.

## Validação obrigatória

Para cada objeto/direção/estado alterado, registrar: aproximação por trás e pela frente, passagem pelos lados, oclusão nas bordas, base no nível correto, detalhes traseiros ocultos e ausência de cintilação. Testar também uso e rotação quando existirem, inclusive o ocupante durante a ação.

Peças com apoio exigem revisão de altura e vínculo ao colocar, mover, girar e retirar. Personagens e efeitos que cruzam uma montagem exigem captura nos pontos de entrada, interseção e saída. Revisar prancha identificada e cena real em desktop/celular. Capturas estáticas não comprovam a estabilidade em movimento.

As regressões atuais da cama ficam em `game/room-fixture-renderer.test.mjs` e `game/depth-order.test.mjs`; `scripts/browser-room-furniture-check.mjs` exercita colocação, movimento, rotação e deitar/coberta no quarto em desktop e celular. Estender os testes para novas relações de oclusão. Registrar resultado, imagens atuais e limites restantes antes de declarar a revisão concluída.
