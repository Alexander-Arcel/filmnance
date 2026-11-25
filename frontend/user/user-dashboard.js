// ============================================
// FILMNANCE — user-dashboard.js
// ============================================
'use strict';

// ── Genre / description helpers ──
function parseGenre(loan) {
    if (loan.genre) return loan.genre;
    var pd = loan.project_description || '';
    var m = pd.match(/Genre:\s*([^|]+)/i);
    return m ? m[1].trim() : 'Unspecified';
}
function parseDesc(loan) {
    var pd = loan.project_description || loan.description || loan.purpose || '';
    if (/^Genre:/i.test(pd)) return loan.purpose || '';
    return pd;
}

// ── Action dropdown helpers ──
function toggleActionDrop(id) {
    var wrap = document.getElementById(id);
    if (!wrap) return;
    var isOpen = wrap.classList.contains('open');
    // Close all open dropdowns and reset their chevrons
    document.querySelectorAll('.action-dropdown-wrap.open').forEach(function (el) {
        el.classList.remove('open');
        var chev = el.querySelector('.action-drop-btn .fa-chevron-down');
        if (chev) chev.style.transform = '';
    });
    if (!isOpen) {
        wrap.classList.add('open');
        var chev = wrap.querySelector('.action-drop-btn .fa-chevron-down');
        if (chev) chev.style.transform = 'rotate(180deg)';
    }
}
function closeActionDrops() {
    document.querySelectorAll('.action-dropdown-wrap.open').forEach(function (el) {
        el.classList.remove('open');
        var chev = el.querySelector('.action-drop-btn .fa-chevron-down');
        if (chev) chev.style.transform = '';
    });
}
document.addEventListener('click', function (e) {
    if (!e.target.closest('.action-dropdown-wrap')) closeActionDrops();
});


let currentUser = null;
let currentLoans = [];

