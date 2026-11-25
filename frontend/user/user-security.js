// ============================================================
// FILMNANCE — user-security.js  (FIXED)
// • Tabs are full-page switches; inactive tab disabled mid-flow
// • "← Back" on step 1 closes modal and opens Settings
// • "← Start over" on steps 2/3 resets to step 1 (stays in modal)
// • Eye = HOLD to show (mousedown/touchstart), release hides
// • PIN fields have eye icons
// • Password policy: no lowercase requirement
// • PIN Change button has spacing above it
// ============================================================
'use strict';

let _activeSecTab = 'Password';
let _secFlowActive = false;

function _setFlowActive(active) {
    _secFlowActive = active;
    const inactiveId = _activeSecTab === 'Password' ? 'secBtnPin' : 'secBtnPassword';
    const btn = document.getElementById(inactiveId);
    if (!btn) return;
    if (active) {
        btn.setAttribute('disabled', 'disabled');
        btn.style.opacity = '0.35';
        btn.style.cursor = 'not-allowed';
    } else {
        btn.removeAttribute('disabled');
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}

function switchSecTab(tab, btn) {
    if (_secFlowActive) return;
    _activeSecTab = tab;
    document.querySelectorAll('.sec-tab').forEach(b => {
        b.classList.remove('active'); b.removeAttribute('disabled');
        b.style.opacity = '1'; b.style.cursor = 'pointer';
    });
    if (btn) btn.classList.add('active');
    const pwPanel = document.getElementById('secTabPassword');
    const pinPanel = document.getElementById('secTabPin');
    if (pwPanel) pwPanel.style.display = tab === 'Password' ? 'block' : 'none';
    if (pinPanel) pinPanel.style.display = tab === 'Pin' ? 'block' : 'none';
    _resetSecFlows();
}

// Reset all flow state but keep the modal open
function _resetSecFlows() {
    showPwStep(1);
    showPinStep(1);
    setModalMsg('secPasswordMsg', '');
    setModalMsg('secPinMsg', '');
    _pwAttempts = 0;
    _pinAttempts = 0;
    _updateAttemptDisplay('pwAttemptsLeft', MAX_ATTEMPTS);
    _updateAttemptDisplay('pinAttemptsLeft', MAX_ATTEMPTS);
    window._secPwOtp = null;
    window._secPinOtp = null;
    _setFlowActive(false);
    // Reset all password fields back to hidden
    ['secOldPass', 'secNewPass', 'secConfirmPass', 'secCurrentPin', 'secNewPin'].forEach(id => {
        const inp = document.getElementById(id);
        if (inp) inp.type = 'password';
    });
}

// Called when modal first opens — always start on Password tab at step 1
function openSecurityModal() {
    _activeSecTab = 'Password';
    const pwPanel = document.getElementById('secTabPassword');
    const pinPanel = document.getElementById('secTabPin');
    if (pwPanel) pwPanel.style.display = 'block';
    if (pinPanel) pinPanel.style.display = 'none';
    document.querySelectorAll('.sec-tab').forEach(b => b.classList.remove('active'));
    const pwBtn = document.getElementById('secBtnPassword');
    if (pwBtn) pwBtn.classList.add('active');
    _resetSecFlows();
}

// "Back to Settings" — used on step 1 back buttons only
function secBackToSettings() {
    _resetSecFlows();
    closeModal('securityModal');
    if (typeof openSettingsModal === 'function') openSettingsModal();
}

// "Start over" — resets to step 1 but stays inside the security modal
function secStartOver() {
    _resetSecFlows();
}

/* ─── Attempt tracking ─── */
let _pwAttempts = 0;
let _pinAttempts = 0;
const MAX_ATTEMPTS = 5;

function _updateAttemptDisplay(elId, left) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (left >= MAX_ATTEMPTS) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.textContent = `${left} attempt${left !== 1 ? 's' : ''} remaining`;
    el.style.color = left <= 2 ? 'var(--error)' : 'var(--warn)';
}

