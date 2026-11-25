// ============================================
// FILMNANCE — user-profile.js  (FIXED)
// Key fixes:
//   - Empty field validation (truly empty, not just pre-filled)
//   - Sections show "Edit" mode if data already saved
//   - Verified users: non-KYC saves don't re-queue for admin
//   - KYC Complete Now button opens Edit Verification correctly
// ============================================
'use strict';

var _PROFILE = {
    _pin: null,
    set: function (p) { this._pin = p; },
    get: function () { return this._pin; },
    reset: function () { this._pin = null; }
};

// ── Profile completion bar — weighted by trust point values ──
// professional=5, past_project=5, ec_name=5, ec_contact=5, ec_id=5, kyc=25 → total 50pts
function calcProfileCompletion() {
    if (!currentUser) return;

    const status = currentUser.verification_status || 'unverified';
    const approved = currentUser.approved_sections || {};
    const pending = currentUser.pending_changes || {};

    // Each section: { key, points, done, pending }
    const sections = [
        { key: 'professional', points: 5, done: !!(approved.professional && (currentUser.filmmaker_role || currentUser.bio || currentUser.portfolio_url)) },
        { key: 'past_project', points: 5, done: !!(approved.past_project && (currentUser.past_project_url || (Array.isArray(currentUser.past_project_urls) && currentUser.past_project_urls.length > 0))) },
        { key: 'ec_name', points: 5, done: !!(approved.ec_name && currentUser.emergency_contact_name) },
        { key: 'ec_contact', points: 5, done: !!(approved.ec_contact && currentUser.emergency_contact_phone) },
        { key: 'ec_id', points: 5, done: !!(approved.ec_id && currentUser.emergency_contact_id_url) },
        { key: 'kyc', points: 25, done: !!(currentUser.is_verified) },
    ];

    const totalPoints = 50; // max identity trust
    const earnedPoints = sections.reduce(function (sum, s) { return sum + (s.done ? s.points : 0); }, 0);
    const pct = Math.round((earnedPoints / totalPoints) * 100);

    const pctEl = document.getElementById('profileCompletionPct');
    const fillEl = document.getElementById('profileCompletionFill');

    // Determine overall status for color
    const hasPending = Object.keys(pending).length > 0;
    const isRejected = status === 'rejected' && !hasPending;

    if (status === 'verified' || status === 'approved') {
        if (pctEl) pctEl.textContent = pct + '%';
        if (fillEl) {
            fillEl.style.width = pct + '%';
            fillEl.style.background = 'linear-gradient(90deg,var(--success),#22c55e)';
            fillEl.style.border = 'none';
        }
    } else if (hasPending) {
        if (pctEl) pctEl.innerHTML = pct + '% <span style="font-size:0.7rem;color:#f59e0b">(Pending admin review)</span>';
        if (fillEl) {
            fillEl.style.width = pct + '%';
            fillEl.style.background = 'linear-gradient(90deg,#f59e0b,#fbbf24)';
            fillEl.style.border = 'none';
        }
    } else if (isRejected) {
        if (pctEl) pctEl.innerHTML = pct + '% <span style="font-size:0.7rem;color:#ef4444">(Submission rejected — please resubmit)</span>';
        if (fillEl) {
            fillEl.style.width = pct + '%';
            fillEl.style.background = 'linear-gradient(90deg,#ef4444,#f87171)';
            fillEl.style.border = 'none';
        }
    } else {
        if (pctEl) pctEl.textContent = pct + '%';
        if (fillEl) {
            fillEl.style.width = pct + '%';
            fillEl.style.background = 'rgba(255,255,255,0.08)';
            fillEl.style.border = '1px solid var(--border)';
        }
    }
    return pct;
}

// ── Pre-fill + show edit badges where data already exists ──
// Only pre-fills a field if it's currently empty AND the field is NOT already pending review
function _prefillProfileFields() {
    if (!currentUser) return;
    var pending = currentUser.pending_changes || {};
    var approved = currentUser.approved_sections || {};

    // Pre-fill only if section is NOT yet approved OR field is currently pending
    // Approved+unchanged fields stay empty so user sees clean edit form
    var setIfNeeded = function (id, v, sectionKey, pendingKey) {
        var e = document.getElementById(id);
        if (!e) return;
        var sectionApproved = !!(approved[sectionKey]);
        var fieldPending = !!(pendingKey && pending[pendingKey] !== undefined);
        if (!e.value.trim() && (!sectionApproved || fieldPending)) {
            e.value = v || '';
        }
    };

    setIfNeeded('updateRole', currentUser.filmmaker_role, 'professional', 'filmmaker_role');
    setIfNeeded('updateBio', currentUser.bio, 'professional', 'bio');
    setIfNeeded('updatePortfolio', currentUser.portfolio_url, 'professional', 'portfolio_url');

    // Past project — single input, only fill if not yet approved
    var pastPending = !!(pending['past_project_url'] !== undefined || pending['past_project_urls'] !== undefined);
    var pastApproved = !!(approved['past_project']);
    var pastUrl = currentUser.past_project_url ||
        (Array.isArray(currentUser.past_project_urls) && currentUser.past_project_urls.length > 0 ? currentUser.past_project_urls[0] : '');
    var pastInp = document.getElementById('updatePastProject');
    if (pastInp && !pastInp.value.trim() && (!pastApproved || pastPending)) {
        pastInp.value = pastUrl || '';
    }
    updateVisitBtn('pastProjectVisitBtn', pastUrl);

    setIfNeeded('updateECName', currentUser.emergency_contact_name, 'ec_name', 'emergency_contact_name');
    setIfNeeded('updateECRelation', currentUser.emergency_contact_relationship, 'ec_name', 'emergency_contact_relationship');
    setIfNeeded('updateECPhone', currentUser.emergency_contact_phone, 'ec_contact', 'emergency_contact_phone');
    setIfNeeded('updateECEmail', currentUser.emergency_contact_email, 'ec_contact', 'emergency_contact_email');

    if (currentUser.id_type) { var sel = document.getElementById('updateIdType'); if (sel && !sel.value) sel.value = currentUser.id_type; }
    if (currentUser.id_expiry_date) { var expEl = document.getElementById('updateIdExpiry'); if (expEl && !expEl.value) expEl.value = currentUser.id_expiry_date; }

    updateVisitBtn('portfolioVisitBtn', currentUser.portfolio_url);

    // Show "already uploaded" labels only if no new file selected
    // EC ID is a separate field — never affects KYC upload labels
    if (currentUser.emergency_contact_id_url) {
        var ecEl = document.getElementById('ecIdFileName');
        var ecInput = document.getElementById('ecIdFileInput');
        if (ecEl && !(ecInput && ecInput.files && ecInput.files.length)) ecEl.textContent = '✓ EC ID already uploaded';
    }
    // KYC front ID label — ONLY show if actual KYC id_photo_url exists (not EC ID)
    if (currentUser.id_photo_url) {
        var idEl = document.getElementById('idFrontName');
        var idInput = document.getElementById('idPhotoFile');
        if (idEl && !(idInput && idInput.files && idInput.files.length)) idEl.textContent = '✓ ID already uploaded';
    } else {
        // Make sure the KYC label never shows stale "uploaded" text from a previous render
        var idElReset = document.getElementById('idFrontName');
        if (idElReset && idElReset.textContent.indexOf('already') !== -1) idElReset.textContent = 'Click to upload';
    }
    // KYC selfie label
    if (currentUser.selfie_photo_url) {
        var sfEl = document.getElementById('idSelfieName');
        var selfieInput = document.getElementById('selfiePhotoFile');
        if (sfEl && !(selfieInput && selfieInput.files && selfieInput.files.length)) sfEl.textContent = '✓ Selfie already uploaded';
    } else {
        var sfElReset = document.getElementById('idSelfieName');
        if (sfElReset && sfElReset.textContent.indexOf('already') !== -1) sfElReset.textContent = 'Click to upload';
    }

    var _ap = currentUser.approved_sections || {};
    var _pn = currentUser.pending_changes || {};
    var _rj = currentUser.rejected_sections || {};

    _updateSectionBadge('pse-prof-badge',
        !!(currentUser.filmmaker_role || currentUser.bio || currentUser.portfolio_url),
        !!_ap.professional,
        !!(_pn.filmmaker_role !== undefined || _pn.bio !== undefined || _pn.portfolio_url !== undefined),
        !!_rj.professional);
    _updateSectionBadge('pse-past-badge',
        !!(currentUser.past_project_url || (Array.isArray(currentUser.past_project_urls) && currentUser.past_project_urls.length > 0)),
        !!_ap.past_project,
        !!(_pn.past_project_url !== undefined || _pn.past_project_urls !== undefined),
        !!_rj.past_project);
    _updateSectionBadge('pse-ec-name-badge',
        !!(currentUser.emergency_contact_name),
        !!_ap.ec_name,
        !!(_pn.emergency_contact_name !== undefined || _pn.emergency_contact_relationship !== undefined),
        !!_rj.ec_name);
    _updateSectionBadge('pse-ec-contact-badge',
        !!(currentUser.emergency_contact_phone),
        !!_ap.ec_contact,
        !!(_pn.emergency_contact_phone !== undefined || _pn.emergency_contact_email !== undefined),
        !!_rj.ec_contact);
    _updateSectionBadge('pse-ec-id-badge',
        !!currentUser.emergency_contact_id_url,
        !!_ap.ec_id,
        !!(_pn.emergency_contact_id_url !== undefined),
        !!_rj.ec_id);
    // KYC badge — ONLY triggered by KYC-specific fields, NOT by emergency_contact_id_url
    _updateSectionBadge('pse-kyc-badge',
        !!(currentUser.id_photo_url || currentUser.selfie_photo_url),
        !!(currentUser.is_verified),
        !!(_pn.id_photo_url !== undefined || _pn.selfie_photo_url !== undefined || _pn.id_type !== undefined),
        !!_rj.kyc);
    _updateECOuterBadge(_ap, _pn, _rj);
}

// EC outer summary badge: shows "1 Done · 1 Pending · 1 Rejected" style
function _updateECOuterBadge(ap, pn, rj) {
    var el = document.getElementById('pse-ec-badge');
    if (!el) return;
    var subs = [
        { key: 'ec_name', pnFields: ['emergency_contact_name', 'emergency_contact_relationship'] },
        { key: 'ec_contact', pnFields: ['emergency_contact_phone', 'emergency_contact_email'] },
        { key: 'ec_id', pnFields: ['emergency_contact_id_url'] },
    ];
    var done = 0, pending = 0, rejected = 0;
    subs.forEach(function (s) {
        var isApproved = !!ap[s.key];
        var isPending = s.pnFields.some(function (f) { return pn[f] !== undefined; });
        var isRejected = !!rj[s.key];
        if (isApproved && !isPending && !isRejected) done++;
        else if (isRejected) rejected++;
        else if (isPending) pending++;
    });
    el.style.cssText = 'display:inline-block;padding:0.18rem 0.6rem;border-radius:999px;font-size:0.62rem;font-weight:700;margin-left:0.4rem;vertical-align:middle';
    if (done === 3 && pending === 0 && rejected === 0) {
        el.textContent = 'All Done';
        el.style.background = 'rgba(34,197,94,0.15)'; el.style.color = '#22c55e'; el.style.border = '1px solid rgba(34,197,94,0.3)';
    } else if (done === 0 && pending === 0 && rejected === 0) {
        el.textContent = ''; el.style.display = 'none';
    } else {
        var parts = [];
        if (done > 0) parts.push(done + ' Done');
        if (pending > 0) parts.push(pending + ' Edit');
        if (rejected > 0) parts.push(rejected + ' Rejected');
        el.textContent = parts.join(' · ');
        if (rejected > 0) { el.style.background = 'rgba(239,68,68,0.1)'; el.style.color = '#ef4444'; el.style.border = '1px solid rgba(239,68,68,0.25)'; }
        else if (pending > 0) { el.style.background = 'rgba(245,158,11,0.1)'; el.style.color = '#f59e0b'; el.style.border = '1px solid rgba(245,158,11,0.25)'; }
        else { el.style.background = 'rgba(34,197,94,0.1)'; el.style.color = '#22c55e'; el.style.border = '1px solid rgba(34,197,94,0.25)'; }
    }
}

