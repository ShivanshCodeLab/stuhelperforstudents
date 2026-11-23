// StuHelper accounts: Netlify Identity for sign-in + the /api server for profiles and shared content.
import * as Identity from './vendor/netlify-identity.js';

const SESSION_KEY = 'dh_session';

const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
const writeSession = s => localStorage.setItem(SESSION_KEY, JSON.stringify(s));
const clearSession = () => { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem('dh_admin_preview'); };

// Fetch the API with the current Identity token; refresh once on 401.
async function api(path, { method = 'GET', body } = {}) {
  const send = () => fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  let res = await send();
  if (res.status === 401) {
    try { await Identity.refreshSession(); } catch {}
    res = await send();
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Build the local session the rest of the app reads (sidebar badge, profile, notices filter).
function sessionFromMe(me) {
  const p = me.profile || {};
  return {
    role: me.isAdmin ? 'admin' : 'student',
    id: me.user.id,
    name: p.full_name || me.user.name || me.user.email,
    email: me.user.email,
    phone: p.phone ? '+91 ' + p.phone : '',
    rollNo: p.roll_no || '',
    course: p.course || '',
    semester: p.semester || '',
    loginAt: new Date().toISOString()
  };
}

async function loadMe() {
  const me = await api('/api/me');
  writeSession(sessionFromMe(me));
  return me;
}

// Pull admin-published notices, assignments, syllabus, library and exam date into the local workspace.
async function syncContent() {
  const data = await api('/api/content');
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  set('dh_admin_notices', data.notices.map(r => ({ id: r.id, title: r.title, body: r.body, priority: r.priority, audience: r.audience, active: r.active, createdAt: new Date(r.created_at).toLocaleString() })));
  const keep = (k, list, map) => { const mine = get(k, []).filter(i => !String(i.id).startsWith('ADM-')); set(k, list.map(map).concat(mine)); };
  const prev = id => (get('dh_syllabus', []).find(x => x.id === 'ADM-' + id) || {}).done || false;
  keep('dh_assignments', data.assignments, r => ({ id: 'ADM-' + r.id, title: r.title, subject: r.subject, due: r.due, priority: r.priority, estimate: r.minutes, details: r.details, official: true }));
  keep('dh_syllabus', data.syllabus, r => ({ id: 'ADM-' + r.id, subject: r.subject, chapter: r.chapter, priority: r.priority, target: r.target, done: prev(r.id) }));
  keep('dh_library', data.library_books, r => ({ id: 'ADM-' + r.id, adminBookId: r.id, title: r.title, type: /\.pdf/i.test(r.file_name || r.resource_url || '') ? 'PDF' : 'Book', subject: r.semester, description: r.author ? 'Author/Subject: ' + r.author : 'Published by Admin', url: r.resource_url || '', fileName: r.file_name || '', created: r.created_at }));
  const ex = (data.settings || []).find(r => r.key === 'exam');
  if (ex && ex.value) { localStorage.setItem('dh_examDate', ex.value.date || ''); localStorage.setItem('dh_examLabel', ex.value.title || 'Upcoming Exams'); }
}

async function syncRequests() {
  const { requests } = await api('/api/requests');
  const label = s => s === 'Pending' ? 'Pending moderator review' : s;
  localStorage.setItem('dh_publishQueue', JSON.stringify(requests.map(r => ({ id: r.id, title: r.title, created: r.created_at, status: label(r.status) }))));
}

async function logout() {
  clearSession();
  try { await Identity.logout(); } catch {}
}

window.SH_AUTH = { Identity, api, loadMe, syncContent, syncRequests, logout, readSession, writeSession, clearSession };
window.dispatchEvent(new Event('sh-auth-ready'));

// On workspace pages: verify the account is still valid, then refresh shared content in the background.
const page = location.pathname.split('/').pop() || 'index.html';
const isAuthPage = page === 'login.html' || page === 'admin.html' || page === 'login';
if (!isAuthPage && readSession()) {
  (async () => {
    try {
      const me = await loadMe();
      if (!me.isAdmin && !me.profile) { location.replace('login.html#complete-profile'); return; }
      await syncContent();
      if (document.getElementById('publishQueue')) { await syncRequests(); window.dispatchEvent(new Event('sh-requests-updated')); }
      window.dispatchEvent(new Event('sh-content-updated'));
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        await logout();
        location.replace('login.html' + (e.data && e.data.error === 'suspended' ? '?suspended=1' : '?expired=1'));
      } else {
        console.warn('StuHelper sync skipped', e);
      }
    }
  })();
}
