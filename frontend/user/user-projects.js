// =============================================
// FILMNANCE — user-projects.js
// My Projects table: genre parsing, filtering,
// table rendering, genre pill builders, and
// Resources section. Extracted from user-ui.js.
// =============================================

// ══════════════════════════════════════════════════════════════
// FIX: Genre filter for My Projects
// ══════════════════════════════════════════════════════════════
var _allLoansForFilter = [];

// Parse ALL genres from project_description "Genre: X, Y, Z | Location: ..."
function _parseGenres(loan) {
    // loan.genre may be a comma-separated string from the API
    if (loan.genre) {
        return loan.genre.split(',').map(function (g) { return g.trim(); }).filter(Boolean);
    }
    var pd = loan.project_description || '';
    var m = pd.match(/Genre:\s*([^|]+)/i);
    if (m) {
        return m[1].split(',').map(function (g) { return g.trim(); }).filter(Boolean);
    }
    return ['Unspecified'];
}

// Return first genre as a string (for filter comparisons)
function _parseGenre(loan) {
    var genres = _parseGenres(loan);
    return genres[0] || 'Unspecified';
}

// Parse human-readable description — never return the "Genre: X | Location: Y" string
function _parseDesc(loan) {
    // The backend stores the user's description in loan.purpose
    // and the auto-generated "Genre: X | Location: Y" in project_description
    var desc = loan.purpose || loan.description || '';
    if (desc) return desc;
    // fallback: if project_description is NOT the auto-generated string, use it
    var pd = loan.project_description || '';
    if (/^Genre:/i.test(pd)) return '';
    return pd;
}

// Build HTML for multiple genre pills with "see more" if > 2
function _buildGenrePills(loan) {
    var genres = _parseGenres(loan);
    if (!genres.length || (genres.length === 1 && genres[0] === 'Unspecified')) {
        return '<span class="genre-pill-sm">Unspecified</span>';
    }
    var pillStyle = 'display:inline-block;font-size:0.7rem;padding:0.12rem 0.5rem;background:var(--bg-input);border-radius:0.5rem;border:1px solid var(--border);margin:0.1rem 0.1rem 0;white-space:nowrap';
    if (genres.length <= 2) {
        return genres.map(function (g) { return '<span style="' + pillStyle + '">' + g + '</span>'; }).join(' ');
    }
    // More than 2: show first 2 + a toggleable "see more"
    var uid = 'gpm_' + Math.random().toString(36).slice(2, 7);
    var visible = genres.slice(0, 2).map(function (g) { return '<span style="' + pillStyle + '">' + g + '</span>'; }).join(' ');
    var hidden = genres.slice(2).map(function (g) { return '<span style="' + pillStyle + '">' + g + '</span>'; }).join(' ');
    return visible +
        '<span id="' + uid + '_more" style="display:none">' + hidden + '</span>' +
        ' <a href="#" style="font-size:0.68rem;color:var(--gold);text-decoration:none;white-space:nowrap" ' +
        'onclick="event.stopPropagation();event.preventDefault();' +
        'var m=document.getElementById(\'' + uid + '_more\');' +
        'var show=m.style.display===\'none\';' +
        'm.style.display=show?\'inline\':\' none\';' +
        'this.textContent=show?\'see less\':\'+' + (genres.length - 2) + ' more\''
        + '">' + '+' + (genres.length - 2) + ' more</a>';
}

// Build expandable description cell
function _buildDescCell(loan) {
    var raw = _parseDesc(loan);
    if (!raw) return '<span style="color:var(--text-dim);font-size:0.78rem">--</span>';
    var safe = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    if (raw.length <= 90) {
        return '<span style="color:var(--text-dim);font-size:0.78rem">' + safe + '</span>';
    }
    var uid = 'dsc_' + Math.random().toString(36).slice(2, 7);
    var shortSafe = safe.substring(0, 90);
    return '<span style="color:var(--text-dim);font-size:0.78rem">' +
        '<span id="' + uid + '_s">' + shortSafe + '…</span>' +
        '<span id="' + uid + '_f" style="display:none">' + safe + '</span>' +
        ' <a href="#" style="font-size:0.7rem;color:var(--gold);text-decoration:none" ' +
        'onclick="event.stopPropagation();event.preventDefault();' +
        'var s=document.getElementById(\'' + uid + '_s\');' +
        'var f=document.getElementById(\'' + uid + '_f\');' +
        'var show=f.style.display===\'none\';' +
        'f.style.display=show?\'inline\':\' none\';' +
        's.style.display=show?\'none\':\' inline\';' +
        'this.textContent=show?\'see less\':\' see more\'' +
        '">see more</a></span>';
}