// 5-state badge: Done(green) / Rejected(red) / Pending(yellow) / Edit(yellow-outline) / hidden
function _updateSectionBadge(badgeId, hasData, isApproved, isPending, isRejected) {
    var el = document.getElementById(badgeId);
    if (!el) return;
    el.style.display = 'inline-block';
    el.style.cssText += 'display:inline-block;padding:0.18rem 0.55rem;border-radius:999px;font-size:0.62rem;font-weight:700;margin-left:0.4rem;vertical-align:middle';
    if (isApproved && !isPending && !isRejected) {
        // Done — green
        el.textContent = 'Done ✓';
        el.style.background = 'rgba(34,197,94,0.15)'; el.style.color = '#22c55e'; el.style.border = '1px solid rgba(34,197,94,0.3)';
    } else if (isRejected) {
        // Rejected — red
        el.textContent = 'Rejected';
        el.style.background = 'rgba(239,68,68,0.1)'; el.style.color = '#ef4444'; el.style.border = '1px solid rgba(239,68,68,0.25)';
    } else if (isPending) {
        // Pending — yellow solid
        el.textContent = 'Pending';
        el.style.background = 'rgba(245,158,11,0.15)'; el.style.color = '#f59e0b'; el.style.border = '1px solid rgba(245,158,11,0.35)';
    } else if (hasData || isApproved) {
        // Has data (user re-editing approved section) — Edit yellow outline
        el.textContent = 'Edit';
        el.style.background = 'transparent'; el.style.color = '#f59e0b'; el.style.border = '1.5px solid rgba(245,158,11,0.5)';
    } else {
        el.textContent = ''; el.style.display = 'none';
    }
}

function _redirectToSecuritySetup(msgId) {
    var msg = '🔒 Please complete your security setup (set a PIN) before updating your profile.';
    if (msgId) _showMsg(msgId, msg, 'error');
    showSaveToast(msg, 'error');
    setTimeout(function () { window.location.href = '/'; }, 2500);
}

// ── PIN unlock ──
// Persist attempt count in sessionStorage so closing/reopening modal doesn't reset it
var _pinAttemptKey = 'profile_pin_attempts';
var _pinLockKey = 'profile_pin_locked_until';
var _PIN_MAX_ATTEMPTS = 3;
var _PIN_LOCKOUT_SECONDS = 300; // 5 minutes

function _getPinAttempts() {
    return parseInt(sessionStorage.getItem(_pinAttemptKey) || '0', 10);
}
function _setPinAttempts(n) {
    sessionStorage.setItem(_pinAttemptKey, String(n));
}
function _getPinLockedUntil() {
    return parseInt(sessionStorage.getItem(_pinLockKey) || '0', 10);
}
function _setPinLockedUntil(ts) {
    sessionStorage.setItem(_pinLockKey, String(ts));
}
function _clearPinLock() {
    sessionStorage.removeItem(_pinAttemptKey);
    sessionStorage.removeItem(_pinLockKey);
}

async function unlockProfileModal() {
    var pinInput = document.getElementById('profilePinInput');
    var errEl = document.getElementById('profilePinError');
    var btn = document.querySelector('#profilePinGate .btn-gold');
    var pin = pinInput ? pinInput.value.trim() : '';

    // Check lockout
    var lockedUntil = _getPinLockedUntil();
    var now = Math.floor(Date.now() / 1000);
    if (lockedUntil > now) {
        var secsLeft = lockedUntil - now;
        var minsLeft = Math.ceil(secsLeft / 60);
        if (errEl) { errEl.textContent = 'Too many failed attempts. Try again in ' + minsLeft + ' minute(s).'; errEl.style.color = 'var(--error)'; }
        return;
    }
    // Reset lockout if expired
    if (lockedUntil > 0 && lockedUntil <= now) { _clearPinLock(); }

    if (!pin || pin.length !== 6) {
        if (errEl) { errEl.textContent = 'Please enter your 6-digit PIN.'; errEl.style.color = 'var(--error)'; }
        return;
    }
    if (errEl) { errEl.textContent = 'Verifying…'; errEl.style.color = 'var(--text-dim)'; }
    if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }

    try {
        var res = await fetch('/api/v1/auth/verify-pin', { method: 'POST', headers: getHeaders(), body: JSON.stringify({ pin: pin }) });
        if (res.status === 428) { if (btn) { btn.disabled = false; btn.textContent = 'Unlock'; } _redirectToSecuritySetup(null); return; }
        if (!res.ok) {
            var d = await safeJson(res);
            var attempts = _getPinAttempts() + 1;
            _setPinAttempts(attempts);
            var remaining = _PIN_MAX_ATTEMPTS - attempts;
            if (remaining <= 0) {
                _setPinLockedUntil(Math.floor(Date.now() / 1000) + _PIN_LOCKOUT_SECONDS);
                _setPinAttempts(0);
                if (errEl) { errEl.textContent = 'Too many failed attempts. Locked for 5 minutes.'; errEl.style.color = 'var(--error)'; }
            } else {
                if (errEl) { errEl.textContent = 'Incorrect PIN. ' + remaining + ' attempt(s) remaining.'; errEl.style.color = 'var(--error)'; }
            }
            if (pinInput) { pinInput.value = ''; pinInput.focus(); }
            if (btn) { btn.disabled = false; btn.textContent = 'Unlock'; }
            return;
        }
        // Success — clear lockout
        _clearPinLock();
        _PROFILE.set(pin);
        if (errEl) errEl.textContent = '';
        if (btn) { btn.disabled = false; btn.textContent = 'Unlocked ✓'; }
        var gateEl = document.getElementById('profilePinGate');
        var bodyEl = document.getElementById('profileFormBody');
        if (gateEl) gateEl.style.display = 'none';
        if (bodyEl) bodyEl.style.display = 'block';
        _prefillProfileFields();
        calcProfileCompletion();
    } catch (err) {
        if (errEl) { errEl.textContent = 'Network error. Please try again.'; errEl.style.color = 'var(--error)'; }
        if (btn) { btn.disabled = false; btn.textContent = 'Unlock'; }
    }
}

function togglePSE(id) {
    var body = document.getElementById(id);
    var icon = document.getElementById(id + '-icon');
    if (!body) return;
    body.classList.toggle('open');
    if (icon) icon.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : '';
}

function updateVisitBtn(btnId, url) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    if (url && url.trim()) { btn.href = url.trim(); btn.style.display = 'flex'; }
    else { btn.style.display = 'none'; }
}

function watchProfileUrls() {
    var p = document.getElementById('updatePortfolio');
    var pp = document.getElementById('updatePastProject');
    if (p) p.addEventListener('input', function () { updateVisitBtn('portfolioVisitBtn', p.value); });
    if (pp) pp.addEventListener('input', function () { updateVisitBtn('pastProjectVisitBtn', pp.value); });
}

// ── Strict field value — returns null for empty OR unchanged from saved value ──
function _fieldVal(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var v = el.value.trim();
    return v === '' ? null : v;
}

// Returns true if the field has a NEW value different from what's saved in currentUser
function _isNewValue(fieldId, savedKey) {
    var el = document.getElementById(fieldId);
    if (!el) return false;
    var v = el.value.trim();
    if (!v) return false;
    var saved = (currentUser && currentUser[savedKey]) ? String(currentUser[savedKey]).trim() : '';
    return v !== saved;
}

