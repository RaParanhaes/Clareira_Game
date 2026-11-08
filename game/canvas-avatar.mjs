import { COATS, HAIR_COLORS, SKINS, normalizeAppearance } from './appearance.mjs';
import { applyAvatarSurfaceLight } from './avatar-surface-light.mjs';

// The big shapes use a 48×48 logical grid, with a native-resolution detail pass
// on the game's 96×96 avatar cell for crisp eyes, fabric, leather, and stitching.
const GRID = 96;
const LOGICAL_SCALE = 2;
const FRAME_LIMIT = 192;
const GAIT_FRAME_COUNT = 12;
const GESTURE_FRAME_COUNT = 12;
const GAIT_STRIDE = Object.freeze([3, 2, 1, 0, -1, -2, -3, -2, -1, 0, 1, 2]);
const GAIT_LIFT_A = Object.freeze([0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0]);
const GAIT_LIFT_B = Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0]);
const SCREEN_FORWARD = Object.freeze([
  [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1],
]);
const frameCache = new Map();
const DIRECTIONS = Object.freeze(['south', 'southeast', 'east', 'northeast', 'north', 'northwest', 'west', 'southwest']);

function shade(hex, amount) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : '808080';
  const channels = [0, 2, 4].map(index => Math.max(0, Math.min(255,
    Math.round(parseInt(value.slice(index, index + 2), 16) + amount * 255))));
  return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function level(value) {
  const number = Number(value) || 0;
  return number < .25 ? 0 : number < .75 ? 1 : 2;
}

function amount(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function avatarState(selected, animation = {}) {
  const pose = animation.pose || {};
  const position = animation.position || {};
  const moving = animation.moving === true || selected?.action === 'walk';
  const running = animation.running === true || pose.running === true;
  const swimming = animation.swimming === true;
  const phase = Number(animation.phase) || 0;
  const direction = Math.max(0, Math.min(7, Math.floor(Number(selected?.direction) || 0)));
  const frame = Number.isFinite(Number(selected?.frame)) && selected?.frame !== undefined
    ? Math.max(0, Math.floor(Number(selected.frame)) % GAIT_FRAME_COUNT)
    : Math.floor((((phase / (Math.PI * 2)) % 1) + 1) % 1 * GAIT_FRAME_COUNT);
  const now = selected?.reducedMotion ? 0 : Math.max(0, Number(selected?.nowMs) || Number(animation.nowMs) || 0);
  const explicitGestureFrame = animation.gestureFrame ?? selected?.gestureFrame;
  const gestureFrame = selected?.reducedMotion ? 0 : Number.isFinite(Number(explicitGestureFrame))
    ? Math.max(0, Math.floor(Number(explicitGestureFrame)) % GESTURE_FRAME_COUNT)
    : Math.floor(now / 100) % GESTURE_FRAME_COUNT;
  return {
    direction,
    moving,
    running,
    swimming,
    crouch: amount(pose.crouch ?? (animation.crouching ? 1 : 0)),
    sit: amount(pose.sit ?? (pose.sitting ? 1 : 0)),
    wave: amount(pose.wave),
    dance: amount(pose.dance),
    reach: amount(pose.reach ?? pose.gathering),
    offer: amount(pose.offer),
    jump: Math.max(0, Math.min(3, Math.floor((Number(position.z) || 0) * 3.7))),
    frame,
    gestureFrame,
    idleFrame: moving || selected?.reducedMotion ? 0 : Math.floor(now / 460) % 2,
    auraFrame: selected?.reducedMotion ? 0 : Math.floor(now / 120) % 4,
    transition: typeof animation.transition === 'string' ? animation.transition : '',
    transitionProgress: Math.max(0, Math.min(1, Number(animation.transitionProgress) || 0)),
    suppressAura: animation.suppressAura === true,
    reducedMotion: selected?.reducedMotion === true,
    facing: DIRECTIONS[direction],
  };
}

function cacheKey(appearance, state) {
  return [appearance.bodyId, appearance.bodyShapeId, appearance.muscle, appearance.outfitId, appearance.skin,
    appearance.hair, appearance.hairStyle, appearance.headwearId, appearance.mainHandId,
    appearance.offHandId, appearance.backItemId, appearance.auraId, appearance.coat,
    state.direction, state.moving ? 1 : 0, state.running ? 1 : 0, state.swimming ? 1 : 0,
    state.crouch, state.sit, state.wave, state.dance, state.reach, state.offer,
    state.jump, state.frame, state.gestureFrame, state.idleFrame, state.auraFrame, state.transition,
    Math.round(state.transitionProgress * 8), state.suppressAura ? 1 : 0].join(':');
}

function createFrame(appearance, state) {
  const canvas = document.createElement('canvas');
  canvas.width = GRID;
  canvas.height = GRID;
  const context = canvas.getContext('2d', { alpha: true });
  context.imageSmoothingEnabled = false;
  paintCharacter(context, appearance, state);
  return canvas;
}

function getFrame(appearance, state) {
  const key = cacheKey(appearance, state);
  const cached = frameCache.get(key);
  if (cached) {
    frameCache.delete(key);
    frameCache.set(key, cached);
    return cached;
  }
  const frame = createFrame(appearance, state);
  frameCache.set(key, frame);
  if (frameCache.size > FRAME_LIMIT) frameCache.delete(frameCache.keys().next().value);
  return frame;
}

function block(context, x, y, width, height, color) {
  if (width <= 0 || height <= 0) return;
  context.fillStyle = color;
  context.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
}

function polygon(context, points, color) {
  const minY = Math.floor(Math.min(...points.map(([, y]) => y)));
  const maxY = Math.ceil(Math.max(...points.map(([, y]) => y)));
  for (let y = minY; y < maxY; y++) {
    const scanY = y + .5;
    const intersections = [];
    for (let index = 0; index < points.length; index++) {
      const [x1, y1] = points[index];
      const [x2, y2] = points[(index + 1) % points.length];
      if ((y1 <= scanY && y2 > scanY) || (y2 <= scanY && y1 > scanY)) {
        intersections.push(x1 + (scanY - y1) * (x2 - x1) / (y2 - y1));
      }
    }
    intersections.sort((left, right) => left - right);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const left = Math.ceil(intersections[index] - .5);
      const right = Math.floor(intersections[index + 1] - .5);
      if (right >= left) block(context, left, y, right - left + 1, 1, color);
    }
  }
}

