# Caminhada real: picos residuais de cliente e servidor

## Evidência correlacionada

Arquivo do jogador `clareira-desempenho _1_.json`, cruzado por **reportId exato** com quatro registros `game-performance-report` recebidos de 15:32:53 a 15:36:13 UTC em 29/10/2026. Não identificar sessões só por proximidade de horário. Evidência local: `logs/20261029-player-spikes/correlation.json`.

As quatro janelas somam 4,45 minutos e 16.513 intervalos de quadros. FPS agregado de 60,4 a 62,6; p95 de quadro 16,8 ms e p95 de desenho 4,9 a 5,6 ms. Foram 17 intervalos acima de 50 ms e um acima de 250 ms. A última janela apresenta drawMax 450,5 ms e tarefa longa de 491 ms, com duas viagens de dimensão. As etapas têm máximos de entidades 204,2 ms e efeitos 244,5 ms, mas o formato anterior **não comprova que esses máximos ocorreram no mesmo desenho**.

O histórico local contém apenas os últimos 59,6 segundos: FPS 59,9–64,4, desenho p95 2,9–5,3 ms, máximo de intervalo 33,4 ms; nenhuma pausa de 250 ms nessa parte final. Ping mediano 264,9 ms e máximo 804,6 ms, jitter mediano 79,7 ms. Fila prevista chegou a 46 entradas, fila de envio até um item. Memória JS oscilou entre 14,8 e 26,7 MiB; esse intervalo curto não comprova ausência de vazamento a longo prazo. Lightmaps ficaram em 33.142.984 bytes, sem trabalho pendente no trecho exportado.

## Servidor

No intervalo dos quatro relatórios, os ticks lentos registraram 210, 197, 208 e 108 ms. Dois concentraram 207,8/107,1 ms na fase de jogadores; outro concentrou 196,6 ms na fase de fauna, com 130,6 ms no movimento dos animais. Isso comprova pausas no servidor, mas não distingue sozinho algoritmo, coleta de lixo e contenção de CPU. Não atribuir todo o ping ao servidor nem à conexão do jogador.

A conexão encerrada às 15:37:20 tinha inputSeq=receivedSeq e fila zero. Código 1006 não identifica a causa; pode incluir fechamento/interrupção do navegador. O histórico exportado mantém uma reconexão acumulada, sem novo aumento nesse minuto. Os diagnósticos enviados em lote às 15:31:53 também contêm eventos persistidos antigos; não contá-los como várias novas quedas durante a caminhada analisada.

## Correção aplicada e próxima captura

Encontrada uma inconsistência concreta: `draw()` podia ser chamado por preparo, resize, zoom e conclusão de PNGs, mas o tempo total só era observado no ciclo principal. As etapas já eram observadas em todos os desenhos. Assim uma janela chegou a ter entidadesMax=174,2 ms e drawMax=22,7 ms, valores que não podiam ser interpretados como o mesmo conjunto de chamadas.

Agora o tempo total é observado no ponto central de desenho. Um desenho lento (≥50 ms) pode produzir um evento `render-spike` com suas próprias seis etapas, origem numérica, sequência, quantidade visível e fila de luz. Intervalo mínimo de cinco segundos; até 20 eventos no download local. O servidor reutiliza sanitização, fila, confirmação, persistência e limite existentes dos diagnósticos. Sem ID de objeto, personagem, posição ou texto do jogador. Origem: 0=ciclo normal, 1=preparo/revelação, 2=resize, 3=zoom.

Removido o desenho completo síncrono do callback de sprites: o ciclo RAF que já está ativo apresenta o asset pronto no próximo quadro. A prévia de Aparência continua atualizada. Não houve alteração de física, população de fauna, efeitos ou qualidade visual. Não alegar que essa remoção sozinha elimina o pico de 450 ms.

Próximo critério: identificar a etapa dominante **do mesmo pico**, incluindo chamadas fora de RAF; depois medir a função/categoria responsável antes de alterar renderização. No servidor, reproduzir/perfilar os ticks da fase de jogador/fauna antes de mudar frequência ou regras da simulação. As métricas normais já estão próximas do orçamento de 60 FPS; o alvo são os eventos raros.

## Validação da correção

25 testes focados passaram, inclusive medição por origem, etapas do mesmo desenho, limite dos eventos, sanitização, exportação e recuperação após exceção. Catálogo válido. A suíte completa chegou a 580 testes aprovados sem falha registrada antes de timeout de 300 s; não foi concluída.

No cenário controlado noturno CPU4×, cinco desenhos lentos chegaram ao JSON com fases próprias: preparação de 894,4 ms (origem1) e desenho posterior de 147,7 ms, dos quais 99,7 ms em entidades. São tempos artificiais do ambiente de teste, não do celular do dono; comprovam a captura, não melhora de FPS.

No preview público, móvel e desktop entraram, restauraram sessão, caminharam, exibiram métricas e baixaram JSON sem erros JS e com fila zero. Capturas inspecionadas. Arquivos de interface receberam alterações paralelas entre os dois testes; preservadas, com nova passagem dos 25 focados. Versões e limites constam em assessment.json. O servidor foi reiniciado e está aceitando render-spike.
