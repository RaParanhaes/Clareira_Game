# Clareira

Protótipo multiplayer de exploração social em pixel art isométrica. O desenvolvimento, os testes e o acesso público ao protótipo ficam em `/dev/`; a raiz pública retorna 404.

## Executar localmente

Requer Node.js 18 ou superior e a dependência `ws` registrada no `package.json`.

```sh
npm install
npm test
npm run preview
npm run room
```

Abra `http://localhost:8100/`. O servidor multiplayer usa a porta 8099. O serviço de prévia do VPS encaminha `/dev/` para a porta 8100 e `/dev/room` para 8099.

## Desenvolvimento

`AGENTS.md`, `GAME_BRIEF.md` e `ART_DIRECTION.md` descrevem as regras de desenvolvimento, a experiência desejada e a direção visual. `LEARNINGS.md` registra decisões e descobertas históricas.

Em `/dev/`, é possível entrar como visitante ou criar/usar uma conta. A conta tem um único nome de usuário: ele identifica a pessoa e aparece como nome do personagem; pode ser alterado para outro nome disponível e permitido. Visitantes recebem um nome temporário. Contas guardam a bolsa; a visita é temporária. A posição e o local atual do personagem são salvos periodicamente em `STATE_DIRECTORY/player-locations` e atualizados ao desconectar; no PostgreSQL, ficam em `player_locations`, criada por `npm run db:migrate`. No VPS, `clareira-dev-preview-page` e `clareira-dev-preview-room` compartilham `/var/lib/clareira-dev`, criado pelo `StateDirectory` do systemd. Localmente, os dois processos usam `/tmp/clareira-dev` por padrão. O protótipo não pede e-mail e ainda não tem recuperação de senha; não reutilize senhas importantes nesta fase.

## Mundo

O mapa carrega as dimensões e os biomas salvos. Vegetação e relevo também participam da colisão e da física do servidor.

As copas têm uma brisa lenta e de baixa intensidade que varia suavemente pela posição. Ela só desloca camadas visuais no cliente; não altera física, colisão nem tráfego de rede.

## Verificação

```sh
npm test
```

`ROOT_POLICY.md` é a política operacional que deve ser preservada.