function paletteFor(appearance) {
  const skin = SKINS[appearance.skin] || SKINS[0];
  const hair = HAIR_COLORS[appearance.hair] || HAIR_COLORS[0];
  const coat = COATS[appearance.coat] || COATS[2];
  const outfit = appearance.outfitId?.slice('outfit.'.length);
  const cloth = {
    'white-base': '#555c60', commoner: coat, 'mage-robe': '#35385f',
    'dimension-coat': '#426f77', 'dark-armor': '#343541', 'light-armor': '#9ca9a4',
  }[outfit] || coat;
  return {
    ink: '#20252c', outline: '#171d24', skin: skin[1], skinLight: skin[2], skinShade: skin[3],
    hair, cloth, clothLight: shade(cloth, .16), clothDark: shade(cloth, -.23),
    leather: '#604234', leatherLight: '#8a6548', metal: outfit === 'light-armor' ? '#d6dfd2' : '#717a83',
    gold: '#d7ae62', glow: outfit === 'dark-armor' ? '#f36d53' : outfit === 'light-armor' ? '#a9f2dd' : '#72cfe0',
  };
}

function paintCharacter(context, appearance, state) {
  const c = paletteFor(appearance);
  context.save();
  applyMotionLean(context, state);
  context.scale(LOGICAL_SCALE, LOGICAL_SCALE);
  paintCharacterShapes(context, appearance, state, c);
  context.restore();
  context.save();
  applyMotionLean(context, state);
  paintPixelDetails(context, appearance, state, c);
  context.restore();
}

function applyMotionLean(context, state) {
  const progress = state.transitionProgress;
  const pulse = Math.sin(progress * Math.PI);
  const danceLean = state.dance ? [0, -.025, -.045, -.035, -.012, .025, .045, .035, .012, -.025, -.045, -.025][state.gestureFrame] * state.dance : 0;
  const lean = danceLean || (state.running ? -.045
    : state.transition === 'walk-start' ? -.018 * (1 - progress)
    : state.transition === 'walk-stop' ? .018 * pulse
      : state.transition === 'run-start' ? -.06 * (1 - progress)
        : state.transition === 'run-stop' ? .045 * pulse
          : state.transition === 'jump-takeoff' ? -.035 * (1 - progress)
            : state.transition === 'jump-land' ? .03 * pulse : 0);
  if (!lean) return;
  context.translate(48, 76);
  context.rotate(lean);
  context.translate(-48, -76);
}

function actionArmOffset(state) {
  if (state.wave) return 0;
  if (state.dance) return Math.round([-1, 0, 1, 2, 1, 0, -1, -2, -1, 0, 1, 0][state.gestureFrame] * state.dance);
  return 0;
}

