# Plano de evolução para 1.000 jogadores

**Status:** PostgreSQL é a fonte de verdade dos dados persistentes e está ativo no preview após migração, importação e restauração verificadas. Novos dados persistentes devem ser implementados no banco; JSON é legado de importação/backup e formato de teste/operacional, não backend do jogo. Redis oferece coordenação por perfil com presença e lease de sessão expiráveis (`REDIS_URL`). O servidor também tem índice espacial e área de interesse baseada no viewport. Chunks, posse de instâncias e roteamento multiplayer continuam pendentes.

## Plano incremental atualizado (29/10/2026)

A próxima separação de processos está detalhada em [Separação de conexão e simulação](WEBSOCKET-SIMULATION-SCALING-PLAN.md): baseline por instância, extração de runtime sem mudar topologia, autoridade com fencing, tarefas únicas, gateway com uma simulação e só depois duas. Inclui contratos de relógio, transferência, pressão, falha e critérios de comparação; é proposta, não capacidade já validada.

## Objetivo e premissas

- Suportar cerca de **1.000 jogadores simultâneos no conjunto do jogo**, distribuídos entre dimensões, localidades e espaços internos.
- O limite máximo de pessoas em um mesmo quarto ou área externa ainda será definido por teste de carga. Esta meta não presume 1.000 pessoas no mesmo lugar.
- As áreas externas devem parecer contínuas e sem fim: o cliente carrega o entorno visível e prepara os próximos trechos antes de revelá-los.
- Quartos, castelos, hotéis e outros interiores são espaços próprios, carregados quando o jogador entra.
- O servidor continua sendo a autoridade sobre movimento, colisões, coleta, inventário, propriedade e construção.

## Situação atual

- Cliente Canvas 2D/DOM; servidor Node.js com WebSocket.
- O protótipo configura até 200 conexões por processo; isso é um teto de admissão, não uma medição de capacidade.
- O mundo externo atual é finito e já possui geração/cache de chunks de terreno e área de interesse. Ainda não há distribuição da simulação entre processos/regiões nem roteamento entre instâncias autoritativas.
- Preview e serviços persistem dados do jogo no PostgreSQL. A importação de arquivos JSON foi usada na migração inicial; novos saves não voltam a arquivos JSON. Estado transitório da simulação permanece em memória e Redis guarda apenas dados temporários.
- A posição e a simulação ativa vivem em memória do servidor.
- Cada processo de jogo mantém a simulação e o event loop em um único processo Node.js. Uma VPS com mais vCPUs não paraleliza essa instância automaticamente; distribuição por instância/servidor ainda depende da Fase 4.
- Movimento e snapshots consultam uma grade espacial por contexto; o cliente informa o viewport para receber entidades e recursos da área visível com margem de pré-carregamento.
- Página e servidor de jogo do preview compartilham `/var/lib/clareira-dev`.

Referências da base atual: `scripts/prototype-server.mjs`, `scripts/account-store.mjs`, `scripts/appearance-store.mjs`, `scripts/room-store.mjs`, `game/content-catalog.mjs` e `docs/content/README.md`.

## Arquitetura-alvo

| Componente | Responsabilidade |
|---|---|
| Gateway e autenticação | Receber conexões, validar sessão e encaminhar cada jogador para a instância correta. |
| Servidores de jogo | Simular instâncias de quartos e regiões externas; validar ações e enviar estados relevantes a cada jogador. |
| PostgreSQL | Fonte durável para contas, perfis, aparências, inventários, quartos, alterações persistentes do mundo e transações entre jogadores. |
| Redis | Presença temporária, registro de instâncias, atribuição/expiração de jogadores e mensagens efêmeras entre servidores. |
| Cliente | Renderizar os chunks visíveis, preparar chunks próximos e descarregar os distantes sem mostrar limites do mundo. |

Redis não será a única cópia de inventário, moedas, propriedade ou alterações persistentes. Pub/Sub pode transportar avisos que não precisam ser repetidos; ações que precisam de confirmação e recuperação ficam no PostgreSQL. Streams só entram quando houver uma necessidade concreta de processar eventos de forma recuperável.

## Modelo de mundo e endereçamento

Adicionar identificadores explícitos para separar conteúdo de execução:

- `worldId`: mundo persistente e sua semente.
- `dimensionId`: dimensão do mundo.
- `placeId`: localidade, como bosque ou castelo.
- `instanceId`: execução ativa de uma localidade ou interior.
- Exterior: coordenadas `chunkX` e `chunkY` dentro de uma dimensão.
- Interior: `instanceId` próprio e identificador persistente do dono quando aplicável.

O exterior será gerado deterministicamente a partir de `worldId`, `dimensionId`, coordenadas do chunk e `generationVersion`. Assim, servidores diferentes produzem a mesma base para o mesmo trecho. Alterações dos jogadores são salvas como mudanças sobre a geração-base, identificadas por chunk e por entidade; não é necessário guardar uma cópia de cada chunk intocado.

Cada instância ativa tem um servidor autoritativo. O roteador mantém a atribuição jogador → instância; ao cruzar uma porta, portal ou limite de instância, a sessão muda de destino de forma explícita.

## Plano de trabalho

### Fase 0 — Definir capacidade e preservar compatibilidade

1. Confirmar o perfil de carga: distribuição dos 1.000 jogadores por dimensões, áreas externas, quartos e horários de pico.
2. Definir metas mensuráveis de latência, frequência de atualização, reconexão e disponibilidade antes de testar carga.
3. Inventariar todos os campos persistentes e seus proprietários; preservar os JSON atuais para importação.
4. Separar limite configurado de jogadores por instância de capacidade realmente medida.

**Saída:** contrato de carga e inventário de saves existentes; nenhuma mudança destrutiva nos dados.

**Medição inicial (loopback, 2026-10-10):** `npm run scale:baseline` conectou 12 clientes convidados à mesma instância durante 5 segundos, todos recebendo snapshots sem movimento. Resultado: 115,1 snapshots/s somados entre clientes, payload médio de 6,36 KB, 12,7% de um núcleo de CPU, atraso de loop p95 de 15,3 ms e pico de 40,27 ms. Naquela configuração, ao solicitar 13 clientes, 12 foram aceitos e 1 recusado; o limite de admissão foi ampliado desde então. Medido em Node v18.19.1, Linux x64. A amostra histórica não estima capacidade por instância nem comprova 1.000 jogadores. A carga real precisa incluir movimento, múltiplos quartos/dimensões, reconexões e hardware de staging.

**Repetição (loopback, 2026-10-11):** com PostgreSQL e Redis sem configuração, 12 clientes sem movimento durante 5 segundos produziram 112,6 snapshots/s somados, payload médio de 5,14 KB, 21,6% de um núcleo, p95 de 15,04 ms e pico de 238,03 ms. A diferença entre execuções não é evidência de regressão: a medição é curta e sensível à carga do host. Ambas só caracterizam o teto configurado de 12 conexões nesta simulação simples.

**Após o índice espacial e AOI (loopback, 2026-10-11):** os mesmos 12 clientes ociosos produziram 112,8 snapshots/s, payload médio de 5,14 KB, 19,7% de um núcleo, p95 de 18,5 ms e pico de 77,4 ms. Todos começam próximos e permanecem na mesma área de interesse, portanto o ensaio confirma compatibilidade com o limite atual, mas não mede redução de entidades distantes. A variação entre medições curtas e a carga do host impede atribuir diferenças pequenas ao código; falta um ensaio distribuído e com movimento.

**Movimento e snapshots (loopback, 2026-10-27):** a simulação autoritativa permanece em 30 Hz; snapshots remotos têm alvo de 20 Hz e o cliente interpola jogadores remotos. Com 12 bots na mesma área, comandos em pares e 10 segundos, o ensaio isolado aceitou todos, recebeu 225,2 mensagens de estado/s somadas (18,8 por cliente), transmitiu 2,81 MB/s, usou 77% de um núcleo, p95 de event loop de 32,3 ms e pico de 119,7 ms. Com 32 bots no mesmo cenário, aceitou todos e recebeu 380,2 mensagens/s (11,9 por cliente), transmitiu 11,15 MB/s, usou 125% de um núcleo, p95 de 127,3 ms e pico de 248,6 ms; RSS 191,8 MiB e heap 98,9 MiB. Um exportador Blender usava aproximadamente 1,6 núcleo durante essas medições; portanto os números são indicativos, não uma comparação limpa nem uma promessa de fluidez. O teste de 50 jogadores cobre confirmação de movimento, e o limite de 200 cobre admissão, sem medir desempenho a 200. A compressão WebSocket reduziu bytes no ensaio anterior, mas continua opt-in porque uma integração de inventário expira com compressão habilitada. Repetir sem outros trabalhos no host e medir também no navegador antes de alterar frequência ou anunciar capacidade.

