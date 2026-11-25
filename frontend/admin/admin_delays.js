/**
 * FILMNANCE ADMIN — DELAY REQUESTS + MONTHLY UPDATES
 * Fixed: removed Ref from cards, fixed card field order (grace→amount→due date),
 * fixed All tables (no REF col, added PROOF col in delay, full-width, 3-line reason)
 */
'use strict';

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtPhase(raw) {
    if (!raw) return '—';
    return raw.replace(/[_]/g, '-').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
}
// 2-line date: "Jun 12, 2026" on top, time only below
function fmtDateLine(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    var date = d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    var time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
    return '<span style="display:block;line-height:1.4;white-space:nowrap;color:var(--text)">' + date + '</span><span style="display:block;font-size:0.82em;color:var(--text-dim);line-height:1.3;white-space:nowrap">' + time + '</span>';
}
// 2-line grace: "X Month(s) Used" on top, "(Y Left)" below
function graceLines(graceDisp) {
    var m = graceDisp.match(/^(.+\s+Used)\s*\((\d+\s*Left)\)$/);
    if (m) return '<span style="display:block;line-height:1.35;white-space:nowrap">' + m[1] + '</span><span style="display:block;font-size:0.85em;color:var(--text-dim);line-height:1.3;white-space:nowrap">(' + m[2] + ')</span>';
    return '<span style="white-space:nowrap">' + esc(graceDisp) + '</span>';
}
function isGracePhase(phaseStr) {
    var p = (phaseStr || '').toLowerCase().replace(/[_\s]/g, '-');
    return p === 'pre-production' || p === 'development';
}
function graceDisplay(loan, graceVal) {
    var phase = (loan.current_stage || '');
    var isGrace = isGracePhase(phase);
    if (!isGrace) return 'Plus Trust Only';
    var rem = parseInt(graceVal || 0);
    var used = 3 - rem;
    return used + ' Month' + (used !== 1 ? 's' : '') + ' Used (' + rem + ' Left)';
}
function filmRole(role) { return (role && role !== '—' && role !== 'null') ? esc(role) : 'N/A'; }
function fmtPHP(v) { return '₱' + Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 }); }

// ── INIT ─────────────────────────────────────────────────────────────────────
window.loadDelays = function () {
    switchDelayTab('request', document.getElementById('delayTabRequest'));
};
window.initDelaysSection = window.loadDelays;

window.loadDelayBadge = async function () {
    try {
        const r1 = await fetch('/api/v1/admin/delays/pending', { headers: getHeaders() });
        const r2 = await fetch('/api/v1/admin/grace-updates?status=pending', { headers: getHeaders() });
        const d1 = r1.ok ? await r1.json() : [];
        const d2 = r2.ok ? await r2.json() : [];
        setBadge('delayBadge', (d1.length||0)+(d2.length||0));
        setBadge('requestDelayBadge', d1.length||0);
        setBadge('graceUpdateBadge', d2.length||0);
    } catch(e){}
};

// ── TAB SWITCHER ─────────────────────────────────────────────────────────────
window.switchDelayTab = function(tab, btn) {
    ['requestDelayList','graceUpdatesList','allDelaysList'].forEach(function(id){
        var el=document.getElementById(id); if(el) el.style.display='none';
    });
    ['delayTabRequest','delayTabMonthly','delayTabAll'].forEach(function(id){
        var b=document.getElementById(id); if(!b) return;
        b.style.background='var(--bg-card)'; b.style.borderColor='var(--border)'; b.style.color='var(--text-dim)';
        b.querySelectorAll('i,span:not(.nav-badge)').forEach(function(e){e.style.color='var(--text-dim)';});
    });
    if(btn){
        btn.style.background='rgba(234,179,8,0.15)'; btn.style.borderColor='rgba(234,179,8,0.5)'; btn.style.color='#eab308';
        btn.querySelectorAll('i,span:not(.nav-badge)').forEach(function(e){e.style.color='#eab308';});
    }
    if(tab==='request'){ var el=document.getElementById('requestDelayList'); if(el) el.style.display=''; loadRequestDelays(); }
    else if(tab==='monthly'){ var el=document.getElementById('graceUpdatesList'); if(el) el.style.display=''; loadGraceUpdates(); }
    else{ var el=document.getElementById('allDelaysList'); if(el) el.style.display=''; switchAllSubTab('delay',document.getElementById('allSubDelay')); }
};