function paintCharacterShapes(context, appearance, state, c) {
  const { direction, moving, running, swimming, frame, idleFrame, jump } = state;
  const crouch = state.crouch, sit = state.sit;
  const wave = state.wave, dance = state.dance;
  const reach = state.reach, offer = state.offer;
  const danceBob = dance ? [0, -1, -2, -2, -1, 0, 1, 2, 2, 1, 0, -1][state.gestureFrame] : 0;
  const gestureArmOffset = actionArmOffset(state);
  const back = direction === 3 || direction === 4 || direction === 5;
  const side = direction === 2 ? 1 : direction === 6 ? -1 : 0;
  const outfit = appearance.outfitId?.slice('outfit.'.length) || 'white-base';
  const female = appearance.bodyId === 'body.female';
  const broad = appearance.bodyShapeId === 'body-shape.broad' || appearance.bodyShapeId === 'body-shape.heavy'
    || appearance.muscle === 2 || appearance.muscle === 3;
  const torsoWidth = broad ? 14 : female ? 11 : 12;
  const torsoLeft = Math.floor((GRID / LOGICAL_SCALE - torsoWidth) / 2);
  const crouchOffset = crouch;
  const sitOffset = sit;
  const breath = moving || state.reducedMotion ? 0 : idleFrame;
  const stepping = moving || swimming;
  const step = stepping ? Math.round(GAIT_STRIDE[frame] * (running ? 1.45 : crouch > .25 ? .72 : 1)) : 0;
  const liftA = jump ? -2 : stepping ? Math.round(GAIT_LIFT_A[frame] * (running ? 1.5 : 1) * (1 - crouch * .35)) : 0;
  const liftB = jump ? -1 : stepping ? Math.round(GAIT_LIFT_B[frame] * (running ? 1.5 : 1) * (1 - crouch * .35)) : 0;
  const yShift = Math.round(crouchOffset * 3 + sitOffset * 8 + breath + danceBob);
  const nearX = side < 0 ? 27 : 20;
  const farX = side < 0 ? 20 : 27;
  const [forwardX, forwardY] = SCREEN_FORWARD[direction] || SCREEN_FORWARD[0];
  const strideScale = running ? 1.5 : crouch > .25 ? .7 : 1;
  const strideA = Math.round(GAIT_STRIDE[frame] * strideScale);
  const strideB = -strideA;
  const footAX = Math.round(forwardX * strideA), footAY = Math.round(forwardY * strideA);
  const footBX = Math.round(forwardX * strideB), footBY = Math.round(forwardY * strideB);
  const cape = appearance.backItemId?.includes('cape') || outfit === 'dimension-coat';

  if (!state.suppressAura && appearance.auraId && appearance.auraId !== 'aura.none') drawAura(context, c.glow, state.auraFrame);
  if (cape) drawCape(context, outfit, c, state, yShift);
  if (back) drawHeldItem(context, appearance.mainHandId, side ? (side > 0 ? 15 : 31) : 18, 27 + yShift, c, true);

  // Legs and boots use chunky, integer pixel clusters; stride is distance driven.
  const trouser = outfit === 'dark-armor' || outfit === 'light-armor' ? c.metal : outfit === 'mage-robe' ? c.clothDark : '#483a32';
  if (sitOffset) {
    block(context, 14, 34 + yShift - 7 * sitOffset, 12, 5, c.outline);
    block(context, 15, 35 + yShift - 7 * sitOffset, 9, 3, trouser);
    block(context, 24, 35 + yShift - 7 * sitOffset, 11, 5, c.outline);
    block(context, 25, 36 + yShift - 7 * sitOffset, 8, 3, trouser);
    block(context, 12, 39 + yShift - 7 * sitOffset, 11, 3, '#302a28');
    block(context, 26, 40 + yShift - 7 * sitOffset, 11, 3, '#302a28');
  } else if (outfit === 'mage-robe' || outfit === 'dimension-coat') {
    polygon(context, [[torsoLeft, 28 + yShift], [torsoLeft + torsoWidth, 28 + yShift], [torsoLeft + torsoWidth + 2, 40 + yShift + liftB], [torsoLeft - 2, 40 + yShift + liftA]], c.outline);
    polygon(context, [[torsoLeft + 1, 29 + yShift], [torsoLeft + torsoWidth - 1, 29 + yShift], [torsoLeft + torsoWidth, 39 + yShift + liftB], [torsoLeft, 39 + yShift + liftA]], c.clothDark);
    block(context, 18, 38 + yShift + liftA, 6, 4, '#302a28');
    block(context, 26, 38 + yShift + liftB, 6, 4, '#302a28');
  } else {
    if (crouch > .35) {
      drawCrouchedLeg(context, nearX + footAX, 31 + yShift + footAY, liftA, trouser, c, side < 0 ? -1 : 1, crouch);
      drawCrouchedLeg(context, farX + footBX, 31 + yShift + footBY, liftB, trouser, c, side < 0 ? 1 : -1, crouch);
    } else {
      drawLeg(context, nearX + footAX, 31 + yShift + footAY, liftA, trouser, c, jump > 0);
      drawLeg(context, farX + footBX, 31 + yShift + footBY, liftB, trouser, c, jump > 0);
    }
  }

  const armSwing = stepping ? Math.round(step * .65) : 0;
  const armRaised = wave || dance || (jump ? 1 : 0);
  const reaching = Math.max(reach, offer);
  const farArmX = side < 0 ? 27 : 17;
  const nearArmX = side < 0 ? 17 : 27;
  // Far arm and back hand are painted before the torso.
  if (sit > .25 && wave < .25 && dance < .25) {
    drawSitSupportArm(context, farArmX - gestureArmOffset, 22 + yShift, c, sit);
  } else {
    drawArm(context, farArmX - gestureArmOffset, 22 + yShift, c, -armSwing, jump,
      dance ? dance : 0, true, 0, dance ? 'dance' : '', state.gestureFrame);
  }
  if (cape && outfit === 'dimension-coat') drawCoatBack(context, torsoLeft, yShift, c);

  // Tunic/armor silhouette, outline, then material planes and pixel highlights.
  polygon(context, [[torsoLeft + 2, 18 + yShift], [torsoLeft + torsoWidth - 2, 18 + yShift],
    [torsoLeft + torsoWidth + 1, 31 + yShift], [torsoLeft - 1, 31 + yShift]], c.outline);
  polygon(context, [[torsoLeft + 3, 19 + yShift], [torsoLeft + torsoWidth - 3, 19 + yShift],
    [torsoLeft + torsoWidth - 1, 29 + yShift], [torsoLeft + 1, 29 + yShift]], c.cloth);
  block(context, torsoLeft + 2, 22 + yShift, 2, 7, c.clothLight);
  block(context, torsoLeft + torsoWidth - 4, 21 + yShift, 2, 8, c.clothDark);
  if (outfit === 'mage-robe' || outfit === 'dimension-coat') {
    block(context, 23, 19 + yShift, 2, 13, c.gold);
    block(context, 21, 29 + yShift, 6, 1, c.gold);
    block(context, 22, 24 + yShift, 4, 2, c.clothDark);
  } else if (outfit === 'dark-armor' || outfit === 'light-armor') {
    block(context, torsoLeft + 3, 19 + yShift, torsoWidth - 6, 3, c.metal);
    block(context, torsoLeft + 2, 23 + yShift, 3, 5, c.metal);
    block(context, torsoLeft + torsoWidth - 5, 23 + yShift, 3, 5, c.clothDark);
    block(context, 23, 24 + yShift, 2, 2, c.glow);
    block(context, torsoLeft + 2, 30 + yShift, torsoWidth - 4, 2, c.gold);
  } else {
    block(context, torsoLeft + 2, 30 + yShift, torsoWidth - 4, 2, c.leather);
    block(context, 23, 30 + yShift, 2, 2, c.gold);
  }
  if (back) {
    block(context, torsoLeft + 3, 21 + yShift, torsoWidth - 6, 2, c.clothDark);
    block(context, torsoLeft + 4, 26 + yShift, torsoWidth - 8, 2, c.clothLight);
  }

  // Neck, head and directional hair/face details.
  block(context, 21, 15 + yShift, 6, 5, c.skinShade);
  block(context, 22, 15 + yShift, 4, 4, c.skin);
  block(context, 18, 5 + yShift, 12, 12, c.outline);
  block(context, 19, 6 + yShift, 10, 10, back ? c.skinShade : c.skin);
  if (!back) {
    block(context, side ? (side > 0 ? 26 : 20) : 21, 10 + yShift, 2, 1, c.outline);
    if (!side) block(context, 25, 10 + yShift, 2, 1, c.outline);
    if (side) block(context, side > 0 ? 28 : 18, 11 + yShift, 2, 2, c.skinLight);
  }
  drawHair(context, appearance.hairStyle, c.hair, back, yShift);
  drawHeadwear(context, appearance.headwearId, outfit, c, yShift, state);

  // Near arm is last so hands and held items sit on the correct side of the body.
  const handGesture = wave > .25 ? 'wave' : dance > .25 ? 'dance' : '';
  drawArm(context, nearArmX + gestureArmOffset, 22 + yShift, c, armSwing, jump, armRaised, false,
    reaching, handGesture, state.gestureFrame);
  if (!back) drawHeldItem(context, appearance.mainHandId, nearArmX + gestureArmOffset + (side < 0 ? -4 : 4), 27 + yShift - (armRaised ? 7 : 0), c, false);
  if (!back) drawHeldItem(context, appearance.offHandId, farArmX - gestureArmOffset + (side < 0 ? -4 : 4), 27 + yShift + 2, c, false);
  if (dance && !state.reducedMotion) {
    const sparkleX = dance % 2 ? 11 : 34;
    block(context, sparkleX, 14 + (frame % 2), 2, 2, c.gold);
  }
}

