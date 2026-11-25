// ============================================
// FILMNANCE — user-core.js
// Core utilities: token, API helpers, theme,
// modal open/close, section navigation.
// Must be loaded FIRST before all other scripts.
// ============================================

'use strict';

// ── API helpers ──
const getToken = () => localStorage.getItem('token');
const getHeaders = () => ({
    'Authorization': `Bearer ${getToken()}`,
    'Content-Type': 'application/json'
});

async function safeJson(res) {
    const text = await res.text();
    try {
        const p = JSON.parse(text);
        if (p && Array.isArray(p.detail)) {
            p.detail = p.detail.map(e =>
                (e.loc ? `${e.loc[e.loc.length - 1]}: ` : '') + (e.msg || e)
            ).join(', ');
        }
        return p;
    } catch { return { detail: text || 'Server error' }; }
}

function showEl(id) { const el = document.getElementById(id); if (el) el.type = 'text'; }
function hideEl(id) { const el = document.getElementById(id); if (el) el.type = 'password'; }

// ── Theme ──
function initTheme() {
    const t = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', t);
    _applyThemeUI(t);
}

function toggleTheme() {
    const cur = document.body.getAttribute('data-theme') || 'dark';
    const next = cur === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    _applyThemeUI(next);
    // Sync settings toggle widget
    if (typeof syncThemeUI === 'function') syncThemeUI();
}

function _applyThemeUI(t) {
    // Settings modal toggle (track + thumb + label)
    const isLight = t === 'light';
    const track = document.getElementById('themeToggleTrack');
    const thumb = document.getElementById('themeToggleThumb');
    const label = document.getElementById('themeLabel');
    if (track) track.style.background = isLight ? 'var(--gold)' : 'var(--bg-card)';
    if (thumb) {
        thumb.style.transform = isLight ? 'translateX(20px)' : 'translateX(0)';
        thumb.style.background = isLight ? '#fff' : 'var(--text-dim)';
    }
    if (label) label.textContent = isLight ? 'Light' : 'Dark';
}

// ── Modal open/close ──
function openModal(id) {
    const m = document.getElementById(id);
    if (!m) { console.warn('[openModal] element not found:', id); return; }
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Per-modal init
    if (id === 'settingsModal') {
        _applyThemeUI(document.body.getAttribute('data-theme') || 'dark');
    }
    if (id === 'securityModal') {
        // Reset to step 1
        if (typeof showPwStep === 'function') showPwStep(1);
        if (typeof showPinStep === 'function') showPinStep(1);
        ['secRecoveryEmail', 'secRecoveryPinEmail', 'secPwOtp', 'secPinOtp',
            'secOldPass', 'secNewPass', 'secConfirmPass', 'secCurrentPin', 'secNewPin'
        ].forEach(eid => { const e = document.getElementById(eid); if (e) e.value = ''; });
        setModalMsg('secPasswordMsg', '');
        setModalMsg('secPinMsg', '');
        // Active tab = Change Password
        document.querySelectorAll('.sec-tab').forEach(t => t.classList.remove('active'));
        const ft = document.querySelector('.sec-tab'); if (ft) ft.classList.add('active');
        const pw = document.getElementById('secTabPassword');
        const pi = document.getElementById('secTabPin');
        if (pw) pw.style.display = 'block';
        if (pi) pi.style.display = 'none';
        const pol = document.getElementById('pwPolicyIndicator'); if (pol) pol.innerHTML = '';
    }
    if (id === 'loanModal') {
        const pg = document.getElementById('loanPinGate');
        const pinIn = document.getElementById('loanTxPin');
        if (pg) pg.style.display = 'none';
        if (pinIn) pinIn.value = '';
    }
    if (id === 'requestPaymentModal') {
        setModalMsg('requestPaymentMsg', '');
        // Reset delay proof
        const pf = document.getElementById('delayProofFile');
        const pn = document.getElementById('delayProofName');
        if (pf) pf.value = '';
        if (pn) pn.textContent = 'Click to attach proof photo or video...';
        const iw = document.getElementById('delayInstallmentWrap');
        if (iw) iw.style.display = 'none';
    }
    if (id === 'contactCardModal') {
        const ta = document.getElementById('contactMsgTa');
        const sel = document.getElementById('contactSubjectSel');
        if (ta) ta.value = '';
        if (sel) sel.selectedIndex = 0;
    }
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.style.display = 'none';
    document.body.style.overflow = '';
}

function setModalMsg(elId, text, type = '') {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text;
    el.className = 'modal-msg' + (type ? ' ' + type : '');
}

// ── PIN step helpers (called from user-security.js + openModal) ──
function showPwStep(n) {
    [1, 2, 3].forEach(i => {
        const el = document.getElementById('pwStep' + i);
        if (el) el.style.display = (i === n) ? 'block' : 'none';
    });
}
function showPinStep(n) {
    [1, 2, 3].forEach(i => {
        const el = document.getElementById('pinStep' + i);
        if (el) el.style.display = (i === n) ? 'block' : 'none';
    });
}

// ── Contact Admin via Gmail compose ──
function openContactCard() { openModal('contactCardModal'); }

function sendViaGmail() {
    const subject = document.getElementById('contactSubjectSel')?.value || 'Filmnance Support';
    const msg = document.getElementById('contactMsgTa')?.value?.trim() || '';
    const name = (typeof currentUser !== 'undefined' && currentUser?.name) ? currentUser.name : '';
    const body = `Hi Filmnance Support,\n\nName: ${name}\n\n${msg}\n\nThank you.`;
    const url = `https://mail.google.com/mail/?view=cm&to=filmnance.support@gmail.com&su=${encodeURIComponent('Filmnance: ' + subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank');
    closeModal('contactCardModal');
}