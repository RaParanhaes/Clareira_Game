# TASK-PLAN v2 — Housekeeping da Clareira

project: Clareira
plan_id: HOUSEKEEPING-001
plan_version: 1
canonical_source: docs/housekeeping/TASK-PLAN.md
feature_preparation_path: docs/housekeeping/FEATURE-PREPARATION.md
status: in_progress
owner_role: planner
updated_at: 2026-10-27

## Feature Layer

feature_id: HOUSEKEEPING-001
feature_title: Housekeeping, cargos, dimensões e operações de mundo
priority: P1, sequenciado após a fatia de jogo corrente
status: prepared_with_execution_gate
goal: implementar operações da equipe e autoria de mundo em PostgreSQL, autorização server-side, autoridade total delegável do Proprietário e progressão dimensional.
scope_in:
- cargos, permissões, atribuições, auditoria e migração de player/admin legado
- painel web e painel lateral de operações da equipe
- moderação e ferramentas do Proprietário
- viagem de staff e descoberta dimensional de jogadores
- sandbox persistente, editor, validação, publicação e rollback
- atualização operacional, avisos e manutenção
scope_out:
- acesso staff concedido ao Guia por ser Guia
- seletor universal de dimensões para jogador comum
- execução de SQL, shell ou script arbitrário no painel
- efeitos de gameplay sem suporte server-side
- JSON como fonte persistente de novos subsistemas
changed_subsystems: PostgreSQL/migrations, account/economy/world stores, HTTP/WebSocket auth, painel, mapa/transição/progressão, publicação de mundo, manutenção
constraints:
- seguir AGENTS.md, ROOT_POLICY.md e fluxo coordenado de ciclos
- preservar alterações locais e checkout canônico
- autorização sempre no servidor; PostgreSQL como fonte de verdade
- Proprietário executa/delega tudo sem aprovação ou limite funcional; auditoria é histórico
- validação técnica garante schema e consistência do runtime
- nunca testar grants/publicação em dados reais
assumptions: decisões em FEATURE-PREPARATION.md representam a intenção atual; manter accounts.role legado durante rollout; Guia continua jogador
open_questions: escolher/provisionar a conta do primeiro Proprietário; identificar contratos reais de sanção, emblema e manutenção antes dessas tarefas
risks: lockout administrativo, vazamento dimensional, duplicação econômica, publicação parcial, expansão excessiva
regression_risks: normalização player/admin no login/store; a.role='admin' em economy-store; snapshots/mapa podem revelar dimensões; ordem de migrações
milestones: M0 plano; M1 cargos; M2 autorização/auditoria; M3 operações/painel; M4 dimensões; M5 sandbox/publicação; M6 manutenção; M7 integração
timebox: uma fatia por ciclo sequencial
wiki_pages_to_read_before: AGENTS.md, ROOT_POLICY.md, DELIVERY_PLAN.md, memory/STATUS.md, docs/ADMIN-PLANEJAMENTO.md, docs/SANDBOX-AND-WORLD-EDITOR-PLAN.md, database/README.md
wiki_pages_to_update_after: memory/STATUS.md ao fechar ciclo; database/README.md para migrações; planos de admin/editor quando contratos forem implementados
wiki_facts_to_capture: migração implantada; matriz de permissões testada; desbloqueios dimensionais reais; passos testados de manutenção/rollback
wiki_do_not_store: secrets, tokens, hashes, credenciais, PII ou dumps de produção

## Pre-Implementation Gate

preimplementation_status: complete_for_decomposition
entry_rule: tarefas de runtime ficam draft até o coordenador abrir ciclo válido e a tarefa receber prompt de execução.
feature_preparation_path: docs/housekeeping/FEATURE-PREPARATION.md

## Active Alarms

- none; o ciclo exigido é gate de execução registrado na preparação, sem inventar run ID.

## Execution Policy

orchestration_mode: sequential_single_active_agent
default_agent_sequence: planner → implementer → reviewer → tester → docs_sync
status_legend: draft, ready, in_progress, blocked, needs_review, approved, done, dropped

