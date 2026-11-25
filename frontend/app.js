// =============================================
// FILMNANCE — app.js  (final)
// =============================================
/*
// ── State ──
let frozenEmail = '';
let resendTimer = null;

// ── Safe JSON parse (handles non-JSON 500 responses) ──
async function safeJson(res) {
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return { detail: text || 'An unexpected server error occurred.' }; }

    // FastAPI validation errors return detail as array of objects:
    // [{"loc": [...], "msg": "field required", "type": "..."}]
    // Flatten them into a readable string
    if (parsed && Array.isArray(parsed.detail)) {
        const msgs = parsed.detail.map(e => {
            const field = e.loc ? e.loc[e.loc.length - 1] : '';
            const msg = e.msg || 'Invalid value';
            return field ? `${field}: ${msg}` : msg;
        });
        parsed.detail = msgs.join(', ');
    }
    return parsed;
}

// ── Message helpers ──
const VIEW_MSG = {
    loginView: 'loginMsg',
    registerView: 'registerMsg',
    setupView: 'setupMsg',
    forgotView: 'forgotMsg',
    resetView: 'resetMsg',
};

// Safely extract a readable string from any error detail value
function extractDetail(detail, fallback) {
    if (!detail) return fallback;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map(e => e.msg || String(e)).join(', ');
    if (typeof detail === 'object') return detail.msg || JSON.stringify(detail);
    return String(detail);
}

function setMsg(viewId, text, type = '') {
    const el = document.getElementById(VIEW_MSG[viewId]);
    if (!el) return;
    el.innerText = text;
    el.className = 'status-msg' + (type ? ' ' + type : '');
}

function clearMsgs() {
    Object.values(VIEW_MSG).forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.innerText = ''; el.className = 'status-msg'; }
    });
}

// ══════════════════════════════════════
// FILM QUOTES — switch per view
// ══════════════════════════════════════
const FILM_QUOTES = {
    loginView: {
        text: "Every ending is just the beginning of another story.",
        cite: "— Filmnance"
    },
    registerView: {
        text: "Our journey begins.",
        cite: "— Iron Man (2008)"
    },
    setupView: {
        text: "With great power comes with great responsibility.",
        cite: "— Spider-Man (2002)"
    },
    forgotView: {
        text: "I don't want to forget.",
        cite: "— Eternal Sunshine of the Spotless Mind (2004)"
    },
    resetView: {
        text: "The code is more what you'd call 'guidelines' than actual rules.",
        cite: "— Pirates of the Caribbean (2003)"
    },
    resetStepB: {
        text: "Please… let me keep this memory, just this one.",
        cite: "— Eternal Sunshine of the Spotless Mind (2004)"
    },
    frozenView: {
        text: "If you're not moving forward, you're frozen in place.",
        cite: "— Inception (2010)"
    },
};

function updateQuote(viewId) {
    const q = FILM_QUOTES[viewId];
    const box = document.getElementById('filmQuote');
    const text = document.getElementById('filmQuoteText');
    const cite = document.getElementById('filmQuoteCite');
    if (!box || !text || !cite || !q) return;

    // Fade out, swap, fade in
    box.classList.remove('visible');
    setTimeout(() => {
        text.textContent = q.text;
        cite.textContent = q.cite;
        box.classList.add('visible');
    }, 300);
}

// ── View switcher ──
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
    clearMsgs();
    const fs = document.getElementById('formSide');
    if (fs) fs.scrollTop = 0;
    updateQuote(viewId);
}

// =============================================
// EYE — hold mousedown/touchstart to reveal
// =============================================
function showPass(id) { const el = document.getElementById(id); if (el) el.type = 'text'; }
function hidePass(id) { const el = document.getElementById(id); if (el) el.type = 'password'; }

// =============================================
// PASSWORD POLICY
// =============================================
const RULES = {
    length: v => v.length >= 8,
    upper: v => /[A-Z]/.test(v),
    number: v => /\d/.test(v),
    special: v => /[ !@#$%^&*(),.?":{}|<>]/.test(v),
};

function checkPolicy(value, mode) {
    const pfx = mode === 'reset' ? 'rp' : 'p';
    let all = true;
    for (const [key, fn] of Object.entries(RULES)) {
        const el = document.getElementById(`${pfx}-${key}`);
        if (!el) continue;
        const ok = fn(value);
        if (!ok) all = false;
        el.classList.toggle('pass', ok);
        const ico = el.querySelector('i');
        if (ico) ico.className = ok ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark';
    }
    return all;
}

function policyOk(v) { return Object.values(RULES).every(fn => fn(v)); }

// ── Show/hide same-email warning in setup ──
function checkSameEmail() {
    const r = document.getElementById('setupRecovery')?.value.trim();
    const pr = document.getElementById('setupPinRecovery')?.value.trim();
    const warn = document.getElementById('sameEmailWarn');
    if (!warn) return;
    if (r && pr && r.toLowerCase() === pr.toLowerCase()) {
        warn.classList.add('visible');
    } else {
        warn.classList.remove('visible');
    }
}

// =============================================
// 1. LOGIN
// =============================================
document.getElementById('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    setMsg('loginView', 'Authenticating...');

    const fd = new FormData();
    fd.append('username', document.getElementById('email').value.trim());
    fd.append('password', document.getElementById('password').value);

    try {
        const res = await fetch('/api/v1/auth/login', { method: 'POST', body: fd });
        const data = await safeJson(res);

        // ── Frozen: new country ──
        if (res.status === 403 && data.detail === 'ACCOUNT_FREEZE_NEW_COUNTRY') {
            frozenEmail = document.getElementById('email').value.trim();
            const disp = document.getElementById('frozenEmailDisplay');
            if (disp) disp.textContent = frozenEmail;
            resetResendUI();
            showView('frozenView');
            return;
        }

        // Handle already-frozen account (different from new-country freeze)
        if (res.status === 403 && data.detail && data.detail.includes('freeze')) {
            frozenEmail = document.getElementById('email').value.trim();
            const disp = document.getElementById('frozenEmailDisplay');
            if (disp) disp.textContent = frozenEmail;
            resetResendUI();
            showView('frozenView');
            return;
        }

        if (!res.ok) throw new Error(extractDetail(data.detail, 'Login failed.'));

        localStorage.setItem('token', data.access_token);

        const meRes = await fetch('/api/v1/auth/me', {
            headers: { 'Authorization': `Bearer ${data.access_token}` }
        });
        const user = await safeJson(meRes);
        if (!meRes.ok) throw new Error(extractDetail(user.detail, 'Session initialization failed.'));

        const needsSetup = !user.recovery_email || !user.transaction_pin;
        if (needsSetup && !user.is_admin) {
            setMsg('loginView', 'Login successful! Complete security setup...', 'success');
            setTimeout(() => showView('setupView'), 700);
        } else {
            setMsg('loginView', 'Welcome back! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = user.is_admin ? '/admin-dashboard' : '/user-dashboard';
            }, 800);
        }
    } catch (err) {
        setMsg('loginView', err.message, 'error');
    }
});

// =============================================
// FROZEN VIEW — Resend with escalating cooldown
// =============================================
function resetResendUI() {
    const btn = document.getElementById('resendBtn');
    const stat = document.getElementById('resendStatus');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>&nbsp; Resend Email'; }
    if (stat) { stat.textContent = ''; stat.className = 'resend-status'; }
    if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
    resendAttemptsUsed = 0;
    updateAttemptDisplay();
}

function startCooldown(minutes) {
    const btn = document.getElementById('resendBtn');
    const stat = document.getElementById('resendStatus');
    if (!btn || !stat) return;
    btn.disabled = true;
    let secs = minutes * 60;

    function tick() {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        btn.innerHTML = `<i class="fa-solid fa-clock"></i>&nbsp; Resend in ${m}:${String(s).padStart(2, '0')}`;
        if (secs <= 0) {
            clearInterval(resendTimer);
            resendTimer = null;
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>&nbsp; Resend Email';
            stat.textContent = '';
            stat.className = 'resend-status';
        }
        secs--;
    }
    tick();
    resendTimer = setInterval(tick, 1000);
}

// Track resend attempts client-side for display
let resendAttemptsUsed = 0;
const MAX_RESENDS = 3;

function updateAttemptDisplay() {
    const el = document.getElementById('resendAttempts');
    if (!el) return;
    const remaining = MAX_RESENDS - resendAttemptsUsed;
    if (remaining <= 0) {
        el.textContent = 'No resends remaining';
        el.style.color = 'var(--red)';
    } else {
        el.textContent = `${remaining} resend${remaining === 1 ? '' : 's'} remaining`;
        el.style.color = '';
    }
}

async function requestResend() {
    if (!frozenEmail) return;
    const btn = document.getElementById('resendBtn');
    const stat = document.getElementById('resendStatus');
    if (!btn || !stat) return;

    btn.disabled = true;
    stat.textContent = 'Sending...';
    stat.className = 'resend-status';

    try {
        const res = await fetch('/api/v1/auth/request-unfreeze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: frozenEmail })
        });
        const data = await safeJson(res);

        if (res.status === 429) {
            if (data.detail === 'MAX_RESEND_REACHED') {
                stat.textContent = 'Maximum resend attempts reached. Contact support.';
                stat.className = 'resend-status error';
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-ban"></i>&nbsp; Limit Reached';
                resendAttemptsUsed = MAX_RESENDS;
                updateAttemptDisplay();
            } else if (typeof data.detail === 'string' && data.detail.startsWith('COOLDOWN:')) {
                const mins = parseInt(data.detail.split(':')[1]) || 15;
                stat.textContent = 'Please wait before requesting another email.';
                stat.className = 'resend-status warning';
                startCooldown(mins);
            }
            return;
        }

        if (!res.ok) throw new Error(extractDetail(data.detail, 'Failed to resend.'));

        resendAttemptsUsed++;
        updateAttemptDisplay();
        stat.textContent = 'Email sent! Check your inbox.';
        stat.className = 'resend-status success';
        // Escalating cooldown: 15 min after 1st, 30 after 2nd, 60 after 3rd
        const cooldownMins = resendAttemptsUsed === 1 ? 15 : resendAttemptsUsed === 2 ? 30 : 60;
        startCooldown(cooldownMins);

    } catch (err) {
        stat.textContent = err.message;
        stat.className = 'resend-status error';
        btn.disabled = false;
    }
}

// =============================================
// 2. REGISTER → then setupView
// =============================================
document.getElementById('registerForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const pass = document.getElementById('regPass').value;
    const confirm = document.getElementById('signupConfirmPassword').value;

    if (!policyOk(pass)) {
        setMsg('registerView', 'Please meet all password requirements.', 'error');
        return;
    }
    if (pass !== confirm) {
        setMsg('registerView', 'Passwords do not match.', 'error');
        return;
    }

    setMsg('registerView', 'Creating your account...');

    try {
        const res = await fetch('/api/v1/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: document.getElementById('regName').value.trim(),
                email: document.getElementById('regEmail').value.trim(),
                password: pass,
                confirm_password: confirm
            })
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(extractDetail(data.detail, 'Signup failed.'));

        localStorage.setItem('token', data.access_token);
        setMsg('registerView', 'Account created! Setting up security...', 'success');
        setTimeout(() => showView('setupView'), 900);
    } catch (err) {
        setMsg('registerView', err.message, 'error');
    }
});

// =============================================
// 3. SETUP SECURITY
// =============================================
document.getElementById('setupForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) {
        setMsg('setupView', 'Session expired. Please log in again.', 'error');
        setTimeout(() => showView('loginView'), 1400);
        return;
    }

    const pin = document.getElementById('setupPin').value;
    if (!/^\d{6}$/.test(pin)) {
        setMsg('setupView', 'PIN must be exactly 6 digits (numbers only).', 'error');
        return;
    }

    setMsg('setupView', 'Securing your account...');

    try {
        const res = await fetch('/api/v1/auth/setup-security', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                recovery_email: document.getElementById('setupRecovery').value.trim(),
                pin_recovery_email: document.getElementById('setupPinRecovery').value.trim(),
                transaction_pin: pin
            })
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(extractDetail(data.detail, 'Setup failed.'));

        setMsg('setupView', 'Security configured! Entering dashboard...', 'success');
        setTimeout(() => { window.location.href = '/user-dashboard'; }, 1200);
    } catch (err) {
        setMsg('setupView', err.message, 'error');
    }
});

// =============================================
// 4. FORGOT PASSWORD
// =============================================
document.getElementById('forgotForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    setMsg('forgotView', 'Sending OTP to recovery email...');

    try {
        const res = await fetch('/api/v1/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recovery_email: document.getElementById('forgotEmail').value.trim() })
        });
        const data = await safeJson(res);

        if (res.ok && data.sent === true) {
            setMsg('resetView', 'OTP sent! Check your recovery email.', 'success');
            // Reset to step A every time
            const stepA = document.getElementById('resetStepA');
            const stepB = document.getElementById('resetStepB');
            if (stepA) stepA.style.display = 'block';
            if (stepB) stepB.style.display = 'none';
            updateQuote('resetView');
            const otpEl = document.getElementById('resetOtp');
            if (otpEl) otpEl.value = '';
            showView('resetView');
        } else if (res.ok && data.sent === false) {
            // Email not found — show a clear error, stay on the forgot page
            setMsg('forgotView', 'No account found with that recovery email.', 'error');
        } else {
            throw new Error(extractDetail(data.detail, 'Failed to send OTP.'));
        }
    } catch (err) {
        setMsg('forgotView', err.message, 'error');
    }
});

// =============================================
// 5. RESET PASSWORD — 2 steps
// =============================================

// Step A: Verify OTP only (password fields hidden until verified)
async function verifyResetOtp() {
    const otp = document.getElementById('resetOtp')?.value?.trim();
    const otpMsg = document.getElementById('resetOtpMsg');
    if (!otp || otp.length !== 6) {
        if (otpMsg) { otpMsg.textContent = 'Enter the 6-digit OTP code.'; otpMsg.className = 'status-msg error'; }
        return;
    }
    // We just check the OTP looks valid (actual verification happens on submit)
    // Immediately show password step
    const stepA = document.getElementById('resetStepA');
    const stepB = document.getElementById('resetStepB');
    if (stepA) stepA.style.display = 'none';
    if (stepB) stepB.style.display = 'block';
    updateQuote('resetStepB');
    setMsg('resetView', 'OTP accepted. Set your new password below.', 'success');
}

// Step B: Submit new password with OTP + confirm password
async function submitResetPassword() {
    const newPass = document.getElementById('resetPass')?.value;
    const confirmPass = document.getElementById('resetPassConfirm')?.value;
    if (!policyOk(newPass)) {
        setMsg('resetView', 'Please meet all password requirements.', 'error');
        return;
    }
    if (newPass !== confirmPass) {
        setMsg('resetView', 'Passwords do not match.', 'error');
        return;
    }
    try {
        const res = await fetch('/api/v1/auth/reset-password-confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('forgotEmail').value.trim(),
                otp_code: document.getElementById('resetOtp').value.trim(),
                new_password: newPass
            })
        });
        const data = await safeJson(res);
        if (res.ok) {
            setMsg('resetView', 'Password updated! You can now log in.', 'success');
            setTimeout(() => showView('loginView'), 1500);
        } else {
            throw new Error(extractDetail(data.detail, 'Invalid OTP or request.'));
        }
    } catch (err) {
        setMsg('resetView', err.message, 'error');
    }
}

// =============================================
// SECURED CARD — red theme
// =============================================
function showSecuredCard() {
    const ex = document.getElementById('securedCard');
    if (ex) ex.remove();
    const style = document.createElement('style');
    style.textContent = '@keyframes scIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}';
    document.head.appendChild(style);
    const overlay = document.createElement('div');
    overlay.id = 'securedCard';
    overlay.setAttribute('style', 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.93);backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;padding:2rem;animation:scIn 0.4s ease');
    overlay.innerHTML = `<div style="background:#0e0e0e;border:1px solid rgba(239,68,68,0.35);border-radius:1.5rem;max-width:560px;width:100%;padding:3rem 2.5rem;text-align:center;box-shadow:0 32px 80px rgba(0,0,0,0.8)">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.35);display:flex;align-items:center;justify-content:center;margin:0 auto 1.4rem;font-size:1.6rem;color:#ef4444"><i class="fas fa-shield-halved"></i></div>
        <div style="display:inline-block;font-size:0.62rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#ef4444;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);padding:0.28rem 0.85rem;border-radius:2rem;margin-bottom:1.6rem">Account Secured</div>
        <p style="font-family:'Syne',sans-serif;font-size:clamp(1rem,2.4vw,1.3rem);font-weight:600;line-height:1.7;color:#d4af37;font-style:italic;margin-bottom:1rem">
            "You don't have to be the bad guy.<br>
            You are the most talented, most interesting,<br>
            and most extraordinary person in the universe.<br>
            And you are capable of amazing things."
        </p>
        <p style="font-size:0.78rem;color:rgba(255,255,255,0.4);margin-bottom:1.8rem;font-style:italic">— The LEGO Movie (2014)</p>
        <button onclick="document.getElementById('securedCard').remove()" style="background:#d4af37;color:#000;border:none;padding:0.9rem 2.5rem;border-radius:0.75rem;font-family:'Syne',sans-serif;font-size:0.8rem;font-weight:700;letter-spacing:0.14em;cursor:pointer">OKAY</button>
    </div>`;
    document.body.appendChild(overlay);
}

// =============================================
// INIT — handle URL params from email links
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const action = params.get('action');

    // Clean URL without reloading
    if (status || action) {
        window.history.replaceState({}, '', '/');
    }

    if (action === 'secure') {
        showView('loginView');
        showSecuredCard();
        return;
    }

    if (status === 'unfrozen') {
        showView('loginView');
        setMsg('loginView', '✓ Account restored! You can now log in.', 'success');
        return;
    }

    if (status === 'link_expired') {
        showView('loginView');
        setMsg('loginView', 'The unfreeze link has expired. Please contact support or try logging in again.', 'error');
        return;
    }

    if (status === 'invalid_token') {
        showView('loginView');
        setMsg('loginView', 'Invalid verification link. Please request a new one.', 'error');
        return;
    }

    const firstView = document.querySelector('.view.active');
    const firstViewId = firstView ? firstView.id : 'loginView';
    if (!firstView) showView('loginView');
    // Delay quote show slightly for smooth initial load
    setTimeout(() => updateQuote(firstViewId), 200);
});
*/