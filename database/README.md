# PostgreSQL e Redis da Clareira

## Preview e operação local

PostgreSQL é a fonte única de verdade para todos os dados persistentes do jogo. Novas funcionalidades persistentes usam tabelas/repositórios PostgreSQL e migrações versionadas. JSON não é backend de jogo no preview nem fonte durável alternativa. Arquivos JSON continuam permitidos como entrada de importação, cópia de segurança, configuração operacional privada, fixture isolada de teste ou envelope revisado para operações administrativas; após a aplicação, a persistência autoritativa fica no PostgreSQL. Estado transitório da simulação fica em memória e Redis atende apenas cache/presença temporária. Feedback permanece no armazenamento separado descrito abaixo.

A infraestrutura reproduzível fica em `infra/backends.compose.yml`: PostgreSQL 18.6 com volume persistente e Redis 7 para reservas temporárias de sessão. Ambos escutam somente em `127.0.0.1` (55432 e 56379). O Redis não é usado como fonte durável nem substitui a simulação do servidor.

```sh
npm run backends:up
npm run test:backends
npm run test:backends -- --all
npm run backends:activate-preview
npm run backends:status
```

`backends:up` cria credenciais aleatórias em `.local/backends.env`, fora do Git. Os testes criam uma base descartável própria e a removem ao terminar; nunca limpam a base do preview. `--all` inclui as integrações reais na suíte completa, sem ignorá-las.

A ativação é exclusiva do preview `/var/lib/clareira-dev`. Ela aplica migrações, coloca uma barreira de inicialização e reinicia apenas os dois serviços de preview existentes. O servidor anterior conclui os salvamentos antes da cópia. Os processos novos esperam a conversão terminar. A cópia JSON e o dump ficam em `.local/backups/`, com acesso privado. Antes de liberar as conexões, o processo compara os dados importados e restaura o dump em outra base, conferindo contagens e resumos de todas as tabelas.

A configuração `.local/preview-backend.json` é carregada pelos pontos de entrada CLI do preview e do comando de papéis de conta e somente quando o diretório de estado coincide; variáveis de ambiente explícitas têm precedência. Testes que importam as fábricas de servidores continuam isolados. O usuário PostgreSQL do jogo possui acesso aos dados sem privilégios de superusuário. O esquema incompleto bloqueia a inicialização em vez de cair silenciosamente para JSON.

Não se deve repetir a importação após aceitar escritas no PostgreSQL. O comando recusa uma base ocupada e uma configuração já ativa. A cópia JSON é um retrato anterior à troca; voltar para ela depois de novas escritas exige conciliar ou restaurar os dados atuais. Feedback continua separado do banco de jogo, com sua retenção própria.

Persistem no PostgreSQL: contas e papéis, sessões, mochila e posição dos slots, durabilidade e mochila vazia sem recriar itens iniciais, carteira, aparência atual e legada, móveis, posição/cenário, hospedagens, chaves nominais, encomendas, mapas de cada dimensão, catálogo de dimensões, fogueiras, diário de interações e cotações/fluxos agregados do mercado. A migração 012 preserva também tema, semente e ordem das alterações do mapa.

A migração 015 cria `interaction_events`, um diário append-only de ações. Cada evento registra perfil, ação, dimensão/local/instância e posição, uma cópia das propriedades do objeto e detalhes do resultado. Transferências de coleta incluem a origem no chão e o destino no inventário. Evento de coleta e progresso da mochila são gravados na mesma transação PostgreSQL.

