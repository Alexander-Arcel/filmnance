// ============================================
// FILMNANCE — user-loan.js
// Loan application (2-step), repayment modal,
// payment delay request with proof upload.
// Depends on: user-core.js, user-dashboard.js
// ============================================

'use strict';

const LOAN_PURPOSES = [
    { value: 'Equipment Rental (Camera/Lights/Sound)', label: 'Equipment Rental', icon: 'fa-camera' },
    { value: 'Location Fees & Permits', label: 'Location & Permits', icon: 'fa-map-pin' },
    { value: 'Cast Salaries', label: 'Cast Salaries', icon: 'fa-star' },
    { value: 'Crew Salaries', label: 'Crew Salaries', icon: 'fa-people-group' },
    { value: 'Set Design & Props', label: 'Set & Props', icon: 'fa-palette' },
    { value: 'Wardrobe & Makeup', label: 'Wardrobe & Makeup', icon: 'fa-shirt' },
    { value: 'Catering & Food', label: 'Catering', icon: 'fa-utensils' },
    { value: 'Transportation & Gas', label: 'Transportation', icon: 'fa-van-shuttle' },
    { value: 'Editing & Color Grading', label: 'Editing & Color', icon: 'fa-film' },
    { value: 'Sound Design & Music Score', label: 'Sound & Music', icon: 'fa-music' },
    { value: 'Visual Effects (VFX/CGI)', label: 'VFX / CGI', icon: 'fa-wand-magic-sparkles' },
    { value: 'Insurance & Legal Fees', label: 'Insurance & Legal', icon: 'fa-shield-halved' },
    { value: 'Ads & Festival Fees', label: 'Marketing & Festivals', icon: 'fa-bullhorn' },
    { value: 'Other (Specify in Description)', label: 'Other', icon: 'fa-ellipsis' },
];

const PH_METHODS = [
    { key: 'gcash', label: 'GCash', abbr: 'G', color: '#0070E0', bg: '#E8F4FF', type: 'ewallet' },
    { key: 'maya', label: 'Maya', abbr: 'M', color: '#00A651', bg: '#E8F9EF', type: 'ewallet' },
    { key: 'bdo', label: 'BDO', abbr: 'BDO', color: '#003087', bg: '#E8EDF8', type: 'bank' },
    { key: 'bpi', label: 'BPI', abbr: 'BPI', color: '#CC0000', bg: '#FDEAEA', type: 'bank' },
    { key: 'unionbank', label: 'UnionBank', abbr: 'UB', color: '#E87722', bg: '#FEF3EA', type: 'bank' },
    { key: 'metrobank', label: 'Metrobank', abbr: 'MB', color: '#00478F', bg: '#E8EFF8', type: 'bank' },
    { key: 'landbank', label: 'Landbank', abbr: 'LB', color: '#006400', bg: '#E8F4E8', type: 'bank' },
    { key: 'pnb', label: 'PNB', abbr: 'PNB', color: '#003580', bg: '#E8EDF6', type: 'bank' },
    { key: 'rcbc', label: 'RCBC', abbr: 'RC', color: '#E30613', bg: '#FDEAEA', type: 'bank' },
    { key: 'coins', label: 'Coins.ph', abbr: '\u00a9', color: '#F9A825', bg: '#FEF8E8', type: 'ewallet' },
    { key: 'seabank', label: 'SeaBank', abbr: 'SB', color: '#EE4D2D', bg: '#FEECEA', type: 'bank' },
    { key: 'tonik', label: 'Tonik', abbr: 'T', color: '#7B2FBE', bg: '#F3E8FE', type: 'bank' },
    { key: 'cimb', label: 'CIMB', abbr: 'CB', color: '#E4003B', bg: '#FDE8ED', type: 'bank' },
    { key: 'instapay', label: 'InstaPay', abbr: 'IP', color: '#00838F', bg: '#E8F6F7', type: 'ewallet' },
    { key: 'pesonet', label: 'PESONet', abbr: 'PN', color: '#1565C0', bg: '#E8EFF8', type: 'bank' },
];

let _mockPaymentMethods = [];
let selectedPurposes = [];
let selectedPhase = '';
const _loanAssetFiles = { Script: null, Lookbook: null, Trailer: null };

function syncDuration() {
    var yEl = document.getElementById('loanDurationYears');
    var mEl2 = document.getElementById('loanDurationMonths');
    var y = parseInt(yEl ? yEl.value : 1) || 1;
    var m = parseInt(mEl2 ? mEl2.value : 0) || 0;
    if (y < 1) { y = 1; if (yEl) yEl.value = 1; }
    if (y > 3) { y = 3; if (yEl) yEl.value = 3; }
    if (m < 0) { m = 0; if (mEl2) mEl2.value = 0; }
    if (m > 11) { m = 11; if (mEl2) mEl2.value = 11; }
    var total = (y * 12) + m;
    var hid = document.getElementById('loanDuration');
    if (hid) hid.value = total > 0 ? total : '';
    liveCalculate();
}

function togglePhaseDropdown() {
    var panel = document.getElementById('phaseDropdownPanel');
    var chevron = document.getElementById('phaseChevron');
    if (!panel) return;
    var isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
    if (!isOpen) {
        setTimeout(function () {
            document.addEventListener('click', function _ph(e) {
                var t = document.getElementById('phaseDropdownTrigger');
                var p = document.getElementById('phaseDropdownPanel');
                if (!p) { document.removeEventListener('click', _ph, true); return; }
                if (!p.contains(e.target) && (!t || !t.contains(e.target))) {
                    p.style.display = 'none';
                    var ch = document.getElementById('phaseChevron');
                    if (ch) ch.style.transform = '';
                    document.removeEventListener('click', _ph, true);
                }
            }, true);
        }, 0);
    }
}

function selectPhase(el, value) {
    document.querySelectorAll('.phase-radio-circle').forEach(function (ci) { ci.classList.remove('selected'); });
    document.querySelectorAll('.phase-radio-item').forEach(function (ri) { ri.classList.remove('selected'); });
    var circle = el.querySelector('.phase-radio-circle');
    if (circle) circle.classList.add('selected');
    el.classList.add('selected');
    selectedPhase = value;
    var lbl = document.getElementById('phaseDropdownLabel');
    if (lbl) { lbl.textContent = value; lbl.style.color = 'var(--text)'; }
    var panel = document.getElementById('phaseDropdownPanel');
    if (panel) panel.style.display = 'none';
    var ch = document.getElementById('phaseChevron');
    if (ch) ch.style.transform = '';
}

function toggleGenreDropdown(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    var panel = document.getElementById('genreDropdownPanel');
    var chevron = document.getElementById('genreChevron');
    if (!panel) return;
    var isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
    if (!isOpen) {
        setTimeout(function () {
            document.addEventListener('click', function _gd(e2) {
                var t = document.getElementById('genreDropdownTrigger');
                var p = document.getElementById('genreDropdownPanel');
                if (!p) { document.removeEventListener('click', _gd, true); return; }
                if (!p.contains(e2.target) && (!t || !t.contains(e2.target))) {
                    p.style.display = 'none';
                    var ch = document.getElementById('genreChevron');
                    if (ch) ch.style.transform = '';
                    document.removeEventListener('click', _gd, true);
                }
            }, true);
        }, 0);
    }
}

function updateGenreDisplay() {
    var checked = Array.from(document.querySelectorAll('#genreDropdownPanel input[type="checkbox"]:checked')).map(function (i) { return i.value; });
    var hidden = document.getElementById('loanGenre');
    var trigger = document.getElementById('genreTriggerLabel');
    if (hidden) hidden.value = checked.join(', ');
    if (trigger) {
        trigger.textContent = checked.length ? 'Selected: ' + checked.join(', ') : 'Click to select genres…';
        trigger.style.color = checked.length ? 'var(--text)' : 'var(--text-dim)';
    }
}

function _showLoanValidationCard(errors) {
    var ex = document.getElementById('_loanValCard');
    if (ex) ex.remove();
    var overlay = document.createElement('div');
    overlay.id = '_loanValCard';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);padding:1rem';
    var rows = errors.map(function (e) {
        return '<div style="display:flex;align-items:flex-start;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
            '<i class="fas ' + e.icon + '" style="color:#f59e0b;margin-top:0.15rem;flex-shrink:0;width:14px"></i>' +
            '<span style="font-size:0.82rem;color:var(--text)">' + e.msg + '</span></div>';
    }).join('');
    var _closeBtn = '<button onclick="var ov=document.getElementById(\'_loanValCard\');if(ov)ov.remove();" style="width:100%;margin-top:1rem;padding:0.75rem;background:var(--gold);border:none;border-radius:var(--r);color:#000;font-weight:700;font-size:0.88rem;cursor:pointer;font-family:var(--font-h)">Got it, fix these</button>';
    overlay.innerHTML =
        '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:1.25rem;max-width:400px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,0.6);overflow:hidden">' +
        '<div style="background:rgba(239,68,68,0.1);border-bottom:1px solid rgba(239,68,68,0.2);padding:1.25rem;text-align:center">' +
        '<div style="font-size:1.8rem;margin-bottom:0.3rem">⚠️</div>' +
        '<div style="font-size:0.95rem;font-weight:800;color:#ef4444;font-family:var(--font-h)">Please Complete All Fields</div>' +
        '<div style="font-size:0.75rem;color:var(--text-dim);margin-top:0.2rem">Fix the items below before submitting</div>' +
        '</div>' +
        '<div style="padding:1rem 1.25rem">' + rows + _closeBtn +
        '</div></div>';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
}

function pmLogo(method, size) {
    size = size || 40;
    const m = PH_METHODS.find(function (p) { return p.key === method; }) || { abbr: (method || '?').toUpperCase().substring(0, 2), color: 'var(--gold)', bg: 'var(--gold-dim)' };
    return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:' + Math.round(size / 4) + 'px;background:' + m.bg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:800;font-size:' + (size > 36 ? '0.78rem' : '0.65rem') + ';color:' + m.color + ';letter-spacing:-0.02em;border:1px solid ' + m.color + '33">' + m.abbr + '</div>';
}

function initPurposeGrid() {
    const grid = document.getElementById('purposeGrid');
    if (!grid) return;
    grid.innerHTML = LOAN_PURPOSES.map(function (p) {
        return '<div class="purpose-chip" onclick="togglePurpose(this,\'' + p.value + '\')">' +
            '<i class="fas ' + p.icon + '"></i><span>' + p.label + '</span>' +
            '</div>';
    }).join('');
    selectedPhase = '';
    selectedPurposes = [];
    var pLbl = document.getElementById('phaseDropdownLabel');
    if (pLbl) { pLbl.textContent = 'Select production phase…'; pLbl.style.color = 'var(--text-dim)'; }
    document.querySelectorAll('.phase-radio-circle').forEach(function (ci) { ci.classList.remove('selected'); });
    document.querySelectorAll('.phase-radio-item').forEach(function (ri) { ri.classList.remove('selected'); });
    var gLbl = document.getElementById('genreTriggerLabel');
    if (gLbl) { gLbl.textContent = 'Click to select genres…'; gLbl.style.color = 'var(--text-dim)'; }
    document.querySelectorAll('#genreDropdownPanel input[type="checkbox"]').forEach(function (cb) { cb.checked = false; });
    var lgEl = document.getElementById('loanGenre'); if (lgEl) lgEl.value = '';
    var dyEl = document.getElementById('loanDurationYears'); if (dyEl) dyEl.value = '';
    var dmEl = document.getElementById('loanDurationMonths'); if (dmEl) dmEl.value = '';
    var dhEl = document.getElementById('loanDuration'); if (dhEl) dhEl.value = '';
    var ppEl = document.getElementById('phaseDropdownPanel'); if (ppEl) ppEl.style.display = 'none';
    var gpEl = document.getElementById('genreDropdownPanel'); if (gpEl) gpEl.style.display = 'none';
}

function togglePurpose(el, value) {
    el.classList.toggle('selected');
    if (el.classList.contains('selected')) selectedPurposes.push(value);
    else selectedPurposes = selectedPurposes.filter(function (v) { return v !== value; });
}

function proceedToLoanStep2() {
    if (!selectedPhase) { setModalMsg('loanStep1Msg', 'Please select a film production phase first.', 'error'); return; }
    if (selectedPurposes.length === 0) { setModalMsg('loanStep1Msg', 'Select at least one budget category.', 'error'); return; }
    setModalMsg('loanStep1Msg', '');
    document.getElementById('loanStep1').style.display = 'none';
    document.getElementById('loanStep2').style.display = 'block';
    document.getElementById('loanStepDot1').classList.add('done');
    document.getElementById('loanStepDot1').classList.remove('active');
    document.getElementById('loanStepDot2').classList.add('active');
    var _l1 = document.getElementById('loanStepLine1') || document.getElementById('loanStepLine');
    if (_l1) _l1.style.background = 'linear-gradient(90deg,var(--success),var(--gold))';
    loadDisbursementOptions();
}

