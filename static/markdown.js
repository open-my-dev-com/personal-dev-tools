// ── UTC → JST 변환 ──
function toJST(utcStr) {
  if (!utcStr) return "";
  const d = new Date(utcStr + (utcStr.includes("Z") || utcStr.includes("+") ? "" : "Z"));
  if (isNaN(d)) return utcStr;
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Markdown Editor ─────────────────────────────────────────
const mdInput = document.getElementById("mdInput");
const mdPreview = document.getElementById("mdPreview");
const mdEditorWrap = document.getElementById("mdEditorWrap");
const mdLayoutToggle = document.getElementById("mdLayoutToggle");
const mdFileInput = document.getElementById("mdFileInput");
const mdUploadZone = document.getElementById("mdUploadZone");
const mdSaveBtn = document.getElementById("mdSaveBtn");
const mdDownloadBtn = document.getElementById("mdDownloadBtn");
const mdStatus = document.getElementById("mdStatus");
const mdSavesTable = document.getElementById("mdSavesTable");

let mdCurrentSaveId = null;
let mdFilename = "document.md";
let mdLastSavedContent = ""; // dirty 체크용

function mdUpdateDirtyState() {
  const isDirty = mdCurrentSaveId && mdInput.value !== mdLastSavedContent;
  mdSaveBtn.disabled = mdCurrentSaveId ? !isDirty : !mdInput.value.trim();
  mdSaveBtn.textContent = isDirty ? t("md.save_modified") : t("md.save_unmodified");
}

function setMdStatus(text, isError = false) {
  mdStatus.textContent = text;
  mdStatus.style.color = isError ? "#bf233a" : "#65748b";
}

// ── 자동저장 ──
var mdAutoSaveToggle = document.getElementById("mdAutoSaveToggle");
var mdAutoSaveTimer = null;
var MD_AUTOSAVE_INTERVAL_KEY = "md_autosave_interval";
var MD_AUTOSAVE_ENABLED_KEY = "md_autosave_enabled";

function getMdAutoSaveInterval() {
  var val = parseInt(localStorage.getItem(MD_AUTOSAVE_INTERVAL_KEY), 10);
  return val > 0 ? val : 30; // 기본 30초
}

function setMdAutoSaveInterval(seconds) {
  localStorage.setItem(MD_AUTOSAVE_INTERVAL_KEY, String(seconds));
  if (mdAutoSaveToggle.checked) {
    startMdAutoSave();
  }
}

// 서버 모듈 설정에서 자동저장 간격 동기화
(function loadAutoSaveIntervalFromServer() {
  fetch("/api/dev/modules").then(function (r) { if (!r.ok) return {}; return r.json(); }).then(function (data) {
    if (data.ok && data.modules && data.modules.markdown) {
      var interval = parseInt(data.modules.markdown.autosave_interval, 10);
      if (interval > 0) {
        localStorage.setItem(MD_AUTOSAVE_INTERVAL_KEY, String(interval));
        if (mdAutoSaveToggle.checked) startMdAutoSave();
      }
    }
  }).catch(function () {});
})();

function startMdAutoSave() {
  stopMdAutoSave();
  var interval = getMdAutoSaveInterval() * 1000;
  mdAutoSaveTimer = setInterval(function () {
    if (!mdCurrentSaveId) return; // 저장된 문서만 자동저장
    if (mdInput.value === mdLastSavedContent) return; // 변경 없으면 스킵
    mdDoSave().then(function () {
      var now = new Date();
      var timeStr = now.getHours().toString().padStart(2, "0") + ":" +
                    now.getMinutes().toString().padStart(2, "0") + ":" +
                    now.getSeconds().toString().padStart(2, "0");
      setMdStatus(t("md.autosave_done", { time: timeStr }));
    });
  }, interval);
}

function stopMdAutoSave() {
  if (mdAutoSaveTimer) {
    clearInterval(mdAutoSaveTimer);
    mdAutoSaveTimer = null;
  }
}

mdAutoSaveToggle.checked = localStorage.getItem(MD_AUTOSAVE_ENABLED_KEY) === "true";
mdAutoSaveToggle.addEventListener("change", function () {
  localStorage.setItem(MD_AUTOSAVE_ENABLED_KEY, this.checked);
  if (this.checked) {
    startMdAutoSave();
    setMdStatus(t("md.autosave_on", { n: getMdAutoSaveInterval() }));
  } else {
    stopMdAutoSave();
    setMdStatus(t("md.autosave_off"));
  }
});
if (mdAutoSaveToggle.checked) startMdAutoSave();

// window 전역에 노출 (개발자 모드에서 간격 변경 가능)
window.setMdAutoSaveInterval = setMdAutoSaveInterval;
window.getMdAutoSaveInterval = getMdAutoSaveInterval;

// 새 문서
document.getElementById("mdNewBtn").addEventListener("click", function () {
  if (mdInput.value.trim() && !confirm(t("md.confirm_new"))) return;
  mdInput.value = "";
  mdCurrentSaveId = null;
  mdFilename = "document.md";
  mdLastSavedContent = "";
  renderPreview();
  mdUpdateDirtyState();
  if (typeof updateCharCount === "function") updateCharCount();
  proofreadItems = [];
  proofreadResultId = null;
  if (mdProofreadPanel) { mdProofreadPanel.style.display = "none"; mdProofreadPanel.hidden = true; }
  setMdStatus(t("md.new_doc"));
});

// ── marked.js 설정 ──
// mermaid 초기화
if (typeof mermaid !== "undefined") {
  mermaid.initialize({ startOnLoad: false, theme: "default" });
}

// YAML frontmatter 파싱 (---로 감싼 메타데이터)
function parseFrontmatter(src) {
  const match = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: null, body: src };
  const lines = match[1].split("\n");
  const meta = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      meta[key] = val;
    }
  }
  return { meta, body: match[2] };
}

function renderFrontmatterHtml(meta) {
  if (!meta || Object.keys(meta).length === 0) return "";
  let html = '<div class="md-frontmatter"><table>';
  for (const [k, v] of Object.entries(meta)) {
    const ek = k.replace(/</g, "&lt;");
    const ev = v.replace(/</g, "&lt;");
    html += `<tr><th>${ek}</th><td>${ev}</td></tr>`;
  }
  html += "</table></div>";
  return html;
}

let mdMermaidId = 0;
const mdRenderer = new marked.Renderer();

// heading에 slug ID 부여 (TOC 앵커 링크용)
mdRenderer.heading = function (token) {
  var text = token.text || token;
  var depth = token.depth || 1;
  var slug = text.toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w가-힣ㄱ-ㅎㅏ-ㅣ\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+$/, "");
  return '<h' + depth + ' id="' + slug + '">' + text + '</h' + depth + '>';
};

