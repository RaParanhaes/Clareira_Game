# Altitude, voo e combate em diferentes alturas

**Estado: regras planejadas; voo, montarias voadoras e combate tridimensional não estão implementados nem validados por este documento.** Complementa `SCENE-RUNTIME-RULES.md`, `WEBSOCKET-SIMULATION-SCALING-PLAN.md`, os contratos de profundidade e os dados de objetos. O jogo continua com apresentação isométrica em Canvas; a física pode usar coordenadas e volumes tridimensionais sem exigir uma engine 3D no navegador.

## Prévia isolada de árvore — primeira parte em andamento

O ensaio `/dev/flight-lab.html` usa artes existentes e uma física local experimental de altitude absoluta e cilindros. Testa bloqueio no chão, passagem por cima, descida impedida sobre a árvore e pouso livre. A altura 4 e o volume cilíndrico são parâmetros experimentais, não propriedades aprovadas do catálogo. A simulação e um protocolo de voo experimental foram ligados ao servidor atrás de uma opção desativada por padrão, sem controles no jogo. A primeira etapa só poderá ser considerada concluída depois da validação da integração no jogo, reconciliação, colisão e profundidade. Evidência do ensaio: `logs/20261029-flight-first/assessment.json`. Nenhuma etapa de casas/combate foi iniciada.

## Situação atual que precisa ser preservada

O código já possui relevo (`surfaceHeight`), deslocamento vertical de salto (`z`/`vz`) e tratamento específico para troncos caídos e fogueira. Porém, `canOccupy` ainda verifica construções e árvores sem usar altura para ultrapassá-las. Ordenação atual usa profundidade horizontal e considera altura como desempate. Isso **não comprova** que um dragão consiga sobrevoar casas/árvores nem que a oclusão de voo esteja correta.

Não reinterpretar silenciosamente o `z` atual nem liberar atravessar obstáculos existentes; introduzir um contrato versionado e conversão testada quando o voo for implementado.

## 1. Posição e altitude

- O servidor determina posição física `(x, y, Z)` e velocidade `(vx, vy, vz)` em unidades do mundo. `Z` é altitude absoluta no sistema da instância; altitude acima do solo é `Z - surfaceHeight(x,y)`.
- Para migrar o estado atual, uma posição apoiada/salto relativo precisa de conversão explícita usando a altura da superfície de origem. Enquanto estiver no ar, a altitude absoluta não deve mudar automaticamente só porque o terreno embaixo subiu ou desceu.
- Precisão, unidades, teto de voo, aceleração, exaustão, queda e regras de pouso são decisões de jogo futuras; não inventar números como se já fossem balanceamento aprovado.
- Estado precisa distinguir pelo menos apoiado, salto/queda, levitação, voo próprio e montado. Habilidades podem impor outras restrições. A transição só acontece quando validada; animação por si não autoriza voo.
- Jogador e montaria mantêm IDs e estados próprios, com vínculo autoritativo e volume de colisão composto definido. Movimento, dano ao alvo correto, montagem, desmonte, queda e reconexão não duplicam corpos nem recompensas.

## 2. Volumes, terreno e construções

```text
    Dragão acima do topo: passagem possível
             🐉    corpo: [base Z, topo Z]
       ------------------- topo da casa/árvore
               🌳     🏠
       ------------------- chão/relevo
```

