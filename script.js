// ===== ユーティリティ =====
function $(id){ return document.getElementById(id); }
function clamp(n, min, max){ return Math.min(max, Math.max(min, n)); }

function hashName(str){
  let h = 0;
  for (let i = 0; i < str.length; i++){
    h = (h * 31 + str.charCodeAt(i)) >>> 0; // unsigned
  }
  return h;
}

function applyTemplate(text, vars){
  // {name} を置換
  return text.replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? `{${key}}`));
}

// ===== 性格タイプ =====
const PERSONAS = [
  { key: "元気",   title: "元気タイプ",   desc: "テンション高め。褒められると伸びる。さびしがり。" },
  { key: "クール", title: "クールタイプ", desc: "落ち着いてて観察派。信頼されるのが好き。" },
  { key: "ツンデレ", title: "ツンデレタイプ", desc: "素直じゃないけど本当は優しい。距離感を大事にする。" },
  { key: "まじめ", title: "まじめタイプ", desc: "約束と礼儀が最重要。努力を見てくれる人に心を開く。" },
  { key: "あまえんぼ", title: "あまえんぼタイプ", desc: "構ってもらうと強い。安心できる相手に懐く。" },
  { key: "自由人", title: "自由人タイプ", desc: "好きなことに一直線。縛られると逃げる。ノリが合うと最強。" }
];

function decidePersona(name){
  const h = hashName(name);
  return PERSONAS[h % PERSONAS.length];
}

// ===== 設定 =====
const STORAGE_KEY = "branchTalkSave_v1";
const ENDING_THRESHOLD = 7;
const AFFECTION_MIN = 0;
const AFFECTION_MAX = 10;

// JSONから読み込むシーン
let SCENES = [];

// ===== 状態 =====
const state = {
  name: "",
  persona: PERSONAS[0],
  affection: 0,
  sceneIndex: 0,
  // 履歴：二重加算防止にも使う
  history: [] // { sceneId, choiceIndex, delta }
};

// ===== 画面要素 =====
const screenLoading = $("screen-loading");
const loadingError  = $("loadingError");
const screenStart   = $("screen-start");
const screenGame    = $("screen-game");
const screenEnd     = $("screen-end");

const nameInput     = $("nameInput");
const startBtn      = $("startBtn");
const randomBtn     = $("randomBtn");
const continueBtn   = $("continueBtn");
const clearSaveBtn  = $("clearSaveBtn");

const restartBtn    = $("restartBtn");
const nextBtn       = $("nextBtn");
const againBtn      = $("againBtn");

const personaBadge  = $("personaBadge");
const personaDesc   = $("personaDesc");
const playerName    = $("playerName");

const sceneTitle    = $("sceneTitle");
const sceneText     = $("sceneText");
const choicesBox    = $("choices");

const affectionNum  = $("affectionNum");
const meterBar      = $("meterBar");
const logHint       = $("logHint");

// END
const endTitle      = $("endTitle");
const endText       = $("endText");
const endBadge      = $("endBadge");
const endName       = $("endName");
const endPersona    = $("endPersona");
const endAffection  = $("endAffection");

// ===== 画面切り替え =====
function showScreen(which){
  screenLoading.classList.add("hidden");
  screenStart.classList.add("hidden");
  screenGame.classList.add("hidden");
  screenEnd.classList.add("hidden");
  which.classList.remove("hidden");
}

