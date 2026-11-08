/* db.js — 本地存储：IndexedDB（内容）+ localStorage（设置/模型/统计） */
(function () {
  const EW = window.EW;
  const DB_NAME = 'easy-writing-ipad';
  const DB_VERSION = 2;

  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('chapters')) db.createObjectStore('chapters', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function reqP(req) {
    return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  }

  async function get(store, key) { const db = await openDB(); return reqP(db.transaction(store).objectStore(store).get(key)); }
  async function put(store, val) { const db = await openDB(); return reqP(db.transaction(store, 'readwrite').objectStore(store).put(val)); }
  async function del(store, key) { const db = await openDB(); return reqP(db.transaction(store, 'readwrite').objectStore(store).delete(key)); }
  async function all(store) { const db = await openDB(); return reqP(db.transaction(store).objectStore(store).getAll()); }

  /* ---------- KV（存自定义背景图等大对象） ---------- */
  async function getKV(key) { const r = await get('kv', key); return r ? r.value : null; }
  async function setKV(key, value) { return put('kv', { key, value }); }
  async function deleteKV(key) { return del('kv', key); }

  /* ---------- Books ---------- */
  async function listBooks(includeDeleted) {
    const list = await all('books');
    if (!includeDeleted) {
      // 兼容旧数据：无 deletedAt 字段视为未删除
      const filtered = list.filter((b) => !b.deletedAt);
      filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return filtered;
    }
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return list;
  }
  async function getBook(id) { return get('books', id); }
  async function putBook(book) { book.updatedAt = Date.now(); return put('books', book); }
  async function hardDeleteBook(id) {
    const chs = await listChapters(id);
    for (const c of chs) await del('chapters', c.id);
    return del('books', id);
  }
  async function softDeleteBook(id) {
    const b = await getBook(id);
    if (b) { b.deletedAt = Date.now(); return putBook(b); }
  }
  async function restoreBook(id) {
    const b = await getBook(id);
    if (b) { b.deletedAt = 0; return putBook(b); }
  }
  // 兼容旧调用：删除即彻底删除
  async function deleteBook(id) { return hardDeleteBook(id); }

  /* ---------- Chapters ---------- */
  async function listChapters(bookId) {
    const list = await all('chapters');
    return list.filter((c) => c.bookId === bookId);
  }
  async function getChapter(id) { return get('chapters', id); }
  async function putChapter(ch) { ch.updatedAt = Date.now(); return put('chapters', ch); }
  async function deleteChapter(id) { return del('chapters', id); }

  /* ---------- Notes ---------- */
  async function listNotes() {
    const list = await all('notes');
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list;
  }
  async function putNote(note) { note.createdAt = note.createdAt || Date.now(); return put('notes', note); }
  async function deleteNote(id) { return del('notes', id); }

  /* ---------- 作品/章节默认结构 ---------- */
  function newBook(title) {
    const id = EW.uid();
    return {
      id,
      title: title || '未命名作品',
      cover: Math.floor(Math.random() * COVERS.length),
      emoji: '',
      coverImage: '',
      group: '',
      deletedAt: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      volumes: [{ id: EW.uid(), title: '正文' }],
      chapterIds: [],
      references: { outline: '', setting: '', story: '', characters: [], timeline: [] },
    };
  }
  function newChapter(bookId, volumeId, title) {
    const id = EW.uid();
    return {
      id, bookId, volumeId, title: title || '', content: '',
      wordCount: 0, aiCount: 0, versions: [],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
  }

  const COVERS = ['#4f7cff', '#7a5cff', '#0ea5a4', '#e07a2f', '#d6455d', '#2f9e6e', '#7c5cff', '#3b5bdb', '#8a5cf6', '#e64980'];

  /* ---------- 设置（localStorage） ---------- */
  const SETTINGS_KEY = 'ew:settings';
  const defaultSettings = {
    theme: 'light',
    sound: false,
    soundType: 'click',
    dailyGoal: 3000,
    fontSize: 18,
    lineHeight: 1.9,
    fontFamily: 'default',
    textColor: '',
    contentWidth: 780,
    paragraphGap: false,
    grid: false,
    background: 'none',
    focusMode: false,
    sensitive: ['卧槽', '妈的', 'fuck', 'shit'],
    autoSnapshot: true,
  };
  function getSettings() { return Object.assign({}, defaultSettings, EW.lsGet(SETTINGS_KEY, {})); }
  function setSettings(s) { EW.lsSet(SETTINGS_KEY, s); }
  function updateSettings(patch) { const s = getSettings(); Object.assign(s, patch); setSettings(s); return s; }

  EW.db = {
    listBooks, getBook, putBook, deleteBook, hardDeleteBook, softDeleteBook, restoreBook,
    listChapters, getChapter, putChapter, deleteChapter,
    listNotes, putNote, deleteNote,
    getKV, setKV, deleteKV,
    newBook, newChapter, COVERS,
    getSettings, setSettings, updateSettings,
  };
})();
