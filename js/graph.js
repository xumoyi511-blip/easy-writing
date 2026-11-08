/* graph.js — 通用节点/连线画布（SVG）：拖拽、双击编辑、连线、删除 */
(function () {
  const EW = window.EW;
  const NS = 'http://www.w3.org/2000/svg';

  function cssVar(name, fb) {
    const v = getComputedStyle(document.body).getPropertyValue(name);
    return (v && v.trim()) || fb;
  }

  function create(container, opts) {
    opts = opts || {};
    const nodes = (opts.nodes || []).map((n) => ({ id: n.id || EW.uid(), label: n.label || '', x: n.x || 120, y: n.y || 90 }));
    const edges = (opts.edges || []).map((e) => ({ id: e.id || EW.uid(), from: e.from, to: e.to, label: e.label || '' }));
    const defaultLabel = opts.defaultLabel || '新节点';
    const acc = cssVar('--accent', '#4f7cff');
    const txt = cssVar('--text', '#222');
    const soft = cssVar('--text-soft', '#889');
    const onTip = opts.onTip || function () {};
    const onChange = opts.onChange || function () {};

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '1600');
    svg.setAttribute('height', '1200');
    svg.style.display = 'block';
    svg.style.touchAction = 'none';
    container.appendChild(svg);

    let selectedNode = null;
    let selectedEdge = null;
    let linkMode = false;
    let linkFrom = null;

    function nodeById(id) { for (const n of nodes) if (n.id === id) return n; return null; }
    function nodeW(n) { return Math.max(76, Math.min(240, n.label.length * 14 + 28)); }
    function disp(s) { return s.length > 14 ? s.slice(0, 14) + '\u2026' : s; }

    function render() {
      svg.innerHTML = '';
      edges.forEach((e) => {
        const a = nodeById(e.from), b = nodeById(e.to);
        if (!a || !b) return;
        const ax = a.x + nodeW(a) / 2, ay = a.y + 21;
        const bx = b.x + nodeW(b) / 2, by = b.y + 21;
        const g = document.createElementNS(NS, 'g');
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', ax); line.setAttribute('y1', ay);
        line.setAttribute('x2', bx); line.setAttribute('y2', by);
        line.setAttribute('stroke', selectedEdge === e.id ? '#ffb300' : soft);
        line.setAttribute('stroke-width', selectedEdge === e.id ? 3 : 2);
        g.appendChild(line);
        if (e.label) {
          const t = document.createElementNS(NS, 'text');
          t.setAttribute('x', (ax + bx) / 2); t.setAttribute('y', (ay + by) / 2 - 6);
          t.setAttribute('fill', txt); t.setAttribute('font-size', '13');
          t.setAttribute('text-anchor', 'middle');
          t.textContent = e.label;
          g.appendChild(t);
        }
        g.style.cursor = 'pointer';
        g.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); selectEdge(e.id); });
        g.addEventListener('dblclick', (ev) => {
          ev.stopPropagation();
          EW.promptText('编辑关系', e.label, (v) => { e.label = v; render(); onChange(nodes, edges); });
        });
        svg.appendChild(g);
      });

      nodes.forEach((n) => {
        const w = nodeW(n);
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('transform', 'translate(' + n.x + ',' + n.y + ')');
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('width', w); rect.setAttribute('height', 42);
        rect.setAttribute('rx', 10); rect.setAttribute('ry', 10);
        rect.setAttribute('fill', acc);
        rect.setAttribute('stroke', selectedNode === n.id ? '#ffb300' : 'rgba(0,0,0,.15)');
        rect.setAttribute('stroke-width', selectedNode === n.id ? 3 : 1);
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', w / 2); t.setAttribute('y', 26);
        t.setAttribute('fill', '#fff'); t.setAttribute('font-size', '14');
        t.setAttribute('text-anchor', 'middle');
        t.textContent = disp(n.label);
        g.appendChild(rect); g.appendChild(t);
        g.style.cursor = 'grab';

        g.addEventListener('pointerdown', (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          selectNode(n.id);
          if (linkMode) { linkClick(n); return; }
          const sx = ev.clientX, sy = ev.clientY, ox = n.x, oy = n.y;
          const move = (ev2) => { n.x = ox + (ev2.clientX - sx); n.y = oy + (ev2.clientY - sy); render(); };
          const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onChange(nodes, edges); };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        });
        g.addEventListener('dblclick', (ev) => {
          ev.stopPropagation();
          EW.promptText('编辑节点', n.label, (v) => { n.label = v; render(); onChange(nodes, edges); });
        });
        svg.appendChild(g);
      });
    }

    function selectNode(id) { selectedNode = id; selectedEdge = null; render(); }
    function selectEdge(id) { selectedEdge = id; selectedNode = null; render(); }

    function linkClick(n) {
      if (!linkFrom) { linkFrom = n; onTip('已选「' + (n.label || '') + '」，点击目标节点'); return; }
      if (linkFrom.id === n.id) { onTip('不能连到自己，重新选一个'); return; }
      const from = linkFrom;
      linkMode = false; linkFrom = null;
      EW.promptText('关系 / 连线', '', (v) => { edges.push({ id: EW.uid(), from: from.id, to: n.id, label: v }); render(); onChange(nodes, edges); onTip(''); });
    }

    function addNode(label, x, y) {
      if (x == null) x = 700 + Math.round(Math.random() * 200 - 100);
      if (y == null) y = 500 + Math.round(Math.random() * 200 - 100);
      const n = { id: EW.uid(), label: label || defaultLabel, x, y };
      nodes.push(n); render(); onChange(nodes, edges); return n;
    }

    function deleteSelected() {
      if (selectedNode) {
        const id = selectedNode;
        const i = nodes.findIndex((n) => n.id === id);
        if (i !== -1) nodes.splice(i, 1);
        for (let k = edges.length - 1; k >= 0; k--) if (edges[k].from === id || edges[k].to === id) edges.splice(k, 1);
        selectedNode = null;
      } else if (selectedEdge) {
        const id = selectedEdge;
        const i = edges.findIndex((e) => e.id === id);
        if (i !== -1) edges.splice(i, 1);
        selectedEdge = null;
      }
      render(); onChange(nodes, edges);
    }

    function clearAll() {
      nodes.length = 0; edges.length = 0;
      selectedNode = null; selectedEdge = null;
      render(); onChange(nodes, edges);
    }

    function startLink() {
      linkMode = true; linkFrom = null;
      onTip('点击第一个节点，再点击目标节点');
    }

    svg.addEventListener('dblclick', (ev) => {
      if (ev.target !== svg) return;
      const r = svg.getBoundingClientRect();
      addNode(null, ev.clientX - r.left, ev.clientY - r.top);
    });
    svg.addEventListener('pointerdown', (ev) => {
      if (ev.target === svg) { selectedNode = null; selectedEdge = null; render(); }
    });

    render();
    return { addNode, startLink, deleteSelected, clear: clearAll };
  }

  EW.graph = { create };
})();
