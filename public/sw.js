// StuHelper service worker: lets the app open offline and be installed as an app.
// - App pages and static files: cached, refreshed in the background.
// - /api/* and Netlify Identity: never cached (always live data).
// - CDN libraries (PDF/Word tools): cached after first use so those tools keep working offline.
const VERSION = 'stuhelper-v1';
const CORE = [
  'index.html', 'workspace.html', 'library.html', 'syllabus.html', 'assignments.html', 'productivity.html',
  'students.html', 'documents.html', 'images.html', 'merge-pdf.html', 'recent.html', 'settings.html', 'login.html',
  'assets/css/style.css', 'assets/images/stuhelper-logo.png', 'assets/images/icon-192.png',
  'assets/js/app.js', 'assets/js/auth.js', 'assets/js/sync.js', 'assets/js/pwa.js', 'assets/js/enhancements.js',
  'assets/js/final-polish.js', 'assets/js/overview.js', 'assets/js/extras.js', 'assets/js/library.js',
  'assets/js/notes-editor.js', 'assets/js/settings-profile.js', 'assets/js/login.js', 'assets/js/vendor/netlify-identity.js',
];
const CDN = ['https://unpkg.com/', 'https://cdnjs.cloudflare.com/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  if (sameOrigin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/'))) return;
  if (!sameOrigin && !CDN.some(p => req.url.startsWith(p))) return;

  // Stale-while-revalidate: answer from cache if we can, refresh in the background.
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    const open = list.find(c => 'focus' in c);
    return open ? open.focus() : self.clients.openWindow('assignments.html');
  }));
});