function backToLoanStep1() {
    document.getElementById('loanStep2').style.display = 'none';
    document.getElementById('loanStep1').style.display = 'block';
    document.getElementById('loanStepDot1').classList.remove('done');
    document.getElementById('loanStepDot1').classList.add('active');
    document.getElementById('loanStepDot2').classList.remove('active');
    var l1 = document.getElementById('loanStepLine1') || document.getElementById('loanStepLine');
    if (l1) l1.style.background = '';
}

// Resets the loan application form back to a clean Step 1 state. Used when
// the embedded (full-screen, sidebar-entry) version is "closed" — there's
// no overlay to dismiss, so we just reset the form in place instead.
window.resetLoanModalSteps = function () {
    ['loanStep1', 'loanStep2', 'loanStep3'].forEach(function (id, i) {
        var el = document.getElementById(id);
        if (el) el.style.display = i === 0 ? 'block' : 'none';
    });
    [1, 2, 3].forEach(function (n) {
        var dot = document.getElementById('loanStepDot' + n);
        if (!dot) return;
        dot.classList.remove('done', 'active');
        if (n === 1) dot.classList.add('active');
    });
    ['loanStepLine1', 'loanStepLine2'].forEach(function (id) {
        var l = document.getElementById(id); if (l) l.style.background = '';
    });
    if (typeof selectedPhase !== 'undefined') selectedPhase = null;
    if (typeof selectedPurposes !== 'undefined') selectedPurposes = [];
    document.querySelectorAll('.phase-radio-item.selected').forEach(function (e) { e.classList.remove('selected'); });
    document.querySelectorAll('.purpose-chip.selected').forEach(function (e) { e.classList.remove('selected'); });
    var lbl = document.getElementById('phaseDropdownLabel');
    if (lbl) { lbl.textContent = 'Select production phase…'; lbl.style.color = 'var(--text-dim)'; }
    setModalMsg('loanStep1Msg', '');
};

function proceedToLoanStep3() {
    const title = document.getElementById('loanProjectTitle') && document.getElementById('loanProjectTitle').value.trim();
    const lookbook = document.getElementById('loanLookbookUrl') && document.getElementById('loanLookbookUrl').value.trim();
    const lookbookFile = _loanAssetFiles['Lookbook'];
    if (!title) { setModalMsg('loanStep2Msg', 'Project title is required.', 'error'); return; }
    if (!lookbook && !lookbookFile) { setModalMsg('loanStep2Msg', 'Lookbook is required \u2014 enter a URL or upload a file.', 'error'); return; }
    setModalMsg('loanStep2Msg', '');
    document.getElementById('loanStep2').style.display = 'none';
    document.getElementById('loanStep3').style.display = 'block';
    const dot2 = document.getElementById('loanStepDot2');
    const dot3 = document.getElementById('loanStepDot3');
    const line2 = document.getElementById('loanStepLine2');
    if (dot2) { dot2.classList.add('done'); dot2.classList.remove('active'); }
    if (dot3) { dot3.classList.add('active'); }
    if (line2) line2.style.background = 'linear-gradient(90deg,var(--success),var(--gold))';
    loadDisbursementOptions();
}

function backToLoanStep2() {
    document.getElementById('loanStep3').style.display = 'none';
    document.getElementById('loanStep2').style.display = 'block';
    const dot2 = document.getElementById('loanStepDot2');
    const dot3 = document.getElementById('loanStepDot3');
    const line2 = document.getElementById('loanStepLine2');
    if (dot2) { dot2.classList.remove('done'); dot2.classList.add('active'); }
    if (dot3) { dot3.classList.remove('active'); }
    if (line2) line2.style.background = '';
}

/* toggleGenreDropdown and updateGenreDisplay defined above */

function watchAssetUrls() {
    [['loanScriptUrl', 'dlScript'], ['loanLookbookUrl', 'dlLookbook'], ['loanTrailerUrl', 'dlTrailer']].forEach(function (pair) {
        const input = document.getElementById(pair[0]);
        const btn = document.getElementById(pair[1]);
        if (!input || !btn) return;
        input.addEventListener('input', function () {
            const url = input.value.trim();
            if (url) { btn.href = url; btn.style.display = 'flex'; }
            else { btn.style.display = 'none'; }
        });
    });
}

function handleLoanAssetFile(type, input) {
    const file = input.files[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isLookbookFile = type === 'Lookbook';
    const maxBytes = isVideo ? 200 * 1024 * 1024 : isLookbookFile ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
    const maxLabel = isVideo ? '200MB' : isLookbookFile ? '100MB' : '20MB';
    const nameElId = type === 'Script' ? 'loanScriptFileName' : type.toLowerCase() + 'FileName';
    const nameEl = document.getElementById(nameElId);
    if (file.size > maxBytes) {
        if (nameEl) {
            nameEl.textContent = '\u2717 Too large (max ' + maxLabel + '): ' + (file.size / (1024 * 1024)).toFixed(1) + 'MB';
            nameEl.style.color = 'var(--error)';
            nameEl.style.display = 'block';
        }
        input.value = '';
        _loanAssetFiles[type] = null;
        return;
    }
    _loanAssetFiles[type] = file;
    if (nameEl) {
        nameEl.textContent = '\u2713 ' + file.name + ' (' + (file.size / (1024 * 1024)).toFixed(1) + 'MB)';
        nameEl.style.color = 'var(--gold)';
        nameEl.style.display = 'block';
    }
    const urlField = document.getElementById('loan' + type + 'Url');
    if (urlField) urlField.value = '';
    const dlBtn = document.getElementById('dl' + type);
    if (dlBtn) dlBtn.style.display = 'none';
}

window.showPinAndSubmit = function () {
    const lookbook = document.getElementById('loanLookbookUrl') && document.getElementById('loanLookbookUrl').value.trim();
    const lookbookFile = _loanAssetFiles['Lookbook'];
    const title = document.getElementById('loanProjectTitle') && document.getElementById('loanProjectTitle').value.trim();
    const amount = document.getElementById('loanAmount') && document.getElementById('loanAmount').value;
    const duration = document.getElementById('loanDuration') && document.getElementById('loanDuration').value;
    const disbMethod = document.getElementById('loanDisbMethod') && document.getElementById('loanDisbMethod').value;
    const disbAccount = document.getElementById('loanDisbAccount') && document.getElementById('loanDisbAccount').value.trim();

    // Loan gate: only is_verified (KYC approved by admin) allows loans.
    const isKycVerified = currentUser && currentUser.is_verified === true;
    // kycPending = user has BOTH KYC photos AND those fields in pending_changes
    // Saving EC ID photo (emergency_contact_id_url) must NOT trigger this
    const _kycPendingFields = ['id_photo_url', 'selfie_photo_url', 'id_type', 'id_expiry_date'];
    const _kycInPending = !!(currentUser && currentUser.pending_changes &&
        _kycPendingFields.some(function (f) { return currentUser.pending_changes[f] !== undefined; }));
    const kycPending = !!(currentUser && currentUser.id_photo_url && currentUser.selfie_photo_url && _kycInPending);

    if (!isKycVerified) {
        const isPending = kycPending;
        const existing = document.getElementById('kycGateOverlay');
        if (existing) existing.remove();

        const gate = document.createElement('div');
        gate.id = 'kycGateOverlay';
        gate.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);padding:1rem';

        const headerBg = isPending ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.1)';
        const headerBdr = isPending ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.2)';
        const headerIcon = isPending ? '\u23f3' : '\ud83d\udd12';
        const headerColor = isPending ? '#f59e0b' : '#ef4444';
        const headerTitle = isPending ? 'Identity Verification Pending' : 'Identity Verification Required';
        const bodyText = isPending
            ? "Your KYC documents are under review. You'll be able to apply once your identity is verified."
            : 'To apply for a film loan, you need to complete identity verification (KYC) first.';

        let checklistHtml = '';
        if (!isPending) {
            const idOk = currentUser && currentUser.id_photo_url ? '\u2705' : '\u2b1c';
            const selfieOk = currentUser && currentUser.selfie_photo_url ? '\u2705' : '\u2b1c';
            const typeOk = currentUser && currentUser.id_type ? '\u2705' : '\u2b1c';
            checklistHtml = '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:0.9rem;margin-bottom:1rem;font-size:0.8rem;color:var(--text-dim);line-height:1.7">' +
                '<strong style="color:var(--text);display:block;margin-bottom:0.35rem">What you need to complete:</strong>' +
                '<div>' + idOk + ' Upload a valid Philippine ID photo</div>' +
                '<div>' + selfieOk + ' Upload a selfie with your ID</div>' +
                '<div>' + typeOk + ' Select your ID type</div>' +
                '</div>';
        }

        const actionBtn = isPending
            ? '<button onclick="document.getElementById(\'kycGateOverlay\').remove()" class="btn-gold" style="flex:2;padding:0.75rem;font-size:0.85rem"><i class="fas fa-clock"></i> OK, I\'ll Wait</button>'
            : '<button onclick="document.getElementById(\'kycGateOverlay\').remove();closeModal(\'loanModal\');_openKycDirectly();" class="btn-gold" style="flex:2;padding:0.75rem;font-size:0.85rem"><i class="fas fa-id-card"></i> Complete KYC Now</button>';

        gate.innerHTML =
            '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:1.25rem;max-width:420px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,0.6);overflow:hidden">' +
            '<div style="background:' + headerBg + ';border-bottom:1px solid ' + headerBdr + ';padding:1.5rem;text-align:center">' +
            '<div style="font-size:2.5rem;margin-bottom:0.5rem">' + headerIcon + '</div>' +
            '<div style="font-size:1rem;font-weight:800;color:' + headerColor + ';font-family:var(--font-h)">' + headerTitle + '</div>' +
            '</div>' +
            '<div style="padding:1.5rem">' +
            '<p style="font-size:0.88rem;color:var(--text);line-height:1.6;margin:0 0 1rem">' + bodyText + '</p>' +
            checklistHtml +
            '<div style="display:flex;gap:0.6rem">' +
            '<button onclick="document.getElementById(\'kycGateOverlay\').remove()" style="flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600">Cancel</button>' +
            actionBtn +
            '</div>' +
            '</div>' +
            '</div>';

        document.body.appendChild(gate);
        return;
    }

    var _fieldErrors = [];
    if (!title) _fieldErrors.push({ icon: 'fa-pen', msg: 'Project title is required (Step 2)' });
    if (!amount || parseFloat(amount) <= 0) _fieldErrors.push({ icon: 'fa-peso-sign', msg: 'Enter a valid loan amount (Step 3)' });
    if (!duration || parseInt(duration) < 1) _fieldErrors.push({ icon: 'fa-calendar', msg: 'Enter a valid duration in years / months (Step 3)' });
    if (!lookbook && !lookbookFile) _fieldErrors.push({ icon: 'fa-images', msg: 'Lookbook is required — upload a file or paste a URL (Step 2)' });
    if (!disbMethod) _fieldErrors.push({ icon: 'fa-wallet', msg: 'Select a disbursement account to receive funds (Step 3)' });
    if (_fieldErrors.length > 0) { _showLoanValidationCard(_fieldErrors); return; }
    setModalMsg('loanStep2Msg', '');
    showLoanReviewOverlay({ title: title, amount: amount, duration: duration, disbMethod: disbMethod, disbAccount: disbAccount, lookbook: lookbook, lookbookFile: lookbookFile });
}

