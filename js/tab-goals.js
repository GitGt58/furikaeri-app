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
  } else {
    ['m-title', 'm-desc'].forEach(id => document.getElementById(id).value = '');
    const now = new Date(), end = new Date(now);
    end.setMonth(end.getMonth() + 2);
    document.getElementById('m-start').value = dateStr(now);
    document.getElementById('m-end').value = dateStr(end);
    selCatVal = 'health';
  }

  document.querySelectorAll('#goal-modal .chip[data-cat]')
    .forEach(c => c.classList.toggle('sel', c.dataset.cat === selCatVal));
  document.getElementById('goal-modal').classList.add('show');
  setTimeout(() => document.getElementById('m-title').focus(), 80);
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

  const data = {
    title,
    desc:  document.getElementById('m-desc').value.trim(),
    cat:   selCatVal,
    start: document.getElementById('m-start').value,
    end:   document.getElementById('m-end').value,
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
