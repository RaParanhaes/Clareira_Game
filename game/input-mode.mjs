// Modo de entrada do jogador: toque ou teclado. A consulta é a mesma que o
// style.css usa para mostrar os controles de toque (.mobile-input), então o
// texto e o layout nunca discordam.
export const TOUCH_INPUT_QUERY = '(max-width:740px), (any-pointer:coarse)';

export function isTouchInput(win = globalThis) {
  try {
    return Boolean(win?.matchMedia?.(TOUCH_INPUT_QUERY)?.matches);
  } catch {
    return false;
  }
}
