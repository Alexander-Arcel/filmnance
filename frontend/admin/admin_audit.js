// =============================================
// FILMNANCE — admin_audit.js
// Audit log functions: loading, filtering,
// rendering. Extracted from admin.js.
// =============================================

function detailUser(l) {
    try { var d = typeof l.details === 'string' ? JSON.parse(l.details) : (l.details || {}); return d.user || d.target_name || ''; } catch (e) { return ''; }
}
function auditCleanLabel(action) {
    var m = { USER_VERIFICATION_APPROVED: 'Profile Approved', USER_VERIFICATION_REJECTED: 'Profile Rejected', LOAN_APPROVAL_DISBURSEMENT: 'Loan Disbursed', LOAN_REJECTION: 'Loan Rejected', LOAN_REQUEST: 'Loan Request', LOAN_REMOVED: 'Loan Removed', MANUAL_FREEZE: 'Account Freeze', ADMIN_UNBAN: 'Account Unfreeze', ADMIN_UNFREEZE: 'Account Unfreeze', ARCHIVE_USER: 'User Archived', UNARCHIVE_USER: 'User Unarchived', GRANT_PAYMENT_DELAY: 'Delay Granted', APPROVE_DELAY_REQUEST: 'Delay Approved', DECLINE_DELAY_REQUEST: 'Delay Rejected', CONFIRM_REPAYMENT: 'Repayment Confirmed', PENDING_REPAYMENT: 'Repayment Pending', REJECT_REPAYMENT: 'Repayment Rejected', ADMIN_PIN_UNLOCK: 'PIN Unlocked', STATUS_CHANGE: 'Status Changed', EMERGENCY_CONTACT_EMAIL: 'EC Message Sent', USER_MESSAGE_SENT: 'User Message Sent', PROFILE_REQUEST: 'Profile Request', PROFILE_REMOVED: 'Profile Removed', MONTHLY_UPDATE: 'Monthly Request', REQUEST_DELAY: 'Delay Request', DELAY_APPROVED: 'Delay Approved', DELAY_REJECTED: 'Delay Rejected', MONTHLY_APPROVED: 'Monthly Approved', MONTHLY_REJECTED: 'Monthly Rejected' };
    return m[action] || (action || '').replace(/_/g, ' ');
}
function auditActionColor(action) {
    var m = { USER_VERIFICATION_APPROVED: '#22c55e', USER_VERIFICATION_REJECTED: '#f87171', LOAN_APPROVAL_DISBURSEMENT: '#22c55e', LOAN_REJECTION: '#f87171', LOAN_REQUEST: '#eab308', LOAN_REMOVED: '#ef4444', MANUAL_FREEZE: '#60a5fa', ADMIN_UNBAN: '#a3e635', ADMIN_UNFREEZE: '#34d399', ARCHIVE_USER: '#fb923c', UNARCHIVE_USER: '#a3e635', CONFIRM_REPAYMENT: '#f97316', PENDING_REPAYMENT: '#eab308', REJECT_REPAYMENT: '#ef4444', GRANT_PAYMENT_DELAY: '#eab308', APPROVE_DELAY_REQUEST: '#22c55e', DECLINE_DELAY_REQUEST: '#ef4444', EMERGENCY_CONTACT_EMAIL: '#f97316', USER_MESSAGE_SENT: '#7dd3fc', PROFILE_REQUEST: '#eab308', PROFILE_REMOVED: '#ef4444', MONTHLY_UPDATE: '#eab308', REQUEST_DELAY: '#eab308', DELAY_APPROVED: '#22c55e', DELAY_REJECTED: '#ef4444', MONTHLY_APPROVED: '#22c55e', MONTHLY_REJECTED: '#ef4444' };
    return m[action] || 'var(--text-dim)';
}
async function loadDashAudit() {
    try {
        const res = await fetch('/api/v1/admin/audit/logs', { headers: getHeaders() });
        const container = document.getElementById('dashAuditList');
        if (!res.ok || !container) return;
        const logs = await res.json();
        if (!logs.length) {
            container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-scroll"></i><p>No logs yet</p></div>`;
            return;
        }

        // Human-readable action labels
        const actionLabel = (action) => ({
            'USER_VERIFICATION_APPROVED': '✅ Profile Approved',
            'USER_VERIFICATION_REJECTED': '❌ Profile Rejected',
            'USER_VERIFICATION': '🔍 Verification',
            'LOAN_APPROVAL_DISBURSEMENT': '💰 Loan Disbursed',
            'LOAN_REJECTION': '🚫 Loan Rejected',
            'ADMIN_CAPITAL_DEPOSIT': '🏦 Capital Deposit',
            'REMOTE_LOGOUT_KILLSWITCH': '🔒 Session Revoked',
            'STATUS_CHANGE': '⚙️ Status Changed',
            'ADMIN_PIN_UNLOCK': '🔓 PIN Unlocked',
            'MANUAL_FREEZE': '❄️ Account Freeze',
            'ADMIN_UNBAN': '✅ Account Unfreeze',
            'ADMIN_UNFREEZE': '✅ Account Unfreeze',
            'ARCHIVE_USER': '📦 User Archived',
            'GRANT_PAYMENT_DELAY': '⏳ Delay Granted',
            'APPROVE_DELAY_REQUEST': '✅ Delay Approved',
            'DECLINE_DELAY_REQUEST': '❌ Delay Declined',
            'CONFIRM_REPAYMENT': '💳 Repayment Confirmed',
        }[action] || action.replace(/_/g, ' '));

        // Build human-readable detail summary
        const detailSummary = (l) => {
            if (!l.details) return '';
            try {
                const d = typeof l.details === 'string' ? JSON.parse(l.details) : l.details;
                if (l.action === 'USER_VERIFICATION_APPROVED' && d.approved_sections) {
                    return `Sections: ${Array.isArray(d.approved_sections) ? d.approved_sections.join(', ') : d.approved_sections}` +
                        (d.user ? ` · User: ${d.user}` : '') +
                        (d.pts_gained ? ` · +${d.pts_gained} pts` : '');
                }
                if (l.action === 'USER_VERIFICATION_REJECTED' && d.rejected_sections) {
                    return `Sections: ${Array.isArray(d.rejected_sections) ? d.rejected_sections.join(', ') : d.rejected_sections}` +
                        (d.user ? ` · User: ${d.user}` : '') +
                        (d.reason ? ` · Reason: ${d.reason}` : '');
                }
                if (l.action === 'EMERGENCY_CONTACT_EMAIL' || l.action === 'CONTACT_EMAIL_SENT') {
                    return (d.user ? `Producer: ${d.user}` : '') + (d.subject ? ` · ${String(d.subject).substring(0, 40)}` : '');
                }
                if (l.action === 'USER_MESSAGE_SENT') {
                    return (d.user ? `User: ${d.user}` : '') + (d.subject ? ` · ${String(d.subject).substring(0, 40)}` : '');
                }
                if (l.action === 'ARCHIVE_USER' || l.action === 'UNARCHIVE_USER') {
                    return (d.user ? d.user : '') + (d.reason ? ` · ${String(d.reason).substring(0, 50)}` : '');
                }
                if (d.amount) return `Amount: ₱${Number(d.amount).toLocaleString()}` + (d.user ? ` · ${d.user}` : '');
                if (d.reason) return `Reason: ${String(d.reason).substring(0, 60)}`;
                return Object.entries(d).slice(0, 2).map(([k, v]) => `${k}: ${String(v).substring(0, 30)}`).join(' · ');
            } catch { return String(l.details).substring(0, 60); }
        };

        container.innerHTML = logs.slice(0, 5).map(l => `
            <div style="padding:0.55rem 0;border-bottom:1px solid rgba(255,255,255,0.04)">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem">
                    <div style="font-size:0.78rem;font-weight:700;color:${auditActionColor(l.action)}">${esc(auditCleanLabel(l.action))}</div>
                    <div style="font-size:0.65rem;color:var(--text-3);white-space:nowrap;flex-shrink:0">${timeAgo(l.timestamp)}</div>
                </div>
                ${l.target_id ? `<div style="font-size:0.65rem;color:var(--text-dim)">#${l.target_id}${detailUser(l) ? ' · ' + detailUser(l) : ''}</div>` : ''}
                ${detailSummary(l) ? `<div style="font-size:0.63rem;color:var(--text-dim);margin-top:0.1rem;opacity:0.8">${esc(detailSummary(l))}</div>` : ''}
            </div>`).join('');
    } catch (e) { }
}

// ══════════════════════════════
// MODALS
// ══════════════════════════════
window.openModal = function (id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'flex'; void el.offsetWidth; el.classList.add('open'); }
};
window.closeModal = function (id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('open'); el.style.display = 'none'; }
};
// Close on backdrop click
document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('open');
        e.target.style.display = 'none';
    }
});

// ══════════════════════════════
// TOAST
// ══════════════════════════════
window.showToast = function (msg, type = 'info') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast show ${type}`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3500);
};

// ══════════════════════════════
// CLOCK
// ══════════════════════════════
function startClock() {
    const el = document.getElementById('topbarTime');
    if (!el) return;
    const tick = () => {
        el.textContent = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    tick();
    setInterval(tick, 1000);
}

// ══════════════════════════════
// LOGOUT
// ══════════════════════════════
window.logout = function () {
    localStorage.clear();
    window.location.replace('/');
};

// ══════════════════════════════
// UTILITIES
// ══════════════════════════════
window.setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
};

window.setBadge = (id, count) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count || '';
    el.style.display = count > 0 ? 'flex' : 'none';
    // Mirror loan request count to sidebar nav badge
    if (id === 'loanBadge') {
        var navBadge = document.getElementById('loanRequestNavBadge');
        if (navBadge) { navBadge.textContent = count || ''; navBadge.style.display = count > 0 ? 'flex' : 'none'; }
    }
};

