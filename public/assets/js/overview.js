/* StuHelper — Overview page.
   Reads the same localStorage records as the other pages (prefix "dh_") and renders the dashboard. */
(() => {
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem('dh_' + k)) ?? d; } catch { return d; } };
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Local-date helpers (toISOString() is UTC and gives "yesterday" in the early morning in India).
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const parseDay = s => new Date(s + 'T00:00:00');
  const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  function render() {
    if (!$('ovRoot')) return;
    const now = new Date(), today = startOfDay(now), todayKey = ymd(now);
    const syllabus = get('syllabus', []), assignments = get('assignments', []), library = get('library', []);
    const todos = [...get('todos', []), ...get('studyTasks', [])];
    const prefs = get('studyPrefs', {}), profile = get('profile', {});
    const plan = get('dailyPlan', {}), habits = get('dailyHabits', {});
    const focusLog = get('focusLog', {}), totalFocus = Number(get('focusMinutes', 0)) || 0, streak = Number(get('focusStreak', 0)) || 0;
    const examDate = get('examDate', '');

    /* ---------- derived numbers ---------- */
    const done = syllabus.filter(x => x.done).length, total = syllabus.length;
    const pct = total ? Math.round(done / total * 100) : 0;

    const open = assignments.filter(x => !x.done && x.due).sort((a, b) => a.due.localeCompare(b.due));
    const overdue = open.filter(x => x.due < todayKey);
    const upcoming = open.filter(x => x.due >= todayKey);
    const dueToday = open.filter(x => x.due === todayKey);
    const openTasks = todos.filter(x => !x.done).length;

    // Monday-first week
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return { d, key: ymd(d), mins: Number(focusLog[ymd(d)]) || 0 }; });
    const weekMins = week.reduce((s, x) => s + x.mins, 0);
    const todayMins = Number(focusLog[todayKey]) || 0;
    const weeklyGoal = Number(prefs.weeklyGoal) || 300;
    const dailyTarget = plan.date === todayKey ? Number(plan.target) || 0 : 0;
    const dailyGoalText = plan.date === todayKey ? (plan.goal || '') : '';
    const habitsDone = habits.date === todayKey ? Object.entries(habits).filter(([k, v]) => k !== 'date' && v === true).length : 0;

    /* ---------- header ---------- */
    const hour = now.getHours();
    const first = String(profile.name || '').trim().split(/\s+/)[0];
    const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    $('overviewGreeting').textContent = first ? `${hello}, ${first}` : hello;
    $('overviewSubheading').textContent = hour < 12 ? 'Start gently — choose one thing to move forward.' : hour < 17 ? 'Take a breath, then keep your momentum going.' : 'A little progress today is still progress.';
    $('ovDate').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

    /* ---------- hero: one clear "what next" ---------- */
    const nothingYet = !total && !assignments.length && !library.length && !totalFocus;
    const link = $('ovHeroLink');
    let title, text, linkText, linkHref;
    if (overdue.length) {
      title = `${plural(overdue.length, 'assignment')} overdue`;
      text = `“${overdue[0].title}” was due ${plural(daysBetween(parseDay(overdue[0].due), today), 'day')} ago. Finish it first, then plan the rest of your day.`;
      linkText = 'Review overdue work'; linkHref = 'assignments.html';
    } else if (dueToday.length) {
      title = `${dueToday.length === 1 ? '1 assignment' : dueToday.length + ' assignments'} due today`;
      text = `“${dueToday[0].title}”${dueToday[0].subject ? ' (' + dueToday[0].subject + ')' : ''} is due today. A focused session now keeps you ahead.`;
      linkText = 'Open assignments'; linkHref = 'assignments.html';
    } else if (upcoming.length) {
      const d = daysBetween(today, parseDay(upcoming[0].due));
      title = `Next up: ${upcoming[0].title}`;
      text = `Due ${d === 1 ? 'tomorrow' : 'in ' + plural(d, 'day')}${upcoming[0].subject ? ' · ' + upcoming[0].subject : ''}. You have ${plural(upcoming.length, 'upcoming deadline')} in total.`;
      linkText = 'See all deadlines'; linkHref = 'assignments.html';
    } else if (nothingYet) {
      title = "Let's set up your study space";
      text = 'Add your subjects and chapters, then your first assignment. Everything stays on this device.';
      linkText = 'Add syllabus'; linkHref = 'syllabus.html';
    } else {
      title = 'You are all caught up';
      text = 'No pending deadlines. Use the time to revise a chapter or start a focus session.';
      linkText = 'Open syllabus'; linkHref = 'syllabus.html';
    }
    $('ovHeroTitle').textContent = title; $('ovHeroText').textContent = text; link.textContent = linkText; link.href = linkHref;
    $('ovStreak').textContent = streak > 1 ? `🔥 ${streak}-day focus streak` : streak === 1 ? '🔥 Focus streak started' : 'A little progress, every day';

    // "Today" panel
    const rows = [];
    rows.push({ k: 'Daily goal', v: dailyGoalText || 'Not set', href: 'productivity.html', muted: !dailyGoalText });
    rows.push({ k: 'Focus today', v: dailyTarget ? `${todayMins} / ${dailyTarget} min` : `${todayMins} min`, href: 'productivity.html#timer', bar: dailyTarget ? Math.min(100, Math.round(todayMins / dailyTarget * 100)) : null });
    rows.push({ k: 'Habits', v: `${habitsDone} of 4 done`, href: 'productivity.html', bar: Math.round(habitsDone / 4 * 100) });
    if (examDate) {
      const d = daysBetween(today, parseDay(examDate));
      rows.push({ k: 'Exam', v: d > 0 ? `in ${plural(d, 'day')}` : d === 0 ? 'Today — good luck!' : 'Date passed', href: 'students.html' });
    }
    $('ovTodayList').innerHTML = rows.map(r => `<li><a href="${r.href}"><span class="ov-today-k">${esc(r.k)}</span><span class="ov-today-v${r.muted ? ' is-muted' : ''}">${esc(r.v)}</span>${r.bar == null ? '' : `<span class="ov-mini"><span style="width:${r.bar}%"></span></span>`}</a></li>`).join('');

    /* ---------- stat cards ---------- */
    $('ovStatSyllabus').textContent = pct + '%';
    $('ovStatSyllabusSub').textContent = total ? `${done} of ${total} chapters` : 'No chapters yet';
    $('ovStatDue').textContent = upcoming.length;
    $('ovStatDueSub').textContent = overdue.length ? `${overdue.length} overdue` : 'Upcoming assignments';
    $('ovStatDueSub').classList.toggle('is-alert', overdue.length > 0);
    $('ovStatTasks').textContent = openTasks;
    $('ovStatFocus').textContent = `${weekMins} min`;
    $('ovStatFocusSub').textContent = totalFocus > weekMins ? `this week · ${totalFocus} min all-time` : 'Focus this week';

    /* ---------- progress card ---------- */
    $('overviewProgressPercent').textContent = pct + '%';
    $('overviewProgressCount').textContent = `${done} of ${total} chapters`;
    $('overviewProgressRing').style.setProperty('--p', pct * 3.6 + 'deg');
    $('overviewProgressRing').setAttribute('aria-label', `Syllabus ${pct}% complete`);
    $('overviewProgressTitle').textContent = !total ? 'Your learning journey starts here' : pct === 100 ? 'Syllabus completed — brilliant work!' : pct >= 50 ? "You're building real momentum" : 'Keep moving, one chapter at a time';
    $('overviewProgressText').textContent = total ? (pct === 100 ? 'Every chapter is marked complete. Time to revise.' : `${plural(total - done, 'chapter')} left to complete.`) : 'Add subjects and chapters to see your progress take shape.';

    const groups = {};
    syllabus.forEach(c => { const n = (c.subject || 'General').trim() || 'General'; (groups[n] ??= { done: 0, all: 0 }).all++; if (c.done) groups[n].done++; });
    const subjects = Object.entries(groups).sort((a, b) => (a[1].done / a[1].all) - (b[1].done / b[1].all)).slice(0, 4);
    $('ovSubjects').innerHTML = subjects.length
      ? subjects.map(([n, g]) => { const p = Math.round(g.done / g.all * 100); return `<div class="ov-subject"><div><strong>${esc(n)}</strong><small>${g.done}/${g.all} · ${p}%</small></div><div class="ov-bar" role="progressbar" aria-label="${esc(n)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><span style="width:${p}%"></span></div></div>`; }).join('')
      : `<div class="ov-empty"><strong>No subjects yet</strong><small>Add your first subject to track chapters.</small><a class="ov-btn ov-btn-solid" href="syllabus.html">Add a subject</a></div>`;

    /* ---------- deadlines ---------- */
    const list = [...overdue.slice(0, 2), ...upcoming].slice(0, 4);
    const host = $('dashUpcoming');
    if (!list.length) {
      host.innerHTML = `<div class="ov-empty"><strong>${assignments.some(x => !x.done) ? 'No dated deadlines' : 'Your schedule is clear'}</strong><small>Add an assignment with a due date and it will show up here.</small><a class="ov-btn ov-btn-solid" href="assignments.html">Add an assignment</a></div>`;
    } else {
      host.innerHTML = list.map(x => {
        const d = parseDay(x.due), delta = daysBetween(today, d);
        const state = delta < 0 ? ['Overdue', 'is-overdue'] : delta === 0 ? ['Today', 'is-today'] : delta === 1 ? ['Tomorrow', 'is-soon'] : delta <= 3 ? [`${delta} days`, 'is-soon'] : [`${delta} days`, ''];
        const idx = assignments.indexOf(x);
        return `<div class="ov-deadline ${state[1]}"><span class="ov-date-chip"><b>${d.getDate()}</b><small>${esc(d.toLocaleDateString(undefined, { month: 'short' }))}</small></span><span class="ov-deadline-copy"><strong title="${esc(x.title)}">${esc(x.title)}</strong><small>${esc(x.subject || 'General')}${x.priority === 'High' ? ' · High priority' : ''}</small></span><span class="ov-chip ${state[1]}">${state[0]}</span><button class="ov-check" type="button" data-done="${idx}" aria-label="Mark ${esc(x.title)} as done" title="Mark as done">✓</button></div>`;
      }).join('') + (open.length > list.length ? `<a class="ov-more" href="assignments.html">+ ${open.length - list.length} more</a>` : '');
    }
    host.querySelectorAll('[data-done]').forEach(b => b.addEventListener('click', () => {
      const all = get('assignments', []), i = Number(b.dataset.done);
      if (all[i]) { all[i].done = true; localStorage.setItem('dh_assignments', JSON.stringify(all)); render(); }
    }));

    /* ---------- weekly focus chart ---------- */
    const max = Math.max(60, ...week.map(x => x.mins));
    $('ovChart').innerHTML = week.map(x => {
      const isToday = x.key === todayKey, h = x.mins ? Math.max(6, Math.round(x.mins / max * 100)) : 0;
      return `<div class="ov-col${isToday ? ' is-today' : ''}"><span class="ov-col-val">${x.mins || ''}</span><div class="ov-col-track"><span style="height:${h}%"></span></div><small>${x.d.toLocaleDateString(undefined, { weekday: 'narrow' })}</small></div>`;
    }).join('');
    const gp = Math.min(100, Math.round(weekMins / weeklyGoal * 100));
    $('overviewWeeklyGoal').textContent = `${weekMins} / ${weeklyGoal} min weekly goal`;
    $('overviewWeeklyText').textContent = weekMins >= weeklyGoal ? 'Goal reached 🎉' : `${weeklyGoal - weekMins} min to go`;
    $('ovGoalBar').style.width = gp + '%'; $('ovGoalTrack').setAttribute('aria-valuenow', gp);

    /* ---------- recent activity ---------- */
    const recent = get('recent', []).slice(0, 5);
    $('ovActivity').innerHTML = recent.length
      ? recent.map(x => `<li><span class="ov-dot"></span><span><strong>${esc(x.title)}</strong><small>${esc([x.detail, x.time].filter(Boolean).join(' · '))}</small></span></li>`).join('')
      : `<li class="ov-activity-empty">Nothing yet. Finish a focus session or use a tool and it will appear here.</li>`;

    /* ---------- shortcuts ---------- */
    $('ovLibCount').textContent = library.length ? plural(library.length, 'saved resource') : 'Books, notes and links';
  }

  document.addEventListener('DOMContentLoaded', render);
  // Refresh when another tab changes the data, or when this tab becomes visible again.
  window.addEventListener('storage', e => { if (!e.key || e.key.startsWith('dh_')) render(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
})();
