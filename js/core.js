// ===== core.js =====
// 役割: CONFIG, アプリのstate, データの永続化, 共通ユーティリティ関数
// 全タブから参照される基盤コード

// ========== CONFIG（settings.jsonから読み込み） ==========
const CONFIG = {
  WORKER_URL: '',
  wrapLength: 20,
  storageKey: 'furi_db',
  backupIntervalDays: 7,
};

// ========== STATE ==========
let db = { goals: [], sessions: [] };
let qa = {
  active: false,
  questions: [],
  currentIdx: 0,
  answers: {},
  sliderVal: 60,
};
let editGoalId = null;
let selCatVal  = 'health';
let editCtx    = null;

// ========== INIT ==========
function init() {
  loadData();
  setToday();
  renderGoals();
  renderQAStart();
  renderHistory();
  checkBackupReminder();
}

function setToday() {
  const d = new Date();
  const wd = ['日','月','火','水','木','金','土'];
  document.getElementById('today-lbl').textContent =
    `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())}(${wd[d.getDay()]})`;
}

// ========== STORAGE ==========
function loadData() {
  try {
    db = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '{"goals":[],"sessions":[]}');
  } catch (e) {
    db = { goals: [], sessions: [] };
  }
  if (!db.sessions) db.sessions = [];
}

function saveData() {
  localStorage.setItem(CONFIG.storageKey, JSON.stringify(db));
}

// ========== AI判定 ==========
function aiAvailable() {
  return CONFIG.WORKER_URL
    && !CONFIG.WORKER_URL.includes('YOUR_SUBDOMAIN')
    && !CONFIG.WORKER_URL.includes('YOUR_WORKER_URL');
}

// ========== ユーティリティ ==========
const p = n => String(n).padStart(2, '0');

const dateStr = d => {
  d = d || new Date();
  return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())}`;
};

const esc = s => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// テキスト整形（仕様）
//   1. ユーザーが意図的に入れた\nを保持
//   2. 「。」の後で改行（行末の。は除く）
//   3. 1行あたり30文字を超えたら強制改行
//   ※ 画面幅を超えた場合の折り返しはCSS（overflow-wrap:anywhere）が担当
function wrapLong(text) {
  const n = CONFIG.wrapLength || 30;
  return text.split('\n').map(line => {
    // 「。」の後で改行（行末の「。」は無視）
    const withPeriodBreaks = line.replace(/。(?!$)/g, '。\n');
    // 各行を30文字で強制改行
    return withPeriodBreaks.split('\n').map(seg => {
      const chunks = [];
      let cur = '';
      for (const ch of seg) {
        cur += ch;
        if (cur.length >= n) {
          chunks.push(cur);
          cur = '';
        }
      }
      if (cur) chunks.push(cur);
      return chunks.length ? chunks.join('\n') : '';
    }).join('\n');
  }).join('\n');
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}
