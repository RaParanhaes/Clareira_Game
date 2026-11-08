# Plano do sandbox e editor do mundo

**Estado:** proposta de produto e arquitetura; ainda não é um editor implementado.

**Fonte de verdade:** PostgreSQL para todo rascunho persistente, revisão de conteúdo, regra de território e publicação. O cliente pode manter câmera/zoom transitórios em memória; preferência pessoal sincronizada entre dispositivos pode ser persistida depois. JSON serve somente para importação/exportação explícita, fixture ou backup, nunca como save ativo.

Este plano complementa [o planejamento do painel administrativo](ADMIN-PLANEJAMENTO.md), [o padrão de conteúdo](content/README.md), [o mapa atual das dimensões](content/DIMENSION-MAPS.md) e [o contrato de objetos/física](content/SCENE-OBJECTS.md).

## O que existe hoje e o que falta

- O servidor é autoritativo sobre movimento, colisões, coleta, inventário, construção e salvamento. Dimensões têm geração determinística por coordenada/chunk; alterações do mundo são registradas em `world_chunk_changes`.
- Existe um catálogo PostgreSQL versionado de templates e instâncias de objetos (`object_templates`, `scene_objects`, histórico de catálogo) e o quarto salva móveis persistentes. O catálogo aceita propriedades estruturadas e valida um conjunto atual de campos; isso não significa que todo campo físico seja editável ou executado no runtime.
- A exploração pessoal do mapa salva chunks descobertos em `player_map_exploration`. Não há ainda editor visual de territórios, mapas privados com anotações, publicação de workspace pelo Gerente/Admin, cargos completos ou isolamento de ambiente de simulação.
- O mundo atual não tem motor geral de corpos rígidos, gravidade variável por zona, PvP entre jogadores, armadura de combate ou encantamentos sistêmicos. Há colisão e movimento no plano do mundo, ferramentas com durabilidade/progressão e aparências chamadas armaduras. Exibir esses controles antes de existir o contrato correspondente criaria uma promessa falsa.

### Acesso às dimensões

- Jogadores comuns, incluindo Guias de Comunidade, não trocam de dimensão por um seletor livre. Eles encontram portais escondidos ou descobrem conhecimentos/magias que liberam dimensões específicas; parte desse conteúdo pode aparecer apenas como `?` até ser descoberta. Mais tarde, certas habilidades podem permitir criar portais.
- Moderadores, Gerentes, Administradores e Proprietários podem trocar livremente entre dimensões com ferramentas da equipe. O acesso de staff não revela aos jogadores dimensões, portais ou conhecimentos secretos.
- O Proprietário pode acessar qualquer dimensão e executar qualquer ação no jogo, inclusive conceder/remover recursos e emblemas e entrar/sair de casas. Essa autoridade não depende de aprovação nem de limites funcionais; o registro de auditoria serve para histórico.

## Modelo: rascunhos, território publicado e instância

Separar cinco coisas que parecem semelhantes na tela, mas têm ciclo de vida diferente:

1. **Workspace de autoria:** branch persistente e privado de conteúdo sobre uma revisão-base. Guarda as construções, camadas pintadas e propriedades que o autor quer continuar editando. Só o autor e colaboradores convidados veem.
2. **Sessão de teste:** instância temporária que monta o conteúdo do workspace para testar traversal, colisão, aparência e regras. Avatar de teste, inventário/moeda de fixture, criaturas e estado simulado são descartados ao fechar; o conteúdo autoral continua salvo no workspace.
3. **Projeto de construção:** seleção empacotável do workspace (castelo, ruína, vila, cidade ou trecho de paisagem), com coordenadas locais, dependências e manifesto. Pode ser levado a uma revisão de outro ambiente.
4. **Definição de território:** geometria e políticas publicadas de uma área do mundo — nome, região-pai, terreno, PvP, acesso, destruição, spawn, recursos e regras aplicáveis. Um território não é posse de terreno por si só; claim/propriedade econômica é outro domínio.
5. **Instância jogável:** execução real servida pelo runtime. Jogadores, inventários, saves, economia, sanções e criaturas persistentes não pertencem ao workspace nem ao pacote de construção.

O workspace é um **branch persistente de conteúdo**, não uma cópia editável da conta real. Ele registra a revisão-base e operações incrementais (criar, mover, pintar, ajustar propriedade, remover), de modo que não copie o mundo inteiro nem os dados de outros jogadores. Rascunhos persistem no PostgreSQL e têm autor, workspace, revisão, data e prazo/ação de arquivamento. O que é descartável é a sessão de teste, não o castelo ou mapa que o autor está criando.

