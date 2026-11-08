# Padrão de conteúdo da Clareira — versão 1

PostgreSQL é a fonte de verdade dos dados persistentes do jogo, incluindo instâncias e o catálogo versionado de construções/objetos. `game/content-catalog.mjs` descreve tipos, regras e renderizadores implementados; `game/content-assets.mjs` lista arquivos por cena. Estado transitório da simulação pertence à memória do servidor, não ao catálogo nem a arquivos JSON. IDs permanecem estáveis mesmo quando o nome muda. Não renomear `kind` em dados persistidos sem migração.

O inventário cartográfico atual, com esboços superiores, recursos, construções e relevo das dimensões, está em [DIMENSION-MAPS.md](DIMENSION-MAPS.md).

O plano do editor cartográfico, sandbox privado, territórios com camadas e promoção controlada para o mundo publicado está em [SANDBOX-AND-WORLD-EDITOR-PLAN.md](../SANDBOX-AND-WORLD-EDITOR-PLAN.md). Ele distingue ferramentas de autoria das regras e simulação já implementadas.

## Padrões obrigatórios de representação do mundo

Alterações de dimensão, chunk, animação, efeito ou distribuição de simulação devem cumprir [Regras de runtime e apresentação](../SCENE-RUNTIME-RULES.md). Chunk lógico, bloco visual e região autoritativa são conceitos diferentes; a matriz do contrato explicita o que ainda precisa de implementação e testes.


Toda criação ou revisão de arte, renderização, rotação, apoio, seleção espacial e interação do mundo deve seguir:

- [UV-MATERIALS.md](UV-MATERIALS.md): materiais por face, atlas, coordenadas locais, exportação e revisão das texturas.
- [BLENDER-ASSET-WORKFLOW.md](BLENDER-ASSET-WORKFLOW.md): etapas obrigatórias de referência, forma, modelagem, UV, exportação e validação para construções, móveis, vegetação e props autorados em Blender; inclui a skill local e os comandos reproduzíveis da cabana.
- [ISOMETRIC-DEPTH.md](ISOMETRIC-DEPTH.md): profundidade, camadas por direção, oclusão, altura/apoio físico e validação; inclui a correção da cama e os princípios do Nitro que são obrigatórios, adaptados ao Canvas 2D da Clareira.
- [RECEPTION-ART-DIRECTION.md](RECEPTION-ART-DIRECTION.md): composição da recepção pública, referências dos móveis medievais, calibração do atlas e roteiro de validação.
- [NITRO-ROOM-ARCHITECTURE.md](NITRO-ROOM-ARCHITECTURE.md): estrutura de quarto, paredes/piso, colocação e apoio de móveis, personagem, movimento, assets e os limites entre cliente e servidor. Obrigatório quando qualquer uma dessas áreas for alterada.

Esses documentos são as fontes canônicas dessas regras. Aplicam-se a móveis, personagens, construções, vegetação, terreno, equipamentos e efeitos conforme o tipo de superfície. Elementos existentes são adequados ao serem revisados; pendências de migração devem ser declaradas. A leitura desses padrões integra o passo de implementação de “Como adicionar algo” abaixo.

Locais com atendimento e novos painéis também seguem [o padrão de interação e navegação](../INTERACTION-PANELS.md). As políticas de ponto/serviço referenciam os lugares existentes; não substituem o catálogo, a planta física ou a persistência.

## Organização

| Categoria | Responsabilidade | Estado atual |
|---|---|---|
| world | Agrupa localidades e estilo | Clareira |
| dimension | Agrupa mundos; futura regra de viagem | Superfície é classificação; portais não implementados |
| place | Nome, cena, referências, terreno | Bosque das Brasas e quarto |
| object | Cenário, colisão e interação | Árvores, troncos, cabana, fogo |
| furniture | Peça posicionável, rotações, colisão | Banco (`stool`), cadeira (`chair`) e luminária (`lamp`) |
| mob | Criatura, IA, atributos e ações | Reservado; nenhum mob implementado |
| item | Recurso/equipamento, tipo e desenho | Galhos, pedras, frutinhas |
| material | Paleta e tratamento de superfície | Madeira, pedra, tecido, grama, água |
| animation | Ações, direções e relógio | Personagem e chama |
| style | Projeção, linguagem visual | Clareira isométrica |