function paintPixelDetails(context, appearance, state, c) {
  const { direction, moving, running, swimming, frame, idleFrame, jump } = state;
  const outfit = appearance.outfitId?.slice('outfit.'.length) || 'white-base';
  const back = direction === 3 || direction === 4 || direction === 5;
  const side = direction === 2 ? 1 : direction === 6 ? -1 : 0;
  const faceSide = direction === 1 || direction === 2 ? 1 : direction === 6 || direction === 7 ? -1 : 0;
  const broad = appearance.bodyShapeId === 'body-shape.broad' || appearance.bodyShapeId === 'body-shape.heavy'
    || appearance.muscle === 2 || appearance.muscle === 3;
  const female = appearance.bodyId === 'body.female';
  const torsoWidth = broad ? 14 : female ? 11 : 12;
  const torsoLeft = Math.floor((48 - torsoWidth) / 2);
  const crouch = state.crouch;
  const sit = state.sit;
  const danceBob = state.dance ? [0, -1, -2, -2, -1, 0, 1, 2, 2, 1, 0, -1][state.gestureFrame] : 0;
  const gestureArmOffset = actionArmOffset(state);
  const breath = moving || state.reducedMotion ? 0 : idleFrame;
  const yShift = Math.round(crouch * 3 + sit * 8 + breath + danceBob);
  const stepping = moving || swimming;
  const step = stepping ? Math.round(GAIT_STRIDE[frame] * (running ? 1.45 : crouch > .25 ? .72 : 1)) : 0;
  const liftA = jump ? -2 : stepping ? Math.round(GAIT_LIFT_A[frame] * (running ? 1.5 : 1) * (1 - crouch * .35)) : 0;
  const liftB = jump ? -1 : stepping ? Math.round(GAIT_LIFT_B[frame] * (running ? 1.5 : 1) * (1 - crouch * .35)) : 0;
  const [forwardX, forwardY] = SCREEN_FORWARD[direction] || SCREEN_FORWARD[0];
  const strideScale = running ? 1.5 : crouch > .25 ? .7 : 1;
  const strideA = Math.round(GAIT_STRIDE[frame] * strideScale);
  const strideB = -strideA;
  const footAX = Math.round(forwardX * strideA), footAY = Math.round(forwardY * strideA);
  const footBX = Math.round(forwardX * strideB), footBY = Math.round(forwardY * strideB);
  const nearLegX = side < 0 ? 27 : 20;
  const farLegX = side < 0 ? 20 : 27;
  const nearArmX = side < 0 ? 17 : 27;
  const farArmX = side < 0 ? 27 : 17;
  const trouser = outfit === 'dark-armor' || outfit === 'light-armor' ? c.metal : outfit === 'mage-robe' ? c.clothDark : '#483a32';

  drawOutfitDetails(context, appearance, state, c, outfit, torsoLeft, torsoWidth, yShift, back);
  drawForegroundArm(context, appearance, state, c, nearArmX + gestureArmOffset, yShift, step, jump, back, side);
  drawSleeveDetails(context, state, c, nearArmX + gestureArmOffset, farArmX, yShift, step, jump);
  if (!back) drawFaceDetails(context, appearance, state, c, faceSide, yShift);
  drawHairHighlights(context, appearance, state, c, yShift, back);

  if (sit < .25 && outfit !== 'mage-robe' && outfit !== 'dimension-coat') {
    if (crouch > .35) {
      drawCrouchLegDetails(context, nearLegX + footAX, 31 + yShift + footAY + liftA, trouser, c, side < 0 ? -1 : 1);
      drawCrouchLegDetails(context, farLegX + footBX, 31 + yShift + footBY + liftB, trouser, c, side < 0 ? 1 : -1);
    } else {
      drawLegDetails(context, nearLegX + footAX, 31 + yShift + footAY, liftA, trouser, c);
      drawLegDetails(context, farLegX + footBX, 31 + yShift + footBY, liftB, trouser, c);
    }
  } else if (outfit === 'mage-robe' || outfit === 'dimension-coat') {
    drawRobeHem(context, torsoLeft, torsoWidth, yShift, c);
  }
}