window.esc = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

window.timeAgo = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    const diff = (Date.now() - d) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString('en-PH');
};

window.fmtDate = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

window.fmtPHP = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

window.statusBadge = (status) => {
    const map = {
        pending: 'badge-pending',
        active: 'badge-active',
        disbursed: 'badge-disbursed',
        rejected: 'badge-rejected',
        frozen: 'badge-frozen',
        freeze: 'badge-frozen',
        archived: 'badge-archived',
        verified: 'badge-verified',
        unverified: 'badge-unverified',
        approved: 'badge-disbursed',
    };
    const cls = map[status?.toLowerCase()] || 'badge-unverified';
    return `<span class="badge ${cls}">${esc(status || 'unknown')}</span>`;
};

// ══════════════════════════════
// ADMIN NOTIFICATIONS
// ══════════════════════════════
window.loadAdminNotifications = async function () {
    try {
        const res = await fetch('/api/v1/admin/notifications', { headers: getHeaders() });
        if (!res.ok) return;
        const notifs = await res.json();
        const unread = notifs.filter(n => !n.is_read).length;
        ADMIN_STATE.notifCount = unread;

        // Update bell badge
        const badge = document.getElementById('adminNotifBadge');
        if (badge) {
            badge.textContent = unread > 9 ? '9+' : unread || '';
            badge.style.display = unread > 0 ? 'flex' : 'none';
        }

        // Refresh panel if open
        if (ADMIN_STATE.notifPanelOpen) renderNotifPanel(notifs);
    } catch (e) { }
};