### Fase 1 — Persistência durável (concluída)

1. Esquema versionado e migrações sequenciais implementados para conta, sessão, perfil, aparência, inventário, quarto, mundo e objetos. O runner aplica migrações transacionais com checksum.
2. IDs estáveis são usados para aparência, itens e móveis. O formato histórico de aparência v2 foi preservado na migração; a interface atual grava a variante de corpo, e a decisão de reexpor opções antigas continua separada desta etapa de persistência.
3. Importação legada JSON executada com auditoria e dry-run antes de gravar no PostgreSQL; os originais foram preservados como cópia de migração/backup.
4. Operações que alteram inventário, economia e eventos persistentes usam transações PostgreSQL para evitar duplicações e perdas em reconexões.
5. Dump e restauração PostgreSQL foram exercitados antes da ativação do preview. Definir retenção/rotação de backups como trabalho operacional contínuo; feedback mantém retenção separada dos dados do jogo.

**Estado:** contas, sessões, perfis, inventário, aparência, quartos, objetos, dimensões, mapas, fogueiras, economia e eventos persistentes usam tabelas PostgreSQL versionadas. Novas estruturas chegam por migração incremental, sem criar arquivos de save JSON.

### Fase 2 — Streaming do mundo exterior

1. Dividir cada dimensão externa em chunks; escolher tamanho somente após medir geração, memória, desenho e travessia.
2. Calcular chunks visíveis a partir da câmera, considerando a projeção isométrica e toda a área da tela.
3. Manter uma margem de chunks prontos além da área visível. Aumentar a antecipação conforme velocidade e tempo observado para gerar, carregar e preparar assets.
4. Revelar um chunk apenas quando terreno, colisão e recursos necessários estiverem prontos; descarregar chunks distantes com cache limitado.
5. Cachear terreno e geometria estática por chunk. Desenhar jogadores, objetos móveis e elementos de oclusão como entidades dinâmicas, com ordenação correta entre bordas de chunks.
6. Evitar uma borda visível ou fade para vazio. Transições suaves podem mascarar apenas objetos distantes que ainda entram na área visível.

### Fase 3 — Interiores separados e estado persistente

1. Carregar quarto, castelo e hotel como instâncias internas, sem manter a área externa inteira em desenho.
2. Validar acesso e edição no servidor com `ownerId` e permissões da instância.
3. Salvar móveis e mudanças de interiores com IDs estáveis, versão e transação; preservar o quarto ao reiniciar ou trocar servidor.
4. Definir quais ações ao sair de uma instância são imediatas e quais aguardam confirmação de persistência.

### Fase 4 — Visibilidade multiplayer e distribuição entre servidores

1. **Parcialmente integrado:** grade espacial de 8 unidades, separada por contexto de mundo/dimensão/local/instância, já reduz consultas de colisão e vizinhança sem varrer todos os jogadores.
2. **Parcialmente integrado:** o cliente informa o tamanho do viewport; snapshots enviam entidades, recursos e fogueiras dentro da área visível mais a margem de 250 px já usada no desenho, agrupando clientes por células de 16 unidades. Ainda faltam eventos explícitos de entrada/saída e atualizações incrementais para chunks.
3. Atribuir cada instância ativa a um servidor de jogo. Roteamento e transferência entre instâncias devem preservar identidade e evitar duas autoridades simultâneas sobre o mesmo jogador.
4. **Parcialmente integrado:** Redis com TTL registra presença (servidor e contexto) e reserva uma sessão por perfil entre processos. Ainda faltam leases de posse das instâncias, avisos efêmeros e roteamento pelo gateway.
5. Manter movimento e colisão dentro do servidor que possui a instância. Não retransmitir cada passo pelo Redis sem uma necessidade medida.
6. Tratar falha de Redis como perda de presença/roteamento temporário, sem perda de progresso já confirmado no PostgreSQL.

### Fase 5 — Carga, segurança e entrada gradual

