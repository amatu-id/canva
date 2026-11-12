// Trace Otomatis: photo / sketch / clipart → smooth vector lines (optional colour fills), inserted as an SVG
// element whose line and fill colours stay editable from the toolbar. Engine + panel: js/trace/.
import { E } from '../editor/state.js';
import { h, toast, dialog, pickFiles, download } from '../util.js';
import { svgEl, rotPt, newDesign } from '../model.js';
import { assetBlob } from '../assets.js';
import { Store } from '../store.js';
import { tracePanel } from '../trace/trace-ui.js';

// el: image element on the canvas to trace (optional) · file: image chosen by the user (optional)
// standalone: opened from the home screen (no design open) → download or start a new design.
export async function openTrace({ el = null, file = null, standalone = false } = {}) {
  let source = file, name = file?.name || '';
  if (!source && el?.src) {
    try { source = await assetBlob(el.src); name = el.name || 'gambar'; }
    catch { toast('Gambar ini tidak dapat dibaca untuk di-trace. Unggah ulang gambarnya.', { icon: 'error' }); return; }
  }
  const panel = tracePanel({ source, name });
  let keep = false;
  const extra = el ? h('label.atr-chk', { style: { marginTop: '-2px' } }, h('input', { type: 'checkbox', onchange: (e) => (keep = e.target.checked) }), h('span', 'Pertahankan foto asli di bawah hasil trace')) : null;
  const ready = () => { if (panel.result) return true; toast(panel.busy ? 'Tunggu sebentar, trace masih diproses…' : 'Unggah gambar terlebih dahulu', { icon: 'hourglass_top' }); return false; };
  const actions = standalone
    ? [{ label: 'Tutup', value: null },
      { label: 'Unduh SVG', icon: 'download', run: () => { if (!ready()) return false; download(new Blob([panel.svg()], { type: 'image/svg+xml' }), (name || 'trace').replace(/\.\w+$/, '') + '-trace.svg'); return false; } },
      { label: 'Buka sebagai desain', kind: 'btn-primary', icon: 'edit', run: async () => { if (!ready()) return false; await newDesignFrom(panel); } }]
    : [{ label: 'Batal', value: null }, { label: 'Tambahkan ke desain', kind: 'btn-primary', icon: 'gesture', run: () => (ready() ? insert(panel, el, keep) : false) }];
  dialog({ title: 'Trace Otomatis — gambar jadi garis vektor', body: h('div', { style: { display: 'grid', gap: '10px' } }, panel.el, extra), width: 'min(1160px, 96vw)', cls: 'dlg-trace', onclose: () => panel.destroy(), actions });
}

// Pick a file first (upload flow), then open the dialog.
export async function uploadAndTrace(opts = {}) {
  const [f] = await pickFiles('image/*', false);
  if (f) openTrace({ ...opts, file: f });
}

function traceEl(panel, box) {
  const r = panel.result;
  return svgEl(panel.svg({ fit: true }), { ...box, name: 'Trace ' + (r.mode === 'lineart' ? 'sketsa' : 'objek') });
}

function insert(panel, el, keep) {
  const r = panel.result, [cx, cy, cw, ch] = r.crop;
  if (!r.lines.length && !(r.fills.length && panel.style().fill !== 'none')) { toast('Tidak ada garis yang terdeteksi — naikkan Detail garis', { icon: 'info' }); return false; }
  if (el) {
    // place exactly over the traced part of the image (frame crop, flip and rotation included)
    const ix = el.ix ?? 0, iy = el.iy ?? 0, iw = el.iw ?? 1, ih = el.ih ?? 1;
    let lx = (ix + cx * iw) * el.w, ly = (iy + cy * ih) * el.h;
    const lw = cw * iw * el.w, lh = ch * ih * el.h;
    if (el.flipX) lx = el.w - lx - lw;
    if (el.flipY) ly = el.h - ly - lh;
    const [px, py] = rotPt(el.x + lx + lw / 2, el.y + ly + lh / 2, el.x + el.w / 2, el.y + el.h / 2, el.rot || 0);
    const node = traceEl(panel, { x: px - lw / 2, y: py - lh / 2, w: lw, h: lh, rot: el.rot || 0, flipX: !!el.flipX, flipY: !!el.flipY });
    const arr = E.page().els, at = arr.indexOf(el);
    if (!keep && at >= 0 && !el.lock) arr.splice(at, 1, node); else if (at >= 0) arr.splice(at + 1, 0, node); else arr.push(node);
    E.emit('full'); E.select([node.id], { raw: true }); E.commit('trace');
  } else {
    const ar = r.w / r.h, W = E.d.w, H = E.d.h, w = Math.min(W * 0.72, H * 0.78 * ar);
    E.add(traceEl(panel, { w, h: w / ar }));
  }
  toast(`Trace selesai: ${r.lines.length} garis${r.fills.length ? ' + ' + r.fills.length + ' warna isian' : ''}`, { icon: 'gesture' });
  return true;
}

async function newDesignFrom(panel) {
  const r = panel.result, long = 1600, w = r.w >= r.h ? long : Math.round(long * r.w / r.h), hh = r.w >= r.h ? Math.round(long * r.h / r.w) : long;
  const d = newDesign(w + 160, hh + 160, 'Hasil trace', 'custom');
  d.pages[0].els.push(traceEl(panel, { x: 80, y: 80, w, h: hh }));
  await Store.putDesign(d);
  location.hash = '#/design/' + d.id;
}
