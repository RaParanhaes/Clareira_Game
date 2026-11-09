# Interior dos imóveis, estilo Habbo Hotel: plano de etapas

Categoria: Mundo e conteúdo (`feat/world-interior-habbo`). Nada é commitado sem autorização explícita do dono.

## Escopo desta fase

Fase 1: lobby do Hotel das Brasas (`lodging-ember-hotel`). Os outros cômodos entram na fase 2, reaproveitando o que a fase 1 provar.

Decisões tomadas como padrão, e que o dono pode mudar:
- Renderização no PC, com o Blender 5.2.3 já instalado. Nada é instalado na VPS.
- Uma leva por vez, cada uma com testes, captura desktop e celular, e relatório.

## Etapas

1. **Plano e verificação do ambiente** (feito): Blender responde em modo headless; plano escrito.
2. **Dry-run do pipeline de móveis** (pendente de autorização): `scripts/build-medieval-furniture-3d-atlas.py` renderiza os 200 modelos do catálogo (`catalog.json`, quadros de 128 px, 5 colunas). Rodar em pasta temporária, sem tocar nos arquivos do repositório, para comparar com o atlas atual. É uma carga pesada no PC, então depende do seu OK.
3. **Inventário do lobby**: para cada peça de `game/hotel-reception.mjs`, registrar família, variante, uso (sentar, deitar, acender, decorar) e se o sprite é o do catálogo.
4. **Piso e paredes**: texturas pintadas (PNG) de tábua/parquê e de painel de parede, usadas como material. Integração em `game/main.js` (`drawRoomInterior`) atrás de flag, com fallback para o desenho atual.
5. **Peças com uso** (mesa, estante, baú, balcão): ajuste de modelo no catálogo 3D, re-renderização no Blender e atualização do atlas. As dimensões precisam bater com `game/hotel-reception.test.mjs`.
6. **Decoração e movimentação**: plantas, quadros e tapetes extras, sem bloquear os pontos de espera nem o canto frontal que os testes verificam.
7. **Validação**: suíte completa (hoje 527 passam e 7 falham, as mesmas 7 de `main`), capturas novas em desktop e celular, comparação na mesma hora do jogo.
8. **Relatório e integração**: pedido de autorização para commit e para integração em `master`.

## Critério de aceite da fase 1

- Suíte completa sem falhas novas.
- Capturas desktop e celular mostrando piso, parede e peças com uso visivelmente melhores, na mesma hora do jogo.
- Nenhum processo de teste deixado vivo.
