# Clareira — proposta de economia dinâmica

**Tipo:** desenho e simulação; não é uma implementação conectada ao jogo nem ao banco.
**Base observada:** checkout `/opt/game-agent`, branch `master`, estado consultado em 24/10/2026.

## Resumo do que existe

- Ciclo jogável de coleta e produção: madeira bruta, ripas, carvão vegetal, minério, lingotes, ferramentas, receitas, veios finitos e regeneração ambiental.
- Recepção com venda por tabela fixa e compra de machado/picareta; encomendas diárias persistidas recompensam gravetos, ripas, carvão e lingotes.
- Carteira apresentada em bronze/prata/ouro (100 bronzes = 1 prata; 100 pratas = 1 ouro). Internamente os cálculos já convertem para bronzes, mas limites por denominação deixam a representação com teto e devem ser revistos antes de uma economia de longo prazo.
- PostgreSQL é a fonte persistente: `inventory_items`, carteira associada ao armazenamento de conta, `resource_contract_completions`, `lodging_claims`, quartos/objetos e `interaction_events`. Redis é coordenação/cache, não verdade persistente. O modo JSON de conta permanece caminho de compatibilidade/fixture; novas funcionalidades persistentes devem usar PostgreSQL.
- Há hospedagem com unidade alugada ou reivindicada como própria e quartos privados. Ainda não há mercado geral de lojas, edifícios ou casas transferíveis; não assumir que quartos decoráveis já são imóveis comerciais.
- `docs/RESOURCE-ECONOMY-PLAN.md` documenta valores de referência e reconhece que preços e ritmo de reposição são provisórios.

## Regras de desenho

1. **Unidade de conta única:** todos os preços, saldos, tributos e lançamentos usam inteiro de bronze (subunidade mínima). Prata e ouro são só agrupamento visual/conveniência; lingotes são mercadorias e não lastro nem moeda automaticamente.
2. **Preço-base + sinais observáveis:** para mercadoria `i`, calcular a cada período uma cotação de referência com preço-base, pressão de compra/venda e estoque disponível no mercado/NPC. Um ponto de partida simples é `sinal = 0,55 × demanda_relativa + 0,45 × estoque_alvo/estoque_atual`, limitado a `[0,5; 2,0]`; atualizar suavemente `preço_novo = preço_anterior × (0,70 + 0,30 × sinal)`, e limitar a `[55%; 180%]` do preço-base por período de calibração. Não usar todo inventário privado como “oferta”: só o estoque do balcão/loja entra nesse sinal. A venda ao NPC transfere a quantidade para `economy_market_stock` dentro da liquidação; inventário privado não listado não altera cotação.
3. **Demanda sem manipulação fácil:** medir compras liquidadas (e vendas de jogadores quando houver mercado entre jogadores), não consultas nem carrinhos. Ponderar janela móvel, limitar impacto por conta, grupo de contas, item e período; compras canceladas/reembolsadas não contam. Estoque não listado não representa oferta imediata. Uma regra de “preço de venda” e “preço de compra” distinta evita arbitragem simples do balcão.
4. **Receita produtiva protege o encadeamento:** preço sugerido de produto processado tem piso de custo dos insumos consumidos + taxa de operação configurada + margem mínima pequena. É referência para NPC; jogador continua livre para vender em mercado próprio. O piso não deve obrigar sistema a comprar item sem compradores.
5. **Teto e amortecimento:** atualizar em lote (por exemplo, diário de jogo), nunca por transação; limite de variação por período; limites absolutos de bronze; preço mínimo 1 bronze. Começar em modo sombra e mostrar cotações sem cobrar alteração durante calibração.
6. **Tesouro e oferta inicial explícitos:** cada NPC/balcão tem caixa e inventário definidos. Se um NPC compra, paga com caixa finito e usa cotação de compra inferior; se vende, tem estoque/reposição declarados. Não criar moeda ou mercadoria invisível para sustentar um preço global.