Para definir uma região que pertence ao mapa real, a equipe escolhe a dimensão e as coordenadas de destino, mas edita primeiro um workspace baseado na revisão pública atual. Assim ela trabalha “no mapa real” e vê terreno/construções existentes sem que cada pincelada altere imediatamente a partida. Uma camada de anotação pode ser publicada para o mapa administrativo antes da política de gameplay; regras como PvP, destruição ou spawn só entram em vigor ao publicar a revisão correspondente.

### O que pode sair do sandbox

Gerente ou Administrador seleciona o que quer levar ao mundo real e gera uma revisão candidata. O pacote leva somente conteúdo permitido:

- peças de terreno, construções e objetos selecionados, em coordenadas locais ou em uma área de destino explicitamente escolhida;
- definições/overlays de território e regras cujas permissões o autor tem para propor;
- assets já aprovados ou referências a assets do catálogo, IDs estáveis, versão de schema e dependências;
- manifesto com origem, revisão-base, autor, destino, tamanho, capacidades físicas e hash dos dados.

O pacote **não** leva conta, inventário, moeda, sessão, posição de jogador, posse, sanção, chat, dono de edifício ou entidades vivas. Chaves/claims ativos nunca são duplicados. Propriedade e recompensas só surgem através dos fluxos normais do mundo.

### Fluxo de promoção

```text
Workspace privado
   → selecionar conteúdo e destino
   → diff legível + validação automática
   → prévia/teste em staging
   → publicação direta por Gerente ou Administrador
   → atualizar caches/instâncias e observar
   → rollback para revisão anterior, se necessário
```

1. Mostrar diferenças contra a revisão-base: área afetada, terreno, instâncias, regras novas/removidas, objetos globais afetados, colisões e resultado visual. Se a revisão-base mudou, apontar conflito e pedir rebase; nunca combinar mudanças silenciosamente.
2. Validar IDs e schema, limites do mapa, assets, hierarquia, sobreposições, rotas de chegada/saída, colisão/navegação, dependências e custo de conteúdo/chunk. Checar também política de cada objeto e de cada área.
3. Oferecer prévia em staging isolado com a mesma versão do runtime e conteúdo de produção, sem dados pessoais/econômicos reais. A prévia é ferramenta do Gerente/Admin, não uma etapa de aprovação por outra pessoa.
4. Gerente ou Administrador publica diretamente como revisão imutável. A ativação é atômica por área/dimensão, registra o autor e o pacote aplicado. Novas sessões recebem a revisão nova; instâncias ativas recebem evento de atualização controlada ou terminam a sessão antes de trocar, conforme o tipo de mudança.
5. Rollback seleciona uma revisão anterior e publica uma nova revisão que restaura seu conteúdo. Nunca apaga o histórico nem tenta rebobinar inventário/saves de jogadores.

Gerente e Administrador podem publicar no mundo compartilhado sem aprovação manual. Validação automática continua obrigatória; conteúdo que não obedece schema, limites, colisão e regras globais é recusado pelo servidor. O Proprietário pode publicar e alterar qualquer conteúdo sem restrições funcionais, além de definir políticas e delegar esses poderes. Publicar não dá direito a cargos abaixo do Proprietário de sobrescrever local ocupado, reivindicado ou protegido.

## Ferramentas de mapa e território

### Mapa privado e câmera de edição

- Modo mapa/editor tem zoom independente do jogo normal: pode aproximar para selecionar tile/objeto e afastar para ler a dimensão inteira. Mudar o zoom afeta apenas a câmera local do editor; nunca muda escala, zoom ou visão de outros jogadores.
- Preferências transitórias (zoom/pan/paleta selecionada) ficam na sessão local. Anotações, regiões desenhadas e revisões de mapa que o usuário espera reencontrar persistem no PostgreSQL como rascunho próprio.
- Sobre o mapa: grade/tile e coordenadas do mundo, limites de chunk, terreno/relevo, estruturas, recursos, entradas/saídas, camadas de território e áreas de interesse. A vista usa escala de detalhe: ícones/agrupamentos no zoom distante e células/âncoras precisas no próximo.
- Ferramentas: pincel e borracha de células, seleção retangular/livre, polígono, mover/copiar construção, preencher terreno por camada, voltar/refazer e comparação com a base. Edição deve ter preview e indicação de snap/resolução antes de gravar.
- “Só eu vejo” significa camada privada do workspace. Colaboradores recebem acesso explícito. O serviço não envia essas geometrias a jogadores comuns nem as usa para colisão, navegação, spawn ou autorização.

