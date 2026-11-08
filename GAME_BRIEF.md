# Clareira — direção do jogo

Direção atual do dono: o mundo jogável deve superar a entrada em qualidade. Quartos, construção, exploração e ações completas têm prioridade sobre acabamento opcional.

## Experiência

Um mundo social isométrico de pixel art com volume, luz e animação, onde cada pessoa pode escolher entre conviver, explorar, construir, competir e inventar. O bosque é o começo da jornada, não o jogo inteiro: deve levar a aventuras, encontros com perigos, tesouros, novos lugares e espaços que os jogadores tornam seus. A experiência pode ser acolhedora e calma, mas também ter momentos agitados, engraçados e cheios de ação. As referências incluem Habbo, Club Penguin, Nend.io, Minecraft, Project Zomboid, Stardew Valley e Terraria; use-as para entender sensações e sistemas, sem copiar personagens, mapas, interfaces ou assets.

## Voz da Clareira

Escreva em português brasileiro natural, caloroso, curto e concreto — como alguém recebendo uma pessoa que acabou de chegar a outro mundo. Dê vontade de entrar e descobrir o que tem pelo caminho; evite frases genéricas, robóticas, professorais ou filosóficas. A sensação isekai vem de chegar a um mundo vivo, não de afirmar que existe um portal ou portão literal. Só dê nome próprio a lugares que existam no mapa. A entrada do jogo pode mudar a chamada uma vez por dia em cada navegador por meio de `game/entry-copy.mjs`; mantenha uma variação estável durante aquele dia e acrescente opções que tenham a mesma voz, sem guardar dados pessoais.

Referências de tom aprovadas pelo dono: “Chegue perto. O bosque acorda.”; “Quem vem lá?”; “Trilhas, encontros, aventuras e lugares para chamar de seu. A história da Clareira começa com quem aparece por aqui.”; “Sempre há lugar perto do fogo.”; “Sem senha e sem compromisso: sua visita é temporária.” Use-as como norte e escreva novas linhas com a mesma naturalidade.

## Identidade visual e sonora

Clareira precisa ser reconhecível sem ler o nome. Construa uma linguagem própria a partir do bosque, da água, das luzes, dos personagens e das atividades do jogo: paleta curta e intencional, silhuetas, ícones, tipografia, molduras, animação e som devem parecer partes do mesmo lugar. O pixel art precisa ter escala, contorno, luz e agrupamento de cores consistentes; use detalhes animados com propósito, como fogo, fumaça, folhas, água, personagens em espera e gestos.

A assinatura visual da Clareira pode usar três brasas e uma folha em detalhes contextuais, como bordado ou entalhe. Ela não precisa aparecer em toda peça e não é objetivo recorrente de desenvolvimento. O que une o mundo são escala de pixel, materiais, luz, silhuetas e uma paleta coerente. Novos lugares e objetos devem ter identidade própria.

A mistura visual desejada combina aventura noturna com aconchego social: exteriores de azul-marinho e ameixa, mata em camadas, ruínas e água refletindo a lua; fogueiras, janelas e lanternas trazem âmbar, laranja e rosa. Casas, quartos, hotéis e festas podem ser mais vivos e coloridos, com móveis e objetos que contem histórias de quem mora ali. Use [game/art/clareira-campfire-v1.webp](game/art/clareira-campfire-v1.webp) como referência de atmosfera, não como padrão técnico de pixel art: a estrutura de pixel deve seguir as referências em blocos enviadas pelo dono e a arte nativa do jogo. A densidade de detalhe deve vir de clusters nítidos, formas legíveis, animação e luz coerentes, sem perder a leitura isométrica.

Use lembranças como neve vista de dentro de casa ou música de Natal apenas para entender o sentimento de abrigo, nostalgia e convivência. Não as transforme em neve permanente, tema natalino ou sinos obrigatórios. Clima, música e efeitos devem nascer do lugar, horário, estação e atividade; o que permanece é o calor emocional e a sensação de um mundo vivido.

