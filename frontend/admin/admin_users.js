/**
 * FILMNANCE ADMIN — USER / PRODUCER MANAGEMENT
 */
'use strict';

let _searchTimer = null;

// ══════════════════════════════
// LOAD USERS
// ══════════════════════════════
window.loadUsers = async function (query) {
    const container = document.getElementById('usersList');
    if (!container) return;
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading producers...</p></div>`;
    try {
        const q = query ? `?q=${encodeURIComponent(query)}&limit=50` : '?limit=50';
        const res = await fetch(`/api/v1/admin/users/search${q}`, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to load users');
        const allU = await res.json();
        const users = allU.filter(u => u.account_status !== 'archived');
        if (!users.length) {
            container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-users"></i><p>No producers found</p></div>`;
            return;
        }
        container.innerHTML = users.map(u => renderProducerCard(u)).join('');
    } catch (e) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${e.message}</p></div>`;
    }
};

window.searchUsers = function () {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
        const q = document.getElementById('userSearch')?.value?.trim();
        loadUsers(q);
    }, 350);
};

function renderProducerCard(u) {
    const initials = (u.name || 'U').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const trustPct = Math.min(100, Math.max(0, u.trust_score || 0));
    const tierLabel = ['Bronze', 'Silver', 'Gold', 'Platinum'][u.trust_tier] || 'Bronze';
    return `
    <div class="producer-card" id="userCard${u.id}">
        <div class="producer-header">
            <div class="producer-avatar">${initials}</div>
            <div>
                <div class="producer-name">${esc(u.name || 'Unknown')}</div>
                <div class="producer-email">${esc(u.email)}</div>
            </div>
            <div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:0.3rem">
                ${statusBadge(u.account_status)}
                ${u.is_verified ? `<span class="badge badge-verified"><i class="fa-solid fa-check"></i> Verified</span>` : `<span class="badge badge-unverified">Unverified</span>`}
            </div>
        </div>
        <div class="trust-bar-wrap">
            <div class="trust-bar-label"><span>Trust Score</span><span style="color:var(--gold)">${trustPct} · ${tierLabel}</span></div>
            <div class="trust-bar-track"><div class="trust-bar-fill" style="width:${trustPct}%"></div></div>
        </div>
        <div class="card-info">
            <div class="card-row"><span class="card-row-label">Member since</span><span class="card-row-val">${fmtDate(u.created_at)}</span></div>
            <div class="card-row"><span class="card-row-label">Last login</span><span class="card-row-val">${u.last_login_at ? timeAgo(u.last_login_at) : '—'}</span></div>
        </div>
        <div class="card-actions">
            <button class="action-btn ghost" onclick="openUserModal(${u.id})"><i class="fa-solid fa-eye"></i> Profile</button>
            ${u.account_status === 'active' ? `<button class="action-btn danger" onclick="freezeUser(${u.id})"><i class="fa-solid fa-snowflake"></i> Freeze</button>` : ''}
            ${(u.account_status === 'freeze' || u.account_status === 'frozen') ? `<button class="action-btn success" onclick="unbanUser(${u.id})"><i class="fa-solid fa-unlock"></i> Unfreeze</button>` : ''}
        </div>
    </div>`;
}

// ══════════════════════════════
// USER DETAIL MODAL — TABS
// ══════════════════════════════
window.openUserModal = async function (userId) {
    openModal('userModal');
    document.getElementById('userModalTitle').textContent = `Producer #${userId}`;
    document.getElementById('userModalBody').innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading profile...</p></div>`;
    document.getElementById('userModalFooter').innerHTML = '';
    try {
        const [userRes, loansRes] = await Promise.all([
            fetch(`/api/v1/admin/users/${userId}`, { headers: getHeaders() }),
            fetch(`/api/v1/admin/loans/all`, { headers: getHeaders() })
        ]);
        if (!userRes.ok) throw new Error('User not found');
        const u = await userRes.json();
        const allLoans = loansRes.ok ? await loansRes.json() : [];
        const userLoans = allLoans.filter(l => (l.owner?.id === userId) || (l.owner_id === userId));
        document.getElementById('userModalTitle').textContent = esc(u.name || `Producer #${userId}`);
        const trustPct = Math.min(100, Math.max(0, u.trust_score || 0));

        document.getElementById('userModalBody').innerHTML = `
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.1rem">
                <div class="producer-avatar" style="width:50px;height:50px;font-size:1rem;border-radius:10px;flex-shrink:0">
                    ${(u.name || 'U').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                <div style="flex:1">
                    <div style="font-family:var(--font-h);font-weight:700;font-size:1rem">${esc(u.name)}</div>
                    <div style="font-size:0.72rem;color:var(--text-dim)">${esc(u.email)}</div>
                    <div style="display:flex;gap:0.4rem;margin-top:0.35rem">
                        ${statusBadge(u.account_status)}
                        ${u.is_verified ? '<span class="badge badge-verified"><i class="fa-solid fa-check"></i> Verified</span>' : '<span class="badge badge-unverified">Unverified</span>'}
                    </div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:0;border-bottom:1px solid var(--border);margin-bottom:1rem">
                <button id="tab-profile" onclick="switchUserTab('profile')" style="padding:0.45rem 1rem;background:none;border:none;border-bottom:2px solid var(--gold);color:var(--gold);font-family:var(--font-mono);font-size:0.7rem;cursor:pointer;margin-bottom:-1px;letter-spacing:0.08em">PROFILE</button>
                <button id="tab-loans"  onclick="switchUserTab('loans')"  style="padding:0.45rem 1rem;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-dim);font-family:var(--font-mono);font-size:0.7rem;cursor:pointer;margin-bottom:-1px;letter-spacing:0.08em">LOANS (${userLoans.length})</button>
                <button onclick="openUserMessageModal(${u.id},'${esc(u.name || '')}','${esc(u.email || '')}')" style="margin-left:auto;margin-right:0.5rem;display:inline-flex;align-items:center;gap:0.4rem;padding:0.3rem 0.8rem;background:rgba(125,211,252,0.1);border:1px solid rgba(125,211,252,0.25);border-radius:6px;color:#7dd3fc;font-size:0.7rem;font-weight:700;cursor:pointer"><i class="fa-solid fa-envelope"></i> MESSAGE</button>
            </div>
            <div id="user-tab-profile">
                <div class="detail-grid">
                    <div class="detail-item"><div class="detail-label">Trust Score</div><div class="detail-value" style="color:var(--gold)">${u.trust_score || 0} / 100</div></div>
                    <div class="detail-item"><div class="detail-label">Trust Tier</div><div class="detail-value">${['Bronze', 'Silver', 'Gold', 'Platinum'][u.trust_tier] || 'Bronze'}</div></div>
                    <div class="detail-item"><div class="detail-label">Filmmaker Role</div><div class="detail-value">${esc(u.filmmaker_role && u.filmmaker_role !== '—' ? u.filmmaker_role : 'N/A')}</div></div>
                    <div class="detail-item"><div class="detail-label">Verification</div><div class="detail-value">${esc(u.verification_status || '—')}</div></div>
                    <div class="detail-item"><div class="detail-label">Joined</div><div class="detail-value mono">${fmtDate(u.created_at)}</div></div>
                    <div class="detail-item"><div class="detail-label">Last Login</div><div class="detail-value mono">${u.last_login_at ? fmtDate(u.last_login_at) : '—'}</div></div>
                    <div class="detail-item"><div class="detail-label">Login IP</div><div class="detail-value mono">${esc(u.last_login_ip || '—')}</div></div>
                    <div class="detail-item"><div class="detail-label">PIN Attempts</div><div class="detail-value mono">${u.failed_pin_attempts || 0}</div></div>
                </div>
                <div class="trust-bar-wrap" style="margin-top:0.5rem">
                    <div class="trust-bar-label"><span>Trust Score</span><span style="color:var(--gold)">${trustPct}%</span></div>
                    <div class="trust-bar-track"><div class="trust-bar-fill" style="width:${trustPct}%"></div></div>
                </div>

                ${u.bio ? `<hr class="detail-divider"><div class="detail-label" style="margin-bottom:0.35rem">BIO</div><div style="font-size:0.82rem;color:var(--text-dim);line-height:1.6;white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto">${esc(u.bio)}</div>` : ''}

                ${(u.portfolio_url || u.past_project_url) ? `
                <hr class="detail-divider">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
                    ${u.portfolio_url ? `<div><div class="detail-label">Portfolio</div><a href="${esc(u.portfolio_url)}" target="_blank" style="color:var(--gold);font-size:0.78rem;word-break:break-all">${esc(u.portfolio_url)}</a></div>` : ''}
                    ${u.past_project_url ? `<div><div class="detail-label">Past Project</div>${renderPastProjectAsset(u.past_project_url)}</div>` : ''}
                </div>` : ''}

                ${(u.emergency_contact_name || u.emergency_contact_phone) ? `
                <hr class="detail-divider">
                <div class="detail-label" style="margin-bottom:0.5rem">EMERGENCY CONTACT</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.8rem">
                    <div><span style="color:var(--text-dim)">Name: </span>${esc(u.emergency_contact_name || '—')}</div>
                    <div><span style="color:var(--text-dim)">Relation: </span>${esc(u.emergency_contact_relationship || '—')}</div>
                    <div><span style="color:var(--text-dim)">Phone: </span>${esc(u.emergency_contact_phone || '—')}</div>
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
                        <span style="color:var(--text-dim)">Email: </span>${esc(u.emergency_contact_email || '—')}
                        ${u.emergency_contact_email ? `
                        <button class="action-btn ghost" style="font-size:0.6rem;padding:0.18rem 0.5rem"
                            onclick="openContactModal(${u.id},'${esc(u.name || '')}','${esc(u.emergency_contact_email)}','${esc(u.emergency_contact_name || '')}')">
                            <i class='fa-solid fa-envelope'></i> Message
                        </button>` : ''}
                    </div>
                </div>` : ''}

                ${(u.id_type || u.id_photo_url || u.selfie_photo_url) ? `
                <hr class="detail-divider">
                <div class="detail-label" style="margin-bottom:0.5rem">IDENTITY DOCUMENTS</div>
                <div style="font-size:0.8rem;margin-bottom:0.75rem">
                    <span style="color:var(--text-dim)">ID Type: </span>${esc(u.id_type || '—')}
                    ${u.id_expiry_date ? ` &nbsp;·&nbsp; <span style="color:var(--text-dim)">Expires: </span>${esc(u.id_expiry_date)}` : ''}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
                    ${u.id_photo_url ? `
                    <div>
                        <div class="detail-label" style="margin-bottom:0.35rem">ID PHOTO</div>
                        <img src="${esc(u.id_photo_url.startsWith('/') || u.id_photo_url.startsWith('http') ? u.id_photo_url : '/uploads/ids/' + u.id_photo_url)}"
                            style="width:100%;max-height:140px;object-fit:cover;border-radius:8px;border:1px solid var(--gold-bdr);cursor:zoom-in"
                            onclick="openMediaLightbox('${esc(u.id_photo_url.startsWith('/') || u.id_photo_url.startsWith('http') ? u.id_photo_url : '/uploads/ids/' + u.id_photo_url)}','image')"
                            onerror="this.outerHTML='<div style=\\'font-size:0.72rem;color:var(--error)\\'>Image failed to load</div>'">
                    </div>` : '<div></div>'}
                    ${u.selfie_photo_url ? `
                    <div>
                        <div class="detail-label" style="margin-bottom:0.35rem">SELFIE WITH ID</div>
                        <img src="${esc(u.selfie_photo_url.startsWith('/') || u.selfie_photo_url.startsWith('http') ? u.selfie_photo_url : '/uploads/ids/' + u.selfie_photo_url)}"
                            style="width:100%;max-height:140px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in"
                            onclick="openMediaLightbox('${esc(u.selfie_photo_url.startsWith('/') || u.selfie_photo_url.startsWith('http') ? u.selfie_photo_url : '/uploads/ids/' + u.selfie_photo_url)}','image')"
                            onerror="this.outerHTML='<div style=\\'font-size:0.72rem;color:var(--error)\\'>Image failed to load</div>'">
                    </div>` : ''}
                </div>` : ''}
            </div>
            <div id="user-tab-loans" style="display:none">
                ${renderUserLoans(userLoans)}
            </div>
        `;

        const footer = document.getElementById('userModalFooter');
        const actions = [];
        if (u.account_status === 'active')
            actions.push(`<button class="action-btn danger" onclick="freezeUser(${u.id});closeModal('userModal')"><i class="fa-solid fa-snowflake"></i> Freeze</button>`);
        if (u.account_status === 'freeze' || u.account_status === 'frozen')
            actions.push(`<button class="action-btn success" onclick="unbanUser(${u.id});closeModal('userModal')"><i class="fa-solid fa-unlock"></i> Unfreeze</button>`);
        if (u.failed_pin_attempts > 0 || u.pin_locked_until)
            actions.push(`<button class="action-btn ghost" onclick="unlockPin(${u.id});closeModal('userModal')"><i class="fa-solid fa-key"></i> Unlock PIN</button>`);
        if (u.account_status !== 'archived')
            actions.push(`<button class="action-btn ghost" style="color:var(--error);border-color:rgba(239,68,68,0.3)" onclick="inlineArchiveUser(${u.id},'${esc(u.email || '')}','${esc(u.name || '')}')" ><i class="fa-solid fa-box-archive"></i> Archive</button>`);
        window['__rmCache_' + u.id] = u;
        actions.push(`<button class="action-btn ghost" style="color:#f59e0b;border-color:rgba(245,158,11,0.3)" onclick="openRemoveSectionModal(${u.id},'${esc(u.name || '')}',window['__rmCache_${u.id}'])" title="Remove a specific profile section from this user"><i class="fa-solid fa-eraser"></i> Remove Section</button>`);
        // Message User is now in the Loans tab header, not footer
        actions.push(`<button class="action-btn ghost" onclick="closeModal('userModal')">Close</button>`);
        footer.innerHTML = actions.join('');
    } catch (e) {
        document.getElementById('userModalBody').innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${e.message}</p></div>`;
    }
};

window.switchUserTab = function (tab) {
    ['profile', 'loans'].forEach(t => {
        const panel = document.getElementById(`user-tab-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        if (!panel || !btn) return;
        const active = t === tab;
        panel.style.display = active ? 'block' : 'none';
        btn.style.borderBottomColor = active ? 'var(--gold)' : 'transparent';
        btn.style.color = active ? 'var(--gold)' : 'var(--text-dim)';
    });
};