const mdOriginalCode = mdRenderer.code.bind(mdRenderer);
mdRenderer.code = function (code, lang, escaped) {
  // marked v12+ 에서는 code가 {text, lang} 객체일 수 있음
  let text = code, language = lang;
  if (typeof code === "object" && code !== null) {
    text = code.text || "";
    language = code.lang || lang;
  }
  if (language === "mermaid") {
    mdMermaidId++;
    return `<div class="mermaid" id="md-mermaid-${mdMermaidId}">${text}</div>`;
  }
  // highlight.js로 구문 강조 적용
  if (typeof hljs !== "undefined") {
    let highlighted;
    if (language && hljs.getLanguage(language)) {
      highlighted = hljs.highlight(text, { language }).value;
    } else {
      highlighted = hljs.highlightAuto(text).value;
    }
    return `<pre><code class="hljs language-${language || ""}">${highlighted}</code></pre>`;
  }
  return mdOriginalCode(code, lang, escaped);
};

marked.setOptions({
  renderer: mdRenderer,
  breaks: true,
  gfm: true,
});

// GitHub-style Alerts: > [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]
// marked.parse() 후 HTML 후처리 방식
function getAlertLabels() { return { NOTE: t("md.alert_note"), TIP: t("md.alert_tip"), IMPORTANT: t("md.alert_important"), WARNING: t("md.alert_warning"), CAUTION: t("md.alert_caution") }; }
const alertIcons = { NOTE: "ℹ️", TIP: "💡", IMPORTANT: "❗", WARNING: "⚠️", CAUTION: "🔴" };
function processAlerts(html) {
  return html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:<br\s*\/?>|\n)?\s*([\s\S]*?)<\/blockquote>/gi,
    function (match, type, rest) {
      var t = type.toUpperCase();
      var labels = getAlertLabels();
      return '<div class="md-alert md-alert-' + t.toLowerCase() + '">'
        + '<p class="md-alert-title">' + alertIcons[t] + " " + labels[t] + "</p>"
        + "<p>" + rest + "</div>";
    }
  );
}

// ── 실시간 미리보기 (debounce 300ms) ──
let mdDebounceTimer = null;
async function renderMermaidBlocks() {
  if (typeof mermaid === "undefined") return;
  const blocks = mdPreview.querySelectorAll(".mermaid");
  for (const el of blocks) {
    if (el.dataset.processed) continue;
    const code = el.textContent;
    el.dataset.processed = "true";
    try {
      const { svg } = await mermaid.render("mermaid-svg-" + Date.now() + Math.random().toString(36).slice(2), code);
      el.innerHTML = svg;
    } catch (e) {
      el.innerHTML = `<pre style="color:#bf233a;font-size:12px">${t("md.mermaid_error", { msg: e.message || e })}</pre>`;
    }
  }
  // mermaid가 에러 시 body에 직접 삽입하는 요소 제거
  document.querySelectorAll('body > [id^="dmermaid-svg-"]').forEach(el => el.remove());
}

function renderPreview() {
  clearTimeout(mdDebounceTimer);
  mdDebounceTimer = setTimeout(async () => {
    try {
      const { meta, body } = parseFrontmatter(mdInput.value);
      const fmHtml = renderFrontmatterHtml(meta);
      mdPreview.innerHTML = fmHtml + processAlerts(marked.parse(body));
      // 코드블록이 미리보기 패널을 넘지 않도록 너비 제한
      const previewPadding = parseFloat(getComputedStyle(mdPreview).paddingLeft) + parseFloat(getComputedStyle(mdPreview).paddingRight);
      const maxW = (mdPreview.clientWidth - previewPadding) + "px";
      mdPreview.querySelectorAll("pre").forEach(el => { el.style.maxWidth = maxW; });
      await renderMermaidBlocks();
    } catch (e) {
      mdPreview.innerHTML = "<p style='color:red'>" + t("md.render_error", { msg: e.message }) + "</p>";
    }
  }, 300);
}
mdInput.addEventListener("input", () => {
  renderPreview();
  mdUpdateDirtyState();
});

// ── 가로/세로 모드 전환 ──
const mdEditPane = document.getElementById("mdEditPane");
const mdResizer = document.getElementById("mdResizer");
let mdIsHorizontal = true;

function mdResetPaneSizes() {
  mdEditPane.style.flex = "1";
  mdPreview.style.flex = "1";
  mdEditPane.style.width = "";
  mdEditPane.style.height = "";
  mdPreview.style.width = "";
  mdPreview.style.height = "";
}

mdLayoutToggle.addEventListener("click", () => {
  mdIsHorizontal = !mdIsHorizontal;
  mdResetPaneSizes();
  mdSetActiveSplit("50:50");
  if (mdIsHorizontal) {
    mdEditorWrap.classList.remove("md-layout-vertical");
    mdEditorWrap.classList.add("md-layout-horizontal");
    mdLayoutToggle.textContent = t("md.horizontal");
  } else {
    mdEditorWrap.classList.remove("md-layout-horizontal");
    mdEditorWrap.classList.add("md-layout-vertical");
    mdLayoutToggle.textContent = t("md.vertical");
  }
});

// ── 비율 프리셋 버튼 ──
function mdSetActiveSplit(ratio) {
  document.querySelectorAll(".md-split-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.ratio === ratio);
  });
}

function mdApplySplit(editPct, previewPct) {
  const prop = mdIsHorizontal ? "width" : "height";
  const otherProp = mdIsHorizontal ? "height" : "width";

  if (editPct === 0) {
    mdEditPane.style.display = "none";
    mdResizer.style.display = "none";
    mdPreview.style.display = "";
    mdPreview.style.flex = "1";
    mdPreview.style[prop] = "";
    mdPreview.style[otherProp] = "";
  } else if (previewPct === 0) {
    mdPreview.style.display = "none";
    mdResizer.style.display = "none";
    mdEditPane.style.display = "";
    mdEditPane.style.flex = "1";
    mdEditPane.style[prop] = "";
    mdEditPane.style[otherProp] = "";
  } else {
    mdEditPane.style.display = "";
    mdPreview.style.display = "";
    mdResizer.style.display = "";
    mdEditPane.style.flex = "none";
    mdPreview.style.flex = "none";
    mdEditPane.style[prop] = editPct + "%";
    mdPreview.style[prop] = previewPct + "%";
    mdEditPane.style[otherProp] = "";
    mdPreview.style[otherProp] = "";
  }
}

document.querySelectorAll(".md-split-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const [e, p] = btn.dataset.ratio.split(":").map(Number);
    mdApplySplit(e, p);
    mdSetActiveSplit(btn.dataset.ratio);
  });
});