// ── REQUEST DELAY CARDS ───────────────────────────────────────────────────────
// Order: Installment | Phase | Submitted Date | Grace: 15 Days | Amount | Due Date | Reason | Proof
// No Ref shown
window.loadRequestDelays = async function() {
    var container=document.getElementById('requestDelayList'); if(!container) return;
    container.innerHTML='<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    try {
        var res=await fetch('/api/v1/admin/delays/pending',{headers:getHeaders()});
        if(!res.ok) throw new Error();
        var items=await res.json();
        setBadge('requestDelayBadge', items.length);
        if(!items.length){
            container.innerHTML='<div class="empty-state"><i class="fa-solid fa-hourglass-half" style="font-size:2.5rem;opacity:0.4"></i><p style="color:var(--text-dim)">No pending delay requests</p></div>';
            return;
        }
        container.style.display='grid';
        container.style.gridTemplateColumns='repeat(auto-fill,minmax(320px,1fr))';
        container.style.gap='1rem';
        container.innerHTML=items.map(function(s){
            var loan=s.loan||{}; var prod=s.producer||{};
            var phase=fmtPhase(loan.current_stage);
            var proofHtml=s.delay_proof_url
                ? '<a href="'+esc(s.delay_proof_url)+'" onclick="event.preventDefault();openImgModal(\''+esc(s.delay_proof_url)+'\')"><img src="'+esc(s.delay_proof_url)+'" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;margin-top:0.6rem;cursor:zoom-in" onerror="this.style.display=\'none\'"></a>'
                : '<div style="color:var(--text-dim);font-size:0.75rem;margin-top:0.4rem">No proof attached</div>';
            var reasonHtml='<div style="font-size:0.82rem;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:6px;padding:0.6rem;margin-bottom:0.4rem;word-break:break-word;white-space:pre-wrap;max-height:100px;overflow-y:auto">'+esc(s.delay_reason||'—')+'</div>';
            var actions='<div style="display:flex;gap:0.5rem;margin-top:0.75rem">'
                +'<button onclick="approveDelay('+s.id+')" style="flex:1;padding:0.55rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:var(--r);color:#22c55e;cursor:pointer;font-size:0.8rem;font-weight:700" onmouseover="this.style.background=\'rgba(34,197,94,0.25)\'" onmouseout="this.style.background=\'rgba(34,197,94,0.1)\'"><i class="fas fa-check" style="margin-right:0.3rem"></i>Approve</button>'
                +'<button onclick="declineDelay('+s.id+')" style="flex:1;padding:0.55rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:var(--r);color:#ef4444;cursor:pointer;font-size:0.8rem;font-weight:700" onmouseover="this.style.background=\'rgba(239,68,68,0.25)\'" onmouseout="this.style.background=\'rgba(239,68,68,0.1)\'"><i class="fas fa-xmark" style="margin-right:0.3rem"></i>Reject</button>'
                +'</div>';
            return '<div class="loan-card" id="reqDelayRow'+s.id+'" style="border-color:rgba(234,179,8,0.3)">'
                +'<div style="display:flex;justify-content:space-between;margin-bottom:0.5rem"><div><span style="font-weight:700;color:var(--text)">'+esc(prod.name||'—')+'</span> <span style="font-size:0.72rem;color:var(--text-dim)">· '+esc(loan.project_title||'—')+'</span></div><span style="font-size:0.65rem;color:#eab308;font-weight:700">REQUEST DELAY</span></div>'
                +'<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.25rem">Installment: <b style="color:var(--text)">#'+(s.installment_number||'—')+'</b></div>'
                +'<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.25rem">Production Phase: <b style="color:var(--text)">'+phase+'</b></div>'
                +'<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.25rem">Submitted Date: <b style="color:var(--text)">'+(s.delay_requested_at?fmtDate(s.delay_requested_at):'—')+'</b></div>'
                +'<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.25rem">Grace: <b style="color:var(--text)">15 Days</b></div>'
                +'<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.25rem">Amount: <b style="color:var(--gold)">'+fmtPHP(s.amount_due)+'</b></div>'
                +'<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.5rem">Due Date: <b style="color:var(--text)">'+(s.due_date?fmtDate(s.due_date):'—')+'</b></div>'
                +'<div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.3rem">PRODUCTION REQUEST:</div>'
                +reasonHtml+proofHtml+actions+'</div>';
        }).join('');
    } catch(e){ container.innerHTML='<div class="empty-state"><p style="color:var(--error)">Failed to load.</p></div>'; }
};