function renderProjectsTable(loans) {
    _allLoansForFilter = loans || [];
    var genreSelect = document.getElementById('genreFilter');
    if (genreSelect) {
        // Collect all unique genres across all loans
        var allGenres = [];
        (loans || []).forEach(function (l) {
            _parseGenres(l).forEach(function (g) {
                if (g && g !== 'Unspecified' && allGenres.indexOf(g) === -1) allGenres.push(g);
            });
        });
        allGenres.sort();
        genreSelect.innerHTML = '<option value="">All Genres</option>' +
            allGenres.map(function (g) { return '<option value="' + g + '">' + g + '</option>'; }).join('');
    }
    filterProjectsByGenre();
}

function filterProjectsByGenre() {
    var genre = (document.getElementById('genreFilter') ? document.getElementById('genreFilter').value : '') || '';
    var loans = genre
        ? _allLoansForFilter.filter(function (l) { return _parseGenres(l).indexOf(genre) !== -1; })
        : _allLoansForFilter;
    var tbody = document.getElementById('loansTableBody');
    var cntEl = document.getElementById('genreProjectCount');
    if (cntEl) cntEl.textContent = loans.length + ' project' + (loans.length !== 1 ? 's' : '');
    if (!tbody) return;
    if (!loans.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No projects found.</td></tr>';
        return;
    }
    tbody.innerHTML = loans.map(function (loan) {
        var status = (loan.status || 'pending').toLowerCase();
        var isOverdue = loan.is_overdue || false;
        var badgeClass = isOverdue ? 'badge-overdue' : 'badge-' + status;
        var badgeText = isOverdue ? 'OVERDUE' : status.toUpperCase();
        var applied = loan.created_at ? new Date(loan.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '--';
        var rejNote = (status === 'rejected' && loan.admin_notes)
            ? '<div style="font-size:.68rem;color:var(--error);margin-top:.2rem"><i class="fas fa-circle-exclamation"></i> ' + loan.admin_notes + '</div>'
            : '';
        return '<tr>'
            + '<td><strong>' + (loan.project_title || '--') + '</strong>' + rejNote + '</td>'
            + '<td style="white-space:nowrap">' + _buildGenrePills(loan) + '</td>'
            + '<td>' + _buildDescCell(loan) + '</td>'
            + '<td style="color:var(--text-dim);font-size:0.8rem;white-space:nowrap">' + applied + '</td>'
            + '<td><span class="badge ' + badgeClass + '">' + badgeText + '</span></td>'
            + '</tr>';
    }).join('');
}

// ══════════════════════════════════════════════════════════════
// FIX: Resources section — only count disbursed/completed loans
// ══════════════════════════════════════════════════════════════
function populateResources() {
    var loans = currentLoans || [];
    var ts = (currentUser && currentUser.trust_score) || 0;
    var rate = ts >= 80 ? '10%' : '15%';

    var rateEl = document.getElementById('resRate');
    if (rateEl) rateEl.textContent = rate + ' p.a.';

    // FIX: total borrowed = only loans that were actually disbursed or completed
    var disbursedLoans = loans.filter(function (l) {
        return l.status === 'disbursed' || l.status === 'completed';
    });
    var totalBorrowed = disbursedLoans.reduce(function (s, l) { return s + Number(l.amount || 0); }, 0);

    // Balance = remaining on active (disbursed) loans only
    var outstanding = loans.filter(function (l) {
        return l.status === 'disbursed';
    }).reduce(function (s, l) { return s + Number(l.remaining_amount || 0); }, 0);

    var tbEl = document.getElementById('resTotalBorrowed');
    if (tbEl) tbEl.textContent = '₱' + totalBorrowed.toLocaleString(undefined, { minimumFractionDigits: 2 });
    var osEl = document.getElementById('resOutstanding');
    if (osEl) osEl.textContent = '₱' + outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 });

    // Total repaid — from the transaction history cache
    var repaidEl = document.getElementById('totalRepaid');
    var repaidVal = repaidEl ? repaidEl.textContent : '₱0.00';
    var resRepEl = document.getElementById('resRepaid');
    if (resRepEl) resRepEl.textContent = repaidVal;

    var activeCount = loans.filter(function (l) { return l.status === 'disbursed'; }).length;
    var acEl = document.getElementById('resActiveCount');
    if (acEl) acEl.textContent = activeCount + ' active loan(s)';

    var ltb = document.getElementById('resLoansTable');
    if (ltb) {
        if (!loans.length) {
            ltb.innerHTML = '<tr><td colspan="9" class="empty-row">No loans found.</td></tr>';
        } else {
            ltb.innerHTML = loans.map(function (l) {
                var st = (l.status || 'pending').toLowerCase();
                // FIX: only show real amounts for disbursed/completed loans
                var isDisbursed = st === 'disbursed' || st === 'completed';
                var amt = isDisbursed ? Number(l.amount || 0) : 0;
                var rem = isDisbursed ? Number(l.remaining_amount || 0) : 0;
                var paid = isDisbursed ? (amt - rem) : 0;
                var due = l.next_payment_due
                    ? new Date(l.next_payment_due).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '--';
                return '<tr>'
                    + '<td><strong>' + (l.project_title || '--') + '</strong></td>'
                    + '<td>' + (isDisbursed ? '₱' + amt.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '<span style="color:var(--text-dim)">--</span>') + '</td>'
                    + '<td>' + (l.disbursement_date ? new Date(l.disbursement_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '--') + '</td>'
                    + '<td style="color:var(--error)">' + (isDisbursed ? '₱' + rem.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '<span style="color:var(--text-dim)">--</span>') + '</td>'
                    + '<td style="color:var(--success)">' + (isDisbursed ? '₱' + paid.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '<span style="color:var(--text-dim)">₱0.00</span>') + '</td>'
                    + '<td style="color:var(--gold);font-weight:700">' + rate + ' p.a.</td>'
                    + '<td style="color:var(--text-dim)">' + (l.duration_months || '--') + ' mo.</td>'
                    + '<td style="color:var(--text-dim)">' + due + '</td>'
                    + '<td><span class="badge badge-' + st + '">' + st.toUpperCase() + '</span></td>'
                    + '</tr>';
            }).join('');
        }
    }

    var rptb = document.getElementById('resRepaymentsTable');
    if (rptb && window._allTxCache) {
        var repayments = (window._allTxCache || []).filter(function (t) {
            return (t.transaction_type || '').includes('repayment');
        }).slice(0, 10);
        if (!repayments.length) {
            rptb.innerHTML = '<tr><td colspan="5" class="empty-row">No repayments yet.</td></tr>';
        } else {
            rptb.innerHTML = repayments.map(function (tx) {
                var date = tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '--';
                var method = tx._loanMethod || tx.payment_method || '--';
                var pm = (typeof PH_METHODS !== 'undefined') ? PH_METHODS.find(function (p) { return p.key === method; }) : null;
                var ch = pm
                    ? '<span style="font-size:0.7rem;font-weight:700;padding:0.1rem 0.45rem;background:' + pm.bg + ';color:' + pm.color + ';border-radius:4px">' + pm.abbr + ' ' + pm.label + '</span>'
                    : '<span style="color:var(--text-dim)">' + method + '</span>';
                return '<tr>'
                    + '<td style="color:var(--text-dim)">' + date + '</td>'
                    + '<td>' + (tx._projectTitle || '--') + '</td>'
                    + '<td style="color:var(--success);font-weight:600">₱' + Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</td>'
                    + '<td>' + ch + '</td>'
                    + '<td style="color:var(--text-dim);font-family:monospace;font-size:0.75rem">' + (tx.reference_number || '--') + '</td>'
                    + '</tr>';
            }).join('');
        }
    }
}