// StuHelper cloud sync: keeps each student's study data (notes, tasks, flashcards, progress...)
// in the database so it follows them across devices. localStorage stays the working copy, so the
// app still works offline; changes are pushed to /api/sync shortly after they happen.
//
// Conflict rule: last write wins per key. Admin-published assignments/syllabus (ids "ADM-...") are
// never uploaded; only the student's own items plus "done" ticks on admin items are synced.

const PLAIN = ['todos', 'studyTasks', 'savedNotes', 'notes', 'flashcards', 'timetable', 'dailyHabits', 'dailyPlan',
  'focusLog', 'focusMinutes', 'focusStreak', 'focusSessions', 'focusLastDay', 'studyPrefs', 'reminderPrefs', 'appearancePrefs', 'recent'];
const KEYS = [...PLAIN, 'assignments_mine', 'syllabus_mine', 'adminDone'];
const META_KEY = 'dh__syncMeta', OWNER_KEY = 'dh__syncOwner';

const page = location.pathname.split('/').pop() || 'index.html';
const skipPage = ['login.html', 'admin.html', 'login'].includes(page);

const rawGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
const parse = s => { try { return JSON.parse(s); } catch { return null; } };
const isAdm = x => x && String(x.id).startsWith('ADM-');
const isEmpty = s => !s || /^(\[\]|\{\}|""|null|\{"assignments":\[\],"syllabus":\[\]\})$/.test(s);

let applying = false, ready = false, timer = null, busy = Promise.resolve();

const loadMeta = () => parse(rawGet(META_KEY)) || {};
const saveMeta = m => rawSet.call(localStorage, META_KEY, JSON.stringify(m));
const setLocal = (k, v) => { applying = true; try { rawSet.call(localStorage, k, v); } finally { applying = false; } };
const removeLocal = k => { applying = true; try { rawRemove.call(localStorage, k); } finally { applying = false; } };

// ---- local value <-> sync key ----
function readLocal(key) {
  if (PLAIN.includes(key)) return rawGet('dh_' + key);
  if (key === 'assignments_mine' || key === 'syllabus_mine') {
    const raw = rawGet('dh_' + key.replace('_mine', ''));
    return raw === null ? null : JSON.stringify((parse(raw) || []).filter(x => !isAdm(x)));
  }
  if (key === 'adminDone') {
    const ids = name => (parse(rawGet('dh_' + name)) || []).filter(x => isAdm(x) && x.done).map(x => x.id).sort();
    return JSON.stringify({ assignments: ids('assignments'), syllabus: ids('syllabus') });
  }
  return null;
}

function applyLocal(key, value) {
  if (PLAIN.includes(key)) return setLocal('dh_' + key, JSON.stringify(value));
  if (key === 'assignments_mine' || key === 'syllabus_mine') {
    const lk = 'dh_' + key.replace('_mine', '');
    const adm = (parse(rawGet(lk)) || []).filter(isAdm);
    return setLocal(lk, JSON.stringify(adm.concat(Array.isArray(value) ? value : [])));
  }
  if (key === 'adminDone' && value) {
    for (const name of ['assignments', 'syllabus']) {
      const lk = 'dh_' + name, list = parse(rawGet(lk));
      if (!Array.isArray(list)) continue;
      const done = new Set(value[name] || []);
      list.forEach(x => { if (isAdm(x)) x.done = done.has(x.id); });
      setLocal(lk, JSON.stringify(list));
    }
  }
}

const api = (...a) => window.SH_AUTH.api(...a);

// ---- push ----
function pushDirty() {
  busy = busy.then(async () => {
    const meta = loadMeta();
    for (const key of KEYS) {
      const cur = readLocal(key), m = meta[key];
      const dirty = m ? cur !== null && cur !== m.h : !isEmpty(cur);
      if (!dirty) continue;
      try {
        const r = await api('/api/sync/' + key, { method: 'PUT', body: { value: JSON.parse(cur) } });
        meta[key] = { t: Date.parse(r.updated_at), h: cur };
      } catch (e) {
        console.warn('StuHelper sync: could not save', key, e.message || e);
      }
    }
    saveMeta(meta);
  }).catch(() => {});
  return busy;
}

function schedule() {
  if (!ready) return;
  clearTimeout(timer);
  timer = setTimeout(pushDirty, 2500);
}

function touched(k) {
  if (typeof k === 'string' && k.startsWith('dh_') && !k.startsWith('dh__')) schedule();
}

// ---- pull (runs once per page load, after shared content has synced) ----
async function start(session) {
  let changed = false;

  // A different student signed in on this browser: drop the previous student's synced data first.
  const owner = rawGet(OWNER_KEY);
  if (owner && owner !== session.id) {
    PLAIN.forEach(k => removeLocal('dh_' + k));
    for (const name of ['assignments', 'syllabus']) {
      const list = parse(rawGet('dh_' + name));
      if (Array.isArray(list)) setLocal('dh_' + name, JSON.stringify(list.filter(isAdm)));
    }
    removeLocal(META_KEY);
    changed = true;
  }
  setLocal(OWNER_KEY, session.id);

  const { items } = await api('/api/sync');
  const server = new Map(items.map(i => [i.key, i]));
  const meta = loadMeta();

  for (const key of KEYS) {
    const it = server.get(key);
    if (!it) continue; // nothing in the cloud yet; pushDirty() uploads local data below
    const cur = readLocal(key), m = meta[key], u = Date.parse(it.updated_at);
    if (m) {
      const dirty = cur !== null && cur !== m.h;
      if (dirty || !(u > m.t)) continue; // local change wins / already up to date
    } else if (!isEmpty(cur) && cur !== JSON.stringify(it.value)) {
      setLocal('dh__backup_' + key, cur); // first sync on this device: keep a copy of what was here
    }
    applyLocal(key, it.value);
    meta[key] = { t: u, h: readLocal(key) };
    changed = true;
  }
  saveMeta(meta);
  ready = true;
  await pushDirty();

  if (changed) {
    const last = Number(sessionStorage.getItem('sh_sync_reload') || 0);
    if (Date.now() - last > 15000) {
      sessionStorage.setItem('sh_sync_reload', String(Date.now()));
      location.reload();
    }
  }
}

function init() {
  const session = parse(rawGet('dh_session'));
  if (!session || session.role === 'admin') return;

  Storage.prototype.setItem = function (k, v) { rawSet.call(this, k, v); if (this === localStorage && !applying) touched(k); };
  Storage.prototype.removeItem = function (k) { rawRemove.call(this, k); if (this === localStorage && !applying) touched(k); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && ready) pushDirty(); });

  window.SH_SYNC = { flush: () => (ready ? pushDirty() : Promise.resolve()) };
  window.addEventListener('sh-content-updated', () => {
    start(session).catch(e => console.warn('StuHelper sync skipped', e));
  }, { once: true });
}

if (!skipPage) init();
