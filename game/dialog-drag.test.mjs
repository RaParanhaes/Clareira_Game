import assert from 'node:assert/strict';
import test from 'node:test';
import { attachDialogDrag, clampDialogPosition, DIALOG_DRAG_HANDLE } from './dialog-drag.mjs';

test('o diálogo fica sempre dentro da tela com margem', () => {
  const size = { width: 600, height: 400, viewportWidth: 1000, viewportHeight: 700 };
  assert.deepEqual(clampDialogPosition({ ...size, left: 120, top: 80 }), { left: 120, top: 80 });
  assert.deepEqual(clampDialogPosition({ ...size, left: -50, top: -20 }), { left: 8, top: 8 });
  assert.deepEqual(clampDialogPosition({ ...size, left: 900, top: 900 }), { left: 392, top: 292 });
});

test('um diálogo maior que a tela ainda mantém a margem superior e esquerda', () => {
  assert.deepEqual(clampDialogPosition({ width: 1200, height: 900, viewportWidth: 800, viewportHeight: 600, left: 50, top: 50 }), { left: 8, top: 8 });
});

test('em telas de toque o arrasto não é ligado', () => {
  let listeners = 0;
  const doc = { addEventListener: () => { listeners += 1; }, removeEventListener: () => {} };
  attachDialogDrag(doc, { matches: query => query !== '(pointer: fine)' });
  assert.equal(listeners, 0);
});

test('no PC o arrasto escuta o cabeçalho dos diálogos, não os botões', () => {
  const events = [];
  const doc = { addEventListener: (name, fn, capture) => events.push([name, capture === true]), removeEventListener: () => {} };
  attachDialogDrag(doc, { matches: query => query === '(pointer: fine)' });
  assert.ok(events.some(([name]) => name === 'pointerdown'));
  assert.ok(events.some(([name, capture]) => name === 'close' && capture));
  assert.match(DIALOG_DRAG_HANDLE, /inventory-dialog-head/);
  assert.match(DIALOG_DRAG_HANDLE, /lodging-heading/);
});
