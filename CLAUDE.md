# CLAUDE.md — Clareira

Guia para o Claude Code neste repositório. Leia antes de qualquer mudança. As regras detalhadas continuam nos documentos citados abaixo; este arquivo resume o que importa no dia a dia.

## O que é o projeto

Clareira é um protótipo multiplayer de exploração social em pixel art isométrica, feito pelo dono (Rafael). Textos em português brasileiro. Stack:

- **Cliente:** Canvas 2D e DOM, JavaScript de módulos ES (`game/*.mjs`). O arquivo `game/main.js` concentra boa parte do cliente e é grande; prefira extrair módulos novos a crescê-lo.
- **Servidor:** Node.js com WebSocket (`scripts/prototype-server.mjs`, também grande).
- **Dados:** PostgreSQL é a fonte persistente. Redis é só cache e presença. JSON existe apenas para testes, migração e backup.
- **Arte:** fontes em `art-source/` e `game/art/` (inclui arquivos Blender `.blend` e um vídeo).
- **Gráficos:** o jogo não usa engine. Não migre a engine para concluir uma tarefa.

A experiência e a direção visual estão em `GAME_BRIEF.md` e `ART_DIRECTION.md`. O plano atual está em `DELIVERY_PLAN.md`, e o estado por área em `memory/STATUS.md`.

## Prioridade atual

Um mundo jogável vem antes do acabamento. A primeira jornada completa, descrita em `DELIVERY_PLAN.md`, é o próximo marco: chegada, ferramentas, expedição, uso de recursos e teste com outra pessoa. Não declare nada concluído só porque os testes passaram. Demonstre o comportamento ao jogador.

## Comandos

```sh
npm install
npm test                 # suíte completa (Node + Python); pode ultrapassar o tempo de uma sessão
npm run preview          # prévia do cliente, porta 8100
npm run room             # servidor multiplayer, porta 8099
npm run content:check    # valida catálogo de conteúdo
npm run db:migrate       # aplica migrações PostgreSQL
```

Testes focados por área costumam ser mais úteis: `node --test game/<arquivo>.test.mjs`. Quando o teste envolver navegador, use `timeout` e feche o navegador no `finally`.

## Git: regras obrigatórias

Estas regras vêm de `AGENTS.md` e `ROOT_POLICY.md`.

1. **Nunca edite nem commite direto em `main`.** Trabalhe em uma branch por categoria: `feat/character-*`, `feat/world-*`, `feat/server-*`, `feat/ui-*`, `feat/db-*`, `chore/infra-*` ou `fix/*`.
2. **Uma categoria por commit.** Não misture mudanças de áreas diferentes.
3. Mensagens de commit no formato `categoria: resumo curto`.
4. **Proibido:** `git reset --hard`, `push --force`, reescrever ou apagar histórico.
5. Antes de começar, rode `git status`. Mudanças que não são suas devem ser preservadas e separadas por categoria. Peça aprovação antes de commitá-las.
6. Nenhum commit ou integração sem autorização explícita do dono.
7. Segredos, contas, saves, `.local/` e `node_modules/` nunca entram no Git.
8. Não instale dependências sem autorização do dono.

**Divergência conhecida:** `AGENTS.md` ainda fala em `master` e num checkout em `/opt/game-agent`. O remoto oficial é o GitHub (`RaParanhaes/Clareira_Game`), cuja branch padrão é `main`. Até o dono atualizar `AGENTS.md`, trate `main` como a branch de integração.

## Processos e recursos

- Todo teste ou script roda com limite de tempo: `timeout <segundos> ...`.
- Todo script de navegador fecha o navegador sempre (`try/finally` com `browser.close()`).
- Servidores temporários usam portas fora de 8099 e 8100, e são encerrados ao fim, mesmo em erro.
- Ao terminar, confira que não sobrou processo de teste (`chrome`, `playwright`, `node scripts/`) que você iniciou.
- Encerre processos **por PID exato**, e só os que você iniciou. Nunca use `pkill` ou `killall`.
- Não mexa em `clareira-dev-preview-room` nem `clareira-dev-preview-page` fora da etapa de validação do jogo integrado.
- Não rode testes que abrem navegador em paralelo.

## Fluxo de uma entrega