// ── 드래그 리사이즈 ──
(function () {
  let dragging = false;
  let startPos = 0;
  let startEditSize = 0;
  let startPreviewSize = 0;

  mdResizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    mdResizer.classList.add("active");
    mdSetActiveSplit("");
    document.body.style.cursor = mdIsHorizontal ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";

    if (mdIsHorizontal) {
      startPos = e.clientX;
      startEditSize = mdEditPane.offsetWidth;
      startPreviewSize = mdPreview.offsetWidth;
    } else {
      startPos = e.clientY;
      startEditSize = mdEditPane.offsetHeight;
      startPreviewSize = mdPreview.offsetHeight;
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const delta = (mdIsHorizontal ? e.clientX : e.clientY) - startPos;
    const newEdit = Math.max(120, startEditSize + delta);
    const newPreview = Math.max(120, startPreviewSize - delta);
    const total = newEdit + newPreview;

    mdEditPane.style.flex = "none";
    mdPreview.style.flex = "none";
    if (mdIsHorizontal) {
      mdEditPane.style.width = (newEdit / total * 100) + "%";
      mdPreview.style.width = (newPreview / total * 100) + "%";
    } else {
      mdEditPane.style.height = (newEdit / total * 100) + "%";
      mdPreview.style.height = (newPreview / total * 100) + "%";
    }
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    mdResizer.classList.remove("active");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
})();

// ── 툴바 버튼 (execCommand로 Ctrl+Z 지원) ──
function mdExecInsert(text) {
  mdInput.focus();
  document.execCommand("insertText", false, text);
  renderPreview();
}

function mdInsert(before, after = "") {
  const start = mdInput.selectionStart;
  const end = mdInput.selectionEnd;
  const selected = mdInput.value.substring(start, end);
  const text = selected || t("md.link_text");
  const replacement = before + text + after;
  mdInput.focus();
  mdInput.selectionStart = start;
  mdInput.selectionEnd = end;
  document.execCommand("insertText", false, replacement);
  // "텍스트" 부분만 선택하여 바로 수정 가능하게
  if (!selected) {
    mdInput.selectionStart = start + before.length;
    mdInput.selectionEnd = start + before.length + text.length;
  }
  renderPreview();
}

function mdInsertLine(prefix) {
  const start = mdInput.selectionStart;
  const val = mdInput.value;
  const lineStart = val.lastIndexOf("\n", start - 1) + 1;
  mdInput.focus();
  mdInput.selectionStart = lineStart;
  mdInput.selectionEnd = lineStart;
  document.execCommand("insertText", false, prefix);
  renderPreview();
}

function mdGenerateTable() {
  const cols = parseInt(prompt(t("md.table_cols"), "3"), 10);
  if (!cols || cols < 1) return;
  const rows = parseInt(prompt(t("md.table_rows"), "2"), 10);
  if (!rows || rows < 1) return;

  const header = "| " + Array.from({ length: cols }, (_, i) => t("md.table_header", { n: i + 1 })).join(" | ") + " |";
  const separator = "| " + Array.from({ length: cols }, () => "---").join(" | ") + " |";
  const dataRows = Array.from({ length: rows }, () =>
    "| " + Array.from({ length: cols }, () => "   ").join(" | ") + " |"
  );
  const table = "\n" + [header, separator, ...dataRows].join("\n") + "\n";
  mdExecInsert(table);
}

function mdGenerateTOC() {
  const lines = mdInput.value.split("\n");
  const tocLines = [];
  let inCodeBlock = false;
  for (const line of lines) {
    if (/^```/.test(line)) { inCodeBlock = !inCodeBlock; continue; }
    if (inCodeBlock) continue;
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const title = match[2].trim();
      const anchor = title
        .toLowerCase()
        .replace(/[^\w\s가-힣-]/g, "")
        .replace(/\s+/g, "-");
      const indent = "  ".repeat(level - 1);
      tocLines.push(`${indent}- [${title}](#${anchor})`);
    }
  }
  if (tocLines.length === 0) {
    setMdStatus(t("md.toc_no_heading"), true);
    return;
  }
  const toc = "\n## " + t("md.toc_title") + "\n\n" + tocLines.join("\n") + "\n\n";
  mdExecInsert(toc);
  setMdStatus(t("md.toc_inserted"));
}

// ── 액션 정의 + 단축키 매핑 ──
const MD_ACTIONS = {
  bold:          { labelKey: "md.tb_bold",      fn: () => mdInsert("**", "**"),          defaultKey: "Ctrl+B" },
  italic:        { labelKey: "md.tb_italic",    fn: () => mdInsert("*", "*"),            defaultKey: "Ctrl+I" },
  strikethrough: { labelKey: "md.tb_strike",    fn: () => mdInsert("~~", "~~"),          defaultKey: "Ctrl+D" },
  h1:            { labelKey: "md.tb_h1",        fn: () => mdInsertLine("# "),            defaultKey: "Ctrl+1" },
  h2:            { labelKey: "md.tb_h2",        fn: () => mdInsertLine("## "),           defaultKey: "Ctrl+2" },
  h3:            { labelKey: "md.tb_h3",        fn: () => mdInsertLine("### "),          defaultKey: "Ctrl+3" },
  link:          { labelKey: "md.tb_link",      fn: () => mdInsert("[", "](url)"),       defaultKey: "Ctrl+K" },
  image:         { labelKey: "md.tb_image",     fn: () => mdInsert("![", "](url)"),      defaultKey: "Ctrl+Shift+I" },
  code:          { labelKey: "md.tb_code",      fn: () => mdInsert("`", "`"),            defaultKey: "Ctrl+E" },
  codeblock:     { labelKey: "md.tb_codeblock", fn: () => mdInsert("\n```\n", "\n```\n"), defaultKey: "Ctrl+Shift+K" },
  quote:         { labelKey: "md.tb_quote",     fn: () => mdInsertLine("> "),            defaultKey: "Ctrl+Q" },
  ul:            { labelKey: "md.tb_ul",        fn: () => mdInsertLine("- "),            defaultKey: "Ctrl+U" },
  ol:            { labelKey: "md.tb_ol",        fn: () => mdInsertLine("1. "),           defaultKey: "Ctrl+Shift+O" },
  checkbox:      { labelKey: "md.tb_checkbox",  fn: () => mdInsertLine("- [ ] "),        defaultKey: "Ctrl+Shift+C" },
  hr:            { labelKey: "md.tb_hr",        fn: () => mdExecInsert("\n---\n"),        defaultKey: "Ctrl+Shift+H" },
  table:         { labelKey: "md.tb_table_short", fn: () => mdGenerateTable(),           defaultKey: "Ctrl+Shift+T" },
  toc:           { labelKey: "md.tb_toc",       fn: () => mdGenerateTOC(),               defaultKey: "Ctrl+Shift+G" },
  save:          { labelKey: "md.save_unmodified", fn: () => mdDoSave(),                 defaultKey: "Ctrl+S" },
};
// label 접근 시 t() 동적 호출
Object.values(MD_ACTIONS).forEach(function (def) {
  Object.defineProperty(def, "label", { get: function () { return t(def.labelKey); } });
});

// localStorage에서 커스텀 키맵 불러오기
const MD_KEYMAP_STORAGE = "md_keymap";
let mdKeymap = {};
function mdLoadKeymap() {
  const saved = localStorage.getItem(MD_KEYMAP_STORAGE);
  if (saved) {
    try { mdKeymap = JSON.parse(saved); } catch { mdKeymap = {}; }
  }
  // 기본값 채우기
  for (const [action, def] of Object.entries(MD_ACTIONS)) {
    if (!mdKeymap[action]) mdKeymap[action] = def.defaultKey;
  }
}
function mdSaveKeymap() {
  localStorage.setItem(MD_KEYMAP_STORAGE, JSON.stringify(mdKeymap));
}
mdLoadKeymap();

// 키 문자열 → 비교용 정규화
function mdNormalizeKey(str) {
  return str.toLowerCase().split("+").sort().join("+");
}

// 이벤트 → 키 문자열
function mdEventToKey(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  else key = key.charAt(0).toUpperCase() + key.slice(1);
  if (!["Control", "Meta", "Shift", "Alt"].includes(key)) parts.push(key);
  return parts.join("+");
}

// 툴바 버튼 클릭
document.querySelectorAll(".md-tb").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    if (MD_ACTIONS[action]) MD_ACTIONS[action].fn();
  });
});