O mapa de exploração pessoal e o mapa de autoria têm propósitos distintos: a descoberta pelo jogador não revela rascunhos de staff, e o editor não marca chunks como explorados para todos.

### Camadas e hierarquia

Organizar as camadas para a equipe desenhar cada intenção sem misturar imagem, forma física e regra de acesso:

| Camada | Exemplos | Efeito no jogo |
|---|---|---|
| Anotação privada | Nome provisório, marcador “revisar ponte”, rota planejada | Só mapa/editor; sem efeito no servidor de jogo |
| Geografia | Região “Vale das Cinzas”, costa, floresta, cadeia de montanhas | Nome e classificação; pode alimentar busca/mapa, não concede poderes |
| Zona de gameplay | PvP, perigo, abrigo, proteção, acesso, construção/destruição | Aplica políticas server-side sobre a área delimitada |
| Spawn e encontro | Spawn de entrada, saída, criaturas ou recursos | Runtime só executa tipos de spawn implementados e regras de população |
| Terreno e relevo | Material do chão, altura, trilha, água, depressão | Visual, travessia e colisão conforme contratos de terreno implementados |
| Instâncias construídas | Castelo, ruína, árvores, móveis, ferramentas de cenário | Catálogo/instâncias com âncora, colisão, uso e persistência tipados |

Regiões podem ter filhas (mundo → região → subzona → ponto de interesse). A região filha herda defaults explicitamente e sobrescreve apenas campos que declara. Resolver uma coordenada deve produzir uma política única e explicável; zonas incompatíveis que se sobrepõem (por exemplo, PvP ativo sobre santuário protegido) falham na validação em vez de depender da ordem de desenho.

Usar células/chunks para efeitos de terreno e polígonos versionados para limites semânticos. A geometria visível pode ser desenhada suavemente, mas o servidor precisa de quantização/normalização determinística e limites claros para bordas. Um brush macio de arte não pode produzir área de autorização imprecisa.

### Propriedades de área

Cada região pode expor apenas configurações aceitas pelo runtime, com herança e origem visíveis:

- **Identidade:** nome traduzível, ID estável, descrição, pai, tipo e cor/ícone cartográfico.
- **Combate:** PvP desligado/ligado/condicional, dano permitido, facções/time e exceções de safe-zone, quando o combate multiplayer existir.
- **Risco:** seguro/perigoso, nível/aviso, tipos de dano e retorno/spawn após morte, quando essas mecânicas existirem.
- **Construção:** quem pode construir, modificar ou destruir; permitir alteração de árvore/recurso; proteção de estruturas; owner/equipe/claim conforme sistema de posse implementado.
- **Ambiente:** preset de gravidade/física, iluminação/clima, spawn de fauna/recursos e limites de população, somente para parâmetros suportados.
- **Acesso e entrada:** público, convite, chave, nível/capacidade, ponto de chegada e rotas autorizadas.

Cada controle mostra o valor efetivo e sua origem: “herdado da dimensão”, “definido nesta região” ou “override desta instância”. Exemplo: a dimensão desliga PvP; uma subzona não pode ligá-lo sem capacidade explícita e política que permita override. A validação informa exatamente qual ancestral bloqueia o valor.

## Objetos, ferramentas e propriedades físicas

Separar **template do catálogo**, **instância única no mundo**, **estado mutável em jogo** e **aparência do avatar**:

