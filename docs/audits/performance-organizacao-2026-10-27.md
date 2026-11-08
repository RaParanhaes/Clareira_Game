# Auditoria de desempenho, organização e documentação — 27/10/2026

Responsável: revisão técnica solicitada pelo dono. Coleta entre 18:11 e 18:15 UTC. Escopo: código canônico, contratos de conteúdo, manifesto público, documentação, PostgreSQL/Redis e diagnóstico do preview. Evidências em `logs/audit-20261027-performance-organization/`.

## Conclusão

O projeto tem uma arquitetura própria com vários contratos e mecanismos úteis de otimização, mas **não está integralmente padronizado, documentado ou validado em desempenho**. A existência de um catálogo válido não comprova que todos os sistemas e renderizadores estejam coerentes com ele. Há divergências verificáveis entre documentação, metadados, código no disco e processo em execução.

Esta auditoria não alterou código de jogo, serviços, configurações ou esquema do banco. As consultas PostgreSQL foram feitas em transação somente leitura. Foram gravados somente este relatório e evidências sanitizadas; não foram armazenados credenciais, cookies, nomes de jogadores, conteúdo de contas ou registros individuais do banco.

## Achados por prioridade

### Alta — código no disco exige esquema que o preview ainda não possui

- PostgreSQL tem 31 migrações aplicadas; os checksums de todas conferem com os arquivos locais.
- Existe a migração local `032_player_dimension_discoveries.sql`, ainda não aplicada.
- `database/storage.mjs:75` exige versão mínima 32 para iniciar.
- O processo do jogo estava ativo desde 09:38:13 CET; `storage.mjs` foi alterado depois desse início, às 09:44:21 CET. O arquivo do servidor também foi alterado posteriormente.
- Portanto, o HTTP 200 atual não certifica que um reinício carregando o checkout atual terá sucesso. A barreira de esquema bloquearia a inicialização com o banco observado.

Recomendação: conciliar migrações, revisão do código e release do preview antes de reiniciar. Aplicação de migração não fez parte desta análise. Evidências: `database.json`, `host.json`, `database/storage.mjs` e `database/migrations/032_player_dimension_discoveries.sql`.

### Alta — carregamento inicial ainda não tem desempenho aprovado

Uma tentativa nova, usando o perfil persistente de revisão, Chromium headless e a rota normal do bootstrap, não chegou ao jogo dentro de 90 segundos. A última amostra estava em `verifying`, a 74,1%, sem erros JavaScript registrados. Não foi antecipada a importação de `main.js` para contornar o bootstrap.

Isso comprova que a tentativa ultrapassou o orçamento de observação; não comprova bloqueio permanente nem identifica isoladamente a causa. Nenhum FPS de partida foi produzido nessa execução. Durante a auditoria, arquivos do projeto continuaram mudando e houve trabalho de Blender/Chromium concorrente no host; o cenário não é um benchmark isolado de release.

Evidência: `browser.json`. Recomendação: medir separadamente consulta do manifesto, reutilização do cache, download, verificação SHA-256, limpeza/ativação, sessão e preparação da cena, com uma versão estável e identificação do hardware.

### Alta — pacote público contém material de autoria/revisão

O inventário local de 18:12 UTC encontrou 1.334 arquivos, 35.130.606 bytes. O endpoint público, às 18:15 UTC, respondeu 200 com 1.335 arquivos e 35.647.550 bytes; o conteúdo mudou durante a coleta.

Entre os arquivos incluídos estão:

- `art/concepts/medieval-village-architecture-direction-v1.png`: 2.626.865 bytes, referenciado pela documentação como prancha-conceito.
- `art/buildings/medieval-cottage-3d/cottage-multiview-contact-sheet.png`: 628.717 bytes, identificado pelo contrato de construção como material de revisão.
- `art/tree-sprites/uv-tree-contact-sheet.png`: 610.592 bytes, prancha de contato.
- `art/room-furniture/medieval-3d-v1/`: 1.104 arquivos e 9.368.610 bytes, enquanto o renderer examinado desenha pelo atlas consolidado `medieval-furniture-v1.png`.

