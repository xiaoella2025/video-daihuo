/* video-daihuo V1 workbench - local-only logic.
 * No network calls. All state in localStorage. */

// ---------- Constants ----------
const STORAGE_KEY = "video-daihuo:v1:task";
const STEP_LABELS = [
  "视频导入", "逐字稿", "文案处理", "书籍信息", "TTS 配音",
  "画面与图片", "字幕", "视频合成", "导出", "日志"
];

const CLEAN_PROMPT = `你是一名视频号图书带货短视频文案的逐字稿清洗助手。

请处理下面这段从语音识别（ASR）得到的原始逐字稿，输出一份「清洗后正文」：

要求：
1. 修复 ASR 错字、同音字误写。
2. 删除水印口播、口号、原作者引导关注 / 点赞 / 评论 / 私信 / 加微信。
3. 修正书名号《》、人名、健康相关专有名词。
4. 阿拉伯数字尽量转中文（如「3 万」→「三万」；保留必要单位）。
5. 补全标点（中文标点）。
6. 去掉重复段落和废话填充词（这个、那个、嗯、啊）。
7. 不改变事实，不增加未在原文中出现的事实陈述。
8. 不要改变核心爆点和情绪节奏。

只输出清洗后的正文，不要任何解释。

原始逐字稿：
---
{TRANSCRIPT}
---`;

const REWRITE_PROMPT = `你是一名视频号图书带货短视频脚本改写。

请基于下面的「清洗后正文」改写出一个适合视频号口播的最终稿：

要求：
1. 保留原文的爆点（开头钩子、关键数据、反差点、悬念）。
2. 保留事实（书名、作者、数据）。
3. 改写为视频号口播节奏：短句、口语化、有节奏感、便于配音。
4. 不要照搬原稿一字不改，避免与原视频内容重合度过高。
5. 字数与原文接近（±10%）。
6. 不使用「关注 / 点赞 / 评论 / 私信」等违规引流话术。
7. 健康类内容不做绝对化承诺，建议遵医嘱。

只输出改写后的最终口播稿正文。

清洗后正文：
---
{CLEANED}
---`;

const DEDUP_PROMPT = `你是视频号矩阵复发文案的轻量去重助手。

请基于下面的「最终口播稿」做一次轻量去重改写，用于矩阵账号复发：

要求：
1. 微调连接词、语气词。
2. 调整少量句序，但保持整体节奏。
3. 不改变任何事实（书名、作者、数据、观点）。
4. 不破坏爆点和钩子。
5. 字数变化保持在 ±5% 以内。
6. 不引入新的健康承诺、新的数据。

只输出去重后的正文。

最终口播稿：
---
{FINAL}
---`;

const BOOK_PROMPT = `你是图书带货视频的书名识别助手。

请基于下面这段视频逐字稿，识别其中推荐的图书信息：

要求输出 JSON：
{
  "title": "书名",
  "author": "作者",
  "nationality": "作者国籍或身份（如：美国 / 营养学博士）",
  "confidence": 0-100,
  "evidence": "你判断的依据句子"
}

若无法判断，请把 confidence 设为 0，并在 evidence 里说明原因。
最终由人工确认书名 / 作者。

逐字稿：
---
{TEXT}
---`;

const SCENE_PROMPT_TEMPLATE = `视频号竖版图书带货短视频画面，9:16 比例，写实风格，光线柔和。
画面内容：根据下面这句口播构图，主体清晰，避免文字、避免人物正脸特写、避免违规元素。
口播文案：「{LINE}」
风格：温暖、有生活气息、构图干净、适合做字幕底图。`;

const GRID_PROMPT = `请帮我生成 9 张竖版（9:16）写实风格图片，作为图书带货视频的画面素材。
要求：
1. 9 张图主题统一（围绕一本书的内容场景）。
2. 画面温暖、生活化、构图干净，避免文字水印。
3. 每张图都可以单独作为一句口播配图。
4. 输出为九宫格大图，方便切分。

主题：{TOPIC}`;