// ── Per-section save ──
async function saveProfileSection(section) {
    var msgIds = {
        professional: 'msgProf',
        past_project: 'msgPast',
        emergency_name: 'msgECName',
        emergency_contact: 'msgECContact',
        emergency_id: 'msgECId',
        kyc: 'msgKYC'
    };
    var msgId = msgIds[section] || 'msgProf';

    var pin = _PROFILE.get();
    if (!pin) {
        _showMsg(msgId, '🔒 Enter your PIN and click Unlock first.', 'error');
        var gateEl = document.getElementById('profilePinGate');
        if (gateEl) gateEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    var activeBtn = document.querySelector('[data-save-section="' + section + '"]');
    var origLabel = activeBtn ? activeBtn.innerHTML : '';
    if (activeBtn) { activeBtn.disabled = true; activeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }
    _showMsg(msgId, 'Saving…');

    try {
        var payload = { transaction_pin: pin };

        // ── PROFESSIONAL INFO ──
        if (section === 'professional') {
            var role = _fieldVal('updateRole');
            var bio = _fieldVal('updateBio');
            var portfolio = _fieldVal('updatePortfolio');

            // Must have at least one field filled
            if (!role && !bio && !portfolio) {
                _showMsg(msgId, 'Please fill in at least one field (Role, Bio, or Portfolio URL).', 'error');
                if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; }
                return;
            }
            payload.filmmaker_role = role;
            payload.bio = bio;
            payload.portfolio_url = portfolio;

            // ── PAST PROJECT ──
        } else if (section === 'past_project') {
            var pastUrl = _fieldVal('updatePastProject');
            if (!pastUrl) {
                _showMsg(msgId, 'Please enter a past project URL or upload a file first.', 'error');
                if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; }
                return;
            }
            payload.past_project_url = pastUrl;
            payload.past_project_urls = [pastUrl];

            // ── EMERGENCY NAME + RELATIONSHIP (+5 pts) ──
        } else if (section === 'emergency_name') {
            var ecName = _fieldVal('updateECName');
            var ecRel = _fieldVal('updateECRelation');
            if (!ecName || !ecRel) {
                _showMsg(msgId, 'Both Contact Name and Relationship are required.', 'error');
                if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; }
                return;
            }
            // Check if these are genuinely different from saved
            var nameChanged = ecName !== (currentUser && currentUser.emergency_contact_name ? String(currentUser.emergency_contact_name).trim() : '');
            var relChanged = ecRel !== (currentUser && currentUser.emergency_contact_relationship ? String(currentUser.emergency_contact_relationship).trim() : '');
            if (!nameChanged && !relChanged) {
                _showMsg(msgId, 'No changes detected. Edit the fields to save new data.', 'error');
                if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; }
                return;
            }
            payload.emergency_contact_name = ecName;
            payload.emergency_contact_relationship = ecRel;

            // ── EMERGENCY PHONE + EMAIL (+5 pts) ──
        } else if (section === 'emergency_contact') {
            var ecPhone = _fieldVal('updateECPhone');
            var ecEmail = _fieldVal('updateECEmail');
            if (!ecPhone || !ecEmail) {
                _showMsg(msgId, 'Both Phone Number and Email are required.', 'error');
                if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; }
                return;
            }
            if (!ecEmail.includes('@')) {
                _showMsg(msgId, 'Please enter a valid email address.', 'error');
                if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; }
                return;
            }
            var phoneChanged = ecPhone !== (currentUser && currentUser.emergency_contact_phone ? String(currentUser.emergency_contact_phone).trim() : '');
            var emailChanged = ecEmail !== (currentUser && currentUser.emergency_contact_email ? String(currentUser.emergency_contact_email).trim() : '');
            if (!phoneChanged && !emailChanged) {
                _showMsg(msgId, 'No changes detected. Edit the fields to save new data.', 'error');
                if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; }
                return;
            }
            payload.emergency_contact_phone = ecPhone;
            payload.emergency_contact_email = ecEmail;

            // ── EC ID PHOTO (+5 pts) ──
        } else if (section === 'emergency_id') {
            var ecIdInput = document.getElementById('ecIdFileInput');
            var ecIdFile = ecIdInput && ecIdInput.files[0];
            if (!ecIdFile) {
                _showMsg(msgId, 'Please select an EC ID photo to upload.', 'error');
                if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; }
                return;
            }
            _showMsg(msgId, 'Uploading EC ID…');
            try {
                payload.emergency_contact_id_url = await _uploadEcIdFile(ecIdFile);
            } catch (e) {
                _showMsg(msgId, 'EC ID upload failed: ' + e.message, 'error');
                if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; }
                return;
            }

            // ── KYC / IDENTITY VERIFICATION ──
        } else if (section === 'kyc') {
            var idFileInput = document.getElementById('idPhotoFile');
            var selfieFileInput = document.getElementById('selfiePhotoFile');
            var idFile = idFileInput && idFileInput.files[0];
            var selfieFile = selfieFileInput && selfieFileInput.files[0];
            var rawIdType = _fieldVal('updateIdType');
            var rawExpiry = _fieldVal('updateIdExpiry');

            var idPhotoUrl = (currentUser && currentUser.id_photo_url) ? currentUser.id_photo_url : null;
            var selfieUrl = (currentUser && currentUser.selfie_photo_url) ? currentUser.selfie_photo_url : null;

            // Must upload at least one new file or select ID type for first time
            if (!idFile && !selfieFile && !rawIdType && (idPhotoUrl || selfieUrl)) {
                _showMsg(msgId, 'No new files selected. Upload a new ID or selfie to resubmit.', 'error');
                if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; }
                return;
            }
            if (!idFile && !selfieFile && !rawIdType) {
                _showMsg(msgId, 'Please upload your ID photo, selfie, or select an ID type.', 'error');
                if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; }
                return;
            }

            if (idFile) {
                _showMsg(msgId, 'Uploading front of ID…');
                try { idPhotoUrl = await _uploadIdFile(idFile); }
                catch (e) { _showMsg(msgId, 'ID upload failed: ' + e.message, 'error'); if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; } return; }
            }
            if (selfieFile) {
                _showMsg(msgId, 'Uploading selfie…');
                try { selfieUrl = await _uploadSelfieFile(selfieFile); }
                catch (e) { _showMsg(msgId, 'Selfie upload failed: ' + e.message, 'error'); if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; } return; }
            }

            if (rawIdType) payload.id_type = rawIdType;
            if (rawExpiry) payload.id_expiry_date = rawExpiry;
            if (idPhotoUrl) payload.id_photo_url = idPhotoUrl;
            if (selfieUrl) payload.selfie_photo_url = selfieUrl;
        }

        _showMsg(msgId, 'Sending to server…');
        var res = await fetch('/api/v1/auth/update-profile', {
            method: 'PATCH', headers: getHeaders(), body: JSON.stringify(payload)
        });
        var data = await safeJson(res);

        if (res.status === 428) {
            _redirectToSecuritySetup(msgId);
            if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; }
            return;
        }

        if (res.ok) {
            if (data) currentUser = Object.assign(currentUser || {}, data);
            _clearSectionFields(section);
            // Refresh badges but skip re-filling the just-saved section
            // (its badge shows "Pending" and fields stay empty so user knows it was submitted)
            _prefillProfileFieldsExcept(section);
            calcProfileCompletion();
            if (typeof loadDashboard === 'function') loadDashboard();

            var verStatus = (data && data.verification_status) ? data.verification_status : 'pending';
            var okMsg = '✅ ' + _getSectionLabel(section);
            if (verStatus === 'verified') okMsg += ' ✓ Already verified.';
            _showMsg(msgId, okMsg, 'success');
            showSaveToast(okMsg, 'success');
            if (verStatus === 'pending') startApprovalPolling();
        } else {
            var errMsg = 'Save failed.';
            if (data) {
                if (typeof data.detail === 'string') errMsg = data.detail;
                else if (Array.isArray(data.detail)) {
                    var _fL = { 'id_expiry_date': 'ID Expiry Date', 'id_type': 'ID Type', 'id_photo_url': 'Front of ID', 'selfie_photo_url': 'Selfie with ID', 'filmmaker_role': 'Filmmaker Role', 'portfolio_url': 'Portfolio URL', 'emergency_contact_name': 'Contact Name', 'emergency_contact_phone': 'Phone Number', 'emergency_contact_email': 'Contact Email', 'past_project_url': 'Past Project URL' };
                    errMsg = data.detail.map(function (e) {
                        var rf = (e.loc && e.loc.length > 1) ? e.loc[e.loc.length - 1] : '';
                        var lbl = _fL[rf] || rf.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
                        var m2 = (e.msg || '').replace(/Value error,\s*/i, '');
                        return (lbl ? lbl + ': ' : '') + m2;
                    }).join(' | ');
                }
            }
            _showMsg(msgId, errMsg, 'error');
            showSaveToast(errMsg, 'error');
        }

    } catch (err) {
        console.error('[saveProfileSection]', err);
        _showMsg(msgId, 'Network error — please try again.', 'error');
        showSaveToast('Network error — please try again.', 'error');
    } finally {
        if (activeBtn) { activeBtn.disabled = false; activeBtn.innerHTML = origLabel; }
    }
}

// ── Approval polling ──
var _approvalPoll = null;
function startApprovalPolling() {
    if (_approvalPoll) clearInterval(_approvalPoll);
    _approvalPoll = setInterval(async function () {
        try {
            var res = await fetch('/api/v1/auth/me', { headers: getHeaders() });
            if (!res.ok) return;
            var u = await res.json();
            if (u.verification_status === 'verified' && currentUser && currentUser.verification_status !== 'verified') {
                currentUser = u;
                _prefillProfileFields();
                calcProfileCompletion();
                if (typeof loadDashboard === 'function') loadDashboard();
                showSaveToast('✅ Profile Approved! Trust points unlocked! 🎉', 'success');
                clearInterval(_approvalPoll);
            }
        } catch (e) { /* silent */ }
    }, 10000);
    setTimeout(function () { if (_approvalPoll) { clearInterval(_approvalPoll); _approvalPoll = null; } }, 300000);
}

// ── Clear section fields after a successful save ──
// So user sees clean state (badge turns "Edit", fields empty for next change)
function _prefillProfileFieldsExcept(skip) {
    if (!currentUser) return;
    var ap = currentUser.approved_sections || {};
    var pn = currentUser.pending_changes || {};
    var rj = currentUser.rejected_sections || {};
    function se(id, val) { var e = document.getElementById(id); if (e && !e.value.trim()) e.value = val || ''; }
    if (skip !== 'professional') { se('updateRole', currentUser.filmmaker_role); se('updateBio', currentUser.bio); se('updatePortfolio', currentUser.portfolio_url); }
    if (skip !== 'past_project') {
        var pu = currentUser.past_project_url || (Array.isArray(currentUser.past_project_urls) && currentUser.past_project_urls.length ? currentUser.past_project_urls[0] : '');
        var pi = document.getElementById('updatePastProject'); if (pi && !pi.value.trim()) pi.value = pu || '';
        if (typeof updateVisitBtn === 'function') updateVisitBtn('pastProjectVisitBtn', pu);
    }
    if (skip !== 'emergency_name') { se('updateECName', currentUser.emergency_contact_name); se('updateECRelation', currentUser.emergency_contact_relationship); }
    if (skip !== 'emergency_contact') { se('updateECPhone', currentUser.emergency_contact_phone); se('updateECEmail', currentUser.emergency_contact_email); }
    if (currentUser.id_type) { var st = document.getElementById('updateIdType'); if (st && !st.value) st.value = currentUser.id_type; }
    if (currentUser.id_expiry_date) { var ex = document.getElementById('updateIdExpiry'); if (ex && !ex.value) ex.value = currentUser.id_expiry_date; }
    if (typeof updateVisitBtn === 'function') updateVisitBtn('portfolioVisitBtn', currentUser.portfolio_url);
    if (currentUser.emergency_contact_id_url) { var en = document.getElementById('ecIdFileName'); var ei = document.getElementById('ecIdFileInput'); if (en && !(ei && ei.files && ei.files.length)) en.textContent = '✓ EC ID already uploaded'; }
    if (currentUser.id_photo_url) { var idn = document.getElementById('idFrontName'); var idi = document.getElementById('idPhotoFile'); if (idn && !(idi && idi.files && idi.files.length)) idn.textContent = '✓ ID already uploaded'; }
    if (currentUser.selfie_photo_url) { var sfn = document.getElementById('idSelfieName'); var sfi = document.getElementById('selfiePhotoFile'); if (sfn && !(sfi && sfi.files && sfi.files.length)) sfn.textContent = '✓ Selfie already uploaded'; }
    // Refresh all badges
    _updateSectionBadge('pse-prof-badge', !!(currentUser.filmmaker_role || currentUser.bio || currentUser.portfolio_url), !!ap.professional, !!(pn.filmmaker_role !== undefined || pn.bio !== undefined || pn.portfolio_url !== undefined), !!rj.professional);
    _updateSectionBadge('pse-past-badge', !!(currentUser.past_project_url || (Array.isArray(currentUser.past_project_urls) && currentUser.past_project_urls.length)), !!ap.past_project, !!(pn.past_project_url !== undefined || pn.past_project_urls !== undefined), !!rj.past_project);
    _updateSectionBadge('pse-ec-name-badge', !!(currentUser.emergency_contact_name), !!ap.ec_name, !!(pn.emergency_contact_name !== undefined || pn.emergency_contact_relationship !== undefined), !!rj.ec_name);
    _updateSectionBadge('pse-ec-contact-badge', !!(currentUser.emergency_contact_phone), !!ap.ec_contact, !!(pn.emergency_contact_phone !== undefined || pn.emergency_contact_email !== undefined), !!rj.ec_contact);
    _updateSectionBadge('pse-ec-id-badge', !!currentUser.emergency_contact_id_url, !!ap.ec_id, !!(pn.emergency_contact_id_url !== undefined), !!rj.ec_id);
    _updateSectionBadge('pse-kyc-badge', !!(currentUser.id_photo_url || currentUser.selfie_photo_url), !!(currentUser.is_verified), !!(pn.id_photo_url !== undefined || pn.selfie_photo_url !== undefined || pn.id_type !== undefined), !!rj.kyc);
    _updateECOuterBadge(ap, pn, rj);
}


function _clearSectionFields(section) {
    var clrFields = {
        professional: ['updateRole', 'updateBio', 'updatePortfolio'],
        past_project: ['updatePastProject'],
        emergency_name: ['updateECName', 'updateECRelation'],
        emergency_contact: ['updateECPhone', 'updateECEmail'],
        emergency_id: [],
        kyc: []
    };
    var fields = clrFields[section] || [];
    fields.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    // For file inputs, reset the file name labels
    if (section === 'emergency_id') {
        var ecFileName = document.getElementById('ecIdFileName');
        if (ecFileName) ecFileName.textContent = '✓ EC ID saved — upload new to replace';
        var ecInput = document.getElementById('ecIdFileInput');
        if (ecInput) ecInput.value = '';
    }
    if (section === 'kyc') {
        var idFront = document.getElementById('idFrontName');
        var idSelfie = document.getElementById('idSelfieName');
        var idInput = document.getElementById('idPhotoFile');
        var selfieInput = document.getElementById('selfiePhotoFile');
        if (idFront) idFront.textContent = '✓ ID saved — upload new to replace';
        if (idSelfie) idSelfie.textContent = '✓ Selfie saved — upload new to replace';
        if (idInput) idInput.value = '';
        if (selfieInput) selfieInput.value = '';
    }
}

