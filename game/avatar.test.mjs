import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFacingDirection, getAvatarFacing, getAvatarPose, getFacingFromMotion, getFacingFromVector, getFacingIntent, getLocalAvatarView } from './avatar.mjs';
import { getWorldInput } from './input.mjs';
import { WORLD_TILE_X, WORLD_TILE_Y } from './world.mjs';

test('o avatar local acompanha a posição predita entre snapshots do servidor', () => {
  const serverSnapshot = { id: 'self', name: 'Brasa', x: 8.2, y: 12.3, moving: false, inventory: { wood: 1 } };
  const predicted = { x: 8.42, y: 12.3, moving: true, facing: 'east' };

  assert.deepEqual(getLocalAvatarView(serverSnapshot, predicted), {
    ...serverSnapshot,
    ...predicted,
    facing: 'east',
  });
});

test('sentar mantém uma pose distinta enquanto o jogador está parado', () => {
  assert.deepEqual(getAvatarPose({ emote: 'sit', emoteUntil: 0, moving: false }, 5000), {
    sitting: true,
    symbol: null,
    gesture: null,
    gathering: false,
    lying:false,
    showering:false,
  });
});

test('quem descansa perto do fogo se volta para a roda e mantém o rumo ao se levantar', () => {
  const player = { emote: 'sit', emoteUntil: 0, moving: false, facing: 'north' };
  const position = { x: 8, y: 8 };
  const fires = [{ x: 9, y: 8 }];

  assert.equal(getAvatarFacing(player, position, fires, WORLD_TILE_X, WORLD_TILE_Y), 'southeast');
  assert.equal(getAvatarFacing({ ...player, moving: true }, position, fires, WORLD_TILE_X, WORLD_TILE_Y), 'north');
  assert.equal(getAvatarFacing(player, position, [{ x: 14, y: 8 }], WORLD_TILE_X, WORLD_TILE_Y), 'north');
});

test('caminhar encerra a pose sentada e aceno/dança ainda expiram', () => {
  assert.equal(getAvatarPose({ emote: 'sit', emoteUntil: 0, moving: true }, 5000).sitting, false);
  assert.deepEqual(getAvatarPose({ emote: 'wave', emoteUntil: 4900, moving: false }, 5000), { sitting: false, symbol: null, gesture: null, gathering: false,lying:false,showering:false });
});

test('aceno e dança conservam seus sinais sem representar sentar como sono', () => {
  assert.deepEqual(getAvatarPose({ emote: 'wave', emoteUntil: 1900, moving: false }, 1000), { sitting: false, symbol: '✦', gesture: 'wave', gathering: false,lying:false,showering:false });
  assert.deepEqual(getAvatarPose({ emote: 'dance', emoteUntil: 1900, moving: false }, 1000), { sitting: false, symbol: '♪', gesture: 'dance', gathering: false,lying:false,showering:false });
  assert.deepEqual(getAvatarPose({ emote: 'sit', emoteUntil: 1900, moving: false }, 1000), { sitting: true, symbol: null, gesture: null, gathering: false,lying:false,showering:false });
});

test('deitar e tomar banho são poses sincronizáveis e terminam quando há movimento',()=>{
 const sleeping=getAvatarPose({emote:'lie',emoteUntil:0,moving:false},5000);
 assert.equal(sleeping.lying,true);assert.equal(sleeping.showering,false);
 assert.equal(getAvatarPose({emote:'lie',emoteUntil:0,moving:true},5000).lying,false);
 assert.equal(getAvatarPose({emote:'shower',emoteUntil:0,moving:false},5000).showering,true);
});

test('oferecer uma frutinha estende o braço só durante a resposta do avatar', () => {
  assert.deepEqual(getAvatarPose({ emote: 'offer', emoteUntil: 1600, moving: false }, 1200), {
    sitting: false,
    symbol: null,
    gesture: 'offer',
    gathering: false,
    lying:false,
    showering:false,
  });
  assert.equal(getAvatarPose({ emote: 'offer', emoteUntil: 1100, moving: false }, 1200).gesture, null);
});

test('a coleta aparece no corpo do avatar remoto e some ao expirar ou caminhar', () => {
  assert.equal(getAvatarPose({ emote: 'gather', emoteUntil: 1600, moving: false }, 1200).gathering, true);
  assert.equal(getAvatarPose({ emote: 'gather', emoteUntil: 1100, moving: false }, 1200).gathering, false);
  assert.equal(getAvatarPose({ emote: 'gather', emoteUntil: 1600, moving: true }, 1200).gathering, false);
});

test('o avatar vira para onde as setas e o direcional realmente movem na tela', () => {
  const directions = [
    ['ArrowUp', 'north'],
    ['ArrowRight', 'east'],
    ['ArrowDown', 'south'],
    ['ArrowLeft', 'west'],
  ];

  for (const [key, expected] of directions) {
    const keyboard = getWorldInput(new Set([key]), new Map(), WORLD_TILE_X, WORLD_TILE_Y);
    const touch = getWorldInput(new Set(), new Map([[1, key === 'ArrowUp' ? [0, -1] : key === 'ArrowRight' ? [1, 0] : key === 'ArrowDown' ? [0, 1] : [-1, 0]]]), WORLD_TILE_X, WORLD_TILE_Y);
    assert.equal(getFacingFromVector(keyboard.x, keyboard.y, WORLD_TILE_X, WORLD_TILE_Y), expected);
    assert.equal(getFacingFromVector(touch.x, touch.y, WORLD_TILE_X, WORLD_TILE_Y), expected);
  }
});

