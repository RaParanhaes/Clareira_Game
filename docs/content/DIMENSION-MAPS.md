# Mapa das dimensões — vista superior

Esboço baseado nas dimensões e mapas ativos no PostgreSQL, consultados em 24/10/2026. [Abrir o mapa visual](maps/dimensions-top-down.svg).

## Como ler

- Norte fica para cima; X aumenta para leste e Y aumenta para sul. As posições estão em unidades do mundo, não em pixels.
- O mundo tem limite de 5.933 × 5.933 unidades. O quadro do Bosque aproxima a área com conteúdo autorado (X 70–650, Y 60–670); os outros quadros mostram uma janela local de 200 × 200 unidades em torno da chegada. O restante é território procedural e não está detalhado como pontos fixos neste esboço.
- Círculos indicam áreas de floresta, clareira, água ou relevo, e não a forma final do desenho no chão. Montanhas elevam o piso em até 2,6 unidades, colinas em até 0,95; depressões baixam em até 1,2. As bordas são suaves e caminháveis quando a diferença de altura permite.
- Os símbolos de local no macro-mapa são marcações do mapa. Só os sete prédios listados como construídos têm estruturas cadastradas; outros nomes como castelo, ruínas, minas e acampamentos são pontos planejados/indicativos, não edifícios já presentes.
- Recursos em posições fixas aparecem com coordenadas. Além deles, o gerador coloca recursos comuns de modo determinístico por bloco de 16 × 16 unidades nos mundos que os permitem; a posição depende da semente salva e de água/trilhas próximas. Isso não é uma lista de pontos fixos. O Breu não gera esses nós comuns.

## Bosque das Brasas (`surface`, floresta)

![Esboço superior das sete dimensões](/opt/game-agent/docs/content/maps/dimensions-top-down.png)

**Chegada e construções cadastradas** — a chegada fica em (88,2; 92,3). Os sete prédios concentram-se no canto noroeste do recorte:

| Nº | Construção | Centro (X; Y) |
|---:|---|---:|
| 1 | Recepção da vila | (83,2; 91,3) |
| 2 | Hotel das Brasas | (109; 86) |
| 3 | Pousada dos Pinheiros | (95; 105) |
| 4 | Hospedaria do Riacho | (83,5; 108) |
| 5 | Cabana do Cedro | (105,5; 100,5) |
| 6 | Cabana da Samambaia | (113,5; 111,5) |
| 7 | Cabana do Mirante | (121,5; 90,5) |

**Recursos perto da chegada** — galhos de madeira em (91,5; 85,4), (88,4; 95,8), (82,3; 87); galhos fortes em (88,8; 91,7), (90,2; 84,8), (84,1; 88,8); pedras em (91,5; 87,5), (90,1; 92,6); frutinhas em (85,5; 85,8), (88,1; 83,1), (94,2; 89); folhas em (86,3; 89,6), (87,1; 93,1); cipós em (85,3; 90,6), (92,4; 88,3). São pontos iniciais fixos da definição de jogo.

**Recursos fixos do mapa** — pedras em (169; 274), (188; 284), (206; 266), (345; 298), (366; 316), (390; 306), (554; 238), (576; 251), (414; 618), (445; 634), (475; 645) e (383; 332). Veios de cobre em (182; 265), (361; 306), (558; 246); ferro em (199; 274), (399; 327), (452; 630); carvão em (179; 279), (379; 336), (569; 256). Cada veio tem quantidade inicial entre 4 e 5.

**Relevo, água e vegetação autorados** — montanhas: Serra do Ninho oeste/pico/leste em (535; 156), (566; 142), (595; 173); Serra Oeste (183; 270); Cordilheira Central oeste/leste (365; 302), (408; 322); Morros do Sul oeste/leste (432; 628), (482; 648). Colinas: sopé do Ninho (511; 192), Serra Oeste (206; 292), Cordilheira Central (380; 348). Depressões: bacia oeste (270; 394; raio 32) e leste (530; 468; raio 36). Lagos: Espelho (637; 425; raio 15), Junco (261; 254; raio 9), Corvos (394; 154; raio 8), Ruínas (470; 366; raio 12), Sul (594; 531; raio 10). As nove manchas de floresta ficam em (102; 104), (192; 162), (316; 188), (352; 206), (586; 270), (430; 359), (225; 518), (632; 424) e (485; 568).

