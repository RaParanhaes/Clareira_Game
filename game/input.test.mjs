import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { clearHeldInputs, getWorldInput, isInteractiveKeyboardTarget, screenDirectionToWorld } from './input.mjs';
import { SPAWN, stepPlayer, WORLD_TILE_X, WORLD_TILE_Y } from './world.mjs';

test('limpa teclas e toques mantidos ao perder foco', () => {
  const keys = new Set(['ArrowRight', 'w']);
  const touchDirections = new Map([[4, [1, 0]], [9, [0, -1]]]);

  const neutral = clearHeldInputs(keys, touchDirections);

  assert.equal(keys.size, 0);
  assert.equal(touchDirections.size, 0);
  assert.deepEqual(neutral, { x: 0, y: 0 });
  assert.deepEqual(getWorldInput(keys, touchDirections, WORLD_TILE_X, WORLD_TILE_Y), neutral);
});

test('direções de tela acompanham a projeção isométrica sem mudar a velocidade no mapa', () => {
  const tileX = WORLD_TILE_X;
  const tileY = WORLD_TILE_Y;
  const directions = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
  ];

  for (const screen of directions) {
    const world = screenDirectionToWorld(screen, tileX, tileY);
    const projectedX = (world.x - world.y) * tileX;
    const projectedY = (world.x + world.y) * tileY;

    assert.ok(Math.abs(Math.hypot(world.x, world.y) - 1) < 1e-9);
    assert.ok(projectedX * screen.x + projectedY * screen.y > 0);
    assert.ok(Math.abs(projectedX * screen.y - projectedY * screen.x) < 1e-9);
  }

  assert.deepEqual(screenDirectionToWorld({ x: 0, y: 0 }, tileX, tileY), { x: 0, y: 0 });
  assert.deepEqual(screenDirectionToWorld({ x: 1, y: 1 }, 0, tileY), { x: 0, y: 0 });
});

test('setas, WASD e direcional de toque usam a mesma orientação da tela', () => {
  const tileX = WORLD_TILE_X;
  const tileY = WORLD_TILE_Y;
  const directions = [
    ['ArrowUp', 0, -1], ['w', 0, -1],
    ['ArrowRight', 1, 0], ['d', 1, 0],
    ['ArrowDown', 0, 1], ['s', 0, 1],
    ['ArrowLeft', -1, 0], ['a', -1, 0],
  ];
  const project = world => ({
    x: (world.x - world.y) * tileX,
    y: (world.x + world.y) * tileY,
  });

  for (const [key, expectedX, expectedY] of directions) {
    const expected = { x: expectedX, y: expectedY };
    const keyboard = project(getWorldInput(new Set([key]), new Map(), tileX, tileY));
    const touch = project(getWorldInput(new Set(), new Map([[1, [expectedX, expectedY]]]), tileX, tileY));
    for (const actual of [keyboard, touch]) {
      assert.ok(actual.x * expected.x + actual.y * expected.y > 0);
      assert.ok(Math.abs(actual.x * expected.y - actual.y * expected.x) < 1e-9);
    }
  }

  const keyboardDiagonal = getWorldInput(new Set(['ArrowUp', 'ArrowRight']), new Map(), tileX, tileY);
  const touchDiagonal = getWorldInput(new Set(), new Map([[1, [0, -1]], [2, [1, 0]]]), tileX, tileY);
  assert.deepEqual(keyboardDiagonal, touchDiagonal);
});

test('o passo real do jogador segue a seta visual em chão livre', () => {
  const directions = [
    ['ArrowUp', 0, -1],
    ['ArrowRight', 1, 0],
    ['ArrowDown', 0, 1],
    ['ArrowLeft', -1, 0],
  ];
  const project = position => ({
    x: position.x * WORLD_TILE_X - position.y * WORLD_TILE_X,
    y: position.x * WORLD_TILE_Y + position.y * WORLD_TILE_Y,
  });
  // Spawn is close to the enlarged fire; exercise direction on genuinely clear ground.
  const origin = {...SPAWN,y:SPAWN.y+.7};
  const start = project(origin);

  for (const [key, expectedX, expectedY] of directions) {
    const input = getWorldInput(new Set([key]), new Map(), WORLD_TILE_X, WORLD_TILE_Y);
    const end = project(stepPlayer(origin, input, 0.05));
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    assert.ok(dx * expectedX + dy * expectedY > 0);
    assert.ok(Math.abs(dx * expectedY - dy * expectedX) < 1e-9);
  }
});