function drawFaceDetails(context, appearance, state, c, facingSide, yShift) {
  const y = yShift * LOGICAL_SCALE;
  const dark = '#392d2c';
  const warm = '#9b554c';
  const diagonal = state.direction === 1 || state.direction === 7;

  // The face stays simple at native size: bright eyes, a readable nose, and a
  // tiny mouth give the large head expression without turning it noisy.
  if (facingSide === 0 || diagonal) {
    const nearX = facingSide < 0 ? 41 : 51;
    const farX = facingSide < 0 ? 51 : 41;
    block(context, nearX, 19 + y, 2, 3, dark);
    block(context, nearX + 1, 19 + y, 1, 1, c.skinLight);
    block(context, farX, 19 + y, 2, 3, dark);
    block(context, farX, 19 + y, 1, 1, diagonal ? c.skinShade : c.skinLight);
    block(context, nearX - 1, 17 + y, 4, 1, shade(c.hair, -.12));
    block(context, farX - 1, 17 + y, 4, 1, shade(c.hair, -.12));
    block(context, 47, 23 + y, 2, 2, c.skinShade);
    block(context, 48, 23 + y, 1, 1, c.skinLight);
    block(context, 45, 27 + y, 5, 1, dark);
    block(context, 46, 28 + y, 3, 1, warm);
    block(context, 39, 24 + y, 2, 1, '#dba38a');
    block(context, 55, 24 + y, 2, 1, '#dba38a');
  } else {
    const eyeX = facingSide > 0 ? 54 : 40;
    const noseX = facingSide > 0 ? 59 : 35;
    block(context, eyeX, 19 + y, 2, 3, dark);
    block(context, eyeX + (facingSide > 0 ? 1 : 0), 19 + y, 1, 1, c.skinLight);
    block(context, eyeX - 1, 17 + y, 4, 1, shade(c.hair, -.12));
    block(context, noseX, 23 + y, 2, 2, c.skinShade);
    block(context, facingSide > 0 ? 53 : 39, 27 + y, 4, 1, dark);
    block(context, facingSide > 0 ? 54 : 40, 28 + y, 2, 1, warm);
  }
}

function drawHairHighlights(context, appearance, state, c, yShift, back) {
  const outfit = appearance.outfitId?.slice('outfit.'.length) || 'white-base';
  const hasHeadwear = appearance.headwearId !== 'headwear.none'
    || ['white-base', 'commoner', 'mage-robe', 'dark-armor', 'light-armor', 'dimension-coat'].includes(outfit);
  if (hasHeadwear) return;
  const y = yShift * LOGICAL_SCALE;
  const shine = shade(c.hair, .16);
  if (back) {
    block(context, 41, 12 + y, 7, 1, shine);
    block(context, 51, 14 + y, 3, 1, shade(c.hair, -.08));
  } else {
    block(context, 41, 11 + y, 4, 1, shine);
    block(context, 48, 12 + y, 3, 1, shade(c.hair, -.08));
    block(context, 38, 16 + y, 3, 1, shade(c.hair, -.08));
    block(context, 54, 15 + y, 3, 1, shine);
  }
}

function drawForegroundArm(context, appearance, state, c, nearX, yShift, step, jump, back, side) {
  const wave = state.wave;
  const dance = state.dance;
  const reach = Math.max(state.reach, state.offer);
  const armSwing = (state.moving || state.swimming) ? Math.round(step * .65) : 0;
  const armRaised = wave || dance || (jump ? 1 : 0);
  const gesture = wave > .25 ? 'wave' : dance > .25 ? 'dance' : '';
  context.save();
  context.scale(LOGICAL_SCALE, LOGICAL_SCALE);
  drawArm(context, nearX, 22 + yShift, c, armSwing, jump, armRaised, false, reach, gesture, state.gestureFrame);
  if (!back) {
    drawHeldItem(context, appearance.mainHandId, nearX + (side < 0 ? -4 : 4),
      27 + yShift - (armRaised ? 7 : 0), c, false);
  }
  context.restore();
}

function drawSleeveDetails(context, state, c, nearX, farX, yShift, step, jump) {
  const wave = state.wave;
  const dance = state.dance;
  const reach = Math.max(state.reach, state.offer);
  const swing = (state.moving || state.swimming) ? Math.round(step * .65) : 0;
  const raised = Math.max(jump ? 1 : 0, wave, dance);
  const nearY = 22 + yShift + swing - Math.round(Math.max(jump, raised, reach) * 6);
  const farY = 22 + yShift - swing - Math.round(Math.max(jump, 0) * 6);
  [[farX, farY, true], [nearX, nearY, false]].forEach(([x, y, far]) => {
    const px = x * LOGICAL_SCALE;
    const py = Math.round(y * LOGICAL_SCALE);
    block(context, px + 2, py + 12, 8, 2, c.leather);
    block(context, px + 3, py + 12, 5, 1, far ? c.clothDark : c.clothLight);
    block(context, px + 4, py + 15, 2, 1, c.skinLight);
  });
}