window.showLoanReviewOverlay = function (opts) {
    const title = opts.title, amount = opts.amount, duration = opts.duration;
    const disbMethod = opts.disbMethod, disbAccount = opts.disbAccount;
    const lookbook = opts.lookbook, lookbookFile = opts.lookbookFile;

    const existing = document.getElementById('loanReviewOverlay');
    if (existing) existing.remove();

    const trustScore = currentUser && currentUser.trust_score ? currentUser.trust_score : 0;
    const rate = trustScore >= 80 ? 0.10 : 0.15;
    const ratePct = trustScore >= 80 ? '10%' : '15%';
    const total = parseFloat(amount) + (parseFloat(amount) * rate);
    const monthly = total / parseInt(duration);
    const genre = (document.getElementById('loanGenre') && document.getElementById('loanGenre').value) || '--';
    const desc = (document.getElementById('loanDescription') && document.getElementById('loanDescription').value.trim()) || '--';
    const purposes = selectedPurposes.length ? selectedPurposes.join(', ') : '--';
    const pm = PH_METHODS.find(function (p) { return p.key === disbMethod; }) || { label: disbMethod, abbr: '?', color: 'var(--gold)', bg: 'var(--gold-dim)' };
    const lookbookDisplay = lookbook || (lookbookFile ? '\u2713 ' + lookbookFile.name : '--');
    const scriptUrl = (document.getElementById('loanScriptUrl') && document.getElementById('loanScriptUrl').value.trim()) || (_loanAssetFiles['Script'] && _loanAssetFiles['Script'].name ? '\u2713 ' + _loanAssetFiles['Script'].name : '--');
    const trailerUrl = (document.getElementById('loanTrailerUrl') && document.getElementById('loanTrailerUrl').value.trim()) || (_loanAssetFiles['Trailer'] && _loanAssetFiles['Trailer'].name ? '\u2713 ' + _loanAssetFiles['Trailer'].name : '--');

    const overlay = document.createElement('div');
    overlay.id = 'loanReviewOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);padding:1rem';
    overlay.innerHTML =
        '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:1.25rem;max-width:620px;width:100%;max-height:95vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,0.6)">' +
        '<div style="background:var(--gold-dim);border-bottom:1px solid var(--gold-bdr);padding:1.5rem;text-align:center;border-radius:1.25rem 1.25rem 0 0">' +
        '<div style="display:flex;align-items:center;justify-content:center;gap:0.5rem;margin-bottom:0.4rem"><div style="width:26px;height:26px;background:var(--gold);border-radius:6px;display:flex;align-items:center;justify-content:center"><i class="fas fa-clapperboard" style="color:#000;font-size:0.72rem"></i></div><span style="font-family:var(--font-h);font-size:1.1rem;font-weight:900;color:var(--gold);letter-spacing:0.06em">FILMNANCE</span></div>' +
        '<div style="font-family:var(--font-h);font-size:1.1rem;font-weight:800;color:var(--gold)">Application Review</div>' +
        '<div style="font-size:0.72rem;color:var(--text-dim);margin-top:0.2rem">Please review your details before submitting</div>' +
        '</div>' +
        '<div style="padding:1.25rem;display:flex;flex-direction:column;gap:0">' +
        _receiptRow('Project Title', title) +
        _receiptRow('Genre', genre) +
        _receiptRow('Budget Categories', purposes, true) +
        _receiptRow('Description', desc.substring(0, 80) + (desc.length > 80 ? '...' : '')) +
        '<div style="border-top:1px dashed var(--border);margin:0.5rem 0"></div>' +
        _receiptRow('Loan Amount', '\u20b1' + parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })) +
        _receiptRow('Duration', duration + ' months') +
        _receiptRow('Interest Rate', ratePct, false, 'var(--gold)') +
        _receiptRow('Total to Repay', '\u20b1' + total.toLocaleString(undefined, { minimumFractionDigits: 2 }), false, 'var(--text)') +
        _receiptRow('Monthly Payment', '\u20b1' + monthly.toLocaleString(undefined, { minimumFractionDigits: 2 }), false, 'var(--success)') +
        '<div style="border-top:1px dashed var(--border);margin:0.5rem 0"></div>' +
        _receiptRow('Script', scriptUrl) +
        _receiptRow('Lookbook', lookbookDisplay) +
        _receiptRow('Trailer', trailerUrl) +
        '<div style="border-top:1px dashed var(--border);margin:0.5rem 0"></div>' +
        _receiptRow('Disbursement', pm.label + ' \u2014 ' + (disbAccount || '\u2014')) +
        '</div>' +
        '<div style="padding:1.25rem;border-top:1px solid var(--border);background:var(--bg-input);border-radius:0 0 1.25rem 1.25rem;text-align:center">' +
        '<div style="font-size:0.78rem;font-weight:700;color:var(--text-dim);margin-bottom:0.75rem;text-transform:uppercase;letter-spacing:0.08em">' +
        '<i class="fas fa-lock" style="margin-right:0.35rem;color:var(--gold)"></i>Enter Transaction PIN to Confirm' +
        '</div>' +
        '<input type="password" id="loanTxPin" maxlength="6" inputmode="numeric" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="one-time-code" name="loan-tx-pin"' +
        '    style="background:var(--bg-card);border:2px solid var(--gold-bdr);border-radius:var(--r);color:var(--text);padding:0.7rem 1rem;font-size:1.3rem;text-align:center;width:160px;letter-spacing:0.3em;display:block;margin:0 auto 1rem"' +
        '    onkeydown="if(event.key===\'Enter\')submitLoanApplication()">' +
        '<p class="modal-msg" id="loanOverlayMsg" style="min-height:1rem;margin-bottom:0.75rem"></p>' +
        '<div style="display:flex;gap:0.6rem">' +
        '<button onclick="document.getElementById(\'loanReviewOverlay\').remove()" style="flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600">' +
        '<i class="fas fa-arrow-left"></i> Edit' +
        '</button>' +
        '<button onclick="submitLoanApplication()" class="btn-gold" style="flex:2;padding:0.75rem;font-size:0.88rem">' +
        '<i class="fas fa-paper-plane"></i> Submit Application' +
        '</button>' +
        '</div>' +
        '</div>' +
        '</div>';
    document.body.appendChild(overlay);
    setTimeout(function () {
        const pin = overlay.querySelector('#loanTxPin');
        if (pin) pin.focus();
    }, 100);
}

function _receiptRow(label, value, multiline, valueColor) {
    multiline = multiline || false;
    valueColor = valueColor || 'var(--text)';
    return '<div style="display:flex;' + (multiline ? 'flex-direction:column;gap:0.2rem' : 'align-items:flex-start;justify-content:space-between') + ';padding:0.45rem 0;border-bottom:1px solid rgba(255,255,255,0.04)">' +
        '<span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);flex-shrink:0' + (multiline ? '' : ';margin-right:0.75rem') + '">' + label + '</span>' +
        '<span style="font-size:0.82rem;font-weight:600;color:' + valueColor + ';' + (multiline ? '' : 'text-align:right;max-width:65%') + '">' + (value || '--') + '</span>' +
        '</div>';
}

function showLoanSuccessPopup(title, amount) {
    const existing = document.getElementById('loanSuccessOverlay');
    if (existing) existing.remove();
    if (!document.getElementById('_filmAnimStyles')) {
        const st = document.createElement('style');
        st.id = '_filmAnimStyles';
        st.textContent = '@keyframes _lsPopUp{from{transform:scale(0.82);opacity:0}to{transform:scale(1);opacity:1}}@keyframes _lsBounce{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}';
        document.head.appendChild(st);
    }
    const overlay = document.createElement('div');
    overlay.id = 'loanSuccessOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.82);backdrop-filter:blur(6px);padding:1rem';
    overlay.innerHTML =
        '<div style="background:var(--bg-card);border:1px solid rgba(34,197,94,0.3);border-radius:1.5rem;max-width:420px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.7);overflow:hidden;animation:_lsPopUp 0.38s cubic-bezier(0.34,1.56,0.64,1)">' +
        '<div style="background:linear-gradient(135deg,rgba(34,197,94,0.15),rgba(22,163,74,0.08));border-bottom:1px solid rgba(34,197,94,0.18);padding:2rem 1.5rem 1.5rem;text-align:center">' +
        '<div style="width:72px;height:72px;border-radius:50%;background:rgba(34,197,94,0.12);border:2px solid rgba(34,197,94,0.35);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;font-size:2.2rem;animation:_lsBounce 0.6s 0.3s ease both">\ud83c\udfac</div>' +
        '<div style="font-family:var(--font-h);font-size:1.3rem;font-weight:900;color:#22c55e;margin-bottom:0.3rem">Application Submitted!</div>' +
        '<div style="font-size:0.82rem;color:var(--text-dim)">Your loan application is now under review</div>' +
        '</div>' +
        '<div style="padding:1.5rem">' +
        '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:0.75rem;padding:1rem;margin-bottom:1.25rem">' +
        '<div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:0.3rem">Project</div>' +
        '<div style="font-size:0.95rem;font-weight:700;color:var(--text)">' + (title || '\u2014') + '</div>' +
        '<div style="font-size:0.82rem;color:var(--gold);font-weight:600;margin-top:0.25rem">\u20b1' + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</div>' +
        '</div>' +
        '<div style="font-size:0.82rem;color:var(--text-dim);line-height:1.65;text-align:center;margin-bottom:1.25rem">' +
        '\u2705 We\'ve received your application.<br>Admin will review your project details and notify you once a decision is made.<br><br>' +
        '<span style="color:var(--text);font-weight:600">Keep an eye on your notifications \ud83d\udd14</span>' +
        '</div>' +
        '<button onclick="document.getElementById(\'loanSuccessOverlay\').remove()" style="width:100%;padding:0.85rem;background:linear-gradient(135deg,#22c55e,#16a34a);border:none;border-radius:var(--r);color:#fff;font-weight:700;font-size:0.9rem;cursor:pointer;font-family:var(--font-h);letter-spacing:0.03em" onmouseover="this.style.opacity=\'0.88\'" onmouseout="this.style.opacity=\'1\'">' +
        '<i class="fas fa-check" style="margin-right:0.4rem"></i>Got it, thanks!' +
        '</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(overlay);
}