window.approveDelay=async function(scheduleId){
    try{
        const res=await fetch('/api/v1/admin/delays/'+scheduleId+'/approve',{method:'POST',headers:getHeaders()});
        const d=await res.json(); if(!res.ok) throw new Error(d.detail||'Failed');
        showToast(d.message||'Delay approved.','success');
        var row=document.getElementById('reqDelayRow'+scheduleId); if(row) row.remove();
        loadDelayBadge(); loadDashboard();
    } catch(e){ showToast(e.message,'error'); }
};
window.declineDelay=async function(scheduleId){
    try{
        const res=await fetch('/api/v1/admin/delays/'+scheduleId+'/decline',{method:'POST',headers:getHeaders()});
        const d=await res.json(); if(!res.ok) throw new Error(d.detail||'Failed');
        showToast(d.message||'Delay declined.','info');
        var row=document.getElementById('reqDelayRow'+scheduleId); if(row) row.remove();
        loadDelayBadge(); loadDashboard();
    } catch(e){ showToast(e.message,'error'); }
};

// ── REQUEST MONTHLY UPDATES CARDS ─────────────────────────────────────────────
// Order: Installment | Phase | Submitted | Grace | Amount | Due Date
// No Ref shown
window.loadGraceUpdates=async function(){
    var container=document.getElementById('graceUpdatesList'); if(!container) return;
    container.innerHTML='<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i></div>';
    try{
        const res=await fetch('/api/v1/admin/grace-updates?status=pending',{headers:getHeaders()});
        if(!res.ok) throw new Error();
        const updates=await res.json();
        setBadge('graceUpdateBadge',updates.length);
        if(!updates.length){
            container.innerHTML='<div class="empty-state"><i class="fa-solid fa-calendar-check" style="font-size:2.5rem;opacity:0.4;color:#eab308"></i><p style="color:var(--text-dim)">No pending monthly updates</p></div>';
            return;
        }
        container.style.display='grid';
        container.style.gridTemplateColumns='repeat(auto-fill,minmax(320px,1fr))';
        container.style.gap='1rem';
        container.innerHTML=updates.map(function(u){
            var ph=u.producer||{}; var ln=u.loan||{};
            var phase=fmtPhase(ln.current_stage);
            var graceDisp=graceDisplay(ln,ln.grace_months_remaining);
            var photoHtml=u.photo_url
                ? '<div style="margin-top:0.6rem"><a href="'+esc(u.photo_url)+'" onclick="event.preventDefault();openImgModal(\''+esc(u.photo_url)+'\')"><img src="'+esc(u.photo_url)+'" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;cursor:zoom-in" onerror="this.style.display=\'none\'"></a></div>'
                : '<div style="color:var(--text-dim);font-size:0.75rem;margin-top:0.4rem">No photo attached</div>';
            var updateHtml='<div style="font-size:0.82rem;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:6px;padding:0.6rem;margin-bottom:0.4rem;word-break:break-word;white-space:pre-wrap;max-height:100px;overflow-y:auto">'+esc(u.update_text||'')+'</div>';
            var actions='<div style="display:flex;gap:0.5rem;margin-top:0.75rem">'
                +'<button onclick="approveMonthlyUpdate('+u.id+')" style="flex:1;padding:0.55rem;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:var(--r);color:#22c55e;cursor:pointer;font-size:0.8rem;font-weight:700" onmouseover="this.style.background=\'rgba(34,197,94,0.25)\'" onmouseout="this.style.background=\'rgba(34,197,94,0.1)\'"><i class="fas fa-check" style="margin-right:0.3rem"></i>Approve</button>'
                +'<button onclick="showRejectMonthlyModal('+u.id+')" style="flex:1;padding:0.55rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:var(--r);color:#ef4444;cursor:pointer;font-size:0.8rem;font-weight:700" onmouseover="this.style.background=\'rgba(239,68,68,0.25)\'" onmouseout="this.style.background=\'rgba(239,68,68,0.1)\'"><i class="fas fa-xmark" style="margin-right:0.3rem"></i>Reject</button>'
                +'</div>';
            return '<div class="loan-card" id="graceRow'+u.id+'" style="border-color:rgba(150,150,150,0.3)">'
                +'<div style="display:flex;justify-content:space-between;margin-bottom:0.5rem"><div><span style="font-weight:700;color:var(--text)">'+esc(ph.name||'—')+'</span> <span style="font-size:0.72rem;color:var(--text-dim)">· '+esc(ln.project_title||'—')+'</span></div><span style="font-size:0.65rem;color:var(--text-dim);font-weight:700;background:rgba(150,150,150,0.12);border:1px solid rgba(150,150,150,0.3);border-radius:4px;padding:0.15rem 0.45rem">MONTHLY UPDATE</span></div>'
                +'<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.25rem">Installment: <b style="color:var(--text)">#'+(u.installment_number||'—')+'</b></div>'
                +'<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.25rem">Production Phase: <b style="color:var(--text)">'+phase+'</b></div>'
                +'<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.25rem">Submitted: <b style="color:var(--text)">'+(u.created_at?fmtDate(u.created_at):'—')+'</b></div>'
                +'<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.25rem">Grace: <b style="color:'+(graceDisp==='Plus Trust Only'?'var(--text-dim)':'#22c55e')+'">'+esc(graceDisp)+'</b></div>'
                +'<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.25rem">Amount: <b style="color:var(--gold)">'+fmtPHP(u.amount_due||0)+'</b></div>'
                +'<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:0.5rem">Due Date: <b style="color:var(--text)">'+(u.due_date?fmtDate(u.due_date):'—')+'</b></div>'
                +'<div style="font-size:0.72rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.3rem">PRODUCTION UPDATE:</div>'
                +updateHtml+photoHtml+actions+'</div>';
        }).join('');
    } catch(e){ container.innerHTML='<div class="empty-state"><p style="color:var(--error)">Failed to load.</p></div>'; }
};