function drawOutfitDetails(context, appearance, state, c, outfit, torsoLeft, torsoWidth, yShift, back) {
  const y = yShift * LOGICAL_SCALE;
  const center = 48;
  const left = torsoLeft * LOGICAL_SCALE;
  const width = torsoWidth * LOGICAL_SCALE;
  const armor = outfit === 'dark-armor' || outfit === 'light-armor';

  if (back) {
    block(context, center - 1, 39 + y, 2, 16, c.clothDark);
    block(context, left + 6, 43 + y, 3, 1, c.clothLight);
    block(context, left + width - 9, 46 + y, 3, 1, c.clothLight);
    block(context, center - 5, 59 + y, 10, 2, c.gold);
    return;
  }

  if (armor) {
    block(context, center - 1, 40 + y, 2, 17, c.gold);
    block(context, center - 4, 43 + y, 8, 1, c.clothLight);
    block(context, center - 3, 47 + y, 6, 2, c.glow);
    block(context, left + 5, 54 + y, 3, 1, c.metal);
  } else {
    // A small neckline and seam make the shirt read as layered clothing.
    block(context, center - 6, 36 + y, 12, 3, c.clothDark);
    block(context, center - 4, 38 + y, 8, 3, c.clothLight);
    block(context, center - 2, 40 + y, 4, 2, c.clothDark);
    block(context, center - 1, 43 + y, 2, 8, c.clothDark);
    block(context, center - 1, 44 + y, 1, 5, c.clothLight);
    block(context, left + 5, 51 + y, 3, 1, c.clothLight);
    block(context, left + width - 8, 53 + y, 3, 1, c.clothDark);
  }

  if (outfit === 'white-base' || outfit === 'commoner') {
    const strap = [[51, 39], [49, 41], [47, 43], [45, 45], [43, 47], [41, 49], [39, 51]];
    strap.forEach(([x, row]) => {
      block(context, x, row + y, 3, 2, c.leather);
      block(context, x + 1, row + y, 1, 1, c.leatherLight);
    });
    block(context, 38, 54 + y, 8, 9, c.outline);
    block(context, 39, 55 + y, 6, 7, c.leather);
    block(context, 39, 55 + y, 6, 2, c.leatherLight);
    block(context, 41, 58 + y, 3, 2, c.gold);
    block(context, 42, 59 + y, 1, 1, c.outline);
    block(context, 54, 42 + y, 2, 2, '#9ebd67');
    block(context, 52, 44 + y, 5, 2, '#557a4d');
    block(context, 53, 46 + y, 3, 1, '#355541');
    block(context, 56, 45 + y, 2, 1, '#a8c86a');
    block(context, 56, 44 + y, 1, 3, c.gold);
  } else if (!armor) {
    block(context, center - 3, 44 + y, 6, 6, c.clothDark);
    block(context, center - 2, 45 + y, 4, 4, c.gold);
    block(context, center - 1, 46 + y, 2, 2, c.glow);
  }

  // Belt, buckle, and the ends of the tunic remain readable across body shapes.
  block(context, left + 3, 60 + y, width - 6, 2, c.leather);
  block(context, center - 3, 59 + y, 6, 5, c.gold);
  block(context, center - 1, 60 + y, 2, 3, c.leatherLight);
  block(context, left + 5, 65 + y, 2, 4, c.clothDark);
  block(context, left + width - 7, 65 + y, 2, 4, c.clothDark);
}

function drawLegDetails(context, x, y, offset, trouser, c) {
  const legY = Math.round(y + offset);
  const px = x * LOGICAL_SCALE;
  const py = legY * LOGICAL_SCALE;
  block(context, px + 7, py + 7, 1, 8, shade(trouser, -.16));
  block(context, px + 3, py + 17, 5, 1, shade(trouser, .12));
  block(context, px + 9, py + 16, 2, 1, shade(trouser, -.14));
  block(context, px + 2, py + 17, 12, 2, c.outline);
  block(context, px + 4, py + 16, 4, 1, c.leatherLight);
  block(context, px + 4, py + 20, 10, 1, '#17191b');
  block(context, px + 5, py + 18, 5, 1, '#8c6b4d');
}

function drawRobeHem(context, torsoLeft, torsoWidth, yShift, c) {
  const left = torsoLeft * LOGICAL_SCALE;
  const right = (torsoLeft + torsoWidth) * LOGICAL_SCALE;
  const y = 78 + yShift * LOGICAL_SCALE;
  for (let x = left + 5; x < right - 5; x += 6) block(context, x, y, 2, 2, c.gold);
  block(context, left + 4, y - 3, 2, 1, c.clothLight);
  block(context, right - 6, y - 3, 2, 1, c.clothLight);
}

function drawLeg(context, x, y, offset, color, c, tucked) {
  const legY = y + Math.round(offset);
  block(context, x, legY, 6, 10, c.outline);
  block(context, x + 1, legY + 1, 4, 7, color);
  block(context, x + 2, legY + 2, 2, 5, shade(color, .12));
  block(context, x - (tucked ? 1 : 0), legY + 8, 8, 4, '#292729');
  block(context, x + 1, legY + 8, 5, 1, '#80634b');
}

function drawCrouchedLeg(context, x, y, offset, color, c, sign, amountValue) {
  const legY = y + Math.round(offset);
  const bend = Math.round(2 * amountValue);
  const thighX = x - (sign < 0 ? 1 : 0);
  block(context, thighX, legY + 1, 9, 6, c.outline);
  block(context, thighX + 1, legY + 2, 7, 4, color);
  block(context, thighX + 2, legY + 2, 4, 2, shade(color, .10));
  const shinX = x + sign * (3 + bend);
  block(context, shinX, legY + 4, 6, 7, c.outline);
  block(context, shinX + 1, legY + 5, 4, 4, color);
  block(context, shinX - (sign < 0 ? 3 : 0), legY + 9, 9, 3, '#292729');
  block(context, shinX + (sign < 0 ? -2 : 1), legY + 9, 4, 1, '#80634b');
}

function drawCrouchLegDetails(context, x, y, trouser, c, sign) {
  const px = x * LOGICAL_SCALE, py = Math.round(y * LOGICAL_SCALE);
  block(context, px + 2, py + 5, 7, 1, shade(trouser, .12));
  block(context, px + sign * 6, py + 10, 2, 4, shade(trouser, -.16));
  block(context, px + sign * 5, py + 18, 10, 2, c.outline);
  block(context, px + sign * 5 + 2, py + 17, 5, 1, c.leatherLight);
}

function drawPixelLimb(context, from, to, outerWidth, innerWidth, outer, inner) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 2));
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    block(context, x - Math.floor(outerWidth / 2), y - Math.floor(outerWidth / 2), outerWidth, outerWidth, outer);
  }
  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const x = Math.round(from.x + (to.x - from.x) * t);
    const y = Math.round(from.y + (to.y - from.y) * t);
    block(context, x - Math.floor(innerWidth / 2), y - Math.floor(innerWidth / 2), innerWidth, innerWidth, inner);
  }
}

