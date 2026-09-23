(() => {
'use strict';

const FONTS = window.JP_FONTS || [];
const BY_NAME = new Map(FONTS.map(f => [f.f.toLowerCase(), f]));
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded']);
const ALL_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const WEIGHT_NAMES = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
const MAX_CHARS = 24;
const DEFAULTS = { a: 'Noto Sans JP', b: 'Zen Kaku Gothic New', wa: 400, wb: 400, t: '永あなア', style: 'fill', show: 'both' };

// 仮想ボディ（em box）に対する欧文ベースラインの位置。和文フォントの慣例値（ascent 0.88 / descent 0.12）。
const BASELINE = 0.88;
const EM_RATIO = 0.78; // セルの一辺に対する仮想ボディの大きさ
const MASK = 160;      // 差分計算・グリフ有無判定用のオフスクリーン解像度

const $ = s => document.querySelector(s);
const el = {
  input: { a: $('#font-a'), b: $('#font-b') },
  weight: { a: $('#weight-a'), b: $('#weight-b') },
  status: { a: $('#status-a'), b: $('#status-b') },
  suggest: { a: $('#suggest-a'), b: $('#suggest-b') },
  chars: $('#chars'), cells: $('#cells'), guides: $('#guides'),
  file: $('#file-input'),
};

// 検索用の読み・別名（ファミリー名の先頭一致。カナ・ひらがな・ローマ字ゆらぎで探せるようにする）
const ALIASES = {
  'noto': 'ノト', 'biz ud': 'ビズ', 'm plus': 'エムプラス', 'm plus rounded': '丸ゴシック 丸', 'ibm plex': 'プレックス',
  'line seed': 'ラインシード', 'zen kaku': 'ゼン 角ゴシック', 'zen maru': 'ゼン 丸ゴシック 丸', 'zen old': 'ゼン オールド',
  'zen antique': 'ゼン アンティーク', 'zen kurenaido': 'ゼン 紅道', 'shippori': 'しっぽり', 'sawarabi': 'さわらび',
  'kosugi maru': '小杉 丸ゴシック 丸', 'kosugi': '小杉', 'kaisei': '解星', 'kiwi maru': 'キウイ 丸', 'klee': 'クレー',
  'hina': 'ひな', 'yuji hentaigana': '佑字 変体仮名', 'yuji': '佑字', 'new tegomin': 'ニュー テゴミン', 'aoboshi': '青星',
  'murecho': 'ムレチョ', 'mochiy pop': 'モッチーポップ ポップ 丸', 'hachi maru pop': 'はちまるポップ 丸 ポップ',
  'yusei magic': '油性マジック マジック', 'yomogi': 'よもぎ', 'stick': 'ステッキ', 'potta': 'ポッタ', 'reggae': 'レゲエ',
  'rocknroll': 'ロックンロール', 'dela gothic': 'デラゴシック 極太', 'dotgothic': 'ドットゴシック ドット ピクセル',
  'train': 'トレイン', 'rampart': 'ランパート', 'darumadrop': 'だるまドロップ', 'cherry bomb': 'チェリーボム',
  'chokokutai': '彫刻体', 'monomaniac': 'モノマニアック', 'palette mosaic': 'パレットモザイク', 'rock 3d': 'ロック 3D',
  'shizuru': 'しずる', 'slackside': 'スラックサイド', 'tsukimi rounded': '月見 丸', 'wdxl': 'ルブリフォント',
  'kapakana': 'かぱかな', 'tsukimi': '月見',
};
const CAT_WORDS = {
  'ゴシック': 'gothic sans 角ゴ かくご', '明朝': 'mincho serif 明朝体 みんちょう', '手書き': 'handwriting hand てがき 手書',
  'デザイン': 'display design デザイン書体 見出し みだし', '等幅': 'monospace mono code コード とうはば',
};

// 表記ゆらぎを吸収した検索キー: NFKC → 小文字 → カタカナをひらがなに → 空白・記号を除去
function norm(s) {
  return s.normalize('NFKC').toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s\-_・‐]/g, '');
}