test('parar conserva a última direção e diagonais próximas não fazem o avatar tremer', () => {
  assert.equal(getFacingFromVector(0, 0, WORLD_TILE_X, WORLD_TILE_Y, 'west'), 'west');
  assert.equal(getFacingFromVector(Number.NaN, 1, WORLD_TILE_X, WORLD_TILE_Y, 'north'), 'north');
  const almostDiagonal = getWorldInput(new Set(['ArrowUp', 'ArrowRight']), new Map(), WORLD_TILE_X, WORLD_TILE_Y);
  assert.equal(getFacingFromVector(almostDiagonal.x, almostDiagonal.y, WORLD_TILE_X, WORLD_TILE_Y, 'east'), 'northeast');
});

test('a frenagem não troca uma diagonal por outro rumo enquanto ainda há deslocamento residual', () => {
  for (const facing of ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']) {
    assert.equal(getFacingFromMotion(0.01, -0.01, WORLD_TILE_X, WORLD_TILE_Y, facing, false), facing);
  }
  const diagonal = getWorldInput(new Set(['ArrowUp', 'ArrowRight']), new Map(), WORLD_TILE_X, WORLD_TILE_Y);
  assert.equal(getFacingFromMotion(diagonal.x, diagonal.y, WORLD_TILE_X, WORLD_TILE_Y, 'south', true), 'northeast');
});

test('a orientação ignora inércia sem tecla e usa deslocamento real quando há colisão', () => {
  assert.deepEqual(getFacingIntent({ x: 0, y: 0 }, 0.01, -0.01), { x: 0, y: 0 });
  const south = getWorldInput(new Set(['ArrowDown']), new Map(), WORLD_TILE_X, WORLD_TILE_Y);
  assert.deepEqual(getFacingIntent(south, 0.03, 0, WORLD_TILE_X, WORLD_TILE_Y), { x: 0.03, y: 0 });
  const northwest = getWorldInput(new Set(['ArrowUp', 'ArrowLeft']), new Map(), WORLD_TILE_X, WORLD_TILE_Y);
  const northeastDrift = getWorldInput(new Set(['ArrowUp', 'ArrowRight']), new Map(), WORLD_TILE_X, WORLD_TILE_Y);
  assert.deepEqual(getFacingIntent(northwest, northeastDrift.x, northeastDrift.y, WORLD_TILE_X, WORLD_TILE_Y), northwest);
  assert.deepEqual(getFacingIntent({ x: 0, y: 1 }, 0, 0), { x: 0, y: 1 });
});

test('uma soltura parcial de diagonal não troca o rumo antes de a nova intenção se firmar', () => {
  const diagonal = getWorldInput(new Set(['ArrowUp', 'ArrowRight']), new Map(), WORLD_TILE_X, WORLD_TILE_Y);
  const north = getWorldInput(new Set(['ArrowUp']), new Map(), WORLD_TILE_X, WORLD_TILE_Y);
  let state = { facing: 'south', candidate: 'south', elapsed: 0 };
  state = advanceFacingDirection(state, diagonal, WORLD_TILE_X, WORLD_TILE_Y, 1 / 60);
  assert.equal(state.facing, 'south', 'one input frame is only a candidate');
  state = advanceFacingDirection(state, { x: 0, y: 0 }, WORLD_TILE_X, WORLD_TILE_Y, 1 / 60);
  assert.equal(state.facing, 'south', 'releasing both keys keeps the prior direction');
  state = advanceFacingDirection(state, diagonal, WORLD_TILE_X, WORLD_TILE_Y, 1 / 60);
  state = advanceFacingDirection(state, diagonal, WORLD_TILE_X, WORLD_TILE_Y, 1 / 60);
  state = advanceFacingDirection(state, diagonal, WORLD_TILE_X, WORLD_TILE_Y, 1 / 60);
  state = advanceFacingDirection(state, diagonal, WORLD_TILE_X, WORLD_TILE_Y, 1 / 60);
  assert.equal(state.facing, 'northeast', 'a held diagonal becomes visible after four fixed steps');
  state = advanceFacingDirection(state, north, WORLD_TILE_X, WORLD_TILE_Y, 1 / 60);
  assert.equal(state.facing, 'northeast', 'the first key release does not collapse the diagonal');
  state = advanceFacingDirection(state, { x: 0, y: 0 }, WORLD_TILE_X, WORLD_TILE_Y, 1 / 60);
  assert.equal(state.facing, 'northeast', 'the avatar keeps the diagonal at rest');
});


test('uma diagonal nunca conserva a direção oposta do movimento anterior', () => {
  for(const [keys,allowed] of [
    [['ArrowUp','ArrowRight'],['northeast']],
    [['ArrowDown','ArrowRight'],['southeast']],
    [['ArrowDown','ArrowLeft'],['southwest']],
    [['ArrowUp','ArrowLeft'],['northwest']],
  ]) {
    const input=getWorldInput(new Set(keys),new Map(),WORLD_TILE_X,WORLD_TILE_Y);
    for(const previous of ['north','northeast','east','southeast','south','southwest','west','northwest']) {
      assert.equal(getFacingFromVector(input.x,input.y,WORLD_TILE_X,WORLD_TILE_Y,previous),allowed[0],`${keys}: rumo anterior ${previous}`);
    }
  }
});

test('wave preserves seated posture during and after its temporary gesture',()=>{
 const player={sitting:true,moving:false,emote:'wave',emoteUntil:2000};
 assert.equal(getAvatarPose(player,1000).sitting,true);assert.equal(getAvatarPose(player,1000).gesture,'wave');
 assert.equal(getAvatarPose(player,3000).sitting,true);assert.equal(getAvatarPose(player,3000).gesture,null);
 assert.equal(getAvatarPose({...player,moving:true},1000).sitting,false);
});
