/* Rich-text notebook: toolbar, autosaved draft, and named saved notes shown on the page. */
(() => {
  const editor = document.getElementById('quickNotes');
  if (!editor) return;
  const $ = id => document.getElementById(id);
  const status = $('notesStatus');
  const titleInput = $('noteTitle');
  const tagsInput = $('noteTags');
  const openHistory = new Set();
  const listEl = $('savedNotesList');
  const countEl = $('savedNotesCount');
  const searchEl = $('savedNotesSearch');
  const SAVED_KEY = 'dh_savedNotes';   // list of named notes
  const DRAFT_KEY = 'dh_notes';        // autosaved editor draft
  let savedRange = null;
  let currentId = null;                // id of the saved note loaded in the editor
  let loadedHtml = '', loadedTitle = '';

  const setStatus = message => { if (status) status.textContent = message; };
  const isEmpty = () => !editor.innerText.trim() && !editor.querySelector('img');
  const readSaved = () => { try { const v = JSON.parse(localStorage.getItem(SAVED_KEY)); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const writeSaved = list => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); return true; } catch (_) { setStatus('Could not save: browser storage is full or blocked'); return false; } };
  const plain = html => { const d = document.createElement('div'); d.innerHTML = html; return (d.innerText || d.textContent || '').trim(); };
  const safeName = t => (t || 'StuHelper-Notes').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'StuHelper-Notes';
  const isDirty = () => editor.innerHTML !== loadedHtml || (titleInput ? titleInput.value.trim() !== loadedTitle : false);

  /* ---------- selection + toolbar ---------- */
  const rememberSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount && editor.contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    editor.focus();
    if (!savedRange) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
  };
  const saveDraft = () => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(editor.innerHTML)); setStatus(isDirty() && currentId ? 'Unsaved changes' : 'Draft autosaved'); }
    catch (_) { setStatus('Could not save: browser storage is full or blocked'); }
  };
  try { const stored = JSON.parse(localStorage.getItem(DRAFT_KEY)); if (typeof stored === 'string') editor.innerHTML = stored; } catch (_) {}
  editor.addEventListener('keyup', rememberSelection);
  editor.addEventListener('mouseup', rememberSelection);
  editor.addEventListener('input', () => { rememberSelection(); saveDraft(); });
  editor.addEventListener('blur', () => { rememberSelection(); saveDraft(); });
  titleInput?.addEventListener('input', () => { if (currentId) setStatus('Unsaved changes'); });

  document.querySelectorAll('.rich-note-tools button').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));
  const applyCommand = (command, value) => { restoreSelection(); document.execCommand(command, false, value); rememberSelection(); saveDraft(); };
  document.querySelectorAll('[data-note-cmd]').forEach(b => b.addEventListener('click', () => applyCommand(b.dataset.noteCmd, null)));
  $('noteFont')?.addEventListener('change', e => applyCommand('fontName', e.target.value));
  $('noteSize')?.addEventListener('change', e => applyCommand('fontSize', e.target.value));
  $('noteColor')?.addEventListener('input', e => applyCommand('foreColor', e.target.value));
  $('noteHighlight')?.addEventListener('input', e => {
    restoreSelection();
    if (!document.execCommand('hiliteColor', false, e.target.value)) document.execCommand('backColor', false, e.target.value);
    rememberSelection(); saveDraft();
  });

  /* ---------- downloads (only when you click Download) ---------- */
  const download = (name, content, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  const htmlDoc = (title, body) => '<!doctype html><html><head><meta charset="utf-8"><title>' + title.replace(/</g, '&lt;') + '</title><style>body{font:16px/1.7 Arial,sans-serif;max-width:850px;margin:40px auto;padding:0 20px}img{max-width:100%}</style></head><body>' + body + '</body></html>';
  $('exportNotes')?.addEventListener('click', () => download(safeName(titleInput?.value) + '.txt', editor.innerText, 'text/plain;charset=utf-8'));
  $('exportNotesHtml')?.addEventListener('click', () => { const t = safeName(titleInput?.value); download(t + '.html', htmlDoc(t, editor.innerHTML), 'text/html;charset=utf-8'); });

  /* ---------- saved notes list ---------- */
  const fmtDate = iso => { try { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return ''; } };
  const parseTags = str => [...new Set((str || '').split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean))].slice(0, 8);
  const renderList = () => {
    if (!listEl) return;
    const all = readSaved().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updated || '').localeCompare(a.updated || ''));
    const q = (searchEl?.value || '').trim().toLowerCase();
    const shown = all.filter(n => !q || (n.title + ' ' + (n.tags || []).join(' ') + ' ' + plain(n.html)).toLowerCase().includes(q));
    if (countEl) countEl.textContent = all.length ? all.length + (all.length === 1 ? ' saved note' : ' saved notes') : 'No saved notes yet';
    listEl.innerHTML = '';
    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = all.length ? 'No saved notes match your search.' : 'Give your note a name and press “Save note” — it will appear here.';
      listEl.append(empty);
      return;
    }
    const mk = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = label; b.addEventListener('click', fn); return b; };
    shown.forEach(n => {
      const card = document.createElement('article');
      card.className = 'saved-note-card' + (n.id === currentId ? ' is-open' : '') + (n.pinned ? ' is-pinned' : '');
      const h = document.createElement('h4'); h.textContent = (n.pinned ? '📌 ' : '') + n.title; h.title = n.title;
      const d = document.createElement('small'); d.textContent = 'Updated ' + fmtDate(n.updated);
      const p = document.createElement('p'); p.textContent = plain(n.html).slice(0, 220) || '(empty note)';
      card.append(h, d);
      if ((n.tags || []).length) {
        const tg = document.createElement('div'); tg.className = 'note-tags';
        n.tags.forEach(t => { const c = document.createElement('button'); c.type = 'button'; c.className = 'note-tag'; c.textContent = '#' + t; c.title = 'Filter by this tag'; c.addEventListener('click', () => { if (searchEl) searchEl.value = t; renderList(); }); tg.append(c); });
        card.append(tg);
      }
      card.append(p);
      const vers = n.versions || [];
      const actions = document.createElement('div'); actions.className = 'saved-note-actions';
      actions.append(
        mk('Open', 'secondary', () => openNote(n.id)),
        mk(n.pinned ? 'Unpin' : 'Pin', 'ghost', () => { const l = readSaved(), t = l.find(x => x.id === n.id); if (t) { t.pinned = !t.pinned; writeSaved(l); renderList(); } })
      );
      if (vers.length) actions.append(mk('History (' + vers.length + ')', 'ghost', () => { openHistory.has(n.id) ? openHistory.delete(n.id) : openHistory.add(n.id); renderList(); }));
      actions.append(
        mk('Download', 'ghost', () => download(safeName(n.title) + '.txt', plain(n.html), 'text/plain;charset=utf-8')),
        mk('Delete', 'danger', () => deleteNote(n.id))
      );
      card.append(actions);
      if (vers.length && openHistory.has(n.id)) {
        const hist = document.createElement('div'); hist.className = 'note-history';
        vers.forEach(v => {
          const row = document.createElement('div'); row.className = 'note-history-row';
          const lbl = document.createElement('span'); lbl.textContent = fmtDate(v.saved) + ' · ' + (plain(v.html).slice(0, 40) || '(empty)');
          row.append(lbl, mk('Restore', 'ghost', () => {
            if (!confirmDiscard()) return;
            loadIntoEditor({ id: n.id, title: v.title, html: v.html, tags: n.tags });
            loadedHtml = n.html; loadedTitle = n.title;
            setStatus('Older version loaded — press “Save note” to keep it');
            editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }));
          hist.append(row);
        });
        card.append(hist);
      }
      listEl.append(card);
    });
  };

  const loadIntoEditor = note => {
    editor.innerHTML = note ? note.html : '';
    if (titleInput) titleInput.value = note ? note.title : '';
    if (tagsInput) tagsInput.value = note ? (note.tags || []).join(', ') : '';
    currentId = note ? note.id : null;
    loadedHtml = editor.innerHTML; loadedTitle = note ? note.title : '';
    savedRange = null;
    saveDraft();
    renderList();
  };
  const confirmDiscard = () => !isDirty() || isEmpty() && !currentId || confirm('You have unsaved changes in the editor. Discard them?');

  const openNote = id => {
    const note = readSaved().find(n => n.id === id);
    if (!note || !confirmDiscard()) return;
    loadIntoEditor(note);
    setStatus('Opened “' + note.title + '”');
    editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const deleteNote = id => {
    const list = readSaved(), note = list.find(n => n.id === id);
    if (!note || !confirm('Delete the saved note “' + note.title + '”? This cannot be undone.')) return;
    writeSaved(list.filter(n => n.id !== id));
    if (currentId === id) { currentId = null; loadedHtml = ''; loadedTitle = ''; }
    renderList();
    setStatus('Deleted “' + note.title + '”');
  };

  const saveNote = () => {
    const title = (titleInput?.value || '').trim();
    if (!title) { setStatus('Please give your note a name first'); titleInput?.focus(); return; }
    if (isEmpty()) { setStatus('Write something in the note before saving'); editor.focus(); return; }
    const tags = parseTags(tagsInput?.value);
    const list = readSaved();
    const clash = list.find(n => n.id !== currentId && n.title.toLowerCase() === title.toLowerCase());
    if (clash && !confirm('A note named “' + clash.title + '” already exists. Replace it?')) return;
    const now = new Date().toISOString();
    let target = clash || list.find(n => n.id === currentId);
    if (clash && currentId && clash.id !== currentId) { const i = list.findIndex(n => n.id === currentId); if (i > -1) list.splice(i, 1); }
    if (target) {
      if (target.html !== editor.innerHTML) target.versions = [{ title: target.title, html: target.html, saved: target.updated }, ...(target.versions || [])].slice(0, 5);
      target.title = title; target.html = editor.innerHTML; target.tags = tags; target.updated = now;
    } else {
      target = { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, html: editor.innerHTML, tags, pinned: false, versions: [], created: now, updated: now };
      list.push(target);
    }
    if (!writeSaved(list)) return;
    currentId = target.id; loadedHtml = editor.innerHTML; loadedTitle = title;
    renderList();
    setStatus('Saved as “' + title + '”');
    try { window.DH?.addActivity?.('Saved note', title); } catch (_) {}
  };
  $('saveNoteBtn')?.addEventListener('click', saveNote);
  titleInput?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveNote(); } });
  editor.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNote(); } });
  searchEl?.addEventListener('input', renderList);

  $('newNoteBtn')?.addEventListener('click', () => {
    if (!confirmDiscard()) return;
    loadIntoEditor(null); setStatus('New note started'); (titleInput || editor).focus();
  });
  $('clearQuickNotes')?.addEventListener('click', () => {
    if (!confirm('Clear the editor? Notes already saved in your list will not be deleted.')) return;
    loadIntoEditor(null); setStatus('Editor cleared');
  });

  // Restore the open saved note after a refresh (draft is restored above).
  try {
    const openId = localStorage.getItem('dh_openNoteId');
    const note = openId && readSaved().find(n => n.id === openId);
    if (note && editor.innerHTML === note.html) { currentId = note.id; loadedHtml = note.html; loadedTitle = note.title; if (titleInput) titleInput.value = note.title; if (tagsInput) tagsInput.value = (note.tags || []).join(', '); }
  } catch (_) {}
  window.addEventListener('beforeunload', () => { try { currentId ? localStorage.setItem('dh_openNoteId', currentId) : localStorage.removeItem('dh_openNoteId'); } catch (_) {} });
  window.addEventListener('dh:open-note', e => openNote(e.detail));
  try { const j = sessionStorage.getItem('dh_jumpNote'); if (j) { sessionStorage.removeItem('dh_jumpNote'); const n = readSaved().find(x => x.id === j); if (n) loadIntoEditor(n); } } catch (_) {}
  if (location.hash === '#new-note') { loadIntoEditor(null); (titleInput || editor).focus(); }
  renderList();
})();
