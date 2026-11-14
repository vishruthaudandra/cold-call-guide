import './style.css';

const API = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const state = { content: null, call: null, selectedTap: '', prospectWords: '', needWords: '', page: 'call', busy: false, notice: '', closeModal: false };
const app = document.querySelector('#app');

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const currentStage = () => state.content?.stages.find(s => s.n === state.call?.current_stage) || state.content?.stages[0];
const stamp = value => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'In progress';

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}

function notify(message) {
  state.notice = message;
  render();
  window.setTimeout(() => { if (state.notice === message) { state.notice = ''; render(); } }, 4500);
}

function shell(content) {
  return `<div class="shell">
    <header class="topbar"><a class="brand" href="#call" aria-label="Fieldnote home"><span class="brand-mark">f.</span><span>fieldnote</span></a>
      <div class="top-meta"><span class="live-dot"></span> CALLER DESK <span class="divider">/</span> HYDERABAD</div>
      <nav><button class="nav-link ${state.page === 'call' ? 'active' : ''}" data-page="call">Live call</button><button class="nav-link ${state.page === 'history' ? 'active' : ''}" data-page="history">Call history</button></nav>
    </header>
    ${state.notice ? `<div class="notice" role="status">${escapeHtml(state.notice)}</div>` : ''}
    ${content}
    ${state.closeModal ? renderCloseModal() : ''}
    <footer><span>FIELDNOTE <span class="divider">·</span> A QUIETER WAY THROUGH A COLD CALL</span><span>Keep the conversation human.</span></footer>
  </div>`;
}

function renderCloseModal() {
  return `<div class="modal-backdrop" role="presentation"><form id="close-form" class="close-modal" role="dialog" aria-modal="true" aria-labelledby="close-title">
    <div class="eyebrow">CALL COMPLETE <span class="divider">/</span> RECORD THE OUTCOME</div>
    <h2 id="close-title">How did it go?</h2>
    <p>Choose the outcome that best describes the conversation.</p>
    <label for="outcome">CALL OUTCOME</label><select id="outcome" name="outcome" required><option value="">Choose an outcome…</option>${state.content.outcomes.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select>
    <label for="close-need">THEIR NEED <span>Optional</span></label><textarea id="close-need" name="need_words" maxlength="2000" placeholder="Their words, if you captured them…">${escapeHtml(state.needWords || state.prospectWords)}</textarea>
    <label for="next-note">AGREED NEXT STEP <span>Optional</span></label><input id="next-note" name="next_step_note" maxlength="500" placeholder="e.g. WhatsApp report, then call Tuesday" />
    <div class="modal-actions"><button class="text-button" type="button" id="cancel-close">Keep call open</button><button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Saving…' : 'Save outcome'} <span>↗</span></button></div>
  </form></div>`;
}

function renderSetup() {
  return shell(`<main class="setup-wrap"><div class="eyebrow">YOUR CALL DESK</div><h1>Start with a name.<br><em>Stay with the conversation.</em></h1>
    <p class="intro">A small guide to help you find your place in the call, hear what matters, and choose a clear next step.</p>
    <form id="start-form" class="start-card"><label for="prospect">Who are you calling?</label><div class="start-row"><input id="prospect" name="prospect" maxlength="120" placeholder="Name, company, or a reminder" required /><button class="primary" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Starting…' : 'Start call'} <span>↗</span></button></div><small>Your notes stay in your call history.</small></form>
    <div class="setup-foot"><span class="tiny-icon">✳</span><span>8 stages, one conversation at a time</span><span class="setup-line"></span><span>01 / 08</span></div></main>`);
}

