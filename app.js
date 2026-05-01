// ===== CONFIG（settings.jsonから読み込み） =====
// WORKER_URLなどの設定はsettings.jsonで管理します
let CONFIG = {
  WORKER_URL: '',
  wrapLength: 20,
  storageKey: 'furi_db',
  backupIntervalDays: 7,
};

// settings.jsonを読み込んでからアプリを起動
fetch('./settings.json')
  .then(r => r.json())
  .then(json => {
    Object.assign(CONFIG, json);
    init();
  })
  .catch(() => {
    // 読み込み失敗時はデフォルト設定でそのまま起動
    console.warn('settings.json の読み込みに失敗しました。デフォルト設定で起動します。');
    init();
  });

// ===== STATE =====
let db = { goals:[], sessions:[] };
let editGoalId = null;
let selCatVal  = 'health';
let editCtx    = null;

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
  checkBackupReminder();
}

// ===== バックアップリマインダー（7日ごと） =====
function checkBackupReminder() {
  const KEY = 'furi_last_backup_reminder';
  const last = localStorage.getItem(KEY);
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  // 最後に表示した日から7日以上経過、またはデータがある場合のみ表示
  if ((!last || now - parseInt(last) >= sevenDays) && db.sessions.length > 0) {
    // 少し遅らせて表示（画面描画完了後）
    setTimeout(() => {
      showBackupReminder();
      localStorage.setItem(KEY, String(now));
    }, 1000);
  }
}

function showBackupReminder() {
  const overlay = document.createElement('div');
  overlay.id = 'backup-reminder-overlay';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.45);
    z-index:900; display:flex; align-items:center; justify-content:center; padding:20px;
  `;

  overlay.innerHTML = `
    <div style="
      background:var(--card); border-radius:var(--r); padding:24px;
      max-width:360px; width:100%; box-shadow:0 8px 32px rgba(0,0,0,.18);
    ">
      <div style="font-size:22px; margin-bottom:10px;">💾</div>
      <div style="font-size:15px; font-weight:700; margin-bottom:10px;">定期バックアップのお知らせ</div>
      <div style="font-size:13px; color:var(--ink2); line-height:1.8; margin-bottom:18px;">
        過去の記録はブラウザの <code style="background:var(--surface);padding:1px 5px;border-radius:3px;font-size:12px;">localStorage</code> に保存されています。<br>
        定期的なバックアップをおすすめしています。
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary" style="flex:1;justify-content:center;"
          onclick="exportDataFromReminder()">📤 今すぐバックアップ</button>
        <button class="btn btn-secondary" style="flex:1;justify-content:center;"
          onclick="closeBackupReminder()">後で</button>
      </div>
    </div>
  `;

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

function setToday() {
  const d=new Date(), wd=['日','月','火','水','木','金','土'];
  document.getElementById('today-lbl').textContent =
    `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())}(${wd[d.getDay()]})`;
}
const p   = n => String(n).padStart(2,'0');
const dateStr = d => { d=d||new Date(); return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())}`; };
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ===== wrapLong =====
// 優先順位: 1.\n(意図的改行)を保持 2.。の後で改行 3.20文字超えで強制改行
function wrapLong(text, n=20) {
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
  try { db=JSON.parse(localStorage.getItem('furi_db')||'{"goals":[],"sessions":[]}'); }
  catch(e){ db={goals:[],sessions:[]}; }
  if(!db.sessions) db.sessions=[];
}
function saveData() { localStorage.setItem('furi_db',JSON.stringify(db)); }

// ===== AI提案が使えるか =====
function aiAvailable() {
  return CONFIG.WORKER_URL && !CONFIG.WORKER_URL.includes('YOUR_SUBDOMAIN') && !CONFIG.WORKER_URL.includes('YOUR_WORKER_URL');
}

// ===== PAGE NAV =====
function showPage(tabEl) {
  const name=tabEl.dataset.page;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  tabEl.classList.add('active');

  if(name==='furikaeri'){
    // 振り返り進行中はqa-wrapをそのまま表示、終了済みならスタート画面に戻す
    if(!qa.active){
      document.getElementById('qa-wrap').style.display='none';
      document.getElementById('qa-start').style.display='block';
      renderQAStart();
    }
  }
  if(name==='history') renderHistory();
}

