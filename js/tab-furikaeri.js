// ===== tab-furikaeri.js =====
// 役割: 振り返りタブの全機能
//   - 開始画面の表示（renderQAStart）
//   - 1問1答エンジン（startQA, stepNext, sendAnswer）
//   - スライダーバブル
//   - AI明日提案（addTomorrowCandidates）
//   - まとめ生成・コピー（finishQA, generateSummaryTemplate）

// ========== 開始画面 ==========
function renderQAStart() {
  const cont = document.getElementById('qa-start-goals');
  const empty = document.getElementById('qa-empty');
  const btn = document.getElementById('qa-start-btn');

  if (!db.goals.length) {
    cont.innerHTML = '';
    empty.style.display = 'block';
    btn.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  btn.style.display = 'flex';

  cont.innerHTML = db.goals.map(g => `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:12px 15px;margin-bottom:8px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:18px;">${{ health: '🏃', study: '📚', career: '💼', other: '✨' }[g.cat] || '🎯'}</span>
      <div>
        <div style="font-size:13px;font-weight:700;">${esc(g.title)}</div>
        <div style="font-size:11px;color:var(--ink3);">${g.start} 〜 ${g.end}</div>
      </div>
    </div>`).join('');
}

// ========== QAエンジン ==========
function buildQuestions() {
  const qs = [];
  db.goals.forEach(g => {
    const initialAch = getLastAchievement(g.id);
    qa.answers[g.id] = { goalId: g.id, goalTitle: g.title, achievement: initialAch, good: '', bad: '', tomorrow: '' };
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
  db.goals.forEach(g => {
    qa.answers[g.id] = { goalId: g.id, goalTitle: g.title, achievement: getLastAchievement(g.id), good: '', bad: '', tomorrow: '' };
  });

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

// ========== 送信 ==========
function handleKey(e) {
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault();
    sendAnswer();
  }
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

  ta.value = '';
  autoResize(ta);
  qa.answers[q.goalId][q.key] = val;
  setInputDisabled(true);
  qa.currentIdx++;
  setTimeout(() => stepNext(), 500);
}

// ========== スライダーバブル ==========
// 該当目標の前回の達成度を取得（記録がなければ60を返す）
function getLastAchievement(goalId) {
  // sessionsを新しい順に走査して、該当goalIdの最初の達成度を返す
  for (let i = db.sessions.length - 1; i >= 0; i--) {
    const session = db.sessions[i];
    const ans = (session.answers || []).find(a => a.goalId === goalId);
    if (ans && typeof ans.achievement === 'number') {
      return ans.achievement;
    }
  }
  return 60; // デフォルト値
}

function addSliderBubble(q) {
  // 前回の達成度を初期値として使用
  const initialVal = getLastAchievement(q.goalId);
  qa.sliderVal = initialVal;
  qa.answers[q.goalId].achievement = initialVal;

  // 前回記録がある場合は表示用ラベルを準備
  const hasPrevious = db.sessions.some(s => (s.answers || []).some(a => a.goalId === q.goalId));
  const prevLabel = hasPrevious
    ? `<div style="font-size:11px;color:var(--ink3);text-align:center;margin-bottom:6px;">前回：${initialVal}%</div>`
    : '';

  const id = 'slider_' + Date.now();
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap bot';
  wrap.innerHTML = `
    <div class="bubble-sender">ふりかえりBot</div>
    <div class="bubble bot slider-bubble" style="min-width:260px;max-width:90%;">
      <div style="font-size:13px;line-height:1.7;white-space:pre-wrap;margin-bottom:12px;">${esc(q.text)}</div>
      ${prevLabel}
      <div class="slider-val-big" id="${id}-val">${initialVal}%</div>
      <input class="qa-slider" type="range" min="0" max="100" value="${initialVal}" id="${id}-range"
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
  btn.disabled = true;
  btn.textContent = '✓ 確定';
  document.querySelector(`#${id}-range`).disabled = true;

  const bubbleId = `${goalId}__achievement`;
  addBubble('user', `達成度：${val}%`, bubbleId);
  qa.currentIdx++;
  setTimeout(() => stepNext(), 500);
}

// ========== AI明日提案（Cloudflare Worker経由） ==========
async function addTomorrowCandidates(goalId) {
  const g = db.goals.find(x => x.id === goalId);
  const ans = qa.answers[goalId];
  if (!g || !ans) return;

  const loadWrap = document.createElement('div');
  loadWrap.className = 'bubble-wrap bot';
  loadWrap.innerHTML = `<div class="bubble-sender">ふりかえりBot</div>
    <div class="bubble bot"><div class="candidate-loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span style="margin-left:4px;">明日の行動を考えています...</span></div></div>`;
  document.getElementById('qa-messages').appendChild(loadWrap);
  scrollBottom();

  try {
    const res = await fetch(CONFIG.WORKER_URL, {
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
  ta.value = text;
  autoResize(ta);
  ta.focus();
}

// ========== まとめ生成 ==========
async function finishQA() {
  setInputDisabled(true);
  document.getElementById('qa-hint').textContent = '';
  addBubble('bot', `お疲れ様でした！全ての目標について振り返りが完了しました 🎉\n\nまとめ文を生成しています...`);

  const answersArr = db.goals.map(g => qa.answers[g.id]).filter(Boolean);
  const today = dateStr();
  const summaryText = generateSummaryTemplate(answersArr, today);

  // セッション保存
  db.sessions.push({
    id: 's_' + Date.now(),
    date: today,
    answers: answersArr,
    summary: summaryText,
    createdAt: new Date().toISOString(),
  });
  saveData();
  renderGoals();

  document.getElementById('qa-bar').style.width = '100%';
  document.getElementById('qa-prog-num').textContent = '100%';
  document.getElementById('qa-prog-label').textContent = `目標 ${db.goals.length}/${db.goals.length} 振り返り完了`;

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

// シンプルな箇条書き形式（Slack向け）
function generateSummaryTemplate(answers, today) {
  let txt = `📅 ${today} の振り返り\n`;
  answers.forEach(a => {
    txt += `\n▍${a.goalTitle}　達成度：${a.achievement}%\n`;
    if (a.good) txt += `　○ ${a.good}\n`;
    if (a.bad) txt += `　× ${a.bad}\n`;
    if (a.tomorrow) txt += `　→ 明日：${a.tomorrow}\n`;
  });
  return txt.trim();
}

function copyFinalResult() {
  const text = document.getElementById('final-result')?.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    showToast('コピーしました！Slackに貼り付けてください');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('コピーしました');
  });
}

function restartQA() {
  document.getElementById('qa-wrap').style.display = 'none';
  document.getElementById('qa-start').style.display = 'block';
  renderQAStart();
}