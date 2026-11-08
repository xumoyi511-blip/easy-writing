/* stats.js — 码字统计：按天记录手写/AI 字数，目标、连续天数、趋势 */
(function () {
  const EW = window.EW;
  const KEY = 'ew:stats';

  function read() { return EW.lsGet(KEY, {}); }
  function write(s) { EW.lsSet(KEY, s); }
  function dayEntry(date) {
    const s = read();
    return s[date] || { hand: 0, ai: 0 };
  }
  function setDay(date, entry) {
    const s = read();
    s[date] = entry;
    write(s);
  }

  function add(date, field, n) {
    n = Math.max(0, Math.round(n || 0));
    if (!n) return;
    const s = read();
    const e = s[date] || { hand: 0, ai: 0 };
    e[field] += n;
    s[date] = e;
    write(s);
  }

  EW.stats = {
    addHand(n) { add(EW.today(), 'hand', n); },
    addAI(n) { add(EW.today(), 'ai', n); },
    today() { return dayEntry(EW.today()); },
    totals() {
      const s = read();
      let hand = 0, ai = 0;
      for (const d in s) { hand += s[d].hand || 0; ai += s[d].ai || 0; }
      return { hand, ai, total: hand + ai };
    },
    series(days) {
      const out = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        const e = dayEntry(key);
        out.push({ date: key, hand: e.hand, ai: e.ai, label: (d.getMonth() + 1) + '/' + d.getDate() });
      }
      return out;
    },
    streak() {
      const s = read();
      let streak = 0;
      const d = new Date();
      // 允许今天还没写（从昨天开始算）
      let probe = dayEntry(keyOf(d));
      if (probe.hand === 0 && probe.ai === 0) d.setDate(d.getDate() - 1);
      while (true) {
        const e = dayEntry(keyOf(d));
        if ((e.hand || 0) + (e.ai || 0) > 0) { streak++; d.setDate(d.getDate() - 1); }
        else break;
      }
      return streak;
    },
    maxStreak() {
      const s = read();
      const days = Object.keys(s).sort();
      let max = 0, cur = 0, prev = null;
      for (const k of days) {
        if ((s[k].hand || 0) + (s[k].ai || 0) === 0) { cur = 0; prev = null; continue; }
        if (prev && k === nextDay(prev)) cur++; else cur = 1;
        prev = k;
        if (cur > max) max = cur;
      }
      return max;
    },
  };

  function keyOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function nextDay(k) {
    const d = new Date(k + 'T00:00:00'); d.setDate(d.getDate() + 1);
    return keyOf(d);
  }
})();
