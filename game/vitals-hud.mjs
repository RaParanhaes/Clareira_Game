// Barra de vida discreta e aviso de desmaio. A lógica é pura; o DOM só recebe o resultado.
export const FAINT_TEXT = 'Você desmaiou… respire.';
export const wakeText = dimensionId => dimensionId === 'surface'
  ? 'Você desmaiou… acordou na vila. Nada se perdeu.'
  : 'Você desmaiou… acordou no ponto de partida. Nada se perdeu.';

// prev: estado visual do quadro anterior. Retorna o próximo estado visual.
export function vitalsHudState(prev, vitals, { dimensionId = 'surface' } = {}) {
  if (!vitals || !Number.isFinite(vitals.max) || vitals.max <= 0) {
    return { visible: false, downed: false, hp: 0, max: 0, ratio: 0, message: '', hurt: false, full: false };
  }
  const downed = Number(vitals.downedMs) > 0;
  const hp = Math.max(0, Math.min(vitals.max, Math.round(vitals.hp)));
  const hurt = Boolean(prev) && hp < prev.hp && !downed;
  let message = '';
  if (downed) message = FAINT_TEXT;
  else if (prev?.downed) message = wakeText(dimensionId);
  return { visible: true, downed, hp, max: vitals.max, ratio: hp / vitals.max, message, hurt, full: hp >= vitals.max };
}

export function createVitalsHud(root) {
  if (!root) return { update() {} };
  const fill = root.querySelector('.vitals-fill'), label = root.querySelector('.vitals-label'), note = root.querySelector('.vitals-note');
  let prev = null, hurtFrame = 0;
  note.addEventListener('animationend', () => { note.hidden = true; note.classList.remove('is-timed'); });
  return {
    update(vitals, context) {
      const state = vitalsHudState(prev, vitals, context);
      prev = state;
      root.hidden = !state.visible;
      if (!state.visible) return state;
      root.classList.toggle('is-full', state.full);
      root.classList.toggle('is-low', state.ratio <= .3);
      root.classList.toggle('is-downed', state.downed);
      fill.style.width = `${Math.round(state.ratio * 100)}%`;
      label.textContent = `${state.hp}/${state.max}`;
      root.setAttribute('aria-label', `Vida ${state.hp} de ${state.max}`);
      if (state.hurt) {
        // Reinicia a animação CSS (.is-hurt) sem temporizador: remove, força um quadro e recoloca.
        root.classList.remove('is-hurt');
        cancelAnimationFrame(hurtFrame);
        hurtFrame = requestAnimationFrame(() => root.classList.add('is-hurt'));
      }
      if (state.message) {
        // O recolhimento do aviso é uma animação CSS (.is-timed); caído, o aviso fica até acordar.
        note.textContent = state.message;
        note.hidden = false;
        note.classList.remove('is-timed');
        if (!state.downed) requestAnimationFrame(() => note.classList.add('is-timed'));
      }
      return state;
    },
  };
}
