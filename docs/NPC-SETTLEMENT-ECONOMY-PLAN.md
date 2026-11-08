# NPCs, assentamentos e economia — plano incremental

plan_id: npc-settlement-economy-v1
plan_version: 1
canonical_source: este arquivo
status: draft
owner_role: planner
updated_at: 2026-10-26

## Feature Layer

feature_id: NPC-SETTLEMENT-ECONOMY
feature_title: NPCs com profissões ligadas ao abastecimento e comércio dos assentamentos
rationale: Dar vida às vilas e criar uma economia em que o trabalho de NPCs abastece necessidades reais dos jogadores.
priority: futuro marco jogável, depois das entregas prioritárias de DELIVERY_PLAN.md
status: draft
goal: Entregar por fatias uma cadeia regional em que NPCs produzem, transportam e vendem bens finitos, e jogadores podem comprar, encomendar ou contribuir.
scope_in:
- Atores NPC distintos de jogadores, papéis explícitos e autoridade do servidor.
- Produção finita, estoques regionais, transações idempotentes e encomendas.
- Lenhador, minerador, mercador, ferreiro e soldado como etapas sequenciais.
- Começar pela recepção de trocas existente como guilda, antes de construir um edifício novo.
- Manter papéis institucionais claros: guilda cuida de trabalho, compras e encomendas; prefeitura cuida de orçamento, projetos e regras do assentamento.
- Estado compacto dos NPCs próximos; arte preparada no carregamento inicial.
- Recompensas dos jogadores calibradas por tempo, risco e contribuição.
scope_out:
- Entregar de uma vez todas as cidades, profissões, rotas, armas e combate.
- Gerar bens ou moedas sem fonte, limite, estoque e registro.
- Simular NPCs por quadro ou transmitir toda a população a todos.
- Mercado entre jogadores, empréstimos e novos impostos no MVP.
changed_subsystems:
- atores e snapshots multiplayer; carregamento e renderização de cenas
- recursos compartilhados; guilda, comércio e encomendas
- PostgreSQL, estoque regional, carteira e diário financeiro
- economia de recompensas e telemetria agregada
constraints:
- PostgreSQL é a fonte persistente; Redis não guarda a verdade econômica.
- NPC é entidade viva/ativa, diferente de objeto de cena; consultar docs/content/SCENE-OBJECTS.md.
- Arte estática é preparada antes; snapshots próximos carregam estado autoritativo mínimo.
- Usar bronzes inteiros e lançamentos balanceados.
- Confirmar as migrações realmente aplicadas antes de qualquer implementação.
- Este planejamento não altera a fatia em execução nem inicia o próximo ciclo.
assumptions:
- A recepção arrival / Trocas da Vila pode ser a primeira guilda.
- O jogador já vende materiais ao balcão; compra geral de itens precisa ser implementada ou confirmada.
- Reutilizar árvores, veios, itens, receitas, venda e encomendas existentes quando compatíveis.
- O primeiro lenhador trabalha em posto fixo visível; sem pathfinding autônomo no MVP.
open_questions:
- Trabalho offline: recomendação é turno determinístico com limite de recuperação após reinício, nunca produção ilimitada.
- Encomendas: recomendação é exibir preço/prazo e reservar fundos claramente; devolver reserva em cancelamento/expiração.
- Volume por turno, limite de recuperação e estoque inicial dependem de teste e simulação; não fixar números agora.
- Soldados dependem de contrato de combate, facção, zona e consequência de derrota; ficam para depois.
risks:
- Produção automática pode causar inflação ou esvaziar recursos compartilhados.
- Concorrência pode duplicar colheita, mercadoria, carteira ou entrega sem transação e idempotência.
- Atores/rotas podem aumentar tráfego, simulação e colisões, especialmente no celular.
- Rotas que apenas teleportam mercadorias tornam distância e região irrelevantes.
- Recompensas mal calibradas tornam caça obrigatória ou coleta inútil.
regression_risks:
- Alterar árvores/veios pode quebrar progressão salva e regeneração ambiental.
- Mudanças na recepção podem quebrar vendas, ferramentas, contratos e serviços atuais.
- NPC não pode bloquear spawn, portas, trilhas ou controles sem regra visível.
security_privacy_notes:
- IDs de NPC e ordem são dados de jogo, nunca identidade de conta.
- Cliente não decide função, estoque, produção, preço, saldo ou conclusão.
- Métricas de economia devem ser agregadas, sem dados pessoais.
non_functional_requirements:
- Simulação em turnos agendados, nunca por quadro; snapshots limitados à região próxima.
- Retry e reconexão não duplicam produção nem pagamentos.
- Compra e produção alteram estoque, itens, carteira e diário atomicamente.
- Ator interpola no cliente e não bloqueia controles de desktop/toque.
milestones:
- M0: fechar contrato de domínio e auditar banco/economia ativos.
- M1: lenhador abastece estoque finito e jogador compra lenha na guilda.
- M2: quadro de encomendas reserva e liquida pedidos reais.
- M3: mercador transporta remessa visível entre vila e assentamento mineiro e pode vender a carga disponível no trajeto.
- M4: minerador abastece minério/carvão; ferreiro faz equipamento utilizável.
- M5: prefeitura usa orçamento e encomendas públicas para financiar necessidades do assentamento.
- M6: soldado patrulha zona protegida com regras de combate seguras.
- M7: calibrar preços e recompensas por trabalho, coleta e caça com dados de jogo.
timebox: Um milestone por ciclo, com duração definida pelo coordenador.
wiki_pages_to_read_before:
- AGENTS.md; DELIVERY_PLAN.md
- docs/RESOURCE-ECONOMY-PLAN.md; docs/DYNAMIC-ECONOMY-DESIGN.md
- docs/content/SCENE-OBJECTS.md; docs/content/README.md; docs/content/loading-design.md
wiki_pages_to_update_after:
- docs/RESOURCE-ECONOMY-PLAN.md
- docs/DYNAMIC-ECONOMY-DESIGN.md
- memory/STATUS.md
wiki_facts_to_capture:
- contrato de actor/snapshot; turnos e limite offline
- origem e liquidação de estoque; preços e recompensas medidos
- migrações realmente aplicadas e rollback
wiki_do_not_store:
- segredos, dados pessoais, tokens e logs individuais

