// ============================================================
// FILMNANCE — user-compose.js
// Contact Admin modal
// ============================================================
'use strict';

function openComposeEmail() {
    closeModal('settingsModal');
    const nameEl = document.getElementById('composeName');
    const fromEl = document.getElementById('composeFrom');
    if (nameEl && currentUser?.name) nameEl.value = currentUser.name;
    if (fromEl && currentUser?.email) fromEl.value = currentUser.email;
    setModalMsg('composeMsg', '');
    const subEl = document.getElementById('composeSubject');
    const msgEl = document.getElementById('composeMessage');
    if (subEl) subEl.value = '';
    if (msgEl) msgEl.value = '';

    // Show alias email in the info bar, fetch from backend
    const adminEl = document.getElementById('composeAdminEmail');
    if (adminEl) {
        fetch('/api/v1/auth/admin-contact-info', { headers: getHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.admin_email && adminEl) adminEl.textContent = d.admin_email; })
            .catch(() => { if (adminEl) adminEl.textContent = 'admin@filmnance.com'; });
    }
    openModal('composeEmailModal');
}

async function sendComposeEmail() {
    const name = document.getElementById('composeName')?.value?.trim();
    const from = document.getElementById('composeFrom')?.value?.trim();
    const subject = document.getElementById('composeSubject')?.value?.trim();
    const message = document.getElementById('composeMessage')?.value?.trim();
    const btn = document.querySelector('#composeEmailModal .btn-gold');

    if (!name) { setModalMsg('composeMsg', 'Enter your name.', 'error'); return; }
    if (!from) { setModalMsg('composeMsg', 'Enter your email address.', 'error'); return; }
    if (!subject) { setModalMsg('composeMsg', 'Enter a subject.', 'error'); return; }
    if (!message || message.length < 10) { setModalMsg('composeMsg', 'Write a message (at least 10 characters).', 'error'); return; }

    setModalMsg('composeMsg', 'Sending...');
    if (btn) btn.disabled = true;
    try {
        const res = await fetch('/api/v1/auth/contact-admin', {
            method: 'POST', headers: getHeaders(),
            body: JSON.stringify({ name, from_email: from, subject, message })
        });
        const text = await res.text();
        let d; try { d = JSON.parse(text); } catch { d = { detail: text }; }
        if (!res.ok) throw new Error(d.detail || 'Send failed.');
        setModalMsg('composeMsg', '✓ Message sent successfully!', 'success');
        setTimeout(() => closeModal('composeEmailModal'), 2500);
    } catch (e) {
        setModalMsg('composeMsg', e.message || 'Failed to send. Please try again.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ─────────────────────────────────────────────
// COMPOSE EMAIL — HTML injection
// ─────────────────────────────────────────────
function _initComposeBody() {
    var body = document.getElementById('composeEmailBody');
    if (!body || body.dataset.initialized) return;
    body.innerHTML = `            </div>
            <div style="overflow-y:auto;flex:1;padding:1.4rem 1.8rem 1.8rem;">
                <div class="compose-info-bar">
                    <i class="fas fa-paper-plane icon-gold-mr-xs"></i>
                    Sending to: <strong id="composeAdminEmail" style="color:var(--gold)">admin@filmnance.com</strong>
                </div>
                <div class="fld fld-mb075"><label>From (Your Name)</label>
                    <input type="text" id="composeName" placeholder="Your full name">
                </div>
                <div class="fld fld-mb075"><label>Your Email <span class="fld-hint">So admin can reply to
                            you</span></label>
                    <input type="email" id="composeFrom" placeholder="your@email.com">
                </div>
                <div class="fld fld-mb075"><label>Subject</label>
                    <input type="text" id="composeSubject" placeholder="e.g. Loan inquiry / Account issue">
                </div>
                <div class="fld fld-mb075"><label>Message</label>
                    <textarea id="composeMessage" rows="5" class="fld-textarea"
                        placeholder="Describe your concern in detail..."></textarea>
                </div>
                <p class="modal-msg compose-msg-wrap" id="composeMsg"></p>
                <button class="btn-gold btn-full" onclick="sendComposeEmail()">
`;
    body.dataset.initialized = '1';
}

var _origOpenCompose = window.openComposeEmail;
window.openComposeEmail = function(opts) {
    _initComposeBody();
    if (_origOpenCompose) _origOpenCompose(opts);
};