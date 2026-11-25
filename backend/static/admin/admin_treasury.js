/**
 * FILMNANCE ADMIN — TREASURY & AUDIT
 * Handles: treasury display, deposit, audit log table
 */

'use strict';

// ══════════════════════════════
// TREASURY
// ══════════════════════════════
window.loadTreasury = async function () {
    try {
        const res = await fetch('/api/v1/admin/stats/dashboard', { headers: getHeaders() });
        if (!res.ok) return;
        const d = await res.json();

        setEl('tAvailable', fmtPHP(d.available_treasury_balance));
        setEl('tInjected', `Total injected: ${fmtPHP(d.total_capital_injected)}`);
        setEl('tDeployed', fmtPHP(d.total_capital_out));
        setEl('tRevenue', fmtPHP(d.estimated_revenue));
        setEl('tDueToday', fmtPHP(d.expected_collections_today));
        setEl('tDefaultRate', d.default_rate || '0%');
    } catch (e) { console.error('Treasury load error:', e); }
};

window.processDeposit = async function () {
    const amountEl = document.getElementById('depositAmount');
    const msgEl = document.getElementById('depositMsg');
    const amount = parseFloat(amountEl?.value);

    if (!amount || amount <= 0) {
        msgEl.textContent = 'Enter a valid amount greater than 0.';
        msgEl.className = 'form-msg error';
        return;
    }

    msgEl.textContent = 'Processing deposit...';
    msgEl.className = 'form-msg';

    try {
        const res = await fetch(`/api/v1/admin/treasury/deposit?amount=${amount}`, {
            method: 'POST',
            headers: getHeaders()
        });
        // Handle both JSON and plain-text error responses
        const text = await res.text();
        let d;
        try { d = JSON.parse(text); } catch { d = { detail: text }; }
        if (!res.ok) throw new Error(d.detail || 'Deposit failed');

        msgEl.textContent = `✓ Successfully injected ${fmtPHP(amount)}`;
        msgEl.className = 'form-msg success';
        amountEl.value = '';
        showToast(`Treasury funded with ${fmtPHP(amount)}`, 'success');
        loadTreasury();
        loadDashboard();
    } catch (e) {
        msgEl.textContent = e.message;
        msgEl.className = 'form-msg error';
    }
};

