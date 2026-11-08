# Regras de dimensões, chunks, simulação e apresentação

Versão 1, 29/10/2026. Contrato para novas implementações e revisões. **Regra definida não significa funcionalidade implementada.** A matriz final distingue cobertura existente de requisitos futuros. Complementa o plano de separação de processos; não substitui contratos de objetos, profundidade, UV ou desempenho.

## 1. Hierarquia e identidade

- **Mundo:** namespace persistente, não um processo.
- **Dimensão:** conteúdo, seed, regras e tema. Seu identificador faz parte de qualquer endereço espacial.
- **Localidade:** exterior, edifício ou destino lógico dentro da dimensão.
- **Instância:** uma execução de um espaço, com identidade estável e um único dono autoritativo. Pessoas no mesmo espaço compartilhado precisam usar a mesma instância. Cópias privadas são instâncias explicitamente diferentes.
- **Região de simulação:** partição futura de um exterior; reúne área suficiente para física/interações. Uma dimensão não exige um processo exclusivo e uma região não é um chunk gráfico.
- **Chunk:** unidade de índice, geração, carregamento ou cache. Especificar qual tipo antes de usar suas coordenadas.
- **Entidade/objeto:** identidade estável, transformação física e estado funcional. Sprite, camada, sombra e efeito são representações, não novas cópias da entidade.

Endereçamento conceitual: `(worldId, dimensionId, instanceId[, regionId])`. Endereço de chunk acrescenta `(chunkKind, chunkSize, chunkX, chunkY, generationVersion)`. Contextos atuais de `playerContextId()` têm de ser mapeados explicitamente; não há migração automática desse formato nesta documentação.

Uma instância pode estar atribuída a um processo que também possui outros espaços. Somente um processo pode aceitar mutações de uma mesma instância/região em uma versão de autoridade. Estado de banco e lease de sessão não substituem esse contrato.

## 2. Chunks e coordenadas

### Estado atual confirmado

| Tipo | Tamanho atual | Uso |
| --- | --- | --- |
| Chunk lógico de mundo | 16×16 unidades | Índices/geração em `world-chunks.mjs`; cache padrão de 96 entradas |
| Bloco visual do terreno | 8×8 tiles | Raster/preparo em `scene-art.mjs`; limite adaptativo 128–160 imagens |
| Região autoritativa distribuída | Ainda não existe | Não inferir seu tamanho dos dois anteriores |

Para cada tamanho S: `cx=floor(x/S)`, `cy=floor(y/S)`, coordenada local `x-cx*S`, `y-cy*S`. Usar piso, não truncamento; validar/clamp do mundo finito ocorre separadamente. No mundo atual, tiles e unidades de posição compartilham a referência usada nesses módulos; uma futura mudança de escala exige conversão explícita.

Exemplo: x=15,9 pertence ao chunk lógico 0 e bloco visual 1; x=16 pertence ao lógico 1 e visual 2. Não comparar índices dos dois tipos como se identificassem a mesma área.

### Regras de carregamento e cache

1. Gerar base de forma determinística por dimensão, seed e versão; sobrepor alterações persistentes do banco. Salvar apenas delta não autoriza perder o estado de um objeto alterado.
2. Chave de cache inclui contexto/revisão de geometria e parâmetros necessários ao resultado. Mudança de seed/dimensão/catálogo relevante não pode reutilizar arte ou colisão incompatível. Cooldown/progresso que não altera geometria não deve invalidá-la inteira.
3. Visível tem prioridade, direção provável de movimento vem depois, área distante é adiável. Filas e memória têm limites explícitos e métricas; cancelar trabalhos obsoletos ao mudar contexto.
4. Preparar terreno/arte incrementalmente fora do caminho crítico de desenho. Não gerar chunk visual inteiro dentro de uma consulta fria de colisão. Consulta física e geração visual compartilham a regra de existência dos obstáculos.
5. Não desenhar bloco raster incompleto. Primeira entrada/troca/zoom que amplia a visão espera seu conjunto crítico ou mantém o estado visual anterior válido. A caminhada normal deve antecipar os blocos próximos; falta de cache não autoriza suspender o jogador sem um estado de recuperação explícito.
6. Uma entidade que cruza vários chunks mantém um ID e um dono. Índices podem referenciá-la em várias células; consultas deduplicam antes de aplicar dano, coleta ou desenho.
7. Ordenação de profundidade usa a cena e os volumes/âncoras, não a ordem de chunks. Copa, telhado, sombra e objeto alto não podem ser cortados na borda de um bloco.
8. Cache visual descarregado não apaga estado durável, colisão, item ou propriedade. Suspensão de simulação é outra operação, com regras próprias.