O exemplo de ouro se divide em duas coisas: **lingote de ouro** é mercadoria cujo preço pode cair com excedente real negociável; **moedas de ouro** representam 10.000 bronzes por unidade de exibição e não ficam mais valiosas só por serem raras na bolsa do jogador. A camada macro mede **circulação líquida**: saldo spendável nas carteiras e, futuramente, depósitos à vista; não soma tesouros de governos nem reservas bancárias. Esses saldos ficam registrados separadamente como **orçamento/reserva**, e empréstimos pendentes são **dívida**, não moeda. Quando um empréstimo é liberado e creditado à carteira, o valor passa a contar na circulação; pagar principal remove esse crédito circulante, enquanto juros pagos entram na reserva bancária. Uma política por região compara circulação atual com referência e altera lentamente uma cesta de preços; procura, estoque, custo dos insumos, piso produtivo e limites continuam ativos. O histórico diário guarda circulação, tesouro, reserva bancária e crédito pendente em colunas distintas.

Orçamento inicial é configurável por mundo e tipo de governo (vila, reino, realm ou castelo), em bronzes. Os exemplos de 20 mil moedas de ouro para uma vila e 1 milhão para um castelo servem apenas para testar escala; não viram valores padrão. Uma verba inicial é emissão registrada e entra no total monetário do mundo, mas só afeta preços quando sai do tesouro e passa a circular. Cada banco guarda reserva própria e política versionada de juros-base, piso/teto, meta de liquidez, sensibilidade, capacidade de crédito e amortecimento diário. A cotação muda para novos contratos; uma taxa aceita não é reajustada retroativamente sem renegociação explícita.

## Indicadores, salário mínimo e comércio entre governos

- **PIB (valor adicionado):** calcular por produção local registrada: valor de saída menos insumos intermediários. Salário é componente do valor adicionado, não um custo a subtrair de novo; revenda e importação de produto pronto não contam como nova produção local. Ouro guardado, imposto, empréstimo e transferência entre jogadores não são PIB.
- **Comércio:** cada remessa liga governos exportador e importador, produto, quantidade, preço, tarifas versionadas dos dois lados, frete, estado de entrega e liquidação no diário. Exportação e importação são fluxos; o saldo comercial é exportações menos importações e não representa moeda criada. Uma remessa só conta como comércio concluído quando entregue e liquidada.
- **Salário mínimo:** política versionada por governo e expressa em bronzes por turno de trabalho concluído, não por horas conectado. O pagamento registra turnos, piso aplicado, valor bruto, imposto, líquido e transação financeira. O jogo ainda não tem contratação, jornada ou folha salarial, então a migração registra o modelo sem inventar pagamentos automáticos.
- **Painel mensal:** guarda PIB, salários, exportações/importações, saldo comercial, impostos, despesa pública, tesouro, reserva bancária, crédito e juros. A circulação segue separada e é global enquanto não houver uma regra confiável para atribuir carteiras portáteis a uma vila; a coluna local fica sem valor até essa atribuição existir, em vez de dividir moedas arbitrariamente.
- **Escopo da migração 024:** cria políticas e fatos auditáveis para esses indicadores; não cria contratos de trabalho, produção ou transporte por si só. Tarifas e pisos começam sem configuração padrão, e dependem de serviço autorizado antes de valer no mundo.

## Materiais e cadeia de insumos

Use o catálogo estável de IDs já existente; não renomeie `wood` (gravetos) nem `timber` (madeira bruta). Uma receita normalizada referencia itens e quantidades versionadas. Para cotação de ripa: 20 madeira bruta → 5 ripas; para carvão vegetal: 20 madeira → 6 carvões; para lingote: 1 minério + 2 carvões vegetais (ou 1 carvão mineral). Cotação da saída considera custo ponderado dos insumos realmente consumidos, perdas, tempo de produção somente se houver mercado/NPC que remunere esse serviço. Quantidades do bosque, minas e retornos devem ser observadas por região/dimensão; um preço único global pode esconder escassez local.

### Exemplos de preço, com valores ilustrativos

| Situação | Consequência esperada |
|---|---|
| Ripa vende acima do normal e o estoque da recepção cai abaixo do alvo | Cotação de venda sobe gradualmente, até o teto. Mais madeira disponível reduz o sinal nas próximas atualizações. |
| Falta minério de cobre ou carvão | Insumos sobem; o piso econômico do lingote sobe mesmo antes da demanda final. |
| Jogadores produzem lingotes além das compras | Estoque negociável acima do alvo reduz cotação de compra; o lingote pode cair até o piso. |
| Lingotes acumulam sem serem negociados | Não tratar minério ou lingote como moeda. O preço do material só responde quando a quantidade entra no estoque negociável do mercado. |