// ---------- Default empty task ----------
function emptyTask() {
  return {
    id: "",
    name: "",
    createdAt: null,
    metadata: {
      sourceTitle: "",
      sourceFrom: "local-upload",
      keywords: ""
    },
    sourceVideo: { name: "", size: 0, type: "", uploaded: false },
    transcripts: { raw: "", cleaned: "" },
    bookInfo: { title: "", author: "", nationality: "", confidence: 0, confirmed: false },
    scripts: { rewriteVersion: "rewritten_script_v1", rewritten: "", dedup: "" },
    tts: {
      finalScript: "",
      voice: "warm-female-zh",
      rate: "1.0",
      numZh: "true",
      dict: "",
      pause: { comma: 180, period: 320, qe: 380, ellipsis: 500 },
      audioFile: { name: "", size: 0 },
      configJson: ""
    },
    images: { sentences: [] }, // {idx, line, prompt, imageName, status, note}
    subtitles: {
      avgSec: 2.5, maxChars: 16, twoLine: false,
      style: { size: 48, font: "思源黑体 CN Bold", color: "#FFFFFF", stroke: "#000000 4px", shadow: "2px 2px 4px rgba(0,0,0,0.6)", pos: "bottom" },
      lines: [] // {idx, start, end, text, manualBreak}
    },
    render: {
      ratio: "9:16", burn: true, fps: 30, res: "1080x1920",
      bgm: "", cover: "",
      healthClaim: "本视频涉及健康内容，仅供参考，请遵医嘱。",
      videoClaim: "内容基于公开出版物整理，版权归原作者所有。",
      configJson: ""
    },
    exports: { taskJsonAt: null, srtAt: null, fullJsonAt: null },
    futureMatrix: {
      accountId: "", platform: "weixin-channels", publishAt: "",
      plays: 0, likes: 0, comments: 0, productClicks: 0, orders: 0, commission: 0,
      isHit: false, isRepost: false
    },
    workflow: { status: "initialized", currentStep: 1, totalCost: 0, elapsedSeconds: 0 }
  };
}

let task = emptyTask();
let activeStep = 1;

// ---------- Utility ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => t.classList.remove("show"), 1600);
}

function copy(text) {
  navigator.clipboard.writeText(text).then(
    () => toast("已复制到剪贴板"),
    () => toast("复制失败，请手动选中复制")
  );
}

function fmtSize(n) {
  if (!n) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

function fmtTime(seconds) {
  if (!seconds || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtSRTTime(seconds) {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")},${String(ms).padStart(3,"0")}`;
}

function parseSRTTime(str) {
  const m = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(str.trim());
  if (!m) return 0;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
}

function newTaskId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  // sequence counter from localStorage to avoid collision in one day
  const seqKey = `video-daihuo:seq:${y}${m}${day}`;
  const seq = (parseInt(localStorage.getItem(seqKey) || "0", 10) + 1);
  localStorage.setItem(seqKey, String(seq));
  return `book_${y}${m}${day}_${String(seq).padStart(3, "0")}`;
}

// Split Chinese script into sentences by punctuation
function splitSentences(text) {
  if (!text) return [];
  // split on 。！？!? then keep non-empty
  const parts = text
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？!?])\s*/)
    .map(s => s.trim())
    .filter(Boolean);
  return parts;
}

// ---------- Persistence ----------
function saveLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(task));
  } catch (e) {
    console.warn("localStorage save failed", e);
  }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // shallow merge to fill any new fields
    return Object.assign(emptyTask(), parsed);
  } catch (e) {
    return null;
  }
}

// ---------- Render: step nav + progress ----------
function renderStepNav() {
  $$("#step-nav .step").forEach(el => {
    const s = +el.dataset.step;
    el.classList.toggle("active", s === activeStep);
    el.classList.toggle("done", s < activeStep);
  });
  // progress bar
  const pb = $("#progress-bar");
  pb.innerHTML = "";
  for (let i = 1; i <= 10; i++) {
    const el = document.createElement("div");
    el.className = "pstep";
    if (i === activeStep) el.classList.add("active");
    if (i < activeStep) el.classList.add("done");
    el.innerHTML = `<div class="pnum">${String(i).padStart(2,"0")}</div><div>${STEP_LABELS[i-1]}</div>`;
    el.addEventListener("click", () => setActiveStep(i));
    pb.appendChild(el);
  }
}

function showModule(step) {
  $$(".module").forEach(m => m.classList.toggle("show", +m.dataset.module === step));
}

function setActiveStep(step) {
  activeStep = step;
  task.workflow.currentStep = step;
  renderStepNav();
  showModule(step);
  $("#sum-step").textContent = `${String(step).padStart(2,"0")} ${STEP_LABELS[step-1]}`;
  saveLocal();
}

// ---------- Render: top + summary ----------
function renderHeader() {
  $("#task-title").textContent = task.id ? (task.name || task.id) : "未创建任务";
  $("#task-id-display").textContent = task.id || "—";
  $("#task-status-pill").textContent = statusLabel(task.workflow.status);
  $("#task-elapsed").textContent = task.workflow.elapsedSeconds ? `${task.workflow.elapsedSeconds}s` : "—";
  $("#task-cost").textContent = `¥${(task.workflow.totalCost || 0).toFixed(2)}`;
}

function statusLabel(s) {
  return {
    initialized: "初始化",
    "in-progress": "进行中",
    "await-confirm": "待人工确认",
    ready: "可合成",
    exported: "已导出"
  }[s] || s;
}

function renderSummary() {
  $("#sum-id").textContent = task.id || "—";
  $("#sum-status").textContent = statusLabel(task.workflow.status);
  $("#sum-step").textContent = `${String(activeStep).padStart(2,"0")} ${STEP_LABELS[activeStep-1]}`;
  $("#sum-video").textContent = task.sourceVideo.uploaded ? task.sourceVideo.name : "未上传";
  $("#sum-transcript").textContent = (task.transcripts.raw || "").length;
  $("#sum-final").textContent = (task.tts.finalScript || "").length;
  $("#sum-scenes").textContent = task.images.sentences.length;
  $("#sum-images").textContent = task.images.sentences.filter(s => s.imageName).length;
  $("#sum-subs").textContent = task.subtitles.lines.length;
  $("#sum-book").textContent = task.bookInfo.title || "—";
}

