# Objetos e modelos das construções

Construções, plantas e objetos persistentes são dados versionados no PostgreSQL, a fonte única de verdade. Redis guarda cópias de leitura identificadas pela revisão do PostgreSQL. O desenho e a física recebem o mesmo catálogo pelo servidor. Nenhum quadro consulta o banco. JSON em comandos de importação/exportação é apenas um formato de transporte/revisão; não é o armazenamento autoritativo.

## Organização

- `object_templates`: modelos com tipo, propriedades JSONB e herança opcional por `base_id`.
- `scene_objects`: instâncias com ID estável, modelo, objeto pai, cenário e propriedades próprias.
- `object_catalog_state`: revisão global usada para concorrência e atualização dos clientes.
- `object_catalog_history`: autor, operações e retrato anterior de cada revisão.
- `room_objects.properties`: atributos adicionais dos móveis já pertencentes aos jogadores. O campo `enabled` mantém o estado das luminárias; `roomSupport` guarda a relação persistente entre um objeto apoiado e o móvel que o sustenta.

A revisão 4 salva anteriormente contém 238 modelos e 215 objetos. O seed de bootstrap atual contém 239 modelos e 212 objetos: a cabana piloto agora tem somente a janela do quarto e o catálogo inclui o modelo de ducha. O bootstrap compara-se ao seed atual em banco vazio, mas não reescreve catálogos já persistidos; reconciliações de revisões salvas exigem uma edição/migração explícita para preservar escolhas feitas no banco. O catálogo inclui portas, telhados, paredes, janelas, marquises, pilares, sacada, camas, cadeiras, mesas, lareiras, plantas, balcões, tapetes, decoração de parede e o catálogo medieval de 200 móveis. Os modelos dos móveis decoráveis ficam no catálogo, separados dos objetos fixos das plantas. Altura, materiais e outras medidas da construção são propriedades do objeto principal. As revisões 3 e 4 registram colisores, pontos de profundidade e os modelos medievais colocáveis.

Os IDs de prédios e os quartos das contas são preservados. Propriedade, reservas e chaves continuam em tabelas próprias: copiar uma casa não copia a posse de alguém, as chaves ou o inventário de moradores.

`game/content-catalog.mjs` continua descrevendo os tipos e renderizadores implementados. `game/object-catalog-seed.mjs` converte as definições existentes uma única vez; ele não substitui escolhas salvas após um reinício. Novas propriedades podem ser guardadas sem alterar tabelas. Uma propriedade nova ganha efeito no jogo quando um comportamento/renderizador passa a usá-la; JSON não executa código.

## Vocabulário e escopo do catálogo

Use **objeto de cena** como o termo comum para algo definido no mundo e reconhecível pelo jogo: casa, peça de fachada, pilar, bandeira, árvore, tufo de grama, cadeira, planta ou aparelho. **Entidade** fica reservado ao elemento vivo/ativo da simulação — jogador, animal, NPC — e a processos temporários que têm ciclo próprio. Em conversa, “objeto” pode ser o termo curto; em código e dados, prefira nomes explícitos como `objectTemplate`, `sceneObject`, `roomObject` e `actor` para não confundir definição, instância e personagem.

Nem todo objeto precisa ser uma linha individual no banco. O banco registra todos os modelos/capacidades que o jogo reconhece e as instâncias com estado persistente ou autoria. Grama ornamental e folhas repetidas podem ser geradas por região/seed e cacheadas; uma árvore colhível, uma árvore plantada por jogador ou uma construção editável precisa de identidade/estado persistente. Não criar milhares de registros para elementos decorativos determinísticos.

O modelo existente já tem três papéis úteis e distintos; preservá-los é menos arriscado do que criar um catálogo paralelo:

| Papel | Armazenamento atual | Conteúdo |
|---|---|---|
| Definição reutilizável | `object_templates` | tipo, dimensões, visual, física, capacidades e regras padrão de um modelo |
| Montagem/instância de cenário | `scene_objects` | prédio, quarto e componentes fixos ligados por `parent_id`, com revisão e histórico |
| Móvel colocado em quarto privado | `room_objects` | modelo referenciado, âncora/rotação, dono do quarto e estado adicional |

