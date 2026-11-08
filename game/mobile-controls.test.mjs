import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, css, main] = await Promise.all([
  readFile(new URL('./index.html', import.meta.url), 'utf8'),
  readFile(new URL('./style.css', import.meta.url), 'utf8'),
  readFile(new URL('./main.js', import.meta.url), 'utf8'),
]);

test('touch controls keep interaction and toggle-running visible while grouping secondary actions', () => {
  const controls = html.match(/<div class="touch-actions">([\s\S]*?)<\/div>\s*<\/details>\s*<\/div>/)?.[1] || '';
  const emotes = [...controls.matchAll(/data-action="emote" data-emote="([^"]+)"/g)].map(match => match[1]);

  assert.deepEqual(emotes, ['wave', 'dance', 'sit']);
  assert.match(html, /<div class="mobile-primary-actions" role="group" aria-label="Ações principais">[\s\S]*?data-action="context"[^>]*>Usar<\/button>[\s\S]*?data-run-toggle aria-pressed="false"[^>]*>Correr<\/button>/);
  assert.doesNotMatch(controls, /data-action="context"|data-run-toggle/);
  assert.match(controls, /data-action="share"/);
  assert.match(controls, /<summary>Interações sociais<\/summary>/);
  assert.match(controls, /<summary>Ferramentas e construção<\/summary>/);
  assert.match(controls, /<summary>Movimento e gestos<\/summary>/);
  assert.match(main, /run:\(keys\.has\('Shift'\)\|\|touchRunEnabled\)&&moving&&!crouch/);
  assert.match(main, /touchRunEnabled = !touchRunEnabled/);
  assert.match(main, /aria-pressed', String\(touchRunEnabled\)/);
  assert.match(main, /if \(key === 'e' \|\| key === 'E'\) action\('context'\)/);
  assert.doesNotMatch(main, /keyboard-context/);
  assert.doesNotMatch(html, /data-move=/);
  assert.match(html, /<details class="mobile-actions-menu">/);
  assert.match(html, /Toque no chão para caminhar/);
  assert.match(css, /mobile-actions-menu:not\(\[open\]\)>\.touch-actions\{display:none\}/);
  assert.match(css, /-webkit-user-select:none;user-select:none;-webkit-touch-callout:none/);
  assert.match(css, /input,textarea,\[contenteditable="true"\]\{-webkit-user-select:text;user-select:text\}/);

});

test('long action notices wrap inside the mobile game canvas', () => {
  const toast = css.match(/\.toast\{([^}]*)\}/)?.[1] || '';

  assert.match(toast, /white-space:normal/);
  assert.match(toast, /text-align:center/);
  assert.match(toast, /max-width:90%/);
});

test('o letreiro do recurso funciona com toque e teclado e traz a assinatura gravada', () => {
  const resourceDrawing = main.match(/function drawResource\([\s\S]*?\n\}/)?.[0] || '';

  assert.match(resourceDrawing, /const label = 'COLETAR'/);
  assert.doesNotMatch(resourceDrawing, /E PEGAR/);
  assert.match(resourceDrawing, /CLAREIRA\.signature\.ember/);
  assert.match(resourceDrawing, /CLAREIRA\.signature\.leaf/);
});
