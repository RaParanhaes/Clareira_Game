# FEATURE-PREPARATION — Housekeeping da Clareira

feature_id: HOUSEKEEPING-001
feature_title: Housekeeping, cargos, dimensões e operações de mundo
status: prepared_with_execution_gate
owner_role: product/planner
last_updated: 2026-10-27

## Problema e resultado

Hoje a conta só distingue `player/admin`. A equipe precisa de ferramentas visuais para moderar e operar o jogo; cargos precisam refletir autoridade real no servidor. Jogadores devem descobrir dimensões durante a exploração, enquanto staff autorizada pode acessá-las para trabalhar.

**Resultado esperado:** Housekeeping autenticado, com ações autorizadas no servidor e persistência PostgreSQL, que permita à equipe atuar conforme os cargos acordados; progressão de dimensão pelo jogo; sandbox/editor com publicação rastreável; e operação de manutenção.

## Decisões de produto congeladas

| Nível | Cargo | Autoridade acordada |
|---:|---|---|
| 0 | Jogador | Explora, evolui e acessa cada dimensão por portais encontrados ou conhecimentos/magias descobertos. |
| 1 | Guia de Comunidade | É jogador; conquista o título por missões, acolhe e encaminha denúncias. Não recebe ferramentas globais de staff nem acesso livre a dimensões. |
| 2 | Moderador | Analisa denúncias, adverte, silencia, expulsa, suspende e pode banir permanentemente; acesso livre a dimensões. |
| 3 | Gerente | Herda moderação; cria emblemas, eventos, zonas, construções e conteúdo em outras dimensões; publica no principal sem aprovação manual, sujeito às validações automáticas. |
| 4 | Administrador | Herda funções inferiores; corrige jogadores/estados, constrói, configura zonas e opera o jogo. |
| 5 | Proprietário | Autoridade total: executa qualquer ação de jogo/administração, inclusive conceder/remover dinheiro e emblemas, acessar casas e dimensões, e delegar qualquer poder/cargo. Sem aprovação ou limites funcionais; auditoria é histórico. |

O **Governante da Vila/Gestor Econômico** é um papel do mundo, separado da hierarquia de staff. A autoridade do Proprietário pode alterar ou substituir regras e decisões desse papel.

### Acesso a dimensões

- Jogador comum e Guia não recebem seletor universal. Descobrem portais escondidos ou aprendem conhecimento/magia que libera destinos específicos; certas descobertas podem permanecer marcadas com `?` até serem obtidas.
- Algumas habilidades futuras podem permitir criar portais. O jogo não revela antecipadamente o nome/conteúdo de segredos ainda não descobertos.
- Moderador, Gerente, Administrador e Proprietário podem trocar livremente de dimensão por ferramenta de staff. Esse acesso não revela os segredos ao público.

### Acesso às casas

- O Proprietário autenticado pode usar a ação contextual de visita em uma conta conectada que esteja por perto. A entrada funciona também em casa privada/cabana, sem conceder chave nem alterar a posse; a visita não permite editar móveis.
- A porta retorna ao ponto de origem. Se a conexão cair durante a visita, a sessão reabre no ponto de origem e não salva a casa alheia como residência.
- Busca por nome e acesso a contas offline ainda dependem do painel de staff e permanecem fora desta etapa.

## Usuários e fluxos principais

1. Jogador encontra um portal secreto e atravessa; servidor valida destino, requisitos e posição de chegada.
2. Jogador aprende uma magia/conhecimento e passa a acessar somente as dimensões que aquela descoberta libera. Primeiro vínculo implementado: Bola de Fogo II revela Inferno; habilidade e descoberta persistem juntas no PostgreSQL.
3. Guia ajuda alguém e encaminha denúncia sem ganhar autoridade de moderador.
4. Moderador abre denúncia, aplica sanção com motivo e consulta histórico; banimento permanente não exige aprovação prévia.
5. Gerente constrói em dimensão de trabalho, compara revisão e publica conteúdo pelas validações automáticas.
6. Administrador encontra jogador preso e corrige estado por ferramenta contextual.
7. Proprietário concede/retira dinheiro, dá/remove emblema, entra em casa, acessa dimensão e delega poderes, sem bloqueio ou aprovação secundária.
8. Equipe agenda manutenção, comunica jogadores e acompanha início/fim pelo painel.

