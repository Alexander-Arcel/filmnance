// admin_messages.js — Contact messages, settings helpers
// ═══════════════════════════════════════════════════════
// FIX: Active Loans Panel (replaces Disbursements panel)
// Shows all loans with status="disbursed" including
// repayment progress and producer disbursement account
// ═══════════════════════════════════════════════════════
window.loadContactMessages = async function () {
    var el = document.getElementById('contactList');
    if (!el) return;
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:3rem;color:var(--text-dim)"><i class="fa-solid fa-spinner fa-spin" style="margin-right:0.6rem"></i>Loading messages...</div>';
    try {
        var res = await fetch('/api/v1/admin/contact-messages', { headers: getHeaders() });
        if (!res.ok) { el.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--error)">Failed to load messages.</div>'; return; }
        var msgs = await res.json();
        if (!msgs.length) {
            el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4rem 2rem;color:var(--text-dim);text-align:center"><i class="fa-regular fa-envelope-open" style="font-size:2rem;margin-bottom:0.75rem;opacity:0.35"></i><div style="font-size:0.88rem;font-weight:600">No messages yet</div></div>';
            return;
        }
        var badge = document.getElementById('contactBadge');
        if (badge) { badge.textContent = msgs.length; badge.style.display = msgs.length ? 'inline-flex' : 'none'; }
        el.style.cssText = 'border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--bg-card)';
        el.innerHTML = '';
        msgs.forEach(function (m, idx) {
            var colors = ['#d4af37', '#60a5fa', '#34d399', '#f97316', '#c084fc', '#f87171'];
            var color = colors[m.from_name ? m.from_name.charCodeAt(0) % colors.length : 0];
            var initials = (m.from_name || '?').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
            var date = new Date(m.sent_at);
            var now2 = new Date();
            var timeStr = date.toDateString() === now2.toDateString()
                ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:flex-start;gap:0.9rem;padding:1rem 1.15rem;border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer;transition:background 0.15s';
            if (idx === msgs.length - 1) row.style.borderBottom = 'none';
            row.addEventListener('mouseenter', function () { row.style.background = 'rgba(255,255,255,0.025)'; });
            row.addEventListener('mouseleave', function () { row.style.background = ''; });
            row.addEventListener('click', function () { window.openMsgThread(m); });
            var avatar = document.createElement('div');
            avatar.style.cssText = 'width:44px;height:44px;border-radius:50%;background:' + color + '18;border:2px solid ' + color + '40;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.8rem;color:' + color + ';flex-shrink:0;margin-top:0.1rem';
            avatar.textContent = initials;
            var info = document.createElement('div');
            info.style.cssText = 'flex:1;min-width:0';
            var nameRow = document.createElement('div');
            nameRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:0.2rem';
            var nameEl = document.createElement('span');
            nameEl.style.cssText = 'font-weight:700;font-size:0.9rem;color:var(--text)';
            nameEl.textContent = m.from_name || '—';
            var timeEl = document.createElement('span');
            timeEl.style.cssText = 'font-size:0.68rem;color:var(--text-dim);flex-shrink:0;margin-left:0.5rem';
            timeEl.textContent = timeStr;
            nameRow.appendChild(nameEl); nameRow.appendChild(timeEl);
            var metaEl = document.createElement('div');
            metaEl.style.cssText = 'font-size:0.71rem;color:var(--text-dim);margin-bottom:0.2rem;display:flex;flex-wrap:wrap;gap:0.3rem 0.75rem';
            metaEl.innerHTML = '<span><b>From:</b> ' + esc(m.from_name || '—') + '</span><span><b>Email:</b> <span style="font-family:monospace">' + esc(m.from_email || '—') + '</span></span>';
            var subjectEl = document.createElement('div');
            subjectEl.style.cssText = 'font-size:0.78rem;font-weight:600;color:var(--gold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:0.2rem';
            subjectEl.textContent = 'Subject: ' + (m.subject || '(no subject)');
            var previewEl = document.createElement('div');
            previewEl.style.cssText = 'font-size:0.73rem;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
            previewEl.textContent = (m.message || '').slice(0, 120);
            info.appendChild(nameRow); info.appendChild(metaEl); info.appendChild(subjectEl); info.appendChild(previewEl);
            var actions = document.createElement('div');
            actions.style.cssText = 'display:flex;flex-direction:column;align-items:stretch;gap:0.5rem;flex-shrink:0;min-width:92px;padding-left:0.5rem;border-left:1px solid rgba(255,255,255,0.06)';
            var replyBtn = document.createElement('button');
            replyBtn.style.cssText = 'padding:0.42rem 0.7rem;border-radius:7px;border:1px solid rgba(212,175,55,0.35);background:rgba(212,175,55,0.1);color:var(--gold);font-size:0.76rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.3rem;transition:all 0.18s ease';
            replyBtn.onmouseover = function () { this.style.background = 'rgba(212,175,55,0.22)'; this.style.transform = 'translateY(-1px)'; };
            replyBtn.onmouseout = function () { this.style.background = 'rgba(212,175,55,0.1)'; this.style.transform = ''; };
            replyBtn.innerHTML = '<i class="fa-solid fa-reply"></i> Reply';
            replyBtn.addEventListener('click', function (e) { e.stopPropagation(); window.openMsgThread(m); });
            var delBtn = document.createElement('button');
            delBtn.style.cssText = 'padding:0.42rem 0.7rem;border-radius:7px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#ef4444;font-size:0.76rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.3rem;transition:all 0.18s ease';
            delBtn.onmouseover = function () { this.style.background = 'rgba(239,68,68,0.18)'; this.style.transform = 'translateY(-1px)'; };
            delBtn.onmouseout = function () { this.style.background = 'rgba(239,68,68,0.08)'; this.style.transform = ''; };
            delBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
            delBtn.addEventListener('click', function (e) { e.stopPropagation(); _confirmDeleteMsg(m, row); });
            actions.appendChild(replyBtn); actions.appendChild(delBtn);
            row.appendChild(avatar); row.appendChild(info); row.appendChild(actions);
            el.appendChild(row);
        });
    } catch (e) { el.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--error)">Error loading messages.</div>'; }
};