## Pre-Implementation Gate

feature_preparation_path: integrado neste arquivo
preimplementation_status: draft
entry_rule: tarefas de implementação ficam draft até fechar política de turnos/offline, encomendas e estado do banco. Não começar por framework genérico de NPCs.

### Base existente verificada

- A coleta e produção jogável já inclui madeira, ferramentas, mineração, carvão, fornalha, lingotes, venda e quatro encomendas diárias: docs/RESOURCE-ECONOMY-PLAN.md.
- A venda atual é do jogador para o balcão, via lodgeSell em scripts/prototype-server.mjs. Não foi encontrado fluxo geral de compra de mercadorias pelo jogador.
- Há estrutura de economia dinâmica, cotação e estoque nos arquivos database/economy-store.mjs e migrações 016–024; a disponibilidade no banco do ambiente alvo precisa ser auditada, não inferida dos arquivos.
- O primeiro runtime visual de moradores está em `game/village-npcs.mjs`: seis atores leves no máximo, distribuídos nas clareiras da vila; quatro se reúnem sentados na fogueira à noite. Atores são enviados só no snapshot completo da região e não colidem nem simulam por quadro. Ainda não têm profissão, interação ou persistência própria.
- `docs/content/SCENE-OBJECTS.md` define NPC como actor, não objeto persistente de cenário; o protótipo segue essa distinção.
- A jornada de NPC não substitui a prioridade atual de DELIVERY_PLAN.md.

### Integração com a economia existente

Este plano acrescenta atores, profissões, turnos e rotas. `docs/DYNAMIC-ECONOMY-DESIGN.md` continua sendo a referência para moeda, cotação, estoque, tributação, diário e contas governamentais. As tarefas de NPC conectam esses sistemas; não criam uma economia paralela.

