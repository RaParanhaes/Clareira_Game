# Auditoria e plano do sistema de carregamento

## Escopo do inventário

Revisei o overlay `#scene-loading`, a entrada/conta, a conexão WebSocket, a prontidão do cenário, a recuperação do bootstrap e as esperas de assets que podem atrasar a primeira imagem jogável.

## Mapa constatado antes da execução

| Superfície/estado | Onde começa | O que espera | Por que existe | Problema encontrado |
|---|---|---|---|---|
| Bootstrap inicial | `game/index.html` exibe `#scene-loading`; `game/bootstrap.mjs` importa `main.js` | Grafo de módulos do cliente | Impede mostrar uma tela incompleta antes de o cliente iniciar | Após 20 s mostra `Tentar novamente`; só um clique recarrega a página. Não distingue lentidão de falha permanente. |
| Verificação da sessão | `restoreSession()` em `game/main.js` | `/dev/auth/me` | Decide entre retomar a sessão e mostrar login | Uma falha encerra a espera e exige clique em `Tentar novamente`; não há nova tentativa automática. |
| Arte da entrada | `prepareLoginIllustration()` / `revealLoginScreen()` | Decode da ilustração WebP, com limite de 15 s | Evita mostrar a arte antes do decode | A imagem é opcional, mas bloqueia o formulário; o loader espera duas vezes e não mede seu progresso. |
| Envio de login/cadastro/visitante | `sendAuthForm()` | Resposta HTTP de autenticação | Mostra que a ação solicitada está em andamento e evita duplo envio | Estado local do botão e `auth-status`; é específico da ação e não duplica o overlay global. Manter. |
| Entrada no mundo | `enterGame()` → `connect()` → snapshot inicial | WebSocket, jogador com aparência e coleções iniciais completas, assets, previsão e primeiro desenho | Evita revelar placeholders ou avatar fora de posição | `enterGame()` e `connect()` iniciam o mesmo overlay em sequência. A faixa de 35% é animada, não representa progresso real. |
| Preparação do cenário | `prepareSceneAssets()` e `preloadClearingWorld()` | Fontes, pacotes da cena/dimensão, terreno/chunks visíveis e PNGs do avatar | Prepara o primeiro quadro sem buracos | Não informa unidades concluídas. `preloadAvatarSprites()` espera todas as ações antes de entrar, mesmo podendo desenhar idle e carregar outras ações depois. |
| Troca de local/dimensão | Handler do snapshot chama `beginSceneLoading()` | Mesmo conjunto de assets e primeiro quadro do destino | Não mostrar o local anterior com dados do novo destino | Usa corretamente o mesmo overlay, mas sem progresso detalhado. Manter. |
| Reconexão | `close` do WebSocket agenda `connect()` com atraso crescente | Nova conexão e snapshot completo | Preserva entrada automática após queda | Já tenta novamente sozinha, mas o timer de 15 s exibe um botão de retry que reinicia a conexão manualmente. Redundante. |
| Falha de asset/prontidão | Rejeição de `prepareSceneAssets()` | Dependência obrigatória da cena | Evita entrar sem recurso crítico | Mostra erro genérico e exige clique; a tentativa não informa qual etapa está tentando de novo. |
| Atualização do jogo | `update-monitor.mjs` | Versão estável e momento seguro para recarregar | Evita atualizar enquanto a pessoa se move ou edita | Não tem tela própria; ao recarregar reutiliza o bootstrap e a tela global. Não criar uma terceira tela. |
| Prévia de aparência | `preloadAvatarSprites()` acionado pelo renderer | Atlases de ações durante a prévia | Atualiza a prévia quando os quadros ficam prontos | É carregamento assíncrono local, não precisa bloquear jogo nem abrir overlay. Manter independente. |

## Revisão de login e carregamento — 27/10/2026

