// StuHelper sign-in, registration, email confirmation and password recovery.
import './auth.js';

const A = window.SH_AUTH;
const { Identity } = A;
const $ = id => document.getElementById(id);
const normEmail = e => String(e || '').trim().toLowerCase();
const normPhone = p => String(p || '').replace(/\D/g, '').slice(-10);
const SEMS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'].map(s => s + ' Semester');

const card = document.querySelector('.auth-card');
const alertBox = $('authAlert');
const showAlert = (msg, type = 'error') => { alertBox.textContent = msg; alertBox.className = 'auth-msg ' + type; };
const clearAlert = () => { alertBox.className = 'auth-msg'; alertBox.textContent = ''; };

// ---------- view switching ----------
const PANELS = ['studentPortal', 'adminPortal', 'forgotPanel', 'checkEmailPanel', 'newPassPanel', 'profilePanel'];
let role = 'student';
function show(panel, { keepAlert = false } = {}) {
  if (!keepAlert) clearAlert();
  PANELS.forEach(p => $(p).classList.toggle('hidden', p !== panel));
  document.querySelector('.role-switch').classList.toggle('hidden', !['studentPortal', 'adminPortal'].includes(panel));
}
function setRole(r) {
  role = r;
  $('roleStudentBtn').classList.toggle('active', r === 'student');
  $('roleAdminBtn').classList.toggle('active', r === 'admin');
  show(r === 'admin' ? 'adminPortal' : 'studentPortal');
}
$('roleStudentBtn').onclick = () => setRole('student');
$('roleAdminBtn').onclick = () => setRole('admin');

function showStudentTab(tab) {
  clearAlert();
  $('tabLogin').classList.toggle('active', tab === 'login');
  $('tabRegister').classList.toggle('active', tab !== 'login');
  $('studentLoginForm').classList.toggle('hidden', tab !== 'login');
  $('studentRegisterForm').classList.toggle('hidden', tab === 'login');
}
$('tabLogin').onclick = () => showStudentTab('login');
$('tabRegister').onclick = () => showStudentTab('register');
$('switchToRegLink').onclick = e => { e.preventDefault(); showStudentTab('register'); };

document.querySelectorAll('.forgot-link').forEach(a => a.onclick = e => {
  e.preventDefault();
  $('forgotEmail').value = $(role === 'admin' ? 'adminEmail' : 'stuLoginId').value;
  show('forgotPanel');
});
document.querySelectorAll('.back-link:not(#profileSignOut)').forEach(a => a.onclick = e => { e.preventDefault(); setRole(role); });

document.addEventListener('click', e => {
  const btn = e.target.closest('.pw-eye');
  if (!btn) return;
  const input = $(btn.dataset.target);
  if (!input) return;
  const reveal = input.type === 'password';
  input.type = reveal ? 'text' : 'password';
  btn.textContent = reveal ? '🙈' : '👁️';
});

$('pfSem').innerHTML = SEMS.map(s => `<option value="${s}">${s}</option>`).join('');

