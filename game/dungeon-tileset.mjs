// Carrega o tileset aprovado da masmorra (game/art/dungeon/manifest.json) para um Map id -> imagem.
// No navegador usa Image e fetch; em testes, loadImage e fetchJson são injetados.
export const DUNGEON_TILESET_URL = new URL('./art/dungeon/', import.meta.url).href;

function loadBrowserImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`sprite da masmorra não carregou: ${url}`));
    img.src = url;
  });
}

async function fetchBrowserJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`manifest da masmorra não carregou (${res.status}): ${url}`);
  return res.json();
}

export async function loadDungeonTileset({
  baseUrl = DUNGEON_TILESET_URL,
  loadImage = loadBrowserImage,
  fetchJson = fetchBrowserJson,
} = {}) {
  const manifest = await fetchJson(new URL('manifest.json', baseUrl).href);
  if (!Array.isArray(manifest?.artefatos)) throw new Error('manifest da masmorra sem lista de artefatos');
  const entries = await Promise.all(manifest.artefatos.map(async a => [
    a.id,
    await loadImage(new URL(a.arquivo, baseUrl).href),
  ]));
  return new Map(entries);
}