function renderAll() {
  renderHeader();
  renderStepNav();
  renderSummary();
  renderForm();
  renderSceneGrid();
  renderSubtitleTable();
  updateAllStatusPills();
  showModule(activeStep);
}

// ---------- Status pills ----------
function setPill(el, text, kind) {
  el.textContent = text;
  el.className = "pill " + (kind || "todo");
}
function updateAllStatusPills() {
  setPill($("#video-status"), task.sourceVideo.uploaded ? "已上传" : "未上传", task.sourceVideo.uploaded ? "done" : "todo");
  setPill($("#transcript-status"), task.transcripts.raw ? "已提取" : "未提取", task.transcripts.raw ? "done" : "todo");
  const scriptDone = task.transcripts.cleaned && task.scripts.rewritten;
  setPill($("#script-status"), scriptDone ? "已改写" : (task.transcripts.cleaned ? "已清洗" : "未处理"), scriptDone ? "done" : (task.transcripts.cleaned ? "warn" : "todo"));
  setPill($("#book-status"), task.bookInfo.confirmed ? "已确认" : (task.bookInfo.title ? "待确认" : "未确认"), task.bookInfo.confirmed ? "done" : (task.bookInfo.title ? "warn" : "todo"));
  setPill($("#tts-status"), task.tts.audioFile.name ? "已生成" : (task.tts.finalScript ? "待生成" : "未生成"), task.tts.audioFile.name ? "done" : (task.tts.finalScript ? "warn" : "todo"));
  const scenes = task.images.sentences;
  const uploaded = scenes.filter(s => s.imageName).length;
  setPill($("#image-status"), scenes.length ? `${uploaded}/${scenes.length} 已上传` : "未切分", scenes.length && uploaded === scenes.length ? "done" : (scenes.length ? "warn" : "todo"));
  setPill($("#subtitle-status"), task.subtitles.lines.length ? `${task.subtitles.lines.length} 行` : "未生成", task.subtitles.lines.length ? "done" : "todo");
  setPill($("#render-status"), task.render.configJson ? "已生成方案" : "未配置", task.render.configJson ? "done" : "todo");
  setPill($("#export-status"), task.exports.taskJsonAt ? "已导出" : "未导出", task.exports.taskJsonAt ? "done" : "todo");
}

// ---------- Render forms (push state to inputs) ----------
function renderForm() {
  $("#task-name").value = task.name || "";
  $("#src-title").value = task.metadata.sourceTitle || "";
  $("#src-source").value = task.metadata.sourceFrom || "local-upload";
  $("#task-keywords").value = task.metadata.keywords || "";
  $("#raw-transcript").value = task.transcripts.raw || "";
  $("#cleaned-script").value = task.transcripts.cleaned || "";
  $("#rewrite-version").value = task.scripts.rewriteVersion || "rewritten_script_v1";
  $("#rewritten-script").value = task.scripts.rewritten || "";
  $("#dedup-script").value = task.scripts.dedup || "";
  $("#book-title").value = task.bookInfo.title || "";
  $("#book-author").value = task.bookInfo.author || "";
  $("#book-nationality").value = task.bookInfo.nationality || "";
  $("#book-confidence").value = task.bookInfo.confidence || "";
  $("#book-confirmed").checked = !!task.bookInfo.confirmed;
  $("#tts-final-script").value = task.tts.finalScript || "";
  $("#tts-voice").value = task.tts.voice;
  $("#tts-rate").value = task.tts.rate;
  $("#tts-num-zh").value = task.tts.numZh;
  $("#tts-dict").value = task.tts.dict || "";
  $("#pause-comma").value = task.tts.pause.comma;
  $("#pause-period").value = task.tts.pause.period;
  $("#pause-qe").value = task.tts.pause.qe;
  $("#pause-ellipsis").value = task.tts.pause.ellipsis;
  $("#sub-avg-sec").value = task.subtitles.avgSec;
  $("#sub-max-chars").value = task.subtitles.maxChars;
  $("#sub-twoline").value = String(!!task.subtitles.twoLine);
  $("#style-size").value = task.subtitles.style.size;
  $("#style-font").value = task.subtitles.style.font;
  $("#style-color").value = task.subtitles.style.color;
  $("#style-stroke").value = task.subtitles.style.stroke;
  $("#style-shadow").value = task.subtitles.style.shadow;
  $("#style-pos").value = task.subtitles.style.pos;
  $("#render-ratio").value = task.render.ratio;
  $("#render-burn").value = String(task.render.burn);
  $("#render-fps").value = task.render.fps;
  $("#render-res").value = task.render.res;
  $("#health-claim").value = task.render.healthClaim;
  $("#video-claim").value = task.render.videoClaim;
  updateFinalScriptStats();
  updateSceneCounters();
}