function liveCalculate() {
    const amount = parseFloat(document.getElementById('loanAmount') && document.getElementById('loanAmount').value) || 0;
    const duration = parseInt(document.getElementById('loanDuration') && document.getElementById('loanDuration').value) || 1;
    const preview = document.getElementById('calcPreview');
    if (!preview) return;
    if (amount > 0 && duration > 0) {
        const trustScore = (currentUser && currentUser.trust_score) ? currentUser.trust_score : 0;
        const rate = trustScore >= 80 ? 0.10 : 0.15;
        const ratePct = trustScore >= 80 ? '10%' : '15%';
        const total = amount + (amount * rate);
        const monthly = total / duration;
        preview.innerHTML = '<span style="font-size:0.78rem;color:var(--text-dim)">Rate:</span> <strong style="color:var(--gold)">' + ratePct + '</strong>&nbsp;&nbsp;<span style="color:var(--border)">|</span>&nbsp;&nbsp;<span style="font-size:0.78rem;color:var(--text-dim)">Total:</span> <strong style="color:var(--text);font-size:1rem">\u20b1' + total.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</strong>&nbsp;&nbsp;<span style="color:var(--border)">|</span>&nbsp;&nbsp;<span style="font-size:0.78rem;color:var(--text-dim)">Monthly:</span> <strong style="color:var(--success);font-size:1.05rem">\u20b1' + monthly.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</strong>';
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

window.submitLoanApplication = async function () {
    // Use overlay message element if overlay exists, otherwise fall back
    var _msgEl = document.getElementById('loanOverlayMsg') || document.getElementById('loanStep2Msg');
    function _setMsg(msg, type) {
        if (!_msgEl) return;
        _msgEl.textContent = msg;
        _msgEl.className = 'modal-msg' + (type ? ' ' + type : '');
    }
    const title = document.getElementById('loanProjectTitle') && document.getElementById('loanProjectTitle').value.trim();
    const amount = parseFloat(document.getElementById('loanAmount') && document.getElementById('loanAmount').value);
    const duration = parseInt(document.getElementById('loanDuration') && document.getElementById('loanDuration').value);
    const pin = document.getElementById('loanTxPin') && document.getElementById('loanTxPin').value.trim();
    const disbMethod = document.getElementById('loanDisbMethod') && document.getElementById('loanDisbMethod').value;
    const disbAccount = document.getElementById('loanDisbAccount') && document.getElementById('loanDisbAccount').value.trim();

    let scriptUrl = (document.getElementById('loanScriptUrl') && document.getElementById('loanScriptUrl').value.trim()) || null;
    let lookbookUrl = (document.getElementById('loanLookbookUrl') && document.getElementById('loanLookbookUrl').value.trim()) || null;
    let trailerUrl = (document.getElementById('loanTrailerUrl') && document.getElementById('loanTrailerUrl').value.trim()) || null;

    if (!title) { _setMsg('Project title is required.', 'error'); return; }
    if (!amount || amount <= 0) { _setMsg('Enter a valid loan amount.', 'error'); return; }
    if (!duration || duration < 1) { _setMsg('Enter a valid duration.', 'error'); return; }
    if (!lookbookUrl && !_loanAssetFiles['Lookbook']) { _setMsg('Lookbook is required.', 'error'); return; }
    if (!pin || pin.length !== 6) { _setMsg('Enter your 6-digit Transaction PIN.', 'error'); return; }

    _setMsg('Uploading assets...');

    const categoryMap = { Script: 'scripts', Lookbook: 'lookbooks', Trailer: 'trailers' };
    for (const [type, file] of Object.entries(_loanAssetFiles)) {
        if (!file) continue;
        _setMsg('Uploading ' + type + '...');
        try {
            const fd = new FormData();
            fd.append('file', file);
            const cat = categoryMap[type] || 'scripts';
            const up = await fetch('/api/v1/uploads/loan-asset?category=' + cat, {
                method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: fd
            });
            if (up.ok) {
                const ud = await up.json();
                const fileUrl = ud.url || ud.file_url || null;
                if (fileUrl) {
                    if (type === 'Script') scriptUrl = fileUrl;
                    if (type === 'Lookbook') lookbookUrl = fileUrl;
                    if (type === 'Trailer') trailerUrl = fileUrl;
                }
            }
        } catch (e) { console.warn(type + ' upload error:', e); }
    }

    _setMsg('Submitting application...');
    try {
        const rawGenre = (document.getElementById('loanGenre') && document.getElementById('loanGenre').value) || '';
        const firstGenre = rawGenre.split(',')[0].trim() || 'Drama';
        const allGenres = rawGenre.trim() || 'Drama';
        const desc = (document.getElementById('loanDescription') && document.getElementById('loanDescription').value.trim()) || '';

        const VALID_PURPOSES = [
            "Equipment Rental (Camera/Lights/Sound)",
            "Location Fees & Permits",
            "Cast Salaries",
            "Crew Salaries",
            "Set Design & Props",
            "Wardrobe & Makeup",
            "Catering & Food",
            "Transportation & Gas",
            "Editing & Color Grading",
            "Sound Design & Music Score",
            "Visual Effects (VFX/CGI)",
            "Insurance & Legal Fees",
            "Ads & Festival Fees",
            "Other (Specify in Description)"
        ];
        const filteredPurposes = selectedPurposes.filter(function (p) { return VALID_PURPOSES.includes(p); });
        if (!filteredPurposes.length) filteredPurposes.push("Other (Specify in Description)");

        const payload = {
            project_title: title,
            amount: amount,
            duration_months: duration,
            purposes: filteredPurposes,
            film_production_phase: selectedPhase || null,
            current_stage: ({ 'Development': 'development', 'Pre-Production': 'pre_production', 'Production': 'production', 'Post-Production': 'post_production', 'Distribution & Marketing': 'distribution_marketing' })[selectedPhase] || 'pre_production',
            all_genres: allGenres,
            film_production_phase: selectedPhase || null,
            budget_categories: selectedPurposes.join(', ') || null,
            film_details: {
                genre: allGenres,
                shooting_location: (document.getElementById('loanLocation') && document.getElementById('loanLocation').value.trim()) || "Philippines",
                attached_talent: null,
                production_company: null
            },
            project_description: desc || null,
            script_url: scriptUrl || null,
            lookbook_url: lookbookUrl || null,
            trailer_url: trailerUrl || null,
            loanDisbMethod: disbMethod || null,
            loanDisbAccount: disbAccount || null,
            disbursement_method: disbMethod || null,
            disbursement_account: disbAccount || null,
        };

        const url = '/api/v1/loans/apply?transaction_pin=' + encodeURIComponent(pin);
        const res = await fetch(url, {
            method: 'POST', headers: getHeaders(), body: JSON.stringify(payload)
        });
        const data = await safeJson(res);
        if (res.ok) {
            const reviewOverlay = document.getElementById('loanReviewOverlay');
            if (reviewOverlay) reviewOverlay.remove();
            if (typeof closeLoanApplication === 'function') closeLoanApplication();
            else closeModal('loanModal');
            initPurposeGrid();
            showLoanSuccessPopup(title, amount);
            setTimeout(function () { loadDashboard(); }, 400);
        } else {
            _setMsg((data && data.detail) ? data.detail : 'Submission failed.', 'error');
        }
    } catch (e) {
        _setMsg('Network error. Please try again.', 'error');
    }
}

async function loadDisbursementOptions() {
    const container = document.getElementById('disbMethodCards');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--text-dim);font-size:0.78rem;padding:0.5rem">Loading your accounts...</div>';

    let methods = [];
    try {
        const res = await fetch('/api/v1/loans/payment-methods', { headers: getHeaders() });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length) methods = data;
        }
    } catch (e) { }

    if (!methods.length) {
        container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-dim);font-size:0.82rem">No payment accounts linked yet.<br><span style="font-size:0.76rem">Use the button below to add one.</span></div>';
        return;
    }

    container.innerHTML = methods.map(function (m) {
        const pm = PH_METHODS.find(function (p) { return p.key === m.method_type; }) || { label: m.method_type, abbr: '?', color: 'var(--gold)', bg: 'var(--gold-dim)' };
        const isDefault = m.is_default;
        return '<div class="disb-card" data-method="' + m.method_type + '" data-account="' + m.account_name + ' \u2014 ' + m.account_number + '" data-isdefault="' + isDefault + '" onclick="selectDisbMethod(this)" style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;background:' + (isDefault ? 'var(--gold-dim)' : 'var(--bg-input)') + ';border:2px solid ' + (isDefault ? 'var(--gold-bdr)' : 'var(--border)') + ';border-radius:10px;cursor:pointer;transition:all 0.2s;margin-bottom:0.4rem">' +
            pmLogo(m.method_type, 42) +
            '<div style="flex:1"><div style="font-size:0.88rem;font-weight:700">' + pm.label + '</div><div style="font-size:0.73rem;color:var(--text-dim);margin-top:0.1rem">' + m.account_name + ' \u2014 ' + m.account_number + '</div>' + (isDefault ? '<div style="font-size:0.62rem;color:var(--gold);margin-top:0.1rem;font-weight:700">\u2605 Default</div>' : '') + '</div>' +
            '<i class="fas fa-circle-check" style="font-size:0.85rem;color:' + (isDefault ? 'var(--gold)' : 'var(--border)') + ';transition:color 0.15s"></i>' +
            '</div>';
    }).join('');

    const defaultCard = container.querySelector('.disb-card[data-isdefault="true"]');
    if (defaultCard) selectDisbMethod(defaultCard);
}

function selectDisbMethod(card) {
    document.querySelectorAll('#disbMethodCards .disb-card').forEach(function (c) {
        c.style.borderColor = 'var(--border)';
        c.style.background = 'var(--bg-input)';
        c.querySelectorAll('i.fa-circle-check').forEach(function (i) { i.style.color = 'var(--border)'; });
    });
    card.style.borderColor = 'var(--gold-bdr)';
    card.style.background = 'rgba(212,175,55,0.07)';
    card.querySelectorAll('i.fa-circle-check').forEach(function (i) { i.style.color = 'var(--gold)'; });
    const mEl = document.getElementById('loanDisbMethod');
    const aEl = document.getElementById('loanDisbAccount');
    if (mEl) mEl.value = card.dataset.method;
    if (aEl) aEl.value = card.dataset.account;
}

async function openPaymentMethodsModal() {
    let modal = document.getElementById('payMethodModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'payMethodModal';
        modal.className = 'modal';
        modal.style.display = 'none';
        modal.innerHTML =
            '<div class="modal-box" style="max-width:560px;max-height:90vh;overflow-y:auto">' +
            '<div class="modal-header">' +
            '<h2><i class="fas fa-wallet" style="margin-right:0.5rem;color:var(--gold)"></i>Payment Methods</h2>' +
            '<button class="modal-close" onclick="closeModal(\'payMethodModal\');refreshRepayMethodCards()"><i class="fas fa-times"></i></button>' +
            '</div>' +
            '<div class="modal-scroll-area">' +
            '<div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:0.6rem">Linked Accounts</div>' +
            '<div id="pmLinkedList" style="margin-bottom:1.25rem"></div>' +
            '<div style="border-top:1px solid var(--border);padding-top:1rem">' +
            '<div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:0.75rem"><i class="fas fa-plus" style="margin-right:0.35rem"></i>Link New Account</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:0.5rem;margin-bottom:0.85rem" id="pmMethodPicker">' +
            PH_METHODS.map(function (m) {
                return '<div class="pm-pick-btn" data-key="' + m.key + '" onclick="selectPmType(this,\'' + m.key + '\')" style="display:flex;flex-direction:column;align-items:center;gap:0.35rem;padding:0.6rem 0.4rem;background:var(--bg-input);border:2px solid var(--border);border-radius:10px;cursor:pointer;transition:all 0.18s">' +
                    '<div style="width:38px;height:38px;border-radius:8px;background:' + m.bg + ';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.75rem;color:' + m.color + ';border:1px solid ' + m.color + '33">' + m.abbr + '</div>' +
                    '<span style="font-size:0.6rem;font-weight:600;color:var(--text-dim);text-align:center;line-height:1.2">' + m.label + '</span>' +
                    '</div>';
            }).join('') +
            '</div>' +
            '<input type="hidden" id="pmNewType" value="">' +
            '<p id="pmSelectedLabel" style="font-size:0.75rem;color:var(--gold);margin:0 0 0.5rem;min-height:1rem"></p>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:0.5rem">' +
            '<div><label style="font-size:0.68rem;color:var(--text-dim);font-weight:700;text-transform:uppercase;display:block;margin-bottom:0.25rem">Account Name</label><input type="text" id="pmNewName" placeholder="Juan Dela Cruz" style="background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.6rem;width:100%;box-sizing:border-box"></div>' +
            '<div><label style="font-size:0.68rem;color:var(--text-dim);font-weight:700;text-transform:uppercase;display:block;margin-bottom:0.25rem">Account No.</label><input type="text" id="pmNewNumber" placeholder="09XXXXXXXXX" style="background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.6rem;width:100%;box-sizing:border-box"></div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem"><input type="checkbox" id="pmSetDefault" style="width:16px;height:16px"><label for="pmSetDefault" style="font-size:0.8rem">Set as default disbursement account</label></div>' +
            '<p id="pmAddMsg" style="font-size:0.78rem;min-height:1rem;margin:0.25rem 0;color:var(--text-dim)"></p>' +
            '<button class="btn-gold btn-full" style="margin-top:0.25rem" onclick="addPaymentMethod()"><i class="fas fa-link"></i> Link Account</button>' +
            '</div>' +
            '</div>' +
            '</div>';
        document.body.appendChild(modal);
    }
    openModal('payMethodModal');
    refreshPaymentMethodsList();
    return Promise.resolve();
}

function selectPmType(btn, key) {
    document.querySelectorAll('.pm-pick-btn').forEach(function (b) {
        b.style.borderColor = 'var(--border)';
        b.style.background = 'var(--bg-input)';
    });
    btn.style.borderColor = 'var(--gold-bdr)';
    btn.style.background = 'rgba(212,175,55,0.08)';
    document.getElementById('pmNewType').value = key;
    const m = PH_METHODS.find(function (p) { return p.key === key; });
    const lbl = document.getElementById('pmSelectedLabel');
    if (lbl && m) lbl.textContent = 'Selected: ' + m.label;
}

