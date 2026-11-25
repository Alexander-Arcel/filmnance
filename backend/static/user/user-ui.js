// ============================================================
// FILMNANCE — user-ui.js  [FIXED]
// Section navigation, settings modal, theme sync.
// ============================================================

'use strict';

// ── Sidebar toggle ──
function toggleSidebar() {
    if (window.innerWidth > 768) return;
    document.body.classList.toggle('sidebar-open');
}

// ── Close sidebar on outside click (mobile) ──
document.addEventListener('click', function (e) {
    if (window.innerWidth <= 992
        && !e.target.closest('.user-sidebar')
        && !e.target.closest('.sidebar-toggle')
        && document.body.classList.contains('sidebar-open')) {
        document.body.classList.remove('sidebar-open');
    }
});

// ── Section navigation ──
function showSection(id, navEl, title, subtitle) {
    document.querySelectorAll('.dash-section').forEach(function (s) { s.classList.remove('active-section'); });
    var t = document.getElementById(id); if (t) t.classList.add('active-section');
    var pt = document.getElementById('pageTitle'); if (pt) pt.textContent = title || 'Dashboard';
    var ps = document.getElementById('pageSubtitle'); if (ps) ps.textContent = subtitle || '';
    document.querySelectorAll('.nav-menu .nav-item').forEach(function (n) { n.classList.remove('active'); });
    if (navEl) navEl.classList.add('active');
    if (id === 'scheduleSection') populateScheduleLoanSelect(currentLoans);
    if (id === 'resourcesSection') populateResources();
    if (id === 'myProjectsSection') renderProjectsTable(currentLoans);
    try { history.replaceState(null, '', '#' + id); } catch (e) { }
    var m = document.querySelector('.user-main'); if (m) m.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', function () {
    var hash = window.location.hash ? window.location.hash.replace('#', '') : '';
    var sM = {
        'overviewSection': ['navDash', 'Dashboard', 'Your active projects and repayment overview'],
        'myProfileSection': ['navMyProfile', 'My Profile', 'Your filmmaker profile, identity and trust score'],
        'myProjectsSection': ['navMyProjects', 'My Projects', 'All your film projects'],
        'scheduleSection': ['navSchedule', 'Repayment', 'All your scheduled installments'],
        'txSection': ['navTx', 'Transaction History', 'Complete record of all your payments'],
        'resourcesSection': ['navResources', 'Loan', 'Your loan and repayment summary'],
    };
    if (hash && sM[hash]) {
        var navEl = document.getElementById(sM[hash][0]);
        showSection(hash, navEl, sM[hash][1], sM[hash][2]);
    }
});

// ── Settings modal ──
function openSettingsModal() {
    openModal('settingsModal');
    setTimeout(syncThemeUI, 50);
}

// ── Theme ──
function toggleThemeFromSettings() { toggleTheme(); setTimeout(syncThemeUI, 30); }
function syncThemeUI() {
    var isLight = document.body.getAttribute('data-theme') === 'light';
    var track = document.getElementById('themeToggleTrack');
    var thumb = document.getElementById('themeToggleThumb');
    var label = document.getElementById('themeLabel');
    if (track) track.style.background = isLight ? 'var(--gold)' : 'var(--bg-card)';
    if (thumb) { thumb.style.transform = isLight ? 'translateX(20px)' : 'translateX(0)'; thumb.style.background = isLight ? '#fff' : 'var(--text-dim)'; }
    if (label) label.textContent = isLight ? 'Light' : 'Dark';
}

// ── Profile modal open ──
function openProfileModal() {
    if (typeof _PROFILE !== 'undefined') _PROFILE.reset();
    if (typeof _prefillProfileFields === 'function') _prefillProfileFields();
    // Navigate to My Profile section first
    var navEl = document.getElementById('navMyProfile');
    showSection('myProfileSection', navEl, 'My Profile', 'Your filmmaker profile, identity and trust score');
    openModal('profileModal');
    var gateEl = document.getElementById('profilePinGate');
    var bodyEl = document.getElementById('profileFormBody');
    var pinInput = document.getElementById('profilePinInput');
    var errEl = document.getElementById('profilePinError');
    var unlockBtn = document.querySelector('#profilePinGate .btn-gold');
    if (gateEl) gateEl.style.display = 'block';
    if (bodyEl) bodyEl.style.display = 'none';
    if (pinInput) { pinInput.value = ''; pinInput.focus(); }
    if (unlockBtn) { unlockBtn.disabled = false; unlockBtn.textContent = 'Unlock'; }

    // Restore persisted attempt/lockout state
    if (errEl) {
        var lockedUntil = parseInt(sessionStorage.getItem('profile_pin_locked_until') || '0', 10);
        var nowSec = Math.floor(Date.now() / 1000);
        if (lockedUntil > nowSec) {
            var secsLeft = lockedUntil - nowSec;
            var minsLeft = Math.ceil(secsLeft / 60);
            errEl.textContent = 'Too many failed attempts. Try again in ' + minsLeft + ' minute(s).';
            errEl.style.color = 'var(--error)';
            if (unlockBtn) unlockBtn.disabled = true;
        } else {
            var attempts = parseInt(sessionStorage.getItem('profile_pin_attempts') || '0', 10);
            var remaining = 3 - attempts;
            if (attempts > 0 && remaining > 0) {
                errEl.textContent = remaining + ' attempt(s) remaining.';
                errEl.style.color = remaining <= 1 ? 'var(--error)' : 'var(--warn)';
            } else {
                errEl.textContent = '';
            }
        }
    }

    if (typeof calcProfileCompletion === 'function') calcProfileCompletion();
}

function toggleProfileEdit() { openProfileModal(); }