function renderUserLoans(loans) {
    if (!loans.length) return `<div class="empty-state" style="padding:2rem"><i class="fa-solid fa-film"></i><p>No loans found for this producer</p></div>`;
    return loans.map(loan => `
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--r);padding:1rem;margin-bottom:0.75rem">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem">
                <div>
                    <div style="font-family:var(--font-h);font-weight:700;font-size:0.88rem">${esc(loan.project_title || 'Untitled')}</div>
                    <div style="font-size:0.68rem;color:var(--text-dim);margin-top:0.1rem">${fmtDate(loan.created_at)}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-family:var(--font-h);font-weight:800;color:var(--gold)">${fmtPHP(loan.amount)}</div>
                    <div style="margin-top:0.2rem">${statusBadge(loan.status)}</div>
                </div>
            </div>
            <div style="display:flex;gap:1rem;font-size:0.7rem;color:var(--text-dim);margin-bottom:0.6rem">
                <span><i class="fa-solid fa-calendar" style="margin-right:0.3rem"></i>${(function (m) { if (!m) return '—'; var y = Math.floor(m / 12); var mo = m % 12; return (y > 0 ? y + ' yr ' : '') + (mo > 0 ? mo + ' mo' : '').trim(); })(loan.term_months)}</span>
                <span><i class="fa-solid fa-percent" style="margin-right:0.3rem"></i>${loan.interest_rate || '—'}% interest</span>
            </div>
            ${loan.status === 'disbursed' ? `
                <button class="action-btn ghost" style="font-size:0.65rem;padding:0.28rem 0.65rem" onclick="toggleSchedule(${loan.id}, this)">
                    <i class="fa-solid fa-calendar-days"></i> View Repayment Schedule
                </button>
                <div id="schedule-${loan.id}" style="display:none;margin-top:0.75rem"></div>
            ` : ''}
            ${loan.status === 'pending' ? `
                <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
                    <button class="action-btn success" style="font-size:0.65rem" onclick="inlineApproveLoan(${loan.id})"><i class="fa-solid fa-check"></i> Approve</button>
                    <button class="action-btn danger" style="font-size:0.65rem" onclick="openInlineRejectModal(${loan.id})"><i class="fa-solid fa-ban"></i> Reject</button>
                </div>` : ''}
        </div>
    `).join('');
}

// ══════════════════════════════
// REPAYMENT SCHEDULE
// ══════════════════════════════
window.toggleSchedule = async function (loanId, btn) {
    const container = document.getElementById(`schedule-${loanId}`);
    if (!container) return;
    if (container.style.display === 'block') {
        container.style.display = 'none';
        btn.innerHTML = '<i class="fa-solid fa-calendar-days"></i> View Repayment Schedule';
        return;
    }
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
    btn.disabled = true;
    try {
        const res = await fetch(`/api/v1/admin/loans/${loanId}/schedule`, { headers: getHeaders() });
        if (!res.ok) throw new Error('Schedule not found');
        const schedule = await res.json();
        if (!schedule.length) {
            container.innerHTML = `<p style="font-size:0.73rem;color:var(--text-dim)">No repayment schedule generated yet.</p>`;
        } else {
            container.innerHTML = `
                <table style="width:100%;border-collapse:collapse;font-size:0.7rem">
                    <thead><tr style="border-bottom:1px solid var(--border)">
                        <th style="text-align:left;padding:0.35rem 0.4rem;color:var(--text-dim);font-family:var(--font-mono);font-size:0.58rem;letter-spacing:0.08em">#</th>
                        <th style="text-align:left;padding:0.35rem 0.4rem;color:var(--text-dim);font-family:var(--font-mono);font-size:0.58rem;letter-spacing:0.08em">DUE DATE</th>
                        <th style="text-align:left;padding:0.35rem 0.4rem;color:var(--text-dim);font-family:var(--font-mono);font-size:0.58rem;letter-spacing:0.08em">AMOUNT</th>
                        <th style="text-align:left;padding:0.35rem 0.4rem;color:var(--text-dim);font-family:var(--font-mono);font-size:0.58rem;letter-spacing:0.08em">STATUS</th>
                        <th style="text-align:left;padding:0.35rem 0.4rem;color:var(--text-dim);font-family:var(--font-mono);font-size:0.58rem;letter-spacing:0.08em">ACTION</th>
                    </tr></thead>
                    <tbody>
                        ${schedule.map(s => {
                const overdue = s.status === 'unpaid' && new Date(s.due_date) < new Date();
                return `<tr style="border-bottom:1px solid rgba(255,255,255,0.02);${overdue ? 'background:rgba(239,68,68,0.04)' : ''}">
                                <td style="padding:0.35rem 0.4rem;font-family:var(--font-mono)">${s.installment_number}</td>
                                <td style="padding:0.35rem 0.4rem;font-family:var(--font-mono);${overdue ? 'color:var(--error)' : ''}">${fmtDate(s.due_date)}</td>
                                <td style="padding:0.35rem 0.4rem;font-family:var(--font-mono);color:var(--gold)">${fmtPHP(s.amount_due)}</td>
                                <td style="padding:0.35rem 0.4rem">${scheduleStatusBadge(s.status, overdue)}</td>
                                <td style="padding:0.35rem 0.4rem">
                                    ${overdue && s.status === 'unpaid' ? `
                                        <div style="display:flex;gap:0.25rem">
                                            <button class="action-btn success" style="font-size:0.58rem;padding:0.2rem 0.45rem" onclick="grantDelay(${loanId},${s.id})"><i class="fa-solid fa-check"></i> Grant</button>
                                            <button class="action-btn danger"  style="font-size:0.58rem;padding:0.2rem 0.45rem" onclick="flagOverdue(${loanId},${s.id})"><i class="fa-solid fa-flag"></i> Flag</button>
                                        </div>` : '<span style="color:var(--text-dim);font-size:0.68rem">—</span>'}
                                </td>
                            </tr>`;
            }).join('')}
                    </tbody>
                </table>`;
        }
        container.style.display = 'block';
        btn.innerHTML = '<i class="fa-solid fa-chevron-up"></i> Hide Schedule';
        btn.disabled = false;
    } catch (e) {
        container.innerHTML = `<p style="font-size:0.73rem;color:var(--error)">${e.message}</p>`;
        container.style.display = 'block';
        btn.innerHTML = '<i class="fa-solid fa-calendar-days"></i> View Repayment Schedule';
        btn.disabled = false;
    }
};

function scheduleStatusBadge(status, overdue) {
    if (status === 'paid') return `<span class="badge badge-verified">Paid</span>`;
    if (status === 'partial') return `<span class="badge badge-pending">Partial</span>`;
    if (overdue) return `<span class="badge badge-rejected">Overdue</span>`;
    return `<span class="badge badge-unverified">Unpaid</span>`;
}

// ── Inline Reject Modal (for the Loans tab inside user profile) ──
window.openInlineRejectModal = function (loanId) {
    var ex = document.getElementById('_inlineRejectModal'); if (ex) ex.remove();
    var ov = document.createElement('div');
    ov.id = '_inlineRejectModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);padding:1rem';

    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid rgba(239,68,68,0.3);border-radius:1.25rem;max-width:480px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.6);overflow:hidden';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:rgba(239,68,68,0.06);border-bottom:1px solid rgba(239,68,68,0.2);padding:1.1rem 1.4rem;display:flex;align-items:center;gap:0.75rem';
    hdr.innerHTML = '<i class="fa-solid fa-ban" style="color:#ef4444;font-size:1.1rem"></i><div style="font-weight:700;color:#ef4444;font-size:0.95rem">Reject Loan #' + loanId + '</div>';
    var hX = document.createElement('button');
    hX.style.cssText = 'margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem';
    hX.innerHTML = '<i class="fas fa-times"></i>';
    hX.addEventListener('click', function () { ov.remove(); });
    hdr.appendChild(hX);

    var body = document.createElement('div');
    body.style.cssText = 'padding:1.25rem';

    var hint = document.createElement('p');
    hint.style.cssText = 'font-size:0.8rem;color:var(--text-dim);margin-bottom:0.75rem';
    hint.textContent = 'Provide a reason for rejection. The producer will be notified.';

    var textLabel = document.createElement('label');
    textLabel.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.4rem';
    textLabel.textContent = 'Rejection Reason *';

    var textarea = document.createElement('textarea');
    textarea.id = '_inlineRejectReason';
    textarea.rows = 4;
    textarea.placeholder = 'e.g. Insufficient documentation, incomplete project description...';
    textarea.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.7rem 0.9rem;font-family:inherit;font-size:0.84rem;resize:vertical;box-sizing:border-box;min-height:100px';

    var msgP = document.createElement('p');
    msgP.id = '_inlineRejectMsg';
    msgP.style.cssText = 'font-size:0.78rem;min-height:1rem;color:var(--text-dim);margin-top:0.4rem;margin-bottom:0.5rem';

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:0.5rem;margin-top:0.75rem';

    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () {
        if (!state.onStep1) {
            // Go back to step 1 instead of closing
            step1.style.filter = ''; step1.style.opacity = ''; step1.style.pointerEvents = '';
            step2.style.display = 'none';
            actionBtn.innerHTML = '<i class="fa-solid fa-arrow-right" style="margin-right:0.3rem"></i>Confirm';
            actionBtn.style.background = 'rgba(245,158,11,0.1)';
            actionBtn.style.borderColor = 'rgba(245,158,11,0.3)';
            actionBtn.style.color = '#f59e0b';
            state.onStep1 = true;
            errP.textContent = '';
        } else {
            ov.remove();
        }
    });

    var confirmBtn = document.createElement('button');
    confirmBtn.style.cssText = 'flex:2;padding:0.75rem;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:var(--r);color:#ef4444;cursor:pointer;font-size:0.85rem;font-weight:700';
    confirmBtn.innerHTML = '<i class="fa-solid fa-ban" style="margin-right:0.35rem"></i>Confirm Reject';
    confirmBtn.addEventListener('click', async function () {
        var reason = (document.getElementById('_inlineRejectReason') || {}).value || '';
        var msgEl = document.getElementById('_inlineRejectMsg');
        if (!reason.trim()) { if (msgEl) { msgEl.style.color = 'var(--error)'; msgEl.textContent = 'Please provide a rejection reason.'; } return; }
        confirmBtn.disabled = true; confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rejecting...';
        if (msgEl) { msgEl.style.color = 'var(--text-dim)'; msgEl.textContent = 'Processing...'; }
        try {
            var r = await fetch('/api/v1/admin/loans/' + loanId + '/reject?reason=' + encodeURIComponent(reason), { method: 'POST', headers: getHeaders() });
            var d = await r.json();
            if (!r.ok) throw new Error(d.detail || 'Rejection failed');
            ov.remove();
            if (typeof showToast === 'function') showToast('Loan rejected. Producer notified.', 'info');
            if (typeof loadLoans === 'function') loadLoans(window.ADMIN_STATE?.currentLoanFilter || 'pending');
            if (typeof loadDashboard === 'function') loadDashboard();
            // Reload the user modal to reflect updated loan status
            if (typeof openUserModal === 'function' && window.ADMIN_STATE?._lastOpenUserId) openUserModal(window.ADMIN_STATE._lastOpenUserId);
        } catch (e) {
            if (msgEl) { msgEl.style.color = 'var(--error)'; msgEl.textContent = e.message; }
            confirmBtn.disabled = false; confirmBtn.innerHTML = '<i class="fa-solid fa-ban" style="margin-right:0.35rem"></i>Confirm Reject';
        }
    });

    btns.appendChild(cancelBtn); btns.appendChild(confirmBtn);
    body.appendChild(hint); body.appendChild(textLabel); body.appendChild(textarea); body.appendChild(msgP); body.appendChild(btns);
    box.appendChild(hdr); box.appendChild(body); ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    setTimeout(function () { textarea.focus(); }, 100);
};