As três pranchas somam cerca de 3,87 MB. O diretório de 1.104 arquivos exige uma verificação de dependências antes de ser excluído; a auditoria não declara todos esses arquivos inúteis. O problema confirmado é que a seleção ampla por extensão e exceções manuais admite conteúdo de revisão no pacote que a documentação afirma excluir.

Recomendação: gerar um inventário de dependências de runtime, separar fontes/revisões do diretório público e conferir as referências indiretas antes de reduzir o manifesto. Evidências: `inventory.json`, `source-and-http.json`, `scripts/game-asset-manifest.mjs` e `game/room-fixture-renderer.mjs`.

### Alta — atlas comprimidos pequenos têm custo expressivo de memória

Estimativa de uma superfície RGBA simples, calculada por largura × altura × 4:

| Grupo | Dimensões relevantes | Memória RGBA estimada |
|---|---|---:|
| Móveis do quarto | 768 × 13.824 | 40,50 MiB |
| Móveis medievais | 640 × 27.648 | 67,50 MiB |
| Teleporte inferior | 6.400 × 2.304 | 56,25 MiB |
| Teleporte central | 5.600 × 3.480 | 74,34 MiB |
| Teleporte superior | 3.400 × 840 | 10,89 MiB |
| **Soma desses cinco atlas** | | **249,48 MiB** |

Isso não é uma medição de memória residente, nem significa que todas as superfícies estejam sempre simultaneamente alocadas. Cópias de composição, recursos gráficos, personagens, terreno e outros caches podem acrescentar custo. Um limite por número de entradas não estabelece um limite de bytes.

Recomendação: definir orçamento de memória decodificada por cena e dispositivo, medir retenção após transições e avaliar divisão dos atlas grandes sem prejudicar a animação. Evidência: `image-memory-estimates.json`.

### Média — documentação e metadados descrevem versões diferentes do jogo

| Fonte | Divergência observada |
|---|---|
| `docs/content/README.md:30` | Diz que nenhum mob está implementado; o catálogo contém 23 definições de fauna implementadas. |
| `docs/content/README.md:29` | Resume móveis em banco, cadeira e luminária; o catálogo contém 213 definições de móveis. |
| `docs/content/README.md:44` | Afirma que móveis compartilham o raio do banco e não suportam tamanhos heterogêneos; o código atual declara larguras, profundidades e colisores distintos. |
| `docs/content/README.md:54` | Trata sons como futuros; existem assets e adaptadores de áudio no runtime. |
| `docs/content/README.md:66` | Afirma exclusão de fontes/revisões e até 16 downloads; há pranchas no manifesto e a política atual pode negociar até 24 pedidos concorrentes. |
| `AGENTS.md`, `memory/STATUS.md`, skill local de entrega e `game/main.js` | As instruções divergem sobre Canvas versus PNG como renderer do personagem; o código atual tenta sprite PNG e contém caminho Canvas de fallback conforme a aparência. |
| `game/content-catalog.mjs:87` | `animation.avatar` declara apenas idle e relógio `direction-only`; o catálogo específico e o loader possuem caminhada, corrida e outros estados. |
| `memory/STATUS.md` | Descreve chama de seis quadros a 9 fps; há manifesto de chama com 16 quadros e o novo hearth com oito quadros. |
| Catálogo geral versus `game/dimensions.mjs` | Seis dimensões permanecem `planned` e usam IDs sem correspondência explícita com os IDs de execução, como `dimension.dark` versus `breu`. Existência de uma dimensão no runtime também não comprova que todas as suas funcionalidades planejadas estejam completas. |

Os 33 documentos examinados não apresentaram destinos ausentes nos links Markdown locais verificáveis. Esse resultado é positivo quanto à navegação, mas não detecta desatualização semântica, referências em texto simples ou links externos.