// Loading state for a form's submit button.
async function busy(btn, label, fn) {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span>${label}`;
  card.classList.add('busy');
  try { return await fn(); }
  finally { btn.disabled = false; btn.innerHTML = original; card.classList.remove('busy'); }
}

function friendlyError(err) {
  const msg = String(err?.message || err || '');
  if (err instanceof Identity.MissingIdentityError) return 'Sign-in is still being set up for this site. Please try again in a minute.';
  if (/not confirmed/i.test(msg)) return 'Please confirm your email first — open the link we sent to your inbox.';
  if (/already (been )?registered|already exists/i.test(msg)) return 'This email is already registered. Please sign in instead.';
  if (/invalid.*(grant|password|credentials)|no user found|401/i.test(msg) || err?.status === 401) return 'Incorrect email or password. Please try again.';
  if (/signups? not allowed/i.test(msg) || err?.status === 403) return 'New registrations are currently closed. Contact your administrator.';
  if (/password/i.test(msg) && err?.status === 422) return 'Please choose a stronger password (at least 8 characters).';
  if (/failed to fetch|network/i.test(msg)) return 'Network problem — check your internet connection and try again.';
  return msg || 'Something went wrong. Please try again.';
}

// ---------- after a successful sign-in ----------
async function finishSignIn({ expectAdmin = false } = {}) {
  let me;
  try { me = await A.loadMe(); }
  catch (e) {
    await A.logout();
    if (e.data?.error === 'suspended') return showAlert('Your student account has been suspended by the administrator.');
    throw e;
  }
  if (expectAdmin && !me.isAdmin) {
    await A.logout();
    setRole('admin');
    return showAlert('This account does not have administrator access.');
  }
  if (me.isAdmin) {
    sessionStorage.removeItem('dh_admin_preview');
    location.replace('admin.html');
    return;
  }
  if (!me.profile) return showProfileForm(me);
  showAlert('Signed in! Loading your workspace…', 'success');
  try { await A.syncContent(); } catch {}
  location.replace('index.html');
}

function showProfileForm(me) {
  const m = me?.user || {};
  if (!$('pfName').value && m.name && m.name !== m.email) $('pfName').value = m.name;
  show('profilePanel', { keepAlert: true });
  if (me?.profileError) showAlert(me.profileError);
}

// ---------- student login ----------
$('studentLoginForm').onsubmit = e => {
  e.preventDefault();
  clearAlert();
  const email = normEmail($('stuLoginId').value);
  const password = $('stuLoginPass').value;
  busy(e.submitter || e.target.querySelector('[type=submit]'), 'Signing in…', async () => {
    try {
      await Identity.login(email, password);
      await finishSignIn();
    } catch (err) { showAlert(friendlyError(err)); }
  });
};

// ---------- admin login ----------
$('adminLoginForm').onsubmit = e => {
  e.preventDefault();
  clearAlert();
  busy(e.submitter || e.target.querySelector('[type=submit]'), 'Verifying…', async () => {
    try {
      await Identity.login(normEmail($('adminEmail').value), $('adminPass').value);
      await finishSignIn({ expectAdmin: true });
    } catch (err) { showAlert(friendlyError(err)); }
  });
};

// ---------- registration ----------
let pendingSignup = null;
$('studentRegisterForm').onsubmit = e => {
  e.preventDefault();
  clearAlert();
  const data = {
    full_name: $('regName').value.trim(),
    roll_no: $('regRoll').value.trim(),
    course: $('regCourse').value.trim(),
    semester: $('regSem').value,
    phone: normPhone($('regPhone').value)
  };
  const email = normEmail($('regEmail').value);
  const password = $('regPass').value;
  if (!email.includes('@')) return showAlert('Please enter a valid email address.');
  if (data.phone.length !== 10) return showAlert('Please enter a valid 10-digit mobile number.');
  if (password.length < 8) return showAlert('Password must be at least 8 characters.');

  busy(e.submitter || e.target.querySelector('[type=submit]'), 'Creating account…', async () => {
    try {
      const check = await fetch('/api/check-available', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, phone: data.phone }) }).then(r => r.ok ? r.json() : {});
      if (check.adminEmail) return showAlert('This email is reserved for the administrator. Use the Admin Login tab.');
      if (check.emailTaken) return showAlert('This email is already registered. Please sign in instead.');
      if (check.phoneTaken) return showAlert(`This mobile number (+91 ${data.phone}) is already registered with another account.`);

      const user = await Identity.signup(email, password, data);
      if (user.emailVerified || user.confirmedAt) {
        await finishSignIn();
      } else {
        pendingSignup = { email, password, data };
        $('checkEmailText').textContent = `We sent a confirmation link to ${email}. Open it to activate your account — you'll be signed in automatically.`;
        show('checkEmailPanel');
      }
    } catch (err) { showAlert(friendlyError(err)); }
  });
};

