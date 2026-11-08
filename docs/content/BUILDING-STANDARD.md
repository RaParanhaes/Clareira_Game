# Padrão de construções da Clareira

Revisão de interiores e exteriores autorizada pelo dono em 23/10/2026.

Materiais e renderização das construções também seguem obrigatoriamente [UV-MATERIALS.md](UV-MATERIALS.md) e [ISOMETRIC-DEPTH.md](ISOMETRIC-DEPTH.md), incluindo faces de parede, vãos, pilares, coberturas, camadas do personagem e objetos apoiados.

## Medidas e encaixe

Todas as peças usam coordenadas do mundo e a mesma projeção 2:1 aproximada do jogo. A dimensão desenhada de um móvel deve corresponder à sua base de colisão; altura é separada da área ocupada. O personagem é a referência humana.

- Porta: largura livre 1,25; altura 3,6. Batentes com 0,08, soleira e verga no plano da fachada.
- Andar: 4,3 de altura; fundação de 0,35; parede interna com espessura visível de 0,14. Paredes frontais ficam abertas para leitura do interior.
- Janela: largura 1,2, peitoril 1,05 e topo 2,85, repetidos por andar. Vãos afastados de cantos e portas.
- Telhado: beiral de 0,22 medido no mundo, cumeeira, empenas fechadas, espessura e duas faces com iluminação coerente. Telhas pequenas seguem a inclinação.
- Móveis: desenho e obstáculo derivados da mesma largura e profundidade. Camas 1,1 de altura de colchão; mesas/balcões 1,4–1,5; cadeiras com assento 1,05 e encosto 2,2; armários 3,0. Pés, tampos e frentes continuam no plano isométrico.

## Circulação e entrada

Piso visível é caminhável até sua borda com margem do raio do jogador; não há faixa invisível bloqueando a frente inteira do quarto. Paredes e móveis bloqueiam a mesma geometria no cliente, servidor e caminho por clique.

Chegada é um quadrado no piso sob o spawn, unido à soleira por um patamar. Nos interiores planos, caminhar para dentro cruza a entrada e atravessar o patamar de volta sai; E continua disponível perto da entrada. A parede frontal é cortada para leitura: não há painel vertical de porta flutuando na frente da cena. A faixa central de chegada fica livre de móveis. Balcões deixam espaço para atendimento na frente e circulação de trabalho atrás. Cada móvel deve ter pelo menos um lado alcançável a partir da chegada; móveis não se sobrepõem nem atravessam paredes.

O enquadramento interno usa a planta, a altura das paredes e o patamar para acomodar o ambiente entre HUD e controles. A câmera fica estável dentro do quarto. Luz projetada no piso é desenhada antes de móveis e personagens opacos, evitando que o chão iluminado apareça por cima de cadeiras ou corpos.

## Famílias existentes

- Recepção: construção térrea acolhedora; balcão dividido entre informações e trocas, espera nas laterais e caminho central livre.
- Hospedaria: fachada térrea compacta, madeira e verde; recepção pequena, quarto simples com cama e armazenamento.
- Pousada: telhas de barro, vigas e sótão; recepção com lareira e quarto mais equipado.
- Hotel: dois andares legíveis, janelas em dois níveis e friso entre pavimentos; salão maior com espera, atendimento e quartos/suíte próprios.
- Cabana do Cedro: madeira quente e lareira; cabana da Samambaia: verde e espaço de refeições; cabana do Mirante: tons frios, trabalho e armazenamento. Variar telhado e detalhes mantendo a escala comum.

### Autoria 3D para fachadas

O primeiro protótipo de forma arquitetônica em Blender é `game/art/buildings/medieval-cottage-3d/medieval-cottage.blend`. Ele substitui a fachada procedimental da Cabana do Cedro por sprites PNG offline, preservando o Canvas 2D no jogo. A revisão 2 tem paredes coincidentes com a base física 7×7, cumeeira deslocada, beirais varridos, telhas de cedro, alpendre centrado na porta e uma janela ligada à planta. Casa, pilares e cobertura do alpendre são camadas separadas, com PNGs 320×320 e pivô comum (160,207). O catálogo e a colisão continuam autoritativos. A produção e a revisão seguem obrigatoriamente [BLENDER-ASSET-WORKFLOW.md](BLENDER-ASSET-WORKFLOW.md).

Novas formas de casa com volume complexo devem partir de uma malha Blender UV editável, exportar quatro rotações pela mesma câmera e pivô e passar revisão frontal, posterior, laterais e superior antes de entrar no mapa. O render do jogo compensa a razão não física da projeção Clareira sem alterar a escala do `.blend`. PNGs fixos são adequados a fachadas estáticas; peças que precisem intercalar com personagem, atravessar, abrir ou animar devem ser separadas em camadas/estados conforme [ISOMETRIC-DEPTH.md](ISOMETRIC-DEPTH.md). O footprint, porta, janela, colisão, seleção e caminho continuam no contrato espacial do catálogo.

### Protótipo residencial: Cabana do Cedro

A primeira planta residencial validada é térrea, mede 7 × 7 unidades de mundo e tem uma única unidade habitável: um ambiente aberto de dormir e estar, com cama, lareira e baú. Não há banheiro neste protótipo. A janela exterior tem 1,2 unidade de largura e fica vinculada ao ambiente `cedar-main`; esse ambiente declara uma janela, respeitando o limite de uma janela por quarto. A fachada, a abertura e o ponto de luz usam a mesma definição de janela no catálogo de objetos. Nas próximas plantas, cada quarto e banheiro será uma sala nomeada, cada uma com suas janelas próprias; banheiros não aumentam a contagem de quartos.

As janelas externas mostram vidro escuro durante o dia e vidro iluminado à noite. A luz projetada usa o ponto e a direção da janela, reduzindo a emissão até zero à luz do dia. A planta interior abre uma janela correspondente para a luz diurna e escurece o vidro à noite. Um circuito de interruptores persistentes por cômodo ainda será necessário para que o estado desligado apague também a janela exterior; este primeiro protótipo valida a escala, a associação quarto–janela e o ciclo dia/noite.

O exterior sugere a capacidade do prédio; unidades de hotel continuam cenas próprias. Não desenhar escadas/portas falsas como destinos disponíveis. Estilos regionais futuros seguem REGIONAL-ARCHITECTURE.md.

## Validação

Verificar bases e volumes, sobreposição de móveis, colisão nas quatro bordas, chegada/saída, rotas até móveis e balcões, ordenação do personagem diante/atrás de volumes, desktop e celular. Preservar IDs, lotes, contas, chaves e móveis salvos. Alterações de arte não certificam sozinhas funcionamento físico.

O cache do piso/paredes é separado por planta, para que voltar de um quarto à recepção redesenhe o ambiente correto. Janelas e quadros escolhem trechos livres da parede, sem atravessar armários ou lareiras.

Bancos decoráveis mantêm os IDs e o raio físico de 0,38; o assento é desenhado nessa base. Girar altera os eixos do móvel no piso, preservando sua altura, sem rodar a imagem inteira na tela.

Tapetes e bases de móveis fixos ficam inteiros no mesmo nível de piso; não podem atravessar escadas ou rampas como uma placa plana. O tapete do quarto antigo foi deslocado para o piso inferior livre.

Fontes de luz, interruptores salvos, móveis utilizáveis e componentes externos seguem [Iluminação e móveis](LIGHTING-AND-FURNITURE.md).
