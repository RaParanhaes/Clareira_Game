# Atualização e manutenção do jogo

## Estado observado

### Atualização do cliente

O jogo já possui atualização automática de arquivos estáticos, implementada em `game/cache-update.mjs`, `game/update-monitor.mjs`, `game/bootstrap.mjs` e `game/service-worker.js`.

1. Ao abrir, o bootstrap consulta `/game-assets` sem cache e valida o manifesto, tamanho e SHA-256 dos arquivos.
2. Os arquivos novos são baixados em um cache versionado separado. O cliente reutiliza arquivos antigos somente depois de conferir o hash.
3. Só ativa o novo cache depois da conferência integral. Se um download falhar, o cache anterior continua ativo.
4. Se a versão realmente mudou, reinicia uma vez ainda na tela de carregamento para importar os módulos novos.
5. Durante a partida, `/update-version` é consultado imediatamente, a cada 5 segundos, ao voltar para a aba e ao recuperar o foco. Uma versão diferente precisa permanecer estável por 5 segundos.
6. `canApplyGameUpdate()` adia o reload durante movimento, viagem/teleporte, conexão incompleta, formulário em uso, texto digitado, diálogo aberto ou ações de movimento pendentes. Enquanto espera, a interface recebe `clareira:update-waiting` no máximo a cada 30 segundos.

O preview oferece `/update-version`, `/game-assets` e `/health`. Os dois endpoints de atualização respondem `no-store`. O servidor de sala expõe `/health` e o WebSocket `/room`. A atualização já é segura para o pacote do navegador, mas não é um coordenador de manutenção: não agenda indisponibilidade, não impede logins durante intervenção e não informa estado operacional por serviço.

### Manutenção

Não foi encontrado um modo de manutenção implementado no cliente, no preview ou no servidor de sala. `/health` hoje responde `ok`; não anuncia manutenção. O servidor WebSocket autentica e controla admissão/capacidade, mas não consulta um estado de manutenção antes de aceitar a conexão. Por isso, fechar a conexão ou parar o serviço hoje parece ao jogador uma queda comum e aciona a reconexão.

## Referências e o que vale adaptar

