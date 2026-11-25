// =============================================
// FILMNANCE — admin_repayment.js
// Repayment receipts: tab switching, loading,
// rendering, confirm/reject, schedule repair.
// Revenue helpers and active-loans panel.
// =============================================

// ── Revenue / totals helpers ──
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


// ── Active Loans Panel ──

// ── Active Loans Panel ──
window.loadActiveLoansPanel = async function () {
    var el = document.getElementById('activeLoansList');
    if (!el) return;
    el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div>';

    try {
        var res = await fetch('/api/v1/admin/loans/all', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to load active loans');
        var loans = await res.json();
        var active = loans.filter(function (l) { return l.status === 'disbursed'; });
        // Update badge
        var badge = document.getElementById('activeLoansBadge');
        if (badge) { badge.textContent = active.length; badge.style.display = active.length ? 'inline-flex' : 'none'; }
        if (!active.length) {
            el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-film"></i><p>No active loans yet. Approve a loan to see it here.</p></div>';
            return;
        }
        el.innerHTML = active.map(function (l) {
            return renderLoanCard(l);
        }).join('');
    } catch (e) {
        el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>' + esc(e.message) + '</p></div>';
    }
};



// ══════════════════════════════
// REPAYMENT RECEIPTS
// ══════════════════════════════
// ── RECEIPT TAB SWITCHER ──────────────────────────────────────────────────────
window.switchReceiptTab = function(tab, btn) {
    ['receiptTabPending','receiptTabApproved'].forEach(function(id){
        var b = document.getElementById(id); if (!b) return;
        b.style.background = 'var(--bg-card)'; b.style.borderColor = 'var(--border)'; b.style.color = 'var(--text-dim)';
        b.querySelectorAll('i,span:not(.nav-badge)').forEach(function(e){ e.style.color = 'var(--text-dim)'; });
    });
    if (btn) {
        if (tab === 'approved') {
            btn.style.background = 'rgba(34,197,94,0.1)'; btn.style.borderColor = 'rgba(34,197,94,0.4)'; btn.style.color = '#22c55e';
            btn.querySelectorAll('i,span:not(.nav-badge)').forEach(function(e){ e.style.color = '#22c55e'; });
        } else {
            btn.style.background = 'rgba(249,115,22,0.12)'; btn.style.borderColor = 'rgba(249,115,22,0.4)'; btn.style.color = '#f97316';
            btn.querySelectorAll('i,span:not(.nav-badge)').forEach(function(e){ e.style.color = '#f97316'; });
        }
    }
    // Show totals bar only on approved tab
    var totalsBar = document.getElementById('receiptsTotalBar');
    if (totalsBar) totalsBar.style.display = (tab === 'approved') ? 'flex' : 'none';
    if (tab === 'pending') _loadPendingReceipts();
    else _loadApprovedReceiptsInternal();
};

window.loadRepaymentReceipts = async function () {
    var pendingBtn = document.getElementById('receiptTabPending');
    var approvedBtn = document.getElementById('receiptTabApproved');
    // Style pending as active
    if (approvedBtn) {
        approvedBtn.style.background = 'var(--bg-card)'; approvedBtn.style.borderColor = 'var(--border)'; approvedBtn.style.color = 'var(--text-dim)';
        approvedBtn.querySelectorAll('i,span:not(.nav-badge)').forEach(function(e){ e.style.color = 'var(--text-dim)'; });
    }
    if (pendingBtn) {
        pendingBtn.style.background = 'rgba(249,115,22,0.12)'; pendingBtn.style.borderColor = 'rgba(249,115,22,0.4)'; pendingBtn.style.color = '#f97316';
        pendingBtn.querySelectorAll('i,span:not(.nav-badge)').forEach(function(e){ e.style.color = '#f97316'; });
    }
    var totalsBar = document.getElementById('receiptsTotalBar');
    if (totalsBar) totalsBar.style.display = 'none';
    await _loadPendingReceipts();
};

async function _loadPendingReceipts() {
    const container = document.getElementById('repaymentReceiptsList');
    if (!container) return;
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div>`;
    try {
        const res = await fetch('/api/v1/admin/repayment-receipts/pending', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to load receipts');
        const receipts = await res.json();
        setBadge('receiptBadge', receipts.length);
        if (!receipts.length) {
            container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-receipt" style="color:var(--text-dim);font-size:2.5rem;margin-bottom:0.75rem;opacity:0.4"></i><p style="color:var(--text-dim);font-size:0.88rem">No pending repayment receipts</p><p style="color:var(--text-dim);font-size:0.74rem;margin-top:0.25rem;opacity:0.7">Receipts submitted by producers will appear here</p></div>`;
            return;
        }
        container.innerHTML = `<div style="width:100%;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.78rem"><thead><tr style="border-bottom:1px solid var(--border)"><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">PROJECT</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">USER</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">FILMMAKER ROLE</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">PAYMENT METHOD</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">AMOUNT</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">REFERENCE</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">SUBMITTED</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">RECEIPT</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">ACTION</th></tr></thead><tbody>${receipts.map(r => _renderReceiptCard(r, 'pending')).join('')}</tbody></table></div>`;
    } catch (e) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${e.message}</p></div>`;
    }
}

window.loadApprovedReceipts = async function () {
    var approvedBtn = document.getElementById('receiptTabApproved');
    window.switchReceiptTab('approved', approvedBtn);
};

async function _loadApprovedReceiptsInternal() {
    const container = document.getElementById('repaymentReceiptsList');
    if (!container) return;
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div>`;
    try {
        const res = await fetch('/api/v1/admin/repayment-receipts/approved', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to load approved receipts');
        const receipts = await res.json();
        // Update totals
        var totalAmt = receipts.reduce(function(s,r){ return s + (r.amount||0); }, 0);
        var countEl = document.getElementById('receiptTotalCount');
        var amtEl = document.getElementById('receiptTotalAmount');
        if (countEl) countEl.textContent = receipts.length;
        if (amtEl) amtEl.textContent = fmtPHP(totalAmt);
        // Show the totals bar
        var totalsBar = document.getElementById('receiptsTotalBar');
        if (totalsBar) totalsBar.style.display = 'flex';
        // Calculate Est. Revenue from disbursed loans
        if (window.loadEstRevenueFromLoans) window.loadEstRevenueFromLoans();
        if (!receipts.length) {
            container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-check" style="color:var(--text-dim);font-size:2.5rem;margin-bottom:0.75rem;opacity:0.4"></i><p style="color:var(--text-dim);font-size:0.88rem">No approved receipts yet</p></div>`;
            return;
        }
        container.innerHTML = `<div style="width:100%;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.78rem"><thead><tr style="border-bottom:1px solid var(--border)"><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">PROJECT</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">USER</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">FILMMAKER ROLE</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">PAYMENT METHOD</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">AMOUNT</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">REFERENCE</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">SUBMITTED</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">RECEIPT</th><th style="padding:0.5rem 0.75rem;text-align:left;color:var(--text-dim);white-space:nowrap">STATUS</th></tr></thead><tbody>${receipts.map(r => _renderReceiptCard(r, 'approved')).join('')}</tbody></table></div>`;
    } catch (e) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${e.message}</p></div>`;
    }
}

function _renderReceiptCard(r, status) {
    const roleDisp = (r.filmmaker_role && r.filmmaker_role !== '—') ? esc(r.filmmaker_role) : 'N/A';
    const statusBadgeHtml = status === 'pending'
        ? `<span style="font-size:0.65rem;font-weight:700;color:#f97316;background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:4px;padding:0.15rem 0.45rem">PENDING</span>`
        : `<span style="font-size:0.65rem;font-weight:700;color:#22c55e;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:4px;padding:0.15rem 0.45rem">APPROVED</span>`;
    const proofHtml = r.proof_url
        ? `<img src="${esc(r.proof_url)}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:zoom-in;display:block" onclick="openImgModal('${esc(r.proof_url)}')" onerror="this.style.display='none'">`
        : `<span style="color:var(--text-dim);font-size:0.72rem">—</span>`;
    const actions = status === 'pending'
        ? `<td style="padding:0.5rem 0.75rem;white-space:nowrap;vertical-align:middle">
               <div style="display:flex;gap:0.4rem">
                   <button onclick="confirmReceipt(${r.id},'${esc(r.producer_name)}',${r.amount},'${esc(r.project_title)}','${esc(r.reference_number || '')}')" style="padding:0.35rem 0.7rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:6px;color:#22c55e;cursor:pointer;font-size:0.75rem;font-weight:700" onmouseover="this.style.background='rgba(34,197,94,0.22)'" onmouseout="this.style.background='rgba(34,197,94,0.1)'"><i class="fas fa-check"></i> Approve</button>
                   <button onclick="rejectReceipt(${r.id})" style="padding:0.35rem 0.7rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;color:#ef4444;cursor:pointer;font-size:0.75rem;font-weight:700" onmouseover="this.style.background='rgba(239,68,68,0.22)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'"><i class="fas fa-ban"></i> Reject</button>
               </div>
           </td>`
        : `<td style="padding:0.5rem 0.75rem;vertical-align:middle">${statusBadgeHtml}</td>`;

    return `<tr id="receipt_${r.id}" style="border-bottom:1px solid rgba(255,255,255,0.05)">
        <td style="padding:0.5rem 0.75rem;font-size:0.78rem;font-weight:600;color:var(--text);white-space:nowrap;vertical-align:middle">${esc(r.project_title || '—')}</td>
        <td style="padding:0.5rem 0.75rem;font-size:0.75rem;color:var(--text);white-space:nowrap;vertical-align:middle">${esc(r.producer_name || '—')}</td>
        <td style="padding:0.5rem 0.75rem;font-size:0.75rem;color:var(--text);white-space:nowrap;vertical-align:middle">${esc(roleDisp)}</td>
        <td style="padding:0.5rem 0.75rem;font-size:0.75rem;color:var(--text);white-space:nowrap;vertical-align:middle">${esc(r.method || '—')}</td>
        <td style="padding:0.5rem 0.75rem;font-size:0.8rem;font-weight:700;color:var(--gold);white-space:nowrap;vertical-align:middle">${fmtPHP(r.amount)}</td>
        <td style="padding:0.5rem 0.75rem;font-size:0.72rem;font-family:monospace;color:var(--gold);white-space:nowrap;vertical-align:middle">${esc(r.reference_number || '—')}</td>
        <td style="padding:0.5rem 0.75rem;font-size:0.72rem;color:var(--text-dim);white-space:nowrap;vertical-align:middle">${r.submitted_at ? fmtDate(r.submitted_at) : '—'}</td>
        <td style="padding:0.5rem 0.75rem;vertical-align:middle">${proofHtml}</td>
        ${actions}
    </tr>`;
}

window.confirmReceipt = async function (receiptId, producerName, amount, projectTitle, ref) {
    if (!confirm(`Approve repayment of ₱${Number(amount).toLocaleString()} from ${producerName}?`)) return;
    try {
        const res = await fetch(`/api/v1/admin/repayment-receipts/${receiptId}/confirm`, {
            method: 'POST', headers: getHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Confirmation failed');
        document.getElementById(`receipt_${receiptId}`)?.remove();
        showRepaymentConfirmedPopup(
            data.producer_name || producerName,
            data.amount || amount,
            data.project_title || projectTitle,
            data.reference || ref
        );
        showToast(`Repayment approved for ${producerName}!`, 'success');
        loadAdminNotifications();
        loadDashboard();
        // Refresh badge
        const pending = await fetch('/api/v1/admin/repayment-receipts/pending', { headers: getHeaders() });
        if (pending.ok) { const d = await pending.json(); setBadge('receiptBadge', d.length); }
    } catch (e) {
        showToast(e.message, 'error');
    }
};

window.rejectReceipt = async function (receiptId) {
    // Show modal for reason
    var ex = document.getElementById('_rejectReceiptModal'); if (ex) ex.remove();
    var ov = document.createElement('div');
    ov.id = '_rejectReceiptModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);padding:1rem';
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid rgba(239,68,68,0.25);border-radius:1.25rem;max-width:420px;width:100%;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.6)';
    box.innerHTML = '<div style="background:rgba(239,68,68,0.07);border-bottom:1px solid rgba(239,68,68,0.15);padding:1rem 1.25rem;display:flex;align-items:center;gap:0.75rem">'
        + '<i class="fas fa-ban" style="color:#ef4444;font-size:1rem"></i>'
        + '<div style="font-weight:700;color:#ef4444;font-size:0.92rem;flex:1">Reject Receipt</div>'
        + '<button onclick="document.getElementById(\'_rejectReceiptModal\').remove()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem"><i class="fas fa-times"></i></button>'
        + '</div>'
        + '<div style="padding:1.25rem">'
        + '<p style="font-size:0.86rem;color:var(--text);margin-bottom:0.75rem">Reason for rejection <span style="color:#ef4444">*</span></p>'
        + '<textarea id="_rejectReceiptReason" rows="3" placeholder="e.g. Wrong reference number, incorrect amount..." style="width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:0.65rem;font-size:0.84rem;resize:vertical;box-sizing:border-box"></textarea>'
        + '<p id="_rejectReceiptMsg" style="font-size:0.78rem;min-height:1rem;color:var(--error);margin-top:0.4rem"></p>'
        + '</div>'
        + '<div style="display:flex;gap:0.6rem;padding:0 1.25rem 1.25rem">'
        + '<button onclick="document.getElementById(\'_rejectReceiptModal\').remove()" style="flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text-dim);cursor:pointer;font-size:0.82rem">Cancel</button>'
        + '<button id="_rejectReceiptConfirmBtn" onclick="_doRejectReceipt('+receiptId+')" style="flex:2;padding:0.75rem;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:8px;color:#ef4444;cursor:pointer;font-size:0.85rem;font-weight:700"><i class="fas fa-ban" style="margin-right:0.4rem"></i>Confirm Reject</button>'
        + '</div>';
    ov.appendChild(box);
    ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
    document.body.appendChild(ov);
    setTimeout(function(){ const t=document.getElementById('_rejectReceiptReason'); if(t) t.focus(); }, 100);
};

window._doRejectReceipt = async function(receiptId) {
    const reason = (document.getElementById('_rejectReceiptReason')?.value || '').trim();
    const msgEl = document.getElementById('_rejectReceiptMsg');
    const btn = document.getElementById('_rejectReceiptConfirmBtn');
    if (!reason) { if(msgEl) msgEl.textContent = 'Please enter a reason.'; return; }
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rejecting...'; }
    try {
        const res = await fetch(`/api/v1/admin/repayment-receipts/${receiptId}/reject?reason=${encodeURIComponent(reason)}`, {
            method: 'POST', headers: getHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Rejection failed');
        document.getElementById('_rejectReceiptModal')?.remove();
        document.getElementById(`receipt_${receiptId}`)?.remove();
        showToast('Receipt rejected. Producer notified.', 'info');
        // Log and refresh
        loadAdminNotifications();
        const pending = await fetch('/api/v1/admin/repayment-receipts/pending', { headers: getHeaders() });
        if (pending.ok) { const d = await pending.json(); setBadge('receiptBadge', d.length); }
    } catch (e) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-ban" style="margin-right:0.4rem"></i>Confirm Reject'; }
        if (msgEl) msgEl.textContent = e.message;
    }
};
// ── REPAIR LOAN SCHEDULES ────────────────────────────────────────────────────
window.repairLoanSchedules = async function() {
    if (!confirm('This will rebuild all loan schedules based on production phase rules.\n\nNormal Loans (Production/Post-Production/Dist&Mktg): First due = Applied + 1 month\nGrace Loans (Development/Pre-Production): Months 1-3 = Monthly Updates, then repayment from month 4.\n\nContinue?')) return;
    try {
        showToast('Repairing loan schedules...', 'info');
        const res = await fetch('/api/v1/admin/loans/repair-schedules', {
            method: 'POST', headers: getHeaders()
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.detail || 'Repair failed');
        var msg = d.message || 'Done.';
        if (d.errors && d.errors.length) msg += ' Errors: ' + d.errors.join('; ');
        showToast(msg, 'success');
        loadLoans(window.ADMIN_STATE && window.ADMIN_STATE.currentLoanFilter || 'disbursed');
    } catch(e) {
        showToast('Repair failed: ' + e.message, 'error');
    }
};