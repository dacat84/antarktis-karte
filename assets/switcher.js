// Design-Umschalter: Reportage (Standard) · Logbuch · Instrumente (Taste D blättert, Zeitpunkt bleibt erhalten)
(function () {
  const dirs = ['', 'logbuch/', 'instrumente/'];
  const names = ['Reportage', 'Logbuch', 'Instrumente'];
  const path = location.pathname.replace(/index\.html$/, '');
  const m = path.match(/^(.*\/)(logbuch|instrumente)\/$/);
  const base = m ? m[1] : path;
  const i = m ? dirs.indexOf(m[2] + '/') : 0;
  const go = (k) => { location.href = base + dirs[(k + 3) % 3] + location.hash; };
  const css = document.createElement('style');
  css.textContent = '.dsw{position:fixed;left:50%;transform:translateX(-50%);top:12px;z-index:9000;display:flex;align-items:center;gap:2px;background:rgba(14,18,22,.86);color:#fff;border-radius:22px;padding:4px;font:500 13px/1 system-ui,-apple-system,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25);backdrop-filter:blur(6px)}' +
    '.dsw button{all:unset;cursor:pointer;padding:7px 13px;border-radius:16px;white-space:nowrap}.dsw button:hover{background:rgba(255,255,255,.12)}' +
    '.dsw button.on{background:#e0452f}.dsw .ar{padding:7px 9px;opacity:.75}' +
    '@media(max-width:700px){.dsw{top:auto;bottom:10px}.dsw button:not(.on):not(.ar){display:none}}';
  document.head.appendChild(css);
  const el = document.createElement('div'); el.className = 'dsw'; el.title = 'Design wechseln (Taste D)';
  el.innerHTML = '<button class="ar" data-d="-1">‹</button>' + names.map((n, k) => '<button data-k="' + k + '" class="' + (k === i ? 'on' : '') + '">' + n + '</button>').join('') + '<button class="ar" data-d="1">›</button>';
  el.querySelectorAll('button').forEach((b) => { b.onclick = () => (b.dataset.k != null ? go(+b.dataset.k) : go(i + +b.dataset.d)); });
  document.body.appendChild(el);
  document.addEventListener('keydown', (e) => { if ((e.key === 'd' || e.key === 'D') && !(e.target.closest && e.target.closest('input,textarea'))) go(i + (e.shiftKey ? -1 : 1)); });
})();