window._confirmDeleteMsg = function (m, rowEl) {
    var ex = document.getElementById('_delMsgModal'); if (ex) ex.remove();
    var ov = document.createElement('div');
    ov.id = '_delMsgModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);padding:1rem';
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid rgba(239,68,68,0.25);border-radius:1.25rem;max-width:420px;width:100%;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.6)';
    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:rgba(239,68,68,0.07);border-bottom:1px solid rgba(239,68,68,0.15);padding:1rem 1.25rem;display:flex;align-items:center;gap:0.75rem';
    hdr.innerHTML = '<i class="fa-solid fa-trash" style="color:#ef4444;font-size:1rem"></i><div style="font-weight:700;color:#ef4444;font-size:0.92rem">Delete Message</div>';
    var hX = document.createElement('button');
    hX.style.cssText = 'margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem';
    hX.innerHTML = '<i class="fas fa-times"></i>'; hX.onclick = function () { ov.remove(); };
    hdr.appendChild(hX);
    var body = document.createElement('div');
    body.style.cssText = 'padding:1.25rem';
    body.innerHTML = '<p style="font-size:0.86rem;color:var(--text);margin-bottom:0.5rem">Delete message from <strong>' + esc(m.from_name || 'this user') + '</strong>?</p>'
        + '<p style="font-size:0.76rem;color:var(--gold);margin-bottom:0.3rem;font-weight:600">Subject: ' + esc(m.subject || '(no subject)') + '</p>'
        + '<p style="font-size:0.73rem;color:var(--text-dim)">This cannot be undone.</p>';
    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:0.6rem;padding:0 1.25rem 1.25rem';
    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:8px;color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600';
    cancelBtn.textContent = 'Cancel'; cancelBtn.onclick = function () { ov.remove(); };
    var confirmBtn = document.createElement('button');
    confirmBtn.style.cssText = 'flex:2;padding:0.75rem;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:8px;color:#ef4444;cursor:pointer;font-size:0.85rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:0.4rem';
    confirmBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
    confirmBtn.onclick = async function () {
        confirmBtn.disabled = true; confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
        try {
            await fetch('/api/v1/admin/contact-messages/' + m.id, { method: 'DELETE', headers: getHeaders() });
            ov.remove();
            if (rowEl && rowEl.parentNode) rowEl.parentNode.removeChild(rowEl);
            if (typeof showToast === 'function') showToast('Message deleted.', 'info');
            loadContactMessages();
        } catch (e) { ov.remove(); if (typeof showToast === 'function') showToast('Failed to delete.', 'error'); }
    };
    btns.appendChild(cancelBtn); btns.appendChild(confirmBtn);
    box.appendChild(hdr); box.appendChild(body); box.appendChild(btns);
    ov.appendChild(box);
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov);
};


