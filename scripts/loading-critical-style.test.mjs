import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('loading fallback stays synchronized with its stylesheet and CSP', async () => {
  const [html, css, server] = await Promise.all([
    readFile(new URL('../game/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../game/style.css', import.meta.url), 'utf8'),
    readFile(new URL('./dev-preview-page.mjs', import.meta.url), 'utf8'),
  ]);
  const inline = html.match(/<style id="loading-critical-css">([\s\S]*?)<\/style>/)?.[1];
  assert.ok(inline, 'the loading screen has critical styles in the document');
  const start = css.indexOf('/* Tela de entrada enxuta:');
  const end = css.indexOf('\n.timber-icon:before', start);
  assert.ok(start >= 0 && end > start, 'the loading stylesheet section exists');
  assert.equal(inline, css.slice(start, end) + '\nhtml:not(.clareira-styles-ready) .shell{visibility:hidden}\n');
  const hash = createHash('sha256').update(inline).digest('base64');
  assert.ok(server.includes(`'sha256-${hash}'`), 'CSP permits exactly the current inline styles');
});