## Impostos, estabelecimentos e imóveis

Separar quatro recursos que não devem ser confundidos:

- **Imposto por governo e mundo:** cada governo tem políticas versionadas por imposto. A alíquota do comércio pode ser revisada pelo governo dentro de um piso/teto e também se ajusta lentamente ao saldo do tesouro local. A primeira regra de demonstração usa base de 2%, piso 0%, teto 5%, alvo de 300.000 bronzes e sensibilidade de 1 ponto percentual; diariamente o cálculo move apenas 20% em direção à taxa desejada. A regra aprovada e a cotação efetiva ficam registradas, então uma mudança de governo não reescreve o histórico.
- **Tesouro da vila:** o imposto recolhido vai ao fundo geral da vila da região, não desaparece. O saldo afeta as cotações futuras de imposto. A vila pode alocar fundos a doações, compra de materiais, construções e diplomacia por projetos aprovados e com orçamento reservado; cada despesa precisa gerar contrapartida no diário financeiro.
- **Expansão territorial:** uma vila tem unidades de terreno atuais e limite explícito. Ao atingir o limite, envia ao governo pai (rei/reino) uma solicitação com quantidade e preço de expansão. A aprovação e o pagamento entram no diário; o valor é creditado ao tesouro do reino e só então o limite da vila aumenta. Uma vila sem governo pai ainda não pode comprar território de um rei.
- **Taxa de transação:** mercado entre jogadores e compra/venda de imóvel terão taxas próprias, cada qual ligada ao governo/tesouro que presta aquele serviço. Não taxar cada troca de inventário sem motivo.
- **Imposto periódico de propriedade:** valor previsível, aviso e prazo de carência antes de qualquer consequência. Em pré-alpha, primeiro testar como simulação/notificação; nunca confiscar um imóvel ou item sem regra visível e recuperação clara.
- **Aluguel:** hospedagens existentes agora podem se tornar leases por período, com renovação automática desligada por padrão e opção explícita do jogador. Cada cobrança tem histórico, débito, receita da hospedagem e imposto do governo no mesmo commit; sem saldo, o contrato termina e libera a unidade, sem saldo negativo. Esse primeiro contrato representa diárias de hotéis NPC. Aluguel entre jogadores, caução, despejo/disputa e locação de casas ou estabelecimentos ainda são expansão.
- **Compra/venda:** o primeiro recorte agora permite anunciar e transferir as cabanas próprias existentes. Preço, vendedor e governo responsável ficam no anúncio; comprador, vendedor líquido, imposto, titularidade, diário financeiro e registro histórico liquidam juntos. As chaves antigas são revogadas na transferência. O banco rejeita saldo insuficiente, anúncio alheio, dono divergente, auto-compra e compra enquanto outra hospedagem estiver ativa. Ainda falta decidir e implementar a transferência dos móveis e ampliar o catálogo para estabelecimentos.

Estabelecimentos são uma expansão posterior: primeiro mercados limitados a barracas/lojas em locais declarados; depois licenças, estoque, horários, funcionários e aluguel de espaço. Proprietário define preço; servidor valida cotação, estoque, saldo e taxa, sem confiar no cliente. Um imóvel não deve virar automaticamente uma loja, e um aluguel de quarto não deve conceder direitos de venda.

## Persistência PostgreSQL proposta

Não criar JSON de progresso para os novos domínios. Fazer migrações aditivas posteriores a `015`, com serviço de domínio transacional e adaptadores só após contratos definidos:

