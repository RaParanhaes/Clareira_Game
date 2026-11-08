# Métricas de desempenho e redução de trabalho repetido

No `/dev/`, abrir Menu → Configurações → Desempenho. “Mostrar FPS e conexão” exibe um painel que não captura toques. “Baixar log de desempenho” salva um JSON local para análise; não envia o arquivo a terceiros.

## Como interpretar

- FPS usa a média dos intervalos dos últimos 240 quadros desenhados, e não a média dos FPS instantâneos. Quadro p95/p99 e máximo revelam a irregularidade que a média esconde. Contagem de pausas também usa essa janela, cuja duração varia com o FPS.
- Desenho p95 mede trabalho síncrono de Canvas/JavaScript. Não mede diretamente tempo de GPU, composição nem apresentação física da tela.
- Ping é o último RTT do protocolo existente de relógio. Jitter é a média da diferença absoluta entre RTTs consecutivos, em até 20 amostras. Não é perda de pacotes; WebSocket não oferece essa medida diretamente.
- Fila distingue entradas previstas aguardando confirmação e entradas esperando envio; bufferedBytes é o buffer de transporte do navegador.
- Mensagens/s e caracteres/s contam recebimentos antes do agrupamento de estados. Caracteres não são bytes transferidos/comprimidos. Estados agrupados contam trabalho de aplicação evitado, sem descartar ações.
- Reconexões contam aberturas após a primeira; longTasks conta tarefas de pelo menos 50 ms observadas pela API do navegador. Memória JS é aproximada e aparece como indisponível quando a API não existe. Não representa toda a memória do processo ou GPU.

## Custos e limites

Duas matrizes numéricas de 240 posições são atualizadas por quadro; percentis e texto somente uma vez por segundo. Exportação mantém até 60 registros de atualização e dez relatórios agregados. A lista explícita de campos exclui identidade, inventário, chat, coordenadas e estado integral de jogadores. O relatório automático existente continua com validação e limitação no servidor; estes registros locais complementam os logs `game-performance-report` e os diagnósticos de movimento.

`inspectRuntimePerformance()` permite leitura sem habilitar o profiler detalhado; `exportPerformanceLog()` retorna os mesmos dados do download. `?profile=1` e `inspectPerformance()` continuam disponíveis para investigação por fase.

## Otimização

O grafo de aparência já congelado pelo resolvedor agora tem um caminho direto em WeakMap. O desenho usa essa aparência canônica; valores mutáveis do editor continuam normalizados e invalidados por conteúdo. Chaves de grupos PNG são memorizadas por composição e ação, preservando a ordem dos assets e o compartilhamento de imagens. WeakMaps não retêm objetos descartados. Geometria, profundidade, física e frames de animação não são alterados.

Também foi corrigido o contador de amostras dos relatórios de alta taxa de atualização: depois de preencher os reservatórios, o relatório usava o total observado e era rejeitado pelo limite de 360. Agora informa o tamanho real armazenado.

Evidências e limitações: `logs/20261029-performance-metrics/`. O microbenchmark de composição mede somente CPU desse caminho; não deve ser apresentado como ganho equivalente de FPS. Medições de Chromium na VPS não substituem o teste no celular do jogador.

## Resultado controlado

Três execuções alternadas por variante, Chromium móvel 390×844, DPR 3, CPU limitada a 4×, zoom 70%, mesma cópia do mundo/catálogo e horário 08h. Cada contexto foi aberto novamente; após preparar a cena, quatro direções por 1,8 s e 5 s de espera foram medidas com profiler ligado. Não equivale a três execuções com cache quente mais uma fria no aparelho real.

Medianas entre as três execuções:

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| Média do intervalo entre quadros | 143,2 ms | 126,9 ms |
| p95 do intervalo entre quadros | 319,0 ms | 268,1 ms |
| Média do desenho | 53,8 ms | 50,9 ms |
| p95 do desenho | 114,7 ms | 133,3 ms |

O intervalo médio caiu 11,4%, e seu p95 caiu 16%. Entretanto, o p95 de desenho subiu 16,2%; não foi comprovada melhora das caudas de renderização. Há variação de agendamento, posição final, coleta de lixo e trabalho nativo. A otimização elimina preparação repetida, mas não resolve o custo inteiro de Canvas/composição/GPU. Preservar as seis execuções, inclusive o resultado desfavorável, em `comparison.json`.

No microbenchmark do caminho imutável (30 mil resoluções, sete execuções alternadas), a mediana caiu de 469,1 ms para 0,8 ms. Essa diferença não pode ser convertida diretamente em FPS do jogo.

## Validação final

54 testes focados aprovados, catálogo com 385 definições válido. No preview público `9ba6f407`, Chromium móvel entrou pelo tutorial, chegou ao bosque, restaurou a sessão após recarregar e caminhou com fila zero. O painel foi ativado pelo menu e o JSON realmente baixado/validado; o painel coube na largura de 320 px. Sem erros JS. A primeira tentativa revelou erro de escopo no diagnóstico da idade de mensagem; a leitura passou para o coletor e ganhou teste do atualizador real. A suíte completa de stress não foi repetida nesta passagem.
