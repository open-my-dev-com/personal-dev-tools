// ── UTC → JST 변환 ──
function toJST(utcStr) {
  if (!utcStr) return "";
  const d = new Date(utcStr + (utcStr.includes("Z") || utcStr.includes("+") ? "" : "Z"));
  if (isNaN(d)) return utcStr;
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Markdown Editor ─────────────────────────────────────────
const $mdInput = $("#mdInput");
const $mdPreview = $("#mdPreview");
const $mdEditorWrap = $("#mdEditorWrap");
const $mdLayoutToggle = $("#mdLayoutToggle");
const $mdFileInput = $("#mdFileInput");
const $mdUploadZone = $("#mdUploadZone");
const $mdSaveBtn = $("#mdSaveBtn");
const $mdDownloadBtn = $("#mdDownloadBtn");
const $mdStatus = $("#mdStatus");
const $mdSavesTable = $("#mdSavesTable");

let mdCurrentSaveId = null;
let mdFilename = "document.md";
let mdLastSavedContent = ""; // dirty 체크용

function mdUpdateDirtyState() {
  const isDirty = mdCurrentSaveId && $mdInput.val() !== mdLastSavedContent;
  $mdSaveBtn.prop("disabled", mdCurrentSaveId ? !isDirty : !$mdInput.val().trim());
  $mdSaveBtn.text(isDirty ? t("md.save_modified") : t("md.save_unmodified"));
}

function setMdStatus(text, isError = false) {
  $mdStatus.text(text);
  $mdStatus.css("color", isError ? "#bf233a" : "#65748b");
}

// ── 자동저장 ──
var $mdAutoSaveToggle = $("#mdAutoSaveToggle");
var mdAutoSaveTimer = null;
var MD_AUTOSAVE_INTERVAL_KEY = "md_autosave_interval";
var MD_AUTOSAVE_ENABLED_KEY = "md_autosave_enabled";

function getMdAutoSaveInterval() {
  var val = parseInt(localStorage.getItem(MD_AUTOSAVE_INTERVAL_KEY), 10);
  return val > 0 ? val : 30; // 기본 30초
}

function setMdAutoSaveInterval(seconds) {
  localStorage.setItem(MD_AUTOSAVE_INTERVAL_KEY, String(seconds));
  if ($mdAutoSaveToggle.prop("checked")) {
    startMdAutoSave();
  }
}

// 서버 모듈 설정에서 자동저장 간격 동기화
(function loadAutoSaveIntervalFromServer() {
  $.getJSON("/api/dev/modules").done(function (data) {
    if (data.ok && data.modules && data.modules.markdown) {
      var interval = parseInt(data.modules.markdown.autosave_interval, 10);
      if (interval > 0) {
        localStorage.setItem(MD_AUTOSAVE_INTERVAL_KEY, String(interval));
        if ($mdAutoSaveToggle.prop("checked")) startMdAutoSave();
      }
    }
  }).fail(function () {});
})();

function startMdAutoSave() {
  stopMdAutoSave();
  var interval = getMdAutoSaveInterval() * 1000;
  mdAutoSaveTimer = setInterval(function () {
    if (!mdCurrentSaveId) return; // 저장된 문서만 자동저장
    if ($mdInput.val() === mdLastSavedContent) return; // 변경 없으면 스킵
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

$mdAutoSaveToggle.prop("checked", localStorage.getItem(MD_AUTOSAVE_ENABLED_KEY) === "true");
$mdAutoSaveToggle.on("change", function () {
  localStorage.setItem(MD_AUTOSAVE_ENABLED_KEY, $(this).prop("checked"));
  if ($(this).prop("checked")) {
    startMdAutoSave();
    setMdStatus(t("md.autosave_on", { n: getMdAutoSaveInterval() }));
  } else {
    stopMdAutoSave();
    setMdStatus(t("md.autosave_off"));
  }
});
if ($mdAutoSaveToggle.prop("checked")) startMdAutoSave();

// window 전역에 노출 (개발자 모드에서 간격 변경 가능)
window.setMdAutoSaveInterval = setMdAutoSaveInterval;
window.getMdAutoSaveInterval = getMdAutoSaveInterval;

// 새 문서
$("#mdNewBtn").on("click", function () {
  if ($mdInput.val().trim() && !confirm(t("md.confirm_new"))) return;
  $mdInput.val("");
  mdCurrentSaveId = null;
  mdFilename = "document.md";
  mdLastSavedContent = "";
  renderPreview();
  mdUpdateDirtyState();
  if (typeof updateCharCount === "function") updateCharCount();
  proofreadItems = [];
  proofreadResultId = null;
  if ($mdProofreadPanel) { $mdProofreadPanel.hide(); $mdProofreadPanel.prop("hidden", true); }
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
  const $blocks = $mdPreview.find(".mermaid");
  for (let i = 0; i < $blocks.length; i++) {
    const el = $blocks[i];
    const $el = $(el);
    if ($el.data("processed")) continue;
    const code = $el.text();
    $el.data("processed", "true");
    try {
      const { svg } = await mermaid.render("mermaid-svg-" + Date.now() + Math.random().toString(36).slice(2), code);
      $el.html(svg);
    } catch (e) {
      $el.html(`<pre style="color:#bf233a;font-size:12px">${t("md.mermaid_error", { msg: e.message || e })}</pre>`);
    }
  }
  // mermaid가 에러 시 body에 직접 삽입하는 요소 제거
  $('body > [id^="dmermaid-svg-"]').remove();
}

function renderPreview() {
  clearTimeout(mdDebounceTimer);
  mdDebounceTimer = setTimeout(async () => {
    try {
      const { meta, body } = parseFrontmatter($mdInput.val());
      const fmHtml = renderFrontmatterHtml(meta);
      $mdPreview.html(fmHtml + processAlerts(marked.parse(body)));
      // 코드블록이 미리보기 패널을 넘지 않도록 너비 제한
      const previewPadding = parseFloat(getComputedStyle($mdPreview[0]).paddingLeft) + parseFloat(getComputedStyle($mdPreview[0]).paddingRight);
      const maxW = ($mdPreview[0].clientWidth - previewPadding) + "px";
      $mdPreview.find("pre").css("maxWidth", maxW);
      await renderMermaidBlocks();
    } catch (e) {
      $mdPreview.html("<p style='color:red'>" + t("md.render_error", { msg: e.message }) + "</p>");
    }
  }, 300);
}
$mdInput.on("input", () => {
  renderPreview();
  mdUpdateDirtyState();
});

// ── 가로/세로 모드 전환 ──
const $mdEditPane = $("#mdEditPane");
const $mdResizer = $("#mdResizer");
let mdIsHorizontal = true;

function mdResetPaneSizes() {
  $mdEditPane.css({ flex: "1", width: "", height: "" });
  $mdPreview.css({ flex: "1", width: "", height: "" });
}

$mdLayoutToggle.on("click", () => {
  mdIsHorizontal = !mdIsHorizontal;
  mdResetPaneSizes();
  mdSetActiveSplit("50:50");
  if (mdIsHorizontal) {
    $mdEditorWrap.removeClass("md-layout-vertical").addClass("md-layout-horizontal");
    $mdLayoutToggle.text(t("md.horizontal"));
  } else {
    $mdEditorWrap.removeClass("md-layout-horizontal").addClass("md-layout-vertical");
    $mdLayoutToggle.text(t("md.vertical"));
  }
});

// ── 비율 프리셋 버튼 ──
function mdSetActiveSplit(ratio) {
  $(".md-split-btn").each(function () {
    $(this).toggleClass("active", $(this).data("ratio") === ratio);
  });
}

function mdApplySplit(editPct, previewPct) {
  const prop = mdIsHorizontal ? "width" : "height";
  const otherProp = mdIsHorizontal ? "height" : "width";

  if (editPct === 0) {
    $mdEditPane.hide();
    $mdResizer.hide();
    $mdPreview.show().css({ flex: "1", [prop]: "", [otherProp]: "" });
  } else if (previewPct === 0) {
    $mdPreview.hide();
    $mdResizer.hide();
    $mdEditPane.show().css({ flex: "1", [prop]: "", [otherProp]: "" });
  } else {
    $mdEditPane.show().css({ flex: "none", [prop]: editPct + "%", [otherProp]: "" });
    $mdPreview.show().css({ flex: "none", [prop]: previewPct + "%", [otherProp]: "" });
    $mdResizer.show();
  }
}

$(".md-split-btn").on("click", function () {
  const [e, p] = $(this).data("ratio").split(":").map(Number);
  mdApplySplit(e, p);
  mdSetActiveSplit($(this).data("ratio"));
});

// ── 드래그 리사이즈 ──
(function () {
  let dragging = false;
  let startPos = 0;
  let startEditSize = 0;
  let startPreviewSize = 0;

  $mdResizer.on("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    $mdResizer.addClass("active");
    mdSetActiveSplit("");
    $("body").css({ cursor: mdIsHorizontal ? "col-resize" : "row-resize", userSelect: "none" });

    if (mdIsHorizontal) {
      startPos = e.clientX;
      startEditSize = $mdEditPane[0].offsetWidth;
      startPreviewSize = $mdPreview[0].offsetWidth;
    } else {
      startPos = e.clientY;
      startEditSize = $mdEditPane[0].offsetHeight;
      startPreviewSize = $mdPreview[0].offsetHeight;
    }
  });

  $(document).on("mousemove", (e) => {
    if (!dragging) return;
    const delta = (mdIsHorizontal ? e.clientX : e.clientY) - startPos;
    const newEdit = Math.max(120, startEditSize + delta);
    const newPreview = Math.max(120, startPreviewSize - delta);
    const total = newEdit + newPreview;

    $mdEditPane.css("flex", "none");
    $mdPreview.css("flex", "none");
    if (mdIsHorizontal) {
      $mdEditPane.css("width", (newEdit / total * 100) + "%");
      $mdPreview.css("width", (newPreview / total * 100) + "%");
    } else {
      $mdEditPane.css("height", (newEdit / total * 100) + "%");
      $mdPreview.css("height", (newPreview / total * 100) + "%");
    }
  });

  $(document).on("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    $mdResizer.removeClass("active");
    $("body").css({ cursor: "", userSelect: "" });
  });
})();

// ── 툴바 버튼 (execCommand로 Ctrl+Z 지원) ──
function mdExecInsert(text) {
  $mdInput[0].focus();
  document.execCommand("insertText", false, text);
  renderPreview();
}

function mdInsert(before, after = "") {
  const start = $mdInput[0].selectionStart;
  const end = $mdInput[0].selectionEnd;
  const selected = $mdInput.val().substring(start, end);
  const text = selected || t("md.link_text");
  const replacement = before + text + after;
  $mdInput[0].focus();
  $mdInput[0].selectionStart = start;
  $mdInput[0].selectionEnd = end;
  document.execCommand("insertText", false, replacement);
  // "텍스트" 부분만 선택하여 바로 수정 가능하게
  if (!selected) {
    $mdInput[0].selectionStart = start + before.length;
    $mdInput[0].selectionEnd = start + before.length + text.length;
  }
  renderPreview();
}

function mdInsertLine(prefix) {
  const start = $mdInput[0].selectionStart;
  const val = $mdInput.val();
  const lineStart = val.lastIndexOf("\n", start - 1) + 1;
  $mdInput[0].focus();
  $mdInput[0].selectionStart = lineStart;
  $mdInput[0].selectionEnd = lineStart;
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
  const lines = $mdInput.val().split("\n");
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
$(".md-tb").on("click", function () {
  const action = $(this).data("action");
  if (MD_ACTIONS[action]) MD_ACTIONS[action].fn();
});

// 키보드 단축키 처리
$mdInput.on("keydown", (e) => {
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
const $mdKeymapPanel = $("#mdKeymapPanel");
const $mdKeymapBtn = $("#mdKeymapBtn");
const $mdKeymapClose = $("#mdKeymapClose");
const $mdKeymapList = $("#mdKeymapList");
const $mdKeymapReset = $("#mdKeymapReset");

function mdRenderKeymapPanel() {
  $mdKeymapList.html("");
  for (const [action, def] of Object.entries(MD_ACTIONS)) {
    const $item = $("<div>").addClass("md-keymap-item");
    const $lbl = $("<label>").text(def.label);
    const $keyEl = $("<span>").addClass("md-keymap-key")
      .text(mdKeymap[action] || t("md.keymap_none"))
      .data("action", action)
      .attr("tabindex", 0);
    $keyEl.on("click", function () { mdStartRecording($(this), action); });
    $item.append($lbl).append($keyEl);
    $mdKeymapList.append($item);
  }
}

let $mdRecordingEl = null;
let mdRecordingAction = null;

function mdStartRecording($el, action) {
  // 이전 녹화 취소
  if ($mdRecordingEl) $mdRecordingEl.removeClass("recording");
  $mdRecordingEl = $el;
  mdRecordingAction = action;
  $el.addClass("recording");
  $el.text(t("md.keymap_waiting"));
}

$(document).on("keydown", function (e) {
  if (!$mdRecordingEl) return;
  e.preventDefault();
  e.stopPropagation();
  // 단독 수식키 무시
  if (["Control", "Meta", "Shift", "Alt"].includes(e.key)) return;
  const keyStr = mdEventToKey(e);
  mdKeymap[mdRecordingAction] = keyStr;
  mdSaveKeymap();
  $mdRecordingEl.text(keyStr);
  $mdRecordingEl.removeClass("recording");
  // 툴바 버튼 title도 업데이트
  const $btn = $(`.md-tb[data-action="${mdRecordingAction}"]`);
  if ($btn.length) $btn.attr("title", MD_ACTIONS[mdRecordingAction].label + " (" + keyStr + ")");
  $mdRecordingEl = null;
  mdRecordingAction = null;
});

$mdKeymapBtn.on("click", () => {
  $mdKeymapPanel.prop("hidden", !$mdKeymapPanel.prop("hidden"));
  if (!$mdKeymapPanel.prop("hidden")) mdRenderKeymapPanel();
});
$mdKeymapClose.on("click", () => {
  $mdKeymapPanel.prop("hidden", true);
  if ($mdRecordingEl) {
    $mdRecordingEl.removeClass("recording");
    $mdRecordingEl.text(mdKeymap[mdRecordingAction] || t("md.keymap_none"));
    $mdRecordingEl = null;
  }
});
$mdKeymapReset.on("click", () => {
  for (const [action, def] of Object.entries(MD_ACTIONS)) {
    mdKeymap[action] = def.defaultKey;
  }
  mdSaveKeymap();
  mdRenderKeymapPanel();
  setMdStatus(t("md.keymap_restored"));
});

// 툴바 버튼에 단축키 표시
function mdUpdateToolbarTitles() {
  $(".md-tb").each(function () {
    const action = $(this).data("action");
    if (mdKeymap[action]) {
      $(this).attr("title", MD_ACTIONS[action].label + " (" + mdKeymap[action] + ")");
    }
  });
}
i18nReady(mdUpdateToolbarTitles);
$(window).on("langchange", function () {
  mdUpdateToolbarTitles();
  mdRenderKeymapPanel();
});

// ── 파일 업로드 ──
$mdUploadZone.on("click", () => $mdFileInput[0].click());
$mdUploadZone.on("dragover", (e) => {
  e.preventDefault();
  $mdUploadZone.addClass("dragover");
});
$mdUploadZone.on("dragleave", () => {
  $mdUploadZone.removeClass("dragover");
});
$mdUploadZone.on("drop", (e) => {
  e.preventDefault();
  $mdUploadZone.removeClass("dragover");
  const file = e.originalEvent.dataTransfer.files[0];
  if (file) loadMdFile(file);
});
$mdFileInput.on("change", () => {
  if ($mdFileInput[0].files[0]) loadMdFile($mdFileInput[0].files[0]);
});

function loadMdFile(file) {
  mdFilename = file.name;
  mdCurrentSaveId = null;
  const reader = new FileReader();
  reader.onload = (e) => {
    $mdInput.val(e.target.result);
    mdLastSavedContent = "";
    renderPreview();
    mdUpdateDirtyState();
    if (typeof updateCharCount === "function") updateCharCount();
    setMdStatus(t("md.file_load_done", { name: file.name }));
  };
  reader.readAsText(file);
}

// ── .md 다운로드 ──
$mdDownloadBtn.on("click", () => {
  const content = $mdInput.val();
  if (!content.trim()) {
    setMdStatus(t("md.no_content"), true);
    return;
  }
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const $a = $("<a>").attr({ href: url, download: mdFilename });
  $a[0].click();
  URL.revokeObjectURL(url);
  setMdStatus(t("md.download_done", { name: mdFilename }));
  showToast(t("md.download_done", { name: mdFilename }), "success");
});

// ── PDF 내보내기 ──
$("#mdExportPdfBtn").on("click", async () => {
  const previewHtml = $mdPreview.html();
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
    await html2pdf().set(opt).from($mdPreview[0]).save();
    setMdStatus(t("md.pdf_done"));
  } catch (e) {
    setMdStatus(t("md.pdf_fail", { msg: e.message }), true);
  }
});

// ── DB 저장 ──
async function mdDoSave() {
  const content = $mdInput.val();
  if (!content.trim()) {
    setMdStatus(t("md.save_no_content"), true);
    return;
  }

  try {
    if (mdCurrentSaveId) {
      // 기존 저장 덮어쓰기
      const name = mdFilename.replace(/\.md$/, "");
      const data = await $.ajax({
        url: `/api/md/saves/${mdCurrentSaveId}`,
        method: "PUT",
        contentType: "application/json",
        data: JSON.stringify({ name, content }),
        dataType: "json"
      });
      if (!data.ok) throw new Error(data.error);
      mdLastSavedContent = content;
      mdUpdateDirtyState();
      setMdStatus(t("md.update_done", { name: name, id: mdCurrentSaveId }));
      showToast(t("md.update_done", { name: name, id: mdCurrentSaveId }), "success");
    } else {
      // 신규 저장
      mdDoSaveAs();
      return;
    }
    loadMdSaves();
    // 이력 패널이 열려있으면 동기화
    if (!$mdVersionPanel.prop("hidden")) {
      showMdVersions(mdCurrentSaveId, mdFilename.replace(/\.md$/, ""));
    }
  } catch (e) {
    setMdStatus(t("common.save_fail") + ": " + e.message, true);
    showToast(t("common.save_fail") + ": " + e.message, "error");
  }
}

async function mdDoSaveAs() {
  const content = $mdInput.val();
  if (!content.trim()) {
    setMdStatus(t("md.save_no_content"), true);
    return;
  }
  const name = prompt(t("md.enter_name"), mdFilename.replace(/\.md$/, ""));
  if (!name) return;

  try {
    const data = await $.ajax({
      url: "/api/md/saves",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ name, content }),
      dataType: "json"
    });
    if (!data.ok && !data.id) throw new Error(data.error || t("common.save_fail"));
    mdCurrentSaveId = data.id;
    mdFilename = name + ".md";
    mdLastSavedContent = content;
    mdUpdateDirtyState();
    setMdStatus(t("md.save_done", { name: name, id: data.id }));
    showToast(t("md.save_done", { name: name, id: data.id }), "success");
    loadMdSaves();
  } catch (e) {
    setMdStatus(t("common.save_fail") + ": " + e.message, true);
    showToast(t("common.save_fail") + ": " + e.message, "error");
  }
}

const $mdSaveAsBtn = $("#mdSaveAsBtn");
$mdSaveBtn.on("click", mdDoSave);
$mdSaveAsBtn.on("click", mdDoSaveAs);

// ── 저장 목록 ──
async function loadMdSaves() {
  try {
    const saves = await $.getJSON("/api/md/saves");
    const $tbody = $mdSavesTable.find("tbody");
    $tbody.html("");
    for (const s of saves) {
      const $tr = $("<tr>").html(`
        <td>${s.id}</td>
        <td>${escMd(s.name)}</td>
        <td>${toJST(s.updated_at || s.created_at)}</td>
        <td>
          <button class="md-load-btn" data-id="${s.id}">${t("common.load")}</button>
          <a href="/api/md/saves/${s.id}/html" target="_blank" class="md-peek-btn" data-id="${s.id}">${t("md.popup_view")}</a>
          <button class="md-ver-btn" data-id="${s.id}" data-name="${escMd(s.name)}">${t("md.history")}</button>
          <button class="md-del-btn" data-id="${s.id}">${t("common.delete")}</button>
        </td>
      `);
      $tbody.append($tr);
    }
    $tbody.find(".md-load-btn").on("click", function () {
      loadMdSave(parseInt($(this).data("id")));
    });
    $tbody.find(".md-peek-btn").on("click", function (e) {
      // Cmd+Option+클릭은 브라우저 기본 동작(새 창)으로 위임
      if (e.metaKey || e.altKey) return;
      e.preventDefault();
      peekMdSave(parseInt($(this).data("id")));
    });
    $tbody.find(".md-ver-btn").on("click", function () {
      showMdVersions(parseInt($(this).data("id")), $(this).data("name"));
    });
    $tbody.find(".md-del-btn").on("click", function () {
      deleteMdSave(parseInt($(this).data("id")));
    });
  } catch (e) {
    setMdStatus(t("common.load_fail") + ": " + e.message, true);
  }
}

function escMd(s) {
  return $("<div>").text(s).html();
}

function peekMdSave(id) {
  var url = "/api/md/saves/" + id + "/html";

  var $overlay = $("<div>").css({
    position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
    background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex",
    alignItems: "center", justifyContent: "center"
  });

  var $wrap = $("<div>").css({
    width: "90%", maxWidth: "860px", height: "90%", background: "#fff",
    borderRadius: "8px", overflow: "hidden", display: "flex",
    flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
  });

  var $header = $("<div>").css({
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 16px", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0"
  });

  var $newWinLink = $("<a>").attr({ href: url, target: "_blank" })
    .text(t("md.popup_new_window"))
    .css({ fontSize: "12px", color: "#64748b", textDecoration: "none" });

  var $closeBtn = $("<button>").text(t("md.popup_close"))
    .css({ border: "none", background: "#e2e8f0", padding: "4px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "13px" });
  $closeBtn.on("click", function () { $overlay.remove(); });

  $header.append($newWinLink).append($closeBtn);

  var $iframe = $("<iframe>").attr("src", url)
    .css({ flex: 1, border: "none", width: "100%" });

  $wrap.append($header).append($iframe);
  $overlay.append($wrap);

  // 오버레이 배경 클릭 시 닫기
  $overlay.on("click", function (ev) {
    if (ev.target === $overlay[0]) $overlay.remove();
  });

  // ESC 키로 닫기
  var escHandler = function (ev) {
    if (ev.key === "Escape") { $overlay.remove(); $(document).off("keydown", escHandler); }
  };
  $(document).on("keydown", escHandler);

  $("body").append($overlay);
}

async function loadMdSave(id) {
  try {
    const data = await $.getJSON(`/api/md/saves/${id}`);
    if (data.error) throw new Error(data.error);
    $mdInput.val(data.content);
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
    const data = await $.ajax({
      url: `/api/md/saves/${id}`,
      method: "DELETE",
      dataType: "json"
    });
    if (!data.ok) throw new Error(data.error);
    if (mdCurrentSaveId === id) mdCurrentSaveId = null;
    setMdStatus(t("common.delete_done"));
    showToast(t("common.delete_done"), "success");
    loadMdSaves();
  } catch (e) {
    setMdStatus(t("common.delete_fail") + ": " + e.message, true);
    showToast(t("common.delete_fail") + ": " + e.message, "error");
  }
}

// ── 버전 이력 ──
const $mdVersionPanel = $("#mdVersionPanel");
const $mdVersionTitle = $("#mdVersionTitle");
const $mdVersionTable = $("#mdVersionTable");
const $mdVersionClose = $("#mdVersionClose");

$mdVersionClose.on("click", () => {
  $mdVersionPanel.prop("hidden", true);
});

async function showMdVersions(saveId, saveName) {
  try {
    const data = await $.getJSON(`/api/md/saves/${saveId}/versions`);
    const versions = Array.isArray(data) ? data : [];
    if (!Array.isArray(data) && data.error) throw new Error(data.error);
    $mdVersionTitle.text(`— ${saveName}`);
    const $tbody = $mdVersionTable.find("tbody");
    $tbody.html("");
    if (versions.length === 0) {
      $tbody.html('<tr><td colspan="4" style="text-align:center;color:#888">' + t("md.no_versions") + '</td></tr>');
    } else {
      versions.forEach((v, idx) => {
        const $tr = $("<tr>");
        const isArchived = v.archived === 1;
        const comment = v.comment || "";
        const commentEsc = comment.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
        $tr.html(`
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
        `);
        $tbody.append($tr);
      });
      $tbody.find(".md-ver-preview-btn").on("click", function () {
        previewMdVersion(parseInt($(this).data("id")));
      });
      $tbody.find(".md-ver-rollback-btn").on("click", function () {
        rollbackMdVersion(parseInt($(this).data("save-id")), parseInt($(this).data("id")));
      });
      $tbody.find(".md-ver-archive-btn").on("click", function () {
        toggleMdVersionArchive(parseInt($(this).data("id")), parseInt($(this).data("save-id")), saveName);
      });
      $tbody.find(".md-ver-comment-btn").on("click", function () {
        const $btn = $(this);
        const versionId = parseInt($btn.data("id"));
        const $cell = $btn.closest(".md-ver-comment-cell");
        const $textSpan = $cell.find(".md-ver-comment-text");
        const current = $textSpan.text() === "—" ? "" : $textSpan.text();
        const $input = $("<input>").attr({ type: "text", placeholder: t("md.version_comment_ph") })
          .addClass("md-ver-comment-input").val(current);
        $textSpan.replaceWith($input);
        $btn.hide();
        $input.focus();
        const save = async () => {
          const val = $input.val().trim();
          try {
            await $.ajax({
              url: `/api/md/versions/${versionId}/comment`,
              method: "PUT",
              contentType: "application/json",
              data: JSON.stringify({ comment: val }),
              dataType: "json"
            });
          } catch (e) { /* silent */ }
          const $newSpan = $("<span>").addClass("md-ver-comment-text").attr("title", val);
          const escaped = val.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
          $newSpan.html(escaped || '<span style="color:#666">—</span>');
          $input.replaceWith($newSpan);
          $btn.show();
        };
        $input.on("blur", save);
        $input.on("keydown", (e) => {
          if (e.key === "Enter") $input.blur();
          if (e.key === "Escape") { $input.val(current); $input.blur(); }
        });
      });
    }
    $mdVersionPanel.prop("hidden", false);
    $mdVersionPanel[0].scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    setMdStatus(t("common.load_fail") + ": " + e.message, true);
  }
}

async function previewMdVersion(versionId) {
  try {
    const data = await $.getJSON(`/api/md/versions/${versionId}`);
    if (data.error) throw new Error(data.error);
    // 미리보기 패널에 해당 버전 내용 표시
    $mdPreview.html(marked.parse(data.content));
    await renderMermaidBlocks();
    setMdStatus(t("md.version_preview_title", { id: versionId }));
  } catch (e) {
    setMdStatus(t("common.load_fail") + ": " + e.message, true);
  }
}

async function toggleMdVersionArchive(versionId, saveId, saveName) {
  try {
    const data = await $.ajax({
      url: `/api/md/versions/${versionId}/archive`,
      method: "PUT",
      dataType: "json"
    });
    if (!data.ok) throw new Error(data.error);
    setMdStatus(data.archived ? t("md.archived_done") : t("md.unarchived_done"));
    showToast(data.archived ? t("md.archived_done") : t("md.unarchived_done"), "success");
    showMdVersions(saveId, saveName);
  } catch (e) {
    setMdStatus(t("common.error") + ": " + e.message, true);
    showToast(t("common.error") + ": " + e.message, "error");
  }
}

async function rollbackMdVersion(saveId, versionId) {
  if (!confirm(t("md.confirm_rollback"))) return;
  try {
    const data = await $.ajax({
      url: `/api/md/saves/${saveId}/rollback/${versionId}`,
      method: "POST",
      dataType: "json"
    });
    if (!data.ok) throw new Error(data.error);
    $mdInput.val(data.content);
    mdCurrentSaveId = saveId;
    renderPreview();
    if (typeof updateCharCount === "function") updateCharCount();
    setMdStatus(t("md.rollback_done"));
    showToast(t("md.rollback_done"), "success");
    loadMdSaves();
    showMdVersions(saveId, mdFilename.replace(/\.md$/, ""));
  } catch (e) {
    setMdStatus(t("common.error") + ": " + e.message, true);
    showToast(t("common.error") + ": " + e.message, "error");
  }
}

// ── AI 검수 ─────────────────────────────────────────
var $mdProofreadBtn = $("#mdProofreadBtn");
var $mdProofreadToggle = $("#mdProofreadToggle");
var $mdProofreadMenu = $("#mdProofreadMenu");
var $mdProofreadStyle = $("#mdProofreadStyle");
var $mdProofreadPanel = $("#mdProofreadPanel");
var $mdAiProvider = $("#mdAiProvider");

loadAiProviders($mdAiProvider[0]);
var $mdProofreadHeader = $("#mdProofreadHeader");
var $mdProofreadBody = $("#mdProofreadBody");
var $mdProofreadCount = $("#mdProofreadCount");
var $mdProofreadTable = $("#mdProofreadTable");
var $mdProofreadApplyAll = $("#mdProofreadApplyAll");

var proofreadItems = []; // AI 검수 결과 저장
var proofreadResultId = null; // DB에 저장된 검수 결과 ID

// 검수 결과 DB 저장
async function saveProofreadToDB() {
  if (!mdCurrentSaveId || proofreadItems.length === 0) return;
  try {
    var data = await $.ajax({
      url: "/api/md/proofread/save",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ save_id: mdCurrentSaveId, items: proofreadItems }),
      dataType: "json"
    });
    if (data.ok) proofreadResultId = data.id;
  } catch (e) { /* silent */ }
}

// 검수 결과 DB에서 복원
async function loadProofreadFromDB(saveId) {
  try {
    var data = await $.getJSON("/api/md/proofread/result?save_id=" + saveId);
    if (data.ok && data.result) {
      proofreadItems = data.result.items || [];
      proofreadResultId = data.result.id;
      renderProofreadResults();
      if (proofreadItems.length > 0) {
        $mdProofreadPanel.show();
      }
    } else {
      proofreadItems = [];
      proofreadResultId = null;
      $mdProofreadPanel.hide();
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
    await $.ajax({ url: "/api/md/proofread/result/" + proofreadResultId, method: "DELETE" });
    proofreadResultId = null;
  } catch (e) { /* silent */ }
}

// 글자 수 표시
function updateCharCount() {
  var len = $mdInput.val().length;
  var formatted = len.toLocaleString();
  var $charEl = $("#mdCharCount");
  if (!$charEl.length) {
    $charEl = $("<span>").attr("id", "mdCharCount").addClass("md-char-count");
    $mdStatus.parent().append($charEl);
  }
  if (len > 50000) {
    $charEl.attr("class", "md-char-count over-limit");
    $charEl.text(t("md.char_over", { count: formatted }));
  } else {
    $charEl.attr("class", "md-char-count");
    $charEl.text(t("md.char_count", { count: formatted }));
  }
}
$mdInput.on("input", updateCharCount);
i18nReady(updateCharCount);

// 드롭다운 토글
$mdProofreadToggle.on("click", function (e) {
  e.stopPropagation();
  $mdProofreadMenu.prop("hidden", !$mdProofreadMenu.prop("hidden"));
});
$(document).on("click", function (e) {
  if (!$mdProofreadMenu[0].contains(e.target) && e.target !== $mdProofreadToggle[0]) {
    $mdProofreadMenu.prop("hidden", true);
  }
});

// 아코디언 토글
$mdProofreadHeader.on("click", function (e) {
  if ($(e.target).closest(".btn-sm").length) return; // "모두 적용" 버튼 클릭은 무시
  var isOpen = !$mdProofreadBody.prop("hidden");
  $mdProofreadBody.prop("hidden", isOpen);
  $mdProofreadHeader.find(".md-proofread-toggle-icon").html(isOpen ? "&#9654;" : "&#9660;");
});

// 검수 실행
$mdProofreadBtn.on("click", async function () {
  var text = $mdInput.val().trim();
  if (!text) {
    setMdStatus(t("md.review_no_content"), true);
    return;
  }
  $mdProofreadBtn.prop("disabled", true);
  $mdProofreadBtn.text(t("md.review_loading"));
  setMdStatus(t("md.review_ai_loading"));
  try {
    var data = await $.ajax({
      url: "/api/md/proofread",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ text: text, includeStyle: $mdProofreadStyle.prop("checked"), provider: $mdAiProvider.val() }),
      dataType: "json"
    });
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
    $mdProofreadBtn.prop("disabled", false);
    $mdProofreadBtn.text(t("md.ai_review"));
  }
});

// textarea 내용 교체 (스크롤 보존 + execCommand 폴백)
function replaceTextareaContent(newText) {
  var scrollTop = $mdInput[0].scrollTop;

  // 방법 1: execCommand (undo 지원)
  $mdInput[0].focus();
  $mdInput[0].select();
  var ok = document.execCommand("insertText", false, newText);

  // execCommand 실패 또는 값이 안 바뀐 경우 직접 설정
  if (!ok || $mdInput.val() !== newText) {
    $mdInput.val(newText);
    $mdInput[0].dispatchEvent(new Event("input", { bubbles: true }));
  }

  requestAnimationFrame(function () {
    $mdInput[0].scrollTop = scrollTop;
  });
}

function escapeHtmlPr(str) {
  return $("<div>").text(str).html();
}

function renderProofreadResults() {
  $mdProofreadPanel.show();
  $mdProofreadPanel.prop("hidden", false);
  $mdProofreadBody.prop("hidden", false);
  $mdProofreadHeader.find(".md-proofread-toggle-icon").html("&#9660;");
  $mdProofreadCount.text(proofreadItems.length);

  var $tbody = $mdProofreadTable.find("tbody");
  $tbody.html("");

  if (proofreadItems.length === 0) {
    $tbody.html('<tr><td colspan="5" class="md-proofread-empty">' + t("md.review_no_items") + '</td></tr>');
    $mdProofreadApplyAll.prop("hidden", true);
    return;
  }
  $mdProofreadApplyAll.prop("hidden", false);

  proofreadItems.forEach(function (item, idx) {
    var $tr = $("<tr>").attr("data-idx", idx);
    $tr.html(
      '<td><span class="pr-line-link" data-line="' + (item.line || 1) + '">' + (item.line || "") + '</span></td>' +
      "<td>" + escapeHtmlPr(item.before || "") + "</td>" +
      "<td>" + escapeHtmlPr(item.after || "") + "</td>" +
      "<td>" + escapeHtmlPr(item.reason || "") + "</td>" +
      '<td><button class="pr-apply-btn" data-idx="' + idx + '">' + t("common.apply") + '</button></td>'
    );
    $tbody.append($tr);
  });

  // 줄 번호 클릭 → 해당 라인으로 이동
  $tbody.find(".pr-line-link").on("click", function (e) {
    e.preventDefault();
    var idx = parseInt($(this).closest("tr").attr("data-idx"));
    var item = proofreadItems[idx];
    scrollToProofreadItem(item);
  });

  // 개별 적용 버튼 이벤트
  $tbody.find(".pr-apply-btn").on("click", function () {
    applyProofreadItem(parseInt($(this).data("idx")));
  });
}

function scrollToProofreadItem(item) {
  if (!item || !item.before) return;
  var text = $mdInput.val();

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
  var $mirror = $("<div>");
  var cs = getComputedStyle($mdInput[0]);
  $mirror.css({
    position: "absolute", top: "-9999px", left: "-9999px", visibility: "hidden",
    width: $mdInput[0].clientWidth + "px",
    font: cs.font,
    lineHeight: cs.lineHeight,
    letterSpacing: cs.letterSpacing,
    overflowWrap: cs.overflowWrap,
    whiteSpace: "pre-wrap",
    padding: cs.padding,
    border: cs.border,
    boxSizing: "border-box"
  });
  $mirror.text(lines.slice(0, targetIdx).join("\n") + (targetIdx > 0 ? "\n" : ""));
  $("body").append($mirror);
  var scrollTarget = $mirror[0].scrollHeight;
  $mirror.remove();

  // 포커스 → 스크롤 → 선택 (순서 보장)
  $mdInput[0].focus();
  $mdInput[0].scrollTop = Math.max(0, scrollTarget - $mdInput[0].clientHeight / 2);
  requestAnimationFrame(function () {
    $mdInput[0].setSelectionRange(selectStart, selectEnd);
  });
}

function applyProofreadItem(idx) {
  var item = proofreadItems[idx];
  if (!item || item._applied) return;

  var text = $mdInput.val();
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
        var $otherRow = $mdProofreadTable.find('tr[data-idx="' + proofreadItems.indexOf(other) + '"]');
        if ($otherRow.length) $otherRow.find("td").first().text(other.line);
      }
    });
  }

  // 행 비활성화
  var $row = $mdProofreadTable.find('tr[data-idx="' + idx + '"]');
  if ($row.length) {
    $row.addClass("applied");
    var $btn = $row.find(".pr-apply-btn");
    if ($btn.length) $btn.prop("disabled", true);
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
$mdProofreadApplyAll.on("click", function () {
  // 줄번호 내림차순으로 적용 (줄번호 밀림 방지)
  var indices = [];
  proofreadItems.forEach(function (item, idx) {
    if (!item._applied) indices.push(idx);
  });
  indices.sort(function (a, b) {
    return (proofreadItems[b].line || 0) - (proofreadItems[a].line || 0);
  });

  var text = $mdInput.val();
  var appliedCount = 0;
  var failedCount = 0;

  indices.forEach(function (idx) {
    var item = proofreadItems[idx];
    var pos = text.indexOf(item.before);
    if (pos !== -1) {
      text = text.substring(0, pos) + item.after + text.substring(pos + item.before.length);
      item._applied = true;
      appliedCount++;
      var $row = $mdProofreadTable.find('tr[data-idx="' + idx + '"]');
      if ($row.length) {
        $row.addClass("applied");
        var $btn = $row.find(".pr-apply-btn");
        if ($btn.length) $btn.prop("disabled", true);
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
$(window).on("langchange", loadMdSaves);