test('queda curta mantém cena e caminhada; conexão sem cena limpa dados antigos', async () => {
  const main = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  const closeHandler = main.match(/socket\.addEventListener\('close', event => \{([\s\S]*?)\n  \}\);/)?.[1];

  assert.ok(closeHandler, 'o cliente registra o fechamento do WebSocket');
  assert.match(closeHandler, /if \(socket !== connection\) return;/);
  assert.match(closeHandler, /dimensionArrivalStartedAt=0;dimensionRequestStartedAt=0/,
    'travel timers must not include time spent disconnected');
  assert.match(closeHandler, /const canKeepScene = authenticated && sceneReady && predictionReady/);
  assert.match(closeHandler, /disconnectedAt \|\|= Date\.now\(\)/);
  assert.match(closeHandler, /const resumableScene = canKeepScene && Date\.now\(\) - disconnectedAt <= RESUME_SCENE_GRACE_MS/);
  const fallbackCleanup = closeHandler.match(/if \(!canKeepScene\) \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(fallbackCleanup, 'limpeza completa fica restrita a conexões sem cena pronta');
  for (const reset of ['clearMovement()', 'livePlayers.clear()', 'remotePositions.clear()', 'remoteFacings.clear()', 'clearWorldSnapshot(resources, fires)']) {
    assert.ok(fallbackCleanup.includes(reset), `${reset} só é usado no fallback sem cena`);
  }
  assert.match(closeHandler, /Conexão instável · sua caminhada continua enquanto reconecto/);
  const stateHandler = main.slice(main.indexOf("if (message.type !== 'state') return;"), main.indexOf('roomStateAvailable = true;'));
  assert.match(stateHandler, /applyWorldDefinition\(nextWorldDefinition\)/);
  assert.ok(stateHandler.indexOf('applyWorldDefinition') < stateHandler.indexOf('snapshotReady'), 'authoritative map edits are applied before the scene is revealed');
  assert.match(main, /getObjectiveText\(localPosition, \[\.\.\.resources\.values\(\)\], localInventory, objectiveFires, roomStateAvailable\)/);
});

test('controles focados conservam a ativação nativa pela barra de espaço', async () => {
  const button = { tagName: 'BUTTON' };
  const iconInsideButton = {
    tagName: 'SPAN',
    closest: selector => selector.includes('[role="button"]') ? button : null,
  };

  assert.equal(isInteractiveKeyboardTarget(button), true);
  assert.equal(isInteractiveKeyboardTarget(iconInsideButton), true);
  assert.equal(isInteractiveKeyboardTarget({ tagName: 'CANVAS' }), false);

  const main = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  const keydown = main.match(/window\.addEventListener\('keydown', event => \{([\s\S]*?)\n\}\);/u)?.[1];
  assert.ok(keydown, 'o cliente registra o teclado do jogo');
  const interactiveCheck = keydown.indexOf('const interactive = isInteractiveKeyboardTarget(event.target)');
  const interactiveGuard = keydown.indexOf('if (movementKey ? !canHandleMovementKey(event) : interactive) return;');
  const preventDefault = keydown.indexOf('event.preventDefault()', interactiveGuard);
  assert.ok(interactiveCheck >= 0 && interactiveCheck < interactiveGuard && interactiveGuard < preventDefault,
    'o controle focado deve sair do handler antes de cancelar a tecla');
});

test('WASD resumes movement over game buttons without stealing Space activation or text entry', async () => {
  const { canHandleMovementKey } = await import('./input.mjs');
  const event = (target, key='w', code='KeyW') => ({target,key,code});
  assert.equal(canHandleMovementKey(event({tagName:'BUTTON'})), true);
  assert.equal(canHandleMovementKey(event({tagName:'SUMMARY'})), true);
  assert.equal(canHandleMovementKey(event({tagName:'BUTTON'}, 'ArrowLeft', 'ArrowLeft')), true);
  assert.equal(canHandleMovementKey(event({tagName:'BUTTON'}, ' ', 'Space')), false);
  assert.equal(canHandleMovementKey(event({tagName:'CANVAS'}, ' ', 'Space')), true);
  for (const target of [{tagName:'INPUT'},{tagName:'TEXTAREA'},{tagName:'SELECT'},{isContentEditable:true},
    {tagName:'SPAN',closest:selector=>selector.includes('textbox')?{}:null}]) {
    assert.equal(canHandleMovementKey(event(target)), false, 'editing controls keep their own keyboard');
  }
  assert.equal(canHandleMovementKey({...event({tagName:'CANVAS'}),metaKey:true}), false);
  assert.equal(canHandleMovementKey({...event({tagName:'CANVAS'}),altKey:true}), false);
  assert.equal(canHandleMovementKey({...event({tagName:'CANVAS'}),isComposing:true}), false);
});

test('physical movement keys survive Shift, Caps Lock and layout changes between down and up', async () => {
  const {movementKeyForEvent}=await import('./input.mjs');
  const keys=new Set();
  keys.add(movementKeyForEvent({key:'W',code:'KeyW'}));
  assert.deepEqual(getWorldInput(keys,new Map(),32,18),getWorldInput(new Set(['w']),new Map(),32,18));
  keys.delete(movementKeyForEvent({key:'z',code:'KeyW'}));
  assert.equal(keys.size,0,'keyup releases the same physical key even if its text changed');
  assert.equal(movementKeyForEvent({key:'Shift',code:'ShiftLeft'}),'Shift');
  assert.equal(movementKeyForEvent({key:'Shift',code:'ShiftRight'}),'Shift');
  assert.equal(movementKeyForEvent({key:'A',code:''}),'a','synthetic/older keyboards retain a key fallback');
  assert.equal(movementKeyForEvent({key:'i',code:'KeyI'}),null,'non-movement shortcuts remain separate');
});
