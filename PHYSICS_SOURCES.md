# Fontes rápidas de física e loop de jogo

Use estas referências quando surgir um sintoma concreto. Leia apenas a seção que responde à pergunta e registre a aplicação e o teste; não transforme isso em uma pesquisa longa.

- **Movimento com colisão e deslizamento:** [Rapier — Character controller (JavaScript)](https://rapier.rs/docs/user_guides/javascript/character_controller/). Útil se o personagem atravessar obstáculos, prender nas quinas ou precisar subir pequenas inclinações. A documentação cobre forma do controlador, movimento corrigido e tratamento de colisões.
- **Velocidade independente do FPS:** [Gaffer on Games — Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/). Útil se a velocidade variar entre computadores ou a simulação ficar instável. A ideia central é acumular tempo e avançar a simulação em passos fixos, limitando o trabalho atrasado por quadro.
- **Loop e ciclo de vida no navegador:** [MDN — Anatomy of a video game](https://developer.mozilla.org/en-US/docs/Games/Anatomy). Útil se animação, entrada e renderização dessincronizarem ou consumirem recursos quando a aba perde foco.

Essas fontes são pontos de partida, não uma ordem para adicionar bibliotecas. Para um defeito simples, prefira a correção menor que os testes sustentem. Só introduza um motor físico se uma limitação reproduzível justificar o custo e a migração.
