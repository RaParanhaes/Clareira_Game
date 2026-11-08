# Aprendizados verificados durante os ciclos

Registro reiniciado junto com a nova base. Não importar conclusões antigas sem reproduzir o comportamento no jogo atual.

Formato: `AAAA-MM-DD — sintoma; tentativa; resultado; teste; fonte (opcional).`

2026-10-09 — Perto de uma pedra ao alcance, o objetivo mandava voltar a uma fogueira distante enquanto o brilho marcava a coleta; alinhei a instrução ao recurso e mantive o convite social junto ao fogo; a regressão falhou antes e passou depois, `npm test` (97 Node + 3 Python), preview HTTP 200; sem pesquisa.

2026-10-09 — Toques repetidos em Coletar substituíam o pedido que aguardava resposta; bloqueei pedidos sobrepostos até confirmação ou 1,6 s; teste de feedback falhou antes e passou depois, `npm test` (97 Node + 3 Python); preview do módulo deu 500 por permissão local, corrigi para 0644 e conferi 200; sem pesquisa.

2026-10-09 — Ao entrar na sala, o foco ficava no botão oculto e Enter não abria a conversa, pois o atalho exige foco no canvas; passei o foco ao mundo ao revelar a sala; o teste falhou antes e passou depois, `npm test` final (91 Node + 3 Python), preview HTTP 200; fonte: reprodução pelo fluxo de foco, sem pesquisa.

2026-10-09 — Ações e gestos nos 250 ms após outro comando sumiam sem retorno; mantive o intervalo e enviei um aviso curto do servidor; teste WebSocket com relógio controlado falhou antes e passou depois para ação/gesto, `npm test` final (92 Node + 3 Python); sem pesquisa.

2026-10-09 — O campo limitava emojis a 36, pois `maxlength` conta unidades UTF-16; aumentei o teto bruto e cortei a entrada pelos mesmos 72 pontos de código do servidor; teste cobre 72 emojis e a 73ª posição, suíte final `npm test` (88 Node + 3 Python); fonte: [MDN, maxlength](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/maxlength).

2026-10-09 — O avatar local avançava a cada quadro, mas o corpo só seguia snapshots do servidor a cada 100 ms; passei posição, direção e passo previstos para a renderização local, preservando identidade e bolsa do snapshot; teste reproduziu o atraso e passou, suíte final `npm test` (87 Node + 3 Python); fonte: reprodução no código, sem pesquisa.

2026-10-09 — A sala não permitia conversar; acrescentei mensagens curtas que aparecem sobre o avatar, expiram em cinco segundos e não são salvas, com intervalo entre falas e retorno acessível; dois visitantes confirmaram entrega, limite e expiração, `npm test` (87 Node + 3 Python), sintaxe e diff passaram; fonte: `GAME_BRIEF.md`, `ART_DIRECTION.md`, arte-base e `theme.mjs`; sem navegador para revisar a composição.

2026-10-09 — Ao oferecer uma frutinha, bolsa e aviso mudavam sem resposta corporal ou visual; enviei posições nos dois avisos, fiz o emissor estender o braço e desenhei o trajeto em pixels com brasas/folha, parado em movimento reduzido; WebSocket e pose temporária passaram; `npm test` (80 Node + 3 Python), sintaxe, diff e preview HTTP 200; sem navegador local nem pesquisa.

2026-10-09 — Ao coletar perto de um recurso, item e bolsa mudavam sem o avatar mostrar contato; acrescentei alcance, confirmação ligada ao alvo e brasas/folha no ponto, além do gesto no snapshot para outras pessoas; os testes cobriram coleta válida, recusa, movimento reduzido e dois visitantes; `npm test` (75 Node + 3 Python), sintaxe e diff passaram, preview serviu página/módulo/arte; sem pesquisa.

2026-10-09 — Ao oferecer frutinha, G escolhia a pessoa mais próxima sem indicar o alvo antes; reproduzi a seleção automática e usei a mesma regra de 1,8 unidade no servidor e no convite pixelado com três brasas/folha; seletor, troca WebSocket e módulo do preview confirmaram o alvo; `npm test` (69 Node + 3 Python), sintaxe e `git diff --check` passaram; sem pesquisa.

2026-10-09 — Quando o salvamento da troca falhava, o aviso do servidor era substituído pela confirmação; reproduzi com o diretório de progresso bloqueado e unifiquei o retorno para emissor e destinatário; o teste WebSocket falhou antes e passou depois, confirmando o aviso final dos dois lados; `npm test` (70 Node + 3 Python), sintaxe e diff passaram; sem pesquisa.

2026-10-09 — Com materiais e uma fogueira distante, o objetivo escondia outra construção aceita pelo servidor; reproduzi, passei a sugerir outro fogo fora de 1,6 unidade e mantive o convite social perto; o teste unitário falhou antes e passou depois, WebSocket confirmou dois fogos e `npm test` passou (63 Node + 3 Python); sem pesquisa.

2026-10-09 — Com `prefers-reduced-motion`, água, árvores, recursos, fogo e vaga-lumes ainda se mexiam e a câmera deslizava; congelei o relógio visual e removi a interpolação da câmera sem parar o controle. A primeira asserção de câmera falhou por arredondamento e passou com tolerância; `npm test` (57 Node + 3 Python), sintaxe, diff e entrega do módulo no preview passaram. Sem navegador local ou pesquisa.
2026-10-09 — Durante uma queda do WebSocket, ações e gestos eram descartados sem retorno; ações e emotes agora avisam que a Clareira está voltando. Testes cobrem socket aberto/fechado, aviso e rota do módulo; `npm test` (61 Node + 3 Python), sintaxe e diff passaram. Sem navegador local ou pesquisa.

