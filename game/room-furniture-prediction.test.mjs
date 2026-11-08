import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomFurniturePrediction } from './room-furniture-prediction.mjs';

test('furniture move and rotation appear immediately, then reconcile to server state', () => {
  const prediction = createRoomFurniturePrediction();
  const original = [{ id: 'chair', kind: 'chair', x: 6, y: 8, rotation: 0 }];
  const move = { name: 'moveFurniture', id: 'chair', x: 7, y: 9, requestId: 1 };
  assert.deepEqual(prediction.enqueue(original, move)[0], { ...original[0], x: 7, y: 9 });
  assert.equal(prediction.pending.requestId, 1);
  assert.deepEqual(prediction.snapshot(original)[0], { ...original[0], x: 7, y: 9 });
  prediction.acknowledge(1, true);
  assert.deepEqual(prediction.snapshot([{ ...original[0], x: 7, y: 9 }]), [{ ...original[0], x: 7, y: 9 }]);
  assert.equal(prediction.pending, null);
});

test('rejected furniture prediction rolls back and stacked objects stay server-authoritative', () => {
  const prediction = createRoomFurniturePrediction();
  const furniture = [{ id: 'table', kind: 'table', x: 6, y: 8, rotation: 0 },
    { id: 'plant', kind: 'plant', x: 6, y: 8, supportId: 'table' }];
  assert.equal(prediction.enqueue(furniture, { name: 'rotateFurniture', id: 'table', requestId: 2 }), null);
  assert.equal(prediction.enqueue(furniture, { name: 'moveFurniture', id: 'plant', x: 7, y: 8, requestId: 3 }), null);
  assert.equal(prediction.pending, null);
  assert.equal(prediction.pending, null);
});

test('lamp and placement predictions resolve by authoritative snapshots', () => {
  const prediction = createRoomFurniturePrediction();
  const lamp = [{ id: 'lamp', kind: 'lamp', x: 4, y: 5, enabled: true }];
  assert.equal(prediction.enqueue(lamp, { name: 'useFurniture', id: 'lamp', requestId: 4 })[0].enabled, false);
  assert.deepEqual(prediction.snapshot([{ ...lamp[0], enabled: false }]), [{ ...lamp[0], enabled: false }]);
  const place = { name: 'placeFurniture', kind: 'stool', x: 8, y: 9, requestId: 5 };
  assert.equal(prediction.enqueue(lamp, place).at(-1).id, 'pending-5');
  assert.equal(prediction.snapshot([...lamp, { id: 'real', kind: 'stool', x: 8, y: 9 }]).at(-1).id, 'real');
});
