import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CHAT_CHARS, limitChatInput, normalizeChatMessage, wrapChatMessage } from './chat.mjs';

test('conversa remove controles invisíveis, junta linhas e preserva emoji', () => {
  assert.equal(normalizeChatMessage('  Oi,\n  bosque! 👋\u202e '), 'Oi, bosque! 👋');
  assert.equal(normalizeChatMessage(' \t\n '), '');
  assert.equal(normalizeChatMessage(null), '');
});

test('conversa limita por símbolos visíveis e preserva famílias de emoji', () => {
  const long = '🌿'.repeat(MAX_CHAT_CHARS + 9);
  assert.equal(normalizeChatMessage(long), '🌿'.repeat(MAX_CHAT_CHARS));
  const family = '👨‍👩‍👧‍👦';
  assert.equal(normalizeChatMessage(family.repeat(20)), family.repeat(20));
});

test('campo aceita 72 símbolos compostos sem cortar o último', () => {
  const message = '🌿'.repeat(MAX_CHAT_CHARS + 1);
  const limited = limitChatInput(message);
  assert.equal(limited, '🌿'.repeat(MAX_CHAT_CHARS));
  assert.equal(limited.length, MAX_CHAT_CHARS * 2);
  const family = '👨‍👩‍👧‍👦';
  assert.equal(limitChatInput(family.repeat(MAX_CHAT_CHARS + 1)), family.repeat(MAX_CHAT_CHARS));
  assert.equal(limitChatInput('a\u0303'.repeat(MAX_CHAT_CHARS + 1)), 'a\u0303'.repeat(MAX_CHAT_CHARS));
});

test('balão quebra palavras por largura e também acomoda uma palavra longa', () => {
  const lines = wrapChatMessage('Oi bosque acolhedor', text => Array.from(text).length, 8);
  assert.deepEqual(lines, ['Oi', 'bosque', 'acolhedo', 'r']);
  const family = '👨‍👩‍👧‍👦';
  assert.deepEqual(wrapChatMessage(family.repeat(2), text => Array.from(text).length, 8), [family, family]);
  assert.deepEqual(wrapChatMessage('Clareira', text => Array.from(text).length, 0), []);
});