2026-10-08 — Em telas ≤390 px, o canvas era esticado de 1,6 para 1,2; removi a proporção divergente; geometria responsiva preservada no CSS; preview HTTP 200 e inspeção da regra; sem pesquisa.
2026-10-08 — Avatares remotos caminhavam sem animar as pernas; publiquei movimento real do passo do servidor e usei-o no cliente; estado de andar/parar confirmado; `npm test` (8 Node + 3 Python); sem pesquisa.
2026-10-08 — Contra uma árvore, o avatar local continuava animando sem sair do lugar; derivei a animação do deslocamento e cobri a colisão; teste de bloqueio e `npm test` (9 Node + 3 Python) passaram; sem pesquisa.
2026-10-08 — O protótipo só tinha apelido descartável e aceitava WebSocket sem sessão; adicionei conta/guest, cookie HttpOnly/Secure/SameSite, senha com hash salgado, checagem de origem e bolsa persistida para contas; cadastro, login, logout, sessão multiplayer, inventário e rota WebSocket sem autenticação verificados; `npm test` (15 Node + 3 Python); referências: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html e https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html.
2026-10-08 — Ao ocultar a página com movimento pressionado, a entrada podia persistir sem `blur`; limpar teclas/toques também em `visibilitychange` oculto; passou; `npm test` (8/8), preview HTTP, sintaxe JS e `git diff --check`; sem pesquisa.
2026-10-08 — 13 conexões WebSocket simultâneas ultrapassavam o limite de 12 durante a validação assíncrona da sessão; repeti a checagem de capacidade após validar; agora 12 entram e a 13ª recebe 503; reprodução falhava antes e `npm test` (16 Node + 3 Python), `node --check` e `git diff --check` passaram; sem pesquisa.
2026-10-08 — Aba oculta limpava a entrada local mas deixava o servidor andando com o último comando; enviei movimento neutro ao perder foco e mostrei progresso dos materiais da fogueira no objetivo; teste de expectativa precisou ser alinhado ao texto final; `npm test` (17 Node + 3 Python), sintaxe, diff e preview HTTP 200 passaram; sem pesquisa.
2026-10-08 — A primeira renderização da clareira acessava `WORLD_SIZE` sem importá-lo e quebrava após entrar; importei a constante do mundo; renderização agora tem a dependência declarada; `npm test` (17 Node + 3 Python), `node --check`, `git diff --check` e preview HTML/JS/CSS HTTP 200; sem pesquisa.
2026-10-08 — No celular só era possível acenar, embora dança e sentar existissem no teclado; adicionei os dois gestos e grade de toque em duas colunas, corrigindo a regra responsiva que sobrescrevia o grid; passou; `npm test` (18 Node + 3 Python), sintaxe, diff e preview HTML/CSS HTTP 200; sem pesquisa.
2026-10-08 — Controles de toque tinham alvos de 25–34 px; aumentei ações e direções para 40 px e cobri os limites no teste de UI; passou; `npm test` (18 Node + 3 Python), sintaxe, diff e preview HTML/CSS HTTP 200; sem pesquisa.
2026-10-08 — Com 2 galhos e 1 pedra perto de outro recurso, o objetivo ainda mandava coletar e escondia a fogueira; priorizei a ação pronta; reprodução confirmou o texto antigo e o teste novo passou; `npm test` (19 Node + 3 Python), sintaxe JS e `git diff --check`; sem pesquisa.
2026-10-08 — O objetivo ensinava E/F mesmo em telas com botões de toque; troquei as instruções por verbos de ação e mantive atalhos no painel; `npm test` (19 Node + 3 Python), sintaxe e diff passaram; sem pesquisa.
2026-10-08 — Avisos longos podiam sair do canvas móvel por `white-space: nowrap`; permiti quebra e centralizei o texto; teste responsivo passou; `npm test` (21 Node + 3 Python), preview HTTP 200 e `git diff --check`; sem navegador visual nem pesquisa.
2026-10-08 — Quando recurso opcional e material da fogueira estão ambos ao alcance, o objetivo podia escolher frutinhas; priorizei galhos/pedras que ainda faltam; cenário de proximidade primeiro falhou e passou após ajuste; `npm test` (21 Node + 3 Python); sem pesquisa.
2026-10-08 — Longe dos materiais, o objetivo só mostrava totais; indiquei o material necessário mais próximo e sua direção, mantendo coleta ao alcance e fogueira pronta prioritárias; expectativa inicial da direção foi corrigida conforme o mapa; `npm test` (22 Node + 3 Python), sintaxe e diff passaram; sem pesquisa.
2026-10-08 — Frutinhas coletadas não habilitavam ação; adicionei presente para jogador a até 1,8 unidade via G/toque; ambos recebem aviso e bolsa atualizada; `npm test` (23 Node + 3 Python), sintaxe JS e `git diff --check`; sem pesquisa.
2026-10-08 — Entrada e bosque tinham motivos visuais sem relação e o som era apenas vento/drones; repeti a marca de três brasas e uma folha em roupa, materiais e molduras, acrescentei neve leve e sinos originais; `npm test` (23 Node + 3 Python), sintaxe e endpoints `/dev/` passaram; sem navegador para avaliar visual e áudio.
2026-10-08 — Com frutinha mais perto que galho necessário, objetivo, brilho e E divergiam; priorizei materiais da fogueira na coleta cliente/servidor e mantive frutinhas quando nada necessário está ao alcance; cenário e fallback passaram; `npm test` (25 Node + 3 Python), sintaxe, diff e preview local HTTP 200; sem pesquisa.
2026-10-08 — A oferta não tinha validação de persistência entre contas; testei duas bolsas salvas e reconexão de ambos; a fixture inicial usou hífen inválido no usuário e passou após corrigi-lo; teste de sala (8/8); sem pesquisa.
2026-10-08 — A assinatura estava documentada, mas sem paleta central para novas áreas; criei `game/theme.mjs`, tokens CSS equivalentes e uma regra obrigatória em `AGENTS.md`/`GAME_BRIEF.md`; `npm test` (25 Node + 3 Python), sintaxe, diff e `/dev/theme.mjs` HTTP 200 passaram; sem pesquisa nem inspeção visual.
2026-10-08 — Com materiais sobrando e uma fogueira a menos de 1,6 unidade, o objetivo mandava acender outra recusada pelo servidor; agora aponta a fogueira e a convivência local; `npm test` (28 Node + 3 Python), teste multiplayer da recusa, sintaxe/diff e preview HTTP 200 passaram; sem pesquisa.
2026-10-08 — Recursos coletados desapareciam do mundo compartilhado até reinício; programei o retorno após 45 s e a limpeza do temporizador no encerramento; teste multiplayer confirma remoção e retorno; `npm test` (28 Node + 3 Python) e preview HTTP 200 passaram; sem pesquisa.
2026-10-08 — Ao tentar coletar um nó que outro visitante acabara de levar, o aviso pedia aproximação mesmo no ponto; diferenciei recurso retirado de distância insuficiente; teste WebSocket com dois jogadores e `npm test` (29 Node + 3 Python), sintaxe/diff passaram; sem pesquisa.
2026-10-08 — Neve e sinos tinham sido interpretados como elementos permanentes quando eram referência de aconchego; removi neve e a melodia aguda, troquei por um motivo ambiente grave e espaçado e registrei a distinção no brief/AGENTS; `npm test` (29 Node + 3 Python), sintaxe e diff passaram; sem teste auditivo em navegador.
2026-10-08 — Em tablets touch de 721–1024 px o d-pad e ações ficavam ocultos pelo limite de 720 px; exibi os controles para `any-pointer: coarse` e ampliei o d-pad a 40 px; teste CSS, `npm test` (29 Node + 3 Python), preview HTTP 200, sintaxe e diff passaram; sem navegador visual; sem pesquisa.
2026-10-08 — “Sentar” transmitia o gesto, mas mantinha o avatar em pé com “z”; desenhei uma pose persistente com pernas à frente e bordado de três brasas/folha, encerrada ao andar. O primeiro teste de persistência falhou porque o snapshot ainda expirava o gesto; alinhei a publicação e a reprodução passou. Sem materiais disponíveis, o objetivo aponta frutinhas para oferta ou exploração enquanto os nós retornam. `npm test` (35 Node + 3 Python), `node --check`, diff e preview HTTP 200 passaram; sem navegador visual nem pesquisa.
2026-10-08 — O dono achou a entrada artificial e sem voz; removi “Bosque da Fonte”/“Portão de Entrada”, adotei frases calorosas de chegada a outro mundo e variação diária local por navegador; `npm test`, sintaxe e preview público passaram; fonte: feedback direto do dono.
2026-10-08 — O símbolo parecia estático e a entrada não tinha trilha variada; desenhei um emblema de fogueira pixelada com brasa, folha, luz pulsante e inseto passageiro, além de três motivos Web Audio com pausas de silêncio e controle compartilhado no login/jogo. Uma primeira suíte teve falha intermitente na coleta de conta; teste isolado e suíte completa seguinte passaram (`npm test`: 42 Node + 3 Python), junto com sintaxe, diff e página/CSS/JS públicos `/dev/`; sem audição em navegador real; fonte: pedido do dono.
2026-10-08 — Avatares remotos saltavam entre snapshots de 100 ms e visitantes surgiam sobrepostos; interpolei suas posições e distribuí spawns livres ao redor do fogo; a reprodução multiplayer falhou antes e passou após o ajuste; `npm test` (42 Node + 3 Python), sintaxe e diff passaram; sem pesquisa.
2026-10-08 — O preview dava HTTP 500 ao carregar o módulo novo, criado sem leitura para o usuário do serviço; ajustei os dois arquivos para 0644; `/interpolation.mjs` voltou a responder HTTP 200; sem pesquisa.
2026-10-08 — Setas/WASD e toque deslocavam nos eixos do mapa, em diagonal na tela; inverti a projeção isométrica e alinhei a bússola à cena; testes de direção, passo e objetivo passaram; `npm test` (45 Node + 3 Python), sintaxe e diff passaram; sem pesquisa.