- Nitro é um cliente de hotel. O projeto Turbo da equipe Nitro/Krews é um emulador separado, com plugins, API REST e migrações; seu README não descreve um modo de manutenção pronto. Portanto, a manutenção deve ser procurada no CMS/emulador e na borda que admite conexões, e não presumida como função do renderer Nitro. [Turbo, repositório oficial](https://github.com/nitrodevco/turbo)
- AtomCMS separa o site/CMS do cliente Nitro e oferece configurações de hotel no Housekeeping. Isso inspira um controle administrativo para a Clareira, mas a instalação comunitária consultada não é evidência de que todas as CMS Habbo compartilhem a mesma função de manutenção. [AtomCMS, repositório](https://github.com/atom-projects/atom-cms)
- Em jogos maiores, avisos de manutenção indicam janela, sistemas afetados, desconexões esperadas e andamento. Epic mantém estados por serviço, manutenção agendada e histórico do incidente; também explica antecipadamente quais sessões e operações serão afetadas. [Epic Games Public Status](https://status.epicgames.com/?lang=en)
- Roblox documenta configs que podem ser alteradas sem republicar a experiência, com publicação gradual, e o evento `ServerRestartScheduled`, que informa o servidor sobre reinícios programados para salvar o progresso e avisar os jogadores. Isso apoia separar configuração operacional, aviso ao jogador e atualização de código. [Experience configs](https://create.roblox.com/docs/production/configs), [DataModel API](https://create.roblox.com/docs/reference/engine/classes/DataModel#ServerRestartScheduled)

## Proposta para a Clareira

Criar dois fluxos separados, mas apresentados de forma coerente:

### Atualização de versão

Manter o fluxo de manifesto e cache verificado existente. Acrescentar uma comunicação curta quando a atualização estiver aguardando um momento seguro: “Uma atualização está pronta. Vamos aplicá-la quando você parar de se mover.” Se necessário, permitir que a pessoa adie; não interromper movimento, viagem, envio de ação nem texto em edição. Depois do reload, o carregamento inicial já informa o progresso real do pacote.

Para futuras mudanças incompatíveis de protocolo ou banco, a publicação deve coordenar versão mínima de cliente e servidor. O hash atual detecta mudança em arquivos do cliente, mas sozinho não prova compatibilidade do protocolo nem coordena migração do banco.

### Manutenção operacional

Adicionar um estado operacional central e persistente no PostgreSQL (sem JSON), lido pelos serviços de entrada. O estado mínimo deve conter `mode` (`operational`, `scheduled`, `maintenance`, `degraded`), `message`, `starts_at`, `ends_at` opcional, `updated_at` e identificador do operador. A mudança deve ter trilha de auditoria. Datas são armazenadas em UTC; a interface apresenta o horário local.

Comportamento esperado:

- **Agendada:** aviso discreto no jogo, horário e sistemas afetados; permitir que o jogador conclua a ação atual. Não bloquear o acesso antes do início.
- **Ativa:** servir uma página de manutenção com o mesmo logo/linguagem visual do carregamento e da reconexão; manter endpoint de estado e health acessíveis. Recusar novos logins e novos WebSocket `/room` com resposta legível e `Retry-After` quando houver previsão.
- **Sessões já abertas:** antes da janela, avisar e congelar novas ações conforme o prazo. No início, persistir estado pendente, desconectar com motivo explícito de manutenção e reconectar com intervalo controlado. Nunca depender de o cliente adivinhar se foi falha de rede.
- **Degradada:** indicar quais partes estão afetadas sem bloquear o jogo todo quando a falha for parcial (por exemplo, login, salas ou conteúdo estático).
- **Encerrada:** retirar o bloqueio, conservar histórico interno e exibir uma mensagem curta de retorno. Se a manutenção passar do horário previsto, mostrar que continua em andamento em vez de prometer uma hora falsa.

O endpoint de estado deve ser público, `no-store` e pequeno. Health operacional e prontidão devem ser separados: liveness informa se o processo está vivo; readiness verifica dependências essenciais; estado público explica a situação ao jogador. Página estática de manutenção precisa continuar servível se o backend cair.

## Escopo recomendado para a primeira entrega

1. Migração PostgreSQL para o estado operacional e histórico/auditoria.
2. API pública somente de leitura para estado; escrita restrita a operador autorizado. Começar com comando operacional protegido ou tela administrativa existente, sem endpoint público de ativação.
3. Gate de manutenção no login e no handshake WebSocket, mantendo `/health`, página de manutenção e consulta de estado disponíveis.
4. Tela responsiva coerente com os carregamentos/reconexão, mensagem, previsão opcional e botão de tentar novamente que respeita o `Retry-After`.
5. Aviso prévio no jogo e fechamento/reconexão com motivo, quando o agendamento estiver integrado ao servidor de sala.
6. Histórico de início/fim e operação manual de emergência, além de rollback simples para `operational`.

Não usar `/update-version` como chave de manutenção: são responsabilidades e critérios de sucesso diferentes. Não colocar texto ou horário de manutenção em arquivo JSON. A primeira versão pode rodar sem calendário complexo, assinatura de status ou notificação externa; estas extensões só fazem sentido quando houver operação e audiência para justificar.

## Pontos de integração e riscos

- O preview é servido por `scripts/dev-preview-page.mjs`; a sala e o WebSocket são tratados por `scripts/prototype-server.mjs`. O gate precisa existir em ambos, além de qualquer proxy de produção, para não deixar rotas alternativas abertas.
- O serviço estático simples em `scripts/server.mjs` não contém `/game-assets` nem manutenção. O deploy de produção continua separado/em manutenção conforme `memory/STATUS.md`; não assumir que o preview é o plano de produção.
- A tabela de estado precisa ser consultada com cache curto/invalidação segura ou notificação Redis, para que uma manutenção ativada apareça em todos os processos sem reiniciá-los. Em falha ao ler estado, o endpoint de admissão deve falhar fechado para novas sessões, preservando rotas de saúde e a tela pública.
- A manutenção não substitui o mecanismo de atualização de assets: o cache verificado protege o cliente contra pacote parcial; o modo de manutenção coordena indisponibilidade e admissão.

## Critérios de aceitação antes de ativar em produção

- Estado `operational` preserva login, visitante, conta e WebSocket como hoje.
- Estado `scheduled` avisa sem interromper uma ação ou movimento.
- Estado `maintenance` bloqueia novo login e novo socket em todas as instâncias e apresenta a tela mesmo se a API do jogo não iniciar.
- Cliente recebe motivo de fechamento e não mostra uma reconexão genérica durante manutenção.
- `Retry-After` e a previsão nunca causam loop de tentativas agressivo; encerrar manutenção libera entrada sem limpar sessão ou dados persistidos.
- Ações e saves em andamento terminam ou são persistidos antes de desconectar; a trilha registra quem ativou, quando e por quê.

Este documento é uma auditoria e uma proposta de arquitetura. Nenhum modo de manutenção foi ativado nem qualquer serviço foi reiniciado.
