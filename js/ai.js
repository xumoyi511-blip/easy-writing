/* ai.js — AI 辅助（BYOK）：OpenAI 兼容接口、模型/提示词管理、划词工具、续写、妙笔对话、调用账本 */
(function () {
  const EW = window.EW;

  const MODELS_KEY = 'ew:models';
  const PROMPTS_KEY = 'ew:prompts';
  const LOG_KEY = 'ew:aiLog';
  const CHAT_KEY_PREFIX = 'ew:chat:';

  /* ---------- 预设 ---------- */
  const PRESETS = [
    { name: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', thinking: false },
    { name: '通义千问', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', thinking: false },
    { name: 'Kimi (月之暗面)', baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', thinking: false },
    { name: '智谱 GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', thinking: false },
    { name: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', thinking: false },
    { name: 'Ollama (本地)', baseURL: 'http://localhost:11434/v1', model: 'llama3.1', thinking: false, local: true },
    { name: '自定义 (OpenAI 兼容)', baseURL: '', model: '', thinking: false },
  ];

  const SCENES = {
    polish: { label: '润色', temp: 0.6, def: '你是一位资深中文网文编辑。请对下面的文字进行润色，保持原意、人称和文风，只输出润色后的正文，不要任何解释。\n\n{{text}}' },
    expand: { label: '扩写', temp: 0.8, def: '你是一位网文作者。请扩写下面的内容，丰富动作、对话、细节与氛围，保持文风一致，只输出扩写后的正文，不要解释。\n\n{{text}}' },
    correct: { label: '纠错', temp: 0.2, def: '你是中文校对编辑。请纠正下面文字的错别字、病句和标点，只输出修改后的正文，不要解释。\n\n{{text}}' },
    continue: { label: '续写', temp: 0.9, def: '你是一位网文作者，正在续写小说。请根据下面已有的正文自然流畅地续写 300~500 字，直接输出续写内容，不要解释、不要重复原文。\n\n已有正文：\n{{text}}' },
    custom: { label: '自定义指令', temp: 0.7, def: '{{text}}' },
    nameGen: { label: '取名器', temp: 0.9, def: '你是网文取名专家。根据要求生成一批名字（人名/地名/功法名/武器名等），每行一个，只输出名字。\n\n要求：{{text}}' },
    intro: { label: '简介生成', temp: 0.8, def: '你是网文编辑。请根据作品信息写一段平台风格的简介（200 字以内），突出卖点与钩子，只输出简介正文。\n\n{{text}}' },
  };

  const CHAT_SYSTEM = '你是网文创作顾问，擅长剧情、人设、世界观设定与写作技巧。回答简洁、实用、可落地。';

  function getModels() { return EW.lsGet(MODELS_KEY, []); }
  function setModels(m) { EW.lsSet(MODELS_KEY, m); }
  function getPrompts() {
    const saved = EW.lsGet(PROMPTS_KEY, {});
    const out = {};
    for (const k in SCENES) out[k] = Object.assign({ template: SCENES[k].def, temperature: SCENES[k].temp }, saved[k]);
    return out;
  }
  function setPrompts(p) { EW.lsSet(PROMPTS_KEY, p); }
  function getLog() { return EW.lsGet(LOG_KEY, []); }
  function addLog(entry) {
    const log = getLog();
    log.unshift(entry);
    if (log.length > 500) log.length = 500;
    EW.lsSet(LOG_KEY, log);
  }
  function getDefaultModel() {
    const ms = getModels();
    return ms.find((m) => m.isDefault) || ms[0] || null;
  }
  function chatKey(bookId) { return CHAT_KEY_PREFIX + bookId; }
  function getChat(bookId) { return EW.lsGet(chatKey(bookId), []); }
  function setChat(bookId, arr) { EW.lsSet(chatKey(bookId), arr); }

  /* ---------- 核心：调用 OpenAI 兼容接口 ---------- */
  async function callChat(model, messages, opts) {
    opts = opts || {};
    const base = (model.baseURL || '').replace(/\/+$/, '');
    if (!base) throw new Error('未配置接口地址（baseURL）');
    const url = base + '/chat/completions';
    const headers = { 'Content-Type': 'application/json' };
    if (model.apiKey) headers['Authorization'] = 'Bearer ' + model.apiKey;

    const body = {
      model: model.model,
      messages,
      temperature: opts.temperature != null ? opts.temperature : (model.temperature != null ? model.temperature : 0.7),
      max_tokens: opts.maxTokens || model.maxTokens || 4096,
      stream: !!opts.stream,
    };
    if (model.thinking) body.extra_body = body.extra_body || {};

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      let msg = '';
      try { const j = await res.json(); msg = j.error && j.error.message ? j.error.message : JSON.stringify(j); } catch (e) { msg = await res.text(); }
      throw new Error('HTTP ' + res.status + '：' + msg);
    }
    if (!opts.stream) {
      const j = await res.json();
      const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      return { content: content || '', usage: j.usage };
    }
    // 流式
    return streamSSE(res, opts.onDelta);
  }

  async function streamSSE(res, onDelta) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const data = t.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const j = JSON.parse(data);
          const delta = j.choices && j.choices[0] && j.choices[0].delta;
          if (delta && delta.content) { full += delta.content; onDelta && onDelta(delta.content); }
        } catch (e) { /* ignore partial */ }
      }
    }
    return { content: full };
  }

  /* ---------- 模型管理 ---------- */
  function openModelManager() {
    const models = getModels();
    const body = EW.el('div');
    const listBox = EW.el('div');
    body.appendChild(listBox);

    function draw() {
      listBox.innerHTML = '';
      if (!models.length) listBox.appendChild(EW.el('p', { class: 'empty', text: '还没有模型。点下方“添加模型”开始，AI 功能需要自备 API Key（BYOK）。' }));
      models.forEach((m) => {
        const item = EW.el('div', { class: 'card', style: 'padding:12px;margin-bottom:10px;' }, [
          EW.el('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
            EW.el('div', { style: 'flex:1;min-width:0;' }, [
              EW.el('div', { style: 'font-weight:700;font-size:15px;', text: m.name + (m.isDefault ? '（默认）' : '') }),
              EW.el('div', { style: 'font-size:12px;color:var(--text-soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', text: m.model + ' · ' + m.baseURL }),
            ]),
          ]),
          EW.el('div', { style: 'display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;' }, [
            EW.el('button', { class: 'btn sm', text: '编辑', onclick: () => editModel(m) }),
            EW.el('button', { class: 'btn sm', text: '测试连接', onclick: () => testModel(m) }),
            EW.el('button', { class: 'btn sm', text: '设为默认', onclick: () => { models.forEach((x) => x.isDefault = false); m.isDefault = true; setModels(models); draw(); EW.toast('已设为默认模型'); } }),
            EW.el('button', { class: 'btn sm danger', text: '删除', onclick: () => { models.splice(models.indexOf(m), 1); setModels(models); draw(); } }),
          ]),
        ]);
        listBox.appendChild(item);
      });
    }

    function editModel(m) {
      const isNew = !m;
      const model = m || { id: EW.uid(), name: '', baseURL: '', apiKey: '', model: '', temperature: 0.7, maxTokens: 4096, thinking: false };
      const name = EW.el('input', { value: model.name || '', placeholder: '名称（如 DeepSeek）' });
      const presetSel = EW.el('select', {}, PRESETS.map((p) => EW.el('option', { text: p.name, value: p.name })));
      presetSel.insertBefore(EW.el('option', { text: '— 选择预设快速填充 —', value: '' }), presetSel.firstChild);
      const baseURL = EW.el('input', { value: model.baseURL || '', placeholder: 'https://api.deepseek.com/v1' });
      const apiKey = EW.el('input', { type: 'password', value: model.apiKey || '', placeholder: 'API Key（本地模型可留空）' });
      const modelName = EW.el('input', { value: model.model || '', placeholder: '模型名，如 deepseek-chat' });
      const temp = EW.el('input', { type: 'number', step: '0.1', min: '0', max: '2', value: model.temperature != null ? model.temperature : 0.7 });
      const maxTok = EW.el('input', { type: 'number', value: model.maxTokens || 4096 });
      const thinking = EW.el('input', { type: 'checkbox', checked: !!model.thinking, style: 'width:auto;margin-right:6px;' });

      presetSel.addEventListener('change', () => {
        const p = PRESETS.find((x) => x.name === presetSel.value);
        if (p) { baseURL.value = p.baseURL; modelName.value = p.model; }
      });

      const modal = EW.openModal({
        title: isNew ? '添加模型' : '编辑模型',
        body: EW.el('div', {}, [
          EW.el('div', { class: 'field' }, [EW.el('label', { text: '名称' }), name]),
          EW.el('div', { class: 'field' }, [EW.el('label', { text: '预设' }), presetSel]),
          EW.el('div', { class: 'field' }, [EW.el('label', { text: '接口地址 baseURL' }), baseURL]),
          EW.el('div', { class: 'field' }, [EW.el('label', { text: 'API Key（BYOK）' }), apiKey]),
          EW.el('div', { class: 'field' }, [EW.el('label', { text: '模型名' }), modelName]),
          EW.el('div', { style: 'display:flex;gap:12px;' }, [
            EW.el('div', { class: 'field', style: 'flex:1;' }, [EW.el('label', { text: '采样温度' }), temp]),
            EW.el('div', { class: 'field', style: 'flex:1;' }, [EW.el('label', { text: '最大输出 Tokens' }), maxTok]),
          ]),
          EW.el('div', { class: 'field' }, [EW.el('label', { style: 'display:flex;align-items:center;', text: '' }, [
            thinking, EW.el('span', { text: '思考模式（输出更长、更慢；结构化任务建议关闭）' }),
          ])]),
        ]),
        foot: EW.el('div', { style: 'display:flex;gap:10px;width:100%;' }, [
          EW.el('button', { class: 'btn', style: 'flex:1;', text: '取消', onclick: () => modal.close() }),
          EW.el('button', { class: 'btn primary', style: 'flex:1;', text: '保存', onclick: () => {
            if (!name.value.trim()) { EW.toast('请填名称'); return; }
            model.name = name.value.trim();
            model.baseURL = baseURL.value.trim();
            model.apiKey = apiKey.value.trim();
            model.model = modelName.value.trim();
            model.temperature = parseFloat(temp.value) || 0.7;
            model.maxTokens = parseInt(maxTok.value, 10) || 4096;
            model.thinking = thinking.checked;
            if (isNew) { models.push(model); if (models.length === 1) model.isDefault = true; }
            setModels(models);
            modal.close(); draw();
            EW.toast('已保存模型');
          } }),
        ]),
      });
    }

    function testModel(m) {
      EW.toast('正在测试 ' + m.name + ' …');
      callChat(m, [{ role: 'user', content: '请回复“连接成功”四个字。' }], { stream: false, maxTokens: 32 })
        .then((r) => { EW.toast('连接成功：' + (r.content || '').slice(0, 40)); addLog({ time: Date.now(), scene: '测试连接', model: m.name, chars: 0, ok: true, note: '' }); })
        .catch((e) => { EW.toast('连接失败：' + e.message); addLog({ time: Date.now(), scene: '测试连接', model: m.name, chars: 0, ok: false, note: e.message }); });
    }

    draw();
    const addBtn = EW.el('button', { class: 'btn primary block', style: 'margin-top:12px;', text: '+ 添加模型', onclick: () => editModel(null) });
    body.appendChild(addBtn);
    EW.openModal({ title: '模型管理', body });
  }

  /* ---------- 提示词管理 ---------- */
  function openPromptManager() {
    const prompts = getPrompts();
    const body = EW.el('div');
    const keys = Object.keys(SCENES);
    const seg = EW.el('div', { class: 'seg', style: 'margin-bottom:12px;flex-wrap:wrap;' });
    let cur = 'polish';
    const editorBox = EW.el('div');
    const tempInput = EW.el('input', { type: 'number', step: '0.1', min: '0', max: '2', style: 'width:100px;' });

    function drawSeg() {
      seg.innerHTML = '';
      keys.forEach((k) => {
        const b = EW.el('button', { class: cur === k ? 'active' : '', text: SCENES[k].label, onclick: () => { cur = k; drawSeg(); drawEditor(); } });
        seg.appendChild(b);
      });
    }
    function drawEditor() {
      editorBox.innerHTML = '';
      const ta = EW.el('textarea', { style: 'min-height:220px;', text: prompts[cur].template });
      tempInput.value = prompts[cur].temperature;
      editorBox.appendChild(EW.el('div', { class: 'field' }, [
        EW.el('label', { text: '提示词模板（可用 {{text}} 代表正文/选区/输入）' }), ta,
      ]));
      editorBox.appendChild(EW.el('div', { class: 'field' }, [EW.el('label', { text: '该场景采样温度' }), tempInput]));
      editorBox.appendChild(EW.el('div', { style: 'display:flex;gap:8px;' }, [
        EW.el('button', { class: 'btn sm', text: '恢复默认', onclick: () => { prompts[cur] = { template: SCENES[cur].def, temperature: SCENES[cur].temp }; setPrompts(prompts); drawEditor(); EW.toast('已恢复默认'); } }),
      ]));
      ta.addEventListener('input', () => { prompts[cur].template = ta.value; setPrompts(prompts); });
      tempInput.addEventListener('input', () => { prompts[cur].temperature = parseFloat(tempInput.value) || 0.7; setPrompts(prompts); });
    }
    drawSeg(); drawEditor();
    body.appendChild(seg);
    body.appendChild(editorBox);
    EW.openModal({ title: '提示词管理', body });
  }

  /* ---------- 获取正文/选区 ---------- */
  function editorPlain(len) {
    const html = EW.editor.bodyEl ? EW.editor.bodyEl.innerHTML : '';
    const text = EW.exporter.htmlToText(html);
    if (len) return text.slice(-len);
    return text;
  }
  function selectionText() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return '';
    const text = sel.toString();
    if (text) return text;
    return '';
  }

  function requireModel() {
    const m = getDefaultModel();
    if (!m) { openModelManager(); EW.toast('请先添加并配置模型'); return null; }
    return m;
  }

  // 记录 AI 产出：计入全局统计 + 当前章节 aiCount
  function recordAIWords(n) {
    const words = EW.countWords(n || '').words;
    if (words > 0) {
      EW.stats.addAI(words);
      if (EW.editor.chapter) EW.editor.chapter.aiCount = (EW.editor.chapter.aiCount || 0) + words;
    }
    return words;
  }

  /* ---------- 划词工具（润色/扩写/纠错/自定义） ---------- */
  function selectionTool(scene) {
    const text = selectionText();
    if (!text) { EW.toast('请先选中要处理的文字'); return; }
    const model = requireModel(); if (!model) return;
    const prompts = getPrompts();
    const template = prompts[scene] ? prompts[scene].template : SCENES[scene].def;
    const temp = prompts[scene] ? prompts[scene].temperature : SCENES[scene].temp;

    if (scene === 'custom') {
      // 自定义：先让用户输入指令
      const instr = EW.el('input', { placeholder: '输入指令，例如：把这段改成第三人称' });
      const m = EW.openModal({
        title: '自定义 AI 指令',
        body: EW.el('div', { class: 'field' }, [EW.el('label', { text: '指令（作用于选中的文字）' }), instr]),
        foot: EW.el('button', { class: 'btn primary', text: '执行', onclick: () => { const cmd = instr.value.trim(); if (!cmd) { EW.toast('请输入指令'); return; } m.close(); doTool(model, text, cmd + '\n\n{{text}}', temp, scene); } }),
      });
      return;
    }
    doTool(model, text, template, temp, scene);
  }

  function doTool(model, text, template, temp, scene) {
    const userMsg = template.replace(/\{\{text\}\}/g, text);
    const modal = EW.openModal({
      title: SCENES[scene].label + '结果',
      body: EW.el('p', { style: 'color:var(--text-soft);', text: '生成中…' }),
    });
    callChat(model, [{ role: 'user', content: userMsg }], { stream: false, temperature: temp })
      .then((r) => {
        const result = (r.content || '').trim();
        modal.querySelector('.modal-body').innerHTML = '';
        const pre = EW.el('div', { style: 'white-space:pre-wrap;line-height:1.8;max-height:48vh;overflow:auto;', text: result });
        modal.querySelector('.modal-body').appendChild(pre);
        modal.querySelector('.modal-foot') && modal.querySelector('.modal-foot').remove();
        const foot = EW.el('div', { class: 'modal-foot' }, [
          EW.el('button', { class: 'btn', text: '废弃', onclick: () => modal.close() }),
          EW.el('button', { class: 'btn primary', text: '采纳', onclick: () => { replaceSelection(result); recordAIWords(result); modal.close(); EW.toast('已采纳'); } }),
        ]);
        modal.appendChild(foot);
        addLog({ time: Date.now(), scene: SCENES[scene].label, model: model.name, chars: result.length, ok: true, note: '' });
      })
      .catch((e) => {
        modal.querySelector('.modal-body').innerHTML = '';
        modal.querySelector('.modal-body').appendChild(EW.el('p', { style: 'color:var(--danger);', text: '调用失败：' + e.message }));
        addLog({ time: Date.now(), scene: SCENES[scene].label, model: model.name, chars: 0, ok: false, note: e.message });
      });
  }

  function replaceSelection(text) {
    const sel = window.getSelection();
    if (sel.rangeCount && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const frag = range.createContextualFragment(EW.exporter.textToHtml(text));
      range.insertNode(frag);
      range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);
    } else {
      // 无选区时追加到末尾
      insertTextAtEnd(text);
    }
    EW.editor.lastWords = EW.countWords(EW.editor.bodyEl.innerHTML).words;
    EW.editor.schedule();
  }

  function insertTextAtEnd(text) {
    EW.editor.bodyEl.focus();
    const range = document.createRange();
    range.selectNodeContents(EW.editor.bodyEl);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    document.execCommand('insertText', false, text);
  }

  /* ---------- 续写（流式进正文） ---------- */
  function continueWriting() {
    const model = requireModel(); if (!model) return;
    const context = editorPlain(2000);
    if (!context.trim()) { EW.toast('先写点正文再续写'); return; }
    const prompts = getPrompts();
    const template = prompts.continue.template;
    const userMsg = template.replace(/\{\{text\}\}/g, context);

    // 光标定位到结尾
    EW.editor.bodyEl.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(EW.editor.bodyEl);
    range.collapse(false);
    sel.removeAllRanges(); sel.addRange(range);

    EW.editor.suppressInput = true;
    let inserted = '';
    EW.toast('AI 续写中…');
    const statusBackup = EW.editor.statusEl.textContent;

    callChat(model, [{ role: 'user', content: userMsg }], { stream: true, temperature: prompts.continue.temperature, onDelta: (d) => {
      inserted += d;
      document.execCommand('insertText', false, d);
      EW.editor.statusEl.textContent = 'AI 续写中… +' + inserted.length + ' 字';
    } })
      .then((r) => {
        EW.editor.suppressInput = false;
        EW.editor.lastWords = EW.countWords(EW.editor.bodyEl.innerHTML).words;
        EW.editor.schedule();
        const aiWords = recordAIWords(inserted);
        addLog({ time: Date.now(), scene: '续写', model: model.name, chars: inserted.length, ok: true, note: '' });
        EW.toast('续写完成，+ ' + aiWords + ' 字');
      })
      .catch((e) => {
        EW.editor.suppressInput = false;
        EW.toast('续写失败：' + e.message);
        addLog({ time: Date.now(), scene: '续写', model: model.name, chars: inserted.length, ok: false, note: e.message });
      });
  }

  /* ---------- 妙笔对话 ---------- */
  function renderChat(book, container) {
    container.innerHTML = '';
    const log = EW.el('div', { class: 'chat-log' });
    const ta = EW.el('textarea', { placeholder: '聊剧情、人设、设定……' });
    const sendBtn = EW.el('button', { class: 'btn primary', style: 'flex:0 0 auto;', text: '发送' });
    const clearBtn = EW.el('button', { class: 'btn sm ghost', text: '清空对话', onclick: () => { setChat(book.id, []); draw(); } });
    const head = EW.el('div', { class: 'ref-head' }, [EW.el('div', { style: 'font-weight:700;', text: '妙笔对话' }), clearBtn]);

    container.appendChild(head);
    container.appendChild(log);
    container.appendChild(EW.el('div', { class: 'chat-input' }, [ta, sendBtn]));

    function draw() {
      log.innerHTML = '';
      const msgs = getChat(book.id);
      if (!msgs.length) log.appendChild(EW.el('p', { class: 'empty', text: '跟 AI 顾问聊聊你的剧情吧。' }));
      msgs.forEach((m) => log.appendChild(EW.el('div', { class: 'msg ' + (m.role === 'user' ? 'user' : 'ai'), text: m.content })));
      log.scrollTop = log.scrollHeight;
    }

    async function send() {
      const text = ta.value.trim();
      if (!text) return;
      const model = requireModel(); if (!model) return;
      const msgs = getChat(book.id);
      msgs.push({ role: 'user', content: text });
      setChat(book.id, msgs);
      ta.value = '';
      draw();
      // 构建请求消息：system + 最近 20 条
      const apiMsgs = [{ role: 'system', content: CHAT_SYSTEM }].concat(msgs.slice(-20).map((m) => ({ role: m.role, content: m.content })));
      const aiMsg = { role: 'assistant', content: '' };
      msgs.push(aiMsg);
      setChat(book.id, msgs);
      draw();
      const aiEl = log.lastChild;
      let full = '';
      try {
        await callChat(model, apiMsgs, { stream: true, onDelta: (d) => { full += d; aiMsg.content = full; aiEl.textContent = full; log.scrollTop = log.scrollHeight; } });
        addLog({ time: Date.now(), scene: '妙笔对话', model: model.name, chars: full.length, ok: true, note: '' });
      } catch (e) {
        aiMsg.content = '（调用失败：' + e.message + '）';
        aiEl.textContent = aiMsg.content;
        addLog({ time: Date.now(), scene: '妙笔对话', model: model.name, chars: 0, ok: false, note: e.message });
      }
      setChat(book.id, msgs);
    }
    sendBtn.addEventListener('click', send);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    draw();
  }

  /* ---------- 取名器 / 简介 ---------- */
  function quickGen(scene, title) {
    const model = requireModel(); if (!model) return;
    const prompts = getPrompts();
    const input = EW.el('textarea', { placeholder: scene === 'nameGen' ? '例如：仙侠小说，主角姓林，要 20 个人名' : '例如：书名、主角、金手指、卖点……' });
    const m = EW.openModal({
      title,
      body: EW.el('div', { class: 'field' }, [EW.el('label', { text: '要求' }), input]),
      foot: EW.el('button', { class: 'btn primary', text: '生成', onclick: async () => {
        const req = input.value.trim();
        if (!req) { EW.toast('请输入要求'); return; }
        const bt = m.querySelector('.btn.primary');
        bt.disabled = true; bt.textContent = '生成中…';
        const template = prompts[scene].template;
        try {
          const r = await callChat(model, [{ role: 'user', content: template.replace(/\{\{text\}\}/g, req) }], { stream: false, temperature: prompts[scene].temperature });
          const result = (r.content || '').trim();
          const out = EW.el('textarea', { style: 'min-height:200px;', text: result });
          input.replaceWith(out);
          m.querySelector('.modal-foot').remove();
          const foot = EW.el('div', { class: 'modal-foot' }, [
            EW.el('button', { class: 'btn', text: '复制', onclick: () => { try { navigator.clipboard.writeText(result); EW.toast('已复制'); } catch (e) { EW.toast('复制失败'); } } }),
            EW.el('button', { class: 'btn primary', text: '关闭', onclick: () => m.close() }),
          ]);
          m.appendChild(foot);
          addLog({ time: Date.now(), scene: title, model: model.name, chars: result.length, ok: true, note: '' });
        } catch (e) {
          EW.toast('失败：' + e.message);
          bt.disabled = false; bt.textContent = '生成';
          addLog({ time: Date.now(), scene: title, model: model.name, chars: 0, ok: false, note: e.message });
        }
      } }),
    });
  }

  /* ---------- 调用账本 ---------- */
  function renderLog(container) {
    container.innerHTML = '';
    const log = getLog();
    const head = EW.el('div', { class: 'ref-head' }, [
      EW.el('div', { style: 'font-weight:700;', text: 'AI 调用账本' }),
      EW.el('button', { class: 'btn sm', text: '清空', onclick: () => { EW.lsSet(LOG_KEY, []); renderLog(container); } }),
    ]);
    container.appendChild(head);
    if (!log.length) container.appendChild(EW.el('p', { class: 'empty', text: '暂无调用记录。' }));
    log.forEach((e) => {
      container.appendChild(EW.el('div', { class: 'card', style: 'padding:10px 12px;margin-bottom:8px;font-size:13px;' }, [
        EW.el('div', { style: 'display:flex;justify-content:space-between;', text: '' }, [
          EW.el('span', { style: 'font-weight:600;', text: e.scene }),
          EW.el('span', { style: 'color:' + (e.ok ? 'var(--ok)' : 'var(--danger)') + ';', text: e.ok ? '成功' : '失败' }),
        ]),
        EW.el('div', { style: 'color:var(--text-soft);font-size:12px;margin-top:4px;', text: e.model + ' · ' + EW.fmtTime(e.time) + (e.chars ? ' · ' + e.chars + ' 字' : '') }),
        e.note ? EW.el('div', { style: 'color:var(--danger);font-size:12px;margin-top:4px;white-space:pre-wrap;', text: e.note }) : null,
      ]));
    });
  }

  /* ---------- 工作流一键建书 ---------- */
  function extractJSON(text) {
    if (!text) return null;
    let t = String(text).trim().replace(/```json/gi, '').replace(/```/g, '');
    const i = t.indexOf('{');
    const j = t.lastIndexOf('}');
    if (i === -1 || j === -1 || j <= i) return null;
    try { return JSON.parse(t.slice(i, j + 1)); } catch (e) { return null; }
  }

  function workflow() {
    const model = requireModel(); if (!model) return;
    const body = EW.el('div');
    const idea = EW.el('textarea', { placeholder: '一句话灵感 / 题材 / 金手指 / 目标读者……例如：都市修仙，主角重生获得签到系统，爽文。', style: 'min-height:90px;' });
    const status = EW.el('div', { style: 'font-size:13px;color:var(--text-soft);min-height:20px;margin:6px 0;' });
    const resultBox = EW.el('div');
    const genBtn = EW.el('button', { class: 'btn primary block', text: '生成书名 / 简介 / 大纲', onclick: generate });
    body.appendChild(EW.el('div', { class: 'field' }, [EW.el('label', { text: '灵感 / 设定' }), idea]));
    body.appendChild(status);
    body.appendChild(resultBox);
    body.appendChild(genBtn);
    EW.openModal({ title: '工作流一键建书', body });

    async function generate() {
      const req = idea.value.trim();
      if (!req) { EW.toast('请先输入灵感'); return; }
      genBtn.disabled = true; genBtn.textContent = '生成中…';
      status.textContent = '正在生成书名、简介与大纲…';
      const sys = '你是资深网文策划。根据用户给的灵感，只输出一个严格的 JSON（不要多余文字、不要 markdown 代码块），结构：{"title":"书名","intro":"简介","volumes":[{"title":"卷名","chapters":[{"title":"章名","summary":"15字内章纲"}]}]}。3~6 卷，每卷 5~10 章，章名简洁有钩子。';
      try {
        const r = await callChat(model, [{ role: 'system', content: sys }, { role: 'user', content: req }], { stream: false, temperature: 0.8, maxTokens: 6000 });
        const json = extractJSON(r.content);
        if (!json) throw new Error('未能解析大纲 JSON，请重试');
        status.textContent = '生成成功：' + (json.title || '');
        resultBox.innerHTML = '';
        resultBox.appendChild(renderPlan(json));
        resultBox.appendChild(EW.el('button', { class: 'btn primary block', style: 'margin-top:10px;', text: '✓ 按此创建作品', onclick: () => buildBook(json) }));
        genBtn.textContent = '重新生成'; genBtn.disabled = false;
        addLog({ time: Date.now(), scene: '工作流建书', model: model.name, chars: (r.content || '').length, ok: true, note: '' });
      } catch (e) {
        status.textContent = '失败：' + e.message;
        genBtn.disabled = false; genBtn.textContent = '重新生成';
        addLog({ time: Date.now(), scene: '工作流建书', model: model.name, chars: 0, ok: false, note: e.message });
      }
    }

    async function buildBook(json) {
      const book = EW.db.newBook(json.title || '新作品');
      book.volumes = [];
      const chs = [];
      (json.volumes || []).forEach((v) => {
        const vol = { id: EW.uid(), title: v.title || '正文' };
        book.volumes.push(vol);
        (v.chapters || []).forEach((c) => {
          const nc = EW.db.newChapter(book.id, vol.id, c.title || '');
          nc.summary = c.summary || '';
          book.chapterIds.push(nc.id);
          chs.push(nc);
        });
      });
      if (!book.volumes.length) book.volumes = [{ id: EW.uid(), title: '正文' }];
      book.references.outline = '<p>【简介】' + EW.escapeHtml(json.intro || '') + '</p>';
      for (const nc of chs) await EW.db.putChapter(nc);
      await EW.db.putBook(book);
      document.querySelectorAll('.modal-mask').forEach((mm) => mm.remove());
      EW.bookshelf.openBook(book.id);
    }
  }

  function renderPlan(json) {
    const box = EW.el('div', { class: 'card', style: 'padding:14px;max-height:40vh;overflow-y:auto;' });
    box.appendChild(EW.el('div', { style: 'font-size:18px;font-weight:700;', text: json.title || '' }));
    if (json.intro) box.appendChild(EW.el('div', { style: 'font-size:13px;color:var(--text-soft);margin:6px 0 10px;white-space:pre-wrap;', text: json.intro }));
    (json.volumes || []).forEach((v) => {
      box.appendChild(EW.el('div', { style: 'font-weight:600;margin:8px 0 4px;', text: v.title || '' }));
      (v.chapters || []).forEach((c) => {
        box.appendChild(EW.el('div', { style: 'font-size:13.5px;padding:2px 0 2px 10px;', text: (c.title || '') + (c.summary ? '　— ' + c.summary : '') }));
      });
    });
    return box;
  }

  /* ---------- AI 逐章生成正文 ---------- */
  async function autoDraft(book) {
    const model = requireModel(); if (!model) return;
    const chs = await EW.db.listChapters(book.id);
    const order = book.chapterIds || [];
    const map = {}; chs.forEach((c) => { map[c.id] = c; });
    const empty = order.map((id) => map[id]).filter((c) => c && !EW.exporter.htmlToText(c.content || '').trim());
    if (!empty.length) { EW.toast('没有空章节，无需生成'); return; }
    const body = EW.el('div');
    const bar = EW.el('div', { style: 'height:8px;background:var(--bg-soft);border-radius:4px;overflow:hidden;margin-bottom:10px;' });
    const fill = EW.el('div', { style: 'height:100%;width:0;background:var(--accent);transition:width .2s;' });
    bar.appendChild(fill);
    const status = EW.el('div', { style: 'font-size:13px;color:var(--text-soft);min-height:20px;' });
    body.appendChild(bar); body.appendChild(status);
    EW.openModal({ title: 'AI 逐章生成', body });
    const prompts = getPrompts();
    const total = empty.length;
    let done = 0;
    for (let i = 0; i < total; i++) {
      const c = empty[i];
      status.textContent = '生成中 ' + (i + 1) + '/' + total + '：' + (c.title || '未命名');
      let context = (c.summary || c.title || '') + '\n';
      const prev = i > 0 ? empty[i - 1] : null;
      if (prev) context += '上一章结尾：\n' + EW.exporter.htmlToText(prev.content || '').slice(-400);
      const userMsg = (prompts.continue.template || '').replace(/\{\{text\}\}/g, context);
      try {
        const r = await callChat(model, [{ role: 'user', content: userMsg }], { stream: false, temperature: prompts.continue.temperature, maxTokens: 1600 });
        const text = (r.content || '').trim();
        c.content = EW.exporter.textToHtml(text);
        c.wordCount = EW.countWords(text).words;
        c.aiCount = (c.aiCount || 0) + c.wordCount;
        await EW.db.putChapter(c);
        done++;
        addLog({ time: Date.now(), scene: '逐章生成', model: model.name, chars: text.length, ok: true, note: '' });
      } catch (e) {
        status.textContent = '第 ' + (i + 1) + ' 章失败：' + e.message;
        addLog({ time: Date.now(), scene: '逐章生成', model: model.name, chars: 0, ok: false, note: e.message });
        break;
      }
      fill.style.width = Math.round((i + 1) / total * 100) + '%';
    }
    status.textContent = '完成：已生成 ' + done + ' / ' + total + ' 章。';
    if (EW.currentBookId === book.id) {
      if (EW.editor.chapter && EW.editor.dirty) EW.editor.save(false);
      EW.bookshelf.openBook(book.id);
    } else {
      EW.toast('生成完成，已生成 ' + done + ' 章');
    }
  }

  /* ---------- 竞品拆书 ---------- */
  function readTxtFile() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.txt,text/plain'; input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', () => {
        const f = input.files[0]; input.remove();
        if (!f) { resolve(null); return; }
        EW.readFile(f).then(resolve).catch(() => resolve(null));
      });
      input.click();
    });
  }

  async function teardown() {
    const model = requireModel(); if (!model) return;
    const books = await EW.db.listBooks();
    const body = EW.el('div');
    const srcSel = EW.el('select');
    srcSel.appendChild(EW.el('option', { value: '__import__', text: '导入新的 TXT 文件' }));
    books.forEach((b) => srcSel.appendChild(EW.el('option', { value: b.id, text: '作品：' + b.title })));
    const nInput = EW.el('input', { type: 'number', value: '3', min: '1', max: '20' });
    body.appendChild(EW.el('div', { class: 'field' }, [EW.el('label', { text: '拆解来源' }), srcSel]));
    body.appendChild(EW.el('div', { class: 'field' }, [EW.el('label', { text: '详析章数（黄金三章建议 3）' }), nInput]));
    const m = EW.openModal({
      title: '竞品拆书',
      body,
      foot: EW.el('button', { class: 'btn primary', text: '开始拆书', onclick: start }),
    });

    async function start() {
      m.querySelector('.modal-foot').remove();
      const status = EW.el('div', { style: 'font-size:13px;color:var(--text-soft);min-height:20px;margin-top:10px;' });
      body.appendChild(status);
      let chapters;
      if (srcSel.value === '__import__') {
        const text = await readTxtFile();
        if (text == null) { EW.toast('未选择文件'); return; }
        chapters = EW.exporter.splitChapters(text).map((c, i) => ({ title: c.title || ('第' + (i + 1) + '章'), content: c.body }));
      } else {
        const book = await EW.db.getBook(srcSel.value);
        const chs = await EW.db.listChapters(srcSel.value);
        const order = book.chapterIds || []; const map = {}; chs.forEach((c) => { map[c.id] = c; });
        chapters = order.map((id) => map[id]).filter(Boolean).map((c) => ({ title: c.title || '未命名', content: EW.exporter.htmlToText(c.content || '') }));
      }
      if (!chapters.length) { EW.toast('没有章节'); return; }
      const n = Math.min(parseInt(nInput.value, 10) || 3, chapters.length);
      const reports = [];
      for (let i = 0; i < n; i++) {
        const c = chapters[i];
        status.textContent = '拆解第 ' + (i + 1) + '/' + n + ' 章：' + c.title;
        const user = '请拆解下面这章网文，输出：①剧情推进 ②节奏与爽点 ③钩子/悬念 ④卖点与亮点 ⑤可借鉴写法，每点 2~3 句。\n\n【章名】' + c.title + '\n【正文】\n' + c.content.slice(0, 3000);
        try {
          const r = await callChat(model, [{ role: 'user', content: user }], { stream: false, temperature: 0.4, maxTokens: 1200 });
          reports.push({ title: c.title, text: (r.content || '').trim() });
          addLog({ time: Date.now(), scene: '拆书', model: model.name, chars: (r.content || '').length, ok: true, note: '' });
        } catch (e) {
          reports.push({ title: c.title, text: '（失败：' + e.message + '）' });
          addLog({ time: Date.now(), scene: '拆书', model: model.name, chars: 0, ok: false, note: e.message });
        }
      }
      status.textContent = '生成全书报告…';
      let whole = '';
      try {
        const r = await callChat(model, [{ role: 'user', content: '综合以下逐章拆解，输出一份全书拆书报告：①题材定位 ②黄金三章亮点 ③整体节奏曲线 ④可复用的套路清单。\n\n' + reports.map((x) => '【' + x.title + '】\n' + x.text).join('\n\n').slice(0, 6000) }], { stream: false, temperature: 0.5, maxTokens: 1600 });
        whole = (r.content || '').trim();
      } catch (e) { whole = '（报告生成失败：' + e.message + '）'; }
      body.innerHTML = '';
      const out = EW.el('div', { class: 'card', style: 'padding:14px;' });
      out.appendChild(EW.el('div', { style: 'font-weight:700;margin-bottom:8px;', text: '全书报告' }));
      out.appendChild(EW.el('div', { style: 'white-space:pre-wrap;line-height:1.7;', text: whole }));
      reports.forEach((r) => {
        out.appendChild(EW.el('div', { style: 'font-weight:600;margin:14px 0 6px;border-top:1px solid var(--border);padding-top:12px;', text: r.title }));
        out.appendChild(EW.el('div', { style: 'white-space:pre-wrap;line-height:1.7;', text: r.text }));
      });
      body.appendChild(out);
      m.appendChild(EW.el('div', { class: 'modal-foot' }, [
        EW.el('button', { class: 'btn', text: '导出报告', onclick: () => { const txt = '=== 全书报告 ===\n' + whole + '\n\n' + reports.map((r) => '=== ' + r.title + ' ===\n' + r.text).join('\n\n'); EW.download('拆书报告.txt', '\uFEFF' + txt); } }),
        EW.el('button', { class: 'btn primary', text: '关闭', onclick: () => m.close() }),
      ]));
    }
  }

  EW.ai = {
    openModelManager, openPromptManager, selectionTool, continue: continueWriting,
    renderChat, renderLog, quickGen, requireModel, getModels, getDefaultModel,
    nameGen: () => quickGen('nameGen', '取名器'),
    intro: () => quickGen('intro', '简介生成'),
    workflow, autoDraft, teardown,
  };
})();
