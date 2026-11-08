# Compra, venda, aluguel e ferramentas: revisão por função

Escopo: atendimentos em `place-panel.mjs`, Ferramentas dentro do jogo e suas APIs existentes. Dados reais do preview não são usados como alvo de compras, transferências, ajustes ou sanções dos testes. A matriz de navegador usa DOM/CSS/componentes reais com estado e respostas sintéticos; as regras e a persistência são verificadas separadamente em servidor temporário e banco PostgreSQL descartável.

## Mudanças

- O servidor recusa quantidades de venda que não sejam inteiros entre 1 e 50. Antes, zero/negativos viravam uma unidade e valores maiores viravam 50, silenciosamente. Recusas preservam carteira e materiais.
- Revogar chave, retirar anúncio e ativar/desativar renovação passam por revisão explícita. A renovação informa período/preço e a desativação preserva a validade da diária atual.
- Campos de impostos têm largura útil no celular, teclado numérico/decimal, preservação após atualização e validação mínimo ≤ base ≤ máximo. Campos ficam bloqueados durante envio; perda da autoridade limpa o formulário.
- Editar a medida, mudar de conta por consulta ou perder permissão invalida a revisão administrativa. Os controles ficam bloqueados durante envio. Fechar/reabrir não duplica a operação nem deixa indicação falsa de envio pendente depois da resposta.
- Consultas e medidas de moderação têm prazo de 15 segundos por pedido, sem polling nem repetição automática de mutações. Resultado incerto orienta consultar o histórico antes de tentar novamente.
- Histórico distingue ativa, expirada, revogada e advertência registrada. Denúncias têm estados em português. A revisão de expulsão informa o bloqueio de retorno de 30 segundos já exigido pelo servidor.

## Matriz executável

`scripts/browser-commerce-functions-check.mjs` executa 22 grupos em 1440×900, 390×844 e 320×640, com captura e detecção de erros JS. Cada linha abaixo distingue a interface da verificação de regras/persistência.

| Função | Interface e recusas | Regras/persistência |
| --- | --- | --- |
| Vender materiais | Quantidade, total, revisão, estoque/cotação alterados, 0/negativo/fracionário/>50 e fila pendente | `scripts/place-service-actions.test.mjs`: venda real, saldo/estoque preservados nas recusas, lugar e balcão incorretos |
| Comprar machado e picareta | Duas compras, já possui, saldo insuficiente | Mesmo teste: ambas as ferramentas, valor debitado, repetição recusada e reconexão |
| Comprar cabana | Revisão, ocupada, visitante e saldo | `scripts/cabin-keys.test.mjs`, `database/postgres.integration.test.mjs`: proprietário e chave persistidos |
| Anunciar propriedade | Preço inválido, preservação e revisão | `database/economy.integration.test.mjs`: preço inválido e não proprietário recusados |
| Retirar anúncio | Revisão antes do envio | Mesmo teste: somente vendedor retira; anúncio some e compra posterior é recusada |
| Comprar anúncio | Mudança de preço invalida revisão | Mesmo teste: transferência, impostos, carteira, propriedade e revogação das chaves anteriores; compra de si mesmo recusada |
| Alugar quarto | Preço, período, renovação explícita e revisão | Mesmo teste: cobrança, renovação, término e falta de saldo liberando unidade |
| Entrar com chave/unidade | Entrada sem nova compra | `scripts/prototype-server.test.mjs` e testes de cabana: entrada, autorização e volta |
| Ativar/desativar renovação | Duas revisões com efeitos descritos | `database/economy.integration.test.mjs`: alteração, cobrança/término e persistência |
| Conceder chave | Conta inválida e envio nominal | `database/postgres.integration.test.mjs`, `scripts/cabin-keys.test.mjs`: somente dono, acesso e revogação |
| Revogar chave | Revisão com destinatário | Mesmos testes: chave revogada e acesso retirado |
| Entregar encomenda | Material insuficiente, visitante, concluída e entrega válida | `scripts/place-service-actions.test.mjs`: recompensa/material, repetição no dia recusada e reconexão |
| Salvar impostos | Limites cruzados, preservação, bloqueio de envio e perda de autoridade | `database/economy.integration.test.mjs`: líder autorizado, estranho recusado, versão e alíquota |
| Consultar jogador | Histórico, estados corretos, alvo e revisão invalidados ao mudar conta | `database/staff-migration.integration.test.mjs`: consulta HTTP e sanções persistidas |
| Consultar denúncias | Conteúdo como texto, limite e estado traduzido | Mesmo teste: fila e escopo por cargo/responsável |
| Advertir, silenciar, expulsar, suspender e banir | Cada medida, prazo aplicável, revisão/motivo, edição, bloqueio durante envio e recusa 403 | Mesmo teste: cinco POSTs reais, histórico persistido, prazos e revogação de cada medida; expulsão bloqueia retorno por 30 s |
| Carteira: adicionar e retirar | `browser-staff-tools-ui-check.mjs`: duas operações, motivo, revisão e um envio por confirmação | Mesmo teste de migração: permissão, carteira, auditoria e limites monetários |
| Histórico da equipe | Mesmo navegador: paginação, atualização, recusa, foco e retorno ao mundo | Mesmo teste de migração: eventos e responsáveis na auditoria |
| Tempo limite / fechar durante envio | Matriz simula atraso, abort e reabertura; nunca repete POST automaticamente | Servidor continua responsável pela autorização e persistência; resultado incerto exige consulta, não supõe rollback |

Os testes de navegador também verificam ajuste à largura, ausência de rolagem horizontal, Voltar/Fechar e limpeza ao sair do contexto. As ferramentas integradas têm checagens adicionais em paisagem e foco de teclado.

## Evidências desta rodada

- `logs/20261029-commerce-functions/ui/result.json`: matriz dos componentes, 22 grupos por viewport.
- `logs/20261029-commerce-functions/service-matrix.txt`: ferramentas, encomendas, reconexão e validação da venda no servidor temporário.
- `logs/20261029-commerce-functions/backend-tests.txt`: primeira rodada PostgreSQL/Redis isolada.
- `logs/20261029-commerce-functions/full-tests.txt`: tentativa da suíte completa com PostgreSQL/Redis habilitados, encerrada por SIGTERM/código 143 após 624 resultados gerais, sem teste reprovado e sem sumário final. A migração de staff havia passado em banco isolado; o único caso ignorado na rodada geral é essa mesma migração, que exige execução isolada.
- `logs/20261029-commerce-functions/remaining-tests.txt`: sete testes de tutorial/conexão, incluindo o trecho não concluído pela rodada longa; todos passaram.
- `logs/20261029-commerce-functions/python-tests.txt`: 32 testes Python aprovados.
- `logs/20261029-commerce-functions/staff-live/result.json`: Ferramentas no jogo, desktop e toque; crédito e débito, moderação, auditoria, paginação, permissões, foco e movimento aprovados com respostas administrativas simuladas. Nenhuma carteira ou sanção real foi alterada.
- `logs/20261029-commerce-functions/live-verification.json`: health público e local, mais hashes públicos dos componentes/CSS conferidos após reinício dos dois serviços de preview.
- Capturas em `logs/20261029-commerce-functions/ui/`; a aprovação visual exige abrir os arquivos, não apenas verificar sua existência.

Esta revisão não certifica FPS em aparelhos reais, todos os sistemas do jogo ou funções administrativas que não aparecem no menu em jogo. Cargos, revogação manual e gestão completa de denúncias continuam no painel administrativo existente.
