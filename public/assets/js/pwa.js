// Registers the service worker (install + offline) and runs assignment reminders.
(() => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const canNotify = () => 'Notification' in window;

  async function show(title, body) {
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null;
      if (reg) return reg.showNotification(title, { body, icon: 'assets/images/icon-192.png', badge: 'assets/images/icon-192.png', tag: title });
      new Notification(title, { body, icon: 'assets/images/icon-192.png' });
    } catch {}
  }

  // Reminders fire when StuHelper is opened (there is no push server): once per assignment per day.
  function checkAssignments() {
    if (!canNotify() || Notification.permission !== 'granted') return;
    if (!get('dh_reminderPrefs', { assignments: true }).assignments) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const stamp = today.toISOString().slice(0, 10);
    const sent = get('dh__notified', {});
    const due = get('dh_assignments', []).filter(a => a && a.due && !a.done).map(a => {
      const days = Math.round((new Date(a.due + 'T00:00:00') - today) / 86400000);
      return { a, days };
    }).filter(x => x.days <= 1 && sent[x.a.id] !== stamp).sort((x, y) => x.days - y.days).slice(0, 3);
    due.forEach(({ a, days }) => {
      sent[a.id] = stamp;
      show(days < 0 ? 'Assignment overdue' : days === 0 ? 'Assignment due today' : 'Assignment due tomorrow', a.title + (a.subject ? ' · ' + a.subject : ''));
    });
    try { localStorage.setItem('dh__notified', JSON.stringify(sent)); } catch {}
  }

  // Settings page: ask for notification permission when a reminder is switched on.
  ['remindAssignments', 'remindStudy', 'remindWeekly'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', async () => {
      const status = document.getElementById('reminderStatus');
      if (!el.checked) return;
      if (!canNotify()) { if (status) status.textContent = 'This browser does not support notifications.'; return; }
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission === 'denied' && status) status.textContent = 'Notifications are blocked in your browser settings. Allow them for this site to get reminders.';
      else if (status) status.textContent = 'Reminder preferences saved. Reminders appear when you open StuHelper.';
    });
  });

  window.addEventListener('load', () => setTimeout(checkAssignments, 2500));
})();