- Alterar um template com escopo global cria uma revisão do catálogo. Instâncias novas passam a usar a revisão publicada; instâncias já existentes ficam presas à versão que tinham por padrão. Uma migração explícita pode atualizar instâncias antigas, depois de prévia de impacto e validação. Isso evita que um ajuste de espada ou árvore mude silenciosamente o save de todos.
- “Fazer uma cópia e torná-la única” cria uma nova definição derivada/versionada ou um override tipado daquela instância, com ID próprio e indicação da origem. Não clona posse, conteúdo do inventário ou chave. Propriedades visuais e físicas são locais à cópia; capacidades que afetem combate/economia obedecem às regras globais do Proprietário e à validação automática do servidor, sem aprovação manual por pacote.
- Instâncias de árvore distinguem tronco, copa, alcance, colheita, rebrota e destruição. Um sprite pintado não se torna bloqueador/colhível até o tipo de árvore declarar esses comportamentos e o runtime implementar persistência correspondente.
- Ferramentas/armas têm tipo, alcance, tempo de ação, durabilidade, dano/força e tags de alvo. Armadura/roupa precisa separar composição visual, slot, defesa/resistência e durabilidade; roupa cosmética não recebe armadura por aparência. Encantamentos são modificadores tipados com valores limitados, compatibilidade e custo/regras, não texto/script livre.
- Gravidade deve ser um perfil nomeado com limites (`gravityScale`, aceleração, velocidade terminal, eventualmente atrito), vinculado a uma zona ou dimensão; não um número arbitrário por pixel ou objeto. Só terá efeito quando o runtime compartilhar uma simulação vertical/física compatível. Hoje o jogo não tem gravidade geral no mundo plano. Antes de oferecer a opção, definir quedas, saltos, velocidade, colisão, servidor autoritativo, rollback de movimento e impacto de rede.

Precedência sugerida de propriedades físicas: **defaults do motor → perfil da dimensão → política da região → template versionado → override permitido da instância → efeito temporário do estado de jogo**. Cada campo especifica se pode herdar/override e em quais níveis. Não permitir que um objeto instalado substitua gravidade do mundo ou regra de PvP. O validador rejeita propriedade desconhecida, valor fora da faixa, combinação incompatível e propriedade que o runtime não declara suportada.

O editor deve indicar três estados por campo: **implementado**, **planejado** ou **somente visual**. “Planejado” pode ser autorado e pré-visualizado sem efeito online; não aparece como funcional até o servidor suportar e validar a propriedade.

## Segurança, autorização e recuperação

- Permissões distintas: `world.draft.edit`, `world.draft.share`, `world.content.publish`, `world.region.policy`, `world.physics.profile`, `world.catalog.global`, `world.catalog.instance_override`, `world.rollback`. Gerente e Administrador recebem criação/publicação; Proprietário tem todas as permissões e pode delegá-las.
- A autorização é checada no servidor em cada operação; dimensões, regiões e objetos são parte do escopo. O cliente não pode escolher por payload um ambiente de produção se a sessão só acessa sandbox.
- Log append-only de ator, workspace, operação, região/alvo, revisão-base, valores antes/depois e resultado. Edição privada tem auditoria de colaboração/publicação, mas não expõe o desenho a todos.
- Ações em lote são transacionais e idempotentes. Limitar tamanho de pacote, número de células, instâncias, profundidade de herança e geometria para evitar travar mapa/runtime.
- Preservar revisão anterior e exportação de recuperação. Um erro em uma região não deve publicar metade de uma dimensão.
- Destruição de vegetação e construções é estado de runtime, separado da regra “pode destruir”. Uma política permitir não remove automaticamente um objeto; cada destruição válida usa serviço de domínio e salva evento/change por chunk.

## Dados persistentes que a implementação vai precisar

Extensões futuras por migração PostgreSQL, sem JSON de save:

| Modelo lógico | Conteúdo |
|---|---|
| `sandbox_workspaces` | autor, nome, ambiente base, revisão-base, membros, estado, expiração |
| `sandbox_changes` | operações/deltas versionados por chunk, catálogo ou região; nunca estado integral da conta real |
| `world_content_revisions` | publicação imutável, autor/publicador, manifesto, escopo e estado |
| `world_regions` + `world_region_revisions` | ID, pai, geometria normalizada, propriedades tipadas, revisão e janela ativa |
| `world_publication_events` | aplicação por dimensão/área, resultado, instâncias notificadas e rollback |
| `editor_preferences` (opcional) | zoom/painéis do usuário para sincronizar dispositivos; sem autoridade de gameplay |

As estruturas são um mapa conceitual, não SQL final. Reusar `world_chunk_changes` para deltas espaciais se seu contrato cobrir a operação; criar revisão/isolamento necessários sem duplicar o armazenamento atual de terreno. Reusar `object_catalog_history` somente para mudanças de catálogo cobertas pelo seu escopo. Cada migração define constraints, índices espaciais/por chunk, grants mínimos, retenção e backfill.

## Base necessária e ordem de construção

### Preparação antes de programar

