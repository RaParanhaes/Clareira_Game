# Iluminação, móveis e estruturas

As aberturas desenhadas e suas fontes usam `architectural-elements.mjs`. `scene-lights.mjs` declara alcance, intensidade, posição, altura e normal de emissão. `lightAmount` compartilha o cálculo entre mapas de luz e sombras. Cor-base do personagem e materiais permanece independente.

| Fonte | Altura sobre o piso | Alcance horizontal máximo | Direção / funcionamento |
|---|---:|---:|---|
| Janela externa | Centro do vão de cada andar | 5,2 + altura × 0,18 unidades | Normal da fachada, somente para fora; efeito cresce ao anoitecer |
| Lanterna da entrada | 3,25 | 4,8 | Para fora da fachada; peça visível ao lado da porta |
| Arandela interna | 3,05 | 8 | Da parede esquerda para dentro; iluminação fixa do ambiente |
| Janela interna | Centro do vão | 7 | Para dentro, intensidade acompanha a luz do dia; sem emissão à noite |
| Lareira | 0,7 | 6 | Pela abertura frontal; foco âmbar e chama animada |
| Tocha medieval | 2,35 | 4,6 | Oscilação forte, cor âmbar; interruptor persistido |
| Vela/castiçal | até 1,05 | 2,8 | Oscilação leve, foco pequeno; interruptor persistido |
| Lanterna | 1,55 | 4,8 | Luz protegida por vidro, oscilação leve; interruptor persistido |
| Candelabro | até 1,65 | 5,2 | Múltiplas chamas, oscilação moderada; interruptor persistido |
| Lustre medieval | 2,2 | 6,4 | Suspenso, múltiplas chamas e alcance amplo; interruptor persistido |
| Fogueira | 1,2 | 10 | Mantém combustível, vento e oscilação próprios; queda âmbar gradual |

O Breu usa o mesmo foco âmbar da fogueira original, com o raio visual ampliado em 40% e degradê gradual. A luz usa atenuação esférica 3D, projetada como uma elipse suave no chão isométrico: o núcleo fica mais forte e o alcance de 7 unidades se dissipa continuamente na escuridão, com pulsação leve da chama e oscilação da brisa. Um atlas PNG de oito quadros coloca os arcos mágicos sob a lenha e as estrelas acima da chama; com movimento reduzido, permanece no primeiro quadro. Na chegada, outro atlas parte da sequência pixel art de raio dourado com detalhes turquesa, formando e atingindo o ponto de nascimento da fogueira; 16 quadros interpolados suavizam o ciclo. O impacto do raio projeta um clarão próprio no chão, que se abre até o alcance da fogueira e desaparece gradualmente. A câmera segura o impacto e a fogueira por 2 s, revela o personagem e desliza até ele em 1,25 s; uma luz curta e pequena mantém o personagem legível sem clarear o mapa preto.

Unidades são as do piso do jogo. Alcance é limite, com queda gradual pela distância, altura e abertura angular; não é um disco uniforme. Paredes, pilares, balcões e volumes de móveis bloqueiam raios abaixo de sua altura. Objetos baixos deixam passar luz acima. Janelas externas não iluminam atrás da fachada. Mapas estáveis são rasterizados em cache limitado; mover/remover/desligar luminária invalida sua cena, sem incluir efeitos dinâmicos no cache de arquitetura.

O halo visual interno usa o tamanho do tile já projetado na tela uma única vez; não deve multiplicá-lo novamente pelo zoom (`spriteScale`), pois isso faz a luz crescer ao quadrado com a câmera. O raio fica limitado a poucos tiles e a opacidade acompanha a intensidade declarada do emissor. A chama pode continuar visível durante o dia, mas seu halo deve ficar quase imperceptível para não tingir paredes, móveis e áreas escuras de âmbar. As luzes do renderer também precisam acompanhar o estado dia/noite do emissor, em vez de desenhar um halo constante separado da simulação.

## Móveis de quarto

O seletor oferece Banco, Cadeira, Luminária, Cama, Criado-mudo, Guarda-roupa, Estante, Escrivaninha, Mesa, Sofá, Baú e Planta. Todos podem ser colocados, movidos, girados e retirados pelo dono. Banco e cadeira servem para sentar; a luminária alterna entre acesa e apagada. Os demais são decorativos por enquanto.

As caixas físicas usam a largura e profundidade do modelo; o banco redondo usa círculo de raio 0,38. Girar troca largura e profundidade no colisor junto com a orientação desenhada. O servidor confere cada giro e destino antes de salvar. A peça selecionada fica translúcida (28% de opacidade) com contorno âmbar; a prévia do destino fica verde quando cabe e vermelha quando bate em parede, móvel, jogador, rampa ou porta. O deslocamento interpola por 150–480 ms e o giro faz uma transição curta entre as duas vistas.