`status: planned` descreve um projeto e nunca libera conteúdo jogável automaticamente. Adicionar uma definição não cria uma IA, renderer, interação ou portal. Esses comportamentos precisam de implementação e validação.

## Contrato obrigatório

`id`: categoria.nome-em-minusculas; `category`: uma categoria da tabela; `version`: 1 (schema); `label`: nome legível; `status`: implemented/planned; `refs`: IDs válidos. Campos complementares documentados nas definições existentes: `scene`, `kind`, `renderer`, `physics`, `rotations`, `directions`, `clock`, `actions`, `terrain`, `palette`, `projection`.

Iluminação, componentes externos e móveis utilizáveis seguem [o contrato específico](LIGHTING-AND-FURNITURE.md).

As definições atuais usam renderers procedurais já existentes. Não há resolução dinâmica de código por nomes externos. Um novo banco com outro tamanho exige adaptar colocação, colisão, desenho e save antes de marcá-lo implementado: a física de móveis atual compartilha o raio do banco e não suporta tamanhos heterogêneos.

## Arte e animação

- Projeção base: 8 pixels em X, 4,5 em Y; altura usa `HEIGHT_PIXELS` em elevation.mjs. Posição física em unidades do mundo, não pixels da tela. Uma unidade não representa uma altura humana real.
- Pixel art original, mesma escala de pixel, paleta em theme.mjs, materiais em materials.mjs. Madeira com fibras e volume; pedra com blocos; troncos cilíndricos com casca e anéis. Evitar ruído solto e detalhes em escalas incompatíveis.
- Pivô do personagem nos pés; pivô de objetos no contato com o chão. Desenho não altera caixa física. Oclusão/ordem seguem profundidade e elevação.
- Personagem modular: pele, cabelo, corpo, roupa e mãos acompanham o mesmo rig e pivô. Oito direções; rosto aparece nas direções em que é visível. Ações com entrada, execução e saída; caminhada sincronizada com distância real; correr não acelera todos os gestos indiscriminadamente.
- Atlas de sprites: PNG/WebP com transparência, frames do mesmo tamanho/pivô, direções e estados declarados; animações incluem intervalo explícito em milissegundos e loop/transição. GIF serve como revisão. Móveis já usam atlas PNG por direção; personagens mantêm seu renderer Canvas atual. O contrato de materiais e UV fica em [UV-MATERIALS.md](UV-MATERIALS.md).
- Luz física do cenário separada da cor-base; chama varia intensidade e alcance; sombra acompanha fontes. Exterior usa terreno contínuo natural; escadas somente onde construídas. Nada de inventar rampa ou escada para demonstrar relevo.
- Sons futuros: efeitos curtos OGG/MP3 com volume por categoria, distância e limite de vozes. Áudio exige gesto do usuário e falha sem impedir entrada.

## Arquivos e carregamento

Registrar `id`, `scene`, `url` relativo a game/, `version`, `critical`, `maxBytes`. Usar nomes com versão, exemplo `art/arvore-carvalho-v1.webp`; ao trocar bytes, trocar nome/versão para cache HTTP não devolver arte antiga. Sem URLs externas em conteúdo essencial.

No preview, arquivos estáticos usam ETag e revalidação HTTP (`max-age=0, must-revalidate`); `/update-version` e `/game-assets` não usam cache. A página detecta uma versão estável e recarrega quando o jogador pode aplicar a atualização. O manifesto baixa quase todos os arquivos públicos de runtime na abertura; `scene: 'clearing'` identifica recursos compartilhados e `scene: 'dimension:<id>'` identifica recursos exclusivos. O cache verificado em disco é global ao jogo. Recursos estáticos reutilizáveis são preparados no carregamento inicial; referências decodificadas em memória seguem o orçamento e o contrato obrigatório de transições abaixo.

### Regra de atualização e cache para conteúdo novo

