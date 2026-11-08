# UV de construções e árvores

As fachadas usam a geometria isométrica de construção já definida em coordenadas do mundo, mas as superfícies principais agora recebem texturas repetíveis com UV por face. O atlas `game/art/building-materials/architecture-uv-v1.png` tem células de 16×16 para madeira, alvenaria, telhas e fundação. As coordenadas de cada quadrilátero projetado vêm de seus eixos no mundo; cada célula se repete conforme a largura e a altura da face. O tom em escala de cinza da textura seleciona as sombras e realces da paleta específica de cada edifício.

Portas, janelas, letreiros, postes, beirais, iluminação noturna, colisão e ordenação de profundidade continuam como elementos separados. Isso preserva janelas acesas por horário, passagem de personagens diante dos postes e a geometria física. Se o atlas não estiver disponível, a construção usa o desenho procedural que já existia.

As árvores são malhas low-poly com UVs para casca e folhagem, renderizadas para os mesmos quadros isométricos de 80×104 pixels que o jogo já consome. O atlas mantém sete silhuetas de árvores de copa larga, uma de pinheiro, paletas de luz quente e nove poses de vento por linha. O balanço move camadas articuladas da copa, preservando tronco, ponto de contato, ciclo de vento e suporte a movimento reduzido. A fonte editável e o gerador são `game/art/tree-sprites/tree-uv-catalog-v1.blend` e `scripts/build-uv-tree-atlases.py`.

Para reconstruir os atlas locais, execute `python3 scripts/generate-architecture-uv-atlas.py` e `python3 scripts/build-uv-tree-atlases.py` na raiz do projeto, com Blender e Pillow instalados.

O atlas 3D é um sprite renderizado para a câmera isométrica fixa do jogo. Ele não representa rotação livre em tempo de execução; as árvores não são objetos rotacionáveis do modo de construção.