window.grantDelay = async function (loanId, scheduleId) {
    try {
        const res = await fetch(`/api/v1/admin/loans/${loanId}/schedule/${scheduleId}/grant-delay`, {
            method: 'POST', headers: getHeaders()
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.detail || 'Failed to grant delay');
        showToast('Payment delay granted. Due date extended 30 days.', 'success');
        const btn = document.querySelector(`[onclick="toggleSchedule(${loanId}, this)"]`);
        if (btn) { document.getElementById(`schedule-${loanId}`).style.display = 'none'; toggleSchedule(loanId, btn); }
    } catch (e) { showToast(e.message, 'error'); }
};

window.flagOverdue = async function (loanId, scheduleId) {
    try {
        const res = await fetch(`/api/v1/admin/loans/${loanId}/schedule/${scheduleId}/flag-overdue`, {
            method: 'POST', headers: getHeaders()
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.detail || 'Failed');
        showToast('Installment flagged. Producer has been notified.', 'info');
    } catch (e) { showToast(e.message, 'error'); }
};

// ══════════════════════════════
// USER ACTIONS
// ══════════════════════════════
// ── Shared: show/hide freeze loading overlay ──
function _showFreezeOverlay(msg) {
    var ex = document.getElementById('_freezeLoadingOverlay'); if (ex) ex.remove();
    var ov = document.createElement('div');
    ov.id = '_freezeLoadingOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:19999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px)';
    var card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:1.25rem;padding:2rem 2.5rem;display:flex;flex-direction:column;align-items:center;gap:1rem;box-shadow:0 32px 80px rgba(0,0,0,0.6);min-width:220px;text-align:center';
    card.innerHTML = '<div style="width:52px;height:52px;border-radius:50%;background:rgba(212,175,55,0.1);border:2px solid rgba(212,175,55,0.3);display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-spinner fa-spin" style="color:var(--gold);font-size:1.4rem"></i></div>'
        + '<div style="font-size:0.88rem;font-weight:700;color:var(--text)">' + (msg || 'Processing...') + '</div>'
        + '<div style="font-size:0.72rem;color:var(--text-dim)">Please wait a moment</div>';
    ov.appendChild(card);
    document.body.appendChild(ov);
}
function _hideFreezeOverlay() {
    var ov = document.getElementById('_freezeLoadingOverlay'); if (ov) ov.remove();
}

// ── Center toast (override for freeze/unfreeze actions) ──
function _showCenterToast(msg, type) {
    var ex = document.getElementById('_centerToast'); if (ex) ex.remove();
    var t = document.createElement('div');
    t.id = '_centerToast';
    var colors = { success: '#22c55e', info: 'var(--gold)', error: '#ef4444' };
    var borders = { success: 'rgba(34,197,94,0.35)', info: 'rgba(212,175,55,0.35)', error: 'rgba(239,68,68,0.35)' };
    t.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.85);z-index:20000;background:var(--bg-card);border:1px solid ' + (borders[type] || borders.info) + ';border-radius:1rem;padding:1.1rem 1.75rem;font-size:0.86rem;font-weight:700;color:' + (colors[type] || colors.info) + ';box-shadow:0 24px 60px rgba(0,0,0,0.6);text-align:center;max-width:340px;transition:all 0.3s cubic-bezier(.34,1.56,.64,1);opacity:0';
    t.innerHTML = '<i class="fa-solid ' + (type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info') + '" style="margin-right:0.5rem"></i>' + msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.style.transform = 'translate(-50%,-50%) scale(1)'; t.style.opacity = '1'; });
    setTimeout(function () { t.style.transform = 'translate(-50%,-50%) scale(0.9)'; t.style.opacity = '0'; setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300); }, 2800);
}

window.freezeUser = async function (userId) {
    _showFreezeOverlay('Freezing account...');
    try {
        const res = await fetch(`/api/v1/admin/users/${userId}/freeze`, { method: 'POST', headers: getHeaders() });
        const d = await res.json();
        _hideFreezeOverlay();
        if (!res.ok) throw new Error(d.detail);
        _showCenterToast(d.message || 'Account frozen.', 'info');
        loadUsers();
    } catch (e) { _hideFreezeOverlay(); _showCenterToast(e.message, 'error'); }
};
window.unbanUser = async function (userId) {
    _showFreezeOverlay('Restoring account...');
    try {
        const res = await fetch(`/api/v1/admin/users/${userId}/unban`, { method: 'POST', headers: getHeaders() });
        const d = await res.json();
        _hideFreezeOverlay();
        if (!res.ok) throw new Error(d.detail);
        _showCenterToast(d.message || 'Account restored.', 'success');
        loadUsers();
    } catch (e) { _hideFreezeOverlay(); _showCenterToast(e.message, 'error'); }
};
window.unlockPin = async function (userId) {
    try {
        const res = await fetch(`/api/v1/admin/users/${userId}/unlock-pin`, { method: 'POST', headers: getHeaders() });
        const d = await res.json();
        if (!res.ok) throw new Error(d.detail);
        showToast(d.message || 'PIN unlocked.', 'success');
        loadUsers();
    } catch (e) { showToast(e.message, 'error'); }
};
window.inlineArchiveUser = function (userId, userEmail, userName) {
    var ex = document.getElementById('_archiveModal2'); if (ex) ex.remove();
    var ov = document.createElement('div');
    ov.id = '_archiveModal2';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);padding:1rem';
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid rgba(239,68,68,0.25);border-radius:1.25rem;max-width:520px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.6);overflow:hidden';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:rgba(139,0,0,0.15);border-bottom:1px solid rgba(239,68,68,0.2);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:0.75rem';
    hdr.innerHTML = '<i class="fa-solid fa-box-archive" style="color:#ef4444;font-size:1.1rem"></i><div style="font-weight:700;color:#ef4444;font-size:0.95rem">Archive This Account</div>';
    var hdrX = document.createElement('button');
    hdrX.style.cssText = 'margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem';
    hdrX.innerHTML = '<i class="fas fa-times"></i>';
    hdrX.addEventListener('click', function () { ov.remove(); });
    hdr.appendChild(hdrX);
    var body = document.createElement('div');
    body.style.cssText = 'padding:1.25rem';
    var toL = document.createElement('label'); toL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem'; toL.textContent = 'To';
    var toV = document.createElement('div'); toV.style.cssText = 'background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);padding:0.55rem 0.9rem;font-size:0.84rem;color:#ef4444;font-weight:600;margin-bottom:0.85rem'; toV.textContent = userEmail || '—';
    var subL = document.createElement('label'); subL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem'; subL.textContent = 'Subject';
    var subI = document.createElement('input'); subI.type = 'text'; subI.id = '_archSubjectPop'; subI.value = '[Filmnance] Account Archived'; subI.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.65rem 0.9rem;margin-bottom:0.85rem;font-size:0.84rem;box-sizing:border-box';
    var rL = document.createElement('label'); rL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem'; rL.innerHTML = 'Reason <span style="color:#ef4444">*</span>';
    var rA = document.createElement('textarea'); rA.id = '_archReasonPop'; rA.rows = 5; rA.placeholder = 'e.g. Repeated policy violations...'; rA.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.75rem;font-size:0.82rem;font-family:inherit;resize:vertical;box-sizing:border-box;min-height:120px';
    var msgP = document.createElement('p'); msgP.id = '_archMsgPop'; msgP.style.cssText = 'font-size:0.78rem;min-height:1rem;color:var(--text-dim);margin-top:0.5rem';
    var btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:0.6rem;margin-top:0.85rem';
    var cancelBtn = document.createElement('button'); cancelBtn.style.cssText = 'flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600'; cancelBtn.textContent = 'Cancel'; cancelBtn.addEventListener('click', function () { ov.remove(); });
    var confirmBtn = document.createElement('button'); confirmBtn.style.cssText = 'flex:2;padding:0.75rem;background:rgba(139,0,0,0.3);border:1px solid rgba(239,68,68,0.4);border-radius:var(--r);color:#ef4444;cursor:pointer;font-size:0.85rem;font-weight:700'; confirmBtn.innerHTML = '<i class="fa-solid fa-box-archive" style="margin-right:0.4rem"></i>Confirm Archive';
    confirmBtn.addEventListener('click', async function () {
        var reason = (document.getElementById('_archReasonPop') || {}).value || '';
        var subject = (document.getElementById('_archSubjectPop') || {}).value || '[Filmnance] Account Archived';
        if (!reason.trim()) { msgP.style.color = 'var(--error)'; msgP.textContent = 'Please enter a reason.'; return; }
        msgP.style.color = 'var(--text-dim)'; msgP.textContent = 'Archiving...'; confirmBtn.disabled = true;
        try {
            var params = new URLSearchParams({ reason: reason.trim(), subject: subject.trim() });
            var res = await fetch('/api/v1/admin/archive-user/' + userId + '?' + params, { method: 'DELETE', headers: getHeaders() });
            var d = await res.json();
            if (!res.ok) throw new Error(d.detail);
            ov.remove();
            closeModal('userModal');
            if (typeof showToast === 'function') showToast(d.message || 'User archived.', 'success');
            if (typeof loadUsers === 'function') loadUsers();
            if (typeof loadArchivedUsers === 'function') loadArchivedUsers();
            if (typeof loadDashboard === 'function') loadDashboard();
        } catch (e) { msgP.style.color = 'var(--error)'; msgP.textContent = e.message || 'Archive failed'; confirmBtn.disabled = false; }
    });
    btns.appendChild(cancelBtn); btns.appendChild(confirmBtn);
    body.appendChild(toL); body.appendChild(toV); body.appendChild(subL); body.appendChild(subI); body.appendChild(rL); body.appendChild(rA); body.appendChild(msgP); body.appendChild(btns);
    box.appendChild(hdr); box.appendChild(body); ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    setTimeout(function () { rA.focus(); }, 150);
};


