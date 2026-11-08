// The portrait viewport follows the film's three short wildlife events, then
// returns to its original framing before the loop boundary.
const KEYS = Object.freeze([
  [0,72,1],[2,72,1],[3,32,1],[8,32,1],[9,72,1.15],
  [16,72,1.15],[17,15,1.3],[25,15,1.3],[27,72,1],[30,72,1],
]);

export function getLoginFilmFraming(seconds) {
  const time = Number.isFinite(seconds) ? ((seconds % 30) + 30) % 30 : 0;
  let index = 0;
  while (index < KEYS.length - 2 && time > KEYS[index + 1][0]) index++;
  const first = KEYS[index], last = KEYS[index + 1];
  let progress = Math.max(0, Math.min(1, (time - first[0]) / (last[0] - first[0])));
  progress = progress * progress * (3 - 2 * progress);
  const position = first[1] + (last[1] - first[1]) * progress;
  const scale = first[2] + (last[2] - first[2]) * progress;
  return { position, scale, translateY: -(scale - 1) * 50 };
}