Inventário/propriedade de itens, contas e recursos continuam nas tabelas próprias; uma cadeira colocada não é uma cópia do template, e um item de inventário não é uma parte fixa da montagem da casa. `game/content-catalog.mjs` continua sendo a declaração de recursos já implementados, mas não deve ser uma segunda autoridade para propriedades persistentes: na migração, o servidor resolve o `templateId` confiável no catálogo PostgreSQL/Redis e o cliente recebe um snapshot compacto da definição necessária.

## Contrato de propriedades

Todo template usa um identificador estável, `schemaVersion`, uma categoria e blocos de propriedades tipados. A primeira versão pode continuar em JSONB, mas o carregador deve validar os blocos conhecidos e recusar enumerações, dimensões, referências e valores inválidos. Campo desconhecido não pode executar lógica. Não achatar capacidades diferentes num `kind` ou num booleano genérico.

```json
{
  "id": "furniture.chair",
  "kind": "furniture",
  "properties": {
    "schemaVersion": 1,
    "category": "furniture",
    "family": "seat",
    "tags": ["medieval", "wood"],
    "visual": {"renderer": "sprite-atlas", "assetId": "room-furniture-v2", "pivot": "floor-contact", "depthProfile": "chair-four-view"},
    "placement": {"surface": "floor", "footprint": {"width": 0.72, "depth": 0.72}, "rotations": [0, 1, 2, 3], "movable": true},
    "physics": {"mode": "static", "collider": {"shape": "box", "width": 0.72, "depth": 0.72}, "blocksNavigation": true},
    "capabilities": {"characterSurfaces": [{"action": "sit", "spot": "seat", "height": 0.95}], "supports": []},
    "interactions": [{"id": "sit", "trigger": "use", "requires": ["character.sit"], "animation": "sit-on-seat"}],
    "state": {"schema": "none", "persistent": false}
  }
}
```

Blocos obrigatórios conforme a categoria:

- `identity`: ID/versionamento, categoria (`architecture`, `furniture`, `vegetation`, `decoration`, `device`, `resource`), família/tags e referências a modelos-base.
- `visual`: renderer/asset e manifesto, quadros/orientações/estados, pivô no contato, limites visuais e perfil de profundidade. Seguir os contratos de [UV-MATERIALS.md](UV-MATERIALS.md) e [ISOMETRIC-DEPTH.md](ISOMETRIC-DEPTH.md); arte, alpha e sombra nunca definem o colisor automaticamente.
- `placement`: superfície aceita (piso, parede, teto, socket, grade de construção), footprint lógico, âncora, direções, encaixes, movimento/edição e restrições de espaço.
- `physics`: modo (`static`, `kinematic`; `dynamic` só quando houver uma interação jogável que exija queda/empurrão), colisor independente do sprite, bloqueio de navegação e altura de obstrução.
- `capabilities`: capacidades separadas do visual: sentar/deitar/ficar de pé, oferecer superfície de apoio, armazenar itens, emitir luz, colher, abrir, trocar estado. Cadeira fornece superfície para `sit`; planta não. Aparência de “topo plano” não concede suporte.
- `interactions`: ações nomeadas com gatilho, alcance, requisitos, ocupação, ação/rumo de avatar, animação do objeto, duração/regra de repetição e efeitos autoritativos. Ex.: `sit`, `lie`, `open`, `take-item`, `harvest`, `toggle-light`.
- `state`: estado tipado do objeto e política de persistência. Estado momentâneo (porta animando, chama/partícula) é sincronizado durante a ação e não precisa de gravação por quadro; porta aberta durável, estoque da geladeira, livro removido ou crescimento de muda precisa persistir se alterar a experiência após reconexão.

As instâncias guardam `templateId`, ID estável, cena/quarto, posição/rotação/nível, overrides permitidos e `state` persistente. O servidor autoriza a transição; clientes recebem eventos/snapshots para interpolar animação. Não fazer query ao PostgreSQL por quadro e não aceitar do cliente o tipo, colisor, altura, capacidade ou recompensa.

## Uso, inventário e animações

