# Auditoria de conexão, persistência e estabilidade — Clareira

Data: 24 de outubro de 2026
Escopo: preview /dev/, sala WebSocket, coordenação Redis, persistência PostgreSQL, inventário, coleta e retorno de recursos. O fluxo de teleporte entre dimensões não foi alterado.

## Resultado do relato de travamento

O Redis coordena presença e sessões; ele não é a fonte persistente das árvores, itens no chão nem inventário. Esses dados ficam no PostgreSQL. O código de recursos tem retorno programado: recursos comuns voltam após quatro minutos; itens que caem de uma árvore acompanham o prazo de retorno daquela árvore, de sete dias do jogo (2h48 no relógio atual). Os temporizadores são reconstruídos quando a sala inicia.

A leitura agregada do estado atual do banco não encontrou marcações de árvore derrubada nem recurso aguardando retorno. Portanto, não foi possível reproduzir uma árvore específica reaparecendo por perda de estado no reinício. Encontrei, contudo, dois defeitos confirmados que aumentavam o risco de travamento e inconsistência:

- Cada alteração regravava todos os objetos da dimensão. Na Clareira eram 115 objetos; as estatísticas acumuladas da tabela mostravam aproximadamente 61 mil inserções e 60 mil exclusões.
- A coleta salvava primeiro o mundo e depois a mochila. Uma queda abrupta entre as duas transações podia esconder o item sem creditar a mochila.

A gravação agora compara os objetos existentes e salva apenas as diferenças. Para coleta no PostgreSQL, retirada do item, inventário e registro da ação estão na mesma transação. Um erro em qualquer etapa reverte as três. A mochila em memória só muda depois do commit.

## 30 hipóteses verificadas