Não fixar 16 ou 8 como tamanho da futura região de simulação. Escolher tamanho por custo, densidade, velocidade e alcance; a primeira distribuição mantém o exterior em uma autoridade e distribui interiores/dimensões independentes.

## 3. Física, autoridade e fronteiras

- Movimento, colisão, suporte, empilhamento, propriedade, coleta e interação funcional são decididos pelo servidor. Cliente prevê movimento próprio e reconcilia confirmações; não determina resultado econômico ou posse.
- O passo atual de física é 1/60 s; snapshots têm alvo de 50 ms (20 Hz). O callback do timer e FPS da tela não são a frequência lógica. Preservar acumulador limitado e tempo fracionário; não aumentar snapshots para esconder tick lento.
- AOI seleciona dados relevantes ao jogador; não altera se um objeto sólido existe nem autoriza duplicar a simulação.
- Antes de distribuir regiões externas, definir halo de consulta, dono de cada entidade e protocolo para interações entre fronteiras. Entidades espelhadas são leitura; apenas o dono aplica efeitos persistentes.
- Dimensionar halo pelo maior alcance físico/interativo e deslocamento relativo durante o prazo máximo de transferência: conservadoramente `H >= Dmax + VrelMax*Tmax`. Dmax inclui raios/volumes e alcance aplicável. Esse limite é físico, distinto da margem visual. Alcances especiais/projéteis precisam de política explícita.
- Movimento não transfere autoridade porque uma copa, sprite ou sombra atravessou a borda. Usar a referência física definida para a entidade e uma transição idempotente.
- Falha/expiração exige versão de autoridade (fencing), não apenas TTL. Nunca executar duas simulações graváveis como redundância.

Aplicar também `content/SCENE-OBJECTS.md`, `content/ISOMETRIC-DEPTH.md` e as regras de física/apoio existentes. Distribuição de servidores não pode alterar o encaixe da cama, cobertura do personagem ou profundidade de paredes.

Altitudes, colisão de voo e combate vertical seguem o contrato planejado em [ALTITUDE-VOO-E-COMBATE.md](ALTITUDE-VOO-E-COMBATE.md). O `z` de salto atual não valida sobrevoo de árvores ou casas; a implementação futura precisa de volumes e testes próprios.

## 4. Animação, estados e arte

| O servidor decide | O cliente apresenta |
| --- | --- |
| Posição, orientação funcional, velocidade, ação válida e ocupação de móvel | Frame, pose interpolada, marcha e orientação visual compatível |
| Início/fim/cancelamento de ações, consumo, cooldown e resultado | Transições de pose, partículas, brilho e sons permitidos |
| Estado da porta, lareira, ducha, fonte de luz e objeto | Abertura/fechamento, chama, água, luz e sombras |

1. Não enviar PNG/frame por WebSocket. Transmitir estado/ação e tempo no domínio de relógio acordado; usar asset versionado já preparado no cliente.
2. Marcha acompanha distância percorrida e perfil de animação; efeitos temporais usam tempo decorrido. Não avançar ação por quantidade de quadros renderizados nem mudar velocidade física com FPS.
3. Estado longo deve ser reconstruível pelo snapshot: sentado, deitado, porta aberta, fogo aceso. Um evento efêmero perdido numa reconexão não pode deixar o objeto permanentemente errado.
4. Eventos de ação têm identidade/geração suficientes para deduplicação; repetir evento não repete recompensa, cobrança, áudio ou partículas de impacto indiscriminadamente.
5. Offscreen ou baixa qualidade pode reduzir trabalho de apresentação, mas não parar cooldown, ação funcional ou relógio. Ao voltar à visão, apresentar a fase coerente com o estado atual; não executar todos os frames perdidos.
6. Respeitar movimento reduzido sem alterar resultado físico/econômico. Corrida, parada, inversão, sentar, deitar, uso e cancelamento precisam funcionar em diferentes FPS.
7. Preservar oito direções do personagem e as vistas aprovadas dos objetos. Quatro direções de móvel não tornam todos os formatos simples rotações: quinas/divisórias e variantes arquitetônicas podem precisar de geometria própria.
8. Modelos 3D+UV são fonte de produção das artes aprovadas, não uma migração implícita do runtime Canvas para 3D. Validar vistas, pivô, escala, volumes e camadas no pipeline existente.
9. Aparência/atlas/cache não altera hitbox por conveniência visual. Mudança de volume físico precisa ser uma propriedade validada e compartilhada.
10. Asset concluído não dispara redesenho completo síncrono do mundo quando o RAF já renderiza a cena no próximo quadro. Preparação inicial e revelação continuam com seu primeiro desenho confirmado.

