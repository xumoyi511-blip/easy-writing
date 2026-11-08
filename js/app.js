/* app.js — 入口：初始化、顶栏、主题、设置、Service Worker 注册 */
(function () {
  const EW = window.EW;

  function applyTheme(theme) {
    document.body.dataset.theme = theme || 'light';
    const colors = { light: '#f4f5f7', paper: '#efe6d5', green: '#e9f0e6', dark: '#14161c' };
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = colors[theme] || '#f4f5f7';
  }

  /* ---------- 设置弹窗 ---------- */
  function openSettings() {
    const s = EW.db.getSettings();
    const themeSel = EW.el('select', {}, [
      EW.el('option', { value: 'light', text: '无界通透（亮）' }),
      EW.el('option', { value: 'paper', text: '古韵信笺（纸）' }),
      EW.el('option', { value: 'green', text: '森系护眼（绿）' }),
      EW.el('option', { value: 'dark', text: '暗夜水墨（暗）' }),
    ]);
    themeSel.value = s.theme;
    const sound = EW.el('input', { type: 'checkbox', checked: !!s.sound, style: 'width:auto;margin-right:8px;' });
    const soundType = EW.el('select', {}, [
      EW.el('option', { value: 'click', text: '清脆' }),
      EW.el('option', { value: 'blue', text: '青轴机械' }),
      EW.el('option', { value: 'brown', text: '茶轴机械' }),
      EW.el('option', { value: 'typewriter', text: '老式打字机' }),
      EW.el('option', { value: 'bubble', text: '气泡' }),
    ]);
    soundType.value = s.soundType || 'click';
    const goal = EW.el('input', { type: 'number', min: '100', step: '100', value: s.dailyGoal || 3000 });
    const fontSize = EW.el('input', { type: 'number', min: '14', max: '26', value: s.fontSize || 18 });
    const lineHeight = EW.el('input', { type: 'number', min: '1.4', max: '2.6', step: '0.1', value: s.lineHeight || 1.9 });
    const fontFamily = EW.el('select', {}, [
      EW.el('option', { value: 'default', text: '系统默认' }),
      EW.el('option', { value: 'serif', text: '宋体（衬线）' }),
      EW.el('option', { value: 'sans', text: '黑体（无衬线）' }),
      EW.el('option', { value: 'mono', text: '等宽' }),
    ]);
    fontFamily.value = s.fontFamily || 'default';
    const textColor = EW.el('input', { type: 'color', value: s.textColor || '#23272f', style: 'width:56px;height:40px;padding:2px;' });
    const contentWidth = EW.el('select', {}, [
      EW.el('option', { value: '780', text: '窄（780px）' }),
      EW.el('option', { value: '640', text: '更窄（640px）' }),
      EW.el('option', { value: '560', text: '最窄（560px）' }),
      EW.el('option', { value: 'full', text: '满宽' }),
    ]);
    contentWidth.value = String(s.contentWidth || 780);
    const paragraphGap = EW.el('input', { type: 'checkbox', checked: !!s.paragraphGap, style: 'width:auto;margin-right:8px;' });
    const grid = EW.el('input', { type: 'checkbox', checked: !!s.grid, style: 'width:auto;margin-right:8px;' });
    const background = EW.el('select', {}, [
      EW.el('option', { value: 'none', text: '无背景' }),
      EW.el('option', { value: 'paper', text: '信笺横线' }),
      EW.el('option', { value: 'lines', text: '横线' }),
      EW.el('option', { value: 'dots', text: '点阵' }),
      EW.el('option', { value: 'custom', text: '自定义图片' }),
    ]);
    background.value = s.background || 'none';
    const sensitive = EW.el('textarea', { style: 'min-height:100px;', text: (s.sensitive || []).join('\n') });

    const m = EW.openModal({
      title: '设置',
      body: EW.el('div', {}, [
        EW.el('div', { class: 'field' }, [EW.el('label', { text: '主题' }), themeSel]),
        EW.el('div', { class: 'field' }, [EW.el('label', { style: 'display:flex;align-items:center;' }, [
          sound, EW.el('span', { text: '打字音效' }),
        ])]),
        EW.el('div', { class: 'field' }, [EW.el('label', { text: '音效类型' }), soundType]),
        EW.el('div', { style: 'display:flex;gap:12px;' }, [
          EW.el('div', { class: 'field', style: 'flex:1;' }, [EW.el('label', { text: '每日目标（字）' }), goal]),
          EW.el('div', { class: 'field', style: 'flex:1;' }, [EW.el('label', { text: '正文字号' }), fontSize]),
        ]),
        EW.el('div', { class: 'field' }, [EW.el('label', { text: '行高' }), lineHeight]),
        EW.el('div', { style: 'display:flex;gap:12px;' }, [
          EW.el('div', { class: 'field', style: 'flex:1;' }, [EW.el('label', { text: '正文字体' }), fontFamily]),
          EW.el('div', { class: 'field', style: 'flex:1;' }, [EW.el('label', { text: '文字颜色' }), textColor]),
        ]),
        EW.el('div', { class: 'field' }, [EW.el('label', { text: '正文宽度' }), contentWidth]),
        EW.el('div', { class: 'field' }, [EW.el('label', { style: 'display:flex;align-items:center;' }, [
          paragraphGap, EW.el('span', { text: '段间空行' }),
        ])]),
        EW.el('div', { class: 'field' }, [EW.el('label', { style: 'display:flex;align-items:center;' }, [
          grid, EW.el('span', { text: '网格线背景' }),
        ])]),
        EW.el('div', { class: 'field' }, [EW.el('label', { text: '写作背景' }), background,
          EW.el('button', { class: 'btn sm', style: 'margin-top:6px;', text: '上传自定义背景图', onclick: () => EW.pickImage((url) => { EW.db.setKV('customBg', url); background.value = 'custom'; EW.toast('背景图已保存'); }, 1280) }),
        ]),
        EW.el('div', { class: 'field' }, [EW.el('label', { text: '敏感词（每行一个，本地检测用）' }), sensitive]),
        EW.el('div', { class: 'divider' }),
        EW.el('div', { class: 'field' }, [EW.el('label', { text: '数据' }),
          EW.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' }, [
            EW.el('button', { class: 'btn sm', text: '导出全部数据', onclick: () => { m.close(); exportAllFromSettings(); } }),
            EW.el('button', { class: 'btn sm danger', text: '清空所有数据', onclick: () => clearAllData(m) }),
          ]),
        ]),
      ]),
      foot: EW.el('div', { style: 'display:flex;gap:10px;width:100%;' }, [
        EW.el('button', { class: 'btn', style: 'flex:1;', text: '取消', onclick: () => m.close() }),
        EW.el('button', { class: 'btn primary', style: 'flex:1;', text: '保存', onclick: () => {
          const patch = {
            theme: themeSel.value,
            sound: sound.checked,
            soundType: soundType.value,
            dailyGoal: parseInt(goal.value, 10) || 3000,
            fontSize: parseInt(fontSize.value, 10) || 18,
            lineHeight: parseFloat(lineHeight.value) || 1.9,
            fontFamily: fontFamily.value,
            textColor: textColor.value,
            contentWidth: contentWidth.value === 'full' ? 'full' : parseInt(contentWidth.value, 10),
            paragraphGap: paragraphGap.checked,
            grid: grid.checked,
            background: background.value,
            sensitive: sensitive.value.split('\n').map((x) => x.trim()).filter(Boolean),
          };
          EW.db.updateSettings(patch);
          applyTheme(patch.theme);
          if (EW.editor && EW.editor.applyFont) EW.editor.applyFont();
          m.close();
          EW.toast('设置已保存');
        } }),
      ]),
    });
  }

  async function exportAllFromSettings() {
    const books = await EW.db.listBooks();
    const chapters = await EW.db.listChapters();
    EW.download('易创备份.json', JSON.stringify({ app: 'easy-writing-ipad', version: EW.version, books, chapters }, null, 2), 'application/json');
    EW.toast('已导出全部作品');
  }

  function clearAllData(m) {
    EW.confirm('清空所有数据', '将删除所有作品、章节、灵感与设置，且不可恢复。建议先导出备份。', async () => {
      const books = await EW.db.listBooks();
      for (const b of books) await EW.db.deleteBook(b.id);
      const notes = await EW.db.listNotes();
      for (const n of notes) await EW.db.deleteNote(n.id);
      ['ew:settings', 'ew:models', 'ew:prompts', 'ew:aiLog', 'ew:stats'].forEach((k) => localStorage.removeItem(k));
      applyTheme('light');
      m.close();
      EW.toast('已清空');
      EW.bookshelf.renderHome();
    }, { danger: true, okText: '清空' });
  }

  /* ---------- 初始化 ---------- */
  function init() {
    const s = EW.db.getSettings();
    applyTheme(s.theme);

    document.getElementById('btn-back').addEventListener('click', () => EW.bookshelf.goHome());
    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('btn-quick-note').addEventListener('click', () => EW.openQuickNote());

    // 注册 Service Worker（需 HTTPS 或 localhost）
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    EW.bookshelf.renderHome();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
