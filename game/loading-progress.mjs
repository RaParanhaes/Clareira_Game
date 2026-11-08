// Progress counts concrete preparation tasks. Time spent waiting never moves the bar.
export function createLoadingProgress(tasks = [], onChange = () => {}) {
  if (!Array.isArray(tasks) || typeof onChange !== 'function') {
    throw new TypeError('Progresso de carregamento inválido');
  }
  const entries = new Map();
  for (const task of tasks) {
    if (!task || typeof task.id !== 'string' || !task.id || entries.has(task.id)
        || typeof task.label !== 'string' || !task.label) {
      throw new TypeError('Etapa de carregamento inválida');
    }
    entries.set(task.id, { id: task.id, label: task.label, stage: typeof task.stage === 'string' ? task.stage : 'scene', complete: task.complete === true });
  }

  function snapshot() {
    const values = [...entries.values()];
    const completed = values.reduce((count, task) => count + Number(task.complete), 0);
    const total = values.length;
    const active = values.find(task => !task.complete) || values.at(-1) || null;
    return {
      known: total > 0,
      total,
      completed,
      percent: total > 0 ? Math.floor(completed / total * 100) : null,
      activeLabel: active?.label || null,
      finished: total > 0 && completed === total,
    };
  }

  function stageSnapshot() {
    const values = [...entries.values()];
    const active = values.find(task => !task.complete) || values.at(-1) || null;
    const totals = new Map();
    for (const task of values) {
      const group = totals.get(task.stage) || { completed: 0, total: 0 };
      group.total += 1;
      group.completed += Number(task.complete);
      totals.set(task.stage, group);
    }
    const group = active ? totals.get(active.stage) : { completed: 0, total: 0 };
    return {
      activeStage: active?.stage || 'scene',
      completed: group?.completed || 0,
      total: group?.total || 0,
      stages: Object.fromEntries(totals),
    };
  }

  function pendingTasks() {
    return [...entries.values()].filter(task => !task.complete)
      .map(({ id, label, stage }) => ({ id, label, stage }));
  }

  function taskIds() { return [...entries.keys()]; }

  function complete(id) {
    const task = entries.get(id);
    if (!task || task.complete) return snapshot();
    task.complete = true;
    const value = snapshot();
    onChange(value);
    return value;
  }

  const initial = snapshot();
  onChange(initial);
  return { complete, snapshot, stageSnapshot, pendingTasks, taskIds };
}

function groupFraction(group) {
  const total = Number(group?.total);
  const completed = Number(group?.completed);
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(completed)) return 0;
  return Math.max(0, Math.min(1, completed / total));
}

function boundedFraction(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0;
}

// The initial loader has four stable color phases. The mini bar reports only
// the active phase; the large bar is responsible for aggregate progress.
export function initialLoadingMiniStage({ filesFraction = 0, sessionCompleted = false, character = null } = {}) {
  if (boundedFraction(filesFraction) < 1) return 'files';
  if (sessionCompleted !== true) return 'session';
  if (groupFraction(character) < 1) return 'character';
  return 'scene';
}

export function calculateInitialMiniProgress({
  filesFraction = 0,
  sessionCompleted = false,
  character = null,
  scene = null,
} = {}) {
  const stage = initialLoadingMiniStage({ filesFraction, sessionCompleted, character });
  if (stage === 'files') return boundedFraction(filesFraction) * 100;
  if (stage === 'session') return Number(sessionCompleted === true) * 100;
  return groupFraction(stage === 'character' ? character : scene) * 100;
}