- A ilustração WebP em tela cheia permanece no HTML. O manifesto verificado a exclui, e o navegador a solicita em paralelo com o bootstrap para que seu download/decode não segure o formulário.
- Removida a espera artificial de um segundo ao liberar o login depois da resposta final de sessão. A entrada do mundo mantém sua conclusão visual de 100% conforme o contrato acima.
- O loader inicial conserva marca, progresso total, etapa ativa, quatro fases e redução de movimento. Essas fases não são copiadas para a reconexão/transição de cena.
- `scripts/browser-login-loading-check.mjs` valida desktop, celular, movimento reduzido, retry de sessão, formulário visível enquanto a imagem está deliberadamente retida e liberação sem a espera de um segundo após a resposta final. Usa um manifesto pequeno com hashes reais para exercitar o carregador sem baixar o pacote inteiro em cada viewport. `scripts/validate-content.mjs` falha se a imagem voltar ao manifesto bloqueante ou sair do HTML.

## Redundâncias e causas encontradas antes do plano

1. `enterGame()` chama `beginSceneLoading()` e chama `connect()`, que chama o mesmo método de novo. O segundo início apaga o texto/tempo do primeiro.
2. A ilustração é declarada opcional no catálogo, mas o formulário aguarda seu decode ou timeout.
3. O personagem aguarda atlases de ações além do idle, embora o renderer possa usar idle/Canvas até cada ação chegar.
4. A conexão já tem reconexão exponencial; o botão no overlay é um segundo mecanismo para a mesma falha.
5. Bootstrap, sessão e cenário usam retries diferentes e textos diferentes, sem uma regra comum de tentativa ou limite.
6. O indicador visual atual anima uma faixa fixa em 35%; não há percentual nem contagem das unidades concluídas.

## Plano de execução

1. **Medir o trabalho real.** Exibir estado indeterminado enquanto servidor/sessão ainda não têm um total conhecido. Depois do snapshot, calcular progresso a partir de tarefas contáveis: assets da cena, imagens do grupo idle, chunks de mundo/terreno, fontes e primeiro quadro. Não transformar tempo decorrido em porcentagem.
2. **Remover bloqueios opcionais.** Revelar o login sem aguardar a ilustração; carregar a arte no fundo. A entrada no mundo aguarda apenas o grupo idle obrigatório; atlas de outras ações carregam sob demanda.
3. **Unificar os inícios.** Um único `beginSceneLoading()` por conexão/viagem, mantendo a mesma tela para login, mundo, dimensão e reconexão.
4. **Recuperar sem ação obrigatória.** Sessão repete falhas transitórias com backoff; WebSocket continua usando sua reconexão automática; falhas que impedem a prontidão do cenário são repetidas automaticamente com atraso limitado. Recursos opcionais podem usar o fallback e continuar em segundo plano. O botão `Tentar novamente` deixa de ser caminho necessário. O bootstrap faz algumas recargas automáticas para falhas do grafo; só uma falha persistente recebe uma opção final de recarga.
5. **Melhorar clareza e apresentação.** Uma barra semântica (`progressbar`) apresenta número só quando há total conhecido, etapa atual em texto, checkpoints reais, movimento pixelado discreto e suporte a movimento reduzido/telas estreitas.
6. **Testar os fluxos.** Cobrir tracker/progresso, falhas e retry automático, entrada guest/conta, carregamento atrasado, troca de dimensão/local, reconexão, bootstrap com módulo indisponível, desktop, celular e movimento reduzido. Inspecionar as capturas atuais.

## Critérios de aceite

- Nenhuma porcentagem é calculada por cronômetro ou por uma faixa decorativa.
- O formulário de visitante aparece mesmo se a arte de boas-vindas falhar ou demorar.
- Uma falha transitória de sessão, recurso crítico ou WebSocket inicia nova tentativa sem exigir clique; recursos opcionais falham para o fallback sem bloquear a entrada.
- O mundo só aparece depois do snapshot completo, do idle do avatar e do primeiro quadro preparado; dados de posição e coleção permanecem íntegros.
- Loading de troca de local/dimensão continua cobrindo o mundo até o destino ficar pronto.
- Há um único overlay, com mensagens/etapas coerentes, acessível por leitor de tela, confortável no celular e estático sob movimento reduzido.
- Testes e capturas não mostram erros JS nem introduzem movimentos enquanto o overlay deixa o jogo inerte.