// Opens the profile modal and scrolls directly to the KYC section.
// Used by the "Complete KYC Now" loan gate button.
// Does NOT call showSection() — avoids hiding the dashboard content.
function _openKycDirectly() {
    // Navigate to My Profile section without breaking layout
    var navEl = document.getElementById('navMyProfile');
    showSection('myProfileSection', navEl, 'My Profile', 'Your filmmaker profile, identity and trust score');
    // Open the profile modal
    openProfileModal();
    // After PIN unlock, auto-open the KYC accordion
    setTimeout(function () {
        var kycSection = document.getElementById('pse-kyc');
        if (kycSection && !kycSection.classList.contains('open')) {
            if (typeof togglePSE === 'function') togglePSE('pse-kyc');
        }
        // Scroll into view
        if (kycSection) {
            kycSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 600);
}

function togglePSE(id) {
    var body = document.getElementById(id);
    var icon = document.getElementById(id + '-icon');
    if (!body) return;
    body.classList.toggle('open');
    if (icon) icon.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : '';
}

function openRequestPaymentModal() {
    populateGraceLoanSelect(currentLoans);
    populateDelayLoanSelect(currentLoans);
    openModal('requestPaymentModal');
}

function handleMonthlyPhoto(input) {
    var file = input.files[0]; if (!file) return;
    var nameEl = document.getElementById('monthlyPhotoName');
    var previewEl = document.getElementById('monthlyPhotoPreview');
    if (nameEl) nameEl.textContent = '✓ ' + file.name;
    if (previewEl && file.type.startsWith('image/')) {
        var r = new FileReader();
        r.onload = function (e) {
            previewEl.innerHTML = '<img src="' + e.target.result + '" style="max-width:100%;max-height:160px;border-radius:var(--r);border:1px solid var(--border);object-fit:cover">';
        };
        r.readAsDataURL(file);
    }
}

function handleDelayProofPreview(input) {
    var file = input.files[0]; if (!file) return;
    var nameEl = document.getElementById('delayProofFileName');
    var previewEl = document.getElementById('delayProofPreview');
    if (nameEl) nameEl.textContent = '✓ ' + file.name;
    if (previewEl) {
        if (file.type.startsWith('image/')) {
            var r = new FileReader();
            r.onload = function (e) {
                previewEl.innerHTML = '<img src="' + e.target.result + '" style="max-width:100%;max-height:160px;border-radius:var(--r);border:1px solid var(--border);object-fit:cover;margin-top:0.4rem">';
            };
            r.readAsDataURL(file);
        } else {
            previewEl.innerHTML = '<div style="font-size:0.78rem;color:#22c55e;margin-top:0.3rem"><i class="fas fa-file-pdf" style="margin-right:0.3rem"></i>' + file.name + '</div>';
        }
    }
}


// Genre filter, projects table, and populateResources → user-projects.js


// ─────────────────────────────────────────────
// SETTINGS MODAL — HTML injection
// ─────────────────────────────────────────────
function _initSettingsBody() {
    var body = document.getElementById('settingsModalBody');
    if (!body || body.dataset.initialized) return;
    body.innerHTML = `                    <div class="settings-section-label">Security</div>
                    <button onclick="closeModal('settingsModal');openModal('securityModal');openSecurityModal();"
                        class="settings-row-card">
                        <div class="settings-icon-box">
                            <i class="fas fa-shield-halved settings-icon-lg"></i>
                        </div>
                        <div>
                            <div class="settings-row-title">Security & PIN</div>
                            <div class="settings-row-sub">Password, Transaction PIN, OTP settings</div>
                        </div>
                        <i class="fas fa-chevron-right settings-chevron"></i>
                    </button>
                </div>
                <!-- Appearance -->
                <div>
                    <div class="settings-section-label">Appearance</div>
                    <div class="settings-appearance-card">
                        <div class="settings-appearance-left">
                            <div class="settings-icon-box-plain">
                                <i class="fas fa-circle-half-stroke settings-icon-lg-dim"></i>
                            </div>
                            <div>
                                <div class="settings-row-title">Theme</div>
                                <div class="settings-row-sub">Switch between Dark and Light mode</div>
                            </div>
                        </div>
                        <div class="settings-theme-toggle-wrap">
                            <span id="themeLabel" class="settings-theme-label">Dark</span>
                            <div onclick="toggleThemeFromSettings()" id="themeToggleTrack" class="theme-toggle-track">
                                <div id="themeToggleThumb" class="theme-toggle-thumb"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Contact Admin -->
                <div>
                    <div class="settings-section-label">Contact Admin</div>
                    <div class="contact-admin-card">
                        <div class="contact-admin-header">
                            <div class="settings-icon-box">
                                <i class="fas fa-headset settings-icon-lg"></i>
                            </div>
                            <div>
                                <div class="settings-row-title">Filmnance Support</div>
                                <div class="settings-row-sub">For loan inquiries and account support</div>
                            </div>
                        </div>
                        <div class="contact-admin-btns" style="margin-top:0.75rem;">
                            <button onclick="openComposeEmail()" class="contact-send-btn">
                                <i class="fas fa-envelope icon-gold-mr-xs"></i> Send Message
                            </button>
                            <div class="contact-phone-display">
                                <i class="fas fa-phone icon-dim"></i> +63 917 123 4567
                            </div>
                        </div>
                        <div class="contact-hours">
                            <i class="fas fa-clock icon-dim-mr"></i>Mon–Fri, 9AM–6PM PHT
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>


    <!-- ══ SECURITY MODAL ══ -->
`;
    body.dataset.initialized = '1';
}

var _origOpenSettings = window.openSettingsModal;
window.openSettingsModal = function() {
    _initSettingsBody();
    if (typeof openModal === 'function') openModal('settingsModal');
};