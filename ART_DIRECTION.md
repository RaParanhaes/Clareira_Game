# Direção de experiência e arte de Clareira

Direção atual do dono: o mundo jogável deve superar a entrada em qualidade. Quartos, construção, exploração e ações completas têm prioridade sobre acabamento opcional.

Este documento traduz o caminho que o dono está indicando. Use-o junto de `GAME_BRIEF.md` em toda mudança de arte, interface, texto, animação ou som.

## O que o jogador deve sentir

Clareira é um mundo social que dá vontade de entrar e continuar habitando: há companhia e abrigo, mas também caminhos, descobertas, perigo leve, humor, festa e lugares que podem virar nossos. A primeira tela precisa vender esse mundo como um lobby de jogo, não como um formulário decorado. Cada detalhe deve parecer feito por alguém que conhece esse lugar.

“Assinatura própria” não quer dizer repetir o mesmo selo em tudo. As três brasas e a folha podem aparecer bordadas, entalhadas, amarradas, refletidas ou incorporadas a uma peça. Cada textura, roupa, menu, objeto e contêiner precisa ter material, silhueta e história próprios, mas pertencer à mesma mão.

**Não confunda a Clareira com uma fogueira.** A Clareira é o mundo e a marca completa; a fogueira é um lugar/objeto jogável com ações e animações próprias. O logo deve ter símbolo e desenho independentes, não ser simplesmente a fogueira do mapa em miniatura. As três brasas e a folha são uma assinatura que pode amarrar as duas linguagens sem torná-las a mesma peça.

## Como interpretar referências do dono

- **Habbo e Club Penguin:** aprenda com escala de lobby, cena convidativa, riqueza de objetos, hierarquia clara e posição do acesso. Não copie paleta, personagens, logo ou interface.
- **As imagens de pixel art:** observe o desenho em blocos, a escala dos pixels, a forma das silhuetas, a luz seletiva e como poucos planos contam uma história. Uma paisagem bonita com textura suave não vira pixel art só por ter uma fogueira ou receber esse rótulo num prompt.
- **Móveis antigos, castelos e vilarejos:** use materiais, formas, ornamentos e sensação de lugar vivido. Não transforme fotos literais em interfaces nem faça todos os espaços parecerem castelos.
- **Neve vista de casa, Natal, silêncio, fogueira e dragão:** primeiro extraia a emoção ou função sugerida. Abrigo, nostalgia, convivência e descoberta podem virar luz, ritmo, som, abrigo ou um encontro inesperado. Não torne cada exemplo um elemento permanente ou literal.
- **Aventura, quartos, brigas, festas, mercados e invenções:** são a ambição do mundo, não uma ordem para empilhar botões na primeira tela. Desenvolva uma fatia jogável pequena que conecte ações e faça o lugar parecer vivo.

Antes de começar uma mudança visual, escreva para si uma frase: “A referência sugere ___; em Clareira isso vira ___; vou evitar ___.” Se não conseguir preencher os três espaços com clareza, observe mais antes de implementar.

## Gramática visual

- **Pixel art de verdade:** mantenha uma escala de pixel coerente, bordas nítidas, clusters de cor intencionais, silhuetas legíveis e paleta controlada. Não use contorno suavizado, pinceladas, ruído ou gradientes realistas para fingir pixel art. Arte gerada deve ser inspecionada em tamanho natural; se a textura for pictórica, trate-a como referência de clima e não como arte final de pixel.
- **Densidade com leitura:** inclua detalhes que contem algo — objetos usados, marcas, reflexos, luz e pequenos acontecimentos. Evite encher o quadro de ruído decorativo. Primeiro garanta uma área principal legível; depois use primeiro plano, plano de ação e fundo para dar profundidade.
- **Lobby em escala:** a cena deve ocupar a tela e mostrar pessoas, lugares ou atividades que convidem a entrar. Marca, chamada, entrada de visitante e conta precisam ser entendidas num olhar. Reserve espaço negativo para leitura; não reduza o mundo a um banner atrás de um card.
- **Interface do mundo:** campos e ações pertencem à Clareira. Prefira madeira, tecido, papel, metal ou ornamento vegetal com função clara; use bordas desenhadas em poucos trechos e deixe-as desaparecer quando fizer sentido. Não empilhe painéis, cartões, contornos retos, badges ou gradientes genéricos.
- **Cor e luz:** noite fria de azul-marinho, ameixa e verde profundo; fogo, janela e lanterna em âmbar, laranja ou rosa. Interiores sociais podem ser mais vivos. Cor deve orientar atenção e hora do lugar, não apenas enfeitar.
- **Tipografia e texto:** português brasileiro caloroso, direto e específico. Convide a fazer ou descobrir algo. Corte slogans intercambiáveis, filosofia vaga, linguagem de “portal/portão” sem existir no mapa e frases que soem escritas por um gerador.