| Necessidade de NPC | Base econômica a reutilizar | Lacuna que a auditoria precisa confirmar |
|---|---|---|
| Cotação e catálogo | `economy_goods`, `economy_quotes`, `game/economy.mjs` e `database/economy-store.mjs` | A loja atual usa `REGION='global'` e `arrival:market`; M1 fica nesse mercado. Cotação/estoque por região fica para quando houver suporte regional real. |
| Estoque e venda ao jogador | `economy_market_stock`; a venda atual do jogador já credita bens ao balcão | A produção do lenhador alimenta o mesmo estoque com limite e idempotência. Não criar inventário de NPC em paralelo. |
| Compra do jogador | Carteira, `inventory_items`, transação de venda e diário existentes | `settleNpcSale` cobre jogador → balcão; falta confirmar/implementar a direção balcão → jogador, atualizando também `units_bought_from_npc` nos fluxos diários. Sem nova carteira ou livro razão. |
| Produção de profissão | Migração 024 define `economic_production_events`, com `source_reference` e `idempotency_key` | Auditar serviço e schema ativo. Referenciar o ID do actor NPC; não inventar perfil de jogador nem usar pagamento salarial ligado a perfil para representar NPC. |
| Encomendas da guilda | Encomendas diárias atuais e estoque reservado disponível no schema de mercado | As encomendas atuais entregam itens do jogador por recompensa; não são pedidos de compra da guilda. Não foi localizado serviço/tabela genérico de ordens. Reutilizar reserva apenas se o contrato existente servir; caso contrário, extensão aditiva após NPC-001. |
| Remessas | Migração 024 modela comércio entre governos | Isso se aplica a governos distintos, não a uma rota local dentro do mesmo governo. Auditar antes de reaproveitar; modelar remessa local só se faltar um contrato compatível. |
| Prefeitura | Schema de tesouro, fundos e projetos, incluindo migração 018 | Parte das operações ainda não existe. NPC-006 deve estender esses fluxos e permissões, sem criar orçamento paralelo. |

Os arquivos de migração provam que há um modelo no repositório, não que ele esteja aplicado ou operacional no ambiente alvo. NPC-001 é o gate obrigatório para conferir isso. A estratégia faseada e a distinção entre schema desenhado e serviço implementado estão em `docs/DYNAMIC-ECONOMY-DESIGN.md`.

### Primeiro corte jogável recomendado

O runtime visual dos moradores é uma prova técnica inicial, não a conclusão do ciclo econômico. Ele estabelece spawn limitado por região, distribuição diurna e encontro noturno sem acrescentar colisões ou tráfego por quadro. A próxima fatia deve transformar um ator em lenhador com produção autorizada e compra real, após NPC-001 auditar estoque, carteira, diário e banco ativo.

Um lenhador trabalha num posto próximo à Vila da Chegada, consome um recurso compartilhado real sob as mesmas regras de regeneração do jogador e entrega quantidade limitada ao estoque da guilda. O jogador compra um lote desse estoque na recepção. O servidor valida recurso, estoque, preço, capacidade, carteira e idempotência; estoque, mochila, carteira e diário mudam atomicamente. O cliente usa arte pré-carregada e recebe posição, direção e estado de trabalho do NPC próximo.

Não incluir no primeiro corte navegação autônoma, segunda cidade, preço dinâmico ativo, encomenda paga antecipadamente, minério, armas, soldados ou combate. A compra direta prova a primeira cadeia; encomendas e rotas vêm depois.

Instituições futuras devem continuar distintas: a guilda organiza trabalho, venda de materiais, compras e encomendas; a prefeitura administra tesouro, orçamento, projetos e prioridades públicas. No primeiro ciclo, a recepção de trocas é somente o ponto de serviço da guilda. Não criar um segundo prédio administrativo até que esses fluxos tenham regras jogáveis.

### Jornada e oráculo do MVP