1. Simular clientes em dimensões e quartos variados até a meta de 1.000 simultâneos; incluir deslocamento entre chunks, picos de login, reconexão e instâncias populares.
2. Medir CPU, memória, atraso do ciclo de simulação, tamanho e volume dos snapshots, tempo de geração de chunks, latência de banco e desconexões.
3. Testar ações simultâneas sobre inventários e quartos, repetição de mensagens, reinício de servidores, indisponibilidade de Redis/PostgreSQL e restauração de backup.
4. Definir o limite por instância a partir dos resultados, mantendo margem de segurança para picos.
5. Implantar primeiro em preview/staging, migrar uma cópia dos dados, comparar contagens e validar rollback antes de qualquer mudança no ambiente público.

## Critérios de conclusão

- 1.000 conexões simultâneas distribuídas pelo perfil acordado, sem ultrapassar os limites de latência definidos na Fase 0.
- Chunks aparecem antes de entrar na tela, não exibem costuras ou limites e permanecem iguais ao serem visitados por servidores diferentes.
- Alterações persistentes sobrevivem a reinício; uma troca confirmada não duplica nem perde itens.
- Interiores isolam jogadores, permissões e móveis; o exterior não envia o estado de dimensões ou salas irrelevantes.
- Backup restaurado com sucesso em ambiente de teste e migração dos JSON conciliada com a origem.

## Decisões ainda abertas

- Quantos jogadores devem caber juntos em um quarto, localidade ou instância externa.
- Tamanho do chunk, margem de preload e distância da área de interesse; medir em computadores e celulares reais.
- Regiões geográficas, hospedagem, alta disponibilidade, retenção dos dados e metas de recuperação.
- Se eventos precisam de replay durável; só então decidir por Redis Streams ou fila equivalente.

## Ordem recomendada

**Definir perfil de carga → implementar geração determinística e streaming local → separar interiores → adicionar área de interesse e roteamento → validar 1.000 simultâneos e praticar restauração PostgreSQL.**

## Registro de execução

- Saves versionados foram introduzidos sem reescrever os arquivos existentes: contas usam schema v1, novos inventários usam v1 e novas aparências usam v3. Leitores continuam aceitando os formatos antigos e recusam versões futuras desconhecidas.
- O formato histórico de aparência v2 usava IDs estáveis e a cadeia de leitura reconhece saves sem versão e v1. A aparência v3 atual contém somente a variante de corpo. O importador preserva opções antigas no banco e a gravação atual da variante do corpo não sobrescreve essas colunas.
- `npm run player:saves:audit -- /var/lib/clareira-dev` terminou como `clean`, somente leitura: 1 conta, 1 inventário legado, 1 aparência legada, 1 quarto com 2 objetos e 18 registros de feedback. Na última leitura havia 296 sessões convidadas: 289 ativas e 7 expiradas. O importador ignora as expiradas; a auditoria não exibe valores, nomes ou hashes.
- A migração PostgreSQL inicial, o pool limitado, os repositórios e o importador estão em `database/`. A integração real testou migração/repetição, importação sintética, registro/login, sessão, inventário, aparência, móveis e cadastro HTTP → WebSocket.
- O teste repetível `npm run scale:baseline -- --clients 13 --seconds 1` confirmou que a instância aceita 12 conexões e recusa a 13ª; os clientes são sintéticos, convidados e locais.
- Validação focada: 11 testes de saves, auditoria e contrato passaram; o teste integrado PostgreSQL passou no servidor 18.6 temporário. A suíte completa `npm test` também terminou com código 0.
- A primeira execução de testes em 2026-10-11 revelou uma referência restante a `baseOnly`, removida junto com o renderer/anatomia antigos. A validação final passou: 180/180 testes Node, 22/22 Python e `npm run content:check`.
- A checagem antiga do navegador usava o renderer raster removido e não valida o avatar modular atual. A caminhada ligada ao catálogo atual ainda aguarda revisão visual.
- PostgreSQL/Redis foram ativados no preview após cópia dos saves legados, auditoria, migrações e verificação de dump/restauração; o estado atual consta em `memory/STATUS.md` e `database/README.md`. Os JSON de origem são arquivos de migração/backup e não recebem novas gravações do jogo.
- O perfil quantitativo por instância e a divisão entre localidades ainda precisam ser definidos antes do teste distribuído de 1.000 conexões.