## Execução e validação

- O overlay agora mostra porcentagem baseada em tarefas concluídas; sessão e rede sem total conhecido continuam indeterminadas.
- Login e formulário aparecem sem esperar a ilustração. O bootstrap, verificação da sessão, dependências críticas do cenário e WebSocket recuperam falhas temporárias automaticamente; recursos opcionais mantêm fallback.
- A entrada no mundo aguarda somente o idle do personagem; outras ações continuam carregando sob demanda.
- O cartão de viagem identifica a dimensão ou o quarto de destino; confirmei os dois casos na navegação real de navegador.
- Atualizei os testes de navegador para desktop/celular, movimento reduzido, imagem opcional, falha temporária do bootstrap, progresso mensurado, reconexão e transições de dimensão/quarto. Os quatro roteiros passaram sem erros JavaScript.
- Testes focados de assets e progresso: 8 passaram.
- Suíte completa: 200 passaram, 35 falharam e 3 foram ignorados. As falhas listadas são de movimento, terreno/fogueira, orientação e multiplayer/quartos, fora do escopo funcional do carregamento; o resultado global não foi tratado como aprovação desta entrega. O ajuste posterior do título de destino foi verificado no navegador para dimensão e quarto.

## Revisão do inventário e padrão vigente — 25/10/2026

### Resultado da busca por telas

A busca por arquivos de apresentação em todo o checkout encontrou `game/index.html` como a única página HTML de execução. Também existe `logs/mobile-touch-review/index.before.html`, uma cópia histórica arquivada em logs, que não é servida pelo jogo. A busca por rotas confirmou que `scripts/dev-preview-page.mjs` mapeia `/` para `index.html`; não há outros templates HTML ou páginas compiladas. Visitante e conta autenticada compartilham a mesma entrada. O carregamento inicial, a sessão, a primeira cena e a reconexão ocupam estados do mesmo `#scene-loading`; o contexto muda conforme a pessoa ainda está na entrada ou já está no mundo. A verificação de cache pode ocultar temporariamente essa interface quando o cache já está íntegro (`html.cache-verifying`), mas também não é outra tela.

Há superfícies visuais distintas que não são páginas HTML nem carregadores iniciais e devem continuar separadas:

- `#room-transition` é criado dinamicamente por `game/room-transition.mjs`; congela o último quadro e faz fade na entrada/saída de quarto. Não tem nome nem percentual. Durante essa transição, o mesmo `#scene-loading` fica transparente e seu conteúdo é ocultado por `data-room-transition`.
- `#teleport-travel-overlay` é um canvas criado dinamicamente por `game/teleport-effect.mjs`; durante viagens entre dimensões mostra o destino e uma barra de prontidão própria. `beginSceneLoading()` cede a cobertura enquanto a viagem controla a tela.
- O estado ocupado do botão de login/cadastro/visitante e `#auth-status` é feedback local da ação, não uma página de carregamento.
- Arte de login e animações/atlases opcionais carregam em segundo plano ou sob demanda; não devem abrir outro overlay nem bloquear a entrada.
- A atualização automática verifica uma versão segura e recarrega pela entrada normal; não possui uma tela própria.

A inspeção precisa ser repetida se novos pontos de entrada HTML forem adicionados. Arquivos HTML guardados em `logs/` são cópias de evidência, não páginas servidas pelo jogo.

### Regra de progresso inicial

A barra principal é o total da entrada: começa em 0%, permanece entre 0 e 100%, usa tarefas concluídas e histórico de duração das etapas, e mantém um piso crescente para nunca regredir quando autenticação, cache ou cena retomam atividade. O preenchimento é suavizado para acompanhar o avanço sem pular ao final antes da hora.