1. O jogador vê um NPC lenhador trabalhando; a animação corresponde ao estado de servidor.
2. Um turno produz apenas se houver recurso elegível e espaço de depósito; a mesma unidade não pode ser colhida também por um jogador.
3. A guilda mostra quantidade e cotação disponíveis; estoque zero bloqueia compra com explicação.
4. Compra válida debita bronzes, reduz estoque, adiciona os mesmos itens à mochila e registra o diário uma vez.
5. Saldo insuficiente, mochila cheia, estoque concorrente, repetição, queda ou falha de banco não criam nem apagam bens/moeda.
6. Venda e encomendas atuais continuam funcionando.

Oracle: com dois clientes e conta autenticada, valores de recurso, estoque, itens, carteira e linhas do diário coincidem exatamente; replay não altera os valores; ator aparece em 1440x900, 390x844 e 320x640 sem bloquear rotas. PostgreSQL de teste e inspeção do navegador são obrigatórios.

### Defaults a validar antes de ready

- Turnos determinísticos e limitados; sem produção por quadro nem acúmulo offline ilimitado.
- Comparar timber (madeira bruta) e wood (graveto seco usado como lenha); não confundir IDs salvos.
- Começar por compra do estoque existente; pedidos com reserva ficam em M2.
- Coleta deve render pouco por minuto; caça pode render mais por risco/tempo, após medir ferramentas, viagem e repetibilidade.
- Auditar migrações aplicadas, cotação ativa e estoque antes de criar novas tabelas.

## Active Alarms

feature_active_alarms: none; nenhuma integração falsa ou placeholder de runtime está planejada.
feature_resolved_alarms: none

## Execution Governance

orchestration_mode: sequential
mode: CODE-FIRST, NO-FICTION, ONE-TASK-ONLY
agent_sequence: planner -> implementer -> reviewer -> tester -> docs_sync
prompt_policy: prompt com RESUME_FROM, escopo, exclusões, alarmes e verificação antes de mover qualquer tarefa para in_progress.
no_fiction_policy: não inferir estado de migração, cotação ou persistência; confirmar no ambiente real.
mock_policy: fixtures sintéticas só em teste; nunca fonte de bens, moeda ou resultado no jogo.
done_policy: dependências, aprovações, testes executados, evidência atual, rollback e documentação sincronizada são necessários para done.
rollback_policy: migração aditiva com backup validado; feature flag para parar produção nova; transações confirmadas não são apagadas.
required_approvals:
- dono: remuneração, escassez, guilda e regras de combate
- reviewer/tester: concorrência, segurança e persistência
- coordenador: ciclo, migração e ativação do preview
max_review_loops: 2
escalation_rule: se schema ou regra econômica crítica não puder ser confirmada, manter draft/blocked e devolver o fato específico que falta.

## Verification Policy

tests_required: yes
test_levels: unit, integration, e2e, manual-check-needed
test_targets:
- disputa de recurso entre jogador e NPC
- idempotência de turno, compra e encomenda
- atomicidade de estoque, mochila, carteira e diário
- reconexão, restart e limite de produção offline
- desktop, celular e rota sem bloqueio
test_data_origin: fixtures determinísticas em teste; catálogo e recursos reais no navegador
oracle: igualdade exata de quantidade debitada, creditada, entregue e lançada no diário; nenhum efeito duplicado após retry
negative_tests: estoque zero/concorrido, saldo insuficiente, mochila cheia, recurso regenerando, ordem repetida, falha de persistência e queda durante liquidação
stop_on_failure: true
commands_planned: definir por tarefa após confirmar scripts e ambiente de banco
commands_run: nenhum; este arquivo é planejamento, não validação de implementação NPC

## Task Register

