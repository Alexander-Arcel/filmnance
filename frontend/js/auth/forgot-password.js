// =============================================
// FILMNANCE — forgot-password.js
// Forgot-password form: sends OTP to recovery
// email, then navigates to reset-password view.
// Depends on: auth-core.js (safeJson, setMsg,
// showView, extractDetail, updateQuote)
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