// 키보드 단축키 처리
mdInput.addEventListener("keydown", (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  const pressed = mdNormalizeKey(mdEventToKey(e));
  for (const [action, shortcut] of Object.entries(mdKeymap)) {
    if (mdNormalizeKey(shortcut) === pressed && MD_ACTIONS[action]) {
      e.preventDefault();
      MD_ACTIONS[action].fn();
      return;
    }
  }
});

// ── 단축키 설정 패널 ──
const mdKeymapPanel = document.getElementById("mdKeymapPanel");
const mdKeymapBtn = document.getElementById("mdKeymapBtn");
const mdKeymapClose = document.getElementById("mdKeymapClose");
const mdKeymapList = document.getElementById("mdKeymapList");
const mdKeymapReset = document.getElementById("mdKeymapReset");

function mdRenderKeymapPanel() {
  mdKeymapList.innerHTML = "";
  for (const [action, def] of Object.entries(MD_ACTIONS)) {
    const item = document.createElement("div");
    item.className = "md-keymap-item";
    const lbl = document.createElement("label");
    lbl.textContent = def.label;
    const keyEl = document.createElement("span");
    keyEl.className = "md-keymap-key";
    keyEl.textContent = mdKeymap[action] || t("md.keymap_none");
    keyEl.dataset.action = action;
    keyEl.tabIndex = 0;
    keyEl.addEventListener("click", () => mdStartRecording(keyEl, action));
    item.appendChild(lbl);
    item.appendChild(keyEl);
    mdKeymapList.appendChild(item);
  }
}

let mdRecordingEl = null;
let mdRecordingAction = null;

function mdStartRecording(el, action) {
  // 이전 녹화 취소
  if (mdRecordingEl) mdRecordingEl.classList.remove("recording");
  mdRecordingEl = el;
  mdRecordingAction = action;
  el.classList.add("recording");
  el.textContent = t("md.keymap_waiting");
}

document.addEventListener("keydown", (e) => {
  if (!mdRecordingEl) return;
  e.preventDefault();
  e.stopPropagation();
  // 단독 수식키 무시
  if (["Control", "Meta", "Shift", "Alt"].includes(e.key)) return;
  const keyStr = mdEventToKey(e);
  mdKeymap[mdRecordingAction] = keyStr;
  mdSaveKeymap();
  mdRecordingEl.textContent = keyStr;
  mdRecordingEl.classList.remove("recording");
  // 툴바 버튼 title도 업데이트
  const btn = document.querySelector(`.md-tb[data-action="${mdRecordingAction}"]`);
  if (btn) btn.title = MD_ACTIONS[mdRecordingAction].label + " (" + keyStr + ")";
  mdRecordingEl = null;
  mdRecordingAction = null;
}, true);

mdKeymapBtn.addEventListener("click", () => {
  mdKeymapPanel.hidden = !mdKeymapPanel.hidden;
  if (!mdKeymapPanel.hidden) mdRenderKeymapPanel();
});
mdKeymapClose.addEventListener("click", () => {
  mdKeymapPanel.hidden = true;
  if (mdRecordingEl) {
    mdRecordingEl.classList.remove("recording");
    mdRecordingEl.textContent = mdKeymap[mdRecordingAction] || t("md.keymap_none");
    mdRecordingEl = null;
  }
});
mdKeymapReset.addEventListener("click", () => {
  for (const [action, def] of Object.entries(MD_ACTIONS)) {
    mdKeymap[action] = def.defaultKey;
  }
  mdSaveKeymap();
  mdRenderKeymapPanel();
  setMdStatus(t("md.keymap_restored"));
});

// 툴바 버튼에 단축키 표시
function mdUpdateToolbarTitles() {
  document.querySelectorAll(".md-tb").forEach((btn) => {
    const action = btn.dataset.action;
    if (mdKeymap[action]) {
      btn.title = MD_ACTIONS[action].label + " (" + mdKeymap[action] + ")";
    }
  });
}
i18nReady(mdUpdateToolbarTitles);
window.addEventListener("langchange", function () {
  mdUpdateToolbarTitles();
  mdRenderKeymapPanel();
});

// ── 파일 업로드 ──
mdUploadZone.addEventListener("click", () => mdFileInput.click());
mdUploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  mdUploadZone.classList.add("dragover");
});
mdUploadZone.addEventListener("dragleave", () => {
  mdUploadZone.classList.remove("dragover");
});
mdUploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  mdUploadZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) loadMdFile(file);
});
mdFileInput.addEventListener("change", () => {
  if (mdFileInput.files[0]) loadMdFile(mdFileInput.files[0]);
});

function loadMdFile(file) {
  mdFilename = file.name;
  mdCurrentSaveId = null;
  const reader = new FileReader();
  reader.onload = (e) => {
    mdInput.value = e.target.result;
    mdLastSavedContent = "";
    renderPreview();
    mdUpdateDirtyState();
    if (typeof updateCharCount === "function") updateCharCount();
    setMdStatus(t("md.file_load_done", { name: file.name }));
  };
  reader.readAsText(file);
}

