const DRAG_THRESHOLD = 5;
const STEP = 16;

export function clampPosition(left, top, size, bounds) {
  return {
    left: Math.min(Math.max(0, left), Math.max(0, bounds.width - size.width)),
    top: Math.min(Math.max(0, top), Math.max(0, bounds.height - size.height)),
  };
}

export function createDraggableHud({ container, items, toggle, reset, storage, storageKey = 'clareira:hud-layout:v1' }) {
  const elements = new Map(items.map(({ id, element }) => [id, element]));
  let editing = false;
  let layout = {};
  try {
    storage ??= globalThis.localStorage;
    const saved = JSON.parse(storage?.getItem(storageKey) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) layout = saved;
  } catch (error) {
    console.warn('Não foi possível carregar a posição dos painéis do HUD.', error);
  }

  const save = () => {
    try { storage?.setItem(storageKey, JSON.stringify(layout)); }
    catch (error) { console.warn('Não foi possível salvar a posição dos painéis do HUD.', error); }
  };
  const bounds = () => ({ width: container.clientWidth, height: container.clientHeight });
  const sizeOf = element => ({ width: element.offsetWidth, height: element.offsetHeight });

  function place(element, left, top) {
    const next = clampPosition(left, top, sizeOf(element), bounds());
    element.classList.add('is-moved');
    Object.assign(element.style, { left: `${next.left}px`, top: `${next.top}px`, right: 'auto', bottom: 'auto', transform: 'none' });
    return next;
  }
  function apply(id) {
    const element = elements.get(id), saved = layout[id];
    if (!element || !saved) return;
    const b = bounds();
    if (!b.width || !b.height || !element.getClientRects().length) return;
    place(element, saved.x * b.width, saved.y * b.height);
  }
  function remember(id, element) {
    const b = bounds();
    if (!b.width || !b.height) return;
    layout[id] = { x: element.offsetLeft / b.width, y: element.offsetTop / b.height };
    save();
  }
  function currentOffset(element) {
    const c = container.getBoundingClientRect(), r = element.getBoundingClientRect();
    return { left: r.left - c.left, top: r.top - c.top };
  }
  function clear(id) {
    const element = elements.get(id);
    delete layout[id];
    if (!element) return;
    element.classList.remove('is-moved');
    for (const prop of ['left', 'top', 'right', 'bottom', 'transform']) element.style.removeProperty(prop);
  }
  function setEditing(value) {
    editing = Boolean(value);
    container.classList.toggle('hud-editing', editing);
    toggle?.setAttribute('aria-pressed', String(editing));
    for (const element of elements.values()) {
      if (editing) {
        element.setAttribute('data-hud-movable', '');
        if (element.tabIndex < 0) { element.setAttribute('tabindex', '0'); element.dataset.hudTab = '1'; }
      } else {
        element.removeAttribute('data-hud-movable');
        if (element.dataset.hudTab) { element.removeAttribute('tabindex'); delete element.dataset.hudTab; }
      }
    }
  }

  for (const [id, element] of elements) {
    let drag = null;
    element.addEventListener('pointerdown', event => {
      if (!editing || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const origin = currentOffset(element);
      drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, ...origin, moved: false };
      event.preventDefault();
      element.setPointerCapture?.(event.pointerId);
    });
    element.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.moved = true;
      place(element, drag.left + dx, drag.top + dy);
    });
    const finish = event => {
      if (!drag || event.pointerId !== drag.pointer) return;
      if (drag.moved) remember(id, element);
      drag = null;
    };
    element.addEventListener('pointerup', finish);
    element.addEventListener('pointercancel', finish);
    element.addEventListener('click', event => { if (editing) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
    element.addEventListener('keydown', event => {
      if (!editing || !event.altKey) return;
      const delta = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }[event.key];
      if (!delta) return;
      event.preventDefault();
      const origin = currentOffset(element);
      place(element, origin.left + delta[0], origin.top + delta[1]);
      remember(id, element);
    });
    apply(id);
  }

  toggle?.addEventListener('click', () => setEditing(!editing));
  reset?.addEventListener('click', () => { for (const id of elements.keys()) clear(id); save(); });
  addEventListener('resize', () => { for (const id of elements.keys()) apply(id); });
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => { for (const id of elements.keys()) apply(id); });
    observer.observe(container);
    for (const element of elements.values()) observer.observe(element);
  }
  return { setEditing, isEditing: () => editing, reapply: () => { for (const id of elements.keys()) apply(id); } };
}
