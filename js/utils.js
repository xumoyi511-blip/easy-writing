/* utils.js — 全局命名空间与通用工具 */
(function () {
  const EW = {
    version: '1.0.0',
    // 当前打开的书 ID / 章节 ID / 视图状态
    currentBookId: null,
    currentChapterId: null,
    // 各模块会挂载到 EW 上
  };
  window.EW = EW;

  /* ---------- 基础 ---------- */
  EW.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  EW.escapeHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  EW.el = function (tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'dataset') Object.assign(node.dataset, attrs[k]);
        else if (k.startsWith('on') && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2), attrs[k]);
        } else node.setAttribute(k, attrs[k]);
      }
    }
    if (children != null) {
      const arr = Array.isArray(children) ? children : [children];
      arr.forEach((c) => {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  };

  EW.debounce = function (fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  };

  EW.throttle = function (fn, ms) {
    let last = 0, t;
    return function (...args) {
      const now = Date.now();
      if (now - last >= ms) { last = now; fn.apply(this, args); }
      else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn.apply(this, args); }, ms - (now - last)); }
    };
  };

  /* ---------- 日期 ---------- */
  EW.today = function () {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  EW.fmtTime = function (ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  /* ---------- 字数统计（网文口径） ---------- */
  // 中文字符 + 连续字母/数字串算作词；返回 { 字数, 字符数 }
  EW.countWords = function (text) {
    if (!text) return { words: 0, chars: 0 };
    const plain = text.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    const cjk = (plain.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const latin = (plain.match(/[A-Za-z0-9]+/g) || []).length;
    const words = cjk + latin;
    const chars = text.replace(/<[^>]+>/g, '').length;
    return { words, chars };
  };

  /* ---------- Toast ---------- */
  EW.toast = function (msg, ms) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(EW._toastTimer);
    EW._toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2200);
  };

  /* ---------- 弹窗 ---------- */
  // options: { title, body(node|html), foot(node|html), onClose }
  EW.openModal = function (options) {
    const root = document.getElementById('modal-root');
    const mask = EW.el('div', { class: 'modal-mask' });
    const modal = EW.el('div', { class: 'modal' });
    const head = EW.el('div', { class: 'modal-head' }, [
      EW.el('div', { text: options.title || '' }),
      EW.el('button', { class: 'close', text: '\u00d7', onclick: close }),
    ]);
    modal.appendChild(head);
    const body = EW.el('div', { class: 'modal-body' });
    if (options.body) {
      if (typeof options.body === 'string') body.innerHTML = options.body;
      else body.appendChild(options.body);
    }
    modal.appendChild(body);
    if (options.foot) {
      const foot = EW.el('div', { class: 'modal-foot' });
      if (typeof options.foot === 'string') foot.innerHTML = options.foot;
      else foot.appendChild(options.foot);
      modal.appendChild(foot);
    }
    mask.appendChild(modal);
    root.appendChild(mask);
    function close() { mask.remove(); if (options.onClose) options.onClose(); }
    mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
    // 把关闭函数挂到弹窗上，供 foot 按钮调用
    modal.close = close;
    return modal;
  };

  EW.confirm = function (title, text, onOk, opts) {
    opts = opts || {};
    const modal = EW.openModal({
      title,
      body: EW.el('p', { style: 'margin:0;color:var(--text-soft);white-space:pre-wrap;', text }),
      foot: EW.el('div', { style: 'display:flex;gap:10px;width:100%;' }, [
        EW.el('button', { class: 'btn', style: 'flex:1;', text: '取消', onclick: () => modal.close() }),
        EW.el('button', {
          class: 'btn ' + (opts.danger ? 'danger' : 'primary'), style: 'flex:1;', text: opts.okText || '确定',
          onclick: () => { modal.close(); onOk(); },
        }),
      ]),
    });
  };

  /* ---------- 文件读取 ---------- */
  EW.readFile = function (file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsText(file, 'utf-8');
    });
  };

  EW.download = function (filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  };

  /* ---------- localStorage 安全读写 ---------- */
  EW.lsGet = function (key, def) {
    try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); }
    catch (e) { return def; }
  };
  EW.lsSet = function (key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { EW.toast('存储空间不足：' + e.message); }
  };

  /* ---------- 选择并压缩图片，回调 dataURL ---------- */
  EW.pickImage = function (cb, maxW) {
    maxW = maxW || 640;
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
  };
})();
