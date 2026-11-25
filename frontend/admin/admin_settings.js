// admin_settings.js — Theme toggle, archived users, removed loans
// ── FIX: All inline code in separate script tag so it actually executes ──
(function () {
    var saved = localStorage.getItem('adminTheme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
})();
function adminToggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    var next = current === 'dark' ? 'light' : 'dark';
    // Set on html element (documentElement) — CSS uses html[data-theme]
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('adminTheme', next);
    _syncAdminThemeBtn();
}
function _syncAdminThemeBtn() {
    var cur = document.documentElement.getAttribute('data-theme') || 'dark';
    var btn = document.getElementById('adminThemeBtn');
    if (btn) btn.innerHTML = cur === 'light'
        ? '<i class="fas fa-moon" style="margin-right:0.3rem"></i>Dark Mode'
        : '<i class="fas fa-sun" style="margin-right:0.3rem"></i>Light Mode';
}
(function () {
    var saved = localStorage.getItem('adminTheme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
})();

document.addEventListener('DOMContentLoaded', function () {
    _syncAdminThemeBtn();
    // Pre-load estimated revenue
    if (typeof loadEstRevenueFromLoans === 'function') loadEstRevenueFromLoans();
});

// ── Load Archived Users for Settings ──
async function loadArchivedUsers() {
    var list = document.getElementById('archivedUsersList');
    if (!list) return;
    list.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem">Loading…</p>';
    try {
        var res = await fetch('/api/v1/admin/users/search?status=archived', { headers: getHeaders() });
        var data = await res.json();
        var users = (data.users || data || []).filter(function (u) { return u.account_status === 'archived'; });
        if (!users.length) {
            list.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem">No archived accounts found.</p>';
            return;
        }
        list.innerHTML = users.map(function (u) {
            return '<div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0.8rem;background:var(--bg-card);border:1px solid var(--border);border-radius:9px;margin-bottom:0.4rem">' +
                '<div><div style="font-size:0.83rem;font-weight:700;color:var(--text)">' + (u.name || 'Unknown') + '</div>' +
                '<div style="font-size:0.7rem;color:var(--text-dim)">' + (u.email || '') + '</div></div>' +
                '<button onclick="unarchiveUser(' + u.id + ',\'' + (u.email || '') + '\')" style="padding:0.4rem 0.85rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);border-radius:8px;color:#22c55e;font-size:0.75rem;font-weight:700;cursor:pointer">' +
                '<i class="fas fa-rotate-left" style="margin-right:0.3rem"></i>Restore</button>' +
                '</div>';
        }).join('');
    } catch (e) {
        list.innerHTML = '<p style="color:var(--error);font-size:0.8rem">Failed to load archived users.</p>';
    }
}

function unarchiveUser(userId, userEmail) {
    var ex = document.getElementById('_restoreModal'); if (ex) ex.remove();
    var ov = document.createElement('div'); ov.id = '_restoreModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10002;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);padding:1rem';
    var emailDisplay = userEmail || '—';
    ov.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:1.25rem;max-width:520px;width:100%;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.6)">'
        + '<div style="background:rgba(34,197,94,0.08);border-bottom:1px solid rgba(34,197,94,0.18);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:0.75rem">'
        + '<i class="fa-solid fa-rotate-left" style="color:#22c55e;font-size:1.1rem"></i>'
        + '<div style="font-weight:700;color:#22c55e;font-size:0.95rem">Restore This Account</div>'
        + '<button onclick="document.getElementById(\'_restoreModal\').remove()" style="margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem"><i class="fas fa-times"></i></button>'
        + '</div>'
        + '<div style="padding:1.25rem">'
        + '<div style="margin-bottom:0.9rem"><label style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem">To</label>'
        + '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);padding:0.55rem 0.9rem;font-size:0.84rem;color:#22c55e;font-weight:600">' + emailDisplay + '</div></div>'
        + '<label style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem">Subject</label>'
        + '<input id="_restoreSubject" type="text" value="[Filmnance] Account Restored" style="width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.65rem 0.9rem;margin-bottom:0.85rem;font-size:0.84rem;box-sizing:border-box">'
        + '<label style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem">Message <span style="color:#22c55e">*</span></label>'
        + '<textarea id="_restoreMsg" rows="5" style="width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.75rem;font-size:0.85rem;font-family:inherit;resize:vertical;box-sizing:border-box;min-height:120px">Your account has been restored. You may now log in to Filmnance again.</textarea>'
        + '<p id="_rMsg" style="font-size:0.78rem;min-height:1rem;color:var(--text-dim);margin-top:0.5rem"></p>'
        + '<div style="display:flex;gap:0.6rem;margin-top:0.85rem">'
        + '<button onclick="document.getElementById(\'_restoreModal\').remove()" style="flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600">Cancel</button>'
        + '<button onclick="_doRestore(' + userId + ')" style="flex:2;padding:0.75rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:var(--r);color:#22c55e;cursor:pointer;font-size:0.85rem;font-weight:700"><i class="fa-solid fa-rotate-left" style="margin-right:0.4rem"></i>Confirm Restore</button>'
        + '</div></div></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
}