function renderCall() {
  if (!state.call) return renderSetup();
  const stage = currentStage();
  const last = stage.n === 8;
  const progress = (stage.n / 8) * 100;
  return shell(`<main class="workspace">
    <section class="call-head"><div><div class="eyebrow">LIVE CALL <span class="divider">/</span> ${escapeHtml(state.call.prospect_label)}</div><h1>Keep your place.<br><em>Listen for what’s next.</em></h1></div><div class="call-clock"><span class="live-dot"></span> IN PROGRESS <span class="clock-time">${stamp(state.call.started_at)}</span></div></section>
    <div class="progress-wrap"><div class="progress-label"><span>CALL FLOW</span><span>STAGE ${String(stage.n).padStart(2, '0')} <span class="divider">/</span> 08</span></div><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
      <div class="stage-steps">${state.content.stages.map(s => `<button class="stage-step ${s.n === stage.n ? 'current' : ''} ${s.n < stage.n ? 'done' : ''}" data-stage-jump="${s.n}" aria-label="Stage ${s.n}: ${escapeHtml(s.name)}"><span>${s.n < stage.n ? '✓' : String(s.n).padStart(2, '0')}</span><small>${escapeHtml(s.name)}</small></button>`).join('')}</div></div>
    <div class="content-grid"><section class="stage-card"><div class="stage-top"><div><div class="eyebrow">STAGE ${String(stage.n).padStart(2, '0')} <span class="divider">/</span> THE CONVERSATION</div><h2>${escapeHtml(stage.name)}</h2></div><div class="stage-count">${String(stage.n).padStart(2, '0')}<span>—08</span></div></div>
      <div class="purpose"><span class="purpose-mark">↳</span><div><div class="eyebrow">THE POINT OF THIS MOMENT</div><p>${escapeHtml(stage.purpose)}</p></div></div>
      <div class="say-section"><div class="section-label"><span>WHAT YOU MAY HEAR</span><span>FROM 100 CALLS</span></div><div class="say-list">${stage.may_say.map((line, i) => `<div class="say-item"><span class="quote-mark">“</span><span>${escapeHtml(line)}</span><span class="say-num">0${i + 1}</span></div>`).join('')}</div></div>
      <div class="tap-section"><div class="section-label"><span>WHAT HAPPENED?</span><span>CHOOSE ONE</span></div><div class="tap-list">${stage.taps.map(t => `<button class="tap ${state.selectedTap === t ? 'selected' : ''}" data-tap="${escapeHtml(t)}"><span class="tap-check">${state.selectedTap === t ? '✓' : '+'}</span>${escapeHtml(t)}</button>`).join('')}</div></div>
      <label class="words-label" for="prospect-words"><span>THEIR WORDS</span><span>Capture what matters</span></label><textarea id="prospect-words" maxlength="2000" placeholder="Type or paste the prospect’s words…">${escapeHtml(state.prospectWords)}</textarea>
      <div class="card-actions"><button class="text-button" id="suggest" ${state.busy ? 'disabled' : ''}>✳ Suggest a reply</button><button class="primary" id="advance" ${state.busy ? 'disabled' : ''}>${last ? 'Finish call' : 'Save & continue'} <span>↗</span></button></div>
      ${state.reply ? `<div class="reply-card"><div class="eyebrow">A POSSIBLE NEXT LINE <button class="close-reply" id="dismiss-reply" aria-label="Dismiss suggestion">×</button></div><p>${escapeHtml(state.reply)}</p><small>Use your judgment; this is a prompt, not a script.</small></div>` : ''}
    </section><aside class="side-note"><div class="side-kicker">A NOTE FOR THE CALLER</div><div class="side-icon">✳</div><h3>Let the call<br>set the pace.</h3><p>You can move between stages at any time. Make a note in their words, then keep listening.</p><div class="aside-rule"></div><div class="aside-step"><span>${String(stage.n).padStart(2, '0')}</span><div><b>${escapeHtml(stage.name)}</b><small>of 8 moments</small></div></div><button class="end-call" id="end-call">End call &amp; log outcome <span>↗</span></button></aside></div>
    </main>`);
}

async function renderHistory() {
  let calls;
  try { calls = await request('/calls'); }
  catch (err) { state.notice = err.message; calls = []; }
  return shell(`<main class="history-page"><div class="eyebrow">YOUR CALLS <span class="divider">/</span> THE FOLLOW-THROUGH</div><h1>Every conversation<br><em>leaves a thread.</em></h1><p class="intro">A record of where you began, where the call went, and what comes next.</p>
    <div class="history-toolbar"><span>${calls.length} ${calls.length === 1 ? 'CALL' : 'CALLS'} RECORDED</span><button class="text-button" data-page="call">＋ New call</button></div>
    ${calls.length ? `<div class="history-list">${calls.map(c => { const st = state.content.stages.find(s => s.n === c.furthest_stage); const outcome = state.content.outcomes.find(o => o.value === c.outcome)?.label || 'In progress'; return `<button class="history-row" data-reopen="${escapeHtml(c.id)}"><span class="history-date">${stamp(c.started_at)}</span><span class="history-name">${escapeHtml(c.prospect_label)}</span><span class="history-stage"><i>${String(c.furthest_stage).padStart(2,'0')}</i><span>${escapeHtml(st?.name || 'Opening')}</span></span><span class="history-outcome">${escapeHtml(outcome)}</span><span class="row-arrow">↗</span></button>`; }).join('')}</div>` : `<div class="empty-history"><span>✳</span><h2>No calls here yet.</h2><p>Your completed calls will find their way here.</p><button class="primary" data-page="call">Start a call <span>↗</span></button></div>`}</main>`);
}

async function render() {
  if (!state.content) {
    app.innerHTML = shell('<main class="loading"><span class="loader"></span><p>Preparing your call desk…</p></main>');
    try { state.content = await request('/stages'); }
    catch { app.innerHTML = shell(`<main class="loading error-state"><div class="eyebrow">CAN’T REACH THE CALL DESK</div><h1>The backend isn’t responding.</h1><p>Start the backend, then refresh this page. Current API: <code>${escapeHtml(API)}</code></p></main>`); return; }
  }
  app.innerHTML = state.page === 'history' ? await renderHistory() : renderCall();
  bindEvents();
}