/* ─── Eye: HOLD to show, release to hide ─── */
function bindEyeHold(btnEl, inputId) {
    if (!btnEl) return;
    const inp = document.getElementById(inputId);
    const icon = btnEl.querySelector('i');
    if (!inp) return;

    function show(e) {
        if (e) e.preventDefault();
        inp.type = 'text';
        if (icon) icon.className = 'fas fa-eye-slash';
    }
    function hide() {
        inp.type = 'password';
        if (icon) icon.className = 'fas fa-eye';
    }

    // Remove any old listeners by cloning (safe re-bind)
    const newBtn = btnEl.cloneNode(true);
    btnEl.parentNode.replaceChild(newBtn, btnEl);
    const newIcon = newBtn.querySelector('i');

    newBtn.addEventListener('mousedown', function (e) { e.preventDefault(); newBtn.querySelector && (newBtn.querySelector('i').className = 'fas fa-eye-slash'); inp.type = 'text'; });
    newBtn.addEventListener('touchstart', function (e) { e.preventDefault(); inp.type = 'text'; if (newBtn.querySelector('i')) newBtn.querySelector('i').className = 'fas fa-eye-slash'; }, { passive: false });
    document.addEventListener('mouseup', function () { inp.type = 'password'; if (newBtn.querySelector('i')) newBtn.querySelector('i').className = 'fas fa-eye'; });
    document.addEventListener('touchend', function () { inp.type = 'password'; if (newBtn.querySelector('i')) newBtn.querySelector('i').className = 'fas fa-eye'; });
    document.addEventListener('touchcancel', function () { inp.type = 'password'; if (newBtn.querySelector('i')) newBtn.querySelector('i').className = 'fas fa-eye'; });
}

// Bind all eye buttons after page load
document.addEventListener('DOMContentLoaded', function () {
    [
        ['eyeOldPass', 'secOldPass'],
        ['eyeNewPass', 'secNewPass'],
        ['eyeConfirmPass', 'secConfirmPass'],
        ['eyeCurrentPin', 'secCurrentPin'],
        ['eyeNewPin', 'secNewPin'],
    ].forEach(function (pair) {
        const btn = document.getElementById(pair[0]);
        if (btn) bindEyeHold(btn, pair[1]);
    });
});

/* ═══════════════════════════════
   PASSWORD FLOW — 3 steps
   ═══════════════════════════════ */

function showPwStep(n) {
    [1, 2, 3].forEach(i => {
        const el = document.getElementById('pwStep' + i);
        if (el) el.style.display = i === n ? 'block' : 'none';
    });
    _setFlowActive(n > 1);
}

async function requestPasswordOtp() {
    const recoveryEmail = document.getElementById('secRecoveryEmail')?.value?.trim();
    if (!recoveryEmail) { setModalMsg('secPasswordMsg', 'Enter your recovery email address.', 'error'); return; }
    if (_pwAttempts >= MAX_ATTEMPTS) { setModalMsg('secPasswordMsg', 'Too many attempts. Try again later.', 'error'); return; }

    setModalMsg('secPasswordMsg', 'Sending OTP…');
    try {
        const res = await fetch('/api/v1/auth/update-security-request', {
            method: 'POST', headers: getHeaders(),
            body: JSON.stringify({ recovery_email: recoveryEmail })
        });
        const data = await safeJson(res);
        if (res.ok) {
            _pwAttempts = 0; _updateAttemptDisplay('pwAttemptsLeft', MAX_ATTEMPTS);
            setModalMsg('secPasswordMsg', '✓ OTP sent to your recovery email.', 'success');
            showPwStep(2);
        } else {
            _pwAttempts++;
            const left = MAX_ATTEMPTS - _pwAttempts; _updateAttemptDisplay('pwAttemptsLeft', left);
            setModalMsg('secPasswordMsg',
                (data.detail || 'Recovery email not found.') +
                (left > 0 ? ` (${left} attempt${left !== 1 ? 's' : ''} left)` : ''), 'error');
        }
    } catch { setModalMsg('secPasswordMsg', 'Network error. Try again.', 'error'); }
}