Recomendação: escolher a fonte canônica de cada domínio e atualizar resumo, catálogo e instruções a partir dela. Evitar atualizar só um dos documentos quando o comportamento muda.

### Média — módulos centrais concentram muitas responsabilidades

No instante da contagem: `game/main.js` com 7.913 linhas, `scripts/prototype-server.mjs` com 4.366, `database/store.mjs` com 933 e `database/economy-store.mjs` com 774. Há 177 módulos JS/MJS na raiz de `game/`, incluindo testes, e 108 arquivos de testes Node nos três diretórios principais.

Tamanho de arquivo não comprova lentidão. A concentração de UI, cena, desenho, ações e carregamento no cliente, e de múltiplos serviços no servidor, aumenta o risco de mudanças cruzadas e dificulta atribuir custo a um sistema. A árvore de trabalho também estava amplamente modificada, sem uma release limpa e imutável que pudesse ser certificada por esta coleta.

Recomendação: extrair gradualmente responsabilidades com contratos existentes, começando por carregamento, renderer de entidades, roteamento de comandos e serviços persistentes. Evitar uma reescrita geral durante a correção dos problemas operacionais prioritários.

## Performance: evidências e limites

### Diagnóstico agregado do serviço

Nas 24 horas consultadas: 209 relatórios, 511 eventos, 81 eventos de pausa de quadro e 60 registros de tick lento. Os eventos de pausa tiveram máximo de 4.483 ms; os registros de tick lento tiveram máximo de 521 ms. Na última hora, a amostra era pequena: um tick lento de 139 ms e um encerramento classificado como anormal.

Esses máximos justificam investigação, mas não identificam o culpado. Os percentis do analisador são calculados **somente sobre os eventos registrados**, não sobre todos os frames/ticks do jogo. Ticks lentos só são registrados acima de 100 ms e com limitação de frequência. Os logs misturam jogadores, automação, versões e reconexões; não fornecem um denominador para calcular uma taxa de queda.

Há ainda inconsistência entre classificações históricas: 138 códigos 1006 e 121 motivos `normal` no agregado de 139 encerramentos. Não interpretar isso como 138 falhas reais de jogadores sem separar versões e cenários de teste. Evidências: `diagnostics-24h.json`, `diagnostics-1h.json` e `scripts/analyze-movement-diagnostics.mjs`.

### Medições históricas disponíveis

- `logs/optimization-scale-after-32-1.json`, de 24/10: 32 clientes, 5,01 s, loopback; 122,9% de um núcleo e event loop p95 43,19 ms. Foram recebidos 70,8 MB somados, cerca de 14,1 MB/s, com payload médio de 20,7 KB por mensagem. Não é uma medição atual nem comprova capacidade de 200 jogadores.
- `logs/20261025-performance-complement-luna.result.json`: em viewport 4K, houve retenção de quadro de até 1.627 ms e long task de até 1.266 ms. O próprio relatório mantém a conclusão parcial e não considera stutter resolvido.
- Nesta auditoria, a sessão atual não passou do carregamento dentro do prazo; portanto não há medição nova de FPS, custo de animação, fluidez de movimento ou memória de uma partida.

## Banco de dados e Redis

Observação somente leitura, sem teste de carga:

- PostgreSQL respondeu; banco com aproximadamente 15,2 MB, 67 tabelas no schema público e zero locks aguardando na amostra.
- Estatísticas de banco: zero deadlocks e zero bytes temporários registrados; isso não demonstra ausência histórica de qualquer lentidão.
- Seis `SELECT 1` locais levaram aproximadamente 0,82–2,42 ms. Esse é o custo de uma consulta trivial pela conexão local, não a latência de compra, salvamento ou outra transação real.
- O papel do jogo não é superusuário; pool limitado e migrações com checksum são mecanismos positivos.
- O contador de índices consultado inclui todos os schemas: 367 no total e nenhum inválido. Não é uma auditoria completa da adequação dos índices das consultas de jogo.
- Redis respondeu PONG, com cerca de 1,53 MiB de memória e zero expulsões registradas. Não foram examinados valores de chaves.
- Somente a extensão `plpgsql` estava instalada; não há `pg_stat_statements` para atribuir frequência e custo agregado por consulta nesta coleta.