let catalog = []; // { name, cat, src, key, nameKey }
function buildCatalog(local = []) {
  catalog = FONTS.map(f => {
    const lc = f.f.toLowerCase();
    const alias = Object.keys(ALIASES).filter(p => lc.startsWith(p)).map(p => ALIASES[p]).join(' ');
    const extra = [f.c, CAT_WORDS[f.c] || '', alias, /rounded|maru/i.test(f.f) ? '丸 まる 丸ゴシック まるごしっく' : ''].join(' ');
    return { name: f.f, cat: f.c, src: 'Google Fonts', nameKey: norm(f.f), key: norm(f.f + ' ' + extra) };
  });
  const seen = new Set(catalog.map(c => c.nameKey));
  for (const name of local) {
    const k = norm(name);
    if (seen.has(k)) continue;
    seen.add(k);
    catalog.push({ name, cat: '', src: 'PC 内', nameKey: k, key: k });
  }
}

function searchFonts(q) {
  const k = norm(q);
  if (!k) return catalog;
  const rank = c => (c.nameKey.startsWith(k) ? 0 : c.nameKey.includes(k) ? 1 : c.key.includes(k) ? 2 : -1);
  return catalog.map((c, i) => ({ c, r: rank(c), i })).filter(x => x.r >= 0)
    .sort((x, y) => x.r - y.r || x.i - y.i).map(x => x.c);
}

function highlight(name, q) {
  const i = q ? name.toLowerCase().indexOf(q.trim().toLowerCase()) : -1;
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  if (i < 0) return esc(name);
  return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + q.trim().length)) + '</mark>' + esc(name.slice(i + q.trim().length));
}

// 候補のプレビュー（「永あ」）は表示された行だけ、そのフォントを小さく取得して描く
const previewObserver = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    previewObserver.unobserve(e.target);
    const pv = e.target.querySelector('.pv');
    const fam = e.target.dataset.name;
    if (BY_NAME.has(fam.toLowerCase())) {
      loadGoogleFont(fam, 400, pv.textContent).then(alias => { pv.style.fontFamily = `"${alias}"`; }).catch(() => {});
    } else {
      pv.style.fontFamily = `"${fam.replace(/["\\]/g, '')}"`;
    }
  }
});

const state = {
  slot: {
    a: { name: DEFAULTS.a, weight: DEFAULTS.wa, file: null },
    b: { name: DEFAULTS.b, weight: DEFAULTS.wb, file: null },
  },
  text: DEFAULTS.t, style: DEFAULTS.style, show: DEFAULTS.show,
};

/* ---------- URL ハッシュとの同期 ---------- */

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('a')) state.slot.a.name = p.get('a');
  if (p.get('b')) state.slot.b.name = p.get('b');
  if (+p.get('wa')) state.slot.a.weight = +p.get('wa');
  if (+p.get('wb')) state.slot.b.weight = +p.get('wb');
  if (p.get('t')) state.text = p.get('t');
  if (p.get('s') === 'outline') state.style = 'outline';
}

function writeHash() {
  const p = new URLSearchParams();
  for (const k of ['a', 'b']) {
    const s = state.slot[k];
    if (s.file) continue; // ローカルファイルは共有できない
    p.set(k, s.name);
    p.set('w' + k, s.weight);
  }
  p.set('t', state.text);
  if (state.style === 'outline') p.set('s', 'outline');
  history.replaceState(null, '', '#' + p.toString());
}

/* ---------- フォントの解決 ---------- */

const gfCache = new Map(); // "family|weight|text" -> Promise<alias>
let aliasSeq = 0;

function loadGoogleFont(family, weight, text) {
  const key = `${family}|${weight}|${text}`;
  if (gfCache.has(key)) return gfCache.get(key);
  const job = (async () => {
    // text= で必要な文字だけのサブセットを取得する（和文フォントは数MBあるため）
    const url = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') +
      ':wght@' + weight + '&text=' + encodeURIComponent(text);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Google Fonts から取得できませんでした');
    const css = await res.text();
    const alias = 'jikurabe-gf-' + (++aliasSeq);
    const faces = [];
    for (const block of css.match(/@font-face\s*{[^}]*}/g) || []) {
      const src = /src:\s*(url\([^)]+\))/.exec(block);
      if (!src) continue;
      const range = /unicode-range:\s*([^;]+);/.exec(block);
      faces.push(new FontFace(alias, src[1], range ? { unicodeRange: range[1] } : {}));
    }
    if (!faces.length) throw new Error('フォントデータが見つかりません');
    await Promise.all(faces.map(f => f.load()));
    faces.forEach(f => document.fonts.add(f));
    return alias;
  })();
  gfCache.set(key, job);
  job.catch(() => gfCache.delete(key));
  return job;
}

