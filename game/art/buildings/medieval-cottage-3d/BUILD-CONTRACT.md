# Cabana do Cedro — fonte 3D, revisão 2

Fonte: `medieval-cottage.blend`. Gerador: `scripts/blender/build-medieval-cottage.py`; exportador PNG compartilhado: `scripts/blender/cottage_pixels.py`. Blender 4.0.2. O jogo usa PNG/Canvas 2D; nenhuma malha ou engine 3D é carregada em runtime.

## Construção e relação com a física

A parede principal mede **7 × 7 unidades**, coincidente com `cabin-cedar-one.bounds`. Antes desta revisão, a parede desenhada era menor que esse colisor. Beirais se estendem além da parede; o alpendre usa os pontos já existentes no catálogo: pilares em X local ±1, Y local 4,25 e cobertura junto à entrada. Não alterar o colisor para fazer um desenho parecer alinhado.

- Porta centrada em X=0, plano frontal Y=3,5, abertura livre 1,25 × 3,6. Alpendre centrado na porta; apoios no chão e juntas conectadas aos pilares. Soleira livre de uma viga horizontal atravessando a abertura.
- Um ambiente de dormir/estar, exatamente uma janela: centro `(2,15; 3,5; 1,95)`, vão livre 1,2 × 1,8. A parede tem recorte Boolean real. Moldura, vidro, venezianas abertas e floreira não se confundem com o tamanho livre do vão. Nenhuma viga cruza os painéis.
- Cumeeira deslocada para X=-1,05, Z=7,1; faces de cobertura com inclinação e beirais varridos. Telhas de cedro sobrepostas, espessura real, testeiras contínuas e cumeeira arrematada. Não existe grade de barras sobre um plano de telhado.
- Reboco claro, carvalho estrutural, rodapé de madeira e fundação de pedra com juntas alternadas. A chaminé tem alvenaria afunilada, rufo, coroamento e pote cerâmico vazado. O respiro circular da empena é cego, sem vidro e sem contar como outra janela/quarto.
- A física, IDs, propriedade, chaves, móveis, estados salvos e navegação continuam no catálogo/servidor. A especificação visual da cobertura é de cedro; os registros legados ainda podem nomear o material como `thatch` no fallback procedural. A revisão persistente desse metadado não foi aplicada automaticamente à base.

## UV, pixel e enquadramento

Atlas 512×128: 8 colunas × 2 linhas, células de 64×64; materiais e índices em `manifest.json`. `UV0` é local por face. A projeção UV descarta o eixo **dominante** da normal: descartar o menor eixo achatava texturas em várias faces do modelo anterior. Todas as faces têm área UV não nula. Filtragem `Closest`; pixels de alfa zero recebem RGB zero para não armazenar ruído invisível do render.

O arquivo `.blend` conserva a escala 3D. Só o render do jogo comprime Z por 0,6123724357 para reproduzir 16 px/unidade em X, 8 px/unidade em Y e 12 px/unidade de altura. As quatro rotações são da mesma montagem; nunca remodelar uma janela por direção. As vistas ortogonais usam câmera horizontal, permitindo conferir medidas sem inclinação vertical.

PNG de jogo: **320×320, pivô no chão `(160,207)`**, câmera ortográfica fixa. A margem maior acomoda a parede física de 7×7, os beirais e o alpendre sem encolher a casa. O pivô representa o mesmo ponto do mundo em todas as camadas.

## Camadas no jogo

| Componente | Arquivo | Ordenação |
|---|---|---|
| Casa e janela, dia | `frames/iso-rot0-shell.png` | plano da fachada junto à porta |
| Casa e janela, noite | `frames/iso-rot0-shell-night.png` | mesmo apoio do estado diurno |
| Pilar esquerdo | `frames/iso-rot0-post-left.png` | base do pilar esquerdo |
| Pilar direito | `frames/iso-rot0-post-right.png` | base do pilar direito |
| Cobertura e travessas do alpendre | `frames/iso-rot0-canopy.png` | canto frontal da cobertura |

`iso-rot0..3.png` são montagens completas **para inspeção**, não o sprite da parede usado no mapa. O cliente ativa a montagem apenas quando todas as camadas estruturais estão prontas, evitando misturar casa Blender com pilares procedurais. O modo noturno troca só a parede/vidro. A placa com texto permanece em Canvas e é alinhada ao suporte de madeira do alpendre.

Render por camada usa visibilidade de câmera: as demais peças continuam projetando suas sombras. O personagem exterior é ordenado contra a fachada e cada pilar; não é promovido ao canto distante da casa inteira. Isso preserva a passagem atrás e à frente dos pilares.

## Evidência e limites

Referências visuais efetivamente observadas e suposições: [reference_notes.md](reference_notes.md). Antes preservado em `logs/cottage-art-revision/before/`; críticas e decisão em `logs/cottage-art-revision/iteration_review.json`.

- Modelo reaberto em processo Blender limpo; inspeção em `logs/cottage-art-revision/metrics.json`.
- `scripts/blender/validate-medieval-cottage.py` verifica UVs, posições reais dos pilares e 16 raios pelos painéis da janela nas quatro rotações, contra a malha efetivamente salva.
- `game/building-standard.test.mjs` compara o contrato exportado à planta e aos pontos de colisão canônicos. `game/house-collision.test.mjs` cobre colisão e ordenação exterior com o mesmo helper de runtime.
- `scripts/browser-cottage-sprite-check.mjs` abre o renderer real em Chromium e registra desktop, celular, dia/noite e personagem atrás/à frente do pilar. Essas capturas isoladas não equivalem a passear no mapa real.

As cinco camadas ativas somam aproximadamente 135 KB comprimidos e 1,95 MiB de RGBA decodificado. O número de triângulos da fonte não é custo de GPU do jogo. Não foi medido ganho de FPS nem latência de rede; a fonte é renderizada offline e o jogo continua usando as camadas estáticas existentes.
