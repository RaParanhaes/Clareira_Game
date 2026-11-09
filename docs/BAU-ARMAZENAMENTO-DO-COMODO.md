# Baú com armazenamento próprio por cômodo: plano

Status: proposta, aguardando decisão sobre onde o baú fica (ver "Decisão pendente").
Categorias: `feat/db-*` (migração e loja), `feat/server-*` (ações e validação), `feat/ui-*` (painel), `feat/world-*` (baú interativo no móvel).

## Modelo de dados (PostgreSQL, fonte persistente)

Migração `037_room_chests.sql` (próxima numeração após `036`):

- `room_chests(id text primary key, room_key text not null, furniture_id text not null, owner_account_id text, created_at timestamptz, updated_at timestamptz, unique(room_key, furniture_id))`
- `room_chest_slots(chest_id text references room_chests(id), slot int, item_id text, quantity int check (quantity > 0), primary key(chest_id, slot))`

Cada transferência grava uma linha em `item_transactions` (ledger já existente), no mesmo commit.

## Regras

- Capacidade inicial: 12 espaços. Empilhamento segue o catálogo do item.
- Transferência é uma única transação: retira do inventário do jogador e põe no baú, ou o inverso. Se qualquer parte falhar, nada muda.
- Idempotência: cada ação carrega um identificador; repetir a mesma ação não duplica item.
- Acesso: só o dono do cômodo abre o baú. Staff com permissão de moderação pode abrir para suporte, registrado.
- Distância: o servidor exige o jogador a até 1,5 tile do móvel e dentro do cômodo.
- Fallback sem PostgreSQL: loja JSON com a mesma interface, como as outras lojas do projeto.

## Protocolo (servidor)

- `chestOpen {chestId}`: devolve slots e capacidade, se autorizado.
- `chestMove {chestId, from, to, quantity, actionId}`: move entre inventário e baú.
- Erros explícitos: sem permissão, longe demais, inventário cheio, baú cheio, item inexistente.

## Cliente

- Painel "Baú" com duas colunas (inventário e baú), mesma linguagem de `INVENTORY-UX.md`.
- Abre com E perto do móvel. Mobile: toque no baú.

## Testes

- Loja: integração com PostgreSQL (padrão de `postgres.integration.test.mjs`) e loja JSON.
- Servidor: permissão, distância, atomicidade, idempotência.
- Cliente: painel e acessibilidade por teclado.
- Captura desktop e celular com baú aberto.

## Decisão pendente

Onde ficam os baús?

1. **Só nos cômodos que o jogador aluga ou possui** (cabanas, quartos de hospedagem): simples e sem conflito de acesso. O baú do lobby público não existiria.
2. **Também no lobby público**: exige regra de acesso compartilhado e moderação, muito mais trabalho.

Recomendação: opção 1 primeiro.

## Ordem de execução (se aprovada a opção 1)

1. Migração 037 e loja PostgreSQL + JSON, com testes (`feat/db-room-chests`).
2. Ações do servidor com validação e ledger (`feat/server-room-chests`).
3. Painel de baú no cliente (`feat/ui-room-chests`).
4. Baú interativo nos cômodos de hospedagem (`feat/world-room-chests`).
5. Validação completa, captura e relatório. Commits só com autorização.
