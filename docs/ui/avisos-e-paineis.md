# Avisos e painéis do jogo

Os avisos são uma família só: a mesma moldura e o mesmo papiro, com conteúdo diferente. A equipe (staff) monta o conteúdo; o sistema mostra.

## Dois lugares de aviso

| Lugar | Cenário | Exemplos |
|---|---|---|
| Fora do jogo | Cenário completo (bosque, lua, vagalumes) | Manutenção, atualização, notícias, lançamento, aviso da staff |
| Dentro do jogo | Só moldura e papiro, sobre a tela de jogo | Presente recebido, aviso da staff para uma pessoa, denúncia |

Painéis fora do jogo podem ter avisos com setas para passar entre páginas. Painéis dentro do jogo são pontuais: abrem, mostram uma mensagem e fecham com X, "Entendi" ou Esc.

## Símbolo do medalhão
- O medalhão do topo é opcional. Não há símbolo padrão.
- Manutenção usa o ícone de ferramentas (`icon-tools.png`), porque é o símbolo do sistema de manutenção.
- Qualquer outro aviso começa sem símbolo. A staff escolhe o símbolo ao montar o aviso, ou deixa vazio.
- Dentro do jogo, o espaço do símbolo é reservado (círculo tracejado) até o desenho definitivo.

## Área segura do papiro
- O texto fica dentro das quatro molduras de canto, com margem.
- Medida no palco 3:2: x de 34% a 66%, y de 38% a 68%.
- Em celular, o papiro vira um cartão com margem maior (21% em cima, 19% embaixo, 19% dos lados).

## Layout das notícias (painel fora do jogo)
- Grade de no máximo 2 linhas por 2 colunas. Três colunas ficou apertado.
- Opções válidas: 1 coluna e 1 linha; 1 coluna e 2 linhas; 2 colunas e 1 linha; 2 colunas e 2 linhas.
- Cada bloco ocupa uma célula (linha e coluna), podendo ocupar mais de uma.
- Alinhamento do bloco: esquerda, centro, direita ou justificado. Posição vertical: em cima, no meio ou embaixo.
- Tipos de bloco: texto (título e texto com formatação), imagem, link (botão) e HTML livre.
- Em celular, os blocos viram uma coluna só, na ordem de cima para baixo.

## Dados (a definir na implementação)
- Avisos e páginas são dados persistentes: ficam no PostgreSQL. O Redis só guarda presença e cache.
- Campos principais de um aviso: tipo (manutenção, atualização, notícia, lançamento, staff, presente, denúncia), título, páginas, símbolo, destino (todos ou uma pessoa), período de exibição.
- Avisos pessoais (presente, denúncia) são enviados pelo servidor quando o evento acontece (presente recebido, denúncia registrada). O cliente só mostra.

## Os modelos neste repositório
- `game/avisos-modelos/noticias.html`: painel fora do jogo, com setas, páginas e grade 2 x 2. O bloco `AVISO` no fim do arquivo é o conteúdo editável.
- `game/avisos-modelos/dentro-jogo.html`: aviso dentro do jogo, com faixa colorida por tipo (presente dourado, aviso azul, denúncia vermelha), símbolo reservado e X.
- A página de manutenção está em `infra/manutencao/` (branch `chore/infra-manutencao`).

## Pendências
- Editor da staff com arrastar e soltar para posicionar os blocos nas células.
- Desenho definitivo dos símbolos de presente, aviso da staff e denúncia.
- Logo de notícias (hoje o medalhão do painel de notícias está vazio).
- Integração com o servidor para avisos pessoais e para a manutenção.