2026-10-08 — A tela de entrada ainda prendia a arte panorâmica em uma moldura pesada; gerei um cenário original de ponta a ponta, integrei visitante/conta com sombra difusa e ornamentos orgânicos, e animei folhas, fogo/fagulhas/estalos, luzes e uma silhueta rara de dragão; `npm test` (45 Node + 3 Python), sintaxe, diff e endpoints públicos `/dev/` passaram; sem navegador visual/auditivo para validar o ritmo; fonte: pedido e referências visuais do dono; imagem via ImageGen integrado, `game/art/clareira-login-bg-v2.png`.

2026-10-08 — A pessoa abriu `/`, que serve somente uma página de manutenção, sem a cena do jogo; os logos de `/dev/` apontavam para essa raiz e davam a impressão de que a arte/animação não carregava. Mantive a produção em manutenção, direcionei os dois logos de volta a `/dev/` e testei o HTML entregue e os assets; `npm test` (45 Node + 3 Python), `node --check` e `git diff --check` passaram; `/dev/` e fundo serviram HTTP 200 com CSS/JS e camada animada. Fonte: relato do dono e checagem HTTP.

2026-10-08 — A arte de entrada comunicava aconchego e escala de lobby, mas o fundo e alguns efeitos vetoriais não correspondiam ao pixel art em blocos das referências; criei uma direção visual operacional e tornei-a obrigatória em `AGENTS.md`, distinguindo estilo de emoção e composição; testes de código não validam essa diferença, então registrei a troca do fundo e inspeção visual como próximo passo, sem chamar o acabamento de pronto. Fonte: comparação direta das imagens do dono com os assets atuais.
2026-10-08 — Ao cair o WebSocket, teclas mantidas continuavam ativas na simulação e podiam voltar no novo socket; limpei-as ao fechar antes da reconexão; teste de neutralização/ordem do handler e `npm test` (46 Node + 3 Python), sintaxe e diff passaram; sem pesquisa.
2026-10-08 — Ao fechar a conexão, avatares e contagem antiga continuavam visíveis; limpei os snapshots remotos e zerei a presença exibida; teste do handler e `npm test` (46 Node + 3 Python), sintaxe e diff passaram; sem pesquisa.