async function verifyPasswordOtp() {
    const otp = document.getElementById('secPwOtp')?.value?.trim();
    if (!otp || otp.length !== 6) { setModalMsg('secPasswordMsg', 'Enter the 6-digit OTP.', 'error'); return; }
    setModalMsg('secPasswordMsg', 'Verifying OTP…');
    try {
        const res = await fetch('/api/v1/auth/update-security-confirm', {
            method: 'PATCH', headers: getHeaders(),
            body: JSON.stringify({ otp_code: otp, verify_only: true })
        });
        const data = await safeJson(res);
        if (!res.ok && (data.detail || '').toLowerCase().includes('invalid')) {
            setModalMsg('secPasswordMsg', data.detail || 'Invalid OTP code.', 'error'); return;
        }
        window._secPwOtp = otp; setModalMsg('secPasswordMsg', ''); showPwStep(3);
    } catch {
        window._secPwOtp = otp; setModalMsg('secPasswordMsg', ''); showPwStep(3);
    }
}

async function confirmPasswordChange() {
    const otp = window._secPwOtp;
    const oldPw = document.getElementById('secOldPass')?.value;
    const newPw = document.getElementById('secNewPass')?.value;
    const confirmPw = document.getElementById('secConfirmPass')?.value;

    if (!oldPw) { setModalMsg('secPasswordMsg', 'Enter your current password.', 'error'); return; }
    if (!newPw) { setModalMsg('secPasswordMsg', 'Enter a new password.', 'error'); return; }
    const policy = validatePasswordPolicy(newPw);
    if (!policy.ok) { setModalMsg('secPasswordMsg', policy.msg, 'error'); return; }
    if (newPw !== confirmPw) { setModalMsg('secPasswordMsg', 'Passwords do not match.', 'error'); return; }
    if (!otp) { setModalMsg('secPasswordMsg', 'OTP missing. Please restart.', 'error'); showPwStep(1); return; }

    setModalMsg('secPasswordMsg', 'Changing password…');
    try {
        const res = await fetch('/api/v1/auth/update-security-confirm', {
            method: 'PATCH', headers: getHeaders(),
            body: JSON.stringify({ otp_code: otp, old_password: oldPw, new_password: newPw })
        });
        const data = await safeJson(res);
        if (res.ok) {
            setModalMsg('secPasswordMsg', '✓ Password changed successfully!', 'success');
            window._secPwOtp = null; _setFlowActive(false);
            setTimeout(() => { closeModal('securityModal'); showPwStep(1); }, 1800);
        } else {
            setModalMsg('secPasswordMsg', data.detail || 'Change failed.', 'error');
        }
    } catch { setModalMsg('secPasswordMsg', 'Network error.', 'error'); }
}

// Password policy — NO lowercase requirement
function validatePasswordPolicy(pw) {
    if (pw.length < 8) return { ok: false, msg: 'Password must be at least 8 characters.' };
    if (!/[A-Z]/.test(pw)) return { ok: false, msg: 'Must contain an uppercase letter.' };
    if (!/[0-9]/.test(pw)) return { ok: false, msg: 'Must contain a number.' };
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw))
        return { ok: false, msg: 'Must contain a special character.' };
    return { ok: true };
}

function checkPasswordPolicy() {
    const pw = document.getElementById('secNewPass')?.value || '';
    const indicator = document.getElementById('pwPolicyIndicator');
    if (!indicator) return;
    const checks = [
        { test: pw.length >= 8, label: 'At least 8 characters' },
        { test: /[A-Z]/.test(pw), label: 'Uppercase letter' },
        { test: /[0-9]/.test(pw), label: 'Number' },
        { test: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw), label: 'Special character' },
    ];
    indicator.innerHTML = checks.map(c =>
        `<div style="display:flex;align-items:center;gap:.4rem;font-size:.72rem;color:${c.test ? 'var(--success)' : 'var(--text-dim)'}">
            <i class="fas fa-${c.test ? 'check' : 'circle'}" style="width:10px"></i>${c.label}
        </div>`
    ).join('');
}

