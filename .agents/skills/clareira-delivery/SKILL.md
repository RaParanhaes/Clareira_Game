---
name: clareira-delivery
description: Desenvolver e validar uma fatia jogável ou revisão visual da Clareira em Canvas 2D, com física compartilhada, multiplayer e preview da VPS. Use nos ciclos deste repositório.
---

# Entregas da Clareira

Este projeto usa Canvas 2D, DOM e Node/WebSocket. Exemplos de Unity/Godot nas outras skills são princípios, não bibliotecas ou APIs disponíveis. Não migre a engine para realizar uma fatia.

## Movimento e arte verificáveis

- Para locomoção, consulte raster-avatar.mjs, locomotion.mjs e a projeção existente antes de editar. O atlas raster aprovado é a única fonte do corpo e das roupas; não monte um segundo personagem com peças anatômicas nem mantenha um renderer de reserva. Pés apoiados devem permanecer estáveis durante a fase de apoio; o avanço vem da física, não de deslocar o corpo visual fora da colisão. Oito direções, personalização e transições são parte do comportamento, não oito tarefas cosméticas separadas.
- Compare a mesma cena/posição/aparência antes e depois. Para movimento, capture uma sequência no começo, meio e fim da ação; uma imagem parada não comprova fluidez. Teste parada/inversão, corrida, agachar, sentar/levantar e salto pertinentes à mudança. Inspecione rosto e sobreposição de membros em diagonais.
- Para relevo, o dono rejeitou rampas/escadas artificiais no bosque. Use alturas contínuas compartilhadas por projeção, clique e colisão. Degraus construídos são apropriados dentro da casa.
- Para materiais/luz, preserve escala inteira dos pixels. Luz dinâmica e sombras dependem das fogueiras reais; texturas e geometria estáticas podem usar cache. Evite ruído por pixel em cada quadro. Distinga ganho medido de FPS de impressão visual.

## Cliente, VPS e validação

Servidor valida física, recursos, móveis, propriedade e persistência. Cliente desenha e interpola. Não envie imagens renderizadas pelo servidor nem aumente frequência de snapshots para esconder animação incorreta. Preserve coleções compactas e previsão com confirmação.

Use o navegador instalado: `/opt/clareira-browser/node_modules/playwright-core/index.mjs`, Chromium `/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome`, `--no-sandbox`. Scripts de navegador já existentes em `scripts/browser-*.mjs` fornecem sessões, captura e inspeção; adapte só o cenário necessário. Testes e Chromium rodam em sequência para evitar competição por CPU. Uma falha de destino bloqueado por árvore não prova erro de pathfinding; verifique o destino contra física antes de trocar testes.

As regras de preview, resultado e escopo ficam em AGENTS.md. A prioridade fica em DELIVERY_PLAN.md. Não complete o marco por testes aprovados: demonstre o comportamento ao jogador. Registre progresso parcial antes de esgotar a janela para que o próximo ciclo retome código útil, e registre problemas concretos em vez de reiniciar a revisão inteira.