2026-10-08 — A revisão mostrou que a entrada tinha clima e composição corretos, mas pintura suave e chama vetorial contradiziam as referências em blocos; substituí o fundo por uma cena pixel art de clusters nítidos e a chama por dois quadros SVG `crispEdges`, alinhando luzes às casas. `npm test` (46 Node + 3 Python), `node --check`, diff e assets públicos `/dev/` passaram; falta conferência visual em navegador real e limpeza da cascata CSS. Fonte: comparação direta com as imagens do dono; arte via ImageGen integrado.
2026-10-09 — O avatar deslizava sempre de frente e gestos eram apenas símbolos; derivei quatro orientações da projeção isométrica, animei passo/braços para movimento, aceno e dança, e registrei a sequência intenção→resposta para o agente. A primeira suíte detectou oscilação numa diagonal por arredondamento; preservei a direção em empates e a suíte passou (`npm test`: 51 Node + 3 Python). `/dev/avatar.mjs` primeiro retornou 500 por permissão 0600; ajustei para 0644 e a página, cliente, módulo e CSS agora retornam 200. Ainda falta observação visual real em desktop/touch.
2026-10-09 — Duas pessoas dançavam junto ao fogo sem resposta do cenário; contei emotes ativos na roda e acrescentei três brasas e uma folha em pixels que se erguem por um instante, congeladas com movimento reduzido. Teste de regra cobre quantidade, distância, expiração e coordenadas inválidas; `npm test` (51 Node + 3 Python), `node --check` e `git diff --check` passaram; sem inspeção de navegador nem pesquisa.
2026-10-09 — A contagem já passava isolada, mas precisava confirmar o snapshot multiplayer; acrescentei uma cena WebSocket com dois visitantes e uma fogueira, que confirmou ambos dançando dentro da roda. `npm test` (52 Node + 3 Python) passou; sem navegador para inspeção visual.
2026-10-09 — Ao contornar uma árvore com ArrowDown/toque, o corpo continuava virado para baixo mesmo deslizando para leste; atualizei a pose pelo deslocamento após a colisão. Reprodução de teclado/toque, `npm test` (53 Node + 3 Python), sintaxe e preview local dos assets passaram; sem inspeção visual. Fonte: reprodução local, sem pesquisa.
2026-10-09 — Enter abria a conversa, mas enviar mantinha o foco no campo e bloqueava o movimento; retorno o foco ao canvas após envio aceito e Escape encerra sem apagar o rascunho; os dois testes falharam antes e passaram depois; `npm test` (90 Node + 3 Python), `node --check`, `git diff --check` e preview `/dev/` HTTP 200 passaram; sem pesquisa nem navegador visual.
2026-10-09 — Com um botão focado, a tecla Espaço era cancelada pelo atalho global do jogo; passei a deixar alvos interativos sob controle do navegador e mantive as teclas de movimento no canvas; regressão passou (`game/input.test.mjs`: 6/6), `npm test` (94 Node + 3 Python), sintaxe/diff e página/módulos/arte no preview HTTP 200; sem pesquisa nem navegador visual.
2026-10-09 — O limite por ponto de código cortava emoji de família no meio (terminava em `👨‍`) e o balão dividia a sequência; passei a limitar por grafema e 1.800 bytes, com o WebSocket em 4 KiB. Regressões unitária e multiplayer falharam antes e passaram depois; `npm test` (93 Node + 3 Python), sintaxe, diff e `/chat.mjs` HTTP 200 passaram. Fonte: [MDN: Intl.Segmenter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter).
2026-10-09 — Coletar até 250 ms após outro gesto iniciava o alcance, mas o cooldown não devolvia o `requestId`; reproduzi a falha e incluí retorno `cooldown` para encerrar o gesto sem brilho falso. Teste WebSocket falhou antes e passou depois; `npm test` (95 Node + 3 Python), sintaxe e diff passaram; sem pesquisa ou navegador visual.
2026-10-09 — Duas pessoas sentadas junto à fogueira não provocavam resposta do cenário; ampliei o sinal para descanso parado ou dança ativa em até 2,8 unidades, mantendo as três brasas e a folha; a regressão mudou de 0 para 2 e `npm test` (98 Node + 3 Python), WebSocket e preview local passaram; sem pesquisa, sem navegador visual.
2026-10-09 — Suspeitei que pedidos simultâneos criassem fogueiras sobrepostas; aproximei duas contas a menos de 1,6 unidade e enviei ambos ao mesmo tempo, mas a sala criou uma e recusou a outra; mantive o cenário como regressão WebSocket; `npm test` passou (99 Node + 3 Python); sem mudança de servidor, pesquisa ou navegador visual.
2026-10-09 — O selo de oferta sobre o avatar mandava usar G mesmo com controles de toque; troquei por “OFERECER FRUTINHA”, mantendo o alvo compartilhado e as três brasas/folha; a regressão falhou antes e passou depois; `npm test` (99 Node + 3 Python), sintaxe, diff e preview HTTP 200 passaram; sem pesquisa; navegador visual indisponível.
2026-10-09 — Na queda do WebSocket, o último objetivo e os recursos/fogueiras compartilhados continuavam parecendo ativos; reproduzi a lacuna no teste de fechamento e passei a limpar o snapshot e aguardar um novo estado antes de reativar o objetivo. `npm test` (101 Node + 3 Python), sintaxe/diff e preview local de página/JS/módulos HTTP 200 passaram; sem navegador para queda real; sem pesquisa.
2026-10-09 — Bater de frente numa árvore não mostrava contato e o letreiro de coleta mandava “E PEGAR” também no toque; reproduzi ambos, acrescentei uma resposta pixelada por contato e troquei o convite para “COLETAR”, com três brasas e folha no letreiro. As duas regressões falharam antes e passaram depois; `npm test` (106 Node + 3 Python), sintaxe/diff e preview local da página, cliente, módulo, tema e arte-base (HTTP 200) passaram; sem pesquisa. Inspeção visual desktop/celular pendente: não há navegador neste ambiente.
2026-10-09 — O dono apontou oito microeventos para dar vida à vila da entrada; acrescentei movimentos raros localizados para dragão, raposa, coelho, peixe, músico, bandeira, fumaça e luz do castelo, com o músico respondendo apenas à trilha opt-in. Mantive a imagem intacta, pausas longas, pausa por aba oculta e redução de movimento; `npm test` (106 Node + 3 Python), SVG/XML, sintaxe JS, diff e `/dev/` HTTP 200 passaram. Sem navegador local para inspeção visual; conferir alinhamento/ritmo no navegador do dono.
2026-10-09 — A cena da entrada ficava vazia porque cinco módulos importados pelo cliente estavam sem leitura para `www-data` (HTTP 500) e o CSS mantinha a imagem escondida até o JavaScript revelar a cena; corrigi as permissões, deixei a arte principal visível desde o primeiro quadro e removi o desfoque/zoom de entrada. Acrescentei testes dos imports via HTTP e da leitura dos módulos; `npm test` (106 Node + 3 Python), `node --check`, diff e rota pública `/dev/` (imagem e 14 módulos HTTP 200) passaram. Sem navegador local para validação visual; pedir atualização forçada e conferir a cena no navegador do dono.
2026-10-09 — A marca da entrada e do jogo repetia a chama e os troncos da fogueira; criei um símbolo pixelado de trilha, folha e três brasas nas cores de `game/theme.mjs`, cobrindo o ícone antigo via CSS. A regressão falhou antes e passou depois; `npm test` (107 Node + 3 Python), sintaxe, XML, diff e `/dev/art/clareira-mark.svg` (HTTP 200, `image/svg+xml`, `nosniff`) passaram. Sem pesquisa; navegador indisponível para desktop/celular.
2026-10-09 — O dono rejeitou os símbolos móveis sobrepostos e pediu que a própria vila se movesse em vídeo; substituí o SVG por 1.800 quadros compostos da arte fonte, com oito eventos alinhados à cena, VP9 a 60 fps por 30 s, sem áudio embutido. O WebM fechou em 11,59 MiB e o poster em 565 KB; a entrada adia o filme, mantém poster/fallback e respeita movimento reduzido, economia de dados, rede lenta, aba oculta e jogo aberto. `npm test` (108 Node + 3 Python), sintaxe, diff, inspeção dos quadros extraídos e `/dev/` HTTP 200/Range 206 passaram; a raiz continua manutenção. Sem navegador real para validar a tela renderizada.
2026-10-09 — Ao sentar perto da fogueira, o avatar podia ficar de costas por conservar o rumo da última caminhada; passei a orientá-lo para o fogo próximo no mesmo raio da resposta social, sem mudar a paleta ou repetir a marca (o cachecol bordado continua sendo a assinatura). A regressão falhou antes e passou depois; `npm test` (108 Node + 3 Python), sintaxe/diff e preview local da página, cliente, avatar, regra social, tema e arte-base (HTTP 200) passaram. A referência da fogueira sugere convivência em círculo; sem pesquisa; inspeção visual em desktop/celular pendente por falta de navegador.

- 2026-10-09: o vídeo de fundo não carregou de modo confiável e deixou a entrada pesada; voltei à vila WebP estática de 565 KB, em carregamento antecipado, e retirei as referências de vídeo do HTML. O preview público respondeu 200; regressão garante ausência de `<video>`/loader; `npm test` passou (108 Node + 3 Python). A paisagem fica parada por padrão até o dono pedir movimento outra vez.