function renderNotifPanel(notifs) {
    const panel = document.getElementById('adminNotifPanel');
    if (!panel) return;

    const typeColor = (title) => {
        var t = title.toLowerCase();
        // Explicit status-based colors first
        if (t.includes('disburs') || t.includes('disbursement issued')) return '#22c55e';
        if (t.includes('approved') || t.includes('verified') || t.includes('confirmed')) return '#22c55e';
        if (t.includes('rejected') || t.includes('declined') || t.includes('failed') || t.includes('removed')) return '#f87171';
        if (t.includes('pending') || t.includes('review required') || t.includes('requested') || t.includes('submitted')) return '#eab308';
        // Specific action types
        if (t.includes('security') || t.includes('pin') || t.includes('locked')) return '#ef4444';
        if (t.includes('unfreeze') || t.includes('unfrozen')) return '#34d399';
        if (t.includes('freeze') || t.includes('frozen')) return '#60a5fa';
        if (t.includes('unarchive') || t.includes('unarchived') || t.includes('restored')) return '#a3e635';
        if (t.includes('archive') || t.includes('archived')) return '#fb923c';
        if (t.includes('loan')) return '#eab308';
        if (t.includes('delay') || t.includes('payment')) return '#eab308';
        if (t.includes('message') || t.includes('email')) return '#7dd3fc';
        if (t.includes('overdue') || t.includes('warning')) return '#f59e0b';
        if (t.includes('repayment')) return '#2dd4bf';
        return 'var(--gold)';
    };

    if (!notifs.length) {
        panel.querySelector('#notifList').innerHTML =
            '<div style="text-align:center;padding:2rem;color:var(--text-dim);font-size:0.82rem"><i class="fa-solid fa-bell-slash" style="font-size:1.5rem;display:block;margin-bottom:0.5rem"></i>No notifications yet</div>';
        return;
    }

    panel.querySelector('#notifList').innerHTML = notifs.map(function (n) {
        var c = typeColor(n.title);
        var bg = n.is_read ? 'transparent' : 'rgba(212,175,55,0.03)';
        // Remove all emojis/icons from title
        var cleanTitle = esc(n.title.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2700}-\u{27BF}]|\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '').replace(/[⏰✅❌📹🎬💳📋🔐⚠️🎯]/g, '').trim());
        // Truncate message to 120 chars to keep all boxes same height
        var msgText = n.message || '';
        var truncated = msgText.length > 120 ? msgText.substring(0, 120) + '…' : msgText;
        return '<div onclick="markNotifRead(' + n.id + ', this)"'
            + ' style="display:flex;gap:0;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.15s;background:' + bg + '"'
            + ' onmouseover="this.style.background=\'var(--bg-input)\'"'
            + ' onmouseout="this.style.background=\'' + bg + '\'">'
            + '<div style="flex:1;min-width:0;padding:0.8rem 1rem;border-left:3px solid ' + c + ';padding-left:0.9rem">'
            + '<div style="font-size:0.8rem;font-weight:' + (n.is_read ? '500' : '700') + ';color:' + c + ';margin-bottom:0.2rem">' + cleanTitle + '</div>'
            + '<div style="font-size:0.74rem;color:var(--text-dim);line-height:1.5;word-break:break-word">' + esc(truncated) + '</div>'
            + '<div style="font-size:0.65rem;color:var(--text-dim);opacity:0.65;margin-top:0.3rem">' + timeAgo(n.created_at) + '</div>'
            + '</div>'
            + (!n.is_read ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--gold);flex-shrink:0;margin-top:0.85rem;margin-right:0.75rem"></div>' : '')
            + '</div>';
    }).join('');
} window.toggleAdminNotifPanel = async function () {
    let panel = document.getElementById('adminNotifPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'adminNotifPanel';
        panel.style.cssText = `
            position:fixed;top:56px;right:12px;width:380px;max-height:520px;
            background:var(--bg-card);border:1px solid var(--border);border-radius:12px;
            box-shadow:0 8px 32px rgba(0,0,0,0.5);z-index:999;display:flex;flex-direction:column;overflow:hidden`;
        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:0.85rem 1rem;border-bottom:1px solid var(--border);flex-shrink:0">
                <div style="font-size:0.85rem;font-weight:700;color:var(--gold)"><i class="fa-solid fa-bell" style="margin-right:0.4rem"></i>Notifications</div>
                <div style="display:flex;gap:0.5rem;align-items:center">
                    <button onclick="markAllNotifsRead()" style="font-size:0.68rem;color:var(--text-dim);background:none;border:none;cursor:pointer;padding:0.2rem 0.4rem;border-radius:4px"
                        onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text-dim)'">
                        Mark all read
                    </button>
                    <button onclick="closeAdminNotifPanel()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:0.9rem;padding:0.2rem">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            </div>
            <div id="notifList" style="overflow-y:auto;flex:1"></div>`;
        document.body.appendChild(panel);

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function handler(e) {
                if (!panel.contains(e.target) && !document.getElementById('adminNotifBell')?.contains(e.target)) {
                    closeAdminNotifPanel();
                    document.removeEventListener('click', handler);
                }
            });
        }, 100);
    }

    ADMIN_STATE.notifPanelOpen = !ADMIN_STATE.notifPanelOpen;
    panel.style.display = ADMIN_STATE.notifPanelOpen ? 'flex' : 'none';

    if (ADMIN_STATE.notifPanelOpen) {
        const res = await fetch('/api/v1/admin/notifications', { headers: getHeaders() });
        if (res.ok) renderNotifPanel(await res.json());
    }
};

window.closeAdminNotifPanel = function () {
    const panel = document.getElementById('adminNotifPanel');
    if (panel) panel.style.display = 'none';
    ADMIN_STATE.notifPanelOpen = false;
};

window.markNotifRead = async function (id, el) {
    await fetch(`/api/v1/admin/notifications/${id}/read`, { method: 'POST', headers: getHeaders() });
    if (el) {
        el.style.background = 'transparent';
        const dot = el.querySelector('div[style*="border-radius:50%"]');
        if (dot) dot.remove();
        const title = el.querySelector('div[style*="font-weight"]');
        if (title) title.style.fontWeight = '500';
    }
    loadAdminNotifications();
};

window.markAllNotifsRead = async function () {
    await fetch('/api/v1/admin/notifications/read-all', { method: 'POST', headers: getHeaders() });
    loadAdminNotifications();
    const res = await fetch('/api/v1/admin/notifications', { headers: getHeaders() });
    if (res.ok) renderNotifPanel(await res.json());
};

// Repayment receipt confirmed popup for admin
window.showRepaymentConfirmedPopup = function (producerName, amount, projectTitle, ref) {
    const popup = document.createElement('div');
    popup.style.cssText = `
        position:fixed;bottom:80px;right:20px;background:var(--bg-card);
        border:1px solid var(--success);border-radius:12px;padding:1rem 1.25rem;
        box-shadow:0 4px 24px rgba(0,0,0,0.4);z-index:9999;max-width:320px;
        animation:slideInRight 0.3s ease`;
    popup.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:0.75rem">
            <div style="font-size:1.5rem">✅</div>
            <div>
                <div style="font-size:0.85rem;font-weight:700;color:var(--success);margin-bottom:0.25rem">Repayment Confirmed!</div>
                <div style="font-size:0.78rem;color:var(--text-dim)">
                    <strong>${esc(producerName)}</strong> paid <strong style="color:var(--gold)">₱${Number(amount).toLocaleString()}</strong>
                    for <em>${esc(projectTitle)}</em>
                </div>
                ${ref ? `<div style="font-size:0.68rem;color:var(--text-3);margin-top:0.2rem;font-family:var(--mono)">Ref: ${esc(ref)}</div>` : ''}
            </div>
            <button onclick="this.parentElement.parentElement.remove()"
                style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:0.85rem;flex-shrink:0">
                <i class="fa-solid fa-times"></i>
            </button>
        </div>`;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 6000);
};

