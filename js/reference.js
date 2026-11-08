/* reference.js — 参考资料五件套：大纲 / 角色 / 设定 / 时间线 / 故事线 */
(function () {
  const EW = window.EW;

  function ensureRefs(book) {
    if (!book.references) book.references = { outline: '', setting: '', story: '', characters: [], timeline: [] };
    if (!book.references.characters) book.references.characters = [];
    if (!book.references.timeline) book.references.timeline = [];
    return book.references;
  }

  function persist(book) { book.updatedAt = Date.now(); EW.db.putBook(book); }

  /* 带小工具栏的富文本编辑块，返回 DOM，html 存到 book.references[key] */
  function richBlock(book, key, placeholder) {
    const refs = ensureRefs(book);
    const box = EW.el('div');
    const bar = EW.el('div', { style: 'display:flex;gap:2px;margin-bottom:6px;' });
    const ed = EW.el('div', {
      class: 'card', contenteditable: 'true',
      style: 'min-height:160px;padding:12px;line-height:1.7;font-size:14.5px;white-space:pre-wrap;',
      html: refs[key] || '',
    });
    ed.setAttribute('data-placeholder', placeholder);
    ed.style.cssText += ';color:var(--text);';
    const mk = (label, cmd, val) => EW.el('button', {
      class: 'tool-btn', text: label, dataset: { cmd: val || '' },
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { ed.focus(); if (val) document.execCommand(cmd, false, val); else document.execCommand(cmd); },
    });
    bar.appendChild(mk('B', 'bold'));
    bar.appendChild(mk('I', 'italic'));
    bar.appendChild(mk('U', 'underline'));
    bar.appendChild(mk('H2', 'formatBlock', 'h2'));
    bar.appendChild(mk('\u275D', 'formatBlock', 'blockquote'));
    box.appendChild(bar);
    box.appendChild(ed);
    const save = EW.debounce(() => { refs[key] = ed.innerHTML; persist(book); EW.emit('reference-changed'); }, 600);
    ed.addEventListener('input', save);
    return box;
  }

  function renderOutline(book, c) {
    c.appendChild(EW.el('div', { class: 'ref-head' }, [
      EW.el('div', { style: 'font-weight:700;', text: '大纲' }),
      EW.el('span', { style: 'font-size:12px;color:var(--text-soft);', text: '自动保存' }),
    ]));
    c.appendChild(richBlock(book, 'outline', '写全书大纲、卷纲、章纲……'));
  }

  function renderCharacters(book, c) {
    const refs = ensureRefs(book);
    c.appendChild(EW.el('div', { class: 'ref-head' }, [
      EW.el('div', { style: 'font-weight:700;', text: '角色' }),
      EW.el('span', { style: 'display:flex;gap:6px;align-items:center;' }, [
        EW.el('button', { class: 'btn sm', text: '关系图', onclick: () => openCharGraph(book) }),
        EW.el('button', { class: 'btn', text: '+ 新增', onclick: () => { refs.characters.push({ id: EW.uid(), name: '', desc: '' }); persist(book); draw(); } }),
      ]),
    ]));
    const list = EW.el('div');
    c.appendChild(list);

    function draw() {
      list.innerHTML = '';
      if (!refs.characters.length) list.appendChild(EW.el('p', { class: 'empty', text: '还没有角色，点“新增”添加。' }));
      refs.characters.forEach((ch) => {
        const item = EW.el('div', { class: 'card char-item' });
        const name = EW.el('input', { value: ch.name || '', placeholder: '姓名', style: 'width:100%;border:none;background:transparent;outline:none;font-weight:700;font-size:15px;' });
        const desc = EW.el('textarea', { placeholder: '身份 / 外貌 / 性格 / 关系……', style: 'width:100%;border:none;background:transparent;outline:none;resize:vertical;min-height:70px;font-size:13.5px;margin-top:6px;color:var(--text);', text: ch.desc || '' });
        const row = EW.el('div', { style: 'display:flex;gap:6px;margin-top:8px;' }, [
          EW.el('button', { class: 'btn sm danger', text: '删除', onclick: () => { refs.characters = refs.characters.filter((x) => x.id !== ch.id); persist(book); draw(); } }),
        ]);
        name.addEventListener('input', () => { ch.name = name.value; persist(book); });
        desc.addEventListener('input', () => { ch.desc = desc.value; persist(book); });
        item.appendChild(name); item.appendChild(desc); item.appendChild(row);
        list.appendChild(item);
      });
    }
    draw();
  }

  function renderSetting(book, c) {
    c.appendChild(EW.el('div', { class: 'ref-head' }, [
      EW.el('div', { style: 'font-weight:700;', text: '设定' }),
      EW.el('span', { style: 'font-size:12px;color:var(--text-soft);', text: '自动保存' }),
    ]));
    c.appendChild(richBlock(book, 'setting', '世界观、力量体系、门派、宝物……'));
  }

  function renderTimeline(book, c) {
    const refs = ensureRefs(book);
    c.appendChild(EW.el('div', { class: 'ref-head' }, [
      EW.el('div', { style: 'font-weight:700;', text: '时间线' }),
      EW.el('button', { class: 'btn', text: '+ 新增', onclick: () => { refs.timeline.push({ id: EW.uid(), time: '', desc: '' }); refs.timeline.sort((a, b) => a.time.localeCompare(b.time)); persist(book); draw(); } }),
    ]));
    const list = EW.el('div');
    c.appendChild(list);
    function draw() {
      list.innerHTML = '';
      if (!refs.timeline.length) list.appendChild(EW.el('p', { class: 'empty', text: '还没有时间线事件。' }));
      refs.timeline.forEach((t) => {
        const item = EW.el('div', { class: 'card tl-item' });
        const time = EW.el('input', { value: t.time || '', placeholder: '时间', style: 'width:70px;border:none;background:transparent;outline:none;font-weight:700;color:var(--accent);font-size:13px;' });
        const desc = EW.el('textarea', { placeholder: '事件描述', style: 'flex:1;border:none;background:transparent;outline:none;resize:vertical;min-height:40px;font-size:13.5px;color:var(--text);', text: t.desc || '' });
        const del = EW.el('button', { class: 'icon-btn', text: '\u00d7', title: '删除', onclick: () => { refs.timeline = refs.timeline.filter((x) => x.id !== t.id); persist(book); draw(); } });
        time.addEventListener('input', () => { t.time = time.value; persist(book); });
        desc.addEventListener('input', () => { t.desc = desc.value; persist(book); });
        item.appendChild(time); item.appendChild(desc); item.appendChild(del);
        list.appendChild(item);
      });
    }
    draw();
  }

  function renderStory(book, c) {
    c.appendChild(EW.el('div', { class: 'ref-head' }, [
      EW.el('div', { style: 'font-weight:700;', text: '故事线' }),
      EW.el('span', { style: 'display:flex;gap:6px;align-items:center;' }, [
        EW.el('button', { class: 'btn sm', text: '思维导图', onclick: () => openMindMap(book) }),
        EW.el('span', { style: 'font-size:12px;color:var(--text-soft);', text: '自动保存' }),
      ]),
    ]));
    c.appendChild(richBlock(book, 'story', '主线和支线、伏笔、悬念钩子……'));
  }

  function openGraphModal(title, nodes, edges, defaultLabel, onSave) {
    const mask = EW.el('div', { class: 'modal-mask', style: 'align-items:stretch;padding:0;' });
    const modal = EW.el('div', { class: 'modal', style: 'max-width:none;width:100%;height:100%;max-height:none;border-radius:0;' });
    const head = EW.el('div', { class: 'modal-head' }, [
      EW.el('div', { text: title }),
      EW.el('button', { class: 'btn sm primary', text: '完成', onclick: () => mask.remove() }),
    ]);
    const tip = EW.el('span', { style: 'font-size:12px;color:var(--text-soft);flex:1;text-align:center;' });
    const bar = EW.el('div', { style: 'display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid var(--border);align-items:center;' });
    const canvasBox = EW.el('div', { style: 'flex:1;overflow:auto;background:var(--bg-soft);' });
    modal.appendChild(head); modal.appendChild(bar); modal.appendChild(canvasBox);
    mask.appendChild(modal);
    document.getElementById('modal-root').appendChild(mask);

    const g = EW.graph.create(canvasBox, {
      nodes, edges, defaultLabel,
      onTip: (t) => { tip.textContent = t; },
      onChange: (ns, es) => onSave(ns, es),
    });

    const mkBtn = (label, fn, primary) => EW.el('button', { class: 'btn sm' + (primary ? ' primary' : ''), text: label, onclick: fn });
    bar.appendChild(mkBtn('＋ 节点', () => g.addNode()));
    bar.appendChild(mkBtn('连线', () => g.startLink()));
    bar.appendChild(mkBtn('删除', () => g.deleteSelected()));
    bar.appendChild(mkBtn('清空', () => EW.confirm('清空画布', '确定清空所有节点和连线？', () => g.clear(), { danger: true, okText: '清空' })));
    bar.appendChild(tip);
  }

  function openCharGraph(book) {
    const refs = ensureRefs(book);
    const chars = refs.characters || [];
    const pos = refs.charPos || {};
    const nodes = chars.map((c, i) => ({
      id: c.id,
      label: c.name || '未命名',
      x: pos[c.id] ? pos[c.id].x : (100 + (i % 5) * 180),
      y: pos[c.id] ? pos[c.id].y : (80 + Math.floor(i / 5) * 130),
    }));
    const edges = (refs.relationships || []).map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label }));
    openGraphModal('角色关系图', nodes, edges, '新角色', (ns, es) => {
      refs.charPos = {};
      ns.forEach((n) => {
        refs.charPos[n.id] = { x: Math.round(n.x), y: Math.round(n.y) };
        const c = chars.find((x) => x.id === n.id);
        if (c) c.name = n.label;
        else chars.push({ id: n.id, name: n.label, desc: '' });
      });
      refs.relationships = es.map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label }));
      persist(book);
    });
  }

  function openMindMap(book) {
    const refs = ensureRefs(book);
    let mm = refs.mindmap;
    if (!mm || !mm.nodes || !mm.nodes.length) {
      mm = { nodes: [{ id: EW.uid(), text: '主线', x: 700, y: 560 }], edges: [] };
    }
    const nodes = mm.nodes.map((n) => ({ id: n.id, label: n.text || '', x: n.x, y: n.y }));
    const edges = (mm.edges || []).map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label || '' }));
    openGraphModal('故事线思维导图', nodes, edges, '新主题', (ns, es) => {
      refs.mindmap = {
        nodes: ns.map((n) => ({ id: n.id, text: n.label, x: Math.round(n.x), y: Math.round(n.y) })),
        edges: es.map((e) => ({ id: e.id, from: e.from, to: e.to })),
      };
      persist(book);
    });
  }

  EW.reference = {
    render(tab, book, container) {
      container.innerHTML = '';
      if (tab === 'outline') renderOutline(book, container);
      else if (tab === 'characters') renderCharacters(book, container);
      else if (tab === 'setting') renderSetting(book, container);
      else if (tab === 'timeline') renderTimeline(book, container);
      else if (tab === 'story') renderStory(book, container);
    },
  };
})();