function _getSectionLabel(section) {
    return {
        professional: 'Professional info saved. Pending admin review.',
        past_project: 'Past project saved. Pending admin review.',
        emergency_name: 'Name & Relationship saved. Pending admin review.',
        emergency_contact: 'Phone & Email saved. Pending admin review.',
        emergency_id: 'EC ID photo saved. Pending admin review.',
        kyc: 'KYC submitted. Pending admin identity verification.'
    }[section] || 'Saved!';
}

function _showMsg(id, text, type) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'modal-msg' + (type ? ' ' + type : '');
}

async function _uploadEcIdFile(file) {
    // Separate endpoint — does NOT overwrite id_photo_url (KYC field)
    var fd = new FormData(); fd.append('file', file);
    var res = await fetch('/api/v1/uploads/ec-id-doc', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: fd
    });
    if (res.ok) { var d = await res.json(); return d.ec_id_url || null; }
    var err = await res.json().catch(function () { return {}; });
    throw new Error(err.detail || 'EC ID upload failed');
}

async function _uploadIdFile(file) {
    var fd = new FormData(); fd.append('file', file);
    var res = await fetch('/api/v1/uploads/identity-doc', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: fd
    });
    if (res.ok) { var d = await res.json(); return d.id_photo_url || null; }
    var err = await res.json().catch(function () { return {}; });
    throw new Error(err.detail || 'ID upload failed (' + res.status + ')');
}

async function _uploadSelfieFile(file) {
    var fd = new FormData(); fd.append('file', file);
    var res = await fetch('/api/v1/uploads/selfie-doc', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: fd
    });
    if (res.ok) { var d = await res.json(); return d.selfie_photo_url || null; }
    var err = await res.json().catch(function () { return {}; });
    throw new Error(err.detail || 'Selfie upload failed (' + res.status + ')');
}

async function uploadPastProjectFile(input, idx) {
    var file = input.files[0]; if (!file) return;
    var nameEl = document.getElementById('pastProjectUploadName');
    var statusEl = document.getElementById('pastProjectUploadStatus');
    if (nameEl) nameEl.textContent = file.name;
    if (statusEl) { statusEl.textContent = 'Uploading…'; statusEl.style.color = 'var(--text-dim)'; }
    try {
        var fd = new FormData(); fd.append('file', file);
        var res = await fetch('/api/v1/uploads/past-project', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: fd
        });
        if (res.ok) {
            var d = await res.json();
            var url = d.url || d.file_url || null;
            if (url) {
                // Always put in the single main input
                var el = document.getElementById('updatePastProject');
                if (el) { el.value = url; updateVisitBtn('pastProjectVisitBtn', url); }
                if (statusEl) { statusEl.textContent = '✓ Uploaded'; statusEl.style.color = 'var(--success)'; }
            } else {
                if (statusEl) { statusEl.textContent = 'Upload error: no URL returned.'; statusEl.style.color = 'var(--error)'; }
            }
        } else {
            var errD = await res.json().catch(function () { return {}; });
            if (statusEl) { statusEl.textContent = errD.detail || 'Upload failed.'; statusEl.style.color = 'var(--error)'; }
        }
    } catch (e) {
        if (statusEl) { statusEl.textContent = 'Network error.'; statusEl.style.color = 'var(--error)'; }
    }
}

function handleLoanAssetFile(type, input) {
    var file = input.files[0]; if (!file) return;
    var idMap = { Script: 'loanScriptFileName', Lookbook: 'lookbookFileName', Trailer: 'trailerFileName' };
    var el = document.getElementById(idMap[type]);
    if (el) { el.textContent = '✓ ' + file.name; el.style.color = 'var(--gold)'; }
}

function showSaveToast(msg, type) {
    type = type || 'success';
    var toast = document.getElementById('_saveToast');
    if (!toast) {
        toast = document.createElement('div'); toast.id = '_saveToast';
        toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.85);z-index:99999;padding:1.1rem 2rem;border-radius:0.85rem;font-size:0.92rem;font-weight:600;text-align:center;max-width:380px;min-width:240px;box-shadow:0 16px 48px rgba(0,0,0,0.6);transition:opacity 0.25s ease,transform 0.25s ease;opacity:0;pointer-events:none';
        document.body.appendChild(toast);
    }
    var isOk = (type === 'success');
    toast.style.background = 'var(--bg-card,#1c1c1c)';
    toast.style.border = '1.5px solid ' + (isOk ? 'var(--success,#22c55e)' : 'var(--error,#ef4444)');
    toast.style.color = isOk ? 'var(--success,#22c55e)' : 'var(--error,#ef4444)';
    toast.innerHTML = '<i class="fas fa-' + (isOk ? 'circle-check' : 'circle-xmark') + '" style="margin-right:.5rem"></i>' + msg;
    requestAnimationFrame(function () { toast.style.opacity = '1'; toast.style.transform = 'translate(-50%,-50%) scale(1)'; });
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.style.opacity = '0'; toast.style.transform = 'translate(-50%,-50%) scale(0.85)'; }, 3500);
}