async function loadDashboard() {
    if (!getToken()) { handleLogout(); return; }
    startUserClock();
    try {
        const res = await fetch('/api/v1/auth/me', { headers: getHeaders() });
        if (res.status === 401) { handleLogout(); return; }
        if (!res.ok) throw new Error('Profile load failed');
        const meData = await res.json();
        if (!meData || typeof meData !== 'object' || !meData.id) {
            console.error('Dashboard: /me returned invalid data', meData);
            handleLogout(); return;
        }
        currentUser = meData;

        if (currentUser.account_status === 'frozen' || currentUser.account_status === 'freeze') {
            alert('Your account has been frozen. You will be logged out.');
            handleLogout(); return;
        }

        // ── Sidebar chip ──
        const nm = document.getElementById('userNameDisplay');
        if (nm) nm.textContent = currentUser.name || 'Filmmaker';
        const rl = document.getElementById('userRoleDisplay');
        // Show filmmaker role in sidebar ONLY after admin has approved it
        const vs = currentUser?.verification_status || '';
        const everApproved = vs === 'approved' || vs === 'verified' || (currentUser?.identity_trust || 0) > 0;
        if (rl) rl.textContent = (everApproved && currentUser.filmmaker_role) ? currentUser.filmmaker_role : '';

        // Account status badge in sidebar — ALWAYS show, even for new accounts
        const statusBadge = document.getElementById('sidebarStatusBadge');
        if (statusBadge) {
            const s = currentUser.account_status || 'active';
            statusBadge.textContent = s.charAt(0).toUpperCase() + s.slice(1);
            statusBadge.style.display = 'inline-flex';
            statusBadge.style.background = s === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
            statusBadge.style.color = s === 'active' ? '#22c55e' : '#ef4444';
        }

        // ── Trust score ──
        const ts = currentUser.trust_score || 0;
        const tier = ts >= 90 ? 'Gold' : ts >= 70 ? 'Silver' : 'Bronze';
        const tc = tier === 'Gold' ? '#d4af37' : tier === 'Silver' ? '#94a3b8' : '#cd7f32';

        _set('trustScore', ts);
        _set('trustTier', tier + ' Tier');
        const tb = document.getElementById('trustBar');
        if (tb) tb.style.width = Math.min(ts, 100) + '%';

        // ── My Profile card (read-only view) ──
        _set('profName', currentUser?.name || '--');
        _set('profEmail', currentUser?.email || '--');

        // ── APPROVAL GATE ──
        const approvedSecs = currentUser?.approved_sections || {};
        const vStatus = currentUser?.verification_status || '';
        const pendingChanges = currentUser?.pending_changes || {};
        // rejected_sections: set by admin on rejection, cleared per-section when user resubmits
        // Falls back to inferring from vStatus for backwards compatibility
        const rejectedSecs = currentUser?.rejected_sections || {};

        // Per-section status — each section is independent
        // A section is "rejected" ONLY if:
        //   1. It has data  2. It's not currently pending  3. It's not approved
        //   4. Either rejected_sections[key] is set, OR vStatus=rejected and it was never submitted
        //      separately (i.e. no pending entry currently exists for it)
        const secState = (key, fields) => {
            const isApproved = !!(approvedSecs[key]);
            const isPending = fields.some(f => pendingChanges[f] !== undefined);
            // isRejected: this section was in the last rejected batch
            // Use rejected_sections if available, otherwise fall back to vStatus===rejected
            const isRejected = !isApproved && !isPending && (
                rejectedSecs[key] === true ||
                // Fallback: all sections show rejected when vStatus=rejected and nothing is pending
                (vStatus === 'rejected' && Object.keys(pendingChanges).length === 0)
            );
            return { isApproved, isPending, isRejected };
        };

        // ── Filmmaker Role ──
        const profSt = secState('professional', ['filmmaker_role', 'bio', 'portfolio_url']);
        const roleEl = document.getElementById('profRoleView');
        if (roleEl) {
            roleEl.style.color = '';
            if (currentUser?.filmmaker_role) {
                if (profSt.isApproved) {
                    roleEl.textContent = currentUser.filmmaker_role;
                    roleEl.className = 'prof-info-value';
                } else if (profSt.isPending) {
                    roleEl.textContent = currentUser.filmmaker_role + ' (pending review)';
                    roleEl.className = 'prof-info-value prof-status-pending';
                } else if (profSt.isRejected) {
                    roleEl.textContent = currentUser.filmmaker_role + ' (rejected)';
                    roleEl.className = 'prof-info-value prof-status-rejected';
                } else {
                    roleEl.textContent = currentUser.filmmaker_role + ' (pending review)';
                    roleEl.className = 'prof-info-value prof-status-pending';
                }
            } else {
                roleEl.textContent = 'Not set';
                roleEl.className = 'prof-info-value prof-status-empty';
            }
        }

        // Sidebar role chip — only after professional approved
        if (rl) rl.textContent = (profSt.isApproved && currentUser.filmmaker_role) ? currentUser.filmmaker_role : '';

        // ── Bio ──
        const bioEl = document.getElementById('profBioView');
        if (bioEl) {
            bioEl.style.color = '';
            if (currentUser?.bio && profSt.isApproved) {
                bioEl.textContent = currentUser.bio;
                bioEl.className = 'prof-info-value-bio prof-bio-scroll';
            } else if (currentUser?.bio && profSt.isPending) {
                bioEl.textContent = '(pending review)';
                bioEl.className = 'prof-info-value-bio prof-status-pending';
            } else if (currentUser?.bio && profSt.isRejected) {
                bioEl.textContent = '(rejected — please resubmit)';
                bioEl.className = 'prof-info-value-bio prof-status-rejected';
            } else if (currentUser?.bio) {
                bioEl.textContent = '(pending review)';
                bioEl.className = 'prof-info-value-bio prof-status-pending';
            } else {
                bioEl.textContent = '—';
                bioEl.className = 'prof-info-value-bio prof-status-empty';
            }
        }

        // ── Portfolio URL ──
        const profPort = document.getElementById('profPortfolioView');
        if (profPort) {
            profPort.style.color = '';
            if (currentUser.portfolio_url && profSt.isApproved) {
                profPort.innerHTML = `<a href="${currentUser.portfolio_url}" target="_blank" style="color:var(--gold);font-size:0.83rem;word-break:break-all">${currentUser.portfolio_url}</a>`;
                profPort.className = 'prof-info-value-sm';
            } else if (currentUser.portfolio_url && profSt.isPending) {
                profPort.textContent = '(pending review)';
                profPort.className = 'prof-info-value-sm prof-status-pending';
            } else if (currentUser.portfolio_url && profSt.isRejected) {
                profPort.textContent = '(rejected — please resubmit)';
                profPort.className = 'prof-info-value-sm prof-status-rejected';
            } else if (currentUser.portfolio_url) {
                profPort.textContent = '(pending review)';
                profPort.className = 'prof-info-value-sm prof-status-pending';
            } else {
                profPort.textContent = '—';
                profPort.className = 'prof-info-value-sm prof-status-empty';
            }
        }

        // ── Past Projects ──
        const pastSt = secState('past_project', ['past_project_url', 'past_project_urls']);
        const profPast = document.getElementById('profPastProjectView');
        if (profPast) {
            profPast.style.color = '';
            const pastUrl = currentUser.past_project_url ||
                (Array.isArray(currentUser.past_project_urls) && currentUser.past_project_urls.length > 0
                    ? currentUser.past_project_urls[0] : null);

            if (pastUrl && pastSt.isApproved) {
                const isYt = pastUrl.includes('youtube.com') || pastUrl.includes('youtu.be');
                const isVimeo = pastUrl.includes('vimeo.com');
                let label = '▶ Watch Past Project';
                if (isYt) label = '▶ Watch on YouTube';
                else if (isVimeo) label = '▶ Watch on Vimeo';
                const safeUrl = pastUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                profPast.innerHTML = `<a href="#" onclick="_openPastProjectViewer('${safeUrl}');return false;" class="prof-past-hover-link">${label}</a>`;
                profPast.className = 'prof-info-value-sm prof-past-hover';
            } else if (pastUrl && pastSt.isPending) {
                profPast.textContent = 'Pending admin review';
                profPast.className = 'prof-info-value-sm prof-status-pending';
            } else if (pastUrl && pastSt.isRejected) {
                profPast.textContent = 'Rejected — please resubmit';
                profPast.className = 'prof-info-value-sm prof-status-rejected';
            } else if (pastUrl) {
                profPast.textContent = 'Pending admin review';
                profPast.className = 'prof-info-value-sm prof-status-pending';
            } else {
                profPast.textContent = 'Not set';
                profPast.className = 'prof-info-value-sm prof-status-empty';
            }
        }

        // Emergency Contact — show all approved sub-section data with status colors
        const ecNameApproved = !!(approvedSecs.ec_name);
        const ecContactApproved = !!(approvedSecs.ec_contact);
        const ecIdApproved = !!(approvedSecs.ec_id);
        const ecApprovedCount = [ecNameApproved, ecContactApproved, ecIdApproved].filter(Boolean).length;
        const ecName = currentUser.emergency_contact_name;
        const ecRelation = currentUser.emergency_contact_relationship;
        const ecPhone = currentUser.emergency_contact_phone;
        const ecEmail = currentUser.emergency_contact_email;
        const ecNameSt = secState('ec_name', ['emergency_contact_name', 'emergency_contact_relationship']);
        const ecContactSt = secState('ec_contact', ['emergency_contact_phone', 'emergency_contact_email']);
        const ecIdSt = secState('ec_id', ['emergency_contact_id_url']);

        const ecEl = document.getElementById('profECView');
        if (ecEl) {
            ecEl.style.color = '';
            const lines = [];
            // Show approved data
            if (ecNameApproved && ecName) lines.push(ecName + (ecRelation ? ' (' + ecRelation + ')' : ''));
            if (ecContactApproved && ecPhone) lines.push(ecPhone);
            if (ecContactApproved && ecEmail) lines.push(ecEmail);
            if (ecIdApproved) lines.push('EC ID ✓');

            // Append per-section status for non-approved sections that have data
            const statusLines = [];
            if (!ecNameApproved && (ecName || ecRelation)) {
                if (ecNameSt.isPending) statusLines.push({ text: 'Name/Relation: pending review', cls: 'prof-status-pending' });
                else if (ecNameSt.isRejected) statusLines.push({ text: 'Name/Relation: rejected — resubmit', cls: 'prof-status-rejected' });
                else if (ecName) statusLines.push({ text: 'Name/Relation: pending review', cls: 'prof-status-pending' });
            }
            if (!ecContactApproved && (ecPhone || ecEmail)) {
                if (ecContactSt.isPending) statusLines.push({ text: 'Phone/Email: pending review', cls: 'prof-status-pending' });
                else if (ecContactSt.isRejected) statusLines.push({ text: 'Phone/Email: rejected — resubmit', cls: 'prof-status-rejected' });
                else if (ecPhone) statusLines.push({ text: 'Phone/Email: pending review', cls: 'prof-status-pending' });
            }
            // EC ID status — show pending/rejected separately from KYC
            if (!ecIdApproved && currentUser.emergency_contact_id_url) {
                if (ecIdSt.isPending) statusLines.push({ text: 'EC ID: pending review', cls: 'prof-status-pending' });
                else if (ecIdSt.isRejected) statusLines.push({ text: 'EC ID: rejected — resubmit', cls: 'prof-status-rejected' });
                else statusLines.push({ text: 'EC ID: pending review', cls: 'prof-status-pending' });
            }

            if (lines.length > 0 || statusLines.length > 0) {
                ecEl.innerHTML =
                    lines.map(l => `<span style="display:block">${l}</span>`).join('') +
                    statusLines.map(s => `<span style="display:block;font-size:0.78rem" class="${s.cls}">${s.text}</span>`).join('');
                ecEl.className = 'prof-info-value-sm';
            } else {
                ecEl.textContent = 'Not set';
                ecEl.className = 'prof-info-value-sm prof-status-empty';
            }
        }

        // EC sub-section completion label
        const ecStatusEl = document.getElementById('profECStatusDetail');
        if (ecStatusEl) {
            if (ecApprovedCount === 3) {
                ecStatusEl.textContent = '✓ All 3 sections approved';
                ecStatusEl.className = 'prof-info-label prof-status-approved-label';
            } else if (ecApprovedCount > 0) {
                ecStatusEl.textContent = `${ecApprovedCount} out of 3 sections approved`;
                ecStatusEl.className = 'prof-info-label prof-status-partial-label';
            } else {
                ecStatusEl.textContent = '0 out of 3 sections approved';
                ecStatusEl.className = 'prof-info-label';
            }
        }

        const profRate = document.getElementById('profRateView');
        if (profRate) { profRate.textContent = ts >= 80 ? '10% p.a.' : '15% p.a.'; profRate.style.color = 'var(--gold)'; }

        const profKYC = document.getElementById('profKYCView');
        if (profKYC) {
            profKYC.style.color = '';
            profKYC.style.background = 'transparent';

            // ONLY these fields count as "KYC pending" — ec_id NEVER affects KYC status
            const kycFields = ['id_photo_url', 'selfie_photo_url', 'id_type', 'id_expiry_date'];
            const kycPending = kycFields.some(f => (currentUser.pending_changes || {})[f] !== undefined);
            const hasKycPhotos = !!(currentUser.id_photo_url || currentUser.selfie_photo_url);
            const kycApproved = !!(approvedSecs.kyc);
            const kycRejected = !!(currentUser.rejected_sections || {}).kyc && !currentUser.is_verified;

            if (currentUser.is_verified === true) {
                profKYC.textContent = '✓ Verified';
                profKYC.className = 'prof-info-value-sm prof-kyc-verified';
            } else if (kycRejected && !kycPending) {
                profKYC.textContent = 'Rejected — please resubmit';
                profKYC.className = 'prof-info-value-sm prof-kyc-rejected';
            } else if (kycPending) {
                // Only show pending when actual KYC fields are in pending_changes
                profKYC.textContent = 'Pending Admin Review';
                profKYC.className = 'prof-info-value-sm prof-kyc-pending';
            } else if (hasKycPhotos && kycApproved) {
                // Photos exist and were approved (but is_verified not set yet — shouldn't happen normally)
                profKYC.textContent = 'Pending Admin Review';
                profKYC.className = 'prof-info-value-sm prof-kyc-pending';
            } else if (hasKycPhotos && !kycApproved && !kycPending) {
                // Photos uploaded but NOT in pending_changes and NOT approved = previous submission
                // Show as pending ONLY if there's no ec_id-only pending happening
                const onlyEcIdPending = Object.keys(currentUser.pending_changes || {}).every(
                    f => f === 'emergency_contact_id_url'
                );
                if (!onlyEcIdPending) {
                    profKYC.textContent = 'Pending Admin Review';
                    profKYC.className = 'prof-info-value-sm prof-kyc-pending';
                } else {
                    profKYC.textContent = 'Not submitted — upload ID documents';
                    profKYC.className = 'prof-info-value-sm prof-kyc-empty';
                }
            } else {
                profKYC.textContent = 'Not submitted — upload ID documents';
                profKYC.className = 'prof-info-value-sm prof-kyc-empty';
            }
        }

        const profTier = document.getElementById('profTierBadge');
        if (profTier) { profTier.textContent = tier + ' · ' + ts + ' pts'; profTier.style.color = tc; }

        const profVer = document.getElementById('profVerBadge');
        if (profVer) {
            // "Verified" badge on the profile card = KYC verified only (is_verified)
            profVer.textContent = currentUser.is_verified ? '✓ Verified' : 'Unverified';
            profVer.style.background = currentUser.is_verified ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)';
            profVer.style.color = currentUser.is_verified ? '#22c55e' : '#ef4444';
        }

        const profStatusBadge = document.getElementById('profStatusBadge');
        if (profStatusBadge) {
            const s = currentUser.account_status || 'active';
            profStatusBadge.textContent = s.charAt(0).toUpperCase() + s.slice(1);
            profStatusBadge.style.background = s === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)';
            profStatusBadge.style.color = s === 'active' ? '#22c55e' : '#ef4444';
        }

        _set('profScoreLabel', `${ts} / 100`);
        const ptb = document.getElementById('profTrustBar');
        if (ptb) ptb.style.width = Math.min(ts, 100) + '%';

        // ── Summary API ──
        try {
            const sumRes = await fetch('/api/v1/transactions/summary', { headers: getHeaders() });
            if (sumRes.ok) {
                const sum = await sumRes.json();
                const debt = Number(sum.total_outstanding_balance || sum.total_debt || 0);
                _set('totalDebt', `₱${debt.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                _set('activeLoansCount', `${sum.active_loans_count || 0} active loan(s)`);
            }
        } catch (e) { }

        // ── Loans ──
        const loansRes = await fetch('/api/v1/loans/my-loans', { headers: getHeaders() });
        if (loansRes.ok) {
            currentLoans = await loansRes.json();

            // Total projects count card
            _set('totalProjectsCount', currentLoans.length);
            const activeCnt = currentLoans.filter(l => ['pending', 'approved', 'disbursed'].includes(l.status)).length;
            const completedCnt = currentLoans.filter(l => ['completed', 'rejected', 'defaulted'].includes(l.status)).length;
            _set('totalProjectsSub', `${activeCnt} active · ${completedCnt} completed`);

            // Dashboard preview
            _renderLoanPreview(currentLoans);

            // Populate selects for modals
            populateDelayLoanSelect(currentLoans);
            loadNextDue(currentLoans);
            populateGraceLoanSelect(currentLoans);
            populateScheduleLoanSelect(currentLoans);
        }

        await loadTransactionHistory();
        startFreezePolling();

    } catch (err) {
        console.error('Dashboard load error:', err);
    }
}

function _set(id, v) {
    const e = document.getElementById(id);
    if (e) e.textContent = (v !== null && v !== undefined) ? v : '--';
}

function _renderLoanPreview(loans) {
    const lt = document.getElementById('dashLoansPreview');
    if (!lt) return;
    const active = (loans || []).filter(l => ['pending', 'approved', 'disbursed'].includes(l.status)).slice(0, 5);
    lt.innerHTML = active.length ? active.map(l => {
        const st = (l.status || 'pending').toLowerCase();
        return `<tr>
            <td><strong>${l.project_title || '--'}</strong></td>
            <td><span class="genre-pill">${parseGenre(l)}</span></td>
            <td><span class="badge badge-${st}">${st.toUpperCase()}</span></td>
        </tr>`;
    }).join('') : '<tr><td colspan="3" class="empty-row">No active projects yet.</td></tr>';
}

// ── Repayment Schedule ──
function populateScheduleLoanSelect(loans) {
    const sel = document.getElementById('fullSchedLoanSelect');
    if (!sel) return;
    const active = (loans || []).filter(l => l.status === 'disbursed');
    sel.innerHTML = '<option value="">Select a project...</option>' +
        active.map(l => `<option value="${l.id}">${l.project_title}</option>`).join('');
    if (active.length === 1) { sel.value = active[0].id; loadFullScheduleForLoan(); }
}

async function loadFullScheduleForLoan() {
    const sel = document.getElementById('fullSchedLoanSelect');
    const tbody = document.getElementById('fullSchedTableBody');
    const loanId = sel?.value;
    if (!loanId || !tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Loading schedule...</td></tr>';
    try {
        const res = await fetch(`/api/v1/loans/${loanId}/schedule`, { headers: getHeaders() });
        if (!res.ok) throw new Error('Could not load schedule');
        const schedule = await res.json();
        if (!schedule.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No schedule generated yet. Pending admin approval.</td></tr>'; return; }
        tbody.innerHTML = schedule.map(s => {
            const overdue = s.status === 'unpaid' && new Date(s.due_date) < new Date();
            const badge = s.status === 'paid' ? '<span class="badge badge-disbursed">Paid</span>'
                : s.status === 'partial' ? '<span class="badge badge-pending">Partial</span>'
                    : overdue ? '<span class="badge badge-overdue">Overdue</span>'
                        : '<span class="badge">Unpaid</span>';
            const ds = s.delay_status;
            const delayBadge = ds === 'pending' ? '<span class="badge badge-pending">Delay Pending</span>'
                : ds === 'approved' ? '<span class="badge badge-disbursed">Delay Granted</span>'
                    : ds === 'declined' ? '<span class="badge badge-overdue">Delay Declined</span>' : '—';

            const canDelay = s.status !== 'paid' && ds !== 'pending' && ds !== 'approved';
            const dropId = `sdDrop_${s.id}`;
            const parentLoan = (window.currentLoans || []).find(l => l.id === loanId);
            const hasPendingRepay = parentLoan && parentLoan.has_pending_repayment;

            return `<tr style="${overdue && s.status !== 'paid' ? 'background:rgba(239,68,68,0.04)' : ''}">
                <td style="font-weight:700">#${s.installment_number}</td>
                <td style="color:${overdue && s.status !== 'paid' ? 'var(--error)' : 'var(--text-dim)'}">
                    ${new Date(s.due_date).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td style="color:var(--gold);font-weight:700">₱${Number(s.amount_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td>${badge}</td>
                <td>${delayBadge}</td>
                <td class="action-cell">
                    ${s.status === 'paid' ? '<span style="color:var(--text-dim)">—</span>' : `
                        <div class="action-dropdown-wrap" id="${dropId}">
                            <button class="action-drop-btn" onclick="toggleActionDrop('${dropId}')">
                                Actions <i class="fas fa-chevron-down"></i>
                            </button>
                            <div class="action-drop-menu">
                                ${hasPendingRepay
                                    ? `<button disabled style="opacity:0.45;cursor:not-allowed" title="A repayment is already awaiting admin confirmation">
                                        <i class="fas fa-hourglass-half"></i> Awaiting Confirmation
                                       </button>`
                                    : `<button onclick="closeActionDrops();openRepayModal(${loanId},'',0)">
                                        <i class="fas fa-money-bill-wave"></i> Repay
                                       </button>`}
                                ${canDelay ? `<button onclick="closeActionDrops();openDelayForInstallment(${loanId},${s.id})">
                                    <i class="fas fa-clock-rotate-left"></i> Request Delay
                                </button>` : ''}
                                <button onclick="closeActionDrops();openRequestPaymentModal();setTimeout(function(){switchRPTab('update');var sel2=document.getElementById('graceUpdateLoanSelect');if(sel2)sel2.value='${loanId}';},50)">
                                    <i class="fas fa-file-lines"></i> Monthly Update
                                </button>
                            </div>
                        </div>
                    `}
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-row">${e.message}</td></tr>`;
    }
}

function openDelayForInstallment(loanId, scheduleId) {
    openModal('requestPaymentModal');
    switchRPTab('delay');
    const loanSel = document.getElementById('delayLoanSelect');
    if (loanSel) {
        loanSel.value = loanId;
        loadDelayInstallments().then(() => {
            const instSel = document.getElementById('delayInstallmentSelect');
            if (instSel) instSel.value = scheduleId;
        });
    }
}

// ── Transaction History ──
async function loadTransactionHistory() {
    const tbody = document.getElementById('txTableBody');
    const countEl = document.getElementById('txCount');
    if (!tbody) return;
    try {
        const loansRes = await fetch('/api/v1/loans/my-loans', { headers: getHeaders() });
        if (!loansRes.ok) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Could not load transactions.</td></tr>'; return; }
        const loans = await loansRes.json();
        let allTx = [];
        for (const loan of loans) {
            try {
                const txRes = await fetch(`/api/v1/transactions/history/${loan.id}`, { headers: getHeaders() });
                if (txRes.ok) {
                    const data = await txRes.json();
                    const txs = data.transactions || data || [];
                    txs.forEach(t => {
                        t._projectTitle = loan.project_title;

                        // NEW LOGIC: Correct channel reading based on transaction type
                        const isDisb = (t.transaction_type || '').toLowerCase().includes('disbursement');
                        t._loanMethod = isDisb
                            ? (loan.disbursement_method || '')
                            : (loan.repayment_method || '');

                        allTx.push(t);
                    });
                }
            } catch (e) { }
        }
        allTx.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        window._allTxCache = allTx;

        if (countEl) countEl.textContent = `${allTx.length} transaction(s)`;

        const repaid = allTx.filter(t => (t.transaction_type || '').includes('repayment')).reduce((s, t) => s + Number(t.amount || 0), 0);
        _set('totalRepaid', `₱${repaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);

        const dashTx = document.getElementById('dashTxPreview');
        if (dashTx) {
            dashTx.innerHTML = allTx.slice(0, 4).length ? allTx.slice(0, 4).map(tx => {
                const date = tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '--';
                const type = (tx.transaction_type || '').replace(/_/g, ' ');
                const tc = type.includes('repayment') ? 'var(--success)' : type.includes('penalty') ? 'var(--error)' : 'var(--gold)';
                return `<tr><td style="color:var(--text-dim)">${date}</td><td><span style="color:${tc};font-size:0.73rem;font-weight:600;text-transform:uppercase">${type}</span></td><td style="font-weight:600">₱${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>`;
            }).join('') : '<tr><td colspan="3" class="empty-row">No transactions yet.</td></tr>';
        }

        if (!allTx.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No transactions yet.</td></tr>'; return; }
        tbody.innerHTML = allTx.map(tx => {
            const date = tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '--';
            const type = (tx.transaction_type || '').replace(/_/g, ' ');

            // Method display logic
            const method = tx._loanMethod || tx.payment_method || tx.method || '';
            const pm = typeof PH_METHODS !== 'undefined' ? PH_METHODS.find(p => p.key === method) : null;
            const channelHtml = pm
                ? `<span style="font-size:0.7rem;font-weight:700;padding:0.15rem 0.5rem;background:${pm.bg};color:${pm.color};border-radius:4px;border:1px solid ${pm.color}33">${pm.label}</span>`
                : method ? `<span style="font-size:0.75rem;color:var(--text-dim)">${method}</span>` : `<span style="color:var(--text-dim);font-size:0.75rem">—</span>`;

            const tc = type.includes('repayment') ? 'var(--success)' : type.includes('penalty') ? 'var(--error)' : 'var(--gold)';

            // Receipt column — show clickable thumbnail if image, else ref number
            const proofUrl = tx.proof_url || tx.receipt_url || null;
            const receiptHtml = proofUrl
                ? `<img src="${proofUrl}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:zoom-in;display:block" onclick="(function(){var ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:20000;display:flex;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(6px)';ov.innerHTML='<img src=\\'${proofUrl}\\' style=\\'max-width:90vw;max-height:90vh;border-radius:10px\\'>';ov.onclick=function(){ov.remove()};document.body.appendChild(ov)})()" onerror="this.style.display='none'">`
                : tx.reference_number ? `<span style="font-family:monospace;font-size:0.72rem;color:var(--text-dim)">${tx.reference_number}</span>` : `<span style="color:var(--text-dim)">—</span>`;

            return `<tr>
                <td style="color:var(--text-dim);font-size:0.78rem">${date}</td>
                <td><strong>${tx._projectTitle || '--'}</strong></td>
                <td><span style="color:${tc};font-size:0.75rem;font-weight:600;text-transform:uppercase">${type}</span></td>
                <td>${channelHtml}</td>
                <td style="font-weight:700;color:var(--text)">₱${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td>${receiptHtml}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        const tb = document.getElementById('txTableBody');
        if (tb) tb.innerHTML = '<tr><td colspan="6" class="empty-row">Error loading transactions.</td></tr>';
    }
}

// ── Next Due dashboard widget ──
async function loadNextDue(loans) {
    const tbody = document.getElementById('nextDueTableBody');
    if (!tbody) return;
    const active = (loans || currentLoans || []).filter(l => l.status === 'disbursed');
    if (!active.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No active loans with upcoming payments.</td></tr>'; return; }
    let rows = [];
    for (const loan of active) {
        try {
            const res = await fetch(`/api/v1/loans/${loan.id}/schedule`, { headers: getHeaders() });
            if (!res.ok) continue;
            const schedule = await res.json();
            const next = schedule.find(s => s.status !== 'paid');
            if (!next) continue;

            const overdue = next.status === 'unpaid' && new Date(next.due_date) < new Date();
            const badge = overdue ? '<span class="badge badge-overdue">OVERDUE</span>'
                : next.status === 'partial' ? '<span class="badge badge-pending">PARTIAL</span>'
                    : '<span class="badge badge-pending">UNPAID</span>';

            const safeTitle = (loan.project_title || '').replace(/'/g, "\\'");
            const canDelay = !next.delay_status || (next.delay_status !== 'pending' && next.delay_status !== 'approved');
            const dropId = 'ndDrop_' + loan.id;

            rows.push(`<tr style="${overdue ? 'background:rgba(239,68,68,0.04)' : ''}">
                <td><strong>${loan.project_title || '--'}</strong></td>
                <td style="color:var(--text-dim)">#${next.installment_number}</td>
                <td style="color:${overdue ? 'var(--error)' : 'var(--text-dim)'};font-weight:${overdue ? '700' : '400'}">
                    ${new Date(next.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
                <td style="color:var(--gold);font-weight:700">₱${Number(next.amount_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td>${badge}</td>
                <td class="action-cell">
                    <div class="action-dropdown-wrap" id="${dropId}">
                        <button class="action-drop-btn" onclick="toggleActionDrop('${dropId}')">
                            Actions <i class="fas fa-chevron-down"></i>
                        </button>
                        <div class="action-drop-menu">
                            ${loan.has_pending_repayment
                                ? `<button disabled style="opacity:0.45;cursor:not-allowed" title="A repayment is already awaiting admin confirmation">
                                    <i class="fas fa-hourglass-half"></i> Awaiting Confirmation
                                   </button>`
                                : `<button onclick="closeActionDrops();openRepayModal(${loan.id},'${safeTitle}',${loan.remaining_amount || 0})">
                                    <i class="fas fa-money-bill-wave"></i> Repay
                                   </button>`}
                            ${canDelay ? `<button onclick="closeActionDrops();openDelayForInstallment(${loan.id},${next.id})">
                                <i class="fas fa-clock-rotate-left"></i> Request Delay
                            </button>` : ''}
                            <button onclick="closeActionDrops();openRequestPaymentModal();setTimeout(function(){switchRPTab('update');var s=document.getElementById('graceUpdateLoanSelect');if(s)s.value='${loan.id}';},50)">
                                <i class="fas fa-file-lines"></i> Monthly Update
                            </button>
                        </div>
                    </div>
                </td>
            </tr>`);
        } catch (e) { }
    }
    tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="6" class="empty-row">All installments are up to date. 🎉</td></tr>';
}

// ── Request Payment helpers ──
function switchRPTab(tab) {
    const isDelay = tab === 'delay';
    ['rpPanelDelay', 'rpPanelUpdate'].forEach((id, i) => {
        const el = document.getElementById(id); if (el) el.style.display = (i === 0 ? isDelay : !isDelay) ? 'block' : 'none';
    });
    // Delay tab: gold when active. Monthly Update tab: yellow when active.
    const rpTabDelay = document.getElementById('rpTabDelay');
    const rpTabUpdate = document.getElementById('rpTabUpdate');
    if (rpTabDelay) {
        rpTabDelay.style.background = isDelay ? 'var(--gold-dim)' : 'var(--bg-input)';
        rpTabDelay.style.borderColor = isDelay ? 'var(--gold-bdr)' : 'var(--border)';
        rpTabDelay.style.color = isDelay ? 'var(--gold)' : 'var(--text-dim)';
    }
    if (rpTabUpdate) {
        rpTabUpdate.style.background = !isDelay ? 'rgba(234,179,8,0.15)' : 'var(--bg-input)';
        rpTabUpdate.style.borderColor = !isDelay ? 'rgba(234,179,8,0.5)' : 'var(--border)';
        rpTabUpdate.style.color = !isDelay ? '#eab308' : 'var(--text-dim)';
    }
}

function populateDelayLoanSelect(loans) {
    const sel = document.getElementById('delayLoanSelect'); if (!sel) return;
    const d = (loans || []).filter(l => l.status === 'disbursed');
    sel.innerHTML = '<option value="">Select project...</option>' + d.map(l => `<option value="${l.id}">${l.project_title}</option>`).join('');
}

function populateGraceLoanSelect(loans) {
    const sel = document.getElementById('graceUpdateLoanSelect'); if (!sel) return;
    const g = (loans || []).filter(l => l.status === 'disbursed');
    sel.innerHTML = '<option value="">Select project...</option>' + g.map(l => `<option value="${l.id}">${l.project_title}</option>`).join('');
}

async function loadDelayInstallments() {
    const loanId = document.getElementById('delayLoanSelect')?.value;
    const wrap = document.getElementById('delayInstallmentWrap');
    const sel = document.getElementById('delayInstallmentSelect');
    if (!loanId || !wrap || !sel) { if (wrap) wrap.style.display = 'none'; return; }
    sel.innerHTML = '<option value="">Loading...</option>';
    wrap.style.display = 'block';
    try {
        const res = await fetch(`/api/v1/loans/${loanId}/schedule`, { headers: getHeaders() });
        if (!res.ok) throw new Error();
        const schedule = await res.json();
        const unpaid = schedule.filter(s => s.status !== 'paid' && s.delay_status !== 'pending' && s.delay_status !== 'approved');
        if (!unpaid.length) { sel.innerHTML = '<option value="">No eligible installments</option>'; return; }
        sel.innerHTML = '<option value="">Select installment...</option>' + unpaid.map(s => {
            const due = new Date(s.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
            const ov = new Date(s.due_date) < new Date() ? ' ⚠️ OVERDUE' : '';
            return `<option value="${s.id}">#${s.installment_number} — Due ${due} — ₱${Number(s.amount_due).toLocaleString()}${ov}</option>`;
        }).join('');
    } catch { sel.innerHTML = '<option value="">Error loading</option>'; }
}

async function submitRequestPayment() {
    const isDelay = document.getElementById('rpPanelDelay')?.style.display !== 'none';
    setModalMsg('requestPaymentMsg', '');
    if (isDelay) { await submitDelayRequest(); return; }
    // Monthly Update — send as FormData so backend Form(...) works
    const loanId = document.getElementById('graceUpdateLoanSelect')?.value;
    const text = document.getElementById('graceUpdateText')?.value?.trim();
    const photoInput = document.getElementById('gracePhotoInput');
    const photoFile = photoInput && photoInput.files && photoInput.files[0];
    if (!loanId) { setModalMsg('requestPaymentMsg', 'Select a project.', 'error'); return; }
    if (!text || text.length < 20) { setModalMsg('requestPaymentMsg', 'Write at least 20 characters describing progress.', 'error'); return; }
    setModalMsg('requestPaymentMsg', 'Submitting...');
    try {
        const fd = new FormData();
        fd.append('update_text', text);
        if (photoFile) fd.append('progress_photo', photoFile);
        const headers = { 'Authorization': 'Bearer ' + getToken() };
        const res = await fetch(`/api/v1/loans/${loanId}/grace-update`, { method: 'POST', headers, body: fd });
        const data = await safeJson(res);
        if (res.ok) { setModalMsg('requestPaymentMsg', `✓ ${data.message || 'Update submitted!'}`, 'success'); setTimeout(() => closeModal('requestPaymentModal'), 2000); }
        else { setModalMsg('requestPaymentMsg', data.detail || 'Submission failed.', 'error'); }
    } catch (e) { setModalMsg('requestPaymentMsg', 'Network error.', 'error'); }
}

// ── Section-based Delay Request tab switcher ──
window.switchSectionRPTab = function(tab) {
    const isDelay = tab === 'delay';
    ['sectionRpPanelDelay','sectionRpPanelUpdate'].forEach(function(id, i) {
        var el = document.getElementById(id); if (el) el.style.display = (i === 0 ? isDelay : !isDelay) ? 'block' : 'none';
    });
    var tabDelay = document.getElementById('sectionRpTabDelay');
    var tabUpdate = document.getElementById('sectionRpTabUpdate');
    if (tabDelay) { tabDelay.style.background=isDelay?'var(--gold-dim)':'var(--bg-input)'; tabDelay.style.borderColor=isDelay?'var(--gold-bdr)':'var(--border)'; tabDelay.style.color=isDelay?'var(--gold)':'var(--text-dim)'; }
    if (tabUpdate) { tabUpdate.style.background=!isDelay?'rgba(234,179,8,0.15)':'var(--bg-input)'; tabUpdate.style.borderColor=!isDelay?'rgba(234,179,8,0.5)':'var(--border)'; tabUpdate.style.color=!isDelay?'#eab308':'var(--text-dim)'; }
    if (isDelay) _populateSectionDelaySelect(); else _populateSectionGraceSelect();
};

function _populateSectionDelaySelect() {
    var sel = document.getElementById('sectionDelayLoanSelect'); if (!sel) return;
    var loans = window.currentLoans || []; var d = loans.filter(function(l){return l.status==='disbursed';});
    sel.innerHTML = '<option value="">Select project...</option>' + d.map(function(l){return '<option value="'+l.id+'">'+l.project_title+'</option>';}).join('');
}
function _populateSectionGraceSelect() {
    var sel = document.getElementById('sectionGraceUpdateLoanSelect'); if (!sel) return;
    var loans = window.currentLoans || []; var g = loans.filter(function(l){return l.status==='disbursed';});
    sel.innerHTML = '<option value="">Select project...</option>' + g.map(function(l){return '<option value="'+l.id+'">'+l.project_title+'</option>';}).join('');
}

window.loadSectionDelayInstallments = async function() { /* piggyback on same endpoint */ };

window.handleSectionDelayProofPreview = function(input) {
    var prev = document.getElementById('sectionDelayProofPreview');
    var nameEl = document.getElementById('sectionDelayProofFileName');
    if (!input.files[0]) return;
    if (nameEl) nameEl.textContent = input.files[0].name;
    if (prev && input.files[0].type.startsWith('image/')) {
        var r = new FileReader(); r.onload = function(e){ prev.innerHTML='<img src="'+e.target.result+'" style="max-width:100%;max-height:140px;border-radius:8px;margin-top:0.4rem">'; }; r.readAsDataURL(input.files[0]);
    }
};
window.handleSectionMonthlyPhoto = function(input) {
    var prev = document.getElementById('sectionMonthlyPhotoPreview');
    var nameEl = document.getElementById('sectionMonthlyPhotoName');
    if (!input.files[0]) return;
    if (nameEl) nameEl.textContent = input.files[0].name;
    if (prev && input.files[0].type.startsWith('image/')) {
        var r = new FileReader(); r.onload = function(e){ prev.innerHTML='<img src="'+e.target.result+'" style="max-width:100%;max-height:140px;border-radius:8px;margin-top:0.4rem">'; }; r.readAsDataURL(input.files[0]);
    }
};

window.submitSectionRequestPayment = async function() {
    var isDelay = document.getElementById('sectionRpPanelDelay')?.style.display !== 'none';
    var msgEl = document.getElementById('sectionRequestPaymentMsg');
    if (msgEl) { msgEl.textContent=''; msgEl.className='modal-msg rp-msg'; }
    function sMsg(msg,type){ if(msgEl){msgEl.textContent=msg;msgEl.className='modal-msg '+(type||'')+ ' rp-msg';} }
    if (isDelay) {
        var loanId = document.getElementById('sectionDelayLoanSelect')?.value;
        var reason = document.getElementById('sectionDelayReason')?.value?.trim();
        var proofInput = document.getElementById('sectionDelayProofInput');
        if (!loanId) { sMsg('Select a project.','error'); return; }
        if (!reason) { sMsg('Please provide a reason.','error'); return; }
        if (!proofInput?.files?.length) { sMsg('Please upload proof.','error'); return; }
        sMsg('Submitting...');
        try {
            var fd = new FormData(); fd.append('reason', reason); fd.append('proof_image', proofInput.files[0]);
            var res = await fetch('/api/v1/loans/'+loanId+'/delay-request-v2', {method:'POST',headers:{'Authorization':'Bearer '+getToken()},body:fd});
            if (!res.ok) { var d=await res.json(); sMsg(d.detail||'Failed.','error'); return; }
            sMsg('✓ Delay request submitted!','success');
            document.getElementById('sectionDelayReason').value=''; proofInput.value='';
            document.getElementById('sectionDelayProofPreview').innerHTML='';
            document.getElementById('sectionDelayProofFileName').textContent='Click to upload proof';
        } catch(e){ sMsg('Network error.','error'); }
    } else {
        var loanId2 = document.getElementById('sectionGraceUpdateLoanSelect')?.value;
        var text = document.getElementById('sectionGraceUpdateText')?.value?.trim();
        var photoInput = document.getElementById('sectionGracePhotoInput');
        var photoFile = photoInput?.files?.[0];
        if (!loanId2) { sMsg('Select a project.','error'); return; }
        if (!text||text.length<20) { sMsg('Write at least 20 characters.','error'); return; }
        sMsg('Submitting...');
        try {
            var fd2 = new FormData(); fd2.append('update_text', text); if (photoFile) fd2.append('progress_photo', photoFile);
            var res2 = await fetch('/api/v1/loans/'+loanId2+'/grace-update', {method:'POST',headers:{'Authorization':'Bearer '+getToken()},body:fd2});
            var data2 = await res2.json();
            if (res2.ok) { sMsg('✓ '+(data2.message||'Update submitted!'),'success'); document.getElementById('sectionGraceUpdateText').value=''; if(photoInput) photoInput.value=''; document.getElementById('sectionMonthlyPhotoPreview').innerHTML=''; }
            else { sMsg(data2.detail||'Submission failed.','error'); }
        } catch(e){ sMsg('Network error.','error'); }
    }
};

// Populate section selects when the Delay Request section is shown
var _origShowSection = window.showSection;
window.showSection = function(sectionId, navEl, title, subtitle) {
    if (_origShowSection) _origShowSection(sectionId, navEl, title, subtitle);
    if (sectionId === 'delayRequestSection') { setTimeout(function(){ switchSectionRPTab('delay'); }, 50); }
    // If the user navigates AWAY from New Application via the sidebar to
    // any other section, put the loan modal back in its normal floating
    // position so it doesn't stay full-screen-embedded the next time
    // something opens it as an overlay.
    if (sectionId !== 'newAppSection' && window.isLoanAppEmbedded) {
        _relocateLoanModalToOverlay();
    }
};

// ── New Application: relocate the single real loanModal between its
//    floating-overlay home (dashboard quick actions / future callers) and
//    the full-screen New Application section (sidebar navigation). This
//    keeps exactly one copy of the multi-step form markup in the DOM, so
//    "floating modal" only ever appears for non-sidebar entry points, and
//    the section view is never stuck on a fake unpopulated placeholder. ──
window.isLoanAppEmbedded = false;

function _relocateLoanModalIntoSection() {
    var box = document.getElementById('loanModalBox');
    var mount = document.getElementById('newAppMount');
    var modal = document.getElementById('loanModal');
    if (!box || !mount || !modal) return;
    if (box.parentElement === mount) return; // already embedded
    modal.style.display = 'none';            // stop acting as a floating overlay
    document.body.style.overflow = '';
    box.style.maxHeight = 'none';
    box.style.boxShadow = 'none';
    mount.innerHTML = '';
    mount.appendChild(box);
    window.isLoanAppEmbedded = true;
    var closeBtn = document.getElementById('loanModalCloseBtn');
    if (closeBtn) closeBtn.style.display = 'none'; // no "x" needed full-screen; sidebar nav is the way out
}

function _relocateLoanModalToOverlay() {
    var box = document.getElementById('loanModalBox');
    var modal = document.getElementById('loanModal');
    var anchor = document.getElementById('loanModalHomeAnchor');
    if (!box || !modal || !anchor) return;
    if (box.parentElement === modal) return; // already in the overlay
    box.style.maxHeight = '92vh';
    box.style.boxShadow = '';
    modal.appendChild(box);
    window.isLoanAppEmbedded = false;
    var closeBtn = document.getElementById('loanModalCloseBtn');
    if (closeBtn) closeBtn.style.display = '';
}

// Floating-overlay entry point (used by anything that is NOT sidebar nav,
// e.g. a future dashboard quick action) — opens loanModal as a normal
// fixed-position overlay, exactly like every other modal in the app.
window.openLoanApplicationModal = function () {
    _relocateLoanModalToOverlay();
    openModal('loanModal');
    loadDisbursementOptions();
};

// Sidebar entry point — embeds the SAME form into the full-screen section.
window.openLoanApplicationSection = function () {
    _relocateLoanModalIntoSection();
    loadDisbursementOptions();
};

// Smart close: floating mode closes the overlay; embedded mode just resets
// back to step 1 in place (there's nothing to "close" full-screen — the
// user leaves via the sidebar instead).
window.closeLoanApplication = function () {
    if (window.isLoanAppEmbedded) {
        if (typeof resetLoanModalSteps === 'function') resetLoanModalSteps();
        return;
    }
    closeModal('loanModal');
};
let _clockStarted = false;
function startUserClock() {
    if (_clockStarted) return; _clockStarted = true;
    const el = document.getElementById('topbarTime'); if (!el) return;
    const tick = () => el.textContent = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    tick(); setInterval(tick, 1000);
}

// ── Freeze polling ──
let _freezePoll = null;
function startFreezePolling() {
    if (_freezePoll) return;
    _freezePoll = setInterval(async () => {
        try {
            const res = await fetch('/api/v1/auth/me', { headers: getHeaders() });
            if (!res.ok) return;
            const u = await res.json();
            if (u.account_status === 'frozen' || u.account_status === 'freeze') {
                clearInterval(_freezePoll);
                alert('Your account has been frozen. You will be logged out.');
                handleLogout();
            }
        } catch { }
    }, 15000);
}

function _openPastProjectViewer(url) {
    var ex = document.getElementById('_pastProjViewer'); if (ex) ex.remove();
    var isVid = /\.(mp4|mov|avi|mkv|webm)$/i.test(url);
    var isYt = url.includes('youtube.com') || url.includes('youtu.be');
    var isVimeo = url.includes('vimeo.com');
    var isPdf = /\.pdf$/i.test(url);
    var media = '';
    if (isVid) {
        media = '<video controls autoplay preload="auto" style="width:100%;max-height:68vh;background:#000;border-radius:8px;display:block"><source src="' + url + '" type="video/mp4">Your browser does not support video.</video>';
    } else if (isYt) {
        var m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        media = m ? '<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:8px;overflow:hidden"><iframe src="https://www.youtube.com/embed/' + m[1] + '?autoplay=1" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen allow="autoplay"></iframe></div>' : '<p style="color:var(--text)">Could not embed. <a href="' + url + '" target="_blank" style="color:var(--gold)">Open ↗</a></p>';
    } else if (isVimeo) {
        var mv = url.match(/vimeo\.com\/(\d+)/);
        media = mv ? '<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:8px;overflow:hidden"><iframe src="https://player.vimeo.com/video/' + mv[1] + '?autoplay=1" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen allow="autoplay"></iframe></div>' : '<p style="color:var(--text)">Could not embed. <a href="' + url + '" target="_blank" style="color:var(--gold)">Open ↗</a></p>';
    } else if (isPdf) {
        media = '<iframe src="' + url + '" style="width:100%;height:65vh;border:none;border-radius:8px;background:#fff"></iframe>';
    } else {
        media = '<img src="' + url + '" alt="Past Project" style="max-width:100%;max-height:65vh;border-radius:8px;display:block;margin:0 auto">';
    }
    var overlay = document.createElement('div');
    overlay.id = '_pastProjViewer';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.88);backdrop-filter:blur(6px);padding:1rem';
    overlay.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:1.25rem;width:100%;max-width:820px;box-shadow:0 32px 80px rgba(0,0,0,0.7);overflow:hidden">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:0.85rem 1.25rem;border-bottom:1px solid var(--border)">' +
        '<span style="font-weight:700;font-size:0.92rem;color:var(--text)"><i class=\"fas fa-film\" style=\"color:var(--gold);margin-right:0.5rem\"></i>Past Project</span>' +
        '<button onclick=\"document.getElementById(\'_pastProjViewer\').remove()\" style=\"background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem;padding:0.25rem 0.5rem;border-radius:6px\" title=\"Close\"><i class=\"fas fa-times\"></i></button>' +
        '</div><div style=\"padding:1.25rem\">' + media + '</div></div>';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}