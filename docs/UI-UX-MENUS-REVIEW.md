# Revisão de menus e HUD

## Diagnóstico

A interface já tinha um menu vertical à esquerda, mas misturava identidade do jogador, dimensões, moedas e atalhos. Preferências ficavam dispersas: áudio e tela inteira no grupo de ações, zoom e aparência dentro de Jogador. A conversa permanecia no rodapé sem um atalho equivalente no menu.

O Inventário já se chamava assim e sua capacidade já crescia por páginas: 18 espaços por página, com marcos de nível 1, 5, 10, 15, 20 e 25. Os nove espaços de acesso rápido são uma faixa independente. A interface calcula e exibe páginas liberadas pelo nível; este redesenho preserva essas regras e os índices existentes.

## Mudança aplicada

- O menu lateral agrupa Inventário, Conversa, Configurações e Ajuda em destinos previsíveis.
- Conversa leva o foco ao campo já existente e recolhe o menu móvel, sem criar um segundo campo ou alterar mensagens.
- Configurações reúne somente controles que já existem: som, zoom da câmera, tela inteira e aparência.
- O Inventário abre como painel lateral no computador e gaveta inferior no celular, com área segura para a navegação do sistema.
- Mapa do mundo e viagens entre dimensões compartilham o menu Destinos: o mapa fica no topo e as dimensões aparecem abaixo; o atalho N e o minimapa continuam disponíveis.
- A barra rápida permanece no HUD durante o jogo; dentro do Inventário, os mesmos nove espaços continuam separados das páginas de armazenamento.
- Todos os painéis novos usam o controlador comum para fechar, Escape, foco e bloqueio de movimento.

## Por que essa organização

Destinos de uso frequente ficam num só lugar, enquanto preferências ficam juntas em uma área própria. Mapa e dimensões partilham uma entrada previsível, e o Teleporte Universal continua ligado ao mapa da dimensão atual. A conversa continua contextual ao mundo, e o atalho apenas leva o jogador ao campo que já existe. O Inventário cresce por progressão sem deslocar a barra rápida nem remapear itens salvos. No celular, a gaveta inferior mantém a cena como contexto e respeita a área segura.

## Próximas melhorias visuais

1. Conferir visualmente o menu unificado de mapa e dimensões no HUD, em computador e celular.
2. Conferir no jogo o destaque visual de página recém-liberada; o efeito já está ligado ao aviso de nível e respeita movimento reduzido.
3. Inspecionar leitura, foco por teclado, toque e sobreposição da cena em computador e celular antes de considerar a direção final.

## Estado da entrega

Alteração aplicada somente ao código-fonte do checkout canônico. A prévia `/dev/` não foi reiniciada; o desenho é uma proposta visual, não uma captura do jogo em execução.


## Revisão de Ferramentas e Configurações — 29/10/2026

Ferramentas tem opções com descrição, cabeçalho e fechamento separados da área de rolagem, formulário em duas colunas no desktop e uma coluna no celular. A revisão do ajuste mostra conta, operação, valor e motivo; o envio indica espera pelo servidor e bloqueia confirmação repetida. O histórico separa data, ação, responsáveis e motivo. Configurações tem textos maiores, controles de 44–46 px e saída de tela inteira com rótulo explícito.

O controlador retorna o foco ao mundo quando a origem da janela é a página ou um botão recolhido no menu móvel. Um toque nem sempre foca o botão acionado; por isso a origem precisa ser visível e focável antes de receber o foco novamente.

Validação: `scripts/browser-staff-tools-ui-check.mjs` usa respostas administrativas simuladas sem alterar carteiras reais. Cobre teclado, toque, bloqueio e retomada da caminhada, revisão sem envio, confirmação única, conteúdo de auditoria como texto e perda de permissão. Capturas atuais em `logs/20261029-tools-ui/`, com desktop 1440×900, celular 390×844, 320×640 e horizontal 844×390. A suíte geral encontrou falhas no teste de preparação de cena (`setTimeout` ausente no contexto do teste) e na retomada de saguão (`legacy`/`lobby`) e foi interrompida por SIGTERM antes da conclusão; não está aprovada.
