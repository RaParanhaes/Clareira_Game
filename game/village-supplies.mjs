// Pedras, gravetos, galhos fortes e cipós soltos num anel curto fora da vila, a poucos passos do ponto de chegada.
// O jogador nasce só com a faca: a primeira ferramenta pede pedra, galho forte e cipó, e a fogueira pede gravetos.
// Posições em coordenadas locais da vila (antes de DIMENSION_COORDINATE_OFFSET), todas rente às
// trilhas que saem do ponto de chegada, nunca sobre o piso das trilhas, de prédios ou de entradas.
// A geração soma uma folga determinística por semente e descarta o ponto que cair em água, árvore ou trilha.
export const VILLAGE_SUPPLY_JITTER = .35;
export const VILLAGE_SUPPLY_ANCHORS = Object.freeze([
  { kind: 'stone', x: 10.6, y: 15.6 },
  { kind: 'stone', x: 5.9, y: 17.6 },
  { kind: 'stone', x: 11.2, y: 19.8 },
  { kind: 'stone', x: 15.6, y: 11.8 },
  { kind: 'stone', x: 12.4, y: 17.0 },
  { kind: 'stone', x: 6.6, y: 21.2 },
  { kind: 'wood', x: 12.8, y: 7.2 },
  { kind: 'wood', x: 12.6, y: 8.4 },
  { kind: 'wood', x: 4.3, y: 16.6 },
  { kind: 'wood', x: 5.4, y: 23.0 },
  { kind: 'sturdyBranch', x: 11.0, y: 7.9 },
  { kind: 'sturdyBranch', x: 3.8, y: 18.6 },
  { kind: 'vines', x: 5.0, y: 20.4 },
  { kind: 'vines', x: 12.4, y: 18.8 },
].map(anchor => Object.freeze(anchor)));
