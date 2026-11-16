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

test('a vida e o "Próximo passo" dividem uma pilha no celular, em vez de duas posições fixas no mesmo ponto', () => {
  const stack = html.match(/<div class="hud-stack">([\s\S]*?)<\/div>\s*<div id="room-build-tools"/)?.[1] || '';
  assert.match(stack, /id="vitals-hud"/, 'a barra de vida mora dentro da pilha');
  assert.match(stack, /id="craft-hint"/, 'o aviso do guia mora dentro da pilha');
  assert.ok(stack.indexOf('id="vitals-hud"') < stack.indexOf('id="craft-hint"'), 'vida em cima, guia embaixo');
  const mobile = css.match(/\.hud-stack\{display:contents\}\s*@media\(max-width:720px\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(mobile, 'regra da pilha no celular encontrada');
  assert.match(mobile, /\.hud-stack\{position:absolute;[^}]*top:var\(--clareira-hud-stack-top\)[^}]*flex-direction:column[^}]*gap:var\(--clareira-hud-stack-gap\)/);
  assert.match(mobile, /\.hud-stack>\.vitals-hud,\.hud-stack>\.craft-hint\{position:static;/);
  // Nenhum dos dois filhos tem posição vertical própria no celular: quem manda é a pilha.
  assert.doesNotMatch(css, /@media\(max-width:720px\)\{[^}]*\.vitals-hud\{[^}]*top:\s*\d+px/);
  assert.doesNotMatch(css, /@media\(max-width:720px\)\{[^}]*\.craft-hint\{[^}]*top:\s*\d+px/);
  assert.match(css, /--clareira-hud-stack-top:112px/);
});

test('a pilha do HUD fica abaixo do Menu e à esquerda do minimapa nas telas de 320 e 390 px', () => {
  // Menu: topo 59 + altura 44 = 103 px; a pilha começa em 112 px.
  assert.ok(112 >= 59 + 44, 'a pilha começa abaixo do botão Menu');
  // Minimapa: largura clamp(116px,35vw,142px), colado à direita com 9 px de margem.
  for (const width of [320, 390]) {
    const miniLeft = width - 9 - Math.min(142, Math.max(116, width * 0.35));
    const stackRight = 8 + Math.min(214, width - 190);
    assert.ok(stackRight <= miniLeft, `${width}px: a pilha (até ${stackRight}) não encosta no minimapa (desde ${miniLeft})`);
  }
  // O texto do guia é limitado a 3 linhas no celular, para não cobrir o personagem nem bloquear toques no mundo.
  assert.match(css, /\.craft-hint-text\{display:-webkit-box;[^}]*-webkit-line-clamp:3/);
});
