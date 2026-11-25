// =============================================
// FILMNANCE — login.js
// Login form submit handler.
// Depends on: auth-core.js (safeJson, setMsg, showView,
// extractDetail, resetResendUI from frozen.js)
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
            if (typeof resetResendUI === 'function') resetResendUI();
            showView('frozenView');
            return;
        }

        // Handle already-frozen account (different from new-country freeze)
        if (res.status === 403 && data.detail && data.detail.includes('freeze')) {
            frozenEmail = document.getElementById('email').value.trim();
            const disp = document.getElementById('frozenEmailDisplay');
            if (disp) disp.textContent = frozenEmail;
            if (typeof resetResendUI === 'function') resetResendUI();
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