// ===== ui-common.js =====
// 役割: 全タブで使う共通UI部品
//   - ページ切替（showPage）
//   - バブル表示（addBubble, addSystemBubble, scrollBottom）
//   - 入力欄制御（setInputDisabled）
//   - トースト通知（showToast）
//   - 回答編集モーダル

// ========== ページ切替 ==========
function showPage(tabEl) {
  const name = tabEl.dataset.page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  tabEl.classList.add('active');

  if (name === 'furikaeri') {
    // 振り返り進行中はqa-wrapをそのまま表示、終了済みならスタート画面に戻す
    if (!qa.active) {
      document.getElementById('qa-wrap').style.display = 'none';
      document.getElementById('qa-start').style.display = 'block';
      renderQAStart();
    }
  }
  if (name === 'history') renderHistory();
}

// ========== バブル ==========
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
    innerWrap.style.display = 'inline-block';
    innerWrap.style.maxWidth = '75%';
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

function scrollBottom() {
  const el = document.getElementById('qa-messages');
  if (el) setTimeout(() => el.scrollTop = el.scrollHeight, 50);
}

// ========== 入力欄制御 ==========
function setInputDisabled(disabled) {
  document.getElementById('qa-textarea').disabled = disabled;
  document.getElementById('qa-send').disabled = disabled;
  document.getElementById('qa-textarea').placeholder = disabled
    ? 'しばらくお待ちください...'
    : '回答を入力... (Shift+Enter で送信 / Enter で改行)';
}

// ========== 回答編集モーダル ==========
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

function closeEditModal() {
  document.getElementById('edit-answer-modal').classList.remove('show');
  editCtx = null;
}

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

// ========== トースト ==========
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}