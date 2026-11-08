# Pendências de quartos e objetos

Este documento mantém decisões adiadas visíveis para que mudanças no catálogo e na arquitetura não as tratem como resolvidas.

## Capacidade publicada das construções

- [ ] Conferir cabana por cabana: quartos anunciados, planta interna caminhável, entradas e área externa correspondente.
- [ ] Conferir o hotel, cuja contagem anunciada está na casa das dezenas, comparando cada unidade com a planta e com o perímetro real do edifício.
- [ ] Definir se “quartos” significa unidades alugáveis, camas ou cômodos internos; exibir esse mesmo significado na interface e nos dados.
- [ ] Atualizar contagens e descrições apenas depois da auditoria de área externa/interior e de uma validação visual no jogo.

## Interação e iluminação dos objetos fixos

- [ ] Dar à lareira estado `enabled` por instância, interação do proprietário, animação sincronizada e persistência no mesmo fluxo dos móveis colocáveis.
- [ ] Validar visualmente sombras de móveis e personagens em quartos claros e escuros, inclusive obstáculos altos e objetos apoiados.
- [ ] Validar a transição gradual da luz de janela ao amanhecer/anoitecer e a vista exterior escura durante a noite.

## Economia entre dimensões

- [ ] Restringir o catálogo local à afinidade nativa da dimensão e mostrar ao jogador quando um objeto veio de outra dimensão.
- [ ] Definir obtenção rara, transporte e registro de proveniência de objetos importados.
- [ ] Projetar lojas de jogadores, ofertas ao mercador, preço mínimo e concorrência quando houver comércio implementado.
- [ ] Permitir preço alto para item raro importado, com informação clara de origem e disponibilidade; não criar compra local fictícia quando o catálogo da dimensão não vende o item.

As propriedades de afinidade e comércio presentes nos 200 móveis são dados de planejamento. Elas não constituem um mercado implementado.