// -> { css: canvas の font に使うファミリー指定, weight, label } または { error }
async function resolveFont(k) {
  const s = state.slot[k];
  if (s.file) return { css: `"${s.file.alias}"`, weight: 400, label: s.file.name };
  const name = s.name.trim();
  if (!name) return { error: 'フォント名を入力してください' };
  const gf = BY_NAME.get(name.toLowerCase());
  if (gf) {
    try {
      const alias = await loadGoogleFont(gf.f, s.weight, state.text);
      return { css: `"${alias}"`, weight: 400, label: `${gf.f} ${WEIGHT_NAMES[s.weight]}（Google Fonts・${gf.c}）` };
    } catch (e) {
      return { error: `${gf.f}: ${e.message}` };
    }
  }
  const css = GENERIC.has(name.toLowerCase()) ? name.toLowerCase() : `"${name.replace(/["\\]/g, '')}"`;
  return { css, weight: s.weight, label: `${name}（PC 内のフォント）`, system: true, generic: !css.startsWith('"') };
}

/* ---------- 描画 ---------- */

const maskCanvas = document.createElement('canvas');
maskCanvas.width = maskCanvas.height = MASK;
const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

function drawGlyph(ctx, ch, size, font, fallback, mode, color) {
  const fs = size * EM_RATIO;
  const top = (size - fs) / 2;
  ctx.font = `${font.weight} ${fs}px ${font.css}${fallback ? ', ' + fallback : ''}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (mode === 'outline') {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size / 220);
    ctx.lineJoin = 'round';
    ctx.strokeText(ch, size / 2, top + fs * BASELINE);
  } else {
    ctx.fillStyle = color;
    ctx.fillText(ch, size / 2, top + fs * BASELINE);
  }
}

function mask(ch, font, fallback) {
  maskCtx.clearRect(0, 0, MASK, MASK);
  drawGlyph(maskCtx, ch, MASK, font, fallback, 'fill', '#000');
  const d = maskCtx.getImageData(0, 0, MASK, MASK).data;
  const m = new Uint8Array(MASK * MASK);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return m;
}

function countDiff(m1, m2) {
  let x = 0, u = 0;
  for (let i = 0; i < m1.length; i++) { x += m1[i] ^ m2[i]; u += m1[i] | m2[i]; }
  return { xor: x, union: u };
}

// フォントがその文字を持たない場合はフォールバックで描かれる。
// フォールバック先を serif / sans-serif で変えて結果が変わるなら「グリフなし」と判定する。
function glyphMask(ch, font) {
  const m = mask(ch, font, 'serif');
  if (font.generic) return { m, missing: false };
  const d = countDiff(m, mask(ch, font, 'sans-serif'));
  return { m, missing: d.union > 0 && d.xor / d.union > 0.01 };
}

function drawGuides(ctx, size, color) {
  const fs = size * EM_RATIO, o = (size - fs) / 2, px = size / 300;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, px);
  ctx.strokeRect(o, o, fs, fs);
  ctx.setLineDash([3 * px, 4 * px]);
  ctx.beginPath();
  ctx.moveTo(size / 2, o); ctx.lineTo(size / 2, o + fs);
  ctx.moveTo(o, size / 2); ctx.lineTo(o + fs, size / 2);
  ctx.moveTo(o, o + fs * BASELINE); ctx.lineTo(o + fs, o + fs * BASELINE);
  ctx.stroke();
  ctx.restore();
}

function chars() {
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter
    ? Array.from(new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(state.text), s => s.segment)
    : Array.from(state.text);
  return seg.filter(c => c.trim()).slice(0, MAX_CHARS);
}

let resolved = { a: null, b: null };

function draw() {
  const css = getComputedStyle(document.documentElement);
  const color = { a: css.getPropertyValue('--a').trim(), b: css.getPropertyValue('--b').trim() };
  const guide = css.getPropertyValue('--guide').trim();
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const list = chars();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  while (el.cells.children.length > list.length) el.cells.lastChild.remove();
  while (el.cells.children.length < list.length) {
    const fig = document.createElement('figure');
    fig.className = 'cell';
    fig.innerHTML = '<canvas></canvas><figcaption><span class="cp"></span><span class="diff"></span></figcaption>';
    el.cells.append(fig);
  }

  const missCount = { a: 0, b: 0 };
  list.forEach((ch, i) => {
    const fig = el.cells.children[i];
    const cv = fig.querySelector('canvas');
    const size = Math.round((cv.clientWidth || 230) * dpr);
    cv.width = cv.height = size; // リサイズでクリアも兼ねる
    const ctx = cv.getContext('2d');
    if (el.guides.checked) drawGuides(ctx, size, guide);

    const g = {};
    for (const k of ['a', 'b']) {
      const f = resolved[k];
      if (!f || f.error) continue;
      g[k] = glyphMask(ch, f);
      if (g[k].missing) missCount[k]++;
    }
    // 重なりを濃く（ダークモードでは明るく）見せる
    ctx.globalCompositeOperation = dark ? 'screen' : 'multiply';
    for (const k of ['a', 'b']) {
      if (!g[k] || g[k].missing) continue;
      if (state.show !== 'both' && state.show !== k) continue;
      drawGlyph(ctx, ch, size, resolved[k], 'serif', state.style, color[k]);
    }
    ctx.globalCompositeOperation = 'source-over';

    fig.querySelector('.cp').textContent = Array.from(ch).map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ');
    const out = fig.querySelector('.diff');
    const missing = ['a', 'b'].filter(k => g[k] && g[k].missing);
    out.classList.toggle('miss', missing.length > 0);
    if (missing.length) {
      out.textContent = missing.map(k => k.toUpperCase()).join('・') + ' にグリフなし';
    } else if (g.a && g.b) {
      const d = countDiff(g.a.m, g.b.m);
      out.textContent = d.union ? `差分 ${(100 * d.xor / d.union).toFixed(1)}%` : '';
    } else {
      out.textContent = '';
    }
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', `「${ch}」の比較。${out.textContent}`);
  });

  for (const k of ['a', 'b']) {
    const f = resolved[k];
    if (!f || f.error) continue;
    let msg = f.label;
    if (list.length && missCount[k] === list.length) {
      msg = f.system ? `「${state.slot[k].name}」を含むフォントは見つかりませんでした` : `${f.label} — これらの文字を含みません`;
    }
    setStatus(k, msg, list.length > 0 && missCount[k] === list.length);
  }
}

function setStatus(k, msg, err) {
  el.status[k].textContent = msg;
  el.status[k].classList.toggle('err', !!err);
}

let token = 0;
async function update() {
  const t = ++token;
  writeHash();
  if (!chars().length) { el.cells.replaceChildren(); return; }
  await Promise.all(['a', 'b'].map(async k => {
    const s = state.slot[k];
    if (!s.file && BY_NAME.has(s.name.trim().toLowerCase())) setStatus(k, '読み込み中…');
    const r = await resolveFont(k);
    if (t !== token) return;
    resolved[k] = r;
    if (r.error) setStatus(k, r.error, true);
  }));
  if (t === token) draw();
}

function debounce(fn, ms) {
  let id;
  return () => { clearTimeout(id); id = setTimeout(fn, ms); };
}
const updateSoon = debounce(update, 250);

/* ---------- UI ---------- */

function syncWeights(k) {
  const s = state.slot[k], sel = el.weight[k];
  const gf = BY_NAME.get(s.name.trim().toLowerCase());
  const ws = s.file ? [] : gf ? gf.w : ALL_WEIGHTS;
  if (ws.length && !ws.includes(s.weight)) {
    s.weight = ws.reduce((best, w) => Math.abs(w - s.weight) < Math.abs(best - s.weight) ? w : best);
  }
  sel.replaceChildren(...ws.map(w => new Option(`${w} ${WEIGHT_NAMES[w]}`, w, false, w === s.weight)));
  sel.disabled = ws.length <= 1;
}

function syncInputs() {
  for (const k of ['a', 'b']) {
    const s = state.slot[k];
    el.input[k].value = s.file ? s.file.name : s.name;
    syncWeights(k);
  }
  el.chars.value = state.text;
  document.querySelectorAll('[data-show]').forEach(b => b.classList.toggle('on', b.dataset.show === state.show));
  document.querySelectorAll('[data-style]').forEach(b => b.classList.toggle('on', b.dataset.style === state.style));
}

/* ---------- フォント検索ドロップダウン ---------- */

const combo = { a: { open: false, active: -1, items: [] }, b: { open: false, active: -1, items: [] } };

function renderSuggest(k, q) {
  const c = combo[k], ul = el.suggest[k];
  c.items = searchFonts(q).slice(0, 300);
  c.active = -1;
  ul.replaceChildren();
  if (!c.items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = '一致するフォントがありません';
    ul.append(li);
  }
  let lastSrc = null;
  c.items.forEach((f, i) => {
    if (!q.trim() && f.src !== lastSrc) {
      const sep = document.createElement('li');
      sep.className = 'sep';
      sep.textContent = f.src === 'Google Fonts' ? 'Google Fonts（人気順）' : 'PC 内のフォント';
      ul.append(sep);
      lastSrc = f.src;
    }
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.id = `suggest-${k}-${i}`;
    li.dataset.name = f.name;
    li.dataset.cat = f.cat;
    li.dataset.i = i;
    li.innerHTML = `<span class="pv">永あ</span><span class="nm">${highlight(f.name, q)}</span><span class="ct">${f.cat || f.src}</span>`;
    ul.append(li);
    previewObserver.observe(li);
  });
  ul.hidden = false;
  c.open = true;
  el.input[k].setAttribute('aria-expanded', 'true');
}

function closeSuggest(k) {
  const c = combo[k];
  if (!c.open) return;
  c.open = false;
  el.suggest[k].hidden = true;
  el.suggest[k].querySelectorAll('li').forEach(li => previewObserver.unobserve(li));
  el.input[k].setAttribute('aria-expanded', 'false');
  el.input[k].removeAttribute('aria-activedescendant');
}

function setActive(k, i) {
  const c = combo[k], ul = el.suggest[k];
  c.active = i;
  ul.querySelectorAll('li[role=option]').forEach(li => li.classList.toggle('active', +li.dataset.i === i));
  const li = ul.querySelector(`li[data-i="${i}"]`);
  if (li) { li.scrollIntoView({ block: 'nearest' }); el.input[k].setAttribute('aria-activedescendant', li.id); }
}

function chooseFont(k, name) {
  state.slot[k].file = null;
  state.slot[k].name = name;
  el.input[k].value = name;
  closeSuggest(k);
  syncWeights(k);
  update();
}

for (const k of ['a', 'b']) {
  const input = el.input[k];
  input.addEventListener('input', () => {
    state.slot[k].file = null;
    state.slot[k].name = input.value;
    renderSuggest(k, input.value);
    syncWeights(k);
    updateSoon();
  });
  // フォーカス時は既存の値を全選択して、打ち始めたら置き換わるようにする（mouseup で選択が解除されるのを防ぐ）
  let justFocused = false;
  input.addEventListener('focus', () => { justFocused = true; input.select(); renderSuggest(k, ''); });
  input.addEventListener('mouseup', e => { if (justFocused) { e.preventDefault(); justFocused = false; } });
  input.addEventListener('click', () => { if (!combo[k].open) renderSuggest(k, ''); });
  input.addEventListener('blur', () => closeSuggest(k));
  input.addEventListener('keydown', e => {
    const c = combo[k];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!c.open) renderSuggest(k, input.value);
      const n = c.items.length;
      if (!n) return;
      setActive(k, e.key === 'ArrowDown' ? (c.active + 1) % n : (c.active - 1 + n) % n);
    } else if (e.key === 'Enter' || e.keyCode === 13) {
      if (e.isComposing) return;
      e.preventDefault();
      if (c.open && c.active >= 0 && c.items[c.active]) chooseFont(k, c.items[c.active].name);
      else { closeSuggest(k); update(); }
    } else if (e.key === 'Escape') {
      closeSuggest(k);
    }
  });
  // mousedown で選ぶ（click だと先に blur でリストが閉じてしまう）
  el.suggest[k].addEventListener('mousedown', e => {
    const li = e.target.closest('li[role=option]');
    e.preventDefault();
    if (li) chooseFont(k, li.dataset.name);
  });
  el.weight[k].addEventListener('change', () => { state.slot[k].weight = +el.weight[k].value; update(); });
}

let composing = false;
el.chars.addEventListener('compositionstart', () => { composing = true; });
el.chars.addEventListener('compositionend', () => { composing = false; state.text = el.chars.value; updateSoon(); });
el.chars.addEventListener('input', () => { if (!composing) { state.text = el.chars.value; updateSoon(); } });

document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
  state.text = b.dataset.preset; el.chars.value = state.text; update();
}));
document.querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', () => { state.show = b.dataset.show; syncInputs(); draw(); }));
document.querySelectorAll('[data-style]').forEach(b => b.addEventListener('click', () => { state.style = b.dataset.style; syncInputs(); writeHash(); draw(); }));
el.guides.addEventListener('change', draw);

$('#swap').addEventListener('click', () => {
  [state.slot.a, state.slot.b] = [state.slot.b, state.slot.a];
  syncInputs(); update();
});

let fileSlot = 'a', fileSeq = 0;
document.querySelectorAll('.file-btn').forEach(b => b.addEventListener('click', () => { fileSlot = b.dataset.slot; el.file.value = ''; el.file.click(); }));
el.file.addEventListener('change', async () => {
  const file = el.file.files[0];
  if (!file) return;
  const k = fileSlot;
  try {
    const face = new FontFace('jikurabe-file-' + (++fileSeq), await file.arrayBuffer());
    await face.load();
    document.fonts.add(face);
    state.slot[k].file = { alias: face.family.replace(/"/g, ''), name: file.name };
    syncInputs(); update();
  } catch (e) {
    setStatus(k, `${file.name} をフォントとして読み込めませんでした`, true);
  }
});

$('#share-x').addEventListener('click', () => {
  writeHash();
  const name = k => state.slot[k].file ? state.slot[k].file.name.replace(/\.[^.]+$/, '') : state.slot[k].name;
  const text = `${name('a')} と ${name('b')} の字形を重ねて比較 — Jikurabe`;
  const u = 'https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(location.href) + '&hashtags=Jikurabe';
  window.open(u, '_blank', 'noopener,width=600,height=500');
});

const copyBtn = $('#copy-link');
copyBtn.addEventListener('click', async () => {
  writeHash();
  const label = copyBtn.textContent;
  try { await navigator.clipboard.writeText(location.href); copyBtn.textContent = 'コピーしました'; }
  catch { copyBtn.textContent = 'アドレスバーの URL をコピーしてください'; }
  setTimeout(() => { copyBtn.textContent = label; }, 1800);
});

// Local Font Access API（Chrome / Edge）。許可されるとインストール済みフォントが候補に出る。
const localBtn = $('#local-fonts'), localNote = $('#local-note');
if ('queryLocalFonts' in window) {
  localBtn.addEventListener('click', async () => {
    try {
      const fonts = await window.queryLocalFonts();
      const families = [...new Set(fonts.map(f => f.family))].sort((x, y) => x.localeCompare(y, 'ja'));
      if (!families.length) throw new Error('empty');
      buildCatalog(families);
      localBtn.textContent = `PC のフォント ${families.length} 件を候補に追加しました`;
      localBtn.disabled = true;
      localBtn.classList.add('done');
      localNote.textContent = 'フォント名の入力欄で検索できます';
    } catch {
      localNote.textContent = 'フォント一覧を取得できませんでした（許可が必要です）';
    }
  });
} else {
  localBtn.disabled = true;
  localNote.textContent = 'このブラウザは一覧の取得に対応していません（Chrome / Edge で可）。フォント名を直接入力すれば PC のフォントも使えます';
}

window.addEventListener('resize', debounce(draw, 150));
window.addEventListener('hashchange', () => { readHash(); syncInputs(); update(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);

readHash();
buildCatalog();
syncInputs();
update();
})();