## Execution Governance

mode: CODE-FIRST, NO-FICTION, ONE-TASK-ONLY
no_fiction_policy: não inventar cycle IDs, resultados de migration, credenciais, testes ou aprovações.
prompt_policy: cada tarefa recebe prompt individual com RESUME_FROM, escopo, áreas proibidas e estratégia de verificação.
code_first_policy: tarefa de implementação exige código que altere comportamento; somente tarefa documental aceita docs-only.
done_policy: dependências, ciclo, verificações executadas, revisão, rollback e docs sync aprovados.
commit_policy: preservar árvore local suja; não fazer commit junto de alterações alheias.
rollback_policy: falha bloqueia fechamento; reverter apenas mudança escopada ou corrigir para frente.
max_review_loops: 2
escalation_rule: se launcher, schema crítico ou autoridade inicial estiver indisponível, manter draft e reportar o dado faltante.

## Verification Policy

tests_required: yes
test_levels: unit, integration, e2e, smoke, manual-check-needed
test_data_origin: contas/dimensões sintéticas em banco isolado; nunca mutar conta real.
oracle: matriz allow/deny, linhas PostgreSQL após restart, destino de transição esperado e resultado visível.
negative_tests: payload forjado; permissão revogada; vazamento de dimensão; comando econômico duplicado; revisão antiga; publicação parcial.
stop_on_failure: true
commands_planned:
- node --test scripts/account-store.test.mjs database/store-atomic.test.mjs
- node --test scripts/prototype-server.test.mjs database/economy.integration.test.mjs
- npm test uma vez na integração final
- browser checks autorizados pelo ciclo para o fluxo entregue
commands_run:
- node --test database/staff-authorization.test.mjs scripts/audit-player-saves.test.mjs (8/8 passed)
- node --test database/store-atomic.test.mjs (4/4 passed)
- npm run test:backends (21/21 passed, disposable PostgreSQL/Redis)
- npm run test:backends (isolated admin migration 1/1 + PostgreSQL/Redis suite 21/21; outputs in logs/20261026T234658Z-housekeeping-hk001-*.txt)
- node --test database/staff-authorization.test.mjs scripts/audit-player-saves.test.mjs (9/9 passed; runtime bootstrap default privileges included)
- npm run test:backends (isolated admin migration/backfill 1/1 + PostgreSQL/Redis suite 22/22; verifies existing and future staff tables are read-only to runtime)
- npm run test:backends (staff migrations/session management 1/1 + PostgreSQL/Redis suite 22/22; permissions helper is reapplied after runtime role creation)
- npm run test:backends (staff migrations/session management, owner bootstrap/recovery 1/1 + PostgreSQL/Redis suite 22/22)
- cycle `20261026T234658Z-housekeeping-hk001`: painel protegido passou na integração isolada; suíte PostgreSQL/Redis: 21/22, falha independente por expectativa obsoleta de 215 instâncias no catálogo de objetos.
- cycle `20261026T234658Z-housekeeping-hk001`: `node --test scripts/dev-preview-page.test.mjs database/staff-authorization.test.mjs database/staff-migration.integration.test.mjs` (10 passaram, 1 ignorado; migração isolada exercida no harness de backends).
- cycle `20261026T234658Z-housekeeping-hk001`: Chromium verificou lista de cargos, matriz de permissões e auditoria em desktop/celular, sem erros de console; imagens e log em `logs/housekeeping-panel-{desktop,mobile}.png` e `logs/20261026T234658Z-housekeeping-hk001-panel-browser.txt`.
- 2026-10-27: operação de ajuste de moedas adicionada na migração 031, com capacidade `economy.adjust`, lock compartilhado com compras, limites de saldo, hierarquia e auditoria transacional; Proprietário é o único que recebe autoridade total por padrão.
- 2026-10-27: `npm run test:backends` (migração/API isolada, sanções e saldo: 1/1; PostgreSQL/Redis 23/24). Falha conhecida e independente em `database/object-catalog.integration.test.mjs:12` (asserção do catálogo); log em `logs/20261027T075634Z-housekeeping-hk001-wallet-http-backends.txt`.
- 2026-10-27: `node --test database/staff-authorization.test.mjs scripts/dev-preview-page.test.mjs database/staff-migration.integration.test.mjs` (12 passaram, 1 ignorado; a integração isolada roda via harness de backends).
- 2026-10-27: Chromium verificou ajuste de saldo, motivo, valor retornado, cargos, auditoria, moderação e sanções em desktop/celular, sem erros de console; log `logs/20261027T075634Z-housekeeping-hk001-wallet-browser.txt` e imagens `logs/housekeeping-economy-desktop.png`, `logs/housekeeping-moderation-desktop.png`, `logs/housekeeping-panel-desktop.png` e `logs/housekeeping-panel-mobile.png`.
- 2026-10-27: `git diff --check` e verificações de sintaxe dos módulos alterados passaram.
- node --test scripts/dev-preview-page.test.mjs database/staff-authorization.test.mjs scripts/audit-player-saves.test.mjs (14/14 passed)
- npm test (interrompido após mais de 15 minutos em scripts/prototype-server.test.mjs; não chegou à etapa Python; um teste anterior de aparência falhou)
- node --test scripts/appearance-server.test.mjs (0/1 passed; reproduz Missing appearance snapshot em scripts/appearance-server.test.mjs:13)