function drawWavingArm(context, x, y, c, frame) {
  const outward = x < 24 ? -1 : 1;
  const sway = [-2, -1, 0, 1, 2, 1, 0, -1, -2, -1, 0, 1][frame % GESTURE_FRAME_COUNT];
  const shoulder = { x: x + 3, y: y + 1 };
  const elbow = { x: x + 3 + outward * 3, y: y - 4 };
  const wrist = { x: x + 3 + outward * 5 + sway, y: y - 10 };
  drawPixelLimb(context, shoulder, elbow, 6, 4, c.outline, c.clothLight);
  drawPixelLimb(context, elbow, wrist, 5, 3, c.outline, c.skin);
  block(context, wrist.x - 2, wrist.y - 1, 5, 4, c.outline);
  block(context, wrist.x - 1, wrist.y, 3, 2, c.skinLight);
  block(context, wrist.x + outward, wrist.y - 3, 2, 3, c.skinLight);
  block(context, wrist.x + outward * 2, wrist.y - 2, 1, 2, c.skin);
}

function drawDancingArm(context, x, y, c, frame, far = false) {
  const phase = (frame + (far ? 6 : 0)) % GESTURE_FRAME_COUNT;
  const outward = x < 24 ? -1 : 1;
  const lift = [4, 6, 8, 7, 5, 3, 4, 6, 8, 7, 5, 3][phase];
  const sway = [0, 1, 2, 1, 0, -1, -2, -1, 0, 1, 2, 1][phase];
  const shoulder = { x: x + 3, y: y + 1 };
  const elbow = { x: x + 3 + outward * 4, y: y - Math.round(lift * .55) };
  const wrist = { x: elbow.x + outward * 2 + sway, y: y - lift };
  drawPixelLimb(context, shoulder, elbow, 6, 4, c.outline, c.clothLight);
  drawPixelLimb(context, elbow, wrist, 5, 3, c.outline, c.skin);
  block(context, wrist.x - 1, wrist.y - 1, 4, 4, c.outline);
  block(context, wrist.x, wrist.y, 2, 2, c.skinLight);
}

function drawSitSupportArm(context, x, y, c, amountValue) {
  const outward = x < 24 ? -1 : 1;
  const shoulder = { x: x + 3, y: y + 2 };
  const elbow = { x: x + 3 + outward * 3, y: y + 5 };
  const wrist = { x: x + 3 + outward * 5, y: y + 11 + Math.round((1 - amountValue) * 2) };
  drawPixelLimb(context, shoulder, elbow, 6, 4, c.outline, c.clothLight);
  drawPixelLimb(context, elbow, wrist, 5, 3, c.outline, c.skin);
  block(context, wrist.x - 2, wrist.y - 1, 5, 3, c.outline);
  block(context, wrist.x - 1, wrist.y, 3, 1, c.skinLight);
}

function drawArm(context, x, y, c, swing = 0, jump = 0, raised = 0, far = false, reach = 0, gesture = '', gestureFrame = 0) {
  if (gesture === 'wave' && !far) {
    drawWavingArm(context, x, y, c, gestureFrame);
    return;
  }
  if (gesture === 'dance') {
    drawDancingArm(context, x, y, c, gestureFrame, far);
    return;
  }
  const lift = Math.max(jump, raised, reach);
  const armY = y + Math.round(swing) - Math.round(lift * 6);
  block(context, x, armY, 6, 9, c.outline);
  block(context, x + 1, armY + 1, 4, 6, far ? shade(c.cloth, -.10) : c.clothLight);
  block(context, x + 1, armY + 7, 4, 4, c.skinShade);
  block(context, x + 2, armY + 7, 3, 3, c.skin);
  if (reach) block(context, x + (x < 24 ? -3 : 5), armY + 6, 5, 3, c.skinLight);
}

function drawHair(context, style, color, back, y) {
  if (back) {
    block(context, 18, 6 + y, 12, 11, color);
    block(context, 17, 9 + y, 2, 8, shade(color, -.12));
    block(context, 29, 9 + y, 2, 8, shade(color, -.18));
    block(context, 19, 15 + y, 10, 2, shade(color, -.08));
    if (style === 'long') block(context, 18, 15 + y, 3, 5, color);
    return;
  }
  block(context, 20, 4 + y, 8, 2, color);
  block(context, 18, 5 + y, 12, 3, color);
  block(context, 17, 7 + y, 14, 3, color);
  block(context, 19, 9 + y, 10, 2, color);
  block(context, 17, 8 + y, 3, back || style === 'long' ? 10 : 5, shade(color, -.12));
  block(context, 28, 8 + y, 3, back || style === 'long' ? 10 : 5, shade(color, -.18));
  if (style !== 'shaved') {
    block(context, 20, 10 + y, 3, 2, shade(color, -.08));
    block(context, 25, 10 + y, 3, 1, shade(color, .08));
  }
  if (style === 'long') block(context, 18, 12 + y, 3, 7, color);
  if (style === 'curly') {
    block(context, 17, 5 + y, 4, 3, color); block(context, 27, 5 + y, 4, 3, shade(color, -.08));
  }
}

