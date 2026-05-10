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
let currentQuestions = [];  // 目標モーダルで編集中の振り返り項目

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

  // 達成度を 0-100 スケールから 0-10 スケールに自動移行
  // 既存データが10より大きい場合は 0-100 スケールとみなして変換
  let migrated = false;
  db.sessions.forEach(s => {
    (s.answers || []).forEach(a => {
      if (typeof a.achievement === 'number' && a.achievement > 10) {
        a.achievement = Math.round(a.achievement / 10);
        migrated = true;
      }
    });
  });
  if (migrated) {
    saveData();
  }
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

// ========== 振り返り項目テンプレート ==========
// label = 項目名（履歴・サマリーで表示）
// text  = ユーザーへの質問文（バブルで表示）
const QUESTION_TEMPLATES = {
  standard: {
    name: '標準（デフォルト）',
    desc: 'うまくいったこと/改善点/明日',
    items: [
      { label: 'うまくいったこと', text: 'うまくいったことや、良かったことを教えてください。\n\n（思い浮かばなければ「特になし」と入力してください）' },
      { label: 'できなかったこと', text: 'できなかったことや、改善したい点はありますか？' },
      { label: '明日やること',     text: '明日やることを教えてください。' },
    ],
  },
  kpt: {
    name: 'KPT',
    desc: 'Keep / Problem / Try',
    items: [
      { label: 'Keep',    text: '続けたいこと（うまくいっていること）は？' },
      { label: 'Problem', text: '課題や問題点は？' },
      { label: 'Try',     text: '次に試してみたいことは？' },
    ],
  },
  ywt: {
    name: 'YWT',
    desc: 'やったこと / わかったこと / つぎやること',
    items: [
      { label: 'やったこと',   text: '今日やったことは？' },
      { label: 'わかったこと', text: 'やってみてわかったこと・気付きは？' },
      { label: 'つぎやること', text: '次にやることは？' },
    ],
  },
  kpta: {
    name: 'KPTA',
    desc: 'Keep / Problem / Try / Action',
    items: [
      { label: 'Keep',    text: '続けたいことは?' },
      { label: 'Problem', text: '課題や問題点は?' },
      { label: 'Try',     text: '次に試してみたいことは?' },
      { label: 'Action',  text: '具体的にどう行動する?' },
    ],
  },
  fdl: {
    name: 'FDL',
    desc: 'Fun / Done / Learn',
    items: [
      { label: 'Fun',   text: '楽しかったこと・嬉しかったことは?' },
      { label: 'Done',  text: '今日できたことは?' },
      { label: 'Learn', text: '学んだこと・気付きは?' },
    ],
  },
};

// 設定可能な項目数の上限（達成度を除く）
const MAX_CUSTOM_QUESTIONS = 5;

// ========== 振り返り項目の取得（互換性レイヤー） ==========
// 目標の questions 配列を取得する。未設定の古い目標はstandardテンプレートを返す。
// 戻り値の各item: { id, label, text }
function getQuestionsForGoal(goal) {
  // ① カスタム項目が設定済み → そのまま使う
  if (goal.questions && Array.isArray(goal.questions) && goal.questions.length > 0) {
    return goal.questions;
  }
  // ② 未設定 → standardテンプレートをIDつきで返す（互換性）
  return QUESTION_TEMPLATES.standard.items.map((item, idx) => ({
    id: ['good', 'bad', 'tomorrow'][idx], // 旧キーと互換
    label: item.label,
    text:  item.text,
  }));
}

// ========== 履歴回答の取得（互換性レイヤー） ==========
// answers配列の1要素から、特定項目IDの回答テキストを取得
// 旧データ（answers[i].good/bad/tomorrow）と新データ（answers[i].responses[id]）の両方に対応
function getResponseValue(answer, questionId) {
  // 新形式: answer.responses[questionId]
  if (answer.responses && typeof answer.responses === 'object') {
    return answer.responses[questionId] || '';
  }
  // 旧形式: answer[questionId] が直接フィールドにある（good/bad/tomorrow）
  return answer[questionId] || '';
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
