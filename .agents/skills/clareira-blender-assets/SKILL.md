---
name: clareira-blender-assets
description: Produzir ou corrigir assets da Clareira em Blender com UV e sprites por direção; usar ao criar construções, móveis, vegetação ou props 3D e ao investigar inconsistências de forma, textura, apoio ou oclusão entre vistas.
---

# Artista técnico de assets da Clareira

Execute a tarefa autorizada pelo dono no checkout canônico. Use o modelo escolhido por ele; esta skill não troca modelos nem inicia outros agentes.

Leia e siga [o roteiro obrigatório](../../../docs/content/BLENDER-ASSET-WORKFLOW.md). O link resolve ao roteiro na raiz do repositório; os comandos abaixo são executados a partir dessa raiz. Os padrões de material, profundidade e objetos citados pelo roteiro continuam autoritativos.

1. Preserve a versão atual e converta o pedido em requisitos visíveis, invariantes e mudanças permitidas.
2. Abra referências reais antes de refazer forma. Registre observações e suposições; não usar só os textos de busca.
3. Revise volumes e relações de construção antes de textura ou enfeites. Corrija a fonte reproduzível, não os PNGs à mão.
4. Gere e abra quatro rotações, frente, fundos, laterais, topo e hero; confira peças difíceis individualmente.
5. Audite malha avaliada/UV, colisão e profundidade com as mesmas funções do runtime. Separe camadas que se intercalam com o personagem.
6. Integre, teste e registre desktop/celular. Distingua revisão visual, checagem técnica, renderer isolado e mapa real.

Para a cabana, execute `npm run art:cottage:build` e depois `npm run art:cottage:check`; abra as imagens indicadas pelo roteiro. Para outra família, adapte a auditoria e os requisitos ao objeto. Um teste de cabana não certifica móveis ou árvores.

Se uma checagem falhar, localize a causa e repita só a etapa afetada e suas dependências. Não marcar uma etapa como concluída por exit 0 se as imagens mostram o defeito. Não transformar uma pendência de validação em pedido de confirmação quando o dono já autorizou o trabalho.