2026-10-09 — Revisão manual ampliou mundo/arte e removeu snaps de rede: passos numerados e cenário nos pacotes evitam replay duplicado e movimento antigo após porta. Saída deve ficar fora do volume do abrigo.
2026-10-09 — Chromium funciona; roteiro scripts/browser-world-check.mjs valida ação real em desktop/celular/320 px e atraso de conexão. Nesse runtime, espera com predicado async retorna cedo: importe o módulo uma vez e espere condição síncrona.
2026-10-09 — Suíte completa 114 Node + 10 Python passou. HUD móvel deixa avatar livre; próximos ciclos devem colocar/remover objetos no quarto vazio, depois girar/salvar/visitar, preservando cena e login.
2026-10-09 — Desenho em cache reduziu o trabalho repetido; perfil mediano 2,2 ms/p95 14,2 ms de CPU, mas quadros do Chromium sem GPU tiveram picos. Não confundir teste de código, screenshot e FPS em dispositivo real.

2026-10-10 — O dono reproduziu tremedeira e retorno à chegada no computador (teclado/clique), apesar de smoke curto aprovado. Timer fixo consumia só 3 passos por callback; atraso acumulava fila e cliente fechava conexão ao ultrapassar 180 pendentes. Usar tempo monotônico fracionário, previsão limitada sem desconectar e restauração curta da sessão.
2026-10-10 — Snapshot concordante não precisa resetar o par interpolado; câmera deve deslocar toda a cena na mesma grade. Script mede cada quadro desenhado, idle prolongado, teclado/clique e reconexão; passos visíveis não retrocederam nos quatro cenários testados.
2026-10-10 — O dono enviou exemplos de avatar, vegetação, vila, materiais, céu e luz com qualidade superior à cena atual. Referências preservadas em references/visual-20261010/ e ART_DIRECTION.md; quantidade/ruído não substituem volume, perspectiva, proporção e iluminação.

2026-10-10 — Inversão de rosto era real: regra de empate diagonal conservava rumos opostos (8/16 combinações), e a mesma diagonal alternava perfil/nuca conforme histórico. Perfil lateral agora segue o sinal horizontal; frente/costas seguem deslocamento vertical.
2026-10-10 — O rosto antigo tinha problemas de perfil e pivô. Esse renderer foi aposentado em 2026-10-11; os rostos e perfis atuais pertencem aos quadros do atlas, sem desenho sobreposto.

- O dono exige oito orientações, não quatro perfis escolhidos por diagonal: classificar oito setores na projeção de tela e desenhar diagonais de frente/costas distintas. Soltar uma combinação pode produzir um último passo com uma tecla; avaliar a direção parada depois de os comandos assentarem.

- Alturas precisam orientar física, desenho e busca de caminho juntos. Raycast descendente resolve clique na rampa sobreposta à projeção do chão. Subir/descer quarto e bosque manteve acordo cliente/servidor; pontos das paredes eram acabamento horizontal fora de perspectiva.

- Avatar maior revelou nomes sobre outros rostos: etiquetas precisam de espaço acima de todas as cabeças próximas. Animação por distância evita marchar contra obstáculos; sombra, luz e material devem acompanhar a superfície. Na verificação de rumo, comparar o último passo simulado: um quadro pode acumular segmentos diferentes ao virar por clique.

- O dono rejeitou patamar externo de teste e excesso de itens: não confundir demonstração técnica com ambiente final. Nova fogueira deve mudar a iluminação local e a fonte das sombras próximas, sem mover globalmente todas as sombras. Noite distante usa leitura mínima da lua.

- Movimento novo exige replicar vx/vy/z/vz e jumpHeld para previsão idêntica; não repetir só x/y. Saltos precisam elevar nomes/balões junto ao corpo, mantendo a sombra no piso.
- Correr/agachar por comandos numerados, com frenagem curta e colisão horizontal preservada; pulo não habilita atravessar paredes. Pose usa tempo real para funcionar com movimento reduzido.

- Aparência validada e armazenada separadamente por conta; nunca aceitar URLs/cores/caminhos arbitrários do cliente. Corpo e itens usam os mesmos joints e âncora dos pés.
- Poses limitadas a 50 ms de renderização se atrasavam em FPS baixo; usar o tempo real, com pesos limitados ao destino, sem mudar o passo fixo de física.
- Mudança de tons em grandes patches de parede parecia checkerboard: manter planos contínuos e marcar só vigas/base.
- Terrain natural precisa liberar a rampa/degraus de árvores e compartilhar altura com ray casting, recursos e servidor.

- Perfil local mostrou objetos/texturas da casa como maior custo de desenho; rasterizar uma vez e compor reduz trabalho mantendo sombras/chamas separadas.
- Coleções em pacotes parciais precisam distinguir campo ausente de []: limpar os dois casos faria recursos e móveis sumirem a cada sincronização.

- O dono rejeitou escada/rampa fabricada na natureza: referência de relevo não autoriza copiar acessos construídos sem contexto.
- Parede ligando alturas dos dois extremos fez uma diagonal errada: dividir no desnível; detalhes de fachada precisam seguir o plano da parede.
- A* verificava só nós: trecho entre dois nós livres cruzava árvore e prendia o jogador. Checar trechos e consultar árvores por células mantém segurança sem varrer o bosque inteiro.
- Conteúdo novo segue catálogo/manifesto por cena; metadados planejados não ativam renderers, IA ou colisões automaticamente. Validar presença/tamanho dos assets antes de entregar.
- Snapshots podem mostrar mudanças antes de terminar o save: encerramento deve aguardar gravações; reconexão curta de conta deve preservar o inventário autoritativo recente.

- Gesto com variável removida interrompia requestAnimationFrame: verificar ações com pageerror e avanço do relógio de animação no navegador.
- Postura sentada deve ser independente do gesto; comandos anteriores ao sentar não podem cancelá-la, mas devem manter confirmações normais de previsão.
- Obstáculos colocados precisam participar de servidor, previsão, reconciliação e rota; permitir saída do criador sem aceitar destino dentro do fogo. Tronco longo precisa profundidade por faixa, reutilizando a mesma imagem em cache.

- Login e viagem usam contextos visuais distintos no mesmo bloqueio de prontidão; animação indica atividade, etapas vêm de estado real. Não acrescentar porcentagens fictícias nem tempo mínimo. Referências: docs/content/loading-design.md.

- Import público com modo 0600 gerou HTTP 500 antes de main iniciar: conferir permissões 0644 após editar módulos/arte e testar pelo domínio real (servidor local root mascara o erro). Bootstrap independente oferece recarregar se o grafo de imports falhar.
- Capture estados animados com `requestAnimationFrame` e uma amostra curta do canvas; screenshots grandes no Chromium sem GPU podem bloquear tempo suficiente para saltar vários quadros.