| # | Área | Hipótese examinada | Veredito e evidência |
|---:|---|---|---|
| 1 | Redis | Uma falha momentânea de heartbeat derruba todos os jogadores | **Defeito corrigido nas alterações presentes:** erros transitórios agora mantêm a sessão para nova tentativa; teste dedicado passou. |
| 2 | Redis | Lease realmente substituída é ignorada | **Controle presente:** só o resultado explícito de lease perdida encerra a conexão correspondente. |
| 3 | Entrada WebSocket | Duas conexões simultâneas da mesma conta passam pela verificação | **Defeito corrigido nas alterações presentes:** reserva pendente por conta bloqueia a corrida; teste de sessão duplicada passou. |
| 4 | Mensagens WebSocket | Rejeição assíncrona de ação escapa e derruba o processo | **Defeito corrigido nas alterações presentes:** a rejeição é capturada e isolada na conexão; teste correspondente passou. |
| 5 | Sessão | Cookie inválido entra na sala | **Não confirmado:** a atualização WebSocket exige sessão resolvida e rejeita sem autenticação; há teste de sessão inválida. |
| 6 | Origem | Site externo pode abrir a sala diretamente | **Não confirmado:** a origem precisa corresponder à origem permitida antes do upgrade. |
| 7 | Rota | Qualquer rota aceita upgrade WebSocket | **Não confirmado:** só /room aceita upgrade; as demais são recusadas. |
| 8 | Capacidade | Conexões ainda autenticando não contam para o limite | **Não confirmado:** admissões pendentes reservam vaga antes da autenticação terminar. |
| 9 | Capacidade | Sala pode exceder o máximo configurado | **Não confirmado:** o limite por processo é 200 conexões ativas e pendentes; acima disso há resposta 503. |
| 10 | IP | Há um limite de conexões por endereço IP | **Não existe limite por IP no código atual.** A proteção é o teto global por processo; isso evita bloquear várias pessoas atrás do mesmo Wi‑Fi/NAT. |
| 11 | Conta | A mesma conta pode jogar em duas conexões ao mesmo tempo | **Não:** a segunda conexão é recusada com 409; depois da desconexão a conta pode entrar novamente. |
| 12 | Visitante | Dois visitantes distintos no mesmo IP são confundidos como a mesma pessoa | **Não confirmado:** cada perfil de visitante tem identidade própria; ambos podem entrar até o limite global. |
| 13 | Visitante | A mesma sessão de visitante abre conexões duplicadas sem coordenação | **Não confirmado:** quando Redis está ativo, a lease usa o ID do perfil também para visitantes. |
| 14 | Redis | Indisponibilidade breve fecha sockets já ativos | **Não confirmado:** o heartbeat transitório mantém conexões existentes; novas admissões podem receber 503 enquanto Redis não responde. |
| 15 | Payload | Mensagem WebSocket excessiva pode consumir memória sem limite | **Não confirmado:** payload máximo de 4 KiB. |
| 16 | Inicialização | Cliente envia uma fila ilimitada antes de concluir a entrada | **Não confirmado:** no máximo 16 mensagens precoces; excesso fecha somente aquele socket. |
| 17 | Backpressure | Um celular lento acumula snapshots antigos até travar a sala | **Não confirmado:** sockets com fila acima de 64 KiB deixam de receber snapshots velhos e voltam a acompanhar quando liberam buffer; teste passou. |
| 18 | Movimento | Pacotes repetidos duplicam deslocamento | **Não confirmado:** sequências de entrada são confirmadas pelo servidor; suíte cobre repetição e movimento autoritativo. |
| 19 | Movimento | Fila de comandos permite movimento arbitrário por tempo indefinido | **Não confirmado:** a fila é limitada a aproximadamente um segundo de comandos. |
| 20 | Reconexão | Queda temporária não tenta reconectar | **Não confirmado:** cliente reconecta com atraso progressivo limitado a 15 segundos. |
| 21 | Reconexão | Confirmações de movimento paradas deixam o jogador preso para sempre | **Não confirmado:** o cliente encerra a conexão travada e tenta voltar à posição salva; cenário de reconexão está coberto. |
| 22 | Latência | Movimento só chega ao outro jogador quando o mapa completo é reenviado | **Não confirmado:** snapshots compactos levam movimento sem dados do mundo; teste mediu 21,2 ms no movimento remoto. |
| 23 | Taxa de snapshots | Sala deixa de transmitir estados em ritmo jogável com poucos jogadores | **Passou nesta rodada:** teste de 30 Hz observou 19 snapshots/s, dentro do mínimo de 16 definido pelo teste. |
| 24 | Capacidade | 50 jogadores simultâneos deixam de receber estados ou mover | **Não confirmado:** teste de 50 jogadores ativos passou. |
| 25 | Mundo | Duas pessoas coletam o mesmo objeto e ambas recebem o item | **Não confirmado:** revisão otimista por revisão do mundo faz uma operação perder com 409; a sala recarrega o estado vencedor. |
| 26 | Banco | Cada coleta regrava o mundo inteiro e aumenta o trabalho do servidor | **Defeito corrigido:** gravação incremental; teste com 100 objetos confirmou uma única inserção para uma nova coleta, sem apagar nem regravar os demais. |
| 27 | Banco | Processo cai entre retirar o item e creditar a mochila | **Defeito corrigido:** estado do mundo, inventário e evento agora usam uma transação PostgreSQL única; teste verificou rollback integral. |
| 28 | Árvore | Reinício apaga a marca de árvore derrubada e cria a árvore novamente | **Não reproduzido no banco atual:** marcadores e prazos são persistidos e seus timers são reconstruídos no início da sala. O estado consultado não tinha árvore derrubada pendente. |
| 29 | Recursos | Item coletado reaparece imediatamente depois de reiniciar | **Não confirmado como comportamento normal:** o cooldown é persistido e reconstituído; o prazo de retorno é respeitado. O ciclo de retorno explica reaparecimento após o prazo. |
| 30 | Inventário | Inventário de conta registrada desaparece em reconexão normal | **Não confirmado:** testes verificam mochila e espaços salvos após reconectar. Visitantes têm mochila temporária, que não é persistida após reinício por projeto. |

## Limites e riscos condicionais

A suíte final teve 382 testes Node (378 aprovados, 4 ignorados, nenhum falho) e 32 testes Python aprovados. O preview permaneceu ativo com zero reinícios inesperados após a restauração. Não há evidência suficiente para atribuir os travamentos relatados a uma queda do Redis. O custo excessivo de gravação do mundo era um agravante plausível, mas não foi possível reproduzir o travamento original de 5–20 segundos em uma sessão real.

Há outras janelas de consistência que só aparecem se o processo for encerrado exatamente entre operações já separadas, como transferir uma frutinha entre duas contas ou persistir durabilidade de ferramenta antes do progresso de corte. Elas não explicam a queda simultânea de WebSockets observada e não foram alteradas nesta correção.

A integração formal que exige TEST_DATABASE_URL foi omitida. Para validar a SQL real, executei o novo caminho contra o PostgreSQL do preview dentro de uma transação forçada a rollback: mundo e evento foram aceitos e nenhuma linha de teste permaneceu. Os testes isolados verificaram também inventário, ordem de commit e rollback. Após atualizar a sala, o teste real de navegador passou no desktop: movimento chegou ao servidor; a reconexão forçada sob 700 ms de ida e volta voltou com inventário e sem comandos pendentes. No diagnóstico móvel, movimento e posição final também ficaram sincronizados, sem comandos pendentes. O roteiro móvel completo navegou novamente para a mesma URL durante a conferência do cache e perdeu sua função de diagnóstico; por isso o resultado móvel é parcial. A página pública respondeu HTTP 200 e a sala respondeu /health com ok.
