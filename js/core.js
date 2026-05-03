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

// テキスト整形: 1.\n保持 2.。の後で改行 3.20文字超えで強制改行
function wrapLong(text, n) {
  n = n || CONFIG.wrapLength || 20;
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

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}