window.archiveUser = function (userId, userEmail) {
    var ex = document.getElementById('_archiveConfirmModal'); if (ex) ex.remove();
    var ov = document.createElement('div');
    ov.id = '_archiveConfirmModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10006;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.78);backdrop-filter:blur(6px);padding:1rem';
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid rgba(239,68,68,0.25);border-radius:1.25rem;max-width:520px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.6);overflow:hidden';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:rgba(139,0,0,0.15);border-bottom:1px solid rgba(239,68,68,0.2);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:0.75rem';
    hdr.innerHTML = '<i class="fa-solid fa-box-archive" style="color:#ef4444;font-size:1.1rem"></i><div style="font-weight:700;color:#ef4444;font-size:0.95rem">Archive This Account</div>';
    var xBtn = document.createElement('button');
    xBtn.style.cssText = 'margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem';
    xBtn.innerHTML = '<i class="fas fa-times"></i>';
    xBtn.addEventListener('click', function () { ov.remove(); });
    hdr.appendChild(xBtn);
    var body = document.createElement('div');
    body.style.cssText = 'padding:1.25rem';
    // TO
    var toL = document.createElement('label');
    toL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem';
    toL.textContent = 'To';
    var toV = document.createElement('div');
    toV.style.cssText = 'background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);padding:0.55rem 0.9rem;font-size:0.84rem;color:#ef4444;font-weight:600;margin-bottom:0.85rem';
    toV.textContent = userEmail || '—';
    // SUBJECT
    var subL = document.createElement('label');
    subL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem';
    subL.textContent = 'Subject';
    var subI = document.createElement('input');
    subI.type = 'text'; subI.id = '_archiveSubjectInput'; subI.value = '[Filmnance] Account Archived';
    subI.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.65rem 0.9rem;margin-bottom:0.85rem;font-size:0.84rem;box-sizing:border-box';
    // REASON
    var rL = document.createElement('label');
    rL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem';
    rL.innerHTML = 'Reason <span style="color:#ef4444">*</span>';
    var rA = document.createElement('textarea');
    rA.id = '_archiveReasonInput'; rA.rows = 5; rA.placeholder = 'e.g. Repeated policy violations...';
    rA.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.75rem;font-size:0.82rem;font-family:inherit;resize:vertical;box-sizing:border-box;min-height:120px';
    var msgP = document.createElement('p');
    msgP.id = '_archiveModalMsg';
    msgP.style.cssText = 'font-size:0.78rem;min-height:1rem;color:var(--text-dim);margin-top:0.5rem';
    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:0.6rem;margin-top:0.85rem';
    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () {
        if (!state.onStep1) {
            // Go back to step 1 instead of closing
            step1.style.filter = ''; step1.style.opacity = ''; step1.style.pointerEvents = '';
            step2.style.display = 'none';
            actionBtn.innerHTML = '<i class="fa-solid fa-arrow-right" style="margin-right:0.3rem"></i>Confirm';
            actionBtn.style.background = 'rgba(245,158,11,0.1)';
            actionBtn.style.borderColor = 'rgba(245,158,11,0.3)';
            actionBtn.style.color = '#f59e0b';
            state.onStep1 = true;
            errP.textContent = '';
        } else {
            ov.remove();
        }
    });
    var confirmBtn = document.createElement('button');
    confirmBtn.style.cssText = 'flex:2;padding:0.75rem;background:rgba(139,0,0,0.3);border:1px solid rgba(239,68,68,0.4);border-radius:var(--r);color:#ef4444;cursor:pointer;font-size:0.85rem;font-weight:700';
    confirmBtn.innerHTML = '<i class="fa-solid fa-box-archive" style="margin-right:0.4rem"></i>Confirm Archive';
    confirmBtn.addEventListener('click', function () { window._doArchiveUser(userId); });
    btns.appendChild(cancelBtn); btns.appendChild(confirmBtn);
    body.appendChild(toL); body.appendChild(toV);
    body.appendChild(subL); body.appendChild(subI);
    body.appendChild(rL); body.appendChild(rA);
    body.appendChild(msgP); body.appendChild(btns);
    box.appendChild(hdr); box.appendChild(body);
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    setTimeout(function () { rA.focus(); }, 100);
};

window._doArchiveUser = async function (userId) {
    var reason = (document.getElementById('_archiveReasonInput') || {}).value || '';
    var subject = (document.getElementById('_archiveSubjectInput') || {}).value || '[Filmnance] Account Archived';
    var msgEl = document.getElementById('_archiveModalMsg');
    if (!reason.trim()) { if (msgEl) { msgEl.style.color = 'var(--error)'; msgEl.textContent = 'Please enter a reason.'; } return; }
    if (msgEl) { msgEl.style.color = 'var(--text-dim)'; msgEl.textContent = 'Archiving...'; }
    try {
        var params = new URLSearchParams({ reason: reason.trim(), subject: subject.trim() });
        var res = await fetch('/api/v1/admin/archive-user/' + userId + '?' + params, { method: 'DELETE', headers: getHeaders() });
        var d = await res.json();
        if (!res.ok) throw new Error(d.detail);
        var m = document.getElementById('_archiveConfirmModal'); if (m) m.remove();
        if (typeof showToast === 'function') showToast(d.message || 'User archived.', 'success');
        if (typeof loadUsers === 'function') loadUsers();
        if (typeof loadArchivedUsers === 'function') loadArchivedUsers();
        if (typeof loadDashboard === 'function') loadDashboard();
    } catch (e) {
        if (msgEl) { msgEl.style.color = 'var(--error)'; msgEl.textContent = e.message || 'Archive failed'; }
    }
};

// ══════════════════════════════
// VERIFICATIONS
// ══════════════════════════════
window.loadVerifications = async function () {
    const container = document.getElementById('verificationsList');
    if (!container) return;
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading verifications...</p></div>`;
    try {
        const res = await fetch('/api/v1/admin/pending-verifications', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to load');
        const users = await res.json();
        if (!users.length) {
            container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-id-card"></i><p>No pending verifications</p></div>`;
            return;
        }
        container.innerHTML = users.map(u => renderVerifyCard(u)).join('');
    } catch (e) {
        container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${e.message}</p></div>`;
    }
};

function resolveAssetUrl(url) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    // Already absolute path from root — return as-is
    if (url.startsWith('/')) return url;
    // Relative path — prepend /uploads/
    return '/uploads/' + url;
}

function renderPastProjectAsset(url) {
    if (!url) return '<span style="font-size:0.75rem;color:var(--text-dim)">Not provided</span>';
    // Use the raw stored URL for type detection, resolved URL for src
    const rawUrl = url;
    const u = resolveAssetUrl(url);

    const isImg = /\.(jpg|jpeg|png|webp|gif)$/i.test(rawUrl);
    const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(rawUrl);
    const isPdf = /\.pdf$/i.test(rawUrl);
    const isYt = rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be');
    const isVimeo = rawUrl.includes('vimeo.com');

    if (isImg)
        return `<img src="${esc(u)}" style="width:100%;max-height:160px;object-fit:contain;border-radius:6px;border:1px solid var(--border);cursor:zoom-in;display:block" onclick="openMediaLightbox('${esc(u)}','image')">`;

    if (isVideo) {
        return `<div onclick="openMediaLightbox('${esc(u)}','video')" style="cursor:pointer;display:flex;align-items:center;gap:0.6rem;padding:0.7rem 1rem;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;margin-top:0.25rem">
            <i class="fa-solid fa-circle-play" style="color:var(--gold);font-size:1.4rem;flex-shrink:0"></i>
            <span style="font-size:0.84rem;font-weight:600;color:var(--text)">Click to play video</span>
        </div>`;
    }

    if (isPdf)
        return `<div style="height:200px;border:1px solid var(--border);border-radius:6px;overflow:hidden"><iframe src="${esc(u)}" style="width:100%;height:100%;border:none"></iframe></div><a href="${esc(u)}" target="_blank" style="font-size:0.7rem;color:var(--gold);display:block;margin-top:0.25rem"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open PDF</a>`;

    if (isYt) {
        const m = rawUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (m) return `<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:6px;overflow:hidden;border:1px solid var(--border)"><iframe src="https://www.youtube.com/embed/${m[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe></div>`;
    }
    if (isVimeo) {
        const m = rawUrl.match(/vimeo\.com\/(\d+)/);
        if (m) return `<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:6px;overflow:hidden;border:1px solid var(--border)"><iframe src="https://player.vimeo.com/video/${m[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe></div>`;
    }
    // Generic file link
    return `<a href="${esc(u)}" target="_blank" style="display:inline-flex;align-items:center;gap:0.35rem;color:var(--gold);font-size:0.78rem;border:1px solid var(--gold-bdr);background:var(--gold-dim);padding:0.28rem 0.65rem;border-radius:0.4rem"><i class="fa-solid fa-external-link"></i> View Past Project</a>`;
}

