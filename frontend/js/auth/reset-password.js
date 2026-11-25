// =============================================
// FILMNANCE — reset-password.js
// Password-reset two-step flow:
//   Step A — verify OTP code
//   Step B — enter and confirm new password
// Depends on: auth-core.js (safeJson, setMsg,
// showView, extractDetail, policyOk, updateQuote)
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