// ---------- Scene grid ----------
function renderSceneGrid() {
  const grid = $("#scene-grid");
  grid.innerHTML = "";
  task.images.sentences.forEach((s, i) => {
    const card = document.createElement("div");
    card.className = "scene-card";
    card.innerHTML = `
      <div class="seq">句子 #${String(s.idx).padStart(2,"0")} · <span class="pill ${s.imageName ? 'done' : 'todo'}">${s.imageName ? '已上传' : (s.prompt ? '已生成提示词' : '未生成')}</span></div>
      <div class="line">${escapeHtml(s.line)}</div>
      <div class="img-slot" id="img-slot-${i}">${s.imageName ? `<small>${escapeHtml(s.imageName)}</small>` : "<small>未上传</small>"}</div>
      <div class="prompt">${escapeHtml(s.prompt || "（未生成提示词）")}</div>
      <div class="row">
        <button class="btn small" data-act="copy" data-idx="${i}">复制提示词</button>
        <label class="btn small ghost" for="scene-upload-${i}">上传图片</label>
        <input type="file" id="scene-upload-${i}" accept="image/*" hidden data-idx="${i}" class="scene-upload">
        <button class="btn small ghost" data-act="confirm" data-idx="${i}">${s.status === 'confirmed' ? '已确认' : '标记可用'}</button>
        <button class="btn small ghost" data-act="replace" data-idx="${i}">需替换</button>
      </div>
      <input type="text" class="note" placeholder="备注..." data-idx="${i}" data-act="note" value="${escapeHtml(s.note || "")}">
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll("button[data-act]").forEach(b => {
    b.addEventListener("click", () => {
      const i = +b.dataset.idx;
      const act = b.dataset.act;
      const s = task.images.sentences[i];
      if (act === "copy") {
        const p = s.prompt || SCENE_PROMPT_TEMPLATE.replace("{LINE}", s.line);
        copy(p);
        s.status = s.imageName ? s.status : "prompt-copied";
        saveLocal(); renderSceneGrid(); updateAllStatusPills();
      } else if (act === "confirm") {
        s.status = "confirmed";
        saveLocal(); renderSceneGrid(); updateAllStatusPills();
      } else if (act === "replace") {
        s.status = "need-replace";
        saveLocal(); renderSceneGrid(); updateAllStatusPills();
      }
    });
  });
  grid.querySelectorAll("input.scene-upload").forEach(inp => {
    inp.addEventListener("change", (e) => {
      const i = +e.target.dataset.idx;
      const file = e.target.files[0];
      if (!file) return;
      task.images.sentences[i].imageName = file.name;
      task.images.sentences[i].status = "uploaded";
      // preview
      const slot = document.getElementById(`img-slot-${i}`);
      const url = URL.createObjectURL(file);
      slot.innerHTML = `<img src="${url}" alt="">`;
      saveLocal(); updateSceneCounters(); updateAllStatusPills(); renderSummary();
    });
  });
  grid.querySelectorAll("input.note").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const i = +e.target.dataset.idx;
      task.images.sentences[i].note = e.target.value;
      saveLocal();
    });
  });
  updateSceneCounters();
}

function updateSceneCounters() {
  const s = task.images.sentences;
  $("#scene-total").textContent = s.length;
  $("#scene-uploaded").textContent = s.filter(x => x.imageName).length;
  $("#scene-confirmed").textContent = s.filter(x => x.status === "confirmed").length;
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

// ---------- Subtitle table ----------
function renderSubtitleTable() {
  const tbody = $("#sub-tbody");
  tbody.innerHTML = "";
  task.subtitles.lines.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="time"><input type="text" data-i="${i}" data-k="start" value="${fmtSRTTime(row.start)}"></td>
      <td class="time"><input type="text" data-i="${i}" data-k="end" value="${fmtSRTTime(row.end)}"></td>
      <td><input type="text" data-i="${i}" data-k="text" value="${escapeHtml(row.text)}"></td>
      <td><label><input type="checkbox" data-i="${i}" data-k="manualBreak" ${row.manualBreak ? "checked" : ""}> 已换行</label></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("input", (e) => {
      const i = +e.target.dataset.i;
      const k = e.target.dataset.k;
      const row = task.subtitles.lines[i];
      if (k === "manualBreak") row.manualBreak = e.target.checked;
      else if (k === "text") row.text = e.target.value;
      else if (k === "start") row.start = parseSRTTime(e.target.value);
      else if (k === "end") row.end = parseSRTTime(e.target.value);
      saveLocal();
    });
  });
}

// ---------- Final script stats ----------
function updateFinalScriptStats() {
  const txt = $("#tts-final-script").value;
  task.tts.finalScript = txt;
  $("#tts-char-count").textContent = txt.length;
  // 4 chars/sec rough
  $("#tts-duration-estimate").textContent = fmtTime(txt.length / 4);
}

// ---------- Build prompts ----------
function buildCleanPrompt() { return CLEAN_PROMPT.replace("{TRANSCRIPT}", task.transcripts.raw || "（请先填写原始逐字稿）"); }
function buildRewritePrompt() { return REWRITE_PROMPT.replace("{CLEANED}", task.transcripts.cleaned || "（请先填写清洗稿）"); }
function buildDedupPrompt() { return DEDUP_PROMPT.replace("{FINAL}", task.tts.finalScript || task.scripts.rewritten || "（请先填写最终口播稿）"); }
function buildBookPrompt() { return BOOK_PROMPT.replace("{TEXT}", task.transcripts.cleaned || task.transcripts.raw || "（请先填写逐字稿）"); }

function bindPromptToggle(btnId, boxId, builder) {
  $(btnId).addEventListener("click", () => {
    const box = $(boxId);
    box.textContent = builder();
    box.hidden = !box.hidden;
  });
}

// ---------- Downloads ----------
function download(filename, content, mime = "application/octet-stream") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

function buildSRT() {
  return task.subtitles.lines.map((row, i) => {
    const text = row.manualBreak ? row.text : row.text;
    return `${i + 1}\n${fmtSRTTime(row.start)} --> ${fmtSRTTime(row.end)}\n${text}\n`;
  }).join("\n");
}

function buildTaskExport() {
  const taskId = task.id || "{taskId}";
  return {
    taskId,
    name: task.name,
    workflow: task.workflow,
    paths: {
      source: `tasks/${taskId}/source/original_video.mp4`,
      audio: `tasks/${taskId}/audio/final_voice.wav`,
      images: `tasks/${taskId}/images/`,
      subtitlesSrt: `tasks/${taskId}/subtitles/subtitles.srt`,
      output: `tasks/${taskId}/output/final_video.mp4`,
      cover: `tasks/${taskId}/output/cover.png`
    },
    book: task.bookInfo,
    render: {
      ratio: task.render.ratio,
      burn: task.render.burn,
      fps: task.render.fps,
      resolution: task.render.res,
      bgm: task.render.bgm,
      cover: task.render.cover,
      healthClaim: task.render.healthClaim,
      videoClaim: task.render.videoClaim
    },
    tts: {
      voice: task.tts.voice,
      rate: task.tts.rate,
      numZh: task.tts.numZh === "true" || task.tts.numZh === true,
      pause: task.tts.pause,
      dict: task.tts.dict,
      finalScript: task.tts.finalScript
    },
    scenes: task.images.sentences.map(s => ({
      idx: s.idx, line: s.line, prompt: s.prompt,
      imageRelPath: s.imageName ? `images/${String(s.idx).padStart(3,"0")}.png` : "",
      status: s.status, note: s.note
    })),
    subtitles: {
      style: task.subtitles.style,
      lines: task.subtitles.lines
    }
  };
}

// ---------- Wire up events ----------
function wire() {
  // Step nav
  $$("#step-nav .step").forEach(el => el.addEventListener("click", () => setActiveStep(+el.dataset.step)));
  $("#back-to-list").addEventListener("click", () => toast("V1 暂不实现多任务列表，矩阵版本将提供。"));

  // Top buttons
  $("#btn-create-task").addEventListener("click", () => {
    if (task.id && !confirm("当前已有任务，重新创建会覆盖现有数据。确定继续吗？")) return;
    task = emptyTask();
    task.id = newTaskId();
    task.createdAt = new Date().toISOString();
    task.name = `图书带货任务 ${task.id}`;
    task.workflow.status = "in-progress";
    saveLocal();
    renderAll();
    toast(`已创建任务 ${task.id}`);
  });
  $("#btn-save-task").addEventListener("click", () => {
    collectAll();
    saveLocal();
    toast("已保存到浏览器 localStorage");
  });
  $("#btn-reset-task").addEventListener("click", () => {
    if (!confirm("确定清空当前任务？此操作不可撤销（仅清浏览器本地数据）。")) return;
    task = emptyTask();
    localStorage.removeItem(STORAGE_KEY);
    renderAll();
    toast("已清空当前任务");
  });

  // Module 1
  $("#task-name").addEventListener("input", e => { task.name = e.target.value; renderHeader(); saveLocal(); });
  $("#src-title").addEventListener("input", e => { task.metadata.sourceTitle = e.target.value; saveLocal(); });
  $("#src-source").addEventListener("change", e => { task.metadata.sourceFrom = e.target.value; saveLocal(); });
  $("#task-keywords").addEventListener("input", e => { task.metadata.keywords = e.target.value; saveLocal(); });

  $("#video-file-input").addEventListener("change", handleVideoFile);
  $("#btn-replace-video").addEventListener("click", () => $("#video-file-input").click());
  $("#btn-clear-video").addEventListener("click", () => {
    task.sourceVideo = { name: "", size: 0, type: "", uploaded: false };
    const v = $("#video-preview"); v.src = ""; v.hidden = true;
    $("#video-name").textContent = "—"; $("#video-size").textContent = "—"; $("#video-type").textContent = "—";
    saveLocal(); updateAllStatusPills(); renderSummary();
  });

  // Module 2
  $("#btn-mock-transcript").addEventListener("click", () => {
    const sample = "大家好。今天给大家分享一本健康类的好书。这本书的作者花了三十年时间研究人体慢性炎症。书里提到，超过百分之七十的慢性病都和炎症有关。如果你也经常觉得疲惫、肩颈僵硬、皮肤反复出问题，可以认真看完这条视频。这本书叫《抗炎饮食》，作者是美国营养学博士安博士。";
    $("#raw-transcript").value = sample;
    task.transcripts.raw = sample;
    saveLocal(); updateAllStatusPills(); renderSummary();
    toast("已填充示例逐字稿");
  });
  $("#btn-paste-hint").addEventListener("click", () => toast("把外部 ASR 工具的结果直接粘到下方文本框即可"));
  $("#btn-save-transcript").addEventListener("click", () => {
    task.transcripts.raw = $("#raw-transcript").value;
    saveLocal(); updateAllStatusPills(); renderSummary();
    toast("已保存原始逐字稿");
  });
  $("#raw-transcript").addEventListener("input", e => { task.transcripts.raw = e.target.value; renderSummary(); });

  // Module 3 - prompts
  $("#btn-copy-clean-prompt").addEventListener("click", () => copy(buildCleanPrompt()));
  bindPromptToggle("#btn-toggle-clean-prompt", "#clean-prompt-box", buildCleanPrompt);
  $("#btn-save-cleaned").addEventListener("click", () => {
    task.transcripts.cleaned = $("#cleaned-script").value;
    saveLocal(); updateAllStatusPills();
    toast("已保存清洗稿");
  });
  $("#cleaned-script").addEventListener("input", e => { task.transcripts.cleaned = e.target.value; });

  $("#btn-copy-rewrite-prompt").addEventListener("click", () => copy(buildRewritePrompt()));
  bindPromptToggle("#btn-toggle-rewrite-prompt", "#rewrite-prompt-box", buildRewritePrompt);
  $("#btn-save-rewrite").addEventListener("click", () => {
    task.scripts.rewriteVersion = $("#rewrite-version").value || "rewritten_script_v1";
    task.scripts.rewritten = $("#rewritten-script").value;
    saveLocal(); updateAllStatusPills();
    toast(`已保存改写稿（${task.scripts.rewriteVersion}）`);
  });
  $("#rewritten-script").addEventListener("input", e => { task.scripts.rewritten = e.target.value; });

  $("#btn-copy-dedup-prompt").addEventListener("click", () => copy(buildDedupPrompt()));
  bindPromptToggle("#btn-toggle-dedup-prompt", "#dedup-prompt-box", buildDedupPrompt);
  $("#btn-save-dedup").addEventListener("click", () => {
    task.scripts.dedup = $("#dedup-script").value;
    saveLocal(); updateAllStatusPills();
    toast("已保存去重稿");
  });
  $("#dedup-script").addEventListener("input", e => { task.scripts.dedup = e.target.value; });

  // Module 4 book
  $("#btn-copy-book-prompt").addEventListener("click", () => copy(buildBookPrompt()));
  bindPromptToggle("#btn-toggle-book-prompt", "#book-prompt-box", buildBookPrompt);
  $("#btn-save-book").addEventListener("click", () => {
    task.bookInfo.title = $("#book-title").value;
    task.bookInfo.author = $("#book-author").value;
    task.bookInfo.nationality = $("#book-nationality").value;
    task.bookInfo.confidence = +$("#book-confidence").value || 0;
    task.bookInfo.confirmed = $("#book-confirmed").checked;
    saveLocal(); updateAllStatusPills(); renderHeader(); renderSummary();
    toast("已保存书籍信息");
  });
  ["#book-title", "#book-author", "#book-nationality", "#book-confidence", "#book-confirmed"].forEach(id => {
    $(id).addEventListener("input", () => {
      task.bookInfo.title = $("#book-title").value;
      task.bookInfo.author = $("#book-author").value;
      task.bookInfo.nationality = $("#book-nationality").value;
      task.bookInfo.confidence = +$("#book-confidence").value || 0;
      task.bookInfo.confirmed = $("#book-confirmed").checked;
      renderSummary();
    });
  });

  // Module 5 TTS
  $("#tts-final-script").addEventListener("input", () => { updateFinalScriptStats(); renderSummary(); saveLocal(); });
  $("#btn-load-final-from-rewrite").addEventListener("click", () => {
    if (!task.scripts.rewritten) return toast("还没有改写稿");
    $("#tts-final-script").value = task.scripts.rewritten;
    updateFinalScriptStats(); renderSummary(); saveLocal();
    toast("已载入改写稿");
  });
  $("#btn-load-final-from-dedup").addEventListener("click", () => {
    if (!task.scripts.dedup) return toast("还没有去重稿");
    $("#tts-final-script").value = task.scripts.dedup;
    updateFinalScriptStats(); renderSummary(); saveLocal();
    toast("已载入去重稿");
  });
  ["#tts-voice","#tts-rate","#tts-num-zh","#tts-dict","#pause-comma","#pause-period","#pause-qe","#pause-ellipsis"].forEach(id => {
    $(id).addEventListener("input", () => collectTTS());
  });
  $("#audio-file-input").addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    task.tts.audioFile = { name: f.name, size: f.size };
    const a = $("#audio-preview");
    a.src = URL.createObjectURL(f); a.hidden = false;
    saveLocal(); updateAllStatusPills();
    toast("已上传音频，可试听");
  });
  $("#btn-gen-tts-json").addEventListener("click", () => {
    collectTTS();
    const cfg = {
      voice: task.tts.voice, rate: +task.tts.rate, numZh: task.tts.numZh === "true",
      pause: task.tts.pause,
      dict: parseDict(task.tts.dict),
      finalScript: task.tts.finalScript,
      output: `tasks/${task.id || "{taskId}"}/audio/final_voice.wav`
    };
    const str = JSON.stringify(cfg, null, 2);
    task.tts.configJson = str;
    const box = $("#tts-json-box"); box.textContent = str; box.hidden = false;
    saveLocal();
    toast("已生成 TTS 配置 JSON");
  });

  // Module 6
  $("#btn-split-lines").addEventListener("click", () => {
    collectTTS();
    const text = task.tts.finalScript || task.scripts.rewritten || task.transcripts.cleaned;
    if (!text) return toast("请先填写最终口播稿 / 改写稿 / 清洗稿");
    const lines = splitSentences(text);
    task.images.sentences = lines.map((line, i) => {
      const old = task.images.sentences[i];
      return {
        idx: i + 1, line,
        prompt: old?.prompt || "",
        imageName: old?.imageName || "",
        status: old?.status || "pending",
        note: old?.note || ""
      };
    });
    saveLocal(); renderSceneGrid(); updateAllStatusPills(); renderSummary();
    toast(`已切分 ${lines.length} 句`);
  });
  $("#btn-gen-all-prompts").addEventListener("click", () => {
    if (!task.images.sentences.length) return toast("请先切分文案");
    task.images.sentences.forEach(s => {
      s.prompt = SCENE_PROMPT_TEMPLATE.replace("{LINE}", s.line);
    });
    saveLocal(); renderSceneGrid();
    toast("已为所有句子生成提示词");
  });
  $("#btn-copy-grid-prompt").addEventListener("click", () => {
    const topic = task.bookInfo.title ? `《${task.bookInfo.title}》` : "图书内容";
    copy(GRID_PROMPT.replace("{TOPIC}", topic));
  });
  $("#batch-image-input").addEventListener("change", e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (!task.images.sentences.length) return toast("请先切分文案");
    files.forEach((f, i) => {
      if (i >= task.images.sentences.length) return;
      task.images.sentences[i].imageName = f.name;
      task.images.sentences[i].status = "uploaded";
    });
    saveLocal(); renderSceneGrid(); updateAllStatusPills(); renderSummary();
    toast(`已上传 ${Math.min(files.length, task.images.sentences.length)} 张图片`);
  });

  // Module 7 Subtitles
  $("#btn-gen-subtitles").addEventListener("click", () => {
    collectSubsConfig();
    const lines = task.images.sentences.length ? task.images.sentences.map(s => s.line) : splitSentences(task.tts.finalScript || "");
    if (!lines.length) return toast("请先在 06 步切分文案");
    const avg = +task.subtitles.avgSec || 2.5;
    let t = 0;
    task.subtitles.lines = lines.map((text, i) => {
      const dur = Math.max(1.2, Math.min(6, avg * Math.max(1, text.length / 12)));
      const row = { idx: i + 1, start: t, end: t + dur, text, manualBreak: false };
      t += dur;
      return row;
    });
    saveLocal(); renderSubtitleTable(); updateAllStatusPills(); renderSummary();
    toast(`已生成 ${task.subtitles.lines.length} 行字幕`);
  });
  ["#sub-avg-sec","#sub-max-chars","#sub-twoline","#style-size","#style-font","#style-color","#style-stroke","#style-shadow","#style-pos"].forEach(id => {
    $(id).addEventListener("input", () => collectSubsConfig());
  });
  $("#btn-export-srt").addEventListener("click", () => {
    if (!task.subtitles.lines.length) return toast("请先生成字幕");
    const srt = buildSRT();
    const box = $("#srt-preview"); box.textContent = srt; $("#srt-preview-card").hidden = false;
    toast("已生成 SRT 文本");
  });
  $("#btn-download-srt").addEventListener("click", () => {
    if (!task.subtitles.lines.length) return toast("请先生成字幕");
    download("subtitles.srt", buildSRT(), "text/plain;charset=utf-8");
    task.exports.srtAt = new Date().toISOString(); saveLocal();
  });

  // Module 8 Render
  ["#render-ratio","#render-burn","#render-fps","#render-res","#health-claim","#video-claim"].forEach(id => {
    $(id).addEventListener("input", () => collectRender());
  });
  $("#bgm-file").addEventListener("change", e => {
    const f = e.target.files[0]; task.render.bgm = f ? f.name : ""; saveLocal();
  });
  $("#cover-file").addEventListener("change", e => {
    const f = e.target.files[0]; task.render.cover = f ? f.name : ""; saveLocal();
  });
  $("#btn-gen-render-json").addEventListener("click", () => {
    collectRender();
    const exp = buildTaskExport();
    const str = JSON.stringify(exp, null, 2);
    task.render.configJson = str;
    const box = $("#render-json-box"); box.textContent = str; box.hidden = false;
    task.workflow.status = "ready";
    saveLocal(); updateAllStatusPills(); renderHeader();
    toast("已生成合成方案 JSON");
  });

  // Module 9 Export
  $("#final-video-input").addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    const v = $("#final-video-preview");
    v.src = URL.createObjectURL(f); v.hidden = false;
    toast("已加载成片预览（本地，不会上传）");
  });
  $("#btn-export-task-json").addEventListener("click", () => {
    const exp = buildTaskExport();
    download("task_export.json", JSON.stringify(exp, null, 2), "application/json");
    task.exports.taskJsonAt = new Date().toISOString();
    task.workflow.status = "exported";
    saveLocal(); updateAllStatusPills(); renderHeader();
  });
  $("#btn-export-srt-2").addEventListener("click", () => {
    if (!task.subtitles.lines.length) return toast("请先生成字幕");
    download("subtitles.srt", buildSRT(), "text/plain;charset=utf-8");
    task.exports.srtAt = new Date().toISOString(); saveLocal();
  });
  $("#btn-export-full").addEventListener("click", () => {
    const data = { task, exportedAt: new Date().toISOString() };
    download(`${task.id || "task"}_full.json`, JSON.stringify(data, null, 2), "application/json");
    task.exports.fullJsonAt = new Date().toISOString(); saveLocal();
  });
}

function parseDict(text) {
  return (text || "").split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const [a, b] = l.split(/=>|⇒|->/).map(x => (x || "").trim());
    return { from: a, to: b || "" };
  });
}

function collectAll() { collectTTS(); collectSubsConfig(); collectRender(); }

function collectTTS() {
  task.tts.voice = $("#tts-voice").value;
  task.tts.rate = $("#tts-rate").value;
  task.tts.numZh = $("#tts-num-zh").value;
  task.tts.dict = $("#tts-dict").value;
  task.tts.pause.comma = +$("#pause-comma").value || 0;
  task.tts.pause.period = +$("#pause-period").value || 0;
  task.tts.pause.qe = +$("#pause-qe").value || 0;
  task.tts.pause.ellipsis = +$("#pause-ellipsis").value || 0;
  task.tts.finalScript = $("#tts-final-script").value;
  saveLocal();
}

function collectSubsConfig() {
  task.subtitles.avgSec = +$("#sub-avg-sec").value || 2.5;
  task.subtitles.maxChars = +$("#sub-max-chars").value || 16;
  task.subtitles.twoLine = $("#sub-twoline").value === "true";
  task.subtitles.style.size = +$("#style-size").value || 48;
  task.subtitles.style.font = $("#style-font").value;
  task.subtitles.style.color = $("#style-color").value;
  task.subtitles.style.stroke = $("#style-stroke").value;
  task.subtitles.style.shadow = $("#style-shadow").value;
  task.subtitles.style.pos = $("#style-pos").value;
  saveLocal();
}

function collectRender() {
  task.render.ratio = $("#render-ratio").value;
  task.render.burn = $("#render-burn").value === "true";
  task.render.fps = +$("#render-fps").value || 30;
  task.render.res = $("#render-res").value;
  task.render.healthClaim = $("#health-claim").value;
  task.render.videoClaim = $("#video-claim").value;
  saveLocal();
}

function handleVideoFile(e) {
  const f = e.target.files[0]; if (!f) return;
  task.sourceVideo = { name: f.name, size: f.size, type: f.type, uploaded: true };
  $("#video-name").textContent = f.name;
  $("#video-size").textContent = fmtSize(f.size);
  $("#video-type").textContent = f.type || "—";
  const v = $("#video-preview");
  v.src = URL.createObjectURL(f); v.hidden = false;
  if (!task.metadata.sourceTitle) {
    task.metadata.sourceTitle = f.name.replace(/\.[^.]+$/, "");
    $("#src-title").value = task.metadata.sourceTitle;
  }
  saveLocal(); updateAllStatusPills(); renderSummary();
  toast("已加载视频（本地）");
}

// ---------- Boot ----------
function boot() {
  const loaded = loadLocal();
  if (loaded) {
    task = loaded;
    activeStep = task.workflow.currentStep || 1;
  }
  wire();
  renderAll();
}

document.addEventListener("DOMContentLoaded", boot);