| Tabela proposta | Conteúdo / restrições |
|---|---|
| `wallets` e `wallet_ledger` | Um saldo `bigint` em bronze por perfil/conta; livro imutável de débito/crédito com tipo, referência única de idempotência, ator, contraparte e instante. Atualização de saldo e lançamentos na mesma transação. Migração gradual do objeto `wallet` atual; não dividir em três colunas limitadas. |
| `market_goods` | IDs de catálogo, preço-base, limites, grupo/região, política e versão. FK lógica para item/receita versionada. |
| `market_quotes` | Série temporal agregada por bem/região/período: preço compra/venda, estoque elegível, unidades compradas/vendidas, versão da regra. Não guardar carteira privada ou histórico pessoal para formar cotação. |
| `market_stock` | NPC/balcão/loja, bem, quantidade, reservado, limite e atualização. Restrições `quantity >= 0`, `reserved <= quantity`. |
| `market_orders` | Loja, perfil, bem, lado, quantidade restante, preço unitário, expiração, estado/versão; ordem de jogador é expansão e deve ser idempotente. |
| `market_trades` | Execução liquidada e linhas de itens/bronze/taxas, evento único. Saldo e inventários alterados com locks ordenados e validação dentro de uma transação serializável/retry limitado. |
| `economy_tax_rules`, `government_tax_policies`, `government_tax_quotes`, `government_tax_remainders` | Regras e versões por governo/mundo, cotação diária derivada do saldo e frações sub-bronze acumuladas por categoria, para cobranças pequenas não virarem isenção por arredondamento. |
| `world_governments`, `government_fund_accounts` | Governo por mundo/assentamento e saldos por finalidade (geral, doações, materiais, construção, território, diplomacia). |
| `government_projects` | Pedidos e despesas aprovadas com categoria, alvo, orçamento, gasto e estado. O código ainda precisa executar reserva, compra e prestação de contas. |
| `government_territory_state`, `territory_expansion_requests` | Limite de terreno da vila, relação com governo pai, preço pedido, aprovação, pagamento e aumento de limite. |
| `tax_assessments` | Impostos periódicos sobre propriedade/estabelecimentos com vencimento, carência, pagamento e disputa; ainda é expansão. |
| `property_market_listings`, `property_transfer_records` | O primeiro mercado cobre cabanas já existentes. Anúncio guarda unidade, vendedor, governo e preço; transferência histórica referencia o diário financeiro e registra comprador, imposto e valor. A tabela continua genérica por prédio/unidade para expansão futura a casas e estabelecimentos.
| `lodging_leases`, `lodging_lease_charges` | Leases por período das hospedagens atuais, renovação opcional, próxima cobrança, tentativa paga/falha/fim e ligação única ao diário. Arrendamento entre jogadores e estabelecimentos exigirá entidade de imóvel e locador próprias.

Usar `numeric` ou inteiro `bigint` em menor unidade; sem `float` para moeda. Índices em dono/estado, próxima cobrança, período/região e referências de idempotência. A carteira atual em `scripts/account-store.mjs` e os métodos de crédito/débito precisam migrar para serviço comum; cada compra/venda atual deve continuar atômica com inventário. `interaction_events` é auditoria de interação, não substitui livro razão financeiro: seu contrato é append-only, mas payload JSON não fornece invariantes de saldo.

## Etapas de implantação

1. **Inventário e observabilidade:** exportar IDs/preços/fluxos atuais; instrumentar fontes de moeda (vendas, contratos), sumidouros (ferramentas, compras), conversões e estoque elegível; coletar dados agregados, sem mexer em preços.
2. **Contabilidade de moeda:** saldo em bronze sem teto visual, livro imutável/idempotente, atomicidade em venda/compra/contrato/aluguel. Migração compatível, comparar saldos antigos/novos em dry-run e manter rollback documentado.
3. **Cotação sombra:** calcular preços diários em tabela de quotes, mostrar diferenças aos operadores; simular com eventos reais, limites e cenários extremos. Sem cobrança dinâmica ainda.
4. **NPC dinâmico limitado:** poucos itens e uma região, teto de oscilação, caixa/estoque finitos, indicação clara ao jogador. Feature flag por bem e possibilidade de retornar a preço fixo.
5. **Lojas de jogadores e tributos:** ordem, liquidação, taxas, recibos, prevenção de auto-negociação e auditoria; só depois de provar concorrência/idempotência e rollback.
6. **Aluguel e imóveis:** leases de hospedagem NPC e revenda de cabanas estão implementados em staging/testes. Estender a locação a casas e estabelecimentos com locador real e resolver móveis incluídos na transferência. Não ativar imposto punitivo antes de UI de saldo, aviso, regras, prazos e suporte a disputa.