async function _doRestore(userId) {
    var msgEl = document.getElementById('_rMsg');
    var restoreMsg = (document.getElementById('_restoreMsg') || {}).value || 'Your account has been restored.';
    if (!restoreMsg.trim()) { if (msgEl) { msgEl.style.color = 'var(--error)'; msgEl.textContent = 'Please enter a message for the user.'; } return; }
    if (msgEl) { msgEl.style.color = 'var(--text-dim)'; msgEl.textContent = 'Restoring...'; }
    try {
        var restoreSubject = (document.getElementById('_restoreSubject') || {}).value || '[Filmnance] Account Restored';
        var params = new URLSearchParams({ message: restoreMsg, subject: restoreSubject });
        var res = await fetch('/api/v1/admin/users/' + userId + '/unban?' + params, { method: 'POST', headers: getHeaders() });
        if (res.ok) {
            var m = document.getElementById('_restoreModal'); if (m) m.remove();
            if (typeof showToast === 'function') showToast('User restored. Message sent to Gmail.', 'success');
            loadArchivedUsers();
            if (typeof loadUsers === 'function') loadUsers();
        } else {
            var d = await res.json();
            if (msgEl) { msgEl.style.color = 'var(--error)'; msgEl.textContent = d.detail || 'Failed'; }
        }
    } catch (e) { if (msgEl) { msgEl.style.color = 'var(--error)'; msgEl.textContent = 'Network error'; } }
}
// ── Load Removed Loans (Settings) ──
window.toggleRemovedLoans = function () {
    var box = document.getElementById('removedLoansToggle');
    var btn = document.getElementById('removedLoansBtn');
    var chev = document.getElementById('removedLoansChevron');
    if (!box) return;
    var isOpen = box.style.display !== 'none';
    box.style.display = isOpen ? 'none' : 'block';
    if (btn) btn.innerHTML = '<i class="fas fa-chevron-' + (isOpen ? 'down' : 'up') + '" style="margin-right:0.3rem"></i>' + (isOpen ? 'Show' : 'Hide') + ' Removed Loans';
    if (!isOpen) loadRemovedLoans();
};

