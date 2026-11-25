// ── Global ripple effect for all admin action buttons ──
(function () {
    if (document.getElementById('_adminRippleStyle')) return;
    var s = document.createElement('style');
    s.id = '_adminRippleStyle';
    s.textContent = '@keyframes _ripple{to{transform:scale(4);opacity:0}}'
        + '._rippleBtn{position:relative;overflow:hidden}'
        + '._ripple-circle{position:absolute;border-radius:50%;background:rgba(255,255,255,0.25);width:40px;height:40px;margin-top:-20px;margin-left:-20px;animation:_ripple 0.55s ease-out;pointer-events:none}';
    document.head.appendChild(s);
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('._rippleBtn,button.action-btn');
        if (!btn) return;
        btn.classList.add('_rippleBtn');
        var circle = document.createElement('span');
        circle.className = '_ripple-circle';
        var r = btn.getBoundingClientRect();
        circle.style.left = (e.clientX - r.left) + 'px';
        circle.style.top = (e.clientY - r.top) + 'px';
        btn.appendChild(circle);
        setTimeout(function () { if (circle.parentNode) circle.parentNode.removeChild(circle); }, 600);
    }, true);
})();
// ── Format term months into "X years Y months" ──
function fmtTerm(months) {
    var m = parseInt(months, 10);
    if (!m || isNaN(m)) return '—';
    var y = Math.floor(m / 12);
    var rem = m % 12;
    if (y > 0 && rem > 0) return y + ' year' + (y > 1 ? 's' : '') + ' ' + rem + ' month' + (rem > 1 ? 's' : '');
    if (y > 0) return y + ' year' + (y > 1 ? 's' : '');
    return rem + ' month' + (rem > 1 ? 's' : '');
}

/**
 * FILMNANCE ADMIN — LOAN MANAGEMENT
 * Handles: loan listing, filtering, approve, reject, detail modal
 * Assets: inline PDF iframe, image preview, video player, YouTube/Vimeo embed
 */

'use strict';