Assets de cada objeto, personagem, efeito ou animação devem ser declarados no manifesto da cena, com versão/identificador atualizado quando os bytes mudarem. Módulos de runtime entram na versão do jogo e devem revalidar via HTTP. Reutilizar atlas e arquivos compartilhados; enviar pela rede o estado compacto necessário, não imagens ou quadros repetidos. O loading baixa e confere quase todos os arquivos públicos antes de liberar o mundo; em mudança de cena, decodificar/preparar da memória apenas os recursos daquela cena antes do primeiro desenho.

Em cada inicialização, o bootstrap registra o service worker, consulta `/game-assets` e prepara o cache versionado enquanto a tela de carregamento permanece visível. O manifesto cobre os arquivos públicos de runtime; arquivos de fonte, revisão, variantes legadas não usadas e testes são excluídos. Para cada arquivo, o cliente confere tamanho e SHA-256. Reutiliza arquivos da versão anterior somente quando o hash confere; os demais são baixados ignorando o cache HTTP e conferidos antes de serem guardados. As requisições começam em ordem decrescente de tamanho: arquivos pesados iniciam primeiro, e os menores só entram na fila depois que os maiores já começaram; há até 16 downloads concorrentes. O progresso usa os bytes transferidos ou conferidos, além da contagem de arquivos, para que uma imagem grande não deixe a porcentagem aparentemente parada. Depois confere o pacote inteiro, troca a versão ativa, apaga os caches antigos do jogo e confirma que não restaram. Se algum download falhar, mantém ativa a versão anterior e oferece nova tentativa. Se a limpeza falhar, o pacote novo já conferido permanece intacto, mas o jogo espera nova tentativa confirmar a remoção antes de prosseguir. Depois de uma atualização confirmada, reinicia uma vez para carregar os módulos da versão nova.

Não reduzir a quantidade de quadros de uma animação para economizar download sem validar a cadência visual resultante no jogo. Se a redução deixar o movimento menos fluido, manter a versão original ou adotar interpolação e medir o custo de renderização antes de substituir os assets.

Essa limpeza cobre somente Cache Storage pertencente ao jogo. Um site não pode apagar todo o cache HTTP nem outros arquivos do computador; URLs versionadas e revalidação HTTP mantêm os arquivos públicos atualizados. Saves, sessão, conta e preferências ficam intactos. O navegador recebe código e imagens legíveis após o download: HTTPS protege o transporte, mas criptografia com chave incluída no próprio cliente não mantém esses arquivos secretos. Não incluir chaves, credenciais ou dados privados em módulos/artefatos públicos; arquivos de edição e revisão ficam fora do diretório servido.

**Estado atual:** o preview publica um manifesto com hashes SHA-256 e revalida arquivos estáticos via ETag. `game/cache-update.mjs` sincroniza os arquivos e confirma a limpeza; `game/service-worker.js` serve a versão conferida. O monitor espera um momento seguro para atualizar durante a partida, e o bootstrap baixa/verifica antes de abrir o jogo após reiniciar.

O download usa o caminho `__clareira_versioned_assets__/<versão>/<arquivo>` até o servidor; isso também funciona com service workers anteriores que removiam parâmetros de consulta. O servidor entrega os bytes do snapshot que originou o manifesto, mesmo se o checkout mudar durante a transferência; uma versão expirada responde 409 e exige nova consulta. Snapshots compartilham blobs por hash, têm limite de memória de 64 MiB e retêm até 16 versões; acessos renovam a retenção por 15 minutos, e a versão corrente permanece disponível. Nunca comparar um manifesto antigo com os arquivos mutáveis da árvore de trabalho.

O pacote inicial inclui os atlas e as camadas usados pelo renderer; renders individuais de móveis, pranchas de revisão, conceitos e fontes Blender ficam fora dele. Na verificação do cache, o avanço representa arquivos conferidos; no download, representa bytes recebidos. Operações sem resposta por 30 segundos falham com contexto do arquivo, preservando a versão anterior. Uma transferência que continua recebendo dados renova esse prazo. Sem conexão, o carregador permanece visível e retoma quando o navegador informa o retorno da rede.

