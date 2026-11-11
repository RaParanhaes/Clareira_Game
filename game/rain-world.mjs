// Chuva no mundo: gotas com altura que caem no espaço do jogo e reagem a
// telhados, copas de árvores e chão. Uma gota cai no ciclo de tempo do relógio
// do mundo (igual para todos os jogadores), então o resultado é determinístico.
// Cada tipo de superfície decide o que a gota faz:
// - telhado: respingo e, logo depois, um filete que escorre até a beirada;
// - copa: a gota some e, às vezes, uma pingada cai da borda da copa;
// - chão: um pequeno respingo no ponto onde a gota chega.
// Só funções puras aqui: o desenho usa a projeção da cena (project), passada pelo chamador.

const Z0 = 4.6;        // altura inicial da gota, em unidades de altura da cena
const SPAN = 22;       // lado do quadrado de gotas em volta da câmera (tiles)
const SPLASH_SECONDS = 0.22; // tempo em que o respingo fica visível
const RUNOFF_SECONDS = 1.1;  // tempo em que o filete escorre pelo telhado até a beirada
const EAVE_DRIP_CHANCE = 0.8; // parte dos telhados que pinga da beirada
const RIVULETS_PER_ROOF = 14; // pontos de escorrimento por telhado
const RIVULET_SECONDS = 1.6;  // tempo para um córrego descer do ponto até a beirada
const TREE_TOP = 3.2;  // altura padrão da copa, em unidades de altura da cena
const DRIP_CHANCE = 0.3;

