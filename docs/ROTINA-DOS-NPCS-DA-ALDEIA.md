# Rotina diária dos NPCs da aldeia: plano de etapas

Categoria: Personagem e NPCs (com partes de servidor e mundo). Status: proposta, aguardando confirmação das decisões abaixo.

## Decisões já tomadas (pelo dono)

- Seis camponeses existentes (Mara, Tomás, Lia, Bento, Noa e Ivo) são os primeiros NPCs com rotina.
- Venda: o NPC entra na recepção da vila e vende pelo preço da economia, que pode variar no mercado (`calculateDynamicQuote`). O dinheiro fica retido no NPC.
- Negociação com o NPC para os jogadores fica para depois.
- Movimento em ciclo simples, não IA complexa.
- Lenhador: uma árvore por dia, em ordem fixa, e volta à primeira ao fim da lista.
- Coletor: passa sempre pelos mesmos locais perto do bosque e coleta o que estiver lá, com alguma aleatoriedade.
- Fim do dia: o grupo vai até a fogueira. Poses variadas (sentado de frente, de costas, de lado, de pé). Pelo menos um acende a fogueira, no meio. Fogueira tem vida útil e pode ser reaproveitada se ainda estiver acesa.
- À noite, cada NPC vai para a sua casa e some. De manhã reaparece e começa as tarefas.

## Já existe no projeto

- Árvores cortadas voltam sozinhas, com prazo de retorno e estágios (toco, muda e árvore jovem). Não é preciso replantar.
- Fogueiras já têm vida útil e podem ser reacendidas.
- Carteira de jogadores (ouro, prata e bronze) e liquidação de venda para NPC no servidor.
- Roster de NPCs em `game/village-npcs.mjs` (hoje estático).

## Etapas

1. **Modelo de rotina**: estado por NPC (papel, tarefa do dia, progresso, carteira retida, casa). Teste de estado puro, sem servidor.
2. **Movimento e colisão**: NPC anda por pontos com o mesmo pathfinding do jogador, com corpo de mesmo raio, e bloqueia caminho como o jogador.
3. **Lenhador**: ciclo de árvores em ordem fixa, uma por dia. Corta a árvore, junta madeira e passa para a próxima no dia seguinte.
4. **Coletor**: rota fixa perto do bosque. Procura pedra e fruta em pontos fixos com alguma aleatoriedade e coleta.
5. **Venda na recepção**: o NPC vai à recepção e vende o estoque pelo preço da economia. O valor fica retido na carteira do NPC.
6. **Fim do dia e fogueira**: caminho até a fogueira, poses variadas e uma pessoa acende. Reaproveita fogueira ainda acesa.
7. **Noite**: cada NPC vai para casa e some. Reaparece na manhã seguinte.
8. **Validação**: testes de cada etapa, suíte completa e capturas do dia (manhã, tarde, fogueira e noite).

## Papéis (decisão do dono)

- **Lenhadores (3):** cortam árvores em ordem fixa, uma por dia.
- **Coletores (2):** pedra e fruta em pontos fixos perto do bosque, com alguma aleatoriedade.
- **Caçador (1):** caça os bichos perto da vila para pegar recursos.
- **Venda:** adiada. Por enquanto o estoque fica retido com o NPC. Quando a venda existir, ela segue o preço da economia na recepção.

## Decisões que faltam

- Quais árvores e pontos o lenhador e o coletor usam (proposta: árvores do bosque perto da vila).

## Critérios de aceite

- Os seis NPCs seguem a rotina por um ciclo completo de dia e noite, sem travar nem atravessar paredes.
- Nenhuma falha nova na suíte.
- Capturas do dia e da noite mostrando cada etapa.
