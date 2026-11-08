/* bookshelf.js — 书架首页 + 写作台布局 + 目录树 + 右侧面板 */
(function () {
  const EW = window.EW;

  const state = { book: null, chapters: [], chapterMap: {}, tab: 'outline', aiSub: 'chat', homeGroup: '' };

  /* 侧栏/右栏折叠样式（注入，避免改动主 CSS） */
  const hideCss = document.createElement('style');
  hideCss.textContent = `
    body.hide-sidebar .sidebar { display: none; }
    body.hide-sidebar .panel-toggle.left { left: 0; }
    body.hide-right .right-panel { display: none; }
    body.hide-right .panel-toggle.right { right: 0; }
  `;
  document.head.appendChild(hideCss);

  // 章节保存后更新目录树计数（全局一次）
  EW.on('chapter-saved', (ch) => {
    const el = document.querySelector('.tree-chapter[data-chapter-id="' + ch.id + '"] .c-count');
    if (el) el.textContent = (ch.wordCount || 0) + ' 字';
  });

  // 手机阅读预览实时同步 + 工具栏预览按钮
  function updatePreview() {
    if (state.tab !== 'preview' || !state.previewEl || !EW.editor.bodyEl) return;
    state.previewEl.innerHTML = EW.editor.bodyEl.innerHTML;
    if (state.previewTitleEl && EW.editor.titleEl) state.previewTitleEl.textContent = EW.editor.titleEl.value || '未命名';
  }
  EW.on('editor-update', updatePreview);
  EW.on('chapter-saved', updatePreview);
  EW.on('toggle-preview', () => { document.body.classList.remove('hide-right'); setTab('preview'); });

  /* ---------- 通用：文本输入弹窗 ---------- */
  EW.promptText = function (title, def, onOk, placeholder) {
    const input = EW.el('input', { value: def || '', placeholder: placeholder || '' });
    const m = EW.openModal({
      title,
      body: EW.el('div', { class: 'field' }, [EW.el('label', { text: title }), input]),
      foot: EW.el('div', { style: 'display:flex;gap:10px;width:100%;' }, [
        EW.el('button', { class: 'btn', style: 'flex:1;', text: '取消', onclick: () => m.close() }),
        EW.el('button', { class: 'btn primary', style: 'flex:1;', text: '确定', onclick: () => { m.close(); onOk(input.value.trim()); } }),
      ]),
    });
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { m.close(); onOk(input.value.trim()); } });
  };

  /* ---------- 灵感速记 ---------- */
  async function addNote(text) {
    if (!text || !text.trim()) return;
    await EW.db.putNote({ id: EW.uid(), text: text.trim() });
    EW.toast('已记入素材库');
    if (EW.currentBook) return;
    renderHome();
  }
  EW.openQuickNote = function () {
    const ta = EW.el('textarea', { placeholder: '灵光一闪，赶紧记下……', style: 'min-height:120px;' });
    const m = EW.openModal({
      title: '记灵感',
      body: ta,
      foot: EW.el('button', { class: 'btn primary', text: '保存', onclick: () => { addNote(ta.value); m.close(); } }),
    });
    ta.focus();
  };

  /* ---------- 首页 ---------- */
  async function renderHome() {
    const home = document.getElementById('view-home');
    const wrap = EW.el('div', { class: 'home-wrap' });

    const books = await EW.db.listBooks();
    const allCh = await EW.db.listChapters();
    const countByBook = {};
    allCh.forEach((c) => { countByBook[c.bookId] = (countByBook[c.bookId] || 0) + (c.wordCount || 0); });
    const notes = await EW.db.listNotes();

    // Hero
    const hero = EW.el('div', { class: 'home-hero' }, [
      EW.el('div', {}, [
        EW.el('h1', { text: '易创写作' }),
        EW.el('p', { text: '纯本地 · 离线可用 · 稿子攥在自己手里' }),
      ]),
      EW.el('button', { class: 'btn primary', text: '＋ 新建作品', onclick: () => newBookFlow() }),
    ]);
    wrap.appendChild(hero);

    // 灵感速记
    const noteCard = EW.el('div', { class: 'card quick-note' });
    const noteTa = EW.el('textarea', { placeholder: '灵光一闪，赶紧记下（回车保存）……' });
    noteCard.appendChild(noteTa);
    const noteRow = EW.el('div', { class: 'row' }, [
      EW.el('span', { style: 'font-size:12px;color:var(--text-soft);', text: '灵感速记 · 自动进入素材库' }),
      EW.el('button', { class: 'btn sm', text: '保存', onclick: () => { addNote(noteTa.value); noteTa.value = ''; } }),
    ]);
    noteCard.appendChild(noteRow);
    noteTa.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(noteTa.value); noteTa.value = ''; } });
    wrap.appendChild(noteCard);

    // 统计条
    const today = EW.stats.today();
    const totals = EW.stats.totals();
    const streak = EW.stats.streak();
    wrap.appendChild(EW.el('div', { class: 'stats-strip' }, [
      statBox(today.hand + today.ai, '今日字数'),
      statBox(streak, '连续天数'),
      statBox(totals.total, '累计字数'),
    ]));

    // AI 快捷入口
    wrap.appendChild(EW.el('div', { class: 'section-title', text: 'AI 工具（BYOK）' }, [
      EW.el('span', { style: 'display:flex;gap:6px;flex-wrap:wrap;' }, [
        EW.el('button', { class: 'btn sm', text: '建书', onclick: () => EW.ai.workflow() }),
        EW.el('button', { class: 'btn sm', text: '拆书', onclick: () => EW.ai.teardown() }),
        EW.el('button', { class: 'btn sm', text: '模型', onclick: () => EW.ai.openModelManager() }),
        EW.el('button', { class: 'btn sm', text: '提示词', onclick: () => EW.ai.openPromptManager() }),
        EW.el('button', { class: 'btn sm', text: '取名', onclick: () => EW.ai.nameGen() }),
        EW.el('button', { class: 'btn sm', text: '简介', onclick: () => EW.ai.intro() }),
      ]),
    ]));

    // 书架：分组导航
    wrap.appendChild(EW.el('div', { class: 'section-title', text: '书架' }));
    const groups = collectGroups(books);
    const groupBar = EW.el('div', { class: 'group-bar' });
    const chip = (label, val) => EW.el('button', { class: 'chip' + (state.homeGroup === val ? ' active' : ''), text: label, onclick: () => { state.homeGroup = val; renderHome(); } });
    groupBar.appendChild(chip('全部', ''));
    groups.forEach((g) => groupBar.appendChild(chip(g, g)));
    groupBar.appendChild(EW.el('button', { class: 'chip trash', text: '回收站', onclick: () => renderTrash() }));
    wrap.appendChild(groupBar);

    const filtered = state.homeGroup ? books.filter((b) => (b.group || '') === state.homeGroup) : books;
    const shelf = EW.el('div', { class: 'shelf' });
    filtered.forEach((b) => {
      const card = EW.el('div', { class: 'book-card', style: coverStyle(b), onclick: () => openBook(b.id) }, [
        EW.el('div', { class: 'b-title', text: (b.emoji ? b.emoji + ' ' : '') + b.title }),
        EW.el('div', { class: 'b-meta', text: (countByBook[b.id] || 0) + ' 字 · ' + (b.chapterIds ? b.chapterIds.length : 0) + ' 章' }),
        EW.el('button', { class: 'b-menu', text: '\u22ee', onclick: (e) => { e.stopPropagation(); bookMenu(b); } }),
      ]);
      shelf.appendChild(card);
    });
    const addCard = EW.el('div', { class: 'book-add', onclick: () => newBookFlow() }, [
      EW.el('span', { class: 'plus', text: '＋' }),
      EW.el('span', { text: '新建作品' }),
    ]);
    shelf.appendChild(addCard);
    wrap.appendChild(shelf);
    if (!filtered.length && state.homeGroup) wrap.appendChild(EW.el('p', { class: 'empty', text: '该分组还没有作品。' }));

    // 素材库
    wrap.appendChild(EW.el('div', { class: 'section-title', style: 'margin-top:22px;', text: '灵感速记 / 素材库' }));
    const notesList = EW.el('div', { class: 'notes-list' });
    if (!notes.length) notesList.appendChild(EW.el('p', { class: 'empty', text: '还没有灵感。上方速记或点右上角 ✎ 记一条。' }));
    notes.forEach((n) => {
      const item = EW.el('div', { class: 'card note-item' }, [
        EW.el('div', { class: 'n-text', text: n.text }),
        EW.el('div', { class: 'n-meta' }, [
          EW.el('span', { text: EW.fmtTime(n.createdAt) }),
          EW.el('button', { class: 'btn sm ghost', text: '删除', onclick: async () => { await EW.db.deleteNote(n.id); renderHome(); } }),
        ]),
      ]);
      notesList.appendChild(item);
    });
    wrap.appendChild(notesList);

    // 导入
    wrap.appendChild(EW.el('div', { class: 'section-title', style: 'margin-top:22px;', text: '导入 / 数据' }));
    const importRow = EW.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' }, [
      EW.el('button', { class: 'btn', text: '导入 TXT（新作品）', onclick: () => importTxtNew() }),
      EW.el('button', { class: 'btn', text: '导入 JSON（含参考资料）', onclick: () => importJsonNew() }),
      EW.el('button', { class: 'btn', text: '导出全部数据', onclick: () => exportAll() }),
    ]);
    wrap.appendChild(importRow);

    home.innerHTML = '';
    home.appendChild(wrap);
  }

  function statBox(num, label) {
    return EW.el('div', { class: 'card stat-box' }, [
      EW.el('div', { class: 'num', text: String(num) }),
      EW.el('div', { class: 'lbl', text: label }),
    ]);
  }

  async function newBookFlow() {
    EW.promptText('新建作品', '', async (title) => {
      const book = EW.db.newBook(title || '未命名作品');
      await EW.db.putBook(book);
      await openBook(book.id);
    }, '作品名');
  }

  function fileInput(accept, cb) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (f) { try { cb(await EW.readFile(f), f.name); } catch (e) { EW.toast('读取失败：' + e.message); } }
      input.remove();
    });
    input.click();
  }

  async function importTxtNew() {
    fileInput('.txt,text/plain', async (text) => {
      const book = EW.db.newBook('导入作品');
      book.volumes = [{ id: EW.uid(), title: '正文' }];
      const volId = book.volumes[0].id;
      const chs = EW.exporter.splitChapters(text);
      for (const c of chs) {
        const nc = EW.db.newChapter(book.id, volId, c.title);
        nc.content = EW.exporter.textToHtml(c.body);
        nc.wordCount = EW.countWords(c.body).words;
        book.chapterIds.push(nc.id);
        await EW.db.putChapter(nc);
      }
      await EW.db.putBook(book);
      EW.toast('已导入 ' + chs.length + ' 章');
      renderHome();
    });
  }

  async function importJsonNew() {
    fileInput('.json,application/json', async (text) => {
      try {
        await EW.exporter.importJson(text);
        EW.toast('导入成功');
        renderHome();
      } catch (e) { EW.toast('导入失败：' + e.message); }
    });
  }

  async function exportAll() {
    const books = await EW.db.listBooks();
    const chs = await EW.db.listChapters();
    EW.download('易创备份.json', JSON.stringify({ app: 'easy-writing-ipad', version: EW.version, books, chapters }, null, 2), 'application/json');
    EW.toast('已导出全部作品');
  }

  /* ---------- 作品菜单 ---------- */
  function bookMenu(book) {
    const body = EW.el('div', { style: 'display:flex;flex-direction:column;gap:8px;' });
    const actions = [
      ['打开作品', () => openBook(book.id)],
      ['改封面', () => coverPicker(book)],
      ['移动分组', () => groupPicker(book)],
      ['重命名', () => EW.promptText('重命名作品', book.title, async (t) => { if (t) { book.title = t; await EW.db.putBook(book); renderHome(); } })],
      ['导出 TXT', async () => { const chs = await EW.db.listChapters(book.id); EW.exporter.exportBookTxt(book, chs); }],
      ['导出 JSON', async () => { const chs = await EW.db.listChapters(book.id); EW.exporter.exportBookJson(book, chs); }],
      ['AI 逐章生成', () => EW.ai.autoDraft(book)],
      ['敏感词检测', async () => { const chs = await EW.db.listChapters(book.id); showSensitiveResult(await checkBookSensitive(chs)); }],
      ['移入回收站', () => EW.confirm('移入回收站', '《' + book.title + '》将移入回收站，可随时恢复。', async () => { await EW.db.softDeleteBook(book.id); renderHome(); }, { danger: true, okText: '移入' })],
    ];
    actions.forEach(([label, fn]) => body.appendChild(EW.el('button', { class: 'btn', text: label, onclick: () => { const modal = body.closest('.modal'); if (modal) modal.close(); fn(); } })));
    EW.openModal({ title: book.title, body });
  }

  function coverStyle(b) {
    if (b.coverImage) return 'background-image:url(' + b.coverImage + ');background-size:cover;background-position:center;';
    return 'background:' + EW.db.COVERS[(b.cover || 0) % EW.db.COVERS.length] + ';';
  }
  function collectGroups(books) {
    const set = {};
    books.forEach((b) => { if (b.group) set[b.group] = 1; });
    return Object.keys(set);
  }
  function pickImage(cb) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const f = input.files[0];
      input.remove();
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxW = 480;
          const scale = Math.min(1, maxW / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          cb(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => EW.toast('图片读取失败');
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    });
    input.click();
  }
  function coverPicker(book) {
    const body = EW.el('div');
    body.appendChild(EW.el('div', { style: 'font-size:13px;color:var(--text-soft);margin-bottom:8px;', text: '选择颜色' }));
    const grid = EW.el('div', { class: 'cover-grid' });
    EW.db.COVERS.forEach((c, i) => {
      grid.appendChild(EW.el('button', { class: 'cover-swatch', style: 'background:' + c, onclick: () => { book.cover = i; book.emoji = ''; book.coverImage = ''; EW.db.putBook(book); } }));
    });
    body.appendChild(grid);
    const emoji = EW.el('input', { placeholder: '或输入一个 Emoji 做封面，如 📖 🐉 ✨', value: book.emoji || '' });
    emoji.addEventListener('input', () => { book.emoji = emoji.value.trim(); book.coverImage = ''; EW.db.putBook(book); });
    body.appendChild(EW.el('div', { class: 'field' }, [EW.el('label', { text: 'Emoji 封面' }), emoji]));
    body.appendChild(EW.el('button', { class: 'btn block', text: '上传图片做封面', onclick: () => pickImage((url) => { book.coverImage = url; book.emoji = ''; EW.db.putBook(book); EW.toast('封面已更新'); }) }));
    EW.openModal({ title: '封面设置', body });
  }
  async function groupPicker(book) {
    const books = await EW.db.listBooks();
    const groups = collectGroups(books);
    const body = EW.el('div', { style: 'display:flex;flex-direction:column;gap:8px;' });
    ['未分组'].concat(groups).forEach((g) => {
      const cur = (book.group || '') === '' ? '未分组' : book.group;
      body.appendChild(EW.el('button', { class: 'btn' + (cur === g ? ' primary' : ''), text: g, onclick: () => { const modal = body.closest('.modal'); if (modal) modal.close(); book.group = (g === '未分组' ? '' : g); EW.db.putBook(book).then(() => renderHome()); } }));
    });
    const newInput = EW.el('input', { placeholder: '新建分组名…' });
    body.appendChild(newInput);
    body.appendChild(EW.el('button', { class: 'btn', text: '新建并移入', onclick: () => { const n = newInput.value.trim(); if (!n) { EW.toast('请输入分组名'); return; } const modal = body.closest('.modal'); if (modal) modal.close(); book.group = n; EW.db.putBook(book).then(() => renderHome()); } }));
    EW.openModal({ title: '移动到分组', body });
  }
  async function renderTrash() {
    const home = document.getElementById('view-home');
    const wrap = EW.el('div', { class: 'home-wrap' });
    wrap.appendChild(EW.el('div', { class: 'home-hero' }, [
      EW.el('div', {}, [
        EW.el('h1', { text: '回收站' }),
        EW.el('p', { text: '移入回收站的作品，可恢复或彻底删除。' }),
      ]),
      EW.el('button', { class: 'btn', text: '← 返回书架', onclick: () => renderHome() }),
    ]));
    const books = await EW.db.listBooks(true);
    const trash = books.filter((b) => b.deletedAt);
    const list = EW.el('div', { class: 'notes-list' });
    if (!trash.length) list.appendChild(EW.el('p', { class: 'empty', text: '回收站是空的。' }));
    trash.forEach((b) => {
      list.appendChild(EW.el('div', { class: 'card note-item' }, [
        EW.el('div', { class: 'n-text', text: b.title + ' · ' + (b.chapterIds ? b.chapterIds.length : 0) + ' 章' }),
        EW.el('div', { class: 'n-meta' }, [
          EW.el('span', { text: EW.fmtTime(b.deletedAt) }),
          EW.el('span', { style: 'display:flex;gap:6px;' }, [
            EW.el('button', { class: 'btn sm', text: '恢复', onclick: async () => { await EW.db.restoreBook(b.id); renderTrash(); } }),
            EW.el('button', { class: 'btn sm danger', text: '彻底删除', onclick: () => EW.confirm('彻底删除', '《' + b.title + '》将被永久删除，不可恢复。', async () => { await EW.db.hardDeleteBook(b.id); renderTrash(); }, { danger: true, okText: '删除' }) }),
          ]),
        ]),
      ]));
    });
    wrap.appendChild(list);
    home.innerHTML = '';
    home.appendChild(wrap);
  }

  async function checkBookSensitive(chapters) {
    const found = [];
    for (const c of chapters) {
      const hits = EW.exporter.checkSensitive(c.content);
      hits.forEach((h) => found.push({ title: c.title || '未命名章节', word: h.word, count: h.count }));
    }
    return found;
  }
  function showSensitiveResult(found) {
    const body = EW.el('div');
    if (!found.length) body.appendChild(EW.el('p', { class: 'empty', text: '未检测到敏感词。' }));
    found.forEach((f) => body.appendChild(EW.el('div', { class: 'card', style: 'padding:10px 12px;margin-bottom:8px;font-size:14px;' }, [
      EW.el('span', { style: 'color:var(--danger);font-weight:700;', text: f.word }),
      EW.el('span', { style: 'color:var(--text-soft);', text: ' × ' + f.count }),
      EW.el('div', { style: 'font-size:12px;color:var(--text-soft);margin-top:4px;', text: f.title }),
    ])));
    EW.openModal({ title: '敏感词检测', body });
  }

  /* ---------- 写作台 ---------- */
  async function openBook(bookId) {
    const book = await EW.db.getBook(bookId);
    if (!book) return;
    const chapters = await EW.db.listChapters(bookId);
    state.book = book;
    state.chapters = chapters;
    state.chapterMap = {};
    chapters.forEach((c) => { state.chapterMap[c.id] = c; });
    EW.currentBookId = bookId;
    EW.currentChapterId = null;

    buildBookView();
    document.getElementById('view-home').hidden = true;
    document.getElementById('view-book').hidden = false;
    document.getElementById('btn-back').hidden = false;
    document.getElementById('topbar-title').textContent = book.title;

    // 选择第一个章节（或新建）
    if (chapters.length) selectChapter(chapters[0].id);
    else { EW.toast('点左侧“＋章”开始第一章'); }
  }

  function buildBookView() {
    const view = document.getElementById('view-book');
    view.innerHTML = '';
    const layout = EW.el('div', { class: 'book-layout' });

    const sidebar = EW.el('div', { class: 'sidebar' });
    const sHead = EW.el('div', { class: 's-head' });
    sHead.appendChild(EW.el('div', { class: 'b-name', text: state.book.title }));
    sHead.appendChild(EW.el('button', { class: 'icon-btn', text: '＋卷', style: 'font-size:14px;', title: '新建卷', onclick: () => addVolume() }));
    sHead.appendChild(EW.el('button', { class: 'icon-btn', text: '\u22ee', title: '作品菜单', onclick: () => bookMenu(state.book) }));
    sidebar.appendChild(sHead);
    const sBody = EW.el('div', { class: 's-body' });
    sidebar.appendChild(sBody);
    state.sidebarBody = sBody;

    const editorCol = EW.el('div', { class: 'editor-col' });

    const right = EW.el('div', { class: 'right-panel' });
    const rpTabs = EW.el('div', { class: 'rp-tabs' });
    const TABS = [
      ['outline', '大纲'], ['characters', '角色'], ['setting', '设定'], ['timeline', '时间线'], ['story', '故事线'], ['preview', '预览'], ['ai', 'AI'], ['stats', '统计'],
    ];
    TABS.forEach(([id, label]) => {
      const t = EW.el('button', { class: 'rp-tab' + (state.tab === id ? ' active' : ''), text: label, onclick: () => setTab(id) });
      rpTabs.appendChild(t);
    });
    right.appendChild(rpTabs);
    const rpBody = EW.el('div', { class: 'rp-body' });
    right.appendChild(rpBody);
    state.rpBody = rpBody;
    state.rpTabs = rpTabs;

    // 折叠按钮
    const leftToggle = EW.el('button', { class: 'panel-toggle left', text: '\u2039', title: '目录', onclick: () => { document.body.classList.toggle('hide-sidebar'); leftToggle.textContent = document.body.classList.contains('hide-sidebar') ? '\u203A' : '\u2039'; } });
    const rightToggle = EW.el('button', { class: 'panel-toggle right', text: '\u203A', title: '面板', onclick: () => { document.body.classList.toggle('hide-right'); rightToggle.textContent = document.body.classList.contains('hide-right') ? '\u2039' : '\u203A'; } });

    layout.appendChild(sidebar);
    layout.appendChild(editorCol);
    layout.appendChild(right);
    layout.appendChild(leftToggle);
    layout.appendChild(rightToggle);
    view.appendChild(layout);

    // 创建编辑器
    EW.editor.create(editorCol);

    renderTree();
    renderRightTab();
  }

  /* ---------- 目录树 ---------- */
  function renderTree() {
    const body = state.sidebarBody;
    if (!body) return;
    body.innerHTML = '';
    const book = state.book;
    const ids = book.chapterIds || [];

    (book.volumes || []).forEach((vol) => {
      const volEl = EW.el('div', { class: 'tree-vol' });
      const head = EW.el('div', { class: 'vol-head' });
      head.appendChild(EW.el('span', { class: 'v-title', text: vol.title }));
      head.appendChild(EW.el('button', { class: 'icon-btn', text: '＋', title: '在该卷新建章节', style: 'font-size:16px;', onclick: () => addChapter(vol.id) }));
      head.appendChild(EW.el('button', { class: 'icon-btn', text: '\u270E', title: '重命名卷', style: 'font-size:13px;', onclick: () => EW.promptText('重命名卷', vol.title, async (t) => { if (t) { vol.title = t; await EW.db.putBook(book); renderTree(); } }) }));
      head.appendChild(EW.el('button', { class: 'icon-btn', text: '\u00d7', title: '删除卷', style: 'font-size:14px;', onclick: () => deleteVolume(vol) }));
      volEl.appendChild(head);

      ids.forEach((id) => {
        const ch = state.chapterMap[id];
        if (ch && ch.volumeId === vol.id) volEl.appendChild(chapterRow(ch));
      });
      body.appendChild(volEl);
    });

    // 未分组章节
    const orphans = ids.filter((id) => { const ch = state.chapterMap[id]; return ch && !(book.volumes || []).some((v) => v.id === ch.volumeId); });
    if (orphans.length) {
      const volEl = EW.el('div', { class: 'tree-vol' });
      volEl.appendChild(EW.el('div', { class: 'vol-head' }, [EW.el('span', { class: 'v-title', text: '未分组' })]));
      orphans.forEach((id) => volEl.appendChild(chapterRow(state.chapterMap[id])));
      body.appendChild(volEl);
    }
  }

  function chapterRow(ch) {
    const row = EW.el('div', { class: 'tree-chapter' + (EW.currentChapterId === ch.id ? ' active' : ''), dataset: { chapterId: ch.id }, onclick: () => selectChapter(ch.id) });
    row.appendChild(EW.el('span', { class: 'c-title', text: ch.title || '未命名章节' }));
    row.appendChild(EW.el('span', { class: 'c-count', text: (ch.wordCount || 0) + ' 字' }));
    const up = EW.el('button', { class: 'icon-btn', text: '\u2191', title: '上移', style: 'font-size:14px;', onclick: (e) => { e.stopPropagation(); moveChapter(ch.id, -1); } });
    const dn = EW.el('button', { class: 'icon-btn', text: '\u2193', title: '下移', style: 'font-size:14px;', onclick: (e) => { e.stopPropagation(); moveChapter(ch.id, 1); } });
    const del = EW.el('button', { class: 'icon-btn', text: '\u00d7', title: '删除章节', style: 'font-size:15px;', onclick: (e) => { e.stopPropagation(); deleteChapterFlow(ch); } });
    row.appendChild(up); row.appendChild(dn); row.appendChild(del);
    return row;
  }

  function selectChapter(id) {
    if (EW.editor.chapter && EW.editor.chapter.id !== id && EW.editor.dirty) EW.editor.commitVersion();
    const ch = state.chapterMap[id];
    if (!ch) return;
    EW.currentChapterId = id;
    EW.editor.load(ch);
    renderTree();
  }

  async function addChapter(volumeId) {
    const book = state.book;
    const nc = EW.db.newChapter(book.id, volumeId, '');
    book.chapterIds.push(nc.id);
    state.chapterMap[nc.id] = nc;
    await EW.db.putChapter(nc);
    await EW.db.putBook(book);
    renderTree();
    selectChapter(nc.id);
  }

  async function addVolume() {
    const book = state.book;
    EW.promptText('新建卷', '', async (t) => {
      book.volumes = book.volumes || [];
      book.volumes.push({ id: EW.uid(), title: t || ('第' + (book.volumes.length + 1) + '卷') });
      await EW.db.putBook(book);
      renderTree();
    }, '卷名，如：第一卷');
  }

  async function deleteVolume(vol) {
    EW.confirm('删除卷', '将删除该卷下的所有章节。确定？', async () => {
      const book = state.book;
      const ids = book.chapterIds || [];
      for (const id of ids.slice()) {
        const ch = state.chapterMap[id];
        if (ch && ch.volumeId === vol.id) {
          await EW.db.deleteChapter(id);
          book.chapterIds = book.chapterIds.filter((x) => x !== id);
          delete state.chapterMap[id];
        }
      }
      book.volumes = book.volumes.filter((v) => v.id !== vol.id);
      await EW.db.putBook(book);
      if (EW.currentChapterId && !state.chapterMap[EW.currentChapterId]) {
        EW.editor.chapter = null; EW.currentChapterId = null;
        EW.editor.bodyEl.innerHTML = ''; EW.editor.titleEl.value = '';
      }
      renderTree();
    }, { danger: true, okText: '删除' });
  }

  async function moveChapter(id, dir) {
    const book = state.book;
    const ids = book.chapterIds || [];
    const idx = ids.indexOf(id);
    const ni = idx + dir;
    if (idx === -1 || ni < 0 || ni >= ids.length) return;
    ids.splice(idx, 1); ids.splice(ni, 0, id);
    await EW.db.putBook(book);
    renderTree();
  }

  function deleteChapterFlow(ch) {
    EW.confirm('删除章节', '确定删除「' + (ch.title || '未命名章节') + '」？', async () => {
      if (EW.editor.chapter && EW.editor.chapter.id === ch.id) {
        EW.editor.chapter = null; EW.currentChapterId = null;
        EW.editor.bodyEl.innerHTML = ''; EW.editor.titleEl.value = ''; EW.editor.dirty = false;
      }
      await EW.db.deleteChapter(ch.id);
      state.book.chapterIds = state.book.chapterIds.filter((x) => x !== ch.id);
      delete state.chapterMap[ch.id];
      await EW.db.putBook(state.book);
      renderTree();
    }, { danger: true, okText: '删除' });
  }

  /* ---------- 右侧面板 ---------- */
  function setTab(tab) {
    state.tab = tab;
    if (!state.rpTabs) return;
    state.rpTabs.querySelectorAll('.rp-tab').forEach((t, i) => {
      const tabs = ['outline', 'characters', 'setting', 'timeline', 'story', 'preview', 'ai', 'stats'];
      t.classList.toggle('active', tabs[i] === tab);
    });
    renderRightTab();
  }

  function renderRightTab() {
    const body = state.rpBody;
    if (!body) return;
    const book = state.book;
    if (['outline', 'characters', 'setting', 'timeline', 'story'].includes(state.tab)) {
      EW.reference.render(state.tab, book, body);
    } else if (state.tab === 'preview') {
      renderPreviewTab(body);
    } else if (state.tab === 'ai') {
      renderAiTab(body);
    } else if (state.tab === 'stats') {
      renderStatsTab(body);
    }
  }

  function renderPreviewTab(body) {
    body.innerHTML = '';
    const phone = EW.el('div', { class: 'phone-preview' });
    const title = EW.el('div', { class: 'pv-title', text: EW.editor.chapter ? (EW.editor.chapter.title || '未命名') : '' });
    const content = EW.el('div', { class: 'pv-body', html: EW.editor.bodyEl ? EW.editor.bodyEl.innerHTML : '' });
    phone.appendChild(title);
    phone.appendChild(content);
    body.appendChild(phone);
    state.previewEl = content;
    state.previewTitleEl = title;
  }

  function renderAiTab(body) {
    body.innerHTML = '';
    const tools = EW.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;' }, [
      EW.el('button', { class: 'btn sm', text: '模型', onclick: () => EW.ai.openModelManager() }),
      EW.el('button', { class: 'btn sm', text: '提示词', onclick: () => EW.ai.openPromptManager() }),
      EW.el('button', { class: 'btn sm', text: '取名', onclick: () => EW.ai.nameGen() }),
      EW.el('button', { class: 'btn sm', text: '简介', onclick: () => EW.ai.intro() }),
    ]);
    body.appendChild(tools);
    const seg = EW.el('div', { class: 'seg', style: 'margin-bottom:10px;' }, [
      EW.el('button', { class: state.aiSub === 'chat' ? 'active' : '', text: '妙笔对话', onclick: () => { state.aiSub = 'chat'; renderAiTab(body); } }),
      EW.el('button', { class: state.aiSub === 'log' ? 'active' : '', text: '调用账本', onclick: () => { state.aiSub = 'log'; renderAiTab(body); } }),
    ]);
    body.appendChild(seg);
    if (state.aiSub === 'chat') EW.ai.renderChat(state.book, body);
    else EW.ai.renderLog(body);
  }

  function renderStatsTab(body) {
    body.innerHTML = '';
    const book = state.book;
    let bookWords = 0, bookAI = 0;
    state.chapters.forEach((c) => { bookWords += c.wordCount || 0; bookAI += c.aiCount || 0; });
    const today = EW.stats.today();
    const totals = EW.stats.totals();
    const streak = EW.stats.streak();
    const goal = EW.db.getSettings().dailyGoal || 3000;

    body.appendChild(EW.el('div', { class: 'section-title', text: '本书' }));
    body.appendChild(EW.el('div', { class: 'stats-strip', style: 'grid-template-columns:repeat(2,1fr);margin-bottom:14px;' }, [
      statBox(bookWords, '总字数'), statBox(bookAI, 'AI 生成'),
    ]));

    body.appendChild(EW.el('div', { class: 'section-title', text: '今日' }));
    const goalPct = Math.min(100, Math.round((today.hand + today.ai) / goal * 100));
    body.appendChild(EW.el('div', { class: 'card', style: 'padding:14px;margin-bottom:14px;' }, [
      EW.el('div', { style: 'display:flex;justify-content:space-between;font-size:13px;color:var(--text-soft);', text: '' }, [
        EW.el('span', { text: '手写 ' + today.hand + ' 字' }),
        EW.el('span', { text: 'AI ' + today.ai + ' 字' }),
      ]),
      EW.el('div', { style: 'font-size:28px;font-weight:700;margin:6px 0;', text: (today.hand + today.ai) + ' / ' + goal }),
      EW.el('div', { style: 'height:8px;background:var(--bg-soft);border-radius:4px;overflow:hidden;' }, [
        EW.el('div', { style: 'height:100%;width:' + goalPct + '%;background:var(--accent);' }),
      ]),
      EW.el('div', { style: 'font-size:12px;color:var(--text-soft);margin-top:6px;', text: '连续 ' + streak + ' 天 · 累计 ' + totals.total + ' 字' }),
    ]));

    body.appendChild(EW.el('div', { class: 'section-title', text: '近 14 天' }));
    const series = EW.stats.series(14);
    const max = Math.max(1, ...series.map((d) => d.hand + d.ai));
    const chart = EW.el('div', { class: 'card', style: 'padding:14px;display:flex;align-items:flex-end;gap:3px;height:140px;' });
    series.forEach((d) => {
      const v = d.hand + d.ai;
      const h = Math.max(2, Math.round(v / max * 100));
      chart.appendChild(EW.el('div', {
        title: d.label + '：' + v + ' 字',
        style: 'flex:1;background:' + (v ? 'var(--accent)' : 'var(--bg-soft)') + ';height:' + h + '%;border-radius:3px 3px 0 0;min-width:4px;',
      }));
    });
    body.appendChild(chart);
  }

  /* ---------- 返回书架 ---------- */
  function goHome() {
    if (EW.editor.chapter && EW.editor.dirty) EW.editor.save(false);
    document.getElementById('view-book').hidden = true;
    document.getElementById('view-home').hidden = false;
    document.getElementById('btn-back').hidden = true;
    document.getElementById('topbar-title').textContent = '易创写作';
    EW.currentBookId = null;
    EW.currentChapterId = null;
    state.book = null; state.chapters = []; state.chapterMap = {};
    renderHome();
  }

  EW.bookshelf = { renderHome, openBook, goHome };
})();