window.loadRemovedLoans = async function () {
    var el = document.getElementById('removedLoansList');
    if (!el) return;
    try {
        var res = await fetch('/api/v1/admin/loans/all', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to load loans');
        var loans = await res.json();
        // FIX: show BOTH rejected (move-to-trash candidates) and removed (already trashed,
        // can be hard-deleted). Previously only showed 'rejected' so removed loans
        // appeared to "still be there" since they never showed in this list with a
        // purge button — users couldn't finish the cleanup.
        var rejected = loans.filter(function (l) { return l.status === 'rejected'; });
        var removed  = loans.filter(function (l) { return l.status === 'removed'; });
        var combined = rejected.concat(removed);

        if (!combined.length) {
            el.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--text-dim);font-size:0.84rem">No rejected or removed loan applications.</div>';
            return;
        }
        el.innerHTML = '';


        function buildCard(l) {
            var isRemoved = l.status === 'removed';
            var ownerName = esc(l.owner && l.owner.name ? l.owner.name : '—');
            var rawMethod = (l.disbursement_method || '').toLowerCase().trim();
            var rawAccount = (l.disbursement_account || '').trim();
            var hasDisb = rawMethod && rawMethod !== 'pending' && rawAccount && rawAccount !== 'TBD';
            var appliedDate = l.created_at ? new Date(l.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
            var termStr = l.duration_months ? l.duration_months + ' months @ ' + (l.interest_rate ? Math.round(parseFloat(l.interest_rate) * 100) : 15) + '%' : '—';

            var card = document.createElement('div');
            card.className = 'loan-card ' + l.status;
            card.id = 'settingsLoanCard_' + l.id;
            card.style.cssText = 'border-left:3px solid ' + (isRemoved ? 'rgba(239,68,68,0.5)' : '#ef4444') + ';margin-bottom:0.75rem;' + (isRemoved ? 'opacity:0.75' : '');
            card.innerHTML =
                '<div class="card-top">'
                + '<div><div class="card-title">' + esc(l.project_title || 'Untitled Project') + '</div>'
                + '<div class="card-meta">' + ownerName + ' &nbsp;&middot;&nbsp; #' + l.id + '</div></div>'
                + '<div class="card-amount">' + fmtPHP(l.amount) + '</div>'
                + '</div>'
                + '<div class="card-info">'
                + (hasDisb ? '<div class="card-row" style="padding-bottom:0.5rem;margin-bottom:0.3rem;border-bottom:1px solid rgba(255,255,255,0.05)"><span class="card-row-label">Disburse To</span><span class="card-row-val">' + esc(rawMethod.charAt(0).toUpperCase() + rawMethod.slice(1)) + ' — ' + esc(rawAccount) + '</span></div>' : '')
                + '<div class="card-row"><span class="card-row-label">Status</span>'
                + '<span style="font-size:0.7rem;font-weight:800;padding:0.22rem 0.65rem;border-radius:6px;background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.3)">' + (isRemoved ? 'REMOVED' : 'REJECTED') + '</span>'
                + '</div>'
                + '<div class="card-row"><span class="card-row-label">Term</span><span class="card-row-val">' + termStr + '</span></div>'
                + '<div class="card-row"><span class="card-row-label">Applied</span><span class="card-row-val">' + appliedDate + '</span></div>'
                + (l.admin_notes ? '<div class="card-row"><span class="card-row-label">Reason</span><span class="card-row-val" style="color:#ef4444;font-style:italic;word-break:break-word;overflow-wrap:break-word;white-space:pre-wrap;max-height:60px;overflow-y:auto">' + esc(l.admin_notes) + '</span></div>' : '')
                + '</div>'
                + '<div class="card-actions">'
                + '<button onclick="openLoanDetails(' + l.id + ')" class="action-btn ghost _rippleBtn" style="font-size:0.78rem"><i class="fa-solid fa-eye" style="margin-right:0.3rem"></i>Details</button>'
                + (isRemoved
                    ? ' <button onclick="purgeLoanForever(' + l.id + ',\'' + esc(l.project_title || 'this loan') + '\')" class="action-btn danger _rippleBtn" style="font-size:0.78rem;background:rgba(239,68,68,0.2)"><i class="fa-solid fa-bomb" style="margin-right:0.3rem"></i>Delete Permanently</button>'
                    : ' <button onclick="purgeLoanForever(' + l.id + ',\'' + esc(l.project_title || 'this loan') + '\')" class="action-btn danger _rippleBtn" style="font-size:0.78rem;background:rgba(239,68,68,0.2)"><i class="fa-solid fa-bomb" style="margin-right:0.3rem"></i>Delete Permanently</button>'
                  )
                + '</div>';
            return card;
        }

        rejected.forEach(function (l) { el.appendChild(buildCard(l)); });
        removed.forEach(function (l) { el.appendChild(buildCard(l)); });

    } catch (e) {
        el.innerHTML = '<p style="color:var(--error);font-size:0.8rem;padding:0.5rem">' + e.message + '</p>';
    }
};

// Hard-delete a loan permanently from the database (issue #12 fix)
window.purgeLoanForever = function (loanId, title) {
    var ex = document.getElementById('_purgeConfirmModal'); if (ex) ex.remove();
    var ov = document.createElement('div');
    ov.id = '_purgeConfirmModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.82);backdrop-filter:blur(8px)';

    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid rgba(239,68,68,0.5);border-radius:1.25rem;max-width:440px;width:calc(100% - 2rem);box-shadow:0 32px 80px rgba(0,0,0,0.8);overflow:hidden';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:rgba(239,68,68,0.12);border-bottom:1px solid rgba(239,68,68,0.3);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:0.65rem';
    hdr.innerHTML = '<div style="width:36px;height:36px;border-radius:10px;background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.4);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fa-solid fa-bomb" style="color:#ef4444;font-size:0.95rem"></i></div>'
        + '<div><div style="font-weight:800;color:#ef4444;font-size:0.95rem">⚠ Delete Permanently</div>'
        + '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.05rem">"' + esc(title) + '"</div></div>';

    var body = document.createElement('div');
    body.style.cssText = 'padding:1.35rem 1.25rem';
    body.innerHTML = '<p style="font-size:0.88rem;color:var(--text);line-height:1.6;margin:0 0 0.75rem">This will <strong style="color:#ef4444">permanently delete</strong> this loan and all associated data (schedules, transactions, receipts, monthly updates) from the database.</p>'
        + '<p style="font-size:0.82rem;color:#ef4444;margin:0;font-weight:700">⚠ This cannot be undone. The loan will be gone forever.</p>';

    var footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:0.6rem;padding:0 1.25rem 1.25rem';

    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;color:var(--text-dim);cursor:pointer;font-size:0.84rem;font-weight:600';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = function () { ov.remove(); };

    var deleteBtn = document.createElement('button');
    deleteBtn.style.cssText = 'flex:2;padding:0.75rem;background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.5);border-radius:10px;color:#ef4444;cursor:pointer;font-size:0.84rem;font-weight:800;display:flex;align-items:center;justify-content:center;gap:0.45rem';
    deleteBtn.innerHTML = '<i class="fa-solid fa-bomb"></i> Delete Forever';
    deleteBtn.addEventListener('click', function () {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
        fetch('/api/v1/admin/loans/' + loanId + '/purge', { method: 'DELETE', headers: getHeaders() })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (x) {
                ov.remove();
                if (!x.ok) throw new Error(x.d.detail || 'Failed');
                if (typeof showToast === 'function') showToast('Loan permanently deleted. It is gone from the system.', 'success');
                // Remove the card from the DOM immediately so it doesn't persist
                var card = document.getElementById('settingsLoanCard_' + loanId);
                if (card) card.remove();
                loadRemovedLoans();
            })
            .catch(function (e) {
                ov.remove();
                if (typeof showToast === 'function') showToast(e.message, 'error');
            });
    });

    footer.appendChild(cancelBtn); footer.appendChild(deleteBtn);
    box.appendChild(hdr); box.appendChild(body); box.appendChild(footer);
    ov.appendChild(box);
    ov.onclick = function (e) { if (e.target === ov) cancelBtn.onclick(); };
    document.body.appendChild(ov);
};