async function refreshPaymentMethodsList() {
    const container = document.getElementById('pmLinkedList');
    if (!container) return;
    let methods = [];
    try {
        const res = await fetch('/api/v1/loans/payment-methods', { headers: getHeaders() });
        if (res.ok) { const d = await res.json(); if (Array.isArray(d) && d.length) methods = d; }
    } catch (e) { }
    if (!methods.length) methods = _mockPaymentMethods;
    if (!methods.length) { container.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem">No accounts linked yet.</p>'; return; }
    container.innerHTML = methods.map(function (m, idx) {
        const pm = PH_METHODS.find(function (p) { return p.key === m.method_type; }) || { label: m.method_type, abbr: '?', color: 'var(--gold)', bg: 'var(--gold-dim)' };
        return '<div style="display:flex;align-items:center;gap:0.75rem;padding:0.7rem 0.9rem;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;margin-bottom:0.4rem">' +
            pmLogo(m.method_type, 38) +
            '<div style="flex:1"><div style="font-size:0.85rem;font-weight:700">' + pm.label + '</div><div style="font-size:0.72rem;color:var(--text-dim)">' + m.account_name + ' \u2014 ' + m.account_number + '</div>' + (m.is_default ? '<div style="font-size:0.62rem;color:var(--gold);font-weight:700">\u2605 Default</div>' : '') + '</div>' +
            '<button onclick="removeMockAccount(' + (m.id || idx) + ')" style="background:none;border:none;color:var(--error);cursor:pointer;font-size:0.8rem;padding:0.25rem" title="Remove"><i class="fas fa-trash"></i></button>' +
            '</div>';
    }).join('');
}

async function removeMockAccount(id) {
    try {
        const res = await fetch('/api/v1/loans/payment-methods/' + id, { method: 'DELETE', headers: getHeaders() });
        if (res.ok) console.log('Deleted from server');
    } catch (e) { console.warn('API delete failed, removing locally'); }
    _mockPaymentMethods = _mockPaymentMethods.filter(function (m) { return m.id !== id; });
    refreshPaymentMethodsList();
    loadDisbursementOptions();
    if (typeof refreshRepayMethodCards === 'function') refreshRepayMethodCards();
}

async function addPaymentMethod() {
    const type = document.getElementById('pmNewType') && document.getElementById('pmNewType').value;
    const name = document.getElementById('pmNewName') && document.getElementById('pmNewName').value.trim();
    const number = document.getElementById('pmNewNumber') && document.getElementById('pmNewNumber').value.trim();
    const isDefault = document.getElementById('pmSetDefault') && document.getElementById('pmSetDefault').checked;
    const msg = document.getElementById('pmAddMsg');
    if (!type) { if (msg) msg.textContent = 'Select a payment method above.'; return; }
    if (!name) { if (msg) msg.textContent = 'Enter account name.'; return; }
    if (!number) { if (msg) msg.textContent = 'Enter account number.'; return; }
    let saved = false;
    try {
        const res = await fetch('/api/v1/loans/payment-methods', {
            method: 'POST', headers: getHeaders(),
            body: JSON.stringify({ method_type: type, account_name: name, account_number: number, is_default: isDefault })
        });
        if (res.ok) saved = true;
    } catch (e) { }
    if (!saved) {
        if (isDefault) _mockPaymentMethods.forEach(function (m) { m.is_default = false; });
        _mockPaymentMethods.push({ id: Date.now(), method_type: type, account_name: name, account_number: number, is_default: isDefault });
    }
    if (msg) { msg.style.color = 'var(--success)'; msg.textContent = '\u2713 Account linked successfully!'; }
    document.getElementById('pmNewName').value = '';
    document.getElementById('pmNewNumber').value = '';
    document.getElementById('pmNewType').value = '';
    document.getElementById('pmSetDefault').checked = false;
    document.querySelectorAll('.pm-pick-btn').forEach(function (b) { b.style.borderColor = 'var(--border)'; b.style.background = 'var(--bg-input)'; });
    const lbl = document.getElementById('pmSelectedLabel'); if (lbl) lbl.textContent = '';
    setTimeout(function () { if (msg) msg.textContent = ''; }, 2500);
    refreshPaymentMethodsList();
    loadDisbursementOptions();
    // Refresh repay modal cards if open
    if (typeof refreshRepayMethodCards === 'function') refreshRepayMethodCards();
}

async function openRepayModal(loanId, title, remaining) {
    const titleEl = document.getElementById('repayModalTitle');
    const balEl = document.getElementById('repayBalance');
    const cardsEl = document.getElementById('repayMethodCards');
    if (titleEl) titleEl.textContent = 'Repay \u2014 ' + title;
    if (balEl) balEl.textContent = '\u20b1' + Number(remaining).toLocaleString(undefined, { minimumFractionDigits: 2 });
    const amtEl = document.getElementById('repayAmount');
    if (amtEl) { amtEl.value = ''; amtEl.dataset.loanId = loanId; }
    const pinEl = document.getElementById('repayPin'); if (pinEl) pinEl.value = '';
    const senderNameEl = document.getElementById('repaySenderName'); if (senderNameEl) senderNameEl.value = '';
    const senderNumEl = document.getElementById('repaySenderNumber'); if (senderNumEl) senderNumEl.value = '';
    // Reset receipt upload
    const fileEl = document.getElementById('repayReceiptFile'); if (fileEl) fileEl.value = '';
    const lblEl = document.getElementById('repayReceiptLabel'); if (lblEl) lblEl.textContent = 'Click or drag to upload screenshot';
    const prevEl = document.getElementById('repayReceiptPreview'); if (prevEl) prevEl.style.display = 'none';
    const uploadWrap = document.getElementById('repayReceiptUploadWrap'); if (uploadWrap) uploadWrap.style.display = '';
    hidePinGate();
    setModalMsg('repayMsg', '');

    if (cardsEl) {
        let methods = [];
        try {
            const res = await fetch('/api/v1/loans/payment-methods', { headers: getHeaders() });
            if (res.ok) { const d = await res.json(); if (Array.isArray(d)) methods = d; }
        } catch (e) { }
        if (!methods.length) {
            cardsEl.innerHTML = '<div style="font-size:0.78rem;color:var(--text-dim);padding:0.6rem;background:var(--bg-input);border-radius:8px;border:1px solid var(--border)"><i class="fas fa-info-circle" style="margin-right:0.3rem;color:var(--gold)"></i>No payment accounts saved. Click "Add / Manage Accounts" below to add one.</div>';
        } else {
            cardsEl.innerHTML = methods.map(function (m) {
                const pm = PH_METHODS.find(function (p) { return p.key === m.method_type; }) || { label: m.method_type };
                return '<div class="repay-method-card" data-method="' + m.method_type + '" onclick="selectRepayMethod(this)" style="display:flex;align-items:center;gap:0.65rem;padding:0.6rem 0.85rem;background:var(--bg-input);border:2px solid var(--border);border-radius:10px;cursor:pointer;transition:all 0.2s;margin-bottom:0.35rem">' +
                    pmLogo(m.method_type, 36) +
                    '<div style="flex:1"><div class="repay-card-type" style="font-size:0.82rem;font-weight:700">' + pm.label + '</div><div style="font-size:0.7rem;color:var(--text-dim)"><span class="repay-card-name">' + m.account_name + '</span> \u2014 <span class="repay-card-num">' + m.account_number + '</span></div></div>' +
                    '<i class="fas fa-circle-check repay-check-icon" style="font-size:0.8rem;color:var(--border)"></i>' +
                    '</div>';
            }).join('');
            const first = cardsEl.querySelector('.repay-method-card');
            if (first) selectRepayMethod(first);
        }
    }
    openModal('repayModal');
}

function selectRepayMethod(card) {
    document.querySelectorAll('#repayMethodCards .repay-method-card').forEach(function (c) {
        c.style.borderColor = 'var(--border)';
        c.style.background = 'var(--bg-input)';
        c.querySelectorAll('.repay-check-icon').forEach(function (i) { i.style.color = 'var(--border)'; });
    });
    card.style.borderColor = 'var(--gold-bdr)';
    card.style.background = 'rgba(212,175,55,0.07)';
    card.querySelectorAll('.repay-check-icon').forEach(function (i) { i.style.color = 'var(--gold)'; });
    let h = document.getElementById('_repaySelectedMethod');
    if (!h) { h = document.createElement('input'); h.type = 'hidden'; h.id = '_repaySelectedMethod'; document.body.appendChild(h); }
    h.value = card.dataset.method;
}

// Opens the existing payMethodModal and refreshes it — separate from loan disbursement
window.loadRepayMethodsModal = async function() {
    await openPaymentMethodsModal();
};

// Refreshes the payment method cards in the Repay modal (called after closing payment methods modal)
window.refreshRepayMethodCards = async function() {
    var cardsEl = document.getElementById('repayMethodCards');
    if (!cardsEl) return;
    var methods = [];
    try {
        var res = await fetch('/api/v1/loans/payment-methods', { headers: getHeaders() });
        if (res.ok) { var d = await res.json(); if (Array.isArray(d)) methods = d; }
    } catch (e) { }
    if (!methods.length) {
        cardsEl.innerHTML = '<div style="font-size:0.78rem;color:var(--text-dim);padding:0.6rem;background:var(--bg-input);border-radius:8px;border:1px solid var(--border)"><i class="fas fa-info-circle" style="margin-right:0.3rem;color:var(--gold)"></i>No payment accounts saved. Click "Add / Manage Accounts" below to add one.</div>';
    } else {
        cardsEl.innerHTML = methods.map(function (m) {
            var pm = PH_METHODS.find(function (p) { return p.key === m.method_type; }) || { label: m.method_type };
            return '<div class="repay-method-card" data-method="' + m.method_type + '" onclick="selectRepayMethod(this)" style="display:flex;align-items:center;gap:0.65rem;padding:0.6rem 0.85rem;background:var(--bg-input);border:2px solid var(--border);border-radius:10px;cursor:pointer;transition:all 0.2s;margin-bottom:0.35rem">' +
                pmLogo(m.method_type, 36) +
                '<div style="flex:1"><div class="repay-card-type" style="font-size:0.82rem;font-weight:700">' + pm.label + '</div><div style="font-size:0.7rem;color:var(--text-dim)"><span class="repay-card-name">' + m.account_name + '</span> \u2014 <span class="repay-card-num">' + m.account_number + '</span></div></div>' +
                '<i class="fas fa-circle-check repay-check-icon" style="font-size:0.8rem;color:var(--border)"></i>' +
                '</div>';
        }).join('');
        var first = cardsEl.querySelector('.repay-method-card');
        if (first) selectRepayMethod(first);
    }
};

// ── Receipt upload handlers ───────────────────────────────────────────────────
window.handleRepayReceiptSelect = function(input) {
    if (!input.files || !input.files[0]) return;
    _setRepayReceiptFile(input.files[0]);
};
window.handleRepayReceiptDrop = function(event) {
    const f = event.dataTransfer.files && event.dataTransfer.files[0];
    if (f) { document.getElementById('repayReceiptFile').files = event.dataTransfer.files; _setRepayReceiptFile(f); }
};
function _setRepayReceiptFile(file) {
    const lbl = document.getElementById('repayReceiptLabel');
    const prev = document.getElementById('repayReceiptPreview');
    const img = document.getElementById('repayReceiptImg');
    const name = document.getElementById('repayReceiptName');
    const uploadWrap = document.getElementById('repayReceiptUploadWrap');
    if (lbl) lbl.textContent = file.name;
    if (name) name.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    // Hide upload area, show compact preview
    if (uploadWrap) uploadWrap.style.display = 'none';
    if (prev) prev.style.display = 'flex';
    if (img && file.type.startsWith('image/')) {
        img.style.display = 'block';
        const reader = new FileReader();
        reader.onload = function(e) {
            img.src = e.target.result;
            const lb = document.getElementById('repayReceiptLightboxImg');
            if (lb) lb.src = e.target.result;
        };
        reader.readAsDataURL(file);
    } else if (img) {
        img.style.display = 'none';
    }
}

window.openRepayReceiptLightbox = function() {
    const lb = document.getElementById('repayReceiptLightbox');
    if (lb) lb.style.display = 'flex';
};

// Step 1: validate form fields → show PIN gate
async function submitRepayment() {
    const loanId = document.getElementById('repayAmount') && document.getElementById('repayAmount').dataset && document.getElementById('repayAmount').dataset.loanId;
    const amount = parseFloat(document.getElementById('repayAmount') && document.getElementById('repayAmount').value);
    const fileInput = document.getElementById('repayReceiptFile');
    const hasFile = fileInput && fileInput.files && fileInput.files[0];
    const methodEl = document.getElementById('_repaySelectedMethod');
    const hasMethod = methodEl && methodEl.value;

    if (!loanId) { setModalMsg('repayMsg', 'No loan selected.', 'error'); return; }
    if (!amount || amount <= 0) { setModalMsg('repayMsg', 'Enter a valid amount.', 'error'); return; }
    if (!hasMethod) { setModalMsg('repayMsg', 'Select a payment method.', 'error'); return; }
    if (!hasFile) { setModalMsg('repayMsg', 'Please upload your payment receipt screenshot.', 'error'); return; }

    setModalMsg('repayMsg', '');
    showPinGate();
}

function showPinGate() {
    const gate = document.getElementById('repayPinGate');
    if (gate) { gate.style.display = 'flex'; }
    const pinEl = document.getElementById('repayPin');
    if (pinEl) { pinEl.value = ''; setTimeout(function(){ pinEl.focus(); }, 100); }
    const msgEl = document.getElementById('repayPinMsg'); if (msgEl) msgEl.textContent = '';
}
window.hidePinGate = function() {
    const gate = document.getElementById('repayPinGate');
    if (gate) gate.style.display = 'none';
};

// Step 2: PIN confirmed → upload receipt + submit
window.finalSubmitRepayment = async function() {
    const pin = (document.getElementById('repayPin') && document.getElementById('repayPin').value.trim()) || '';
    const pinMsg = document.getElementById('repayPinMsg');
    if (!pin || pin.length !== 6) { if (pinMsg) pinMsg.textContent = 'Enter your 6-digit PIN.'; return; }
    if (pinMsg) pinMsg.textContent = 'Submitting...';

    const loanId = document.getElementById('repayAmount').dataset.loanId;
    const amount = parseFloat(document.getElementById('repayAmount').value);
    const method = (document.getElementById('_repaySelectedMethod') && document.getElementById('_repaySelectedMethod').value) || '';
    // Get sender info from the selected payment method card
    const selectedCard = document.querySelector('#repayMethodCards .repay-method-card[style*="rgba(212,175,55"]');
    const senderName = selectedCard ? (selectedCard.querySelector('.repay-card-name')?.textContent || '') : '';
    const senderNumber = selectedCard ? (selectedCard.querySelector('.repay-card-num')?.textContent || '') : '';
    const methodLabel = selectedCard ? (selectedCard.querySelector('.repay-card-type')?.textContent || method) : method;
    const fileInput = document.getElementById('repayReceiptFile');
    const file = fileInput && fileInput.files && fileInput.files[0];

    try {
        let proofUrl = null;
        if (file) {
            const fd = new FormData();
            fd.append('file', file);
            try {
                const upRes = await fetch('/api/v1/uploads/repayment-proof', {
                    method: 'POST',
                    headers: (function(){ const h = Object.assign({}, getHeaders()); delete h['Content-Type']; return h; })(),
                    body: fd
                });
                if (upRes.ok) { const upData = await upRes.json(); proofUrl = upData.url || upData.proof_url || null; }
            } catch(e) { }
        }

        const res = await fetch('/api/v1/loans/' + loanId + '/repay', {
            method: 'POST', headers: getHeaders(),
            body: JSON.stringify({ amount: amount, transaction_pin: pin, payment_method: method, payment_method_label: methodLabel, sender_name: senderName, sender_number: senderNumber, proof_url: proofUrl })
        });
        const data = await safeJson(res);
        if (res.ok) {
            hidePinGate();
            closeModal('repayModal');
            showRepaymentSuccessPopup(amount, senderName || methodLabel, senderNumber, data.reference_number);
            setTimeout(function () { loadDashboard(); }, 400);
        } else {
            if (pinMsg) pinMsg.textContent = (data && data.detail) ? data.detail : 'Repayment failed.';
        }
    } catch (e) { if (pinMsg) pinMsg.textContent = 'Network error.'; }
};

function showRepaymentSuccessPopup(amount, senderName, senderNumber, refNumber) {
    const existing = document.getElementById('repaySuccessOverlay');
    if (existing) existing.remove();
    if (!document.getElementById('_filmAnimStyles')) {
        const st = document.createElement('style');
        st.id = '_filmAnimStyles';
        st.textContent = '@keyframes _lsPopUp{from{transform:scale(0.82);opacity:0}to{transform:scale(1);opacity:1}}';
        document.head.appendChild(st);
    }
    const overlay = document.createElement('div');
    overlay.id = 'repaySuccessOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.82);backdrop-filter:blur(6px);padding:1rem';
    overlay.innerHTML =
        '<div style="background:var(--bg-card);border:1px solid rgba(34,197,94,0.35);border-radius:1.5rem;max-width:400px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.7);overflow:hidden;animation:_lsPopUp 0.38s cubic-bezier(0.34,1.56,0.64,1)">' +
        '<div style="background:linear-gradient(135deg,rgba(34,197,94,0.14),rgba(34,197,94,0.04));border-bottom:1px solid rgba(34,197,94,0.18);padding:1.75rem 1.5rem;text-align:center">' +
        '<div style="width:56px;height:56px;background:rgba(34,197,94,0.12);border:2px solid rgba(34,197,94,0.35);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 0.85rem"><i class="fas fa-receipt" style="font-size:1.4rem;color:#22c55e"></i></div>' +
        '<div style="font-family:var(--font-h);font-size:1.15rem;font-weight:900;color:#22c55e;margin-bottom:0.3rem">Repayment Submitted!</div>' +
        '<div style="font-size:0.8rem;color:var(--text-dim)">Waiting for admin confirmation</div>' +
        '</div>' +
        '<div style="padding:1.5rem">' +
        '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:0.75rem;padding:1rem;margin-bottom:1rem;display:flex;flex-direction:column;gap:0.5rem">' +
        '<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim)">Amount</span><span style="font-size:1rem;font-weight:800;color:#22c55e">\u20b1' + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim)">Payment Method</span><span style="font-size:0.82rem;font-weight:600;color:var(--text)">' + (senderName || '\u2014') + '</span></div>' +
        (senderNumber ? '<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim)">Account No.</span><span style="font-size:0.82rem;font-weight:600;color:var(--text);font-family:monospace">' + senderNumber + '</span></div>' : '') +
        (refNumber ? '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:0.4rem;border-top:1px dashed var(--border)"><span style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim)">Reference No.</span><span style="font-size:0.72rem;font-weight:700;color:#22c55e;font-family:monospace">' + refNumber + '</span></div>' : '') +
        '</div>' +
        '<div style="font-size:0.78rem;color:var(--text-dim);line-height:1.6;text-align:center;margin-bottom:1.1rem">Admin will verify your payment and generate your official receipt. You will be notified once confirmed. \ud83d\udd14</div>' +
        '<button onclick="document.getElementById(\'repaySuccessOverlay\').remove()" style="width:100%;padding:0.82rem;background:linear-gradient(135deg,rgba(34,197,94,0.22),rgba(22,163,74,0.15));border:1px solid rgba(34,197,94,0.5);border-radius:var(--r);color:#22c55e;font-weight:700;font-size:0.88rem;cursor:pointer;font-family:var(--font-h);transition:background 0.2s" onmouseover="this.style.background=\'rgba(34,197,94,0.28)\'" onmouseout="this.style.background=\'linear-gradient(135deg,rgba(34,197,94,0.22),rgba(22,163,74,0.15))\'"><i class="fas fa-check" style="margin-right:0.4rem"></i>Got it!</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(overlay);
}

