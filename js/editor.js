/* editor.js — 富文本编辑器：工具栏、自动保存、历史版本、查找替换、字数追踪、音效、专注模式 */
(function () {
  const EW = window.EW;

  /* 极简事件总线 */
  EW._ev = EW._ev || {};
  EW.on = (k, fn) => { (EW._ev[k] = EW._ev[k] || []).push(fn); };
  EW.emit = (k, ...a) => (EW._ev[k] || []).forEach((f) => f(...a));

  const editor = {
    chapter: null,       // 当前章节对象（内存）
    dirty: false,
    lastWords: 0,
    snapshotTimer: null,
    suppressInput: false, // AI 插入时禁止把手动计数
    root: null, titleEl: null, bodyEl: null, statusEl: null, toolbarEl: null,
  };
  EW.editor = editor;

  /* ---------- 音效 ---------- */
  let audioCtx = null;
  let noiseBuf = null;
  function ac() { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
  function noise() {
    if (!noiseBuf) {
      const c = ac(); const len = Math.floor(c.sampleRate * 0.08);
      noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    return noiseBuf;
  }
  function tone(freq, type, vol, dur, when) {
    const c = ac(); const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(c.destination); o.start(when); o.stop(when + dur);
  }
  function noiseBurst(vol, dur, when, freq, hp) {
    const c = ac(); const src = c.createBufferSource(); src.buffer = noise();
    const g = c.createGain(); const f = c.createBiquadFilter();
    f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = freq || 400;
    g.gain.setValueAtTime(vol, when); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(when); src.stop(when + dur);
  }
  EW.sound = {
    play() {
      const s = EW.db.getSettings();
      if (!s.sound) return;
      try {
        const t = ac().currentTime; const type = s.soundType || 'click';
        if (type === 'blue') { noiseBurst(0.12, 0.03, t, 2500, true); tone(2100, 'square', 0.05, 0.03, t); }
        else if (type === 'brown') { noiseBurst(0.10, 0.04, t, 1200); tone(700, 'square', 0.04, 0.04, t); }
        else if (type === 'typewriter') { tone(1400, 'square', 0.05, 0.02, t); noiseBurst(0.06, 0.02, t, 1500, true); }
        else if (type === 'bubble') { tone(600 + Math.random() * 200, 'sine', 0.08, 0.06, t); }
        else { tone(1200 + Math.random() * 300, 'triangle', 0.08, 0.05, t); }
      } catch (e) { /* ignore */ }
    },
  };

  /* ---------- 构建编辑器 ---------- */
  editor.create = function (col) {
    editor.root = col;

    // 工具栏
    editor.toolbarEl = EW.el('div', { class: 'editor-toolbar' });
    const B = (label, cmd, title, cls) => EW.el('button', {
      class: 'tool-btn' + (cls ? ' ' + cls : ''), text: label, title,
      dataset: { cmd }, onmousedown: (e) => e.preventDefault(),
      onclick: () => execCmd(cmd),
    });
    const T = (label, action, title) => EW.el('button', {
      class: 'tool-btn', text: label, title, dataset: { action },
      onmousedown: (e) => e.preventDefault(),
      onclick: () => runAction(action),
    });

    editor.toolbarEl.appendChild(B('\u21A9', 'undo', '撤销'));
    editor.toolbarEl.appendChild(B('\u21AA', 'redo', '重做'));
    editor.toolbarEl.appendChild(sep());
    editor.toolbarEl.appendChild(B('B', 'bold', '加粗'));
    editor.toolbarEl.appendChild(B('I', 'italic', '斜体'));
    editor.toolbarEl.appendChild(B('U', 'underline', '下划线'));
    editor.toolbarEl.appendChild(B('S', 'strikeThrough', '删除线'));
    editor.toolbarEl.appendChild(sep());
    editor.toolbarEl.appendChild(B('H2', 'formatBlock', '标题 2', 'fmt-h2'));
    editor.toolbarEl.appendChild(B('H3', 'formatBlock', '标题 3', 'fmt-h3'));
    editor.toolbarEl.appendChild(B('\u275D', 'formatBlock', '引用', 'fmt-quote'));
    editor.toolbarEl.appendChild(B('\u2022', 'insertUnorderedList', '无序列表'));
    editor.toolbarEl.appendChild(B('1.', 'insertOrderedList', '有序列表'));
    editor.toolbarEl.appendChild(sep());
    editor.toolbarEl.appendChild(B('\u2261', 'justifyLeft', '左对齐'));
    editor.toolbarEl.appendChild(B('\u2261', 'justifyCenter', '居中'));
    editor.toolbarEl.appendChild(B('\u2261', 'justifyRight', '右对齐'));
    editor.toolbarEl.appendChild(sep());
    editor.toolbarEl.appendChild(T('\u2315', 'search', '查找替换'));
    editor.toolbarEl.appendChild(T('\u23F1', 'versions', '历史版本'));
    editor.toolbarEl.appendChild(T('\u26F6', 'focus', '专注模式'));
    editor.toolbarEl.appendChild(T('预览', 'preview', '手机阅读预览'));
    editor.toolbarEl.appendChild(T('自爆', 'bomb', '自爆挑战：停止输入倒计时'));
    editor.toolbarEl.appendChild(sep());
    editor.toolbarEl.appendChild(T('续写', 'continue', 'AI 续写'));
    editor.toolbarEl.appendChild(T('润色', 'polish', 'AI 润色选中文字'));
    editor.toolbarEl.appendChild(T('扩写', 'expand', 'AI 扩写选中文字'));
    editor.toolbarEl.appendChild(T('纠错', 'correct', 'AI 纠错选中文字'));
    editor.toolbarEl.appendChild(T('自定义', 'custom', 'AI 自定义指令（作用于选中文字）'));
    col.appendChild(editor.toolbarEl);

    // 编辑区
    const scroll = EW.el('div', { class: 'editor-scroll' });
    editor.scrollEl = scroll;
    const meta = EW.el('div', { class: 'editor-meta' });
    editor.titleEl = EW.el('input', { class: 'ch-title-input', placeholder: '章节标题' });
    meta.appendChild(editor.titleEl);
    scroll.appendChild(meta);

    editor.bodyEl = EW.el('div', {
      class: 'editor-body', contenteditable: 'true',
      'data-placeholder': '开始写作……',
    });
    scroll.appendChild(editor.bodyEl);
    col.appendChild(scroll);

    // 底部状态
    const footer = EW.el('div', { class: 'editor-footer' });
    editor.statusEl = EW.el('span', { text: '' });
    const spacer = EW.el('span', { class: 'spacer' });
    editor.saveBtn = EW.el('button', { class: 'btn sm', text: '保存', onclick: () => editor.save(true) });
    footer.appendChild(editor.statusEl);
    footer.appendChild(spacer);
    footer.appendChild(editor.saveBtn);
    col.appendChild(footer);

    bindEditorEvents();
    ensureGlobalBindings();
    applyFont();
  };

  function sep() { return EW.el('span', { class: 'tool-sep' }); }

  function execCmd(cmd) {
    editor.bodyEl.focus();
    if (cmd === 'formatBlock') return; // 由 class 决定，见下
    document.execCommand(cmd, false, null);
    editor.schedule();
    updateToolbarState();
  }
  // formatBlock 需要参数
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.tool-btn[data-cmd="formatBlock"]');
    if (!btn || !editor.bodyEl) return;
    editor.bodyEl.focus();
    const val = btn.classList.contains('fmt-h2') ? 'h2' : btn.classList.contains('fmt-h3') ? 'h3' : btn.classList.contains('fmt-quote') ? 'blockquote' : 'p';
    document.execCommand('formatBlock', false, val);
    editor.schedule();
    updateToolbarState();
  });

  function runAction(action) {
    if (action === 'focus') return editor.toggleFocus();
    if (action === 'versions') return editor.openVersions();
    if (action === 'search') return editor.openSearch();
    if (action === 'preview') return EW.emit('toggle-preview');
    if (action === 'bomb') return editor.startBomb();
    // AI 动作交给 ai.js
    if (action === 'continue') return EW.ai && EW.ai.continue();
    if (action === 'polish') return EW.ai && EW.ai.selectionTool('polish');
    if (action === 'expand') return EW.ai && EW.ai.selectionTool('expand');
    if (action === 'correct') return EW.ai && EW.ai.selectionTool('correct');
    if (action === 'custom') return EW.ai && EW.ai.selectionTool('custom');
  }

  /* ---------- 事件绑定 ---------- */
  function bindEditorEvents() {
    editor.titleEl.addEventListener('input', () => editor.schedule());
    editor.bodyEl.addEventListener('input', () => {
      if (editor.suppressInput) return;
      EW.sound.play();
      const w = EW.countWords(editor.bodyEl.innerHTML).words;
      const delta = w - editor.lastWords;
      if (delta > 0) EW.stats.addHand(delta);
      editor.lastWords = w;
      editor.schedule();
      updateToolbarState();
      EW.emit('editor-update');
    });
  }

  let globalBound = false;
  function ensureGlobalBindings() {
    if (globalBound) return;
    globalBound = true;
    document.addEventListener('selectionchange', () => {
      if (editor.bodyEl && document.activeElement === editor.bodyEl) updateToolbarState();
    });
    window.addEventListener('beforeunload', () => { if (editor.dirty) editor.save(false); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && editor.dirty) editor.save(false); });
    setInterval(() => { if (editor.dirty) editor.commitVersion(); }, 120000);
  }

  /* ---------- 加载章节 ---------- */
  editor.load = function (chapter) {
    if (editor.chapter && editor.dirty) editor.save(false);
    editor.chapter = chapter;
    editor.dirty = false;
    editor.titleEl.value = chapter.title || '';
    editor.bodyEl.innerHTML = chapter.content || '';
    editor.lastWords = EW.countWords(chapter.content || '').words;
    updateStatus();
    updateToolbarState();
    editor.bodyEl.focus();
  };

  /* ---------- 保存 ---------- */
  editor.save = function (showToast) {
    if (!editor.chapter) return;
    const ch = editor.chapter;
    const prevContent = ch.content;
    ch.title = editor.titleEl.value;
    ch.content = editor.bodyEl.innerHTML;
    ch.wordCount = EW.countWords(ch.content).words;
    editor.dirty = false;
    EW.db.putChapter(ch).then(() => {
      if (prevContent !== ch.content) EW.emit('chapter-content-changed');
      updateStatus();
      EW.emit('chapter-saved', ch);
      if (showToast) EW.toast('已保存');
    });
  };
  editor.schedule = function () {
    editor.dirty = true;
    updateStatus();
    clearTimeout(editor._saveTimer);
    editor._saveTimer = setTimeout(() => editor.save(false), 500);
  };
  editor.markDirty = editor.schedule;

  function updateStatus() {
    if (!editor.chapter) { editor.statusEl.textContent = ''; return; }
    const w = EW.countWords(editor.bodyEl.innerHTML).words;
    const s = editor.dirty ? '● 未保存' : '已保存';
    editor.statusEl.textContent = `${w} 字 · ${s}`;
  }

  /* ---------- 历史版本 ---------- */
  editor.commitVersion = function () {
    if (!editor.chapter) return;
    const ch = editor.chapter;
    const content = editor.bodyEl.innerHTML;
    const words = EW.countWords(content).words;
    ch.title = editor.titleEl.value;
    ch.content = content;
    ch.wordCount = words;
    if (!ch.versions) ch.versions = [];
    const last = ch.versions[0];
    if (!last || last.content !== content) {
      ch.versions.unshift({ time: Date.now(), content, words });
      if (ch.versions.length > 30) ch.versions.length = 30;
    }
    EW.db.putChapter(ch);
    editor.dirty = false;
    updateStatus();
  };

  editor.openVersions = function () {
    if (!editor.chapter) return;
    const ch = editor.chapter;
    const list = (ch.versions || []).slice();
    const body = EW.el('div');
    if (!list.length) body.appendChild(EW.el('p', { class: 'empty', text: '暂无历史版本。切换章节或保存时会自动留档。' }));
    list.forEach((v, i) => {
      const item = EW.el('div', { class: 'card', style: 'padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:10px;' }, [
        EW.el('div', { style: 'flex:1;' }, [
          EW.el('div', { style: 'font-size:14px;', text: `${v.words} 字` }),
          EW.el('div', { style: 'font-size:12px;color:var(--text-soft);', text: EW.fmtTime(v.time) }),
        ]),
        EW.el('button', { class: 'btn sm', text: '预览', onclick: () => previewVersion(v) }),
        EW.el('button', { class: 'btn sm primary', text: '恢复', onclick: () => restoreVersion(v) }),
      ]);
      body.appendChild(item);
    });
    const modal = EW.openModal({ title: '历史版本 · ' + (ch.title || '未命名'), body });

    function previewVersion(v) {
      EW.openModal({
        title: '版本预览（' + EW.fmtTime(v.time) + '）',
        body: EW.el('div', { style: 'white-space:pre-wrap;line-height:1.8;', html: v.content }),
        foot: EW.el('button', { class: 'btn', text: '关闭', onclick: function () { this.closest('.modal').close(); } }),
      });
    }
    function restoreVersion(v) {
      EW.confirm('恢复此版本？', '当前内容会被该版本覆盖。', () => {
        editor.bodyEl.innerHTML = v.content;
        editor.lastWords = EW.countWords(v.content).words;
        editor.schedule();
        modal.close();
        EW.toast('已恢复');
      });
    }
  };

  /* ---------- 查找替换 ---------- */
  editor.openSearch = function () {
    const findInput = EW.el('input', { placeholder: '查找内容', value: EW._lastFind || '' });
    const repInput = EW.el('input', { placeholder: '替换为（可选）' });
    const info = EW.el('div', { style: 'font-size:12px;color:var(--text-soft);margin-top:6px;', text: '' });

    function countMatches(q) {
      if (!q) return 0;
      const text = editor.bodyEl.textContent;
      let c = 0, idx = text.indexOf(q);
      while (idx !== -1) { c++; idx = text.indexOf(q, idx + q.length); }
      return c;
    }
    function findNext() {
      const q = findInput.value;
      if (!q) { EW.toast('请输入查找内容'); return; }
      EW._lastFind = q;
      const sel = window.getSelection();
      let startNode = editor.bodyEl, startOff = 0;
      if (sel.rangeCount && editor.bodyEl.contains(sel.anchorNode)) {
        startNode = sel.anchorNode; startOff = sel.anchorOffset + q.length;
      }
      const found = findRange(startNode, startOff, q);
      if (found) {
        sel.removeAllRanges(); sel.addRange(found);
        const r = found.getBoundingClientRect();
        editor.bodyEl.parentElement.scrollTop += r.top - 120;
        info.textContent = `匹配 ${countMatches(q)} 处`;
      } else {
        info.textContent = '已到末尾，共 ' + countMatches(q) + ' 处';
        EW.toast('未找到更多');
      }
    }
    function replaceOne() {
      const q = findInput.value, r = repInput.value;
      if (!q) { EW.toast('请输入查找内容'); return; }
      const sel = window.getSelection();
      if (sel.rangeCount && sel.toString() === q) {
        const range = sel.getRangeAt(0);
        range.deleteContents(); range.insertNode(document.createTextNode(r));
        range.collapse(false); sel.removeAllRanges(); sel.addRange(range);
        editor.schedule();
        info.textContent = '已替换 1 处';
      } else { findNext(); }
    }
    function replaceAll() {
      const q = findInput.value, r = repInput.value;
      if (!q) { EW.toast('请输入查找内容'); return; }
      const before = countMatches(q);
      if (!before) { EW.toast('没有可替换的内容'); return; }
      const nodes = textNodes(editor.bodyEl);
      let done = 0;
      nodes.forEach((n) => { if (n.nodeValue.indexOf(q) !== -1) { done += (n.nodeValue.match(new RegExp(esc(q), 'g')) || []).length; n.nodeValue = n.nodeValue.split(q).join(r); } });
      editor.lastWords = EW.countWords(editor.bodyEl.innerHTML).words;
      editor.schedule();
      info.textContent = `已替换 ${done} 处`;
    }

    const body = EW.el('div', {}, [
      EW.el('div', { class: 'field' }, [EW.el('label', { text: '查找' }), findInput]),
      EW.el('div', { class: 'field' }, [EW.el('label', { text: '替换为' }), repInput]),
      EW.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;' }, [
        EW.el('button', { class: 'btn sm primary', text: '查找下一个', onclick: findNext }),
        EW.el('button', { class: 'btn sm', text: '替换', onclick: replaceOne }),
        EW.el('button', { class: 'btn sm', text: '全部替换', onclick: replaceAll }),
      ]),
      info,
    ]);
    EW.openModal({ title: '查找替换', body });
    findInput.focus();
  };

  function textNodes(node) {
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 3) { if (n.nodeValue) out.push(n); return; }
      for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
    };
    walk(node);
    return out;
  }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function findRange(startNode, startOff, q) {
    const walker = document.createTreeWalker(editor.bodyEl, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      let idx = (node === startNode) ? node.nodeValue.indexOf(q, startOff) : node.nodeValue.indexOf(q);
      if (idx !== -1) {
        const range = document.createRange();
        range.setStart(node, idx); range.setEnd(node, idx + q.length);
        return range;
      }
      node = walker.nextNode();
    }
    return null;
  }

  /* ---------- 工具栏状态 ---------- */
  function updateToolbarState() {
    if (!editor.toolbarEl) return;
    editor.toolbarEl.querySelectorAll('[data-cmd]').forEach((b) => {
      let active = false;
      try { active = document.queryCommandState(b.dataset.cmd) || document.queryCommandValue(b.dataset.cmd) === b.dataset.cmd; } catch (e) {}
      b.classList.toggle('active', active && b.dataset.cmd !== 'undo' && b.dataset.cmd !== 'redo');
    });
  }

  /* ---------- 字体/排版 ---------- */
  function applyFont() {
    const s = EW.db.getSettings();
    editor.bodyEl.style.fontSize = (s.fontSize || 18) + 'px';
    editor.bodyEl.style.lineHeight = s.lineHeight || 1.9;
    editor.bodyEl.style.color = s.textColor || '';
    document.body.dataset.font = s.fontFamily || 'default';
    document.body.classList.toggle('par-gap', !!s.paragraphGap);
    document.body.classList.toggle('grid-on', !!s.grid);
    const w = s.contentWidth || 780;
    document.querySelectorAll('.editor-meta, .editor-body').forEach((el) => { el.style.maxWidth = (w === 'full' ? '100%' : w + 'px'); });
    applyBackground();
  }
  const BACKGROUNDS = {
    none: '',
    paper: 'repeating-linear-gradient(to bottom, transparent, transparent 27px, rgba(120,100,60,.06) 28px)',
    lines: 'repeating-linear-gradient(to bottom, transparent, transparent 29px, rgba(90,90,120,.09) 29px, rgba(90,90,120,.09) 30px)',
    dots: 'radial-gradient(rgba(90,90,120,.12) 1px, transparent 1px)',
  };
  function applyBackground() {
    const s = EW.db.getSettings();
    const bg = s.background || 'none';
    if (bg === 'custom') {
      EW.db.getKV('customBg').then((url) => {
        if (url) { editor.bodyEl.style.backgroundImage = 'url(' + url + ')'; editor.bodyEl.style.backgroundSize = 'cover'; editor.bodyEl.style.backgroundPosition = 'center'; }
      });
    } else {
      editor.bodyEl.style.backgroundImage = BACKGROUNDS[bg] || '';
      editor.bodyEl.style.backgroundSize = bg === 'dots' ? '14px 14px' : '';
      editor.bodyEl.style.backgroundPosition = '';
    }
  }
  editor.applyFont = applyFont;

  /* ---------- 专注模式 ---------- */
  editor.toggleFocus = function () {
    document.body.classList.toggle('focus-mode');
    const on = document.body.classList.contains('focus-mode');
    EW.db.updateSettings({ focusMode: on });
    EW.toast(on ? '专注模式已开启' : '已退出专注模式');
  };

  /* ---------- 自爆挑战 ---------- */
  let bombCleanup = null;
  editor.startBomb = function () {
    EW.promptText('自爆挑战', '60', (sec) => {
      const n = parseInt(sec, 10);
      if (!n || n <= 0) { EW.toast('请输入秒数'); return; }
      editor.stopBomb();
      runBomb(n);
    }, '停止输入多少秒则挑战失败（秒）');
  };
  editor.stopBomb = function () { if (bombCleanup) { bombCleanup(); bombCleanup = null; } };
  function runBomb(sec) {
    let left = sec;
    const bar = EW.el('div', { class: 'bomb-bar' }, [
      EW.el('span', { text: '⏱ 自爆挑战' }),
      EW.el('span', { class: 'num', text: String(left) }),
      EW.el('button', { class: 'btn sm', text: '结束', onclick: () => editor.stopBomb() }),
    ]);
    document.body.appendChild(bar);
    const reset = () => { left = sec; bar.querySelector('.num').textContent = String(left); bar.classList.remove('warn'); };
    editor.bodyEl.addEventListener('input', reset);
    const timer = setInterval(() => {
      left--;
      bar.querySelector('.num').textContent = String(left);
      bar.classList.toggle('warn', left <= 10);
      if (left <= 0) {
        editor.stopBomb();
        try { if (navigator.vibrate) navigator.vibrate([200, 80, 200]); } catch (e) {}
        EW.toast('💥 自爆失败！坚持写作，别停下。');
      }
    }, 1000);
    bombCleanup = () => { clearInterval(timer); editor.bodyEl.removeEventListener('input', reset); bar.remove(); };
  }

  const focusCss = document.createElement('style');
  focusCss.textContent = `
    body.focus-mode .topbar { display: none; }
    body.focus-mode .sidebar { display: none; }
    body.focus-mode .right-panel { display: none; }
    body.focus-mode .panel-toggle { display: none; }
    body.focus-mode .editor-toolbar { opacity: .25; }
    body.focus-mode .editor-toolbar:hover { opacity: 1; }
  `;
  document.head.appendChild(focusCss);
})();