// Legacy aliases
function toggleProfileEdit() { if (typeof openProfileModal === 'function') openProfileModal(); }
async function uploadIdPhoto(file) { return _uploadIdFile(file); }
async function uploadSelfiePhoto(file) { return _uploadSelfieFile(file); }
async function _uploadFile(file) { return _uploadIdFile(file); }
// ─────────────────────────────────────────────
// PROFILE MODAL — HTML injection
// Populates #profileModalBox with the full edit
// form on first open. user-profile.js then works
// against the injected DOM exactly as before.
// ─────────────────────────────────────────────
function _initProfileModalBody() {
    var box = document.getElementById('profileModalBox');
    if (!box || box.dataset.initialized) return;
    // Replace inner content (header stays, add body below it)
    var existingHeader = box.querySelector('.modal-header');
    box.innerHTML = '';
    if (existingHeader) box.appendChild(existingHeader);
    var inner = document.createElement('div');
    inner.id = 'profileModalInner';
    inner.innerHTML = `                            <h2><i class="fas fa-circle-user icon-gold-mr"></i>Complete Your Profile</h2>
                            <button class="modal-close" onclick="closeModal('profileModal')"><i
                                    class="fas fa-times"></i></button>
                        </div>

                        <!-- Completion Progress Bar -->
                        <div id="profileCompletionBar" class="profile-completion-bar">
                            <div
                                style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                                <span style="font-size:0.85rem; font-weight:600;">Profile Completion</span>
                                <span id="profileCompletionPct"
                                    style="font-size:0.85rem; font-weight:700; color:var(--gold);">0%</span>
                            </div>
                            <div class="completion-progress">
                                <div id="profileCompletionFill" class="completion-fill" style="width:0%;"></div>
                            </div>
                            <div style="font-size:0.7rem; color:var(--text-dim); margin-top:0.5rem;">
                                Earn up to 50 trust points by completing all sections
                            </div>
                        </div>

                        <!-- PIN gate (top of modal) -->
                        <div id="profilePinGate" class="pin-gate-wrap" style="margin:1.5rem;">
                            <div class="pin-gate-lock-icon"><i class="fas fa-lock"></i></div>
                            <p class="pin-gate-prompt">Enter your Transaction PIN to unlock profile editing</p>
                            <div class="pin-gate-input-row">
                                <input type="password" id="profilePinInput" class="pin-gate-input" maxlength="6"
                                    inputmode="numeric" placeholder="••••••"
                                    onkeydown="if(event.key==='Enter')unlockProfileModal()">
                            </div>
                            <button class="btn-gold" onclick="unlockProfileModal()">Unlock</button>
                            <p id="profilePinError" class="pin-gate-error"></p>
                        </div>

                        <!-- Form sections (shown after PIN) -->
                        <div id="profileFormBody" style="display:none; padding:0 1.5rem 1.5rem;">

                            <!-- Professional Info -->
                            <div class="profile-edit-section">
                                <div class="pse-header" onclick="togglePSE('pse-prof')">
                                    <div class="pse-title">
                                        <i class="fas fa-video icon-gold"></i>
                                        Professional Verification <span class="pse-badge">+5 pts</span><span
                                            class="pse-status-badge" id="pse-prof-badge"></span>
                                    </div>
                                    <i class="fas fa-chevron-down pse-chevron" id="pse-prof-icon"></i>
                                </div>
                                <div class="pse-body" id="pse-prof">
                                    <p class="pse-desc">Add your filmmaker role, bio and portfolio to earn +5 trust
                                        points
                                        after admin review.</p>
                                    <div class="form-grid-2">
                                        <div class="fld"><label>Filmmaker Role</label>
                                            <select id="updateRole">
                                                <option>Director</option>
                                                <option>Producer</option>
                                                <option>Cinematographer</option>
                                                <option>Screenwriter</option>
                                                <option>Editor</option>
                                                <option>Sound Designer</option>
                                            </select>
                                        </div>
                                        <div class="fld"><label>Portfolio URL <span class="fld-hint">IMDb / Behance /
                                                    LinkedIn</span></label>
                                            <input type="url" id="updatePortfolio" placeholder="https://imdb.com/...">
                                        </div>
                                        <div class="fld fld-full"><label>Professional Bio <span class="fld-hint">Max
                                                    1000
                                                    chars</span></label>
                                            <textarea id="updateBio" rows="4" maxlength="1000"
                                                placeholder="Describe your filmmaking background, past works and awards..."></textarea>
                                        </div>
                                    </div>
                                    <button class="btn-gold psc-save-btn" onclick="saveProfileSection('professional')">
                                        <i class="fas fa-save"></i> Save Professional Verification
                                    </button>
                                    <p class="modal-msg modal-msg-sm" id="msgProf"></p>
                                </div>
                            </div>

                            <!-- Past Project -->
                            <div class="profile-edit-section">
                                <div class="pse-header" onclick="togglePSE('pse-past')">
                                    <div class="pse-title">
                                        <i class="fas fa-film icon-gold"></i>
                                        Past Project <span class="pse-badge">+5 pts</span><span class="pse-status-badge"
                                            id="pse-past-badge"></span>
                                    </div>
                                    <i class="fas fa-chevron-down pse-chevron" id="pse-past-icon"></i>
                                </div>
                                <div class="pse-body" id="pse-past">
                                    <p class="pse-desc">Link or upload a past film project as proof of work.</p>
                                    <div class="fld fld-full">
                                        <label>Past Project URL <span class="fld-hint">Vimeo / YouTube — or upload a
                                                file</span></label>
                                        <div class="past-project-url-row">
                                            <input type="url" id="updatePastProject"
                                                placeholder="https://vimeo.com/...">
                                            <label for="pastProjectFileInput" class="upload-icon-label">
                                                <i class="fas fa-upload"></i>
                                            </label>
                                            <input type="file" id="pastProjectFileInput"
                                                accept="video/mp4,video/quicktime,application/pdf,image/*"
                                                style="display:none" onchange="uploadPastProjectFile(this)">
                                        </div>
                                        <div class="upload-status-row">
                                            <span id="pastProjectUploadName" class="upload-filename-gold"></span>
                                            <span id="pastProjectUploadStatus"
                                                style="margin-left:0.5rem;font-size:0.75rem"></span>
                                        </div>
                                    </div>
                                    <button class="btn-gold psc-save-btn" onclick="saveProfileSection('past_project')">
                                        <i class="fas fa-save"></i> Save Past Project
                                    </button>
                                    <p class="modal-msg modal-msg-sm" id="msgPast"></p>
                                </div>
                            </div>

                            <!-- Emergency Contact -->
                            <div class="profile-edit-section">
                                <div class="pse-header" onclick="togglePSE('pse-ec')">
                                    <div class="pse-title">
                                        <i class="fas fa-phone-alt icon-gold"></i>
                                        Emergency Contact <span class="pse-badge">+15 pts</span><span
                                            class="pse-status-badge" id="pse-ec-badge"></span>
                                    </div>
                                    <i class="fas fa-chevron-down pse-chevron" id="pse-ec-icon"></i>
                                </div>
                                <div class="pse-body" id="pse-ec">
                                    <p class="pse-desc">Each pair below earns separate trust points. Save each pair
                                        independently.</p>

                                    <!-- Pair 1: Name + Relationship (+5 pts) -->
                                    <div
                                        style="border:1.5px solid rgba(96,165,250,0.3);border-radius:0.6rem;padding:1rem;margin-bottom:1rem;background:rgba(96,165,250,0.03)">
                                        <p
                                            style="font-size:0.75rem;font-weight:600;color:#60a5fa;margin:0 0 0.75rem 0;text-transform:uppercase;letter-spacing:0.05em;">
                                            <i class="fas fa-user" style="margin-right:0.4rem"></i>Name &amp;
                                            Relationship
                                            <span class="pse-badge" style="margin-left:0.5rem">+5 pts</span><span
                                                class="pse-status-badge" id="pse-ec-name-badge"></span>
                                        </p>
                                        <div class="form-grid-2">
                                            <div class="fld"><label>Contact Name</label>
                                                <input type="text" id="updateECName" placeholder="Full Name">
                                            </div>
                                            <div class="fld"><label>Relationship</label>
                                                <input type="text" id="updateECRelation"
                                                    placeholder="e.g. Spouse, Parent">
                                            </div>
                                        </div>
                                        <button class="btn-gold psc-save-btn" data-save-section="emergency_name"
                                            onclick="saveProfileSection('emergency_name')">
                                            <i class="fas fa-save"></i> Save Name &amp; Relationship
                                        </button>
                                        <p class="modal-msg modal-msg-sm" id="msgECName"></p>
                                    </div>

                                    <!-- Pair 2: Phone + Email (+5 pts) -->
                                    <div
                                        style="border:1.5px solid rgba(34,197,94,0.3);border-radius:0.6rem;padding:1rem;margin-bottom:1rem;background:rgba(34,197,94,0.03)">
                                        <p
                                            style="font-size:0.75rem;font-weight:600;color:#22c55e;margin:0 0 0.75rem 0;text-transform:uppercase;letter-spacing:0.05em;">
                                            <i class="fas fa-phone" style="margin-right:0.4rem"></i>Phone &amp; Email
                                            <span class="pse-badge" style="margin-left:0.5rem">+5 pts</span><span
                                                class="pse-status-badge" id="pse-ec-contact-badge"></span>
                                        </p>
                                        <div class="form-grid-2">
                                            <div class="fld"><label>Phone Number</label>
                                                <input type="tel" id="updateECPhone" placeholder="09171234567"
                                                    inputmode="numeric" pattern="[0-9+\\-\\s]*">
                                            </div>
                                            <div class="fld"><label>Email</label>
                                                <input type="email" id="updateECEmail" placeholder="contact@email.com">
                                            </div>
                                        </div>
                                        <button class="btn-gold psc-save-btn" data-save-section="emergency_contact"
                                            onclick="saveProfileSection('emergency_contact')">
                                            <i class="fas fa-save"></i> Save Phone &amp; Email
                                        </button>
                                        <p class="modal-msg modal-msg-sm" id="msgECContact"></p>
                                    </div>

                                    <!-- Pair 3: EC ID Photo (+5 pts) -->
                                    <div
                                        style="border:1.5px solid rgba(245,158,11,0.35);border-radius:0.6rem;padding:1rem;background:rgba(245,158,11,0.03)">
                                        <p
                                            style="font-size:0.75rem;font-weight:600;color:#f59e0b;margin:0 0 0.75rem 0;text-transform:uppercase;letter-spacing:0.05em;">
                                            <i class="fas fa-address-card" style="margin-right:0.4rem"></i>EC ID Photo
                                            <span class="pse-badge" style="margin-left:0.5rem">+5 pts</span><span
                                                class="pse-status-badge" id="pse-ec-id-badge"></span>
                                        </p>
                                        <div class="fld fld-full">
                                            <label for="ecIdFileInput" class="file-upload-label">
                                                <i class="fas fa-id-card file-upload-label-icon"></i>
                                                <span id="ecIdFileName">Click to upload EC ID photo or PDF</span>
                                            </label>
                                            <input type="file" id="ecIdFileInput" accept="image/*,application/pdf"
                                                style="display:none"
                                                onchange="document.getElementById('ecIdFileName').textContent='✓ '+this.files[0].name">
                                        </div>
                                        <button class="btn-gold psc-save-btn" data-save-section="emergency_id"
                                            onclick="saveProfileSection('emergency_id')">
                                            <i class="fas fa-save"></i> Save EC ID Photo
                                        </button>
                                        <p class="modal-msg modal-msg-sm" id="msgECId"></p>
                                    </div>
                                </div>
                            </div>

                            <!-- KYC -->
                            <div class="profile-edit-section">
                                <div class="pse-header" onclick="togglePSE('pse-kyc')">
                                    <div class="pse-title">
                                        <i class="fas fa-id-card icon-gold"></i>
                                        Identity Verification (KYC)
                                        <span class="pse-badge pse-badge-kyc">+25 pts</span><span
                                            class="pse-status-badge" id="pse-kyc-badge"></span>
                                    </div>
                                    <i class="fas fa-chevron-down pse-chevron" id="pse-kyc-icon"></i>
                                </div>
                                <div class="pse-body" id="pse-kyc">
                                    <p class="pse-desc">Upload a valid Philippine ID and selfie. Admin verifies and
                                        unlocks
                                        25 trust points.</p>
                                    <div class="form-grid-2">
                                        <div class="fld"><label>ID Type</label>
                                            <select id="updateIdType">
                                                <option value="">-- Select ID Type --</option>
                                                <option>Philippine National ID (PhilID)</option>
                                                <option>ePhilID</option>
                                                <option>Passport</option>
                                                <option>Driver's License</option>
                                                <option>UMID</option>
                                                <option>SSS ID</option>
                                                <option>PRC ID</option>
                                                <option>Postal ID (Digital/Improved)</option>
                                                <option>Voter's ID</option>
                                                <option>PhilHealth ID</option>
                                                <option>TIN ID</option>
                                                <option>Pag-IBIG ID</option>
                                                <option>NBI Clearance</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="fld">
                                        <label>ID Expiry Date</label>
                                        <div class="date-picker-box"
                                            onclick="(function(){var i=document.getElementById('updateIdExpiry');try{i.showPicker();}catch(e){i.focus();}})()">
                                            <i class="fas fa-calendar-alt"
                                                style="color:var(--gold);font-size:0.85rem;flex-shrink:0"></i>
                                            <span id="updateIdExpiryDisplay"
                                                style="flex:1;color:var(--text-dim);font-size:0.85rem">Select expiry
                                                date</span>
                                            <i class="fas fa-chevron-down"
                                                style="color:var(--text-dim);font-size:0.7rem;flex-shrink:0"></i>
                                            <input type="date" id="updateIdExpiry"
                                                style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px"
                                                onchange="document.getElementById('updateIdExpiryDisplay').textContent=this.value?new Date(this.value+'T00:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):'Select expiry date';document.getElementById('updateIdExpiryDisplay').style.color=this.value?'var(--text)':'var(--text-dim)'">
                                        </div>
                                    </div>
                                    <div class="fld">
                                        <label>Front of ID <span class="fld-hint">+5 pts</span></label>
                                        <label for="idPhotoFile" class="file-upload-label">
                                            <i class="fas fa-id-card file-upload-label-icon"></i>
                                            <span id="idFrontName">Click to upload</span>
                                        </label>
                                        <input type="file" id="idPhotoFile" accept="image/*" style="display:none"
                                            onchange="document.getElementById('idFrontName').textContent='✓ '+this.files[0].name">
                                    </div>
                                    <div class="fld">
                                        <label>Selfie with ID <span class="fld-hint">+5 pts</span></label>
                                        <label for="selfiePhotoFile" class="file-upload-label">
                                            <i class="fas fa-camera file-upload-label-icon"></i>
                                            <span id="idSelfieName">Click to upload</span>
                                        </label>
                                        <input type="file" id="selfiePhotoFile" accept="image/*" style="display:none"
                                            onchange="document.getElementById('idSelfieName').textContent='✓ '+this.files[0].name">
                                    </div>
                                    <button class="btn-gold psc-save-btn" onclick="saveProfileSection('kyc')">
                                        <i class="fas fa-save"></i> Submit for Verification
                                    </button>
                                    <p class="modal-msg modal-msg-sm" id="msgKYC"></p>
                                </div>
                            </div>

                    </div><!-- end profileFormBody -->
                </div><!-- end modal-box -->
`;
    box.appendChild(inner);
    box.dataset.initialized = '1';
}

var _origToggleProfileEdit = window.toggleProfileEdit;
window.toggleProfileEdit = function() {
    _initProfileModalBody();
    openModal('profileModal');
    if (typeof initProfileModal === 'function') initProfileModal();
};