// ══════════════════════════════
// LOAD LOANS
// ══════════════════════════════
window.loadLoans = async function (filter) {
    const f = filter || ADMIN_STATE.currentLoanFilter || 'pending';
    // Use loanRequestsList (activeloans section) if visible, else fallback to loansList (loans section)
    const container = document.getElementById('loanRequestsList') || document.getElementById('loansList');
    if (!container) return;
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading loans...</p></div>`;

    try {
        const res = await fetch('/api/v1/admin/loans/all', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to fetch loans');
        const loans = await res.json();

        const filtered = f === 'all' ? loans : loans.filter(l => l.status === f);

        if (!filtered.length) {
            container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-film" style="font-size:2.5rem;opacity:0.4;margin-bottom:0.75rem"></i><p style="font-weight:600;color:var(--text-dim)">No Loan Requests</p><p style="font-size:0.78rem;color:var(--text-dim);opacity:0.7;margin-top:0.25rem">Loan applications from producers will appear here</p></div>`;
            return;
        }

        container.innerHTML = filtered.map(loan => renderLoanCard(loan)).join('');
    } catch (e) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${e.message}</p></div>`;
    }
};

window.filterLoans = function (filter, btn) {
    ADMIN_STATE.currentLoanFilter = filter;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadLoans(filter);
};

function renderLoanCard(loan) {
    const isPending = loan.status === 'pending';
    const isDisbursed = loan.status === 'disbursed';
    // Parse disbursement for display on the card
    const rawMethod = (loan.disbursement_method || '').toLowerCase().trim();
    const rawAccount = (loan.disbursement_account || '').trim();
    const pm = ADMIN_PH_METHODS.find(p => p.key === rawMethod);
    const pmLabel = pm ? pm.label : (rawMethod || null);
    const hasDisb = pmLabel && rawMethod !== 'pending' && rawAccount && rawAccount !== 'TBD';

    // For disbursed loans, we load schedule data async to show Progress/Next Due
    const schedId = 'loanSched_' + loan.id;
    if (isDisbursed) {
        setTimeout(function () { _loadActiveLoanScheduleInfo(loan.id); }, 0);
    }

    return `
    <div class="loan-card ${esc(loan.status)}" id="loanCard${loan.id}">
        <div class="card-top">
            <div>
                <div class="card-title">${esc(loan.project_title || 'Untitled Project')}</div>
                <div class="card-meta">${esc(loan.owner?.name || '—')} · #${loan.id}</div>
            </div>
            <div class="card-amount">${fmtPHP(loan.amount)}</div>
        </div>
        <div class="card-info">
            ${isDisbursed && hasDisb ? `
            <div class="card-row" style="padding-bottom:0.5rem;margin-bottom:0.3rem;border-bottom:1px solid rgba(255,255,255,0.05)">
                <span class="card-row-label">Disburse To</span>
                <span class="card-row-val" style="display:flex;align-items:center;gap:0.4rem">
                    ${adminPmLogo(rawMethod, 22)}
                    <span style="font-size:0.76rem;font-weight:600;color:var(--text)">${esc(pmLabel)} &mdash; ${esc(rawAccount)}</span>
                </span>
            </div>` : ''}
            <div class="card-row">
                <span class="card-row-label">Status</span>
                <span>${statusBadge(loan.status)}</span>
            </div>
            <div class="card-row">
                <span class="card-row-label">Term</span>
                <span class="card-row-val">${fmtTerm(loan.term_months || loan.duration_months)} @ ${loan.interest_rate ? loan.interest_rate + '%' : '—'}</span>
            </div>
            ${isDisbursed ? `
            <div id="${schedId}_nextdue" class="card-row" style="display:none">
                <span class="card-row-label">Next Due</span>
                <span class="card-row-val" id="${schedId}_nextdue_val"></span>
            </div>
            <div id="${schedId}_progress" class="card-row" style="display:none">
                <span class="card-row-label">Progress</span>
                <span class="card-row-val" id="${schedId}_progress_val"></span>
            </div>
            <div id="${schedId}_bar" style="display:none;margin-top:0.3rem;height:4px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden">
                <div id="${schedId}_bar_fill" style="height:100%;background:var(--gold);border-radius:2px;transition:width 0.4s;width:0%"></div>
            </div>` : `
            <div class="card-row">
                <span class="card-row-label">Applied</span>
                <span class="card-row-val">${fmtDate(loan.created_at)}</span>
            </div>
            ${hasDisb ? `
            <div class="card-row" style="margin-top:0.2rem;padding-top:0.5rem;border-top:1px solid rgba(255,255,255,0.05)">
                <span class="card-row-label">Disburse To</span>
                <span class="card-row-val" style="display:flex;align-items:center;gap:0.4rem">
                    ${adminPmLogo(rawMethod, 22)}
                    <span style="font-size:0.76rem;font-weight:600;color:var(--text)">${esc(pmLabel)} &mdash; ${esc(rawAccount)}</span>
                </span>
            </div>` : ''}`}
        </div>
        ${loan.status === 'rejected' && loan.admin_notes ? `
        <div style="margin:0.4rem 0 0.5rem;padding:0.5rem 0.6rem;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.18);border-radius:6px">
            <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--error);margin-bottom:0.25rem;letter-spacing:0.08em">Rejection Reason</div>
            <div style="font-size:0.75rem;color:var(--text-dim);font-style:italic;word-break:break-word;white-space:pre-wrap;overflow-wrap:break-word;max-height:80px;overflow-y:auto;line-height:1.45">"${esc(loan.admin_notes)}"</div>
        </div>` : ''}
        <div class="card-actions">
            <button class="action-btn ghost _rippleBtn" onclick="openLoanModal(${loan.id})">
                <i class="fa-solid fa-eye"></i> Details
            </button>
            ${isPending ? `
            <button class="action-btn success _rippleBtn" onclick="approveLoan(${loan.id})">
                <i class="fa-solid fa-bolt"></i> Approve
            </button>
            <button class="action-btn danger _rippleBtn" onclick="openRejectModal(${loan.id})">
                <i class="fa-solid fa-ban"></i> Reject
            </button>
            ` : ''}
        </div>
    </div>`;
}

// Load schedule info for active loan cards (async)
window._loadActiveLoanScheduleInfo = async function (loanId) {
    var schedId = 'loanSched_' + loanId;
    try {
        var res = await fetch('/api/v1/admin/loans/' + loanId + '/schedule', { headers: getHeaders() });
        if (!res.ok) return;
        var sched = await res.json();
        if (!sched || !sched.length) return;
        var total = sched.length;
        var paid = sched.filter(function (s) { return s.status === 'paid'; }).length;
        var nextUnpaid = sched.find(function (s) { return s.status !== 'paid'; });
        var pct = total > 0 ? Math.round((paid / total) * 100) : 0;

        var ndEl = document.getElementById(schedId + '_nextdue');
        var ndVal = document.getElementById(schedId + '_nextdue_val');
        var prEl = document.getElementById(schedId + '_progress');
        var prVal = document.getElementById(schedId + '_progress_val');
        var barEl = document.getElementById(schedId + '_bar');
        var barFill = document.getElementById(schedId + '_bar_fill');

        if (nextUnpaid && ndEl && ndVal) {
            var dueDate = fmtDate(nextUnpaid.due_date);
            var dueAmt = fmtPHP(nextUnpaid.amount_due);
            ndVal.innerHTML = '<span style="color:var(--text)">' + dueDate + '</span> <span style="color:var(--text-dim);margin:0 0.2rem">—</span><span style="color:var(--gold);font-weight:700">' + dueAmt + '</span>';
            ndEl.style.display = '';
        }
        if (prEl && prVal) {
            prVal.innerHTML = '<span style="color:var(--text-dim)">' + paid + '/' + total + ' paid</span>';
            prEl.style.display = '';
        }
        if (barEl && barFill) {
            barEl.style.display = '';
            barFill.style.width = pct + '%';
        }
    } catch (e) { }
};

// ══════════════════════════════
// ASSET RENDERERS
// ══════════════════════════════

function resolveUrl(url) {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('/')) return url;
    return '/uploads/' + url;
}

function renderScriptAsset(url) {
    if (!url) return '<span style="color:var(--text-dim);font-size:0.78rem">Not provided</span>';
    const u = resolveUrl(url);
    const isPdf = u.toLowerCase().endsWith('.pdf');
    if (isPdf) {
        return '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;height:360px;margin-top:0.4rem">'
            + '<iframe src="' + esc(u) + '" style="width:100%;height:100%;border:none"></iframe>'
            + '</div>'
            + '<a href="' + esc(u) + '" target="_blank" style="display:inline-flex;align-items:center;gap:0.3rem;margin-top:0.4rem;font-size:0.72rem;color:var(--gold)">'
            + '<i class="fa-solid fa-arrow-up-right-from-square"></i> Open in new tab</a>';
    }
    return '<a href="' + esc(u) + '" target="_blank" style="display:inline-flex;align-items:center;gap:0.35rem;color:var(--gold);font-size:0.78rem;border:1px solid var(--gold-bdr);background:var(--gold-dim);padding:0.3rem 0.7rem;border-radius:0.4rem">'
        + '<i class="fa-solid fa-file-lines"></i> View Script</a>';
}

function renderLookbookAsset(url) {
    if (!url) return '<span style="color:var(--text-dim);font-size:0.78rem">Not provided</span>';
    const u = resolveUrl(url);
    const isImg = /\.(jpg|jpeg|png|webp|gif)$/i.test(u);
    const isPdf = u.toLowerCase().endsWith('.pdf');
    if (isImg) {
        return '<img src="' + esc(u) + '" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid var(--border);cursor:zoom-in;object-fit:contain;display:block;margin-top:0.4rem"'
            + ' onclick="openMediaLightbox(\'' + esc(u) + '\',\'image\')">';
    }
    if (isPdf) {
        return '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;height:360px;margin-top:0.4rem">'
            + '<iframe src="' + esc(u) + '" style="width:100%;height:100%;border:none"></iframe>'
            + '</div>'
            + '<a href="' + esc(u) + '" target="_blank" style="display:inline-flex;align-items:center;gap:0.3rem;margin-top:0.4rem;font-size:0.72rem;color:var(--gold)">'
            + '<i class="fa-solid fa-arrow-up-right-from-square"></i> Open in new tab</a>';
    }
    return '<a href="' + esc(u) + '" target="_blank" style="display:inline-flex;align-items:center;gap:0.35rem;color:var(--gold);font-size:0.78rem;border:1px solid var(--gold-bdr);background:var(--gold-dim);padding:0.3rem 0.7rem;border-radius:0.4rem">'
        + '<i class="fa-solid fa-book-open"></i> View Lookbook</a>';
}

function renderTrailerAsset(url) {
    if (!url) return '<span style="color:var(--text-dim);font-size:0.78rem">Not provided</span>';
    const u = resolveUrl(url);
    const isFile = /\.(mp4|mov|avi|mkv|webm)$/i.test(u);
    const isYt = u.includes('youtube.com') || u.includes('youtu.be');
    const isVimeo = u.includes('vimeo.com');

    if (isFile) {
        return '<div style="margin-top:0.4rem">'
            + '<div style="cursor:pointer;display:flex;align-items:center;gap:0.5rem;padding:0.7rem 1rem;background:var(--bg-input);border:1px solid var(--border);border-radius:8px" onclick="openMediaLightbox(\'' + esc(u) + '\',\'video\')">'
            + '<i class="fa-solid fa-circle-play" style="color:var(--gold);font-size:1.5rem"></i>'
            + '<span style="font-size:0.84rem;font-weight:600;color:var(--text)">Click to play video</span>'
            + '</div>'
            + '</div>';
    }
    if (isYt) {
        const match = u.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        const ytId = match ? match[1] : null;
        if (ytId) {
            return '<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:8px;overflow:hidden;border:1px solid var(--border);margin-top:0.4rem">'
                + '<iframe src="https://www.youtube.com/embed/' + ytId + '" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe>'
                + '</div>';
        }
        return '<a href="' + esc(u) + '" target="_blank" style="color:var(--gold)"><i class="fa-brands fa-youtube"></i> Watch on YouTube</a>';
    }
    if (isVimeo) {
        const match = u.match(/vimeo\.com\/(\d+)/);
        const vmId = match ? match[1] : null;
        if (vmId) {
            return '<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:8px;overflow:hidden;border:1px solid var(--border);margin-top:0.4rem">'
                + '<iframe src="https://player.vimeo.com/video/' + vmId + '" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe>'
                + '</div>';
        }
        return '<a href="' + esc(u) + '" target="_blank" style="color:var(--gold)"><i class="fa-brands fa-vimeo"></i> Watch on Vimeo</a>';
    }
    return '<a href="' + esc(u) + '" target="_blank" style="display:inline-flex;align-items:center;gap:0.35rem;color:var(--gold);font-size:0.78rem;border:1px solid var(--gold-bdr);background:var(--gold-dim);padding:0.3rem 0.7rem;border-radius:0.4rem">'
        + '<i class="fa-solid fa-film"></i> Watch Trailer</a>';
}

// ══════════════════════════════
// LOAN DETAIL MODAL
// ══════════════════════════════
window.openLoanModal = async function (loanId) {
    openModal('loanModal');
    document.getElementById('loanModalTitle').textContent = `Loan #${loanId}`;
    document.getElementById('loanModalBody').innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div>`;
    document.getElementById('loanModalFooter').innerHTML = '';

    try {
        const res = await fetch(`/api/v1/admin/loans/${loanId}`, { headers: getHeaders() });
        if (!res.ok) throw new Error('Loan not found');
        const loan = await res.json();

        document.getElementById('loanModalTitle').textContent = esc(loan.project_title || `Loan #${loanId}`);

        // Fetch repayment schedule
        let schedule = [];
        try {
            const sRes = await fetch(`/api/v1/admin/loans/${loanId}/schedule`, { headers: getHeaders() });
            if (sRes.ok) schedule = await sRes.json();
        } catch { }

        const scheduleHtml = schedule.length ? `
            <hr class="detail-divider" style="margin:1rem 0">
            <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:1rem">
                <button id="loanTabDetails" onclick="switchLoanTab('details')" style="flex:1;padding:0.6rem;font-size:0.78rem;font-weight:700;background:none;border:none;border-bottom:2px solid var(--gold);color:var(--gold);cursor:pointer;text-align:center">Project Details</button>
                <button id="loanTabSchedule" onclick="switchLoanTab('schedule')" style="flex:1;padding:0.6rem;font-size:0.78rem;font-weight:700;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-dim);cursor:pointer;text-align:center">Repayment Schedule</button>
            </div>
            <div id="loanTabDetailsContent">
            <div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:0.76rem">
                    <thead><tr style="border-bottom:1px solid var(--border)">
                        <th style="text-align:left;padding:0.3rem 0.5rem;color:var(--text-dim)">#</th>
                        <th style="text-align:left;padding:0.3rem 0.5rem;color:var(--text-dim)">Due Date</th>
                        <th style="text-align:right;padding:0.3rem 0.5rem;color:var(--text-dim)">Amount</th>
                        <th style="text-align:left;padding:0.3rem 0.5rem;color:var(--text-dim)">Status</th>
                    </tr></thead>
                    <tbody>${schedule.map(function (s) {
            var isGrace = s.is_grace_update || s.status === 'grace_update';
            var isDone = isGrace;
            var isFailed = isGrace && s.status === 'failed';
            var ov = s.status === 'unpaid' && !isGrace && new Date(s.due_date) < new Date();
            var col = s.status === 'paid' ? 'var(--success)' : isFailed ? 'var(--error)' : isGrace ? '#22c55e' : ov ? 'var(--error)' : 'var(--text-dim)';
            var statusLabel = isFailed ? 'FAILED' : isGrace ? 'DONE' : s.status.toUpperCase();
            return '<tr style="border-bottom:1px solid rgba(255,255,255,0.03)">'
                + '<td style="padding:0.3rem 0.5rem;font-weight:600">#' + s.installment_number + '</td>'
                + '<td style="padding:0.3rem 0.5rem;color:' + col + '">' + fmtDate(s.due_date) + '</td>'
                + '<td style="padding:0.3rem 0.5rem;text-align:right;color:var(--gold)">' + fmtPHP(s.amount_due) + '</td>'
                + '<td style="padding:0.3rem 0.5rem;color:' + col + ';font-size:0.7rem;font-weight:700">' + statusLabel + '</td>'
                + '</tr>';
        }).join('')}</tbody>
                </table>
            </div>` : '';

        // Build project details HTML
        const disbHtml = (function () {
            const rm = (loan.disbursement_method || '').toLowerCase().trim();
            const ra = (loan.disbursement_account || '').trim();
            const pm2 = ADMIN_PH_METHODS.find(p => p.key === rm);
            const parts = ra.split(/\s*[—-]\s*/);
            const aName = parts[0]?.trim() || ra;
            const aNum = parts[1]?.trim() || '';
            const hasD = pm2 && rm !== 'pending' && ra && ra !== 'TBD';
            if (!hasD) return '';
            return `<div style="background:var(--bg-input);border:1px solid var(--gold-bdr);border-radius:10px;padding:0.85rem 1rem;margin-bottom:1rem;display:flex;align-items:center;gap:0.85rem">
                ${adminPmLogo(rm, 42)}
                <div style="flex:1">
                    <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:0.3rem">Disbursement Account</div>
                    <div style="font-size:0.92rem;font-weight:800;color:var(--text)">${esc(pm2.label)} &mdash; ${esc(aName)}</div>
                    ${aNum ? `<div style="font-size:0.75rem;color:var(--text-dim);font-family:var(--mono,monospace);margin-top:0.1rem">${esc(aNum)}</div>` : ''}
                </div>
                <div style="font-size:0.62rem;font-weight:700;color:#22c55e;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:5px;padding:0.2rem 0.5rem">AUTO</div>
            </div>`;
        })();

        const projectInfoHtml = (function () {
            var genreVal = loan.genre || '';
            var descVal = loan.project_description || '';
            var purposeVal = loan.purpose || loan.description || '';
            var genreStr = '';
            if (genreVal && !genreVal.startsWith('Genre:')) {
                genreStr = genreVal;
            } else if (descVal.startsWith('Genre:')) {
                var gMatch = descVal.match(/Genre:\s*([^|]+)/i);
                if (gMatch) genreStr = gMatch[1].trim();
                if (!purposeVal && loan.purpose) purposeVal = loan.purpose;
            }
            var prodPhase = loan.production_phase || '';
            var budgetCats = loan.budget_categories || '';
            if (!budgetCats && loan.requirements_list && loan.requirements_list.length) {
                budgetCats = loan.requirements_list.join(', ');
            }
            var out = '';
            if (genreStr) out += '<div class="detail-item" style="margin-bottom:0.65rem"><div class="detail-label">Genre</div><div class="detail-value" style="font-size:0.82rem;color:var(--text-2)">' + esc(genreStr) + '</div></div>';
            out += '<div class="detail-item" style="margin-bottom:0.65rem"><div class="detail-label">Production Phase</div><div class="detail-value" style="font-size:0.82rem;color:' + (prodPhase ? 'var(--gold)' : 'var(--text-dim)') + ';font-weight:' + (prodPhase ? '600' : '400') + '">' + esc(prodPhase || '—') + '</div></div>';
            out += '<div class="detail-item" style="margin-bottom:0.65rem"><div class="detail-label">Budget Categories</div><div class="detail-value" style="font-size:0.82rem;color:' + (budgetCats ? 'var(--text-2)' : 'var(--text-dim)') + ';white-space:pre-wrap;word-break:break-word">' + esc(budgetCats || '—') + '</div></div>';
            if (purposeVal) out += '<div class="detail-item" style="margin-bottom:0.75rem"><div class="detail-label">Project Description</div><div class="detail-value" style="font-size:0.82rem;line-height:1.6;color:var(--text-2);margin-top:0.2rem;white-space:pre-wrap;word-break:break-word">' + esc(purposeVal) + '</div></div>';
            return out;
        })();

        const scheduleTableHtml = schedule.length ? `
            <div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:0.76rem">
                    <thead><tr style="border-bottom:1px solid var(--border)">
                        <th style="text-align:left;padding:0.3rem 0.5rem;color:var(--text-dim)">#</th>
                        <th style="text-align:left;padding:0.3rem 0.5rem;color:var(--text-dim)">Due Date</th>
                        <th style="text-align:right;padding:0.3rem 0.5rem;color:var(--text-dim)">Amount</th>
                        <th style="text-align:left;padding:0.3rem 0.5rem;color:var(--text-dim)">Status</th>
                    </tr></thead>
                    <tbody>${schedule.map(function (s) {
            var isGrace = s.is_grace_update || s.status === 'grace_update';
            var isFailed = isGrace && s.status === 'failed';
            var ov = s.status === 'unpaid' && !isGrace && new Date(s.due_date) < new Date();
            var col = s.status === 'paid' ? 'var(--success)' : isFailed ? 'var(--error)' : isGrace ? '#22c55e' : ov ? 'var(--error)' : 'var(--text-dim)';
            var statusLabel = isFailed ? 'FAILED' : isGrace ? 'DONE' : s.status.toUpperCase();
            return '<tr style="border-bottom:1px solid rgba(255,255,255,0.03)">'
                + '<td style="padding:0.3rem 0.5rem;font-weight:600">#' + s.installment_number + '</td>'
                + '<td style="padding:0.3rem 0.5rem;color:' + col + '">' + fmtDate(s.due_date) + '</td>'
                + '<td style="padding:0.3rem 0.5rem;text-align:right;color:var(--gold)">' + fmtPHP(s.amount_due) + '</td>'
                + '<td style="padding:0.3rem 0.5rem;color:' + col + ';font-size:0.7rem;font-weight:700">' + statusLabel + '</td>'
                + '</tr>';
        }).join('')}</tbody>
                </table>
            </div>` : '<p style="color:var(--text-dim);font-size:0.82rem;padding:0.5rem">No repayment schedule available.</p>';

        const tabBarHtml = schedule.length ? `
            <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:1rem">
                <button id="loanTabDetails" onclick="switchLoanTab('details')" style="flex:1;padding:0.6rem;font-size:0.78rem;font-weight:700;background:none;border:none;border-bottom:2px solid var(--gold);color:var(--gold);cursor:pointer;text-align:center">Project Details</button>
                <button id="loanTabSchedule" onclick="switchLoanTab('schedule')" style="flex:1;padding:0.6rem;font-size:0.78rem;font-weight:700;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-dim);cursor:pointer;text-align:center">Loan Schedule (${schedule.length})</button>
            </div>` : '';

        document.getElementById('loanModalBody').innerHTML = `
            ${tabBarHtml}
            <div id="loanTabDetailsContent">
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">Amount</div>
                        <div class="detail-value" style="font-size:1.4rem;font-family:var(--display);font-weight:800;color:var(--gold);word-break:break-word">${fmtPHP(loan.amount)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Status</div>
                        <div class="detail-value">${statusBadge(loan.status)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Term</div>
                        <div class="detail-value mono">${fmtTerm(loan.term_months || loan.duration_months)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Interest Rate</div>
                        <div class="detail-value mono">${loan.interest_rate ? loan.interest_rate + '%' : '—'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Applied</div>
                        <div class="detail-value mono">${fmtDate(loan.created_at)}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Producer</div>
                        <div class="detail-value">${esc(loan.owner?.name || '—')}</div>
                    </div>
                </div>
                <hr class="detail-divider">
                ${disbHtml}
                ${projectInfoHtml}
                ${loan.admin_notes ? `
                <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:0.85rem 1rem;margin-bottom:1rem">
                    <div style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--error);margin-bottom:0.4rem">Rejection Reason</div>
                    <div style="font-size:0.82rem;color:var(--text-2);white-space:pre-wrap;word-break:break-word;line-height:1.55">${esc(loan.admin_notes)}</div>
                </div>` : ''}
                <div style="margin-bottom:1rem">
                    <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--gold);margin-bottom:0.75rem">
                        <i class="fa-solid fa-paperclip" style="margin-right:0.4rem"></i>Project Assets
                    </div>
                    <div style="display:flex;flex-direction:column;gap:1.1rem">
                        <div>
                            <div style="font-size:0.65rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.35rem;font-weight:700">
                                <i class="fa-solid fa-file-pdf" style="margin-right:0.3rem"></i>Script
                            </div>
                            ${renderScriptAsset(loan.script_url)}
                        </div>
                        <div>
                            <div style="font-size:0.65rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.35rem;font-weight:700">
                                <i class="fa-solid fa-book-open" style="margin-right:0.3rem"></i>Lookbook
                            </div>
                            ${renderLookbookAsset(loan.lookbook_url)}
                        </div>
                        <div>
                            <div style="font-size:0.65rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.35rem;font-weight:700">
                                <i class="fa-solid fa-film" style="margin-right:0.3rem"></i>Trailer
                            </div>
                            ${renderTrailerAsset(loan.trailer_url)}
                        </div>
                    </div>
                </div>
            </div>
            <div id="loanTabScheduleContent" style="display:none">
                ${scheduleTableHtml}
            </div>
        `;

        if (loan.status === 'pending') {
            document.getElementById('loanModalFooter').innerHTML = `
                <button class="action-btn success" id="loanApproveBtn" onclick="inlineApproveLoan(${loan.id})">
                    <i class="fa-solid fa-check"></i> Approve
                </button>
                <button class="action-btn danger" onclick="openRejectModal(${loan.id})">
                    <i class="fa-solid fa-ban"></i> Reject
                </button>
                <button class="action-btn ghost" onclick="closeModal('loanModal')">Close</button>
            `;
        } else {
            document.getElementById('loanModalFooter').innerHTML = `
                <button class="action-btn ghost" onclick="closeModal('loanModal')">Close</button>
            `;
        }

    } catch (e) {
        document.getElementById('loanModalBody').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${e.message}</p></div>`;
    }
};

// ══════════════════════════════
// APPROVE LOAN
// ══════════════════════════════
// ── Single shared disbursement-confirm modal builder. Both the loan-card
//    "Approve" button (outside, list view) and the in-modal "Approve Loan"
//    button (inside the Loan Review modal) call THIS one function — there
//    used to be two separate duplicated builders that drifted out of sync;
//    now there is exactly one. Flow: Step 1 upload receipt -> Confirm ->
//    Step 2 PIN appears -> Confirm & Disburse. ──
function openApprovePinModal(loanId, loan, onClose) {
    var ex = document.getElementById('_outerDisburseModal'); if (ex) ex.remove();
    var rawMethod = (loan.disbursement_method || '').toLowerCase().trim();
    var rawAccount = (loan.disbursement_account || '').trim();
    var pmMap = { gcash: 'GCash', maya: 'Maya', bdo: 'BDO', bpi: 'BPI', unionbank: 'UnionBank', metrobank: 'Metrobank', landbank: 'Landbank' };
    var pmLabel = pmMap[rawMethod] || rawMethod || '';
    var accParts = rawAccount.split(/\s*[—\-]\s*/);
    var accName = (accParts[0] || '').trim() || rawAccount;
    var accNum = (accParts[1] || '').trim();
    var hasAcct = pmLabel && rawMethod !== 'pending' && rawAccount && rawAccount !== 'TBD';

    function closeAll() { ov.remove(); if (typeof onClose === 'function') onClose(); }

    var ov = document.createElement('div');
    ov.id = '_outerDisburseModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10030;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.82);backdrop-filter:blur(8px);padding:1rem';

    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid rgba(212,175,55,0.2);border-radius:1.5rem;max-width:500px;width:100%;box-shadow:0 40px 100px rgba(0,0,0,0.7);overflow:hidden';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:linear-gradient(135deg,rgba(212,175,55,0.12),rgba(212,175,55,0.04));border-bottom:1px solid rgba(212,175,55,0.15);padding:1.1rem 1.4rem;display:flex;align-items:center;gap:0.75rem';
    hdr.innerHTML = '<div style="width:34px;height:34px;border-radius:10px;background:rgba(212,175,55,0.15);border:1px solid rgba(212,175,55,0.3);display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-money-bill-transfer" style="color:var(--gold);font-size:0.85rem"></i></div>'
        + '<div><div style="font-weight:800;color:var(--text);font-size:0.92rem">Confirm Disbursement</div>'
        + '<div id="_outerDisburseSubtitle" style="font-size:0.68rem;color:var(--text-dim);margin-top:0.05rem">Step 1 of 2 — Upload proof of disbursement</div></div>';
    var hX = document.createElement('button');
    hX.style.cssText = 'margin-left:auto;width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--text-dim);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.85rem';
    hX.innerHTML = '<i class="fas fa-times"></i>';
    hX.onclick = closeAll;
    hdr.appendChild(hX);

    var body = document.createElement('div');
    body.style.cssText = 'padding:1.25rem;display:flex;flex-direction:column;gap:0.85rem';

    var amtBlock = document.createElement('div');
    amtBlock.style.cssText = 'background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.18);border-radius:12px;padding:1rem 1.15rem';
    amtBlock.innerHTML = '<div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:rgba(212,175,55,0.7);margin-bottom:0.5rem;display:flex;align-items:center;gap:0.35rem"><i class="fa-solid fa-user" style="font-size:0.6rem"></i>Producer & Amount</div>'
        + '<div style="font-size:1.75rem;font-weight:900;color:var(--gold);letter-spacing:-0.02em;line-height:1.1">' + fmtPHP(loan.amount) + '</div>'
        + '<div style="font-size:0.83rem;color:var(--text);margin-top:0.3rem;font-weight:600">' + esc(loan.owner ? loan.owner.name : '') + ' — Loan #' + loan.id + '</div>'
        + (loan.project_title ? '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.1rem;font-style:italic">' + esc(loan.project_title) + '</div>' : '');

    var acctBlock = document.createElement('div');
    acctBlock.style.cssText = 'border:1px solid var(--border);border-radius:12px;padding:1rem 1.15rem';
    if (hasAcct) {
        acctBlock.innerHTML = '<div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-dim);margin-bottom:0.75rem;display:flex;align-items:center;gap:0.35rem"><i class="fa-solid fa-paper-plane" style="color:var(--gold);font-size:0.6rem"></i>Auto-Disbursement Account</div>'
            + '<div style="display:flex;align-items:center;gap:0.85rem">'
            + adminPmLogo(rawMethod, 40)
            + '<div style="flex:1"><div style="font-size:0.92rem;font-weight:800;color:var(--text)">' + esc(pmLabel) + '</div>'
            + '<div style="font-size:0.82rem;color:var(--text);margin-top:0.1rem">' + esc(accName) + '</div>'
            + (accNum ? '<div style="font-size:0.73rem;color:var(--text-dim);font-family:monospace;letter-spacing:0.05em;margin-top:0.1rem">' + esc(accNum) + '</div>' : '')
            + '</div>'
            + '<div style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);border-radius:6px;padding:0.2rem 0.55rem;font-size:0.63rem;font-weight:800;color:#22c55e;white-space:nowrap">✓ AUTO</div>'
            + '</div>'
            + '<div style="margin-top:0.75rem;font-size:0.72rem;color:var(--text-dim);display:flex;align-items:center;gap:0.35rem"><i class="fa-solid fa-bolt" style="color:var(--gold);font-size:0.65rem"></i>Funds will be automatically disbursed upon confirmation.</div>';
    } else {
        acctBlock.style.borderColor = 'rgba(239,68,68,0.25)';
        acctBlock.innerHTML = '<div style="text-align:center;padding:0.5rem 0;color:#ef4444;font-size:0.82rem;font-weight:600"><i class="fa-solid fa-triangle-exclamation" style="margin-right:0.4rem"></i>No disbursement account set</div>';
    }

    // ── Step 1: Receipt / Proof Upload ──
    var receiptBlock = document.createElement('div');
    receiptBlock.id = '_outerDisburseReceiptStep';
    receiptBlock.style.cssText = 'border:1px solid var(--border);border-radius:12px;padding:1rem 1.15rem';
    receiptBlock.innerHTML = '<label style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-dim);display:flex;align-items:center;gap:0.35rem;margin-bottom:0.6rem"><i class="fa-solid fa-image" style="color:var(--gold);font-size:0.6rem"></i>Disbursement Proof / Receipt <span style="font-size:0.6rem;color:var(--text-dim)">(optional)</span></label>'
        + '<input type="file" id="_outerDisburseReceipt" accept="image/*,.pdf" style="display:none">'
        + '<div id="_outerDisburseReceiptPreview" style="display:none;margin-bottom:0.5rem"><img id="_outerDisburseReceiptImg" style="max-width:100%;max-height:120px;border-radius:8px;border:1px solid var(--border);object-fit:contain"></div>'
        + '<button type="button" id="_outerDisburseReceiptBtn" style="width:100%;padding:0.6rem;background:rgba(212,175,55,0.05);border:1px dashed rgba(212,175,55,0.3);border-radius:8px;color:var(--gold);cursor:pointer;font-size:0.78rem;font-weight:600"><i class="fa-solid fa-upload" style="margin-right:0.35rem"></i><span id="_outerDisburseReceiptLabel">Upload receipt image</span></button>';

    // ── Step 2: PIN (hidden until Step 1 is confirmed) ──
    var pinBlock = document.createElement('div');
    pinBlock.id = '_outerDisbursePinStep';
    pinBlock.style.display = 'none';
    pinBlock.innerHTML = '<label style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:var(--text-dim);display:flex;align-items:center;gap:0.35rem;margin-bottom:0.5rem"><i class="fa-solid fa-lock" style="font-size:0.6rem"></i>Your Admin Transaction PIN</label>';
    var pinWrap = document.createElement('div'); pinWrap.style.cssText = 'position:relative';
    var pinInput = document.createElement('input');
    pinInput.type = 'password'; pinInput.id = '_outerDisbursePinInput'; pinInput.maxLength = 6; pinInput.inputMode = 'numeric';
    pinInput.placeholder = '••••••'; pinInput.autocomplete = 'one-time-code';
    pinInput.style.cssText = 'width:100%;background:var(--bg-input);border:2px solid rgba(212,175,55,0.3);border-radius:10px;color:var(--text);padding:0.8rem 2.8rem 0.8rem 1rem;font-size:1.1rem;letter-spacing:0.3em;box-sizing:border-box;transition:border-color 0.2s;outline:none';
    pinInput.addEventListener('focus', function () { this.style.borderColor = 'rgba(212,175,55,0.7)'; });
    pinInput.addEventListener('blur', function () { this.style.borderColor = 'rgba(212,175,55,0.3)'; });
    var eyeBtn = document.createElement('button');
    eyeBtn.type = 'button'; eyeBtn.style.cssText = 'position:absolute;right:0.8rem;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1rem';
    eyeBtn.innerHTML = '<i class="fa-regular fa-eye"></i>';
    eyeBtn.addEventListener('mousedown', function () { pinInput.type = 'text'; });
    eyeBtn.addEventListener('mouseup', function () { pinInput.type = 'password'; });
    eyeBtn.addEventListener('mouseleave', function () { pinInput.type = 'password'; });
    pinWrap.appendChild(pinInput); pinWrap.appendChild(eyeBtn);
    var pinMsg = document.createElement('p'); pinMsg.id = '_outerDisbursePinMsg';
    pinMsg.style.cssText = 'font-size:0.75rem;min-height:0.9rem;margin-top:0.35rem;color:var(--text-dim)';
    pinBlock.appendChild(pinWrap); pinBlock.appendChild(pinMsg);

    // Attach receipt-input handlers after DOM insert
    setTimeout(function() {
        var inp = document.getElementById('_outerDisburseReceipt');
        var btn = document.getElementById('_outerDisburseReceiptBtn');
        if (btn && inp) btn.onclick = function() { inp.click(); };
        if (!inp) return;
        inp.onchange = function() {
            var file = this.files[0]; if (!file) return;
            var preview = document.getElementById('_outerDisburseReceiptPreview');
            var img = document.getElementById('_outerDisburseReceiptImg');
            var lbl = document.getElementById('_outerDisburseReceiptLabel');
            if (file.type.startsWith('image/')) {
                var reader = new FileReader(); reader.onload = function(e) { if(img){img.src=e.target.result;} if(preview) preview.style.display=''; }; reader.readAsDataURL(file);
            }
            if (lbl) lbl.textContent = file.name;
        };
    }, 200);

    // ── Buttons ──
    var btnRow = document.createElement('div'); btnRow.style.cssText = 'display:flex;gap:0.6rem;margin-top:0.2rem';
    var confirmBtn = document.createElement('button');
    confirmBtn.id = '_outerDisburseStep1Btn';
    confirmBtn.style.cssText = 'flex:3;padding:0.85rem;background:linear-gradient(135deg,rgba(34,197,94,0.2),rgba(34,197,94,0.1));border:1px solid rgba(34,197,94,0.4);border-radius:10px;color:#22c55e;cursor:pointer;font-size:0.88rem;font-weight:800;display:flex;align-items:center;justify-content:center;gap:0.5rem';
    confirmBtn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> Confirm';
    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:0.85rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600';
    cancelBtn.textContent = 'Cancel'; cancelBtn.onclick = closeAll;

    // Step 1 -> Step 2: reveal the PIN field, swap button into the final "Confirm & Disburse" action
    confirmBtn.addEventListener('click', function () {
        var step1 = confirmBtn.dataset.step !== '2';
        if (step1) {
            receiptBlock.style.display = 'none';
            pinBlock.style.display = '';
            var sub = document.getElementById('_outerDisburseSubtitle');
            if (sub) sub.textContent = 'Step 2 of 2 — Enter your PIN to disburse';
            confirmBtn.dataset.step = '2';
            confirmBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Confirm & Disburse';
            setTimeout(function () { pinInput.focus(); }, 100);
            return;
        }
        // Step 2: actually submit
        var pin = pinInput.value || '';
        var msgEl = document.getElementById('_outerDisbursePinMsg');
        if (!pin || pin.length !== 6) { if (msgEl) { msgEl.style.color = 'var(--error)'; msgEl.textContent = 'Enter your 6-digit Admin PIN.'; } return; }
        confirmBtn.disabled = true; confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
        cancelBtn.disabled = true;
        if (msgEl) { msgEl.style.color = 'var(--text-dim)'; msgEl.textContent = 'Verifying PIN...'; }
        (async function () {
            try {
                var receiptInput = document.getElementById('_outerDisburseReceipt');
                var hasReceipt = receiptInput && receiptInput.files && receiptInput.files.length > 0;
                var url = '/api/v1/admin/loans/' + loanId + '/approve?admin_pin=' + encodeURIComponent(pin);
                var fetchOpts;
                if (hasReceipt) {
                    var fd = new FormData();
                    fd.append('receipt_image', receiptInput.files[0]);
                    var h = Object.assign({}, getHeaders()); delete h['Content-Type'];
                    fetchOpts = { method: 'POST', headers: h, body: fd };
                } else {
                    fetchOpts = { method: 'POST', headers: getHeaders() };
                }
                var r = await fetch(url, fetchOpts);
                var d = await r.json();
                if (!r.ok) throw new Error(d.detail || 'Approval failed');
                ov.remove();
                closeModal('loanModal');
                if (typeof showToast === 'function') showToast('Loan approved! Ref: ' + (d.reference || 'N/A'), 'success');
                if (typeof loadLoans === 'function') loadLoans(window.ADMIN_STATE && window.ADMIN_STATE.currentLoanFilter || 'pending');
                if (typeof loadDashboard === 'function') loadDashboard();
            } catch (e) {
                if (msgEl) { msgEl.style.color = 'var(--error)'; msgEl.textContent = e.message; }
                confirmBtn.disabled = false; cancelBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fa-solid fa-bolt"></i> Confirm & Disburse';
            }
        })();
    });
    btnRow.appendChild(confirmBtn); btnRow.appendChild(cancelBtn);

    body.appendChild(amtBlock); body.appendChild(acctBlock); body.appendChild(receiptBlock); body.appendChild(pinBlock); body.appendChild(btnRow);
    box.appendChild(hdr); box.appendChild(body); ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeAll(); });
    document.body.appendChild(ov);
}

// ── Entry point used by the in-modal "Approve Loan" button ──
window.inlineApproveLoan = async function (loanId) {
    var btn = document.getElementById('loanApproveBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...'; }
    try {
        var res = await fetch('/api/v1/admin/loans/' + loanId, { headers: getHeaders() });
        if (!res.ok) throw new Error('Could not fetch loan');
        var loan = await res.json();
        openApprovePinModal(loanId, loan, function () {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Approve Loan'; }
        });
    } catch (e) {
        if (typeof showToast === 'function') showToast(e.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check"></i> Approve Loan'; }
    }
};

// ── Entry point used by the loan-card "Approve" button (list view) ──
window.approveLoan = async function (loanId) {
    try {
        const res = await fetch(`/api/v1/admin/loans/${loanId}`, { headers: getHeaders() });
        if (!res.ok) throw new Error('Could not fetch loan details');
        const loan = await res.json();
        openApprovePinModal(loanId, loan);
    } catch (e) {
        showToast(e.message, 'error');
    }
};

// ── Branded payment logo tile (mirrors user-side pmLogo) ──
const ADMIN_PH_METHODS = [
    { key: 'gcash', label: 'GCash', abbr: 'G', color: '#0070E0', bg: '#E8F4FF' },
    { key: 'maya', label: 'Maya', abbr: 'M', color: '#00A651', bg: '#E8F9EF' },
    { key: 'bdo', label: 'BDO', abbr: 'BDO', color: '#003087', bg: '#E8EDF8' },
    { key: 'bpi', label: 'BPI', abbr: 'BPI', color: '#CC0000', bg: '#FDEAEA' },
    { key: 'unionbank', label: 'UnionBank', abbr: 'UB', color: '#E87722', bg: '#FEF3EA' },
    { key: 'metrobank', label: 'Metrobank', abbr: 'MB', color: '#00478F', bg: '#E8EFF8' },
    { key: 'landbank', label: 'Landbank', abbr: 'LB', color: '#006400', bg: '#E8F4E8' },
    { key: 'pnb', label: 'PNB', abbr: 'PNB', color: '#003580', bg: '#E8EDF6' },
    { key: 'rcbc', label: 'RCBC', abbr: 'RC', color: '#E30613', bg: '#FDEAEA' },
    { key: 'coins', label: 'Coins.ph', abbr: '©', color: '#F9A825', bg: '#FEF8E8' },
    { key: 'seabank', label: 'SeaBank', abbr: 'SB', color: '#EE4D2D', bg: '#FEECEA' },
    { key: 'tonik', label: 'Tonik', abbr: 'T', color: '#7B2FBE', bg: '#F3E8FE' },
    { key: 'cimb', label: 'CIMB', abbr: 'CB', color: '#E4003B', bg: '#FDE8ED' },
    { key: 'instapay', label: 'InstaPay', abbr: 'IP', color: '#00838F', bg: '#E8F6F7' },
    { key: 'pesonet', label: 'PESONet', abbr: 'PN', color: '#1565C0', bg: '#E8EFF8' },
];

function adminPmLogo(methodKey, size = 44) {
    const m = ADMIN_PH_METHODS.find(p => p.key === methodKey)
        || { abbr: (methodKey || '?').toUpperCase().substring(0, 2), color: 'var(--gold)', bg: 'var(--gold-dim)' };
    return `<div style="width:${size}px;height:${size}px;border-radius:${Math.round(size / 4)}px;background:${m.bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:800;font-size:0.78rem;color:${m.color};letter-spacing:-0.02em;border:1.5px solid ${m.color}33">${m.abbr}</div>`;
}


// ══════════════════════════════
// REJECT LOAN
// ══════════════════════════════
window.openRejectModal = function (loanId) {
    // Show inline reject modal with blurred background (keeps loan modal visible behind)
    var ex = document.getElementById('_inlineRejectModal'); if (ex) ex.remove();
    ADMIN_STATE.rejectingLoanId = loanId;

    var ov = document.createElement('div');
    ov.id = '_inlineRejectModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(10px);padding:1rem';

    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid rgba(239,68,68,0.25);border-radius:1.5rem;max-width:460px;width:100%;box-shadow:0 40px 100px rgba(0,0,0,0.7);overflow:hidden;animation:slideUpFade 0.25s ease';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:linear-gradient(135deg,rgba(239,68,68,0.1),rgba(239,68,68,0.04));border-bottom:1px solid rgba(239,68,68,0.15);padding:1.1rem 1.4rem;display:flex;align-items:center;gap:0.75rem';
    hdr.innerHTML = '<div style="width:34px;height:34px;border-radius:10px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-ban" style="color:#ef4444;font-size:0.85rem"></i></div>'
        + '<div><div style="font-weight:800;color:var(--text);font-size:0.92rem">Reject Loan Application</div>'
        + '<div style="font-size:0.68rem;color:var(--text-dim);margin-top:0.05rem">Loan #' + loanId + ' — This will notify the producer</div></div>';
    var hX = document.createElement('button');
    hX.style.cssText = 'margin-left:auto;width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--text-dim);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:0.85rem';
    hX.innerHTML = '<i class="fas fa-times"></i>';
    hX.onclick = function () { ov.remove(); };
    hdr.appendChild(hX);

    var body = document.createElement('div');
    body.style.cssText = 'padding:1.4rem;display:flex;flex-direction:column;gap:0.85rem';

    var hint = document.createElement('p');
    hint.style.cssText = 'font-size:0.82rem;color:var(--text-dim);margin:0;line-height:1.5';
    hint.textContent = 'Provide a reason for rejection. This will be sent to the producer as a notification.';

    var textarea = document.createElement('textarea');
    textarea.id = '_inlineRejectReason';
    textarea.placeholder = 'e.g. Insufficient project details, unverified identity...';
    textarea.style.cssText = 'width:100%;min-height:100px;background:var(--bg-input);border:1.5px solid rgba(255,255,255,0.1);border-radius:10px;color:var(--text);padding:0.85rem 1rem;font-size:0.84rem;resize:vertical;outline:none;transition:border-color 0.2s;box-sizing:border-box;font-family:inherit';
    textarea.addEventListener('focus', function () { this.style.borderColor = 'rgba(239,68,68,0.5)'; });
    textarea.addEventListener('blur', function () { this.style.borderColor = 'rgba(255,255,255,0.1)'; });

    var msgEl = document.createElement('p');
    msgEl.id = '_inlineRejectMsg';
    msgEl.style.cssText = 'font-size:0.75rem;min-height:0.8rem;margin:0;color:var(--error)';

    body.appendChild(hint); body.appendChild(textarea); body.appendChild(msgEl);

    var footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:0.6rem;padding:0 1.4rem 1.4rem';

    var confirmBtn = document.createElement('button');
    confirmBtn.style.cssText = 'flex:3;padding:0.85rem;background:linear-gradient(135deg,rgba(239,68,68,0.18),rgba(239,68,68,0.08));border:1px solid rgba(239,68,68,0.4);border-radius:10px;color:#ef4444;cursor:pointer;font-size:0.88rem;font-weight:800;display:flex;align-items:center;justify-content:center;gap:0.5rem;transition:all 0.2s';
    confirmBtn.innerHTML = '<i class="fa-solid fa-ban"></i> Confirm Reject';
    confirmBtn.onmouseover = function () { this.style.background = 'linear-gradient(135deg,rgba(239,68,68,0.28),rgba(239,68,68,0.15))'; };
    confirmBtn.onmouseout = function () { this.style.background = 'linear-gradient(135deg,rgba(239,68,68,0.18),rgba(239,68,68,0.08))'; };

    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:0.85rem;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600;transition:all 0.2s';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = function () { ov.remove(); };

    confirmBtn.addEventListener('click', async function () {
        var reason = textarea.value.trim();
        if (!reason) { msgEl.textContent = 'Please provide a rejection reason.'; return; }
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rejecting...';
        try {
            var res = await fetch('/api/v1/admin/loans/' + loanId + '/reject?reason=' + encodeURIComponent(reason), { method: 'POST', headers: getHeaders() });
            var d = await res.json();
            if (!res.ok) throw new Error(d.detail || 'Rejection failed');
            ov.remove();
            if (typeof closeModal === 'function') closeModal('loanModal');
            if (typeof showToast === 'function') showToast('Loan application rejected. Producer has been notified.', 'info');
            if (typeof loadLoans === 'function') loadLoans(ADMIN_STATE.currentLoanFilter);
            if (typeof loadDashboard === 'function') loadDashboard();
        } catch (e) {
            msgEl.textContent = e.message;
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fa-solid fa-ban"></i> Confirm Reject';
        }
    });

    footer.appendChild(confirmBtn); footer.appendChild(cancelBtn);
    box.appendChild(hdr); box.appendChild(body); box.appendChild(footer);
    ov.appendChild(box);
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
    setTimeout(function () { textarea.focus(); }, 100);
};

window.confirmRejectLoan = async function () {
    const reason = document.getElementById('rejectReason').value.trim();
    const msgEl = document.getElementById('rejectMsg');

    if (!reason) {
        msgEl.textContent = 'Please provide a rejection reason.';
        msgEl.className = 'form-msg error';
        return;
    }

    const loanId = ADMIN_STATE.rejectingLoanId;
    try {
        const res = await fetch(`/api/v1/admin/loans/${loanId}/reject?reason=${encodeURIComponent(reason)}`, {
            method: 'POST',
            headers: getHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Rejection failed');

        closeModal('rejectModal');
        showToast('Loan application rejected. Producer has been notified.', 'info');
        loadLoans(ADMIN_STATE.currentLoanFilter);
        loadDashboard();
    } catch (e) {
        msgEl.textContent = e.message;
        msgEl.className = 'form-msg error';
    }
};


// ── Loan Modal Tab Switcher ──
window.switchLoanTab = function (tab) {
    var schedBtn = document.getElementById('loanTabSchedule');
    var detailBtn = document.getElementById('loanTabDetails');
    var schedContent = document.getElementById('loanTabScheduleContent');
    var detailContent = document.getElementById('loanTabDetailsContent');
    var activeStyle = 'flex:1;padding:0.6rem;font-size:0.78rem;font-weight:700;background:none;border:none;border-bottom:2px solid var(--gold);color:var(--gold);cursor:pointer;text-align:center';
    var inactiveStyle = 'flex:1;padding:0.6rem;font-size:0.78rem;font-weight:700;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-dim);cursor:pointer;text-align:center';
    if (tab === 'schedule') {
        if (schedBtn) schedBtn.style.cssText = activeStyle;
        if (detailBtn) detailBtn.style.cssText = inactiveStyle;
        if (schedContent) schedContent.style.display = 'block';
        if (detailContent) detailContent.style.display = 'none';
    } else {
        if (detailBtn) detailBtn.style.cssText = activeStyle;
        if (schedBtn) schedBtn.style.cssText = inactiveStyle;
        if (schedContent) schedContent.style.display = 'none';
        if (detailContent) detailContent.style.display = 'block';
    }
};

// Register preview loader for dashboard
window.loadPendingLoansPreview = loadDashLoans;


// ── Remove Rejected Loan (sends to Settings trash) ──
// Pre-define _doRemoveLoan as a truly global function before the modal uses it
window._doRemoveLoan = async function (loanId) {
    var btn = document.getElementById('_removeConfirmBtn');
    var msg = document.getElementById('_removeMsg');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Removing...'; }
    try {
        var res = await fetch('/api/v1/admin/loans/' + loanId + '/remove', { method: 'POST', headers: getHeaders() });
        var d = await res.json();
        if (!res.ok) throw new Error(d.detail || 'Failed to remove loan');
        var m = document.getElementById('_removeConfirmModal'); if (m) m.remove();
        var card = document.getElementById('loanCard' + loanId);
        if (card) { card.style.transition = 'all 0.35s'; card.style.opacity = '0'; card.style.transform = 'scale(0.95)'; setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 350); }
        if (typeof showToast === 'function') showToast('Loan moved to Settings > Removed Loans.', 'success');
        if (typeof loadRemovedLoans === 'function') setTimeout(loadRemovedLoans, 600);
    } catch (e) {
        if (msg) { msg.style.color = 'var(--error)'; msg.textContent = e.message || 'Remove failed'; }
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash-can" style="margin-right:0.4rem"></i>Confirm Remove'; }
    }
};

window.removeLoan = function (loanId, title) {
    var ex = document.getElementById('_removeConfirmModal'); if (ex) ex.remove();
    // Build modal with createElement - avoids browser innerHTML onclick blocking
    var ov = document.createElement('div');
    ov.id = '_removeConfirmModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10010;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);padding:1rem';

    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid rgba(239,68,68,0.3);border-radius:1.25rem;max-width:420px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.6);overflow:hidden';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:rgba(239,68,68,0.06);border-bottom:1px solid rgba(239,68,68,0.2);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:0.75rem';
    hdr.innerHTML = '<i class="fa-solid fa-trash-can" style="color:#ef4444;font-size:1.1rem"></i><div style="font-weight:700;color:#ef4444;font-size:0.95rem">Remove Loan</div>';

    var body = document.createElement('div');
    body.style.cssText = 'padding:1.25rem';

    var info = document.createElement('div');
    info.style.cssText = 'font-size:0.85rem;color:var(--text);margin-bottom:0.5rem';
    info.innerHTML = 'Remove <strong>' + esc(title || 'this loan') + '</strong> from the rejected list?';

    var sub = document.createElement('div');
    sub.style.cssText = 'font-size:0.75rem;color:var(--text-dim);margin-bottom:1rem';
    sub.textContent = 'It will be stored in Settings > Removed Loans for record-keeping.';

    var msgP = document.createElement('p');
    msgP.id = '_removeMsg';
    msgP.style.cssText = 'font-size:0.78rem;min-height:1rem;color:var(--text-dim);margin-bottom:0.5rem';

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:0.6rem';

    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:0.7rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () { ov.remove(); });

    var confirmBtn = document.createElement('button');
    confirmBtn.id = '_removeConfirmBtn';
    confirmBtn.style.cssText = 'flex:2;padding:0.7rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:var(--r);color:#ef4444;cursor:pointer;font-size:0.85rem;font-weight:700';
    confirmBtn.innerHTML = '<i class="fa-solid fa-trash-can" style="margin-right:0.4rem"></i>Confirm Remove';
    confirmBtn.addEventListener('click', function () { window._doRemoveLoan(loanId); });

    btns.appendChild(cancelBtn);
    btns.appendChild(confirmBtn);
    body.appendChild(info);
    body.appendChild(sub);
    body.appendChild(msgP);
    body.appendChild(btns);
    box.appendChild(hdr);
    box.appendChild(body);
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
};

// _doRemoveLoan is defined above (before removeLoan)

// Repayment-receipt functions → admin_repayment.js