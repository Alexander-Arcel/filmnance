// =============================================
// FILMNANCE — frozen.js
// Frozen-account view: resend-email cooldown
// logic and the "Account Secured" success card.
// Depends on: auth-core.js (frozenEmail, safeJson,
// extractDetail, showView, setMsg)
// =============================================

// Track resend attempts client-side for display
let resendAttemptsUsed = 0;
const MAX_RESENDS = 3;

function updateAttemptDisplay() {
    const el = document.getElementById('resendAttempts');
    if (!el) return;
    const remaining = MAX_RESENDS - resendAttemptsUsed;
    if (remaining <= 0) {
        el.textContent = 'No resends remaining';
        el.style.color = 'var(--red)';
    } else {
        el.textContent = `${remaining} resend${remaining === 1 ? '' : 's'} remaining`;
        el.style.color = '';
    }
}

function resetResendUI() {
    const btn = document.getElementById('resendBtn');
    const stat = document.getElementById('resendStatus');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>&nbsp; Resend Email'; }
    if (stat) { stat.textContent = ''; stat.className = 'resend-status'; }
    if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
    resendAttemptsUsed = 0;
    updateAttemptDisplay();
}

function startCooldown(minutes) {
    const btn = document.getElementById('resendBtn');
    const stat = document.getElementById('resendStatus');
    if (!btn || !stat) return;
    btn.disabled = true;
    let secs = minutes * 60;

    function tick() {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        btn.innerHTML = `<i class="fa-solid fa-clock"></i>&nbsp; Resend in ${m}:${String(s).padStart(2, '0')}`;
        if (secs <= 0) {
            clearInterval(resendTimer);
            resendTimer = null;
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>&nbsp; Resend Email';
            stat.textContent = '';
            stat.className = 'resend-status';
        }
        secs--;
    }
    tick();
    resendTimer = setInterval(tick, 1000);
}

async function requestResend() {
    if (!frozenEmail) return;
    const btn = document.getElementById('resendBtn');
    const stat = document.getElementById('resendStatus');
    if (!btn || !stat) return;

    btn.disabled = true;
    stat.textContent = 'Sending...';
    stat.className = 'resend-status';

    try {
        const res = await fetch('/api/v1/auth/request-unfreeze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: frozenEmail })
        });
        const data = await safeJson(res);

        if (res.status === 429) {
            if (data.detail === 'MAX_RESEND_REACHED') {
                stat.textContent = 'Maximum resend attempts reached. Contact support.';
                stat.className = 'resend-status error';
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-ban"></i>&nbsp; Limit Reached';
                resendAttemptsUsed = MAX_RESENDS;
                updateAttemptDisplay();
            } else if (typeof data.detail === 'string' && data.detail.startsWith('COOLDOWN:')) {
                const mins = parseInt(data.detail.split(':')[1]) || 15;
                stat.textContent = 'Please wait before requesting another email.';
                stat.className = 'resend-status warning';
                startCooldown(mins);
            }
            return;
        }

        if (!res.ok) throw new Error(extractDetail(data.detail, 'Failed to resend.'));

        resendAttemptsUsed++;
        updateAttemptDisplay();
        stat.textContent = 'Email sent! Check your inbox.';
        stat.className = 'resend-status success';
        // Escalating cooldown: 15 min after 1st, 30 after 2nd, 60 after 3rd
        const cooldownMins = resendAttemptsUsed === 1 ? 15 : resendAttemptsUsed === 2 ? 30 : 60;
        startCooldown(cooldownMins);

    } catch (err) {
        stat.textContent = err.message;
        stat.className = 'resend-status error';
        btn.disabled = false;
    }
}

// =============================================
// SECURED CARD — shown after account is secured
// =============================================
function showSecuredCard() {
    const ex = document.getElementById('securedCard');
    if (ex) ex.remove();
    const style = document.createElement('style');
    style.textContent = '@keyframes scIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}';
    document.head.appendChild(style);
    const overlay = document.createElement('div');
    overlay.id = 'securedCard';
    overlay.setAttribute('style', 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.93);backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;padding:2rem;animation:scIn 0.4s ease');
    overlay.innerHTML = `<div style="background:#0e0e0e;border:1px solid rgba(239,68,68,0.35);border-radius:1.5rem;max-width:560px;width:100%;padding:3rem 2.5rem;text-align:center;box-shadow:0 32px 80px rgba(0,0,0,0.8)">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.35);display:flex;align-items:center;justify-content:center;margin:0 auto 1.4rem;font-size:1.6rem;color:#ef4444"><i class="fas fa-shield-halved"></i></div>
        <div style="display:inline-block;font-size:0.62rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#ef4444;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);padding:0.28rem 0.85rem;border-radius:2rem;margin-bottom:1.6rem">Account Secured</div>
        <p style="font-family:'Syne',sans-serif;font-size:clamp(1rem,2.4vw,1.3rem);font-weight:600;line-height:1.7;color:#d4af37;font-style:italic;margin-bottom:1rem">
            "You don't have to be the bad guy.<br>
            You are the most talented, most interesting,<br>
            and most extraordinary person in the universe.<br>
            And you are capable of amazing things."
        </p>
        <p style="font-size:0.78rem;color:rgba(255,255,255,0.4);margin-bottom:1.8rem;font-style:italic">— The LEGO Movie (2014)</p>
        <button onclick="document.getElementById('securedCard').remove()" style="background:#d4af37;color:#000;border:none;padding:0.9rem 2.5rem;border-radius:0.75rem;font-family:'Syne',sans-serif;font-size:0.8rem;font-weight:700;letter-spacing:0.14em;cursor:pointer">OKAY</button>
    </div>`;
    document.body.appendChild(overlay);
}