- Exigência de igualdade pixel a pixel precisa usar o asset fonte e registrar comparação: não certificar vistas/ações que o material recebido não contém. A pose 20×66 da camiseta preta conserva os 217.856 pixels fornecidos; um rig procedural não representa essa pose.

- Gerador raster pode repetir apoio da mesma perna apesar de pedir ciclo alternado; inspecionar poses reais e marcar estudo, sem certificar fluidez.
- Grades geradas podem ter sete poses para oito solicitadas e figuras passando da célula; localizar separadores transparentes antes de recortar.

- Prancha aprovada vira atlas RGBA lossless com pivô comum; baixar toda a sequência para a mesma altura evita personagem crescer entre andar/correr/sentar.
- Não reutilizar caminhada SE para personagem voltado norte: conservar vista correta e registrar sentidos ainda sem quadros; atlas crítico precisa impedir entrada antes de decode.

- Movimento diagonal completo exige vista e ciclo de passada próprios; deslocar a pose idle só no eixo vertical não parece caminhar.
- Uma única fonte de desenho impede trocas de corpo no meio do movimento. Aparência v3 mantém apenas a variante de sprite e descarta escolhas antigas de roupa/porte; não adicionar outro renderer para compensar clipes ausentes. Use quadros do atlas até as sequências desenhadas ficarem prontas.

- Pacotes compactos de movimento precisam manter dimensionId; omitir esse campo fazia o cliente alternar para a superfície e recarregar geometria.
- Cada dimensão exige obstáculos, terreno e caches próprios; índices imutáveis reutilizados por definição evitam reconstrução na simulação de jogadores de mundos diferentes.
- Paletas por material e iluminação por tema preservam a cor dos personagens e fogueiras; filtro global de matiz alterava ambos.

- Antes de salvar terreno, planejar destinos fora de todas as áreas alteradas; uma busca fixa de 32 tiles não retirava ocupantes de lagos com raio 48.
- Histórico local deve registrar inclusões e cancelamentos de objetos no rascunho; limitar só a lista de inclusões produz um Ctrl+Z incoerente.

- Descartar obstáculos pela distância antes de consultar água/densidade reduz o custo sem mudar o raio de colisão; fauna multiplica esse custo a cada tick.
- Recursos estáticos podem compartilhar sprites por tipo/quantidade/escala em cache limitado; destaque de coleta permanece dinâmico. Medir separadamente tempo de desenho e intervalo entre quadros.
- Não publicar a imagem parcial de um chunk de terreno: conservar a última versão completa durante revisões, substituir apenas ao concluir e limpar a referência ao trocar de mundo. Regressão deve conferir pixels durante a fila, não apenas depois do carregamento.

- Altura da porta/janela deve ser absoluta; fração da parede faz o hotel ter janelas gigantes. Cache do prédio precisa incluir a altura da cumeeira.
- Hospedagens precisam aplicar os mesmos anchors estáticos e de avatar da recepção; só aumentar parede evidencia personagens cortados diante da fachada.
- Pontos de atendimento precisam compartilhar alcance, lado de aproximação, obstáculos e capacidades com o servidor; esconder opções em um prédio não impede transações pelo protocolo.
- Um checkpoint de posição pode não incluir inventário: retome a mochila do perfil quando não existir inventário autoritativo recente na sessão.

- Preparar só idle faz personagens PNG deslizarem até a primeira caminhada baixar; aguardar decode das ações de locomoção antes de liberar a cena.
- Fauna precisa de timestamps da simulação e playhead próprio: horário de chegada comprime lotes; retomar todo o atraso de uma vez ainda causa salto mesmo com timestamps corretos.
- Sono precisa distinguir voltar ao abrigo de dormir: zerar velocidade antes de chegar deixa a fauna parada no meio do mapa. Limpar a marca de recolhido ao despertar por perigo.
- Fauna exige habitat e abrigo válidos antes do spawn, teto familiar sobre a população inteira e zona segura também no movimento; reduzir só o número não impede invasão da vila. Evitar colisões de animais dormindo e consultas duplicadas no mesmo passo.
- Um abrigo precisa de uma cobertura natural identificada, posição fora da trilha e composição por profundidade; um desenho isolado no chão não é um ninho protegido.
- Sono dentro do abrigo deve preservar a proteção quando uma ameaça passa por fora; acordar e sair automaticamente tornava a cobertura inútil.

- Snapshots agrupados por cenário precisam separar permissões, propriedade e chaves por destinatário; reutilizar o primeiro jogador mistura contas e impede aplicar revogações.
- Porta privada valida chave persistida também na retomada; visitas genéricas e saves antigos de recepção não podem contornar a fechadura.

- Base física e desenho dos móveis precisam compartilhar largura/profundidade; altura deve ser independente do tamanho do sprite.
- Janela livre em planta ainda pode ser escondida pela projeção de um armário: comparar também os volumes projetados antes de escolher o vão.
- Cache de piso/paredes precisa identificar a planta; um cache único deixa o quarto aparecendo no retorno à recepção.
- Rotação de móvel acontece nos eixos do chão; girar o bitmap da tela deita o objeto. Tapetes precisam ficar no mesmo nível, sem atravessar degraus.

- Converter os JSON atuais exige preservar papel administrativo, carteira separada, aparência v4, slots/posição, hospedagens/chaves e mapas/fogueiras por dimensão; importar só contas/móveis perde progresso.
- Uma mochila SQL sem pilhas ainda precisa de metadados para distinguir vazio explícito de save legado; não recriar a faca inicial ao retomar esse estado.
- Na troca do preview, drenar escritas com reinício/barreira, copiar os JSON e conferir uma restauração real antes de liberar o PostgreSQL. Redis mantém presença temporária, não a simulação compartilhada.
- 2026-10-24 — Recuperação de posição deve consultar o mesmo colisor de paredes/pilares da caminhada: limitar ao interior do prédio deixa saves presos na nova folga externa. Portas externas são pontos de interação; coleta filtra alcance antes de traçar visibilidade. Regressões: 49/49; suíte: 323 Node + 32 Python, com PostgreSQL/Redis. Roteiros de clique devem usar a projeção real e reconhecer saída automática para não reentrar por E.

- Janela e emissor precisam vir do mesmo vão; recortes noturnos devem excluir cada telhado à frente, inclusive suas sobreposições.
- Ao sair de um assento, testar a diagonal completa antes dos eixos evita prender o ator entre cadeira e luminária próximas.
- Estados de uso (como interruptor) precisam persistir nos dois adaptadores e na importação, não apenas no save JSON.
- Layouts de quarto vêm do catálogo de objetos em runtime; ajustar só as plantas embutidas deixa a porta antiga ativa. Migre os registros antigos com revisão/validação e teste o percurso nos dois sentidos; não sobrescreva posições autoradas ao resolver o catálogo.
- Em bancos redondos, geometria quase simétrica esconde o giro; uma marca direcional no tampo e destaque do móvel selecionado tornam orientação e mudança legíveis.

