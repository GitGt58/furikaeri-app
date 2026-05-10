// ===== tab-goals.js =====
// 役割: 目標タブの全機能
//   - 目標一覧の表示（renderGoals）
//   - 目標の追加・編集・削除（モーダル含む）

const catLabel = { health: '🏃 健康・運動', study: '📚 学習・スキル', career: '💼 仕事・キャリア', other: '✨ その他' };
const catCls   = { health: 'cat-health', study: 'cat-study', career: 'cat-career', other: 'cat-other' };

// ========== 一覧表示 ==========
function renderGoals() {
  const list = document.getElementById('goals-list');
  const empty = document.getElementById('goals-empty');

  if (!db.goals.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = db.goals.map(g => {
    const recs = db.sessions.flatMap(s => s.answers || []).filter(a => a.goalId === g.id);
    // avg: 0-10 スケール（小数点1桁）
    const avg = recs.length ? Math.round(recs.reduce((s, r) => s + (r.achievement || 0), 0) / recs.length * 10) / 10 : 0;
    // barWidth: 0-100% スケール（バー幅用）
    const barWidth = avg * 10;
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
      <div class="goal-prog-wrap"><div class="goal-prog" style="width:${barWidth}%"></div></div>
      <div style="font-size:11px;color:var(--ink3);margin-top:4px;font-family:'DM Mono',monospace;">平均達成度 ${avg}</div>
      ${g.desc ? `<div style="font-size:12px;color:var(--ink2);margin-top:8px;">${esc(g.desc)}</div>` : ''}
    </div>`;
  }).join('');
}

// ========== モーダル ==========
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
    // カスタム項目を読み込み
    currentQuestions = g.questions ? JSON.parse(JSON.stringify(g.questions)) : getDefaultQuestions();
  } else {
    ['m-title', 'm-desc'].forEach(id => document.getElementById(id).value = '');
    const now = new Date(), end = new Date(now);
    end.setMonth(end.getMonth() + 2);
    document.getElementById('m-start').value = dateStr(now);
    document.getElementById('m-end').value = dateStr(end);
    selCatVal = 'health';
    // 新規目標は標準テンプレートをデフォルトに
    currentQuestions = getDefaultQuestions();
  }

  document.querySelectorAll('#goal-modal .chip[data-cat]')
    .forEach(c => c.classList.toggle('sel', c.dataset.cat === selCatVal));
  // テンプレートチップの選択状態をクリア
  document.querySelectorAll('#template-chips .chip').forEach(c => c.classList.remove('sel'));
  renderCustomQuestions();
  document.getElementById('goal-modal').classList.add('show');
  setTimeout(() => document.getElementById('m-title').focus(), 80);
}

// 標準テンプレートをデフォルトとして取得
function getDefaultQuestions() {
  return QUESTION_TEMPLATES.standard.items.map((item, idx) => ({
    id: ['good', 'bad', 'tomorrow'][idx],
    label: item.label,
    text:  item.text,
  }));
}

// テンプレート適用
function applyTemplate(el) {
  const tmplKey = el.dataset.tmpl;
  const tmpl = QUESTION_TEMPLATES[tmplKey];
  if (!tmpl) return;
  // 選択状態を切り替え
  document.querySelectorAll('#template-chips .chip').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
  // 項目を置き換え（IDは新しく振り直し、standardのみ旧キーを維持）
  if (tmplKey === 'standard') {
    currentQuestions = tmpl.items.map((item, idx) => ({
      id: ['good', 'bad', 'tomorrow'][idx],
      label: item.label,
      text:  item.text,
    }));
  } else {
    currentQuestions = tmpl.items.map((item, idx) => ({
      id: 'q_' + Date.now() + '_' + idx,
      label: item.label,
      text:  item.text,
    }));
  }
  renderCustomQuestions();
  showToast(`「${tmpl.name}」を適用しました`);
}

// カスタム項目リストの描画
function renderCustomQuestions() {
  const list = document.getElementById('custom-questions-list');
  const addBtn = document.getElementById('add-question-btn');
  list.innerHTML = currentQuestions.map((q, idx) => `
    <div class="custom-q-item" data-idx="${idx}">
      <div class="custom-q-head">
        <span class="custom-q-num">${idx + 1}</span>
        <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--warn);"
          onclick="removeCustomQuestion(${idx})" title="削除">🗑</button>
      </div>
      <div class="custom-q-body">
        <div class="custom-q-row">
          <label class="custom-q-label-text">項目名</label>
          <input type="text" class="custom-q-input"
            value="${esc(q.label)}"
            placeholder="例：Keep"
            oninput="updateCustomQuestion(${idx}, 'label', this.value)">
        </div>
        <div class="custom-q-row">
          <label class="custom-q-label-text">質問文</label>
          <input type="text" class="custom-q-input"
            value="${esc(q.text)}"
            placeholder="例：続けたいことは？"
            oninput="updateCustomQuestion(${idx}, 'text', this.value)">
        </div>
      </div>
    </div>
  `).join('');

  // 追加ボタンの有効/無効
  if (currentQuestions.length >= MAX_CUSTOM_QUESTIONS) {
    addBtn.disabled = true;
    addBtn.style.opacity = '0.4';
    addBtn.textContent = `項目は最大${MAX_CUSTOM_QUESTIONS}個まで`;
  } else {
    addBtn.disabled = false;
    addBtn.style.opacity = '1';
    addBtn.textContent = '＋ 項目を追加';
  }
}

// 項目を追加
function addCustomQuestion() {
  if (currentQuestions.length >= MAX_CUSTOM_QUESTIONS) {
    showToast(`項目は最大${MAX_CUSTOM_QUESTIONS}個までです`);
    return;
  }
  currentQuestions.push({
    id: 'q_' + Date.now(),
    label: '',
    text:  '',
  });
  renderCustomQuestions();
  // 追加した項目の項目名にフォーカス
  setTimeout(() => {
    const items = document.querySelectorAll('.custom-q-item');
    const last = items[items.length - 1];
    last?.querySelector('.custom-q-input')?.focus();
  }, 50);
}

// 項目を削除
function removeCustomQuestion(idx) {
  if (currentQuestions.length <= 1) {
    showToast('項目は最低1個必要です');
    return;
  }
  currentQuestions.splice(idx, 1);
  renderCustomQuestions();
}

// 項目の値を更新
function updateCustomQuestion(idx, field, value) {
  if (currentQuestions[idx]) {
    currentQuestions[idx][field] = value;
  }
}

function closeGoalModal() {
  document.getElementById('goal-modal').classList.remove('show');
}

function selCat(el) {
  document.querySelectorAll('#goal-modal .chip[data-cat]').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
  selCatVal = el.dataset.cat;
}

// ========== 保存・削除 ==========
function saveGoal() {
  const title = document.getElementById('m-title').value.trim();
  if (!title) { showToast('タイトルを入力してください'); return; }

  // カスタム項目のバリデーション
  const validQuestions = currentQuestions
    .map(q => ({
      id:    q.id,
      label: q.label.trim(),
      text:  q.text.trim(),
    }))
    .filter(q => q.label && q.text);  // 両方入力されている項目のみ

  if (validQuestions.length === 0) {
    showToast('振り返り項目を1つ以上設定してください');
    return;
  }

  const data = {
    title,
    desc:  document.getElementById('m-desc').value.trim(),
    cat:   selCatVal,
    start: document.getElementById('m-start').value,
    end:   document.getElementById('m-end').value,
    questions: validQuestions,
  };

  if (editGoalId) {
    Object.assign(db.goals.find(g => g.id === editGoalId), data);
  } else {
    db.goals.push({ id: 'g_' + Date.now(), ...data, createdAt: new Date().toISOString() });
  }

  saveData();
  closeGoalModal();
  renderGoals();
  renderQAStart();
  showToast(editGoalId ? '目標を更新しました' : '目標を追加しました');
}

function deleteGoal(id) {
  if (!confirm('この目標を削除しますか？')) return;
  db.goals = db.goals.filter(g => g.id !== id);
  saveData();
  renderGoals();
  renderQAStart();
  showToast('削除しました');
}