- Cada obstáculo sólido registra volume/partes: contorno horizontal, base e topo em altitude do mundo, tipo e resposta (bloquear, plataforma, apoio, atravessável por regra específica). Casas podem ter paredes, telhado, chaminé, beiral e abertura com volumes separados; árvores podem ter tronco e copa com regras próprias.
- Colisão ocorre quando há sobreposição física nos eixos horizontais **e** nos intervalos verticais, respeitando a forma e a resposta do obstáculo. Um corpo cuja parte inferior está acima do topo sólido, com a folga física definida, pode passar por cima. Um dragão grande pode colidir com um telhado/chaminé mesmo se o ponto central estiver livre.
- Volume visual, volume de colisão, sombra e bloqueio de visão/projétil são propriedades distintas; não presumir que toda copa ilustrada bloqueia voo ou magia. Definir explicitamente no catálogo e validar frente às quatro vistas.
- O movimento usa colisão contínua ou varredura conservadora ao longo do deslocamento `(x,y,Z)`, inclusive subidas, descidas, saltos longos e movimentos rápidos. Testar todo o corpo e o trajeto, não apenas início e destino; a escolha de algoritmo precisa ser determinística e limitada.
- A entrada no espaço vazio não torna o terreno desaparecido: verificar altura da superfície sob o corpo, limites do mundo e suportes/platôs. Pousar exige espaço livre para o volume completo e superfície apropriada. Se não houver espaço, rejeitar/ajustar segundo regra explícita; nunca colocar o personagem dentro do telhado.
- Telhados não se tornam automaticamente plataformas; pouso em árvores, água, telhados e móveis requer suporte e permissões próprias. Interiores exigem teto/aberturas reais para sair voando, quando houver esse recurso.
- Física de andar no chão, colisão de portas, empilhamento e repouso em móveis permanecem autoritativos. Testes atuais passam também com voo desativado.

## 3. Alcance, disparos e dano

- Um ataque parte de uma origem física 3D e tem trajetória, alcance, velocidade, volume e duração definidos pelo modelo/ação. O servidor valida uso, custo, cooldown, dono, equipe, alvo, obstáculos e resultado; o cliente mostra animação e previsão visual, corrigida quando necessário.
- Espada, raio, bola de fogo, sopro, área de explosão e meteoro podem ter regras diferentes de trajetória e bloqueio. Um raio vertical pode atingir o chão; uma explosão só afeta um alvo alto se seu volume/alcance vertical definido o alcançar. Não aplicar acerto apenas porque os sprites se sobrepõem na tela.
- Ataques de cima para baixo e de baixo para cima exigem checagem vertical e linha de efeito com as propriedades de cada obstáculo. Cobertura e telhado podem bloquear conforme suas regras; detalhes decorativos não viram escudos automaticamente.
- Projéteis rápidos e personagens em movimento usam testes contínuos ou subpassos limitados para não atravessar o alvo entre ticks. Definir ordem/versão temporal e idempotência do evento para que retries ou fronteiras não gerem dano duplo.
- **Cada habilidade deve definir** como altura e alcance são medidos, se e como obstáculos bloqueiam, e quais alvos são elegíveis. Lag compensation, se adotada, precisa de janela limitada, histórico e testes justos; não presumir que já existe.
- Montaria e cavaleiro podem ter áreas de acerto próprias; definir como proteção e dano são atribuídos, evitando que um único impacto conte duas vezes sem a habilidade prever isso.

## 4. Apresentação, profundidade e visibilidade

- Projetar a altura pela projeção isométrica e desenhar sombra de acordo com o ponto/superfície abaixo e a fonte de luz. A sombra é visual; não serve de hitbox ou prova de alcance.
- Resolver oclusão por volumes, faces e camadas: um corpo pode ficar atrás de uma parte da casa, acima do telhado e à frente de outra parte. Uma única ordenação por `x+y` com `z` só no empate não basta como garantia geral. Separar camadas dos assets ou usar outra solução validada sem alterar a física.
- Definir indicadores legíveis de altitude, voo, destino de salto e perigo vertical, inclusive quando o personagem ou o alvo está parcialmente oculto. Não exigir transparência automática das casas sem testar a experiência; selecionar abordagem visual com evidência.
- Um corpo cuja projeção ou sombra alcança a tela precisa ser considerado na visibilidade mesmo que sua base horizontal esteja fora dela. Ao mesmo tempo, a consulta de combate inclui tudo que pode afetar o jogador, mesmo fora da câmera. Não reduzir dano ou colisões com LOD visual.
- Movimentação e animação são interpoladas no cliente; autoridade e tempo funcional continuam no servidor. Respeitar movimento reduzido e manter pista visual suficiente do ataque.