- Objetos de cena: PostgreSQL controla revisão e histórico; Redis usa chaves por base/revisão. A cópia desloca somente a base externa, mantendo interiores locais e sem copiar propriedade/chaves de contas.
- Luz projetada no chão deve ficar abaixo de atores e móveis opacos; sobrepor o lightmap após as entidades cria cadeiras e tapetes que parecem placas transparentes.
- Os limites do clique precisam incluir o mesmo patamar aceito pela física; enquadrar a planta completa evita perder a saída quando a câmera acompanha o avatar.
- Ação contextual deve usar o alvo exato e processar movimento pendente antes da validação do servidor; persistir a transferência junto ao evento mantém inventário e diário coerentes.
- 2026-10-24 — Em snapshots parciais, campo de móveis ausente significa manter móveis e transições; somente uma lista vazia deve limpar a sala.
- 2026-10-24 — A navegação por toque pode reutilizar o caminho por clique do Canvas; menus recolhíveis liberam o cenário e precisam cancelar a caminhada pendente. Não bloquear seleção nos campos de escrita.
- Expansão do mundo: preservar origem da água e coordenadas salvas; reservar outra faixa de IDs quando o grid de árvores ultrapassar 512 colunas, e limitar a resolução do mapa geral.
- Objetos fixos e decoráveis devem compartilhar o modelo físico: colisor de base para navegação, footprint visual para posicionamento e profundidade pelo canto frontal/altura de apoio; não simular gravidade em mobília ancorada.

- 2026-10-24 — Mochila omitida dos deltas compactos esperava o refresh de 5 s. Enviar estado pessoal/ACK, prever operações ordenadas e reaplicar somente pendentes evita atraso e trocas duplicadas; precondições de slots protegem dependências rejeitadas. Fila de movimento cheia precisa recuperar conexão; colisores sobrepostos devem permitir afastamento. Evidências: logs/gameplay-response/.
- Transições de quarto: congelar o último quadro, cobrir a troca autoritativa e revelar somente após o primeiro quadro pronto; cancelar o fade na reconexão ou erro evita esconder a recuperação.
- 2026-10-24 — O preview marcava arquivos como `no-store`; ETag/revalidação reaproveita código e arte e fontes/pranchas sem uso deixam de ser públicas. Snapshots compactos atrasavam metadados de jogadores novos até o refresh; enviar perfil só quando muda e aquecer idle/caminhada/corrida corrige a primeira aparição. Verificação: sintaxe; testes e HTTP não executados; sem pesquisa.
- Limite do mundo ampliado: não recuar a colisão para desenhar uma faixa de saída, pois conteúdo antigo pode estar encostado na borda. Mantenha a parede na coordenada-limite e projete o piso branco para fora do mapa. Para a ruína, desenhe faces quadradas sem extrusão, preserve três fileiras e aumente as lacunas e o deslocamento a cada fileira.

- 2026-10-24 — Bloquear todo keydown sobre botões/resumos prende WASD sem parar o cenário. Preservar texto/Space nativo, retomar o Canvas ao escolher movimento e liberar pelo código físico. Testes que forçam foco no mundo mascaram o defeito. Foco de slot não deve reconstruir a grade entre pointerdown e click; atualizar só seleção/detalhes. Evidências: logs/movement-deep/.

- Teleporte público deve ser um evento temporário no snapshot de cada dimensão, cronometrado por `performance.now()` do servidor; transferir na cobertura e ocultar o avatar até o ápice do destino mantém os dois lados alinhados.
- Carregar as folhas por camadas no pacote transitório depois da cena ficar pronta mantém a entrada leve e deixa o botão de viagem bloqueado até o decode; reconstruir uma spritesheet malformada a partir dos quadros preserva a transparência.

- Para calibrar o teleporte, inspecionar o GIF quadro a quadro: 30 quadros a 90 ms, ápice sustentado nos quadros 12–21. Ajustar as dimensões das três camadas contra o ápice de referência e multiplicar pela escala do sprite do jogo.

- Para preservar profundidade, não desenhar uma captura congelada do mundo com o portal por cima: deixar o renderizador normal desenhar círculo inferior atrás das entidades e manter a sobreposição escondida até o ápice; então usar tela preta e só revelar quando cena e ápice de chegada estiverem prontos.
- Ao tocar OGG por evento sincronizado, não descartar a única tentativa se decode ainda está em andamento; aguardar buffers antes de iniciar e conferir também o ganho do barramento, não só o ganho de cada faixa.

- O tema `dark` aplica máscara noturna de 98%; um portal desenhado antes de `drawNight()` praticamente some. Inclua luz transitória no recorte da máscara e desenhe raio/selo depois da máscara; deixe o círculo inferior no passe profundo para árvores e construções continuarem na frente.

- Durante teleporte, não liberar título após poucos milissegundos: manter nome do destino sobre a tela preta até a cena de chegada estar pronta e aplicar o fade junto da revelação. Impedir reload automático e ignorar callbacks de prontidão da dimensão de origem.

- Duplicar amostragem de 30 para 60 quadros exige manter 2,7 s, usar 45 ms, grade 10x6, reter quadros de ápice/redução de movimento equivalentes e versionar URLs; timestamps do servidor e áudio ficam no tempo original. Preferir PNGs individuais quando o spritesheet da fonte estiver truncado.
- 2026-10-24 — Oferta de mercadoria precisa ser o estoque comprável do balcão/loja, não mochilas privadas. A venda NPC transfere o item para `economy_market_stock` junto da carteira e imposto; `stock_ratio` é testado antes/depois com 400 unidades privadas.

- 2026-10-25 — Tela de imposto só deve aparecer para liderança cadastrada ou admin; autorizar no servidor via perfil/conta e versionar a política em transação, sem confiar no papel enviado pelo cliente.

- 2026-10-25 — Tesouro e reserva bancária são saldos guardados, circulação é moeda spendável; a cotação macro deve usar só carteiras/depositos à vista. Crédito entra na circulação no desembolso, dívida fica em métrica separada.

- 2026-10-25 — PIB por produção subtrai apenas insumo intermediário; salário é parte do valor adicionado. Exportações/importações medem fluxos e saldo comercial, não moeda criada; circulação local exige regra explícita de domicílio da carteira.

- 2026-10-25 — Centralização do mapa deve substituir pan anterior, não somá-lo; teste real desktop/celular encontrou waypoint em coordenadas válidas e rota ao Abrigo com 18 pontos. Ver logs/20261025-world-map/.