$('resendBtn').onclick = e => {
  if (!pendingSignup) return setRole('student');
  busy(e.currentTarget, 'Sending…', async () => {
    try {
      await Identity.signup(pendingSignup.email, pendingSignup.password, pendingSignup.data);
      showAlert('Confirmation email sent again. Check your inbox and spam folder.', 'success');
    } catch (err) { showAlert(friendlyError(err)); }
  });
};

// ---------- forgot / new password ----------
$('forgotForm').onsubmit = e => {
  e.preventDefault();
  busy(e.submitter || e.target.querySelector('[type=submit]'), 'Sending…', async () => {
    try {
      await Identity.requestPasswordRecovery(normEmail($('forgotEmail').value));
    } catch {}
    // Same message either way, so accounts can't be discovered from this form.
    showAlert('If that email is registered, a reset link is on its way. Check your inbox.', 'success');
  });
};

let inviteToken = null;
$('newPassForm').onsubmit = e => {
  e.preventDefault();
  const password = $('newPass').value;
  if (password.length < 8) return showAlert('Password must be at least 8 characters.');
  busy(e.submitter || e.target.querySelector('[type=submit]'), 'Saving…', async () => {
    try {
      if (inviteToken) await Identity.acceptInvite(inviteToken, password);
      else await Identity.updateUser({ password });
      inviteToken = null;
      await finishSignIn();
    } catch (err) { showAlert(friendlyError(err)); }
  });
};

// ---------- complete profile ----------
$('profileForm').onsubmit = e => {
  e.preventDefault();
  const body = { full_name: $('pfName').value.trim(), roll_no: $('pfRoll').value.trim(), course: $('pfCourse').value.trim(), semester: $('pfSem').value, phone: normPhone($('pfPhone').value) };
  if (body.phone.length !== 10) return showAlert('Please enter a valid 10-digit mobile number.');
  busy(e.submitter || e.target.querySelector('[type=submit]'), 'Saving…', async () => {
    try {
      await A.api('/api/me/profile', { method: 'POST', body });
      try { await Identity.updateUser({ data: body }); } catch {}
      await finishSignIn();
    } catch (err) { showAlert(err.data?.error || friendlyError(err)); }
  });
};
$('profileSignOut').onclick = async e => { e.preventDefault(); await A.logout(); setRole('student'); };

// ---------- page load ----------
(async () => {
  const params = new URLSearchParams(location.search);
  if (params.has('suspended')) showAlert('Your student account has been suspended by the administrator.');
  else if (params.has('expired')) showAlert('Your session expired. Please sign in again.', 'info');
  else if (params.has('signedout')) showAlert('You have been signed out.', 'info');
  if (params.has('admin')) setRole('admin');

  // Links from emails: confirm account, reset password, accept invite.
  if (/_token=|access_token=/.test(location.hash)) {
    card.classList.add('busy');
    try {
      const result = await Identity.handleAuthCallback();
      history.replaceState(null, '', location.pathname + location.search);
      if (result?.type === 'recovery') {
        show('newPassPanel');
        showAlert('Choose a new password for your account.', 'info');
        return;
      }
      if (result?.type === 'invite') {
        inviteToken = result.token;
        $('newPassTitle').textContent = 'Welcome to StuHelper';
        $('newPassSub').textContent = 'Set a password to activate your invited account.';
        show('newPassPanel');
        return;
      }
      if (result?.user) {
        showAlert(result.type === 'confirmation' ? 'Email confirmed! Signing you in…' : 'Signing you in…', 'success');
        await finishSignIn();
        return;
      }
    } catch (err) {
      showAlert(/expired|invalid/i.test(String(err?.message)) ? 'This link has expired or was already used. Please sign in or request a new link.' : friendlyError(err));
    } finally {
      card.classList.remove('busy');
    }
  }

  // Already signed in? Go straight to the workspace.
  try {
    const user = await Identity.getUser();
    if (user) {
      card.classList.add('busy');
      await finishSignIn();
    } else {
      A.clearSession();
    }
  } catch (err) {
    A.clearSession();
    if (err?.status !== 401) console.warn(err);
  } finally {
    card.classList.remove('busy');
  }
})();

