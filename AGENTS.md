# Regras do agente da Clareira

Repositório canônico: `/opt/game-agent` (Git local, sem remoto). Integração em `master`, sem Pull Request. O dono do jogo é o único que autoriza integrações.

## Git por categorias

Cada mudança pertence a uma única categoria, com branch e commit próprios. Não misture categorias.

| Categoria | Branch | Cobre |
|---|---|---|
| Personagem e animação | `feat/character-*` | avatar, poses, locomoção |
| Mundo e conteúdo | `feat/world-*` | mapas, objetos, construções, assets |
| Física e servidor | `feat/server-*` | movimento, sincronização, regras |
| Interface | `feat/ui-*` | HUD, painéis, login |
| Dados | `feat/db-*` | migrações, PostgreSQL |
| Infraestrutura | `chore/infra-*` | serviços, Caddy, scripts |
| Correção | `fix/*` | bugs de qualquer área |

Commits: `categoria: resumo curto`.

## Regras centrais

1. Nunca edite direto em `master`. Trabalhe em um branch da categoria.
2. Antes de começar, rode `git status`. Preserve alterações existentes do dono; separe-as por categoria e peça aprovação antes de commitá-las.
3. Proibido: `reset --hard`, `push --force`, reescrever ou apagar histórico.
4. Segredos, contas, saves, `.local/` e `node_modules/` nunca entram no Git.
5. Não instale dependências sem autorização do dono.
6. PostgreSQL é a fonte de dados persistentes; Redis é só cache/presença.

## Processos e recursos

Nenhum processo de teste pode ficar vivo depois do trabalho. Isso vale para navegador (Chromium/Playwright), servidores temporários e proxies.

1. **Todo teste tem limite de tempo.** Rode com `timeout <segundos>` (por exemplo `timeout 300 node scripts/...`). Nenhum teste roda sem prazo.
2. **Todo script de navegador fecha o navegador sempre**, inclusive em erro ou timeout (`try/finally` com `browser.close()`). Nunca deixe um navegador aberto esperando.
3. **Servidores e proxies temporários** usam portas fora do preview real (8099 e 8100) e são encerrados no fim, mesmo se o teste falhar (`trap` no shell).
4. **Ao terminar cada tarefa, confira que não sobrou nada:** liste processos de `chrome`, `playwright` e `node scripts/` que você iniciou, e as portas temporárias em uso. Se sobrou, encerre.
5. **Encerre sempre por PID exato** (`kill <PID>`), de processos que você mesmo iniciou. Nunca use `pkill`/`killall` nem mate processos por nome, porque isso pode derrubar o preview real ou a própria sessão.
6. **Não toque em processos que você não iniciou** sem investigar o pai e o propósito. Se estiverem presos (muito tempo de vida e sem uso), informe o dono e então encerre por PID.
7. **Não execute testes em paralelo que abram navegador:** um por vez, e termine o anterior antes de iniciar o próximo.
8. **Nunca reinicie ou pare** `clareira-dev-preview-room` nem `clareira-dev-preview-page` fora da etapa de validação do jogo integrado.

## Fluxo de cada entrega

1. **Planejar:** declare em uma frase o que muda e a categoria.
2. **Implementar** no branch.
3. **Validar:** testes focados e navegador, com capturas novas em desktop e celular. HTTP 200 e ausência de erro JS não provam qualidade.
4. **Relatório de atualização ao dono:** resumo curto com categoria, o que mudou, arquivos afetados, como experimentar, resultado dos testes e as imagens de evidência. Use o mesmo formato em toda entrega.
5. **Aguardar autorização explícita.** Sem ela, não há commit nem integração.
6. **Checar conflitos antes de integrar:** simule a mesclagem com `git merge-tree --write-tree <master> <branch>`, que não altera a árvore de trabalho (o checkout canônico pode ter alterações do dono; não use `merge --no-commit` nele). Liste os arquivos em conflito. Para cada um, compare as duas versões, decida entre manter, mesclar ou reescrever, e explique o motivo. Rode os testes de novo após resolver.
7. **Integrar e commitar** em `master`, e atualize o registro de últimas modificações (seção abaixo) no mesmo commit.
8. **Validar no jogo integrado:** reinicie só o serviço de preview afetado (`clareira-dev-preview-room.service`; `clareira-dev-preview-page.service` quando necessário), teste e anexe novas evidências.
9. **Se falhar**, desfaça com `git revert` e avise o dono.
10. **Limpeza final:** confirme que nenhum processo de teste ficou vivo (seção Processos e recursos) e inclua essa confirmação no relatório.

## Registro de últimas modificações

Mantenha `MODIFICACOES.md` na raiz, com uma linha por área (categoria e, quando útil, subárea como avatar, HUD, mapa, servidor, banco): data, hash do commit, resumo de uma frase e pasta das evidências. Ao integrar uma entrega, atualize apenas a linha da área afetada, para saber de relance quando cada parte mudou pela última vez. Nunca apague o histórico: ele continua no Git.

## Evidências

- As imagens e relatórios de validação devem ficar **no computador local do dono**, onde ele acompanha o trabalho, e não apenas na VPS. Se o agente roda na VPS ou em outra máquina, ele copia os arquivos (por exemplo com `scp`) para o computador local antes de apresentar o relatório, e informa o caminho local no relatório.
- Pasta local: `~/clareira-evidencias/<data>-<categoria>-<tema>/`, contendo capturas de desktop e celular, resultado dos testes e o relatório.
- Na VPS, mantenha apenas uma cópia em `logs/<data>-<categoria>-<tema>/`, com o hash do commit.
- Nunca reutilize capturas antigas. Nada é declarado concluído sem evidência que o dono consiga abrir.
