// ===== tab-history.js =====
// 役割: 履歴タブの全機能
//   - 履歴一覧の表示（renderHistory）
//   - 選択削除（チェックボックス）
//   - エクスポート・インポート
//   - 7日ごとのバックアップリマインダー

// ========== 履歴一覧 ==========
function renderHistory() {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const filter = document.getElementById('hist-filter');
  const selectBar = document.getElementById('hist-select-bar');

  const sessions = [...db.sessions].reverse();
  const dates = [...new Set(sessions.map(s => s.date))];
  filter.innerHTML = '<option value="">すべての日付</option>' + dates.map(d => `<option>${d}</option>`).join('');
  const filtered = filter.value ? sessions.filter(s => s.date === filter.value) : sessions;

  if (!filtered.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    selectBar.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  selectBar.style.display = 'flex';

  list.innerHTML = filtered.map(s => {
    const achList = (s.answers || [])
      .map(a => `<span class="hist-ach">${esc(a.goalTitle || '')} ${a.achievement}</span>`)
      .join(' ');
    return `<div class="hist-item" data-id="${s.id}" onclick="toggleHistItem(this)" style="cursor:pointer;">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <input type="checkbox" class="hist-checkbox" data-id="${s.id}"
          style="width:16px;height:16px;flex-shrink:0;margin-top:2px;cursor:pointer;"
          onclick="event.stopPropagation();onHistCheckChange()">
        <div style="flex:1;">
          <div class="hist-date">${s.date}</div>
          <div style="margin-bottom:6px;">${achList}</div>
          <div class="hist-summary">${esc(s.summary || '')}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('hist-check-all').checked = false;
  updateSelectBar();
}

// ========== 選択操作 ==========
function toggleHistItem(itemEl) {
  const cb = itemEl.querySelector('.hist-checkbox');
  cb.checked = !cb.checked;
  onHistCheckChange();
}

function onHistCheckChange() {
  const all = document.querySelectorAll('.hist-checkbox');
  const checked = document.querySelectorAll('.hist-checkbox:checked');
  const allCb = document.getElementById('hist-check-all');
  allCb.checked = all.length > 0 && checked.length === all.length;
  allCb.indeterminate = checked.length > 0 && checked.length < all.length;
  all.forEach(cb => {
    cb.closest('.hist-item').style.background = cb.checked ? 'var(--accent-lt)' : 'var(--card)';
    cb.closest('.hist-item').style.borderColor = cb.checked ? 'var(--accent-mid)' : 'var(--border)';
  });
  updateSelectBar();
}

function toggleSelectAll(masterCb) {
  document.querySelectorAll('.hist-checkbox').forEach(cb => {
    cb.checked = masterCb.checked;
    cb.closest('.hist-item').style.background = masterCb.checked ? 'var(--accent-lt)' : 'var(--card)';
    cb.closest('.hist-item').style.borderColor = masterCb.checked ? 'var(--accent-mid)' : 'var(--border)';
  });
  updateSelectBar();
}

function updateSelectBar() {
  const checked = document.querySelectorAll('.hist-checkbox:checked');
  const count = checked.length;
  const deleteBtn = document.getElementById('hist-delete-btn');
  document.getElementById('hist-select-count').textContent = count > 0 ? `${count}件選択中` : '0件選択中';
  deleteBtn.disabled = count === 0;
  deleteBtn.style.opacity = count > 0 ? '1' : '0.4';
}

function deleteSelected() {
  const checked = document.querySelectorAll('.hist-checkbox:checked');
  if (!checked.length) return;
  if (!confirm(`選択した ${checked.length}件 の振り返り記録を削除しますか？`)) return;
  const ids = new Set([...checked].map(cb => cb.dataset.id));
  db.sessions = db.sessions.filter(s => !ids.has(s.id));
  saveData();
  renderHistory();
  renderGoals();
  showToast(`${ids.size}件 削除しました`);
}

// ========== エクスポート ==========
function exportData() {
  const blob = new Blob([JSON.stringify({ db, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `furikaeri_${dateStr().replace(/\//g, '-')}.json`;
  a.click();
  showToast('エクスポートしました');
}

// ========== インポート ==========
function triggerImport() {
  document.getElementById('import-file-input').value = '';
  document.getElementById('import-file-input').click();
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.db || !Array.isArray(parsed.db.goals) || !Array.isArray(parsed.db.sessions)) {
        showToast('ファイルの形式が正しくありません');
        return;
      }
      showImportModal(parsed.db);
    } catch (err) {
      showToast('JSONファイルの読み込みに失敗しました');
    }
  };
  reader.readAsText(file);
}

function showImportModal(importedDb) {
  const existing = document.getElementById('import-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'import-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:var(--card);border-radius:var(--r);padding:24px;max-width:380px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.18);">
      <div style="font-size:22px;margin-bottom:10px;">📥</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:10px;">インポート確認</div>
      <div style="font-size:13px;color:var(--ink2);line-height:1.8;margin-bottom:6px;">読み込んだファイルの内容：</div>
      <div style="background:var(--surface);border-radius:var(--r-sm);padding:10px 14px;margin-bottom:16px;font-size:13px;line-height:1.9;">
        🎯 目標：<strong>${importedDb.goals.length}件</strong><br>
        📋 振り返り記録：<strong>${importedDb.sessions.length}件</strong>
      </div>
      <div style="font-size:13px;color:var(--ink2);line-height:1.8;margin-bottom:18px;">インポート方法を選んでください：</div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
        <button class="btn btn-primary" style="justify-content:flex-start;gap:10px;" onclick="executeImport('merge')">
          <span>🔀</span>
          <div style="text-align:left;">
            <div style="font-weight:700;">マージ（追加）</div>
            <div style="font-size:11px;font-weight:400;opacity:.85;">現在のデータを残しつつ、新しいデータを追加</div>
          </div>
        </button>
        <button class="btn btn-danger" style="justify-content:flex-start;gap:10px;" onclick="executeImport('replace')">
          <span>♻️</span>
          <div style="text-align:left;">
            <div style="font-weight:700;">置き換え</div>
            <div style="font-size:11px;font-weight:400;opacity:.85;">現在のデータを全て削除してインポートで上書き</div>
          </div>
        </button>
      </div>
      <button class="btn btn-ghost btn-full" onclick="closeImportModal()">キャンセル</button>
    </div>`;
  overlay._importedDb = importedDb;
  document.body.appendChild(overlay);
}

function executeImport(mode) {
  const overlay = document.getElementById('import-modal-overlay');
  if (!overlay) return;
  const importedDb = overlay._importedDb;

  if (mode === 'replace') {
    if (!confirm('現在の全データを削除してインポートします。この操作は取り消せません。続けますか？')) return;
    db.goals    = importedDb.goals;
    db.sessions = importedDb.sessions;
  } else {
    const existingGoalIds    = new Set(db.goals.map(g => g.id));
    const existingSessionIds = new Set(db.sessions.map(s => s.id));
    const newGoals    = importedDb.goals.filter(g => !existingGoalIds.has(g.id));
    const newSessions = importedDb.sessions.filter(s => !existingSessionIds.has(s.id));
    db.goals    = [...db.goals,    ...newGoals];
    db.sessions = [...db.sessions, ...newSessions];
    closeImportModal();
    saveData();
    renderGoals();
    renderQAStart();
    renderHistory();
    showToast(`目標 ${newGoals.length}件・記録 ${newSessions.length}件 を追加しました`);
    return;
  }

  closeImportModal();
  saveData();
  renderGoals();
  renderQAStart();
  renderHistory();
  showToast('インポートが完了しました');
}

function closeImportModal() {
  const el = document.getElementById('import-modal-overlay');
  if (el) el.remove();
}

// ========== バックアップリマインダー（7日ごと） ==========
function checkBackupReminder() {
  const KEY = 'furi_last_backup_reminder';
  const last = localStorage.getItem(KEY);
  const now = Date.now();
  const intervalDays = CONFIG.backupIntervalDays || 7;
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

  if ((!last || now - parseInt(last) >= intervalMs) && db.sessions.length > 0) {
    setTimeout(() => {
      showBackupReminder();
      localStorage.setItem(KEY, String(now));
    }, 1000);
  }
}

function showBackupReminder() {
  const overlay = document.createElement('div');
  overlay.id = 'backup-reminder-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:var(--card);border-radius:var(--r);padding:24px;max-width:360px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.18);">
      <div style="font-size:22px;margin-bottom:10px;">💾</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:10px;">定期バックアップのお知らせ</div>
      <div style="font-size:13px;color:var(--ink2);line-height:1.8;margin-bottom:18px;">
        過去の記録はブラウザの <code style="background:var(--surface);padding:1px 5px;border-radius:3px;font-size:12px;">localStorage</code> に保存されています。<br>
        定期的なバックアップをおすすめしています。<br>
        バックアップを実行しますか？
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary" style="flex:1;justify-content:center;" onclick="exportDataFromReminder()">📤 今すぐバックアップ</button>
        <button class="btn btn-secondary" style="flex:1;justify-content:center;" onclick="closeBackupReminder()">後で</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

function exportDataFromReminder() {
  exportData();
  closeBackupReminder();
}

function closeBackupReminder() {
  const el = document.getElementById('backup-reminder-overlay');
  if (el) el.remove();
}

// ========== 全削除（緊急時用） ==========
function resetAll() {
  if (!confirm('全データを削除します。この操作は取り消せません。')) return;
  localStorage.removeItem(CONFIG.storageKey);
  location.reload();
}