Por padrão, a Planta pode ficar em cima de Mesa, Escrivaninha, Criado-mudo ou Baú. Cada superfície usa a altura do móvel e declara largura, profundidade e tipos aceitos no catálogo; a planta só encaixa quando cabe no tampo e não atravessa o teto. Mover o apoio leva a planta junto e girar o apoio atualiza sua posição. O apoio não pode ser retirado enquanto ainda sustentar outra peça. Os demais móveis não empilham por padrão.

Cada quarto continua limitado a 12 móveis e usa grade de meia unidade. Móveis elevados não bloqueiam a passagem no chão; o móvel que os sustenta mantém a colisão normal. O servidor valida dono, caminho, alcance de 1,5 unidade e jogadores presentes. Visitantes autorizados podem sentar, mas não alterar os móveis nem o interruptor salvo pelo dono. A relação de apoio, altura e propriedades adicionais persiste no save privado e no PostgreSQL sem alterar os IDs existentes.

As propriedades de modelo ficam nos registros `furniture.<tipo>`: `width`, `depth`, `height`, `physics`, `palette`, `colors`, `supports`, `use` e `light`. O renderer lê largura/altura, paleta/cores, regra de apoio e configuração de luz do mesmo modelo. As instâncias do quarto também aceitam propriedades JSON por peça. Móveis arquitetônicos fixos continuam em `fixture.<tipo>` e são editados como objetos da planta.

Os 200 móveis medievais declaram `capabilities`, `dimension` e, quando emitem luz, `light` no próprio modelo. A capacidade determina a interação válida (sentar, deitar, banho, lavar ou alternar luz); plantas e decoração não ganham ações incompatíveis. `dimension.native` e `purchaseIn` iniciam o catálogo na Superfície; `crossDimensionImport: rare` marca itens trazidos de outra dimensão como raros. Não existe ainda compra entre dimensões, loja de jogador ou negociação com mercador.

O campo `light` determina altura da fonte, alcance, intensidade, cor, tipo de chama e amplitude de oscilação. A posição vertical inclui a altura do tampo quando a luminária estiver apoiada. Obstáculos de luz também usam a base e altura reais dos móveis, de modo que uma peça elevada não projete uma sombra como se estivesse no chão. A oscilação é limitada a passos temporais curtos e compatíveis com o cache de mapas de luz. O estado `enabled` é salvo no estado privado do quarto; fontes apagadas não produzem emissor após o dono sair e retornar. A janela usa o ciclo dia/noite já compartilhado pelo mundo: luz natural entra durante o dia e não há emissor solar à noite.

Modelos de fogo devem declarar estado, animação, emissor e sombra como propriedades do objeto, em vez de criar exceções visuais sem dado. A lareira embutida atual tem chama e emissor com variação visual, mas seu interruptor por instância ainda precisa ser ligado à persistência do objeto fixo; não se deve afirmar que ela já pode ser apagada pelo dono até essa ligação estar pronta. Arandelas fixas são luz de arquitetura e não substituem o catálogo de fontes medievais colocáveis. Abajures modernos ficam fora do catálogo medieval inicial.

Cada um dos 200 modelos recebe a afinidade da dimensão `surface` por padrão nesta primeira dimensão medieval. A afinidade não impede transporte ou revenda futura: controla disponibilidade de compra local, enquanto a importação entre dimensões é rara e a loja/mercador define preço e oferta em uma etapa posterior.

## Atlas e UV dos móveis

Os contratos obrigatórios ficam em [UV-MATERIALS.md](UV-MATERIALS.md), com o layout do atlas, mapeamento por face e edição/exportação, e [ISOMETRIC-DEPTH.md](ISOMETRIC-DEPTH.md), com camadas por orientação, apoios e a oclusão da cabeceira durante o uso da cama. Alterar móveis exige aplicar ambos os padrões e cumprir seus critérios de revisão.

A cama-base aprovada usa a fonte Blender 3D/UV em `game/art/room-furniture/bed-3d-prototype/`; o exportador incorpora as vistas e as camadas de uso ao atlas v3. Os outros 200 modelos do catálogo medieval agora usam malhas paramétricas com UV e atlas próprio, incluindo quatro direções e variantes visuais de cobertura e iluminação. Não há dependência de Blender no runtime nem alteração das regras físicas e de salvamento dos móveis.

## Componentes externos

Entradas têm cobertura apoiada em dois pilares com bases, capitéis e mãos-francesas. O mesmo descritor define desenho e colisão dos pilares; a faixa central da porta fica livre. Hotel usa acabamento de pedra e sacada rasa de fachada com balaústres, corrimão e suportes. A sacada é ornamental: não há pavimento superior caminhável ou porta de acesso. Coberturas, guardas e lanternas respeitam os eixos da fachada, sem degraus pintados que prometam subida. O sistema ainda tem uma superfície por coordenada horizontal.