## 5. Região, rede e desempenho

- O mundo principal pode permanecer numa única autoridade enquanto suportar a carga medida. Altitude não exige servidor ou WebSocket próprio; mensagens carregam o estado vertical necessário no protocolo versionado.
- Índice espacial usa `(x,y)` para candidatos e intervalos/volumes em `Z` no refinamento; uma grade 3D só será escolhida se medições a justificarem. Limitar filas, históricos e alcance de consultas por habilidade.
- Interesse de rede, colisão e renderização têm margens diferentes. Em futura fronteira de região, considerar também o percurso vertical, alcance, velocidade relativa e tempo máximo de transferência; objetos espelhados são leitura e um só dono resolve o impacto.
- Fauna/combate fora da visão continua ativo quando houver efeito funcional que possa alcançar alguém ou modificar o mundo. Efeitos puramente decorativos podem reduzir densidade/frequência sem eliminar a pista de perigo.
- Medir FPS/p95/p99, tempo de simulação e de consultas, taxa/tamanho dos snapshots, entrada→confirmação, memória e custo sob jogadores concentrados; não alegar capacidade sem teste.

## 6. Critérios de implementação e validação

| Cenário | Resultado obrigatório |
| --- | --- |
| Caminhar, saltar e sentar como hoje | Regressão zero das regras existentes em solo/interiores |
| Sobrevoar árvore/casa | O volume inteiro passa acima do topo; sob o topo colide conforme material/forma |
| Dragão largo junto a chaminé | Colide quando qualquer parte sólida intersecta; nenhum atravessamento por velocidade alta |
| Subir, descer e pousar | Terreno, teto e suporte considerados; pouso inválido não insere corpo no objeto |
| Voo sobre relevo | Altitude absoluta e altura sobre solo diferem corretamente; sem salto involuntário de Z |
| Alvo no chão vs no ar | Ataque e área de efeito respeitam volumes e alcance vertical definidos |
| Atirar de cima/baixo | Linha de efeito e cobertura funcionam em ambos os sentidos, com ou sem teto |
| Personagem e dragão | Acerto/defesa é atribuído uma vez segundo a regra; montagem e desmonte sincronizados |
| Perspectiva em quatro lados | Camadas de casa/árvore, personagem, montaria e sombra não atravessam incorretamente |
| Fora de tela/fronteira | Perigos relevantes são processados; sem dano duplicado ou perda em handoff |
| Queda de conexão/latência | Estado de voo, posse e ações confirmadas são recuperados e reconciliados |
| Carga e acessibilidade | Combate concentrado com diferentes alturas e movimento reduzido; desempenho medido no mesmo cenário |

Exigir testes de limites, movimento rápido, alturas de empate, mudança de seed/catálogo, visibilidade e perfil de carga. Validar visualmente em posições/ângulos diferentes e com aparelho real. Até que esses testes e a implementação existam, sobrevoo, combate 3D e distribuição por altitude continuam pendências.

### Andamento do experimento de árvores

O laboratório isolado exercita subida controlada e movimento suave. A simulação compartilhada tem um caminho experimental protegido por `flightAuthorized`, com `flightZ` absoluto e teste de colisão usando árvores reais do mapa. O servidor aceita comandos e envia altitude somente com a opção experimental habilitada; essa opção é desativada por padrão e não há controles no jogo. Testes com WebSocket cobrem rejeição quando desativado, replay de comandos e retorno seguro ao chão após reconexão. A altura provisória de árvore é de 4 unidades e ainda precisa ser comparada às dimensões visuais de cada asset. Pedras e edifícios continuam bloqueando sem limite de altura. Antes de ativar para jogadores são necessários controle de permissão por jogador, ordenação e projeção visual no renderer real, avaliação da recuperação e testes de desempenho e rede em condições reais. Não tratar os resultados do laboratório como validação visual multiplayer.
