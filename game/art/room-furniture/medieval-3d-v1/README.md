# Catálogo medieval: malhas 3D, UV e vistas

Este diretório guarda a fonte editável e o processo reprodutível dos 200 modelos medievais. Cada registro mantém seu ID, dimensões, família, perfil de silhueta, paleta e propriedades de interação; o gerador constrói uma malha paramétrica por peça, aplica UV às faces, e renderiza quatro rotações ortográficas com o mesmo pivô de contato no piso.

O catálogo é dividido em 20 famílias. A geometria varia conforme a família, o perfil (`arched`, `gothic`, `ironbound`, `woven` e outros), a variante e as dimensões do registro. A textura local usa faixas UV para madeira, tecido, pedra, metal, vidro e folhas, com paleta própria por item. O runtime consome apenas PNG; Blender não é necessário para jogar.

`frames/` guarda os quadros-fonte por ID e orientação. `materials/medieval-material-uv-v1.png` é o atlas UV por material/modelo. `medieval-furniture-catalog-v1.blend` contém as malhas editáveis. `manifest.json` registra o índice compacto e os estados. `catalog-front-view.png` e `direction-sheets/` servem para revisão visual.

Os modelos com a ação `lie` têm base coberta, base aberta e uma camada de coberta para desenhar sobre o avatar; cabeceiras próximas seguem a ordenação das quatro vistas. As luminárias têm quadros aceso/apagado; o emissor, alcance e cintilação continuam definidos no registro de dados.

Para reconstruir o atlas a partir do catálogo e das fontes, execute `node scripts/export-medieval-furniture-3d.mjs`. O exportador atualiza o manifesto, as folhas de revisão e `game/art/room-furniture/medieval-furniture-v1.png`. A validação confere IDs, orientação, estados, dimensões PNG e hash antes da integração.