/* ═══════════════════════════════
   PIN FLOW — 3 steps
   ═══════════════════════════════ */

function showPinStep(n) {
    [1, 2, 3].forEach(i => {
        const el = document.getElementById('pinStep' + i);
        if (el) el.style.display = i === n ? 'block' : 'none';
    });
    _setFlowActive(n > 1);
}

async function requestPinOtp() {
    const recoveryPinEmail = document.getElementById('secRecoveryPinEmail')?.value?.trim();
    if (!recoveryPinEmail) { setModalMsg('secPinMsg', 'Enter your PIN recovery email address.', 'error'); return; }
    if (_pinAttempts >= MAX_ATTEMPTS) { setModalMsg('secPinMsg', 'Too many attempts. Try again later.', 'error'); return; }

    setModalMsg('secPinMsg', 'Sending OTP…');
    try {
        const res = await fetch('/api/v1/auth/update-security-request', {
            method: 'POST', headers: getHeaders(),
            body: JSON.stringify({ recovery_email: recoveryPinEmail })
        });
        const data = await safeJson(res);
        if (res.ok) {
            _pinAttempts = 0; _updateAttemptDisplay('pinAttemptsLeft', MAX_ATTEMPTS);
            setModalMsg('secPinMsg', '✓ OTP sent to your PIN recovery email.', 'success');
            showPinStep(2);
        } else {
            _pinAttempts++;
            const left = MAX_ATTEMPTS - _pinAttempts; _updateAttemptDisplay('pinAttemptsLeft', left);
            setModalMsg('secPinMsg',
                (data.detail || 'Recovery email not found.') +
                (left > 0 ? ` (${left} attempt${left !== 1 ? 's' : ''} left)` : ''), 'error');
        }
    } catch { setModalMsg('secPinMsg', 'Network error.', 'error'); }
}

async function verifyPinOtp() {
    const otp = document.getElementById('secPinOtp')?.value?.trim();
    if (!otp || otp.length !== 6) { setModalMsg('secPinMsg', 'Enter the 6-digit OTP.', 'error'); return; }
    setModalMsg('secPinMsg', 'Verifying OTP…');
    try {
        const res = await fetch('/api/v1/auth/update-security-confirm', {
            method: 'PATCH', headers: getHeaders(),
            body: JSON.stringify({ otp_code: otp, verify_only: true })
        });
        const data = await safeJson(res);
        if (!res.ok && (data.detail || '').toLowerCase().includes('invalid')) {
            setModalMsg('secPinMsg', data.detail || 'Invalid OTP code.', 'error'); return;
        }
        window._secPinOtp = otp; setModalMsg('secPinMsg', ''); showPinStep(3);
    } catch {
        window._secPinOtp = otp; setModalMsg('secPinMsg', ''); showPinStep(3);
    }
}

async function confirmPinChange() {
    const otp = window._secPinOtp;
    const curPin = document.getElementById('secCurrentPin')?.value;
    const newPin = document.getElementById('secNewPin')?.value;

    if (!curPin || !/^\d{6}$/.test(curPin)) { setModalMsg('secPinMsg', 'Enter your current 6-digit PIN.', 'error'); return; }
    if (!newPin || !/^\d{6}$/.test(newPin)) { setModalMsg('secPinMsg', 'New PIN must be 6 digits.', 'error'); return; }
    if (!otp) { setModalMsg('secPinMsg', 'OTP missing. Please restart.', 'error'); showPinStep(1); return; }

    setModalMsg('secPinMsg', 'Changing PIN…');
    try {
        const res = await fetch('/api/v1/auth/update-security-confirm', {
            method: 'PATCH', headers: getHeaders(),
            body: JSON.stringify({ otp_code: otp, current_transaction_pin: curPin, new_transaction_pin: newPin })
        });
        const data = await safeJson(res);
        if (res.ok) {
            setModalMsg('secPinMsg', '✓ PIN changed successfully!', 'success');
            window._secPinOtp = null; _setFlowActive(false);
            setTimeout(() => { closeModal('securityModal'); showPinStep(1); }, 1800);
        } else {
            setModalMsg('secPinMsg', data.detail || 'PIN change failed.', 'error');
        }
    } catch { setModalMsg('secPinMsg', 'Network error.', 'error'); }
}