Uma interação é uma transação de jogo, não uma animação local disparada pelo clique. O servidor confere distância e caminho, permissão, alcance, capacidade do objeto, ocupação e pré-condições; altera o estado/inventário de forma atômica; e envia o resultado para todos os observadores. O cliente anima o feedback aceito e reconcilia rejeições.

- Cadeira/banco: `sit` requer assento livre e posiciona o avatar no ponto/altura de uso; planta e estante não herdam essa capacidade.
- Cama: `lie` exige leito livre; estado do usuário referencia instância e ação. Coberta e cabeceira são camadas visuais ordenadas pela profundidade documentada, não móveis empilhados.
- Estante: ações de conteúdo apontam para itens/referências armazenados. Retirar livro valida presença/quantidade e concede ao inventário; animação de alcançar/retirar acompanha o ACK. Não criar uma ação `take` genérica para qualquer objeto.
- Geladeira/baú: `open` muda estado visual da porta/tampa; `take-item` é separado e verifica conteúdo, dono/permissão e capacidade do inventário. A animação de abrir não concede itens por si só.
- Árvore/recurso: `harvest` valida ferramenta, alcance, fase de crescimento e estoque; o estado de regeneração é persistido conforme regra do recurso. Efeito de corte é diferente da animação de balançar da copa.

Estados de animação devem ser reproduzíveis para observadores (ID do ator/objeto, ação/estado, direção, início/duração conforme relógio autoritativo); não transmitir sprites renderizados. Seguir o sistema de ACK/idempotência já usado para interações e registrar transferências relevantes no diário transacional existente.

## Apoio, empilhamento e o caso da cama

Empilhar é uma relação explícita entre uma superfície de apoio e um item autorizado, não consequência da altura, da imagem ou da propriedade vaga `stackable: true`. Modelar cada superfície com ID, forma/localização, dimensões/área, altura local, tags/categorias aceitas, limite de itens e altura/carga máxima quando esses limites forem necessários. O item filho declara se pode ser apoiado e em quais famílias/superfícies. Validar footprint completo, giro, área útil, altura/teto, colisão de volume, suporte ainda existente e ciclo de dependência. Guardar `supportInstanceId`, `supportSurfaceId`, offset local e altura derivada; mover/girar o suporte recalcula a montagem no servidor. Remover um suporte com filhos é recusado até os filhos saírem.

Política inicial deliberada:

| Superfície/objeto | Permitido no primeiro modelo |
|---|---|
| Piso | Móveis de piso compatíveis, sem interseção de volume |
| Mesa, escrivaninha, criado-mudo, baú | Apenas planta, enquanto a superfície útil comportar o footprint |
| Cadeira/sofá/cama | Uso de personagem em spots próprios; não são superfície genérica para outros móveis |
| Estante | Livros/props individuais em sockets explicitamente definidos; não móveis grandes |
| Cama sobre cama | Proibido: a cama não oferece superfície de empilhamento de móveis |
| Parede/teto | Só itens com attachment point e orientação próprios, sem ocupar o piso indevidamente |

Na configuração atual, `furniture.bed` não declara `supports` nem `stackable`, enquanto `roomFurnitureSupport` exige o filho ser empilhável e uma superfície listar seu tipo. `canPlaceRoomFurniture` também rejeita interseção volumétrica de móveis no mesmo nível. Portanto, a regra do servidor impede cama sobre cama pelo fluxo normal. Coberta, colchão, travesseiro e cama são componentes/camadas de uma única instância, nunca devem ser inseridos como outra cama sobre o leito. A arte aprovada agora parte de `game/art/room-furniture/bed-3d-prototype/medieval-bed.blend`, usa UV por face e publica as quatro direções/estados em `room-furniture-v3.png`; a instância, footprint, capacidade `lie`, colisão, mover/girar e persistência existentes permanecem os mesmos. A linha `bed-cover` também inclui a cabeceira frontal quando necessário para o avatar não atravessar a madeira.

## Plano de execução

