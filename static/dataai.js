// --- Data AI ---
var dataaiPrompt = document.getElementById("dataaiPrompt");
var dataaiFormat = document.getElementById("dataaiFormat");
var dataaiCount = document.getElementById("dataaiCount");
var dataaiGenerateBtn = document.getElementById("dataaiGenerateBtn");
var dataaiStatus = document.getElementById("dataaiStatus");
var dataaiResultWrap = document.getElementById("dataaiResultWrap");
var dataaiResult = document.getElementById("dataaiResult");
var dataaiCopyBtn = document.getElementById("dataaiCopyBtn");
var dataaiDownloadBtn = document.getElementById("dataaiDownloadBtn");
var dataaiToCsvBtn = document.getElementById("dataaiToCsvBtn");
var dataaiToJsonBtn = document.getElementById("dataaiToJsonBtn");
var dataaiSaveBtn = document.getElementById("dataaiSaveBtn");
var dataaiPreviewWrap = document.getElementById("dataaiPreviewWrap");
var dataaiSavesBody = document.querySelector("#dataaiSavesTable tbody");

var _dataaiLastResult = "";
var _dataaiLastPrompt = "";
var _dataaiLastFormat = "csv";
var _dataaiLoadingTimer = null;

function setDataaiStatus(msg, type) {
  clearInterval(_dataaiLoadingTimer);
  _dataaiLoadingTimer = null;
  dataaiStatus.style.display = msg ? "block" : "none";
  dataaiStatus.textContent = msg;
  dataaiStatus.className = "dataai-status" + (type ? " " + type : "");
}

function startLoadingAnimation(baseMsg) {
  var dots = 0;
  dataaiStatus.style.display = "block";
  dataaiStatus.className = "dataai-status loading";
  dataaiStatus.textContent = baseMsg;
  _dataaiLoadingTimer = setInterval(function () {
    dots = (dots + 1) % 4;
    dataaiStatus.textContent = baseMsg + ".".repeat(dots);
  }, 400);
}

// 탭 전환 유틸
function switchToTab(tabName) {
  document.querySelectorAll(".nav-btn").forEach(function (b) { b.classList.remove("active"); });
  document.querySelectorAll(".tab-content").forEach(function (t) { t.classList.remove("active"); });
  var btn = document.querySelector('.nav-btn[data-tab="' + tabName + '"]');
  var tab = document.querySelector('.tab-content[data-tab="' + tabName + '"]');
  if (btn) btn.classList.add("active");
  if (tab) tab.classList.add("active");
}

// 연계 버튼 표시 업데이트
function updateLinkButtons() {
  var fmt = _dataaiLastFormat;
  dataaiToCsvBtn.style.display = (fmt === "csv" || fmt === "tsv" || fmt === "json") ? "" : "none";
  dataaiToJsonBtn.style.display = (fmt === "json") ? "" : "none";
}

// CSV/TSV 텍스트를 2D 배열로 파싱
function parseDataaiCsv(text, delim) {
  var rows = [];
  var lines = text.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    rows.push(line.split(delim));
  }
  return rows;
}