// ===== セーブ/ロード =====
function saveGame(){
  const payload = {
    name: state.name,
    affection: state.affection,
    sceneIndex: state.sceneIndex,
    history: state.history
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadGame(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try{
    return JSON.parse(raw);
  }catch{
    return null;
  }
}

function clearSave(){
  localStorage.removeItem(STORAGE_KEY);
}

// ===== 表示更新 =====
function updateTop(){
  playerName.textContent = state.name;
  personaBadge.textContent = `性格：${state.persona.title}`;
  personaDesc.textContent = state.persona.desc;

  affectionNum.textContent = String(state.affection);
  const pct = (state.affection / AFFECTION_MAX) * 100;
  meterBar.style.width = `${pct}%`;
}

// ===== 性格による微調整 =====
// JSONの delta をそのまま使いつつ、特定シーンだけ性格で補正する
function personaDeltaAdjust(sceneId, choiceIndex, baseDelta){
  const p = state.persona.key;

  // s2: 元気/あまえんぼ は「行く！」が少し刺さる
  if (sceneId === "s2" && choiceIndex === 0){
    if (p === "元気" || p === "あまえんぼ") return baseDelta + 1;
  }

  // s3: クール/まじめ は「冗談」が逆効果になりやすい
  if (sceneId === "s3" && choiceIndex === 1){
    if (p === "クール" || p === "まじめ") return baseDelta - 3; // 2 → -1 くらいのイメージ
  }

  // s4: 自由人 は「毎日連絡」が束縛に感じる
  if (sceneId === "s4" && choiceIndex === 1){
    if (p === "自由人") return baseDelta - 3; // 2 → -1
  }

  return baseDelta;
}

function renderScene(){
  updateTop();

  const scene = SCENES[state.sceneIndex];
  if (!scene){
    return goEnding();
  }

  sceneTitle.textContent = scene.title;
  sceneText.textContent  = applyTemplate(scene.text, { name: state.name });

  // 選択肢の描画
  choicesBox.innerHTML = "";
  logHint.textContent = "選択肢をクリックすると好感度が反映されます。";

  scene.choices.forEach((c, idx) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = c.label;

    btn.addEventListener("click", () => {
      // 見た目（選択中）
      [...choicesBox.children].forEach(el => el.classList.remove("selected"));
      btn.classList.add("selected");

      // 反映（1回だけ）
      applyChoice(scene.id, idx, c.delta);
    });

    choicesBox.appendChild(btn);
  });
}

function applyChoice(sceneId, choiceIndex, baseDelta){
  // 二重加算防止：このシーンの履歴があるなら無視
  const already = state.history.find(h => h.sceneId === sceneId);
  if (already){
    logHint.textContent = "このシーンはもう選択済みだよ（次へ進んでね）";
    return;
  }

  const delta = personaDeltaAdjust(sceneId, choiceIndex, baseDelta);

  state.affection = clamp(state.affection + delta, AFFECTION_MIN, AFFECTION_MAX);
  state.history.push({ sceneId, choiceIndex, delta });

  updateTop();
  logHint.textContent = `好感度 ${delta >= 0 ? "+" : ""}${delta}（現在 ${state.affection}）`;

  saveGame();
}

function nextScene(){
  const scene = SCENES[state.sceneIndex];
  if (!scene) return;

  const done = state.history.find(h => h.sceneId === scene.id);
  if (!done){
    logHint.textContent = "まだ選択してないよ。どれか選んで！";
    return;
  }

  state.sceneIndex += 1;
  saveGame();
  renderScene();
}

function goEnding(){
  clearSave(); // 終了したらセーブ消す
  showScreen(screenEnd);

  const happy = state.affection >= ENDING_THRESHOLD;

  endName.textContent = state.name;
  endPersona.textContent = state.persona.title;
  endAffection.textContent = String(state.affection);

  if (happy){
    endBadge.textContent = "HAPPY";
    endTitle.textContent = "ハッピーエンド：心が通じた";
    endText.textContent =
      "言葉の選び方が噛み合い、相手はあなたを信じることを選んだ。ふたりの物語はここから進む。";
  } else {
    endBadge.textContent = "BAD";
    endTitle.textContent = "バッドエンド：すれ違い";
    endText.textContent =
      "気持ちはあったのに、伝え方が噛み合わなかった。次は相手の性格に合う選択を探してみよう。";
  }
}

// ===== 開始/リセット =====
function resetState(){
  state.name = "";
  state.persona = PERSONAS[0];
  state.affection = 0;
  state.sceneIndex = 0;
  state.history = [];
}

function startGame(name){
  const n = (name || "").trim();
  if (!n){
    alert("名前を入力してね！");
    return;
  }

  resetState();
  state.name = n;
  state.persona = decidePersona(n);

  saveGame();

  showScreen(screenGame);
  renderScene();
}

function continueGame(){
  const data = loadGame();
  if (!data) return;

  resetState();
  state.name = data.name || "";
  state.persona = decidePersona(state.name);
  state.affection = Number(data.affection ?? 0);
  state.sceneIndex = Number(data.sceneIndex ?? 0);
  state.history = Array.isArray(data.history) ? data.history : [];

  showScreen(screenGame);
  renderScene();
  updateTop();
  logHint.textContent = "セーブデータから再開しました。";
}

function updateSaveButtons(){
  const exists = !!loadGame();
  continueBtn.classList.toggle("hidden", !exists);
  clearSaveBtn.classList.toggle("hidden", !exists);
}

// ===== JSON読み込み =====
async function loadScenes(){
  const res = await fetch("scenes.json", { cache: "no-store" });
  if (!res.ok){
    throw new Error(`scenes.jsonの読み込みに失敗（HTTP ${res.status}）`);
  }
  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0){
    throw new Error("scenes.jsonの形式が不正（配列が必要）");
  }

  // 最低限のバリデーション
  for (const s of data){
    if (!s.id || !s.title || !s.text || !Array.isArray(s.choices)){
      throw new Error("scenes.jsonの各要素に id/title/text/choices が必要");
    }
  }

  SCENES = data;
}

// ===== イベント =====
startBtn.addEventListener("click", () => startGame(nameInput.value));

randomBtn.addEventListener("click", () => {
  const samples = ["ゆうた", "さくら", "れん", "みお", "ゆう", "なおと", "あおい", "ひなた"];
  nameInput.value = samples[Math.floor(Math.random() * samples.length)];
});

continueBtn.addEventListener("click", () => continueGame());

clearSaveBtn.addEventListener("click", () => {
  clearSave();
  updateSaveButtons();
  alert("セーブを削除しました");
});

restartBtn.addEventListener("click", () => {
  clearSave();
  resetState();
  showScreen(screenStart);
  updateSaveButtons();
});

nextBtn.addEventListener("click", () => nextScene());

againBtn.addEventListener("click", () => {
  clearSave();
  resetState();
  showScreen(screenStart);
  updateSaveButtons();
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") startGame(nameInput.value);
});

// ===== 起動 =====
(async function boot(){
  try{
    showScreen(screenLoading);
    await loadScenes();
    showScreen(screenStart);
    updateSaveButtons();
  }catch(err){
    showScreen(screenLoading);
    loadingError.textContent =
      "エラー：JSONが読み込めません。GitHub Pagesならファイル名が一致しているか、同じ階層に scenes.json があるか確認してね。\n" +
      String(err?.message || err);
  }
})();
