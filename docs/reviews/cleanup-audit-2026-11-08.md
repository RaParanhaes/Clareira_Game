# Auditoria inicial de limpeza — 2026-11-08

Escopo: cópia GitHub de `RaParanhaes/Clareira_Game`, branch derivada de `main`. Não envolve a árvore de desenvolvimento local da VPS.

## Inventário da revisão
- 3.726 arquivos versionados (221.557.191 bytes somados, sem contar histórico Git).
- `game/`: 3.268 arquivos, predominantemente sprites, fontes artísticas e recursos de revisão.
- `game/main.js`: aproximadamente 573 KB; `game/style.css`: aproximadamente 167 KB. A modularização requer testes funcionais específicos e fica fora desta limpeza conservadora.
- 46 grupos com SHA de blob repetido. **Igualdade de conteúdo não implica redundância:** quadros de animações para direções diferentes, fontes sob `art-source/` e exports em `game/art/` podem ter papéis distintos.

## Limpeza aplicada
- Excluídos os renders antigos `game/art/clareira-login-loop-v3.mp4` e `game/art/clareira-login-loop-v4.mp4`.
- Mantido `game/art/clareira-login-loop-v5.mp4`, referenciado pela página de login.
- Retiradas as duas entradas antigas de `scripts/game-asset-manifest.mjs`, preservando as regras do vídeo atual.
- **Arquivos geradores históricos preservados:** `scripts/render-login-loop.mjs`, `scripts/render-login-loop-sequence.py` e respectivas entradas em `art-source/`. Caso sejam executados intencionalmente, eles podem regenerar os vídeos antigos.

## Candidatos que NÃO devem ser apagados automaticamente
- `game/art/room-furniture/room-furniture-v2.png` é consumido por scripts de comparação/prototipagem de camas, mesmo sem ser o atlas atual em runtime.
- `game/art/clareira-login-vila-v1.webp` e `v2.webp` servem a geradores de vídeo e verificações.
- `game/art/avatar-frames/character-layers-v1/frames/`, `source/`, `review-gifs/` e `sheets/` são materiais de produção e revisão de animação, não downloads de runtime.
- `game/art/room-furniture/medieval-3d-v1/`, `art-source/` e modelos `.blend` contêm entradas editáveis para arte; removê-las comprometeria reedições.
- Testes `*.test.mjs`, scripts `browser-*-check.mjs` e ferramentas de diagnóstico são úteis para regressão, mesmo quando executados esporadicamente.

## Próximas etapas recomendadas
1. Rodar `npm test` e `npm run content:check` em um checkout local isolado antes de integrar.
2. Validar o login em desktop e celular; confirmar que o poster e vídeo v5 carregam corretamente e que o cache continua funcional.
3. Inventariar referências de assets por código estático, manifestos e carregamentos dinâmicos antes de propor novas exclusões.
4. Revisar `game/main.js` e `game/style.css` por domínios funcionais, com testes, sem refatorar tudo numa entrega só.
5. Não integrar automaticamente. Confirmar diferenças da branch e aprovação do dono.

**Limitações:** não houve execução local do jogo, de testes ou inspeção visual nesta auditoria feita pela API do GitHub. A ausência de referências em buscas é evidência limitada, e não prova geral de desuso.