// 테이블 미리보기 렌더링
function renderDataaiPreview() {
  dataaiPreviewWrap.innerHTML = "";
  if (!_dataaiLastResult) { dataaiPreviewWrap.style.display = "none"; return; }

  var rows = [];
  var fmt = _dataaiLastFormat;

  if (fmt === "json") {
    try {
      var arr = JSON.parse(_dataaiLastResult);
      if (!Array.isArray(arr) || arr.length === 0) return;
      var keys = Object.keys(arr[0]);
      rows.push(keys);
      for (var i = 0; i < arr.length; i++) {
        rows.push(keys.map(function (k) { return arr[i][k] == null ? "" : String(arr[i][k]); }));
      }
    } catch (e) { return; }
  } else {
    var delim = fmt === "tsv" ? "\t" : ",";
    rows = parseDataaiCsv(_dataaiLastResult, delim);
  }

  if (rows.length === 0) return;

  var table = document.createElement("table");
  table.className = "dev-table";
  var thead = document.createElement("thead");
  var headerTr = document.createElement("tr");
  var numTh = document.createElement("th");
  numTh.textContent = "#";
  numTh.style.width = "40px";
  headerTr.appendChild(numTh);
  for (var c = 0; c < rows[0].length; c++) {
    var th = document.createElement("th");
    th.textContent = rows[0][c];
    headerTr.appendChild(th);
  }
  thead.appendChild(headerTr);
  table.appendChild(thead);

  var tbody = document.createElement("tbody");
  for (var r = 1; r < rows.length; r++) {
    var tr = document.createElement("tr");
    var numTd = document.createElement("td");
    numTd.textContent = r;
    numTd.style.color = "var(--muted)";
    tr.appendChild(numTd);
    for (var c2 = 0; c2 < rows[0].length; c2++) {
      var td = document.createElement("td");
      td.textContent = (rows[r] && rows[r][c2]) || "";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  var wrap = document.createElement("div");
  wrap.className = "dev-table-wrap";
  wrap.style.maxHeight = "400px";
  wrap.appendChild(table);
  dataaiPreviewWrap.appendChild(wrap);
  dataaiPreviewWrap.style.display = "block";
}

// 생성
dataaiGenerateBtn.addEventListener("click", async function () {
  var prompt = dataaiPrompt.value.trim();
  if (!prompt) { setDataaiStatus("데이터 설명을 입력하세요.", "error"); return; }

  var fmt = dataaiFormat.value;
  var count = parseInt(dataaiCount.value) || 10;

  startLoadingAnimation("AI가 데이터를 생성 중입니다");
  dataaiGenerateBtn.disabled = true;
  dataaiResultWrap.style.display = "none";
  dataaiPreviewWrap.style.display = "none";
  var startTime = Date.now();

  try {
    var r = await fetch("/api/dataai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt, format: fmt, count: count }),
    });
    var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    var res = await r.json();
    if (!res.ok) {
      setDataaiStatus(res.error || "생성 실패", "error");
      return;
    }
    _dataaiLastResult = res.result;
    _dataaiLastPrompt = prompt;
    _dataaiLastFormat = fmt;
    dataaiResult.textContent = res.result;
    dataaiResultWrap.style.display = "block";
    updateLinkButtons();
    renderDataaiPreview();
    var actualCount = res.count || count;
    var savedMsg = res.saved_id ? " (DB 저장 ID: " + res.saved_id + ")" : "";
    setDataaiStatus(fmt.toUpperCase() + " 형식으로 " + actualCount + "건 생성 완료 (" + elapsed + "초)" + savedMsg, "success");
    loadDataaiSaves();
  } catch (e) {
    setDataaiStatus("요청 실패: " + e.message, "error");
  } finally {
    dataaiGenerateBtn.disabled = false;
  }
});

// 복사
dataaiCopyBtn.addEventListener("click", function () {
  navigator.clipboard.writeText(_dataaiLastResult).then(function () {
    setDataaiStatus("클립보드에 복사 완료", "success");
  });
});

// 다운로드
dataaiDownloadBtn.addEventListener("click", function () {
  if (!_dataaiLastResult) return;
  var ext = _dataaiLastFormat === "json" ? "json" : _dataaiLastFormat === "tsv" ? "tsv" : "csv";
  var mime = ext === "json" ? "application/json" : "text/csv";
  var blob = new Blob([_dataaiLastResult], { type: mime + ";charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "data-ai." + ext;
  a.click();
  URL.revokeObjectURL(url);
  setDataaiStatus("다운로드 완료", "success");
});

// CSV 편집기로 보내기
dataaiToCsvBtn.addEventListener("click", function () {
  if (!_dataaiLastResult) return;
  var text = _dataaiLastResult;

  if (_dataaiLastFormat === "json") {
    try {
      var arr = JSON.parse(text);
      if (!Array.isArray(arr) || arr.length === 0) { setDataaiStatus("빈 JSON 배열입니다.", "error"); return; }
      var keys = Object.keys(arr[0]);
      var lines = [keys.join(",")];
      for (var i = 0; i < arr.length; i++) {
        lines.push(keys.map(function (k) {
          var v = String(arr[i][k] == null ? "" : arr[i][k]);
          if (v.indexOf(",") !== -1 || v.indexOf('"') !== -1 || v.indexOf("\n") !== -1) {
            return '"' + v.replace(/"/g, '""') + '"';
          }
          return v;
        }).join(","));
      }
      text = lines.join("\n");
    } catch (e) {
      setDataaiStatus("JSON 파싱 실패: " + e.message, "error");
      return;
    }
  }

  if (typeof loadFromClipboardText === "function") {
    switchToTab("csv");
    loadFromClipboardText(text);
  } else {
    setDataaiStatus("CSV 편집기를 찾을 수 없습니다.", "error");
  }
});

// JSON 정렬로 보내기
dataaiToJsonBtn.addEventListener("click", function () {
  if (!_dataaiLastResult) return;
  var jsonInput = document.getElementById("jsonFmtInput");
  if (jsonInput) {
    jsonInput.value = _dataaiLastResult;
    switchToTab("jsonformat");
    // 자동 정렬
    var fmtBtn = document.getElementById("jsonFmtBtn");
    if (fmtBtn) fmtBtn.click();
  } else {
    setDataaiStatus("JSON 정렬을 찾을 수 없습니다.", "error");
  }
});

// DB 저장
dataaiSaveBtn.addEventListener("click", async function () {
  if (!_dataaiLastResult) { setDataaiStatus("저장할 데이터가 없습니다.", "error"); return; }
  try {
    var r = await fetch("/api/dataai/saves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: _dataaiLastPrompt,
        format: _dataaiLastFormat,
        count: parseInt(dataaiCount.value) || 10,
        result: _dataaiLastResult,
      }),
    });
    var res = await r.json();
    if (!res.ok) { setDataaiStatus(res.error || "저장 실패", "error"); return; }
    setDataaiStatus("DB 저장 완료 (ID: " + res.id + ")", "success");
    loadDataaiSaves();
  } catch (e) {
    setDataaiStatus("저장 실패: " + e.message, "error");
  }
});

// 저장 목록 로드
async function loadDataaiSaves() {
  try {
    var r = await fetch("/api/dataai/saves");
    var res = await r.json();
    dataaiSavesBody.innerHTML = "";
    if (!res.items || res.items.length === 0) {
      dataaiSavesBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);">저장된 항목이 없습니다.</td></tr>';
      return;
    }
    for (var i = 0; i < res.items.length; i++) {
      var item = res.items[i];
      var tr = document.createElement("tr");
      var promptText = item.prompt.length > 40 ? item.prompt.substring(0, 40) + "..." : item.prompt;
      tr.innerHTML =
        "<td>" + item.id + "</td>" +
        "<td title=\"" + item.prompt.replace(/"/g, "&quot;") + "\">" + escapeHtml(promptText) + "</td>" +
        "<td>" + item.format.toUpperCase() + "</td>" +
        "<td>" + item.created_at + "</td>" +
        '<td class="row-actions">' +
        '<button class="dataai-load-btn" data-id="' + item.id + '">불러오기</button>' +
        '<button class="dataai-del-btn" data-id="' + item.id + '">삭제</button>' +
        "</td>";
      dataaiSavesBody.appendChild(tr);
    }
    dataaiSavesBody.querySelectorAll(".dataai-load-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { loadDataaiSave(parseInt(btn.dataset.id)); });
    });
    dataaiSavesBody.querySelectorAll(".dataai-del-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { deleteDataaiSave(parseInt(btn.dataset.id)); });
    });
  } catch (e) {
    // 목록 로드 실패 무시
  }
}