## Simulações incluídas

Execute `node scripts/economy-simulation.mjs` (sem banco e sem efeitos no jogo). O script roda cenários de demanda, escassez de insumos, excedente de lingotes, tesouro, divisão do preço de uma cabana, arredondamento acumulado do imposto de aluguel, oferta monetária, orçamento separado da circulação, cotação de juros, capacidade de crédito, valor adicionado/PIB, salário mínimo por turno e saldo de importação/exportação, além de orçamento de expansão. O lingote de cobre parte de 60 bronzes; demanda 2× chega a 91 no oitavo dia; falta de minério/carvão chega a 86; estoque 4× o alvo reduz a cotação a 48. Para o imposto, com política ilustrativa de 2% e alvo de 300.000 bronzes, um tesouro zerado ajusta a próxima diária para 2,20%; meio-alvo para 2,10%; no alvo mantém 2%; acima do alvo reduz a taxa aos poucos. Na venda hipotética de 10.000 bronzes, 2,20% retém 220 para o tesouro e entrega 9.780 ao vendedor. Trinta diárias de 24 bronzes retêm 15 bronzes a 2,20%, carregando a fração restante para as cobranças seguintes. Na amostra macro, oferta monetária 2× a referência produz fator-alvo 1,189, mas o primeiro dia move o fator efetivo apenas para 1,038; oferta 10× continua limitada a 1,10 no primeiro dia. O cenário de 30 dias arrecada 42.618 bronzes; reservando 35% para território, ainda faltam 84 bronzes para a expansão didática de 15.000, demonstrando por que a vila deve poupar ou aguardar aprovação. A simulação de orçamento é uma projeção didática e não executa os serviços de fundos/projetos no banco. São demonstrações dos algoritmos, não preços recomendados nem previsão de economia real. Calibrar com telemetria e regras públicas antes de ativar.

## Decisões pendentes antes de implementação

- Quais locais são balcões NPC e se compram/vendem com estoque/caixa finitos?
- A dinâmica vale globalmente ou por região/dimensão? Quais mercadorias entram na primeira lista?
- Existe negociação direta entre jogadores agora ou só venda para NPC? A recomendação é limitar o primeiro lançamento a NPC.
- Qual imposto tem objetivo de sink e qual serviço ele financia? Definir alíquotas e prazos com dados; não fixar número neste plano.
- Como converter saldos existentes cujo formato aceita apenas 0–999 por denominação sem perder bronze nem invalidar saves?
- Quem pode possuir imóvel/estabelecimento, e quais objetos/chaves acompanham a transferência?

## Estado atual do trabalho

### Integração com profissões e atores NPC

O plano de atores, profissões e rotas está em `docs/NPC-SETTLEMENT-ECONOMY-PLAN.md`. Ele é uma extensão de gameplay sobre esta economia: catálogo, moeda, cotação, estoque negociável, diário e contas públicas continuam canônicos aqui. O MVP conecta o lenhador ao estoque `arrival:market` e acrescenta a compra de mercadorias pelo jogador, que ainda precisa ser confirmada/implementada; não abre cotação dinâmica nem cria carteira ou diário paralelo.

NPC-001 deve verificar as migrações e serviços realmente ativos antes de implementação. Em especial, a migração 024 modela eventos de produção e comércio entre governos, mas não prova que exista liquidação operacional para produção NPC ou remessa local. Actors NPC devem ter identidade própria, não perfis falsos de jogador. Encomendas da guilda também são distintas dos contratos diários atuais, que pagam ao jogador pela entrega de materiais.

A implementação atual inclui `game/economy.mjs`, `database/economy-store.mjs`, migrações 016–024 e `scripts/economy-simulation.mjs`. Além do mercado, já modela governo por mundo/assentamento, política fiscal versionada ligada ao tesouro, diários balanceados, fundos por finalidade, projetos, pedidos de expansão ao governo pai, transferência de cabanas, leases recorrentes das hospedagens NPC, um fator macro gradual baseado na circulação de carteiras (separada dos tesouros e reservas), estoque efetivamente disponível no balcão NPC e esquema para bancos, crédito, juros versionados, valor adicionado, salário mínimo, comércio intergovernamental e indicadores mensais.