// ── Verification Card — shows ONLY pending_changes, not all stored data ──
function renderVerifyCard(u) {
    const pc = u.pending_changes || {};
    const approvedSecs = u.approved_sections || {};
    const isFirstTime = Object.keys(pc).length === 0;

    // Only show data from pending_changes — never fall back to stored values.
    // If a field isn't in pending_changes, it was already reviewed before.
    const pv = (key) => pc[key] !== undefined ? pc[key] : null;

    // Amber "edited" badge shown on all pending fields
    const editedBadge = (key) => pc[key] !== undefined
        ? `<span style="background:rgba(245,158,11,0.18);border:1px solid rgba(245,158,11,0.35);border-radius:4px;padding:1px 5px;font-size:0.65rem;color:#f59e0b;margin-left:5px;vertical-align:middle">edited</span>`
        : '';

    const resolveImg = (v) => v
        ? ((v.startsWith('/') || v.startsWith('http')) ? v : `/uploads/ids/${v}`)
        : null;
    const idSrc = resolveImg(pv('id_photo_url'));
    const selfieSrc = resolveImg(pv('selfie_photo_url'));

    // Show section only if at least one of its fields is in pending_changes
    const showProfessional = !!(pv('filmmaker_role') || pv('bio') || pv('portfolio_url'));
    const showPastProject = !!(pv('past_project_url') || (Array.isArray(pv('past_project_urls')) && pv('past_project_urls').length > 0));
    const showEmergency = !!(pv('emergency_contact_name') || pv('emergency_contact_phone') ||
        pv('emergency_contact_email') || pv('emergency_contact_id_url') || pv('emergency_contact_relationship'));
    const showKyc = !!(pv('id_type') || idSrc || selfieSrc);
    const pendingSectionCount = [showProfessional, showPastProject, showEmergency, showKyc].filter(Boolean).length;

    // Show what's already been approved for context
    const approvedList = Object.keys(approvedSecs).filter(k => approvedSecs[k]).map(k => ({
        'professional': 'Professional Info', 'past_project': 'Past Project',
        'ec_name': 'EC Name', 'ec_contact': 'EC Contact', 'ec_id': 'EC ID', 'kyc': 'KYC'
    }[k] || k)).join(', ');

    return `
    <div class="producer-card" id="verifyCard${u.id}">
        <div class="producer-header">
            <div class="producer-avatar">${(u.name || 'U').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}</div>
            <div>
                <div class="producer-name">${esc(u.name)}</div>
                <div class="producer-email">${esc(u.email)}</div>
            </div>
            <span class="badge badge-pending" style="margin-left:auto">${isFirstTime ? 'New Submission' : '🔄 EDITED DATA'}</span>
        </div>

        ${!isFirstTime ? `
        <div style="margin:0 0 0.75rem;padding:0.6rem 0.75rem;background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.22);border-radius:8px;font-size:0.74rem;color:#f59e0b;line-height:1.4">
            <i class="fa-solid fa-triangle-exclamation" style="margin-right:0.4rem"></i>
            This user <strong>edited</strong> their profile. Only the changed fields are shown below —
            previously approved data is not repeated.
        </div>` : ''}

        ${approvedList ? `
        <div style="margin:0 0 0.75rem;padding:0.5rem 0.75rem;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:8px;font-size:0.72rem;color:#22c55e;">
            <i class="fa-solid fa-circle-check" style="margin-right:0.35rem"></i>
            Previously approved: <strong>${approvedList}</strong>
        </div>` : ''}

        ${showProfessional ? `
        <div style="margin:0.75rem 0;padding:0.75rem;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
            <div style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--gold);margin-bottom:0.6rem">
                <i class="fa-solid fa-video" style="margin-right:0.35rem"></i>Professional Info
            </div>
            <div class="card-info">
                ${pv('filmmaker_role') ? `<div class="card-row"><span class="card-row-label">Role</span><span class="card-row-val">${esc(pv('filmmaker_role'))}${editedBadge('filmmaker_role')}</span></div>` : ''}
                ${pv('bio') ? `<div class="card-row" style="flex-direction:column;gap:0.2rem"><span class="card-row-label">Bio ${editedBadge('bio')}</span><span class="card-row-val" style="font-size:0.75rem;line-height:1.5;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;max-width:100%">${esc(pv('bio'))}</span></div>` : ''}
                ${pv('portfolio_url') ? `<div class="card-row"><span class="card-row-label">Portfolio ${editedBadge('portfolio_url')}</span><a href="${esc(pv('portfolio_url'))}" target="_blank" style="color:var(--gold);font-size:0.75rem;word-break:break-all">${esc(pv('portfolio_url'))}</a></div>` : ''}
            </div>
        </div>` : ''}

        ${showPastProject ? `
        <div style="margin:0.75rem 0;padding:0.75rem;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
            <div style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--gold);margin-bottom:0.6rem">
                <i class="fa-solid fa-film" style="margin-right:0.35rem"></i>Past Project(s) ${editedBadge('past_project_url')}${editedBadge('past_project_urls')}
            </div>
            ${(() => {
                const urls = pv('past_project_urls') || (pv('past_project_url') ? [pv('past_project_url')] : []);
                if (Array.isArray(urls) && urls.length > 0) {
                    return urls.map((u, i) => `<div style="margin-bottom:0.5rem">${renderPastProjectAsset(u)}</div>`).join('');
                }
                return renderPastProjectAsset(pv('past_project_url'));
            })()}
        </div>` : ''}

        ${showEmergency ? `
        <div style="margin:0.75rem 0;padding:0.75rem;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
            <div style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--gold);margin-bottom:0.6rem">
                <i class="fa-solid fa-phone-alt" style="margin-right:0.35rem"></i>Emergency Contact
                ${approvedSecs.ec_name || approvedSecs.ec_contact || approvedSecs.ec_id ? `<span style="font-size:0.6rem;color:#22c55e;margin-left:6px;font-weight:normal">(${[approvedSecs.ec_name ? 'Name/Relation' : '', approvedSecs.ec_contact ? 'Phone/Email' : '', approvedSecs.ec_id ? 'EC ID' : ''].filter(Boolean).join(', ')} already approved)</span>` : ''}
            </div>
            <div class="card-info">
                ${pv('emergency_contact_name') ? `<div class="card-row"><span class="card-row-label">Name ${editedBadge('emergency_contact_name')}</span><span class="card-row-val">${esc(pv('emergency_contact_name'))}${pv('emergency_contact_relationship') ? ' · ' + esc(pv('emergency_contact_relationship')) : ''}</span></div>` : ''}
                ${pv('emergency_contact_phone') ? `<div class="card-row"><span class="card-row-label">Phone ${editedBadge('emergency_contact_phone')}</span><span class="card-row-val">${esc(pv('emergency_contact_phone'))}</span></div>` : ''}
                ${pv('emergency_contact_email') ? `<div class="card-row"><span class="card-row-label">Email ${editedBadge('emergency_contact_email')}</span><span class="card-row-val">${esc(pv('emergency_contact_email'))}</span></div>` : ''}
                ${pv('emergency_contact_id_url') ? `
                <div class="card-row" style="flex-direction:column;gap:0.4rem">
                    <span class="card-row-label">EC ID Photo ${editedBadge('emergency_contact_id_url')}</span>
                    ${(() => {
                    const ecIdSrc = resolveAssetUrl(pv('emergency_contact_id_url'));
                    return `<img src="${esc(ecIdSrc)}" style="width:100%;max-height:160px;object-fit:contain;border-radius:6px;border:1px solid var(--gold-bdr);cursor:zoom-in;display:block" onclick="openMediaLightbox('${esc(ecIdSrc)}','image')" onerror="this.style.display='none'">`;
                })()}
                </div>` : ''}
            </div>
        </div>` : ''}

        ${showKyc ? `
        <div style="margin:0.75rem 0;padding:0.75rem;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
            <div style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--gold);margin-bottom:0.6rem">
                <i class="fa-solid fa-id-card" style="margin-right:0.35rem"></i>Identity Verification (KYC)
            </div>
            <div class="card-info" style="margin-bottom:0.6rem">
                ${pv('id_type') ? `<div class="card-row"><span class="card-row-label">ID Type ${editedBadge('id_type')}</span><span class="card-row-val">${esc(pv('id_type'))}</span></div>` : ''}
                ${pv('id_expiry_date') ? `<div class="card-row"><span class="card-row-label">Expiry</span><span class="card-row-val">${new Date(pv('id_expiry_date')).toLocaleDateString('en-PH')}</span></div>` : ''}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
                <div>
                    <div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;margin-bottom:0.3rem">ID Photo ${editedBadge('id_photo_url')}</div>
                    ${idSrc ? `<img src="${esc(idSrc)}" style="width:100%;max-height:120px;object-fit:cover;border-radius:6px;border:1px solid var(--gold-bdr);cursor:zoom-in" onclick="openMediaLightbox('${esc(idSrc)}','image')" onerror="this.style.display='none'">` : '<span style="font-size:0.72rem;color:var(--text-dim)">Not uploaded</span>'}
                </div>
                <div>
                    <div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;margin-bottom:0.3rem">Selfie with ID ${editedBadge('selfie_photo_url')}</div>
                    ${selfieSrc ? `<img src="${esc(selfieSrc)}" style="width:100%;max-height:120px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:zoom-in" onclick="openMediaLightbox('${esc(selfieSrc)}','image')" onerror="this.style.display='none'">` : '<span style="font-size:0.72rem;color:var(--text-dim)">Not uploaded</span>'}
                </div>
            </div>
        </div>` : ''}

        <div class="card-actions" style="flex-direction:column;gap:0.6rem">
            <!-- Full-batch buttons: label changes based on pending section count -->
            <div style="display:flex;gap:0.5rem">
                <button class="action-btn success" style="flex:1" onclick="approveVerification(${u.id})"><i class="fa-solid fa-check${pendingSectionCount > 1 ? '-double' : ''}"></i> ${pendingSectionCount > 1 ? 'Approve All' : 'Approve'}</button>
                <button class="action-btn danger" style="flex:1" onclick="openVerifyRejectModal(${u.id},'${esc(u.name)}')"><i class="fa-solid fa-xmark"></i> ${pendingSectionCount > 1 ? 'Reject All' : 'Reject'}</button>
            </div>
            ${(() => {
                // Count how many distinct sections are pending
                const pendingSections = [showProfessional, showPastProject, showEmergency, showKyc].filter(Boolean).length;
                // Only show per-section controls when 2+ sections are pending
                // (if only 1 section, Approve All / Reject All already does the same thing)
                if (pendingSections < 2) return '';
                return `
            <div style="padding:0.6rem;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:8px">
                <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:0.5rem">Per-Section Review</div>
                <div style="display:flex;flex-direction:column;gap:0.4rem">
                    ${showProfessional ? `<div style="display:flex;align-items:center;gap:0.4rem;font-size:0.77rem"><span style="flex:1;color:var(--text)">Professional Info</span><button onclick="approveSingleSection(${u.id},'professional')" style="padding:0.2rem 0.6rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:4px;color:#22c55e;cursor:pointer;font-size:0.7rem;font-weight:700;transition:background 0.15s" onmouseover="this.style.background='rgba(34,197,94,0.25)'" onmouseout="this.style.background='rgba(34,197,94,0.1)'">✓ Approve</button><button onclick="rejectSingleSection(${u.id},'professional','${esc(u.name)}')" style="padding:0.2rem 0.6rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:4px;color:#ef4444;cursor:pointer;font-size:0.7rem;font-weight:700;transition:background 0.15s" onmouseover="this.style.background='rgba(239,68,68,0.25)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">✗ Reject</button></div>` : ''}
                    ${showPastProject ? `<div style="display:flex;align-items:center;gap:0.4rem;font-size:0.77rem"><span style="flex:1;color:var(--text)">Past Project</span><button onclick="approveSingleSection(${u.id},'past_project')" style="padding:0.2rem 0.6rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:4px;color:#22c55e;cursor:pointer;font-size:0.7rem;font-weight:700;transition:background 0.15s" onmouseover="this.style.background='rgba(34,197,94,0.25)'" onmouseout="this.style.background='rgba(34,197,94,0.1)'">✓ Approve</button><button onclick="rejectSingleSection(${u.id},'past_project','${esc(u.name)}')" style="padding:0.2rem 0.6rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:4px;color:#ef4444;cursor:pointer;font-size:0.7rem;font-weight:700;transition:background 0.15s" onmouseover="this.style.background='rgba(239,68,68,0.25)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">✗ Reject</button></div>` : ''}
                    ${showEmergency && (pv('emergency_contact_name') || pv('emergency_contact_relationship')) ? `<div style="display:flex;align-items:center;gap:0.4rem;font-size:0.77rem"><span style="flex:1;color:var(--text)">EC Name/Relation</span><button onclick="approveSingleSection(${u.id},'ec_name')" style="padding:0.2rem 0.6rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:4px;color:#22c55e;cursor:pointer;font-size:0.7rem;font-weight:700;transition:background 0.15s" onmouseover="this.style.background='rgba(34,197,94,0.25)'" onmouseout="this.style.background='rgba(34,197,94,0.1)'">✓ Approve</button><button onclick="rejectSingleSection(${u.id},'ec_name','${esc(u.name)}')" style="padding:0.2rem 0.6rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:4px;color:#ef4444;cursor:pointer;font-size:0.7rem;font-weight:700;transition:background 0.15s" onmouseover="this.style.background='rgba(239,68,68,0.25)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">✗ Reject</button></div>` : ''}
                    ${showEmergency && (pv('emergency_contact_phone') || pv('emergency_contact_email')) ? `<div style="display:flex;align-items:center;gap:0.4rem;font-size:0.77rem"><span style="flex:1;color:var(--text)">EC Phone/Email</span><button onclick="approveSingleSection(${u.id},'ec_contact')" style="padding:0.2rem 0.6rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:4px;color:#22c55e;cursor:pointer;font-size:0.7rem;font-weight:700;transition:background 0.15s" onmouseover="this.style.background='rgba(34,197,94,0.25)'" onmouseout="this.style.background='rgba(34,197,94,0.1)'">✓ Approve</button><button onclick="rejectSingleSection(${u.id},'ec_contact','${esc(u.name)}')" style="padding:0.2rem 0.6rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:4px;color:#ef4444;cursor:pointer;font-size:0.7rem;font-weight:700;transition:background 0.15s" onmouseover="this.style.background='rgba(239,68,68,0.25)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">✗ Reject</button></div>` : ''}
                    ${showEmergency && pv('emergency_contact_id_url') ? `<div style="display:flex;align-items:center;gap:0.4rem;font-size:0.77rem"><span style="flex:1;color:var(--text)">Emergency Contact ID <span style="font-size:0.62rem;color:var(--text-dim)">(+5 pts)</span></span><button onclick="approveSingleSection(${u.id},'ec_id')" style="padding:0.2rem 0.6rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:4px;color:#22c55e;cursor:pointer;font-size:0.7rem;font-weight:700;transition:background 0.15s" onmouseover="this.style.background='rgba(34,197,94,0.25)'" onmouseout="this.style.background='rgba(34,197,94,0.1)'">✓ Approve</button><button onclick="rejectSingleSection(${u.id},'ec_id','${esc(u.name)}')" style="padding:0.2rem 0.6rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:4px;color:#ef4444;cursor:pointer;font-size:0.7rem;font-weight:700;transition:background 0.15s" onmouseover="this.style.background='rgba(239,68,68,0.25)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">✗ Reject</button></div>` : ''}
                    ${showKyc ? `<div style="display:flex;align-items:center;gap:0.4rem;font-size:0.77rem"><span style="flex:1;color:var(--text)">Identity Verification (KYC)</span><button onclick="approveSingleSection(${u.id},'kyc')" style="padding:0.2rem 0.6rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:4px;color:#22c55e;cursor:pointer;font-size:0.7rem;font-weight:700;transition:background 0.15s" onmouseover="this.style.background='rgba(34,197,94,0.25)'" onmouseout="this.style.background='rgba(34,197,94,0.1)'">✓ Approve</button><button onclick="rejectSingleSection(${u.id},'kyc','${esc(u.name)}')" style="padding:0.2rem 0.6rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:4px;color:#ef4444;cursor:pointer;font-size:0.7rem;font-weight:700;transition:background 0.15s" onmouseover="this.style.background='rgba(239,68,68,0.25)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">✗ Reject</button></div>` : ''}
                </div>
            </div>`;
            })()}
        </div>
    </div>`;
}

