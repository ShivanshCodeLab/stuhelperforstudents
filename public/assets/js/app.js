/* === StuHelper Auth Guard, Profile Sync & Sidebar User Badge === */
(() => {
  const page = location.pathname.split('/').pop() || 'index.html';
  const isLogin = page === 'login.html';
  const isAdminPage = page === 'admin.html';
  let session = null;
  try { session = JSON.parse(localStorage.getItem('dh_session')); } catch {}

  // Email links (confirm account, reset password, invites) land on the site root with a token in the hash.
  if (/(confirmation|recovery|invite|email_change)_token=|access_token=/.test(location.hash) && !isLogin) {
    location.replace('login.html' + location.hash);
    return;
  }

  if (!session && !isLogin) {
    location.replace('login.html');
    return;
  }

  if (session && isLogin) {
    location.replace(session.role === 'admin' ? 'admin.html' : 'index.html');
    return;
  }

  if (session && session.role === 'admin' && !isAdminPage && !isLogin) {
    if (location.search.includes('preview=student')) {
      sessionStorage.setItem('dh_admin_preview', '1');
    }
    if (sessionStorage.getItem('dh_admin_preview') !== '1') {
      location.replace('admin.html');
      return;
    }
  }
  if (isAdminPage) {
    sessionStorage.removeItem('dh_admin_preview');
  }

  if (session && isAdminPage && session.role !== 'admin') {
    location.replace('index.html');
    return;
  }

  if (session && session.role === 'student') {
    let existing = {};
    try { existing = JSON.parse(localStorage.getItem('dh_profile')) || {}; } catch {}
    localStorage.setItem('dh_profile', JSON.stringify({
      ...existing,
      name: session.name || existing.name || '',
      email: session.email || existing.email || '',
      phone: session.phone || existing.phone || '',
      rollNo: session.rollNo || existing.rollNo || '',
      course: session.course || existing.course || '',
      year: session.semester || existing.year || '',
      profession: 'Student'
    }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const mainEl = document.querySelector('main.main-content');
    if (mainEl && !isAdminPage && !isLogin) {
      if (session && session.role === 'admin' && sessionStorage.getItem('dh_admin_preview') === '1') {
        const prevBar = document.createElement('div');
        prevBar.style.cssText = 'margin-bottom:14px;padding:10px 14px;border-radius:12px;background:#111827;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12.5px;';
        prevBar.innerHTML = '<span>👁️ <strong>Admin Preview Mode</strong> — Viewing Student Workspace</span><a href="admin.html" style="background:#fff;color:#111827;padding:5px 11px;border-radius:8px;font-weight:700;text-decoration:none;">Back to Admin Console →</a>';
        mainEl.prepend(prevBar);
      }
      let notices = [];
      try { notices = JSON.parse(localStorage.getItem('dh_admin_notices')) || []; } catch {}
      const stuSem = (session && session.semester) || '';
      const activeNotices = notices.filter(n => n && n.active !== false && (!n.audience || n.audience === 'All Semesters' || n.audience === stuSem));
      if (activeNotices.length) {
        const latest = activeNotices[0];
        const isHigh = latest.priority === 'High';
        const banner = document.createElement('div');
        banner.style.cssText = `margin-bottom:14px;padding:12px 15px;border-radius:14px;border:1px solid ${isHigh ? '#fecaca' : '#bfdbfe'};background:${isHigh ? '#fef2f2' : '#eff6ff'};color:${isHigh ? '#991b1b' : '#1e3a8a'};display:flex;justify-content:space-between;align-items:flex-start;gap:12px;font-size:12.5px;`;
        banner.innerHTML = `<div><strong>📢 ${String(latest.title || 'Notice').replace(/</g,'&lt;')}</strong> <span style="opacity:.75;">(${String(latest.audience || 'All').replace(/</g,'&lt;')})</span><div style="margin-top:3px;">${String(latest.body || '').replace(/</g,'&lt;')}</div></div><button type="button" aria-label="Dismiss notice" style="border:0;background:transparent;font-weight:800;cursor:pointer;color:inherit;font-size:14px;">✕</button>`;
        banner.querySelector('button').onclick = () => banner.remove();
        mainEl.prepend(banner);
      }
    }

    const sidebarBottom = document.querySelector('.sidebar-bottom');
    if (sidebarBottom && session) {

      const userCard = document.createElement('div');
      userCard.style.cssText = 'margin:10px 5px 0;padding:11px 12px;border-radius:12px;background:#f8f9ff;border:1px solid #e9ecf4;display:flex;align-items:center;justify-content:space-between;gap:8px;';
      userCard.innerHTML = `
        <div style="min-width:0;">
          <strong style="display:block;font-size:12px;color:#20243a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${String(session.name || 'User').replace(/</g,'&lt;')}</strong>
          <small style="font-size:11px;color:#81879d;">${session.role === 'admin' ? '🛡️ Admin' : '🎓 Student'}</small>
        </div>
        <button id="dhLogoutBtn" type="button" style="border:none;background:#fee2e2;color:#b91c1c;font-weight:700;font-size:11px;padding:6px 10px;border-radius:8px;cursor:pointer;flex-shrink:0;">Logout</button>
      `;
      sidebarBottom.appendChild(userCard);

      document.getElementById('dhLogoutBtn').addEventListener('click', async e => {
        e.currentTarget.disabled = true;
        e.currentTarget.textContent = 'Signing out…';
        localStorage.removeItem('dh_session');
        try { if (window.SH_AUTH) await window.SH_AUTH.logout(); } catch {}
        location.href = 'login.html?signedout=1';
      });
    }
  });
})();

// StuHelper shared interactions. No server or account required.
const DH = (() => {
  const get = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem('dh_' + key)); return value ?? fallback; } catch { return fallback; } };
  const set = (key, value) => localStorage.setItem('dh_' + key, JSON.stringify(value));
  function addActivity(title, detail='') { const items=get('recent',[]); items.unshift({title,detail,time:new Date().toLocaleString()}); set('recent',items.slice(0,40)); }
  return {get,set,addActivity};
})();
document.addEventListener('DOMContentLoaded', () => {
  // Dashboard search filters cards and hides empty categories.
  const search=document.getElementById('toolSearch');
  if(search){const cards=[...document.querySelectorAll('.tool-card')],sections=[...document.querySelectorAll('.tools-section')];search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();cards.forEach(card=>card.style.display=card.textContent.toLowerCase().includes(q)?'':'none');sections.forEach(section=>{const visible=[...section.querySelectorAll('.tool-card')].some(c=>c.style.display!=='none');section.style.display=visible?'':'none'});});}
  // Image resize / export.
  const imageInput=document.getElementById('imageInput'); if(imageInput){let img=null,original=null;const preview=document.getElementById('imagePreview'),download=document.getElementById('imageDownload'),status=document.getElementById('imageStatus');imageInput.addEventListener('change',()=>{const f=imageInput.files[0];if(!f)return;const url=URL.createObjectURL(f);img=new Image();img.onload=()=>{original={w:img.naturalWidth,h:img.naturalHeight,name:f.name};preview.src=url;preview.classList.remove('hidden');document.getElementById('imgWidth').value=original.w;document.getElementById('imgHeight').value=original.h;document.getElementById('imageInfo').textContent=`${original.w} × ${original.h}px · ${(f.size/1024).toFixed(1)} KB`;download.disabled=false;};img.src=url;});document.getElementById('imageReset').onclick=()=>{if(original){document.getElementById('imgWidth').value=original.w;document.getElementById('imgHeight').value=original.h;['cropX','cropY','cropW','cropH'].forEach(id=>document.getElementById(id).value='')}};download.onclick=()=>{if(!img)return;const sx=Math.max(0,Number(document.getElementById('cropX').value)||0),sy=Math.max(0,Number(document.getElementById('cropY').value)||0),sw=Math.max(1,Number(document.getElementById('cropW').value)||img.width-sx),sh=Math.max(1,Number(document.getElementById('cropH').value)||img.height-sy);if(sx>=img.width||sy>=img.height||sx+sw>img.width||sy+sh>img.height){status.className='status error';status.textContent='Crop area must stay within the original image dimensions.';return}const w=Math.max(1,Math.min(8000,Number(document.getElementById('imgWidth').value)||sw)),h=Math.max(1,Math.min(8000,Number(document.getElementById('imgHeight').value)||sh)),format=document.getElementById('imgFormat').value,q=Number(document.getElementById('imgQuality').value)/100,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,w,h);const save=(blob,ext)=>{if(!blob){status.textContent='This browser does not support that export format.';return}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`StuHelper-${original.name.replace(/\.[^.]+$/,'')}.${ext}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);DH.addActivity('Exported image',a.download);status.className='status success';status.textContent=`Exported ${w} × ${h}px (${(blob.size/1024).toFixed(1)} KB).`};if(format==='image/svg+xml'){const png=canvas.toDataURL('image/png'),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image width="${w}" height="${h}" href="${png}"/></svg>`;save(new Blob([svg],{type:format}),'svg')}else if(format==='image/bmp'){const ctx=canvas.getContext('2d'),data=ctx.getImageData(0,0,w,h).data,row=Math.floor((w*3+3)/4)*4,size=54+row*h,buf=new ArrayBuffer(size),v=new DataView(buf);v.setUint8(0,66);v.setUint8(1,77);v.setUint32(2,size,true);v.setUint32(10,54,true);v.setUint32(14,40,true);v.setInt32(18,w,true);v.setInt32(22,-h,true);v.setUint16(26,1,true);v.setUint16(28,24,true);v.setUint32(34,row*h,true);let out=new Uint8Array(buf);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let si=(y*w+x)*4,di=54+y*row+x*3;out[di]=data[si+2];out[di+1]=data[si+1];out[di+2]=data[si]}save(new Blob([buf],{type:'image/bmp'}),'bmp')}else canvas.toBlob(blob=>save(blob,format==='image/jpeg'?'jpg':format.split('/')[1]),format,q)};}
  // Marks calculator.
  const rows=document.getElementById('marksRows');if(rows){document.getElementById('addMarkRow').onclick=()=>{const row=document.createElement('div');row.className='form-row mark-row';row.innerHTML='<input class="field obtained" type="number" min="0" placeholder="Marks obtained"><input class="field maximum" type="number" min="1" placeholder="Maximum marks">';rows.append(row)};document.getElementById('calculateMarks').onclick=()=>{let obtained=0,total=0,valid=0;for(const r of rows.querySelectorAll('.mark-row')){const a=r.querySelector('.obtained').value,b=r.querySelector('.maximum').value;if(a!==''&&b!==''&&Number(b)>0){if(Number(a)<0||Number(a)>Number(b)){document.getElementById('marksResult').textContent='Obtained marks must be between 0 and maximum marks.';return}obtained+=Number(a);total+=Number(b);valid++}}const out=document.getElementById('marksResult');if(!valid){out.textContent='Enter marks for at least one subject.';return}out.className='status success';out.textContent=`Total: ${obtained} / ${total} · Percentage: ${(obtained/total*100).toFixed(2)}% · Subjects: ${valid}`;DH.addActivity('Calculated marks',`${obtained}/${total}`)}}
  const cp=document.getElementById('calculatePercent');if(cp)cp.onclick=()=>{const a=Number(document.getElementById('percentObtained').value),b=Number(document.getElementById('percentTotal').value),out=document.getElementById('percentResult');if(!b||a<0||b<0||a>b){out.className='status error';out.textContent='Enter valid marks. Obtained marks cannot exceed total marks.';return}out.className='status success';out.textContent=`Percentage: ${(a/b*100).toFixed(2)}%`;DH.addActivity('Calculated percentage',`${(a/b*100).toFixed(2)}%`)};
  // Timetable and study task persistence.
  const timetable=document.getElementById('timetableList');if(timetable){let slots=DH.get('timetable',[]);const render=()=>{timetable.innerHTML=slots.length?'':'<p class="muted small">No study slots yet.</p>';slots.sort((a,b)=>a.day.localeCompare(b.day)||a.time.localeCompare(b.time)).forEach((s,i)=>{const el=document.createElement('div');el.className='list-row';el.innerHTML=`<div><strong>${s.day} · ${s.time}</strong><p>${escapeHTML(s.subject)}</p></div><button class="btn danger" data-i="${i}">Remove</button>`;timetable.append(el)});timetable.querySelectorAll('button').forEach(b=>b.onclick=()=>{slots.splice(Number(b.dataset.i),1);DH.set('timetable',slots);render()})};document.getElementById('addStudySlot').onclick=()=>{const subject=document.getElementById('studySubject').value.trim(),time=document.getElementById('studyTime').value,day=document.getElementById('studyDay').value;if(!subject||!time)return;slots.push({subject,time,day});DH.set('timetable',slots);document.getElementById('studySubject').value='';render()};render()}
  const studyList=document.getElementById('studyTaskList');if(studyList){let tasks=DH.get('studyTasks',[]);const render=()=>{studyList.innerHTML='';tasks.forEach((t,i)=>{const row=document.createElement('div');row.className='file-item';row.innerHTML=`<label class="task-check"><input type="checkbox" ${t.done?'checked':''}><span class="${t.done?'task-done':''}">${escapeHTML(t.text)}</span></label><button class="btn danger">×</button>`;row.querySelector('input').onchange=e=>{tasks[i].done=e.target.checked;DH.set('studyTasks',tasks);render()};row.querySelector('button').onclick=()=>{tasks.splice(i,1);DH.set('studyTasks',tasks);render()};studyList.append(row)})};document.getElementById('addStudyTask').onclick=()=>{const input=document.getElementById('studyTask'),text=input.value.trim();if(!text)return;tasks.push({text,done:false});DH.set('studyTasks',tasks);input.value='';render()};render()}
  // To-do list, notes and focus timer.
  const todoList=document.getElementById('todoList');if(todoList){let tasks=DH.get('todos',[]);const render=()=>{todoList.innerHTML=tasks.length?'':'<div class="empty-state">No tasks yet. Add one small thing to begin.</div>';tasks.forEach((t,i)=>{const row=document.createElement('div');row.className='file-item';row.innerHTML=`<label class="task-check"><input type="checkbox" ${t.done?'checked':''}><span class="${t.done?'task-done':''}">${escapeHTML(t.text)}</span></label><button class="btn danger">Remove</button>`;row.querySelector('input').onchange=e=>{tasks[i].done=e.target.checked;DH.set('todos',tasks);render()};row.querySelector('button').onclick=()=>{tasks.splice(i,1);DH.set('todos',tasks);render()};todoList.append(row)})};document.getElementById('addTodo').onclick=()=>{const input=document.getElementById('todoInput'),text=input.value.trim();if(!text)return;tasks.push({text,done:false});DH.set('todos',tasks);input.value='';render()};render()}
  const timer=document.getElementById('timerDisplay');if(timer){
    const startBtn=document.getElementById('timerStart'),pauseBtn=document.getElementById('timerPause'),resetBtn=document.getElementById('timerReset');
    const studyPrefs=DH.get('studyPrefs',{});let mode='Focus',duration=(Number(studyPrefs.focus)||25)*60,remaining=duration,deadline=null,interval=null,state='idle';
    const status=document.getElementById('timerStatus'),caption=document.getElementById('timerCaption'),ring=document.getElementById('timerRing');
    const fmt=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
    function draw(){timer.textContent=fmt(remaining);const progress=duration?((duration-remaining)/duration)*360:0;if(ring)ring.style.background=`conic-gradient(var(--brand) ${progress}deg,var(--line) ${progress}deg)`;startBtn.textContent=state==='paused'?'Resume':state==='running'?'Running…':state==='done'?'Start again': 'Start focus';startBtn.disabled=state==='running';pauseBtn.disabled=state!=='running';if(caption)caption.textContent=state==='running'?'Stay with it.':state==='paused'?'Paused — ready when you are?':state==='done'?'Session complete!': 'Ready when you are.';}
    function stop(){if(interval){clearInterval(interval);interval=null}}
    function tick(){remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));draw();if(remaining<=0){stop();state='done';deadline=null;status.textContent=mode==='Focus'?'Focus session complete — take a well-earned break!':'Break complete — ready for another focus session?';DH.addActivity('Completed '+mode.toLowerCase()+' session',`${Math.round(duration/60)}-minute session`);if(mode==='Focus'){DH.set('focusSessions',DH.get('focusSessions',0)+1);DH.set('focusMinutes',DH.get('focusMinutes',0)+Math.round(duration/60));{const n=new Date(),k=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`,log=DH.get('focusLog',{});log[k]=(Number(log[k])||0)+Math.round(duration/60);DH.set('focusLog',log)}const today=new Date().toISOString().slice(0,10),last=DH.get('focusLastDay','');let streak=DH.get('focusStreak',0);if(last!==today){const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);streak=last===yesterday?streak+1:1;DH.set('focusLastDay',today);DH.set('focusStreak',streak)}}draw();}}
    function start(){if(state==='running')return;if(state==='done'||remaining<=0)remaining=duration;state='running';deadline=Date.now()+remaining*1000;stop();interval=setInterval(tick,250);status.textContent=mode==='Focus'?'Focus mode is running. You’ve got this.':'Break time — relax and recharge.';draw();}
    function pause(){if(state!=='running')return;remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));stop();deadline=null;state='paused';status.textContent='Paused. Your remaining time is saved until you resume or reset.';draw();}
    function reset(){stop();deadline=null;remaining=duration;state='idle';status.textContent=`${mode} timer reset. Ready when you are.`;draw();}
    startBtn.onclick=()=>state==='running'?null:start();pauseBtn.onclick=pause;resetBtn.onclick=reset;
    document.querySelectorAll('.preset').forEach(button=>button.onclick=()=>{stop();deadline=null;mode=button.textContent.toLowerCase().includes('break')?'Break':'Focus';duration=(mode==='Break'?(Number(studyPrefs.break)||5):Number(button.dataset.minutes)||Number(studyPrefs.focus)||25)*60;remaining=duration;state='idle';document.querySelectorAll('.preset').forEach(b=>b.classList.toggle('active',b===button));const label=document.querySelector('.timer-mode');if(label)label.textContent=mode.toUpperCase()+' SESSION';status.textContent=`${mode} preset selected.`;draw()});
    // Custom duration, immersive mode, timer colour themes and browser-generated ambience.
    document.getElementById('applyCustomTime')?.addEventListener('click',()=>{const mins=Number(document.getElementById('customMinutes').value);if(!Number.isFinite(mins)||mins<1||mins>240){status.textContent='Choose a duration between 1 and 240 minutes.';return}stop();deadline=null;mode='Focus';duration=mins*60;remaining=duration;state='idle';document.querySelectorAll('.preset').forEach(b=>b.classList.remove('active'));const label=document.querySelector('.timer-mode');if(label)label.textContent='CUSTOM FOCUS SESSION';status.textContent=`Custom ${mins}-minute session is ready.`;draw()});
    document.getElementById('timerFullscreen')?.addEventListener('click',async()=>{const card=document.querySelector('.timer-card');try{if(!document.fullscreenElement){await card.requestFullscreen();document.getElementById('timerFullscreen').textContent='⤢ Exit full screen'}else{await document.exitFullscreen();document.getElementById('timerFullscreen').textContent='⛶ Full screen'}}catch{status.textContent='Full screen is not available in this browser.'}});document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&document.getElementById('timerFullscreen'))document.getElementById('timerFullscreen').textContent='⛶ Full screen'});
    const themeSelect=document.getElementById('timerTheme');const themeColors={blue:['#2563eb','#dbeafe'],lavender:['#8b72d8','#eee8ff'],forest:['#27866a','#d9f4e8'],sunset:['#d97745','#ffeadb']};function applyTimerTheme(name){const [c,soft]=themeColors[name]||themeColors.blue;document.documentElement.style.setProperty('--brand',c);document.documentElement.style.setProperty('--brand-soft',soft);DH.set('timerTheme',name)}if(themeSelect){themeSelect.value=DH.get('timerTheme','blue');applyTimerTheme(themeSelect.value);themeSelect.onchange=()=>applyTimerTheme(themeSelect.value)}
    let audioCtx=null,noiseNode=null,ambientOscillators=[],ambienceOn=false;const soundSelect=document.getElementById('ambientSound'),soundButton=document.getElementById('ambientToggle'),soundStatus=document.getElementById('ambientStatus');function stopAmbience(){if(noiseNode){try{noiseNode.stop()}catch{}noiseNode=null}ambientOscillators.forEach(o=>{try{o.stop()}catch{}});ambientOscillators=[];if(audioCtx){audioCtx.close();audioCtx=null}ambienceOn=false;if(soundButton)soundButton.textContent='▶ Play ambience'}async function startAmbience(){const kind=soundSelect?.value||'off';if(kind==='off'){stopAmbience();soundStatus.textContent='Choose a sound to play.';return}stopAmbience();const AC=window.AudioContext||window.webkitAudioContext;if(!AC){soundStatus.textContent='Audio is not supported in this browser.';return}audioCtx=new AC();await audioCtx.resume();if(kind==='calm'){const master=audioCtx.createGain();master.gain.value=.035;master.connect(audioCtx.destination);[261.63,329.63,392,523.25].forEach((hz,i)=>{const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.type='sine';osc.frequency.value=hz;gain.gain.value=i===0?.8:.42;osc.connect(gain).connect(master);osc.start();ambientOscillators.push(osc)});ambienceOn=true;soundButton.textContent='Ⅱ Stop ambience';soundStatus.textContent='Playing a gentle synthesized ambient chord. No external audio is streamed.';return}const length=2*audioCtx.sampleRate,buffer=audioCtx.createBuffer(1,length,audioCtx.sampleRate),data=buffer.getChannelData(0);let last=0;for(let i=0;i<length;i++){const white=Math.random()*2-1;if(kind==='brown'){last=(last+(.02*white))/1.02;data[i]=last*3.5}else{data[i]=white*(kind==='rain'?.20:kind==='ocean'?.09:.045)}}const src=audioCtx.createBufferSource();src.buffer=buffer;src.loop=true;const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=kind==='rain'?1800:kind==='ocean'?500:kind==='forest'?900:450;const gain=audioCtx.createGain();gain.gain.value=kind==='rain'?.16:kind==='ocean'?.2:kind==='forest'?.11:.22;src.connect(filter).connect(gain).connect(audioCtx.destination);src.start();noiseNode=src;ambienceOn=true;soundButton.textContent='Ⅱ Stop ambience';soundStatus.textContent=`Playing soft ${kind} ambience. Adjust your device volume if needed.`}soundButton?.addEventListener('click',()=>ambienceOn?stopAmbience():startAmbience());soundSelect?.addEventListener('change',()=>{if(ambienceOn)startAmbience();else if(soundSelect.value==='off')stopAmbience()});window.addEventListener('pagehide',stopAmbience);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state==='running')tick()});draw();
  }
  // Recent activity.
  const recentList=document.getElementById('recentList');if(recentList){const items=DH.get('recent',[]);recentList.innerHTML=items.length?'':'<div class="empty-state"><div class="empty-icon">◷</div>No recent activity yet.</div>';items.forEach(item=>{const row=document.createElement('div');row.className='list-row';row.innerHTML=`<div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.detail||'')}</p></div><span class="muted small">${escapeHTML(item.time)}</span>`;recentList.append(row)});document.getElementById('clearRecent').onclick=()=>{DH.set('recent',[]);recentList.innerHTML='<div class="empty-state">History cleared.</div>'}}
  // Settings data reset.
});
function escapeHTML(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// Reusable, accessible tabs: only the selected workspace is visible.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tool-tabs').forEach(group => {
    const scope = group.parentElement;
    const buttons = [...group.querySelectorAll('[data-tab]')];
    const panels = [...scope.querySelectorAll(':scope > .tool-stage > [data-panel]')];
    function activate(name) {
      buttons.forEach(button => {
        const active = button.dataset.tab === name;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.setAttribute('role', 'tab');
      });
      panels.forEach(panel => {
        const active = panel.dataset.panel === name;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      });
    }
    buttons.forEach(button => button.addEventListener('click', () => activate(button.dataset.tab)));
    if (buttons.length) activate(buttons.find(b => b.classList.contains('active'))?.dataset.tab || buttons[0].dataset.tab);
  });
  const tasks = DH.get('studyTasks', []);
  const progress = document.getElementById('studyProgressBar');
  const progressText = document.getElementById('studyProgressText');
  if (progress && progressText) {
    const update = () => {
      const tasks = DH.get('studyTasks', []);
      const done = tasks.filter(t => t.done).length;
      progress.style.width = `${tasks.length ? done / tasks.length * 100 : 0}%`;
      progressText.textContent = `${done} / ${tasks.length} completed`;
    };
    const list = document.getElementById('studyTaskList');
    if (list) new MutationObserver(update).observe(list, { childList: true, subtree: true });
    update();
  }
});

// PDF tools. All processing happens locally in the browser.
document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('.pdf-workspace')) return;
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const $ = id => document.getElementById(id);
  const status = (id, message, type='') => { const el=$(id); if(el){el.className=`status ${type}`;el.textContent=message;} };
  const download = (bytes, name, type='application/pdf') => { const url=URL.createObjectURL(new Blob([bytes],{type})); const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500); };
  const readPdf = async file => { if(!file) throw Error('Please select a PDF file first.'); if(!window.PDFLib) throw Error('PDF library did not load. Check your internet connection and refresh.'); return PDFLib.PDFDocument.load(await file.arrayBuffer()); };
  const parsePages = (text,total) => { const nums=[]; for(const part of text.split(',').map(x=>x.trim()).filter(Boolean)){const m=part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m)throw Error('Use page numbers like 2, 4-6.');let a=+m[1],b=m[2]?+m[2]:a;if(a<1||b<a||b>total)throw Error(`Page range must be between 1 and ${total}.`);for(let n=a;n<=b;n++)nums.push(n-1);}return [...new Set(nums)];};
  // Merge PDFs
  let mergeFiles=[];
  const mergeInput=$('pdfMergeFiles');
  const renderMerge=()=>{const q=$('mergeQueue');q.innerHTML='';mergeFiles.forEach((f,i)=>{const row=document.createElement('div');row.className='file-item';const label=document.createElement('strong');label.textContent=`${i+1}. ${f.name}`;const remove=document.createElement('button');remove.className='btn danger';remove.textContent='Remove';remove.onclick=()=>{mergeFiles.splice(i,1);renderMerge()};row.append(label,remove);q.append(row);});if(!mergeFiles.length)q.innerHTML='<div class="empty-state">No PDFs selected yet.</div>';};
  if(mergeInput){mergeInput.onchange=()=>{mergeFiles.push(...[...mergeInput.files].filter(f=>f.type==='application/pdf'));mergeInput.value='';renderMerge();};$('clearMerge').onclick=()=>{mergeFiles=[];renderMerge();status('mergeStatus','');};$('runMerge').onclick=async()=>{try{if(mergeFiles.length<2)throw Error('Choose at least two PDF files.');const out=await PDFLib.PDFDocument.create();for(const file of mergeFiles){const src=await readPdf(file);const pages=await out.copyPages(src,src.getPageIndices());pages.forEach(p=>out.addPage(p));}download(await out.save(),'StuHelper-Merged.pdf');status('mergeStatus','Merged successfully. Your PDF has been downloaded.','success');DH.addActivity('Merged PDF',`${mergeFiles.length} files`);}catch(e){status('mergeStatus',e.message,'error');}};renderMerge();}
  // Delete selected pages
  $('runDelete').onclick=async()=>{try{const doc=await readPdf($('deleteFile').files[0]);const pages=parsePages($('deleteRanges').value,doc.getPageCount());if(pages.length===doc.getPageCount())throw Error('You cannot delete every page.');pages.sort((a,b)=>b-a).forEach(i=>doc.removePage(i));download(await doc.save(),'StuHelper-Pages-Removed.pdf');status('deleteStatus',`${pages.length} page(s) removed.`, 'success');DH.addActivity('Deleted PDF pages',`${pages.length} removed`);}catch(e){status('deleteStatus',e.message,'error');}};
  // Insert pages from another PDF after a chosen page
  $('runAdd').onclick=async()=>{try{const base=await readPdf($('addBase').files[0]),source=await readPdf($('addSource').files[0]);const after=Number($('insertAfter').value);if(!Number.isInteger(after)||after<0||after>base.getPageCount())throw Error(`Choose a page from 0 to ${base.getPageCount()}.`);const copied=await base.copyPages(source,source.getPageIndices());copied.forEach((page,i)=>base.insertPage(after+i,page));download(await base.save(),'StuHelper-Pages-Added.pdf');status('addStatus',`${copied.length} page(s) inserted.`, 'success');DH.addActivity('Added PDF pages',`${copied.length} pages`);}catch(e){status('addStatus',e.message,'error');}};
  // Reorder pages
  $('runReorder').onclick=async()=>{try{const src=await readPdf($('reorderFile').files[0]);const order=$('pageOrder').value.split(',').map(v=>Number(v.trim()));if(order.length!==src.getPageCount()||order.some(n=>!Number.isInteger(n)||n<1||n>src.getPageCount())||new Set(order).size!==order.length)throw Error(`Enter every page exactly once. This PDF has ${src.getPageCount()} pages.`);const out=await PDFLib.PDFDocument.create();const pages=await out.copyPages(src,order.map(n=>n-1));pages.forEach(p=>out.addPage(p));download(await out.save(),'StuHelper-Reordered.pdf');status('reorderStatus','Pages reordered successfully.','success');DH.addActivity('Reordered PDF pages',order.join(', '));}catch(e){status('reorderStatus',e.message,'error');}};
  // Images to PDF
  const imageInput=$('imagePdfFiles');if(imageInput){imageInput.onchange=()=>{const list=$('imagePdfQueue');list.innerHTML='';[...imageInput.files].forEach(f=>{const row=document.createElement('div');row.className='file-item';row.textContent=f.name;list.append(row);});};$('runImagesPdf').onclick=async()=>{try{const files=[...imageInput.files];if(!files.length)throw Error('Choose at least one image.');const out=await PDFLib.PDFDocument.create();for(const f of files){const bytes=await f.arrayBuffer();let img;if(f.type==='image/jpeg')img=await out.embedJpg(bytes);else if(f.type==='image/png')img=await out.embedPng(bytes);else{const data=await createImageBitmap(f),canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;canvas.getContext('2d').drawImage(data,0,0);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));img=await out.embedPng(await blob.arrayBuffer());}const page=out.addPage([img.width,img.height]);page.drawImage(img,{x:0,y:0,width:img.width,height:img.height});}download(await out.save(),'StuHelper-Images.pdf');status('imagesPdfStatus',`${files.length} image(s) added to PDF.`,'success');DH.addActivity('Converted images to PDF',`${files.length} images`);}catch(e){status('imagesPdfStatus',e.message,'error');}};}
  // PDF pages to PNG ZIP
  $('runPdfImages').onclick=async()=>{try{if(!window.pdfjsLib||!window.JSZip)throw Error('PDF rendering libraries did not load. Check your internet connection.');const f=$('renderPdf').files[0];if(!f)throw Error('Choose a PDF first.');const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise,zip=new JSZip(),scale=Number($('renderScale').value);for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));zip.file(`page-${String(n).padStart(3,'0')}.png`,await blob.arrayBuffer());}download(await zip.generateAsync({type:'blob'}),'StuHelper-PDF-Images.zip','application/zip');status('pdfImagesStatus',`${pdf.numPages} pages exported as PNG files.`,'success');DH.addActivity('Converted PDF to images',`${pdf.numPages} pages`);}catch(e){status('pdfImagesStatus',e.message,'error');}};
  // DOCX to simple text-first PDF using Mammoth + pdf-lib
  $('runWordPdf').onclick=async()=>{try{const f=$('wordFile').files[0];if(!f)throw Error('Choose a DOCX file first.');if(!window.mammoth)throw Error('Word conversion library did not load.');const result=await mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()});const text=result.value.trim();if(!text)throw Error('No readable text was found in this Word document.');const doc=await PDFLib.PDFDocument.create(),font=await doc.embedFont(PDFLib.StandardFonts.Helvetica),size=11,margin=50,lineHeight=16;let page=doc.addPage(),{width,height}=page.getSize(),y=height-margin;for(const paragraph of text.split(/\n+/)){const words=paragraph.split(/\s+/);let line='';for(const word of words){const test=line?line+' '+word:word;if(font.widthOfTextAtSize(test,size)>width-2*margin){if(y<margin+lineHeight){page=doc.addPage();y=page.getHeight()-margin;width=page.getWidth();height=page.getHeight();}page.drawText(line,{x:margin,y,size,font});y-=lineHeight;line=word;}else line=test;}if(line){if(y<margin+lineHeight){page=doc.addPage();y=page.getHeight()-margin;}page.drawText(line,{x:margin,y,size,font});y-=lineHeight;}y-=8;}download(await doc.save(),f.name.replace(/\.docx$/i,'')+'.pdf');status('wordPdfStatus','Text converted to PDF. Complex formatting may differ from the original.','success');DH.addActivity('Converted Word to PDF',f.name);}catch(e){status('wordPdfStatus',e.message,'error');}};
  // PDF text to DOCX using PDF.js + docx
  $('runPdfWord').onclick=async()=>{try{if(!window.pdfjsLib||!window.docx)throw Error('PDF or Word conversion library did not load.');const f=$('textPdf').files[0];if(!f)throw Error('Choose a PDF first.');const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise,paras=[];for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),content=await page.getTextContent();const line=content.items.map(x=>x.str).join(' ').trim();paras.push(new docx.Paragraph({text:line||' '}));}const blob=await docx.Packer.toBlob(new docx.Document({sections:[{children:paras}]}));const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=f.name.replace(/\.pdf$/i,'')+'.docx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);status('pdfWordStatus','Editable text document created. Original formatting and images are not preserved.','success');DH.addActivity('Converted PDF to Word',f.name);}catch(e){status('pdfWordStatus',e.message,'error');}};
  // Structural optimization; this cannot recompress all embedded image streams.
  $('runCompress').onclick=async()=>{try{const doc=await readPdf($('compressFile').files[0]);doc.setTitle('');doc.setAuthor('');doc.setSubject('');const bytes=await doc.save({useObjectStreams:true,addDefaultPage:false});download(bytes,'StuHelper-Optimized.pdf');status('compressStatus',`Saved optimized copy (${(bytes.length/1024).toFixed(1)} KB). Size reduction is not guaranteed for every PDF.`, 'success');DH.addActivity('Optimized PDF',`${(bytes.length/1024).toFixed(1)} KB`);}catch(e){status('compressStatus',e.message,'error');}};
});


// Theme preference and responsive navigation.
document.addEventListener('DOMContentLoaded', () => {
  const root=document.documentElement;
  let theme='light';
  try{theme=localStorage.getItem('dh_theme')||'light'}catch{}
  root.dataset.theme=theme;
  document.querySelectorAll('.topbar').forEach(topbar=>{
    if(topbar.querySelector('.topbar-tools'))return;
    const tools=document.createElement('div');tools.className='topbar-tools';
    const menu=document.createElement('button');menu.className='mobile-menu';menu.type='button';menu.setAttribute('aria-label','Open navigation');menu.textContent='☰';
    const toggle=document.createElement('button');toggle.className='theme-toggle';toggle.type='button';toggle.setAttribute('aria-label','Switch colour theme');
    const paint=()=>{toggle.textContent=root.dataset.theme==='dark'?'☀':'☾';toggle.title=root.dataset.theme==='dark'?'Switch to light mode':'Switch to dark mode'};paint();
    toggle.addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('dh_theme',root.dataset.theme)}catch{}paint()});
    menu.addEventListener('click',()=>{const side=document.querySelector('.sidebar');if(side){side.classList.toggle('mobile-open');menu.setAttribute('aria-expanded',String(side.classList.contains('mobile-open')))}});
    tools.append(menu,toggle);topbar.append(tools);
  });
  document.addEventListener('click',e=>{if(e.target.closest('.sidebar .nav-item'))document.querySelector('.sidebar')?.classList.remove('mobile-open')});
  // Deep-link dashboard PDF cards to the matching tool tab.
  const hash=location.hash.replace('#','');if(hash){const tab=document.querySelector(`.tool-tabs [data-tab="${CSS.escape(hash)}"]`);if(tab)tab.click()}
});

// Library, syllabus and assignment managers.
document.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id);
 const syllabusGroups=$('syllabusGroups');if(syllabusGroups){let chapters=DH.get('syllabus',[]);const render=()=>{const done=chapters.filter(c=>c.done).length;$('syllabusTotal').textContent=chapters.length;$('syllabusDone').textContent=done;$('syllabusPercent').textContent=(chapters.length?Math.round(done/chapters.length*100):0)+'%';syllabusGroups.innerHTML='';const groups={};chapters.forEach(c=>(groups[c.subject]??=[]).push(c));if(!chapters.length)syllabusGroups.innerHTML='<div class="empty-state">Your syllabus is empty. Add your first subject and chapter above.</div>';Object.entries(groups).forEach(([subject,list])=>{const box=document.createElement('section');box.className='panel syllabus-group';box.innerHTML=`<div class="syllabus-group-head"><h2>${escapeHTML(subject)}</h2><span>${list.filter(x=>x.done).length}/${list.length} completed</span></div><div class="progress"><span style="width:${list.filter(x=>x.done).length/list.length*100}%"></span></div><div class="file-list"></div>`;const listEl=box.querySelector('.file-list');list.forEach(ch=>{const row=document.createElement('div');row.className='file-item';row.innerHTML=`<label class="task-check"><input type="checkbox" ${ch.done?'checked':''}><span class="${ch.done?'task-done':''}">${escapeHTML(ch.chapter)}</span></label><span class="chapter-priority ${escapeHTML(ch.priority||'Medium')}">${escapeHTML(ch.priority||'Medium')}</span>${ch.target?`<span class="chapter-target">Target ${new Date(ch.target+'T00:00:00').toLocaleDateString()}</span>`:''}<button class="btn danger">Remove</button>`;row.querySelector('input').onchange=e=>{ch.done=e.target.checked;DH.set('syllabus',chapters);render()};row.querySelector('button').onclick=()=>{chapters=chapters.filter(x=>x.id!==ch.id);DH.set('syllabus',chapters);render()};listEl.append(row)});syllabusGroups.append(box)})};$('addChapter').onclick=()=>{const subject=$('syllabusSubject').value.trim(),chapter=$('syllabusChapter').value.trim();if(!subject||!chapter){$('syllabusChapter').focus();return}chapters.push({id:Date.now(),subject,chapter,done:false});DH.set('syllabus',chapters);$('syllabusChapter').value='';render()};render();}
 const assignmentList=$('assignmentList');if(assignmentList){let items=DH.get('assignments',[]);const render=()=>{const f=$('assignmentFilter').value,shown=items.filter(x=>f==='all'||(f==='done'?x.done:!x.done));const pending=items.filter(x=>!x.done).length,overdue=items.filter(x=>!x.done&&x.due&&x.due<new Date().toISOString().slice(0,10)).length;$('assignmentSummary').innerHTML=`<div class="stat-card"><span>Total</span><strong>${items.length}</strong></div><div class="stat-card"><span>Pending</span><strong>${pending}</strong></div><div class="stat-card"><span>Overdue</span><strong>${overdue}</strong></div><div class="stat-card"><span>Completed</span><strong>${items.length-pending}</strong></div>`;assignmentList.innerHTML=shown.length?'':'<div class="empty-state">Nothing here yet. Add an assignment to get started.</div>';shown.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).forEach(item=>{const row=document.createElement('article');row.className='assignment-card '+(item.done?'is-done':'');const late=!item.done&&item.due&&item.due<new Date().toISOString().slice(0,10);row.innerHTML=`<label class="task-check"><input type="checkbox" ${item.done?'checked':''}><span></span></label><div class="assignment-main"><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.subject||'General')} · Due ${item.due?new Date(item.due+'T00:00:00').toLocaleDateString():'No date'}</p>${item.details?`<small class="assignment-details">${escapeHTML(item.details)}</small>`:''}${item.estimate?`<small class="assignment-details">Estimated time: ${escapeHTML(item.estimate)} min</small>`:''}</div><span class="priority ${(item.priority||'Medium').toLowerCase()}">${escapeHTML(item.priority||'Medium')}</span>${late?'<span class="overdue-label">Overdue</span>':''}<button class="btn danger">Remove</button>`;row.querySelector('input').onchange=e=>{item.done=e.target.checked;DH.set('assignments',items);render()};row.querySelector('button').onclick=()=>{items=items.filter(x=>x.id!==item.id);DH.set('assignments',items);render()};assignmentList.append(row)})};$('addAssignment').onclick=()=>{const title=$('assignmentTitle').value.trim();if(!title){$('assignmentTitle').focus();return}items.push({id:Date.now(),title,subject:$('assignmentSubject').value.trim(),due:$('assignmentDue').value,priority:$('assignmentPriority').value,done:false});DH.set('assignments',items);$('assignmentTitle').value='';$('assignmentSubject').value='';$('assignmentDue').value='';render();DH.addActivity('Added assignment',title)};$('assignmentFilter').onchange=render;render();}
});
