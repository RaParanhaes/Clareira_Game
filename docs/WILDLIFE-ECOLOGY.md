# Fauna do bosque

A vila é uma área de chegada e circulação. A fauna vive nas bordas e no bosque:
nenhum animal nasce ou circula no raio de 12 tiles da fogueira nem a menos de
4 tiles das construções. O critério também vale para os abrigos.

Cada região de 24×24 tiles recebe uma família de até dois animais; urso,
leopardo e águia começam solitários. O teto compartilhado é 60 por dimensão,
e cada família cresce até quatro. As regiões visitadas não ficam repondo
animais abatidos imediatamente. Famílias compartilham o mesmo abrigo, inclusive
os filhotes. A posição do abrigo é determinística para a mesma região e terreno;
a população e seus estados continuam em memória, como antes.

## Lugares

- Árvores e mata: tocas, raízes, ocos, moitas, ninhos e covis.
- Rochas: refúgios de leopardos/ursos e pedras usadas por cobras.
- Margens rasas: sapos, com refúgio em terra junto à água.
- Campos abertos: cavalos e gnus, com leito de capim.
- Vacas, bois e touros ficam fora da geração aleatória enquanto não existe
  uma fazenda/curral implementado. Suas espécies e regras continuam no catálogo.
- Predadores grandes só são elegíveis em regiões a pelo menos 32 tiles da
  chegada e com mata ou rochas compatíveis. Sem local adequado para o abrigo,
  não se cria o animal.

## Rotina no relógio do jogo

O dia do jogo dura 24 minutos. Diurnos ficam ativos entre 6h e 19h; noturnos,
entre 19h e 6h; crepusculares, entre 5h–9h e 17h–21h. Fora desse período,
retornam ao abrigo e só param para dormir ao chegar. O sono recupera energia.
Perigo percebido, provocação ou fome urgente pode interromper o descanso.
Animais em tocas/ninhos ficam recolhidos; animais de campo deitam. Um animal
recolhido não bloqueia a passagem e não pode ser atacado através do abrigo.

## Defesa e limites

Presas fogem de ameaças percebidas; animais com defesa reagem à provocação.
Territoriais defendem a proximidade do abrigo, não qualquer trecho do mapa.
Aves protetoras defendem seus ninhos. Predadores caçam apenas as presas listadas
na espécie; ataques mantêm alcance, força e intervalo próprios. Alerta e ataque
recebem indicação visível. Fora da fuga, animais a mais de 12 tiles de casa
retornam ao abrigo, em vez de perseguir indefinidamente.

As regras são de jogo. Ainda cabem expansão de biomas, fazendas funcionais,
rotas de migração e animações próprias por golpe; esta entrega não as representa
como prontas.

## Abrigos discretos e protegidos

O servidor registra a árvore, rocha ou vegetação que dá cobertura a cada abrigo.
Entradas são afastadas das trilhas e mantêm acesso livre para o próprio animal.
Ninhos ficam na copa, sem pedestal; tocas/covis ficam entre raízes e folhagens;
refúgios de pedra usam uma rocha de apoio. A entrada só se revela a curta
distância, sem marcador ou sinal de sono visível de longe.

Um animal recolhido pode continuar descansando quando um predador ou visitante
passa do lado de fora. Ele não vira alvo através da cobertura. Ao começar seu
período ativo, sair por fome urgente ou sofrer uma provocação já registrada,
a proteção termina. Animais que dormem ao relento continuam sujeitos às ameaças.
