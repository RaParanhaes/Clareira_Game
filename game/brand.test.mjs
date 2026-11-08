import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [css, mark] = await Promise.all([
  readFile(new URL('./style.css', import.meta.url), 'utf8'),
  readFile(new URL('./art/clareira-mark.svg', import.meta.url), 'utf8'),
]);

test('a marca da Clareira é uma trilha pixelada com folha e três brasas', () => {
  const markLayer = css.match(/\.brand-mark::before\{([^}]+)\}/)?.[1] || '';
  const inlineSvgRules = [...css.matchAll(/\.brand-mark svg\{([^}]+)\}/g)].map(match => match[1]);

  assert.match(markLayer, /clareira-mark\.svg/);
  assert.ok(inlineSvgRules.some(rule => /display:none/.test(rule)), 'o brasão antigo de fogueira não deve aparecer por cima da marca');
  assert.match(mark, /shape-rendering="crispEdges"/);
  assert.match(mark, /class="brand-trail"/);
  assert.match(mark, /class="brand-leaf"/);
  assert.equal([...mark.matchAll(/class="brand-ember"/g)].length, 3);
  for (const color of ['#111a35', '#756355', '#9fc38d', '#f2c877', '#eb9871']) {
    assert.ok(mark.includes(color), `a paleta da Clareira inclui ${color}`);
  }
  assert.doesNotMatch(mark, /flame|fire|hearth|log/i);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{[^}]*\.brand-mark::after[^}]*animation:none!important/);
});