async function loadDelayInstallments() {
    const loanSel = document.getElementById('delayLoanSelect');
    const instSel = document.getElementById('delayInstallmentSelect');
    const loanId = loanSel && loanSel.value;
    if (!instSel) return;
    if (!loanId) { instSel.innerHTML = '<option value="">Select installment...</option>'; return; }
    instSel.innerHTML = '<option value="">Loading...</option>';
    try {
        const res = await fetch('/api/v1/loans/' + loanId + '/schedule', { headers: getHeaders() });
        if (!res.ok) throw new Error();
        const schedule = await res.json();
        const unpaid = schedule.filter(function (s) { return s.status !== 'paid' && s.delay_status !== 'pending' && s.delay_status !== 'approved'; });
        instSel.innerHTML = '<option value="">Select installment...</option>' +
            unpaid.map(function (s) {
                const due = new Date(s.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
                return '<option value="' + s.id + '">#' + s.installment_number + ' \u2014 ' + due + ' \u2014 \u20b1' + Number(s.amount_due).toLocaleString() + '</option>';
            }).join('');
    } catch (e) { instSel.innerHTML = '<option value="">Could not load installments</option>'; }
}

async function submitDelayRequest() {
    const loanId = document.getElementById('delayLoanSelect') && document.getElementById('delayLoanSelect').value;
    const reason = document.getElementById('delayReason') && document.getElementById('delayReason').value.trim();
    const proofFile = document.getElementById('delayProofInput') && document.getElementById('delayProofInput').files && document.getElementById('delayProofInput').files[0];
    if (!loanId) { setModalMsg('requestPaymentMsg', 'Select a project.', 'error'); return; }
    if (!reason || reason.length < 10) { setModalMsg('requestPaymentMsg', 'Provide at least 10 characters for the reason.', 'error'); return; }
    if (!proofFile) { setModalMsg('requestPaymentMsg', 'Proof / supporting document is required.', 'error'); return; }
    setModalMsg('requestPaymentMsg', 'Fetching your schedule...');
    try {
        // Auto-pick the next unpaid installment — no manual selector needed
        const schRes = await fetch('/api/v1/loans/' + loanId + '/schedule', { headers: getHeaders() });
        if (!schRes.ok) throw new Error('Could not load schedule.');
        const schedule = await schRes.json();
        const next = schedule.find(function (s) {
            return s.status !== 'paid' && s.delay_status !== 'pending' && s.delay_status !== 'approved';
        });
        if (!next) { setModalMsg('requestPaymentMsg', 'No eligible installment found for this project.', 'error'); return; }
        setModalMsg('requestPaymentMsg', 'Submitting...');
        const fd = new FormData();
        fd.append('reason', reason);
        fd.append('schedule_id', String(next.id));
        fd.append('proof', proofFile);
        const res = await fetch('/api/v1/loans/' + loanId + '/delay-request', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: fd
        });
        const data = await safeJson(res);
        if (res.ok) {
            setModalMsg('requestPaymentMsg', '\u2713 Delay request submitted for Installment #' + next.installment_number + '!', 'success');
            setTimeout(function () { closeModal('requestPaymentModal'); }, 2000);
        } else {
            setModalMsg('requestPaymentMsg', (data && data.detail) ? data.detail : 'Submission failed.', 'error');
        }
    } catch (e) { setModalMsg('requestPaymentMsg', e.message || 'Network error.', 'error'); }
}

async function loadDelayInstallmentsModal() {
    const loanSel = document.getElementById('delayModalLoanSelect');
    const instSel = document.getElementById('delayInstallmentSelectModal');
    const loanId = loanSel && loanSel.value;
    if (!instSel) return;
    if (!loanId) { instSel.innerHTML = '<option value="">Select installment...</option>'; return; }
    instSel.innerHTML = '<option value="">Loading...</option>';
    try {
        const res = await fetch('/api/v1/loans/' + loanId + '/schedule', { headers: getHeaders() });
        if (!res.ok) throw new Error();
        const schedule = await res.json();
        const unpaid = schedule.filter(function (s) { return s.status !== 'paid'; });
        instSel.innerHTML = '<option value="">Select installment...</option>' +
            unpaid.map(function (s) {
                const due = new Date(s.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
                return '<option value="' + s.id + '">#' + s.installment_number + ' \u2014 ' + due + ' \u2014 \u20b1' + Number(s.amount_due).toLocaleString() + '</option>';
            }).join('');
    } catch (e) { instSel.innerHTML = '<option value="">Could not load</option>'; }
}

async function submitDelayModal() {
    const loanId = document.getElementById('delayModalLoanSelect') && document.getElementById('delayModalLoanSelect').value;
    const scheduleId = document.getElementById('delayInstallmentSelectModal') && document.getElementById('delayInstallmentSelectModal').value;
    const reason = document.getElementById('delayReasonModal') && document.getElementById('delayReasonModal').value.trim();
    if (!loanId || !scheduleId || !reason) { setModalMsg('delayMsg', 'Fill in all fields.', 'error'); return; }
    if (reason.length < 10) { setModalMsg('delayMsg', 'Provide at least 10 characters for the reason.', 'error'); return; }
    setModalMsg('delayMsg', 'Submitting...');
    try {
        const fd = new FormData();
        fd.append('reason', reason);
        fd.append('schedule_id', scheduleId);
        const res = await fetch('/api/v1/loans/' + loanId + '/delay-request', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: fd
        });
        const data = await safeJson(res);
        if (res.ok) { setModalMsg('delayMsg', '\u2713 Submitted!', 'success'); setTimeout(function () { closeModal('delayModal'); }, 1800); }
        else { setModalMsg('delayMsg', (data && data.detail) ? data.detail : 'Failed.', 'error'); }
    } catch (e) { setModalMsg('delayMsg', 'Network error.', 'error'); }
}

function openDelayForInstallment(loanId, scheduleId) {
    openModal('requestPaymentModal');
    switchRPTab('delay');
    const loanSel = document.getElementById('delayLoanSelect');
    if (loanSel) {
        loanSel.value = loanId;
        loadDelayInstallments().then(function () {
            const instSel = document.getElementById('delayInstallmentSelect');
            if (instSel) instSel.value = scheduleId;
        });
    }
}

async function uploadPastProjectFile(input) {
    const file = input.files[0]; if (!file) return;
    const nameEl = document.getElementById('pastProjectUploadName');
    const statusEl = document.getElementById('pastProjectUploadStatus');
    if (nameEl) nameEl.textContent = file.name;
    if (statusEl) { statusEl.textContent = 'Uploading...'; statusEl.style.color = 'var(--text-dim)'; }
    try {
        const fd = new FormData(); fd.append('file', file);
        const res = await fetch('/api/v1/uploads/loan-asset?category=trailers', { method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: fd });
        if (res.ok) {
            const data = await res.json();
            const url = data.url || data.file_url;
            const urlField = document.getElementById('updatePastProject');
            if (urlField && url) urlField.value = url;
            if (statusEl) { statusEl.textContent = '\u2713 Uploaded'; statusEl.style.color = 'var(--success)'; }
        } else { if (statusEl) { statusEl.textContent = 'Upload failed'; statusEl.style.color = 'var(--error)'; } }
    } catch (e) { if (statusEl) { statusEl.textContent = 'Error'; statusEl.style.color = 'var(--error)'; } }
}

async function verifyTransactionPin(pin, callback) {
    try {
        const res = await fetch('/api/v1/auth/verify-pin', {
            method: 'POST', headers: getHeaders(), body: JSON.stringify({ pin: pin })
        });
        callback(res.ok);
    } catch (e) {
        callback(pin && pin.length === 6);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initPurposeGrid();
    loadDashboard();
    watchAssetUrls();
});