// BOOTSTRAP
document.addEventListener('DOMContentLoaded', initAdmin)
// AUDIT FILTERS
window._auditTimeFilter = 'latest'; window._auditCategoryFilter = 'all'; window._allAuditLogs = [];
window.setAuditFilter = function (f, btn) {
    window._auditTimeFilter = f;
    document.querySelectorAll('.audit-time-btn').forEach(function (b) {
        b.style.background = 'var(--bg-card)'; b.style.color = 'var(--text-dim)';
        b.style.borderColor = 'var(--border)';
    });
    if (btn) { btn.style.background = 'var(--gold)'; btn.style.color = '#000'; btn.style.borderColor = 'var(--gold)'; }
    renderAuditTable(window._allAuditLogs);
};
window.setAuditCategory = function (c, btn) {
    window._auditCategoryFilter = c;
    document.querySelectorAll('.audit-cat-btn').forEach(function (b) {
        b.style.background = 'var(--bg-card)'; b.style.color = 'var(--text-dim)';
        b.style.borderColor = 'var(--border)';
    });
    if (btn) { btn.style.background = 'var(--gold)'; btn.style.color = '#000'; btn.style.borderColor = 'var(--gold)'; }
    renderAuditTable(window._allAuditLogs);
};
function auditFilterTime(logs, f) {
    var now = Date.now();
    // Each filter shows ALL entries within that time window (cumulative, not buckets)
    // latest = within 24 hours
    // 3d = within 3 days
    // 7d = within 7 days
    // 1m = within 30 days
    // 3m = within 90 days
    // 6m = within 180 days
    // 12m = within 365 days
    var maxAge = {
        'latest': 86400000,       // 24h
        '3d':     259200000,      // 3 days
        '7d':     604800000,      // 7 days
        '1m':     2592000000,     // 30 days
        '3m':     7776000000,     // 90 days
        '6m':     15552000000,    // 180 days
        '12m':    31536000000     // 365 days
    };
    var max = maxAge[f];
    if (!max) return logs;
    return logs.filter(function (l) {
        var age = now - new Date(l.timestamp).getTime();
        return age >= 0 && age < max;
    });
}
function auditFilterCat(logs, c) { if (c === 'all') return logs; var m = { verification: ['USER_VERIFICATION_APPROVED', 'USER_VERIFICATION_REJECTED', 'PROFILE_REQUEST', 'PROFILE_REMOVED'], loaning: ['LOAN_APPROVAL_DISBURSEMENT', 'LOAN_REJECTION', 'LOAN_REQUEST', 'LOAN_REMOVED', 'CONFIRM_REPAYMENT'], delay: ['GRANT_PAYMENT_DELAY', 'APPROVE_DELAY_REQUEST', 'DECLINE_DELAY_REQUEST', 'REQUEST_DELAY', 'MONTHLY_UPDATE', 'DELAY_APPROVED', 'DELAY_REJECTED', 'MONTHLY_APPROVED', 'MONTHLY_REJECTED'], freezing: ['MANUAL_FREEZE', 'ADMIN_UNBAN', 'ADMIN_UNFREEZE', 'STATUS_CHANGE'], archiving: ['ARCHIVE_USER', 'UNARCHIVE_USER'], message: ['EMERGENCY_CONTACT_EMAIL', 'USER_MESSAGE_SENT', 'CONTACT_EMAIL_SENT'], repayment: ['CONFIRM_REPAYMENT', 'PENDING_REPAYMENT', 'REJECT_REPAYMENT'] }; return logs.filter(function (l) { return (m[c] || []).includes(l.action); }); }
function auditIcon(action) { var m = { USER_VERIFICATION_APPROVED: '[OK]', USER_VERIFICATION_REJECTED: '[X]', LOAN_APPROVAL_DISBURSEMENT: '[$]', LOAN_REJECTION: '[!]', MANUAL_FREEZE: '[F]', ADMIN_UNBAN: '[U]', ADMIN_UNFREEZE: '[U]', ARCHIVE_USER: '[A]', UNARCHIVE_USER: '[R]', GRANT_PAYMENT_DELAY: '[D]', APPROVE_DELAY_REQUEST: '[OK]', DECLINE_DELAY_REQUEST: '[X]', CONFIRM_REPAYMENT: '[P]', ADMIN_PIN_UNLOCK: '[K]', STATUS_CHANGE: '[S]' }; return m[action] || '[-]'; }
function renderAuditTable(logs) {
    var fl = auditFilterTime(logs, window._auditTimeFilter); fl = auditFilterCat(fl, window._auditCategoryFilter);
    var tbody = document.getElementById('auditTableBody'); if (!tbody) return;
    if (!fl.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text-dim)">No logs for this filter</td></tr>'; return; }
    var labels = { USER_VERIFICATION_APPROVED: 'Profile Approved', USER_VERIFICATION_REJECTED: 'Profile Rejected', LOAN_APPROVAL_DISBURSEMENT: 'Loan Disbursed', LOAN_REJECTION: 'Loan Rejected', LOAN_REQUEST: 'Loan Request', LOAN_REMOVED: 'Loan Removed', MANUAL_FREEZE: 'Account Freeze', ADMIN_UNBAN: 'Account Unfreeze', ADMIN_UNFREEZE: 'Account Unfreeze', ARCHIVE_USER: 'User Archived', UNARCHIVE_USER: 'User Unarchived', GRANT_PAYMENT_DELAY: 'Delay Granted', APPROVE_DELAY_REQUEST: 'Delay Approved', DECLINE_DELAY_REQUEST: 'Delay Rejected', CONFIRM_REPAYMENT: 'Repayment Confirmed', PENDING_REPAYMENT: 'Pending Repayment', REJECT_REPAYMENT: 'Repayment Rejected', ADMIN_PIN_UNLOCK: 'PIN Unlocked', STATUS_CHANGE: 'Status Changed', EMERGENCY_CONTACT_EMAIL: 'EC Message Sent', USER_MESSAGE_SENT: 'User Message Sent', CONTACT_EMAIL_SENT: 'Contact Email Sent', PROFILE_REQUEST: 'Profile Request', PROFILE_REMOVED: 'Profile Removed', MONTHLY_UPDATE: 'Monthly Request', REQUEST_DELAY: 'Delay Request', DELAY_APPROVED: 'Delay Approved', DELAY_REJECTED: 'Delay Rejected', MONTHLY_APPROVED: 'Monthly Approved', MONTHLY_REJECTED: 'Monthly Rejected' };
    var colors = { USER_VERIFICATION_APPROVED: '#22c55e', USER_VERIFICATION_REJECTED: '#f87171', LOAN_APPROVAL_DISBURSEMENT: '#22c55e', LOAN_REJECTION: '#f87171', LOAN_REQUEST: '#eab308', LOAN_REMOVED: '#ef4444', MANUAL_FREEZE: '#60a5fa', ADMIN_UNBAN: '#a3e635', ADMIN_UNFREEZE: '#34d399', ARCHIVE_USER: '#fb923c', UNARCHIVE_USER: '#a3e635', GRANT_PAYMENT_DELAY: '#eab308', APPROVE_DELAY_REQUEST: '#22c55e', DECLINE_DELAY_REQUEST: '#ef4444', CONFIRM_REPAYMENT: '#f97316', PENDING_REPAYMENT: '#eab308', REJECT_REPAYMENT: '#ef4444', ADMIN_PIN_UNLOCK: '#facc15', STATUS_CHANGE: '#94a3b8', EMERGENCY_CONTACT_EMAIL: '#f97316', USER_MESSAGE_SENT: '#7dd3fc', CONTACT_EMAIL_SENT: '#f97316', PROFILE_REQUEST: '#eab308', PROFILE_REMOVED: '#ef4444', MONTHLY_UPDATE: '#eab308', REQUEST_DELAY: '#eab308', DELAY_APPROVED: '#22c55e', DELAY_REJECTED: '#ef4444', MONTHLY_APPROVED: '#22c55e', MONTHLY_REJECTED: '#ef4444' };
    tbody.innerHTML = fl.map(function (l) {
        var label = labels[l.action] || (l.action || '').replace(/_/g, ' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); }).replace(/\B\w/g, function(c){ return c.toLowerCase(); });
        var color = colors[l.action] || 'var(--text-dim)';
        var userName = ''; var details = ''; var userId = l.target_id || null;
        var installmentCount = l.installment_count || null;
        try {
            var d = typeof l.details === 'string' ? JSON.parse(l.details) : (l.details || {});
            // USER column: always show the actual user/producer who triggered the action
            // For loan requests, profile requests, repayments etc. use d.user (the producer)
            // For admin actions (approvals, disbursements) use l.user_name (the admin)
            var adminActions = ['LOAN_APPROVAL_DISBURSEMENT', 'USER_VERIFICATION_APPROVED', 'USER_VERIFICATION_REJECTED',
                'APPROVE_DELAY_REQUEST', 'DECLINE_DELAY_REQUEST', 'CONFIRM_REPAYMENT', 'REJECT_REPAYMENT',
                'MONTHLY_APPROVED', 'MONTHLY_REJECTED', 'DELAY_APPROVED', 'DELAY_REJECTED',
                'MANUAL_FREEZE', 'ADMIN_UNBAN', 'ADMIN_UNFREEZE', 'ARCHIVE_USER', 'UNARCHIVE_USER',
                'ADMIN_PIN_UNLOCK', 'STATUS_CHANGE', 'EMERGENCY_CONTACT_EMAIL', 'USER_MESSAGE_SENT'];
            var userActions = ['LOAN_REQUEST', 'PROFILE_REQUEST', 'PENDING_REPAYMENT', 'MONTHLY_UPDATE',
                'REQUEST_DELAY', 'LOAN_REMOVED', 'PROFILE_REMOVED'];
            if (userActions.includes(l.action)) {
                // Producer/user initiated — show their name from details
                userName = esc(d.user || d.target_name || d.name || l.user_name || '—');
            } else {
                // Admin initiated — show admin name
                userName = esc(l.user_name || d.admin || 'System Admin');
            }
            // Build details — never repeat the user name (already in USER column)
            var pts = [];
            if (l.action === 'USER_VERIFICATION_APPROVED') {
                if (d.approved_sections) pts.push('Sections: ' + (Array.isArray(d.approved_sections) ? d.approved_sections.join(', ') : d.approved_sections));
                if (d.pts_gained) pts.push('+pts: ' + d.pts_gained);
            } else if (l.action === 'USER_VERIFICATION_REJECTED') {
                if (d.rejected_sections) pts.push('Sections: ' + (Array.isArray(d.rejected_sections) ? d.rejected_sections.join(', ') : d.rejected_sections));
                if (d.reason) pts.push('Reason: ' + String(d.reason).substring(0, 60));
            } else if (l.action === 'PROFILE_REQUEST' || l.action === 'PROFILE_REMOVED') {
                if (d.sections) pts.push('Sections: ' + (Array.isArray(d.sections) ? d.sections.join(', ') : d.sections));
            } else if (l.action === 'LOAN_REQUEST') {
                if (d.project || d.title || d.loan_title) pts.push('Project: ' + String(d.project || d.title || d.loan_title));
                if (d.production_phase || d.phase) pts.push('Production Phase: ' + fmtPhaseTitleCase(d.production_phase || d.phase));
            } else if (l.action === 'LOAN_APPROVAL_DISBURSEMENT') {
                if (d.project || d.loan_title) pts.push('Project: ' + String(d.project || d.loan_title));
                if (d.amount) pts.push('Amount: ₱' + Number(d.amount).toLocaleString());
                if (d.ref) pts.push('Ref: ' + String(d.ref));
            } else if (l.action === 'LOAN_REJECTION') {
                if (d.project || d.loan_title) pts.push('Project: ' + String(d.project || d.loan_title));
                if (d.reason) pts.push('Reason: ' + String(d.reason).substring(0, 60));
            } else if (l.action === 'PENDING_REPAYMENT' || l.action === 'CONFIRM_REPAYMENT' || l.action === 'REJECT_REPAYMENT') {
                if (d.project) pts.push('Project: ' + String(d.project));
                if (d.ref) pts.push('Ref: ' + String(d.ref));
                if (d.sender || d.payment_method) pts.push('Payment Method: ' + String(d.sender || d.payment_method));
                if (d.amount) pts.push('Amount: ₱' + Number(d.amount).toLocaleString());
            } else if (l.action === 'REQUEST_DELAY') {
                if (d.project || d.loan_title) pts.push('Project: ' + String(d.project || d.loan_title));
                if (d.production_phase || d.phase) pts.push('Production Phase: ' + fmtPhaseTitleCase(d.production_phase || d.phase));
                if (d.reason) pts.push('Reason: ' + String(d.reason).substring(0, 80));
            } else if (l.action === 'DELAY_APPROVED' || l.action === 'APPROVE_DELAY_REQUEST') {
                if (d.project || d.loan_title) pts.push('Project: ' + String(d.project || d.loan_title));
                if (d.production_phase || d.phase) pts.push('Production Phase: ' + fmtPhaseTitleCase(d.production_phase || d.phase));
            } else if (l.action === 'DELAY_REJECTED' || l.action === 'DECLINE_DELAY_REQUEST') {
                if (d.project || d.loan_title) pts.push('Project: ' + String(d.project || d.loan_title));
                if (d.reason) pts.push('Reason: ' + String(d.reason).substring(0, 80));
            } else if (l.action === 'MONTHLY_UPDATE') {
                if (d.project || d.loan_title) pts.push('Project: ' + String(d.project || d.loan_title));
                if (d.production_phase || d.phase) pts.push('Production Phase: ' + fmtPhaseTitleCase(d.production_phase || d.phase));
            } else if (l.action === 'MONTHLY_APPROVED') {
                if (d.project || d.loan_title) pts.push('Project: ' + String(d.project || d.loan_title));
                if (d.production_phase || d.phase) pts.push('Production Phase: ' + fmtPhaseTitleCase(d.production_phase || d.phase));
            } else if (l.action === 'MONTHLY_REJECTED') {
                if (d.project || d.loan_title) pts.push('Project: ' + String(d.project || d.loan_title));
                if (d.reason) pts.push('Reason: ' + String(d.reason).substring(0, 80));
            } else if (l.action === 'ARCHIVE_USER' || l.action === 'UNARCHIVE_USER') {
                if (d.reason) pts.push('Reason: ' + String(d.reason).substring(0, 80));
                if (d.email) pts.push('Email: ' + String(d.email));
            } else if (l.action === 'MANUAL_FREEZE' || l.action === 'ADMIN_UNFREEZE' || l.action === 'ADMIN_UNBAN') {
                if (d.reason) pts.push('Reason: ' + String(d.reason).substring(0, 60));
            } else if (l.action === 'EMERGENCY_CONTACT_EMAIL' || l.action === 'CONTACT_EMAIL_SENT') {
                if (d.contact_email) pts.push('EC Email: ' + String(d.contact_email));
                if (d.subject) pts.push('Subject: ' + String(d.subject).substring(0, 50));
            } else if (l.action === 'USER_MESSAGE_SENT') {
                if (d.email) pts.push('To: ' + String(d.email));
                if (d.subject) pts.push('Subject: ' + String(d.subject).substring(0, 50));
            } else {
                // Generic fallback — skip user/email keys since already in USER column
                var skip = ['user', 'email', 'target_name', 'name', 'admin'];
                var entries = Object.entries(d).filter(function(e){ return !skip.includes(e[0]); });
                pts = entries.slice(0, 2).map(function(e){ return e[0] + ': ' + String(e[1]).substring(0, 30); });
            }
            details = pts.join(' | ');
            function fmtPhaseTitleCase(raw) {
                if (!raw) return raw;
                return String(raw).replace(/[_]/g, '-').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
            }
        } catch (e2) { details = String(l.details || '').substring(0, 80); }
        // Determine Activity Count for this log entry
        var activityCount = null;
        var archiveActions = ['ARCHIVE_USER','UNARCHIVE_USER'];
        var freezeActions = ['MANUAL_FREEZE','ADMIN_UNBAN','ADMIN_UNFREEZE','STATUS_CHANGE'];
        var loanDelayActions = ['LOAN_APPROVAL_DISBURSEMENT','LOAN_REJECTION','LOAN_REQUEST','LOAN_REMOVED',
                           'GRANT_PAYMENT_DELAY','APPROVE_DELAY_REQUEST','DECLINE_DELAY_REQUEST',
                           'MONTHLY_UPDATE','REQUEST_DELAY','DELAY_APPROVED','DELAY_REJECTED',
                           'MONTHLY_APPROVED','MONTHLY_REJECTED','CONFIRM_REPAYMENT'];
        if (loanDelayActions.includes(l.action)) {
            activityCount = installmentCount !== null ? installmentCount : null;
        } else if (archiveActions.includes(l.action) && userId) {
            activityCount = (window._allAuditLogs || []).filter(function(x){
                return archiveActions.includes(x.action) && x.target_id === userId;
            }).length || null;
        } else if (freezeActions.includes(l.action) && userId) {
            activityCount = (window._allAuditLogs || []).filter(function(x){
                return freezeActions.includes(x.action) && x.target_id === userId;
            }).length || null;
        }
        // Action badge — 6 columns only (no Activity Count)
        var badgeBg = color.startsWith('#') ? color + '22' : 'rgba(100,100,100,0.1)';
        return '<tr>'
            + '<td style="padding:0.45rem 0.75rem"><span style="display:inline-block;padding:0.2rem 0.55rem;border-radius:5px;font-size:0.7rem;font-weight:700;color:' + color + ';background:' + badgeBg + ';border:1px solid ' + color + '44;white-space:nowrap">' + esc(label) + '</span></td>'
            + '<td style="font-size:0.75rem;color:var(--text-dim);font-family:monospace;padding:0.45rem 0.5rem;white-space:nowrap">' + (userId ? '#' + userId : '—') + '</td>'
            + '<td style="font-size:0.78rem;color:var(--text);padding:0.45rem 0.5rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (userName || '<span style="color:var(--text-dim)">—</span>') + '</td>'
            + '<td style="font-size:0.78rem;word-break:break-word;color:var(--text-dim);padding:0.45rem 0.75rem">' + esc(details) + '</td>'
            + '<td style="font-family:monospace;font-size:0.68rem;color:var(--text-dim);padding:0.45rem 0.5rem">' + esc(l.ip_address || '—') + '</td>'
            + '<td style="font-size:0.7rem;white-space:nowrap;color:var(--text-dim);padding:0.45rem 0.75rem">' + fmtDate(l.timestamp) + '</td>'
            + '</tr>';
    }).join('');
}
async function loadAuditLogs() {
    const tbody = document.getElementById('auditTableBody'); if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1.5rem"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>';
    try {
        const res = await fetch('/api/v1/admin/audit/logs?limit=200', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to load audit logs');
        window._allAuditLogs = await res.json();
        // Set initial active button states via JS (not hardcoded in HTML)
        document.querySelectorAll('.audit-time-btn').forEach(function(b) {
            var f = b.getAttribute('onclick') && b.getAttribute('onclick').match(/setAuditFilter\('([^']+)'/);
            var isActive = f && f[1] === window._auditTimeFilter;
            b.style.background = isActive ? 'var(--gold)' : 'var(--bg-card)';
            b.style.color = isActive ? '#000' : 'var(--text-dim)';
            b.style.borderColor = isActive ? 'var(--gold)' : 'var(--border)';
        });
        document.querySelectorAll('.audit-cat-btn').forEach(function(b) {
            var f = b.getAttribute('onclick') && b.getAttribute('onclick').match(/setAuditCategory\('([^']+)'/);
            var isActive = f && f[1] === window._auditCategoryFilter;
            b.style.background = isActive ? 'var(--gold)' : 'var(--bg-card)';
            b.style.color = isActive ? '#000' : 'var(--text-dim)';
            b.style.borderColor = isActive ? 'var(--gold)' : 'var(--border)';
        });
        renderAuditTable(window._allAuditLogs);
    } catch (e) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--error)">' + e.message + '</td></tr>';
    }
} function updateEstRevenue(receipts) {
    var total = 0;
    (receipts || []).forEach(function (r) {
        var la = parseFloat((r.loan && r.loan.amount) || 0);
        var rawRate = parseFloat((r.loan && r.loan.interest_rate) || 0);
        // interest_rate stored as decimal (e.g. 0.15) or percent (e.g. 15)
        var rate = rawRate > 1 ? rawRate / 100 : rawRate;
        if (rate === 0) rate = 0.15; // fallback 15%
        total += la * rate;
    });
    var el = document.getElementById('receiptEstRevenue');
    if (el) el.textContent = '₱' + total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Load est revenue from active disbursed loans when no receipts exist yet