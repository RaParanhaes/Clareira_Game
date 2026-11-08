export const ENTRY_COPY_VARIANTS = Object.freeze([
  Object.freeze({
    eyebrow: 'VOCÊ CHEGOU A OUTRO MUNDO',
    title: 'Chegue perto. O bosque acorda.',
    lede: 'Dê uma volta pelo bosque e conheça quem já chegou.',
    caption: 'OUTRO MUNDO · SUA HISTÓRIA COMEÇA AQUI',
  }),
  Object.freeze({
    eyebrow: 'A TRILHA NÃO TERMINA AQUI',
    title: 'Alguém acendeu a fogueira.',
    lede: 'Siga a trilha e encontre companhia pelo caminho.',
    caption: 'DO OUTRO LADO DA TRILHA · CLAREIRA',
  }),
  Object.freeze({
    eyebrow: 'GENTE NOVA, CAMINHO NOVO',
    title: 'O caminho começa aqui.',
    lede: 'Explore a mata e encontre companhia.',
    caption: 'TRILHAS ABERTAS · GENTE POR CONHECER',
  }),
  Object.freeze({
    eyebrow: 'CLAREIRA · LUGAR PARA MAIS UM',
    title: 'A fogueira tá acesa. Chega mais.',
    lede: 'Dê uma volta pelo bosque. Vai que a próxima aventura começa numa conversa.',
    caption: 'SEMPRE HÁ LUGAR PERTO DO FOGO',
  }),
]);

const STORAGE_KEY = 'clareira.entry-copy.v1';

function localDay(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function randomIndex(random, length) {
  const value = Number(random());
  return Math.max(0, Math.min(length - 1, Math.floor((Number.isFinite(value) ? value : 0) * length)));
}

export function getDailyEntryCopy(storage, date = new Date(), random = Math.random) {
  const today = localDay(date);
  let saved = null;
  try { saved = JSON.parse(storage?.getItem?.(STORAGE_KEY) || 'null'); } catch {}

  const count = ENTRY_COPY_VARIANTS.length;
  if (saved?.day === today && Number.isInteger(saved.index) && saved.index >= 0 && saved.index < count) {
    return ENTRY_COPY_VARIANTS[saved.index];
  }

  const previous = Number.isInteger(saved?.index) && saved.index >= 0 && saved.index < count ? saved.index : null;
  let index = randomIndex(random, count);
  if (previous !== null && count > 1) {
    const next = randomIndex(random, count - 1);
    index = next >= previous ? next + 1 : next;
  }

  try { storage?.setItem?.(STORAGE_KEY, JSON.stringify({ day: today, index })); } catch {}
  return ENTRY_COPY_VARIANTS[index];
}
