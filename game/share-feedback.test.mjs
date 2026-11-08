import test from 'node:test';
import assert from 'node:assert/strict';
import { beginBerryOfferFeedback, BERRY_OFFER_DURATION_MS, getBerryOfferFrame } from './share-feedback.mjs';

test('a frutinha percorre o caminho entre as duas pessoas durante a oferta', () => {
  const feedback = beginBerryOfferFeedback({ from: { x: 2, y: 4 }, to: { x: 5, y: 7 } }, 100);

  assert.deepEqual(getBerryOfferFrame(feedback, 100)?.from, { x: 2, y: 4 });
  assert.equal(getBerryOfferFrame(feedback, 100 + BERRY_OFFER_DURATION_MS / 2)?.progress, 0.5);
  assert.deepEqual(getBerryOfferFrame(feedback, 100 + BERRY_OFFER_DURATION_MS - 1)?.to, { x: 5, y: 7 });
  assert.equal(getBerryOfferFrame(feedback, 100 + BERRY_OFFER_DURATION_MS), null);
});

test('movimento reduzido mostra a frutinha parada no meio do trajeto', () => {
  const feedback = beginBerryOfferFeedback({ from: { x: 2, y: 4 }, to: { x: 5, y: 7 } }, 100);
  const frame = getBerryOfferFrame(feedback, 250, true);

  assert.equal(frame.progress, 0.5);
  assert.equal(frame.opacity, 1);
});

test('ofertas sem posições válidas não geram efeito', () => {
  assert.equal(beginBerryOfferFeedback({ from: { x: 1, y: 2 }, to: { x: NaN, y: 3 } }, 100), null);
  assert.equal(beginBerryOfferFeedback({ from: { x: 1, y: 2 }, to: { x: 3, y: 4 } }, NaN), null);
  assert.equal(getBerryOfferFrame(null, 100), null);
});