| task_id | title | status | priority | dependencies | size | milestone |
|---|---|---|---|---|---|---|
| NPC-001 | Fechar contrato do domínio e auditar banco ativo | draft | P0 | none | S | M0 |
| NPC-002 | Lenhador até estoque comprável na guilda | draft | P0 | NPC-001 | L | M1 |
| NPC-003 | Quadro de encomendas com reserva e liquidação | draft | P1 | NPC-002 | L | M2 |
| NPC-004 | Mercador e remessa visível entre assentamentos | draft | P1 | NPC-003 | XL | M3 |
| NPC-005 | Minerador, fundição e ferreiro | draft | P1 | NPC-004 | XL | M4 |
| NPC-006 | Prefeitura e compras públicas auditáveis | draft | P1 | NPC-003 | L | M5 |
| NPC-007 | Soldado e patrulha com combate seguro | draft | P2 | NPC-005, NPC-006 | XL | M6 |
| NPC-008 | Equilibrar trabalho, coleta e caça | draft | P1 | NPC-002 | M | M7 |

## Tasks

### TASK NPC-001 — Contrato do domínio e auditoria do banco

task_id: NPC-001
status: draft
owner_role: planner
priority: P0
task_size: S
timebox: um ciclo; duração definida pelo coordenador
dependencies: none
blocked_by: defaults de turno/offline e inspeção do banco-alvo
unblocks: NPC-002
goal: Fechar regra implementável de actor, turno limitado, estoque finito e compra direta; auditar schema e serviços econômicos do banco-alvo.
scope_in: role IDs, recurso disputado, relógio/offline, estoque, preço, funding, idempotência, fallback fixo e estado de migrações.
scope_out: runtime, novas cidades, preço dinâmico ativo, profissões adicionais e combate.
candidate_files: docs/NPC-SETTLEMENT-ECONOMY-PLAN.md, docs/DYNAMIC-ECONOMY-DESIGN.md, database/README.md
forbidden_areas: não aplicar migrações nem iniciar implementação neste gate.
acceptance_criteria: decisões críticas têm regra e dono; schema ativo é verificado diretamente; lacunas permanecem blockers explícitos.
exit_criteria: contrato revisado, banco conferido e nenhum campo crítico desconhecido antes de promover NPC-002.
open_questions: limite offline e semântica de encomenda; defaults propostos na seção anterior.
verification_strategy: consulta do schema ativo + testes existentes de venda/estoque; resultado factual, sem presumir que arquivos SQL foram aplicados.
negative_tests: confirmar ausência/presença da compra geral e fallback sem cotação/estoque.
rollback_plan: reverter somente atualização documental se uma premissa for desmentida.
required_approvals: dono para defaults; reviewer para integridade.
agent_contracts: planner audita e fecha contrato -> reviewer verifica -> dono aprova defaults.
max_review_loops: 2
escalation_rule: não promover NPC-002 se banco ou regra offline continuarem desconhecidos.

### TASK NPC-002 — Lenhador até estoque comprável na guilda

task_id: NPC-002
status: draft
owner_role: implementer
priority: P0
task_size: L
timebox: um ciclo após NPC-001
dependencies: NPC-001
blocked_by: compra de mercadoria e disponibilidade de estoque confirmadas no banco
unblocks: NPC-003, NPC-008
goal: Lenhador visível consome recurso real, abastece estoque finito e vende item de fogo/madeira para uma conta na recepção.
scope_in: actor lenhador, posto em Arrival, turno limitado, disputa de recurso, estoque, cotação, compra, diário e snapshot local.
scope_out: pathfinding comercial, nova cidade, encomenda antecipada, mineração, armas e soldados.
candidate_files: game/main.js, game/place-panel.mjs, game/place-services.mjs, scripts/prototype-server.mjs, database/economy-store.mjs; novo game/npc-roles.mjs e migração apenas se auditoria provar necessidade.
integration_contract: usar economy_market_stock e economy_quotes; compra inverte o fluxo de liquidação existente e atualiza economy_daily_flows; não criar carteira, diário, catálogo ou perfil de jogador para NPC.
forbidden_areas: não renomear wood/timber nem transformar NPC em conta de jogador.
acceptance_criteria: compra movimenta estoque, itens, carteira e diário atomicamente; retry não duplica; recurso disputado só é dado a um ator; arte chega antes e ator próximo não bloqueia caminho.
exit_criteria: todos os testes negativos e de concorrência passam; ator e compra inspecionados em desktop/celular; diário conciliado.
verification_strategy: unit + PostgreSQL concorrente/restart + dois clientes + navegador desktop/celular.
negative_tests: saldo insuficiente, mochila cheia, estoque zero/concorrido, recurso regenerando, replay, disconnect e erro do banco.
rollback_plan: feature flag interrompe turno/compra; preservar transações confirmadas e conciliar estoque.
required_approvals: reviewer e tester; coordenador para migração/preview.
agent_contracts: planner fixa arquivos e comandos -> implementer entrega ciclo -> reviewer confere domínio -> tester executa cenário -> docs_sync registra regra/evidência.
max_review_loops: 2
escalation_rule: desligar compra NPC se conciliação ou idempotência falhar.

