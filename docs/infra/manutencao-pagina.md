# Página de manutenção do preview

## O que é
Página que o preview mostra enquanto o jogo está sendo atualizado. Fica em `infra/manutencao/index.html`, com os arquivos de imagem em `infra/manutencao/assets/`.

## Comportamento
- Mostra o cartão de manutenção (título, medalhão com símbolo de ferramentas, mensagens que mudam e carregamento infinito).
- Verifica o jogo a cada 8 segundos. Se o servidor responder sem o cabeçalho `x-clareira-maintenance`, a página recarrega e o jogo volta.
- O recarregamento só acontece depois que a página viu a manutenção. Assim, abrir a página fora da manutenção não cria um laço de recarregamento.

## Fluxo de atualização (planejado)
1. O timer `clareira-preview-update` verifica o `main` no GitHub.
2. Se houver atualização, liga a página de manutenção nas portas do preview.
3. Atualiza o checkout a partir do `main` do GitHub.
4. Copia `infra/manutencao/` do checkout para a pasta servida pela manutenção.
5. Desliga a manutenção, liga o jogo e confere a saúde.
6. Se a saúde falhar, a manutenção continua no ar.

A cópia do passo 4 e a troca da página de manutenção na VPS precisam de backup do arquivo anterior e de um caminho de reversão.

## Mudar o texto
O texto do cartão está no HTML. Para outro tipo de aviso, use a documentação de avisos em `docs/ui/avisos-e-paineis.md`.
