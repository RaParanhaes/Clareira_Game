# Tempo do jogo e propriedades

Contrato obrigatório para novas funcionalidades de calendário e hospedagem. PostgreSQL é a fonte persistente; o servidor determina preço, disponibilidade, propriedade, chave e cobrança. O cliente apresenta e pede a operação, sem conceder imóvel ou moedas localmente.

## Relógio e calendário

- Usar `GAME_DAY_DURATION_MS`, em `game/day-night.mjs`, e as funções de `game/game-calendar.mjs`. Um dia do mundo dura 24 minutos reais; uma semana tem 7 dias; um mês tem 30 dias. Não criar outro relógio para cada quarto, conta ou dimensão.
- Aluguéis oferecem 1, 2, 7 ou 30 dias do jogo. O preço contratado é a diária vezes os dias escolhidos. Renovação exige opção explícita e conserva preço e duração do contrato, mesmo quando o anúncio muda.
- Encomendas diárias, atualização de preços/impostos e amostras monetárias usam o mesmo dia do jogo. `gameDayKey` é um identificador interno compatível com DATE; não é uma data civil para mostrar ao jogador. Registros de auditoria conservam seu instante real.
- Prazos persistidos são instantes absolutos do servidor, calculados a partir da duração de jogo. Continuam decorrendo com o jogador desconectado e sobrevivem a reinícios. O cliente mostra tempo restante do jogo a partir da referência de relógio enviada pelo servidor.
- Sessões, expiração de credenciais, sanções administrativas, limites de rede e prazos de requisição usam tempo real. Não acelerar medidas de segurança com o calendário do mundo. Física, animação, recuperação de rede e cooldowns curtos continuam em unidades de duração adequadas; não são calendários civis.
- Novos turnos de NPCs, contratos, produção e juros que falarem em dias/semanas/meses devem reutilizar esse calendário e incluir testes de mudança de dia. A existência desta regra não significa que esses sistemas futuros estejam implementados.

## Propriedades, quartos e móveis

Uma conta pode possuir várias propriedades e manter vários aluguéis simultâneos, inclusive no mesmo hotel. A capacidade física do estabelecimento continua limitada pelo catálogo. Saldo suficiente não pode ser bloqueado porque já existe outro imóvel ou contrato.

O servidor recebe o estabelecimento, modo e número da unidade ao entrar; a renovação identifica o contrato por `leaseId`. A chave de cena inclui modo para distinguir apartamento próprio e quarto alugado de mesmo número. Os móveis persistem pela identidade física `buildingId:mode:unitNumber`, independentemente da conta. A casa conserva seus móveis na venda; os imóveis de uma mesma pessoa não compartilham arrays ou saves de mobília. A decoração continua sujeita à autorização de dono existente; alugar uma cabana concede entrada por prazo, sem conceder sua propriedade.

A placa externa permite pedir um preço ao dono. O dono pode responder com preço ou recusar; apenas comprador e vendedor recebem a negociação. A aceitação verifica o preço revisado, saldo, propriedade atual e imposto na mesma transação que transfere o imóvel. Também há anúncio público de venda com preço escolhido pelo dono. Uma transferência invalida anúncios, propostas concorrentes e chaves antigas.

Cabanas podem ser anunciadas para aluguel com diária escolhida pelo dono. O contrato preserva a propriedade, concede acesso temporário ao inquilino e credita o pagamento líquido ao locador, com imposto separado em lançamento balanceado. Retirar ou mudar o anúncio não encerra um período já pago. Nesta versão, a transferência de uma cabana ocupada aguarda o fim do contrato; não há transferência de obrigação para um novo locador. Subdividir uma casa em quartos independentes ainda exige planta/unidades físicas próprias; não inventar capacidade sem interiores e persistência correspondentes.

Reservas usam recibo durável por conta e `requestId` para que uma repetição não cobre outra unidade. Sem saldo para renovar, apenas o contrato afetado termina; outros imóveis e quartos permanecem. Acesso é consultado novamente após carregar a casa. Negociações privadas nunca entram no conteúdo compartilhado do grupo de snapshots.

## Atualização e validação

Migrações 034–036 removem a unicidade de hospedagem por conta, separam os saves e convertem diárias antigas de 24 horas reais para o ciclo do jogo preservando a proporção paga restante. Não editar migrações já aplicadas. Antes de aplicar, guardar dump privado e testar restauração. Nenhum saldo, móvel ou título deve ser apagado para corrigir as regras.

Verificar compra com mais de mil ouros e outro imóvel, vários quartos no mesmo hotel, seleção de unidade, renovação independente, repetição de reserva, venda/proposta sem saldo ou preço alterado, isolamento dos destinatários, crédito do locador, expiração e persistência da mobília. Exercitar os componentes reais em desktop/390/320 e comandos reais do servidor em banco isolado. Preservar preparação de assets e o [padrão de desempenho](PERFORMANCE-STANDARD.md): nenhuma consulta SQL ou leitura de mobília por quadro/snapshot; listas pessoais são recarregadas em admissão/mutações e os contratos são obtidos em uma consulta por conta.