| Campo | Definição atual |
|---|---|
| `feature_id` | `world-authoring-v1` |
| `feature_title` | Autoria isolada, territórios e publicação de conteúdo |
| `rationale` | Permitir criar cenários e regras sem arriscar o mundo, contas ou economia reais |
| `priority` | P0 para isolamento, autoria mínima e persistência; P1 para publicação; P2 para física e combate ainda não implementados |
| `status` | Planejamento; nenhuma etapa de implementação aprovada ou iniciada por este documento |
| `goal` | Gerente/Admin cria mapa ou construção em workspace, testa sem contaminar produção e publica revisão validada com diff e rollback |
| `scope_in` | Banco, permissões, mapa/editor, regiões, sessão de teste, versões, publicação e auditoria |
| `scope_out` | SQL arbitrário no painel, edição direta dos saves de jogadores, execução de scripts de conteúdo, PvP/gravidade/encantamentos antes do runtime correspondente |
| `changed_subsystems` | PostgreSQL/migrations, catálogo de conteúdo, world chunks, autorização, servidor de jogo, editor mapa, cache e administração |
| `constraints` | PostgreSQL é a fonte durável; servidor valida e publica; conteúdo desconhecido é recusado; alterações usam revisão esperada |
| `assumptions` | Workspace persistente pertence a uma conta staff; compartilhar é explícito; primeira versão é voltada a desktop; teste usa fixture descartável |
| `open_questions` | Limites máximos de células/objetos por pacote; destinos e limites da publicação direta; colaboração simultânea; suporte a edição por toque no primeiro MVP |
| `risks` | Misturar rascunho e produção, propagar mudança global a instâncias antigas, colisão entre revisões, abuso de geometria/carga e controles que só mudam a aparência |
| `security_privacy_notes` | Nenhum dado pessoal/de jogador entra em workspace; serviço de teste não recebe credenciais de escrita de produção; publicar exige capacidade e escopo |
| `non_functional_requirements` | Rascunho sobreviver a reconexão; falha não publicar metade do pacote; zoom do editor não alterar visão alheia; operação repetida não duplicar mudança |

Os destinos compartilhados, os limites de publicação para Gerente/Admin e as regras globais continuam como questões abertas. O Proprietário tem acesso global e pode publicar sem aprovação manual; as etapas abaixo são **rascunho** até os limites e validações estarem definidos.

### Acessórios do editor

Esse é o kit que torna a ideia usável. A primeira versão precisa apenas do conjunto mínimo; as ferramentas avançadas entram quando os contratos de mundo e runtime as suportarem.

| Ferramenta | Básico necessário | Evolução posterior |
|---|---|---|
| Mapa | Alternar dimensão, pan/zoom local, escala, coordenadas e chunks | Pesquisa, marcadores e agrupamento em zoom distante |
| Camadas | Ver base pública, rascunho privado e diferença entre elas | Geografia, território, spawn, terreno e objetos em camadas editáveis |
| Edição | Selecionar célula/área, pincel, borracha, nomear região, desfazer/refazer | Polígonos, preenchimento, copiar/colar estruturas e edição por lote |
| Biblioteca | Colocar estruturas e objetos já existentes no catálogo | Modelos próprios, variantes e conjuntos de assets aprovados |
| Inspetor | Mostrar coordenada, revisão, colisão e propriedades suportadas | Regras herdadas, templates globais, overrides por instância e perfis físicos |
| Teste | Abrir sessão descartável e retornar ao editor | Múltiplos avatares/casos de simulação e ferramentas de observação |
| Publicação | Salvar rascunho e comparar com a base | Validar dependências, publicar direto como Gerente/Admin e reverter |

Controles como PVP, gravidade, encantamento ou resistência ficam visíveis como planejados/indisponíveis até serem implementados no servidor. A primeira entrega não precisa de pincel 3D, editor de scripts, física livre ou publicação com um clique.

### Fundamentos técnicos que precedem ferramentas avançadas