window.approveMonthlyUpdate=async function(updateId){
    try{
        const res=await fetch('/api/v1/admin/grace-updates/'+updateId+'/approve',{method:'POST',headers:getHeaders()});
        const d=await res.json(); if(!res.ok) throw new Error(d.detail||'Failed');
        showToast((d.message||'Approved.')+(d.trust_bonus?' +'+d.trust_bonus+' trust pts.':''),'success');
        var row=document.getElementById('graceRow'+updateId); if(row) row.remove();
        loadDelayBadge(); loadDashboard();
    } catch(e){ showToast(e.message,'error'); }
};
window.showRejectMonthlyModal=function(updateId){
    var ex=document.getElementById('rejectMonthlyModal'); if(ex) ex.remove();
    var ov=document.createElement('div');
    ov.id='rejectMonthlyModal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
    ov.innerHTML='<div style="background:var(--surface,var(--bg-card));border:1px solid var(--border);border-radius:12px;padding:2rem;width:min(480px,90vw)">'
        +'<h3 style="margin:0 0 1rem;font-size:1rem;color:var(--text)">Reject Monthly Update</h3>'
        +'<textarea id="rejectMonthlyReason" rows="3" placeholder="Reason..." style="width:100%;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:6px;padding:0.6rem;color:var(--text);font-size:0.85rem;resize:vertical;box-sizing:border-box"></textarea>'
        +'<div style="display:flex;gap:0.75rem;margin-top:1.25rem;justify-content:flex-end">'
        +'<button onclick="document.getElementById(\'rejectMonthlyModal\').remove()" style="padding:0.5rem 1.2rem;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:6px;color:var(--text-dim);cursor:pointer">Cancel</button>'
        +'<button onclick="confirmRejectMonthly('+updateId+')" style="padding:0.5rem 1.2rem;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:6px;color:#ef4444;cursor:pointer;font-weight:700">Confirm Reject</button>'
        +'</div></div>';
    document.body.appendChild(ov);
    document.getElementById('rejectMonthlyReason').focus();
};
window.confirmRejectMonthly=async function(updateId){
    var reason=(document.getElementById('rejectMonthlyReason')?.value||'').trim();
    if(!reason){ showToast('Reason required.','error'); return; }
    try{
        var fd=new FormData(); fd.append('reason',reason);
        const res=await fetch('/api/v1/admin/grace-updates/'+updateId+'/reject',{method:'POST',headers:(function(){var h=Object.assign({},getHeaders());delete h['Content-Type'];return h;})(),body:fd});
        const d=await res.json(); if(!res.ok) throw new Error(d.detail||'Failed');
        showToast(d.message||'Rejected.','info');
        document.getElementById('rejectMonthlyModal')?.remove();
        var row=document.getElementById('graceRow'+updateId); if(row) row.remove();
        loadDelayBadge();
    } catch(e){ showToast(e.message,'error'); }
};

