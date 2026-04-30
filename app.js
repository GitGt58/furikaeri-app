// ===== WORKER URL =====
// Cloudflare Workerのデプロイ後にURLを設定してください
// 例: 'https://furikaeri-bot-api.YOUR_SUBDOMAIN.workers.dev'
const WORKER_URL = 'https://black-credit-3a3a.gooooo-y-4-2.workers.dev';

// ===== STATE =====
let db = { goals: [], sessions: [] };
let editGoalId = null;
let selCatVal = 'health';
let editCtx = null;

let qa = {
  active: false,
  questions: [],
  currentIdx: 0,
  answers: {},
  sliderVal: 60,
};

// ===== INIT =====
function init() {
  loadData();
  setToday();
  renderGoals();
  renderQAStart();
  renderHistory();
}

function setToday() {
  const d = new Date(), wd = ['日', '月', '火', '水', '木', '金', '土'];
  document.getElementById('today-lbl').textContent =
    `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}(${wd[d.getDay()]})`;
}
const p = n => String(n).padStart(2, '0');
const dateStr = d => { d = d || new Date(); return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`; };
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ===== wrapLong =====
// 優先順位: 1.\n(意図的改行)を保持 2.。の後で改行 3.20文字超えで強制改行
function wrapLong(text, n = 20) {
  return text.split('\n').map(line => {
    const sentences = line.split(/(?<=。)/);
    const result = [];
    let current = '';
    for (const seg of sentences) {
      if ((current + seg).length > n && current.length > 0) {
        result.push(current);
        current = seg;
      } else {
        current += seg;
      }
      if (current.endsWith('。')) {
        result.push(current);
        current = '';
      }
    }
    while (current.length > n) {
      result.push(current.slice(0, n));
      current = current.slice(n);
    }
    if (current) result.push(current);
    return result.join('\n');
  }).join('\n');
}

// ===== STORAGE =====
function loadData() {
  try { db = JSON.parse(localStorage.getItem('furi_db') || '{"goals":[],"sessions":[]}'); }
  catch (e) { db = { goals: [], sessions: [] }; }
  if (!db.sessions) db.sessions = [];
}
function saveData() { localStorage.setItem('furi_db', JSON.stringify(db)); }

// ===== AI提案が使えるか =====
function aiAvailable() {
  return WORKER_URL && !WORKER_URL.includes('YOUR_SUBDOMAIN');
}

// ===== PAGE NAV =====
function showPage(tabEl) {
  const name = tabEl.dataset.page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  tabEl.classList.add('active');
  if (name === 'furikaeri') renderQAStart();
  if (name === 'history') renderHistory();
}

// ===== GOALS =====
const catLabel = { health: '🏃 健康・運動', study: '📚 学習・スキル', career: '💼 仕事・キャリア', other: '✨ その他' };
const catCls = { health: 'cat-health', study: 'cat-study', career: 'cat-career', other: 'cat-other' };

function renderGoals() {
  const list = document.getElementById('goals-list');
  const empty = document.getElementById('goals-empty');
  if (!db.goals.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  list.innerHTML = db.goals.map(g => {
    const recs = db.sessions.flatMap(s => s.answers || []).filter(a => a.goalId === g.id);
    const avg = recs.length ? Math.round(recs.reduce((s, r) => s + (r.achievement || 0), 0) / recs.length) : 0;
    return `<div class="goal-item">
      <div class="goal-item-top">
        <div>
          <div class="goal-title">${esc(g.title)}</div>
          <div class="goal-meta">${g.start} 〜 ${g.end}　記録 ${recs.length}件</div>
          <span class="goal-cat ${catCls[g.cat] || 'cat-other'}">${catLabel[g.cat] || 'その他'}</span>
        </div>
        <div style="display:flex;gap:5px;">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="openGoalModal('${g.id}')">✏️</button>
          <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--warn);" onclick="deleteGoal('${g.id}')">🗑</button>
        </div>
      </div>
      <div class="goal-prog-wrap"><div class="goal-prog" style="width:${avg}%"></div></div>
      <div style="font-size:11px;color:var(--ink3);margin-top:4px;font-family:'DM Mono',monospace;">平均達成度 ${avg}%</div>
      ${g.desc ? `<div style="font-size:12px;color:var(--ink2);margin-top:8px;">${esc(g.desc)}</div>` : ''}
    </div>`;
  }).join('');
}

function openGoalModal(id) {
  editGoalId = id || null;
  document.getElementById('modal-title').textContent = id ? '目標を編集' : '目標を追加';
  if (id) {
    const g = db.goals.find(x => x.id === id);
    document.getElementById('m-title').value = g.title;
    document.getElementById('m-desc').value = g.desc || '';
    document.getElementById('m-start').value = g.start || '';
    document.getElementById('m-end').value = g.end || '';
    selCatVal = g.cat || 'health';
  } else {
    ['m-title', 'm-desc'].forEach(id => document.getElementById(id).value = '');
    const now = new Date(), end = new Date(now); end.setMonth(end.getMonth() + 2);
    document.getElementById('m-start').value = dateStr(now);
    document.getElementById('m-end').value = dateStr(end);
    selCatVal = 'health';
  }
  document.querySelectorAll('#goal-modal .chip[data-cat]').forEach(c => c.classList.toggle('sel', c.dataset.cat === selCatVal));
  document.getElementById('goal-modal').classList.add('show');
  setTimeout(() => document.getElementById('m-title').focus(), 80);
}
function closeGoalModal() { document.getElementById('goal-modal').classList.remove('show'); }
function selCat(el) {
  document.querySelectorAll('#goal-modal .chip[data-cat]').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel'); selCatVal = el.dataset.cat;
}
function saveGoal() {
  const title = document.getElementById('m-title').value.trim();
  if (!title) { showToast('タイトルを入力してください'); return; }
  const data = { title, desc: document.getElementById('m-desc').value.trim(), cat: selCatVal, start: document.getElementById('m-start').value, end: document.getElementById('m-end').value };
  if (editGoalId) { Object.assign(db.goals.find(g => g.id === editGoalId), data); }
  else { db.goals.push({ id: 'g_' + Date.now(), ...data, createdAt: new Date().toISOString() }); }
  saveData(); closeGoalModal(); renderGoals(); renderQAStart();
  showToast(editGoalId ? '目標を更新しました' : '目標を追加しました');
}
function deleteGoal(id) {
  if (!confirm('この目標を削除しますか？')) return;
  db.goals = db.goals.filter(g => g.id !== id);
  saveData(); renderGoals(); renderQAStart();
  showToast('削除しました');
}

// ===== QA START =====
function renderQAStart() {
  const cont = document.getElementById('qa-start-goals');
  const empty = document.getElementById('qa-empty');
  const btn = document.getElementById('qa-start-btn');
  if (!db.goals.length) { cont.innerHTML = ''; empty.style.display = 'block'; btn.style.display = 'none'; return; }
  empty.style.display = 'none'; btn.style.display = 'flex';
  cont.innerHTML = db.goals.map(g => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:12px 15px;margin-bottom:8px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:18px;">${{ health: '🏃', study: '📚', career: '💼', other: '✨' }[g.cat] || '🎯'}</span>
      <div>
        <div style="font-size:13px;font-weight:700;">${esc(g.title)}</div>
        <div style="font-size:11px;color:var(--ink3);">${g.start} 〜 ${g.end}</div>
      </div>
    </div>`).join('');
}

