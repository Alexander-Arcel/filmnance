// =============================================
// FILMNANCE — signup.js
// Register (sign up) form submit handler.
// Depends on: auth-core.js (safeJson, setMsg, showView,
// extractDetail, policyOk)
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