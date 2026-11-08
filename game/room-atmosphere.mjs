const ATMOSPHERES = Object.freeze({
  cedar: Object.freeze({
    wall: '#c18f72', sideWall: '#947160', trim: '#e5c093',
    panel: '#b87e61', panelEdge: '#805745', wallpaperStripe: '#f4c9a744',
    curtain: '#a96055', curtainShade: '#754841', curtainLight: '#d79970', curtainRod: '#584332',
    art: Object.freeze({ sky: '#e8c887', far: '#788766', near: '#4e6852', sun: '#f4dca0' }),
  }),
  pine: Object.freeze({
    wall: '#a4b99f', sideWall: '#6f8b7b', trim: '#e0c891',
    panel: '#7e9b88', panelEdge: '#496a60', wallpaperStripe: '#e3edcb40',
    curtain: '#55786d', curtainShade: '#3f5d57', curtainLight: '#9fb993', curtainRod: '#4c5542',
    art: Object.freeze({ sky: '#c9d0ae', far: '#6d8967', near: '#456954', sun: '#eddfa5' }),
  }),
  hotel: Object.freeze({
    wall: '#d8cdb3', sideWall: '#aaa08c', trim: '#d9bd80',
    panel: '#c6b79b', panelEdge: '#8c7e6a', wallpaperStripe: '#fff0d63a',
    curtain: '#7b8b80', curtainShade: '#50635c', curtainLight: '#b4c09d', curtainRod: '#645340',
    art: Object.freeze({ sky: '#ead5a1', far: '#8d8b68', near: '#65745d', sun: '#f5e3b0' }),
  }),
  vista: Object.freeze({
    wall: '#a6bdc0', sideWall: '#728e99', trim: '#d7c28e',
    panel: '#829fa5', panelEdge: '#526b77', wallpaperStripe: '#e7f0ec48',
    curtain: '#657c8a', curtainShade: '#435965', curtainLight: '#acc1c2', curtainRod: '#485157',
    art: Object.freeze({ sky: '#c2d7db', far: '#788d99', near: '#536b79', sun: '#f0d69b' }),
  }),
});

const BUILTIN_PALETTES = Object.freeze({
  cedar: Object.freeze({ floor: '#846449', wall: '#866f56' }),
  pine: Object.freeze({ floor: '#776747', wall: '#79694e' }),
  hotel: Object.freeze({ floor: '#8b6c4d', wall: '#756d5e' }),
  vista: Object.freeze({ floor: '#77705d', wall: '#6e6a70' }),
});

function builtinStyle(palette = {}) {
  if (ATMOSPHERES[palette.interiorStyle]) return palette.interiorStyle;
  return Object.keys(BUILTIN_PALETTES).find(name =>
    palette.floor?.[0] === BUILTIN_PALETTES[name].floor
    && palette.wall === BUILTIN_PALETTES[name].wall) || null;
}

export function roomAtmosphere(layout = {}) {
  const palette = layout.palette || {};
  const key = builtinStyle(palette);
  if (key) return ATMOSPHERES[key];
  return {
    wall: palette.wall || '#796e59',
    sideWall: palette.sideWall || '#665c4c',
    trim: palette.trim || '#c19968',
    panel: palette.wallPanel || palette.trim || '#a98563',
    panelEdge: palette.wallPanelEdge || palette.sideWall || '#66503c',
    wallpaperStripe: palette.wallpaperStripe || `${palette.trim || '#c19968'}38`,
    curtain: palette.curtain || palette.rug || '#865348',
    curtainShade: palette.curtainShade || palette.sideWall || '#665c4c',
    curtainLight: palette.curtainLight || palette.rugEdge || '#d7b982',
    curtainRod: palette.curtainRod || '#554437',
    art: { sky: '#d9bd83', far: '#6f8662', near: '#425f4d', sun: '#f1d49a' },
  };
}
