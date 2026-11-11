// Aviso no estilo do jogo: moldura de madeira e papiro sobre a tela, com X e botão para fechar.
// Usado para avisos do servidor (manutenção, atualização, presente, denúncia). O conteúdo vem
// do servidor; este módulo só monta e fecha o aviso.
const ASSET = 'art/aviso/';
const TYPES = { presente: '#b8862a', aviso: '#2f5f8a', denuncia: '#8a2e2e' };

function esc(text) {
  return String(text ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// Mostra um aviso. notice: { tipo, faixa, titulo, texto, de, botao }. Devolve a função para fechar.
export function showFramedNotice(notice = {}, doc = globalThis.document) {
  const tipo = TYPES[notice.tipo] ? notice.tipo : 'aviso';
  const overlay = doc.createElement('div');
  overlay.className = 'framed-notice';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <style>
      .framed-notice{position:fixed;inset:0;z-index:9000;display:grid;place-items:center;background:rgba(4,8,14,.18);transition:opacity .45s ease}
      .framed-notice.hide{opacity:0;pointer-events:none}
      .framed-notice .fn-box{position:relative;width:min(88vw,130vh);aspect-ratio:3/2;color:#f3e7cf;font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif}
      .framed-notice img{position:absolute;display:block;pointer-events:none;user-select:none}
      .framed-notice .fn-paper{left:29.14%;top:31.3%;width:41.65%;height:44.38%;object-fit:fill;z-index:1}
      .framed-notice .fn-frame{left:15%;top:16.4%;width:70%;height:70%;z-index:2}
      .framed-notice .fn-text{position:absolute;left:34%;top:38%;width:32%;height:30%;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
      .framed-notice .fn-tag{margin:0;padding:3px 12px;border-radius:999px;font-size:clamp(9px,.9vw,12px);letter-spacing:.18em;text-transform:uppercase;font-weight:800;color:#fff;text-shadow:0 1px 1px #0008;background:${TYPES[tipo]}}
      .framed-notice h2{margin:8px 0 0;font-family:Georgia,'Palatino Linotype',serif;font-size:clamp(16px,2.1vw,28px);line-height:1.1;color:#4a2a10;text-shadow:0 1px 0 #f5e2b0}
      .framed-notice p{margin:6px 0 0;max-width:34ch;font-size:clamp(11px,1.05vw,15px);line-height:1.5;color:#3f2c17;text-wrap:balance}
      .framed-notice .fn-by{margin:6px 0 0;font-size:clamp(10px,.9vw,12px);color:#6f5530;font-style:italic}
      .framed-notice .fn-ok{margin-top:12px;padding:7px 18px;border-radius:6px;border:2px solid #8a5a2a;background:#f3e1b6;color:#4a2a10;font-weight:700;font-size:clamp(11px,1vw,13px);cursor:pointer}
      .framed-notice .fn-ok:hover{background:#fbeccb}
      .framed-notice .fn-x{position:absolute;left:66.6%;top:31.8%;width:clamp(24px,2.6vw,34px);height:clamp(24px,2.6vw,34px);border-radius:50%;border:2px solid #8a5a2a;background:#f3e1b6;color:#4a2a10;font-size:clamp(14px,1.4vw,18px);line-height:1;font-weight:800;cursor:pointer;display:grid;place-items:center;z-index:4;box-shadow:0 2px 6px #0006}
      .framed-notice .fn-x:hover{background:#fbeccb}
      @media (orientation:portrait){
        .framed-notice .fn-box{width:min(94vw,440px);aspect-ratio:1348/946}
        .framed-notice .fn-frame{display:none}
        .framed-notice .fn-paper{left:0;top:0;width:100%;height:100%}
        .framed-notice .fn-text{left:12%;top:18%;width:76%;height:64%}
        .framed-notice .fn-x{left:86%;top:8%}
        .framed-notice h2{font-size:clamp(15px,4.6vw,19px)}
        .framed-notice p{font-size:clamp(10.5px,3vw,12px)}
      }
    </style>
    <div class="fn-box">
      <img class="fn-paper" src="${ASSET}paper.png" alt="">
      <img class="fn-frame" src="${ASSET}frame.png" alt="">
      <div class="fn-text">
        ${notice.faixa ? `<p class="fn-tag">${esc(notice.faixa)}</p>` : ''}
        <h2>${esc(notice.titulo || 'Aviso')}</h2>
        <p>${esc(notice.texto || '')}</p>
        ${notice.de ? `<p class="fn-by">${esc(notice.de)}</p>` : ''}
        <button class="fn-ok" type="button">${esc(notice.botao || 'Entendi')}</button>
      </div>
      <button class="fn-x" type="button" aria-label="Fechar aviso">×</button>
    </div>`;
  const close = () => {
    overlay.classList.add('hide');
    setTimeout(() => overlay.remove(), 500);
    doc.removeEventListener('keydown', onKey);
  };
  const onKey = event => { if (event.key === 'Escape') close(); };
  overlay.querySelector('.fn-x').addEventListener('click', close);
  overlay.querySelector('.fn-ok').addEventListener('click', close);
  doc.addEventListener('keydown', onKey);
  doc.body.appendChild(overlay);
  return close;
}
