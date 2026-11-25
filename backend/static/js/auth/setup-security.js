// =============================================
// FILMNANCE — setup-security.js
// Security setup form (recovery emails + transaction PIN)
// submitted right after signup/login when required.
// Depends on: auth-core.js (safeJson, setMsg, showView,
// extractDetail)
// =============================================

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