## Task Register

| task_id | title | status | priority | owner_role | depends_on | required_approvals |
| --- | --- | --- | --- | --- | --- | --- |
| HK-001 | Persistência de cargos e permissões | needs_review | P1 | backend/auth | [] | migration-review, security-review |
| HK-002 | Autorização, delegação e auditoria | needs_review | P1 | backend/auth | [HK-001] | security-review, code-review |
| HK-003 | Operações de staff e Proprietário | in_progress | P1 | backend/gameplay | [HK-002] | economy-review, security-review |
| HK-004 | Painéis e fluxos de moderação | in_progress | P1 | frontend/admin | [HK-002, HK-003] | ux-review, security-review |
| HK-005 | Descoberta e viagem dimensional | in_progress | P1 | gameplay/network | [HK-002] | gameplay-review, privacy-review |
| HK-006 | Sandbox/editor/publicação de mundo | draft | P2 | world/editor | [HK-002, HK-005] | world-review, security-review |
| HK-007 | Manutenção e operações de atualização | draft | P2 | operations/backend | [HK-002, HK-004] | operations-review, security-review |
| HK-008 | Integração e validação final | draft | P1 | tester/docs_sync | [HK-001..HK-007] | product-acceptance |

## TASK HK-001 — Persistência de cargos e permissões