// ── Estimated Revenue from disbursed loans ──
window.loadEstRevenueFromLoans = async function () {
    try {
        var res = await fetch('/api/v1/admin/loans/all', { headers: getHeaders() });
        if (!res.ok) return;
        var loans = await res.json();
        var disbursed = loans.filter(function (l) { return l.status === 'disbursed'; });
        var total = 0;
        disbursed.forEach(function (l) {
            var amt = parseFloat(l.amount || 0);
            var months = parseInt(l.term_months || l.duration_months || 0, 10);
            var rawRate = parseFloat(l.interest_rate || 0);
            var annualRate = rawRate > 1 ? rawRate / 100 : rawRate;
            if (annualRate === 0) annualRate = 0.15;
            // Simple interest: P × r × t (t in years)
            var years = months / 12;
            total += amt * annualRate * years;
        });
        var el = document.getElementById('receiptEstRevenue');
        if (el) el.textContent = '\u20B1' + total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } catch (e) { console.error('Est revenue error:', e); }
};

// ── Receipt Totals ──
function updateReceiptTotals(receipts) {
    var total = 0;
    (receipts || []).forEach(function (r) { var amt = parseFloat(r.amount || r.payment_amount || 0); if (!isNaN(amt)) total += amt; });
    var el = document.getElementById('receiptTotalAmount');
    if (el) el.textContent = '₱' + total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var ec = document.getElementById('receiptTotalCount');
    if (ec) ec.textContent = (receipts || []).length;
}
// ── Display Theme Toggle ──
window.adminToggleTheme = function () {
    var html = document.documentElement;
    var current = localStorage.getItem('adminTheme') || (html.classList.contains('light') ? 'light' : 'dark');
    var next = current === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    html.classList.remove('light', 'dark');
    html.classList.add(next);
    try { localStorage.setItem('adminTheme', next); } catch (e) { }
    _syncAdminThemeBtn();
};

