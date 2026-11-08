# Vila viva — filme de entrada v5

Pedido: MP4, 60 fps, pelo menos 20 segundos, emenda contínua; dragão intermitente,
coelho saindo da vegetação, cervo na ponte, água/folhas/fogo/luzes em movimento.

Entrega planejada: 30 s, 1.800 quadros, 1280×720, H.264/yuv420p/faststart,
um único vídeo decorativo em loop. O original sem dragão fixo é
`game/art/clareira-login-vila-v1.webp`; as variações de fogo aprovadas são da v4.

## Arte e prompts

Ferramenta: `image_gen` integrada, com a vila original como referência de estilo,
e `transparent_background=true`. Os três PNGs `*-source.png` são os resultados
originais preservados. Não há chamada a API paga ou gerador externo de vídeo.

Conjunto de prompts usado: produzir uma folha transparente regular de quatro
colunas e duas linhas, oito poses consecutivas, mesma identidade/proporção e
direção direita, pintura de fantasia noturna com luz âmbar e sombra azul, sem
texto/cenário/grade. Cada folha tem uma função:

- Dragão: oito fases de batida das asas, silhueta índigo distante, cabeça fina,
  duas asas membranosas e cauda longa; tronco alinhado entre poses.
- Cervo: oito fases de caminhada quadrúpede, quatro pernas anatômicas, mesmo
  apoio/escala, pelagem castanha e galhada pequena.
- Coelho: alerta, farejar, comprimir, impulsionar, esticar no salto, recolher,
  pousar e sentar; orelhas, patas e cauda completas e consistentes.

`prepare-login-v5.py` organiza os desenhos em atlas com pivôs estáveis, limpa
fragmentos transparentes entre células e ajusta suas cores à iluminação local.
`scene.js` compõe as poses sobre o cenário a cada 1/60 s, com posição contínua,
mistura premultiplicada, sombras de contato e máscaras de vegetação/corrimão.

## Sequência

| Tempo | Acontecimento |
| --- | --- |
| 3–8 s | Dragão atravessa o céu, com quatro batidas de asa, depois desaparece. |
| 9–16 s | Coelho aparece entre as plantas, salta, fareja e entra na vegetação. |
| 17–25 s | Cervo cruza a ponte, pausa com as patas apoiadas e continua. |
| 26,6–27,5 s | Uma estrela cadente discreta atravessa o céu. |

Fogo (2,5 s), água (5 s), folhas (10 s), luzes (5/6/10/15 s), fumaça
(5 s, defasada), vaga-lumes/estrelas (6 s), músico (1,25 s) e respiração da
raposa (5 s) têm períodos divisores de 30. Os três atores estão ocultos na emenda.
O compositor verifica igualdade exata dos estados em t=0 e t=30 antes do encode.
O MP4 usa QP 18 constante, mesma razão de qualidade I/P/B, sem quantização
adaptativa/psy e GOP de 1.800 quadros. Isso evita uma mudança de textura na emenda;
a auditoria também decodifica o primeiro e o último quadro do arquivo real.

## Reprodução e orçamento

- Uma instância de vídeo; fontes de autoria ficam fora da pasta pública `game/`.
- Até 12 MiB de transferência para o MP4 solicitado a 60 fps; poster até 600 KB.
  A revisão anterior tinha limite de 4 MiB e 30 fps; o orçamento novo prioriza
  preservar a textura na emenda, com tamanho real registrado na auditoria.
- Estimativa de superfícies do decoder: 32 MiB; sem atlas/Canvas no cliente.
- O vídeo é baixado após liberar o formulário e fica fora do cache verificado.
- Pausa ao entrar no jogo ou ocultar a aba. Movimento reduzido/economia de dados
  mantêm o poster, com ativação explícita disponível.
- No celular, o recorte acompanha os três eventos e retorna à posição inicial.
  Atualiza com eventos de mídia; não cria outro loop de requestAnimationFrame.

## Reproduzir e validar

```sh
python3 scripts/prepare-login-v5.py
node scripts/render-login-v5.mjs --preview
node scripts/render-login-v5.mjs
python3 scripts/validate-login-v5.py
node scripts/browser-login-film-check.mjs logs/login-v5/live
node scripts/browser-login-animation-check.mjs logs/login-v5/controls
```

Evidências em `logs/login-v5/`: quadros de eventos, auditoria de mídia/emenda,
capturas desktop/celular, comparação controlada v4/v5 e limitações do Chromium
sem GPU. FPS do arquivo não certifica 60 fps de reprodução em aparelhos físicos.
