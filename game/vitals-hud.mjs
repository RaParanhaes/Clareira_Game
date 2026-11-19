// Barra de vida discreta, contagem do desmaio e aviso de morte. A lógica é pura; o DOM só recebe o resultado.
export const FAINT_TEXT = 'Você desmaiou… respire.';
export const WAKE_TEXT = 'Você se levantou…';
export const deathText = place => `Você caiu… e acordou ${place || 'na vila'}.`;

// prev: estado visual do quadro anterior. Retorna o próximo estado visual.
// vitals.downedMs: tempo restante do desmaio no instante do snapshot. vitals.deathSeq: conta as mortas.
export function vitalsHudState(prev, vitals) {
  if (!vitals || !Number.isFinite(vitals.max) || vitals.max <= 0) {
    return { visible: false, downed: false, died: false, hp: 0, max: 0, ratio: 0, message: '', kind: '', hurt: false, full: false, deathSeq: 0, downedMs: 0 };
  }
  const downedMs = Math.max(0, Number(vitals.downedMs) || 0);
  const downed = downedMs > 0;
  const hp = Math.max(0, Math.min(vitals.max, Math.round(vitals.hp)));
  const deathSeq = Number(vitals.deathSeq) || 0;
  const died = Boolean(prev) && deathSeq > (prev.deathSeq || 0);
  const hurt = Boolean(prev) && hp < prev.hp && !downed && !died;
  let message = '', kind = '';
  if (downed) message = FAINT_TEXT;
  else if (died) { message = deathText(vitals.deathPlace); kind = 'death'; }
  else if (prev?.downed) message = WAKE_TEXT;
  return { visible: true, downed, died, downedMs, deathSeq, hp, max: vitals.max, ratio: hp / vitals.max, message, kind, hurt, full: hp >= vitals.max };
}

// Segundos que faltam para levantar (10…1). Zero quando o tempo já passou e o servidor ainda não confirmou.
export const countdownSeconds = (untilMs, nowMs) => Math.max(0, Math.min(10, Math.ceil((untilMs - nowMs) / 1000)));

export function createVitalsHud(root) {
  if (!root) return { update() {} };
  const fill = root.querySelector('.vitals-fill'), label = root.querySelector('.vitals-label'), note = root.querySelector('.vitals-note');
  let prev = null, hurtFrame = 0, countFrame = 0, downedUntil = 0;
  note.addEventListener('animationend', () => { note.hidden = true; note.classList.remove('is-timed', 'is-death'); });

  // A contagem roda por requestAnimationFrame, não por temporizador: lê o relógio a cada quadro.
  const paintCountdown = () => {
    countFrame = 0;
    if (!prev?.downed) return;
    const left = countdownSeconds(downedUntil, performance.now());
    note.textContent = left > 0 ? `${FAINT_TEXT} ${left}` : FAINT_TEXT;
    if (left > 0) countFrame = requestAnimationFrame(paintCountdown);
  };

  return {
    update(vitals) {
      const state = vitalsHudState(prev, vitals);
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
      if (state.downed) {
        downedUntil = performance.now() + state.downedMs;
        cancelAnimationFrame(countFrame);
        paintCountdown();
        note.hidden = false;
        note.classList.remove('is-timed', 'is-death');
      } else if (state.message) {
        // Aviso de morte e de despertar: somem sozinhos pela animação CSS (.is-timed).
        note.textContent = state.message;
        note.hidden = false;
        note.classList.remove('is-timed', 'is-death');
        if (state.kind === 'death') note.classList.add('is-death');
        requestAnimationFrame(() => note.classList.add('is-timed'));
      }
      return state;
    },
  };
}