### TASK NPC-003 — Encomendas com reserva e liquidação

task_id: NPC-003
status: draft
owner_role: implementer
priority: P1
task_size: L
timebox: um ciclo após NPC-002
dependencies: NPC-002
blocked_by: regra de reserva, cancelamento e expiração aprovada
unblocks: NPC-004
goal: Pedido da guilda é cumprido com bem real e uma reserva é liquidada ou devolvida uma só vez.
scope_in: item, quantidade, cotação, prazo, reserva, estados, expiração, cancelamento, fulfillment e histórico.
scope_out: ordens de jogador para jogador, leilão, crédito e encomenda sem funding.
candidate_files: game/resource-contracts.mjs, game/place-panel.mjs, scripts/prototype-server.mjs, database/economy-store.mjs; migração aditiva se necessária.
integration_contract: contratos diários atuais são entrega do jogador por recompensa, não ordem de compra da guilda; auditar reserved e serviço de ordens antes de estender.
acceptance_criteria: preço/prazo são visíveis; item só é entregue com estoque real; cancelar/expirar devolve reserva uma vez; IDs atuais das encomendas diárias são preservados.
exit_criteria: reservas e liquidações conciliadas sob concorrência e repetição no PostgreSQL.
verification_strategy: integração concorrente e navegador com conta/convidado.
negative_tests: estoque insuficiente, cotação alterada, replay, cancelamento e falha de banco.
rollback_plan: pausar pedidos novos, cumprir ou cancelar pedidos abertos e manter diário imutável.
required_approvals: reviewer/tester e dono para regra de reserva/reembolso.
agent_contracts: planner -> implementer -> reviewer -> tester -> docs_sync, em sequência.
max_review_loops: 2
escalation_rule: suspender pedidos novos se reserva não puder ser reconciliada.

### TASK NPC-004 — Mercador e remessa regional

task_id: NPC-004
status: draft
owner_role: implementer
priority: P1
task_size: XL
timebox: dividir em ciclos se rota, mapa e remessa excederem uma fatia revisável
dependencies: NPC-003
blocked_by: mapa do segundo assentamento e regra de carga/atraso aprovados
unblocks: NPC-005
goal: Uma carga percorre uma rota entre vila e assentamento de mineração e credita o destino apenas após entrega.
scope_in: uma rota, uma mercadoria, capacidade finita, estado da remessa e mercador visível no entorno.
scope_out: várias cidades, comércio de jogador, guerra e rota totalmente livre.
candidate_files: game/dimensions.mjs, game/main.js, scripts/prototype-server.mjs, database/economy-store.mjs; novas tabelas só após auditoria.
integration_contract: registros intergovernamentais só servem quando origem e destino são governos distintos; rota local precisa respeitar um serviço existente ou receber extensão aditiva após auditoria.
acceptance_criteria: origem, trânsito e destino persistem; mercadoria não existe em dois estoques; restart não duplica; arte pré-carregada e movimento próximo interpolável.
exit_criteria: uma remessa real completa uma rota após restart sem duplicar estoque e é acompanhada no navegador.
verification_strategy: unit/integration, restart real e navegador seguindo carga de ponta a ponta.
negative_tests: destino cheio, rota parada, perda do actor, replay, restart e banco indisponível.
rollback_plan: parar partidas novas e concluir/cancelar explicitamente cargas já registradas.
required_approvals: reviewer/tester e dono para mapa/capacidade/risco.
agent_contracts: planner -> implementer -> reviewer -> tester -> docs_sync.
max_review_loops: 2
escalation_rule: reduzir a rota a um percurso simples se pathfinding prejudicar mobile.