A migração 016 cria `economy_goods`, `economy_quotes` e `economy_daily_flows`. A 017 cria regras base de imposto versionadas e diário financeiro append-only, com gatilho que rejeita transações sem soma zero. A 018 cria governos por mundo/assentamento, tesouros separados por finalidade, alíquotas fiscais versionadas ligadas ao caixa, projetos públicos e solicitações de expansão territorial ao governo pai. O comércio usa a política `surface:arrival`: a taxa efetiva parte da base definida pelo governo, muda gradualmente conforme o saldo do fundo geral e respeita piso/teto; frações de imposto inferiores a um bronze são carregadas entre transações do mesmo governo/categoria, em vez de serem descartadas. O esquema permite regras versionadas por governo (base, piso, teto e sensibilidade ao tesouro); cada cobrança usa a cotação válida e mantém histórico. A edição das regras já exige perfil de liderança ou conta admin e tem tela no balcão de trocas da vila; ainda falta validar essa tela no jogo. Há contas de fundos para separar recursos de doações, materiais, construções, território e diplomacia, mas os fluxos de autorização, transferência e prestação de contas dos projetos públicos ainda precisam ser implementados. Expansão de vila deve exigir solicitação e aprovação do governo pai, capacidade máxima e liquidação que credita o tesouro do reino antes de aumentar o limite local; o esquema está criado, mas falta o serviço transacional que executa e audita esse fluxo. A liquidação grava mochila, saldo, imposto, volume, fundo e diário na mesma transação. A 019 abre um mercado de transferência auditada para cabanas já possuídas: anúncio, pagamento do comprador, crédito líquido ao vendedor, imposto do governo, troca de titularidade e invalidação de chaves antigas são atômicos. A 020 registra aluguéis de hospedagem e cobranças por período: renovação automática só ocorre após adesão explícita, cada débito é atômico e auditado, o imposto vai ao tesouro e saldo insuficiente encerra o contrato sem criar dívida. A 021 armazena política e histórico da oferta monetária usada no fator macro. A 023 separa carteira circulante, tesouro governamental, reserva bancária e dívida de crédito; somente moeda spendável entra na referência de preços, enquanto os outros saldos ficam registrados em colunas próprias. Minério e lingote não entram como moeda. A 022 cria estoque vendável por balcão, material e região; somente esse estoque entra no sinal de oferta, e uma venda ao NPC transfere o item do jogador para o estoque do balcão na mesma transação que paga a carteira e lança imposto. Mochilas privadas deixam de baratear artificialmente itens que não foram oferecidos no mercado. A 023 cria templates de orçamento inicial configuráveis por mundo e tipo de governo, além de bancos, reservas, políticas de juros versionadas, cotações e contratos/eventos de empréstimo. Os valores de exemplo do jogo não são valores padrão. O esquema de empréstimos existe, mas ainda faltam operações de emissão, cobrança, liquidação e integração com a carteira. A 024 adiciona políticas versionadas de salário mínimo por turno, pagamentos de folha, eventos de produção com valor adicionado, tarifas por direção, remessas intergovernamentais e snapshots mensais de PIB, salários, saldo comercial, orçamento, juros e circulação global. A circulação local fica explicitamente sem atribuição até existir domicílio monetário; não dividir moedas entre governos por suposição. Esses são contratos de dados: contratação, produção, transporte, liquidação de comércio e cálculo mensal ainda precisam de serviços. O preview exige as migrações correspondentes antes de iniciar; nenhuma migração foi aplicada nesta etapa.

O Redis coordena a posse da sessão entre processos, com TTL e renovação. Conta duplicada é recusada; a desconexão libera a reserva e uma sessão antiga não remove a reserva substituta. Se a coordenação estiver indisponível, o servidor recusa novas admissões ou encerra conexões cuja reserva não pode manter. Redis não faz roteamento de instâncias nem replica a simulação em tempo real.

