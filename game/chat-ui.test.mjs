import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('conversa oferece teclado, toque, limite claro e retorno acessível', async () => {
  const [html, css, main] = await Promise.all([
    readFile(new URL('./index.html', import.meta.url), 'utf8'),
    readFile(new URL('./style.css', import.meta.url), 'utf8'),
    readFile(new URL('./main.js', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /<form id="chat-form" class="chat-form"/);
  assert.match(html, /for="chat-text">Mensagem para quem está por perto/);
  assert.match(html, /id="chat-text"[^>]*enterkeyhint="send"[^>]*maxlength="4096"/);
  assert.match(main, /ui\.chatText\.addEventListener\('input'/);
  assert.match(main, /limitChatInput\(previous\)/);
  assert.match(html, /id="chat-status"[^>]*role="status" aria-live="polite"/);
  assert.match(css, /\.chat-mark[^}]*var\(--clareira-ember(?:,[^)]*)?\)[^}]*var\(--clareira-leaf(?:,[^)]*)?\)/);
  assert.match(css, /@media\(max-width:720px\)\{\.chat-form\{/);
  assert.match(css, /\.chat-form input,\.chat-form button\{min-height:40px\}/);
  assert.match(css, /\.chat-form input:focus-visible/);
});

test('entrar na sala entrega o foco ao mundo para abrir a conversa com Enter', async () => {
  const main = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  const enterGame = main.match(/function enterGame\(profile\) \{([\s\S]*?)\n\}\n\nasync function sendAuthForm/u)?.[1];
  const revealWorld = main.match(/function revealLoadedScene\(\) \{([\s\S]*?)\n\}/u)?.[1];
  assert.ok(enterGame && revealWorld, 'a entrada aguarda uma cena pronta');
  assert.match(revealWorld, /snapshotReady.*assetsReady.*predictionReady/);
  assert.match(revealWorld, /hideSceneLoading\(\);[\s\S]*?const transitId=teleportEffects\.finishLocalScene\(worldDimensionId\);/u);
  assert.match(revealWorld, /dimensionTransitReady/);
  assert.match(revealWorld, /canvas\.focus\(\{\s*preventScroll:\s*true\s*\}\)/u);
});

test('enviar uma fala com Enter devolve o foco ao mundo para continuar andando', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('./index.html', import.meta.url), 'utf8'),
    readFile(new URL('./main.js', import.meta.url), 'utf8'),
  ]);

  const submit = main.match(/ui\.chatForm\.addEventListener\('submit', event => \{([\s\S]*?)\n\}\);/u)?.[1];
  assert.ok(submit, 'o envio da conversa precisa estar ligado ao formulário');
  assert.match(html, /<canvas id="world"[^>]*tabindex="0"/);
  assert.match(submit, /if \(!sendPlayerCommand\(\{ type: 'chat', text \}\)\) return;/);
  const clearIndex = submit.indexOf("ui.chatText.value = '';");
  const focusIndex = submit.indexOf('canvas.focus(');
  assert.ok(clearIndex >= 0, 'a mensagem enviada precisa limpar o campo');
  assert.ok(focusIndex > clearIndex, 'o canvas só deve recuperar o foco depois do envio aceito');
});

test('Escape sai do rascunho sem apagar a fala e devolve o foco ao mundo', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('./index.html', import.meta.url), 'utf8'),
    readFile(new URL('./main.js', import.meta.url), 'utf8'),
  ]);

  const cancel = main.match(/ui\.chatText\.addEventListener\('keydown', event => \{([\s\S]*?)\n\}\);/u)?.[1];
  assert.ok(cancel, 'o campo precisa oferecer uma saída de teclado');
  assert.match(cancel, /event\.key !== 'Escape'/);
  assert.match(cancel, /canvas\.focus\(/);
  assert.doesNotMatch(cancel, /ui\.chatText\.value\s*=/, 'sair não deve apagar o rascunho');
  assert.match(html, /<canvas id="world"[^>]*tabindex="0"/);
});

test('falha ao preparar uma cena encerra o overlay de teleporte e libera a tela de recuperação', async () => {
  const main = await readFile(new URL('./main.js', import.meta.url), 'utf8');
  const failure = main.match(/function showLoadingFailure\(message\) \{([\s\S]*?)\n\}/u)?.[1];
  assert.ok(failure, 'a preparação do destino precisa oferecer recuperação');
  assert.match(failure, /teleportEffects\.cancelLocal\(\)/);
  assert.match(failure, /dimensionTravelStarting=false/);
  assert.match(failure, /dimensionTravelRequestPending=false/);
  assert.match(failure, /ui\.shell\.inert=true/);
  assert.match(failure, /ui\.shell\.setAttribute\('aria-busy','true'\)/);
});