A barra inferior fica no mesmo lugar e mostra somente o progresso da fase ativa: Arquivos, Sessão, Personagem ou Cena. Ao trocar de fase, ela reinicia em 0% e muda para a cor correspondente; tarefas de personagem e cena avançam em partes iguais conforme tarefas concluídas / tarefas totais. A barra superior mantém o progresso geral ponderado das fases e usa a cor da fase ativa. Frações inválidas são limitadas a 0–100%. A fase mostrada é a próxima fase incompleta; uma sessão autenticada não deve voltar a exibir “Arquivos” depois de arquivo e sessão concluídos. A barra inferior chega a 100% quando a preparação inicial termina. Os quatro checkpoints ficam preenchidos para fases concluídas e destacados para a fase atual.

Quando a cena inicial está pronta, ambas as barras mostram 100% e a interface permanece visível por um segundo antes do fade/entrada. Isso vale apenas para a conclusão da carga inicial; as transições de quarto e de dimensão mantêm seus próprios tempos e aparência. Movimento reduzido continua sem animação prolongada.

### Implementação e validação atuais

- `game/loading-progress.mjs` escolhe a fase e calcula o progresso local da barra inferior; `game/main.js` aplica o estado e mantém monotonicidade dentro da mesma fase. Na troca de fase, o cliente reinicia a barra inferior, sincroniza a cor da barra superior e atualiza os checkpoints. O bootstrap aplica a mesma regra enquanto controla a fase de arquivos.
- A porcentagem inicial não pode ser negativa, passar de 100% ou diminuir. Cache ainda sem total conhecido não inventa fração; as fases seguintes dependem de confirmação real. A barra global de quarto/dimensão não é afetada pelo cálculo das quatro fases da tela de entrada.
- Suíte focada executada em 25/10/2026: **21 testes passaram**, incluindo progresso por tarefas, limites, cache e overlay de dimensão. `node --check` passou para `main.js`, `bootstrap.mjs` e `loading-progress.mjs`.
- Fluxo desktop de visitante no `/dev/`: coleta real de 235 amostras da barra inferior; iniciou em 0%, avançou sem regressão, chegou a 100%, permaneceu nesse valor por 1.114 ms e não gerou erros JavaScript.
- Inventário de arquivos: busca em todas as pastas encontrou só `game/index.html` executável e uma cópia histórica em `logs/`; revisão das rotas confirmou o HTML servido. Inspeção do DOM/CSS/módulos identificou os overlays criados dinamicamente e os feedbacks locais. Os roteiros locais de dimensão e quarto ainda têm limitações no próprio harness: a checagem de dimensão falha na simulação de cache antes de alcançar o portal; a de quarto capturou as transições, mas falhou na verificação móvel final por ausência de `window.roomLayoutAudit`. Esses resultados não indicam falha do carregador publicado e também não são tratados como aprovação visual integral desses dois fluxos.

### Arquivos de referência

`game/index.html`, `game/bootstrap.mjs`, `game/main.js`, `game/loading-progress.mjs`, `game/style.css`, `game/scene-loading.mjs`, `game/room-transition.mjs`, `game/teleport-effect.mjs`, `game/update-monitor.mjs` e os testes focados listados acima formam o mapa de manutenção. Ao adicionar qualquer nova espera, primeiro classifique-a como inicial, feedback local, prontidão de cena, transição de quarto ou viagem de dimensão; reutilize a superfície correspondente em vez de criar uma tela semelhante.

### Revalidação após correção de progresso — 25/10/2026

A busca completa por arquivos HTML foi repetida: só `game/index.html` é servido; `logs/mobile-touch-review/index.before.html` continua sendo apenas um registro antigo. O mapa de superfícies permanece: `#scene-loading` cobre entrada e prontidão do mundo; `#room-transition` é o fade curto de quartos; `#teleport-travel-overlay` conduz viagem entre dimensões; estado ocupado de autenticação e confirmações de painéis são feedback local. Não encontrei outra página inicial de carregamento.

