// Decorative video is loaded only once the login is visible. It never gates
// cache verification, session recovery, or the form becoming interactive.
import { getLoginFilmFraming } from './login-film-framing.mjs';

let controls;

function loginControls() {
  if (controls) return controls;
  const video = document.querySelector('#auth-scene-video');
  const button = document.querySelector('#auth-animation-toggle');
  if (!video || !button) return null;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const portrait = matchMedia('(max-width: 740px)');
  const resetFraming = () => {
    video.style.removeProperty('object-position');
    video.style.removeProperty('transform');
  };
  const updateFraming = () => {
    if (!portrait.matches || preference.matches || video.dataset.framing !== 'wildlife') { resetFraming(); return; }
    const framing = getLoginFilmFraming(video.currentTime);
    video.style.objectPosition = `${framing.position.toFixed(3)}% center`;
    video.style.transform = `translateY(${framing.translateY.toFixed(3)}%) scale(${framing.scale.toFixed(4)})`;
  };
  for (const event of ['timeupdate', 'seeked', 'loadedmetadata']) video.addEventListener(event, updateFraming);
  if (typeof portrait.addEventListener === 'function') portrait.addEventListener('change', updateFraming);
  else portrait.addListener?.(updateFraming);
  let saved;
  try { saved = localStorage.getItem('clareira:login-animation'); } catch {}
  let enabled = saved === 'on' || (saved !== 'off' && !preference.matches && !navigator.connection?.saveData);
  let visible = false;
  let generation = 0;
  const updateButton = () => {
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Pausar animação da cena' : 'Ativar animação da cena');
    button.title = enabled ? 'Pausar animação da cena' : 'Ativar animação da cena';
    button.querySelector('[data-animation-icon]').textContent = enabled ? 'Ⅱ' : '▶';
    button.querySelector('span').textContent = enabled ? 'Pausar' : 'Animar';
  };
  const play = () => {
    const attempt = ++generation;
    if (!enabled || !visible || document.hidden) { video.pause(); return; }
    video.muted = true;
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    void video.play().catch(() => {
      if (attempt !== generation) return;
      enabled = false;
      updateButton();
    });
  };
  video.addEventListener('playing', () => {
    if (enabled && visible && !document.hidden) video.dataset.playing = 'true';
    else video.pause();
  });
  video.addEventListener('error', () => {
    delete video.dataset.playing;
    resetFraming();
    enabled = false;
    updateButton();
  });
  button.addEventListener('click', () => {
    enabled = !enabled;
    saved = enabled ? 'on' : 'off';
    try { localStorage.setItem('clareira:login-animation', saved); } catch {}
    if (enabled && video.error) { video.removeAttribute('src'); video.load(); }
    updateButton();
    play();
  });
  const preferenceChanged = () => {
    updateFraming();
    if (saved === 'on' || saved === 'off') return;
    enabled = !preference.matches && !navigator.connection?.saveData;
    updateButton(); play();
  };
  if (typeof preference.addEventListener === 'function') preference.addEventListener('change', preferenceChanged);
  else preference.addListener?.(preferenceChanged);
  document.addEventListener('visibilitychange', play);
  updateButton();
  controls = {
    show() { visible = true; play(); },
    hide() { visible = false; play(); },
  };
  return controls;
}

export function startLoginAnimation() { loginControls()?.show(); }
export function stopLoginAnimation() { controls?.hide(); }