// ─────────────────────────────────────────────
// SECURITY MODAL — HTML injection
// ─────────────────────────────────────────────
function _initSecurityBody() {
    var body = document.getElementById('securityModalBody');
    if (!body || body.dataset.initialized) return;
    body.innerHTML = `                <!-- Tab Switcher -->
                <div style="display:flex;justify-content:center;gap:0.6rem;margin-bottom:1.5rem;">
                    <button class="sec-tab active" id="secBtnPassword" onclick="switchSecTab('Password',this)"
                        style="flex:1;max-width:200px;">
                        <i class="fas fa-key"></i> Password
                    </button>
                    <button class="sec-tab" id="secBtnPin" onclick="switchSecTab('Pin',this)"
                        style="flex:1;max-width:200px;">
                        <i class="fas fa-hashtag"></i> Transaction PIN
                    </button>
                </div>

                <!-- ══ PASSWORD TAB ══ -->
                <div id="secTabPassword">
                    <!-- Step 1: Recovery email -->
                    <div id="pwStep1">
                        <p class="sec-step-desc">Enter your recovery email to receive a verification OTP.</p>
                        <div class="fld fld-mb075"><label>Recovery Email</label>
                            <input type="email" id="secRecoveryEmail" placeholder="your-recovery@email.com">
                        </div>
                        <div id="pwAttemptsLeft"
                            style="display:none;font-size:0.75rem;margin-bottom:0.5rem;text-align:center"></div>
                        <button class="btn-gold btn-full" onclick="requestPasswordOtp()">
                            <i class="fas fa-paper-plane"></i> Send OTP
                        </button>
                    </div>
                    <!-- Step 2: OTP -->
                    <div id="pwStep2" style="display:none">
                        <p class="sec-step-desc">Check your recovery email for the 6-digit OTP code.</p>
                        <div class="fld fld-mb075"><label>OTP Code</label>
                            <input type="text" id="secPwOtp" class="otp-input" maxlength="6" inputmode="numeric"
                                placeholder="6-digit code">
                        </div>
                        <button class="btn-gold btn-full" onclick="verifyPasswordOtp()">
                            <i class="fas fa-check"></i> Verify OTP
                        </button>
                        <button class="sec-back-btn" onclick="secStartOver()">
                            <i class="fas fa-arrow-left"></i> Back
                        </button>
                    </div>
                    <!-- Step 3: New password -->
                    <div id="pwStep3" style="display:none">
                        <div class="fld fld-mb075"><label>Current Password</label>
                            <div class="pw-input-wrap">
                                <input type="password" id="secOldPass" placeholder="••••••••">
                                <button type="button" id="eyeOldPass" class="pw-eye-btn"><i
                                        class="fas fa-eye"></i></button>
                            </div>
                        </div>
                        <div class="fld fld-mb075"><label>New Password</label>
                            <div class="pw-input-wrap">
                                <input type="password" id="secNewPass" placeholder="••••••••"
                                    oninput="checkPasswordPolicy()">
                                <button type="button" id="eyeNewPass" class="pw-eye-btn"><i
                                        class="fas fa-eye"></i></button>
                            </div>
                        </div>
                        <div id="pwPolicyIndicator" class="pw-policy-indicator"></div>
                        <div class="fld fld-mb075"><label>Confirm New Password</label>
                            <div class="pw-input-wrap">
                                <input type="password" id="secConfirmPass" placeholder="••••••••">
                                <button type="button" id="eyeConfirmPass" class="pw-eye-btn"><i
                                        class="fas fa-eye"></i></button>
                            </div>
                        </div>
                        <button class="btn-gold btn-full" onclick="confirmPasswordChange()">
                            <i class="fas fa-lock"></i> Change Password
                        </button>
                        <button class="sec-back-btn" onclick="secStartOver()">
                            <i class="fas fa-arrow-left"></i> Start over
                        </button>
                    </div>
                    <p class="modal-msg modal-msg-spaced" id="secPasswordMsg"></p>
                </div>

                <!-- ══ PIN TAB ══ -->
                <div id="secTabPin" style="display:none">
                    <!-- Step 1: Recovery email -->
                    <div id="pinStep1">
                        <p class="sec-step-desc">Enter your PIN recovery email to receive a verification OTP.</p>
                        <div class="fld fld-mb075"><label>PIN Recovery Email</label>
                            <input type="email" id="secRecoveryPinEmail" placeholder="your-pin-recovery@email.com">
                        </div>
                        <div id="pinAttemptsLeft"
                            style="display:none;font-size:0.75rem;margin-bottom:0.5rem;text-align:center"></div>
                        <button class="btn-gold btn-full" onclick="requestPinOtp()">
                            <i class="fas fa-paper-plane"></i> Send OTP
                        </button>
                    </div>
                    <!-- Step 2: OTP -->
                    <div id="pinStep2" style="display:none">
                        <p class="sec-step-desc">Check your PIN recovery email for the 6-digit OTP code.</p>
                        <div class="fld fld-mb075"><label>OTP Code</label>
                            <input type="text" id="secPinOtp" class="otp-input" maxlength="6" inputmode="numeric"
                                placeholder="6-digit code">
                        </div>
                        <button class="btn-gold btn-full" onclick="verifyPinOtp()">
                            <i class="fas fa-check"></i> Verify OTP
                        </button>
                        <button class="sec-back-btn" onclick="secStartOver()">
                            <i class="fas fa-arrow-left"></i> Back
                        </button>
                    </div>
                    <!-- Step 3: New PIN -->
                    <div id="pinStep3" style="display:none">
                        <div class="fld fld-mb075"><label>Current PIN</label>
                            <div class="pw-input-wrap">
                                <input type="password" id="secCurrentPin" class="pin-centered-input" maxlength="6"
                                    inputmode="numeric" placeholder="••••••">
                                <button type="button" id="eyeCurrentPin" class="pw-eye-btn"><i
                                        class="fas fa-eye"></i></button>
                            </div>
                        </div>
                        <div class="fld fld-mb075"><label>New 6-Digit PIN</label>
                            <div class="pw-input-wrap">
                                <input type="password" id="secNewPin" class="pin-centered-input" maxlength="6"
                                    inputmode="numeric" placeholder="••••••">
                                <button type="button" id="eyeNewPin" class="pw-eye-btn"><i
                                        class="fas fa-eye"></i></button>
                            </div>
                        </div>
                        <div style="margin-top:1.25rem;">
                            <button class="btn-gold btn-full" onclick="confirmPinChange()">
                                <i class="fas fa-hashtag"></i> Change PIN
                            </button>
                        </div>
                        <button class="sec-back-btn" onclick="secStartOver()">
                            <i class="fas fa-arrow-left"></i> Start over
                        </button>
                    </div>
                    <p class="modal-msg modal-msg-spaced" id="secPinMsg"></p>
                </div>
            </div>
        </div>
    </div>
`;
    body.dataset.initialized = '1';
}

var _origOpenSecurity = window.openSecurityModal;
window.openSecurityModal = function(tab) {
    _initSecurityBody();
    if (typeof openModal === 'function') openModal('securityModal');
    if (tab && typeof switchSecTab === 'function') switchSecTab(tab);
};