task_id: HK-001
title: Fundação PostgreSQL para cargos e permissões
rationale: substituir semântica única player/admin sem perder contas nem criar bypass implícito.
priority: P1
status: needs_review
owner_role: backend/auth
dependencies: []
blocked_by: independent migration/security review and first-owner account selection; preview remains inactive
unblocks: [HK-002]
task_size: L
goal: persistir cargos canônicos, catálogo de capacidades suportadas e atribuições; migrar admin legado; expor consulta compatível.
scope_in: migração aditiva PostgreSQL; seed de cargos; serviço de resolução incluindo Proprietário total; compatibilidade durante rollout.
scope_out: painel completo; permissões sem serviço real; provisionamento real ou alteração em produção.
candidate_files: database/migrations/, database/README.md, database/staff-authorization.mjs, database/store.mjs, database/economy-store.mjs e testes focados.
forbidden_areas: restaurar/remover arquivos locais; resetar banco de produção; reiniciar preview sem ciclo.
constraints: accounts.role aceita player/admin; economy-store compara a.role='admin'; manter migração aditiva.
open_questions: escolher a conta real que receberá o primeiro cargo Proprietário.
risks: lockout; grant indevido ao Guia; papel admin legado divergir da atribuição nova.
security_privacy_notes: autenticação continua obrigatória; cliente nunca define cargo/permissão; sem credenciais em logs.
acceptance_criteria:
- conta admin existente continua autorizada no rollout
- Guia não ganha staff
- Proprietário é autorizado para toda capacidade registrada
- atribuições sobrevivem a restart PostgreSQL
- nenhuma cascata apaga auditoria silenciosamente
acceptance_checks: migration applied in disposable PostgreSQL; scoped permission/inheritance/owner wildcard integration; allow/deny unit; runtime role can read every table used by permission resolution; legacy account backfill and effective access verified before/after migration.
exit_criteria: checks aprovados, revisão de migration/segurança registrada, rollback testado e docs sincronizados.
rollback_plan: manter leitura legada durante rollout; voltar aplicação sem apagar atribuições/tabelas; rollback destrutivo só após backup e revisão.
active_alarm_ids: none
resolved_alarm_ids: none
required_approvals: migration-review, security-review
max_review_loops: 2
escalation_rule: sem recuperação verificável do Proprietário inicial, não ativar atribuições reais; manter draft e apontar passo operacional faltante.
tests_required: yes
test_levels: unit, integration
test_targets: resolver de cargos, migration, store PostgreSQL, compatibilidade admin legado.
test_data_origin: contas sintéticas em PostgreSQL descartável.
oracle: matriz acordada retorna acessos esperados e contas existentes permanecem semanticamente intactas.
negative_tests: jogador/Guia não atribui cargos nem forja permissões; revogação bloqueia próxima chamada.
determinism_notes: fixtures fixas; sem conta real ou relógio de produção.
flakiness_risk: inicialização opcional PostgreSQL; usar harness isolado existente.
stop_on_failure: true
commands_planned: node --test scripts/account-store.test.mjs database/store-atomic.test.mjs; integração migration PostgreSQL isolada.
commands_run:
- node --test database/staff-authorization.test.mjs scripts/audit-player-saves.test.mjs (8/8 passed)
- node --test database/store-atomic.test.mjs (4/4 passed)
- npm run test:backends (21/21 passed; test-only database removed by harness)
- npm run test:backends (isolated admin migration 1/1 + PostgreSQL/Redis suite 21/21; test databases removed by harness)
- npm test (interrompido após mais de 15 minutos em scripts/prototype-server.test.mjs; um teste anterior de aparência falhou; etapa Python não executada)
- node --test scripts/appearance-server.test.mjs (falha reproduzida: Missing appearance snapshot; fora dos arquivos desta fatia)
- após corrigir o grant de SELECT em staff_role_inheritance: node --test database/staff-authorization.test.mjs scripts/audit-player-saves.test.mjs (8/8) e npm run test:backends (21/21)
- após revisão local dos grants: migration 027 revoga mutações nas seis tabelas de staff; bootstrap reverte grants amplos em tabelas existentes e limita defaults futuros a SELECT. Harness descartável confirmou INSERT/UPDATE/DELETE negados também em tabela criada depois do bootstrap simulado. Ativação e preview continuam intactos; aprovação independente pendente.
expected_artifacts: migration, resolver, testes unitários e integração isolada de backfill legado, mais nota do schema.
test_artifacts: logs/20261026T234658Z-housekeeping-hk001-unit.txt; logs/20261026T234658Z-housekeeping-hk001-backends.txt; logs/20261026T234658Z-housekeeping-hk001.result.json.
review_artifacts: []

## TASK HK-002 — Autorização, delegação e auditoria

