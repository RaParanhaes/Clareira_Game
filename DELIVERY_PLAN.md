# Revisão autorizada pelo dono

O dono autorizou executar a lista de nove grupos: personagem, animações, física, relevo, materiais, iluminação, casa/quartos, ambiente vivo e validação. Não considerar testes aprovados como prova de que a arte atingiu as referências.

## Base entregue

- Por decisão do dono, o runtime passou a desenhar personagens em `game/canvas-avatar.mjs` com Canvas 2D, grade lógica 48×48, ampliação nearest-neighbor para célula 96×96, pivô (48, 84) e oito direções. IDs, cores, cinco trajes, acessórios e aparências salvas continuam ligados ao catálogo e composição. PNGs antigos permanecem arquivados, sem serem carregados pelo mundo.
- O renderer Canvas produz caminhada, corrida, agachamento, salto, sentar, alcance e gestos a partir do estado compartilhado do jogador; a prévia de Aparência usa o mesmo desenho. A amostra visual isolada foi revisada. Ainda falta inspeção em jogo no desktop/celular quando a tela de entrada do `/dev/` permitir chegar ao mundo, além de refinamento artístico de poses e proporções.
- Próxima fatia visual: revisar os cinco trajes em tamanho nativo, movimento real, toque e oito rumos; ajustar proporções/contorno e a leitura de equipamentos. Não carregar novamente os atlas raster antigos no runtime.
- Movimento usa aceleração/frenagem, Shift para correr, C para agachar, Espaço para pular e 3 para sentar/levantar. A posição, física e animações compartilhadas mantêm a consistência entre jogadores.
- Telhas/madeira/pedra na casa; quarto com tábuas contínuas e paredes com vigas. A fogueira muda suavemente a luz e as sombras; a janela ilumina a fachada. O bosque usa terreno natural, sem patamar artificial.
- Móveis e salvamento foram preservados; ainda conferir visitas entre contas e a apresentação desse fluxo antes de declarar o marco completo.

## Próximas fatias

1. Revisar e aprovar o ciclo de caminhada masculino já ligado ao catálogo; depois ampliar os quadros para os outros corpos, trajes e ações.
2. Continuar a revisão de relevo, materiais, água e margens com caminhos e recursos utilizáveis; clique, câmera e física devem consultar a mesma altura.
3. Completar quartos funcionais: visitas protegidas, móveis persistentes, casa por fora/por dentro e objetos usáveis.
4. Refinar iluminação por material e ligar efeitos a ações reais; qualquer nova animação deve respeitar estado multiplayer e movimento reduzido.

## Próximo marco de jogo: primeira jornada completa

As fatias acima estabilizam os fundamentos. O próximo marco de produto deve então conectar estes passos numa experiência pequena, multiplayer e testável, em vez de abrir várias funcionalidades sem conclusão:

1. Criar a primeira chegada obrigatória de todo visitante ou conta nova na dimensão escura: fogueira central, fios de luz e o Deus do Fogo como guia opcional. Aproximar-se inicia a orientação; uma opção clara permite dispensá-la sem sair dessa dimensão. Ensine apenas controles e sistemas implementados; o tutorial pode ser revisto depois.
2. Tanto ao concluir o tutorial quanto ao dispensá-lo, fazer a mesma transição para o bosque: símbolos desenhados sob o personagem, luz que sobe e um clarão breve. O teleporte precisa mover de fato para o cenário principal e respeitar movimento reduzido. Não oferecer um atalho que pule a cena escura ou use uma transição diferente.
3. Apresentar o personagem nível 1 com uma faca simples; ensinar a coletar materiais do chão e fabricar ou comprar machado e picareta antes das atividades que exigem cada ferramenta.
4. Construir uma expedição curta até recursos do bosque e um depósito limitado de minério em área rochosa; incluir um desafio ou perigo, sem transformar todo o jogo em coleta.
5. Completar o caminho minério → fundição → material/moeda e mostrar uma utilização concreta: criar um objeto, equipar algo, guardar no quarto ou fazer uma troca segura. Bronze, prata e ouro devem ter fontes, valores e limites coerentes.
6. Testar essa jornada com visitante e conta, solo e com outra pessoa, em desktop e celular. Registrar onde alguém se confunde, perde recursos ou fica sem próxima ação. Essa validação cobre apenas a primeira fatia; depois dela, continuar expandindo o jogo em sistemas conectados.

## Visão de expansão depois da primeira jornada

A primeira jornada não é o escopo total da Clareira. Depois de provar o ciclo inicial, planejar e entregar fatias jogáveis para:

- alimentação, cultivo/preparo de comida e refeições que tenham uso e valor social;
- lojas, mercados, comércio e trocas seguras entre jogadores;
- quartos e casas expansíveis, além de construções coletivas e públicas como torres, palácios, castelos, vilarejos e hotéis onde seja possível se hospedar ou morar;
- combate com progressão, novos golpes e magias aprendidos dentro do mundo;
- festas, atividades sociais, minijogos e ferramentas para jogadores criarem jogos;
- novas regiões, aventuras, tesouros, criação e invenção de objetos.

Não implementar tudo ao mesmo tempo nem converter essa lista em grind obrigatório. Conectar cada sistema a atividades e decisões significativas, preservar convivência multiplayer e ampliar o mundo conforme as fatias anteriores forem testadas.

Não começar pela cinemática final se o movimento, a interação ou a troca de cenário ainda forem falsos. Primeiro construa a sequência jogável e valide cada passo; depois dê acabamento autoral ao fogo, aos símbolos e à luz. Depósitos finitos e árvores replantáveis devem ser equilibrados para o multiplayer e não bloquear a progressão de jogadores novos.

Faça uma ação jogável completa por fatia. Verifique desktop e celular, rode a suíte completa uma vez ao concluir e registre capturas atuais. Não recrie o camponês procedural como fallback e não marque a qualidade final apenas porque os testes passaram.

## Revisão do ciclo de caminhada

A caminhada do camponês masculino está ligada no catálogo, mas o manifesto marca a arte como `revision-required`. O dono aprovou visualmente apenas as vistas de costas (`northeast`, `north`, `northwest`); rever `south`, `southeast`, `east`, `west` e `southwest`. Preservar a identidade do camponês, a ordem cronológica, o canvas 96×96 e o pivô (48,84). Não tratar a ligação técnica como aprovação visual.

Depois, executar uma categoria por vez e deixar cada variante/aparência pendente até ter PNGs numerados, GIFs de revisão, verificação de pivô/escala/loop e teste no jogo. A fila inclui caminhada das demais aparências e do corpo feminino; corrida; pulo; agachar e andar agachado; sentar/levantar; acenar de pé, sentado e andando; dançar parado e andando; pegar objetos do chão; animações específicas para ferramentas/armas/roupas; efeitos de conjuração, dispositivo dimensional e auras. Só vincular cada comando/efeito depois de aprovada sua própria sequência.

O ciclo masculino usa `character-layers-v1/atlases/outfits/commoner/male/walk.png`; a falha antiga de carregamento de `neutral-body-v2/atlases/male/walk.png` não descreve mais a configuração atual.