// ── Approve verification ──
window.approveVerification = async function (userId) {
    try {
        const res = await fetch(`/api/v1/admin/verify-user/${userId}`, {
            method: 'POST', headers: getHeaders(),
            body: JSON.stringify({ approve: true, reason: '' })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.detail);
        showToast(d.message || 'User verified!', 'success');
        loadVerifications(); loadDashboard();
    } catch (e) { showToast(e.message, 'error'); }
};

window.openVerifyRejectModal = function (userId, name) {
    ADMIN_STATE.verifyingUserId = userId;
    document.getElementById('verifyModalTitle').textContent = `Reject: ${name}`;
    document.getElementById('verifyModalBody').innerHTML = `
        <p class="form-hint">Reason will be sent to the producer.</p>
        <textarea id="verifyRejectReason" class="modal-textarea" placeholder="e.g. ID photo unclear, mismatched name..."></textarea>
        <p id="verifyRejectMsg" class="form-msg"></p>`;
    document.getElementById('verifyModalFooter').innerHTML = `
        <button class="action-btn danger" onclick="confirmVerifyReject()"><i class="fa-solid fa-xmark"></i> Confirm Reject</button>
        <button class="action-btn ghost" onclick="closeModal('verifyModal')">Cancel</button>`;
    openModal('verifyModal');
};

window.confirmVerifyReject = async function () {
    const reason = document.getElementById('verifyRejectReason')?.value?.trim();
    const msgEl = document.getElementById('verifyRejectMsg');
    if (!reason) { msgEl.textContent = 'Reason required.'; msgEl.className = 'form-msg error'; return; }
    try {
        const res = await fetch(`/api/v1/admin/verify-user/${ADMIN_STATE.verifyingUserId}`, {
            method: 'POST', headers: getHeaders(),
            body: JSON.stringify({ approve: false, reason })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.detail);
        closeModal('verifyModal');
        showToast('Verification rejected.', 'info');
        loadVerifications(); loadDashboard();
    } catch (e) {
        document.getElementById('verifyRejectMsg').textContent = e.message;
        document.getElementById('verifyRejectMsg').className = 'form-msg error';
    }
};

// ── Per-section approve (single section only — does NOT touch KYC when
//    rejecting Professional Info, fixing issues #1 and #5) ──
window.approveSingleSection = async function (userId, section) {
    try {
        const fd = new FormData();
        fd.append('section', section);
        fd.append('approve', 'true');
        fd.append('reason', '');
        const res = await fetch(`/api/v1/admin/verify-user/${userId}/section`, {
            method: 'POST', headers: getAuthOnlyHeaders(), body: fd
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.detail || 'Failed');
        showToast(d.message || 'Section approved!', 'success');
        // Only remove the whole card if ALL pending changes are now resolved
        const remaining = d.pending_changes_remaining || [];
        if (remaining.length === 0) {
            const card = document.getElementById('verifyCard' + userId);
            if (card) card.remove();
            // Update badge count
            var badge = document.getElementById('verifyBadge');
            if (badge) badge.textContent = Math.max(0, parseInt(badge.textContent || '1') - 1);
            loadDashboard();
        } else {
            // Still has other pending sections — reload just this card
            loadVerifications();
        }
    } catch (e) { showToast(e.message, 'error'); }
};

window.rejectSingleSection = function (userId, section, name) {
    ADMIN_STATE.verifyingUserId = userId;
    ADMIN_STATE.verifyingSection = section;
    const sectionLabel = {
        professional: 'Professional Info', past_project: 'Past Project',
        ec_name: 'EC Name/Relation', ec_contact: 'EC Phone/Email',
        ec_id: 'Emergency Contact ID', kyc: 'Identity Verification (KYC)'
    }[section] || section;
    document.getElementById('verifyModalTitle').textContent = `Reject Section: ${sectionLabel} — ${name}`;
    document.getElementById('verifyModalBody').innerHTML = `
        <p class="form-hint">Only this section will be rejected. Other approved sections (including KYC) are not affected.</p>
        <textarea id="verifyRejectReason" class="modal-textarea" placeholder="e.g. Professional info incomplete, missing portfolio link..."></textarea>
        <p id="verifyRejectMsg" class="form-msg"></p>`;
    document.getElementById('verifyModalFooter').innerHTML = `
        <button class="action-btn danger" onclick="confirmSectionReject()"><i class="fa-solid fa-xmark"></i> Reject Section Only</button>
        <button class="action-btn ghost" onclick="closeModal('verifyModal')">Cancel</button>`;
    openModal('verifyModal');
};

window.confirmSectionReject = async function () {
    const reason = document.getElementById('verifyRejectReason')?.value?.trim();
    const msgEl = document.getElementById('verifyRejectMsg');
    if (!reason) { msgEl.textContent = 'Reason required.'; msgEl.className = 'form-msg error'; return; }
    try {
        const fd = new FormData();
        fd.append('section', ADMIN_STATE.verifyingSection);
        fd.append('approve', 'false');
        fd.append('reason', reason);
        const res = await fetch(`/api/v1/admin/verify-user/${ADMIN_STATE.verifyingUserId}/section`, {
            method: 'POST', headers: getAuthOnlyHeaders(), body: fd
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.detail || 'Failed');
        closeModal('verifyModal');
        const remaining = d.pending_changes_remaining || [];
        if (remaining.length === 0) {
            // No more pending sections — remove card and update badge
            const card = document.getElementById('verifyCard' + ADMIN_STATE.verifyingUserId);
            if (card) card.remove();
            loadDashboard();
        } else {
            // Still has other sections pending — reload to show updated card
            loadVerifications();
        }
        showToast('Section rejected. ' + (remaining.length > 0 ? remaining.length + ' section(s) still pending.' : 'No more pending sections.'), 'info');
    } catch (e) {
        document.getElementById('verifyRejectMsg').textContent = e.message;
        document.getElementById('verifyRejectMsg').className = 'form-msg error';
    }
};

// Returns headers with Authorization only (no Content-Type) for FormData POSTs
function getAuthOnlyHeaders() {
    const h = { ...getHeaders() };
    delete h['Content-Type'];
    return h;
}

// ── Contact Emergency Contact via email ──
window.openContactModal = function (userId, producerName, contactEmail, contactName) {
    ADMIN_STATE.contactEmail = contactEmail;
    ADMIN_STATE.contactUserId = userId;

    // Remove any existing instance
    var ex = document.getElementById('_ecMsgModal'); if (ex) ex.remove();
    var ov = document.createElement('div');
    ov.id = '_ecMsgModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10003;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);padding:1rem';
    ov.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:1.25rem;max-width:520px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.6);overflow:hidden">'
        + '<div style="background:rgba(212,175,55,0.08);border-bottom:1px solid rgba(212,175,55,0.2);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:0.75rem">'
        + '<i class="fa-solid fa-user-shield" style="color:var(--gold);font-size:1.1rem"></i>'
        + '<div style="font-weight:700;color:var(--text);font-size:0.95rem">Emergency Contact Message</div>'
        + '<button onclick="document.getElementById(&quot;_ecMsgModal&quot;).remove()" style="margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem"><i class="fas fa-times"></i></button>'
        + '</div>'
        + '<div style="padding:1.25rem">'
        + '<div style="margin-bottom:0.9rem">'
        + '<label style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem">To</label>'
        + '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);padding:0.55rem 0.9rem;font-size:0.84rem;color:var(--gold);font-weight:600">' + (contactEmail || '') + '</div>'
        + '</div>'
        + '<label style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem">Subject</label>'
        + '<input id="_ecSubject" type="text" value="[Filmnance] Important Message" style="width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.65rem 0.9rem;margin-bottom:0.85rem;font-size:0.84rem;box-sizing:border-box">'
        + '<label style="font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem">Message</label>'
        + '<textarea id="_ecBody" rows="7" style="width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.7rem 0.9rem;font-family:inherit;font-size:0.82rem;resize:vertical;line-height:1.6;box-sizing:border-box;min-height:140px"></textarea>'
        + '<p id="_ecMsg" style="font-size:0.78rem;min-height:1rem;color:var(--text-dim);margin-top:0.5rem"></p>'
        + '<div style="display:flex;gap:0.6rem;margin-top:0.85rem">'
        + '<button onclick="document.getElementById(&quot;_ecMsgModal&quot;).remove()" style="flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600">Cancel</button>'
        + '<button onclick="sendContactEmail()" style="flex:2;padding:0.75rem;background:rgba(212,175,55,0.12);border:1px solid var(--gold-bdr);border-radius:var(--r);color:var(--gold);cursor:pointer;font-size:0.85rem;font-weight:700"><i class="fa-solid fa-paper-plane" style="margin-right:0.4rem"></i>SEND MESSAGE</button>'
        + '</div></div></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    // Set defaults
    var bodyEl = document.getElementById('_ecBody');
    if (bodyEl) bodyEl.value = 'Dear ' + (contactName || 'Contact') + ',\n\nThis message is from the Filmnance admin team regarding the producer account of ' + producerName + '.\n\n';
};

window.sendContactEmail = async function () {
    const subject = (document.getElementById('_ecSubject') || document.getElementById('contactSubject'))?.value?.trim() || '';
    const body = (document.getElementById('_ecBody') || document.getElementById('contactBody'))?.value?.trim() || '';
    const msgEl = document.getElementById('_ecMsg') || document.getElementById('contactMsg');
    const userId = ADMIN_STATE.contactUserId;

    if (!subject) { msgEl.textContent = 'Subject is required.'; msgEl.style.color = 'var(--error)'; return; }
    if (!body) { msgEl.textContent = 'Message body is required.'; msgEl.style.color = 'var(--error)'; return; }

    msgEl.textContent = 'Sending...';
    msgEl.style.color = 'var(--text-dim)';

    try {
        const params = new URLSearchParams({ subject, body });
        const res = await fetch(`/api/v1/admin/users/${userId}/contact-emergency?${params}`, {
            method: 'POST', headers: getHeaders()
        });
        const text = await res.text();
        let d;
        try { d = JSON.parse(text); } catch { d = { detail: text }; }
        if (!res.ok) throw new Error(d.detail || 'Send failed');
        msgEl.textContent = 'Message sent successfully!';
        msgEl.style.color = 'var(--success)';
        setTimeout(() => { var m = document.getElementById('_ecMsgModal'); if (m) m.remove(); else closeModal('contactModal'); }, 2500);
    } catch (e) {
        msgEl.textContent = e.message;
        msgEl.style.color = 'var(--error)';
    }
};

// ══ Admin: Remove Verification Section ══════════════════════════════════
window.openRemoveSectionModal = function (userId, userName, userDataOrJson) {
    var u = userDataOrJson;
    if (typeof u === 'string') { try { u = JSON.parse(u); } catch (e) { u = {}; } }
    if (!u || typeof u !== 'object') u = {};

    var ex = document.getElementById('_removeSectionModal'); if (ex) ex.remove();
    var ov = document.createElement('div');
    ov.id = '_removeSectionModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);padding:1rem';

    var ALL_SECTIONS = [
        {
            key: 'professional', label: 'Professional Info', pts: -5, desc: 'Role, bio, portfolio',
            hasData: function (u) { return !!(u.filmmaker_role || u.bio || u.portfolio_url); }
        },
        {
            key: 'past_project', label: 'Past Project', pts: -5, desc: 'Past project video/link',
            hasData: function (u) { return !!(u.past_project_url || u.past_project_title); }
        },
        {
            key: 'ec_name', label: 'Emergency Contact — Name & Relation', pts: -5, desc: 'Contact name and relationship',
            hasData: function (u) { return !!(u.emergency_contact_name || u.ec_name); }
        },
        {
            key: 'ec_contact', label: 'Emergency Contact — Phone & Email', pts: -5, desc: 'Contact phone number and email address',
            hasData: function (u) { return !!(u.emergency_contact_phone || u.ec_phone || u.ec_email || u.emergency_contact_email); }
        },
        {
            key: 'ec_id', label: 'Emergency Contact — ID Photo', pts: -5, desc: 'Emergency contact ID photo',
            hasData: function (u) { return !!(u.ec_id_photo || u.emergency_contact_id_photo); }
        },
        {
            key: 'kyc', label: 'Identity Verification (KYC)', pts: -25, desc: 'ID photo, selfie, ID type — also revokes verification',
            hasData: function (u) { return !!(u.id_photo || u.selfie_photo || u.id_type || u.is_verified || u.verification_status === 'approved'); }
        },
    ];

    // Only show sections that are already APPROVED (admin can only remove approved data)
    var approvedSecs = u.approved_sections || {};
    var ALL = ALL_SECTIONS.filter(function (s) {
        // approved_sections uses short keys directly: 'professional','past_project','ec_name','ec_contact','ec_id','kyc'
        return approvedSecs[s.key] === true;
    });
    // If no approved sections exist — show a message, DO NOT fall back to all sections

    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:1.25rem;max-width:520px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.7);overflow:hidden;max-height:90vh;display:flex;flex-direction:column';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:rgba(245,158,11,0.08);border-bottom:1px solid rgba(245,158,11,0.2);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:0.75rem;flex-shrink:0';
    hdr.innerHTML = '<i class="fa-solid fa-eraser" style="color:#f59e0b;font-size:1.1rem"></i><div style="font-weight:700;color:var(--text);font-size:0.95rem">Remove Verification Section</div>';
    var hdrX = document.createElement('button');
    hdrX.style.cssText = 'margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem';
    hdrX.innerHTML = '<i class="fas fa-times"></i>';
    hdrX.addEventListener('click', function () { ov.remove(); });
    hdr.appendChild(hdrX);

    var body = document.createElement('div');
    body.style.cssText = 'padding:1.25rem;overflow-y:auto;flex:1';

    var warn = document.createElement('div');
    warn.style.cssText = 'background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:0.7rem 0.9rem;margin-bottom:1rem;font-size:0.78rem;color:var(--text-dim)';
    warn.innerHTML = '<i class="fas fa-triangle-exclamation" style="color:#f59e0b;margin-right:0.4rem"></i><strong style="color:var(--text)">Warning:</strong> Removes selected section data and deducts trust points from <strong>' + esc(userName) + '</strong>. Action is logged and user is notified.';

    var step1 = document.createElement('div');
    step1.id = '_rmS1';
    var s1T = document.createElement('div');
    s1T.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:0.6rem';
    s1T.textContent = 'Step 1 — Select sections to remove:';
    step1.appendChild(s1T);
    if (!ALL.length) {
        var emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = 'padding:1rem;text-align:center;color:var(--text-dim);font-size:0.82rem;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px';
        emptyMsg.innerHTML = '<i class="fas fa-check-circle" style="color:#22c55e;margin-right:0.4rem"></i>No approved sections to remove. Only approved sections can be removed.';
        step1.appendChild(emptyMsg);
    }
    ALL.forEach(function (s) {
        var lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex;align-items:flex-start;gap:0.75rem;padding:0.7rem 1rem;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;cursor:pointer;margin-bottom:0.35rem;transition:border-color 0.15s';
        lbl.addEventListener('mouseenter', function () { lbl.style.borderColor = 'rgba(245,158,11,0.4)'; });
        lbl.addEventListener('mouseleave', function () { lbl.style.borderColor = 'var(--border)'; });
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = s.key; cb.style.cssText = 'margin-top:0.2rem;accent-color:#f59e0b;flex-shrink:0';
        var info = document.createElement('div');
        info.innerHTML = '<div style="font-size:0.84rem;font-weight:600;color:var(--text)">' + esc(s.label) + ' <span style="color:#ef4444;font-size:0.74rem">' + s.pts + ' pts</span></div><div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.1rem">' + esc(s.desc) + '</div>';
        lbl.appendChild(cb); lbl.appendChild(info); step1.appendChild(lbl);
    });

    var step2 = document.createElement('div');
    step2.id = '_rmS2'; step2.style.display = 'none';
    var s2T = document.createElement('div');
    s2T.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:0.5rem';
    s2T.textContent = 'Step 2 — Enter reason (sent to user):';
    var s2Sum = document.createElement('div'); s2Sum.id = '_rmSummary'; s2Sum.style.cssText = 'background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.18);border-radius:8px;padding:0.6rem 0.9rem;margin-bottom:0.6rem;font-size:0.78rem;color:var(--text-dim)';
    var s2Area = document.createElement('textarea'); s2Area.id = '_rmReason'; s2Area.rows = 4; s2Area.placeholder = 'Reason why this section is being removed (sent to user)...'; s2Area.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.65rem 0.9rem;font-family:inherit;font-size:0.82rem;resize:vertical;box-sizing:border-box';
    step2.appendChild(s2T); step2.appendChild(s2Sum); step2.appendChild(s2Area);

    var errP = document.createElement('p'); errP.id = '_rmErr'; errP.style.cssText = 'font-size:0.78rem;min-height:1rem;margin-top:0.5rem;color:var(--text-dim)';
    body.appendChild(warn); body.appendChild(step1); body.appendChild(step2); body.appendChild(errP);

    var footer = document.createElement('div');
    footer.style.cssText = 'padding:0 1.25rem 1.25rem;display:flex;gap:0.6rem;flex-shrink:0';

    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () {
        if (!state.onStep1) {
            // Go back to step 1 instead of closing
            step1.style.filter = ''; step1.style.opacity = ''; step1.style.pointerEvents = '';
            step2.style.display = 'none';
            actionBtn.innerHTML = '<i class="fa-solid fa-arrow-right" style="margin-right:0.3rem"></i>Confirm';
            actionBtn.style.background = 'rgba(245,158,11,0.1)';
            actionBtn.style.borderColor = 'rgba(245,158,11,0.3)';
            actionBtn.style.color = '#f59e0b';
            state.onStep1 = true;
            errP.textContent = '';
        } else {
            ov.remove();
        }
    });

    var actionBtn = document.createElement('button');
    actionBtn.style.cssText = 'flex:2;padding:0.75rem;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:var(--r);color:#f59e0b;cursor:pointer;font-size:0.85rem;font-weight:700';
    actionBtn.innerHTML = '<i class="fa-solid fa-arrow-right" style="margin-right:0.3rem"></i>Confirm';

    var state = { onStep1: true };
    actionBtn.addEventListener('click', async function () {
        if (state.onStep1) {
            var checked = Array.from(ov.querySelectorAll('input[type="checkbox"]:checked'));
            if (!checked.length) { errP.style.color = 'var(--error)'; errP.textContent = 'Select at least one section.'; return; }
            var LABELS = {
                'professional': 'Professional Info', 'past_project': 'Past Project',
                'ec_name': 'Emergency Contact — Name & Relation', 'ec_contact': 'Emergency Contact — Phone & Email',
                'ec_id': 'Emergency Contact — ID Photo', 'kyc': 'Identity Verification (KYC)'
            };
            var selectedLabels = checked.map(function (cb) { return esc(LABELS[cb.value] || cb.value.replace(/_/g, ' ')); }).join(', ');
            var selectedKeys = checked.map(function (cb) { return cb.value; });

            // Show Step 2 as a separate overlay on top, Step 1 blurred in background
            var ex2 = document.getElementById('_rmStep2Overlay'); if (ex2) ex2.remove();
            var ov2 = document.createElement('div');
            ov2.id = '_rmStep2Overlay';
            ov2.style.cssText = 'position:fixed;inset:0;z-index:10021;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);padding:1rem';

            var box2 = document.createElement('div');
            box2.style.cssText = 'background:var(--bg-card);border:1px solid rgba(239,68,68,0.35);border-radius:1.25rem;max-width:500px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.8);overflow:hidden';

            var hdr2 = document.createElement('div');
            hdr2.style.cssText = 'background:rgba(239,68,68,0.08);border-bottom:1px solid rgba(239,68,68,0.2);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:0.75rem';
            hdr2.innerHTML = '<i class="fa-solid fa-eraser" style="color:#ef4444;font-size:1.1rem"></i><div style="font-weight:700;color:var(--text);font-size:0.95rem">Remove Verification Section</div>';
            var hdr2X = document.createElement('button');
            hdr2X.style.cssText = 'margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem';
            hdr2X.innerHTML = '<i class="fas fa-times"></i>';
            hdr2X.addEventListener('click', function () { ov2.remove(); });
            hdr2.appendChild(hdr2X);

            var body2 = document.createElement('div');
            body2.style.cssText = 'padding:1.25rem';

            var summary2 = document.createElement('div');
            summary2.style.cssText = 'background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:0.65rem 0.9rem;margin-bottom:1rem;font-size:0.82rem;color:var(--text)';
            summary2.innerHTML = '<strong style="color:#ef4444">Removing:</strong> ' + selectedLabels;

            var s2T2 = document.createElement('div');
            s2T2.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:0.5rem';
            s2T2.textContent = 'Step 2 — Enter reason (sent to user):';

            var s2Area2 = document.createElement('textarea');
            s2Area2.id = '_rmReason2'; s2Area2.rows = 4;
            s2Area2.placeholder = 'Reason why this section is being removed (sent to user)...';
            s2Area2.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.65rem 0.9rem;font-family:inherit;font-size:0.82rem;resize:vertical;box-sizing:border-box';

            var errP2 = document.createElement('p'); errP2.style.cssText = 'font-size:0.78rem;min-height:1rem;margin-top:0.5rem;color:var(--text-dim)';

            body2.appendChild(summary2); body2.appendChild(s2T2); body2.appendChild(s2Area2); body2.appendChild(errP2);

            var footer2 = document.createElement('div');
            footer2.style.cssText = 'padding:0 1.25rem 1.25rem;display:flex;gap:0.6rem';

            var back2 = document.createElement('button');
            back2.style.cssText = 'flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600';
            back2.textContent = 'Cancel';
            back2.addEventListener('click', function () { ov2.remove(); });

            var remove2 = document.createElement('button');
            remove2.style.cssText = 'flex:2;padding:0.75rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.35);border-radius:var(--r);color:#ef4444;cursor:pointer;font-size:0.85rem;font-weight:700';
            remove2.innerHTML = '<i class="fa-solid fa-eraser" style="margin-right:0.3rem"></i>Remove Selected Sections';
            remove2.addEventListener('click', async function () {
                var reason = s2Area2.value.trim();
                if (!reason) { errP2.style.color = 'var(--error)'; errP2.textContent = 'Please enter a reason.'; return; }
                remove2.disabled = true; remove2.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Removing...'; errP2.textContent = '';
                try {
                    for (var i = 0; i < selectedKeys.length; i++) {
                        var res = await fetch('/api/v1/admin/users/' + userId + '/remove-section/' + selectedKeys[i] + '?reason=' + encodeURIComponent(reason), { method: 'DELETE', headers: getHeaders() });
                        if (!res.ok) { var d = await res.json(); throw new Error(d.detail || 'Failed'); }
                    }
                    ov2.remove(); ov.remove();
                    if (typeof showToast === 'function') showToast('Sections removed successfully.', 'success');
                    if (typeof openUserModal === 'function') openUserModal(userId);
                } catch (e) { errP2.style.color = 'var(--error)'; errP2.textContent = e.message; remove2.disabled = false; remove2.innerHTML = '<i class="fa-solid fa-eraser" style="margin-right:0.3rem"></i>Remove Selected Sections'; }
            });

            footer2.appendChild(back2); footer2.appendChild(remove2);
            box2.appendChild(hdr2); box2.appendChild(body2); box2.appendChild(footer2);
            ov2.appendChild(box2);
            ov2.addEventListener('click', function (e) { if (e.target === ov2) ov2.remove(); });
            document.body.appendChild(ov2);
            setTimeout(function () { s2Area2.focus(); }, 100);
            errP.textContent = '';
        }
    });

    footer.appendChild(cancelBtn); footer.appendChild(actionBtn);
    box.appendChild(hdr); box.appendChild(body); box.appendChild(footer);
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
};


window.adminRemoveSection = async function (userId, userName) {
    var modal = document.getElementById('removeSectionModal');
    if (!modal) return;
    var checked = Array.from(modal.querySelectorAll('input[type="checkbox"]:checked'));
    var msg = modal.querySelector('#removeSectionMsg');
    if (!checked.length) {
        if (msg) { msg.style.color = 'var(--error)'; msg.textContent = 'Please select at least one section.'; }
        return;
    }
    var reasonEl = modal.querySelector('#removeSectionReason');
    var reason = reasonEl ? reasonEl.value.trim() : '';
    if (!reason) {
        if (msg) { msg.style.color = 'var(--error)'; msg.textContent = 'Please enter a reason.'; }
        return;
    }
    if (msg) { msg.style.color = 'var(--text-dim)'; msg.textContent = 'Removing ' + checked.length + ' section(s)...'; }
    var results = [];
    for (var i = 0; i < checked.length; i++) {
        try {
            var url = '/api/v1/admin/users/' + userId + '/remove-section/' + checked[i].value + '?reason=' + encodeURIComponent(reason);
            var r = await fetch(url, { method: 'DELETE', headers: getHeaders() });
            var d = await r.json();
            results.push({ ok: r.ok, msg: d.message || d.detail || '' });
        } catch (e) { results.push({ ok: false, msg: 'Network error' }); }
    }
    var allOk = results.every(function (r) { return r.ok; });
    if (allOk) {
        if (msg) { msg.style.color = 'var(--success)'; msg.textContent = '✓ ' + results.length + ' section(s) removed. User notified.'; }
        setTimeout(function () {
            var m = document.getElementById('removeSectionModal'); if (m) m.remove();
            if (typeof showToast === 'function') showToast(results.length + ' section(s) removed.', 'success');
            if (typeof loadProducers === 'function') loadProducers();
        }, 1500);
    } else {
        var errMsg = results.filter(function (r) { return !r.ok; }).map(function (r) { return r.msg; }).join('; ');
        if (msg) { msg.style.color = 'var(--error)'; msg.textContent = 'Failed: ' + errMsg; }
    }
};// ── Message User modal ──
window._openMsgModalStandalone = function (userId, userName, userEmail) {
    var ex2 = document.getElementById('_msgStandaloneModal'); if (ex2) ex2.remove();
    var ov = document.createElement('div');
    ov.id = '_msgStandaloneModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);padding:1rem';
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:1.25rem;max-width:520px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.6);overflow:hidden';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:rgba(125,211,252,0.08);border-bottom:1px solid rgba(125,211,252,0.2);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:0.75rem';
    hdr.innerHTML = '<i class="fa-solid fa-envelope" style="color:#7dd3fc;font-size:1.1rem"></i><div style="font-weight:700;color:var(--text);font-size:0.95rem">Direct Message</div>';
    var hdrX = document.createElement('button');
    hdrX.style.cssText = 'margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem';
    hdrX.innerHTML = '<i class="fas fa-times"></i>';
    hdrX.addEventListener('click', function () { ov.remove(); });
    hdr.appendChild(hdrX);
    var body = document.createElement('div');
    body.style.cssText = 'padding:1.25rem';
    var toL = document.createElement('label'); toL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem'; toL.textContent = 'To';
    var toV = document.createElement('div'); toV.style.cssText = 'background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);padding:0.55rem 0.9rem;font-size:0.84rem;color:#7dd3fc;font-weight:600;margin-bottom:0.85rem'; toV.textContent = userEmail || '—';
    var subL = document.createElement('label'); subL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem'; subL.textContent = 'Subject';
    var subI = document.createElement('input'); subI.type = 'text'; subI.id = '_stdMsgSubject'; subI.value = '[Filmnance] Message from Admin'; subI.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.65rem 0.9rem;margin-bottom:0.85rem;font-size:0.84rem;box-sizing:border-box';
    var msgL = document.createElement('label'); msgL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem'; msgL.textContent = 'Message';
    var msgTA = document.createElement('textarea'); msgTA.id = '_stdMsgBody'; msgTA.rows = 7; msgTA.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.7rem 0.9rem;font-family:inherit;font-size:0.82rem;resize:vertical;line-height:1.6;box-sizing:border-box;min-height:140px'; msgTA.value = 'Dear ' + (userName || 'Producer') + ',\n\nThis message is from the Filmnance admin team.\n\n';
    var errP = document.createElement('p'); errP.id = '_stdMsgErr'; errP.style.cssText = 'font-size:0.78rem;min-height:1rem;color:var(--text-dim);margin-top:0.5rem';
    var btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:0.6rem;margin-top:0.85rem';
    var cancelBtn = document.createElement('button'); cancelBtn.style.cssText = 'flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600'; cancelBtn.textContent = 'Cancel'; cancelBtn.addEventListener('click', function () { ov.remove(); });
    var sendBtn = document.createElement('button'); sendBtn.style.cssText = 'flex:2;padding:0.75rem;background:rgba(125,211,252,0.12);border:1px solid rgba(125,211,252,0.3);border-radius:var(--r);color:#7dd3fc;cursor:pointer;font-size:0.85rem;font-weight:700'; sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane" style="margin-right:0.4rem"></i>SEND MESSAGE';
    sendBtn.addEventListener('click', async function () {
        var subject = (document.getElementById('_stdMsgSubject') || {}).value || ''; var body = (document.getElementById('_stdMsgBody') || {}).value || '';
        if (!subject.trim() || !body.trim()) { errP.style.color = 'var(--error)'; errP.textContent = 'Subject and message are required.'; return; }
        errP.style.color = 'var(--text-dim)'; errP.textContent = 'Sending...'; sendBtn.disabled = true;
        try { var res = await fetch('/api/v1/admin/users/' + userId + '/send-message', { method: 'POST', headers: Object.assign({}, getHeaders(), { 'Content-Type': 'application/json' }), body: JSON.stringify({ subject: subject, body: body }) }); var d = await res.json(); if (!res.ok) throw new Error(d.detail || 'Send failed'); errP.style.color = '#22c55e'; errP.textContent = 'Message sent successfully!'; setTimeout(function () { ov.remove(); }, 2000); } catch (e) { errP.style.color = 'var(--error)'; errP.textContent = e.message; sendBtn.disabled = false; }
    });
    btns.appendChild(cancelBtn); btns.appendChild(sendBtn);
    body.appendChild(toL); body.appendChild(toV); body.appendChild(subL); body.appendChild(subI); body.appendChild(msgL); body.appendChild(msgTA); body.appendChild(errP); body.appendChild(btns);
    box.appendChild(hdr); box.appendChild(body); ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
};