// ── .md 다운로드 ──
mdDownloadBtn.addEventListener("click", () => {
  const content = mdInput.value;
  if (!content.trim()) {
    setMdStatus(t("md.no_content"), true);
    return;
  }
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = mdFilename;
  a.click();
  URL.revokeObjectURL(url);
  setMdStatus(t("md.download_done", { name: mdFilename }));
});

// ── PDF 내보내기 ──
document.getElementById("mdExportPdfBtn").addEventListener("click", async () => {
  const previewHtml = mdPreview.innerHTML;
  if (!previewHtml.trim()) { setMdStatus(t("md.pdf_no_content"), true); return; }
  if (typeof html2pdf === "undefined") { setMdStatus(t("md.pdf_no_lib"), true); return; }
  setMdStatus(t("md.pdf_generating"));
  try {
    const opt = {
      margin: 10,
      filename: (mdFilename || "markdown").replace(/\.\w+$/, "") + ".pdf",
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    };
    await html2pdf().set(opt).from(mdPreview).save();
    setMdStatus(t("md.pdf_done"));
  } catch (e) {
    setMdStatus(t("md.pdf_fail", { msg: e.message }), true);
  }
});

// ── DB 저장 ──
async function mdDoSave() {
  const content = mdInput.value;
  if (!content.trim()) {
    setMdStatus(t("md.save_no_content"), true);
    return;
  }

  try {
    if (mdCurrentSaveId) {
      // 기존 저장 덮어쓰기
      const name = mdFilename.replace(/\.md$/, "");
      const res = await fetch(`/api/md/saves/${mdCurrentSaveId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      mdLastSavedContent = content;
      mdUpdateDirtyState();
      setMdStatus(t("md.update_done", { name: name, id: mdCurrentSaveId }));
    } else {
      // 신규 저장
      mdDoSaveAs();
      return;
    }
    loadMdSaves();
    // 이력 패널이 열려있으면 동기화
    if (!mdVersionPanel.hidden) {
      showMdVersions(mdCurrentSaveId, mdFilename.replace(/\.md$/, ""));
    }
  } catch (e) {
    setMdStatus(t("common.save_fail") + ": " + e.message, true);
  }
}

async function mdDoSaveAs() {
  const content = mdInput.value;
  if (!content.trim()) {
    setMdStatus(t("md.save_no_content"), true);
    return;
  }
  const name = prompt(t("md.enter_name"), mdFilename.replace(/\.md$/, ""));
  if (!name) return;

  try {
    const res = await fetch("/api/md/saves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content }),
    });
    const data = await res.json();
    if (!data.ok && !data.id) throw new Error(data.error || t("common.save_fail"));
    mdCurrentSaveId = data.id;
    mdFilename = name + ".md";
    mdLastSavedContent = content;
    mdUpdateDirtyState();
    setMdStatus(t("md.save_done", { name: name, id: data.id }));
    loadMdSaves();
  } catch (e) {
    setMdStatus(t("common.save_fail") + ": " + e.message, true);
  }
}

const mdSaveAsBtn = document.getElementById("mdSaveAsBtn");
mdSaveBtn.addEventListener("click", mdDoSave);
mdSaveAsBtn.addEventListener("click", mdDoSaveAs);

// ── 저장 목록 ──
async function loadMdSaves() {
  try {
    const res = await fetch("/api/md/saves");
    const saves = await res.json();
    const tbody = mdSavesTable.querySelector("tbody");
    tbody.innerHTML = "";
    for (const s of saves) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.id}</td>
        <td>${escMd(s.name)}</td>
        <td>${toJST(s.updated_at || s.created_at)}</td>
        <td>
          <button class="md-load-btn" data-id="${s.id}">${t("common.load")}</button>
          <a href="/api/md/saves/${s.id}/html" target="_blank" class="md-peek-btn" data-id="${s.id}">${t("md.popup_view")}</a>
          <button class="md-ver-btn" data-id="${s.id}" data-name="${escMd(s.name)}">${t("md.history")}</button>
          <button class="md-del-btn" data-id="${s.id}">${t("common.delete")}</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll(".md-load-btn").forEach((btn) => {
      btn.addEventListener("click", () => loadMdSave(parseInt(btn.dataset.id)));
    });
    tbody.querySelectorAll(".md-peek-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        // Cmd+Option+클릭은 브라우저 기본 동작(새 창)으로 위임
        if (e.metaKey || e.altKey) return;
        e.preventDefault();
        peekMdSave(parseInt(btn.dataset.id));
      });
    });
    tbody.querySelectorAll(".md-ver-btn").forEach((btn) => {
      btn.addEventListener("click", () => showMdVersions(parseInt(btn.dataset.id), btn.dataset.name));
    });
    tbody.querySelectorAll(".md-del-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteMdSave(parseInt(btn.dataset.id)));
    });
  } catch (e) {
    setMdStatus(t("common.load_fail") + ": " + e.message, true);
  }
}

function escMd(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function peekMdSave(id) {
  var url = "/api/md/saves/" + id + "/html";

  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center";

  var wrap = document.createElement("div");
  wrap.style.cssText = "width:90%;max-width:860px;height:90%;background:#fff;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.3)";

  var header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:#f1f5f9;border-bottom:1px solid #e2e8f0";

  var newWinLink = document.createElement("a");
  newWinLink.href = url;
  newWinLink.target = "_blank";
  newWinLink.textContent = t("md.popup_new_window");
  newWinLink.style.cssText = "font-size:12px;color:#64748b;text-decoration:none";

  var closeBtn = document.createElement("button");
  closeBtn.textContent = t("md.popup_close");
  closeBtn.style.cssText = "border:none;background:#e2e8f0;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:13px";
  closeBtn.addEventListener("click", function () { overlay.remove(); });

  header.appendChild(newWinLink);
  header.appendChild(closeBtn);

  var iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.style.cssText = "flex:1;border:none;width:100%";

  wrap.appendChild(header);
  wrap.appendChild(iframe);
  overlay.appendChild(wrap);

  // 오버레이 배경 클릭 시 닫기
  overlay.addEventListener("click", function (ev) {
    if (ev.target === overlay) overlay.remove();
  });

  // ESC 키로 닫기
  var escHandler = function (ev) {
    if (ev.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", escHandler); }
  };
  document.addEventListener("keydown", escHandler);

  document.body.appendChild(overlay);
}

async function loadMdSave(id) {
  try {
    const res = await fetch(`/api/md/saves/${id}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    mdInput.value = data.content;
    mdCurrentSaveId = data.id;
    mdFilename = (data.name || "document") + ".md";
    mdLastSavedContent = data.content;
    renderPreview();
    if (typeof updateCharCount === "function") updateCharCount();
    mdUpdateDirtyState();
    setMdStatus(t("md.load_done", { name: data.name }));
    loadProofreadFromDB(data.id);
  } catch (e) {
    setMdStatus(t("common.load_fail") + ": " + e.message, true);
  }
}

async function deleteMdSave(id) {
  if (!confirm(t("md.confirm_delete"))) return;
  try {
    const res = await fetch(`/api/md/saves/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    if (mdCurrentSaveId === id) mdCurrentSaveId = null;
    setMdStatus(t("common.delete_done"));
    loadMdSaves();
  } catch (e) {
    setMdStatus(t("common.delete_fail") + ": " + e.message, true);
  }
}

// ── 버전 이력 ──
const mdVersionPanel = document.getElementById("mdVersionPanel");
const mdVersionTitle = document.getElementById("mdVersionTitle");
const mdVersionTable = document.getElementById("mdVersionTable");
const mdVersionClose = document.getElementById("mdVersionClose");

mdVersionClose.addEventListener("click", () => {
  mdVersionPanel.hidden = true;
});

async function showMdVersions(saveId, saveName) {
  try {
    const res = await fetch(`/api/md/saves/${saveId}/versions`);
    const data = await res.json();
    const versions = Array.isArray(data) ? data : [];
    if (!Array.isArray(data) && data.error) throw new Error(data.error);
    mdVersionTitle.textContent = `— ${saveName}`;
    const tbody = mdVersionTable.querySelector("tbody");
    tbody.innerHTML = "";
    if (versions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888">' + t("md.no_versions") + '</td></tr>';
    } else {
      versions.forEach((v, idx) => {
        const tr = document.createElement("tr");
        const isArchived = v.archived === 1;
        const comment = v.comment || "";
        const commentEsc = comment.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
        tr.innerHTML = `
          <td>v${v.version_num || (versions.length - idx)}${isArchived ? ' <span class="md-archived-badge">' + t("md.version_archived") + '</span>' : ''}</td>
          <td class="md-ver-comment-cell">
            <span class="md-ver-comment-text" title="${commentEsc}">${commentEsc || '<span style="color:#666">—</span>'}</span>
            <button class="md-ver-comment-btn" data-id="${v.id}" title="${t("md.version_comment")}">✎</button>
          </td>
          <td>${toJST(v.created_at)}</td>
          <td>
            <button class="md-ver-preview-btn" data-id="${v.id}">${t("md.version_preview")}</button>
            <button class="md-ver-rollback-btn" data-id="${v.id}" data-save-id="${v.save_id}">${t("md.version_rollback")}</button>
            <button class="md-ver-archive-btn${isArchived ? ' archived' : ''}" data-id="${v.id}" data-save-id="${v.save_id}">${isArchived ? t("md.version_unarchive") : t("md.version_archive")}</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
      tbody.querySelectorAll(".md-ver-preview-btn").forEach((btn) => {
        btn.addEventListener("click", () => previewMdVersion(parseInt(btn.dataset.id)));
      });
      tbody.querySelectorAll(".md-ver-rollback-btn").forEach((btn) => {
        btn.addEventListener("click", () =>
          rollbackMdVersion(parseInt(btn.dataset.saveId), parseInt(btn.dataset.id))
        );
      });
      tbody.querySelectorAll(".md-ver-archive-btn").forEach((btn) => {
        btn.addEventListener("click", () =>
          toggleMdVersionArchive(parseInt(btn.dataset.id), parseInt(btn.dataset.saveId), saveName)
        );
      });
      tbody.querySelectorAll(".md-ver-comment-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const versionId = parseInt(btn.dataset.id);
          const cell = btn.closest(".md-ver-comment-cell");
          const textSpan = cell.querySelector(".md-ver-comment-text");
          const current = textSpan.textContent === "—" ? "" : textSpan.textContent;
          const input = document.createElement("input");
          input.type = "text";
          input.value = current;
          input.className = "md-ver-comment-input";
          input.placeholder = t("md.version_comment_ph");
          cell.replaceChild(input, textSpan);
          btn.style.display = "none";
          input.focus();
          const save = async () => {
            const val = input.value.trim();
            try {
              await fetch(`/api/md/versions/${versionId}/comment`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ comment: val }),
              });
            } catch (e) { /* silent */ }
            const newSpan = document.createElement("span");
            newSpan.className = "md-ver-comment-text";
            const escaped = val.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
            newSpan.innerHTML = escaped || '<span style="color:#666">—</span>';
            newSpan.title = val;
            cell.replaceChild(newSpan, input);
            btn.style.display = "";
          };
          input.addEventListener("blur", save);
          input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") input.blur();
            if (e.key === "Escape") { input.value = current; input.blur(); }
          });
        });
      });
    }
    mdVersionPanel.hidden = false;
    mdVersionPanel.scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    setMdStatus(t("common.load_fail") + ": " + e.message, true);
  }
}

