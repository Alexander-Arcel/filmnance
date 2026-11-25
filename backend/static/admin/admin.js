/**
 * FILMNANCE ADMIN — CORE ENGINE
 * Handles: init, auth guard, navigation, toast, modal, clock
 */

'use strict';

// ── State ──
window.ADMIN_STATE = {
    currentSection: 'dash',
    currentLoanFilter: 'pending',
    rejectingLoanId: null,
    stats: {},
    notifCount: 0,
    notifPanelOpen: false
};

// ── Auth headers ──
window.getHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
});

// ══════════════════════════════
// INIT — Auth Guard
// ══════════════════════════════
async function initAdmin() {
    const token = localStorage.getItem('token');
    if (!token || token === 'null' || token === 'undefined') {
        window.location.replace('/');
        return;
    }

    try {
        const res = await fetch('/api/v1/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) { logout(); return; }

        const user = await res.json();
        if (user.is_admin !== true) {
            window.location.replace('/user-dashboard');
            return;
        }

        // Populate admin name
        const nameEl = document.getElementById('adminName');
        if (nameEl) nameEl.textContent = user.name || 'Admin';

        // Show page
        document.body.style.display = 'flex';

        // Load initial data
        await loadDashboard();
        startClock();
        // Start notification polling — every 15s
        loadAdminNotifications();
        setInterval(loadAdminNotifications, 15000);

    } catch (err) {
        console.error('Admin init error:', err);
        window.location.replace('/');
    }
}

// ══════════════════════════════
// NAVIGATION
// ══════════════════════════════
window.showSection = function (sectionId, linkEl) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    // Show target
    const target = document.getElementById(sectionId + 'Section');
    if (target) target.classList.add('active');

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (linkEl) linkEl.classList.add('active');

    // Update topbar title
    const titles = {
        dash: ['Dashboard', 'System overview and key metrics'],
        loans: ['Loan Requests', 'Review and action producer loan applications'],
        delays: ['Delay Requests', 'Producers requesting more time on installment payments'],
        verifications: ['Verifications', 'Review pending identity documents'],
        users: ['Producers', 'Manage all registered producers'],
        treasury: ['Treasury', 'Financial overview and fund management'],
        audit: ['Audit Logs', 'Complete record of all admin actions'],
        receipts: ['Repayment Receipts', 'Review and confirm submitted repayment proof'],
        activeloans: ['Active Loans', 'All disbursed loans'],
        contact: ['User Messages', 'Messages'],
        settings: ['Admin', 'Settings'],
    };
    const [title, sub] = titles[sectionId] || ['Admin', ''];
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('pageSubtitle').textContent = sub;

    ADMIN_STATE.currentSection = sectionId;

    // Load section data
    switch (sectionId) {
        case 'dash': loadDashboard(); break;
        case 'loans': loadLoans(); break;
        case 'delays': loadDelays(); break;
        case 'verifications': loadVerifications(); break;
        case 'users': loadUsers(); break;
        case 'treasury': loadTreasury(); break;
        case 'audit': loadAuditLogs(); break;
        case 'receipts': loadRepaymentReceipts(); break;
        case 'activeloans':
            // Show Loan Requests tab first if there are pending requests, else Active Loans
            (async function() {
                var pendingCount = (ADMIN_STATE.stats && ADMIN_STATE.stats.pending_loan_requests) || 0;
                if (!pendingCount) {
                    // Also check loanBadge text as a fallback
                    var badge = document.getElementById('loanBadge');
                    if (badge) pendingCount = parseInt(badge.textContent || '0', 10);
                }
                if (pendingCount > 0) {
                    switchActiveLoanTab('requests', document.getElementById('activeLoanTabRequests'));
                } else {
                    switchActiveLoanTab('active', document.getElementById('activeLoanTabActive'));
                }
            })();
            break;
        case 'contact': if (window.loadContactMessages) window.loadContactMessages(); break;
        case 'settings': if (typeof loadArchivedUsers === 'function') loadArchivedUsers(); if (typeof loadRemovedLoans === 'function') loadRemovedLoans(); if (typeof _syncAdminThemeBtn === 'function') _syncAdminThemeBtn(); break;
    }
};

window.refreshCurrent = function () {
    loadDashboard();
    showSection(ADMIN_STATE.currentSection, document.querySelector('[data-section="' + ADMIN_STATE.currentSection + '"]'));
};

// ── Active Loans + Loan Requests tab switcher ────────────────────────────────
window.switchActiveLoanTab = function(tab, btn) {
    ['activeLoanTabRequests','activeLoanTabActive'].forEach(function(id){
        var b = document.getElementById(id); if (!b) return;
        b.style.background = 'var(--bg-card)'; b.style.borderColor = 'var(--border)'; b.style.color = 'var(--text-dim)';
        b.querySelectorAll('i,span:not(.nav-badge)').forEach(function(e){ e.style.color='var(--text-dim)'; });
        b.classList.remove('active');
    });
    if (btn) {
        if (tab === 'active') {
            btn.style.background = 'rgba(34,197,94,0.08)'; btn.style.borderColor = 'rgba(34,197,94,0.4)'; btn.style.color = '#22c55e';
            btn.querySelectorAll('i,span:not(.nav-badge)').forEach(function(e){ e.style.color='#22c55e'; });
        } else {
            btn.style.background = 'rgba(234,179,8,0.1)'; btn.style.borderColor = 'rgba(234,179,8,0.4)'; btn.style.color = '#eab308';
            btn.querySelectorAll('i,span:not(.nav-badge)').forEach(function(e){ e.style.color='#eab308'; });
        }
        btn.classList.add('active');
    }
    var loanPanel = document.getElementById('loanRequestsPanel');
    var activePanel = document.getElementById('activeLoansPanel');
    if (tab === 'requests') {
        if (loanPanel) loanPanel.style.display = '';
        if (activePanel) activePanel.style.display = 'none';
        loadLoans();
    } else {
        if (loanPanel) loanPanel.style.display = 'none';
        if (activePanel) activePanel.style.display = '';
        if (window.loadActiveLoansPanel) window.loadActiveLoansPanel();
    }
};