A logo da Clareira tem símbolo e arte próprios, separados da fogueira que existe como objeto no mundo. A fogueira não representa sozinha o jogo inteiro; as três brasas e a folha são uma assinatura que pode aparecer em diferentes materiais e contextos. A logo pode ser uma imagem pixel art animada, com quadros próprios, pequena e otimizada, além de uma versão estática para movimento reduzido. Não copie a animação da logo para a fogueira jogável: cada uma tem função, desenho e ritmo próprios. Na tela de entrada, a paisagem panorâmica WebP da vila ocupa o fundo inteiro como imagem estática e carrega com prioridade alta. Não baixe nem reproduza vídeo, nem ponha SVGs, partículas, sprites DOM ou Canvas por cima da paisagem para simular movimento. Login, cadastro e entrada de visitante ficam à frente, legíveis e integrados. A música ambiente e os estalos continuam separados, controláveis e opcionais, com pausas reais de silêncio.

### Regra visual para toda criação

A atmosfera de [game/art/clareira-campfire-v1.webp](game/art/clareira-campfire-v1.webp) e a paleta comum orientam conteúdo visual novo — cenário, textura, roupa, animação, objeto, contêiner, inventário, menu e tela social. Não são apenas referência para a tela de entrada. Antes de desenhar, derive materiais, silhueta, luz e cor dessa cena; use os tokens de [game/theme.mjs](game/theme.mjs) e as variáveis `--clareira-*` de `game/style.css` como paleta comum. Amplie esses tokens quando uma região ou atividade precisar de novas cores, mantendo a mesma relação entre noite fria, luz quente e verde vivo.

Quando houver contexto, integre as três brasas e a folha ao material — linha bordada, nó de barbante, entalhe, reflexo ou pequeno recorte de moldura — e dê a cada peça sua própria forma e história. Interiores, festas e itens sociais podem ser mais luminosos e coloridos que a mata; devem continuar parecendo feitos no mesmo mundo e não receber um tema genérico separado. Som, animação e resposta de interação também devem reforçar esse aconchego. Não finalize conteúdo novo com arte, ícone, paleta ou painel provisório sem registrar como ele segue essa linguagem.

A entrada mostra a vila panorâmica estática e um acesso simples por vez: visitante, conta ou cadastro. O visitante é a ação principal; conta e cadastro são opções claras no mesmo lugar. Use título curto, texto enxuto, campos legíveis e botões confortáveis no celular. Preserve arte visível, acesso por teclado, foco e mensagens de erro. A tela já tem uma revisão manual validada; novos ciclos devem desenvolver o mundo jogável. Habbo orienta escala, movimento, convivência e quartos; Terraria, exploração e progressão; Minecraft, construção e transformação do mundo. A Clareira usa assets e linguagem próprios.

Ao estudar Habbo, DDTank, Agar.io, Club Penguin, Free Fire e outras referências, observe como cada uma usa forma, cor, ritmo, som, composição e linguagem para ser lembrada; anote o princípio aprendido e crie uma solução original. Nunca reutilize artes, personagens, músicas ou sons dessas obras. Faça pesquisa visual curta e direcionada, sem gastar um ciclo inteiro apenas pesquisando. A prioridade imediata é a funcionalidade jogável definida em DELIVERY_PLAN.md: cena utilizável, quartos e construção. A entrada já existente deve ser preservada; fades, efeitos e acabamento do login não são objetivos de ciclo. Use as imagens do proprietário como orientação de clima, escala e densidade; a direção de arte final deve integrar aventura, convivência e moradia, e não reduzir o jogo a uma cena de fantasia sombria. A referência a Natal, neve e sinos expressa aconchego e memória afetiva; não é uma exigência de incluir esses temas literalmente.

## Fantasia e atividades do jogo

O jogo deve crescer para oferecer estes ciclos conectados, sem reduzir a experiência a juntar recursos:

