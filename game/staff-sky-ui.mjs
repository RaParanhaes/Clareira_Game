// Owner-only sky controls inside the in-game staff tools. The form only builds a
// request; the server checks the owner permission, validates the value and saves it.
export function createStaffSky({ dialog, panels, sendCommand, capabilities, generation }) {
  const $ = id => dialog.querySelector(`#${id}`);
  const section = $('staff-tools-sky'), open = $('staff-sky-open');
  const form = $('staff-sky-form'), feedback = $('staff-sky-status');
  const control = $('staff-sky-control');
  const fields = {
    hour: $('staff-sky-field-hour'), weather: $('staff-sky-field-weather'),
    level: $('staff-sky-field-level'), color: $('staff-sky-field-color'),
  };
  const levelLimits = { sunIntensity: [0, 2, 1], moonIntensity: [0, 1, 0.5], darkness: [0, 1, 0.6] };
  const levelNames = { sunIntensity: 'Intensidade do sol', moonIntensity: 'Intensidade da lua', darkness: 'Escuridão da noite' };
  let pending = false;

  // Shows only the value field that the chosen control needs.
  function syncFields() {
    const key = control.value;
    fields.hour.hidden = key !== 'hour';
    fields.weather.hidden = key !== 'weather';
    fields.color.hidden = key !== 'moonColor';
    fields.level.hidden = !levelLimits[key];
    if (levelLimits[key]) {
      const [min, max, value] = levelLimits[key];
      const input = fields.level.querySelector('input');
      input.min = String(min); input.max = String(max); input.step = '0.05'; input.value = String(value);
      fields.level.querySelector('span').textContent = levelNames[key];
    }
  }
  control.addEventListener('change', syncFields);

  // Builds the override the server expects, from what is on the form.
  function buildOverride() {
    const key = control.value, scope = form.elements.scope.value;
    if (key === 'hour') return { key, value: Number(fields.hour.querySelector('input').value), scope };
    if (key === 'weather') {
      const kind = fields.weather.querySelector('select').value;
      return { key, value: { kind, intensity: Number(fields.weather.querySelector('input').value), extremeSun: fields.weather.querySelector('input[name=extremeSun]').checked }, scope };
    }
    if (key === 'moonColor') return { key, value: fields.color.querySelector('input').value, scope };
    return { key, value: Number(fields.level.querySelector('input').value), scope };
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (pending || !capabilities()?.setSky) return;
    let override;
    try { override = buildOverride(); }
    catch (error) { feedback.textContent = error.message; return; }
    pending = true;
    const serial = generation();
    sendCommand({ type: 'action', name: 'setSkyOverride', override });
    feedback.textContent = 'Ajuste enviado. A confirmação aparece no jogo.';
    setTimeout(() => { if (serial === generation()) pending = false; }, 800);
  });

  $('staff-sky-clear').addEventListener('click', () => {
    if (!capabilities()?.setSky) return;
    sendCommand({ type: 'action', name: 'clearSkyOverrides' });
    feedback.textContent = 'Removendo os ajustes do céu.';
  });

  open.addEventListener('click', () => { feedback.textContent = ''; panels.navigate('sky'); });
  $('staff-sky-back').addEventListener('click', () => panels.navigate('home'));

  return {
    // Shows the entry button only to the owner; the route decides the section.
    sync(route) {
      open.hidden = !capabilities()?.setSky;
      section.hidden = route !== 'sky';
      if (route === 'sky') syncFields();
    },
  };
}