// ===== QA ENGINE =====
function buildQuestions() {
  const qs = [];
  db.goals.forEach(g => {
    qa.answers[g.id] = { goalId: g.id, goalTitle: g.title, achievement: 60, good: '', bad: '', tomorrow: '' };
    qs.push({ goalId: g.id, type: 'section_start', goalTitle: g.title });
    qs.push({ goalId: g.id, type: 'slider', key: 'achievement', text: `【${g.title}】\n\n今日の達成度を教えてください。` });
    qs.push({ goalId: g.id, type: 'text', key: 'good', text: `うまくいったことや、良かったことを教えてください。\n\n（思い浮かばなければ「特になし」と入力してください）` });
    qs.push({ goalId: g.id, type: 'text', key: 'bad', text: `できなかったことや、改善したい点はありますか？` });
    qs.push({ goalId: g.id, type: 'tomorrow', key: 'tomorrow', text: `明日やることを教えてください。` });
  });
  return qs;
}

function startQA() {
  if (!db.goals.length) return;
  qa.active = true;
  qa.questions = buildQuestions();
  qa.currentIdx = 0;
  qa.answers = {};
  db.goals.forEach(g => { qa.answers[g.id] = { goalId: g.id, goalTitle: g.title, achievement: 60, good: '', bad: '', tomorrow: '' }; });
  document.getElementById('qa-start').style.display = 'none';
  document.getElementById('qa-wrap').style.display = 'flex';
  document.getElementById('qa-messages').innerHTML = '';
  addBubble('bot', `こんにちは！今日の振り返りを始めましょう。\n登録されている目標 ${db.goals.length}件 について、1つずつ質問します。`);
  setTimeout(() => stepNext(), 600);
}