1. **Contrato de conteúdo:** IDs estáveis; schema por tipo; diferença entre template, instância e estado; lista de campos executáveis por runtime; versionamento de assets e regras de migração. Expandir `object_catalog`/`world_chunk_changes` somente onde os contratos atuais não bastarem.
2. **Revisão otimista:** toda edição envia `expectedRevision`; servidor recusa revisão antiga; UI mostra conflito e oferece comparar/rebase. O catálogo e o mundo já têm revisões, mas workspaces e regiões precisam seguir o mesmo padrão.
3. **Autorização com escopo:** Gerente/Admin podem editar e publicar conforme escopo por dimensão/região; Proprietário tem acesso global e autoridade total. Moderador ou superior pode trocar de dimensão; jogador comum depende de portais e conhecimentos descobertos. Reusar o plano de cargos; eliminar o papel único `admin` gradualmente, sem bypass pelo cliente.
4. **Isolamento de execução:** serviço de autoria grava somente rascunhos; serviço/runtime de teste recebe conteúdo do workspace e fixture descartável; processo de produção só recebe conteúdo pelo publicador. Usar credenciais de banco separadas para o executor de teste sem grants de escrita nas tabelas reais de conta, inventário e economia. Staging deve usar dados sintéticos ou cópia sanitizada, nunca clone aberto de dados pessoais.
5. **Deltas e proveniência:** armazenar operações incrementais no PostgreSQL com autor, workspace, revisão-base, revisão nova, chunk/objeto, antes/depois e timestamp. Não duplicar o mapa inteiro por workspace nem reaproveitar `player_map_exploration` para autoria.
6. **Validador compartilhado:** usar as mesmas regras de IDs, coordenadas, colisão, referências, hierarquia e limites no editor, no publicador e no servidor. Preview ajuda a pessoa, mas somente validação do servidor autoriza gravar/publicar.
7. **Atualização dos clientes/instâncias:** identificar revisão de mundo/catálogo nos snapshots; invalidar cache de conteúdo quando uma nova revisão for ativada; instâncias em andamento terminam ou migram segundo regra explícita.

### Etapas incrementais

Todas as etapas começam com `status: draft`. Cada uma só sai de `draft` após definir limites de escopo, permissão, dados, comandos de verificação e rollback. A sequência é serial: uma base precisa estar aprovada antes da próxima depender dela.

#### WAE-01 — Contratos e fronteiras

- `priority`: P0; `task_size`: M; `owner_role`: planner/arquitetura.
- `dependencies`: leitura do schema atual, contratos de mundo/objetos e decisões abertas acima.
- `goal`: congelar vocabulário, IDs, coordenadas, revisão, autoridade de publicação do Gerente/Admin e o que a sessão descartável pode simular.
- `scope_in`: mapa de dados atual, contrato de região, comportamento que está implementado versus planejado, limites de pacote.
- `scope_out`: tela/editor e novas propriedades de física.
- `acceptance_criteria`: diagrama workspace → sessão teste → publicação → produção; matriz de campo × runtime; definição do que Gerente/Admin publicam diretamente e confirmação da autoridade global do Proprietário; nenhuma afirmação de funcionalidade sem código servidor correspondente.
- `verification_strategy`: revisão de schema/código e exemplos de operações válidas/inválidas; sem comando de implementação planejado nesta etapa documental.
- `rollback_plan`: somente documentação; reverter a revisão do plano caso o contrato conflite com o runtime.
- `open_questions`: destinos de publicação e limites iniciais de tamanho/colaboração.
- `status`: draft.

#### WAE-02 — Revisão, autorização e auditoria

- `priority`: P0; `task_size`: L; `owner_role`: backend/autorização.
- `dependencies`: WAE-01 aprovada.
- `goal`: estabelecer que Gerente/Admin podem editar e publicar por workspace/dimensão, com trilha auditável e conflito de revisão.
- `scope_in`: migrações PostgreSQL, capacidades, grants, validação em toda operação, revisão esperada e trilha append-only.
- `scope_out`: ações de moderação de jogador, economia e conteúdo de gameplay.
- `acceptance_criteria`: jogador sem permissão não lê/escreve workspace; só Gerente/Admin publicam no mundo compartilhado; mudança revogada bloqueia próxima operação; colisão de revisão é recusada; cada alteração identifica ator, escopo e versão.
- `verification_strategy`: testes de autorização positiva/negativa, integração transacional e concorrência, além de revisão dos grants SQL.
- `rollback_plan`: migração aditiva e flag desativada; preservar conteúdo e manter o painel sem escrita se a autorização falhar.
- `status`: draft.

#### WAE-03 — Workspace privado persistente

