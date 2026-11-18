import test from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEON_FIXTURE_ROWS, dungeonFixtureLevel, validateDungeonLevel } from './dungeon-contract.mjs';

// Nível válido e pequeno, copiado a cada caso para que cada teste altere só o que quer quebrar.
const valid = () => dungeonFixtureLevel();
const copy = level => ({ ...level, cells: new Uint8Array(level.cells), torches: level.torches.map(t => ({ ...t })) });

test('the fixture follows the documented format and matches its rows', () => {
  const level = dungeonFixtureLevel();
  assert.equal(level.w, DUNGEON_FIXTURE_ROWS[0].length);
  assert.equal(level.h, DUNGEON_FIXTURE_ROWS.length);
  assert.ok(level.cells instanceof Uint8Array);
  assert.equal(level.cells.length, level.w * level.h);
  DUNGEON_FIXTURE_ROWS.forEach((row, y) => {
    for (let x = 0; x < level.w; x++) assert.equal(level.cells[y * level.w + x], row[x] === '.' ? 1 : 0, `cell ${x},${y}`);
  });
  assert.equal(validateDungeonLevel(level), level);
});

test('a wrong number of cells is reported with the expected size', () => {
  const level = valid();
  level.cells = level.cells.slice(0, -1);
  assert.throws(() => validateDungeonLevel(level), /cells tem 59 valores, esperado 60 \(w\*h\)/);
});

test('cells must be a Uint8Array of 0 and 1 only', () => {
  assert.throws(() => validateDungeonLevel({ ...valid(), cells: Array.from(valid().cells) }), /cells deve ser Uint8Array/);
  const level = copy(valid());
  level.cells[11] = 2;
  assert.throws(() => validateDungeonLevel(level), /cells\[11\] = 2; só 0 \(rocha\) ou 1 \(piso aberto\)/);
});

test('an open cell on the grid border is rejected', () => {
  const level = copy(valid());
  level.cells[level.w * 2] = 1; // x = 0, y = 2
  assert.throws(() => validateDungeonLevel(level), /borda aberta em \(0,2\)/);
});

test('w, h and seed must be integers in range', () => {
  assert.throws(() => validateDungeonLevel({ ...valid(), w: 2.5 }), /w deve ser inteiro >= 3/);
  assert.throws(() => validateDungeonLevel({ ...valid(), h: 0 }), /h deve ser inteiro >= 3/);
  assert.throws(() => validateDungeonLevel({ ...valid(), seed: '7' }), /seed deve ser inteiro/);
});

test('torches sit on rock with open floor below, inside the grid and without repeats', () => {
  const onOpen = copy(valid());
  onOpen.torches = [{ x: 1, y: 1 }];
  assert.throws(() => validateDungeonLevel(onOpen), /está em piso aberto/);
  const noFloorBelow = copy(valid());
  noFloorBelow.torches = [{ x: 4, y: 2 }];
  assert.throws(() => validateDungeonLevel(noFloorBelow), /sem piso aberto logo abaixo/);
  const outside = copy(valid());
  outside.torches = [{ x: 40, y: 3 }];
  assert.throws(() => validateDungeonLevel(outside), /torches\[0\] fora da grade/);
  const repeated = copy(valid());
  repeated.torches = [{ x: 4, y: 3 }, { x: 4, y: 3 }];
  assert.throws(() => validateDungeonLevel(repeated), /repetida em \(4,3\)/);
});

test('stairs are optional, but when present each one must be open floor', () => {
  const none = valid();
  delete none.stairs;
  assert.equal(validateDungeonLevel(none), none);
  const onRock = copy(valid());
  onRock.stairs = [{ x: 4, y: 2 }];
  assert.throws(() => validateDungeonLevel(onRock), /stairs\[0\] \(4,2\) precisa estar em piso aberto/);
  const notList = { ...valid(), stairs: { x: 1, y: 1 } };
  assert.throws(() => validateDungeonLevel(notList), /stairs, se existir, deve ser uma lista/);
});

test('entrance is required and must be open floor inside the grid', () => {
  const missing = valid();
  delete missing.entrance;
  assert.throws(() => validateDungeonLevel(missing), /entrance ausente ou fora da grade/);
  const onRock = { ...valid(), entrance: { x: 4, y: 2 } };
  assert.throws(() => validateDungeonLevel(onRock), /entrance \(4,2\) precisa estar em piso aberto/);
});

test('a non-object is rejected with a clear message', () => {
  assert.throws(() => validateDungeonLevel(null), /nível da masmorra inválido: esperado um objeto/);
});
