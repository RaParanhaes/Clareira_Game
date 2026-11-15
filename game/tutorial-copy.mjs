// Textos do tutorial do Breu, da chegada ao bosque e das fichas de ferramenta.
// Cada texto tem uma variante para teclado e outra para toque.

const pick = (touch, keys, tap) => (touch ? tap : keys);

export function arrivalTutorialSteps({ touch = false } = {}) {
  return {
    welcome: ['O BREU', 'A chama despertou',
      pick(touch,
        'Clique no chão para se aproximar. Para seguir sem tutorial, caminhe para a escuridão.',
        'Toque no chão para se aproximar. Para seguir sem tutorial, caminhe para a escuridão.')],
    lesson: ['LIÇÃO · 01', 'Movimento',
      pick(touch,
        'Use W, A, S, D, as setas ou clique no chão. Dê alguns passos para a fogueira mostrar a próxima lição.',
        'Toque no chão para andar. Dê alguns passos para a fogueira mostrar a próxima lição.')],
    chat: ['LIÇÃO · 02', 'Sua primeira mensagem',
      'Escreva uma mensagem no campo que apareceu. Pode dizer: “A chama me guia.”'],
    appearance: ['LIÇÃO · 03', 'Seu personagem',
      pick(touch,
        'Abra Jogador e escolha Aparência do personagem. Mude uma opção e aplique para seguir.',
        'Toque em Menu, abra Jogador e escolha Aparência do personagem. Mude uma opção e aplique para seguir.')],
    find: ['LIÇÃO · 04', 'Um pequeno presente',
      pick(touch,
        'A fagulha deixou um galho e uma folha no chão. Aproxime-se do brilho e clique nele para recolher.',
        'A fagulha deixou um galho e uma folha no chão. Aproxime-se do brilho e toque nele para recolher.')],
    ready: ['CAMINHO ABERTO', 'O Bosque das Brasas',
      'A fagulha deixou um galho e uma folha. O teletransporte para o bosque já está começando.'],
  };
}

export const ARRIVAL_TUTORIAL_FALLBACK = ['PRÓLOGO', 'O Breu',
  'Aproxime-se da fogueira para aprender ou caminhe para a escuridão para seguir.'];

// Aviso curto ao chegar ao bosque depois do tutorial. O passo a passo da
// fabricação fica no guia próprio; aqui só dizemos onde o jogador está.
export function forestArrivalNotice() {
  return 'Você chegou ao Bosque das Brasas. Junte galhos, pedras e cipós pelo chão: com eles nascem suas primeiras ferramentas.';
}

// Textos de "usar" das fichas de ferramenta do Inventário.
export function toolUseText(itemId, { touch = false } = {}) {
  const tool = itemId === 'knife' ? 'knife' : /Axe$/.test(itemId) ? 'axe' : /Pickaxe$/.test(itemId) ? 'pickaxe' : null;
  if (tool === 'knife') {
    return pick(touch,
      'Selecione na barra e use E perto dos cipós para coletá-los.',
      'Selecione na barra e toque em Usar perto dos cipós para coletá-los.');
  }
  if (tool === 'axe') {
    return pick(touch,
      'Selecione na barra e use H perto de árvores ou toras.',
      'Selecione na barra e toque em Usar perto de árvores ou toras.');
  }
  if (tool === 'pickaxe') {
    return pick(touch,
      'Selecione na barra e use H perto de um veio de minério.',
      'Selecione na barra e toque em Usar perto de um veio de minério.');
  }
  return null;
}