### TASK NPC-005 — Minerador, fundição e ferreiro

task_id: NPC-005
status: draft
owner_role: implementer
priority: P1
task_size: XL
timebox: dividir por mineração, receita e equipamento se continuar largo
dependencies: NPC-004
blocked_by: assentamento, receita e equipamento utilizável definidos
unblocks: NPC-007, NPC-008
goal: Minerador abastece minério/carvão finitos e ferreiro consome insumos reais para entregar um equipamento utilizável.
scope_in: um metal, uma receita, um equipamento, um posto e registro de valor adicionado.
scope_out: catálogo inteiro de armas, combate extenso e craft sem insumo.
candidate_files: game/inventory.mjs, game/economy.mjs, scripts/prototype-server.mjs, database/economy-store.mjs; migração se necessária.
integration_contract: auditar economic_production_events da migração 024 e registrar actor NPC como source_reference; não gerar conta de perfil ou salário de jogador fictício.
acceptance_criteria: cada insumo consumido gera exatamente um resultado ou é devolvido; equipamento tem ID, durabilidade e uso definidos antes de balancear dano.
exit_criteria: ciclo de insumo a equipamento usável testado com dois jogadores e valores simulados.
verification_strategy: simulação de custo + transação de produção + teste do equipamento em multiplayer.
negative_tests: insumo insuficiente, mochila cheia, cancelamento, concorrência e rollback de banco.
rollback_plan: desativar receita nova, reabrir job interrompido e preservar itens liquidados.
required_approvals: reviewer de economia/gameplay, tester e dono para receita/valores.
agent_contracts: planner -> implementer -> reviewer -> tester -> docs_sync.
max_review_loops: 2
escalation_rule: reduzir a um metal e um item se balanceamento/arte/persistência se acoplarem.

### TASK NPC-006 — Prefeitura e compras públicas

task_id: NPC-006
status: draft
owner_role: implementer
priority: P1
task_size: L
timebox: um ciclo após a auditoria dos serviços governamentais existentes
dependencies: NPC-003
blocked_by: permissão, fonte de orçamento e prestação de contas aprovadas
unblocks: NPC-007
goal: Separar a guilda comercial da prefeitura que consulta tesouro e autoriza uma compra/projeto público financiado.
scope_in: saldo do governo, proposta/limite de orçamento, aprovação, compra de material da guilda e prestação de contas no diário.
scope_out: tributação nova, eleição, política partidária e gasto automático sem aprovação.
candidate_files: game/place-services.mjs, game/place-panel.mjs, scripts/prototype-server.mjs, database/economy-store.mjs, database/migrations/018_world_governance_treasury.sql
integration_contract: reutilizar tesouro, fundos, projetos e diário governamental existentes; completar os serviços que faltam sem criar orçamento paralelo.
acceptance_criteria: nenhuma compra excede orçamento; guilda recebe estoque e prefeitura registra despesa/contrapartida uma vez; falha devolve reserva; interfaces deixam claro quem paga.
exit_criteria: uma compra pública real é conciliada no ledger e respeita os papéis de autorização.
verification_strategy: auditoria do serviço existente, transação PostgreSQL concorrente e navegador com permissão de liderança.
negative_tests: saldo de tesouro insuficiente, proposta repetida, autorização sem papel, estoque indisponível e rollback.
rollback_plan: bloquear novas propostas, concluir ou devolver as reservas abertas e preservar diário.
required_approvals: dono para autoridade/política; reviewer e tester; coordenador para ativar serviço/migração.
agent_contracts: planner audita fluxos governamentais -> implementer conecta uma compra pública -> reviewer verifica permissões/ledger -> tester valida -> docs_sync.
max_review_loops: 2
escalation_rule: manter prefeitura como painel informativo se compra pública atômica não puder ser provada.

### TASK NPC-007 — Soldado e patrulha segura

