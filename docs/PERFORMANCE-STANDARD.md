# Desempenho obrigatório do jogo

Este contrato vale antes de alterar animação, efeito, áudio, renderer, câmera/zoom, carregamento, dimensão, IA, física ou sincronização. Complementa [preparação de cenas](content/README.md#preparação-de-cenas-e-transições); a autoridade e a persistência continuam no servidor. Entrega visual nova só é concluída com o registro de custo e os cenários afetados abaixo.

## Implementação

1. **Preparar e reutilizar.** Baixar/conferir arte reutilizável no carregamento inicial. Reutilizar atlas pela URL/versão dos arquivos; paletas e instâncias compatíveis compartilham imagens decodificadas. Compilar composição/geometria estática uma vez. Separar estado dinâmico do desenho estático; invalidar por geometria, revisão, escala e estado realmente dependentes.
2. **Limitar trabalho.** Dividir geração, decodificação e preparação em lotes com limite de tempo e quantidade. O loader compartilha trabalhos pendentes por URL/versão, admite até três preparações simultâneas e mantém fila de até 64 trabalhos; o LRU de resultados concluídos não descarta a deduplicação dos pendentes. No cliente, terreno durante jogo e mapa usam fatias de até 1,8 ms como orçamento; terreno sob loading usa 5 ms. Uma operação indivisível que exceder a fatia exige medição e redução da granularidade. `requestIdleCallback` não torna trabalho síncrono longo gratuito. Restaurar contexto de dimensão antes de ceder o controle.
3. **Manter o jogo responsivo.** Preparar a área ampliada antes de aplicar zoom externo, preservando desenho/movimento na escala atual. Priorizar terreno visível e chegada próxima; pré-busca distante tem prioridade menor. Troca de dimensão reaproveita terreno concluído com a mesma chave geométrica. Uma imagem de outra dimensão/seed/revisão jamais substitui o destino correto. Revelação continua dependendo do snapshot e do terreno crítico prontos.
4. **Conter memória.** Todo cache/fila/pool precisa de limite, descarte e chave de invalidação. O terreno tem um orçamento compartilhado de 160 superfícies 512×308 RGBA (aproximadamente 96,25 MiB), distribuído em até oito chaves geométricas; não multiplicar esse limite pelo número de dimensões. Contar também versões reduzidas, buffers de transição e atlas, incluindo memória decodificada (`largura × altura × 4`), não apenas bytes WebP/PNG.
5. **Conter efeitos.** Cada efeito declara duração, máximo de instâncias simultâneas, partículas, fontes de luz e sons; o limite deve ser aplicado no runtime. Reusar buffers/atlas e descartar instâncias vencidas. Pausar ou simplificar trabalho fora da tela; manter ações e personagens relevantes visíveis. Movimento reduzido e qualidade adaptativa preservam informação de jogabilidade, colisão e legibilidade. Efeitos cosméticos não aumentam frequência da física nem exigem snapshots por quadro.
6. **Sincronizar estado compacto.** Enviar IDs, transformações, estados e revisões próximos; interpolação e efeitos usam relógio local sincronizado. Compartilhar serialização por área, omitir dados estáveis e descartar snapshots antigos sob backpressure. Predição exige sequência/ACK/reconciliação; otimizar não remove validação, permissão ou persistência.

### Regras após o diagnóstico de 29/10

- **Mapas de luz:** `lightmapFor` somente consulta/enfileira; nunca calcula a textura inteira durante `draw`. `processLightmapQueue` usa até 1,5 ms/256 células durante jogo e 5 ms/2.048 células sob loading. Uma célula e a alocação inicial são operações indivisíveis: registrar qualquer estouro real. A primeira cena dedica no máximo 1,5 s ao preparo dos mapas visíveis; depois revela somente o mundo autoritativo e os assets críticos prontos, mantendo a iluminação base e concluindo os mapas em segundo plano. A capacidade do cache não pode ser uma condição de entrada: uma cena com mais fontes do que o cache comporta nunca teria todos os mapas simultaneamente. Durante caminhada, as fontes são solicitadas pela área de influência antes de seu centro aparecer. Uma mudança de intensidade reaproveita temporariamente o mapa concluído da mesma geometria; mudanças em paredes, móveis ou posição exigem outro mapa.
- O cache de luz é global, LRU de até 64 imagens/64 MiB de RGBA estimado, fila de até 32 trabalhos e uma única superfície em construção; esse valor não mede cópias internas do driver/GPU. Cada superfície usa no máximo 1.048.576 pixels; fontes muito grandes reduzem só a resolução dessa textura. `inspectMovement().lightmaps` mostra consumo, fila e conclusões. Trabalhos capturam a definição da dimensão e restauram o contexto após cada lote; resultados parciais nunca são desenhados.
- A chave da iluminação usa geometria, catálogo, propriedades da fonte e intensidade. Progresso de trabalho e cooldown de recursos não invalidam geometria luminosa. O recorte de obstáculos por alcance preserva os mesmos raios e alturas. A máscara noturna invalida quando um mapa termina; não manter uma textura pronta escondida num recorte antigo.
- **Colisão em área fria:** consultar o corpo não pode gerar o chunk visual/de recursos inteiro. Os candidatos da grade procedural e a geração visual compartilham a mesma regra de existência, espaçamento, água, clareiras e acesso. Validar equivalência em diferentes seeds, dimensões, raios e bordas, incluindo árvores removidas. A renderização continua com chunks e preparo incremental próprios.
- **Atualização e carregamento:** uma versão nova não reinicia automaticamente uma sessão autenticada. Registros `loading-wait` reutilizam o buffer limitado de diagnóstico com fase/percentual, flags e contagens; nunca incluem nomes/IDs/posição. A espera do carregamento não depende de percentis do jogo já ativo.
- **Reconexão:** `send()` não comprova entrega. Após o primeiro snapshot da conexão retomada, reenfileirar os comandos ainda sem ACK; o servidor deduplica por sequência. Reiniciar os temporizadores de pressão e aguardar o snapshot antes de enviar/reavaliar recuperação. Se o servidor atribuir outra identidade, descartar comandos do ator antigo. Snapshots compactos conservam os metadados já recebidos para o mesmo ator; `reset()` exige novamente completude.

Evidências e limites da reprodução: `logs/20261029-lag-root-cause/`. Um perfil local mostrou um quadro de 1,36 s, com 1,27 s em `paintSceneLightmaps` e 1,01 s na construção síncrona dos mapas. A fila remove essa construção do desenho, mas não certifica FPS de um telefone nem elimina o custo restante de composição. A validação final exige outra caminhada real e comparação de tarefas longas, ACK e desconexões. Percentis amostrados em 1/10 dos quadros podem perder um pico; por isso `drawMaxMs` e os seis `renderPhases.*.maxMs` agora observam todos os desenhos, guardando só máximos limitados a 10 s. P95 e contagem de amostras continuam em 1/10, sem superamostrar quadros lentos.

## Medição obrigatória

Antes e depois usam a mesma cena/seed, aparelho ou classe, viewport/DPR, zoom, população, estado de luz e rede. Registrar versão do código e concorrência na máquina. Executar três amostras após aquecimento e uma entrada fria; guardar os dados individuais, não só a média.

Medir os riscos afetados: intervalo de quadro e tempo de desenho p50/p95/p99, quadros acima de 50 ms, pausas acima de 250 ms, tarefas longas, memória de superfícies/heap, bytes e mensagens/s, RTT/ACK/reconciliações, duração do tick do servidor e filas. Para viagem, separar pedido→confirmação, confirmação→primeiro quadro correto e duração artística da transição. Tempo de animação intencional não representa espera por processamento.

O profiler opcional `?profile=1` e `inspectPerformance()` fornecem detalhes locais; `inspectMovement()` fornece prontidão, posição e retenção de terreno. Não envie esses objetos de inspeção ao servidor.

### Auditoria de sessões reais

**Plano de medição:** modo agregado e autocontido; provedor interno é o WebSocket da sala e o journal do serviço. Não há tag externa, cookie de analytics, identificador persistente ou alteração de conta.

| Evento | Ativação e finalidade | Campos | Risco de identificação |
|---|---|---|---|
| `game-performance-report` | A cada 60 s ativos e visíveis; acompanhar quadro, desenho, controles, zoom e viagens reais. | Percentis/amostras limitadas, contadores e faixas de dispositivo/layout/zoom. | Baixo: nenhum ID de jogador/sessão, nome, posição, dimensão exata ou dado de jogo; `reportId` aleatório só deduplica em memória. |
| `movement-diagnostic-report` | Falha/pressão de ACK e reconexão; investigar controles que param. | Eventos técnicos permitidos por `game/movement-diagnostics.mjs`, sem texto livre. | Dados técnicos de conexão; revisar só agregado pelo analisador de movimento. |
| `movement-server-tick-slow` | Tick do servidor acima de 100 ms; encontrar custo de simulação. | Duração e faixa populacional no relatório de auditoria. | Sem identidade individual. |

O cliente envia uma janela agregada a cada 60 s de jogo visível, depois de pelo menos 10 s ativos. Para limitar custo, observa 1 em cada 10 intervalos de quadro, desenhos completos, trabalho anterior ao desenho e trabalho da fila de terreno, com até 360 amostras aleatórias uniformes locais de cada; eventos de tarefas longas, ACK/zoom/viagem e duração de trechos visíveis ainda incompletos guardam até 24 amostras uniformes e mantêm as contagens totais (tarefas longas limitadas a 10.000 por janela). Conta também quadros acima de 50/250 ms, quadros renderizados enquanto o terreno visível ainda está incompleto e o maior tamanho da fila. Agrega atraso de ACK, espera de zoom, duração do preparo do terreno, duração do trabalho anterior ao desenho e tarefas longas da API PerformanceObserver. Viagem registra pedido→confirmação do servidor e confirmação→primeiro desenho completo separadamente; a segunda medida inclui a transição visual intencional, então não é tempo de processamento puro. Se a conexão estiver fechada, a janela é descartada em vez de criar uma fila de telemetria atrasada. O servidor aceita no máximo um relatório a cada 30 s por conexão, valida campos, valores e categorias, deduplica reenvios e registra JSON `game-performance-report` em stderr/journal.

O diagnóstico de terreno usa somente duração agregada da fila, faixas/contagens de quadros com trecho visível incompleto e pico do número de trechos pendentes. Não registra coordenadas, identificador do chunk ou rota percorrida. Campos adicionados são opcionais na leitura para aceitar relatórios antigos.

O diagnóstico de pausas fora do desenho usa trabalho pré-desenho, tarefas longas e duração agregada do processamento de pacotes de estado. O tamanho do pacote é contado em caracteres da string JSON recebida (não é uma medição exata de bytes de rede). Só uma amostra em cada dez pacotes é registrada, com até 360 amostras por janela. Não armazena conteúdo de tarefas, pacotes, URLs, nomes de função, posição ou sequência temporal individual. Quando um tick autoritativo excede 100 ms, o log local separa simulação do jogador, exploração do mapa, fauna e tempo restante; o relatório agrega percentis por etapa para localizar o custo do servidor.

O diagnóstico incremental após os registros de 29/10 mede, em um quadro a cada dez, preparação, fundo, sombras, preparação da lista de entidades, desenho das entidades e efeitos finais. Em ticks lentos, registra também o tempo total/máximo dentro de `stepWildlifePopulation`, tempos de decisão/comportamento e movimento, população ativa e contagens de consultas de colisão, oclusão e água. Essas medidas refinam o gargalo sem ativar `profile=1` para todos os jogadores.

## Próximas etapas de diagnóstico de travamentos

Use os próximos relatórios nesta ordem e só otimize uma etapa depois de ela aparecer como dominante:

1. **Quadro e desenho:** compare P95/P99 do quadro com as seis etapas de desenho. Se `setup` dominar, dividir atualização do mundo, classificação por profundidade e consultas de alcance. Se `background` dominar, abrir terreno, relevo, água e luz em perfil controlado. Se preparação de entidades dominar, medir contagem visível, ordenação e filtros. Se desenho de entidades ou efeitos dominar, agrupar por tipo visual e avaliar cache, detalhe adaptativo e custo de composição.
2. **Pausas sem fase dominante:** quando tarefas longas excederem muito todas as etapas medidas, repetir no aparelho real com uma gravação curta de Performance/CPU do navegador. A telemetria do jogo continua sem conteúdo, coordenadas ou stack traces; a gravação local serve para separar decodificação de imagem, coleta de lixo, layout/UI e bloqueio do próprio navegador.
3. **Servidor e fauna:** compare `wildlifePhaseMs` com `wildlifeStepTotalMs`/`wildlifeStepMaxMs`, depois `wildlifeBehaviorMs` e `wildlifeMovementMs`. Leia também quantidade de decisões, animais ativos e chamadas de ocupação, oclusão e água; contagens altas orientam uma medição temporária da consulta correspondente. Se o custo estiver fora do passo, medir preparação da população e trabalho restante do tick. Só depois considerar escalonar decisões de IA ou reduzir trabalho por tick; preservar a física compartilhada e a taxa de snapshots até provar que a mudança mantém responsividade.
4. **Rede e ACK:** correlacione RTT do relógio, P95 de ACK, sequências recebidas no servidor, fechamento e tamanho de payload. Uma amostra grande isolada não justifica reduzir atualizações; confirme frequência e volume de pacotes antes de ajustar serialização, compressão ou interest management.
5. **Correção e repetição:** aplicar a menor correção ao gargalo medido; repetir a mesma caminhada de 60 segundos no mesmo aparelho/cena/zoom e comparar quadro, desenho, tarefas longas, ACK, desconexões, custo do tick e memória. Se o P95 continuar alto sem uma etapa dominante, parar a otimização por suposição e voltar à gravação local do navegador.

O esquema não aceita nome, conta, ID de sessão/jogador, posição, dimensão exata, inventário, chat, teclas ou aparência. O servidor acrescenta somente a hora de recebimento e uma faixa ampla de população total (`1`, `2-5`, `6-10`, `11+`). Contexto de cliente fica restrito a `mobile/desktop`, `room/clearing` e três faixas de zoom. `reportId` aleatório serve apenas para deduplicação temporária em memória. As janelas são agregadas por contexto; suas percentis de P95/P99 são percentis entre janelas, não uma distribuição combinada de cada quadro.

Para auditar uma janela operacional, extraia o journal do serviço de preview e agrupe sem IDs de relatório:

```sh
journalctl -u clareira-dev-preview-room.service --since '24 hours ago' -o cat | node scripts/analyze-performance-telemetry.mjs
```

Compare aparelhos e faixas de população com volume suficiente, mantenha FPS/quadros separados dos ACKs e da chegada, e registre versão/concorrência ao tomar decisões. A coleta responde como o jogo se comporta em sessões reais; ela não substitui amostras controladas, comparação antes/depois nem medição em aparelhos físicos.

## Cenários de regressão

| Mudança | Cenários mínimos |
|---|---|
| Animação/efeito/renderer | desktop e celular; parado, correndo, dez jogadores visíveis; máximo declarado de efeitos simultâneos; dia/noite; fora da tela; movimento reduzido |
| Câmera/terreno | zoom 100→70→125→70; caminhar/correr durante preparo; desktop, celular e 4K; retorno ao mesmo local; memória após dez ciclos |
| Dimensão/carregamento | primeira entrada; A→B→A em zoom mínimo; dez viagens; posição/estado confirmados; terreno/revisão alterados; falha e reconexão |
| Servidor/rede/IA | dez jogadores ativos juntos; distribuição por dimensões; backpressure/reconexão; filas e ticks; ações privadas isoladas |

Mudança pequena pode usar só a linha afetada, mas deve justificar qualquer cenário omitido. Imagens de desktop/celular e sequência de movimento são evidência visual; teste unitário não comprova FPS.

## Critérios de aceite

- Meta no aparelho de referência: 60 FPS desktop e 30 FPS móvel; p95 de intervalo de quadro até 33,3 ms desktop/50 ms móvel e p99 até 50/100 ms, respectivamente. São metas de validação, não resultados já atingidos pela base atual.
- Em três amostras comparáveis, p95/p99 de desenho ou quadro, pico de memória e bytes/s não podem piorar mais de 10% pela funcionalidade. A mediana das três amostras decide a regressão; qualquer pausa nova de mais de 250 ms atribuída ao preparo síncrono exige correção.
- Tick autoritativo de 30 Hz tem orçamento de 33,3 ms. Não aceitar filas que crescem durante a amostra, sessões derrubadas, comandos perdidos, nova correção brusca ou colisão divergente para melhorar métricas.
- Após dez ciclos de zoom/viagem/efeitos, caches e pools permanecem dentro dos limites declarados e não retêm crescimento proporcional às repetições. Voltar ao destino intacto deve demonstrar reaproveitamento; revisão diferente deve invalidar corretamente.
- Controles continuam respondendo e o avatar desenhado acompanha a posição simulada durante zoom. Na viagem, o destino fica protegido até primeiro quadro correto, sem vazamento de outra dimensão, quadriculado incompleto ou descarga síncrona do mundo inteiro.
- Se o baseline já exceder as metas, registrar a dívida e o quanto a mudança reduz ou mantém cada custo; não declarar o problema resolvido nem uma nova funcionalidade aprovada só porque um teste passou. Chromium sem GPU na VPS certifica funcionamento e comparações locais controladas, não desempenho de um telefone real.
- Carga concorrente de testes, Blender ou outro navegador torna percentuais de ganho inconclusivos. Guardar a tentativa como diagnóstico e repetir com concorrência controlada; não publicar seus números como comparação válida.

## Registro da entrega

Guardar em `logs/<entrega>/`: cenário/configuração, versões antes/depois, amostras brutas e resumo dos percentis, limites de instâncias/memória, screenshots e ação exercitada, resultado de invalidação/retorno e limitações. A descrição final informa o ganho observado e os critérios ainda pendentes. O orçamento novo e sua justificativa devem constar junto à definição do conteúdo, antes de marcá-lo `implemented`.

### Trabalho repetido no cliente e passagens de quarto — 29/10

- Inventário e receitas não devem reescrever o DOM a cada snapshot de posição. A chave do HUD considera o inventário completo, seleção e arraste. Atualizações reais e abertura do painel continuam imediatas; cooldowns seguem pelo relógio e só alteram texto quando o valor visível muda.
- O recorte de entidades usa sua pegada visual conservadora. Manter coroas de árvores, salto, nome/efeitos do avatar e o volume inteiro de construções sobrepondo a tela. Recortar o desenho não remove colisores nem estado autoritativo e não troca a ordenação por profundidade.
- Coberturas procedurais fixas usam raster reutilizável separado dos pilares e do corpo da construção. O cache específico tem 16 entradas e chave por construção/zoom/revisão do catálogo/contexto; não fundir peças que precisam de profundidades distintas. No ensaio, quatro coberturas usaram 172.640 bytes RGBA estimados.
- PNGs com grande margem transparente podem ter a caixa alfa calculada uma vez no preparo. Desenhar o retângulo de origem preservando a escala e o deslocamento em relação ao pivô original; não recentralizar a peça recortada. Sem leitura disponível, conservar o desenho inteiro. As quatro escalas testadas do recorte produziram pixels idênticos.
- Passagem cobre imediatamente, antes de esperar a resposta de rede, e limpa teclado/toque/caminho. Continuar bloqueando previsão e comandos até acabar o fade do primeiro quadro correto. Uma passagem rejeitada pelo servidor desfaz apenas sua cobertura, pelo requestId correspondente. A saída caminhando usa a mesma regra compartilhada de cruzamento da soleira.
- Recuperação de movimento pode pedir ao servidor o encerramento imediato do próprio socket antes do fallback de close, para liberar sua presença sem depender de um handshake de fechamento. Preservar ator, estado autoritativo e comandos no mecanismo de retomada. Um erro em um quadro não deve encerrar permanentemente a cadeia de requestAnimationFrame; registrar ocorrência limitada como `runtime-error`, sem mensagem/stack/posição.

Evidência: `logs/20261029-room-movement/comparison.json`. Uma comparação controlada em Chromium móvel com CPU 4× mais lenta reduziu o custo acumulado de `renderInventory` de 708,7 para 31,8 ms na primeira intervenção, mas o P95 global não melhorou nessa etapa isolada. Após reutilizar coberturas e recortar as camadas PNG, P95 de entidades passou de 104,3 para 81,1 ms e P95 de quadro de 310,5 para 261,8 ms. É um ensaio por variante, com a mesma cena/seed, câmera, horário, rota e configuração; não equivale a três amostras nem certifica FPS no aparelho do jogador. As pausas restantes e a perda de ACK na sessão real continuam exigindo comparação de telemetria após atualização.

Na recuperação, fila grande não significa conexão morta: `shouldRecoverPrediction` exige também ausência de progresso de ACK por pelo menos 750 ms (ou o limite de stall, se menor) antes de acionar a regra de pressão sustentada. A proteção de fila cheia sem ACK continua ativa. O teste de rede que enche a fila mostrou reconexões adicionais enquanto ela drenava; a regra agora conserva a retomada enquanto as confirmações continuam avançando. Isso corrige a decisão de recuperação, sem aumentar o limite de comandos nem descartar passos não confirmados.

### Erro de ordem reproduzido na retomada

Um snapshot compacto da conexão retomada pode confirmar comandos antigos antes de trazer as três coleções obrigatórias da cena. Esses ACKs não liberam o envio de movimento: a conexão só pode enviar após o primeiro snapshot completo. O cliente continuava prevendo até preencher 180 comandos; quando o pacote completo finalmente chegava, a recuperação enxergava um relógio antigo e fechava o socket antes de escoar os comandos pendentes.

A passagem `connectionSnapshotReady: false → true` agora abre um novo relógio de envio/pressão, uma vez por conexão. Esse primeiro snapshot completo também reenfileira os passos ainda sem ACK, mesmo quando um pacote parcial anterior já limpou `resumeCorrectionPending`. Snapshots seguintes não reiniciam o relógio: um stall real continua detectável. O teste segura os snapshots por 6,2 s, exige uma única reconexão e depois cobra fila zerada e deslocamento real. Isso corrige a ordem do protocolo; não aumenta filas nem timeouts.

Snapshots de movimento recebidos antes de uma atualização visual podem ser consolidados numa caixa de um único estado pendente. Preservar metadados omitidos dos jogadores do pacote mais novo e as últimas coleções explicitamente recebidas; `[]` continua significando remoção. Jogadores ausentes do pacote novo não são mantidos. Mudança de dimensão/local/roomKey descarta a caixa anterior; ações, notices e confirmações de interação seguem sua via ordenada. Não reduzir a física do servidor nem perder ACKs ao consolidar estado. A reprodução com snapshots retidos deixou de fazer uma segunda reconexão após essa consolidação e a correção da janela de prontidão.

Com a caixa de snapshots e a ordem de retomada corrigida, o ensaio final registrou média de quadro 133,9 ms contra 169,3 ms; P95 de entidades 73,2 contra 104,3 ms; P95 geral 284,4 contra 310,5 ms. Há variação entre ensaios: o P95 geral da etapa anterior foi 261,8 ms, portanto não atribuir uma melhoria garantida de cauda à consolidação isolada. A confirmação forte do bloqueio é funcional: a reprodução final conserva uma única reconexão e movimento após fila zerada, enquanto a implementação anterior reconectava novamente. Os picos restantes continuam abertos para telemetria/perfil do aparelho.

### Métricas consultáveis e exportáveis (29/10)

Configurações → Desempenho oferece painel opcional e download local. O contrato e a interpretação estão em [auditoria das métricas](audits/2026-10-29-performance-metrics.md). Manter coleta por quadro sem DOM e com espaço constante; calcular percentis e atualizar texto no máximo uma vez por segundo. Exportar apenas a lista explícita de campos técnicos. Distinguir janela móvel de quadros, contadores acumulados, RTT recente e jitter; memória indisponível deve ser `null`, nunca zero inventado. Taxa em caracteres não pode ser rotulada bytes de rede. Reservatórios preenchidos devem continuar produzindo relatórios válidos em 120/144/200 FPS.

### Picos correlacionados por desenho

Medir a duração total no ponto central de renderização, incluindo preparo, resize e zoom. Não misturar máximos de etapas observadas em todas as chamadas com total observado somente no RAF. `render-spike` preserva as seis etapas do mesmo desenho ≥50 ms, com intervalo mínimo de 5 s e até 20 eventos no export local. Manter origem numérica e contagens técnicas; não enviar objeto, posição ou nome. Eventos de preparo devem ser distinguidos de caminhada. Conclusão de sprite não redesenha o mundo sincronicamente se o RAF já faz isso no quadro seguinte. Auditoria real: [caminhada e picos residuais](audits/2026-10-29-player-spikes.md).

### Dimensões, chunks e animação

Aplicar [SCENE-RUNTIME-RULES.md](SCENE-RUNTIME-RULES.md) às próximas alterações. A referência atual é passo de física de 1/60 s e alvo de snapshot de 50 ms, com chunks lógicos de 16×16 e blocos de terreno de 8×8. Não usar FPS como relógio lógico, nem tratar chunk de render como unidade de posse. Distribuição só poderá ser validada por integrações de autoridade, relógio, transferência e fronteira; os testes atuais do monólito não provam isso.