A barra inferior usa progresso derivado de arquivos/cache concluídos, sessão confirmada e frações de tarefas concluídas de personagem/cena. A transição visual foi suavizada; continua monotônica e fica no mesmo lugar enquanto troca cor/rótulo. Ao concluir a cena inicial, `markInitialLoadingComplete()` leva a barra inferior e a total a 100%, e `revealLoadedScene()` aguarda 1 segundo antes de ocultar o overlay. Esse intervalo vale somente para a tela inicial.

Corrigi também a transferência de controle do progresso total entre `bootstrap.mjs` e `main.js`: o bootstrap cancela a animação pendente ao ceder a tela, e o cliente principal usa o maior valor já visível como piso durante cada quadro. Isso evita regressão observada em recarga autenticada.

Verificações desta revisão: 6 testes de `loading-progress.test.mjs` passaram; `node --check` passou para `main.js` e `bootstrap.mjs`; `git diff --check` passou. No navegador autenticado, a verificação de progresso total aprovou início não negativo, monotonicidade, 100% e permanência de aproximadamente 1 segundo. O roteiro terminou depois com falha apenas na checagem final de console por uma resposta 404 de recurso; por isso a sessão não conta como aprovação integral sem erros. A captura desktop foi inspecionada e mostra o wordmark, frase, barra total, barra da etapa atual e legenda de cores em posições estáveis.

Essas alterações estão no checkout compartilhado `/opt/game-agent`; não foram publicadas em `/dev/`. As transições de quarto e dimensão ainda não têm validação visual completa nos roteiros locais descritos acima; a auditoria global segue aberta até validar esses fluxos e o comportamento móvel correspondente.


### Ajuste de progresso uniforme do cache — 25/10/2026

A fase de arquivos/cache agora informa o total de tarefas de todas as subetapas que realmente serão executadas: checagem do cache existente (quando há cache), transferência de cada arquivo, conferência final de cada arquivo e ativação do pacote. Cada tarefa concluída soma uma parte igual do denominador da fase; o tamanho em bytes deixa de fazer a barra avançar de forma desigual. Eventos de download parcial não aumentam a porcentagem até a tarefa do arquivo terminar e ser conferida. O contador agregado não reinicia quando muda de checagem para transferência ou conferência, e mantém o maior valor exibido.

O progresso agregado também é compartilhado com a barra inferior e com a barra total, removendo a divergência em que a barra inferior já mostrava progresso enquanto o total seguia em zero. O cache sem fração conhecida permanece em zero, sem converter null em progresso válido.

Validação desta correção: node --test game/cache-update.test.mjs game/loading-progress.test.mjs passou com **10 testes**; node --check passou para bootstrap.mjs, main.js e cache-update.mjs; git diff --check passou. O teste real de navegador em carregamento parcial capturou total e barra inferior sincronizados em **0,7%**, com **9 de 337 tarefas** concluídas, na fase de transferência. O término inicial continua levando as duas barras a 100% e mantendo a tela visível por **1 segundo** antes da entrada. Sem publicação no servidor nesta revisão.

## Aquecimento para tutorial, bosque e móveis — 27/10/2026

O primeiro carregamento aguarda os assets da cena inicial, atlas de móveis, animações de teleporte e paletas/atlas compartilhados de cada tema de dimensão disponível. Cada tema e cada asset participa das tarefas reais da barra total e da etapa atual. A saída do tutorial pessoal para o Bosque não adia o aquecimento exterior: chunks visíveis de terreno/vegetação entram na prontidão do primeiro quadro. Transições comuns preservam o preparo incremental dos trechos distantes.

### Refinamento da barra inferior e pausa de conclusão — 25/10/2026

A barra inferior da tela inicial avança em linha reta entre cada atualização de tarefa concluída. As tarefas seguem os grupos já mostrados pela legenda, com a fração de cada grupo calculada pelo número concluído sobre o total registrado; a contagem do cache usa tarefas finalizadas, sem distribuir avanço parcial por bytes. A barra mantém o maior valor já alcançado.

A pausa de conclusão agora começa depois da transição visual da barra inferior (420 ms) e mantém o carregador por mais 1 segundo. Assim, a espera completa não consome parte do segundo enquanto a barra ainda está preenchendo.

