// ===== WORKER URL =====
// Cloudflare Workerのデプロイ後にURLを設定してください
// 例: 'https://furikaeri-bot-api.YOUR_SUBDOMAIN.workers.dev'
const WORKER_URL = 'https://black-credit-3a3a.gooooo-y-4-2.workers.dev';

// ===== STATE =====
let db = { goals: [], sessions: [] };
let settings = {
  provider: 'cloud',    // 'cloud' | 'local' | 'none'
  cloudSvc: 'claude',   // 'claude' | 'openai' | 'gemini'
  cloudModel: 'claude-opus-4-5',
  apiKey: '',
  localEndpoint: '',
  localModel: '',
  aiSuggest: true,
  aiSummary: true,
};
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
  loadData(); loadSettings();
  setToday();
  renderGoals(); renderQAStart(); renderHistory();
  applySettingsToUI();
}

function setToday() {
  const d = new Date(), wd = ['日', '月', '火', '水', '木', '金', '土'];
  document.getElementById('today-lbl').textContent =
    `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}(${wd[d.getDay()]})`;
}
const p = n => String(n).padStart(2, '0');
const dateStr = d => { d = d || new Date(); return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`; };
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// wrapLong: テキスト整形
// 優先順位: 1.\n(意図的改行)を保持 2.。の後で改行 3.30文字超えで強制改行
// wrapLong: テキスト整形
// 優先順位: 1.\n(意図的改行)を保持 2.。の後で改行 3.20文字超えで強制改行
// 閾値20文字: 最小画面幅375pxでバブル幅85%-padding=289px、全角22文字が上限
// white-space:preとの組み合わせで\nのみが改行になりCSSの自動折り返しを排除
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

function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem('furi_cfg') || '{}'); Object.assign(settings, s); }
  catch (e) { }
  // マイグレーション: 旧バージョンの 'claude' プロバイダーを 'cloud' に変換
  if (settings.provider === 'claude') {
    settings.provider = 'cloud';
    settings.cloudSvc = 'claude';
    saveSettings();
  }
  // aiSuggest/aiSummary が明示的に false でない限り true にする（デフォルトON）
  if (settings.aiSuggest === undefined || settings.aiSuggest === null) settings.aiSuggest = true;
  if (settings.aiSummary === undefined || settings.aiSummary === null) settings.aiSummary = true;
}
function saveSettings() { localStorage.setItem('furi_cfg', JSON.stringify(settings)); }
function saveSetting(k, v) {
  settings[k] = v; saveSettings();
  // トグルの即時反映
  if (k === 'aiSuggest') document.getElementById('toggle-ai-suggest').checked = v;
  if (k === 'aiSummary') document.getElementById('toggle-ai-summary').checked = v;
}

function applySettingsToUI() {
  if (settings.apiKey) document.getElementById('api-key-input').value = settings.apiKey;
  if (settings.localEndpoint) document.getElementById('local-endpoint').value = settings.localEndpoint;
  if (settings.localModel) document.getElementById('local-model').value = settings.localModel;

  // プロバイダータブ
  const prov = settings.provider || 'cloud';
  document.querySelectorAll('.provider-tab').forEach(t => t.classList.toggle('active', t.dataset.provider === prov));
  document.getElementById('provider-claude').style.display = prov === 'cloud' ? 'block' : 'none';
  document.getElementById('provider-local').style.display = prov === 'local' ? 'block' : 'none';

  // クラウドサービス選択
  const svc = settings.cloudSvc || 'claude';
  document.querySelectorAll('.cloud-svc-btn').forEach(b => b.classList.toggle('active', b.dataset.svc === svc));
  applyCloudSvcUI(svc);

  // モデル選択
  const modelSel = document.getElementById('cloud-model-select');
  if (settings.cloudModel) modelSel.value = settings.cloudModel;

  // トグル
  document.getElementById('toggle-ai-suggest').checked = settings.aiSuggest !== false;
  document.getElementById('toggle-ai-summary').checked = settings.aiSummary !== false;
  updateApiStatus();
}

function saveApiKey() {
  const val = document.getElementById('api-key-input').value.trim();
  const svc = settings.cloudSvc || 'claude';
  settings['apiKey_' + svc] = val;
  settings.apiKey = val;
  saveSettings(); updateApiStatus();
}
function toggleApiVis() {
  const el = document.getElementById('api-key-input');
  el.type = el.type === 'password' ? 'text' : 'password';
}
function updateApiStatus() {
  const svc = settings.cloudSvc || 'claude';
  const key = settings.apiKey || '';
  let ok = false;
  if (settings.provider === 'cloud') {
    if (svc === 'claude') ok = key.startsWith('sk-ant-');
    if (svc === 'openai') ok = key.startsWith('sk-');
    if (svc === 'gemini') ok = key.length > 10;
  }
  document.getElementById('api-dot').className = ok ? 'dot-ok' : 'dot-ng';
  document.getElementById('api-status').textContent = ok ? 'APIキー設定済み' : '未設定';
}

// クラウドサービス切替
const svcMeta = {
  claude: {
    label: 'Claude APIキー',
    placeholder: 'sk-ant-...',
    link: 'https://console.anthropic.com/settings/keys',
    linkText: 'Anthropic Console でキーを取得 →',
    models: [
      { v: 'claude-opus-4-5', l: 'claude-opus-4-5（高性能）' },
      { v: 'claude-sonnet-4-5', l: 'claude-sonnet-4-5（バランス）' },
      { v: 'claude-haiku-4-5-20251001', l: 'claude-haiku-4-5（高速・低コスト）' },
    ],
  },
  openai: {
    label: 'OpenAI APIキー',
    placeholder: 'sk-...',
    link: 'https://platform.openai.com/api-keys',
    linkText: 'OpenAI Platform でキーを取得 →',
    models: [
      { v: 'gpt-4o', l: 'GPT-4o（高性能）' },
      { v: 'gpt-4o-mini', l: 'GPT-4o mini（高速・低コスト）' },
      { v: 'gpt-4-turbo', l: 'GPT-4 Turbo' },
    ],
  },
  gemini: {
    label: 'Gemini APIキー',
    placeholder: 'AIza...',
    link: 'https://aistudio.google.com/app/apikey',
    linkText: 'Google AI Studio でキーを取得 →',
    models: [
      { v: 'gemini-2.0-flash', l: 'Gemini 2.0 Flash（高速）' },
      { v: 'gemini-2.5-flash-preview-04-17', l: 'Gemini 2.5 Flash Preview' },
      { v: 'gemini-2.5-pro-preview-05-06', l: 'Gemini 2.5 Pro Preview（高性能）' },
    ],
  },
};

function applyCloudSvcUI(svc) {
  const meta = svcMeta[svc] || svcMeta.claude;
  document.getElementById('cloud-key-label').textContent = meta.label;
  document.getElementById('api-key-input').placeholder = meta.placeholder;
  document.getElementById('api-key-link').href = meta.link;
  document.getElementById('api-key-link').textContent = meta.linkText;
  // モデル選択肢を更新
  const sel = document.getElementById('cloud-model-select');
  sel.innerHTML = meta.models.map(m => `<option value="${m.v}">${m.l}</option>`).join('');
  // 保存済みモデルを復元（同じサービスのものなら）
  if (settings.cloudModel && meta.models.some(m => m.v === settings.cloudModel)) {
    sel.value = settings.cloudModel;
  } else {
    settings.cloudModel = meta.models[0].v;
    sel.value = settings.cloudModel;
    saveSettings();
  }
}

function switchCloudSvc(btn) {
  const svc = btn.dataset.svc;
  settings.cloudSvc = svc;
  // APIキーはサービスごとに保持（apiKey_claude/apiKey_openai/apiKey_gemini）
  // 現在のキーを保存
  settings['apiKey_' + (settings.cloudSvc || 'claude')] = document.getElementById('api-key-input').value.trim();
  settings.cloudSvc = svc;
  // 切替先のキーを読み込み
  document.getElementById('api-key-input').value = settings['apiKey_' + svc] || '';
  settings.apiKey = settings['apiKey_' + svc] || '';
  saveSettings();
  document.querySelectorAll('.cloud-svc-btn').forEach(b => b.classList.toggle('active', b.dataset.svc === svc));
  applyCloudSvcUI(svc);
  updateApiStatus();
}

// プロバイダー切替
function switchProvider(el) {
  const prov = el.dataset.provider;
  settings.provider = prov; saveSettings();
  document.querySelectorAll('.provider-tab').forEach(t => t.classList.toggle('active', t.dataset.provider === prov));
  document.getElementById('provider-claude').style.display = prov === 'cloud' ? 'block' : 'none';
  document.getElementById('provider-local').style.display = prov === 'local' ? 'block' : 'none';
  // 「使わない」を選択したらAI機能トグルを両方OFF
  if (prov === 'none') {
    settings.aiSuggest = false;
    settings.aiSummary = false;
    saveSettings();
    document.getElementById('toggle-ai-suggest').checked = false;
    document.getElementById('toggle-ai-summary').checked = false;
    showToast('AI機能をOFFにしました');
  }
  updateApiStatus();
}

// ===== クラウドAPI接続テスト =====
async function testCloudAPI() {
  const statusRow = document.getElementById('cloud-test-status');
  const dot = document.getElementById('cloud-test-dot');
  const msg = document.getElementById('cloud-test-msg');
  statusRow.style.display = 'flex';
  dot.className = 'dot-ng';
  msg.textContent = 'テスト中...';

  try {
    const result = await callAI('「OK」とだけ返してください。');
    dot.className = 'dot-ok';
    msg.textContent = `接続成功！（応答: ${result.trim().slice(0, 20)}）`;
  } catch (e) {
    dot.className = 'dot-ng';
    msg.textContent = `接続失敗: ${e.message}`;
  }
}

// ===== ローカルLLMガイド =====
function toggleGuide() {
  const el = document.getElementById('llm-guide');
  const arrow = document.getElementById('guide-arrow');
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  arrow.textContent = open ? '▶' : '▼';
}

// ===== ローカルLLM接続テスト =====
async function testLocalLLM() {
  let endpoint = document.getElementById('local-endpoint').value.trim();
  const modelInput = document.getElementById('local-model').value.trim();
  if (!endpoint) { showToast('エンドポイントURLを入力してください'); return; }
  // パス補完
  if (!endpoint.includes('/chat/completions')) {
    endpoint = endpoint.replace(/\/$/, '') + '/v1/chat/completions';
  }
  const body = modelInput
    ? { model: modelInput, messages: [{ role: 'user', content: 'こんにちは。一言だけ返答してください。' }], max_tokens: 30 }
    : { messages: [{ role: 'user', content: 'こんにちは。一言だけ返答してください。' }], max_tokens: 30 };
  document.getElementById('local-status').textContent = 'テスト中...';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    document.getElementById('local-dot').className = 'dot-ok';
    document.getElementById('local-status').textContent = '接続成功！';
  } catch (e) {
    document.getElementById('local-dot').className = 'dot-ng';
    document.getElementById('local-status').textContent = '接続失敗: ' + e.message;
  }
}

// ===== AI呼び出し共通 =====
async function callAI(prompt) {
  const prov = settings.provider;
  if (prov === 'none') throw new Error('AI未設定');

  if (prov === 'cloud') {
    const svc = settings.cloudSvc || 'claude';
    const key = settings['apiKey_' + svc] || settings.apiKey || '';
    const model = settings.cloudModel || svcMeta[svc]?.models[0]?.v || '';
    if (!key) throw new Error('APIキーが設定されていません');

    if (svc === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || 'APIエラー'); }
      const data = await res.json();
      return data.content?.[0]?.text || '';
    }

    if (svc === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || 'APIエラー'); }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    if (svc === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || 'APIエラー'); }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
  }

  if (prov === 'local') {
    if (!settings.localEndpoint) throw new Error('エンドポイントURLが設定されていません');
    // エンドポイントの末尾パスを補完（ベースURLだけ入力された場合に対応）
    let endpoint = settings.localEndpoint.trim();
    if (!endpoint.includes('/chat/completions')) {
      endpoint = endpoint.replace(/\/$/, '') + '/v1/chat/completions';
    }
    // LM Studioはモデル名なしでも動作するが、指定がある場合は使用する
    const modelField = settings.localModel ? { model: settings.localModel } : {};
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...modelField, messages: [{ role: 'user', content: prompt }], max_tokens: 800, stream: false }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || data.content?.[0]?.text || '';
  }
  throw new Error('不明なプロバイダー');
}

function aiAvailable() {
  const p = settings.provider;
  if (!p || p === 'none') return false;
  if (p === 'cloud') {
    const svc = settings.cloudSvc || 'claude';
    const key = settings['apiKey_' + svc] || settings.apiKey || '';
    return key.length > 10;
  }
  if (p === 'local') return !!(settings.localEndpoint); // モデル名は省略可能（デフォルト使用）
  return false;
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
    // AI提案設定がONでかつAI利用可能なら候補を非同期で表示
    const suggestOn = settings.aiSuggest !== false;
    const canUseAI = aiAvailable();
    if (suggestOn && canUseAI) {
      addTomorrowCandidates(q.goalId);
    } else if (suggestOn && !canUseAI) {
      // AI設定はONだがAPIキー未設定の場合はヒントを表示
      const hint = document.createElement('div');
      hint.className = 'bubble-wrap bot';
      hint.innerHTML = `<div class="bubble-sender">ふりかえりBot</div><div class="bubble bot" style="font-size:12px;color:var(--ink3);">💡 AI提案を使うには設定タブでAPIキーを入力してください</div>`;
      document.getElementById('qa-messages').appendChild(hint);
      scrollBottom();
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
  // Enter単体は改行（デフォルト動作のまま）
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

// ===== 明日の候補（バブル内） =====
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
    // Cloudflare Worker経由でWorkers AIを呼び出す
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
    // rawテキストからパース（フォールバック）
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
  // チップを選択済みに
  document.querySelectorAll(`[id^="cand-${goalId}-"]`).forEach(el => el.classList.remove('used'));
  document.getElementById(`cand-${goalId}-${idx}`).classList.add('used');
  // テキストエリアにセット
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

// ===== FINISH =====
async function finishQA() {
  setInputDisabled(true);
  document.getElementById('qa-hint').textContent = '';

  addBubble('bot', `お疲れ様でした！全ての目標について振り返りが完了しました 🎉\n\nまとめ文を生成しています...`);
  addTypingBubble();

  const answersArr = db.goals.map(g => qa.answers[g.id]).filter(Boolean);
  const today = dateStr();
  let summaryText = '';

  if (settings.aiSummary !== false && aiAvailable()) {
    try { summaryText = await generateSummaryWithAI(answersArr, today); }
    catch (e) { summaryText = generateSummaryTemplate(answersArr, today); }
  } else {
    summaryText = generateSummaryTemplate(answersArr, today);
  }

  removeTypingBubble();

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

async function generateSummaryWithAI(answers, today) {
  const blocks = answers.map(a => `【目標：${a.goalTitle}】
達成度：${a.achievement}%
うまくいったこと：${a.good || '特になし'}
できなかったこと：${a.bad || '特になし'}
明日やること：${a.tomorrow || '未定'}`).join('\n\n');

  const prompt = `あなたはSlack投稿文の作成アシスタントです。
以下の振り返り内容をもとに、チームに共有するSlack投稿文を作成してください。

日付：${today}

${blocks}

条件：
- Slackに投稿する自然な日本語
- 絵文字を適度に使い読みやすく
- 全目標をまとめて1つの投稿文にする
- 500文字以内
- 前置き不要、すぐ本文から始める`;

  return await callAI(prompt);
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
    bubble.textContent = wrapLong(text);  // 21文字折り返し済みテキストをpre-wrapで表示

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
  localStorage.removeItem('furi_db'); localStorage.removeItem('furi_cfg');
  location.reload();
}

// ===== TOAST =====
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

init();