- `priority`: P0; `task_size`: L; `owner_role`: backend/mundo.
- `dependencies`: WAE-01 e WAE-02 aprovadas.
- `goal`: salvar rascunhos incrementais privados sobre uma revisão-base sem gravar no mundo ativo.
- `scope_in`: Gerente/Admin criam, listam, carregam, duplicam, renomeiam e arquivam workspaces; replay de deltas; colaboração explícita posterior.
- `scope_out`: regras de PvP, economia e mudanças em contas/saves públicos.
- `acceptance_criteria`: reconexão reabre o rascunho; revisão antiga não sobrescreve nova; conteúdo de um workspace não vaza a outros; encerrar sessão de teste não apaga o workspace; archive/restore não perde histórico.
- `verification_strategy`: integração PostgreSQL para isolamento, ordenação determinística de deltas, reconexão, concorrência e restauração.
- `rollback_plan`: desligar criação de workspace por flag; dados ficam preservados e sem efeito no runtime público.
- `status`: draft.

#### WAE-04 — Mapa e pincel mínimos

- `priority`: P0; `task_size`: L; `owner_role`: frontend/editor.
- `dependencies`: WAE-03; mapa de leitura e coordenadas/chunks disponíveis.
- `goal`: criar e rever uma área privada no mapa, com zoom independente, seleção, pincel/borracha, nome e undo/redo.
- `scope_in`: desktop, camadas base/privada/diff, coordenada visível, save de rascunho.
- `scope_out`: publicar alteração, ferramentas móveis completas, brushes com geometria não determinística.
- `acceptance_criteria`: rascunho só é mostrado a quem tem acesso; zoom não altera câmera de jogadores; brush respeita resolução declarada; desfazer/refazer produz mesmos deltas; mapa base não muda.
- `verification_strategy`: e2e de desenhar, salvar, reabrir, editar, comparar e abandonar; captura de mapa em pelo menos dois níveis de zoom.
- `rollback_plan`: desabilitar edição e manter mapa em leitura; nenhum delta chega ao mundo ativo.
- `status`: draft.

#### WAE-05 — Biblioteca de construção e sessão de teste

- `priority`: P0; `task_size`: XL; `owner_role`: runtime/engine.
- `dependencies`: WAE-03 e WAE-04; contratos de assets e colisão.
- `goal`: posicionar construções/objetos cadastrados e testá-los num runtime isolado com avatar/estado descartável.
- `scope_in`: colocar, mover, girar, copiar dentro do workspace; inspetor mostra propriedades existentes; instância de staging com saída clara.
- `scope_out`: acesso à base de produção, scripts, PvP e gravidade variável.
- `acceptance_criteria`: teste usa versão conhecida do conteúdo; nenhum save/inventário/economia real é gravado; colisão e interação vêm do mesmo validador do servidor; teste encerrado limpa fixtures e preserva autoria.
- `verification_strategy`: tentativas de cruzar para dados reais, integração de DB com usuário de teste restrito e teste de save/reconnect/cleanup.
- `rollback_plan`: desativar criação de sessão teste; workspace continua legível/editável e instâncias não publicadas são removidas pelo lifecycle.
- `status`: draft.

#### WAE-06 — Região e política com valores suportados

- `priority`: P1; `task_size`: L; `owner_role`: backend/mundo e editor.
- `dependencies`: WAE-01 a WAE-05; runtime já entende os campos que serão liberados.
- `goal`: criar região nomeada, regiões filhas e propriedades com herança legível e resolução determinística.
- `scope_in`: geometria normalizada, overlap validator, nome/descrição, acesso/entrada e permissões de construção já suportadas.
- `scope_out`: ativar opções cujo runtime é inexistente ou planejado.
- `acceptance_criteria`: mesma coordenada resolve a mesma região/política em todos os servidores; conflito de zona bloqueia save; campo mostra valor e origem; override fora do escopo é recusado pelo servidor.
- `verification_strategy`: unit/integration para borda, sobreposição, herança, cache e decisão de acesso, mais revisão visual das regiões no mapa.
- `rollback_plan`: publicar revisão anterior de política sem reverter inventários ou progresso de jogadores.
- `status`: draft.

#### WAE-07 — Publicação direta, staging e rollback

- `priority`: P1; `task_size`: XL; `owner_role`: Gerente / Administrador.
- `dependencies`: WAE-01 a WAE-06; autoridade do Gerente/Admin e fluxo de rollback definidos.
- `goal`: permitir ao Gerente/Admin publicar diretamente um pacote selecionado com diff, validação automática, ativação atômica e rollback.
- `scope_in`: manifesto, dependências, conflitos, staging sanitizado, publicação PostgreSQL, invalidação de cache, histórico.
- `scope_out`: publicar estado de jogador; permitir que cargo abaixo do Gerente publique em dimensão compartilhada.
- `acceptance_criteria`: pacote exclui dados de jogador; validação roda no servidor; Gerente/Admin não precisam de aprovação manual; revisão antiga/território ocupado/regra global inválida bloqueia; rollback cria nova revisão; reinício não perde a versão ativa.
- `verification_strategy`: integração de publicação atômica, falha no meio do processo, duas publicações concorrentes, rollback e cache em clientes conectados.
- `rollback_plan`: restaurar revisão anterior de conteúdo e suspender novas publicações; não apagar eventos nem tentar reverter ações já tomadas por jogadores.
- `status`: draft.

