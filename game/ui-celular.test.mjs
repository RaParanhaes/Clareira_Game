import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TOUCH_INPUT_QUERY } from './input-mode.mjs';

const [html, css, main] = await Promise.all(['index.html', 'style.css', 'main.js'].map(file => readFile(new URL(`./${file}`, import.meta.url), 'utf8')));
const help = html.match(/<section class="panel-card controls-card">([\s\S]*?)<\/section>\s*<\/aside>/)?.[1] || '';

test('a Ajuda traz o essencial primeiro e deixa os custos numa seção recolhida', () => {
  assert.ok(help, 'cartão da Ajuda encontrado');
  const firstDetails = help.indexOf('<details');
  const essentials = help.slice(0, firstDetails);
  assert.match(essentials, /W A S D/);
  assert.match(essentials, />E<\/span>/);
  assert.match(essentials, /mochila/);
  assert.match(essentials, /help-next/);
  assert.doesNotMatch(essentials, /\d+ (madeira|pedras|gravetos)|golpes/, 'nenhum custo antes das seções recolhidas');
  assert.match(help, /<details class="help-more help-costs">/);
  assert.doesNotMatch(help, /<details[^>]*\bopen\b/, 'seções começam fechadas');
  const costs = help.slice(help.indexOf('help-costs'));
  for (const text of ['24 madeira bruta', '12 pedras', '25 pedras', '20 gravetos']) assert.match(costs, new RegExp(text));
});

test('a Ajuda fala em toque no celular e em teclas no teclado, pela mesma consulta do CSS', () => {
  assert.match(help, /help-touch-only"><span class="keycap">Toque/);
  assert.match(help, /help-touch-only"><span class="keycap">Usar/);
  assert.match(css, /\.help-touch-only\{display:none\}/);
  assert.match(css, /@media\(max-width:740px\),\(any-pointer:coarse\)\{\s*\.help-keys-only\{display:none\}/);
  assert.equal(TOUCH_INPUT_QUERY.replace(/\s/g, ''), '(max-width:740px),(any-pointer:coarse)');
});

test('o menu do celular mostra o rótulo dos botões e o título cabe numa linha', () => {
  assert.match(css, /\.top-actions \.icon-button span\{display:inline/);
  assert.match(css, /\.world-heading h1\{white-space:nowrap\}/);
  assert.match(css, /\.quickbar\{overflow:visible/);
  assert.match(css, /max-width:420px\) and \(min-height:600px\)\{\s*\.shell\.is-authenticated \.quickbar\{display:flex\}/);
});

test('a lição 3 destaca Jogador e Aparência, não Configurações', () => {
  assert.doesNotMatch(css, /arrival-tutorial-appearance-step[^{]*#settings-toggle/);
  assert.match(css, /arrival-tutorial-appearance-step \.player-menu\[open\] #appearance-open/);
});

test('ao deixar o Breu o cliente mostra o aviso de chegada ao bosque', () => {
  assert.match(main, /forestArrivalNoticePending=true/);
  assert.match(main, /announce\(forestArrivalNotice\(\),/);
});

test('o menu aberto no celular usa a altura útil da tela, sem esconder o Ajuda atrás de rolagem', () => {
  // 320x640: topo em 58 px; o menu mede ~410 px com as moedas em linha. O limite precisa ser >= isso.
  const rule = css.match(/\.topbar\.menu-expanded\{max-height:calc\(100dvh - max\(58px,env\(safe-area-inset-top\)\) - 12px\)\}/);
  assert.ok(rule, 'regra de altura do menu aberto');
  assert.ok(640 - 58 - 12 >= 410, 'cabe em 320x640');
  assert.match(css, /\.topbar \.coin-wallet\{display:flex;flex-direction:row/);
});

test('o aviso de chegada ao bosque é descartado ao reconectar', () => {
  assert.match(main, /if \(socket !== connection\) return;\s*forestArrivalNoticePending=false;/);
});
