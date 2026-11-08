# Pontos de atendimento e painéis

Este padrão distingue interiores públicos de residências privadas. Nos locais públicos, entrar pela porta revela o interior; aproximar-se de um ponto apresenta a ação contextual; E ou o botão de toque abre o atendimento. Caminhar até um ponto nunca abre uma janela automaticamente. Residências privadas exigem chave na porta e não recebem uma recepção pública.

## Lugares e responsabilidades

| Local | Ponto | Serviços disponíveis |
| --- | --- | --- |
| Recepção da Vila | Informações, lado esquerdo do balcão | Diretório das hospedagens; reservas feitas no prédio escolhido |
| Recepção da Vila | Trocas da vila, lado direito do balcão | Venda de materiais, encomendas e ferramentas |
| Hospedaria do Riacho e Pousada dos Pinheiros | Recepção | Diárias e acesso ao quarto reservado |
| Hotel das Brasas | Recepção | Diárias, apartamentos e acesso à unidade |
| Cabanas do Cedro, da Samambaia e do Mirante | Placa externa | Consulta, compra com entrega da chave e, para o dono, gestão de chaves |

Não há serraria ou ferraria implementada. Quando existirem, devem declarar os próprios serviços e itens aceitos. Hospedagens não herdam comércio de materiais, ferramentas ou encomendas. O balcão de trocas da vila mantém os sistemas econômicos já existentes fora das hospedagens.

## Cabanas privadas e chaves

Cabanas não têm recepção. Sem chave, a interação na porta informa que ela está trancada e mantém o jogador do lado de fora. A placa externa é o ponto para consultar/comprar a propriedade. A compra entrega uma chave nominal permanente à conta do proprietário e mantém o personagem fora; a entrada seguinte usa a chave. A saída leva diretamente ao bosque e a porta permanece protegida.

O dono pode conceder até vinte chaves nominais a outras contas pelo nome de usuário e revogá-las pela mesma placa. Amizade, parentesco ou proximidade do dono não concedem acesso automaticamente. O comando genérico de visitar pessoas não permite entrar em cabanas: a visita usa a porta e uma chave válida. Uma chave compartilhada não transfere propriedade nem permite editar os móveis.

Chaves são permissões persistentes de conta, não pilhas de materiais negociáveis na mochila. A autorização é consultada no armazenamento ao abrir a porta e restaurar uma visita. Revogar retira o acesso e coloca do lado de fora os visitantes conectados naquela cabana. Sessões antigas salvas em `lobby:cabin-*` voltam para fora; não existe migração que transforme a antiga recepção em acesso autorizado.

`game/cabin-access.mjs` define os IDs de cabanas e a representação da chave. Os adaptadores JSON e PostgreSQL guardam os direitos concedidos; a migração PostgreSQL é `011_cabin_keys.sql`. A chave do proprietário deriva da compra, e apenas ele pode conceder/revogar chaves. Dados de chaves, destinatários e propriedade são personalizados por destinatário no snapshot, preservando o compartilhamento da geometria do mundo.

## Fonte das regras

- `game/place-services.mjs`: políticas por ID de prédio existente, pontos de ativação, seções permitidas e ações aceitas. Não duplica catálogo, inventário ou saves.
- `game/world.mjs`: plantas, balcões, portas, obstáculos e física. A posição do atendimento acompanha a planta real.
- `game/panel-controller.mjs`: ciclo de vida e navegação comuns de atendimento, mochila e aparência.
- `game/place-panel.mjs`: apresentação e ações do atendimento. Dados e resultados vêm do estado autoritativo; textos usam `textContent`.
- `scripts/prototype-server.mjs`: refaz a consulta de alcance e de serviço antes de qualquer ação que altere moedas, materiais, propriedade ou cenário.

Uma definição de ponto contém `id`, `label`, `prompt`, `sections`, `anchor` e `radius`. O identificador da instância é composto pelo ID do lugar e pelo ID do ponto. Não mudar IDs persistidos de prédios para alterar o nome de um painel.