// ===== GOALS =====
const catLabel={health:'🏃 健康・運動',study:'📚 学習・スキル',career:'💼 仕事・キャリア',other:'✨ その他'};
const catCls  ={health:'cat-health',study:'cat-study',career:'cat-career',other:'cat-other'};

function renderGoals() {
  const list=document.getElementById('goals-list');
  const empty=document.getElementById('goals-empty');
  if(!db.goals.length){ list.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';
  list.innerHTML=db.goals.map(g=>{
    const recs=db.sessions.flatMap(s=>s.answers||[]).filter(a=>a.goalId===g.id);
    const avg=recs.length?Math.round(recs.reduce((s,r)=>s+(r.achievement||0),0)/recs.length):0;
    return `<div class="goal-item">
      <div class="goal-item-top">
        <div>
          <div class="goal-title">${esc(g.title)}</div>
          <div class="goal-meta">${g.start} 〜 ${g.end}　記録 ${recs.length}件</div>
          <span class="goal-cat ${catCls[g.cat]||'cat-other'}">${catLabel[g.cat]||'その他'}</span>
        </div>
        <div style="display:flex;gap:5px;">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="openGoalModal('${g.id}')">✏️</button>
          <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--warn);" onclick="deleteGoal('${g.id}')">🗑</button>
        </div>
      </div>
      <div class="goal-prog-wrap"><div class="goal-prog" style="width:${avg}%"></div></div>
      <div style="font-size:11px;color:var(--ink3);margin-top:4px;font-family:'DM Mono',monospace;">平均達成度 ${avg}%</div>
      ${g.desc?`<div style="font-size:12px;color:var(--ink2);margin-top:8px;">${esc(g.desc)}</div>`:''}
    </div>`;
  }).join('');
}

function openGoalModal(id) {
  editGoalId=id||null;
  document.getElementById('modal-title').textContent=id?'目標を編集':'目標を追加';
  if(id){
    const g=db.goals.find(x=>x.id===id);
    document.getElementById('m-title').value=g.title;
    document.getElementById('m-desc').value=g.desc||'';
    document.getElementById('m-start').value=g.start||'';
    document.getElementById('m-end').value=g.end||'';
    selCatVal=g.cat||'health';
  } else {
    ['m-title','m-desc'].forEach(id=>document.getElementById(id).value='');
    const now=new Date(),end=new Date(now); end.setMonth(end.getMonth()+2);
    document.getElementById('m-start').value=dateStr(now);
    document.getElementById('m-end').value=dateStr(end);
    selCatVal='health';
  }
  document.querySelectorAll('#goal-modal .chip[data-cat]').forEach(c=>c.classList.toggle('sel',c.dataset.cat===selCatVal));
  document.getElementById('goal-modal').classList.add('show');
  setTimeout(()=>document.getElementById('m-title').focus(),80);
}
function closeGoalModal(){ document.getElementById('goal-modal').classList.remove('show'); }
function selCat(el){
  document.querySelectorAll('#goal-modal .chip[data-cat]').forEach(c=>c.classList.remove('sel'));
  el.classList.add('sel'); selCatVal=el.dataset.cat;
}
function saveGoal(){
  const title=document.getElementById('m-title').value.trim();
  if(!title){ showToast('タイトルを入力してください'); return; }
  const data={title,desc:document.getElementById('m-desc').value.trim(),cat:selCatVal,start:document.getElementById('m-start').value,end:document.getElementById('m-end').value};
  if(editGoalId){ Object.assign(db.goals.find(g=>g.id===editGoalId),data); }
  else { db.goals.push({id:'g_'+Date.now(),...data,createdAt:new Date().toISOString()}); }
  saveData(); closeGoalModal(); renderGoals(); renderQAStart();
  showToast(editGoalId?'目標を更新しました':'目標を追加しました');
}
function deleteGoal(id){
  if(!confirm('この目標を削除しますか？')) return;
  db.goals=db.goals.filter(g=>g.id!==id);
  saveData(); renderGoals(); renderQAStart();
  showToast('削除しました');
}

// ===== QA START =====
function renderQAStart(){
  const cont=document.getElementById('qa-start-goals');
  const empty=document.getElementById('qa-empty');
  const btn=document.getElementById('qa-start-btn');
  if(!db.goals.length){ cont.innerHTML=''; empty.style.display='block'; btn.style.display='none'; return; }
  empty.style.display='none'; btn.style.display='flex';
  cont.innerHTML=db.goals.map(g=>`
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:12px 15px;margin-bottom:8px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:18px;">${{health:'🏃',study:'📚',career:'💼',other:'✨'}[g.cat]||'🎯'}</span>
      <div>
        <div style="font-size:13px;font-weight:700;">${esc(g.title)}</div>
        <div style="font-size:11px;color:var(--ink3);">${g.start} 〜 ${g.end}</div>
      </div>
    </div>`).join('');
}

// ===== QA ENGINE =====
function buildQuestions(){
  const qs=[];
  db.goals.forEach(g=>{
    qa.answers[g.id]={goalId:g.id,goalTitle:g.title,achievement:60,good:'',bad:'',tomorrow:''};
    qs.push({goalId:g.id,type:'section_start',goalTitle:g.title});
    qs.push({goalId:g.id,type:'slider',key:'achievement',text:`【${g.title}】\n\n今日の達成度を教えてください。`});
    qs.push({goalId:g.id,type:'text',key:'good',text:`うまくいったことや、良かったことを教えてください。\n\n（思い浮かばなければ「特になし」と入力してください）`});
    qs.push({goalId:g.id,type:'text',key:'bad',text:`できなかったことや、改善したい点はありますか？`});
    qs.push({goalId:g.id,type:'tomorrow',key:'tomorrow',text:`明日やることを教えてください。`});
  });
  return qs;
}

function startQA(){
  if(!db.goals.length) return;
  qa.active=true;
  qa.questions=buildQuestions();
  qa.currentIdx=0;
  qa.answers={};
  db.goals.forEach(g=>{ qa.answers[g.id]={goalId:g.id,goalTitle:g.title,achievement:60,good:'',bad:'',tomorrow:''}; });
  document.getElementById('qa-start').style.display='none';
  document.getElementById('qa-wrap').style.display='flex';
  document.getElementById('qa-messages').innerHTML='';
  addBubble('bot',`こんにちは！今日の振り返りを始めましょう。\n登録されている目標 ${db.goals.length}件 について、1つずつ質問します。`);
  setTimeout(()=>stepNext(),600);
}

function stepNext(){
  if(qa.currentIdx>=qa.questions.length){ finishQA(); return; }
  const q=qa.questions[qa.currentIdx];
  updateProgress();

  if(q.type==='section_start'){
    addSystemBubble(`── ${q.goalTitle} ──`);
    qa.currentIdx++;
    setTimeout(()=>stepNext(),400);
    return;
  }
  if(q.type==='slider'){
    addSliderBubble(q);
    setInputDisabled(true);
    return;
  }
  if(q.type==='tomorrow'){
    addBubble('bot',q.text);
    setInputDisabled(false);
    // Worker URLが設定されていればAI提案を表示
    if(aiAvailable()){
      addTomorrowCandidates(q.goalId);
    }
    document.getElementById('qa-textarea').focus();
    return;
  }
  // 通常テキスト
  addBubble('bot',q.text);
  setInputDisabled(false);
  document.getElementById('qa-textarea').focus();
}

// ===== 送信（Shift+Enter） =====
function handleKey(e){
  if(e.key==='Enter' && e.shiftKey){ e.preventDefault(); sendAnswer(); }
}

function sendAnswer(){
  if(!qa.active) return;
  const ta=document.getElementById('qa-textarea');
  const val=ta.value.trim();
  if(!val) return;
  const q=qa.questions[qa.currentIdx];
  if(!q||q.type==='slider') return;

  const bubbleId=`${q.goalId}__${q.key}`;
  const existing=document.querySelector(`[data-bubble-id="${bubbleId}"]`);
  if(existing){
    const textEl=document.getElementById(`bubble-text-${bubbleId}`);
    if(textEl) textEl.textContent=wrapLong(val);
  } else {
    addBubble('user',val,bubbleId);
  }
  ta.value=''; autoResize(ta);
  qa.answers[q.goalId][q.key]=val;
  setInputDisabled(true);
  qa.currentIdx++;
  setTimeout(()=>stepNext(),500);
}

// ===== 明日の候補（Cloudflare Worker経由） =====
async function addTomorrowCandidates(goalId){
  const g=db.goals.find(x=>x.id===goalId);
  const ans=qa.answers[goalId];
  if(!g||!ans) return;

  const loadingId='tomorrow-loading-'+goalId;
  const loadWrap=document.createElement('div');
  loadWrap.className='bubble-wrap bot'; loadWrap.id=loadingId;
  loadWrap.innerHTML=`<div class="bubble-sender">ふりかえりBot</div>
    <div class="bubble bot"><div class="candidate-loading"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span style="margin-left:4px;">明日の行動を考えています...</span></div></div>`;
  document.getElementById('qa-messages').appendChild(loadWrap);
  scrollBottom();

  try {
    const res = await fetch(CONFIG.WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goalTitle:   g.title,
        goalDesc:    g.desc || '',
        achievement: ans.achievement,
        good:        ans.good  || '',
        bad:         ans.bad   || '',
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    loadWrap.remove();

    let candidates = data.candidates || [];
    if (candidates.length === 0 && data.raw) {
      candidates = data.raw.split('\n').map(l=>l.trim())
        .filter(l=>/^[1-3][.\．]/.test(l))
        .map(l=>l.replace(/^[1-3][.\．]\s*/,'').trim())
        .filter(Boolean).slice(0,3);
    }
    if (!candidates.length) return;

    const candWrap=document.createElement('div');
    candWrap.className='bubble-wrap bot';
    const chipHtml=candidates.map((c,i)=>`
      <button class="candidate-chip" id="cand-${goalId}-${i}"
        onclick="selectCandidate('${goalId}',${i},'${c.replace(/'/g,"\\'")}')">
        ${i+1}. ${esc(c)}
      </button>`).join('');
    candWrap.innerHTML=`<div class="bubble-sender">ふりかえりBot</div>
      <div class="bubble bot">
        <div style="font-size:12px;color:var(--ink3);margin-bottom:6px;">💡 候補から選ぶか、直接入力してください</div>
        <div class="tomorrow-candidates">${chipHtml}</div>
      </div>`;
    document.getElementById('qa-messages').appendChild(candWrap);
    scrollBottom();
  } catch(e){
    loadWrap.remove();
    const errWrap=document.createElement('div');
    errWrap.className='bubble-wrap bot';
    errWrap.innerHTML=`<div class="bubble-sender">ふりかえりBot</div>
      <div class="bubble bot" style="font-size:12px;color:var(--ink3);">
        💡 AI提案を取得できませんでした。直接入力してください。
      </div>`;
    document.getElementById('qa-messages').appendChild(errWrap);
    scrollBottom();
  }
}

function selectCandidate(goalId, idx, text){
  document.querySelectorAll(`[id^="cand-${goalId}-"]`).forEach(el=>el.classList.remove('used'));
  document.getElementById(`cand-${goalId}-${idx}`).classList.add('used');
  const ta=document.getElementById('qa-textarea');
  ta.value=text; autoResize(ta); ta.focus();
}

// ===== スライダーバブル =====
function addSliderBubble(q){
  qa.sliderVal=60;
  const id='slider_'+Date.now();
  const wrap=document.createElement('div');
  wrap.className='bubble-wrap bot';
  wrap.innerHTML=`
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

function confirmSlider(goalId,id){
  const val=parseInt(document.getElementById(id+'-range').value);
  qa.answers[goalId].achievement=val;
  const btn=document.querySelector(`#${id}-range`).closest('.slider-bubble').querySelector('button');
  btn.disabled=true; btn.textContent='✓ 確定';
  document.querySelector(`#${id}-range`).disabled=true;
  const bubbleId=`${goalId}__achievement`;
  addBubble('user',`達成度：${val}%`,bubbleId);
  qa.currentIdx++;
  setTimeout(()=>stepNext(),500);
}

// ===== FINISH（テンプレートのみ） =====
async function finishQA(){
  setInputDisabled(true);
  document.getElementById('qa-hint').textContent='';

  addBubble('bot',`お疲れ様でした！全ての目標について振り返りが完了しました 🎉\n\nまとめ文を生成しています...`);

  const answersArr=db.goals.map(g=>qa.answers[g.id]).filter(Boolean);
  const today=dateStr();
  const summaryText=generateSummaryTemplate(answersArr,today);

  // セッション保存
  db.sessions.push({id:'s_'+Date.now(),date:today,answers:answersArr,summary:summaryText,createdAt:new Date().toISOString()});
  saveData(); renderGoals();

  // プログレス100%
  document.getElementById('qa-bar').style.width='100%';
  document.getElementById('qa-prog-num').textContent='100%';
  document.getElementById('qa-prog-label').textContent=`目標 ${db.goals.length}/${db.goals.length} 振り返り完了`;

  // 結果表示
  const resultWrap=document.createElement('div');
  resultWrap.style.cssText='padding:0 0 20px;';
  resultWrap.innerHTML=`
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
  qa.active=false;
}

function generateSummaryTemplate(answers,today){
  let txt=`📅 ${today} の振り返り\n`;
  answers.forEach(a=>{
    txt+=`\n▍${a.goalTitle}　達成度：${a.achievement}%\n`;
    if(a.good)     txt+=`　○ ${a.good}\n`;
    if(a.bad)      txt+=`　× ${a.bad}\n`;
    if(a.tomorrow) txt+=`　→ 明日：${a.tomorrow}\n`;
  });
  return txt.trim();
}

function copyFinalResult(){
  const text=document.getElementById('final-result')?.textContent||'';
  navigator.clipboard.writeText(text).then(()=>{
    showToast('コピーしました！Slackに貼り付けてください');
  }).catch(()=>{
    const ta=document.createElement('textarea'); ta.value=text;
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    showToast('コピーしました');
  });
}

function restartQA(){
  document.getElementById('qa-wrap').style.display='none';
  document.getElementById('qa-start').style.display='block';
  renderQAStart();
}

// ===== BUBBLE HELPERS =====
function addBubble(role,text,bubbleId){
  const wrap=document.createElement('div');
  wrap.className=`bubble-wrap ${role}`;
  if(bubbleId) wrap.dataset.bubbleId=bubbleId;
  if(role==='bot'){
    wrap.innerHTML=`<div class="bubble-sender">ふりかえりBot</div><div class="bubble bot">${esc(text)}</div>`;
  } else {
    wrap.style.position='relative';
    const senderDiv=document.createElement('div');
    senderDiv.className='bubble-sender';
    senderDiv.textContent='あなた';

    const editBtn=document.createElement('button');
    editBtn.className='edit-answer-btn';
    editBtn.title='修正する';
    editBtn.textContent='✏️';
    editBtn.onclick=()=>openEditModal(bubbleId||'');

    const bubble=document.createElement('div');
    bubble.className='bubble user';
    bubble.id=`bubble-text-${bubbleId||''}`;
    bubble.textContent=wrapLong(text);

    const innerWrap=document.createElement('div');
    innerWrap.style.position='relative';
    innerWrap.appendChild(editBtn);
    innerWrap.appendChild(bubble);

    wrap.appendChild(senderDiv);
    wrap.appendChild(innerWrap);
  }
  document.getElementById('qa-messages').appendChild(wrap);
  scrollBottom();
  return wrap;
}

function addSystemBubble(text){
  const wrap=document.createElement('div');
  wrap.className='bubble-wrap';
  wrap.innerHTML=`<div class="bubble system">${esc(text)}</div>`;
  document.getElementById('qa-messages').appendChild(wrap);
  scrollBottom();
}

function addTypingBubble(){
  const wrap=document.createElement('div');
  wrap.className='bubble-wrap bot'; wrap.id='typing-bubble';
  wrap.innerHTML=`<div class="bubble-sender">ふりかえりBot</div><div class="bubble bot typing-bubble"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>`;
  document.getElementById('qa-messages').appendChild(wrap);
  scrollBottom();
}
function removeTypingBubble(){ const el=document.getElementById('typing-bubble'); if(el) el.remove(); }

function scrollBottom(){ const el=document.getElementById('qa-messages'); if(el) setTimeout(()=>el.scrollTop=el.scrollHeight,50); }

function setInputDisabled(disabled){
  document.getElementById('qa-textarea').disabled=disabled;
  document.getElementById('qa-send').disabled=disabled;
  document.getElementById('qa-textarea').placeholder=disabled?'しばらくお待ちください...':'回答を入力... (Shift+Enter で送信 / Enter で改行)';
}

function updateProgress(){
  const total=qa.questions.filter(q=>q.type!=='section_start').length;
  const done =qa.questions.slice(0,qa.currentIdx).filter(q=>q.type!=='section_start').length;
  const pct=total?Math.round(done/total*100):0;
  document.getElementById('qa-bar').style.width=pct+'%';
  document.getElementById('qa-prog-num').textContent=pct+'%';
  const q=qa.questions[qa.currentIdx];
  if(q){
    const goalIdx=db.goals.findIndex(g=>g.id===q.goalId)+1;
    document.getElementById('qa-prog-label').textContent=`目標 ${goalIdx}/${db.goals.length} を振り返り中`;
  }
}

function autoResize(el){ el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; }

// ===== ANSWER EDIT MODAL =====
function openEditModal(bubbleId){
  if(!bubbleId) return;
  const [goalId,key]=bubbleId.split('__');
  const g=db.goals.find(x=>x.id===goalId);
  const ans=qa.answers[goalId];
  if(!g||!ans) return;
  editCtx={goalId,key,type:key==='achievement'?'slider':'text'};
  const lbl={achievement:'達成度',good:'うまくいったこと',bad:'できなかったこと・改善点',tomorrow:'明日やること'};
  document.getElementById('edit-modal-title').textContent=`「${g.title}」の回答を修正 — ${lbl[key]||key}`;
  const body=document.getElementById('edit-modal-body');
  if(key==='achievement'){
    const cur=ans.achievement??60;
    body.innerHTML=`<div style="font-size:12px;color:var(--ink3);margin-bottom:8px;">スライダーで達成度を変更してください</div>
      <div class="edit-slider-val" id="edit-slider-val">${cur}%</div>
      <input class="edit-slider" type="range" min="0" max="100" value="${cur}" id="edit-slider-input"
        oninput="document.getElementById('edit-slider-val').textContent=this.value+'%'">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--ink3);margin-top:4px;font-family:'DM Mono',monospace;"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>`;
  } else {
    const cur=ans[key]||'';
    body.innerHTML=`<div style="font-size:12px;color:var(--ink3);margin-bottom:6px;">内容を編集してください</div>
      <textarea id="edit-text-input" rows="4" style="width:100%;border:1.5px solid var(--border2);border-radius:var(--r-sm);padding:9px 12px;font-size:13px;font-family:'Noto Sans JP',sans-serif;color:var(--ink);background:var(--surface);outline:none;resize:vertical;line-height:1.7;">${esc(cur)}</textarea>`;
    setTimeout(()=>document.getElementById('edit-text-input')?.focus(),80);
  }
  document.getElementById('edit-answer-modal').classList.add('show');
}
function closeEditModal(){ document.getElementById('edit-answer-modal').classList.remove('show'); editCtx=null; }
function applyEdit(){
  if(!editCtx) return;
  const {goalId,key,type}=editCtx;
  let newVal;
  if(type==='slider'){
    newVal=parseInt(document.getElementById('edit-slider-input').value);
    qa.answers[goalId].achievement=newVal;
    const el=document.getElementById(`bubble-text-${goalId}__achievement`);
    if(el) el.textContent=wrapLong(`達成度：${newVal}%`);
  } else {
    newVal=document.getElementById('edit-text-input').value.trim();
    if(!newVal){ showToast('内容を入力してください'); return; }
    qa.answers[goalId][key]=newVal;
    const el=document.getElementById(`bubble-text-${goalId}__${key}`);
    if(el) el.textContent=wrapLong(newVal);
  }
  closeEditModal();
  showToast('回答を修正しました');
}

