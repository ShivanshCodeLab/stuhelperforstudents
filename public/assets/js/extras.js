/* Shared extras on every page: accessibility labels, global search (/ or Ctrl+K), Alt+N new note, focus analytics. */
(() => {
  const $ = id => document.getElementById(id);
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem('dh_' + k)) ?? d; } catch (_) { return d; } };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return (d.textContent || '').trim(); };
  const here = location.pathname.split('/').pop() || 'index.html';

  /* ---- accessibility: label unlabeled fields, announce status messages ---- */
  const a11y = () => {
    document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea').forEach(el => {
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]'))) return;
      const t = el.getAttribute('placeholder') || el.getAttribute('title') || el.name || el.id;
      if (t) el.setAttribute('aria-label', t);
    });
    document.querySelectorAll('.status').forEach(el => { if (!el.hasAttribute('role')) { el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); } });
  };
  a11y(); window.addEventListener('load', a11y);

  /* ---- global search ---- */
  const pages = [['Overview', 'index.html'], ['My Workspace', 'workspace.html'], ['My Library', 'library.html'], ['Syllabus', 'syllabus.html'], ['Assignments', 'assignments.html'], ['Productivity', 'productivity.html'], ['Student Toolkit', 'students.html'], ['Documents', 'documents.html'], ['Image Studio', 'images.html'], ['Merge PDF', 'merge-pdf.html'], ['Recent activity', 'recent.html'], ['Settings', 'settings.html']];
  const buildIndex = () => [
    ...pages.map(([t, u]) => ({ k: 'Page', t, s: '', u })),
    ...get('savedNotes', []).map(n => ({ k: 'Note', t: n.title, s: (n.tags || []).map(x => '#' + x).join(' ') + ' ' + plain(n.html).slice(0, 80), u: 'productivity.html', note: n.id })),
    ...get('todos', []).map(x => ({ k: 'Task', t: x.text, s: x.done ? 'Done' : 'Pending', u: 'productivity.html' })),
    ...get('library', []).map(x => ({ k: 'Library', t: x.title, s: [x.type, x.subject, x.tags].filter(Boolean).join(' · '), u: 'library.html' })),
    ...get('assignments', []).map(x => ({ k: 'Assignment', t: x.title, s: [x.subject, x.due].filter(Boolean).join(' · '), u: 'assignments.html' }))
  ];
  const box = document.createElement('div');
  box.className = 'dh-search'; box.hidden = true;
  box.innerHTML = '<div class="dh-search-card" role="dialog" aria-modal="true" aria-label="Search StuHelper"><input class="field" id="dhSearchInput" placeholder="Search notes, tasks, library, assignments, pages…" autocomplete="off"><ul id="dhSearchList" role="listbox"></ul><small>↑ ↓ to move · Enter to open · Esc to close</small></div>';
  document.body.append(box);
  const input = box.querySelector('input'), list = box.querySelector('ul');
  let items = [], sel = 0;
  const draw = () => {
    const q = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    items = buildIndex().filter(x => q.every(w => (x.k + ' ' + x.t + ' ' + x.s).toLowerCase().includes(w))).slice(0, q.length ? 12 : 12);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.length ? items.map((x, i) => `<li role="option" data-i="${i}" class="${i === sel ? 'on' : ''}"><span class="dh-kind">${esc(x.k)}</span><strong>${esc(x.t)}</strong><small>${esc(x.s)}</small></li>`).join('') : '<li class="none">No results</li>';
  };
  const go = x => {
    if (!x) return;
    close();
    if (x.note) {
      if (here === x.u) { window.dispatchEvent(new CustomEvent('dh:open-note', { detail: x.note })); return; }
      try { sessionStorage.setItem('dh_jumpNote', x.note); } catch (_) {}
    }
    if (here !== x.u) location.href = x.u;
  };
  const open = () => { box.hidden = false; input.value = ''; sel = 0; draw(); input.focus(); };
  const close = () => { box.hidden = true; };
  input.addEventListener('input', () => { sel = 0; draw(); });
  list.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) go(items[+li.dataset.i]); });
  box.addEventListener('mousedown', e => { if (e.target === box) close(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[sel]); }
  });
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === 'Escape' && !box.hidden) { close(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(); }
    else if (e.altKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      if (here === 'productivity.html') $('newNoteBtn')?.click(); else location.href = 'productivity.html#new-note';
    }
  });
  const top = document.querySelector('.topbar-tools') || document.querySelector('.topbar');
  if (top) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn ghost dh-search-btn'; btn.innerHTML = '🔍 Search <kbd>/</kbd>';
    btn.setAttribute('aria-label', 'Search StuHelper (press slash)');
    btn.addEventListener('click', open); top.append(btn);
  }

  /* ---- focus analytics (Productivity page) ---- */
  const stage = document.querySelector('.productivity-panels');
  if (stage && $('prodTasksDone')) {
    const log = get('focusLog', {}), pad = n => String(n).padStart(2, '0'), days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      days.push({ d, m: Number(log[k]) || 0 });
    }
    const max = Math.max(30, ...days.map(x => x.m)), last7 = days.slice(-7).reduce((a, x) => a + x.m, 0);
    const best = days.reduce((a, x) => x.m > a.m ? x : a, days[0]), active = days.filter(x => x.m > 0).length;
    const sec = document.createElement('section');
    sec.className = 'panel analytics-panel'; sec.setAttribute('aria-label', 'Focus analytics');
    sec.innerHTML = `<div class="section-heading"><div><span class="eyebrow">FOCUS ANALYTICS</span><h2>Your last 14 days</h2><p>Minutes of completed focus sessions per day.</p></div></div>
      <div class="an-stats"><div><strong>${last7}</strong><small>min this week</small></div><div><strong>${Math.round(last7 / 7)}</strong><small>min / day average</small></div><div><strong>${best.m ? best.m : 0}</strong><small>best day${best.m ? ' · ' + best.d.toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''}</small></div><div><strong>${active}/14</strong><small>active days</small></div></div>
      <div class="an-bars" role="img" aria-label="Bar chart of focus minutes for the last 14 days">${days.map(x => `<div class="an-bar${x.m ? '' : ' empty'}" title="${esc(x.d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }))}: ${x.m} min"><b>${x.m || ''}</b><span style="height:${Math.max(x.m ? 6 : 2, x.m / max * 100)}%"></span><small>${x.d.toLocaleDateString([], { weekday: 'narrow' })}</small></div>`).join('')}</div>
      ${last7 || active ? '' : '<p class="muted small an-empty">Complete a focus session with the timer to see your chart fill up.</p>'}`;
    stage.before(sec);
  }
})();