window.openUserMessageModal = function (userId, userName, userEmail) {
    var ex = document.getElementById('_msgUserModal'); if (ex) ex.remove();
    var ov = document.createElement('div');
    ov.id = '_msgUserModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);padding:1rem';
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:1.25rem;max-width:520px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.6);overflow:hidden';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:rgba(125,211,252,0.08);border-bottom:1px solid rgba(125,211,252,0.2);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:0.75rem';
    hdr.innerHTML = '<i class="fa-solid fa-envelope" style="color:#7dd3fc;font-size:1.1rem"></i><div style="font-weight:700;color:var(--text);font-size:0.95rem">Direct Message</div>';
    var hdrX = document.createElement('button');
    hdrX.style.cssText = 'margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem';
    hdrX.innerHTML = '<i class="fas fa-times"></i>';
    hdrX.addEventListener('click', function () { ov.remove(); });
    hdr.appendChild(hdrX);
    var body = document.createElement('div');
    body.style.cssText = 'padding:1.25rem';
    var toL = document.createElement('label'); toL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem'; toL.textContent = 'To';
    var toV = document.createElement('div'); toV.style.cssText = 'background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);padding:0.55rem 0.9rem;font-size:0.84rem;color:#7dd3fc;font-weight:600;margin-bottom:0.85rem'; toV.textContent = userEmail || '—';
    var subL = document.createElement('label'); subL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem'; subL.textContent = 'Subject';
    var subI = document.createElement('input'); subI.type = 'text'; subI.id = '_msgUserSubjectPop'; subI.value = '[Filmnance] Message from Admin'; subI.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.65rem 0.9rem;margin-bottom:0.85rem;font-size:0.84rem;box-sizing:border-box';
    var msgL = document.createElement('label'); msgL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem'; msgL.textContent = 'Message';
    var msgTA = document.createElement('textarea'); msgTA.id = '_msgUserBodyPop'; msgTA.rows = 6; msgTA.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.7rem 0.9rem;font-family:inherit;font-size:0.82rem;resize:vertical;line-height:1.6;box-sizing:border-box;min-height:120px'; msgTA.value = 'Dear ' + (userName || 'Producer') + ',\n\nThis message is from the Filmnance admin team.\n\n';
    var errP = document.createElement('p'); errP.id = '_msgUserErrPop'; errP.style.cssText = 'font-size:0.78rem;min-height:1rem;color:var(--text-dim);margin-top:0.5rem';
    var btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:0.6rem;margin-top:0.85rem';
    var cancelBtn = document.createElement('button'); cancelBtn.style.cssText = 'flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600'; cancelBtn.textContent = 'Cancel'; cancelBtn.addEventListener('click', function () { ov.remove(); });
    var sendBtn = document.createElement('button'); sendBtn.style.cssText = 'flex:2;padding:0.75rem;background:rgba(125,211,252,0.12);border:1px solid rgba(125,211,252,0.3);border-radius:var(--r);color:#7dd3fc;cursor:pointer;font-size:0.85rem;font-weight:700'; sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane" style="margin-right:0.4rem"></i>SEND MESSAGE';
    sendBtn.addEventListener('click', async function () {
        var subject = (document.getElementById('_msgUserSubjectPop') || {}).value || '';
        var body = (document.getElementById('_msgUserBodyPop') || {}).value || '';
        if (!subject.trim() || !body.trim()) { errP.style.color = 'var(--error)'; errP.textContent = 'Subject and message are required.'; return; }
        errP.style.color = 'var(--text-dim)'; errP.textContent = 'Sending...'; sendBtn.disabled = true;
        try {
            var res = await fetch('/api/v1/admin/users/' + userId + '/send-message', { method: 'POST', headers: Object.assign({}, getHeaders(), { 'Content-Type': 'application/json' }), body: JSON.stringify({ subject: subject, body: body }) });
            var d = await res.json();
            if (!res.ok) throw new Error(d.detail || 'Send failed');
            errP.style.color = '#22c55e'; errP.textContent = 'Message sent successfully!';
            setTimeout(function () { ov.remove(); }, 1800);
        } catch (e) { errP.style.color = 'var(--error)'; errP.textContent = e.message; sendBtn.disabled = false; }
    });
    btns.appendChild(cancelBtn); btns.appendChild(sendBtn);
    body.appendChild(toL); body.appendChild(toV); body.appendChild(subL); body.appendChild(subI); body.appendChild(msgL); body.appendChild(msgTA); body.appendChild(errP); body.appendChild(btns);
    box.appendChild(hdr); box.appendChild(body); ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    setTimeout(function () { msgTA.focus(); }, 150);
};