O tipo `counter-front` ancora o ponto à frente do balcão da planta, por fração da largura e distância do móvel. Exige aproximação pela frente. O tipo `floor` permite uma posição relativa ao piso (`u` e `v`, estritamente entre 0 e 1), para futuros murais ou terminais; ele não cria o objeto físico nem seu desenho. O tipo `building-sign` ancora as placas externas das cabanas no mundo da superfície. Todo ponto precisa de piso livre, caminho alcançável e um objeto/sinal visível correspondente.

A mesma função resolve proximidade no cliente e no servidor. Obstáculos e móveis são consultados pelo caminho de interação existente. Um lugar desconhecido ou um quarto privado não recebe os serviços de outro lugar como alternativa. O raio não deve alcançar o ponto de chegada da porta nem se sobrepor desnecessariamente a outro atendimento.

## Navegação e entrada

1. Abrir mostra os serviços do ponto atual, com foco em um botão útil.
2. Selecionar um serviço abre uma página interna. Cabeçalho, caminho, Voltar e Fechar ficam visíveis; somente o conteúdo rola.
3. Voltar e Escape retornam um nível. Escape na raiz fecha. Fechar sempre encerra o atendimento.
4. Só um diálogo fica aberto. A abertura limpa teclas, controles de toque e o caminho pendente; o jogo continua conectado e não envia ações de movimento durante o atendimento. A física ainda pode concluir uma frenagem breve.
5. Tab permanece no diálogo nativo. Ao fechar, o foco volta ao controle de origem visível e focável, ou ao mundo. Em toque, a origem pode ser o corpo da página; esse elemento não deve receber o foco no lugar do personagem. A troca de tela interna foca o título; atualizações de estado preservam a navegação e as quantidades digitadas.
6. A troca de lugar/dimensão, desconexão, perda de alcance ou mudança do ponto encerra o atendimento. Reentrar em um lugar ou reconectar não reabre o painel.

Mochila e aparência usam o mesmo controlador para abertura, fechamento, foco e bloqueio dos comandos. Não exigem um balcão: são ações pessoais do jogador. Um novo painel deve registrar-se no controlador, em vez de chamar `showModal()` diretamente ou criar mais condições individuais nos controles do jogo.

## Ações, permissão e retorno

Cada página oferece somente ações implementadas naquele ponto. Ausência de serviço significa recusa também no servidor; esconder o botão não é validação suficiente. O cliente não escolhe o balcão autorizado enviando suas coordenadas: o servidor o resolve pela posição real do jogador.

Visitantes podem consultar opções. Uma operação que exige conta fica desabilitada com uma explicação próxima. Reservas e compras continuam sujeitas a saldo, vagas, propriedade e persistência existentes no servidor. O painel não promete disponibilidade só por listar uma oferta.

Após enviar uma transação, o painel aguarda o aviso de resultado, bloqueia novos envios e mantém o usuário na mesma página. O resultado usa a região de status acessível. Uma mudança de cenário concluída, como entrar no quarto reservado, fecha a sessão anterior. Não conceder moedas, itens ou propriedades no renderer.

## Como acrescentar um atendimento

1. Registrar conteúdo novo pelo padrão de `docs/content/README.md`. Implementar o local, a planta e seu objeto interativo real antes de anunciar o serviço como disponível.
2. Acrescentar uma política explícita em `PLACE_SERVICES`. Definir a âncora no mundo e as seções do ponto. Conferir o alcance em todas as plantas usadas por ele.
3. Para serviço novo, definir o rótulo em `SERVICE_SECTIONS`, implementar sua página em `place-panel.mjs` e mapear suas ações em `placeServiceAllowsAction`. Registrar a nova mensagem no servidor e implementar validação/persistência; a política por si só não implementa a funcionalidade.
4. Usar o controlador comum e a navegação por rotas. Serviços não abrem ao receber snapshots ou atravessar portas. Não agrupar todas as lojas em um painel genérico de qualquer prédio.
5. Verificar alcance pela frente, obstáculo, lugar errado, conta/visitante, saldo/estoque e repetição de ações. Confirmar que falhas preservam recursos e que o estado salvo retorna após reconexão.
6. Conferir teclado e toque, entrada pela porta sem janela, movimento até o ponto, Tab/Escape/Voltar/Fechar, listas longas, troca de cenário e telas 1440×900, 390×844 e 320×640.