## Movimento e som

Anime aquilo que dá vida ao lugar ou explica uma ação. Fogo e luz respiram em ritmos diferentes; folhas se deslocam e descansam; água, roupa e personagens respondem ao ambiente; eventos raros continuam raros. Na paisagem panorâmica da entrada, mantenha o WebP estático carregado desde o HTML. Não restaure WebM nem acrescente SVG, canvas, partículas ou personagens HTML para simular movimento na paisagem. No restante do jogo, escolha sprites, sequências ou animação de Canvas conforme a ação e o estado multiplayer. Para pixel art, use passos ou sprites com bordas nítidas quando movimento suave destruir a escala do pixel.

Para um gesto marcante — como a fogueira acolhendo duas pessoas que sentaram juntas — prefira quadros de pixel art desenhados a partir da arte existente a várias formas geométricas improvisadas. Crie variações coerentes na mesma grade e silhueta, depois reproduza os quadros como uma sequência controlada no Canvas (ou sprite sheet PNG). A animação deve ter começo, pequena variação e repouso; só toca quando a interação acontece, acompanha o estado multiplayer, encerra quando a condição termina e respeita `prefers-reduced-motion`. Um GIF pode servir para prévia ou para um detalhe decorativo sempre ativo, mas não deve controlar sozinho uma reação ligada ao estado do jogo.

A logo também pode ser uma pequena imagem animada, mas crie sua própria silhueta e sequência — não copie a fogueira jogável. Escolha o formato pelo tamanho comprimido, memória decodificada e controle necessário; use quadro estático para movimento reduzido, carregue sem bloquear a entrada e evite repetir uma animação grande em mais de um lugar. Meça o custo real em vez de presumir que “imagem” é sempre mais leve que desenho em Canvas.

Movimento não substitui interação: o jogador precisa conseguir entrar, entender, agir e receber resposta. A página deve mostrar a cena inteira em poucos grupos coerentes; nunca revelar o mundo tile por tile. Música e efeitos começam após ação explícita, têm controle visível e pausas reais. `prefers-reduced-motion` deve reduzir ou parar movimento sem esconder a cena nem quebrar o acesso.

## Movimento, interação e controles

O personagem precisa parecer presente no mundo, não um ícone deslizando pelo mapa. O corpo olha para a direção em que o jogador tenta ir; passos, braços, roupa e silhueta respondem ao terreno e ao gesto sem borrar a escala dos pixels. Parar deve ser imediato e conservar a última direção. Teclado e toque compartilham a mesma orientação e o mesmo resultado, inclusive junto a obstáculos.

Trate cada ação como uma sequência curta: intenção legível → antecipação → ação → resposta → consequência. Um aceno move braço e mão; uma dança muda postura e ritmo; pegar algo mostra contato e o que mudou; oferecer deixa claro quem recebeu; colisão dá sinal e permite contornar. Um símbolo flutuante pode reforçar o gesto, mas não substitui a animação corporal nem o resultado da ação.

Antes de polir efeitos, teste a sensação com os controles reais: virar em quatro direções, andar na diagonal, soltar teclas/toque, perder foco, bater numa árvore e voltar, fazer um gesto parado e em movimento, ver a ação de outro jogador. Prefira mudanças pequenas que tornam um desses momentos mais compreensível ou prazeroso. Respeite `prefers-reduced-motion`: movimento do mundo pode parar ou ficar discreto, sem impedir o jogador de mover-se e agir.

## Como revisar uma mudança

1. Abra a versão atual em `/dev/` e registre o estado antes de editar. Confira desktop e celular quando a composição mudar; capture uma imagem do resultado sempre que a ferramenta permitir. Para gameplay, jogue com teclado e toque, não se limite a ler o código.
2. Compare com a intenção do dono, não com uma lista superficial de cores. Verifique estilo de pixel, personalidade, hierarquia, densidade, leitura, crop em telas estreitas e resposta das ações.
3. Escreva a hipótese e implemente uma mudança coesa. Pesquise só a dúvida que pode mudar a decisão; use fontes confiáveis e limite a busca ao necessário.
4. Teste a página real, os assets, o movimento normal e reduzido, e o áudio após ativação. HTTP 200 e testes de código provam entrega e lógica, não provam que a arte está bonita ou que a animação é visível.
5. Compare de novo. Corrija desalinhamento, movimento imperceptível, corte ruim ou elemento genérico antes de encerrar. Se não houver navegador disponível, registre que a inspeção visual está pendente e não declare o acabamento validado.
6. Registre em `LEARNINGS.md` o que a observação ensinou para decisões futuras, e deixe em `memory/STATUS.md` o próximo passo demonstrável.