- **Aventura e exploração:** trilhas, regiões diferentes, objetivos, perigos, inimigos, brigas divertidas, tesouros e baús. Combate cooperativo deve ser possível; duelos entre jogadores devem ser opcionais e sem permitir que alguém estrague a sessão alheia.
- **Um lugar para chamar de seu:** quartos e casas decoráveis, com baús e objetos colocáveis; ampliar a casa e construir, em etapas, casas maiores, torres, palácios e castelos. Permissões, custo, terreno, persistência e limites multiplayer precisam fazer parte do sistema, para que construções sejam lugares utilizáveis e visitáveis.
- **Hospedagem e moradia:** hotéis e pousadas podem servir para passar a noite, conhecer outros jogadores e, em sistemas futuros, oferecer estadias mais longas ou moradia. São espaços sociais funcionais, não só fachadas.
- **Alimentação e vida cotidiana:** encontrar, cultivar, preparar, compartilhar e consumir alimentos como parte da vida do mundo, da exploração e da convivência. A alimentação deve gerar escolhas e momentos interessantes; não presumir uma barra punitiva de fome ou obrigar tarefas repetitivas sem validar que isso melhora a experiência.
- **Vida social:** encontrar pessoas, conversar e gesticular; dançar e organizar baladas ou festas em lugares com música e ambientação próprias.
- **Atividades compartilhadas:** jogos internos e desafios curtos que funcionem bem em grupo; mais tarde, ferramentas para jogadores criarem suas próprias brincadeiras, incluindo ideias no estilo Wired.
- **Criação e invenção:** transformar materiais em objetos úteis e decorativos, descobrir receitas e experimentar combinações para inventar itens. Coletar só vale a pena quando habilita uma decisão, criação ou aventura interessante.
- **Combate e aprendizado:** lutas contra perigos e inimigos, com novos golpes e magias aprendidos por experiência, mestres, descobertas ou outros meios que façam sentido no mundo. Combate cooperativo deve ser possível; duelos entre jogadores permanecem opcionais e protegidos contra abuso.
- **Comércio e economia de jogo:** moeda virtual conquistada jogando, lojas, mercados, comércio entre jogadores e trocas diretas. Comida, materiais, equipamentos, móveis, estadias e serviços podem ganhar usos econômicos quando os sistemas correspondentes existirem. Comércio com dinheiro real e monetização ficam fora do protótipo e só podem ser planejados separadamente, com segurança e transparência.

## Primeira chegada e progressão inicial

No primeiro acesso — como visitante ou após criar/usar uma conta — todo personagem desperta numa dimensão de breu quase absoluto. Essa primeira passagem pela escuridão faz parte da chegada e não pode ser pulada. Uma única fogueira abre um círculo de luz no vazio; fios luminosos nascem dela e conduzem o olhar até a borda iluminada. Ali vive o Deus do Fogo, uma presença que se oferece como guia para quem quiser aprender. A orientação é opcional: aproximar-se e falar com ele inicia um tutorial curto; quem não quiser pode escolher seguir sem tutorial. Em ambos os casos, o personagem continua nessa dimensão até ser transportado ao bosque. O tutorial deve ensinar ações que já funcionem no jogo, sem longas falas nem obrigar quem prefere descobrir sozinho. A fogueira e o mentor são elementos diferentes da Clareira e da logo.

Ao concluir o tutorial ou escolher seguir sem ele, a mesma sequência de teletransporte acontece: símbolos mágicos aparecem no chão sob o personagem, se desenham para fora e brilham. A luz sobe do piso, cresce até envolver a pessoa e culmina num clarão que faz a transição real para o bosque principal. O efeito deve acompanhar a posição do jogador e a troca de cenário, com alternativa reduzida para `prefers-reduced-motion`; não é uma animação solta que deixa o personagem parado num destino falso. O tutorial pode ser revisto. Depois dessa primeira chegada, a conta retorna diretamente ao mundo principal, preservando o progresso.

No bosque, cada personagem começa no nível 1 com uma faca simples. Machado e picareta são adquiridos por fabricação ou compra; o primeiro machado pode ser feito com pedra, graveto forte e cipó. Materiais do chão permitem essa primeira fabricação sem ferramenta, e uma picareta precisa estar disponível por receita ou recompensa antes da primeira jazida. Cada ferramenta tem uma função útil e distinta, aprendida pelo uso; o machado perde o fio e exige pedra e tempo para ser afiado. Árvores viram toras que precisam ser cortadas e processadas em gravetos, lenha ou ripas. A picareta abre caminho para depósitos limitados em montanhas rochosas. Minério coletado precisa ser transportado e fundido antes de virar material de criação ou moeda. A economia terá moedas de bronze, prata e ouro; receitas, valores e a relação entre minério e denominações precisam ser balanceados como sistema, não tratados como conversão automática de cada recurso em dinheiro.

Árvores não reaparecem como recurso infinito: podem voltar a crescer quando alguém planta uma muda, e algumas nascem naturalmente de tempos em tempos. O mundo deve tornar plantio, uso de madeira e descoberta de depósitos legíveis e interessantes. Como a Clareira é multiplayer, a escassez deve criar escolhas sem permitir que uma pessoa esgote sozinha o caminho de progressão de todos os outros.

