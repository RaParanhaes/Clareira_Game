# Cabana da Samambaia — fonte Blender

Fonte editável: `fern-cabin.blend`; gerador: `scripts/blender/build-fern-cabin.py`; atlas UV empacotado: `fern-pixel-uv-atlas.png`. O Blender é usado offline: o jogo continua desenhando PNGs no Canvas 2D.

## Geometria e catálogo

A montagem foi criada para `cabin-cedar-two` na revisão persistida 4 observada em 28/10/2026: base 7 × 7, uma entrada frontal de 1,25 × 3,6 e quatro janelas. As frontais estão em X −2,15 e +2,15, Y +3,5; as laterais estão em X +3,5, Y −2 e +0,7. O vão frontal tem largura 1,2; o lateral, 0,9; ambos vão de Z 1,05 a 2,85. Pilares do alpendre ficam em X −1/+1 e Y +4,25. A luminária visível acompanha o emissor em X +0,84, Y +3,56, Z 3,25.

O catalogo salvo contém uma janela frontal em posição diferente daquela derivada do default atual em código. O renderer ativa esta fachada somente quando medidas, janela, porta, pilares e paleta correspondem à versão autorada. Edições incompatíveis voltam ao renderer orientado pelos dados até que exista uma nova montagem revisada. Isso preserva a física, o catálogo, reservas e demais estados salvos; não modifica o banco.

As cores foram extraídas do catálogo salvo: cobertura `#70805b`, parede frontal `#98724e` e lateral `#4c574b`, com variações de iluminação e textura. A fonte usa alvenaria visível, telhado de quatro águas e madeira no alpendre. A projeção de materiais persistida é anterior à fachada Blender; reconciliar metadados e arte em alteração versionada se esses dados forem atualizados.

## Projeção, camadas e custo

Cada PNG de runtime tem 320 × 320, pivô `(160, 207)` e o mesmo apoio no centro do mundo. A fonte mantém medidas 3D; somente a exportação para o jogo comprime Z para a projeção 16/8/12. O objeto foi renderizado nas quatro rotações e em vistas ortogonais, de topo e hero. As janelas e a lanterna têm vidro diurno e variante noturna emissiva.

O jogo usa cinco PNGs em `game/art/buildings/fern-cabin-3d/frames/`: parede diurna, parede noturna, cobertura do alpendre e dois pilares. Cada pilar e a cobertura mantêm sua própria profundidade. Os cinco arquivos somam aproximadamente 131 KB em disco e 1,95 MiB quando decodificados em RGBA; isso é estimativa de superfície, não medição de memória residente. Os renders de revisão e o `.blend` ficam nesta pasta de fontes, fora do manifesto público.

## Reprodução e validação

`npm run art:fern:build` cria uma nova exportação de revisão em `logs/fern-cabin-revision/draft/`; ela não substitui automaticamente a fonte revisada nem os PNGs do jogo. Após inspeção visual e promoção explícita dos artefatos, `npm run art:fern:check` confere hashes de fonte/modelo/PNGs, reabre o `.blend`, audita a malha e as quatro janelas nas quatro rotações, executa testes focados e verifica o renderer isolado em Chromium. `promotion.json` vincula a fonte revisada aos arquivos de runtime.

As referências observadas, a comparação entre o default e o catálogo salvo e a revisão por requisito ficam em `logs/fern-cabin-revision/iteration_review.json`. Capturas de renderer isolado e do mapa real têm estados separados. A aprovação visual do dono e a validação completa no mapa não são inferidas de uma verificação técnica.
