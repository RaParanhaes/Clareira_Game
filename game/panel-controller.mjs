// One modal at a time. Routes stay inside that modal; Escape goes back one
// screen, while Close always returns to the world. Native <dialog> traps focus.
export function createPanelController({ beforeOpen = () => {}, fallbackFocus = () => null } = {}) {
  const panels = new Map();
  let active = null;

  function finish({ restoreFocus = true } = {}) {
    if (!active) return;
    const previous = active;
    active = null;
    previous.definition.onClose?.();
    if (previous.definition.dialog.open) previous.definition.dialog.close();
    if (restoreFocus) {
      const opener = previous.opener;
      const target = opener?.isConnected && opener.tabIndex >= 0 && !opener.disabled
        && !opener.closest('dialog,[hidden],[inert]') && opener.getClientRects().length > 0
        ? opener : fallbackFocus();
      target?.focus({ preventScroll: true });
    }
  }

  function render({ focus = true } = {}) {
    if (!active) return;
    const { definition, routes } = active;
    definition.render?.(routes.at(-1), [...routes]);
    if (focus) {
      definition.dialog.querySelector('[data-panel-body]')?.scrollTo(0, 0);
      const selector = routes.length > 1 ? '[data-panel-heading]' : definition.initialFocus;
      (definition.dialog.querySelector(selector || '[autofocus]') || definition.dialog)
        .focus({ preventScroll: true });
    }
  }

  function syncClosedDialog() {
    if (active && !active.definition.dialog.open) finish({ restoreFocus: false });
  }

  const controller = {
    register(id, dialog, options = {}) {
      if (!dialog || panels.has(id)) throw new Error(`Invalid or duplicate panel: ${id}`);
      const definition = { ...options, dialog };
      panels.set(id, definition);
      dialog.addEventListener('cancel', event => {
        event.preventDefault(); if (active?.definition === definition) controller.back();
      });
      dialog.addEventListener('keydown', event => {
        if (active?.definition !== definition) return;
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation();
          if (!event.repeat) controller.back();
          return;
        }
        if (event.key !== 'Tab' || active?.definition !== definition) return;
        const controls = [...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')]
          .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length > 0
            && !node.closest('[hidden],[inert]'));
        const index = controls.indexOf(dialog.ownerDocument.activeElement);
        if (!controls.length || index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
          event.preventDefault();
          (event.shiftKey ? controls.at(-1) : controls[0])?.focus({ preventScroll: true });
        }
      });
      dialog.addEventListener('close', () => {
        // A close event queued before a reopen must not close the new session.
        if (!dialog.open && active?.definition === definition) finish();
      });
    },
    open(id, route = 'home') {
      const definition = panels.get(id);
      if (!definition) throw new Error(`Unknown panel: ${id}`);
      if (active?.definition === definition && definition.dialog.open) return;
      const opener = definition.dialog.ownerDocument.activeElement;
      finish({ restoreFocus: false });
      beforeOpen();
      active = { id, definition, routes: [route], opener };
      definition.dialog.showModal();
      render();
    },
    navigate(route) {
      if (!active || active.routes.at(-1) === route) return;
      active.routes.push(route);
      render();
    },
    back() {
      if (!active) return;
      if (active.routes.length === 1) return finish();
      active.routes.pop();
      render();
    },
    refresh() { render({ focus: false }); },
    close: finish,
    get current() { syncClosedDialog(); return active?.id || null; },
    get route() { syncClosedDialog(); return active?.routes.at(-1) || null; },
    get isOpen() { syncClosedDialog(); return active !== null; },
  };
  return controller;
}