// ── ALL TAB — sub-tab switcher ─────────────────────────────────────────────────
window.switchAllSubTab=function(subTab, btn){
    ['allSubDelay','allSubMonthly'].forEach(function(id){
        var b=document.getElementById(id); if(!b) return;
        b.style.background='var(--bg-card)'; b.style.borderColor='var(--border)'; b.style.color='var(--text-dim)';
    });
    if(btn){ btn.style.background='rgba(234,179,8,0.12)'; btn.style.borderColor='rgba(234,179,8,0.4)'; btn.style.color='#eab308'; }
    var content=document.getElementById('allDelaysContent'); if(!content) return;
    if(subTab==='delay') loadApprovedDelays(content);
    else loadApprovedMonthly(content);
};


// ── DELAY APPROVED TABLE ───────────────────────────────────────────────────────
async function loadApprovedDelays(container){
    container.innerHTML='';
    var wrap='<div style="width:100%;overflow-x:auto">'
        +'<table class="data-table" style="width:100%;border-collapse:collapse;table-layout:auto"><thead><tr>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">FILMMAKER ROLE</th>'
        +'<th style="padding:0.6rem 0.5rem;white-space:nowrap">ID</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">INSTALLMENT</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">USER</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">PROJECT</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">PHASE</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">SUBMITTED DATE</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">AMOUNT DUE</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">DUE DATE</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">GRACE</th>'
        +'<th style="padding:0.6rem 0.75rem;min-width:200px">REASON</th>'
        +'<th style="padding:0.6rem 0.5rem;white-space:nowrap">PROOF</th>'
        +'</tr></thead><tbody id="delayApprovedBody"></tbody></table></div>';
    container.innerHTML=wrap;
    var tbody=document.getElementById('delayApprovedBody');
    try{
        const res=await fetch('/api/v1/admin/delays/all?status=approved',{headers:getHeaders()});
        const items=res.ok?await res.json():[];
        if(!items.length){
            tbody.innerHTML='<tr><td colspan="12" style="text-align:center;padding:2rem;color:var(--text-dim)">No approved delay requests yet</td></tr>';
            return;
        }
        var C='padding:0.6rem 0.75rem;font-size:0.78rem;vertical-align:top;border-bottom:1px solid rgba(255,255,255,0.05)';
        var CW=C+';white-space:nowrap';
        tbody.innerHTML=items.map(function(s){
            var loan=s.loan||{}; var prod=s.producer||{};
            var phase=fmtPhase(loan.current_stage);
            var reason=s.delay_reason||'\u2014';
            var safeReason=reason.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n');
            var submittedDateHtml=s.delay_requested_at?fmtDateLine(s.delay_requested_at):'\u2014';
            var dueDateHtml=s.due_date?fmtDateLine(s.due_date):'\u2014';
            var proofHtml=s.delay_proof_url
                ?'<img src="'+esc(s.delay_proof_url)+'" style="width:64px;height:64px;object-fit:cover;border-radius:6px;cursor:zoom-in;border:1px solid var(--border);display:block" onclick="openImgModal(\''+esc(s.delay_proof_url)+'\')" onerror="this.style.display=\'none\'">'
                :'\u2014';
            var reasonHtml='<span style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;white-space:normal;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px" title="Click to expand" onclick="showReasonModal(\''+safeReason+'\')">'
                +esc(reason)+'</span>';
            return '<tr>'
                +'<td style="'+CW+'">'+filmRole(prod.filmmaker_role)+'</td>'
                +'<td style="'+CW+';font-family:monospace;color:var(--text-dim)">'+(prod.id?'#'+prod.id:'\u2014')+'</td>'
                +'<td style="'+CW+';font-family:monospace">#'+(s.installment_number||'\u2014')+'</td>'
                +'<td style="'+CW+';font-weight:600">'+esc(prod.name||'\u2014')+'</td>'
                +'<td style="'+CW+'">'+esc(loan.project_title||'\u2014')+'</td>'
                +'<td style="'+CW+';color:var(--text-dim)">'+esc(phase)+'</td>'
                +'<td style="'+C+';font-family:monospace;color:var(--text-dim)">'+submittedDateHtml+'</td>'
                +'<td style="'+CW+';font-family:monospace;font-weight:700;color:var(--gold)">'+fmtPHP(s.amount_due)+'</td>'
                +'<td style="'+C+';font-family:monospace">'+dueDateHtml+'</td>'
                +'<td style="'+CW+'">15 Days</td>'
                +'<td style="'+C+';max-width:200px">'+reasonHtml+'</td>'
                +'<td style="'+C+'">'+proofHtml+'</td>'
                +'</tr>';
        }).join('');
    }catch(e){
        if(tbody)tbody.innerHTML='<tr><td colspan="12" style="text-align:center;padding:2rem;color:var(--text-dim)">No approved delay requests yet</td></tr>';
    }
}