task_id: NPC-007
status: draft
owner_role: implementer
priority: P2
task_size: XL
timebox: um ciclo após contrato PvE aprovado
dependencies: NPC-005, NPC-006
blocked_by: regras de combate, facção e zona protegida aprovadas
unblocks: none
goal: Soldado patrulha zona definida e responde a ameaça válida sob regra transparente de proteção.
scope_in: uma facção, zona e resposta PvE validada no servidor.
scope_out: PvP, guerra, cerco e ataque a jogador por erro de colisão.
candidate_files: game/locomotion.mjs, game/main.js, scripts/prototype-server.mjs; dados/migração somente após contrato de combate.
acceptance_criteria: ataque só ocorre nas condições aprovadas; jogador recebe aviso; caminhos continuam transitáveis.
exit_criteria: testes multiplayer confirmam limites da patrulha e nenhum ataque fora das regras.
verification_strategy: unit de zona/alvo/linha de visão + multiplayer em área segura.
negative_tests: jogador neutro, ameaça fora da zona, alvo inválido, reconexão e ameaças concorrentes.
rollback_plan: desativar resposta ofensiva, mantendo o soldado em patrulha passiva.
required_approvals: dono para combate/facções, reviewer e tester.
agent_contracts: planner -> implementer -> reviewer -> tester -> docs_sync.
max_review_loops: 2
escalation_rule: manter guardas passivos até existir combate seguro.

### TASK NPC-008 — Recompensa e equilíbrio

task_id: NPC-008
status: draft
owner_role: planner
priority: P1
task_size: M
timebox: um ciclo com dados de mais de uma atividade econômica
dependencies: NPC-002
follow_up_after: NPC-005
blocked_by: métricas suficientes e comparáveis por atividade
goal: Calibrar bronzes/minuto, custo de ferramenta, oferta e risco para que coleta renda pouco e caça compense mais sem ser obrigatória.
scope_in: venda, contratos, produção NPC, coleta, caça e fontes/sumidouros.
scope_out: ativar toda economia dinâmica, pagamento por tempo conectado ou moeda infinita.
candidate_files: docs/RESOURCE-ECONOMY-PLAN.md, docs/DYNAMIC-ECONOMY-DESIGN.md, scripts/economy-simulation.mjs, game/economy.mjs
acceptance_criteria: curva é simulada com esforços e risco comparáveis, limites e origem de dinheiro explícitos; dono aprova antes de ativar mudança.
exit_criteria: relatório comparativo aprovado antes de mudar preço ou recompensa ativa.
verification_strategy: cenários determinísticos + amostra agregada de sessões + comparar curva antes/depois.
negative_tests: repetição sem custo, conta alternativa, troca de região, venda em lote e estoque saturado.
rollback_plan: restaurar cotação estática versionada e desativar atualização dinâmica.
required_approvals: dono e reviewer de economia.
agent_contracts: planner -> implementer -> reviewer -> tester -> docs_sync.
max_review_loops: 2
escalation_rule: conservar valores atuais se amostra não for representativa.

## Dependency Order

NPC-001 -> NPC-002 -> NPC-003 -> NPC-004 -> NPC-005.
NPC-003 -> NPC-006; NPC-005 + NPC-006 -> NPC-007.
NPC-008 begins after NPC-002 and should be revisited after NPC-005.

## Execution Handoff

RESUME_FROM: NPC-001, após revisão do recorte e início formal do próximo ciclo pelo coordenador.
Primeira ação: conferir schema realmente ativo, caminho de venda, cotação e estoque; fechar limite de turnos offline e compra na guilda. Não começar por framework genérico, soldados ou comércio entre jogadores.

## Decision Log

- 2026-10-26: primeiro ciclo recomendado é lenhador -> estoque finito -> compra na guilda; reutiliza coleta/itens/venda existentes e cobre a compra que falta.
- 2026-10-26: não foi encontrado fluxo geral de compra do NPC para o jogador na ação lodgeSell.
- 2026-10-26: nenhum NPC, migração ou mudança econômica foi implementado neste plano.