window._syncAdminThemeBtn = function () {
    var theme = localStorage.getItem('adminTheme') || 'dark';
    var html = document.documentElement;
    html.setAttribute('data-theme', theme);
    html.classList.remove('light', 'dark');
    html.classList.add(theme);
    var btn = document.getElementById('adminThemeBtn');
    if (!btn) return;
    btn.innerHTML = theme === 'light'
        ? '<i class="fas fa-moon" style="margin-right:0.3rem"></i>Dark Mode'
        : '<i class="fas fa-sun" style="margin-right:0.3rem"></i>Light Mode';
};

document.addEventListener('DOMContentLoaded', function () {
    if (typeof _syncAdminThemeBtn === 'function') _syncAdminThemeBtn();
});

// ── Delegation for Remove button in settings ──
(function () {
    if (window._settingsRmDelegated) return;
    window._settingsRmDelegated = true;
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('._rmLoanBtn');
        if (!btn) return;
        var loanId = btn.getAttribute('data-remove-loan-id');
        if (!loanId) return;
        btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        _showRemoveConfirmModal(loanId, btn);
    });
})();

// ── Custom confirm modal for Remove Loan ──
function _showRemoveConfirmModal(loanId, triggerBtn) {
    var ex = document.getElementById('_rmConfirmModal'); if (ex) ex.remove();
    var ov = document.createElement('div');
    ov.id = '_rmConfirmModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px)';

    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid rgba(239,68,68,0.3);border-radius:1.25rem;max-width:420px;width:calc(100% - 2rem);box-shadow:0 32px 80px rgba(0,0,0,0.7);overflow:hidden;animation:slideUpFade 0.22s ease';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:rgba(239,68,68,0.08);border-bottom:1px solid rgba(239,68,68,0.2);padding:1rem 1.25rem;display:flex;align-items:center;gap:0.65rem';
    hdr.innerHTML = '<div style="width:32px;height:32px;border-radius:9px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fa-solid fa-trash-can" style="color:#ef4444;font-size:0.85rem"></i></div>'
        + '<div><div style="font-weight:800;color:var(--text);font-size:0.92rem">Remove Loan Application</div>'
        + '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.05rem">This action cannot be undone</div></div>';

    var body = document.createElement('div');
    body.style.cssText = 'padding:1.25rem';
    body.innerHTML = '<p style="font-size:0.85rem;color:var(--text-dim);line-height:1.55;margin:0">Are you sure you want to permanently remove this loan application from the system? It will no longer appear in any records.</p>';

    var footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:0.6rem;padding:0 1.25rem 1.25rem';

    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;color:var(--text-dim);cursor:pointer;font-size:0.84rem;font-weight:600;transition:all 0.18s';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = function () { ov.remove(); if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.innerHTML = '<i class="fa-solid fa-trash-can" style="margin-right:0.3rem"></i>Remove'; } };

    var confirmBtn = document.createElement('button');
    confirmBtn.style.cssText = 'flex:2;padding:0.75rem;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:10px;color:#ef4444;cursor:pointer;font-size:0.84rem;font-weight:800;display:flex;align-items:center;justify-content:center;gap:0.45rem;transition:all 0.2s';
    confirmBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Yes, Remove';
    confirmBtn.addEventListener('click', function () {
        confirmBtn.disabled = true; confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Removing...';
        fetch('/api/v1/admin/loans/' + loanId + '/remove', { method: 'POST', headers: getHeaders() })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (x) {
                ov.remove();
                if (!x.ok) throw new Error(x.d.detail || 'Failed');
                if (typeof showToast === 'function') showToast('Loan permanently removed.', 'info');
                if (typeof loadRemovedLoans === 'function') loadRemovedLoans();
            })
            .catch(function (e) {
                ov.remove();
                if (typeof showToast === 'function') showToast(e.message, 'error');
                if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.innerHTML = '<i class="fa-solid fa-trash-can" style="margin-right:0.3rem"></i>Remove'; }
            });
    });

    footer.appendChild(cancelBtn); footer.appendChild(confirmBtn);
    box.appendChild(hdr); box.appendChild(body); box.appendChild(footer);
    ov.appendChild(box);
    ov.onclick = function (e) { if (e.target === ov) cancelBtn.onclick(); };
    document.body.appendChild(ov);
}