// ══════════════════════════════
// DASHBOARD
// ══════════════════════════════
async function loadDashboard() {
    try {
        const res = await fetch('/api/v1/admin/stats/dashboard', { headers: getHeaders() });
        if (!res.ok) return;
        const d = await res.json();
        ADMIN_STATE.stats = d;

        // KPI values
        const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        setEl('statBalance', fmt(d.available_treasury_balance));
        setEl('statInjected', `Total injected: ${fmt(d.total_capital_injected)}`);
        setEl('statRevenue', fmt(d.total_repaid || 0));
        setEl('statCapitalOut', fmt(d.total_capital_out));
        setEl('statActiveLoans', d.active_loans || 0);
        setEl('statActiveLoansAmount', 'Active Loans');
        setEl('statUsers', d.active_producers || d.active_users || 0);
        // Update active loans summary cards
        var alTotal = document.getElementById('alTotalProjects');
        if (alTotal) alTotal.textContent = d.active_loans || 0;
        var alCap = document.getElementById('alCapitalOut');
        if (alCap) alCap.textContent = fmt(d.total_capital_out);
        setEl('statGold', `Gold tier: ${d.gold_tier_users || 0}`);
        setEl('statPendingLoans', d.pending_loan_requests || 0);
        setEl('statPendingVerify', d.pending_verifications || 0);

        // Update nav badges
        setBadge('loanBadge', d.pending_loan_requests || 0);
        setBadge('verifyBadge', d.pending_verifications || 0);

        // Fetch delay badge separately
        loadDelayBadge();
        // Refresh contact messages badge
        _refreshContactBadge();

    } catch (e) { console.error('Dashboard load error:', e); }

    // Recent loans preview
    loadDashLoans();
    loadDashAudit();
    // Update active loans badge
    if (window.loadActiveLoansPanel) window.loadActiveLoansPanel();
}

async function loadDashLoans() {
    try {
        const res = await fetch('/api/v1/admin/loans/pending', { headers: getHeaders() });
        const container = document.getElementById('dashLoanList');
        if (!res.ok || !container) return;
        const loans = await res.json();
        if (!loans.length) {
            container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-film"></i><p>No pending loans</p></div>`;
            return;
        }
        container.innerHTML = loans.slice(0, 5).map(l => `
            <div style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem 0;border-bottom:1px solid rgba(255,255,255,0.04)">
                <div style="width:36px;height:36px;border-radius:8px;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <i class="fa-solid fa-film" style="color:var(--gold);font-size:0.85rem"></i>
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:0.82rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.project_title || 'Untitled')}</div>
                    <div style="font-size:0.66rem;color:var(--text-dim);margin-top:0.05rem">${esc(l.owner?.name || 'Unknown')}</div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="font-family:var(--display,sans-serif);font-weight:800;color:var(--gold);font-size:0.88rem">₱${Number(l.amount).toLocaleString()}</div>
                    <button style="margin-top:0.25rem;padding:0.18rem 0.55rem;border-radius:5px;border:1px solid var(--gold-bdr);background:rgba(212,175,55,0.08);color:var(--gold);font-size:0.62rem;font-weight:700;cursor:pointer;letter-spacing:0.04em" onclick="openLoanModal(${l.id})">REVIEW</button>
                </div>
            </div>
        `).join('');
    } catch (e) { }
}


// ── Audit log functions have been moved to admin_audit.js ──

window.loadEstRevenueFromLoans = async function () {
    try {
        var res = await fetch('/api/v1/admin/loans/all', { headers: getHeaders() });
        if (!res.ok) return;
        var loans = await res.json();
        var disbursed = loans.filter(function (l) { return l.status === 'disbursed'; });
        var total = 0;
        disbursed.forEach(function (l) {
            var amt = parseFloat(l.amount || 0);
            var rawRate = parseFloat(l.interest_rate || 0);
            var rate = rawRate > 1 ? rawRate / 100 : rawRate;
            if (rate === 0) rate = 0.15;
            total += amt * rate;
        });
        var el = document.getElementById('receiptEstRevenue');
        if (el && total > 0) el.textContent = '₱' + total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) { }
};
;

// ── Refresh contact badge count ──
async function _refreshContactBadge() {
    try {
        var res = await fetch('/api/v1/admin/contact-messages', { headers: getHeaders() });
        if (!res.ok) return;
        var msgs = await res.json();
        setBadge('contactBadge', msgs.length);
    } catch (e) { }
}