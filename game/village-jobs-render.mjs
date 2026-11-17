// Marcas físicas dos ofícios na clareira: quadro externo da Recepção, caixa de
// destino na Pousada e ponto da fogueira, com indicador de progresso do turno.
// Só desenha. Não decide conclusão nem pagamento.
//
// Cada ponto entra na fila de profundidade do mundo (`villageJobMarkThing`) na
// própria posição, como qualquer objeto. Nada disso fica dentro do cache
// estático da Recepção, então o progresso é desenhado a cada quadro.
import { CLAREIRA } from './theme.mjs';
import { villageJobProgress } from './village-jobs-client.mjs';

const WOOD = CLAREIRA.material.board;
const PAPER = CLAREIRA.palette.parchment;
const INK = CLAREIRA.palette.ink;

// Registro para `things` do render: ordenado por compareSceneDepth na posição
// do próprio ponto. `sortZ: 0` deixa a marca depois do terreno na mesma
// profundidade e antes dos personagens que estejam ali.
export function villageJobMarkThing(point) {
  return { type: 'village-job-mark', x: point.x, y: point.y, sortX: point.x, sortY: point.y, sortZ: 0,
    sortId: `village-job:${point.id}`, point };
}

// `project(x, y, z)` converte coordenadas do mundo em tela, como nos demais desenhos da clareira.
export function drawVillageJobMark(ctx, project, { point, active = null, nowMs = Date.now(), scale = 1 }) {
  if (!point) return;
  const base = project(point.x, point.y, 0);
  const unit = Math.max(1, scale);
  ctx.save();
  if (point.kind === 'board') {
    ctx.fillStyle = WOOD;
    ctx.fillRect(base.x - 2 * unit, base.y - 16 * unit, 4 * unit, 16 * unit);
    ctx.fillStyle = PAPER;
    ctx.fillRect(base.x - 9 * unit, base.y - 26 * unit, 18 * unit, 12 * unit);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, unit * .5);
    ctx.strokeRect(base.x - 9 * unit, base.y - 26 * unit, 18 * unit, 12 * unit);
  } else if (point.kind === 'delivery') {
    ctx.strokeStyle = CLAREIRA.signature.ember;
    ctx.lineWidth = Math.max(1, unit * .5);
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, 9 * unit, 4.5 * unit, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (active?.targetId === point.id) {
      ctx.fillStyle = WOOD;
      ctx.fillRect(base.x - 4 * unit, base.y - 6 * unit, 8 * unit, 6 * unit);
    }
  } else if (point.kind === 'hearth') {
    ctx.strokeStyle = CLAREIRA.signature.afterglow;
    ctx.lineWidth = Math.max(1, unit * .5);
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, 10 * unit, 5 * unit, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Indicador de progresso só no ponto de destino do turno ativo. O ângulo sai
  // do relógio do quadro (nowMs), então avança a cada quadro sem cache.
  if (active?.targetId === point.id) {
    const progress = villageJobProgress(active, nowMs);
    ctx.strokeStyle = CLAREIRA.signature.leaf;
    ctx.lineWidth = Math.max(2, unit);
    ctx.beginPath();
    ctx.arc(base.x, base.y - 2 * unit, 12 * unit, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
  }
  ctx.restore();
}