Conclusão limitada: não surgiu evidência de saturação do banco na amostra ociosa. Permanecem sem medição percentis das transações reais, espera do pool sob carga, crescimento/retenção dos diários e recuperação operacional atual. O desalinhamento de migração continua sendo um problema confirmado.

## Organização por domínio

| Domínio | Avaliação |
|---|---|
| Conteúdo | IDs, categorias, referências e distinção implemented/planned existem; verificador passou com 385 definições e 18 assets explícitos. Metadados ainda divergem do runtime. |
| Objetos/móveis | Contratos para catálogo persistente, colisão, apoio, profundidade, materiais e uso; catálogo amplo. Isso não certifica inspeção de todas as peças e rotações. |
| Fauna/NPCs | Fauna tem catálogo e simulação compartilhada; NPCs possuem caminhos específicos. O resumo de categorias/documentação não representa todos esses sistemas atualizados. |
| Animação | Há pivôs, direções, duração de quadros e loaders específicos; Canvas e PNG coexistem. Não há nesta auditoria certificação visual de todos os estados/aparências. |
| Renderização | Caches limitados de geometria, terreno, avatar e iluminação; preparação incremental e profiler opcional. Faltam orçamento global por bytes e prova atual de p95/p99 no hardware-alvo. |
| Rede | Autoridade do servidor, previsão/reconciliação, snapshots compactos, área de interesse e descarte quando o socket está congestionado são bases positivas. Limite configurado de 200 conexões não representa capacidade medida. |
| Persistência/economia | PostgreSQL, transações e contratos versionados; Redis separado dos dados duráveis. Implementação local e esquema ativo precisam ser conciliados. |
| Operação | Health e manifesto retornaram 200; existem diagnósticos locais com reenvio após reconexão. Health não verifica toda a compatibilidade do checkout nem prova fluidez. |
| Documentação | Há documentação por domínio e evidências, mas resumos e instruções contêm divergências materiais. Não pode ser classificada como integralmente em dia. |

## Ordem recomendada

1. Conciliar código, migração 032 e processo executado; definir uma revisão estável para a próxima validação.
2. Instrumentar/reproduzir o tempo de carregamento por etapa; remover do pacote somente arquivos comprovadamente fora do runtime.
3. Estabelecer orçamento de memória decodificada e revisar a retenção dos atlas de móveis/teleporte.
4. Medir a mesma revisão em desktop e celular físico: chegada, deslocamento, quarto com objetos, efeitos, multidão e reconexão. Registrar frame p95/p99, long tasks, memória, RTT, bytes/s, ticks e consultas reais.
5. Conciliar documentação e metadados dos sistemas já implementados; depois extrair as responsabilidades concentradas nos módulos centrais.

## Validação desta auditoria

- **Executado:** `npm run content:check` — aprovado, 385 definições e 18 assets.
- **Executado:** estado de PostgreSQL/Redis, comparação de migrações/checksums, estatísticas agregadas e consultas triviais em transação somente leitura.
- **Executado:** inventário local do manifesto, dimensão dos atlas, revisão dirigida do código e links Markdown locais de 33 documentos.
- **Executado:** agregação de diagnósticos de 24 h e 1 h; health e manifesto público HTTP 200.
- **Executado com resultado parcial:** tentativa de perfil no Chromium; encerrou após 90 s antes da cena, sem produzir amostras de gameplay.
- **Não executado:** suíte completa, nova carga multiplayer, perfis de todas as cenas/animações, medição em celular físico, restauração de backup e mudanças operacionais.
- **Próximo responsável:** manutenção do projeto, começando pela conciliação da versão executada e do esquema; este documento é diagnóstico, não certificação de release.