Erros principais: cargo revogado com sessão aberta; payload tenta ampliar escopo; jogador tenta destino não descoberto; duas edições disputam revisão; publicação falha parcialmente; ação econômica é repetida; falha de banco/migração; ou painel indisponível durante manutenção.

## MVP e limites

**MVP inicial de código:** modelo de cargos/permissões PostgreSQL compatível com `player/admin` legado, catálogo das capacidades realmente implementadas, atribuições de staff e testes de autorização. O Proprietário é um bypass explícito sobre permissões existentes, sem bypass de autenticação.

**Programa completo:** painel staff; moderação; operações do Proprietário; progressão/portais dimensionais; sandbox/editor/publicação; manutenção e avisos.

**Fora do primeiro incremento:** editor visual completo, emblemas sem catálogo persistente, mensagens arbitrárias executadas no servidor, SQL/scripts no painel e ações de release que copiem arquivos ou reiniciem a VPS.

## Arquitetura conhecida e restrições

- `scripts/account-store.mjs`, `database/store.mjs` e `database/migrations/004_account_roles.sql` normalizam cargos a `player/admin`.
- `scripts/server.mjs` e `scripts/prototype-server.mjs` são entradas do servidor; `database/economy-store.mjs` também usa `a.role='admin'`.
- Migrações PostgreSQL versionadas são a persistência autorizada; não usar JSON para cargos, permissões, conhecimentos, descobertas, auditoria ou manutenção.
- Ferramentas staff não entram em `learnedAbilities`, inventário ou snapshots públicos. O servidor autoriza cada ação.
- Acesso staff não marca descobertas para o jogador nem expõe destinos secretos em mapa, payload, erro ou autocomplete comum.
- Economia deve reutilizar o ledger financeiro existente quando aplicável. Ações do Proprietário registram histórico, sem teto, segunda aprovação ou bloqueio hierárquico.
- Preservar alterações locais pré-existentes; não restaurar arquivos nem limpar a árvore.

## Critérios globais de aceite

- Atribuições e permissões sobrevivem a reinício via PostgreSQL e migração reproduzível.
- Jogador/Guia não obtém acesso staff por payload; Moderador+ muda de dimensão livremente; jogador acessa apenas destinos desbloqueados.
- Proprietário executa e delega todas as ações existentes sem aprovação, teto ou bloqueio hierárquico; ações ficam auditáveis.
- Interface mostra ações autorizadas, mas segurança independe da interface.
- Workspaces/publicação não copiam conta, inventário, saldo, sanção, posse ou sessão para o mundo compartilhado.
- Cada fatia tem testes positivos e negativos; fluxo visual tem e2e real; regressões de conta, mundo e multiplayer passam.

## Questões abertas para tarefas específicas

- Escolher a conta real do primeiro Proprietário e executar o bootstrap local com acesso operacional.
- Catálogo de emblemas/concessões ainda não existe; não simular persistência.
- A conta do primeiro Proprietário ainda precisa ser escolhida e provisionada pelo coordenador; o procedimento local `npm run staff:owner` já existe e recusa substituir um Proprietário ativo.
- Definir integração com modelos reais de banimento, suspensão e recurso.
- PvP, gravidade variável e encantamentos só podem ser ativados após suporte do runtime.
- Definir mensagem, calendário e rollback operacional da manutenção.

## Governança de execução

`AGENTS.md` exige que somente o coordenador inicie ciclos e que o launcher forneça `CLAREIRA_CYCLE_ID`. A primeira fatia local foi implementada e testada a pedido do usuário, usando apenas banco descartável; ela não foi aplicada ao preview. Não há launcher conectado nesta sessão, então tarefas seguintes e qualquer ativação/reinício do preview aguardam o ciclo coordenado. Não inventar identificador.

## Verificação planejada

- Unit: atribuição, herança, delegação, revogação/cache e autoridade total do Proprietário.
- Migration/integration: upgrade player/admin, preservação de contas e persistência após reinício PostgreSQL.
- Negativo: payload forjado, sessão revogada, staff inferior sem escopo, dimensão não descoberta e segredo vazado.
- E2E: login por papel, ação real no jogo; travessia por portal/conhecimento; sandbox→prévia→publicação/rollback; manutenção no horário anunciado.
- Regressão: suíte Node/Python uma vez na integração final; navegador desktop/celular para cada fluxo visual entregue.
