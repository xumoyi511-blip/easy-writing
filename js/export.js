/* export.js — TXT/JSON 导入导出、敏感词检测 */
(function () {
  const EW = window.EW;

  function htmlToText(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    // 块级元素换行
    div.querySelectorAll('p,div,br,h1,h2,h3,h4,blockquote,li').forEach((n) => {
      const nl = document.createTextNode('\n');
      if (n.tagName === 'LI') n.appendChild(nl);
      else n.parentNode.insertBefore(nl, n.nextSibling);
    });
    let text = div.textContent;
    text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
    return text;
  }

  function chapterList(book, chapters) {
    const order = book.chapterIds || [];
    const map = {};
    chapters.forEach((c) => { map[c.id] = c; });
    return order.map((id) => map[id]).filter(Boolean);
  }

  /* ---------- 导出 ---------- */
  function exportTxt(book, chapters) {
    const chs = chapterList(book, chapters);
    const parts = [];
    const volTitle = {};
    (book.volumes || []).forEach((v) => { volTitle[v.id] = v.title; });
    let curVol = null;
    chs.forEach((c) => {
      if (c.volumeId !== curVol) {
        curVol = c.volumeId;
        parts.push('【' + (volTitle[curVol] || '正文') + '】');
      }
      parts.push((c.title ? c.title + '\n' : '') + htmlToText(c.content));
    });
    return parts.join('\n\n');
  }

  function exportBookTxt(book, chapters) {
    const name = (book.title || '作品').replace(/[\\/:*?"<>|]/g, '_');
    EW.download(name + '.txt', '\uFEFF' + exportTxt(book, chapters), 'text/plain;charset=utf-8');
    EW.toast('已导出 TXT');
  }

  function exportBookJson(book, chapters) {
    const name = (book.title || '作品').replace(/[\\/:*?"<>|]/g, '_');
    const data = { app: 'easy-writing-ipad', version: EW.version, book, chapters };
    EW.download(name + '.json', JSON.stringify(data, null, 2), 'application/json');
    EW.toast('已导出 JSON（含参考资料）');
  }

  /* ---------- 导入 ---------- */
  function parseJson(text) {
    const data = JSON.parse(text);
    if (data && data.book) return data;
    // 兼容直接粘贴的单个 book 对象
    if (data && data.id && data.title && data.chapterIds) return { book: data, chapters: [] };
    throw new Error('不是有效的作品 JSON');
  }

  async function importJson(text) {
    const data = parseJson(text);
    const book = data.book;
    const chapters = data.chapters || [];
    // 重新生成 id，避免覆盖
    const idMap = {};
    book.id = EW.uid();
    book.createdAt = Date.now();
    book.updatedAt = Date.now();
    (book.volumes || []).forEach((v) => { idMap[v.id] = EW.uid(); v.id = idMap[v.id]; });
    book.chapterIds = (book.chapterIds || []).map((cid) => {
      const nc = EW.uid(); idMap[cid] = nc; return nc;
    });
    if (!book.references) book.references = { outline: '', setting: '', story: '', characters: [], timeline: [] };
    await EW.db.putBook(book);
    for (const c of chapters) {
      c.id = idMap[c.id] || EW.uid();
      c.bookId = book.id;
      c.volumeId = idMap[c.volumeId] || c.volumeId;
      c.versions = [];
      await EW.db.putChapter(c);
    }
    return book;
  }

  function importTxtToBook(text, book, volumeId) {
    const chs = splitChapters(text);
    let i = 0;
    return Promise.all(chs.map((ch) => {
      const nc = EW.db.newChapter(book.id, volumeId, ch.title);
      nc.content = textToHtml(ch.body);
      nc.wordCount = EW.countWords(ch.body).words;
      // 追加到章节顺序末尾
      const idx = book.chapterIds.indexOf(null);
      if (ch.title && !ch.body) { /* 仅标题 */ }
      book.chapterIds.push(nc.id);
      return EW.db.putChapter(nc);
    })).then(() => EW.db.putBook(book));
  }

  function textToHtml(text) {
    const paras = String(text || '').split(/\n+/);
    return paras.map((p) => p.trim() ? '<p>' + EW.escapeHtml(p) + '</p>' : '<p><br></p>').join('');
  }

  function splitChapters(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const re = /^(第[0-9一二三四五六七八九十百千万零〇两]+[章回节卷集部篇].*|[Cc]hapter\s*\d+.*)$/;
    const chs = [];
    let cur = null;
    for (const line of lines) {
      const t = line.trim();
      if (re.test(t) && t.length < 40) {
        if (cur) chs.push(cur);
        cur = { title: t, body: '' };
      } else {
        if (!cur) cur = { title: '', body: '' };
        cur.body += (cur.body ? '\n' : '') + line;
      }
    }
    if (cur) chs.push(cur);
    if (!chs.length) chs.push({ title: '', body: text });
    return chs;
  }

  /* ---------- 敏感词检测 ---------- */
  function checkSensitive(text) {
    const s = EW.db.getSettings();
    const list = (s.sensitive || []).map((w) => String(w).trim()).filter(Boolean);
    if (!list.length) return [];
    const plain = htmlToText(text);
    const found = [];
    list.forEach((w) => {
      const re = new RegExp(esc(w), 'gi');
      const m = plain.match(re);
      if (m) found.push({ word: w, count: m.length });
    });
    return found;
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  EW.exporter = { exportTxt, exportBookTxt, exportBookJson, importJson, importTxtToBook, textToHtml, splitChapters, htmlToText, checkSensitive };
})();