- 2026-10-25 — O mapa de 48×48 chunks rasterizado em 8 px por chunk reduz redesenhos a um drawImage; cache mantém duas variantes de água e clusters espaciais permitem ampliar pontos próximos sem sobrepor ícones. Evidência: logs/20261025-world-map/.

- 2026-10-25 — O minimapa ancorado à esquerda do desktop fica sob o menu lateral; manter no topo à direita em desktop e celular. A porcentagem deve usar <1% para descobertas reais menores que 1%, nunca 0%. Evidência: logs/minimap-check-20261025/.

- 2026-10-25 — Mapa touch: ao iniciar pinça guardar coordenada do mundo sob o ponto médio; no pointerup da segunda ponta, recomeçar o arraste restante com moved=true para não criar waypoint. Verificar pinça e soltura parcial no Chromium móvel. Evidência: logs/minimap-check-20261025/pinch-check.json.

- 2026-10-26 — Cama: UV controla textura, não oclusão. Cabeceira em u=0 precisa pintar depois do enxoval nas rotações 2/3, inclusive na camada sobre o avatar. Não inverter eixos para disfarçar sobreposição.
- 2026-10-26 — Limite isométrico: lados cobrem só uma coordenada exterior; cada quina precisa da malha fora dos dois eixos. Desenhar clarões e cortina antes do piso deixa a luz atravessar lacunas sem lavar as faces inteiras.
- 2026-10-26 — Para estrelas sob piso quebrado, semeie posição no intervalo externo e desenhe os pontos antes das peças: o piso os mascara nas faces e os revela pelos vãos. Relógios individuais evitam piscadas sincronizadas; movimento reduzido congela deslocamento e pulso.
- 2026-10-27 — Consultas de autorização que percorrem cargos herdados precisam de SELECT em `staff_role_inheritance` para o usuário PostgreSQL do runtime; cobertura de SQL textual sozinha não substitui a resolução real no banco.
- 2026-10-27 — Verifique backfill de cargos legados aplicando a migração em banco descartável separado; outros arquivos de teste podem aplicar todas as migrações primeiro, mesmo quando a ordem de argumentos parece indicar o contrário.
- 2026-10-27 — O bootstrap pode criar o papel runtime após as migrations; reaplique seus privilégios de funções depois de criar o papel e teste revogando grants anteriores antes do helper.

- 2026-10-27 — Assets de áudio podem terminar depois da criação do AudioContext: decodificar também no callback de chegada do arquivo. Testar contexto ativo e reprodução no impacto detecta o arquivo carregado que nunca recebeu buffer.
- 2026-10-27 — Arte Blender: descarte o eixo dominante da normal ao mapear UV por face; bevel deve ser menor que a espessura. Exporte pilares/alpendre em camadas e teste o mesmo anchor do runtime: promover ator ao canto distante da casa elimina a oclusão dos pilares.
- 2026-10-28 — Em cenas cheias, reutilize sprites pelo conjunto de PNGs (não pela paleta do avatar), cacheie composições imutáveis com limite e serializa snapshot rico somente quando metadados mudarem; assim, reduzir trabalho sem enfraquecer autoridade ou rede.
- 2026-10-28 — Zoom externo deve aquecer a área desejada mantendo a escala atual desenhada. Limitar células muito abaixo do orçamento disponível prolonga a retenção do mundo; tempo e quantidade precisam limitar a mesma fila.
- 2026-10-28 — LRU de assets concluídos e deduplicação dos pendentes são estados separados. O catálogo compartilhado precisa caber no orçamento declarado; teste de segunda viagem deve exigir zero novas decodificações.
- 2026-10-28 — ACK de chegada exige quadro desenhado completo, não apenas sceneReady=true. Mapas/entornos preparam lotes com restauração do contexto de dimensão entre fatias; terreno reutiliza chave geométrica com um limite global de memória.
- 2026-10-28 — Telemetria de sessão deve usar janelas ativas e amostras limitadas; resets de `visibilitychange` evitam converter suspensão de aba em falso stall. Relate pedido→confirmação separado da transição→primeiro quadro.

- 2026-10-29 — Em toque, o opener de um diálogo pode ser body; restaurar foco exige origem visível e tabIndex >= 0, com fallback para o mundo. Separar cabeçalho/conteúdo rolável mantém Fechar acessível em históricos longos. Evidência: logs/20261029-tools-ui/.
- 2026-10-29 — Amostrar 1/10 dos quadros pode perder um pico: o trace atribuiu 1,27 s à iluminação num quadro de 1,36 s. Mapas de luz agora enfileiram células com orçamento; sua chave exclui progresso/cooldown que não alteram a geometria.
- 2026-10-29 — `send()` não é ACK. Ao retomar, reenfileire passos sem confirmação, deduplique no servidor e reinicie a pressão; não derrube um socket novo antes de seu primeiro snapshot completo.
- 2026-10-29 — Colisão em célula fria não deve gerar árvores/recursos do chunk inteiro. Reutilize a geometria preparada por consulta sem geração ou teste só candidatos próximos com o mesmo predicado visual; conferir seeds, água, bordas e remoções.

- Comércio (29/10): preserve preço de anúncio e renovação em snapshots; limite quantidade ao estoque e 50; invalide revisão se a cotação mudar. Testes de toque devem esperar loading concluído e consultar a descrição acessível do botão Usar, além de abrir o menu móvel antes de Aparência. Vídeo decorativo novo também deve ficar fora do pacote inicial verificado.

- Login film (29/10): para a emenda de pintura detalhada, QP constante e mesma razão I/P/B reduziram a diferença média decodificada para 0,995/255; CRF/AQ mudavam a textura entre início e fim. Verificar o arquivo real, além de igualdade do compositor; frames com hash permitem retomar a renderização.

- 2026-10-29 — Mapas locais: limite por área, não por largura isolada; o recorte móvel de 368×226 em zoom 32 excedia 320 células e perdia toda a camada detalhada. Validar `data-detail=ready` após dois RAFs, além de olhar a captura.
- 2026-10-29 — Dados preparados pelo minimapa não significam vista completa inicializada. Separar chaves de dados/vista e preservar o ponto central ao redimensionar; limitar centralização às bordas evita faixas vazias grandes.

- Comércio/admin (29/10): quantidade inválida deve ser recusada pelo servidor, nunca convertida silenciosamente; mudar alvo/dados/permissão invalida a revisão. Expulsão deriva prazo de 30 s no PostgreSQL, embora o cliente envie expiresAt=null. Não repetir mutações após timeout; fechamento/reabertura precisa limpar dados e liberar controles ao finalizar. Testes de ações rápidas avançam o relógio injetado além do cooldown, sem sleeps.

- 2026-10-30 — Mapa progressivo: blocos alinhados e cache por dimensão/geometria permitem conservar o detalhe durante arrastes; cancelar trabalho fora da janela evita atrasar a região atual. Copas podem cruzar limites de bloco; outros elementos compartilhados precisam de recorte.