// ── openLoanDetails alias for settings panel ──
window.openLoanDetails = function (loanId) {
    if (typeof window.openLoanModal === 'function') {
        window.openLoanModal(loanId);
    } else {
        if (typeof showToast === 'function') showToast('Loading loan details...', 'info');
        // Fallback: navigate to loan requests section
        if (typeof showSection === 'function') showSection('loans', null);
    }
};
// ── Archived Users (from admin_messages.js) ──
// ── Load Archived Users for Settings ──
async function loadArchivedUsers() {
    var list = document.getElementById('archivedUsersList');
    if (!list) return;
    list.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem">Loading…</p>';
    try {
        var res = await fetch('/api/v1/admin/users/search?status=archived', { headers: getHeaders() });
        var data = await res.json();
        var users = (data.users || data || []).filter(function (u) { return u.account_status === 'archived'; });
        if (!users.length) {
            list.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem">No archived accounts found.</p>';
            return;
        }
        list.innerHTML = users.map(function (u) {
            return '<div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0.8rem;background:var(--bg-card);border:1px solid var(--border);border-radius:9px;margin-bottom:0.4rem">' +
                '<div><div style="font-size:0.83rem;font-weight:700;color:var(--text)">' + (u.name || 'Unknown') + '</div>' +
                '<div style="font-size:0.7rem;color:var(--text-dim)">' + (u.email || '') + '</div></div>' +
                '<button onclick="unarchiveUser(' + u.id + ',\'' + (u.email || '') + '\')" style="padding:0.4rem 0.85rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);border-radius:8px;color:#22c55e;font-size:0.75rem;font-weight:700;cursor:pointer">' +
                '<i class="fas fa-rotate-left" style="margin-right:0.3rem"></i>Restore</button>' +
                '</div>';
        }).join('');
    } catch (e) {
        list.innerHTML = '<p style="color:var(--error);font-size:0.8rem">Failed to load archived users.</p>';
    }
}