function stepNext() {
  if (qa.currentIdx >= qa.questions.length) { finishQA(); return; }
  const q = qa.questions[qa.currentIdx];
  updateProgress();

  if (q.type === 'section_start') {
    addSystemBubble(`── ${q.goalTitle} ──`);
    qa.currentIdx++;
    setTimeout(() => stepNext(), 400);
    return;
  }
  if (q.type === 'slider') {
    addSliderBubble(q);
    setInputDisabled(true);
    return;
  }
  if (q.type === 'tomorrow') {
    addBubble('bot', q.text);
    setInputDisabled(false);
    // Worker URLが設定されていればAI提案を表示
    if (aiAvailable()) {
      addTomorrowCandidates(q.goalId);
    }
    document.getElementById('qa-textarea').focus();
    return;
  }
  // 通常テキスト
  addBubble('bot', q.text);
  setInputDisabled(false);
  document.getElementById('qa-textarea').focus();
}

// ===== 送信（Shift+Enter） =====
function handleKey(e) {
  if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); sendAnswer(); }
}

function sendAnswer() {
  if (!qa.active) return;
  const ta = document.getElementById('qa-textarea');
  const val = ta.value.trim();
  if (!val) return;
  const q = qa.questions[qa.currentIdx];
  if (!q || q.type === 'slider') return;

  const bubbleId = `${q.goalId}__${q.key}`;
  const existing = document.querySelector(`[data-bubble-id="${bubbleId}"]`);
  if (existing) {
    const textEl = document.getElementById(`bubble-text-${bubbleId}`);
    if (textEl) textEl.textContent = wrapLong(val);
  } else {
    addBubble('user', val, bubbleId);
  }
  ta.value = ''; autoResize(ta);
  qa.answers[q.goalId][q.key] = val;
  setInputDisabled(true);
  qa.currentIdx++;
  setTimeout(() => stepNext(), 500);
}

// ===== 明日の候補（Cloudflare Worker経由） =====
async function addTomorrowCandidates(goalId) {
  const g = db.goals.find(x => x.id === goalId);
  const ans = qa.answers[goalId];
  if (!g || !ans) return;

  const loadingId = 'tomorrow-loading-' + goalId;
  const loadWrap = document.createElement('div');
  loadWrap.className = 'bubble-wrap bot'; loadWrap.id = loadingId;
  loadWrap.innerHTML = `<div class="bubble-sender">ふりかえりBot</div>
    <div class="bubble bot"><div class="candidate-loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span style="margin-left:4px;">明日の行動を考えています...</span></div></div>`;
  document.getElementById('qa-messages').appendChild(loadWrap);
  scrollBottom();

  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goalTitle: g.title,
        goalDesc: g.desc || '',
        achievement: ans.achievement,
        good: ans.good || '',
        bad: ans.bad || '',
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    loadWrap.remove();

    let candidates = data.candidates || [];
    if (candidates.length === 0 && data.raw) {
      candidates = data.raw.split('\n').map(l => l.trim())
        .filter(l => /^[1-3][.\．]/.test(l))
        .map(l => l.replace(/^[1-3][.\．]\s*/, '').trim())
        .filter(Boolean).slice(0, 3);
    }
    if (!candidates.length) return;

    const candWrap = document.createElement('div');
    candWrap.className = 'bubble-wrap bot';
    const chipHtml = candidates.map((c, i) => `
      <button class="candidate-chip" id="cand-${goalId}-${i}"
        onclick="selectCandidate('${goalId}',${i},'${c.replace(/'/g, "\\'")}')">
        ${i + 1}. ${esc(c)}
      </button>`).join('');
    candWrap.innerHTML = `<div class="bubble-sender">ふりかえりBot</div>
      <div class="bubble bot">
        <div style="font-size:12px;color:var(--ink3);margin-bottom:6px;">💡 候補から選ぶか、直接入力してください</div>
        <div class="tomorrow-candidates">${chipHtml}</div>
      </div>`;
    document.getElementById('qa-messages').appendChild(candWrap);
    scrollBottom();
  } catch (e) {
    loadWrap.remove();
    const errWrap = document.createElement('div');
    errWrap.className = 'bubble-wrap bot';
    errWrap.innerHTML = `<div class="bubble-sender">ふりかえりBot</div>
      <div class="bubble bot" style="font-size:12px;color:var(--ink3);">
        💡 AI提案を取得できませんでした。直接入力してください。
      </div>`;
    document.getElementById('qa-messages').appendChild(errWrap);
    scrollBottom();
  }
}

