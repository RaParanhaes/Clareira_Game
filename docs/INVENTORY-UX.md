# Experiência do Inventário e acesso rápido

## Organização

O nome visível é **Inventário**. A barra de acesso rápido ocupa nove espaços próprios e continua fixa durante a exploração. O armazenamento começa com uma página de 18 espaços no nível 1; cada nova página soma 18 espaços e é liberada nos níveis 5, 10, 15, 20 e 25. A progressão chega a seis páginas de armazenamento no nível 25, sem deslocar os nove espaços rápidos.

## Uso

- Selecionar um item mostra seu nome, quantidade, categoria e a dica de uma ação existente.
- O botão contextual equipa, guarda ou consome o item, conforme o que ele faz no jogo.
- Arrastar e soltar troca espaços no computador; no toque, selecionar a origem e depois o destino faz a mesma troca.
- Alterações aguardam a resposta do servidor, que valida e salva slots, item ativo e quantidades.
- Atributos e técnicas aprendidas aparecem em seções próprias; pontos disponíveis são indicados junto ao atalho do Inventário.
- Itens recebidos ou produzidos não são descartados quando a capacidade está cheia.

## Progressão de páginas

A capacidade de armazenamento é determinada pelo nível salvo no progresso do personagem: nível 1 libera a página 1; níveis 5, 10, 15, 20 e 25 liberam, respectivamente, as páginas 2 a 6. A barra de nove espaços é independente e não consome páginas de armazenamento. Se uma elevação de nível liberar várias páginas, o aviso informa quais foram abertas.

## Segurança das poções de XP

As quatro poções são raras, têm limite de quantidade carregada e receitas com ingredientes e tempos de preparo crescentes. O jogador só recebe XP ao usá-las. A confirmação de consumo deixa a poção no Inventário por padrão e informa o XP, o nível que pode alcançar e o XP que ultrapassaria o nível máximo.

## Estado e revisão pendente

O código-fonte do checkout canônico aplica esse fluxo e conserva o Inventário após reconexão de contas. As alterações desta entrega ainda não foram reiniciadas no preview /dev/; a revisão visual e de uso em computador e celular continua pendente.