async function previewMdVersion(versionId) {
  try {
    const res = await fetch(`/api/md/versions/${versionId}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    // 미리보기 패널에 해당 버전 내용 표시
    mdPreview.innerHTML = marked.parse(data.content);
    await renderMermaidBlocks();
    setMdStatus(t("md.version_preview_title", { id: versionId }));
  } catch (e) {
    setMdStatus(t("common.load_fail") + ": " + e.message, true);
  }
}

async function toggleMdVersionArchive(versionId, saveId, saveName) {
  try {
    const res = await fetch(`/api/md/versions/${versionId}/archive`, { method: "PUT" });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    setMdStatus(data.archived ? t("md.archived_done") : t("md.unarchived_done"));
    showMdVersions(saveId, saveName);
  } catch (e) {
    setMdStatus(t("common.error") + ": " + e.message, true);
  }
}

async function rollbackMdVersion(saveId, versionId) {
  if (!confirm(t("md.confirm_rollback"))) return;
  try {
    const res = await fetch(`/api/md/saves/${saveId}/rollback/${versionId}`, {
      method: "POST",
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    mdInput.value = data.content;
    mdCurrentSaveId = saveId;
    renderPreview();
    if (typeof updateCharCount === "function") updateCharCount();
    setMdStatus(t("md.rollback_done"));
    loadMdSaves();
    showMdVersions(saveId, mdFilename.replace(/\.md$/, ""));
  } catch (e) {
    setMdStatus(t("common.error") + ": " + e.message, true);
  }
}

// ── AI 검수 ─────────────────────────────────────────
var mdProofreadBtn = document.getElementById("mdProofreadBtn");
var mdProofreadToggle = document.getElementById("mdProofreadToggle");
var mdProofreadMenu = document.getElementById("mdProofreadMenu");
var mdProofreadStyle = document.getElementById("mdProofreadStyle");
var mdProofreadPanel = document.getElementById("mdProofreadPanel");
var mdAiProvider = document.getElementById("mdAiProvider");

loadAiProviders(mdAiProvider);
var mdProofreadHeader = document.getElementById("mdProofreadHeader");
var mdProofreadBody = document.getElementById("mdProofreadBody");
var mdProofreadCount = document.getElementById("mdProofreadCount");
var mdProofreadTable = document.getElementById("mdProofreadTable");
var mdProofreadApplyAll = document.getElementById("mdProofreadApplyAll");

var proofreadItems = []; // AI 검수 결과 저장
var proofreadResultId = null; // DB에 저장된 검수 결과 ID

// 검수 결과 DB 저장
async function saveProofreadToDB() {
  if (!mdCurrentSaveId || proofreadItems.length === 0) return;
  try {
    var res = await fetch("/api/md/proofread/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ save_id: mdCurrentSaveId, items: proofreadItems }),
    });
    var data = await res.json();
    if (data.ok) proofreadResultId = data.id;
  } catch (e) { /* silent */ }
}

// 검수 결과 DB에서 복원
async function loadProofreadFromDB(saveId) {
  try {
    var res = await fetch("/api/md/proofread/result?save_id=" + saveId);
    var data = await res.json();
    if (data.ok && data.result) {
      proofreadItems = data.result.items || [];
      proofreadResultId = data.result.id;
      renderProofreadResults();
      if (proofreadItems.length > 0) {
        mdProofreadPanel.style.display = "block";
      }
    } else {
      proofreadItems = [];
      proofreadResultId = null;
      mdProofreadPanel.style.display = "none";
    }
  } catch (e) {
    proofreadItems = [];
    proofreadResultId = null;
  }
}

// 모두 적용 완료 시 DB에서 삭제
async function deleteProofreadFromDB() {
  if (!proofreadResultId) return;
  try {
    await fetch("/api/md/proofread/result/" + proofreadResultId, { method: "DELETE" });
    proofreadResultId = null;
  } catch (e) { /* silent */ }
}

// 글자 수 표시
function updateCharCount() {
  var len = mdInput.value.length;
  var formatted = len.toLocaleString();
  var charEl = document.getElementById("mdCharCount");
  if (!charEl) {
    charEl = document.createElement("span");
    charEl.id = "mdCharCount";
    charEl.className = "md-char-count";
    mdStatus.parentElement.appendChild(charEl);
  }
  if (len > 50000) {
    charEl.className = "md-char-count over-limit";
    charEl.textContent = t("md.char_over", { count: formatted });
  } else {
    charEl.className = "md-char-count";
    charEl.textContent = t("md.char_count", { count: formatted });
  }
}
mdInput.addEventListener("input", updateCharCount);
i18nReady(updateCharCount);

// 드롭다운 토글
mdProofreadToggle.addEventListener("click", function (e) {
  e.stopPropagation();
  mdProofreadMenu.hidden = !mdProofreadMenu.hidden;
});
document.addEventListener("click", function (e) {
  if (!mdProofreadMenu.contains(e.target) && e.target !== mdProofreadToggle) {
    mdProofreadMenu.hidden = true;
  }
});

// 아코디언 토글
mdProofreadHeader.addEventListener("click", function (e) {
  if (e.target.closest(".btn-sm")) return; // "모두 적용" 버튼 클릭은 무시
  var isOpen = !mdProofreadBody.hidden;
  mdProofreadBody.hidden = isOpen;
  mdProofreadHeader.querySelector(".md-proofread-toggle-icon").innerHTML = isOpen ? "&#9654;" : "&#9660;";
});

// 검수 실행
mdProofreadBtn.addEventListener("click", async function () {
  var text = mdInput.value.trim();
  if (!text) {
    setMdStatus(t("md.review_no_content"), true);
    return;
  }
  mdProofreadBtn.disabled = true;
  mdProofreadBtn.textContent = t("md.review_loading");
  setMdStatus(t("md.review_ai_loading"));
  try {
    var resp = await fetch("/api/md/proofread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, includeStyle: mdProofreadStyle.checked, provider: mdAiProvider.value }),
    });
    var data = await resp.json();
    if (!data.ok) {
      setMdStatus(data.error || t("md.review_fail"), true);
      return;
    }
    proofreadItems = data.items || [];
    renderProofreadResults();
    if (proofreadItems.length === 0) {
      setMdStatus(t("md.review_no_changes"));
    } else {
      setMdStatus(t("md.review_found", { count: proofreadItems.length }));
      saveProofreadToDB();
    }
  } catch (e) {
    setMdStatus(t("md.review_fail") + ": " + e.message, true);
  } finally {
    mdProofreadBtn.disabled = false;
    mdProofreadBtn.textContent = t("md.ai_review");
  }
});

// textarea 내용 교체 (스크롤 보존 + execCommand 폴백)
function replaceTextareaContent(newText) {
  var scrollTop = mdInput.scrollTop;

  // 방법 1: execCommand (undo 지원)
  mdInput.focus();
  mdInput.select();
  var ok = document.execCommand("insertText", false, newText);

  // execCommand 실패 또는 값이 안 바뀐 경우 직접 설정
  if (!ok || mdInput.value !== newText) {
    mdInput.value = newText;
    mdInput.dispatchEvent(new Event("input", { bubbles: true }));
  }

  requestAnimationFrame(function () {
    mdInput.scrollTop = scrollTop;
  });
}

function escapeHtmlPr(str) {
  var d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function renderProofreadResults() {
  mdProofreadPanel.style.display = "block";
  mdProofreadPanel.hidden = false;
  mdProofreadBody.hidden = false;
  mdProofreadHeader.querySelector(".md-proofread-toggle-icon").innerHTML = "&#9660;";
  mdProofreadCount.textContent = proofreadItems.length;

  var tbody = mdProofreadTable.querySelector("tbody");
  tbody.innerHTML = "";

  if (proofreadItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="md-proofread-empty">' + t("md.review_no_items") + '</td></tr>';
    mdProofreadApplyAll.hidden = true;
    return;
  }
  mdProofreadApplyAll.hidden = false;

  proofreadItems.forEach(function (item, idx) {
    var tr = document.createElement("tr");
    tr.dataset.idx = idx;
    tr.innerHTML =
      '<td><span class="pr-line-link" data-line="' + (item.line || 1) + '">' + (item.line || "") + '</span></td>' +
      "<td>" + escapeHtmlPr(item.before || "") + "</td>" +
      "<td>" + escapeHtmlPr(item.after || "") + "</td>" +
      "<td>" + escapeHtmlPr(item.reason || "") + "</td>" +
      '<td><button class="pr-apply-btn" data-idx="' + idx + '">' + t("common.apply") + '</button></td>';
    tbody.appendChild(tr);
  });

  // 줄 번호 클릭 → 해당 라인으로 이동
  tbody.querySelectorAll(".pr-line-link").forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      var idx = parseInt(this.closest("tr").dataset.idx);
      var item = proofreadItems[idx];
      scrollToProofreadItem(item);
    });
  });

  // 개별 적용 버튼 이벤트
  tbody.querySelectorAll(".pr-apply-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyProofreadItem(parseInt(this.dataset.idx));
    });
  });
}

function scrollToProofreadItem(item) {
  if (!item || !item.before) return;
  var text = mdInput.value;

  // before 텍스트의 실제 위치를 본문에서 찾기
  var matchPos = text.indexOf(item.before);
  if (matchPos === -1) return;

  // matchPos가 몇 번째 줄인지 계산
  var beforeText = text.substring(0, matchPos);
  var targetIdx = beforeText.split("\n").length - 1;
  var lines = text.split("\n");

  // 해당 줄 시작 위치
  var pos = 0;
  for (var i = 0; i < targetIdx; i++) {
    pos += lines[i].length + 1;
  }

  // before 텍스트를 선택 (하이라이트)
  var selectStart = matchPos;
  var selectEnd = matchPos + item.before.length;

  // 미러 div로 정확한 스크롤 위치 측정
  var mirror = document.createElement("div");
  var cs = getComputedStyle(mdInput);
  mirror.style.cssText = "position:absolute;top:-9999px;left:-9999px;visibility:hidden;" +
    "width:" + mdInput.clientWidth + "px;" +
    "font:" + cs.font + ";" +
    "line-height:" + cs.lineHeight + ";" +
    "letter-spacing:" + cs.letterSpacing + ";" +
    "overflow-wrap:" + cs.overflowWrap + ";" +
    "white-space:pre-wrap;" +
    "padding:" + cs.padding + ";" +
    "border:" + cs.border + ";box-sizing:border-box;";
  mirror.textContent = lines.slice(0, targetIdx).join("\n") + (targetIdx > 0 ? "\n" : "");
  document.body.appendChild(mirror);
  var scrollTarget = mirror.scrollHeight;
  document.body.removeChild(mirror);

  // 포커스 → 스크롤 → 선택 (순서 보장)
  mdInput.focus();
  mdInput.scrollTop = Math.max(0, scrollTarget - mdInput.clientHeight / 2);
  requestAnimationFrame(function () {
    mdInput.setSelectionRange(selectStart, selectEnd);
  });
}

function applyProofreadItem(idx) {
  var item = proofreadItems[idx];
  if (!item || item._applied) return;

  var text = mdInput.value;
  var before = item.before;

  // 전체 텍스트에서 before 텍스트 직접 검색
  var pos = text.indexOf(before);

  // 못 찾으면 유니코드 정규화(NFC) 후 재시도
  if (pos === -1) {
    var textNorm = text.normalize("NFC");
    var beforeNorm = before.normalize("NFC");
    pos = textNorm.indexOf(beforeNorm);
    if (pos !== -1) text = textNorm;
  }

  // 그래도 못 찾으면 공백 정규화 후 재시도
  if (pos === -1) {
    var textTrim = text.replace(/\u00A0/g, " ");
    pos = textTrim.indexOf(before.replace(/\u00A0/g, " "));
    if (pos !== -1) text = textTrim;
  }

  if (pos === -1) {
    console.warn("[AI검수] 적용 실패");
    console.warn("[AI검수] before:", JSON.stringify(before));
    console.warn("[AI검수] 문서 전체:", JSON.stringify(text));
    var snippet = before.length > 20 ? before.substring(0, 20) + "…" : before;
    setMdStatus(t("md.review_apply_fail", { text: snippet }), true);
    return;
  }

  // before → after 치환
  var newText = text.substring(0, pos) + item.after + text.substring(pos + before.length);
  var lineDelta = item.after.split("\n").length - item.before.split("\n").length;

  replaceTextareaContent(newText);
  item._applied = true;

  // 이후 항목의 줄번호 보정
  if (lineDelta !== 0) {
    proofreadItems.forEach(function (other) {
      if (!other._applied && other.line > item.line) {
        other.line += lineDelta;
        // 테이블 셀 업데이트
        var otherRow = mdProofreadTable.querySelector('tr[data-idx="' + proofreadItems.indexOf(other) + '"]');
        if (otherRow) otherRow.cells[0].textContent = other.line;
      }
    });
  }

  // 행 비활성화
  var row = mdProofreadTable.querySelector('tr[data-idx="' + idx + '"]');
  if (row) {
    row.classList.add("applied");
    var btn = row.querySelector(".pr-apply-btn");
    if (btn) btn.disabled = true;
  }

  setMdStatus(t("md.review_apply_done", { line: item.line }));
  updateCharCount();

  // DB 동기화: 미적용 항목이 남아있으면 업데이트, 모두 적용됐으면 삭제
  var remaining = proofreadItems.some(function (it) { return !it._applied; });
  if (remaining) {
    saveProofreadToDB();
  } else {
    deleteProofreadFromDB();
  }
}

// 모두 적용
mdProofreadApplyAll.addEventListener("click", function () {
  // 줄번호 내림차순으로 적용 (줄번호 밀림 방지)
  var indices = [];
  proofreadItems.forEach(function (item, idx) {
    if (!item._applied) indices.push(idx);
  });
  indices.sort(function (a, b) {
    return (proofreadItems[b].line || 0) - (proofreadItems[a].line || 0);
  });

  var text = mdInput.value;
  var appliedCount = 0;
  var failedCount = 0;

  indices.forEach(function (idx) {
    var item = proofreadItems[idx];
    var pos = text.indexOf(item.before);
    if (pos !== -1) {
      text = text.substring(0, pos) + item.after + text.substring(pos + item.before.length);
      item._applied = true;
      appliedCount++;
      var row = mdProofreadTable.querySelector('tr[data-idx="' + idx + '"]');
      if (row) {
        row.classList.add("applied");
        var btn = row.querySelector(".pr-apply-btn");
        if (btn) btn.disabled = true;
      }
    } else {
      failedCount++;
    }
  });

  if (appliedCount > 0) {
    replaceTextareaContent(text);
    updateCharCount();
  }

  var msg = t("md.review_apply_all_done", { done: appliedCount });
  if (failedCount > 0) msg += " / " + t("md.review_apply_all_fail", { fail: failedCount });
  setMdStatus(msg, failedCount > 0);

  // DB 동기화
  var remaining = proofreadItems.some(function (it) { return !it._applied; });
  if (remaining) {
    saveProofreadToDB();
  } else {
    deleteProofreadFromDB();
  }
});

// 초기 로드
i18nReady(loadMdSaves);
window.addEventListener("langchange", loadMdSaves);