// ===== HISTORY =====
function renderHistory(){
  const list=document.getElementById('history-list');
  const empty=document.getElementById('history-empty');
  const filter=document.getElementById('hist-filter');
  const sessions=[...db.sessions].reverse();
  const dates=[...new Set(sessions.map(s=>s.date))];
  filter.innerHTML='<option value="">すべての日付</option>'+dates.map(d=>`<option>${d}</option>`).join('');
  const filtered=filter.value?sessions.filter(s=>s.date===filter.value):sessions;

  if(!filtered.length){
    list.innerHTML='';
    empty.style.display='block';
    document.getElementById('hist-select-bar').style.display='none';
    return;
  }
  empty.style.display='none';
  document.getElementById('hist-select-bar').style.display='flex';

  list.innerHTML=filtered.map(s=>{
    const achList=(s.answers||[]).map(a=>`<span class="hist-ach">${esc(a.goalTitle||'')} ${a.achievement}%</span>`).join(' ');
    return `<div class="hist-item" data-id="${s.id}" onclick="toggleHistItem(this)" style="cursor:pointer;">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <input type="checkbox" class="hist-checkbox" data-id="${s.id}"
          style="width:16px;height:16px;flex-shrink:0;margin-top:2px;cursor:pointer;"
          onclick="event.stopPropagation();onHistCheckChange()">
        <div style="flex:1;">
          <div class="hist-date">${s.date}</div>
          <div style="margin-bottom:6px;">${achList}</div>
          <div class="hist-summary">${esc(s.summary||'')}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  // 選択状態をリセット
  document.getElementById('hist-check-all').checked=false;
  updateSelectBar();
}

function toggleHistItem(itemEl){
  const cb=itemEl.querySelector('.hist-checkbox');
  cb.checked=!cb.checked;
  onHistCheckChange();
}

function onHistCheckChange(){
  const all=document.querySelectorAll('.hist-checkbox');
  const checked=document.querySelectorAll('.hist-checkbox:checked');
  // 全選択チェックボックスの状態を更新
  const allCb=document.getElementById('hist-check-all');
  allCb.checked=all.length>0 && checked.length===all.length;
  allCb.indeterminate=checked.length>0 && checked.length<all.length;
  // 選択済みアイテムのハイライト
  all.forEach(cb=>{
    cb.closest('.hist-item').style.background=cb.checked?'var(--accent-lt)':'var(--card)';
    cb.closest('.hist-item').style.borderColor=cb.checked?'var(--accent-mid)':'var(--border)';
  });
  updateSelectBar();
}

function toggleSelectAll(masterCb){
  document.querySelectorAll('.hist-checkbox').forEach(cb=>{
    cb.checked=masterCb.checked;
    cb.closest('.hist-item').style.background=masterCb.checked?'var(--accent-lt)':'var(--card)';
    cb.closest('.hist-item').style.borderColor=masterCb.checked?'var(--accent-mid)':'var(--border)';
  });
  updateSelectBar();
}

function updateSelectBar(){
  const checked=document.querySelectorAll('.hist-checkbox:checked');
  const count=checked.length;
  const deleteBtn=document.getElementById('hist-delete-btn');
  const countLabel=document.getElementById('hist-select-count');
  countLabel.textContent=count>0?`${count}件選択中`:'0件選択中';
  deleteBtn.disabled=count===0;
  deleteBtn.style.opacity=count>0?'1':'0.4';
}

function deleteSelected(){
  const checked=document.querySelectorAll('.hist-checkbox:checked');
  if(!checked.length) return;
  if(!confirm(`選択した ${checked.length}件 の振り返り記録を削除しますか？`)) return;
  const ids=new Set([...checked].map(cb=>cb.dataset.id));
  db.sessions=db.sessions.filter(s=>!ids.has(s.id));
  saveData(); renderHistory(); renderGoals();
  showToast(`${ids.size}件 削除しました`);
}

// ===== DATA =====
function exportData(){
  const blob=new Blob([JSON.stringify({db,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`furikaeri_${dateStr().replace(/\//g,'-')}.json`; a.click();
  showToast('エクスポートしました');
}

function triggerImport(){
  document.getElementById('import-file-input').value='';
  document.getElementById('import-file-input').click();
}

function importData(input){
  const file=input.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=function(e){
    try {
      const parsed=JSON.parse(e.target.result);
      // バックアップファイルの形式チェック
      if(!parsed.db || !Array.isArray(parsed.db.goals) || !Array.isArray(parsed.db.sessions)){
        showToast('ファイルの形式が正しくありません'); return;
      }
      // インポート方法の選択ダイアログ
      showImportModal(parsed.db);
    } catch(err){
      showToast('JSONファイルの読み込みに失敗しました');
    }
  };
  reader.readAsText(file);
}

function showImportModal(importedDb){
  const existing=document.getElementById('import-modal-overlay');
  if(existing) existing.remove();

  const goalCount   = importedDb.goals.length;
  const sessionCount= importedDb.sessions.length;

  const overlay=document.createElement('div');
  overlay.id='import-modal-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML=`
    <div style="background:var(--card);border-radius:var(--r);padding:24px;max-width:380px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.18);">
      <div style="font-size:22px;margin-bottom:10px;">📥</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:10px;">インポート確認</div>
      <div style="font-size:13px;color:var(--ink2);line-height:1.8;margin-bottom:6px;">
        読み込んだファイルの内容：
      </div>
      <div style="background:var(--surface);border-radius:var(--r-sm);padding:10px 14px;margin-bottom:16px;font-size:13px;line-height:1.9;">
        🎯 目標：<strong>${goalCount}件</strong><br>
        📋 振り返り記録：<strong>${sessionCount}件</strong>
      </div>
      <div style="font-size:13px;color:var(--ink2);line-height:1.8;margin-bottom:18px;">
        インポート方法を選んでください：
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
        <button class="btn btn-primary" style="justify-content:flex-start;gap:10px;"
          onclick="executeImport('merge')">
          <span>🔀</span>
          <div style="text-align:left;">
            <div style="font-weight:700;">マージ（追加）</div>
            <div style="font-size:11px;font-weight:400;opacity:.85;">現在のデータを残しつつ、新しいデータを追加</div>
          </div>
        </button>
        <button class="btn btn-danger" style="justify-content:flex-start;gap:10px;"
          onclick="executeImport('replace')">
          <span>♻️</span>
          <div style="text-align:left;">
            <div style="font-weight:700;">置き換え</div>
            <div style="font-size:11px;font-weight:400;opacity:.85;">現在のデータを全て削除してインポートで上書き</div>
          </div>
        </button>
      </div>
      <button class="btn btn-ghost btn-full" onclick="closeImportModal()">キャンセル</button>
    </div>`;

  // importedDbをモーダルに紐付け
  overlay._importedDb=importedDb;
  document.body.appendChild(overlay);
}

function executeImport(mode){
  const overlay=document.getElementById('import-modal-overlay');
  if(!overlay) return;
  const importedDb=overlay._importedDb;

  if(mode==='replace'){
    if(!confirm('現在の全データを削除してインポートします。この操作は取り消せません。続けますか？')) return;
    db.goals    = importedDb.goals;
    db.sessions = importedDb.sessions;
  } else {
    // マージ：IDが重複しないものだけ追加
    const existingGoalIds   =new Set(db.goals.map(g=>g.id));
    const existingSessionIds=new Set(db.sessions.map(s=>s.id));
    const newGoals   =importedDb.goals.filter(g=>!existingGoalIds.has(g.id));
    const newSessions=importedDb.sessions.filter(s=>!existingSessionIds.has(s.id));
    db.goals    =[...db.goals,   ...newGoals];
    db.sessions =[...db.sessions,...newSessions];
    const msg=`目標 ${newGoals.length}件・記録 ${newSessions.length}件 を追加しました`;
    closeImportModal();
    saveData(); renderGoals(); renderQAStart(); renderHistory();
    showToast(msg);
    return;
  }

  closeImportModal();
  saveData(); renderGoals(); renderQAStart(); renderHistory();
  showToast('インポートが完了しました');
}

function closeImportModal(){
  const el=document.getElementById('import-modal-overlay');
  if(el) el.remove();
}

function resetAll(){
  if(!confirm('全データを削除します。この操作は取り消せません。')) return;
  localStorage.removeItem('furi_db');
  location.reload();
}

// ===== TOAST =====
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2800);
}