function drawHeadwear(context, id, outfit, c, y, state) {
  if (id === 'headwear.mage-hood' || outfit === 'mage-robe') {
    polygon(context, [[17, 11 + y], [19, 3 + y], [24, 1 + y], [30, 4 + y], [32, 13 + y], [28, 8 + y], [20, 8 + y]], c.clothDark);
    block(context, 19, 6 + y, 10, 2, c.cloth); block(context, 19, 8 + y, 2, 5, c.gold);
  } else if (id === 'headwear.knight-helm' || outfit === 'dark-armor' || outfit === 'light-armor') {
    block(context, 18, 4 + y, 12, 3, c.metal); block(context, 17, 7 + y, 14, 5, c.clothDark);
    block(context, 19, 10 + y, 10, 2, c.outline);
    if (!state.facing.includes('north')) block(context, 20, 9 + y, 8, 1, c.glow);
    block(context, 23, 3 + y, 3, 2, c.gold);
  } else if (id === 'headwear.dimension-visor' || outfit === 'dimension-coat') {
    block(context, 18, 4 + y, 12, 3, c.clothDark); block(context, 18, 7 + y, 12, 3, c.cloth);
    if (!state.facing.includes('north')) block(context, 20, 9 + y, 8, 2, c.glow);
    block(context, 16, 10 + y, 3, 2, c.gold); block(context, 29, 10 + y, 3, 2, c.gold);
  } else if (id === 'headwear.farm-cap' || outfit === 'commoner') {
    block(context, 18, 4 + y, 12, 3, '#3e493b'); block(context, 17, 7 + y, 14, 2, '#68754b');
    block(context, 22, 3 + y, 5, 2, '#526345');
  } else if (id === 'headwear.none' && outfit === 'white-base') {
    // The legacy default outfit ID now carries the graphite knit cap from the
    // game's forest-explorer look; explicit headwear selections still win.
    block(context, 18, 4 + y, 12, 4, c.outline);
    block(context, 19, 4 + y, 10, 3, '#3b4246');
    block(context, 18, 7 + y, 12, 2, '#646c70');
    block(context, 17, 8 + y, 14, 1, '#2b3236');
    block(context, 21, 5 + y, 4, 1, '#737b7e');
  }
}

function drawCape(context, outfit, c, state, y) {
  const color = outfit === 'dark-armor' ? '#37333f' : outfit === 'light-armor' ? '#e4c66f' : '#376c77';
  const flutter = state.reducedMotion ? 0 : state.auraFrame % 2;
  polygon(context, [[18, 18 + y], [29, 18 + y], [31 + flutter, 33 + y], [25, 31 + y], [18 - flutter, 35 + y]], c.outline);
  polygon(context, [[19, 19 + y], [28, 19 + y], [29 + flutter, 31 + y], [25, 29 + y], [19 - flutter, 33 + y]], color);
  block(context, 21, 23 + y, 2, 8, shade(color, .16));
}

function drawCoatBack(context, left, y, c) {
  block(context, left + 2, 21 + y, 2, 10, c.clothDark);
  block(context, left + 3, 22 + y, 2, 7, c.clothLight);
}

function drawHeldItem(context, id = '', x = 30, y = 27, c, behind = false) {
  const item = id?.slice('equipment.'.length);
  if (!item || item === 'none') return;
  context.save();
  if (behind) context.globalAlpha *= .82;
  const handle = '#75513a';
  if (item === 'staff' || item === 'branch') {
    block(context, x, y - 11, 2, 18, handle); block(context, x - 1, y - 12, 4, 3, c.gold);
    if (item === 'staff') block(context, x - 1, y - 14, 4, 3, c.glow);
  } else if (item === 'lantern') {
    block(context, x, y - 8, 2, 4, handle); block(context, x - 2, y - 4, 6, 7, c.outline);
    block(context, x - 1, y - 3, 4, 5, c.gold); block(context, x, y - 2, 2, 3, c.glow);
  } else if (item.includes('sword') || item === 'knife') {
    const blade = item === 'dark-sword' ? '#b9869c' : item === 'light-sword' ? '#a7f3e2' : '#c6d4d3';
    block(context, x, y - 11, 2, 10, blade); block(context, x - 2, y - 2, 6, 2, c.gold);
    block(context, x, y, 2, 4, handle); block(context, x - 1, y + 3, 4, 2, c.outline);
  } else if (item === 'axe') {
    block(context, x, y - 9, 2, 14, handle); block(context, x - 3, y - 10, 6, 4, c.metal);
    block(context, x - 3, y - 10, 2, 4, c.gold);
  } else if (item === 'dimensional-device') {
    block(context, x - 2, y - 6, 6, 8, c.outline); block(context, x - 1, y - 5, 4, 6, c.glow);
    block(context, x, y - 4, 2, 4, c.gold);
  }
  context.restore();
}

function drawAura(context, color, frame) {
  const dots = [[11, 26], [35, 22], [15, 12], [33, 34]];
  dots.forEach(([x, y], index) => {
    if ((index + frame) % 2 === 0) block(context, x, y + (frame % 2), 2, 2, color);
  });
}

let surfaceLightFrame;
export function drawCanvasAvatar(context, x, y, selected, value, { scale = 1, animation = {}, smooth = false, surfaceLight = null } = {}) {
  if (!context || !selected) return false;
  const appearance = normalizeAppearance(value);
  const state = avatarState(selected, animation);
  let frame = getFrame(appearance, state);
  if(surfaceLight&&globalThis.document){
    if(!surfaceLightFrame){surfaceLightFrame=document.createElement('canvas');surfaceLightFrame.width=96;surfaceLightFrame.height=96;}
    const lightContext=surfaceLightFrame.getContext('2d');lightContext.clearRect(0,0,96,96);lightContext.drawImage(frame,0,0);
    applyAvatarSurfaceLight(lightContext,96,96,surfaceLight);frame=surfaceLightFrame;
  }
  const height = appearance.height || 1;
  context.save();
  context.imageSmoothingEnabled = smooth;
  if(smooth)context.imageSmoothingQuality='high';
  context.translate(Math.round(x), Math.round(y));
  context.scale(scale, scale * height);
  context.drawImage(frame, -48, -84, 96, 96);
  context.restore();
  return true;
}

export function clearCanvasAvatarCache() {
  frameCache.clear();
}

export function canvasAvatarCacheStats() {
  return { frames: frameCache.size, limit: FRAME_LIMIT, estimatedBytes: frameCache.size * GRID * GRID * 4 };
}