// ─────────────────────────────────────────────
// LOAN APPLICATION — HTML injection
// Called by openLoanApplicationSection() and
// openLoanApplicationModal() to populate the
// shared #loanModalBody before showing the modal.
// ─────────────────────────────────────────────
function _initLoanModalBody() {
    var body = document.getElementById('loanModalBody');
    if (!body || body.dataset.initialized) return;
    body.innerHTML = `                <div id="loanStep1" style="position:relative">
                    <h3 class="loan-step-title" style="padding-top:1.2rem">Step 1 — Production Phase &amp; Budget</h3>

                    <div style="margin-bottom:1rem">
                        <div class="fld-label-sm" style="margin-bottom:0.4rem">Film Production Phase <span
                                style="color:var(--error)">*</span> <span class="fld-hint">(choose one)</span></div>
                        <div id="phaseDropdownTrigger" class="phase-dropdown-trigger" onclick="togglePhaseDropdown()">
                            <span id="phaseDropdownLabel" style="color:var(--text-dim)">Select production phase…</span>
                            <i class="fas fa-chevron-down" id="phaseChevron"
                                style="font-size:0.68rem;color:var(--text-dim);margin-left:auto;transition:transform 0.2s"></i>
                        </div>
                        <div id="phaseDropdownPanel" class="phase-dropdown-panel" style="display:none">
                            <div class="phase-radio-item" onclick="selectPhase(this,'Development')">
                                <span class="phase-radio-circle" id="phaseCircle-Development"></span>
                                <div class="phase-radio-content">
                                    <span class="phase-radio-name">Development</span>
                                    <span class="phase-radio-desc">Script writing, concept development, initial planning
                                        and research before pre-production begins</span>
                                </div>
                            </div>
                            <div class="phase-radio-item" onclick="selectPhase(this,'Pre-Production')">
                                <span class="phase-radio-circle" id="phaseCircle-Pre-Production"></span>
                                <div class="phase-radio-content">
                                    <span class="phase-radio-name">Pre-Production</span>
                                    <span class="phase-radio-desc">Casting, location scouting, hiring crew, scheduling,
                                        and all preparation before filming begins</span>
                                </div>
                            </div>
                            <div class="phase-radio-item" onclick="selectPhase(this,'Production')">
                                <span class="phase-radio-circle" id="phaseCircle-Production"></span>
                                <div class="phase-radio-content">
                                    <span class="phase-radio-name">Production <small
                                            style="opacity:0.6;font-weight:400">(Principal Photography)</small></span>
                                    <span class="phase-radio-desc">Active filming on set — cameras rolling, crew and
                                        cast capturing all scenes of the project</span>
                                </div>
                            </div>
                            <div class="phase-radio-item" onclick="selectPhase(this,'Post-Production')">
                                <span class="phase-radio-circle" id="phaseCircle-Post-Production"></span>
                                <div class="phase-radio-content">
                                    <span class="phase-radio-name">Post-Production</span>
                                    <span class="phase-radio-desc">Editing, color grading, sound design, visual effects,
                                        and all finishing work after filming wraps</span>
                                </div>
                            </div>
                            <div class="phase-radio-item" onclick="selectPhase(this,'Distribution & Marketing')">
                                <span class="phase-radio-circle" id="phaseCircle-Distribution"></span>
                                <div class="phase-radio-content">
                                    <span class="phase-radio-name">Distribution &amp; Marketing</span>
                                    <span class="phase-radio-desc">Film festival submissions, theatrical or digital
                                        release, and promotional campaign activities</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="fld-label-sm" style="margin-bottom:0.4rem">Budget Categories <span
                            style="color:var(--error)">*</span> <span class="fld-hint">(choose all that apply)</span>
                    </div>
                    <div id="purposeGrid" class="purpose-grid"></div>
                    <p class="modal-msg error" id="loanStep1Msg" style="min-height:1rem;margin-top:0.4rem"></p>
                    <button class="btn-gold btn-full" style="margin-top:0.75rem" onclick="proceedToLoanStep2()">
                        Continue to Project Details <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
                <div id="loanStep2" style="display:none;position:relative">
                    <h3 class="loan-step-title-2" style="padding-top:1.2rem">Step 2 — Project Details &amp; Assets</h3>
                    <div class="fld fld-mb1"><label>Project Title</label>
                        <input type="text" id="loanProjectTitle" placeholder="e.g. Indie Short Film 2026">
                    </div>
                    <div class="fld fld-mb1" style="position:relative">
                        <label>Genre <span class="fld-hint">Select all that apply</span></label>
                        <div id="genreDropdownTrigger" class="phase-dropdown-trigger"
                            onclick="toggleGenreDropdown(event)" style="min-height:46px">
                            <span id="genreTriggerLabel" style="color:var(--text-dim)">Click to select genres…</span>
                            <i class="fas fa-chevron-down" id="genreChevron"
                                style="font-size:0.68rem;color:var(--text-dim);margin-left:auto;transition:transform 0.2s"></i>
                        </div>
                        <div id="genreDropdownPanel" class="phase-dropdown-panel genre-multi-panel"
                            style="display:none">
                            <label class="genre-dd-item"><input type="checkbox" value="Drama"
                                    onchange="updateGenreDisplay()"> Drama</label>
                            <label class="genre-dd-item"><input type="checkbox" value="Comedy"
                                    onchange="updateGenreDisplay()"> Comedy</label>
                            <label class="genre-dd-item"><input type="checkbox" value="Thriller"
                                    onchange="updateGenreDisplay()"> Thriller</label>
                            <label class="genre-dd-item"><input type="checkbox" value="Horror"
                                    onchange="updateGenreDisplay()"> Horror</label>
                            <label class="genre-dd-item"><input type="checkbox" value="Action"
                                    onchange="updateGenreDisplay()"> Action</label>
                            <label class="genre-dd-item"><input type="checkbox" value="Documentary"
                                    onchange="updateGenreDisplay()"> Documentary</label>
                            <label class="genre-dd-item"><input type="checkbox" value="Romance"
                                    onchange="updateGenreDisplay()"> Romance</label>
                            <label class="genre-dd-item"><input type="checkbox" value="Sci-Fi"
                                    onchange="updateGenreDisplay()"> Sci-Fi</label>
                            <label class="genre-dd-item"><input type="checkbox" value="Fantasy"
                                    onchange="updateGenreDisplay()"> Fantasy</label>
                            <label class="genre-dd-item"><input type="checkbox" value="Historical"
                                    onchange="updateGenreDisplay()"> Historical</label>
                            <label class="genre-dd-item"><input type="checkbox" value="Animation"
                                    onchange="updateGenreDisplay()"> Animation</label>
                            <label class="genre-dd-item"><input type="checkbox" value="Short Film"
                                    onchange="updateGenreDisplay()"> Short Film</label>
                            <label class="genre-dd-item"><input type="checkbox" value="Indie"
                                    onchange="updateGenreDisplay()"> Indie</label>
                            <label class="genre-dd-item"><input type="checkbox" value="Other"
                                    onchange="updateGenreDisplay()"> Other</label>
                        </div>
                        <input type="hidden" id="loanGenre">
                    </div>
                    <div class="fld" style="margin-bottom:1.25rem;margin-top:1rem"><label>Project Description</label>
                        <textarea id="loanDescription" rows="4" class="fld-textarea"
                            placeholder="Brief synopsis and budget plan..."></textarea>
                    </div>
                    <div class="project-assets-wrap" style="margin-top:1.25rem">
                        <div class="assets-hdr">
                            <div class="assets-hdr-icon"><i class="fas fa-photo-film"></i></div>
                            <div>
                                <div class="assets-hdr-title">Project Assets</div>
                                <div class="assets-hdr-sub">Attach supporting documents to strengthen your application
                                </div>
                            </div>
                        </div>
                        <div class="asset-card-row">
                            <div class="asset-card-icon-wrap asset-icon-script"><i class="fas fa-file-lines"></i></div>
                            <div class="asset-card-content">
                                <div class="asset-card-meta"><span class="asset-card-name">Script</span><span
                                        class="asset-badge asset-badge-optional">Optional</span><span
                                        class="asset-card-type">PDF or .doc</span></div>
                                <div class="asset-input-group">
                                    <input type="url" id="loanScriptUrl" class="asset-url-field"
                                        placeholder="Paste Drive / Dropbox URL...">
                                    <label for="loanScriptFile" class="asset-upload-trigger"><i
                                            class="fas fa-arrow-up-from-bracket"></i><span>Upload</span></label>
                                    <input type="file" id="loanScriptFile" accept="application/pdf,.doc,.docx"
                                        style="display:none" onchange="handleLoanAssetFile('Script',this)">
                                </div>
                                <div id="loanScriptFileName" class="asset-chosen-file"></div>
                            </div>
                        </div>
                        <div class="asset-card-row asset-card-row-required">
                            <div class="asset-card-icon-wrap asset-icon-lookbook"><i class="fas fa-images"></i></div>
                            <div class="asset-card-content">
                                <div class="asset-card-meta"><span class="asset-card-name">Lookbook</span><span
                                        class="asset-badge asset-badge-required">Required</span><span
                                        class="asset-card-type">PDF, image, or URL</span></div>
                                <div class="asset-input-group">
                                    <input type="url" id="loanLookbookUrl" class="asset-url-field"
                                        placeholder="Paste Drive / Dropbox URL...">
                                    <label for="loanLookbookFile" class="asset-upload-trigger"><i
                                            class="fas fa-arrow-up-from-bracket"></i><span>Upload</span></label>
                                    <input type="file" id="loanLookbookFile" accept="application/pdf,image/*"
                                        style="display:none" onchange="handleLoanAssetFile('Lookbook',this)">
                                </div>
                                <div id="lookbookFileName" class="asset-chosen-file"></div>
                            </div>
                        </div>
                        <div class="asset-card-row">
                            <div class="asset-card-icon-wrap asset-icon-trailer"><i class="fas fa-clapperboard"></i>
                            </div>
                            <div class="asset-card-content">
                                <div class="asset-card-meta"><span class="asset-card-name">Trailer</span><span
                                        class="asset-badge asset-badge-optional">Optional</span><span
                                        class="asset-card-type">MP4, YouTube, or Vimeo</span></div>
                                <div class="asset-input-group">
                                    <input type="url" id="loanTrailerUrl" class="asset-url-field"
                                        placeholder="Paste YouTube / Vimeo URL...">
                                    <label for="loanTrailerFile" class="asset-upload-trigger"><i
                                            class="fas fa-arrow-up-from-bracket"></i><span>Upload</span></label>
                                    <input type="file" id="loanTrailerFile" accept="video/mp4,video/quicktime"
                                        style="display:none" onchange="handleLoanAssetFile('Trailer',this)">
                                </div>
                                <div id="trailerFileName" class="asset-chosen-file"></div>
                            </div>
                        </div>
                    </div>
                    <p class="modal-msg" id="loanStep2Msg" style="min-height:1rem;margin-bottom:0.5rem"></p>
                    <div class="loan-step2-actions">
                        <button class="btn-outline" onclick="backToLoanStep1()"><i class="fas fa-arrow-left"></i>
                            Back</button>
                        <button class="btn-gold" style="flex:1" onclick="proceedToLoanStep3()">Continue to Disbursement
                            <i class="fas fa-arrow-right"></i></button>
                    </div>
                </div>
                <div id="loanStep3" style="display:none;">
                    <h3 class="loan-step-title-2" style="padding-top:1.2rem">Step 3 — Amount &amp; Disbursement</h3>
                    <div class="loan-amount-duration-grid">
                        <div class="fld"><label>Loan Amount (₱)</label>
                            <input type="number" id="loanAmount" min="1000" placeholder="e.g. 50000"
                                oninput="liveCalculate()">
                        </div>
                        <div class="fld"><label>Duration</label>
                            <div style="display:flex;gap:0.5rem;align-items:flex-end">
                                <div style="flex:1">
                                    <input type="number" id="loanDurationYears" min="1" max="3" value="1"
                                        style="text-align:center" oninput="syncDuration()"
                                        onblur="if(!this.value||+this.value<1)this.value=1;if(+this.value>3)this.value=3;syncDuration()"
                                        onkeyup="if(this.value.length>0&&+this.value>3)this.value=3;syncDuration()">
                                    <div
                                        style="font-size:0.65rem;text-align:center;color:var(--text-dim);margin-top:0.2rem">
                                        Years (max 3)</div>
                                </div>
                                <span style="color:var(--text-dim);padding-bottom:1.4rem;font-weight:600">+</span>
                                <div style="flex:1">
                                    <input type="number" id="loanDurationMonths" min="0" max="11" value="0"
                                        style="text-align:center"
                                        oninput="if(+this.value>11)this.value=11;if(+this.value<0)this.value=0;syncDuration()"
                                        onblur="if(+this.value>11)this.value=11;syncDuration()">
                                    <div
                                        style="font-size:0.65rem;text-align:center;color:var(--text-dim);margin-top:0.2rem">
                                        Months (max 11)</div>
                                </div>
                                <input type="hidden" id="loanDuration">
                            </div>
                        </div>
                    </div>
                    <div id="calcPreview" class="calc-preview"></div>
                    <div class="disb-section">
                        <div class="disb-section-label">Disbursement Account <span
                                style="color:var(--error)">*</span><span class="disb-section-sub">— Where funds will be
                                sent</span></div>
                        <div id="disbMethodCards"></div>
                        <div style="display:flex;justify-content:center;margin-top:0.6rem;">
                            <button onclick="openPaymentMethodsModal()" class="disb-add-btn"><i class="fas fa-plus"></i>
                                Add / Manage Accounts</button>
                        </div>
                        <input type="hidden" id="loanDisbMethod">
                        <input type="hidden" id="loanDisbAccount">
                    </div>
                    <p class="modal-msg" id="loanStep3Msg" style="min-height:1rem;margin-bottom:0.5rem"></p>
                    <div class="loan-step2-actions">
                        <button class="btn-outline" onclick="backToLoanStep2()"><i class="fas fa-arrow-left"></i>
                            Back</button>
                        <button class="btn-gold" style="flex:1" onclick="showPinAndSubmit()"><i class="fas fa-eye"></i>
                            Review &amp; Submit</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

`;
    body.dataset.initialized = '1';
    // Re-run setup now that DOM is ready
    if (typeof initPurposeGrid === 'function') initPurposeGrid();
    if (typeof loadDisbursementOptions === 'function') loadDisbursementOptions();
}