Referências operacionais: [PostgreSQL: pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) e [Redis em Docker](https://redis.io/docs/latest/operate/oss_and_stack/install/install-stack/docker/).

## Modelo e compatibilidade

`migrations/001_core_schema.sql` define a estrutura relacional para contas, sessões, perfis, inventário, aparência, quartos, alterações do mundo e transações de itens. O runner aplica cada migração numa transação, serializa execuções concorrentes com advisory lock e confere checksum antes de repetir uma versão.

Essa primeira versão foi aplicada e reaplicada num PostgreSQL 18.6 temporário; o teste também percorreu importação sintética, registro/login, sessão de visitante, inventário, aparência, quarto e autenticação HTTP → WebSocket. O container de validação foi encerrado e não guarda dados.

O preview oficial exige PostgreSQL configurado por `DATABASE_URL` ou pela configuração privada e falha na inicialização se o banco/esquema estiver ausente ou incompleto. Execuções locais isoladas ainda podem selecionar o adaptador JSON legado; use-o somente para compatibilidade de testes e migração, nunca como backend do preview nem para novas funcionalidades persistentes. Cada processo mantém um pool limitado (10 conexões por padrão, ajustável por `PG_POOL_MAX`). Em uma instalação nova, aplique o esquema antes de iniciar os processos:

```sh
DATABASE_URL='postgres://clareira:senha@127.0.0.1:5432/clareira' npm run db:migrate
DATABASE_URL='postgres://clareira:senha@127.0.0.1:5432/clareira' npm run preview
DATABASE_URL='postgres://clareira:senha@127.0.0.1:5432/clareira' npm run room
```

Use credenciais em variáveis de ambiente ou num secret manager; nunca as grave no Git ou nos logs. O importador começa em modo somente leitura:

```sh
npm run db:import -- /caminho/para/uma/copia/dos/saves
```

Para aplicar uma importação legada, use `DATABASE_URL` e acrescente `--apply`. Ela exige auditoria limpa e uma base sem dados de jogo; não remove nem altera os JSON de origem. Esta é uma etapa pontual de migração, não um fluxo de salvamento contínuo. Primeiro valide com uma cópia de staging.

## Identidades e conversão dos saves

- `profiles.id` usa o ID da conta para uma conta registrada. Para um visitante, usa o ID da sessão de visitante; assim, a sessão sempre aponta para um perfil.
- `sessions.token_hash` recebe os 32 bytes decodificados do SHA-256 hexadecimal atual. O token original nunca é importado.
- `inventory_items` usa IDs de item como `wood`, `timber`, `sturdyBranch`, `stone`, `berries`, `leaves`, `vines` e ferramentas. O ID legado `firewood` é convertido para `wood` ao carregar saves antigos. Quantidades zero podem ser omitidas; contas antigas recebem os valores iniciais definidos pelo jogo.
- O save histórico v2 guardava IDs estáveis para todas as opções. O formato atual v3 grava somente `bodyId`; o PostgreSQL permite representar ambos sem apagar os campos v2. O importador deve preservar os campos encontrados nos JSON antigos, convertendo índices para IDs, mesmo que o editor atual não os exponha:

| Campo atual | ID estável | Opções existentes |
|---|---|---|
| `skin` | `skin_clara`, `skin_dourada`, `skin_morena`, `skin_escura` | índices 0–3, nesta ordem |
| `hair` | `hair_dark_brown`, `hair_near_black`, `hair_chestnut`, `hair_honey_blonde`, `hair_copper` | índices 0–4, nesta ordem |
| `coat` | `coat_sea`, `coat_cedar`, `coat_moss`, `coat_berry`, `coat_slate` | índices 0–4, nesta ordem |

No registro relacional, `appearances.version = 2` representa o modelo antigo completo por IDs; `version = 3` representa somente o corpo; `version = 4` guarda o arquétipo, o corpo e a aparência PNG selecionada. A migração `002_character_appearance.sql` mantém as versões anteriores legíveis. Não passe saves antigos pelo normalizador da interface durante a importação: leia o JSON bruto e converta seus campos para não substituir escolhas salvas por valores padrão. O quarto usa `room.id = profile.id` para tornar uma nova importação idempotente; `room_objects.object_id` mantém o ID textual salvo e `furniture_id` recebe o ID do catálogo, por exemplo `furniture.stool`.

Perfis de visitante expirados devem ser omitidos, junto das sessões expiradas. Feedback fica fora do banco de jogo e segue a retenção própria. A estrutura de chunks permanece vazia até existir geração de mundo versionada.

## Coordenação Redis opcional

Com `REDIS_URL`, cada conexão recebe uma reserva temporária por perfil. O TTL é renovado enquanto o WebSocket está ativo; a presença registra o servidor e o contexto atual (mundo, dimensão, lugar e instância). Uma segunda instância de jogo recusa a mesma conta enquanto a reserva estiver válida. Se Redis estiver configurado mas indisponível, o jogo falha fechado em vez de aceitar sessões sem coordenação. Sem `REDIS_URL`, o protótipo continua no modo local atual.

```sh
REDIS_URL='redis://127.0.0.1:6379' npm run room
TEST_REDIS_URL='redis://127.0.0.1:6379' node --test database/redis-coordination.test.mjs
```

Isso prepara presença e exclusão de sessões duplicadas entre processos. Ainda não roteia automaticamente o cliente para o servidor da instância nem compartilha a simulação em tempo real; esse trabalho depende do gateway e da divisão de instâncias. Redis contém apenas estado temporário; PostgreSQL continua sendo a fonte durável dos dados do jogo.

## Aplicação e rollback

1. Criar uma base de staging vazia e aplicar migrações em ordem com `npm run db:migrate`. Arquivos aplicados são imutáveis; uma alteração exige outra versão.
2. Tirar um snapshot dos JSON de origem e executar a auditoria somente leitura: `npm run player:saves:audit -- /caminho/para/a/copia`.
3. Importar dentro de transações, sem apagar os JSON. Comparar contagens, validar hashes de sessão e testar login, inventário, aparência, quarto e transferência.
4. Fazer o teste de restauração a partir do backup antes de direcionar tráfego para o PostgreSQL.

O rollback da migração de dados é voltar o serviço ao JSON somente antes de aceitar escritas novas no PostgreSQL. Depois disso, reverter exige exportar/conciliar as escritas ou restaurar um backup; não executar `DROP TABLE` como rollback automático.

## Catálogo de objetos

As migrações 013–014 armazenam modelos, montagens de construções, histórico e propriedades dos móveis. PostgreSQL controla a revisão; Redis guarda cópias de leitura por revisão. A revisão 3 do preview registra colisores autorizados pelo servidor e pontos de profundidade nos 24 modelos de móveis e peças fixas. A operação local `npm run objects -- list` mostra os objetos e a revisão atual; `export`, `validate`, `apply` e `history` permitem manutenção com validação e concorrência. Consulte [SCENE-OBJECTS.md](../docs/content/SCENE-OBJECTS.md) para exemplos de alteração e cópia completa. A inicialização não sobrescreve escolhas já salvas.

## Cargos e autorização da equipe

A migração 027 cria cargos, catálogo de capacidades, herança entre cargos, atribuições por conta/escopo e auditoria administrativa no PostgreSQL. Gerente herda as permissões do Moderador; Administrador herda as do Gerente; Proprietário recebe a capacidade curinga, que representa autoridade total sobre as ações implementadas. Atribuições de `admin` legado são espelhadas como Administrador, preservando a coluna `accounts.role` durante a transição. Nenhuma conta real é promovida a Proprietário automaticamente.

A consulta de autorização verifica atribuição ativa, expiração, escopo e herança em cada chamada. A migração 029 adiciona funções transacionais de criação de cargo, atribuição/revogação e delegação de capacidades. Depois de criar o papel do runtime, o bootstrap aplica novamente `EXECUTE` somente nessas funções; escrita direta nas tabelas de staff e no diário segue revogada, inclusive quando o papel foi criado depois das migrações. Cada chamada resolve o ator por uma sessão PostgreSQL vigente, grava a auditoria junto da mudança e retorna erro se a sessão expirou ou a autoridade foi revogada. Operadores só delegam capacidades que possuem e a cargos abaixo do próprio nível; o Proprietário pode delegar `*` quando decide dar autoridade total a outro cargo.

As migrações 029–030 adicionam mutações de cargos e operações transacionais de denúncias/sanções. A 030 cria `player_reports` e `player_sanctions`, permissões específicas para gerenciar denúncias/revogar punições e funções auditadas de escrita. `reports.read` limita a consulta aos casos atribuídos ao próprio moderador; `reports.manage` permite ver a fila completa e assumir casos. A 031 adiciona ajuste de moedas pela capacidade delegável `economy.adjust`; a função compartilha o lock de perfil das compras, impede saldo negativo/excedente e grava saldo anterior, novo saldo e delta na auditoria. Por padrão, só Proprietário tem a capacidade curinga; ele pode delegar `economy.adjust` a um cargo se desejar. O runtime não recebe DML direto nessas tabelas; toda mutação valida sessão, hierarquia, capacidade e motivo.

O código do servidor oferece rotas autenticadas em `/staff/roles`, `/staff/permissions`, `/staff/assignments`, `/staff/accounts/:username/roles`, `/staff/audit`, `/staff/reports`, `/staff/sanctions` e `POST /staff/wallet`. `/staff/capabilities` informa ao painel as capacidades efetivas do operador. Jogadores autenticados não visitantes podem denunciar por `POST /reports`. O login e o handshake do jogo consultam sanções ativas; kick, suspensão e banimento impedem novas conexões, conexões abertas são atualizadas periodicamente, e mute bloqueia o chat. A interface web local fica em `/staff`; HTML, CSS e JavaScript exigem sessão e ao menos uma capacidade Housekeeping, e cada API valida a permissão específica novamente. O painel inclui ajuste de moedas com motivo obrigatório e saldo final, além da moderação de denúncias e sanções. A migração 032 registra descobertas dimensionais por perfil: superfície e Breu são destinos iniciais, visitas legadas são preservadas, e viagens feitas com autoridade de staff não viram descobertas do jogador. A migração 033 remove o teto artificial de saldo e permite quantidades de moeda maiores que 999 nas linhas de ouro, mantendo pilhas comuns limitadas; o teto restante corresponde à capacidade normalizada do tipo inteiro usado no ouro. O saldo é preservado ao hidratar snapshots e linhas do banco. O servidor filtra dimensões não descobertas, autoriza viagens de staff em cada solicitação e remove a lista pessoal do snapshot compartilhado antes de enviá-lo, evitando revelar dimensões privadas a outros jogadores na mesma cena. A habilidade Bola de Fogo II concede descoberta de Inferno ao ser aprendida; progresso da habilidade e descoberta são gravados na mesma transação. Portais e outros conhecimentos ainda precisam conceder novas descobertas pelo fluxo de jogo. O painel lateral in-game, sandbox/publicação e manutenção ainda faltam. Não foi ativada no preview. A conta real do Proprietário ainda precisa ser escolhida/provisionada.

O primeiro Proprietário é preparado por operação local com `STAFF_BOOTSTRAP_DATABASE_URL=<acesso-operacional> npm run staff:owner -- USUÁRIO "MOTIVO"`. O comando exige uma conta existente, serializa execuções concorrentes, recusa substituir um Proprietário ativo e grava o motivo/auditoria na mesma transação. Ele permite recuperação quando todas as atribuições anteriores foram revogadas ou expiraram. Não execute até o coordenador escolher a conta correta; nunca use a URL do runtime como credencial operacional.

Hospedagens e negociação de imóveis usam as migrações 034–036: múltiplas unidades por conta, mobília por imóvel, propostas privadas, locador persistente e calendário do jogo. O contrato obrigatório e os limites atuais ficam em [Tempo do jogo e propriedades](../docs/GAME-TIME-AND-HOUSING.md). Não reimportar saves JSON para aplicar essas migrações.
