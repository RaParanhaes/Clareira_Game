// Lógica pura de decisão da página de manutenção.
// O trecho entre os marcadores abaixo é copiado para index.html (que não importa módulos).
// O teste infra/manutencao/decisao.test.mjs confere que as duas cópias são idênticas.

// >>> decisao
export const MIN_STAY_MS = 90000;      // tempo mínimo de permanência desde a primeira vez que a manutenção foi vista
export const WAIT_NOTICE_MS = 300000;  // depois disso, avisa que a atualização continua em andamento
export const READS_NEEDED = 2;         // leituras boas seguidas exigidas antes de recarregar

// Uma leitura é boa quando a página do jogo responde ok, sem o cabeçalho de manutenção, e o /health responde ok.
export function proximaLeitura(leiturasBoas, leituraBoa) {
  return leituraBoa ? leiturasBoas + 1 : 0;
}

export function podeVoltar({ vistoManutencao, desdeMs, agoraMs, semCabecalho, healthOk, leiturasBoas }) {
  if (!vistoManutencao) return false;
  if (!(agoraMs - desdeMs >= MIN_STAY_MS)) return false;
  if (!semCabecalho || !healthOk) return false;
  return leiturasBoas >= READS_NEEDED;
}

export function etapaDe(desdeMs, agoraMs) {
  var t = agoraMs - desdeMs;
  if (!(t >= 0)) return 0;
  if (t < 30000) return 0;
  if (t < 60000) return 1;
  if (t < MIN_STAY_MS) return 2;
  return 3;
}
// <<< decisao