#### WAE-08 — Propriedades avançadas de gameplay

- `priority`: P2; `task_size`: XL; `owner_role`: gameplay/physics.
- `dependencies`: contratos e runtime de combate/física implementados, medidos e aprovados.
- `goal`: habilitar propriedades como PvP, destruição, defesa/encantamento e perfis de gravidade com efeito real server-side.
- `scope_in`: schema tipado, limites, balanceamento, autoridade, replicação, interação com zona e migração de instâncias.
- `scope_out`: campo genérico ou script arbitrário definido pelo editor.
- `acceptance_criteria`: cada campo muda comportamento do servidor e cliente de forma compatível; valores extremos são recusados; update mantém revisão antiga/rollback; teste mostra a regra efetiva por região.
- `verification_strategy`: simulação determinística, integração multiplayer e checks de desempenho/estabilidade acordados antes do código.
- `rollback_plan`: desativar capacidade e restaurar perfil de física/regras anterior por revisão.
- `status`: draft.

### Política de execução e verificação

- Executar uma etapa por vez em ordem; nenhum trabalho em paralelo foi pedido. Implementação só começa depois de revisar a etapa e suas dependências.
- Cada etapa de código precisa de prompt próprio com objetivo, caminhos, arquivos proibidos, estratégia de verificação e critérios de parada.
- `candidate_files`: TBD no preparo de cada etapa; não inferir arquivos de implementação antes de revisar o código correspondente. Isso bloqueia o estado `ready`, não o planejamento.
- `timebox`: TBD após dividir as etapas em entregas revisáveis; não prometer prazo sem estimativa técnica.
- `agent_sequence`: responsável pela etapa → revisor de segurança/runtime → tester → docs-sync, em sequência. São papéis de revisão; não significam execução paralela.
- `required_approvals`: dono de produto para limites/política global de publicação; responsável de segurança para grants/isolamento; responsável do runtime para qualquer propriedade de gameplay. Essas aprovações definem o sistema, não são revisão manual de cada publicação do Gerente/Admin.
- `max_review_loops`: 2. `escalation_rule`: após duas revisões sem acordo, manter a etapa em `draft` e listar a decisão técnica/produto ainda necessária.
- `scope/rollback`: cada tarefa declara arquivos e comportamento dentro/fora do escopo; migrações são aditivas, publicação usa revisão anterior, e falha de isolamento bloqueia o rollout.
- `commands_planned` e `commands_run` são campos diferentes: comandos de teste só são escolhidos quando a implementação for autorizada e entendida; registrar somente os que realmente rodarem.
- `tests_required`: yes para cada mudança de código que altere segurança, persistência, resolução de região ou publicação; a matriz e os comandos exatos são definidos/revisados antes da implementação.
- Aceitar uma etapa exige resultado do servidor, autorização, banco, interface e rollback pertinentes. Um mock do banco/runtime não conta como prova do sandbox.
- Se staging real ou isolamento de credenciais não estiver disponível, registrar como bloqueio para publicar; não fingir isolamento com uma flag do cliente.
- Após implementação, sincronizar este plano, o plano administrativo, padrões de conteúdo e roadmap de escala; não guardar credenciais/dados de jogador nos documentos.

## Critérios de pronto para publicação

- Workspace privado isolado por autorização e sem escrita acidental em save, inventário, economia ou mundo público.
- Pacote contém apenas conteúdo selecionado; referências e IDs resolvidos; diff mostra todo impacto.
- Staging reproduz a revisão-alvo e permite que Gerente/Admin verifiquem a área antes de publicar.
- Conflito de revisão, colisão, acesso, limites, regras de área e compatibilidade de schema bloqueiam publicação inválida.
- Publicação e rollback sobrevivem a reinício/reconexão; caches e servidores recebem a revisão certa sem misturar versões.
- Cada campo de ferramenta, árvore, roupa/armadura e física é consumido pelo servidor e pelo cliente conforme seu contrato ou aparece claramente como planejado.