Validação atual: `game/place-services.test.mjs` verifica plantas/alcance/políticas; `scripts/place-service-actions.test.mjs` verifica recusas e uma venda real; `scripts/browser-place-panels-check.mjs` exercita os locais públicos e os painéis pessoais. `scripts/cabin-keys.test.mjs`, `scripts/cabin-door.test.mjs` e `scripts/browser-cabin-keys-check.mjs` verificam propriedade, chaves, porta trancada, compra externa, visitas, saída, revogação e retomada. Os navegadores usam servidor real e dados temporários. Diagnósticos são somente de leitura em `inspectMovement().placeServices`, `.cabinKeys` e `.panel`.

## Revisão de compras, vendas e aluguéis

`place-panel.mjs` apresenta somente materiais possuídos, quantidade inteira entre 1 e min(50, estoque), controles de toque de 44 px e total bruto antes da venda. Impostos seguem a regra autoritativa do servidor. Comprar, alugar, vender materiais e anunciar propriedade passam pela revisão no mesmo diálogo; Voltar preserva a quantidade. A revisão não altera carteira nem inventário. Antes do envio, o cliente confere novamente preço, saldo e estoque; se a cotação mudou, pede uma nova revisão. O servidor continua validando alcance, permissões, disponibilidade, preços e persistência. Não apresentar uma operação como concluída antes da resposta autoritativa.

Aluguel informa duração de 24 horas e se haverá renovação automática; ela começa desativada. Compra inicial de cabana permanece na placa externa. Opções sem saldo mostram quanto falta. Manter cabeçalho e navegação acessíveis, com rolagem no corpo, em 320 px e paisagem. `scripts/browser-commerce-ui-check.mjs` usa os componentes e CSS reais com inventário/API sintéticos para conferir revisão, cotação alterada, bloqueio durante envio, aluguel, compra e moderação sem mutações no preview; não substitui os testes transacionais do servidor.

Ferramentas dentro do jogo também permitem consultar histórico de sanções e até vinte denúncias abertas, além de advertir, silenciar, expulsar, suspender ou banir conforme as permissões retornadas pelo servidor. Cada medida exige motivo e revisão explícita, não é repetida automaticamente em falha de rede e fica na auditoria existente. Consultas só acontecem por ação do usuário, sem polling. Cargos, revogação e gestão completa de denúncias continuam no painel `/dev/staff`. Ao fechar/sair, limpar resultados, formulários e rascunhos; respostas de consultas antigas não podem repovoar outro atendimento ou sessão.

Revisão por função (29/10): o servidor rejeita vendas fora do intervalo inteiro 1–50, sem converter silenciosamente a quantidade. Renovação de diária, retirada de anúncio e revogação de chave também exigem revisão. Campos de política fiscal preservam edição, validam mínimo/base/máximo e somem ao perder autoridade. Na moderação, mudar os dados ou a permissão invalida a revisão; pedidos têm prazo de 15 s e nunca repetem medidas automaticamente. Matriz, escopo e evidências: [auditoria de funções comerciais e administrativas](audits/2026-10-29-commerce-functions.md).

## Calendário e negociação de imóveis

Compras, propostas privadas, anúncios de aluguel, várias propriedades/quartos e prazos devem cumprir [Tempo do jogo e propriedades](GAME-TIME-AND-HOUSING.md). Cada contrato deve ter seleção explícita de unidade e renovação própria; possuir outro imóvel não impede comprar.