1. **Inventário do domínio (sem migração):** classificar templates e cenas existentes; separar atores, modelos, montagens fixas, móveis de jogador, itens de inventário, recursos e decoração procedural. Registrar campos duplicados (`content-catalog`, `medieval-furniture`, `object-catalog-seed`, overrides em `room_objects`) e escolher um ID canônico por modelo.
2. **Contrato v1 + validador:** formalizar os blocos acima em `object-catalog.mjs`; declarar versão de schema por template, capacidades de uso/superfície/interação e referências de assets. Incluir testes negativos (planta não senta; cama não apoia cama; árvore pode ser colhível sem confundir copa e colisor). Compatibilidade explícita para templates antigos e validação server-side obrigatória.
3. **Migração e catálogo:** versionar migration PostgreSQL/backfill idempotente; ligar móveis existentes a `templateId` canônico preservando IDs, donos, posições, rotação, `enabled`, `properties` e `roomSupport`. O conteúdo atual tem `object_templates`/`scene_objects`, mas o fluxo de quarto ainda valida `furnitureByKind` em código e salva por `furniture_id`; esta é a primeira fronteira a unificar. Seed só inicializa catálogo vazio; nunca substituir escolhas já salvas.
4. **Superfícies e placement:** substituir `stackable`/`supports.top` como regra isolada por surfaces e placement capabilities validados nos dois lados, iniciar com a allowlist da tabela acima e adicionar teste visual específico de cama/cama e mesa/planta. Preservar quarto vazio, 12 móveis, IDs e persistência ao migrar.
5. **Interações por família:** completar um caso de ponta a ponta por vez (sentar, deitar/coberta, abrir baú e retirar conteúdo, abrir geladeira/retirar item, estante/pegar livro, colher árvore). Em cada caso ligar affordance visual, servidor, estado/estoque/inventário, ACK, evento para observadores, animação e reconexão. Não cadastrar interação apenas como texto.
6. **Arquitetura e natureza:** trazer fachadas/pilares/bandeiras para famílias de construção/attachment com sockets e profundidade próprios; representar árvore colhível e planta colocada como instâncias persistentes; manter grama ornamental determinística e agregar persistência por região para mudanças em massa quando adequado. Validar custo de carga antes de persistir cada tufo.
7. **Validação e rollout:** testar desktop/celular, vazio/mobiliado, quatro direções, clique/toque, suporte inválido, sobreposição, ator usando objeto, dois observadores, persistência/reconexão, migração/backfill e conteúdo antigo. Só então ativar nova revisão no preview; manter export/rollback pelo histórico.

CMS/editor administrativo pode editar templates, imagens, categorias e revisões, mas não é uma segunda autoridade de simulação: regras de alcance, inventário, colisão, suporte e permissões rodam no servidor. A separação observada em projetos Nitro — metadados de furni, renderer por sprites/camadas e estado/ações do quarto no emulador — é uma inspiração arquitetural, não requisito de copiar classes ou protocolo.

## Catálogo medieval de móveis