1. **Planejar:** diga em uma frase o que muda e a categoria.
2. **Implementar** na branch da categoria.
3. **Validar:** testes focados e navegador, com capturas novas de desktop e celular. HTTP 200 e ausência de erro JS não provam qualidade.
4. **Relatar ao dono:** categoria, o que mudou, arquivos afetados, como testar, resultado e evidências.
5. **Aguardar autorização.** Sem ela, não há merge.
6. Antes de integrar, simule o merge com `git merge-tree --write-tree` e resolva conflitos explicando a decisão.
7. **Se falhar,** desfaça com `git revert` e avise o dono.

## Evidências

- Capturas, resultados e relatórios de validação vão para `logs/<data>-<categoria>-<tema>/`. A pasta `logs/` está no `.gitignore`.
- Nunca reutilize capturas antigas. Nada é declarado concluído sem evidência.
- Quando o trabalho rodar na VPS, copie as evidências para o computador do dono antes de apresentar o relatório.

## Regras de arte e código

- Use os tokens de `game/theme.mjs` e as variáveis `--clareira-*` de `game/style.css` como paleta comum.
- Mantenha a escala inteira dos pixels e a grade lógica. O personagem é desenhado em `game/canvas-avatar.mjs` com grade 48×48, célula 96×96, pivô (48, 84) e oito direções.
- Antes de criar ou alterar construção, móvel, vegetação, terreno ou material, leia `docs/content/UV-MATERIALS.md`, `docs/content/ISOMETRIC-DEPTH.md` e `docs/content/BUILDING-STANDARD.md`.
- Assets 3D seguem `docs/content/BLENDER-ASSET-WORKFLOW.md`. Use `npm run art:cottage:build` e `npm run art:cottage:check` como referência.
- Animação ligada ao catálogo só entra depois de aprovada visualmente, quadro a quadro. Não trate ligação técnica como aprovação.
- Referências de Habbo, Terraria, Minecraft e outras servem para entender sensação e sistemas. Nunca reutilize arte, personagens, músicas ou sons delas.
- Servidor valida física, recursos, móveis, propriedade e persistência. Cliente desenha e interpola. Não envie imagens renderizadas pelo servidor e não aumente a frequência de snapshots para esconder animação errada.
- Não rode `setTimeout`/`setInterval` de animação no lugar de `requestAnimationFrame`, a menos que o motivo esteja documentado.

## Regras de texto

- Voz curta, calorosa e concreta, conforme `GAME_BRIEF.md`. Só dê nome próprio a lugares que existam no mapa.
- Textos de entrada variam por dia em `game/entry-copy.mjs`.

## Política do jogo

- Desenvolva um jogo honesto: sem dark patterns, engano, práticas predatórias ou manipulação abusiva.
- `ROOT_POLICY.md` é a política operacional. Não modifique, exclua ou contorne esse arquivo, nem crie mecanismos para isso.
- Preserve acesso administrativo, SSH e capacidade de recuperação da VPS. Antes de mudança destrutiva, verifique dependências, faça backup e prepare rollback.

## Onde procurar

| Assunto | Arquivo |
|---|---|
| Regras de desenvolvimento | `AGENTS.md`, `ROOT_POLICY.md` |
| Experiência e direção | `GAME_BRIEF.md`, `ART_DIRECTION.md` |
| Plano atual | `DELIVERY_PLAN.md`, `memory/STATUS.md` |
| Aprendizados verificados | `LEARNINGS.md` (registre aqui novas descobertas, com data) |
| Banco de dados | `database/README.md`, `database/migrations/` |
| Desempenho | `docs/PERFORMANCE-STANDARD.md`, `docs/SCENE-RUNTIME-RULES.md` |
| Fauna | `docs/WILDLIFE-ECOLOGY.md` |
| Painéis de interação | `docs/INTERACTION-PANELS.md` |

## Pontos de atenção

- `AGENTS.md` cita `MODIFICACOES.md` e `logs/`. Hoje `MODIFICACOES.md` não existe no repositório; crie-o só quando o dono pedir.
- `database/README.md` mostra uma URL de exemplo com a senha `senha`. É apenas exemplo, mas não use esse valor em nenhum ambiente real.
- Os scripts de navegador usam senhas de teste fixas; são dados de fixture, não credenciais.