async function loadDataaiSave(id) {
  try {
    var r = await fetch("/api/dataai/saves/" + id);
    var res = await r.json();
    if (res.error) { setDataaiStatus(res.error, "error"); return; }
    dataaiPrompt.value = res.prompt;
    dataaiFormat.value = res.format;
    dataaiCount.value = res.count;
    _dataaiLastResult = res.result;
    _dataaiLastPrompt = res.prompt;
    _dataaiLastFormat = res.format;
    dataaiResult.textContent = res.result;
    dataaiResultWrap.style.display = "block";
    updateLinkButtons();
    renderDataaiPreview();
    setDataaiStatus("저장 #" + id + " 불러오기 완료", "success");
  } catch (e) {
    setDataaiStatus("불러오기 실패: " + e.message, "error");
  }
}

async function deleteDataaiSave(id) {
  if (!confirm("이 저장을 삭제하시겠습니까?")) return;
  try {
    var r = await fetch("/api/dataai/saves/" + id, { method: "DELETE" });
    var res = await r.json();
    if (!res.ok) { setDataaiStatus(res.error || "삭제 실패", "error"); return; }
    setDataaiStatus("삭제 완료", "success");
    loadDataaiSaves();
  } catch (e) {
    setDataaiStatus("삭제 실패: " + e.message, "error");
  }
}

// Ctrl+Enter로 생성
dataaiPrompt.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    dataaiGenerateBtn.click();
  }
});

// 초기 로드
loadDataaiSaves();
