/* My Library: resources with files stored in IndexedDB (not localStorage), so big files no longer fill browser storage. */
(() => {
  const $ = id => document.getElementById(id);
  if (!$('libraryGrid')) return;
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem('dh_' + k)) ?? d; } catch (_) { return d; } };
  const set = (k, v) => { try { localStorage.setItem('dh_' + k, JSON.stringify(v)); return true; } catch (_) { alert('Browser storage is full. Remove some resources and try again.'); return false; } };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX = 25 * 1024 * 1024;

  /* ---- IndexedDB file store ---- */
  const dbp = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('IndexedDB unavailable'));
    const r = indexedDB.open('dochelper-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  dbp.catch(() => {});
  const tx = (mode, fn) => dbp.then(db => new Promise((res, rej) => {
    const t = db.transaction('files', mode), req = fn(t.objectStore('files'));
    t.oncomplete = () => res(req && req.result); t.onerror = t.onabort = () => rej(t.error);
  }));
  const putFile = (id, blob) => tx('readwrite', s => s.put(blob, String(id)));
  const getFile = id => tx('readonly', s => s.get(String(id)));
  const delFile = id => tx('readwrite', s => s.delete(String(id))).catch(() => {});

  const dataUrlToBlob = url => {
    const [head, body] = url.split(',');
    const mime = (head.match(/:(.*?);/) || [])[1] || 'application/octet-stream';
    const bin = atob(body), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };
  // One-time migration of older base64 files out of localStorage.
  const migrate = async () => {
    let all = get('library', []), changed = false;
    for (const x of all) {
      if (!x.data || x.fileId) continue;
      try { await putFile(x.id, dataUrlToBlob(x.data)); x.fileId = String(x.id); delete x.data; changed = true; } catch (_) {}
    }
    if (changed) set('library', all);
  };

  const openFile = async x => {
    try {
      const blob = await getFile(x.id);
      if (!blob) { alert('This file is no longer in browser storage.'); return; }
      const url = URL.createObjectURL(blob);
      if (/pdf|image|text/.test(blob.type)) window.open(url, '_blank');
      else { const a = document.createElement('a'); a.href = url; a.download = x.fileName || x.title; document.body.append(a); a.click(); a.remove(); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (_) { alert('Could not open this file.'); }
  };

  /* ---- render ---- */
  const grid = $('libraryGrid'), form = $('libraryForm'), upload = $('libraryUpload');
  let quick = 'all';
  const render = () => {
    const all = get('library', []), q = ($('librarySearch')?.value || '').toLowerCase(), f = $('libraryFilter')?.value || 'all';
    const shown = all.filter(x => (f === 'all' || x.type === f) && (quick === 'all' || x.type === quick) && [x.title, x.subject, x.description, x.tags || ''].join(' ').toLowerCase().includes(q));
    grid.innerHTML = shown.length ? '' : '<div class="empty-state">Nothing here yet. Add a book, upload a PDF or save a useful link.</div>';
    shown.forEach(x => {
      const card = document.createElement('article'); card.className = 'resource-card';
      const icon = { Book: '📘', Notes: '📝', PDF: '📄', Link: '🔗' }[x.type] || '📚';
      const hasFile = !!(x.fileId || x.data);
      card.innerHTML = `<div class="resource-icon">${icon}</div><span class="resource-type">${esc(x.type)} · ${esc(x.subject || 'General')}</span><h3>${esc(x.title)}</h3><p>${esc(x.description || x.fileName || 'Your saved study resource.')}</p><div class="resource-actions"><small>${new Date(x.created || Date.now()).toLocaleDateString()}</small>${hasFile ? '<button class="resource-open" data-open type="button">Open file ↗</button>' : x.url ? `<a class="resource-open" target="_blank" rel="noopener" href="${esc(x.url)}">Open link ↗</a>` : ''}<button class="btn danger" data-remove type="button">Remove</button></div>`;
      card.querySelector('[data-open]')?.addEventListener('click', () => openFile(x));
      card.querySelector('[data-remove]').addEventListener('click', () => { delFile(x.id); set('library', get('library', []).filter(y => String(y.id) !== String(x.id))); render(); });
      grid.append(card);
    });
    const queue = get('publishQueue', []);
    $('publishQueue').innerHTML = queue.length ? queue.map(x => `<div class="publish-item"><strong>${esc(x.title)}</strong><small><span class="pending-pill">${esc(x.status || 'Pending moderator review')}</span> · ${new Date(x.created).toLocaleDateString()}</small></div>`).join('') : '<span class="muted small">No submissions yet. Your requests will appear here with their review status.</span>';
  };

  document.querySelectorAll('[data-libquick]').forEach(b => b.addEventListener('click', () => {
    quick = b.dataset.libquick;
    document.querySelectorAll('[data-libquick]').forEach(x => x.classList.toggle('active', x === b));
    render();
  }));
  $('librarySearch')?.addEventListener('input', render);
  $('libraryFilter')?.addEventListener('change', render);

  const tooBig = file => { if (file.size > MAX) { alert(`${file.name} is larger than 25 MB and was skipped.`); return true; } return false; };

  upload?.addEventListener('change', async () => {
    for (const file of [...upload.files]) {
      if (tooBig(file)) continue;
      const id = String(Date.now() + Math.random());
      try { await putFile(id, file); } catch (_) { alert('Could not store ' + file.name + ' in this browser.'); continue; }
      const type = /\.pdf$/i.test(file.name) ? 'PDF' : /\.(doc|docx|ppt|pptx|epub)$/i.test(file.name) ? 'Book' : 'Notes';
      const all = get('library', []);
      all.unshift({ id, fileId: id, title: file.name.replace(/\.[^.]+$/, ''), type, subject: '', description: 'Uploaded from your device', fileName: file.name, created: new Date().toISOString() });
      set('library', all);
    }
    upload.value = ''; render();
  });

  form?.addEventListener('submit', async e => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    const title = $('libraryTitle').value.trim();
    if (!title) return;
    const file = $('libraryAttachment')?.files?.[0];
    const id = String(Date.now() + Math.random());
    if (file) {
      if (tooBig(file)) return;
      try { await putFile(id, file); } catch (_) { alert('Could not store the attached file in this browser.'); return; }
    }
    const item = { id, title, type: $('libraryType').value, subject: $('librarySubject').value.trim(), description: $('libraryDescription').value.trim(), url: $('libraryUrl').value.trim(), tags: $('libraryTags')?.value.trim() || '', fileName: file?.name || '', created: new Date().toISOString() };
    if (file) item.fileId = id;
    const all = get('library', []); all.unshift(item); set('library', all);
    if ($('libraryPublish')?.checked) {
      const q = get('publishQueue', []); q.unshift({ title: item.title, resourceId: item.id, created: item.created, status: 'Pending moderator review' }); set('publishQueue', q);
      // Send the publish request to the admin moderation queue.
      window.SH_AUTH?.api('/api/requests', { method: 'POST', body: { title: item.title, req_type: 'Publish ' + item.type, details: [item.subject, item.description, item.url].filter(Boolean).join(' · ') } })
        .then(() => window.SH_AUTH.syncRequests()).then(render)
        .catch(err => alert('Saved to your library, but the publish request could not be sent: ' + err.message));
    }
    form.reset(); $('libraryDialog').close(); render();
  });

  render();
  migrate().then(render);
  window.addEventListener('sh-requests-updated', render);
  window.addEventListener('sh-content-updated', render);
})();