A auditoria do fluxo de atualização e a proposta do modo operacional de manutenção estão em [atualizacao-e-manutencao.md](../audits/atualizacao-e-manutencao.md). Atualização de versão e manutenção são fluxos distintos: a primeira troca arquivos verificados; a segunda controla admissão, aviso e indisponibilidade do serviço.

A ilustração raster da tela de entrada permanece servida como arte decorativa, mas fica fora do manifesto de cache verificado para não atrasar a liberação do formulário. Preferir módulos procedurais e atlas pequenos/reutilizados; novos orçamentos devem vir de medidas desktop e celular. Inventariar soma de bytes, memória decodificada (aproximadamente largura × altura × 4), número de frames e vozes antes de aprovar pacotes grandes. WebP pequeno em disco pode ser caro em memória.

O loader recebe somente a cena solicitada, compartilha pedidos iguais e guarda até 16 promessas/referências recentes. Falha remove a entrada para permitir nova tentativa. Arquivo crítico rejeita a prontidão; opcional devolve fallback e informa sua conclusão. Cache limitado não garante descarte imediato pela engine do navegador; renderer deve liberar suas referências ao sair. Cenas combinam desenho procedural e assets raster declarados no pacote, incluindo o atlas de móveis; preparar os recursos usados antes de revelar a cena.

O loader não deve usar progresso falso. A porcentagem soma tarefas reais de assets, avatar idle, fontes, terreno e elementos visíveis; enquanto o total de trabalho ainda é desconhecido, mostra atividade sem percentual. A cena só aparece após estado autoritativo da chegada, preparação do avatar, recursos críticos do entorno e primeiro desenho. Em transições, não aguarde o pacote inteiro nem terreno distante; aplique a regra obrigatória abaixo. O manifesto não faz import automático de renderer ou áudio: implementar adaptadores ao adicionar esses tipos.

### Preparação de cenas e transições (obrigatório)

Zoom, efeitos e transições também cumprem [o padrão obrigatório de desempenho](../PERFORMANCE-STANDARD.md), incluindo trabalho incremental, cache global limitado, reutilização ao retornar e cenários de aceite antes/depois.

Esta regra vale para qualquer entrada, saída ou teleporte entre quartos, casas, dimensões e outras cenas. A finalidade é deixar o primeiro uso de conteúdo visual previsível e manter a viagem responsiva sem enfraquecer a autoridade do servidor.