// ── MONTHLY UPDATE APPROVED TABLE ─────────────────────────────────────────────
async function loadApprovedMonthly(container){
    container.innerHTML='';
    var wrap='<div style="width:100%;overflow-x:auto">'
        +'<table class="data-table" style="width:100%;border-collapse:collapse;table-layout:auto"><thead><tr>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">FILMMAKER ROLE</th>'
        +'<th style="padding:0.6rem 0.5rem;white-space:nowrap">ID</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">INSTALLMENT</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">USER</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">PROJECT</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">PHASE</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">SUBMITTED DATE</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">AMOUNT DUE</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">DUE DATE</th>'
        +'<th style="padding:0.6rem 0.75rem;white-space:nowrap">GRACE</th>'
        +'<th style="padding:0.6rem 0.75rem;min-width:200px">REASON</th>'
        +'<th style="padding:0.6rem 0.5rem;white-space:nowrap">PROOF</th>'
        +'</tr></thead><tbody id="monthlyApprovedBody"></tbody></table></div>';
    container.innerHTML=wrap;
    var tbody=document.getElementById('monthlyApprovedBody');
    try{
        const res=await fetch('/api/v1/admin/grace-updates?status=approved',{headers:getHeaders()});
        const updates=res.ok?await res.json():[];
        if(!updates.length){
            tbody.innerHTML='<tr><td colspan="12" style="text-align:center;padding:2rem;color:var(--text-dim)">No approved monthly updates yet</td></tr>';
            return;
        }
        var C='padding:0.6rem 0.75rem;font-size:0.78rem;vertical-align:top;border-bottom:1px solid rgba(255,255,255,0.05)';
        var CW=C+';white-space:nowrap';
        tbody.innerHTML=updates.map(function(u){
            var ph=u.producer||{}; var ln=u.loan||{};
            var phase=fmtPhase(ln.current_stage);
            var graceDisp=graceDisplay(ln,ln.grace_months_remaining);
            var proofHtml=u.photo_url
                ?'<img src="'+esc(u.photo_url)+'" style="width:64px;height:64px;object-fit:cover;border-radius:6px;cursor:zoom-in;border:1px solid var(--border);display:block" onclick="openImgModal(\''+esc(u.photo_url)+'\')" onerror="this.style.display=\'none\'">'
                :'\u2014';
            var reason=u.update_text||'\u2014';
            var safeReason=reason.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n');
            var amtDisplay=u.amount_due?fmtPHP(u.amount_due):'\u2014';
            var submittedDateHtml=u.created_at?fmtDateLine(u.created_at):'\u2014';
            var dueDateHtml=u.due_date?fmtDateLine(u.due_date):'\u2014';
            var graceLinesHtml=graceLines(graceDisp);
            var reasonHtml='<span style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;white-space:normal;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px" title="Click to expand" onclick="showReasonModal(\''+safeReason+'\')">'
                +esc(reason)+'</span>';
            return '<tr>'
                +'<td style="'+CW+'">'+filmRole(ph.filmmaker_role)+'</td>'
                +'<td style="'+CW+';font-family:monospace;color:var(--text-dim)">'+(ph.id?'#'+ph.id:'\u2014')+'</td>'
                +'<td style="'+CW+';font-family:monospace">#'+(u.installment_number||'\u2014')+'</td>'
                +'<td style="'+CW+';font-weight:600">'+esc(ph.name||'\u2014')+'</td>'
                +'<td style="'+CW+'">'+esc(ln.project_title||'\u2014')+'</td>'
                +'<td style="'+CW+';color:var(--text-dim)">'+esc(phase)+'</td>'
                +'<td style="'+C+';font-family:monospace;color:var(--text-dim)">'+submittedDateHtml+'</td>'
                +'<td style="'+CW+';font-family:monospace;font-weight:700;color:var(--gold)">'+amtDisplay+'</td>'
                +'<td style="'+C+';font-family:monospace">'+dueDateHtml+'</td>'
                +'<td style="'+C+';color:'+(graceDisp==='Plus Trust Only'?'var(--text-dim)':'#22c55e')+'">'+graceLinesHtml+'</td>'
                +'<td style="'+C+';max-width:200px">'+reasonHtml+'</td>'
                +'<td style="'+C+'">'+proofHtml+'</td>'
                +'</tr>';
        }).join('');
    }catch(e){
        if(tbody)tbody.innerHTML='<tr><td colspan="12" style="text-align:center;padding:2rem;color:var(--text-dim)">No approved monthly updates yet</td></tr>';
    }
}

