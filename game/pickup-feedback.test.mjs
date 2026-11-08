import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  beginPickupFeedback, getPickupFeedbackFrame, isPickupRequestPending, PICKUP_REACH_MS,
  PICKUP_RESPONSE_MS, resolvePickupFeedback,
} from './pickup-feedback.mjs';

const branch = { id: 'branch-east', kind: 'wood', x: 11.4, y: 7.3 };

test('coleta antecipa o alcance e só mostra a resposta depois da confirmação', () => {
  const pending = beginPickupFeedback(branch, 1000);
  assert.deepEqual(getPickupFeedbackFrame(pending, 1000), {
    x: 11.4, y: 7.3, kind: 'wood', reaching: true, reachProgress: 0, showBurst: false, burstProgress: 0,
  });
  assert.equal(getPickupFeedbackFrame(pending, 1130).reachProgress, .5);

  const collected = resolvePickupFeedback(pending, true, 1100);
  const contact = getPickupFeedbackFrame(collected, 1000 + PICKUP_REACH_MS);
  assert.equal(contact.reaching, false);
  assert.equal(contact.showBurst, true);
  assert.equal(contact.burstProgress, 0);
  assert.equal(getPickupFeedbackFrame(collected, 1000 + PICKUP_REACH_MS + PICKUP_RESPONSE_MS), null);
});

test('coleta recusada e confirmação atrasada encerram o gesto sem falso brilho', () => {
  const pending = beginPickupFeedback(branch, 0);
  assert.equal(resolvePickupFeedback(pending, false, 30), null);
  assert.equal(getPickupFeedbackFrame(pending, 1601), null);
  assert.equal(resolvePickupFeedback(null, true, 20), null);
});

test('um novo toque não substitui a coleta que ainda espera resposta', () => {
  const pending = beginPickupFeedback(branch, 1000);
  const collected = resolvePickupFeedback(pending, true, 1100);

  assert.equal(isPickupRequestPending(pending, 1250), true);
  assert.equal(isPickupRequestPending(pending, 2601), false);
  assert.equal(isPickupRequestPending(collected, 1250), false);
  assert.equal(isPickupRequestPending(null, 1250), false);
});

test('movimento reduzido mantém contato e assinatura sem deslocar os pixels', () => {
  const pending = beginPickupFeedback(branch, 0);
  const collected = resolvePickupFeedback(pending, true, 40);
  const frame = getPickupFeedbackFrame(collected, PICKUP_REACH_MS, true);
  assert.equal(frame.reachProgress, 0);
  assert.equal(frame.showBurst, true);
  assert.equal(frame.burstProgress, 0);
});

test('o cliente liga o alcance ao avatar e a assinatura ao recurso confirmado', async () => {
  const main = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  assert.match(main, /message\.action === 'collect'/);
  assert.match(main, /pickupFeedback\?\.requestId === message\.requestId/);
  assert.match(main, /message\.result === 'collected'[\s\S]*?else if \(message\.result !== 'cooldown'\) pickupFeedback = null/);
  assert.match(main, /getPickupFeedbackFrame\(/);
  assert.match(main, /drawPickupResponse\(/);
  assert.match(main, /beginPickupFeedback\(/);
  assert.match(main, /isPickupRequestPending\(pickupFeedback, performance\.now\(\)\)/);
});