// ── Profile section & modal HTML injection ──
function _initProfileSection() {
    var mount = document.getElementById('profileViewMount');
    if (!mount || mount.dataset.init) return;
    mount.dataset.init = '1';
    mount.innerHTML = `            <div class="profile-page-wrap">
                <!-- Profile header -->
                <div class="profile-view-header">
                    <div class="profile-avatar-lg"><i class="fas fa-circle-user"></i></div>
                    <div class="prof-header-info">
                        <div class="prof-name-display" id="profName">--</div>
                        <div class="prof-email-display" id="profEmail">--</div>
                        <div class="prof-badges-row">
                            <span id="profTierBadge" class="prof-tier-badge">Bronze · 0 pts</span>
                            <span id="profVerBadge" class="prof-ver-badge">Unverified</span>
                            <span id="profStatusBadge" class="prof-status-badge">Active</span>
                        </div>
                        <div class="prof-trust-bar-wrap">
                            <div class="prof-trust-bar-labels">
                                <span class="prof-trust-bar-label-text">Trust Score</span>
                                <span id="profScoreLabel" class="prof-trust-score-label">0 / 100</span>
                            </div>
                            <div class="prof-trust-bar-track">
                                <div id="profTrustBar" class="prof-trust-bar-fill"></div>
                            </div>
                        </div>
                    </div>
                    <div class="prof-edit-btn-wrap">
                        <button onclick="openProfileModal()" id="profileEditBtn" class="btn-gold">
                            <i class="fas fa-pen" id="profileEditIcon"></i>
                            <span id="profileEditLabel">Edit Verification</span>
                        </button>
                    </div>
                </div>

                <!-- Read-only info grid -->
                <div class="prof-info-grid">
                    <!-- Row 1: Role | Portfolio -->
                    <div>
                        <div class="prof-info-label">Filmmaker Role</div>
                        <div id="profRoleView" class="prof-info-value">—</div>
                    </div>
                    <div>
                        <div class="prof-info-label">Portfolio URL</div>
                        <div id="profPortfolioView" class="prof-info-value-sm">—</div>
                    </div>
                    <!-- Row 2: Emergency Contact | Bio (scrollable) -->
                    <div>
                        <div class="prof-info-label">Emergency Contact</div>
                        <div id="profECView" class="prof-info-value-sm">—</div>
                        <div id="profECStatusDetail" class="prof-info-label" style="margin-top:0.2rem">0 out of 3
                            sections approved</div>
                    </div>
                    <div>
                        <div class="prof-info-label">Professional Bio</div>
                        <div id="profBioView" class="prof-info-value-bio prof-bio-scroll">—</div>
                    </div>
                    <!-- Row 3: KYC Status (left, below EC) | Interest Rate (right) -->
                    <div>
                        <div class="prof-info-label">KYC Status</div>
                        <div id="profKYCView" class="prof-info-value-sm prof-status-empty">Not submitted</div>
                    </div>
                    <div>
                        <div class="prof-info-label">Interest Rate</div>
                        <div id="profRateView" class="prof-info-value-gold">15% p.a.</div>
                    </div>
                    <!-- Row 4: Past Projects full-width at the bottom -->
                    <div class="prof-info-grid-full prof-past-section">
                        <div class="prof-info-label">Past Projects</div>
                        <div id="profPastProjectView" class="prof-info-value-sm prof-past-hover">—</div>
                    </div>
                </div>

                <!-- Edit area (hidden until Edit Verification clicked) -->
                <div id="profileEditArea" style="display:none;"></div>

                <!-- ══ NEW PROFILE MODAL (Centered Overlay) ══ -->
                <div id="profileModal" class="modal" style="display:none">
                    <div class="modal-box modal-wide" style="max-width:800px; max-height:90vh; overflow-y:auto;">
                        <div class="modal-header">
                            <h2><i class="fas fa-circle-user icon-gold-mr"></i>Complete Your Profile</h2>
                            <button class="modal-close" onclick="closeModal('profileModal')"><i
                                    class="fas fa-times"></i></button>
                        </div>

                        <!-- Completion Progress Bar -->
                        <div id="profileCompletionBar" class="profile-completion-bar">
                            <div
                                style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                                <span style="font-size:0.85rem; font-weight:600;">Profile Completion</span>
                                <span id="profileCompletionPct"
                                    style="font-size:0.85rem; font-weight:700; color:var(--gold);">0%</span>
                            </div>
                            <div class="completion-progress">
                                <div id="profileCompletionFill" class="completion-fill" style="width:0%;"></div>
                            </div>
                            <div style="font-size:0.7rem; color:var(--text-dim); margin-top:0.5rem;">
                                Earn up to 50 trust points by completing all sections
                            </div>
                        </div>

                        <!-- PIN gate (top of modal) -->
                        <div id="profilePinGate" class="pin-gate-wrap" style="margin:1.5rem;">
                            <div class="pin-gate-lock-icon"><i class="fas fa-lock"></i></div>
                            <p class="pin-gate-prompt">Enter your Transaction PIN to unlock profile editing</p>
                            <div class="pin-gate-input-row">
                                <input type="password" id="profilePinInput" class="pin-gate-input" maxlength="6"
                                    inputmode="numeric" placeholder="••••••"
                                    onkeydown="if(event.key==='Enter')unlockProfileModal()">
                            </div>
                            <button class="btn-gold" onclick="unlockProfileModal()">Unlock</button>
                            <p id="profilePinError" class="pin-gate-error"></p>
                        </div>

                        <!-- Form sections (shown after PIN) -->
                        <div id="profileFormBody" style="display:none; padding:0 1.5rem 1.5rem;">

                            <!-- Professional Info -->
                            <div class="profile-edit-section">
                                <div class="pse-header" onclick="togglePSE('pse-prof')">
                                    <div class="pse-title">
                                        <i class="fas fa-video icon-gold"></i>
                                        Professional Verification <span class="pse-badge">+5 pts</span><span
                                            class="pse-status-badge" id="pse-prof-badge"></span>
                                    </div>
                                    <i class="fas fa-chevron-down pse-chevron" id="pse-prof-icon"></i>
                                </div>
                                <div class="pse-body" id="pse-prof">
                                    <p class="pse-desc">Add your filmmaker role, bio and portfolio to earn +5 trust
                                        points
                                        after admin review.</p>
                                    <div class="form-grid-2">
                                        <div class="fld"><label>Filmmaker Role</label>
                                            <select id="updateRole">
                                                <option>Director</option>
                                                <option>Producer</option>
                                                <option>Cinematographer</option>
                                                <option>Screenwriter</option>
                                                <option>Editor</option>
                                                <option>Sound Designer</option>
                                            </select>
                                        </div>
                                        <div class="fld"><label>Portfolio URL <span class="fld-hint">IMDb / Behance /
                                                    LinkedIn</span></label>
                                            <input type="url" id="updatePortfolio" placeholder="https://imdb.com/...">
                                        </div>
                                        <div class="fld fld-full"><label>Professional Bio <span class="fld-hint">Max
                                                    1000
                                                    chars</span></label>
                                            <textarea id="updateBio" rows="4" maxlength="1000"
                                                placeholder="Describe your filmmaking background, past works and awards..."></textarea>
                                        </div>
                                    </div>
                                    <button class="btn-gold psc-save-btn" onclick="saveProfileSection('professional')">
                                        <i class="fas fa-save"></i> Save Professional Verification
                                    </button>
                                    <p class="modal-msg modal-msg-sm" id="msgProf"></p>
                                </div>
                            </div>

                            <!-- Past Project -->
                            <div class="profile-edit-section">
                                <div class="pse-header" onclick="togglePSE('pse-past')">
                                    <div class="pse-title">
                                        <i class="fas fa-film icon-gold"></i>
                                        Past Project <span class="pse-badge">+5 pts</span><span class="pse-status-badge"
                                            id="pse-past-badge"></span>
                                    </div>
                                    <i class="fas fa-chevron-down pse-chevron" id="pse-past-icon"></i>
                                </div>
                                <div class="pse-body" id="pse-past">
                                    <p class="pse-desc">Link or upload a past film project as proof of work.</p>
                                    <div class="fld fld-full">
                                        <label>Past Project URL <span class="fld-hint">Vimeo / YouTube — or upload a
                                                file</span></label>
                                        <div class="past-project-url-row">
                                            <input type="url" id="updatePastProject"
                                                placeholder="https://vimeo.com/...">
                                            <label for="pastProjectFileInput" class="upload-icon-label">
                                                <i class="fas fa-upload"></i>
                                            </label>
                                            <input type="file" id="pastProjectFileInput"
                                                accept="video/mp4,video/quicktime,application/pdf,image/*"
                                                style="display:none" onchange="uploadPastProjectFile(this)">
                                        </div>
                                        <div class="upload-status-row">
                                            <span id="pastProjectUploadName" class="upload-filename-gold"></span>
                                            <span id="pastProjectUploadStatus"
                                                style="margin-left:0.5rem;font-size:0.75rem"></span>
                                        </div>
                                    </div>
                                    <button class="btn-gold psc-save-btn" onclick="saveProfileSection('past_project')">
                                        <i class="fas fa-save"></i> Save Past Project
                                    </button>
                                    <p class="modal-msg modal-msg-sm" id="msgPast"></p>
                                </div>
                            </div>

                            <!-- Emergency Contact -->
                            <div class="profile-edit-section">
                                <div class="pse-header" onclick="togglePSE('pse-ec')">
                                    <div class="pse-title">
                                        <i class="fas fa-phone-alt icon-gold"></i>
                                        Emergency Contact <span class="pse-badge">+15 pts</span><span
                                            class="pse-status-badge" id="pse-ec-badge"></span>
                                    </div>
                                    <i class="fas fa-chevron-down pse-chevron" id="pse-ec-icon"></i>
                                </div>
                                <div class="pse-body" id="pse-ec">
                                    <p class="pse-desc">Each pair below earns separate trust points. Save each pair
                                        independently.</p>

                                    <!-- Pair 1: Name + Relationship (+5 pts) -->
                                    <div
                                        style="border:1.5px solid rgba(96,165,250,0.3);border-radius:0.6rem;padding:1rem;margin-bottom:1rem;background:rgba(96,165,250,0.03)">
                                        <p
                                            style="font-size:0.75rem;font-weight:600;color:#60a5fa;margin:0 0 0.75rem 0;text-transform:uppercase;letter-spacing:0.05em;">
                                            <i class="fas fa-user" style="margin-right:0.4rem"></i>Name &amp;
                                            Relationship
                                            <span class="pse-badge" style="margin-left:0.5rem">+5 pts</span><span
                                                class="pse-status-badge" id="pse-ec-name-badge"></span>
                                        </p>
                                        <div class="form-grid-2">
                                            <div class="fld"><label>Contact Name</label>
                                                <input type="text" id="updateECName" placeholder="Full Name">
                                            </div>
                                            <div class="fld"><label>Relationship</label>
                                                <input type="text" id="updateECRelation"
                                                    placeholder="e.g. Spouse, Parent">
                                            </div>
                                        </div>
                                        <button class="btn-gold psc-save-btn" data-save-section="emergency_name"
                                            onclick="saveProfileSection('emergency_name')">
                                            <i class="fas fa-save"></i> Save Name &amp; Relationship
                                        </button>
                                        <p class="modal-msg modal-msg-sm" id="msgECName"></p>
                                    </div>

                                    <!-- Pair 2: Phone + Email (+5 pts) -->
                                    <div
                                        style="border:1.5px solid rgba(34,197,94,0.3);border-radius:0.6rem;padding:1rem;margin-bottom:1rem;background:rgba(34,197,94,0.03)">
                                        <p
                                            style="font-size:0.75rem;font-weight:600;color:#22c55e;margin:0 0 0.75rem 0;text-transform:uppercase;letter-spacing:0.05em;">
                                            <i class="fas fa-phone" style="margin-right:0.4rem"></i>Phone &amp; Email
                                            <span class="pse-badge" style="margin-left:0.5rem">+5 pts</span><span
                                                class="pse-status-badge" id="pse-ec-contact-badge"></span>
                                        </p>
                                        <div class="form-grid-2">
                                            <div class="fld"><label>Phone Number</label>
                                                <input type="tel" id="updateECPhone" placeholder="09171234567"
                                                    inputmode="numeric" pattern="[0-9+\\-\\s]*">
                                            </div>
                                            <div class="fld"><label>Email</label>
                                                <input type="email" id="updateECEmail" placeholder="contact@email.com">
                                            </div>
                                        </div>
                                        <button class="btn-gold psc-save-btn" data-save-section="emergency_contact"
                                            onclick="saveProfileSection('emergency_contact')">
                                            <i class="fas fa-save"></i> Save Phone &amp; Email
                                        </button>
                                        <p class="modal-msg modal-msg-sm" id="msgECContact"></p>
                                    </div>

                                    <!-- Pair 3: EC ID Photo (+5 pts) -->
                                    <div
                                        style="border:1.5px solid rgba(245,158,11,0.35);border-radius:0.6rem;padding:1rem;background:rgba(245,158,11,0.03)">
                                        <p
                                            style="font-size:0.75rem;font-weight:600;color:#f59e0b;margin:0 0 0.75rem 0;text-transform:uppercase;letter-spacing:0.05em;">
                                            <i class="fas fa-address-card" style="margin-right:0.4rem"></i>EC ID Photo
                                            <span class="pse-badge" style="margin-left:0.5rem">+5 pts</span><span
                                                class="pse-status-badge" id="pse-ec-id-badge"></span>
                                        </p>
                                        <div class="fld fld-full">
                                            <label for="ecIdFileInput" class="file-upload-label">
                                                <i class="fas fa-id-card file-upload-label-icon"></i>
                                                <span id="ecIdFileName">Click to upload EC ID photo or PDF</span>
                                            </label>
                                            <input type="file" id="ecIdFileInput" accept="image/*,application/pdf"
                                                style="display:none"
                                                onchange="document.getElementById('ecIdFileName').textContent='✓ '+this.files[0].name">
                                        </div>
                                        <button class="btn-gold psc-save-btn" data-save-section="emergency_id"
                                            onclick="saveProfileSection('emergency_id')">
                                            <i class="fas fa-save"></i> Save EC ID Photo
                                        </button>
                                        <p class="modal-msg modal-msg-sm" id="msgECId"></p>
                                    </div>
                                </div>
                            </div>

                            <!-- KYC -->
                            <div class="profile-edit-section">
                                <div class="pse-header" onclick="togglePSE('pse-kyc')">
                                    <div class="pse-title">
                                        <i class="fas fa-id-card icon-gold"></i>
                                        Identity Verification (KYC)
                                        <span class="pse-badge pse-badge-kyc">+25 pts</span><span
                                            class="pse-status-badge" id="pse-kyc-badge"></span>
                                    </div>
                                    <i class="fas fa-chevron-down pse-chevron" id="pse-kyc-icon"></i>
                                </div>
                                <div class="pse-body" id="pse-kyc">
                                    <p class="pse-desc">Upload a valid Philippine ID and selfie. Admin verifies and
                                        unlocks
                                        25 trust points.</p>
                                    <div class="form-grid-2">
                                        <div class="fld"><label>ID Type</label>
                                            <select id="updateIdType">
                                                <option value="">-- Select ID Type --</option>
                                                <option>Philippine National ID (PhilID)</option>
                                                <option>ePhilID</option>
                                                <option>Passport</option>
                                                <option>Driver's License</option>
                                                <option>UMID</option>
                                                <option>SSS ID</option>
                                                <option>PRC ID</option>
                                                <option>Postal ID (Digital/Improved)</option>
                                                <option>Voter's ID</option>
                                                <option>PhilHealth ID</option>
                                                <option>TIN ID</option>
                                                <option>Pag-IBIG ID</option>
                                                <option>NBI Clearance</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="fld">
                                        <label>ID Expiry Date</label>
                                        <div class="date-picker-box"
                                            onclick="(function(){var i=document.getElementById('updateIdExpiry');try{i.showPicker();}catch(e){i.focus();}})()">
                                            <i class="fas fa-calendar-alt"
                                                style="color:var(--gold);font-size:0.85rem;flex-shrink:0"></i>
                                            <span id="updateIdExpiryDisplay"
                                                style="flex:1;color:var(--text-dim);font-size:0.85rem">Select expiry
                                                date</span>
                                            <i class="fas fa-chevron-down"
                                                style="color:var(--text-dim);font-size:0.7rem;flex-shrink:0"></i>
                                            <input type="date" id="updateIdExpiry"
                                                style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px"
                                                onchange="document.getElementById('updateIdExpiryDisplay').textContent=this.value?new Date(this.value+'T00:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):'Select expiry date';document.getElementById('updateIdExpiryDisplay').style.color=this.value?'var(--text)':'var(--text-dim)'">
                                        </div>
                                    </div>
                                    <div class="fld">
                                        <label>Front of ID <span class="fld-hint">+5 pts</span></label>
                                        <label for="idPhotoFile" class="file-upload-label">
                                            <i class="fas fa-id-card file-upload-label-icon"></i>
                                            <span id="idFrontName">Click to upload</span>
                                        </label>
                                        <input type="file" id="idPhotoFile" accept="image/*" style="display:none"
                                            onchange="document.getElementById('idFrontName').textContent='✓ '+this.files[0].name">
                                    </div>
                                    <div class="fld">
                                        <label>Selfie with ID <span class="fld-hint">+5 pts</span></label>
                                        <label for="selfiePhotoFile" class="file-upload-label">
                                            <i class="fas fa-camera file-upload-label-icon"></i>
                                            <span id="idSelfieName">Click to upload</span>
                                        </label>
                                        <input type="file" id="selfiePhotoFile" accept="image/*" style="display:none"
                                            onchange="document.getElementById('idSelfieName').textContent='✓ '+this.files[0].name">
                                    </div>
                                    <button class="btn-gold psc-save-btn" onclick="saveProfileSection('kyc')">
                                        <i class="fas fa-save"></i> Submit for Verification
                                    </button>
                                    <p class="modal-msg modal-msg-sm" id="msgKYC"></p>
                                </div>
                            </div>

                    </div><!-- end profileFormBody -->
                </div><!-- end modal-box -->
            </div><!-- end profileModal -->
        </div><!-- end profile-page-wrap -->
        </section>
`;
}