function selectCandidate(goalId, idx, text) {
  document.querySelectorAll(`[id^="cand-${goalId}-"]`).forEach(el => el.classList.remove('used'));
  document.getElementById(`cand-${goalId}-${idx}`).classList.add('used');
  const ta = document.getElementById('qa-textarea');
  ta.value = text; autoResize(ta); ta.focus();
}

// ===== スライダーバブル =====
function addSliderBubble(q) {
  qa.sliderVal = 60;
  const id = 'slider_' + Date.now();
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap bot';
  wrap.innerHTML = `
    <div class="bubble-sender">ふりかえりBot</div>
    <div class="bubble bot slider-bubble" style="min-width:260px;max-width:90%;">
      <div style="font-size:13px;line-height:1.7;white-space:pre-wrap;margin-bottom:12px;">${esc(q.text)}</div>
      <div class="slider-val-big" id="${id}-val">60%</div>
      <input class="qa-slider" type="range" min="0" max="100" value="60" id="${id}-range"
        oninput="qa.sliderVal=this.value;document.getElementById('${id}-val').textContent=this.value+'%'">
      <div class="slider-labels"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>
      <button class="btn btn-primary btn-sm" style="margin-top:14px;width:100%;justify-content:center;"
        onclick="confirmSlider('${q.goalId}','${id}')">この達成度で次へ →</button>
    </div>`;
  document.getElementById('qa-messages').appendChild(wrap);
  scrollBottom();
}

function confirmSlider(goalId, id) {
  const val = parseInt(document.getElementById(id + '-range').value);
  qa.answers[goalId].achievement = val;
  const btn = document.querySelector(`#${id}-range`).closest('.slider-bubble').querySelector('button');
  btn.disabled = true; btn.textContent = '✓ 確定';
  document.querySelector(`#${id}-range`).disabled = true;
  const bubbleId = `${goalId}__achievement`;
  addBubble('user', `達成度：${val}%`, bubbleId);
  qa.currentIdx++;
  setTimeout(() => stepNext(), 500);
}

// ===== FINISH（テンプレートのみ） =====
async function finishQA() {
  setInputDisabled(true);
  document.getElementById('qa-hint').textContent = '';

  addBubble('bot', `お疲れ様でした！全ての目標について振り返りが完了しました 🎉\n\nまとめ文を生成しています...`);

  const answersArr = db.goals.map(g => qa.answers[g.id]).filter(Boolean);
  const today = dateStr();
  const summaryText = generateSummaryTemplate(answersArr, today);

  // セッション保存
  db.sessions.push({ id: 's_' + Date.now(), date: today, answers: answersArr, summary: summaryText, createdAt: new Date().toISOString() });
  saveData(); renderGoals();

  // プログレス100%
  document.getElementById('qa-bar').style.width = '100%';
  document.getElementById('qa-prog-num').textContent = '100%';
  document.getElementById('qa-prog-label').textContent = `目標 ${db.goals.length}/${db.goals.length} 振り返り完了`;

  // 結果表示
  const resultWrap = document.createElement('div');
  resultWrap.style.cssText = 'padding:0 0 20px;';
  resultWrap.innerHTML = `
    <div class="result-card">
      <div class="result-title">📝 振り返りまとめ</div>
      <div class="result-text" id="final-result">${esc(summaryText)}</div>
      <div class="result-actions">
        <button class="btn btn-primary btn-sm" onclick="copyFinalResult()">📋 Slack用にコピー</button>
        <button class="btn btn-secondary btn-sm" onclick="restartQA()">🔄 もう一度振り返る</button>
      </div>
    </div>`;
  document.getElementById('qa-messages').appendChild(resultWrap);
  scrollBottom();
  qa.active = false;
}