`game/medieval-furniture.mjs` é a fonte comum dos 200 designs e das 20 categorias do editor. Cada design tem um ID estável, medidas, material, cores, colisão do servidor, interação, perfil de silhueta e quatro rotações-base. Quatro rotações não obrigam quatro geometrias distintas: formas assimétricas mantêm frente/fundo e lados identificáveis, enquanto peças modulares registram componentes próprios quando necessário. Uma coleção de divisórias, por exemplo, deve incluir segmentos retos e cantos com geometria e encaixe adequados; girar um segmento reto não substitui a peça de canto. Consulte [ISOMETRIC-DEPTH.md](ISOMETRIC-DEPTH.md#orientações-e-variantes-de-forma) para o contrato obrigatório. `database/catalog-updates/005-medieval-furniture-200.json` registra a inclusão na revisão 4. O editor filtra os 200 modelos pela categoria; ao colocar uma peça, o cliente envia somente seu ID e o servidor carrega as propriedades confiáveis do template PostgreSQL/Redis. As propriedades do modelo escolhido são guardadas junto ao móvel da conta para preservar aparência, uso, colisão e rotação ao reabrir o quarto.

As variações incluem formas de berço e tina, armações de trono, postes torneados, reforços forjados, lanternas, tochas, velas, candelabros e lustres. Os 200 modelos medievais agora são malhas Blender paramétricas por família e perfil, com UV por face e quatro renders ortográficos exportados ao atlas; a antiga geometria Canvas é fallback de compatibilidade. Não se devem cadastrar variantes apenas como nomes ou recolorações. Para uma nova silhueta, acrescente sua definição de malha no gerador `scripts/build-medieval-furniture-3d-atlas.py`, declare a geometria, colisor e ponto de apoio, reexporte e valide as quatro rotações antes de registrar o template no próximo arquivo numerado de `database/catalog-updates/`.

## O que pode mudar por dados

Cada construção é uma montagem. `building:lodging-ember-hotel`, por exemplo, contém `.../roof`, `.../wall-front`, `.../balcony`, `.../window-0` e plantas como `room:lodging-ember-hotel:lodging:owned`. Móveis fixos são filhos da planta. Cada peça pode receber propriedades próprias, herdar um modelo ou ser arquivada.

A posição das peças externas é relativa ao canto superior esquerdo da construção; interiores mantêm coordenadas locais do cômodo. Assim, uma cópia desloca fachada, porta, sacada, pilares e janelas sem deslocar as camas do seu interior. Cada cópia recebe IDs próprios. Os materiais/medidas do telhado estão no objeto `roof`; cores das paredes nos objetos `wall`; tamanho e posição dos imóveis no objeto `building`.

Altura, largura, profundidade, colisor, paleta e cores dos móveis, configuração do telhado, posição/medidas das janelas e propriedades adicionais são dados. `physics` define uma colisão estática autorizada pelo servidor: caixas usam proporções da largura e profundidade da peça; bancos e vasos usam círculos ajustados à base que toca o chão. O personagem colide com essa base, enquanto o editor mantém a área visual completa para impedir que móveis se atravessem. Móveis fixos e colocáveis leem o mesmo modelo. `depthOrder` usa o canto frontal do contato no chão e o nível de apoio para ordenar o desenho; ele mantém o pé do personagem e os pontos de contato alinhados depois de mover, girar ou empilhar uma peça. A grade decorável continua deliberadamente ancorada: não há gravidade ou atrito porque esses móveis não são objetos soltos.

`supports.top` define tamanho e tipos aceitos para empilhamento. `light` define altura, alcance, direção, intensidade e cor do emissor; `colors` permite ajustar as cores usadas pelo desenho. Banco, cadeira, luminária, cama, criado-mudo, guarda-roupa, estante, escrivaninha, mesa, sofá, baú e planta estão disponíveis no editor. Por padrão, plantas empilham em mesas, escrivaninhas, criados-mudos e baús.

Janelas alimentam também os emissores de luz. Pilares e móveis alimentam a colisão; tapetes, janelas e sacadas decorativas mantêm sua função atual. A sacada do hotel continua decorativa: este modelo não cria um pavimento caminhável novo.

A física usa a base da construção para o volume exterior e as peças com colisão para o interior. Remover um telhado não elimina o volume do prédio. Remover a montagem inteira elimina sua presença e suas peças. Não se pode remover a recepção inicial ou remover/mudar o tipo de um prédio com propriedade/reserva ativa. A validação recusa herança/hierarquia circular, IDs repetidos, construções sobrepostas, números inválidos e móveis bloqueando a chegada. Também protege móveis já salvos contra novas obstruções.

## Operação

```sh
npm run objects -- list
npm run objects -- export /caminho/catalogo.json
npm run objects -- validate /caminho/alteracao.json
npm run objects -- apply /caminho/alteracao.json
npm run objects -- history
```

A leitura e alteração são locais à VPS; clientes comuns não recebem uma API de edição. Os envelopes JSON de operação exigem a revisão que foi lida, mas as alterações validadas são gravadas no PostgreSQL e entram no histórico. Duas alterações simultâneas não sobrescrevem silenciosamente uma à outra: a segunda recebe conflito e deve ser revista.

Para alterar o modelo de todas as cadeiras fixas que não sobrescreveram essa propriedade:

```json
{
  "expectedRevision": 0,
  "actor": "dono",
  "operations": [
    {"action":"patch","collection":"templates","id":"fixture.chair","properties":{"height":2.3,"comfort":5}}
  ]
}
```

Para copiar uma estrutura completa, mantendo o original:

```json
{
  "expectedRevision": 1,
  "actor": "dono",
  "operations": [
    {"action":"copy","id":"building:lodging-rill-guesthouse","newId":"building:hospedaria-nova","buildingId":"hospedaria-nova","offset":{"x":100,"y":100},"properties":{"name":"Hospedaria Nova"}}
  ]
}
```

Para mudar uma peça específica e arquivar outra:

```json
{
  "expectedRevision": 2,
  "actor": "dono",
  "operations": [
    {"action":"patch","id":"building:lodging-ember-hotel/balcony","properties":{"bottom":11.0}},
    {"action":"archive","id":"building:lodging-ember-hotel/window-0"}
  ]
}
```

Para ajustar a luminária posicionável e o tampo de uma mesa no catálogo atual:

```json
{
  "expectedRevision": 2,
  "actor": "dono",
  "operations": [
    {"action":"patch","collection":"templates","id":"furniture.lamp","properties":{"palette":"pine","light":{"reach":6.0,"strength":0.85,"color":"#ffd89a","nx":0,"ny":0}}},
    {"action":"patch","collection":"templates","id":"furniture.table","properties":{"supports":{"top":{"width":1.3,"depth":0.8,"accepts":["plant"]}}}}
  ]
}
```

As medidas no último exemplo são locais à construção. A operação `put` cria/substitui uma instância ou modelo completo; use-a também para remover uma propriedade específica do conjunto de sobrescritas. `patch` combina objetos e substitui listas. `archive` preserva o registro e arquiva os descendentes da montagem. `restore` reativa um registro explícito; para recuperar uma montagem com a seleção exata de peças anterior, use o retrato no histórico e aplique uma operação revisada. Não há exclusão física automática.

Depois de salvar, o servidor busca a revisão nova, aplica-a e envia aos jogadores. O cliente limpa os caches de geometria/luz e atualiza o caminho por clique. Jogadores que ficariam dentro de um obstáculo são reposicionados no piso disponível; visitas num prédio removido retornam para fora. A falta do cache Redis de objetos permite reconstruí-lo pelo PostgreSQL; a coordenação de sessões Redis continua seguindo sua regra própria de disponibilidade.

Não altere JSONB diretamente sem atualizar a revisão e validar o catálogo. Use as operações acima para manter histórico, referências, concorrência e atualização de cache.

## Inicialização e evidências

`npm run objects:seed` faz um dump privado antes de aplicar migrações e inicializa o catálogo somente se ele ainda não existe. A migração 013 acrescenta as tabelas de objetos; a 014 mantém a persistência das luzes. Os testes de integração criam uma base separada e verificam cópia, herança, atributos adicionais, concorrência, arquivamento, cache e recuperação de cache inválido.

## Referências técnicas

- [Nitro Converter: `IFurnitureType`](https://github.com/billsonnn/nitro-converter/blob/main/src/common/mapping/json/furnituredata/IFurnitureType.ts): metadados de definição separados, incluindo tipo/categoria, dimensões, direção e capacidades distintas de ficar de pé, sentar ou deitar. Inspira os campos tipados, não o formato de armazenamento da Clareira.
- [Nitro Renderer: `FurnitureVisualizationData`](https://github.com/billsonnn/nitro-renderer/blob/main/src/nitro/room/object/visualization/furniture/FurnitureVisualizationData.ts) e [`RoomSpriteCanvas`](https://github.com/billsonnn/nitro-renderer/blob/main/src/room/renderer/RoomSpriteCanvas.ts): dados de orientação/visualização e ordenação das partes visíveis. Isso é apresentação do cliente; não substitui validação autoritativa.
- [Morningstar/Arcturus: `Room.java`](https://github.com/brenoepics/morningstar/blob/master/src/main/java/com/eu/habbo/habbohotel/rooms/Room.java): o emulador mantém altura e estado dos tiles e consulta os flags de uso do móvel para resolver posição/pose do avatar e colocação. Adotamos o princípio de estado espacial no servidor, não as classes Java, o protocolo nem limites específicos do Habbo.

CMS e ferramentas administrativas são úteis para editar e organizar modelos/assets. Para definir alcance, colisão, permissão, transações de inventário e regras de apoio, a fonte de aprendizado é o emulador/servidor e o contrato de dados que o cliente Nitro consome; a interface CMS não deve ser tratada como motor de jogo ou fonte concorrente de verdade.