### Critérios de bloqueio visual

Não trate como final uma tela que falhe em qualquer um destes pontos: o pixel art parece realmente pixel art; a assinatura aparece de forma contextual; a cena tem personalidade e conta algo; o acesso está claro e integrado; movimento combina com o material e não bloqueia o uso; a versão móvel continua legível; a redução de movimento mantém a página funcional. Não invente uma validação de navegador que não ocorreu.

### Imagem estática da entrada

A paisagem panorâmica da vila é uma imagem WebP estática, escolhida para carregar leve e deixar o mundo visível sem esperar por vídeo. Preserve a imagem sem efeitos sobrepostos; a página `/dev/` serve o jogo em teste e `/` continua a página pública de manutenção.

Na primeira fatia de movimento, `game/avatar.mjs` escolhe a orientação do avatar pela direção projetada do controle; `game/main.js` aplica a mesma leitura ao jogador local e aos snapshots remotos. Pernas alternam o passo; braços e tronco respondem a aceno e dança; a pose para ao soltar o movimento e os gestos mantêm silhueta nítida. Isso é uma base de leitura, ainda não um conjunto final de sprites. Falta conferir o resultado no jogo em desktop e touch e evoluir para quadros desenhados por direção, sem aumentar a resolução borrada.

## Referências enviadas pelo dono em 2026-10-10

Imagens em `references/visual-20261010/`, para estudo visual; criar arte original do jogo. O dono apontou que a cena revisada ainda fica abaixo desse padrão. Não tratar quantidade de árvores, ruído no piso ou testes aprovados como comprovação de boa arte.

- `avatar.png`: proporção de cabeça/corpo, rosto expressivo, mãos/pés legíveis, roupa com volume, contornos e caminhada por direção. O renderer atual desenha no Canvas via `game/canvas-avatar.mjs`; preserve essas metas ao refinar os cinco trajes e revisar o movimento no jogo.
- `jardim.png` e `bosque-fogueira.png`: troncos ramificados, raízes, copa irregular com volumes e vegetação organizada; luz do fogo sobre pessoas, chão e árvore, distância fria e sombra profunda.
- `materiais.png`, `praca.png` e `vila.png`: perspectiva coerente, telhas, pedra e madeira distinguíveis, objetos ligados ao uso do lugar, sombras de contato e variedade sem ruído indiscriminado.
- `ceu-noite.png`, `paisagem.png`, `castelo-luz.png` e `chuva.png`: planos de distância, silhuetas, céu/nuvens com desenho e contraste quente/frio. Paisagens ilustradas orientam atmosfera; o mundo jogável continua isométrico.
- `criatura.png`: silhueta e pixels deliberados para personagens/animais próprios.

Próxima fatia visual: revisar o renderer Canvas nos cinco trajes, oito rumos e poses do jogo em tamanho real, em movimento e parado. Refinar pixels e silhuetas sem maquiar bugs físicos nem trocar de modelo durante uma animação.

## Direção atual do bosque e HUD

Menu compacto à esquerda por seções; nome da localidade e clima no alto, sem barra geral ou painel Uma ideia. Bosque das Brasas tem terreno natural, sem o patamar experimental. Vegetação caída e recursos esparsos substituem o chão lotado. Distância do fogo escurece até a leitura fria da lua; cada fogueira real altera luz e sombras próximas. O quarto conserva escadas/rampas. Carteira mostra ouro, prata e bronze em zero até uma economia real existir.

## Personagem e animação aprovados

Por decisão do dono, o mundo e a prévia de aparência agora usam `game/canvas-avatar.mjs`: pixel art desenhada em Canvas numa grade lógica 48×48, ampliada sem suavização para célula 96×96, pivô (48, 84) e oito direções. O catálogo e a composição em `game/character-catalog.mjs` e `game/character-composition.mjs` mantêm IDs, trajes, cores, equipamentos e aparências salvas. A pose acompanha caminhada, corrida, agachamento, salto, sentar e gestos disponíveis; preserve animação coerente e escala pixelada. Os atlas PNGs anteriores permanecem arquivados como referência, mas não são usados no runtime. Inspeção visual no jogo continua necessária; testes não substituem revisão de arte.

## Referências atuais de materiais e relevo

As imagens de ilha/água, café isométrico e casa de telhas orientam texturas agrupadas por material, perspectiva, faces com tons próprios e junções sombreadas. Não copiar os assets. `game/materials.mjs` aplica telhas, madeira e fundação de pedra na casa; a janela emite luz localizada. Paredes acompanham cada nível e caem verticalmente no desnível. A encosta do bosque é contínua e compartilha altura com a física. Água tem ondulações discretas; troncos caídos têm seção arredondada, anéis e galhos.
