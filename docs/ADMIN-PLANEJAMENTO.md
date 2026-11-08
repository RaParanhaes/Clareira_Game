# Planejamento do painel administrativo da Clareira

**Nome de produto:** Administração da Clareira. “Housekeeping” pode ser o nome familiar de referência, mas a interface deve usar termos claros em português.

**Estado:** planejamento; não existe um painel administrativo web implementado. Este documento não concede permissões nem altera contas ou serviços.

O fluxo de sandbox, autoria de mapas/territórios e publicação direta pelo Gerente/Admin está detalhado em [SANDBOX-AND-WORLD-EDITOR-PLAN.md](SANDBOX-AND-WORLD-EDITOR-PLAN.md).

## Resumo da arquitetura existente

- Contas têm somente os papéis `player` e `admin` no PostgreSQL. A autorização de algumas operações econômicas já reconhece `admin`; não há papéis de moderador, suporte ou editor.
- A ferramenta `scripts/set-account-role.mjs` altera papel por linha de comando. O perfil público informa o papel, mas ainda não há uma área web administrativa.
- `scripts/dev-preview-page.mjs` atende login, sessão e endpoints do preview; `scripts/prototype-server.mjs` valida conexões WebSocket e executa a simulação. A autorização precisa ser aplicada no servidor de cada operação, nunca só na navegação da interface.
- Dados persistentes do jogo ficam no PostgreSQL. Redis é para coordenação/cache temporário. JSON fica restrito a importação, backup ou fixture, conforme `database/README.md`.
- O catálogo de objetos/construções e seus históricos já têm operações de linha de comando (`npm run objects`). A economia tem tabelas e funções parciais; algumas políticas estão no jogo, enquanto projetos e fluxos econômicos ainda estão pendentes. O painel deve expor somente operações com serviço transacional e invariantes já implementados.
- O fluxo de atualização de arquivos já existe, mas não publica código pelo painel. O planejamento do modo de manutenção está em [auditoria de atualização e manutenção](audits/atualizacao-e-manutencao.md).

## Dados de conta e posse do jogador

O cadastro atual não contém tudo o que uma CMS de hotel costuma apresentar. O painel deve mostrar a origem de cada informação e não inventar campos ausentes.

| Informação | Onde está hoje | Observação para o painel |
|---|---|---|
| ID, nome de usuário e criação | `accounts` | Nome de usuário único; conta registrada não tem email no schema atual |
| Nome exibido e visitante/conta | `profiles` | Perfil é ligado à conta registrada; visitantes usam perfil efêmero |
| Senha | `accounts.password_salt`, `password_hash`, `scrypt_n` | Não é texto reversível. É scrypt com salt aleatório de 16 bytes, hash de 64 bytes e custo armazenado. Painel nunca mostra hash nem oferece leitura/recuperação da senha |
| Sessões | `sessions` | Guarda hash do token e expiração, não o token em claro; tratar como dado sensível e não exibir tokens |
| Itens, ferramentas, progressão e moedas | `inventory_items` | Inventário por ID e quantidade; ouro/prata/bronze também são itens. Ajuste manual futuro precisa passar por serviço e diário, não editar a tabela |
| Móveis do quarto | `rooms` + `room_objects` | Representa peças colocadas e transformações. Não existe, hoje, inventário separado de móveis possuídos |
| Aparência | `appearances` | Escolhas versionadas do personagem |
| Emblemas/conquistas | Nenhuma tabela encontrada | Não exibir seção vazia como se o sistema existisse. Planejar catálogo e concessões quando houver mecânica de emblemas |
| Histórico econômico | `economy_journal_transactions` + `economy_journal_lines` | Livro razão de certos fluxos de moeda; correções devem gerar transação compensatória auditada |
| Transferências de itens | `item_transactions` e eventos de interação aplicáveis | Usar como histórico onde o fluxo atual registra; não assumir cobertura completa de toda posse |
| Papel atual | `accounts.role` | Só aceita `player` ou `admin`; é uma autorização técnica do site, não uma profissão/cargo do personagem |
| Denúncias e sanções | Nenhuma tabela de moderação encontrada | Aviso, mute, kick, ban global, expiração e recurso ainda precisam de modelo e serviços próprios |

**Email:** não existe no cadastro ou schema atual. Antes de adicionar, definir se ele é necessário para recuperação de conta/comunicação, se será obrigatório, como confirmar propriedade, evitar enumeração de contas, trocar o endereço e cumprir retenção/privacidade. Não pedir ou coletar email apenas para preencher uma tela administrativa.

**Posse:** separar saldo/itens transportados, móveis que estão no quarto e futuras coleções/emblemas. Ter um móvel colocado no `room_objects` não prova que existe um fluxo de propriedade/transferência de móveis; a administração não deve tratar isso como inventário de posse até esse sistema ser implementado.

## Cargos e permissões administrativas

Manter três conceitos sem sobreposição:

1. **Conta:** identidade e autenticação do jogador (`accounts`/`profiles`).
2. **Profissão ou título do personagem:** progressão dentro do mundo, quando o jogo implementar esses sistemas. Não concede acesso ao painel.
3. **Habilidade do personagem:** poderes ou técnicas aprendidos jogando, como magia e movimento. Não concede acesso ao painel.
4. **Cargo e capacidades da equipe:** autorização para ferramentas administrativas. É o sentido de cargo neste Housekeeping. “Teleportar”, “observar”, “conceder item” e “alterar aparência de teste” são capacidades internas, não habilidades normais do personagem.

### Modelo de autorização proposto