window._sendUserMessage = async function (userId, userEmail) {
    var subject = (document.getElementById('_msgUserSubject') || {}).value || '';
    var body = (document.getElementById('_msgUserBody') || {}).value || '';
    var errEl = document.getElementById('_msgUserErr');
    if (!subject.trim() || !body.trim()) { if (errEl) { errEl.style.color = 'var(--error)'; errEl.textContent = 'Subject and message are required.'; } return; }
    if (errEl) { errEl.style.color = 'var(--text-dim)'; errEl.textContent = 'Sending...'; }
    try {
        var headers = Object.assign({}, getHeaders(), { 'Content-Type': 'application/json' });
        var res = await fetch('/api/v1/admin/users/' + userId + '/send-message', {
            method: 'POST', headers: headers,
            body: JSON.stringify({ subject: subject, body: body })
        });
        var d = await res.json();
        if (!res.ok) throw new Error(d.detail || 'Send failed');
        if (errEl) { errEl.style.color = 'var(--success)'; errEl.textContent = 'Message sent successfully!'; }
        setTimeout(function () { var m = document.getElementById('_msgUserModal'); if (m) m.remove(); }, 2000);
    } catch (e) { if (errEl) { errEl.style.color = 'var(--error)'; errEl.textContent = e.message; } }
};
// ── Media Lightbox — opens images/videos inline without new tab ──
window.openMediaLightbox = function (url, type) {
    var ex = document.getElementById('_mediaLightbox'); if (ex) ex.remove();
    var ov = document.createElement('div');
    ov.id = '_mediaLightbox';
    ov.style.cssText = 'position:fixed;inset:0;z-index:19999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.92);backdrop-filter:blur(8px)';
    var inner = '<div style="position:relative;max-width:92vw;max-height:92vh;display:flex;flex-direction:column;align-items:center;gap:0.75rem">'
        + '<button onclick="document.getElementById(&quot;_mediaLightbox&quot;).remove()" style="position:absolute;top:-2.2rem;right:0;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:50%;width:34px;height:34px;color:#fff;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center"><i class="fas fa-times"></i></button>';
    if (type === 'image') {
        inner += '<img src="' + url + '" style="max-width:88vw;max-height:85vh;border-radius:10px;object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,0.8)">';
    } else if (type === 'video') {
        inner += '<video controls autoplay style="max-width:88vw;max-height:85vh;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,0.8)"><source src="' + url + '" type="video/mp4"><source src="' + url + '" type="video/quicktime">Your browser cannot play this video.</video>';
    }
    inner += '</div>';
    ov.innerHTML = inner;
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
};