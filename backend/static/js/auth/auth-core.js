// =============================================
// FILMNANCE — auth-core.js
// Shared helpers used by every view on the auth
// entry page (login, register, setup-security,
// frozen, forgot-password, reset-password).
// Load this file BEFORE the per-view scripts.
// =============================================

// ── Cross-view state ──
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
        if (typeof showSecuredCard === 'function') showSecuredCard();
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