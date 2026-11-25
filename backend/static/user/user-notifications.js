// ============================================
// FILMNANCE — user-notifications.js
// In-app notification bell + panel.
// Also contains DOMContentLoaded bootstrap
// (must be loaded LAST).
// Depends on: ALL other user-*.js files
// ============================================

'use strict';

let _notifOpen = false;

async function loadNotifications() {
    try {
        const res = await fetch('/api/v1/loans/notifications', { headers: getHeaders() });
        if (!res.ok) return;
        const notifs = await res.json();

        const unread = notifs.filter(n => !n.is_read).length;
        const badge = document.getElementById('notifBadge');
        if (badge) {
            badge.textContent = unread > 0 ? (unread > 9 ? '9+' : unread) : '';
            badge.style.display = unread > 0 ? 'flex' : 'none';
        }

        const list = document.getElementById('notifList');
        if (!list) return;

        if (!notifs.length) {
            list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text-dim);font-size:0.8rem">No notifications yet</div>';
            return;
        }

        list.innerHTML = notifs.map(n => `
            <div onclick="readNotif(${n.id}, this)"
                 style="padding:0.8rem 1rem;border-bottom:1px solid var(--border);cursor:pointer;
                        opacity:${n.is_read ? '0.5' : '1'};transition:opacity 0.2s;border-radius:0.5rem;
                        margin-bottom:0.25rem;${!n.is_read ? 'background:rgba(212,175,55,0.05)' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem">
                    <div style="font-size:0.8rem;font-weight:600;margin-bottom:0.2rem">${n.title}</div>
                    ${!n.is_read ? '<span style="width:8px;height:8px;background:var(--gold);border-radius:50%;flex-shrink:0;margin-top:0.25rem"></span>' : ''}
                </div>
                <div style="font-size:0.75rem;color:var(--text-dim);line-height:1.5">${n.message}</div>
                <div style="font-size:0.65rem;color:var(--text-dim);margin-top:0.3rem">
                    ${n.created_at ? new Date(n.created_at).toLocaleString('en-PH') : ''}
                </div>
            </div>
        `).join('');
    } catch (e) { console.error('Notif error:', e); }
}

async function readNotif(id, el) {
    if (el) el.style.opacity = '0.5';
    try {
        await fetch(`/api/v1/loans/notifications/${id}/read`, { method: 'POST', headers: getHeaders() });
        loadNotifications();
    } catch (e) { console.error(e); }
}

async function markAllRead() {
    try {
        await fetch('/api/v1/loans/notifications/read-all', { method: 'POST', headers: getHeaders() });
        loadNotifications();
    } catch (e) { console.error(e); }
}

function toggleNotifications() {
    const panel = document.getElementById('notifPanel');
    if (!panel) return;
    _notifOpen = !_notifOpen;
    panel.style.display = _notifOpen ? 'block' : 'none';
    if (_notifOpen) {
        loadNotifications();
        setTimeout(() => {
            document.addEventListener('click', function h(e) {
                if (!panel.contains(e.target) && !e.target.closest('#notifBell')) {
                    panel.style.display = 'none';
                    _notifOpen = false;
                    document.removeEventListener('click', h);
                }
            });
        }, 10);
    }
}

// ── Logout ──
function handleLogout() {
    fetch('/api/v1/auth/logout', { method: 'POST', headers: getHeaders() }).catch(() => { });
    localStorage.clear();
    window.location.href = '/';
}

// ============================================
// BOOTSTRAP — runs after all scripts loaded
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    const token = getToken();
    if (!token || token === 'null' || token === 'undefined') {
        window.location.replace('/');
        return;
    }
    try {
        const res = await fetch('/api/v1/auth/me', { headers: getHeaders() });
        if (!res.ok) { handleLogout(); return; }
        const user = await res.json();
        if (user?.is_admin) { window.location.replace('/admin-dashboard'); return; }
        if (!user?.recovery_email || !user?.transaction_pin) { window.location.replace('/'); return; }

        loadDashboard();
        loadNotifications();
        setInterval(loadNotifications, 60000); // refresh every 60 s

        // Reveal body now that auth is confirmed (was hidden to prevent flash)
        document.body.style.display = 'flex';

        initPurposeGrid();
        watchAssetUrls();
        watchProfileUrls();

        // Load payment methods for loan + repay modals
        if (typeof loadDisbursementOptions === 'function') loadDisbursementOptions();

        document.getElementById('secTabPassword')?.classList.add('active-tab');
    } catch (e) {
        console.error('Bootstrap error:', e);
        handleLogout();
    }
});