const hash = (index, salt) => {
  let x = (Math.imul(index | 0, 374761393) + Math.imul(salt | 0, 668265263)) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
const wrap1 = (value) => value - Math.floor(value);
const clamp01 = (value) => Math.max(0, Math.min(1, value));

// Altura do telhado em (x, y). roof: { x1, x2, y1, y2, axis, base, ridge } (os limites já incluem a beirada).
// Devolve null fora do telhado. O caimento vai do cume (ridge) até a beirada.
export function roofHeightAt(roof, x, y) {
  if (x < roof.x1 || x > roof.x2 || y < roof.y1 || y > roof.y2) return null;
  const alongY = roof.axis !== 'x';
  const half = alongY ? (roof.x2 - roof.x1) / 2 : (roof.y2 - roof.y1) / 2;
  const off = alongY ? Math.abs(x - (roof.x1 + roof.x2) / 2) : Math.abs(y - (roof.y1 + roof.y2) / 2);
  return roof.base + (roof.ridge - roof.base) * clamp01(1 - off / Math.max(0.0001, half));
}

// Quantas gotas a cena precisa por tipo de chuva. count é o número para o quadrado de SPAN tiles.
export function rainDropCount(intensity, scale = 1) {
  const value = clamp01(Number.isFinite(intensity) ? intensity : 0.55);
  return Math.round((70 + 110 * value) * scale);
}

// Monta os elementos visíveis de um instante: gotas em queda, respingos, filetes e pingadas.
// center: { x, y } em tiles (a câmera). roofs: lista de roofs. trees: lista de { x, y, r }.
// Devolve { drops, splashes, runoffs } com coordenadas do mundo (z em unidades de altura).
// Células fixas no mundo: a chuva nasce de posições do mundo, não da câmera, então
// ela não acompanha o personagem. Cada célula tem gotas sorteadas pelas suas coordenadas.
const CELL = SPAN / 2;

function dropsInCell(cx, cy, perCell) {
  const out = [];
  const seedBase = Math.imul(cx | 0, 73856093) ^ Math.imul(cy | 0, 19349663);
  for (let i = 0; i < perCell; i++) {
    const seed = (seedBase + Math.imul(i + 1, 83492791)) | 0;
    out.push({
      x: cx * CELL + hash(seed, 31) * CELL,
      y: cy * CELL + hash(seed, 32) * CELL,
      period: 0.85 + 0.3 * hash(seed, 33),
      offset: hash(seed, 34),
    });
  }
  return out;
}

export function rainFrame({ center, count, seconds, fall = 0.9, roofs = [], trees = [] }) {
  const drops = [], splashes = [], runoffs = [];
  const half = SPAN / 2;
  // Densidade: `count` gotas numa área de SPAN x SPAN; cada célula tem a mesma densidade.
  const perCell = Math.max(1, Math.round(count * (CELL * CELL) / (SPAN * SPAN)));
  const x0 = Math.floor((center.x - half) / CELL), x1 = Math.floor((center.x + half) / CELL);
  const y0 = Math.floor((center.y - half) / CELL), y1 = Math.floor((center.y + half) / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) for (const d of dropsInCell(cx, cy, perCell)) {
    const { x, y } = d;
    const period = fall * d.period;
    const phase = wrap1(seconds / period + d.offset);
    const z = Z0 * (1 - phase);
    // Obstáculo mais alto sob a gota: o primeiro que ela atinge ao cair.
    let hitZ = 0, hitKind = 'ground';
    for (const roof of roofs) {
      const h = roofHeightAt(roof, x, y);
      if (h !== null && h > hitZ && h < Z0) { hitZ = h; hitKind = 'roof'; }
    }
    for (const tree of trees) {
      const dx = x - tree.x, dy = y - tree.y;
      if (dx * dx + dy * dy < (tree.r || 0.6) * (tree.r || 0.6) * 0.81 && TREE_TOP > hitZ && TREE_TOP < Z0) {
        hitZ = TREE_TOP; hitKind = 'tree';
      }
    }
    const hitPhase = 1 - hitZ / Z0;
    const SPLASH = Math.min(0.5, SPLASH_SECONDS / period);
    // Telhado: a gota some ao bater, sem respingo circular (o escorrimento é desenhado à parte).
    if (hitKind === 'ground' && phase < SPLASH) {
      splashes.push({ x, y, z: 0, t: phase / SPLASH, kind: 'ground' });
    }
    if (hitKind === 'tree' && phase >= hitPhase && phase < hitPhase + SPLASH) {
      splashes.push({ x, y, z: hitZ, t: (phase - hitPhase) / SPLASH, kind: 'tree' });
    }
    if (phase < hitPhase) drops.push({ x, y, z, phase });
  }
  // Córregos: vários pontos do telhado soltam água que desce pelo caimento até a beirada,
  // em ciclos próprios. Com muitos pontos por telhado, o escorrimento fica contínuo.
  for (let k = 0; k < roofs.length; k++) {
    const roof = roofs[k];
    const cx0 = (roof.x1 + roof.x2) / 2, cy0 = (roof.y1 + roof.y2) / 2;
    if (Math.abs(cx0 - center.x) > half + 6 || Math.abs(cy0 - center.y) > half + 6) continue;
    for (let i = 0; i < RIVULETS_PER_ROOF; i++) {
      const id = k * 64 + i;
      const x = roof.x1 + (roof.x2 - roof.x1) * hash(id, 61);
      const y = roof.y1 + (roof.y2 - roof.y1) * hash(id, 62);
      const period = RIVULET_SECONDS * (0.8 + 0.4 * hash(id, 63));
      const flow = wrap1(seconds / period + hash(id, 64));
      runoffFrom(runoffs, roof, x, y, roof.base, flow, 1);
    }
  }
  // Pingadas da beirada: a água que escorreu do telhado pinga da borda, em ciclo próprio.
  for (let k = 0; k < roofs.length; k++) {
    const roof = roofs[k];
    if (hash(k, 51) > EAVE_DRIP_CHANCE) continue;
    const alongY = roof.axis !== 'x';
    const period = 0.9 + 0.9 * hash(k, 52);
    const phase = wrap1(seconds / period + hash(k, 53));
    const side = hash(k, 54) < 0.5 ? 0 : 1;
    const along = hash(k, 55);
    let x, y;
    if (alongY) { x = side ? roof.x2 : roof.x1; y = roof.y1 + (roof.y2 - roof.y1) * along; }
    else { y = side ? roof.y2 : roof.y1; x = roof.x1 + (roof.x2 - roof.x1) * along; }
    if (Math.abs(x - center.x) > half || Math.abs(y - center.y) > half) continue;
    drops.push({ x, y, z: roof.base * (1 - phase), phase, drip: true, eave: true });
  }
  // Pingadas: uma parte das copas deixa cair gotas da borda, em ciclo próprio.
  for (let j = 0; j < trees.length; j++) {
    const tree = trees[j];
    if (hash(j, 41) > DRIP_CHANCE) continue;
    if (Math.abs(tree.x - center.x) > half || Math.abs(tree.y - center.y) > half) continue;
    const period = 1.2 + 1.4 * hash(j, 42);
    const phase = wrap1(seconds / period + hash(j, 43));
    const angle = hash(j, 44) * Math.PI * 2;
    const r = (tree.r || 0.6) * 0.8;
    drops.push({ x: tree.x + Math.cos(angle) * r, y: tree.y + Math.sin(angle) * r, z: TREE_TOP * (1 - phase), phase, drip: true });
  }
  return { drops, splashes, runoffs };
}

// Filete que escorre do ponto de impacto até a beirada mais próxima, no sentido do caimento.
function runoffFrom(out, roof, x, y, z, progress, fade = 0.5) {
  if (!roof || progress < 0 || progress > 1) return;
  const alongY = roof.axis !== 'x';
  let dx = 0, dy = 0, len;
  if (alongY) { dx = x < (roof.x1 + roof.x2) / 2 ? -1 : 1; len = Math.abs(dx > 0 ? roof.x2 - x : x - roof.x1); }
  else { dy = y < (roof.y1 + roof.y2) / 2 ? -1 : 1; len = Math.abs(dy > 0 ? roof.y2 - y : y - roof.y1); }
  // O filete desce até a beirada real do telhado.
  const reach = len * progress;
  out.push({ x0: x, y0: y, z, x1: x + dx * reach, y1: y + dy * reach, alpha: 1 - progress * fade });
}

// Desenha a chuva do mundo sobre a cena. project(x, y, z) devolve o ponto na tela.
// style: { width, color, len } (len: tamanho do traço em unidades de altura da cena).
export function drawRainWorld(ctx, frame, project, style, slant = 0.1) {
  const { drops, splashes, runoffs } = frame;
  ctx.lineCap = 'round';
  ctx.lineWidth = style.width;
  ctx.strokeStyle = style.color;
  ctx.beginPath();
  for (const d of drops) {
    const a = project(d.x, d.y, d.z);
    const b = project(d.x + slant * 0.25, d.y, d.z + style.len);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  for (const s of splashes) {
    const p = project(s.x, s.y, s.z);
    // Respingo de chão: dois anéis que se abrem em tempos diferentes, como água batendo.
    const rings = s.kind === 'ground' ? [s.t, Math.max(0, s.t - 0.35)] : [s.t];
    for (const t of rings) {
      if (t <= 0 || t >= 1) continue;
      const radius = (s.kind === 'ground' ? 2.5 : 1.5) + (s.kind === 'ground' ? 7 : 4.5) * t;
      ctx.globalAlpha = (1 - t) * (s.kind === 'ground' ? 0.85 : 0.7);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, radius, radius * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (s.kind === 'ground' && s.t < 0.3) {
      ctx.globalAlpha = (1 - s.t / 0.3) * 0.9;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 1, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = style.color;
      ctx.fill();
    }
  }
  // Filetes do telhado: mais grossos e claros, para aparecer sobre a madeira escura.
  ctx.lineWidth = style.width * 2;
  ctx.strokeStyle = 'rgba(214,232,248,0.9)';
  for (const r of runoffs) {
    const a = project(r.x0, r.y0, r.z), b = project(r.x1, r.y1, r.z);
    ctx.globalAlpha = r.alpha;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