// ══════════════════════════════
// AUDIT LOGS
// ══════════════════════════════
// ── Audit action config: label, color, bg, category ──
const AUDIT_ACTION_MAP = {
    // ── VERIFICATION (existing colors kept) ──
    'USER_VERIFICATION_APPROVED': { label: 'Profile Approved', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', cat: 'verification' },
    'USER_VERIFICATION_REJECTED': { label: 'Profile Rejected', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', cat: 'verification' },
    // NEW: Verification Requested — unique color: cyan #06b6d4
    'USER_VERIFICATION': { label: 'Profile Request', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)', border: 'rgba(6,182,212,0.3)', cat: 'verification' },
    'VERIFICATION_REQUESTED': { label: 'Profile Request', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)', border: 'rgba(6,182,212,0.3)', cat: 'verification' },

    // ── LOANING (existing colors kept) ──
    'LOAN_APPROVAL_DISBURSEMENT': { label: 'Loan Disbursed', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', cat: 'loaning' },
    'LOAN_REJECTION': { label: 'Loan Rejected', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', cat: 'loaning' },
    // NEW: Loan Requested — unique color: orange #f97316
    'LOAN_REQUESTED': { label: 'Loan Requested', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', cat: 'loaning' },

    // ── FREEZING (existing colors kept) ──
    'MANUAL_FREEZE': { label: 'Account Freeze', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', cat: 'freezing' },
    'ADMIN_UNFREEZE': { label: 'Account Unfreeze', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', cat: 'freezing' },
    'ADMIN_UNBAN': { label: 'Account Unfreeze', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', cat: 'freezing' },

    // ── ARCHIVING (existing colors kept) ──
    'ARCHIVE_USER': { label: 'User Archived', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', cat: 'archiving' },
    'ADMIN_CAPITAL_DEPOSIT': { label: 'Capital Deposit', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', cat: 'archiving' },
    'REMOTE_LOGOUT_KILLSWITCH': { label: 'Sessions Revoked', color: '#ef4444', bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.2)', cat: 'archiving' },
    'ADMIN_PIN_UNLOCK': { label: 'PIN Unlocked', color: '#f59e0b', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.2)', cat: 'archiving' },
    'STATUS_CHANGE': { label: 'Status Changed', color: '#f59e0b', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.2)', cat: 'archiving' },

    // ── DELAYS — unique color: purple #a855f7 (matches Delay pending tab) ──
    'GRANT_PAYMENT_DELAY': { label: 'Delay Granted', color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', cat: 'delay' },
    'APPROVE_DELAY_REQUEST': { label: 'Delay Approved', color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', cat: 'delay' },
    'DECLINE_DELAY_REQUEST': { label: 'Delay Declined', color: '#a855f7', bg: 'rgba(168,85,247,0.07)', border: 'rgba(168,85,247,0.2)', cat: 'delay' },
    'DELAY_REQUESTED': { label: 'Delay Requested', color: '#a855f7', bg: 'rgba(168,85,247,0.07)', border: 'rgba(168,85,247,0.2)', cat: 'delay' },

    // ── REPAYMENT — unique color: emerald #10b981 (matches Repayment module) ──
    'CONFIRM_REPAYMENT': { label: 'Repayment Confirmed', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', cat: 'repayment' },
    'REPAYMENT_REJECTED': { label: 'Repayment Rejected', color: '#10b981', bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.2)', cat: 'repayment' },

    // ── REMOVED — NEW unique color: rose #f43f5e ──
    'LOAN_REMOVED': { label: 'Loan Removed', color: '#f43f5e', bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.3)', cat: 'removed' },
    'ADMIN_REMOVE_SECTION': { label: 'Profile Removed', color: '#f43f5e', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', cat: 'verification' },

    // ── MESSAGES (existing colors kept) ──
    'EMERGENCY_CONTACT_EMAIL': { label: 'EC Email Sent', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', cat: 'message' },
    'MESSAGE_REPLIED': { label: 'Message Replied', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', cat: 'message' },
    'MESSAGE_DELETED': { label: 'Message Deleted', color: '#3b82f6', bg: 'rgba(59,130,246,0.07)', border: 'rgba(59,130,246,0.2)', cat: 'message' },
};

function _auditBadge(action) {
    const cfg = AUDIT_ACTION_MAP[action] || { label: action.replace(/_/g, ' '), color: 'var(--gold)', bg: 'rgba(212,175,55,0.1)', border: 'rgba(212,175,55,0.25)', cat: 'other' };
    return `<span style="display:inline-block;font-size:0.7rem;font-weight:800;padding:0.22rem 0.65rem;border-radius:6px;background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border};white-space:nowrap;letter-spacing:0.01em">${cfg.label}</span>`;
}

function _auditCat(action) {
    return (AUDIT_ACTION_MAP[action] || {}).cat || 'other';
}

let _auditAllLogs = [];
let _auditTimeFilter = 'latest';
let _auditCatFilter = 'all';

window.setAuditFilter = function (filter, btn) {
    _auditTimeFilter = filter;
    document.querySelectorAll('.audit-time-btn').forEach(function (b) {
        b.style.background = 'var(--bg-card)'; b.style.color = 'var(--text-dim)'; b.style.borderColor = 'var(--border)';
    });
    if (btn) { btn.style.background = 'var(--gold)'; btn.style.color = '#000'; btn.style.borderColor = 'var(--gold)'; }
    _renderAuditTable();
};

window.setAuditCategory = function (cat, btn) {
    _auditCatFilter = cat;
    document.querySelectorAll('.audit-cat-btn').forEach(function (b) {
        var isCat = ['repayment', 'removed'].includes(b.textContent.trim().toLowerCase());
        b.style.background = 'var(--bg-card)'; b.style.color = 'var(--text-dim)'; b.style.borderColor = 'var(--border)';
        if (b.textContent.trim().toLowerCase() === 'repayment') { b.style.background = 'rgba(34,197,94,0.07)'; b.style.color = '#22c55e'; b.style.borderColor = 'rgba(34,197,94,0.35)'; }
        if (b.textContent.trim().toLowerCase() === 'remove section' || b.textContent.trim().toLowerCase() === 'removed') { b.style.background = 'rgba(239,68,68,0.07)'; b.style.color = '#ef4444'; b.style.borderColor = 'rgba(239,68,68,0.35)'; }
    });
    if (btn) {
        var catColors = {
            'verification': ['rgba(6,182,212,0.2)', '#06b6d4', 'rgba(6,182,212,0.5)'],
            'loaning': ['rgba(249,115,22,0.2)', '#f97316', 'rgba(249,115,22,0.5)'],
            'freezing': ['rgba(59,130,246,0.2)', '#3b82f6', 'rgba(59,130,246,0.5)'],
            'archiving': ['rgba(245,158,11,0.2)', '#f59e0b', 'rgba(245,158,11,0.5)'],
            'delay': ['rgba(168,85,247,0.2)', '#a855f7', 'rgba(168,85,247,0.5)'],
            'repayment': ['rgba(16,185,129,0.2)', '#10b981', 'rgba(16,185,129,0.5)'],
            'removed': ['rgba(244,63,94,0.2)', '#f43f5e', 'rgba(244,63,94,0.5)'],
            'message': ['rgba(59,130,246,0.2)', '#3b82f6', 'rgba(59,130,246,0.5)'],
        };
        var cfg = catColors[cat] || ['var(--gold)', '#000', 'var(--gold)'];
        btn.style.background = cfg[0]; btn.style.color = cfg[1]; btn.style.borderColor = cfg[2];
    }
    _renderAuditTable();
};

function _renderAuditTable() {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;
    let logs = _auditAllLogs.slice();
    // Time filter
    if (_auditTimeFilter !== 'all') {
        const now = Date.now();
        const ranges = {
            latest: 24 * 60 * 60 * 1000, '3d': 3 * 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000,
            '1m': 30 * 24 * 60 * 60 * 1000, '3m': 90 * 24 * 60 * 60 * 1000, '6m': 180 * 24 * 60 * 60 * 1000, '12m': 365 * 24 * 60 * 60 * 1000
        };
        if (ranges[_auditTimeFilter]) logs = logs.filter(function (l) { return (now - new Date(l.timestamp)) <= ranges[_auditTimeFilter]; });
    }
    // Category filter
    if (_auditCatFilter !== 'all') {
        logs = logs.filter(function (l) { return _auditCat(l.action) === _auditCatFilter; });
    }
    if (!logs.length) {
        tbody.innerHTML = '<tr class="loading-row"><td colspan="6" style="text-align:center;color:var(--text-dim);padding:2rem">No logs found for this filter</td></tr>';
        return;
    }
    tbody.innerHTML = logs.map(function (l) {
        return '<tr>'
            + '<td>' + _auditBadge(l.action) + '</td>'
            + '<td style="font-family:var(--mono);font-size:0.75rem;color:var(--text-2)">' + (l.target_id ? '<span style="color:var(--gold)">#' + l.target_id + '</span>' : '<span style="color:var(--text-3)">—</span>') + '</td>'
            + '<td style="font-size:0.82rem;font-weight:600;color:var(--text)">' + esc(l.user_name || '—') + '</td>'
            + '<td style="font-size:0.7rem;color:var(--text-3);max-width:320px">' + _buildAuditDetail(l) + '</td>'
            + '<td style="font-family:var(--mono);font-size:0.7rem;color:var(--text-3)">' + esc(l.ip_address || '—') + '</td>'
            + '<td style="font-family:var(--mono);font-size:0.7rem;color:var(--text-3)">' + fmtDate(l.timestamp) + '</td>'
            + '</tr>';
    }).join('');
}

function _buildAuditDetail(l) {
    if (!l.details) return '—';
    try {
        const d = typeof l.details === 'string' ? JSON.parse(l.details) : l.details;
        const parts = [];
        if (d.role) parts.push('<span style="color:var(--text-dim)">' + esc(d.role) + ':</span> <strong>' + esc(d.user || '') + '</strong>');
        else if (d.user) parts.push('<span style="color:var(--text-dim)">User:</span> <strong>' + esc(d.user) + '</strong>');
        if (d.approved_sections) parts.push('<span style="color:var(--text-dim)">Sections:</span> ' + esc(Array.isArray(d.approved_sections) ? d.approved_sections.join(', ') : d.approved_sections));
        if (d.rejected_sections) parts.push('<span style="color:var(--text-dim)">Rejected:</span> ' + esc(Array.isArray(d.rejected_sections) ? d.rejected_sections.join(', ') : d.rejected_sections));
        if (d.pts_gained) parts.push('<span style="color:var(--text-dim)">+pts:</span> ' + d.pts_gained);
        if (d.sections) parts.push('<span style="color:var(--text-dim)">Sections:</span> ' + esc(d.sections));
        if (d.section) parts.push('<span style="color:var(--text-dim)">Section:</span> ' + esc(d.section_label || d.section));
        if (d.reason) parts.push('<span style="color:var(--text-dim)">Reason:</span> ' + esc(String(d.reason).substring(0, 60)));
        if (d.title) parts.push('<span style="color:var(--text-dim)">Title:</span> <strong>' + esc(d.title) + '</strong>');
        if (d.production_phase) parts.push('<span style="color:var(--text-dim)">Phase:</span> ' + esc(d.production_phase));
        if (d.amount) parts.push('<span style="color:var(--text-dim)">Amount:</span> ₱' + Number(d.amount).toLocaleString());
        if (d.action) parts.push('<span style="color:var(--text-dim)">Note:</span> ' + esc(d.action));
        if (d.email && !d.user) parts.push('<span style="color:var(--text-dim)">Email:</span> ' + esc(d.email));
        if (!parts.length) return Object.entries(d).slice(0, 3).map(function (kv) { return '<span style="color:var(--text-dim)">' + kv[0] + ':</span> ' + esc(String(kv[1]).substring(0, 40)); }).join(' &nbsp;·&nbsp; ');
        return parts.join(' &nbsp;·&nbsp; ');
    } catch { return esc(String(l.details).substring(0, 80)); }
}

window.loadAuditLogs = async function () {
    const tbody = document.getElementById('auditTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr class="loading-row"><td colspan="6">Loading audit logs...</td></tr>';

    // Human-readable action labels (kept for legacy)
    const actionLabel = (action) => ((AUDIT_ACTION_MAP[action] || {}).label || action.replace(/_/g, ' '));

    const buildDetail = (l) => {
        if (!l.details) return '—';
        try {
            const d = typeof l.details === 'string' ? JSON.parse(l.details) : l.details;
            // Prioritise human-readable keys
            const parts = [];
            if (d.role) parts.push(`<span style="color:var(--text-dim)">${esc(d.role)}:</span> <strong>${esc(d.user || '')}</strong>`);
            else if (d.user) parts.push(`<span style="color:var(--text-dim)">User:</span> <strong>${esc(d.user)}</strong>`);
            if (d.approved_sections) parts.push(`<span style="color:var(--text-dim)">Sections:</span> ${esc(Array.isArray(d.approved_sections) ? d.approved_sections.join(', ') : d.approved_sections)}`);
            if (d.rejected_sections) parts.push(`<span style="color:var(--text-dim)">Rejected:</span> ${esc(Array.isArray(d.rejected_sections) ? d.rejected_sections.join(', ') : d.rejected_sections)}`);
            if (d.pts_gained) parts.push(`<span style="color:var(--text-dim)">+pts:</span> ${d.pts_gained}`);
            if (d.reason) parts.push(`<span style="color:var(--text-dim)">Reason:</span> ${esc(String(d.reason).substring(0, 60))}`);
            if (d.amount) parts.push(`<span style="color:var(--text-dim)">Amount:</span> ₱${Number(d.amount).toLocaleString()}`);
            if (d.action) parts.push(`<span style="color:var(--text-dim)">Note:</span> ${esc(d.action)}`);
            if (d.email && !d.user) parts.push(`<span style="color:var(--text-dim)">Email:</span> ${esc(d.email)}`);
            if (!parts.length) {
                return Object.entries(d).slice(0, 3).map(([k, v]) => `<span style="color:var(--text-dim)">${k}:</span> ${esc(String(v).substring(0, 40))}`).join(' &nbsp;·&nbsp; ');
            }
            return parts.join(' &nbsp;·&nbsp; ');
        } catch { return esc(String(l.details).substring(0, 80)); }
    };

    try {
        const res = await fetch('/api/v1/admin/audit/logs', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to load audit logs');
        const logs = await res.json();

        if (!logs.length) {
            tbody.innerHTML = '<tr class="loading-row"><td colspan="6">No audit logs found</td></tr>';
            _auditAllLogs = [];
            return;
        }

        _auditAllLogs = logs;
        _renderAuditTable();
    } catch (e) {
        tbody.innerHTML = '<tr class="loading-row"><td colspan="6" style="color:var(--error)">' + e.message + '</td></tr>';
    }
};