// ── IMAGE MODAL ───────────────────────────────────────────────────────────────
window.openImgModal=function(url){
    var ex=document.getElementById('_imgModal'); if(ex) ex.remove();
    var ov=document.createElement('div');
    ov.id='_imgModal';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:20000;display:flex;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(6px)';
    ov.innerHTML='<img src="'+esc(url)+'" style="max-width:90vw;max-height:90vh;border-radius:10px;box-shadow:0 0 60px rgba(0,0,0,0.8)">';
    ov.onclick=function(){ ov.remove(); };
    document.body.appendChild(ov);
};

// ── REASON FULL-TEXT MODAL ────────────────────────────────────────────────────
window.showReasonModal = function(text) {
    var ex = document.getElementById('_reasonModal'); if (ex) ex.remove();
    var ov = document.createElement('div');
    ov.id = '_reasonModal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);padding:1rem';
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--surface,var(--bg-card));border:1px solid var(--border);border-radius:14px;max-width:520px;width:100%;overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.6)';
    box.innerHTML = '<div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:0.75rem">'
        + '<i class="fas fa-align-left" style="color:var(--gold)"></i>'
        + '<span style="font-weight:700;font-size:0.92rem;flex:1">Full Reason</span>'
        + '<button onclick="document.getElementById(\'_reasonModal\').remove()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:1.1rem"><i class="fas fa-times"></i></button>'
        + '</div>'
        + '<div style="padding:1.25rem;font-size:0.88rem;line-height:1.65;color:var(--text);white-space:pre-wrap;word-break:break-word;max-height:60vh;overflow-y:auto">' + (text || '\u2014') + '</div>'
        + '<div style="padding:0.75rem 1.25rem;border-top:1px solid var(--border);text-align:right">'
        + '<button onclick="document.getElementById(\'_reasonModal\').remove()" style="padding:0.5rem 1.2rem;background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.3);border-radius:8px;color:var(--gold);cursor:pointer;font-size:0.82rem;font-weight:700">Close</button>'
        + '</div>';
    ov.appendChild(box);
    ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
    document.body.appendChild(ov);
};