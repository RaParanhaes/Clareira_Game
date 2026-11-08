import {stat,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,relative,sep} from 'node:path';
import {CONTENT,validateContent} from '../game/content-catalog.mjs';
import {ASSETS} from '../game/content-assets.mjs';
const root=fileURLToPath(new URL('../game/',import.meta.url));
const errors=validateContent(CONTENT),ids=new Set();
const validAssetScenes=new Set(['login','teleport','arrival',...CONTENT.filter(c=>c.category==='place').map(c=>c.scene)]);
for(const asset of ASSETS){
  if(ids.has(asset.id))errors.push(`Asset duplicado: ${asset.id}`);ids.add(asset.id);
  if(!validAssetScenes.has(asset.scene))errors.push(`Cena desconhecida: ${asset.id}`);
  const path=resolve(root,asset.url||'');
  if(relative(root,path).startsWith(`..${sep}`) || path===root || /[?#]/.test(asset.url||'') || !/\.(webp|png|svg|ogg|mp3)$/.test(asset.url||'')){errors.push(`Caminho inválido: ${asset.id}`);continue;}
  if(!Number.isInteger(asset.version)||asset.version<1||typeof asset.critical!=='boolean'||!Number.isInteger(asset.maxBytes)||asset.maxBytes<1)errors.push(`Contrato inválido: ${asset.id}`);
  try{const info=await stat(path);if(!info.isFile() || info.size>asset.maxBytes)errors.push(`Arquivo acima do orçamento: ${asset.id} (${info.size})`);}
  catch{errors.push(`Arquivo ausente: ${asset.id}`);}
}
const html=await readFile(resolve(root,'index.html'),'utf8');
const main=await readFile(resolve(root,'main.js'),'utf8');
if(ASSETS.some(a=>a.id==='image.login'))errors.push('A arte decorativa do login deve permanecer fora do carregamento verificado que libera o formulário');
if(!html.includes('<img class="auth-illustration-image" src="/dev/art/clareira-login-poster-v5.webp"'))errors.push('A arte de fundo do login deve permanecer no HTML');
try {
  // 30s at 60fps with generated wildlife; the film remains lazy and outside
  // verified startup downloads. The measured authoring budget is documented.
  const video = await stat(resolve(root, 'art/clareira-login-loop-v5.mp4'));
  if (!video.isFile() || video.size > 12 * 1024 * 1024) errors.push('A animação decorativa do login deve ficar abaixo de 12 MiB');
  const poster = await stat(resolve(root, 'art/clareira-login-poster-v5.webp'));
  if (!poster.isFile() || poster.size > 600_000) errors.push('O poster do login deve ficar abaixo de 600 KB');
} catch { errors.push('Animação decorativa do login ausente'); }
const revealLogin=main.slice(main.indexOf('function revealLoginScreen()'),main.indexOf('function markInitialLoadingComplete()'));
if(!revealLogin||/setTimeout\s*\(/.test(revealLogin))errors.push('A liberação do login não pode ter espera artificial');
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log(`Catálogo válido: ${CONTENT.length} definições, ${ASSETS.length} arquivo externo. Física compartilhada; assets locais dentro do orçamento.`);
