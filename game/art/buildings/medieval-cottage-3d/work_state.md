# Estado da revisão — 27/10/2026

- Pedido: melhorar de fato a arquitetura no Blender e deixar caminho obrigatório para futuras revisões feitas por outro modelo.
- Arte atual: revisão 2, saltbox assimétrica, cedro, reboco/pedra, porta coberta, única janela livre, pilares/cobertura em camadas com ordenação do runtime.
- Fonte reproduzível: `scripts/blender/build-medieval-cottage.py`; normalização PNG em `scripts/blender/cottage_pixels.py`.
- Comando build/check: `npm run art:cottage:build` e `npm run art:cottage:check`.
- Última checagem: fonte/exports SHA-256, Blender reaberto e auditado, 32 testes de edifício/colisão, conteúdo (385 definições/21 arquivos) e Chromium isolado desktop/celular aprovados.
- Malha: 45.544 triângulos offline; zero degenerados, UVs colapsados, arestas nulas ou não-manifold. Runtime: 5 PNGs, 134.766 bytes comprimidos, 2.048.000 bytes RGBA.
- Evidências: `logs/cottage-art-revision/`; antes preservado em `before/`, galeria atual em `cottage-multiview-contact-sheet.png`.
- Roteiro novo: `docs/content/BLENDER-ASSET-WORKFLOW.md`; skill `.agents/skills/clareira-blender-assets/SKILL.md`; ambos vinculados ao AGENTS.md.
- Suíte geral: incompleta após 8m25s e duas falhas, interrompida no caso de 200 conexões sem progresso. Ambas as falhas passaram isoladamente; 32 testes Python passaram. Evidência: `logs/cottage-art-revision/full-suite-status.json`.
- Mapa real aprovado: visitante caminhou até a cabana após sceneReady, cliente e servidor coincidiram, toque moveu o personagem, sem erro JS. Capturas desktop/celular e resultado em logs/cottage-art-revision/browser/live-cottage-*.
- Metadado legado de cobertura `thatch` ainda pode existir no catálogo persistido/fallback; arte autorada agora é cedro. Não substituir overrides do PostgreSQL por seed.
- Entrega encerrada: arte e roteiro registrados. Futuras revisões devem seguir o guia e a skill; a suíte geral continua registrada como incompleta, não como aprovada.
