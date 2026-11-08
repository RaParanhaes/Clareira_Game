# Sociedade de agentes da Clareira

A sociedade trabalha no único checkout em `/opt/game-agent` e deixa mudanças aprovadas no preview `/dev/`. Ela não cria branches, worktrees nem cópias do jogo e não altera `production/` ou a configuração de rotas.

## Papéis e ciclo

1. **Planejamento e contexto:** compara `DELIVERY_PLAN.md`, brief, direção de arte, estado e último resultado; escolhe uma única fatia com critérios observáveis e caminhos permitidos.
2. **Especialista:** implementa uma fatia de gameplay/física, personagem/animação, efeitos visuais, UI/UX, conteúdo ou desempenho.
3. **Revisão independente:** confere o diff exato, os testes e capturas antes/depois. Pode pedir uma rodada curta de reparo e depois revisa novamente.
4. **Integração:** aceita somente com critérios e evidências suficientes. Falhas ou lacunas exigidas fazem o coordenador reverter a mudança, desde que o checkout não tenha sido alterado em paralelo.

Os papéis são sessões Codex separadas e sequenciais. Uma trava global impede ciclos concorrentes. O coordenador compara árvores Git temporárias do mesmo checkout para guardar o diff e restaurar um candidato rejeitado; não cria branch, commit ou checkout.

## Teto diário

O teto compartilhado é **8 horas ativas por dia**, somando todos os papéis, no fuso `Europe/Berlin`. O coordenador contabiliza o tempo de cada processo `codex exec` desde o início até o fim, arredondando para cima para não ultrapassar o limite. O intervalo ocioso entre ciclos não conta. O limite está no ledger protegido em `ops/agent-society/budget.py`; papéis de jogo não podem alterá-lo.

Cada ciclo reserva tempo para revisão independente e integração. O teto é um máximo, não uma meta a consumir. Quando acabar, o serviço espera a virada do dia. Resultados, diffs, capturas e logs ficam privados em `/var/lib/clareira-agent-society/`.

## Evidências

Toda mudança executa a suíte `npm test` antes e depois, além do comando focado definido no plano. Quando aplicável, o coordenador executa o mesmo verificador de navegador contra o baseline e o candidato e anexa pares de imagens à revisão. Apenas o código que passa pelos gates permanece no preview.

O `game-dev` CLI exigido pelos fluxos selados de depuração visual e medição de desempenho não está instalado nesta máquina. O coordenador registra esse bloqueio e não aceita uma tarefa que dependa dessas medições. As verificações de navegador existentes no próprio projeto continuam sendo evidência funcional do `/dev/`; elas não são apresentadas como métricas de hardware nem como telemetria selada.

## Operação

O serviço é `clareira-agent-society.service` e inicia com o sistema. O agente só reinicia `clareira-dev-preview-room.service` depois de uma alteração em código e nunca toca o ambiente de produção.

```sh
systemctl status clareira-agent-society.service
systemctl stop clareira-agent-society.service
systemctl start clareira-agent-society.service
python3 /opt/game-agent/ops/agent-society/runner.py status
```

O comando `preflight` valida autenticação local, ferramentas, limite diário, branch única `master` e o único worktree antes de qualquer ciclo. `once` executa exatamente um ciclo; `daemon` é o modo contínuo usado pelo serviço.