- **Prepare uma vez:** antes do primeiro tutorial, baixe/confira o pacote e decodifique os atlas de móveis, os efeitos completos de teleporte e os temas visuais de todas as dimensões disponíveis. Cada grupo real de trabalho aparece no progresso; o primeiro formulário tutorial não aparece antes de o aquecimento terminar, mesmo que isso aumente a duração e a porcentagem total. Ao sair do tutorial e entrar no Bosque das Brasas, aqueça também todos os chunks de terreno/vegetação visíveis do destino sob a cobertura da transição. Prepare os sprites de repouso do elenco de NPCs do bosque antes da revelação; não carregue folhas de caminhada/corrida que esses atores estáticos não usam. Faça esse preparo em paralelo com avatar, terreno e cena. Reutilize a mesma definição visual para todas as instâncias. Respeite o orçamento de memória: retenha recursos compartilhados; descarte referências de cenas distantes depois do aquecimento, preservando o cache baixado para evitar novo download.
- **Envie estado, não arte:** ao entrar ou teleportar, o servidor continua como fonte da verdade e envia a identificação/revisão da cena, posição de chegada e o estado dinâmico necessário do entorno próximo. Para quartos, isso inclui IDs dos objetos e transformações (posição/rotação), estados interativos (por exemplo, vela acesa/apagada) e fontes de luz ativas. Para dimensões, inclui definição/revisão do mundo e entidades próximas; iluminação estática vem do tema preparado, enquanto fontes dinâmicas e seus estados vêm da simulação. Não transmita bitmaps, modelos completos ou coleções distantes junto do teleporte.
- **Monte durante a cobertura:** ao receber a confirmação e o snapshot autoritativo, posicione os recursos já preparados e aqueça terreno/geometria do entorno em paralelo à transição visual. Revele o destino quando posição, estado autoritativo, avatar, recursos realmente críticos e primeiro quadro estiverem prontos. Conteúdo distante deve ser preparado depois, de forma incremental. Um asset crítico ainda ausente pode bloquear a revelação; trabalho de terreno ou entidades fora do entorno inicial não deve bloquear a viagem.
- **Prediga com reconciliação:** ações de baixa latência podem atualizar a apresentação localmente enquanto aguardam resposta, usando sequência/revisão para associar a confirmação. O servidor valida permissões, colisões, inventário e persistência; em rejeição, o cliente reconcilia com o snapshot autoritativo e reverte o efeito previsto. Para teleporte, a cortina pode começar localmente, mas o destino só é apresentado após confirmação do servidor.
- **Recupere por etapa:** sessão, snapshot completo, posição/predição, assets críticos e primeiro quadro correto continuam obrigatórios. Fontes do navegador usam fallback após 3 s; mapas de luz têm preparo inicial limitado a 1,5 s e continuam na fila incremental. Cada preparação de asset do catálogo de cenas tem prazo de 15 s, cancela a requisição quando possível e libera o slot da fila; falhas críticas entram na nova tentativa sem serem marcadas como sucesso. Após 30 s sem avanço numa etapa conhecida, mostrar o nome real e oferecer tentar a etapa novamente, preservando sessão e cache; não recarregar a página automaticamente. Callbacks de gerações antigas não podem revelar outra cena. Áudio indisponível não impede autenticação/entrada.
- **Valide a regra:** cubra primeira entrada com tutorial, passagem do tutorial ao Bosque, móveis com atlas prontos, ida e volta em desktop/celular, uma cena vazia e outra com muitos objetos, falha/rejeição e estado dinâmico (luz/objeto). Registre separadamente tempo até a confirmação, tempo até o primeiro quadro, bytes enviados e assets aquecidos. Verifique que trocar de cena não baixa novamente arte já preparada nem revela posição/estado não confirmados.

Qualquer mudança que faça uma transição esperar novamente por download ou geração completa do mundo deve justificar a necessidade (por exemplo, recurso realmente crítico) e atualizar este contrato junto com a validação.

## VPS e cliente

VPS: colisões, elevação, regras, coleta, inventário, permissões, persistência e futura IA. Cliente: desenho, luz, partículas, som, rig e interpolação; predição usa as mesmas regras compartilhadas. Não mandar frames de imagem pela rede nem confiar no cliente para conceder itens. Preservar snapshots compactos, descarte por backpressure, culling e cache de geometria já existentes.

Movimento remoto é enviado em snapshots compactos, com frequência nominal de 20 Hz; a física autoritativa continua em 30 Hz e o cliente interpola os jogadores remotos. Metadados públicos dos jogadores são repetidos quando há mudança na área visível, mudança de perfil ou atualização completa; snapshots estáveis omitem esses campos, e cada grupo de área usa uma assinatura compartilhada para detectar alterações sem comparar mapas inteiros por socket. Dados privados do jogador são reavaliados a cada 500 ms ou imediatamente em snapshots completos; os pacotes que não mudaram não repetem esses dados. Recursos, móveis e definição do mundo só entram nos pacotes quando há um broadcast de estado ou, para reconciliação, a cada 5 segundos. Entradas previstas localmente seguem sequenciadas e são agrupadas em pares para reduzir mensagens de subida sem reduzir os passos simulados; ações interativas descarregam a fila antes de serem enviadas. A compressão WebSocket pode ser habilitada com `WEBSOCKET_COMPRESSION=1`; os snapshots de movimento também podem ser comprimidos com `WEBSOCKET_COMPRESS_MOVEMENT=1`. A compressão reduziu o volume de rede no benchmark local, mas permanece opt-in porque o teste de integração de inventário expira com compressão habilitada. `scripts/scale-baseline.mjs` mede bytes reais no socket, mensagens, CPU, memória e atraso do event loop; use `BENCHMARK_WS_COMPRESSION=1 BENCHMARK_COMPRESS_MOVEMENT=1` para o cenário comprimido.

## Como adicionar algo