**Ainda não foi ativada:** as migrações 016–024 não foram aplicadas no banco do preview, o serviço não foi reiniciado e a simulação ao vivo não usa as cotações novas. A migração 020 e os fluxos de cobrança/renovação precisam passar novamente pela base descartável; nada nesta etapa foi aplicado ao preview. A interface ainda precisa de uma sessão visual do jogo.

O débito dos itens agora entra na mesma transação que o crédito da carteira e o registro da venda. A migração 017 adiciona imposto de 2% sobre venda NPC, regras versionadas e diário balanceado; o recibo discrimina o valor retido. Ainda falta validar o caminho por uma sessão real no navegador e com concorrência/repetição de mensagens. A cotação é recalculada no máximo uma vez a cada 24 horas, com uma verificação horária do servidor.

O imposto sobre venda NPC, transferência de cabana e renda de aluguel usa cotações do governo `surface:arrival`; a liderança/admin já pode consultar e editar políticas pela tela de atendimento, com versão e autorização no banco. A migração 023 separa circulação, tesouro e reserva bancária, configura orçamento inicial por mundo/tipo de governo e cria esquema para cotação de juros e empréstimos. A 024 registra valor adicionado, pisos salariais por turno, tarifas bilaterais de importação/exportação e painéis mensais; ainda faltam operações para desembolsar/pagar empréstimos, financiar reservas iniciais, executar projetos e movimentações entre fundos, além de aprovação/pagamento de expansão territorial. Impostos periódicos de propriedade, caixa/estoque NPC finito, mercado entre jogadores, lojas e aluguel de casas/estabelecimentos por jogadores seguem pendentes. O mercado imobiliário cobre só as cabanas existentes; transferência de móveis precisa de regra e suporte. O preview não foi migrado nem reiniciado; as alterações anteriores do checkout foram preservadas.

### Tesouros de múltiplos governos — etapa transacional em desenvolvimento (08/11/2026)

- O banco já define governos por mundo e assentamento, com tipos `village`, `kingdom`, `realm` e `castle`. O acesso ao painel é específico por governo: líder, administrador ou cargo econômico delegado. Isso **não cria automaticamente novos governos, governantes ou regiões de mercado**.
- O menu `Gestão econômica` na recepção da vila permite a usuários autorizados alternar entre seus tesouros já cadastrados. A seleção é conferida novamente pelo servidor; indicadores do mercado da Vila da Chegada não são atribuídos a outras vilas/reinos.
- `government_fund_accounts` continua sendo a fonte dos seis fundos. Transferências **dentro do mesmo governo**, com chave de idempotência, debitação e creditação atômicas e duas linhas do diário, mantêm o saldo total constante. A operação só utiliza `balance_bronze - reserved_bronze`; não emite moeda, não aumenta PIB e não representa despesa pública.
- `government_projects` registra propostas em `proposed`. Ministro, Tesoureiro e Líder podem propor; apenas Líder/Administrador podem mover para `funded` e reservar orçamento do fundo correspondente. Cancelar uma reserva libera o saldo não gasto; toda transição gera `government_project_events`. **Nenhuma aprovação financia automaticamente uma pessoa, guilda ou NPC**: compra pública, entrega comprovada, liquidação e prestação de contas são o marco posterior do NPC-006.
- `government_fund_transfers` e `government_project_events` são criadas pela migração 038, sem modificar migrações existentes. O orçamento inicial continua condicionado a modelo configurado e emissão registrada em `government_initial_budget_issuances`; valores ilustrativos nunca são emitidos automaticamente.
- `government_territory_state` e `territory_expansion_requests` permanecem contratos de dados. Não aumentar fronteiras nem transferir dinheiro ao reino pai sem serviço próprio que comprove aprovação, pagamento e limites.
- Testes em `database/government-treasury.integration.test.mjs` cobrem tesouros independentes, fundos reservados, idempotência, auditoria, insuficiência de saldo e tentativas de operar outro governo. A interface também é testada em Chromium com contas e saldos fictícios.