task_id: HK-002
title: Operações autenticadas de cargos e capacidades
status: needs_review
depends_on: HK-001
scope_in: funções PostgreSQL transacionais SECURITY DEFINER com privilégio mínimo; criação de cargos, atribuição/revogação, delegação de capacidades; rotas autenticadas do preview; auditoria atômica; grant explícito após a criação do papel runtime.
scope_out: painel visual, sanções, economia, teleportes e operação real do Proprietário.
constraints: resolver ator a partir de sessão válida; runtime sem DML direto em tabelas staff; delegação limitada pela autoridade do ator e hierarquia, com wildcard total somente quando autorizado pelo Proprietário.
acceptance_criteria: sessão expirada/ausente nega; jogador nega; origem de escrita inválida nega; proprietário pode gerir/delegar; staff delegado só atua abaixo do nível e só delega capacidades próprias; mudança e auditoria são atômicas; runtime tem EXECUTE nas funções públicas e nenhum EXECUTE nos helpers internos.
verification: backfill e funções em PostgreSQL descartável; rotas HTTP com sessão sintética; privilégios efetivos do runtime; casos allow/deny de hierarquia, sessão e origem.
rollback_plan: migração é aditiva; desativar rotas e retirar EXECUTE em correção futura; não excluir atribuições ou auditoria.
current_evidence: logs/20261026T234658Z-housekeeping-hk001-hk002-backends.txt
remaining: revisão de segurança/código independente e escolha da conta para bootstrap do primeiro Proprietário; a primeira superfície de gestão está em HK-004.

## TASK HK-004 — Painéis e fluxos de moderação (execução parcial)

status: in_progress
cycle_id: 20261026T234658Z-housekeeping-hk001
completed_slice: painel web local para gestão de cargos, atribuições, auditoria e moderação; HTML, CSS e JavaScript exigem sessão e capacidade ativa no servidor.
implemented: herança direta/transitiva de permissões; contagem de atribuições ativas; busca e consulta de conta; atribuir/revogar com motivo e confirmação; delegação limitada; fila de denúncias; claim/concluir/arquivar/reabrir auditáveis; consulta e histórico de sanções; aplicação e revogação com confirmação; permissões específicas mostram apenas seções autorizadas; layout responsivo.
not_implemented: painel lateral dentro do jogo; recurso/apelação do jogador; ferramentas operacionais específicas do Proprietário.
verification: integração HTTP PostgreSQL isolada permite acesso do Moderador e nega ao jogador comum; regression fixture confirma que `reports.read` só vê denúncias atribuídas ao próprio moderador e `reports.manage` vê a fila. Chromium verifica cargos, herança, auditoria, transição de denúncia, aplicação de mute e viewport móvel sem erros de console. Testes focados: 11/11. Suite PostgreSQL/Redis: 22/23; a única falha independente era a expectativa obsoleta de 215 instâncias no catálogo de objetos.
blocker: revisão independente de segurança/UX pendente. Interface não ativada no preview.

## TASK HK-003 — Operações de staff e Proprietário (execução parcial)

