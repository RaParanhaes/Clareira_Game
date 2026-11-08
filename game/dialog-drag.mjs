// Arrastar diálogos pelo cabeçalho. Só com ponteiro fino (PC); no celular os diálogos seguem em folha.
export const DIALOG_DRAG_MARGIN = 8;
export const DIALOG_DRAG_HANDLE = '.inventory-dialog-head,.lodging-heading,.world-map-header,.staff-tools-head';
const INTERACTIVE = 'button,input,select,textarea,a,label,summary,[contenteditable]';

export function clampDialogPosition({ left, top, width, height, viewportWidth, viewportHeight, margin = DIALOG_DRAG_MARGIN }) {
  const maxLeft = Math.max(margin, viewportWidth - width - margin);
  const maxTop = Math.max(margin, viewportHeight - height - margin);
  return {
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  };
}

export function attachDialogDrag(doc, { matches = globalThis.matchMedia ? query => globalThis.matchMedia(query).matches : () => false,
  win = globalThis } = {}) {
  if (!matches('(pointer: fine)')) return () => {};
  let active = null;
  const onDown = event => {
    if (event.button !== 0 || event.target.closest?.(INTERACTIVE)) return;
    const handle = event.target.closest?.(DIALOG_DRAG_HANDLE);
    const dialog = handle?.closest('dialog[open]');
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    Object.assign(dialog.style, { margin: '0', left: `${rect.left}px`, top: `${rect.top}px`, right: 'auto', bottom: 'auto', translate: 'none' });
    active = { dialog, id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    handle.setPointerCapture?.(event.pointerId);
    dialog.classList.add('is-dragging');
  };
  const onMove = event => {
    if (!active || event.pointerId !== active.id) return;
    const rect = active.dialog.getBoundingClientRect();
    const position = clampDialogPosition({
      left: event.clientX - active.dx, top: event.clientY - active.dy, width: rect.width, height: rect.height,
      viewportWidth: win.innerWidth, viewportHeight: win.innerHeight,
    });
    active.dialog.style.left = `${position.left}px`;
    active.dialog.style.top = `${position.top}px`;
  };
  const onEnd = event => {
    if (!active || event.pointerId !== active.id) return;
    active.dialog.classList.remove('is-dragging');
    active = null;
  };
  const onClose = event => {
    const dialog = event.target;
    if (dialog?.localName === 'dialog') Object.assign(dialog.style, { margin: '', left: '', top: '', right: '', bottom: '', translate: '' });
  };
  doc.addEventListener('pointerdown', onDown);
  doc.addEventListener('pointermove', onMove);
  doc.addEventListener('pointerup', onEnd);
  doc.addEventListener('pointercancel', onEnd);
  doc.addEventListener('close', onClose, true);
  return () => {
    doc.removeEventListener('pointerdown', onDown);
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerup', onEnd);
    doc.removeEventListener('pointercancel', onEnd);
    doc.removeEventListener('close', onClose, true);
  };
}