**Outros pontos indicados no mapa** — Hotel da Clareira (150; 141), Castelo da Vigília (382; 270), Ruínas do Musgo (191; 212), Marco das Três Pedras (435; 434), Torre Quebrada (614; 408), Estalagem do Lago (620; 455); acampamento oculto (305; 175), posto goblin (331; 171), acampamento goblin (353; 210), Caverna do Ninho (566; 137); afloramentos/minas em (171; 267), (353; 306), (565; 239), (425; 617); santuário soterrado (235; 285), Gruta das Raízes (451; 384), Ruínas Encobertas (504; 344), Gruta da Queda (590; 503); Campos dos Slimes (217; 137) e Pradaria do Sul (377; 475); Lagoa do Junco, Lagoa dos Corvos e Lago Espelho já aparecem acima. São marcações macro, não confirmação de construção, inimigo ou caverna explorável.

## O Breu (`breu`, escuridão)

Chegada e fogueira permanente no centro do mapa (2966,5; 2966,5); o spawn pessoal fica junto à fogueira. O chão do Breu é preto e plano, sem água, vegetação, recursos ou alterações de relevo. A migração 028 desloca para o centro as posições salvas e fogueiras permanentes antigas do Breu, preservando a distância local de cada jogador.

## Altos do Céu (`ceu`, céu)

Chegada em (419,5; 419,5), clareira de pouso com raio 14. Ilhas/morros altos: oeste-sudoeste (397,5; 429,5; raio 24) e leste-nordeste (442,5; 406,5; raio 20). Bacia rebaixada a noroeste em (380,5; 381,5; raio 22). Sem construções ou depósitos fixos; recursos comuns aparecem proceduralmente nos blocos sem água/trilha. O nome “ilha” descreve o tema, não plataforma flutuante com queda implementada.

## Mundo Mágico (`arcano`, mágico)

Santuário de chegada em (419,5; 419,5), clareira de raio 8. Bosque místico a noroeste em (400,5; 407,5; raio 28); bosque luminoso a sudeste em (443,5; 439,5; raio 25). Lagoa da Lua a nordeste (441,5; 399,5; raio 9), colina sudoeste (384,5; 445,5; raio 22) e depressão sudeste (456,5; 453,5; raio 24). Sem construções ou veios fixos; vegetação cresce nas duas manchas de floresta e recursos comuns são distribuídos proceduralmente.

## Inferno (`inferno`, inferno)

Chegada em (419,5; 419,5), clareira de raio 10. Cordilheira das Brasas a noroeste (397,5; 404,5; raio 28) e Cordilheira das Cinzas a sudeste (442,5; 437,5; raio 30). Bacia de lava temática a nordeste (436,5; 402,5; raio 14) está cadastrada como depressão, não como lago de lava ou perigo de dano. Sem construções ou recursos fixos; há recursos comuns proceduralmente distribuídos e nenhum bosque autorado no mapa inicial.

## Terra dos Gigantes (`gigantes`, gigantes)

Chegada na Estrada Antiga, em (419,5; 419,5), clareira de raio 12. Montes colossais a noroeste (397,5; 399,5; raio 35) e sudeste (443,5; 439,5; raio 38); depressão sul (377,5; 462,5; raio 28). Pinheiros gigantes a norte (424,5; 390,5; raio 21). Sem construções ou depósitos fixos; minério e marcos colossais ainda não estão cadastrados. Recursos comuns são gerados por bloco, como nos outros mundos não escuros.

## Mundo Energético (`energia`, energético)

Chegada em (419,5; 419,5), clareira de raio 9. Colina de Pulso ao sudoeste (401,5; 432,5; raio 24), fenda rebaixada ao nordeste (440,5; 407,5; raio 22) e lagoa carregada a noroeste (396,5; 400,5; raio 10). Não há construção, minério ou recurso energético fixo cadastrado; “energético” ainda é o tema do terreno, não um recurso coletável. Recursos comuns aparecem proceduralmente por bloco.

## Fonte e limites

As sete dimensões e suas revisões/sementes foram lidas do PostgreSQL. As construções vêm do catálogo versionado de objetos; os pontos, relevo e depósitos vêm das alterações do mapa de cada dimensão. As regras de geração de vegetação e recursos estão em `game/world.mjs`; relevo e coordenadas iniciais, em `game/dimensions.mjs`. Portanto, este é um mapa de estado atual: qualquer edição posterior no banco pode mover ou acrescentar itens. Os pontos indicativos não ativam por si só edifícios, minas, cavernas, criaturas ou mecânicas ainda não implementadas.