function generateSummaryTemplate(answers, today) {
  let txt = `📅 ${today} の振り返り\n\n`;
  answers.forEach(a => {
    const emoji = a.achievement >= 80 ? '🔥' : a.achievement >= 50 ? '💪' : '🤔';
    txt += `${emoji} ${a.goalTitle}（達成度 ${a.achievement}%）\n`;
    if (a.good) txt += `✅ ${a.good}\n`;
    if (a.bad) txt += `🔧 ${a.bad}\n`;
    if (a.tomorrow) txt += `📅 明日：${a.tomorrow}\n`;
    txt += '\n';
  });
  return txt.trim();
}

function copyFinalResult() {
  const text = document.getElementById('final-result')?.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    showToast('コピーしました！Slackに貼り付けてください');
  }).catch(() => {
    const ta = document.createElement('textarea'); ta.value = text;
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    showToast('コピーしました');
  });
}

function restartQA() {
  document.getElementById('qa-wrap').style.display = 'none';
  document.getElementById('qa-start').style.display = 'block';
  renderQAStart();
}

// ===== BUBBLE HELPERS =====
function addBubble(role, text, bubbleId) {
  const wrap = document.createElement('div');
  wrap.className = `bubble-wrap ${role}`;
  if (bubbleId) wrap.dataset.bubbleId = bubbleId;
  if (role === 'bot') {
    wrap.innerHTML = `<div class="bubble-sender">ふりかえりBot</div><div class="bubble bot">${esc(text)}</div>`;
  } else {
    wrap.style.position = 'relative';
    const senderDiv = document.createElement('div');
    senderDiv.className = 'bubble-sender';
    senderDiv.textContent = 'あなた';

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-answer-btn';
    editBtn.title = '修正する';
    editBtn.textContent = '✏️';
    editBtn.onclick = () => openEditModal(bubbleId || '');

    const bubble = document.createElement('div');
    bubble.className = 'bubble user';
    bubble.id = `bubble-text-${bubbleId || ''}`;
    bubble.textContent = wrapLong(text);

    const innerWrap = document.createElement('div');
    innerWrap.style.position = 'relative';
    innerWrap.appendChild(editBtn);
    innerWrap.appendChild(bubble);

    wrap.appendChild(senderDiv);
    wrap.appendChild(innerWrap);
  }
  document.getElementById('qa-messages').appendChild(wrap);
  scrollBottom();
  return wrap;
}

function addSystemBubble(text) {
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap';
  wrap.innerHTML = `<div class="bubble system">${esc(text)}</div>`;
  document.getElementById('qa-messages').appendChild(wrap);
  scrollBottom();
}