function unarchiveUser(userId, userEmail) {
    var ex = document.getElementById('_restoreModal'); if (ex) ex.remove();

    var ov = document.createElement('div');
    ov.id = '_restoreModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10002;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);padding:1rem';

    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:1.25rem;max-width:520px;width:100%;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.6)';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:rgba(34,197,94,0.08);border-bottom:1px solid rgba(34,197,94,0.18);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:0.75rem';
    hdr.innerHTML = '<i class="fa-solid fa-rotate-left" style="color:#22c55e;font-size:1.1rem"></i><div style="font-weight:700;color:#22c55e;font-size:0.95rem">Restore This Account</div>';
    var xBtn = document.createElement('button');
    xBtn.style.cssText = 'margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem';
    xBtn.innerHTML = '<i class="fas fa-times"></i>';
    xBtn.addEventListener('click', function () { ov.remove(); });
    hdr.appendChild(xBtn);

    var body = document.createElement('div');
    body.style.cssText = 'padding:1.25rem';

    var toLabel = document.createElement('label');
    toLabel.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem';
    toLabel.textContent = 'To';
    var toVal = document.createElement('div');
    toVal.style.cssText = 'background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);padding:0.55rem 0.9rem;font-size:0.84rem;color:#22c55e;font-weight:600;margin-bottom:0.85rem';
    toVal.textContent = userEmail || '—';

    var subLabel = document.createElement('label');
    subLabel.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem';
    subLabel.textContent = 'Subject';
    var subInput = document.createElement('input');
    subInput.id = '_restoreSubject';
    subInput.type = 'text';
    subInput.value = '[Filmnance] Account Restored';
    subInput.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.65rem 0.9rem;margin-bottom:0.85rem;font-size:0.84rem;box-sizing:border-box';

    var msgLabel = document.createElement('label');
    msgLabel.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem';
    msgLabel.innerHTML = 'Message <span style="color:#22c55e">*</span>';
    var msgArea = document.createElement('textarea');
    msgArea.id = '_restoreMsg';
    msgArea.rows = 5;
    msgArea.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.75rem;font-size:0.85rem;font-family:inherit;resize:vertical;box-sizing:border-box;min-height:120px';
    msgArea.value = 'Your account has been restored. You may now log in to Filmnance again.';

    var statusP = document.createElement('p');
    statusP.id = '_rMsg';
    statusP.style.cssText = 'font-size:0.78rem;min-height:1rem;color:var(--text-dim);margin-top:0.5rem';

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:0.6rem;margin-top:0.85rem';

    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () { ov.remove(); });

    var confirmBtn = document.createElement('button');
    confirmBtn.style.cssText = 'flex:2;padding:0.75rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:var(--r);color:#22c55e;cursor:pointer;font-size:0.85rem;font-weight:700';
    confirmBtn.innerHTML = '<i class="fa-solid fa-rotate-left" style="margin-right:0.4rem"></i>Confirm Restore';
    confirmBtn.addEventListener('click', function () { _doRestore(userId); });

    btns.appendChild(cancelBtn);
    btns.appendChild(confirmBtn);
    body.appendChild(toLabel);
    body.appendChild(toVal);
    body.appendChild(subLabel);
    body.appendChild(subInput);
    body.appendChild(msgLabel);
    body.appendChild(msgArea);
    body.appendChild(statusP);
    body.appendChild(btns);
    box.appendChild(hdr);
    box.appendChild(body);
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
}

async function _doRestore(userId) {
    var msgEl = document.getElementById('_rMsg');
    var restoreMsg = (document.getElementById('_restoreMsg') || {}).value || 'Your account has been restored.';
    if (!restoreMsg.trim()) { if (msgEl) { msgEl.style.color = 'var(--error)'; msgEl.textContent = 'Please enter a message for the user.'; } return; }
    if (msgEl) { msgEl.style.color = 'var(--text-dim)'; msgEl.textContent = 'Restoring...'; }
    try {
        var restoreSubject = (document.getElementById('_restoreSubject') || {}).value || '[Filmnance] Account Restored';
        var params = new URLSearchParams({ message: restoreMsg, subject: restoreSubject });
        var res = await fetch('/api/v1/admin/users/' + userId + '/unban?' + params, { method: 'POST', headers: getHeaders() });
        if (res.ok) {
            var m = document.getElementById('_restoreModal'); if (m) m.remove();
            if (typeof showToast === 'function') showToast('User restored. Message sent to Gmail.', 'success');
            loadArchivedUsers();
            if (typeof loadUsers === 'function') loadUsers();
        } else {
            var d = await res.json();
            if (msgEl) { msgEl.style.color = 'var(--error)'; msgEl.textContent = d.detail || 'Failed'; }
        }
    } catch (e) { if (msgEl) { msgEl.style.color = 'var(--error)'; msgEl.textContent = 'Network error'; } }
}

// ── Removed Loans toggle (from admin_messages.js) ──
// ── Load Removed Loans (Settings) ──
// NOTE: The canonical implementation of loadRemovedLoans lives in
// admin_settings.js (which loads AFTER this file). Do NOT add a
// competing definition here — it would be silently overwritten.
// window.toggleRemovedLoans is safe to keep since it exists only once.
window.toggleRemovedLoans = function () {
    var box = document.getElementById('removedLoansToggle');
    var btn = document.getElementById('removedLoansBtn');
    if (!box) return;
    var isOpen = box.style.display !== 'none';
    box.style.display = isOpen ? 'none' : 'block';
    if (btn) btn.innerHTML = '<i class="fas fa-chevron-' + (isOpen ? 'down' : 'up') + '" style="margin-right:0.3rem"></i>' + (isOpen ? 'Show' : 'Hide') + ' Removed Loans';
    if (!isOpen && typeof loadRemovedLoans === 'function') loadRemovedLoans();
};


// ── Estimated Revenue from disbursed loans ──