status: in_progress
cycle_id: 20261026T234658Z-housekeeping-hk001
completed_slice: migrações PostgreSQL 030–032; serviço transacional de denúncias/sanções e ajuste auditado de saldo; rotas autenticadas; enforcement de sanções; acesso dimensional de staff e isolamento das descobertas do jogador; Proprietário entra em casa de jogador conectado como visitante.
implemented: Denúncia autenticada de conta não visitante; consulta privada; claim/resolve/dismiss/reopen auditáveis; mute temporário; kick, suspensão e banimento com hierarquia e capacidades próprias; revogação auditada; login/handshake negados durante kick/suspensão/ban ativo; mute aplicado ao chat; ajuste de carteira com lock, limites e auditoria; viagem dimensional de staff com checagem server-side e sem cooldown entre viagens; descobertas iniciais e legado persistidas; jogador comum só recebe/visita dimensões descobertas ou sua chegada pessoal; snapshots retiram dimensões pessoais e a capacidade de Proprietário dos estados compartilhados; Proprietário autenticado por `*` pode visitar a casa de conta conectada, inclusive cabana, sem editar; a porta devolve ao ponto de entrada e queda de conexão não salva a visita como residência.
verification: PostgreSQL isolado cobre denúncias/sanções, carteira, negação de viagem forjada, descoberta Inferno por Bola de Fogo II, persistência atômica e viagem liberada; viagem de staff não cria descoberta de jogador. Testes focados de autorização/snapshot: 23/23; progressão + store atômico: 14/14; WebSocket de descoberta: 1/1; tutorial de chegada: 4/4. Suíte PostgreSQL/Redis mais recente: 25/25, incluindo a correção da expectativa obsoleta de 215 instâncias no seed atual. Visita do Proprietário: teste WebSocket verifica autorização, modo somente leitura, porta de retorno e reconexão no local de origem (1/1; `logs/20261027T102300Z-housekeeping-hk001-owner-home.txt`).
not_implemented: recurso/apelação do jogador; emissão/remoção de emblemas; portais físicos e outros vínculos de conhecimento dimensional; acesso administrativo a contas offline e a interface de busca/painel lateral; sandbox, publicação de mundos e manutenção.
remaining: completar os fluxos operacionais do Proprietário, portais físicos e novas descobertas por conhecimento, recurso e aviso ao jogador, painel lateral, sandbox/publicação e manutenção; revisão independente de segurança/UX e escolha/provisionamento da conta real do Proprietário continuam pendentes. Preview permanece intacto.
evidence: `logs/20261026T234658Z-housekeeping-hk001-moderation-backends.txt`, `logs/20261026T234658Z-housekeeping-hk001-moderation-focused.txt`, `logs/20261027T075634Z-housekeeping-hk001-wallet-http-backends.txt`, `logs/20261027T075634Z-housekeeping-hk001-wallet-browser.txt`, `logs/20261027T085100Z-housekeeping-hk001-dimension-final-check.txt`, `logs/20261027T090900Z-housekeeping-hk001-dimension-knowledge-check.txt`

## TASK HK-005 — Descoberta e viagem dimensional (execução parcial)

status: in_progress
cycle_id: 20261026T234658Z-housekeeping-hk001
completed_slice: acesso dimensional individual com bloqueio server-side, isolamento da lista pessoal em snapshots compartilhados e primeiro desbloqueio por conhecimento.
implemented: superfície e Breu iniciais; backfill das dimensões legadas visitadas; viagens livres de staff sem conceder descoberta ao perfil; Bola de Fogo II revela Inferno quando aprendida; progresso e descoberta `knowledge` persistem atomicamente no PostgreSQL; o destino só aparece ao jogador após a descoberta e a viagem passa a ser aceita.
not_implemented: portais físicos, regras de localização/ativação de portal, outros vínculos conhecimento→dimensão, interface para criação de portais.
verification: jogador comum não vê Inferno e viagem forjada é negada; aprender Bola de Fogo II grava progresso e descoberta na mesma transação; teste integrado então aceita viagem; rollback simulado confirma que falha ao registrar a descoberta também reverte progresso.
evidence: `logs/20261027T090900Z-housekeeping-hk001-dimension-knowledge-check.txt`
remaining: definir e implementar conhecimento de acesso às demais dimensões e portais encontráveis no mundo; revisar privacidade e fluxo de descoberta.

## Decision Log

- 2026-10-27: nome público do cargo é Gerente.
- 2026-10-27: Proprietário tem autoridade total delegável; auditoria é histórico, não gate.
- 2026-10-27: Guia continua jogador; acesso dimensional depende de descoberta específica.
- 2026-10-27: mudanças de runtime seguem o ciclo coordenado definido em AGENTS.md.
- 2026-10-27: lista dimensional é estado pessoal; snapshots comuns removem esse campo e o servidor valida cada viagem. Bola de Fogo II revela Inferno com progresso/desbloqueio atômicos; outros conhecimentos e portais físicos seguem pendentes.
- 2026-10-27: falha do catálogo era uma expectativa fixa de 215 objetos apesar de seed atual intencionalmente ter 212; teste de banco vazio agora compara exatamente com o seed (239 modelos/212 objetos) e protege a janela única da cabana. Catálogo já persistido não é reescrito pelo bootstrap.