function addTypingBubble() {
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap bot'; wrap.id = 'typing-bubble';
  wrap.innerHTML = `<div class="bubble-sender">ふりかえりBot</div><div class="bubble bot typing-bubble"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
  document.getElementById('qa-messages').appendChild(wrap);
  scrollBottom();
}
function removeTypingBubble() { const el = document.getElementById('typing-bubble'); if (el) el.remove(); }

function scrollBottom() { const el = document.getElementById('qa-messages'); if (el) setTimeout(() => el.scrollTop = el.scrollHeight, 50); }

function setInputDisabled(disabled) {
  document.getElementById('qa-textarea').disabled = disabled;
  document.getElementById('qa-send').disabled = disabled;
  document.getElementById('qa-textarea').placeholder = disabled ? 'しばらくお待ちください...' : '回答を入力... (Shift+Enter で送信 / Enter で改行)';
}

function updateProgress() {
  const total = qa.questions.filter(q => q.type !== 'section_start').length;
  const done = qa.questions.slice(0, qa.currentIdx).filter(q => q.type !== 'section_start').length;
  const pct = total ? Math.round(done / total * 100) : 0;
  document.getElementById('qa-bar').style.width = pct + '%';
  document.getElementById('qa-prog-num').textContent = pct + '%';
  const q = qa.questions[qa.currentIdx];
  if (q) {
    const goalIdx = db.goals.findIndex(g => g.id === q.goalId) + 1;
    document.getElementById('qa-prog-label').textContent = `目標 ${goalIdx}/${db.goals.length} を振り返り中`;
  }
}

function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }

// ===== ANSWER EDIT MODAL =====
function openEditModal(bubbleId) {
  if (!bubbleId) return;
  const [goalId, key] = bubbleId.split('__');
  const g = db.goals.find(x => x.id === goalId);
  const ans = qa.answers[goalId];
  if (!g || !ans) return;
  editCtx = { goalId, key, type: key === 'achievement' ? 'slider' : 'text' };
  const lbl = { achievement: '達成度', good: 'うまくいったこと', bad: 'できなかったこと・改善点', tomorrow: '明日やること' };
  document.getElementById('edit-modal-title').textContent = `「${g.title}」の回答を修正 — ${lbl[key] || key}`;
  const body = document.getElementById('edit-modal-body');
  if (key === 'achievement') {
    const cur = ans.achievement ?? 60;
    body.innerHTML = `<div style="font-size:12px;color:var(--ink3);margin-bottom:8px;">スライダーで達成度を変更してください</div>
      <div class="edit-slider-val" id="edit-slider-val">${cur}%</div>
      <input class="edit-slider" type="range" min="0" max="100" value="${cur}" id="edit-slider-input"
        oninput="document.getElementById('edit-slider-val').textContent=this.value+'%'">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--ink3);margin-top:4px;font-family:'DM Mono',monospace;"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>`;
  } else {
    const cur = ans[key] || '';
    body.innerHTML = `<div style="font-size:12px;color:var(--ink3);margin-bottom:6px;">内容を編集してください</div>
      <textarea id="edit-text-input" rows="4" style="width:100%;border:1.5px solid var(--border2);border-radius:var(--r-sm);padding:9px 12px;font-size:13px;font-family:'Noto Sans JP',sans-serif;color:var(--ink);background:var(--surface);outline:none;resize:vertical;line-height:1.7;">${esc(cur)}</textarea>`;
    setTimeout(() => document.getElementById('edit-text-input')?.focus(), 80);
  }
  document.getElementById('edit-answer-modal').classList.add('show');
}
function closeEditModal() { document.getElementById('edit-answer-modal').classList.remove('show'); editCtx = null; }
function applyEdit() {
  if (!editCtx) return;
  const { goalId, key, type } = editCtx;
  let newVal;
  if (type === 'slider') {
    newVal = parseInt(document.getElementById('edit-slider-input').value);
    qa.answers[goalId].achievement = newVal;
    const el = document.getElementById(`bubble-text-${goalId}__achievement`);
    if (el) el.textContent = wrapLong(`達成度：${newVal}%`);
  } else {
    newVal = document.getElementById('edit-text-input').value.trim();
    if (!newVal) { showToast('内容を入力してください'); return; }
    qa.answers[goalId][key] = newVal;
    const el = document.getElementById(`bubble-text-${goalId}__${key}`);
    if (el) el.textContent = wrapLong(newVal);
  }
  closeEditModal();
  showToast('回答を修正しました');
}

// ===== HISTORY =====
function renderHistory() {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const filter = document.getElementById('hist-filter');
  const sessions = [...db.sessions].reverse();
  const dates = [...new Set(sessions.map(s => s.date))];
  filter.innerHTML = '<option value="">すべての日付</option>' + dates.map(d => `<option>${d}</option>`).join('');
  const filtered = filter.value ? sessions.filter(s => s.date === filter.value) : sessions;
  if (!filtered.length) { list.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  list.innerHTML = filtered.map(s => {
    const achList = (s.answers || []).map(a => `<span class="hist-ach">${esc(a.goalTitle || '')} ${a.achievement}%</span>`).join(' ');
    return `<div class="hist-item">
      <div class="hist-date">${s.date}</div>
      <div style="margin-bottom:6px;">${achList}</div>
      <div class="hist-summary">${esc(s.summary || '')}</div>
    </div>`;
  }).join('');
}

function clearHistory() {
  if (!confirm('全ての振り返り記録を削除しますか？')) return;
  db.sessions = []; saveData(); renderHistory(); renderGoals();
  showToast('履歴を削除しました');
}

// ===== DATA =====
function exportData() {
  const blob = new Blob([JSON.stringify({ db, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `furikaeri_${dateStr().replace(/\//g, '-')}.json`; a.click();
  showToast('エクスポートしました');
}
function resetAll() {
  if (!confirm('全データを削除します。この操作は取り消せません。')) return;
  localStorage.removeItem('furi_db');
  location.reload();
}

// ===== TOAST =====
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

init();