function _initProfileModal() {
    var body = document.getElementById('profileModalBody');
    if (!body || body.dataset.init) return;
    body.dataset.init = '1';
    body.innerHTML = `            <div class="profile-page-wrap">
                <!-- Profile header -->
                <div class="profile-view-header">
                    <div class="profile-avatar-lg"><i class="fas fa-circle-user"></i></div>
                    <div class="prof-header-info">
                        <div class="prof-name-display" id="profName">--</div>
                        <div class="prof-email-display" id="profEmail">--</div>
                        <div class="prof-badges-row">
                            <span id="profTierBadge" class="prof-tier-badge">Bronze · 0 pts</span>
                            <span id="profVerBadge" class="prof-ver-badge">Unverified</span>
                            <span id="profStatusBadge" class="prof-status-badge">Active</span>
                        </div>
                        <div class="prof-trust-bar-wrap">
                            <div class="prof-trust-bar-labels">
                                <span class="prof-trust-bar-label-text">Trust Score</span>
                                <span id="profScoreLabel" class="prof-trust-score-label">0 / 100</span>
                            </div>
                            <div class="prof-trust-bar-track">
                                <div id="profTrustBar" class="prof-trust-bar-fill"></div>
                            </div>
                        </div>
                    </div>
                    <div class="prof-edit-btn-wrap">
                        <button onclick="openProfileModal()" id="profileEditBtn" class="btn-gold">
                            <i class="fas fa-pen" id="profileEditIcon"></i>
                            <span id="profileEditLabel">Edit Verification</span>
                        </button>
                    </div>
                </div>

                <!-- Read-only info grid -->
                <div class="prof-info-grid">
                    <!-- Row 1: Role | Portfolio -->
                    <div>
                        <div class="prof-info-label">Filmmaker Role</div>
                        <div id="profRoleView" class="prof-info-value">—</div>
                    </div>
                    <div>
                        <div class="prof-info-label">Portfolio URL</div>
                        <div id="profPortfolioView" class="prof-info-value-sm">—</div>
                    </div>
                    <!-- Row 2: Emergency Contact | Bio (scrollable) -->
                    <div>
                        <div class="prof-info-label">Emergency Contact</div>
                        <div id="profECView" class="prof-info-value-sm">—</div>
                        <div id="profECStatusDetail" class="prof-info-label" style="margin-top:0.2rem">0 out of 3
                            sections approved</div>
                    </div>
                    <div>
                        <div class="prof-info-label">Professional Bio</div>
                        <div id="profBioView" class="prof-info-value-bio prof-bio-scroll">—</div>
                    </div>
                    <!-- Row 3: KYC Status (left, below EC) | Interest Rate (right) -->
                    <div>
                        <div class="prof-info-label">KYC Status</div>
                        <div id="profKYCView" class="prof-info-value-sm prof-status-empty">Not submitted</div>
                    </div>
                    <div>
                        <div class="prof-info-label">Interest Rate</div>
                        <div id="profRateView" class="prof-info-value-gold">15% p.a.</div>
                    </div>
                    <!-- Row 4: Past Projects full-width at the bottom -->
                    <div class="prof-info-grid-full prof-past-section">
                        <div class="prof-info-label">Past Projects</div>
                        <div id="profPastProjectView" class="prof-info-value-sm prof-past-hover">—</div>
                    </div>
                </div>

                <!-- Edit area (hidden until Edit Verification clicked) -->
                <div id="profileEditArea" style="display:none;"></div>

                <!-- ══ NEW PROFILE MODAL (Centered Overlay) ══ -->
                <div id="profileModal" class="modal" style="display:none">
                    <div class="modal-box modal-wide" style="max-width:800px; max-height:90vh; overflow-y:auto;">
                        <div class="modal-header">
                            <h2><i class="fas fa-circle-user icon-gold-mr"></i>Complete Your Profile</h2>
                            <button class="modal-close" onclick="closeModal('profileModal')"><i
                                    class="fas fa-times"></i></button>
                        </div>

                        <!-- Completion Progress Bar -->
                        <div id="profileCompletionBar" class="profile-completion-bar">
                            <div
                                style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                                <span style="font-size:0.85rem; font-weight:600;">Profile Completion</span>
                                <span id="profileCompletionPct"
                                    style="font-size:0.85rem; font-weight:700; color:var(--gold);">0%</span>
                            </div>
                            <div class="completion-progress">
                                <div id="profileCompletionFill" class="completion-fill" style="width:0%;"></div>
                            </div>
                            <div style="font-size:0.7rem; color:var(--text-dim); margin-top:0.5rem;">
                                Earn up to 50 trust points by completing all sections
                            </div>
                        </div>

                        <!-- PIN gate (top of modal) -->
                        <div id="profilePinGate" class="pin-gate-wrap" style="margin:1.5rem;">
                            <div class="pin-gate-lock-icon"><i class="fas fa-lock"></i></div>
                            <p class="pin-gate-prompt">Enter your Transaction PIN to unlock profile editing</p>
                            <div class="pin-gate-input-row">
                                <input type="password" id="profilePinInput" class="pin-gate-input" maxlength="6"
                                    inputmode="numeric" placeholder="••••••"
                                    onkeydown="if(event.key==='Enter')unlockProfileModal()">
                            </div>
                            <button class="btn-gold" onclick="unlockProfileModal()">Unlock</button>
                            <p id="profilePinError" class="pin-gate-error"></p>
                        </div>

                        <!-- Form sections (shown after PIN) -->
                        <div id="profileFormBody" style="display:none; padding:0 1.5rem 1.5rem;">

                            <!-- Professional Info -->
                            <div class="profile-edit-section">
                                <div class="pse-header" onclick="togglePSE('pse-prof')">
                                    <div class="pse-title">
                                        <i class="fas fa-video icon-gold"></i>
                                        Professional Verification <span class="pse-badge">+5 pts</span><span
                                            class="pse-status-badge" id="pse-prof-badge"></span>
                                    </div>
                                    <i class="fas fa-chevron-down pse-chevron" id="pse-prof-icon"></i>
                                </div>
                                <div class="pse-body" id="pse-prof">
                                    <p class="pse-desc">Add your filmmaker role, bio and portfolio to earn +5 trust
                                        points
                                        after admin review.</p>
                                    <div class="form-grid-2">
                                        <div class="fld"><label>Filmmaker Role</label>
                                            <select id="updateRole">
                                                <option>Director</option>
                                                <option>Producer</option>
                                                <option>Cinematographer</option>
                                                <option>Screenwriter</option>
                                                <option>Editor</option>
                                                <option>Sound Designer</option>
                                            </select>
                                        </div>
                                        <div class="fld"><label>Portfolio URL <span class="fld-hint">IMDb / Behance /
                                                    LinkedIn</span></label>
                                            <input type="url" id="updatePortfolio" placeholder="https://imdb.com/...">
                                        </div>
                                        <div class="fld fld-full"><label>Professional Bio <span class="fld-hint">Max
                                                    1000
                                                    chars</span></label>
                                            <textarea id="updateBio" rows="4" maxlength="1000"
                                                placeholder="Describe your filmmaking background, past works and awards..."></textarea>
                                        </div>
                                    </div>
                                    <button class="btn-gold psc-save-btn" onclick="saveProfileSection('professional')">
                                        <i class="fas fa-save"></i> Save Professional Verification
                                    </button>
                                    <p class="modal-msg modal-msg-sm" id="msgProf"></p>
                                </div>
                            </div>

                            <!-- Past Project -->
                            <div class="profile-edit-section">
                                <div class="pse-header" onclick="togglePSE('pse-past')">
                                    <div class="pse-title">
                                        <i class="fas fa-film icon-gold"></i>
                                        Past Project <span class="pse-badge">+5 pts</span><span class="pse-status-badge"
                                            id="pse-past-badge"></span>
                                    </div>
                                    <i class="fas fa-chevron-down pse-chevron" id="pse-past-icon"></i>
                                </div>
                                <div class="pse-body" id="pse-past">
                                    <p class="pse-desc">Link or upload a past film project as proof of work.</p>
                                    <div class="fld fld-full">
                                        <label>Past Project URL <span class="fld-hint">Vimeo / YouTube — or upload a
                                                file</span></label>
                                        <div class="past-project-url-row">
                                            <input type="url" id="updatePastProject"
                                                placeholder="https://vimeo.com/...">
                                            <label for="pastProjectFileInput" class="upload-icon-label">
                                                <i class="fas fa-upload"></i>
                                            </label>
                                            <input type="file" id="pastProjectFileInput"
                                                accept="video/mp4,video/quicktime,application/pdf,image/*"
                                                style="display:none" onchange="uploadPastProjectFile(this)">
                                        </div>
                                        <div class="upload-status-row">
                                            <span id="pastProjectUploadName" class="upload-filename-gold"></span>
                                            <span id="pastProjectUploadStatus"
                                                style="margin-left:0.5rem;font-size:0.75rem"></span>
                                        </div>
                                    </div>
                                    <button class="btn-gold psc-save-btn" onclick="saveProfileSection('past_project')">
                                        <i class="fas fa-save"></i> Save Past Project
                                    </button>
                                    <p class="modal-msg modal-msg-sm" id="msgPast"></p>
                                </div>
                            </div>

                            <!-- Emergency Contact -->
                            <div class="profile-edit-section">
                                <div class="pse-header" onclick="togglePSE('pse-ec')">
                                    <div class="pse-title">
                                        <i class="fas fa-phone-alt icon-gold"></i>
                                        Emergency Contact <span class="pse-badge">+15 pts</span><span
                                            class="pse-status-badge" id="pse-ec-badge"></span>
                                    </div>
                                    <i class="fas fa-chevron-down pse-chevron" id="pse-ec-icon"></i>
                                </div>
                                <div class="pse-body" id="pse-ec">
                                    <p class="pse-desc">Each pair below earns separate trust points. Save each pair
                                        independently.</p>

                                    <!-- Pair 1: Name + Relationship (+5 pts) -->
                                    <div
                                        style="border:1.5px solid rgba(96,165,250,0.3);border-radius:0.6rem;padding:1rem;margin-bottom:1rem;background:rgba(96,165,250,0.03)">
                                        <p
                                            style="font-size:0.75rem;font-weight:600;color:#60a5fa;margin:0 0 0.75rem 0;text-transform:uppercase;letter-spacing:0.05em;">
                                            <i class="fas fa-user" style="margin-right:0.4rem"></i>Name &amp;
                                            Relationship
                                            <span class="pse-badge" style="margin-left:0.5rem">+5 pts</span><span
                                                class="pse-status-badge" id="pse-ec-name-badge"></span>
                                        </p>
                                        <div class="form-grid-2">
                                            <div class="fld"><label>Contact Name</label>
                                                <input type="text" id="updateECName" placeholder="Full Name">
                                            </div>
                                            <div class="fld"><label>Relationship</label>
                                                <input type="text" id="updateECRelation"
                                                    placeholder="e.g. Spouse, Parent">
                                            </div>
                                        </div>
                                        <button class="btn-gold psc-save-btn" data-save-section="emergency_name"
                                            onclick="saveProfileSection('emergency_name')">
                                            <i class="fas fa-save"></i> Save Name &amp; Relationship
                                        </button>
                                        <p class="modal-msg modal-msg-sm" id="msgECName"></p>
                                    </div>

                                    <!-- Pair 2: Phone + Email (+5 pts) -->
                                    <div
                                        style="border:1.5px solid rgba(34,197,94,0.3);border-radius:0.6rem;padding:1rem;margin-bottom:1rem;background:rgba(34,197,94,0.03)">
                                        <p
                                            style="font-size:0.75rem;font-weight:600;color:#22c55e;margin:0 0 0.75rem 0;text-transform:uppercase;letter-spacing:0.05em;">
                                            <i class="fas fa-phone" style="margin-right:0.4rem"></i>Phone &amp; Email
                                            <span class="pse-badge" style="margin-left:0.5rem">+5 pts</span><span
                                                class="pse-status-badge" id="pse-ec-contact-badge"></span>
                                        </p>
                                        <div class="form-grid-2">
                                            <div class="fld"><label>Phone Number</label>
                                                <input type="tel" id="updateECPhone" placeholder="09171234567"
                                                    inputmode="numeric" pattern="[0-9+\\-\\s]*">
                                            </div>
                                            <div class="fld"><label>Email</label>
                                                <input type="email" id="updateECEmail" placeholder="contact@email.com">
                                            </div>
                                        </div>
                                        <button class="btn-gold psc-save-btn" data-save-section="emergency_contact"
                                            onclick="saveProfileSection('emergency_contact')">
                                            <i class="fas fa-save"></i> Save Phone &amp; Email
                                        </button>
                                        <p class="modal-msg modal-msg-sm" id="msgECContact"></p>
                                    </div>

                                    <!-- Pair 3: EC ID Photo (+5 pts) -->
                                    <div
                                        style="border:1.5px solid rgba(245,158,11,0.35);border-radius:0.6rem;padding:1rem;background:rgba(245,158,11,0.03)">
                                        <p
                                            style="font-size:0.75rem;font-weight:600;color:#f59e0b;margin:0 0 0.75rem 0;text-transform:uppercase;letter-spacing:0.05em;">
                                            <i class="fas fa-address-card" style="margin-right:0.4rem"></i>EC ID Photo
                                            <span class="pse-badge" style="margin-left:0.5rem">+5 pts</span><span
                                                class="pse-status-badge" id="pse-ec-id-badge"></span>
                                        </p>
                                        <div class="fld fld-full">
                                            <label for="ecIdFileInput" class="file-upload-label">
                                                <i class="fas fa-id-card file-upload-label-icon"></i>
                                                <span id="ecIdFileName">Click to upload EC ID photo or PDF</span>
                                            </label>
                                            <input type="file" id="ecIdFileInput" accept="image/*,application/pdf"
                                                style="display:none"
                                                onchange="document.getElementById('ecIdFileName').textContent='✓ '+this.files[0].name">
                                        </div>
                                        <button class="btn-gold psc-save-btn" data-save-section="emergency_id"
                                            onclick="saveProfileSection('emergency_id')">
                                            <i class="fas fa-save"></i> Save EC ID Photo
                                        </button>
                                        <p class="modal-msg modal-msg-sm" id="msgECId"></p>
                                    </div>
                                </div>
                            </div>

                            <!-- KYC -->
                            <div class="profile-edit-section">
                                <div class="pse-header" onclick="togglePSE('pse-kyc')">
                                    <div class="pse-title">
                                        <i class="fas fa-id-card icon-gold"></i>
                                        Identity Verification (KYC)
                                        <span class="pse-badge pse-badge-kyc">+25 pts</span><span
                                            class="pse-status-badge" id="pse-kyc-badge"></span>
                                    </div>
                                    <i class="fas fa-chevron-down pse-chevron" id="pse-kyc-icon"></i>
                                </div>
                                <div class="pse-body" id="pse-kyc">
                                    <p class="pse-desc">Upload a valid Philippine ID and selfie. Admin verifies and
                                        unlocks
                                        25 trust points.</p>
                                    <div class="form-grid-2">
                                        <div class="fld"><label>ID Type</label>
                                            <select id="updateIdType">
                                                <option value="">-- Select ID Type --</option>
                                                <option>Philippine National ID (PhilID)</option>
                                                <option>ePhilID</option>
                                                <option>Passport</option>
                                                <option>Driver's License</option>
                                                <option>UMID</option>
                                                <option>SSS ID</option>
                                                <option>PRC ID</option>
                                                <option>Postal ID (Digital/Improved)</option>
                                                <option>Voter's ID</option>
                                                <option>PhilHealth ID</option>
                                                <option>TIN ID</option>
                                                <option>Pag-IBIG ID</option>
                                                <option>NBI Clearance</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="fld">
                                        <label>ID Expiry Date</label>
                                        <div class="date-picker-box"
                                            onclick="(function(){var i=document.getElementById('updateIdExpiry');try{i.showPicker();}catch(e){i.focus();}})()">
                                            <i class="fas fa-calendar-alt"
                                                style="color:var(--gold);font-size:0.85rem;flex-shrink:0"></i>
                                            <span id="updateIdExpiryDisplay"
                                                style="flex:1;color:var(--text-dim);font-size:0.85rem">Select expiry
                                                date</span>
                                            <i class="fas fa-chevron-down"
                                                style="color:var(--text-dim);font-size:0.7rem;flex-shrink:0"></i>
                                            <input type="date" id="updateIdExpiry"
                                                style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px"
                                                onchange="document.getElementById('updateIdExpiryDisplay').textContent=this.value?new Date(this.value+'T00:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):'Select expiry date';document.getElementById('updateIdExpiryDisplay').style.color=this.value?'var(--text)':'var(--text-dim)'">
                                        </div>
                                    </div>
                                    <div class="fld">
                                        <label>Front of ID <span class="fld-hint">+5 pts</span></label>
                                        <label for="idPhotoFile" class="file-upload-label">
                                            <i class="fas fa-id-card file-upload-label-icon"></i>
                                            <span id="idFrontName">Click to upload</span>
                                        </label>
                                        <input type="file" id="idPhotoFile" accept="image/*" style="display:none"
                                            onchange="document.getElementById('idFrontName').textContent='✓ '+this.files[0].name">
                                    </div>
                                    <div class="fld">
                                        <label>Selfie with ID <span class="fld-hint">+5 pts</span></label>
                                        <label for="selfiePhotoFile" class="file-upload-label">
                                            <i class="fas fa-camera file-upload-label-icon"></i>
                                            <span id="idSelfieName">Click to upload</span>
                                        </label>
                                        <input type="file" id="selfiePhotoFile" accept="image/*" style="display:none"
                                            onchange="document.getElementById('idSelfieName').textContent='✓ '+this.files[0].name">
                                    </div>
                                    <button class="btn-gold psc-save-btn" onclick="saveProfileSection('kyc')">
                                        <i class="fas fa-save"></i> Submit for Verification
                                    </button>
                                    <p class="modal-msg modal-msg-sm" id="msgKYC"></p>
                                </div>
                            </div>

                    </div><!-- end profileFormBody -->
                </div><!-- end modal-box -->
            </div><!-- end profileModal -->
        </div><!-- end profile-page-wrap -->
        </section>
`;
}

// Patch showSection to init profile view
var __profileOrigShow = window.showSection;
window.showSection = function(id, nav, title, sub) {
    if (__profileOrigShow) __profileOrigShow(id, nav, title, sub);
    if (id === 'myProfileSection') _initProfileSection();
};

window.openProfileModal = window.openProfileModal || function() {
    _initProfileModal();
    openModal('profileModal');
};