Validação de navegador após o ajuste: recarga autenticada em desktop e celular alcançou 100% nas duas barras, sem regressão e sem erros JavaScript. A barra inferior permaneceu em 100% por 1.475 ms no desktop e 1.813 ms no celular. A checagem de navegador também verifica monotonicidade da barra inferior. Os testes focados de cache e progresso passaram (10/10), assim como `node --check` e `git diff --check`. Nenhuma publicação ou reinicialização foi realizada.

### Fechamento da auditoria de superfícies — 25/10/2026

Esta seção atualiza as observações anteriores sobre os harnesses de quarto e dimensão, que foram corrigidos e reexecutados depois daqueles registros.

Busca final em todas as pastas por HTML/XHTML e componentes de página (JSX, TSX, Vue, Svelte e PHP): a única entrada servida é `game/index.html`, confirmada pelo roteamento de `/` para `index.html` em `scripts/dev-preview-page.mjs`. `logs/mobile-touch-review/index.before.html` é uma cópia arquivada, sem rota de execução. A busca de marcadores de carregamento localizou as implementações em `game/index.html`, `game/bootstrap.mjs`, `game/main.js`, `game/style.css`, `game/room-transition.mjs` e `game/teleport-effect.mjs`; os demais resultados são documentação e roteiros de teste.

Mapa final das superfícies:

- **Entrada inicial, conta, visitante, cache, sessão, primeira cena e reconexão:** um único `#scene-loading` com a mesma estrutura visual e uma barra de etapa atual. O contexto troca o texto e os dados de progresso, mantendo os mesmos componentes e dimensões.
- **Falha de início:** permanece no mesmo `#scene-loading`, faz tentativas automáticas e só mostra “Tentar recarregar” quando a recuperação automática termina sem sucesso.
- **Entrada/saída de quarto:** `#room-transition`, efeito de quadro congelado e fade; não exibe nome de dimensão nem barra inicial.
- **Viagem entre dimensões:** `#teleport-travel-overlay`, canvas próprio que mostra destino e prontidão; não abre a tela inicial por cima da viagem.
- **Botões de autenticação ocupados, mensagens de ação, imagem de login e cache-verifying:** estados locais/recursos da mesma página, não páginas extras.

Validações reais registradas em 25/10/2026:

- Entrada autenticada em computador e celular: recarga, cena pronta, 100% nas barras, progresso monotônico e reconexão automática. A barra menor ficou em 100% por 1.475 ms no computador e 1.813 ms no celular; nenhum erro JavaScript nos fluxos finais.
- Recuperação de falha transitória de módulo no início: visitante voltou automaticamente à entrada em computador e celular, sem recarga manual e sem erros JavaScript (`logs/loading-audit-startup-recovery/result.json`).
- Quarto: entrada e saída, atualização da localização e conclusão dos fades passaram em computador e celular (`logs/loading-audit-room-desktop-final/result.json` e `logs/loading-audit-room-mobile-final/result.json`).
- Dimensão: ida e volta entre superfície e O Breu passaram em computador e celular, com o blackout mantido até prontidão do destino (`logs/loading-audit-dimension-desktop-validated/result.json` e `logs/loading-audit-dimension-mobile-validated/result.json`). As durações registradas foram 5.792/6.974 ms no computador e 5.303/6.194 ms no celular. Capturas de entrada, blackout e chegada estão nas mesmas pastas.
- Cache/progresso: tarefas concluídas são contadas igualmente dentro de cada fase da barra inferior; teste de transferência parcial observou as barras sincronizadas em 0,7% com 9/337 tarefas concluídas. Os testes focados de cache e progresso passaram (10/10).
- Capturas desktop e celular da tela inicial foram inspecionadas; também foram inspecionadas capturas de blackout/chegada em dimensão. A tela inicial mantém nome pixelado, frase, percentual total, uma única barra inferior e legenda. O redimensionamento móvel mantém rótulo e barra legíveis.