window.openMsgThread = function (m) {
    var ex = document.getElementById('_msgThreadModal'); if (ex) ex.remove();

    var ov = document.createElement('div');
    ov.id = '_msgThreadModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10010;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);padding:1rem';

    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:1.25rem;max-width:600px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.6);overflow:hidden;max-height:88vh;display:flex;flex-direction:column';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:rgba(212,175,55,0.06);border-bottom:1px solid rgba(212,175,55,0.15);padding:1rem 1.25rem;display:flex;align-items:center;gap:0.75rem;flex-shrink:0';
    var hdrIcon = document.createElement('i');
    hdrIcon.className = 'fa-solid fa-envelope-open';
    hdrIcon.style.cssText = 'color:var(--gold);font-size:1rem';
    var hdrTitle = document.createElement('div');
    hdrTitle.style.cssText = 'font-weight:700;color:var(--text);font-size:0.9rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    hdrTitle.textContent = m.subject || '(no subject)';
    var hdrClose = document.createElement('button');
    hdrClose.style.cssText = 'background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem';
    hdrClose.innerHTML = '<i class="fas fa-times"></i>';
    hdrClose.addEventListener('click', function () { ov.remove(); });
    hdr.appendChild(hdrIcon);
    hdr.appendChild(hdrTitle);
    hdr.appendChild(hdrClose);

    var body = document.createElement('div');
    body.style.cssText = 'padding:1.25rem;overflow-y:auto;flex:1';

    var colors = ['#d4af37', '#60a5fa', '#34d399', '#f97316', '#c084fc', '#f87171'];
    var color = colors[m.from_name ? m.from_name.charCodeAt(0) % colors.length : 0];
    var initials = (m.from_name || '?').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
    var date = new Date(m.sent_at);

    var senderCard = document.createElement('div');
    senderCard.style.cssText = 'display:flex;align-items:center;gap:0.85rem;padding:1rem;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;margin-bottom:1rem';
    senderCard.innerHTML = '<div style="width:46px;height:46px;border-radius:50%;background:' + color + '22;border:2px solid ' + color + '55;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.85rem;color:' + color + ';flex-shrink:0">' + esc(initials) + '</div>'
        + '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:0.9rem;color:var(--text)">' + esc(m.from_name || '—') + '</div><div style="font-size:0.72rem;color:var(--text-dim);font-family:monospace">' + esc(m.from_email || '') + '</div></div>'
        + '<div style="text-align:right;font-size:0.68rem;color:var(--text-dim)">' + date.toLocaleString() + '</div>';

    var msgContent = document.createElement('div');
    msgContent.style.cssText = 'padding:1rem 0.25rem;font-size:0.86rem;color:var(--text);line-height:1.75;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;border-bottom:1px solid rgba(255,255,255,0.05);margin-bottom:1rem;max-width:100%;overflow:hidden';
    msgContent.textContent = m.message || '';

    body.appendChild(senderCard);
    body.appendChild(msgContent);

    var footer = document.createElement('div');
    footer.style.cssText = 'padding:0 1.25rem 1.25rem;display:flex;gap:0.6rem;flex-shrink:0';

    var closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'flex:1;padding:0.7rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', function () { ov.remove(); });

    var replyBtn = document.createElement('button');
    replyBtn.style.cssText = 'flex:2;padding:0.7rem;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:var(--r);color:var(--gold);cursor:pointer;font-size:0.85rem;font-weight:700';
    replyBtn.innerHTML = '<i class="fa-solid fa-reply" style="margin-right:0.4rem"></i>Reply to ' + esc(m.from_name || 'Producer');
    replyBtn.addEventListener('click', function () {
        // Blur thread modal (keep visible behind) and open Direct Message on top
        box.style.filter = 'blur(3px)';
        box.style.pointerEvents = 'none';
        ov.style.backdropFilter = 'blur(12px)';
        _openDirectMessageOnTop(m, function () {
            // On cancel/close of DM: restore thread
            box.style.filter = '';
            box.style.pointerEvents = '';
            ov.style.backdropFilter = 'blur(6px)';
        });
    });

    footer.appendChild(closeBtn);
    footer.appendChild(replyBtn);
    box.appendChild(hdr);
    box.appendChild(body);
    box.appendChild(footer);
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
};


// loadArchivedUsers, toggleRemovedLoans → admin_settings.js
// loadEstRevenueFromLoans, updateReceiptTotals, loadActiveLoansPanel → admin_repayment.js