- Migrar do campo único `accounts.role` para atribuições de cargos administrativos, permitindo mais de um cargo por conta quando isso tiver uso real. Manter a conta proprietária de emergência protegida e preservar compatibilidade do papel `admin` durante a transição.
- Guardar no PostgreSQL: cargos (ID estável, nome, descrição, escopo, ativo), atribuições conta-cargo, catálogo de permissões e vínculos cargo-permissão. Permissões usam chaves estáveis, por exemplo `players.read`, `players.moderate`, `economy.read`, `economy.adjust`, `catalog.read`, `catalog.publish`, `maintenance.manage`, `roles.manage`, `audit.read`.
- O servidor mantém o catálogo fechado de capacidades válidas; equipe pode criar/renomear cargos e combinar capacidades já permitidas. Não pode inventar uma chave que o servidor não conhece nem conceder permissões acima da própria autoridade.
- Capacidades de staff não entram em `learnedAbilities`, inventário, snapshot multiplayer ou árvore de progressão do jogador. O cliente comum nem recebe a lista de ferramentas. Depois da autenticação, um endpoint de staff entrega somente as ações autorizadas para aquele operador; o servidor verifica cada ação de novo ao executá-la. Ocultar botão é organização da interface, não barreira de segurança.
- Verificar a permissão no servidor para cada rota e operação de WebSocket, além de esconder os controles sem acesso na interface. O estado de autorização deve ser revalidado após mudanças de cargo e remoção de sessão administrativa.
- Cargos e níveis propostos estão na seção [Cargos, níveis e autoridade](#cargos-níveis-e-autoridade): Guia, Moderador, Gerente, Administrador e Proprietário. Governante da Vila é um cargo de jogo separado.
- Acesso a dimensões tem duas regras: jogadores (incluindo Guia de Comunidade) descobrem portais e conhecimentos/magias para alcançar dimensões específicas; Moderador, Gerente, Administrador e Proprietário podem trocar livremente entre dimensões pelas ferramentas da equipe, inclusive durante os testes.
- Somente Proprietário pode conceder/remover `roles.manage` e atribuir cargos; ele pode delegar qualquer poder e alterar a hierarquia, inclusive remover ou substituir atribuições de Proprietário. A proteção da conta de emergência serve para recuperação operacional e não limita as decisões do Proprietário autenticado. Administradores só atribuem cargos inferiores se receberem `roles.assign` explicitamente.
- Toda criação/edição de cargo, mudança de permissão ou atribuição registra ator, alvo, motivo, data, permissões anteriores e novas. Remoção lógica preserva histórico; não apagar auditoria.

### Tela “Cargos e permissões”

- Lista de cargos com nome, finalidade, total de integrantes e permissões resumidas.
- Criar cargo com nome e descrição; duplicar um preset existente como ponto de partida.
- Grade por domínio, usando verbos claros: **ver**, **gerenciar**, **publicar**, **moderar**, **ajustar**. Mostrar consequências e dependências antes de salvar.
- Aba de integrantes para buscar jogador/equipe e atribuir/remover cargo; convite e promoção precisam de autorização explícita.
- Prévia “Este cargo poderá...” renderizada a partir do catálogo real de permissões.
- Histórico e comparação de alterações; botão de desfazer cria nova revisão/evento, não apaga a anterior.
- Ao salvar mudança sensível, pedir motivo e confirmação. Mudanças que ampliam acesso têm confirmação reforçada e entram em vigor com invalidação das sessões/cache de permissão.

Não criar um editor de SQL, scripts arbitrários ou permissões livres por formulário. Mudanças de moeda, itens e móveis devem chamar operações de domínio com seus invariantes, não ser inferidas do acesso `players.manage`.

## Referências de produto: Habbo, Minecraft e CMS

### O que vale aprender com Habbo

- **Moderação no contexto:** dono de quarto e administradores de grupo podem clicar no avatar e expulsar ou banir daquele quarto; esse poder tem escopo local, e o dono/grupo administra os direitos de seus membros. É uma boa base para permissões delegadas pelos jogadores, sem conceder moderação global. [Ferramentas de moderação de quarto](https://help.habbo.com/hc/en-us/articles/360011512000-Room-moderation-tools)
- **Guia não é moderador global:** Ambassadors recebem ferramentas de acolhimento, identificam novatos e podem avisar, expulsar ou silenciar em salas públicas; não acessam chatlogs. Isso separa acolhimento comunitário de investigação de staff. [Ambassadors at your service](https://help.habbo.com/hc/en-us/articles/360011512500-Ambassadors-at-your-service)
- **Sanções e recurso:** Habbo publica uma escala progressiva de alertas, silêncios e banimentos, mostra ao jogador sua situação e permite recurso. Serve de inspiração para medidas graduais e explicáveis; os prazos e a progressão da Clareira precisam de política própria. [Sistema de moderação](https://help.habbo.com/hc/en-us/articles/360011620639-Our-moderation-system), [banimentos e recursos](https://help.habbo.com/hc/en-us/articles/17203561790482-Bans-and-appeals-information-in-Habbo)

### O que vale aprender com Minecraft

- **Níveis fáceis de entender:** Bedrock distingue Visitor, Member, Operator e Custom; Operator pode teleportar e usar comandos, enquanto Member joga normalmente. Isso mostra a utilidade de perfis claros e personalizáveis. [Níveis de permissão](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/playerpermissionlevel?view=minecraft-bedrock-stable)
- **Observação sem interferência:** Spectator atravessa o mundo e observa, mas não interage; não aparece para jogadores normais no comportamento documentado do modo. É uma referência forte para investigar posição, percurso e contexto sem empurrar, bloquear ou alterar o jogador. Na Clareira, ativação, motivo e duração devem ficar auditáveis para a equipe. [Modos de jogo do Minecraft](https://help.minecraft.net/hc/en-us/articles/360058743992-Minecraft-Differences-Between-Creative-Survival)
- **Ações visuais e comandos:** Minecraft oferece comandos poderosos, mas não exige que toda ação administrativa dependa de digitação; seus modos e permissões também aparecem em configurações visuais. Na Clareira, comandos podem existir como atalho opcional com sugestões e confirmação, nunca como única interface. [Uso de comandos](https://www.minecraft.net/en-us/article/minecraft-commands)

### O que vale aprender com CMSs de hotel

AtomCMS junta site, autenticação e Housekeeping web com Laravel/Filament. Seu processo documentado usa modo de manutenção, backup, migrações e reabertura explícita durante atualizações. É referência para uma área web de gestão e operação; a Clareira ainda precisa de painel dentro do jogo para ações rápidas no contexto da cena. [AtomCMS](https://github.com/atom-projects/atom-cms)

## Cargos, níveis e autoridade

`level` é a hierarquia da equipe, não o nível do personagem. O Guia pode ser conquistado por missões; Moderador, Gerente, Administrador e Proprietário são cargos de equipe. O Gestor Econômico é um cargo político do mundo, com autoridade local, não uma promoção na equipe.

| Level | Cargo | Funções e autoridade |
|---:|---|---|
| **0** | **Jogador** | Joga, evolui o personagem e cuida do próprio espaço. Alcança cada dimensão por portais descobertos ou por conhecimentos/magias aprendidos; cada descoberta pode liberar apenas dimensões específicas. |
| **1** | **Guia de Comunidade** | Cargo conquistável por missões. Continua sendo jogador para acesso ao mundo: ajuda jogadores e encaminha denúncias, sem teleporte administrativo entre dimensões. |
| **2** | **Moderador** | Analisa denúncias; pode advertir, silenciar, expulsar, suspender e aplicar banimento permanente. Pode observar casos autorizados e trocar livremente entre dimensões. Não cria conteúdo de mundo nem governa cargos. |
| **3** | **Gerente** | Faz tudo que o Moderador faz. Também cria emblemas, eventos, zonas, construções e conteúdo em outras dimensões; pode publicar esse conteúdo no mundo principal sem aprovação manual. |
| **4** | **Administrador** | Faz o que os cargos inferiores fazem. Também verifica e corrige problemas de jogador (preso, posição inválida, sessão/estado quebrado), constrói, cria/edita zonas e opera o jogo. É a autoridade operacional abaixo do Proprietário. |
| **5** | **Proprietário** | Autoridade máxima, sem restrição funcional: pode executar qualquer ação administrativa ou de jogo, conceder ou retirar dinheiro e emblemas, entrar e sair de casas, acessar qualquer dimensão e delegar poderes/cargos conforme decidir. |

**Gestor Econômico / Governante da Vila** é um cargo do mundo, separado da hierarquia staff e abaixo da autoridade global de Moderador/Gerente. Governa somente a economia de sua vila ou cidade; seu nível de governo libera mais instrumentos e orçamento local. Pode organizar produção, taxas, comércio e projetos conforme os sistemas disponíveis. A economia vem de atividade e tesouro locais, não de criar moeda sem limite. Não bane globalmente nem administra staff.

O nível organiza a equipe, mas o Proprietário tem autoridade total e pode delegar qualquer poder. As ações do Proprietário podem ser registradas para histórico e diagnóstico, sem aprovação, limite de valor ou bloqueio hierárquico. Para os demais cargos, mantêm-se as permissões descritas e os registros administrativos. Banimento permanente de Moderador não precisa de aprovação prévia; exige motivo e registro, e pode ser revisto por Gerente ou Administrador. A publicação direta do Gerente também não tem aprovação manual, mas passa pelas validações automáticas de dados, colisão, limites e compatibilidade do servidor.

## Ferramentas elevadas e modo de teste

Moderador, Gerente, Administrador e Proprietário podem acessar qualquer dimensão livremente pelas ferramentas da equipe. Gerente e Administrador usam o kit de criação e teste; publicação do Gerente no mundo principal é direta, sem aprovação manual, com validação automática do servidor. O Administrador também pode corrigir estado de jogador e operar o mundo. O Proprietário pode executar e delegar qualquer ferramenta ou ação do jogo sem restrições funcionais.

### Duas formas de usar essas ferramentas

- **Sessão de teste de staff:** ambiente isolado com personagem/estado descartável. Permite teleportar para coordenadas ou dimensões, vestir uma aparência, dar materiais e colocar objetos sem alterar conta real, economia, saves ou mundo persistente. Mostra um indicador claro de teste ao operador e descarta o estado ao sair. A autoria persistente de mapas/construções é um workspace separado, descrito em [SANDBOX-AND-WORLD-EDITOR-PLAN.md](SANDBOX-AND-WORLD-EDITOR-PLAN.md); fechar a sessão de teste não descarta o projeto autoral.
- **Operação real autorizada:** ferramentas de suporte/administração podem afetar mundo ou contas reais somente quando a capacidade correspondente permite. Mostrar alvo, escopo, justificativa e consequência; escrever pelo serviço de domínio, registrar ator e estado anterior/novo e oferecer compensação/reversão quando viável. “Ganhar item para testar” nunca deve ser confundido com conceder item permanente a um jogador.

### Kit de teste sugerido

| Capacidade | Uso no sandbox | Ação real equivalente |
|---|---|---|
| `staff.teleport` | Teleportar a própria câmera/personagem de teste para qualquer ponto | `staff.teleport_player` move outro jogador para local permitido, com alvo e motivo |
| `staff.observe` | Atravessar cenário e observar sem colisão/interação | Observar uma sessão real, com caso/motivo e início/fim auditados |
| `staff.appearance.preview` | Substituir temporariamente a aparência do avatar de teste | Não altera aparência salva de jogador; correção real usa fluxo separado e autorizado |
| `staff.inventory.fixture` | Gerar qualquer material/item no inventário descartável | `inventory.grant`/`inventory.remove` chamam serviço e histórico; itens não suportados ficam indisponíveis |
| `staff.scene.fixture` | Instanciar/remover móveis de teste e alternar estados | Alteração persistente exige capacidade de catálogo/quarto e validação normal |
| `staff.world.inspect` | Consultar dimensões/coordenadas, colisão e entidades da fixture | Acesso de leitura real é escopado, mínimo e auditado |

O modo sandbox começa apenas em `/dev/` ou num ambiente de teste dedicado. Se futuramente existir sandbox dentro do mundo público, precisa de isolamento transacional e identificador de ambiente em todo save/evento para impedir que fixtures sejam persistidas ou copiadas para jogadores. Nunca implementar “modo teste” como flag enviada pelo navegador que o servidor aceita sem autenticação.

### Hierarquia e acesso

- Gerente herda os poderes de moderação e criação; Administrador herda os poderes dos cargos inferiores e pode corrigir problemas em produção.
- Só Proprietário governa cargos e políticas globais. Administrador atua em tarefas de jogo sem poder se promover ou tomar o cargo de Proprietário; o Proprietário pode delegar esses poderes.
- Ferramentas internas ficam ocultas para jogadores comuns. O servidor confirma cargo e autorização em cada ação.

## Painel lateral dentro do jogo

O Housekeeping terá duas superfícies que compartilham autorização e auditoria: **painel lateral no mundo** para ação contextual e **painel web** para gestão de equipe, casos, políticas e histórico. A primeira é a ferramenta diária de moderação; a segunda configura como ela funciona.

### Interação planejada

- Botão discreto “Equipe” aparece só para quem tem acesso; atalho de teclado opcional abre/fecha. O botão continua acessível em celular.
- O servidor entrega ao operador autenticado somente as ações que suas capacidades permitem; seção vazia, comando oculto e nome de permissão não são enviados ao cliente comum.
- Painel encaixável na lateral direita/esquerda, arrastável para mover e redimensionável; pode recolher-se para uma alça compacta. A posição é preferência local, não dado do jogador no servidor.
- Desktop: lista de jogadores online, busca/filtros por dimensão, lugar e situação; clique no avatar seleciona e abre um cartão contextual. Celular: gaveta em tela cheia com alvos grandes e ações agrupadas.
- O painel captura foco e bloqueia comandos de movimento enquanto formulários/dialogs estão ativos; clique em ação nunca atravessa para o mundo. Esc fecha o diálogo sem executar a operação.
- Abas: **Online**, **Mapa**, **Denúncias**, **Ações recentes**. Cada aba some quando não há permissão.
- Cartão contextual: nome/ID mínimo, local atual, estado da conexão e comandos permitidos: acompanhar, observar, teleportar até a pessoa, convidar para local seguro, advertir, silenciar, expulsar ou abrir caso. Cada opção informa seu escopo antes de confirmar.
- Busca por comando pode ser uma paleta de ações nomeadas (por exemplo, “teleportar até jogador”), com autocomplete e validação. Não executar texto arbitrário, shell, SQL nem comando sem permissão.
- “Modo observação” é separado da sessão normal: câmera voa/atravessa obstáculos, não altera posição ou inventário do alvo e sai com um botão evidente. O registro guarda operador, alvo, local, início/fim e motivo/caso. Nunca permite abrir senha, token, email, conversas privadas ou inventário secreto.
- Teleportar, suspender, retirar itens ou conceder moeda pede confirmação contextual e mostra alvo, efeito e motivo. Ações econômicas também mostram origem do saldo e novo saldo; sem isso, a ação não pode ser enviada.
- Ações do jogador dono do quarto (kick/ban local de visitante) continuam no menu normal de avatar e limitadas ao próprio quarto; não precisam de acesso ao painel de staff.

Esboço desktop para manter o mundo visível ao lado:

```text
┌──────────────────────────┐
│ EQUIPE             ⤢  × │  ← arrastar / redimensionar / fechar
│ Buscar jogador…          │
│ Online  Mapa  Casos  ⋯   │
│ ──────────────────────── │
│ ● Avelã        Bosque    │
│ ● Cedro        Cabana    │
│ ○ Lua          Offline   │
│                          │
│ Selecionado: Avelã       │  ← ao selecionar um avatar
│ Observar · Teleportar    │
│ Advertir · Silenciar     │
│ Abrir caso               │
└──────────────────────────┘
          mundo continua visível
```

## Fronteiras de autoridade por domínio

Escopos possíveis: **próprio espaço**, **área atribuída**, **dimensão** e **global**. A permissão de escopo mais amplo é separada; nenhum cargo ganha alcance global só por ter nível maior.

| Domínio | Quem atua | Limite de autoridade |
|---|---|---|
| Denúncias e moderação | Moderador L2; Gerente L3 e Administrador L4 também recebem/analisam e moderam | Inclui banimento permanente; motivo e registro, com recurso posterior |
| Mapas e construções | Gerente L3 e Administrador L4 | Criar em outras dimensões e publicar no mundo principal sem aprovação manual; validação automática |
| Emblemas e eventos | Gerente L3 e Administrador L4 | Criar e gerir conteúdo comunitário conforme os sistemas disponíveis |
| Economia da vila | Governante da Vila, por nível de governo | Autoridade local sobre orçamento/produção/comércio; economia baseada na atividade e no tesouro local |
| Correção de jogador e operação do mundo | Administrador L4 e Proprietário L5 | Administrador corrige estado por ferramentas administrativas; Proprietário pode executar qualquer ação |
| Economia, emblemas e acesso a espaços | Proprietário L5 | Conceder/retirar dinheiro ou emblemas e entrar/sair de casas sem restrição funcional |
| Acesso administrativo a dimensões | Moderador L2, Gerente L3, Administrador L4 e Proprietário L5 | Troca livre entre dimensões; jogadores e Guia dependem de descoberta no jogo |
| Cargos e políticas globais | Proprietário L5 | Delegações, hierarquia, regras globais e quaisquer poderes administrativos |

Consulta de conversa privada/chatlog completo permanece fora do MVP, inclusive para cargos altos. Consultas de perfil, presença e inventário são permissões distintas e limitadas ao caso necessário.

## Economia, inventário e auditoria

- Dar/tirar moeda não é alterar um número na ficha. O serviço precisa criar um evento balanceado no diário financeiro, registrar ator, alvo, quantidade, moeda, motivo e origem/destino. A regra diferencia produção econômica, pagamento de tesouro, correção e recolhimento; o painel mostra qual foi usada.
- O Governante da Vila usa orçamento e produção locais conforme o nível de governo; não recebe ferramenta para criar saldo sem limite. As decisões políticas seguem o tesouro/ledger da região e os sistemas econômicos do jogo.
- Implementar limites por transação e por período, idempotência e aprovação adicional acima de um limite configurado. Operador não concede a si próprio nem apaga o rastro; toda correção é uma nova transação compensatória.
- Dar/tirar item usa serviço transacional e histórico de transferência. Objetos colocados em quarto não são inventário de móveis; criar posse de móveis primeiro. Emblemas exigem catálogo, regras de concessão e histórico antes de o painel oferecer essa função.
- A auditoria diferencia **consultar perfil**, **observar sessão** e **alterar estado**. Ações de leitura invasiva também registram motivo e caso; acesso a password hash/session hash não existe nem para administrador.
- Moderação começa com evidência explícita do reporte e histórico de sanções com acesso restrito. Não construir visualizador oculto de conversas privadas no MVP; o sistema atual não tem contrato de chatlog que o painel possa expor com segurança.

## Objetivo e limites

Dar à equipe uma área única para entender o estado do jogo e executar tarefas administrativas comuns com autorização explícita, histórico e recuperação. O painel organiza operações existentes; não substitui o servidor de jogo, não edita saves diretamente e não vira uma segunda fonte de verdade.

## Arquitetura administrativa

- **Aplicação:** área web autenticada servida pelo backend do jogo, sob rota própria (`/admin` ou equivalente), com sessão segura existente e validação de autorização em cada endpoint.
- **Fonte de verdade:** PostgreSQL para contas, políticas, estados operacionais e registros de auditoria. Sem arquivos JSON persistentes para novas funções.
- **Serviços:** comandos administrativos entram por serviços de domínio compartilhados com as regras do jogo, com transações, validação, idempotência onde necessário e cache Redis invalidado por revisão.
- **Separação operacional:** atualização/publicação de código continua no processo de release. O painel poderá mostrar a versão e agendar/ativar manutenção quando a função existir, mas não terá botão que copie arquivos ou reinicie a VPS.
- **Auditoria:** registro append-only de ator, ação, alvo, justificativa, data/hora, resultado e resumo antes/depois, sem tokens, hashes de senha ou dados privados desnecessários. As credenciais PostgreSQL privilegiadas nunca chegam ao navegador.

## Papéis e permissões

Os cargos descritos em [Cargos, níveis e autoridade](#cargos-níveis-e-autoridade) agora têm persistência e autorização inicial no PostgreSQL, mantendo `accounts.role` para compatibilidade. O script `npm run staff:owner` provisiona o primeiro Proprietário por acesso operacional, com motivo e auditoria. As rotas validam no servidor as capacidades de cada operador. `/staff` já tem gestão de cargos, atribuições, auditoria, fila de denúncias e histórico/aplicação/revogação de sanções, mostrando seções conforme a autorização efetiva. O login e a conexão ao jogo respeitam sanções ativas e o mute bloqueia o chat; recurso ainda falta. O menu de ferramentas do jogo inclui ajuste de carteira e acesso ao painel completo; outras operações, o sandbox/publicação e a manutenção seguem em implementação.

O nível organiza a hierarquia. O Moderador tem poder de moderação; o Gerente herda esse poder e ganha criação/publicação de conteúdo; o Administrador herda as funções anteriores e pode corrigir o jogo; o Proprietário tem autoridade total, pode executar qualquer ação e delegar qualquer poder.

## Menu de ferramentas no jogo

A conta autorizada recebe o botão **Ferramentas** no menu do jogador após a consulta de capacidades; ao abrir, as permissões são consultadas novamente. A ferramenta de carteira permite revisar e confirmar um crédito ou débito com motivo, usando `/dev/staff/wallet` e suas validações e auditoria no servidor. O histórico de ações consulta a auditoria sob demanda, com paginação e acesso por `audit.read`. O menu também abre o painel completo `/dev/staff`, onde permanecem cargos e moderação. O acesso e cada ação são verificados no servidor; sair da conta limpa as permissões no cliente. No celular, a janela usa o painel inferior do jogo.

## Navegação proposta

1. **Visão geral:** status operacional, jogadores conectados, erros recentes, versão do cliente/servidor, últimas ações administrativas e atalhos permitidos.
2. **Operação:** estado de serviços, manutenção agendada/ativa, mensagem pública e histórico. Operações de release ficam como leitura/ligação para a documentação do deploy.
3. **Jogadores:** busca por nome exato ou ID; perfil resumido, estado da sessão e histórico de moderação. Ocultar email e identificadores internos por padrão.
4. **Moderação:** denúncias, observações, aviso, suspensão temporária e banimento conforme regras que forem definidas. Mostrar evidência e motivo antes de aplicar medida.
5. **Mundo e conteúdo:** mundos/dimensões, objetos, construções e revisões do catálogo. Começar em leitura; publicar revisão só quando houver validação e rollback definidos em [SCENE-OBJECTS.md](content/SCENE-OBJECTS.md).
6. **Economia:** políticas, fundos, mercado e indicadores já sustentados por serviços. Saldo e diário financeiro são imutáveis via edição direta; correção deve ser operação compensatória auditada.
7. **Relatórios:** métricas agregadas de sessões, disponibilidade, incidentes, moderação e uso do jogo; exportação com campos mínimos e limites de retenção.
8. **Auditoria:** busca e filtros sobre operações administrativas; sem editar ou apagar entradas.

### Ficha do jogador

Ao abrir uma conta, dividir a ficha em abas para a equipe localizar dados sem misturar identidade, posse e poderes administrativos:

- **Resumo:** ID, nome de usuário, nome exibido, data de criação, tipo conta/visitante e última atividade disponível.
- **Inventário:** IDs legíveis, quantidades e saldo calculado; leitura somente. Alterações futuras devem ser operações explícitas, exigir permissão própria, motivo e transação auditada.
- **Quarto:** móveis colocados, cômodo e revisão; deixar claro que é a planta salva do quarto, não uma coleção de móveis possuídos.
- **Personagem:** aparência e progressão que já existem. Profissões e emblemas aparecem apenas quando seus sistemas persistidos existirem.
- **Acesso da equipe:** cargos administrativos atribuídos, visível apenas para quem pode ler/gerenciar cargos. Nunca inferir cargo do jogo a partir daqui.
- **Sessões:** quantidade/expiração e ação “encerrar sessões” se for implementada; nunca mostrar token, hash ou cookie.
- **Histórico:** transações econômicas, eventos de inventário disponíveis e ações de moderação/administração, cada uma com origem e cobertura identificadas.

## Fluxos prioritários

### Implementação local atual

O painel web `/staff` já implementa cargos/capacidades, atribuições, auditoria, denúncias e sanções persistidas em PostgreSQL. A migração 031 e a aba Economia adicionam ajuste de saldo com capacidade delegável `economy.adjust`, confirmação/motivo obrigatório, proteção de hierarquia, lock compartilhado com compras e auditoria do saldo anterior/novo. Somente Proprietário recebe autoridade total por padrão. O preview dispõe do painel web e do menu in-game para ajuste de carteira. Outras ferramentas in-game, sandbox/publicação, manutenção e revisões de segurança/UX seguem pendentes.

### 1. Entrada segura no painel

1. Operador usa conta registrada; visitante não pode acessar.
2. Backend consulta o papel atual no servidor e valida autorização em cada requisição.
3. Ações sensíveis pedem nova autenticação ou confirmação adicional quando essa proteção existir.
4. Acesso e falhas ficam registrados sem guardar segredo nem token.

### 2. Manutenção

1. Operador escolhe janela, sistemas afetados, mensagem, início e previsão opcional.
2. Tela mostra resumo e consequência; ativação exige confirmação explícita.
3. Backend persiste a mudança no PostgreSQL, atualiza processos e audita ator/motivo.
4. O jogador recebe aviso agendado, depois a tela de manutenção; novas sessões são bloqueadas e sessões existentes encerram com motivo compreensível.
5. O operador encerra a manutenção ou o término agendado a encerra; painel confirma estado real e mantém histórico.

### 3. Medida de moderação

1. Moderador localiza a conta e vê somente dados necessários.
2. Seleciona medida, duração e motivo. Moderador pode aplicar banimento permanente diretamente; o caso fica registrado e pode ser recorrido/revisto depois.
3. Confirma a identidade-alvo e a consequência antes de enviar.
4. Serviço aplica a medida de forma atômica e registra antes/depois, ator e justificativa.
5. UI oferece revogação/expiração conforme política; a reversão cria novo evento, não altera o histórico antigo.

### 4. Alteração de catálogo

1. Editor compara revisão atual com proposta validada.
2. Checagens bloqueiam referências inválidas, ID conflitante e valores de física fora do contrato.
3. Uma revisão é aplicada pelo serviço PostgreSQL e fica disponível para rollback.
4. Painel mostra autor, revisão e resultado. Simulação, colisão e renderização continuam no runtime autoritativo.

## Controles para ações críticas

- **Confirmação reforçada:** ban permanente, mudança de cargo, ativação imediata de manutenção total e correção financeira. A confirmação mostra alvo e consequência; não cria aprovação superior para ações que o Moderador ou Gerente já pode executar.
- **Reversão:** preferir suspensões temporárias, mudança versionada e eventos compensatórios. Para ações sem reversão segura, apresentar impacto, escopo e justificativa obrigatória.
- **Concorrência:** alterações de política/catálogo usam revisão esperada; rejeitar escrita sobre revisão antiga em vez de sobrescrever mudança de outro operador.
- **Privacidade:** não exibir senha, hash, token de sessão, credencial, conteúdo privado de mensagens ou IP completo. Acesso excepcional a evidência precisa de permissão, motivo e auditoria.
- **Resiliência:** estado de operação, tela de manutenção e health têm caminhos de leitura mínimos, independentes das funções que podem estar indisponíveis.

## Ordem de implementação recomendada

**Fase 0 — Fundação de cargos:** migração PostgreSQL para cargos/permissões/atribuições e auditoria append-only; mapa fechado de capacidades no servidor; proprietário de emergência; migrar `admin` atual sem interromper acesso. Painel web básico para criar cargos a partir de capacidades autorizadas, atribuir cargos e revisar histórico.

**Fase 1 — Painel lateral, leitura:** área “Equipe” acoplável dentro do jogo, lista de online, filtros por local, ficha resumida, cargos do operador, ações recentes e versão/status dos serviços. Ativar só para perfis autorizados. Esse primeiro corte já entrega o gesto visual que diferencia a Clareira de uma CMS só web.

**Fase 2 — Sessão de teste e observação:** kit descartável para teleporte, aparência, materiais e móveis; modo observar com câmera não-interativa e auditável. A sessão não grava saves nem mexe na economia real. Workspaces persistentes para construir e promover conteúdo seguem o plano de editor do mundo.

**Fase 3 — Ações staff no mundo real:** teleportar outro jogador para ponto seguro e depois habilitar outras operações com permissão explícita, alvo, motivo e auditoria.

**Fase 4 — Moderação:** denúncias ligadas ao contexto, aviso, mute, expulsão, suspensão temporária, sanção progressiva e recurso do jogador. Separar punição local do dono do quarto e medidas globais de equipe; registrar e revisar abusos.

**Fase 5 — Operação e conteúdo:** manutenção, ferramentas de catálogo com revisão/rollback, emblemas, eventos, autoria em outras dimensões e publicação direta pelo Gerente/Admin após validação automática. Ações de release de código continuam fora do painel.

**Fase 6 — Economia e posse:** ledger administrativo balanceado, limites de concessão/recolhimento, aprovação dupla em valores altos e histórico por jogador. Só depois criar operações para móveis possuídos e emblemas, pois esses modelos ainda não existem.

Cada fase deve ser uma fatia vertical com interface, serviço, permissão, transação/auditoria e teste de ação autorizada e negada. Assim o painel pode crescer sem concentrar todas as regras numa única entrega.

## Critérios para começar a implementação

- Definir o operador proprietário e como recuperar acesso quando o login ou banco estiver indisponível.
- Migrar a autorização `player/admin` sem promover ou remover contas silenciosamente.
- Implementar migração de cargos/permissões/auditoria em PostgreSQL e testes de autorização positiva e negativa por capacidade/escopo.
- Projetar primeiro a ficha do jogador, o editor de cargos e o painel lateral online; validar desktop, teclado e celular.
- Definir registro, aviso ao jogador e fluxo de recurso antes de habilitar banimento permanente.
- Criar serviço de observação não-interativa sem gravar segredo ou conteúdo privado.
- Modelar concessão/recolhimento como transação auditável, sem editar saldo por SQL no painel.
- Integrar manutenção como dependência do painel, conforme `audits/atualizacao-e-manutencao.md`.
- Validar rollback, concorrência e captura de auditoria antes de liberar ações de escrita.

## Limite de IA

O primeiro painel não precisa de IA. Se for adicionada futuramente, começa sem capacidade de escrita; qualquer ferramenta deve usar allowlist explícita, fontes internas delimitadas, filtros contra prompt injection, trilha de auditoria e confirmação humana antes de executar uma ação. Texto de jogador, denúncias, CMS e conteúdo de mundo são dados não confiáveis e nunca instruções para o agente.

## Base de referência

AtomCMS integra Housekeeping ao CMS, usa autenticação/autorizações do backend e implementa o painel com Filament. Seu README também separa manutenção do site de atualização do código: recomenda backup, modo de manutenção, migrações e retorno explícito ao modo normal. [Repositório oficial AtomCMS](https://github.com/atom-projects/atom-cms)

Nitro/Turbo mostra outra separação útil: cliente Nitro, CMS e emulador/runtime são peças distintas; o emulador Turbo oferece plugins, API e migrações. A Clareira deve preservar a mesma fronteira conceitual sem copiar schema ou protocolo Habbo. [Turbo, repositório Nitro/Krews](https://github.com/nitrodevco/turbo)

Para senhas, o padrão atual usa scrypt, um algoritmo próprio para derivação de senha, com salt e custo guardados junto ao verificador. Hash não pode ser decifrado para revelar a senha; a operação de suporte correta é redefinição com verificação de identidade. OWASP lista scrypt entre os algoritmos apropriados e recomenda parâmetros atualizáveis e um formato que permita migração. [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Para a Clareira, a organização deve seguir as fronteiras reais do projeto: cliente mostra e solicita; serviços do servidor autorizam; PostgreSQL persiste; Redis coordena estado temporário. Os materiais de atualização/manutenção e os contratos do catálogo são referências internas obrigatórias antes de implementar as áreas correspondentes.

### Lições adicionais de emuladores e ferramentas de staff

- **Separar catálogo de permissões e cargos:** Polaris documenta a divisão entre `permission_definitions` (capacidades conhecidas) e `permission_ranks` (quais capacidades cada cargo recebe), com uma ponte temporária para compatibilidade com o schema antigo. A Clareira deve partir dessa separação desde a primeira migração: as chaves são definidas pelo servidor e os cargos apenas as combinam. A camada de compatibilidade deve ter prazo e telemetria para não virar uma segunda fonte de verdade. [Polaris Emulator e notas de arquitetura](https://github.com/duckietm/Polaris-Emulator)
- **Atualização reversível e explícita:** PlusEMU orienta parar o emulador, copiar banco/configuração, trocar o binário e deixar a atualização de banco fazer backup antes de iniciar o serviço. Isso reforça a fronteira já definida: housekeeping pode mostrar versão, estado e janela de manutenção; publicação de código e migração de schema permanecem no processo de release, com backup, validação prévia e caminho de recuperação. [PlusEMU, instalação e atualização](https://github.com/plus-emulator/PlusEMU)
- **Permissões granulares expõem poderes perigosos:** instalações antigas de BrainCMS/Arcturus usam flags separadas para ver whispers, limpar outros quartos, mover/posicionar móveis, consultar logs e alertar/expulsar/banir. O valor desse padrão é revelar que “moderação” contém ações de risco diferente; copiar dezenas de flags antigas, porém, deixaria a matriz difícil de manter. Na Clareira, agrupar capacidades por tarefa, mas manter leitura, observação e escrita como permissões distintas. Essa referência é comunitária e legada, não uma recomendação de segurança atual. [Wiki BrainCMS: tabela de permissões](https://github.com/BrainCMS/BrainCMS/wiki/Permissions-table:-Explained)
- **Separar cliente, CMS e runtime:** Nitro é um cliente; Turbo é um runtime/emulador com API, migrações e plugins. Essa separação ajuda a manter as regras e os dados de autorização no servidor, mesmo que o painel esteja no jogo ou na web. Plugins futuros devem receber APIs de capacidade limitadas, sem SQL privilegiado ou acesso direto aos segredos. [Nitro/Turbo](https://github.com/nitrodevco/turbo), [PlusEMU](https://github.com/plus-emulator/PlusEMU)
- **Poderes locais podem ser delegados:** Habbo permite que o dono do quarto ou administradores do grupo expulsem e banam pessoas daquele quarto, com gestão de admins própria. A Clareira pode aplicar o mesmo limite a quartos, eventos e instâncias: uma permissão local não implica acesso global, e o dono do espaço não pode conceder capacidades da equipe. [Ferramentas de moderação de quarto do Habbo](https://help.habbo.com/hc/en-us/articles/360011512000-Room-moderation-tools)
- **Acolhimento não exige vigilância:** Ambassadors do Habbo podem ajudar em áreas públicas e aplicar intervenções limitadas sem acesso a chatlogs. Isso sustenta um cargo de Guia que encaminha ocorrências e atende jogadores sem ler conversas privadas. [Programa de Ambassadors do Habbo](https://help.habbo.com/hc/en-us/articles/360011512500-Ambassadors-at-your-service)
- **Sanções devem ser legíveis e recorríveis:** Habbo apresenta medidas graduais, status da sanção e caminho de recurso. A Clareira deve definir sua própria política, exibir ao jogador o motivo, duração e situação da punição e registrar a decisão original e cada revisão. Uma progressão automática não deve substituir a avaliação de gravidade nem impedir uma equipe autorizada de corrigir erro. [Sistema de moderação do Habbo](https://help.habbo.com/hc/en-us/articles/360011620639-Our-moderation-system)
- **Nível simples pode coexistir com capacidades precisas:** Minecraft Bedrock oferece perfis como Visitor, Member e Operator; o operador pode executar ações avançadas, inclusive teleporte. A Clareira pode manter níveis fáceis de entender para a equipe, mas deve calcular autorização por capacidade, alvo e escopo, sem tratar o número do nível como bypass. [Níveis de permissão do Minecraft Bedrock](https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/playerpermissionlevel?view=minecraft-bedrock-stable)
- **Observar e testar são modos de operação distintos:** o modo Spectator do Minecraft inspira a observação sem interação. Na Clareira, sessão de observação deve ser explícita, temporária, com motivo, alvo e início/fim auditados; sandbox de aparência, teleportes, itens e móveis deve usar estado descartável, separado do save e da economia reais. A existência do modo Spectator não comprova que todas as implementações de terceiros preservam privacidade; é o nosso servidor que precisa impor a regra. [Modos de jogo do Minecraft](https://help.minecraft.net/hc/en-us/articles/360058743992-Minecraft-Differences-Between-Creative-Survival)
- **Revogação precisa valer imediatamente:** mudanças de cargo não podem depender de reiniciar o jogo ou de um operador lembrar um comando de recarga. Cada processo deve consultar uma revisão de autorização; revogar capacidade incrementa a revisão, invalida cache/sessões privilegiadas e bloqueia ações seguintes, inclusive em conexões WebSocket já abertas. Registrar a revisão usada junto à decisão facilita investigar discrepâncias.

#### Regras de fechamento antes de liberar escrita

1. Definir para cada capacidade: verbo, recurso, escopo, limite, risco e evento de auditoria. Ex.: `moderation.mute` + jogador + quarto atribuído + até 30 minutos + motivo obrigatório.
2. Para cargos abaixo do Proprietário, impedir autoelevação e alterações de cargos de autoridade igual/superior sem delegação explícita. O Proprietário pode alterar qualquer cargo e delegar essas ações sem aprovação independente.
3. Exigir motivo e confirmação contextual para observação, punição, teleporte de terceiros, concessão econômica, mudança de cargo e manutenção. A confirmação deve repetir claramente o alvo e o impacto.
4. Tornar auditoria append-only, com ator, alvo, escopo, caso/motivo, resultado, horário, revisão de permissão e resumo antes/depois. A leitura de evidência sensível também gera evento; senhas, tokens e hashes não entram nos logs.
5. Implementar expiração e revisão periódica de atribuições temporárias. A sessão de staff deve expirar, exigir nova autenticação para ações críticas e permitir revogação de todas as sessões privilegiadas.
6. Tornar ações críticas idempotentes e concorrentes com revisão esperada. Duplo clique, reconexão ou repetição de pacote não pode duplicar moeda, sanção ou concessão.
7. Usar sandbox separado com etiqueta visível e descarte garantido. Bloquear cópia de fixture para produção e adicionar `environment_id` em eventos persistidos onde ambientes compartilhem infraestrutura.
8. Entregar primeiro leitura mínima e operações reversíveis; só habilitar cada ação de escrita quando autorização positiva/negativa, auditoria, concorrência, rollback e interface estiverem implementados juntos.

**PoeMX/PoEMX:** a pesquisa pelo nome exato não encontrou um emulador ou CMS de jogo com fonte verificável; os resultados foram homônimos não relacionados. Não atribuímos recursos a esse nome. Polaris foi incluído como referência concreta de emulador Java derivado da comunidade Arcturus; se “PoeMX” era outro projeto, o link ou nome exato permite uma comparação específica.