A auditoria de páginas e estados de carregamento está concluída para o checkout atual. O registro amplo da suíte do projeto continua separado: seus testes de movimento, terreno e multiplayer não fazem parte da validação do carregamento. As alterações permanecem no checkout compartilhado `/opt/game-agent`; não houve publicação nem reinicialização do serviço.

### Publicação autorizada no preview — 25/10/2026

Após autorização do dono, confirmei o destino `/dev/`: `clareira-dev-preview-page.service` serve diretamente a pasta `game/` do checkout `/opt/game-agent`; não existe diretório de release separado para copiar e os arquivos estáticos são revalidados pelo navegador. Os SHA-256 de `index.html`, `bootstrap.mjs`, `main.js`, `style.css`, `cache-update.mjs` e `loading-progress.mjs` entregues por HTTP coincidiram com os arquivos do checkout. `/dev/update-version` e `/dev/game-assets` responderam com a versão atual `67e9e56ad2df864913aab7d7d1e53502225f77201b2d14c08b5a8817f0f873c7`.

Uma nova sessão de Chromium no endereço HTTPS real exibiu `#scene-loading` no contexto `login`, depois abriu o formulário de visitante com o carregador oculto e sem erros de página ou recursos (o 401 esperado de `/auth/me` sem cookie foi tratado como sessão visitante). A captura da entrada está em `/tmp/clareira-live-preview-loader-published.png` no ambiente de validação. Não foi necessário copiar arquivos ou reiniciar serviços; o preview já serve o código autorizado do checkout. A raiz pública continua em manutenção; publicação restrita ao preview `/dev/`.

### Padronização visual na reconexão — 26/10/2026

O caminho de reconexão reaproveita `#scene-loading` no contexto `world` quando o cliente precisa reconstruir a cena. Os contextos `login` e `world` compartilham wordmark animado, fragmentos de pixel, luzes de fundo, status e barras. Removi a legenda de bolinhas. Quando a reconexão espera um estado de progresso ainda desconhecido, a barra superior faz a animação indeterminada em azul e não exibe percentual; removi o valor fixo de 70%, que não correspondia a trabalho medido. A etapa inferior reaparece quando o cliente recebe progresso conhecido.

Os rótulos e detalhes ficaram 1 px maiores (10 px no desktop e 9 px no celular). Durante a reconexão, o status informa que a conexão está instável e que a sessão está sendo retomada; após o socket voltar, informa que o mundo está sincronizando.


## Recuperação por etapa — 29/10/2026

Relato: tela permanecendo em “Sessão verificada”. A reprodução isolada com sessão restaurada entrou no bosque e no quarto legado; o travamento específico da sessão do usuário não foi reproduzido. A revisão encontrou pontos de espera sem limite, reinício integral por watchdog e erro após autenticação que podia sair do laço de restauração sem apresentar recuperação.

Contrato aplicado:

- Ao autenticar, mostrar “Conectando ao local” na etapa de personagem; soltar a retenção visual da sessão em `finally`.
- Falha de áudio não interrompe a entrada. Erro após autenticação apresenta uma falha recuperável, em vez de encerrar silenciosamente o laço.
- Cada asset do catálogo de cenas possui prazo de 15 s por preparação. Ao expirar, liberar concorrência, abortar fetch/imagem e permitir nova aquisição. Assets críticos continuam obrigatórios; os opcionais usam o fallback existente. Resultados tardios não entram no cache.
- Fontes recebem 3 s antes de usar a fonte substituta. Não são fonte de verdade da cena.
- Mapas de luz recebem até 1,5 s sob cobertura; depois permanecem na fila incremental normal. A geometria, os objetos, colisões, estado e primeiro quadro continuam obrigatórios. O cache limitado de iluminação não pode bloquear indefinidamente uma cena que tenha mais fontes que sua capacidade.
- Após 30 s sem avanço conhecido, oferecer **Tentar esta etapa novamente**. Preservar perfil, mundo confirmado e cache; refazer preparação com nova geração. Se ainda não houver snapshot completo ou conexão aberta, refazer a conexão. Não recarregar automaticamente a página.