// Patch openLoanApplicationSection to init body first
var _origOpenLoanSection = window.openLoanApplicationSection;
window.openLoanApplicationSection = function() {
    _initLoanModalBody();
    if (_origOpenLoanSection) _origOpenLoanSection();
};

var _origOpenLoanModal = window.openLoanApplicationModal;
window.openLoanApplicationModal = function() {
    _initLoanModalBody();
    if (_origOpenLoanModal) _origOpenLoanModal();
};


// ─────────────────────────────────────────────
// REQUEST PAYMENT MODAL — HTML injection
// ─────────────────────────────────────────────
function _initRequestPaymentBody() {
    var body = document.getElementById('requestPaymentBody');
    if (!body || body.dataset.initialized) return;
    body.innerHTML = `                <div id="rpPanelDelay">
                    <div class="fld fld-mb075"><label>Select Project</label>
                        <select id="delayLoanSelect" class="modal-select">
                            <option value="">Select project...</option>
                        </select>
                    </div>
                    <div class="fld fld-mb075"><label>Reason for Delay</label>
                        <textarea id="delayReason" rows="3" class="fld-textarea"
                            placeholder="Explain why you need more time..."></textarea>
                    </div>
                    <div class="fld fld-mb075">
                        <label>Proof / Supporting Document <span class="fld-hint"
                                style="color:#ef4444">Required</span></label>
                        <label for="delayProofInput" class="file-upload-label">
                            <i class="fas fa-image file-upload-label-icon"></i>
                            <span id="delayProofFileName">Click to upload proof</span>
                        </label>
                        <input type="file" id="delayProofInput" accept="image/*,application/pdf" style="display:none"
                            onchange="handleDelayProofPreview(this)">
                        <div id="delayProofPreview" style="margin-top:0.5rem"></div>
                    </div>
                </div>
                <div id="rpPanelUpdate" style="display:none">
                    <div class="fld fld-mb075"><label>Select Project</label>
                        <select id="graceUpdateLoanSelect" class="modal-select">
                            <option value="">Select project...</option>
                        </select>
                    </div>
                    <div class="fld fld-mb075"><label>Production Update</label>
                        <textarea id="graceUpdateText" rows="4" class="fld-textarea"
                            placeholder="Describe your current production progress this month..."></textarea>
                    </div>
                    <div class="fld">
                        <label>Progress Photo <span class="fld-hint" style="color:#ef4444">Required</span></label>
                        <label for="gracePhotoInput" class="file-upload-label">
                            <i class="fas fa-camera file-upload-label-icon"></i>
                            <span id="monthlyPhotoName">Click to upload a production photo</span>
                        </label>
                        <input type="file" id="gracePhotoInput" accept="image/*" style="display:none"
                            onchange="handleMonthlyPhoto(this)">
                        <div id="monthlyPhotoPreview" class="monthly-photo-preview"></div>
                    </div>
                </div>
                <p class="modal-msg error rp-msg" id="requestPaymentMsg"></p>
                <button class="btn-gold btn-full rp-submit-btn-wrap" onclick="submitRequestPayment()">
                    <i class="fas fa-paper-plane"></i> Submit Request
                </button>
            </div>
        </div>
    </div>

`;
    body.dataset.initialized = '1';
}

var _origOpenReqPay = window.openRequestPaymentModal;
window.openRequestPaymentModal = function() {
    _initRequestPaymentBody();
    if (typeof openModal === 'function') openModal('requestPaymentModal');
    populateDelayLoanSelect(window.currentLoans || []);
    populateGraceLoanSelect(window.currentLoans || []);
    switchRPTab('delay');
};


// ─────────────────────────────────────────────
// REPAY MODAL — HTML injection
// ─────────────────────────────────────────────
function _initRepayBody() {
    var body = document.getElementById('repayModalBody');
    if (!body || body.dataset.initialized) return;
    body.innerHTML = `    <div id="repayModal" class="modal" style="display:none">
        <div class="modal-box" style="max-width:440px">
            <div class="modal-header">
                <h2 id="repayModalTitle">Repay Loan</h2>
                <button class="modal-close" onclick="closeModal('repayModal')"><i class="fas fa-times"></i></button>
            </div>
            <div class="repay-body" style="padding:1rem 1.5rem 1.5rem">
                <div style="font-size:0.73rem;color:var(--text-dim);margin-bottom:0.85rem;padding:0.55rem 0.8rem;background:var(--bg-input);border-radius:8px;border:1px solid var(--border);line-height:1.55">
                    <i class="fas fa-circle-info" style="color:var(--gold);margin-right:0.35rem"></i>
                    Transfer via your registered bank or e-wallet, then upload your receipt and submit — admin will confirm.
                </div>
                <div class="fld fld-mb075">
                    <label>Payment Method <span style="font-size:0.7rem;color:var(--text-dim);font-weight:400">— Where repayment is sent from</span></label>
                    <div id="repayMethodCards"></div>
                    <button onclick="openPaymentMethodsModal().then(function(){ refreshRepayMethodCards(); })" style="margin-top:0.5rem;width:100%;padding:0.5rem;background:transparent;border:1px solid rgba(212,175,55,0.3);border-radius:8px;color:var(--gold);font-size:0.78rem;cursor:pointer;font-weight:600;transition:background 0.15s" onmouseover="this.style.background='rgba(212,175,55,0.07)'" onmouseout="this.style.background='transparent'">
                        <i class="fas fa-plus" style="margin-right:0.35rem;font-size:0.72rem"></i>Add / Manage Accounts
                    </button>
                </div>
                <div class="fld fld-mb075"><label>Payment Amount (₱)</label>
                    <input type="number" id="repayAmount" min="1" placeholder="Enter amount">
                </div>
                <div class="fld fld-mb075"><label>Upload Receipt <span style="color:var(--gold)">*</span></label>
                    <div id="repayReceiptUploadWrap"
                        style="border:2px dashed var(--border);border-radius:10px;padding:0.85rem;text-align:center;cursor:pointer;transition:border-color 0.2s;background:var(--bg-input)"
                        onclick="document.getElementById('repayReceiptFile').click()"
                        ondragover="event.preventDefault();this.style.borderColor='var(--gold)'"
                        ondragleave="this.style.borderColor='var(--border)'"
                        ondrop="event.preventDefault();this.style.borderColor='var(--border)';handleRepayReceiptDrop(event)">
                        <i class="fas fa-cloud-upload-alt" style="font-size:1.3rem;color:var(--gold);margin-bottom:0.3rem;display:block"></i>
                        <div style="font-size:0.78rem;color:var(--text-dim)" id="repayReceiptLabel">Click or drag to upload screenshot</div>
                    </div>
                    <input type="file" id="repayReceiptFile" accept="image/*,.pdf" style="display:none" onchange="handleRepayReceiptSelect(this)">
                    <div id="repayReceiptPreview" style="display:none;margin-top:0.5rem;align-items:center;gap:0.6rem;padding:0.5rem 0.6rem;background:var(--bg-input);border:1px solid var(--border);border-radius:8px">
                        <img id="repayReceiptImg" onclick="openRepayReceiptLightbox()" style="width:48px;height:40px;object-fit:cover;border-radius:5px;cursor:zoom-in;flex-shrink:0;border:1px solid var(--border)" title="Click to enlarge">
                        <div style="min-width:0;flex:1">
                            <div id="repayReceiptName" style="font-size:0.72rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
                            <div style="font-size:0.67rem;color:var(--text-dim);margin-top:0.1rem">Click image to preview · <span style="color:var(--gold);cursor:pointer" onclick="document.getElementById('repayReceiptFile').click()">Change</span></div>
                        </div>
                        <i class="fas fa-circle-check" style="color:#22c55e;font-size:0.85rem;flex-shrink:0"></i>
                    </div>
                </div>
                <p class="modal-msg modal-msg-spaced" id="repayMsg"></p>
            </div>
            <button class="btn-gold btn-full" onclick="submitRepayment()">
                <i class="fas fa-check"></i> Confirm Repayment
            </button>
        </div>
    </div>
`;
    body.dataset.initialized = '1';
}

var _origOpenRepay = window.openRepayModal;
window.openRepayModal = function(loanId, title, remaining) {
    _initRepayBody();
    if (_origOpenRepay) _origOpenRepay(loanId, title, remaining);
};


// ─────────────────────────────────────────────
// DELAY REQUEST SECTION — HTML injection
// Called when delayRequestSection is shown via
// sidebar. Injects form HTML into #delayRequestMount.
// ─────────────────────────────────────────────
function _initDelayRequestMount() {
    var mount = document.getElementById('delayRequestMount');
    if (!mount || mount.dataset.initialized) return;
    mount.innerHTML = `            <div style="max-width:680px;margin:0 auto;padding:2rem 1.5rem">
                <h2 style="font-size:1.15rem;font-weight:800;margin-bottom:1.5rem;display:flex;align-items:center;gap:0.6rem"><i class="fas fa-clock-rotate-left" style="color:var(--gold)"></i>Delay Request</h2>
                <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:1.25rem;padding:1.5rem">
                    <div class="rp-tabs-row">
                        <button id="sectionRpTabDelay" class="rp-tab rp-tab-active" onclick="switchSectionRPTab('delay')">
                            <i class="fas fa-clock-rotate-left"></i> Request Delay
                        </button>
                        <button id="sectionRpTabUpdate" class="rp-tab rp-tab-inactive" onclick="switchSectionRPTab('update')">
                            <i class="fas fa-file-lines"></i> Monthly Update
                        </button>
                    </div>
                    <div id="sectionRpPanelDelay">
                        <div class="fld fld-mb075"><label>Select Project</label>
                            <select id="sectionDelayLoanSelect" class="modal-select" onchange="loadSectionDelayInstallments()">
                                <option value="">Select project...</option>
                            </select>
                        </div>
                        <div class="fld fld-mb075"><label>Reason for Delay</label>
                            <textarea id="sectionDelayReason" rows="3" class="fld-textarea" placeholder="Explain why you need more time..."></textarea>
                        </div>
                        <div class="fld fld-mb075">
                            <label>Proof / Supporting Document <span class="fld-hint" style="color:#ef4444">Required</span></label>
                            <label for="sectionDelayProofInput" class="file-upload-label">
                                <i class="fas fa-image file-upload-label-icon"></i>
                                <span id="sectionDelayProofFileName">Click to upload proof</span>
                            </label>
                            <input type="file" id="sectionDelayProofInput" accept="image/*,application/pdf" style="display:none" onchange="handleSectionDelayProofPreview(this)">
                            <div id="sectionDelayProofPreview" style="margin-top:0.5rem"></div>
                        </div>
                    </div>
                    <div id="sectionRpPanelUpdate" style="display:none">
                        <div class="fld fld-mb075"><label>Select Project</label>
                            <select id="sectionGraceUpdateLoanSelect" class="modal-select">
                                <option value="">Select project...</option>
                            </select>
                        </div>
                        <div class="fld fld-mb075"><label>Production Update</label>
                            <textarea id="sectionGraceUpdateText" rows="4" class="fld-textarea" placeholder="Describe your current production progress this month..."></textarea>
                        </div>
                        <div class="fld">
                            <label>Progress Photo <span class="fld-hint" style="color:#ef4444">Required</span></label>
                            <label for="sectionGracePhotoInput" class="file-upload-label">
                                <i class="fas fa-camera file-upload-label-icon"></i>
                                <span id="sectionMonthlyPhotoName">Click to upload a production photo</span>
                            </label>
                            <input type="file" id="sectionGracePhotoInput" accept="image/*" style="display:none" onchange="handleSectionMonthlyPhoto(this)">
                            <div id="sectionMonthlyPhotoPreview" class="monthly-photo-preview"></div>
                        </div>
                    </div>
                    <p class="modal-msg error rp-msg" id="sectionRequestPaymentMsg"></p>
                    <button class="btn-gold btn-full rp-submit-btn-wrap" onclick="submitSectionRequestPayment()">
                        <i class="fas fa-paper-plane"></i> Submit Request
                    </button>
                </div>
`;
    mount.dataset.initialized = '1';
    _populateSectionDelaySelect();
}

// Override showSection wrapper to init delay section content
var __origShowSection = window.showSection;
window.showSection = function(sectionId, navEl, title, subtitle) {
    if (__origShowSection) __origShowSection(sectionId, navEl, title, subtitle);
    if (sectionId === 'delayRequestSection') {
        _initDelayRequestMount();
        setTimeout(function(){ switchSectionRPTab && switchSectionRPTab('delay'); }, 50);
    }
    if (sectionId !== 'newAppSection' && window.isLoanAppEmbedded) {
        if (typeof _relocateLoanModalToOverlay === 'function') _relocateLoanModalToOverlay();
    }
};