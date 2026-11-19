import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MIN_STAY_MS, podeVoltar, proximaLeitura, etapaDe } from './decisao.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));

const base = { vistoManutencao: true, desdeMs: 1000, agoraMs: 1000 + MIN_STAY_MS, semCabecalho: true, healthOk: true, leiturasBoas: 2 };

test('MIN_STAY_MS vale 90 segundos', () => {
  assert.equal(MIN_STAY_MS, 90000);
});

test('antes de 90 s não volta, mesmo com tudo o mais pronto', () => {
  assert.equal(podeVoltar({ ...base, agoraMs: 1000 + MIN_STAY_MS - 1 }), false);
  assert.equal(podeVoltar({ ...base, agoraMs: 1000 }), false);
});

test('depois de 90 s com só 1 leitura boa não volta', () => {
  assert.equal(podeVoltar({ ...base, leiturasBoas: 1 }), false);
  assert.equal(podeVoltar({ ...base, leiturasBoas: 0 }), false);
});

test('depois de 90 s com 2 leituras boas e health ok volta', () => {
  assert.equal(podeVoltar(base), true);
  assert.equal(podeVoltar({ ...base, leiturasBoas: 3 }), true);
});

test('health falhando ou cabeçalho presente impedem a volta', () => {
  assert.equal(podeVoltar({ ...base, healthOk: false }), false);
  assert.equal(podeVoltar({ ...base, semCabecalho: false }), false);
});

test('cabeçalho reaparece e zera a contagem de leituras boas', () => {
  let n = 0;
  n = proximaLeitura(n, true);
  n = proximaLeitura(n, true);
  assert.equal(n, 2);
  n = proximaLeitura(n, false); // manutenção voltou a aparecer
  assert.equal(n, 0);
  assert.equal(podeVoltar({ ...base, leiturasBoas: n }), false);
  n = proximaLeitura(n, true);
  assert.equal(podeVoltar({ ...base, leiturasBoas: n }), false, 'uma leitura após zerar não basta');
  n = proximaLeitura(n, true);
  assert.equal(podeVoltar({ ...base, leiturasBoas: n }), true);
});

test('nunca visto a manutenção não volta, mesmo com tempo e leituras', () => {
  assert.equal(podeVoltar({ ...base, vistoManutencao: false, leiturasBoas: 10, agoraMs: 1000 + 10 * MIN_STAY_MS }), false);
});

test('etapas mudam pelo tempo e a última fica em "Quase pronto"', () => {
  assert.equal(etapaDe(0, 0), 0);
  assert.equal(etapaDe(0, 29999), 0);
  assert.equal(etapaDe(0, 30000), 1);
  assert.equal(etapaDe(0, 60000), 2);
  assert.equal(etapaDe(0, MIN_STAY_MS), 3);
  assert.equal(etapaDe(0, 10 * MIN_STAY_MS), 3);
  assert.equal(etapaDe(5000, 1000), 0, 'relógio atrasado não quebra a etapa');
});

test('a cópia da lógica dentro de index.html é idêntica a decisao.mjs', () => {
  const normaliza = (texto) => texto
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').replace(/^\s*export /, '').trim())
    .filter((l) => l.length > 0);
  const extrai = (texto, marca) => {
    const ini = texto.indexOf('// >>> decisao');
    const fim = texto.indexOf('// <<< decisao');
    assert.ok(ini >= 0 && fim > ini, `marcadores ausentes em ${marca}`);
    return normaliza(texto.slice(texto.indexOf('\n', ini) + 1, fim));
  };
  const modulo = readFileSync(join(aqui, 'decisao.mjs'), 'utf8');
  const html = readFileSync(join(aqui, 'index.html'), 'utf8');
  assert.deepEqual(extrai(html, 'index.html'), extrai(modulo, 'decisao.mjs'));
});