Validação e evidências: `logs/20261029-loading-recovery/`. Testes focados cobrem prazo, liberação de fila, nova tentativa crítica, fallback opcional, recuperação de conexão, recuperação local e mapas de luz que nunca concluem sem dispensar o primeiro quadro. Chromium móvel com sessão restaurada na recepção teve uma decodificação crítica deliberadamente pendurada e `document.fonts.ready` que nunca resolve: recuperou a imagem, entrou com fila de tarefas vazia e sem erro JavaScript. Esta simulação demonstra recuperação desses caminhos; não identifica por si só o motivo exato do bloqueio no aparelho do usuário.


Complemento após relato de 58,4%/60,7%: esses valores dependem do histórico local e não identificam uma tarefa fixa. O monitor de versões agora apenas avisa durante uma sessão autenticada; não a recarrega quando o jogador para. O watchdog de bootstrap não reinicia automaticamente a página por demora, e falhas já rejeitadas do bootstrap tentam novamente a preparação dentro da mesma página. A troca atômica de um cache antigo para outro ainda pode exigir um único recarregamento de ativação para manter HTML/CSS/módulos coerentes; isso não deve ocorrer periodicamente dentro da sessão.

`loading-wait` usa o diagnóstico existente a cada 10 s visíveis sob loading: fase numérica, percentual, flags de prontidão e contagens de assets, avatar, terreno, temas e mapas pendentes. O buffer mantém o limite de 64 eventos e lotes de 24; persiste para enviar ao reconectar. Não inclui IDs de tarefa, conta, sala, posição nem conteúdo. O servidor aplica a mesma lista de campos permitidos. Isso permite diferenciar os gargalos do próximo teste real, sem inferir causa a partir de um percentual.

A captura em 58,4%, “Personagem · Conectando ao local”, antecede `prepareSceneAssets`: o próximo diagnóstico precisa medir recepção/processamento do snapshot, não só recursos visuais. Acrescentados contadores de mensagens/estados, flag de welcome, idade da última mensagem e fase numérica de processamento. Esse evento sai num lote próprio, de um item, para não ficar escondido atrás de um lote antigo aguardando ACK. Quadros binários UTF-8 também são aceitos; erro de JSON/estado tem recuperação visível e não interrompe silenciosamente o handler antes de preparar a cena. Fases: 1 decodificação, 2 estado recebido, 3 prontidão, 4 jogadores, 5 estado interno/móveis, 6 assets, 7 concluído. Não se registra conteúdo do pacote nem mensagem/stack de erro no servidor.

## Passagens de quarto — 29/10

A cobertura preta começa ao enviar uma interação de porta próxima ou prever o cruzamento válido da soleira. Ela não muda o destino localmente: espera a confirmação e primeiro quadro completos. Enquanto ativa, bloqueia a previsão e a criação de comandos de movimento, além de limpar entradas já mantidas. Rejeição de interação recebe `roomTravelResult` vinculado ao requestId e libera a cobertura correspondente. Em ausência de confirmação, o limite de 12 s libera a tentativa quando ainda está na cena de origem; o watchdog da preparação continua responsável por uma cena já confirmada.

Chromium móvel validou saída caminhando, entrada por E, cobertura opaca antes do estado atrasado em 650 ms, posição estável e nenhum pacote novo de movimento durante a cobertura. O ensaio também reteve snapshots até preencher a fila: a retomada conservou o ator e o movimento voltou com fila zerada. Evidência: `logs/20261029-room-movement/`.

O recorte alfa das camadas foi comparado no navegador com o renderer anterior, usando PNG transparente e pivô iguais: zero diferenças de canal RGBA nas escalas 0,5 / 1 / 1,625 / 2. Isso valida a transformação do retângulo, sem substituir a revisão do cenário real. O quadro copiado na transição foi removido: a cobertura é aplicada imediatamente e a revelação mantém o fade final.