function bindEvents() {
  app.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => { state.page = el.dataset.page; render(); }));
  app.querySelectorAll('[data-tap]').forEach(el => el.addEventListener('click', () => { state.selectedTap = el.dataset.tap; render(); }));
  const words = app.querySelector('#prospect-words');
  words?.addEventListener('input', e => { state.prospectWords = e.target.value; });
  app.querySelector('#start-form')?.addEventListener('submit', async e => {
    e.preventDefault(); state.busy = true; render();
    try { state.call = await request('/calls', { method: 'POST', body: JSON.stringify({ prospect_label: new FormData(e.target).get('prospect').trim() }) }); state.page = 'call'; state.selectedTap = ''; state.prospectWords = ''; state.reply = ''; }
    catch (err) { notify(err.message); }
    finally { state.busy = false; render(); }
  });
  app.querySelector('#advance')?.addEventListener('click', async () => {
    state.busy = true; const stage = currentStage(); const end = stage.n === 8; render();
    try {
      if (stage.n === 5 && state.prospectWords.trim()) state.needWords = state.prospectWords.trim();
      const updated = await request(`/calls/${state.call.id}/stages`, { method: 'POST', body: JSON.stringify({ stage: stage.n, what_happened: state.selectedTap || null, prospect_words: state.prospectWords.trim() || null, llm_suggestion: state.reply || null }) });
      if (end) { state.call = updated; state.closeModal = true; }
      else { state.call = updated; state.selectedTap = ''; state.prospectWords = ''; state.reply = ''; }
    } catch (err) { notify(err.message); }
    finally { state.busy = false; render(); }
  });
  app.querySelector('#suggest')?.addEventListener('click', async () => {
    const wordsValue = state.prospectWords.trim(); if (!wordsValue) { notify('Add the prospect’s words first.'); return; }
    state.busy = true; render();
    try { const data = await request('/suggest', { method: 'POST', body: JSON.stringify({ stage: currentStage().n, prospect_words: wordsValue }) }); state.reply = data.suggestion; }
    catch (err) { notify(err.message); }
    finally { state.busy = false; render(); }
  });
  app.querySelector('#dismiss-reply')?.addEventListener('click', () => { state.reply = ''; render(); });
  app.querySelector('#cancel-close')?.addEventListener('click', () => { state.closeModal = false; render(); });
  app.querySelector('#close-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    state.busy = true; render();
    try {
      state.call = await request(`/calls/${state.call.id}/close`, { method: 'POST', body: JSON.stringify({ outcome: data.get('outcome'), need_words: String(data.get('need_words') || '').trim() || null, next_step_note: String(data.get('next_step_note') || '').trim() || null }) });
      state.call = null; state.closeModal = false; state.page = 'history'; notify('Call saved with its outcome.');
    } catch (err) { notify(err.message); }
    finally { state.busy = false; render(); }
  });
  app.querySelector('#end-call')?.addEventListener('click', async () => {
    try {
      const stage = currentStage();
      if (state.selectedTap || state.prospectWords.trim()) {
        if (stage.n === 5 && state.prospectWords.trim()) state.needWords = state.prospectWords.trim();
        await request(`/calls/${state.call.id}/stages`, { method: 'POST', body: JSON.stringify({ stage: stage.n, what_happened: state.selectedTap || null, prospect_words: state.prospectWords.trim() || null, llm_suggestion: state.reply || null }) });
      }
      state.closeModal = true; render();
    } catch (err) { notify(err.message); }
  });
  app.querySelectorAll('[data-stage-jump]').forEach(el => el.addEventListener('click', async () => {
    const target = Number(el.dataset.stageJump); if (target === currentStage().n) return;
    const here = currentStage();
    try {
      if (here.n === 5 && state.prospectWords.trim()) state.needWords = state.prospectWords.trim();
      state.call = await request(`/calls/${state.call.id}/stages`, { method: 'POST', body: JSON.stringify({ stage: here.n, what_happened: state.selectedTap || null, prospect_words: state.prospectWords.trim() || null, llm_suggestion: state.reply || null }) });
      state.call = { ...state.call, current_stage: target }; state.selectedTap = ''; state.prospectWords = ''; state.reply = ''; render();
    } catch (err) { notify(err.message); }
  }));
  app.querySelectorAll('[data-reopen]').forEach(el => el.addEventListener('click', async () => {
    try { const calls = await request('/calls'); state.call = calls.find(c => c.id === el.dataset.reopen); if (state.call?.ended_at) { notify('This call is closed; start a new call to continue.'); return; } state.page = 'call'; render(); }
    catch (err) { notify(err.message); }
  }));
}

render();