1. Copiar `template.json`, escolher ID estável, categoria e referências; começar com planned. Este arquivo é exemplo, não é importado pelo jogo.
2. Inserir definição no catálogo. Implementar renderer/ações e física compartilhada; registrar serialização/migração se necessário. Nunca reutilizar ID removido para outro objeto.
3. Registrar arquivos no manifesto apenas nas cenas que os usam; arquivos compartilhados usam mesma URL/versão para deduplicação. Adaptar loader para som/atlas antes de usá-los e garantir que os recursos críticos sejam preparados na tela de carregamento antes do primeiro uso.
4. Rodar `npm run content:check` e testes dos riscos (colisão, permissão, save, direção ou prontidão). O checker valida IDs/referências/schema, caminhos locais, presença, tamanho de arquivo e alinhamento da imagem de login com HTML; não certifica qualidade artística ou funcionalidade do renderer.
5. Testar /dev/ no computador e celular, conexão lenta, falha de asset e reconexão. Comparar imagem e memória/custo de desenho antes/depois. Só então marcar implemented e entregar.

Novos mobs/mundos/dimensões exigem uma fatia jogável separada. Personalização futura de altura e músculos deve respeitar o rig e validar limites no servidor. O padrão prepara esse trabalho sem fingir que já está disponível.

## Ficha visual para novos assets (anexar à definição planejada)

| Campo | Padrão |
|---|---|
| dimensions | largura/altura originais em pixels; escala inteira de apresentação |
| pivot | coordenadas X/Y do ponto de contato; igual em todos os frames |
| layers | corpo, roupa, cabelo, mão traseira/frontal; ordem por direção |
| bounds | área visível separada da colisão no chão |
| animation | ação, direção, duração de cada frame, loop e transição |
| events | contato do pé, pegar/soltar; efeitos locais, resultado validado pelo servidor |
| lighting | emissivo ou material que recebe luz; raio/intensidade para fonte |
| variants | materiais/paletas compatíveis; não duplicar atlas só para mudar cor |
| source | arquivo editável, autoria/licença e versão; referência visual não concede licença |

Essa ficha é o contrato de autoria para assets novos e revisões, incluindo sprites já usados pelos móveis e personagens desenhados em Canvas. Alterações de schema ou saves devem ter migração explícita e teste de leitura da versão anterior. Nunca trocar silenciosamente o significado de um campo existente.

### Colisão e postura no runtime atual

A área em chamas usa raio 0,65 do mundo; o raio do personagem é somado na colisão. Fogueiras dinâmicas entram no servidor, na predição/reconciliação e na rota por clique. Quem cria uma fogueira na própria posição pode sair, sem entrar mais fundo; destinos da rota ficam fora da área bloqueada. Os valores vêm do catálogo, via obstacle-collision.mjs.

Tronco usa cápsula no chão (meio comprimento 1,3, raio 0,24). Seu desenho é composto por cinco faixas em ordem de profundidade, compartilhando um único bitmap; cache de troncos limitado a quatro imagens, separado das oito entradas de geometria. Sombra de contato/cast fica fora do cache para acompanhar as luzes.

Postura `sitting` é independente do gesto temporário. Aceno preserva o assento; dança e novo movimento fazem levantar. Comandos anteriores ao pedido de sentar não o cancelam; a confirmação mantém a sequência dos passos simulados. Não inferir postura apenas pelo último nome de emote nem substituir essa regra por mudança de posição no renderer.

## Construções e interiores

As medidas compartilhadas, circulação, encaixe de móveis, janelas e rotação no piso seguem [BUILDING-STANDARD.md](BUILDING-STANDARD.md), com regras usadas por `game/building-standard.mjs`. As identidades regionais seguem [REGIONAL-ARCHITECTURE.md](REGIONAL-ARCHITECTURE.md). Preservar IDs e posições salvas; renderer e colisão partem da mesma base de largura/profundidade.

Construções e suas peças são montagens versionadas no PostgreSQL, com cache Redis e modelos reutilizáveis. Para adicionar, alterar, arquivar ou copiar objetos e propriedades, siga [SCENE-OBJECTS.md](SCENE-OBJECTS.md). As definições iniciais em código somente inicializam uma base vazia.