## 5. Luz, sombras, efeitos e som

- Fonte funcional pertence ao estado do objeto/ambiente; renderização é local. Luz acesa não pode ser inventada para compensar perda de estado.
- Dia/noite usa tempo ambiental coerente; não usar número de frames. Relógio UTC de vencimentos não substitui o relógio monotônico de animação.
- Mapas de luz, superfícies e geometria estática usam cache versionado, filas e orçamento. Não reconstruir tudo no mesmo quadro por mudança pequena de intensidade.
- Qualidade adaptativa pode reduzir frequência/densidade de efeitos decorativos. Não remover colisão, objeto interativo, sinalização essencial ou fonte funcional, nem clarear artificialmente todo o mundo.
- Sombra e camadas seguem altura/volume e ordem de profundidade compartilhadas. Um efeito precisa ter alcance, duração e quantidade limitada; parar emissor/áudio ao sair do contexto.
- Transferência/carga mantém cobertura limpa e entrada bloqueada até o destino estar pronto; não renderizar efeitos do local antigo sobre a tela de cobertura.

## 6. Troca de contexto e recuperação

Porta, teleporte e futura troca de processo seguem o mesmo contrato de preparação: validar destino → cobrir/bloquear → resolver ações pendentes → preparar destino → confirmar snapshot e geração → primeiro desenho → revelar/desbloquear.

Não limpar inventário/sessão/cache válido como tentativa de recuperação. Não reaplicar comandos da cena antiga no destino. No multiprocesso, acrescentar reserva, fencing, registro idempotente de transferência e sincronização de relógios do plano principal.

`performance.now()` bruto de dois processos não pode ser comparado diretamente. Antes de ativar gateway/simulações separados, comprovar conversão de domínio temporal, reset de amostras e comportamento de interpolação/teleporte após reinício.

## 7. Critérios verificáveis

| Regra | Evidência exigida | Situação desta revisão |
| --- | --- | --- |
| Separar chunk lógico/visual | Constantes, exemplos de borda e conversão por tamanho | Conferido no código; 16 e 8 não são uma região distribuída |
| Colisão fria igual à visual | Seeds/dimensões/raios/água/bordas e árvore removida | Cobertura existente executada nesta revisão |
| Cache/preparo limitado e primeiro quadro | Testes de loading, zoom, prazo e falha | Parcial: loading/zoom executados; limites globais e aparelho físico exigem ensaio próprio |
| Profundidade e partes UV | Testes de ordem/projeção existentes | Cobertura executada; não é nova aprovação visual de todos os assets |
| Animação por distância/estado | Avatar, frames e preload | Cobertura existente executada; novos assets exigem captura própria |
| Passo de física e snapshots | Orçamento temporal e stream | Cobertura existente executada; Hz nominal não prova capacidade |
| Um dono distribuído, fencing, halo e passagem entre processos | Integrações de split-brain, retry, crash e fronteira | **Não implementado/não validado** |
| Relógio coerente entre processos | Desvio, ressincronização, eventos e teleporte em dois processos | **Não implementado/não validado** |
| Ganho de FPS/ping com distribuição | Baseline comparável, carga concentrada/distribuída e aparelho real | **Não medido**; não prometer ganho |

Para qualquer nova extração, registrar versão, cenário, resultado, falhas e rollback. Aprovação funcional não substitui avaliação visual nem resultado de performance. Escassez de evidência deve permanecer marcada como pendência, sem transformar plano em implementação concluída.

Testes executados e resultados desta revisão: `logs/20261029-runtime-rules/`. Os testes verificam implementações já existentes; não constituem uma suíte de distribuição ainda inexistente.