// ── Open Direct Message modal on top of thread modal (blurred behind) ──
function _openDirectMessageOnTop(m, onCancel) {
    var ex = document.getElementById('_dmOnTopModal'); if (ex) ex.remove();
    var userId = m.user_id || 0;
    var userName = m.from_name || 'Producer';
    var userEmail = m.from_email || '';

    var dmOv = document.createElement('div');
    dmOv.id = '_dmOnTopModal';
    dmOv.style.cssText = 'position:fixed;inset:0;z-index:10025;display:flex;align-items:center;justify-content:center;padding:1rem';

    var box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-card);border:1px solid rgba(125,211,252,0.25);border-radius:1.25rem;max-width:520px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.8);overflow:hidden;animation:slideUpFade 0.22s ease';

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:rgba(125,211,252,0.08);border-bottom:1px solid rgba(125,211,252,0.2);padding:1.1rem 1.25rem;display:flex;align-items:center;gap:0.75rem';
    hdr.innerHTML = '<i class="fa-solid fa-envelope" style="color:#7dd3fc;font-size:1.1rem"></i>'
        + '<div style="font-weight:700;color:var(--text);font-size:0.95rem">Direct Message</div>';
    var hX = document.createElement('button');
    hX.style.cssText = 'margin-left:auto;background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem';
    hX.innerHTML = '<i class="fas fa-times"></i>';
    hX.addEventListener('click', function () { dmOv.remove(); if (onCancel) onCancel(); });
    hdr.appendChild(hX);

    var body = document.createElement('div');
    body.style.cssText = 'padding:1.25rem';

    var toL = document.createElement('label'); toL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem'; toL.textContent = 'To';
    var toV = document.createElement('div'); toV.style.cssText = 'background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);padding:0.55rem 0.9rem;font-size:0.84rem;color:#7dd3fc;font-weight:600;margin-bottom:0.85rem'; toV.textContent = userEmail || '—';
    var subL = document.createElement('label'); subL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem'; subL.textContent = 'Subject';
    var subI = document.createElement('input'); subI.type = 'text'; subI.value = '[Filmnance] Message from Admin'; subI.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.65rem 0.9rem;margin-bottom:0.85rem;font-size:0.84rem;box-sizing:border-box';
    var msgL = document.createElement('label'); msgL.style.cssText = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);display:block;margin-bottom:0.35rem'; msgL.textContent = 'Message';
    var msgTA = document.createElement('textarea'); msgTA.rows = 5; msgTA.style.cssText = 'width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text);padding:0.7rem 0.9rem;font-family:inherit;font-size:0.82rem;resize:vertical;line-height:1.6;box-sizing:border-box;min-height:110px'; msgTA.value = 'Dear ' + userName + ',\n\nThis message is from the Filmnance admin team.\n\n';
    var errP = document.createElement('p'); errP.style.cssText = 'font-size:0.78rem;min-height:1rem;color:var(--text-dim);margin-top:0.5rem';

    var btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:0.6rem;margin-top:0.85rem';
    var cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'flex:1;padding:0.75rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--r);color:var(--text-dim);cursor:pointer;font-size:0.82rem;font-weight:600';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () { dmOv.remove(); if (onCancel) onCancel(); });

    var sendBtn = document.createElement('button');
    sendBtn.style.cssText = 'flex:2;padding:0.75rem;background:rgba(125,211,252,0.12);border:1px solid rgba(125,211,252,0.3);border-radius:var(--r);color:#7dd3fc;cursor:pointer;font-size:0.85rem;font-weight:700';
    sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane" style="margin-right:0.4rem"></i>SEND MESSAGE';
    sendBtn.addEventListener('click', async function () {
        var subject = subI.value.trim();
        var bodyTxt = msgTA.value.trim();
        if (!subject || !bodyTxt) { errP.style.color = 'var(--error)'; errP.textContent = 'Subject and message are required.'; return; }
        errP.style.color = 'var(--text-dim)'; errP.textContent = 'Sending...'; sendBtn.disabled = true;
        try {
            var res = await fetch('/api/v1/admin/users/' + userId + '/send-message', {
                method: 'POST',
                headers: Object.assign({}, getHeaders(), { 'Content-Type': 'application/json' }),
                body: JSON.stringify({ subject: subject, body: bodyTxt })
            });
            var d = await res.json();
            if (!res.ok) throw new Error(d.detail || 'Send failed');
            errP.style.color = '#22c55e'; errP.textContent = 'Message sent!';
            setTimeout(function () { dmOv.remove(); if (onCancel) onCancel(); }, 1500);
        } catch (e) { errP.style.color = 'var(--error)'; errP.textContent = e.message; sendBtn.disabled = false; }
    });

    btns.appendChild(cancelBtn); btns.appendChild(sendBtn);
    body.appendChild(toL); body.appendChild(toV); body.appendChild(subL); body.appendChild(subI);
    body.appendChild(msgL); body.appendChild(msgTA); body.appendChild(errP); body.appendChild(btns);
    box.appendChild(hdr); box.appendChild(body);
    dmOv.appendChild(box);
    document.body.appendChild(dmOv);
    setTimeout(function () { msgTA.focus(); }, 150);
}