Esse começo ensina um ciclo inicial — chegar, aprender, explorar, enfrentar situações, encontrar recursos e tesouros, transformar o que trouxe e usá-lo em aventura, criação, comércio ou espaços próprios. É apenas a primeira fatia de um jogo muito mais amplo: alimentação, comércio, construção e expansão de moradias, hospedagem, combate, golpes, magias, atividades sociais e invenções devem crescer em sistemas conectados. Coletar é um meio para abrir possibilidades; não pode virar a única atividade nem uma rotina de mineração sem propósito.

## O que deve funcionar primeiro

1. Entrar como visitante ou com conta e passar pela dimensão escura na primeira chegada; escolher se quer aprender com o Deus do Fogo, sabendo que os dois caminhos terminam no mesmo teletransporte para o bosque.
2. Aprender movimento e interação; coletar materiais do chão e fabricar ou comprar ferramentas antes das atividades que exigem cada uma.
3. Fazer uma saída curta do bosque: encontrar madeira ou minério, encarar um perigo ou desafio e voltar com algo útil.
4. Dar destino ao que trouxe — fundir, criar, guardar, trocar ou usar numa aventura — e perceber as consequências no mundo.
5. Ter um espaço pessoal funcional e decorável, com móveis persistentes e visitas protegidas.
6. Encontrar outros jogadores e participar de uma atividade social curta, como gesto, dança, festa ou minijogo.
7. Fazer progressos de conta persistirem, mantendo a visita sem senha como opção temporária.
8. Usar animação, música e efeitos sonoros para comunicar ações e atmosfera, com controles de áudio e movimento reduzido.

Em cada ciclo de controle, pense intenção → antecipação → ação → resposta → consequência. Avatares viram para a direção real em tela, passos e roupa acompanham o movimento, gestos sociais usam o corpo e as ações deixam claro o que aconteceu. Teclado e toque devem compartilhar orientação e resposta. Construa os sistemas em fatias jogáveis; polimento opcional não pode adiar quartos, construção e exploração.

Animações precisam caber no orçamento de desempenho. Confira tamanho comprimido e dimensões de cada asset, evite carregar quadros duplicados ou bloquear o primeiro quadro, mantenha o custo de decodificação e desenho compatível com celular e desative/pausa efeitos fora de vista quando fizer sentido. Uma animação pequena própria da logo pode rodar em loop; efeitos de gameplay devem começar e parar com o estado do mundo. Sempre ofereça um quadro estático com `prefers-reduced-motion`.

Construa em fatias pequenas e jogáveis. Primeiro prove uma jornada curta que una chegada, exploração, desafio, recompensa e um uso concreto do que foi obtido. Isso valida o começo do jogo, não reduz sua visão aos recursos dessa fatia. Depois conecte alimentação e preparo de alimentos, comércio e trocas, expansão de casas e construções maiores, hospedagem, progressão de combate e magia, novas regiões e jogos criados por jogadores. Essas ideias são a direção do produto, não uma lista para implementar de uma vez. Não deixe o protótipo preso em coleta, nem adicione sistemas grandes antes de demonstrar uma interação divertida de ponta a ponta.

## Tom e limites

Alterne calma e energia: exploração tranquila, encontros sociais, festas e aventuras com tensão leve. A primeira versão é uma fatia de jogo, não um mundo enorme. Pesquisa deve responder a uma dúvida concreta de implementação ou design; observe o comportamento real do jogo, faça uma mudança pequena e verificável e registre o que funcionou para orientar o próximo ciclo. Preserve controles responsivos, multiplayer confiável e a possibilidade de reverter mudanças pelo Git.

O cadastro atual é apenas uma função do protótipo: não pede e-mail e não oferece recuperação de senha. Contas e progresso são dados de teste privados do VPS; não trate o fluxo como pronto para produção ou para itens com valor real. O alvo de qualidade é uma experiência social polida, sem copiar mapas, personagens, interface ou assets de Habbo, Club Penguin e outras referências.

## Critérios de uma melhoria

Uma mudança é útil quando resolve um problema que alguém consegue reproduzir ou torna uma ação central mais clara, agradável, acessível ou confiável. Registre o sintoma, a mudança e a verificação. Efeitos e detalhes visuais devem apoiar a leitura da cena e a interação, não mascarar controles ruins.
