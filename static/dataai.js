// --- Data AI ---
(function() {
var $dataaiPrompt = $("#dataaiPrompt");
var $dataaiFormat = $("#dataaiFormat");
var $dataaiCount = $("#dataaiCount");
var $dataaiGenerateBtn = $("#dataaiGenerateBtn");
var $dataaiStatus = $("#dataaiStatus");
var $dataaiResultWrap = $("#dataaiResultWrap");
var $dataaiResult = $("#dataaiResult");
var $dataaiCopyBtn = $("#dataaiCopyBtn");
var $dataaiDownloadBtn = $("#dataaiDownloadBtn");
var $dataaiToCsvBtn = $("#dataaiToCsvBtn");
var $dataaiToJsonBtn = $("#dataaiToJsonBtn");
var $dataaiSaveBtn = $("#dataaiSaveBtn");
var $dataaiPreviewWrap = $("#dataaiPreviewWrap");
var $dataaiProvider = $("#dataaiProvider");
var $dataaiSavesBody = $("#dataaiSavesTable tbody");

loadAiProviders($("#dataaiProvider")[0]);

var _dataaiLastResult = "";
var _dataaiLastPrompt = "";
var _dataaiLastFormat = "csv";
var _dataaiLoadingTimer = null;

function setDataaiStatus(msg, type) {
  clearInterval(_dataaiLoadingTimer);
  _dataaiLoadingTimer = null;
  $dataaiStatus.css("display", msg ? "block" : "none");
  $dataaiStatus.text(msg);
  $dataaiStatus.attr("class", "dataai-status" + (type ? " " + type : ""));
}

function startLoadingAnimation(baseMsg) {
  var dots = 0;
  $dataaiStatus.css("display", "block");
  $dataaiStatus.attr("class", "dataai-status loading");
  $dataaiStatus.text(baseMsg);
  _dataaiLoadingTimer = setInterval(function () {
    dots = (dots + 1) % 4;
    $dataaiStatus.text(baseMsg + ".".repeat(dots));
  }, 400);
}

// 탭 전환 유틸
function switchToTab(tabName) {
  $(".nav-btn").removeClass("active");
  $(".tab-content").removeClass("active");
  var $btn = $('.nav-btn[data-tab="' + tabName + '"]');
  var $tab = $('.tab-content[data-tab="' + tabName + '"]');
  if ($btn.length) $btn.addClass("active");
  if ($tab.length) $tab.addClass("active");
}

// 연계 버튼 표시 업데이트
function updateLinkButtons() {
  var fmt = _dataaiLastFormat;
  $dataaiToCsvBtn.css("display", (fmt === "csv" || fmt === "tsv" || fmt === "json") ? "" : "none");
  $dataaiToJsonBtn.css("display", (fmt === "json") ? "" : "none");
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
  $dataaiPreviewWrap.html("");
  if (!_dataaiLastResult) { $dataaiPreviewWrap.hide(); return; }

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

  var $table = $("<table>").addClass("dev-table");
  var $thead = $("<thead>");
  var $headerTr = $("<tr>");
  var $numTh = $("<th>").text("#").css("width", "40px");
  $headerTr.append($numTh);
  for (var c = 0; c < rows[0].length; c++) {
    var $th = $("<th>").text(rows[0][c]);
    $headerTr.append($th);
  }
  $thead.append($headerTr);
  $table.append($thead);

  var $tbody = $("<tbody>");
  for (var r = 1; r < rows.length; r++) {
    var $tr = $("<tr>");
    var $numTd = $("<td>").text(r).css("color", "var(--muted)");
    $tr.append($numTd);
    for (var c2 = 0; c2 < rows[0].length; c2++) {
      var $td = $("<td>").text((rows[r] && rows[r][c2]) || "");
      $tr.append($td);
    }
    $tbody.append($tr);
  }
  $table.append($tbody);

  var $wrap = $("<div>").addClass("dev-table-wrap").css("maxHeight", "400px");
  $wrap.append($table);
  $dataaiPreviewWrap.append($wrap);
  $dataaiPreviewWrap.css("display", "block");
}

// 생성
$dataaiGenerateBtn.on("click", async function () {
  var prompt = $dataaiPrompt.val().trim();
  if (!prompt) { setDataaiStatus(t("dataai.input_required"), "error"); return; }

  var fmt = $dataaiFormat.val();
  var count = parseInt($dataaiCount.val()) || 10;

  startLoadingAnimation(t("dataai.generating"));
  $dataaiGenerateBtn.prop("disabled", true);
  $dataaiResultWrap.hide();
  $dataaiPreviewWrap.hide();
  var startTime = Date.now();

  try {
    var r = await fetch("/api/dataai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt, format: fmt, count: count, provider: $dataaiProvider.val() }),
    });
    var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    var res = await r.json();
    if (!res.ok) {
      setDataaiStatus(res.error || t("dataai.gen_fail"), "error");
      return;
    }
    _dataaiLastResult = res.result;
    _dataaiLastPrompt = prompt;
    _dataaiLastFormat = fmt;
    $dataaiResult.text(res.result);
    $dataaiResultWrap.css("display", "block");
    updateLinkButtons();
    renderDataaiPreview();
    var actualCount = res.count || count;
    var savedMsg = res.saved_id ? t("dataai.db_saved", {id: res.saved_id}) : "";
    setDataaiStatus(fmt.toUpperCase() + " " + t("dataai.gen_done", {count: actualCount}) + " (" + elapsed + "s)" + savedMsg, "success");
    loadDataaiSaves();
  } catch (e) {
    setDataaiStatus(t("dataai.request_fail", {msg: e.message}), "error");
  } finally {
    $dataaiGenerateBtn.prop("disabled", false);
  }
});

// 복사
$dataaiCopyBtn.on("click", function () {
  navigator.clipboard.writeText(_dataaiLastResult).then(function () {
    setDataaiStatus(t("common.copy_done"), "success");
    showToast(t("common.copy_done"), "success");
  });
});

// 다운로드
$dataaiDownloadBtn.on("click", function () {
  if (!_dataaiLastResult) return;
  var ext = _dataaiLastFormat === "json" ? "json" : _dataaiLastFormat === "tsv" ? "tsv" : "csv";
  var mime = ext === "json" ? "application/json" : "text/csv";
  var blob = new Blob([_dataaiLastResult], { type: mime + ";charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var $a = $("<a>").attr("href", url).attr("download", "data-ai." + ext);
  $a[0].click();
  URL.revokeObjectURL(url);
  setDataaiStatus(t("dataai.download_done"), "success");
  showToast(t("dataai.download_done"), "success");
});

// CSV 편집기로 보내기
$dataaiToCsvBtn.on("click", function () {
  if (!_dataaiLastResult) return;
  var text = _dataaiLastResult;

  if (_dataaiLastFormat === "json") {
    try {
      var arr = JSON.parse(text);
      if (!Array.isArray(arr) || arr.length === 0) { setDataaiStatus(t("dataai.empty_json"), "error"); return; }
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
      setDataaiStatus(t("dataai.json_fail", {msg: e.message}), "error");
      return;
    }
  }

  if (typeof loadFromClipboardText === "function") {
    switchToTab("csv");
    loadFromClipboardText(text);
  } else {
    setDataaiStatus(t("dataai.no_csv_editor"), "error");
  }
});

// JSON 정렬로 보내기
$dataaiToJsonBtn.on("click", function () {
  if (!_dataaiLastResult) return;
  var $jsonInput = $("#jsonFmtInput");
  if ($jsonInput.length) {
    $jsonInput.val(_dataaiLastResult);
    switchToTab("jsonformat");
    // 자동 정렬
    var $fmtBtn = $("#jsonFmtBtn");
    if ($fmtBtn.length) $fmtBtn[0].click();
  } else {
    setDataaiStatus(t("dataai.no_json_editor"), "error");
  }
});

// DB 저장
$dataaiSaveBtn.on("click", async function () {
  if (!_dataaiLastResult) { setDataaiStatus(t("dataai.no_data_save"), "error"); return; }
  try {
    var r = await fetch("/api/dataai/saves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: _dataaiLastPrompt,
        format: _dataaiLastFormat,
        count: parseInt($dataaiCount.val()) || 10,
        result: _dataaiLastResult,
      }),
    });
    var res = await r.json();
    if (!res.ok) { setDataaiStatus(res.error || t("dataai.save_fail"), "error"); showToast(res.error || t("dataai.save_fail"), "error"); return; }
    setDataaiStatus(t("dataai.save_done", {id: res.id}), "success");
    showToast(t("dataai.save_done", {id: res.id}), "success");
    loadDataaiSaves();
  } catch (e) {
    setDataaiStatus(t("dataai.save_fail") + ": " + e.message, "error");
    showToast(t("dataai.save_fail") + ": " + e.message, "error");
  }
});

// 저장 목록 로드
async function loadDataaiSaves() {
  try {
    var res = await $.getJSON("/api/dataai/saves");
    $dataaiSavesBody.html("");
    if (!res.items || res.items.length === 0) {
      $dataaiSavesBody.html('<tr><td colspan="5" style="text-align:center;color:var(--muted);">' + t("dataai.no_saved") + '</td></tr>');
      return;
    }
    for (var i = 0; i < res.items.length; i++) {
      var item = res.items[i];
      var $tr = $("<tr>");
      var promptText = item.prompt.length > 40 ? item.prompt.substring(0, 40) + "..." : item.prompt;
      $tr.html(
        "<td>" + item.id + "</td>" +
        "<td title=\"" + item.prompt.replace(/"/g, "&quot;") + "\">" + escapeHtml(promptText) + "</td>" +
        "<td>" + item.format.toUpperCase() + "</td>" +
        "<td>" + item.created_at + "</td>" +
        '<td class="row-actions">' +
        '<button class="dataai-load-btn" data-id="' + item.id + '">' + t("common.load") + '</button>' +
        '<button class="dataai-del-btn" data-id="' + item.id + '">' + t("common.delete") + '</button>' +
        "</td>"
      );
      $dataaiSavesBody.append($tr);
    }
    $dataaiSavesBody.find(".dataai-load-btn").on("click", function () {
      loadDataaiSave(parseInt($(this).data("id")));
    });
    $dataaiSavesBody.find(".dataai-del-btn").on("click", function () {
      deleteDataaiSave(parseInt($(this).data("id")));
    });
  } catch (e) {
    // 목록 로드 실패 무시
  }
}

async function loadDataaiSave(id) {
  try {
    var res = await $.getJSON("/api/dataai/saves/" + id);
    if (res.error) { setDataaiStatus(res.error, "error"); return; }
    $dataaiPrompt.val(res.prompt);
    $dataaiFormat.val(res.format);
    $dataaiCount.val(res.count);
    _dataaiLastResult = res.result;
    _dataaiLastPrompt = res.prompt;
    _dataaiLastFormat = res.format;
    $dataaiResult.text(res.result);
    $dataaiResultWrap.css("display", "block");
    updateLinkButtons();
    renderDataaiPreview();
    setDataaiStatus(t("dataai.load_done", {id: id}), "success");
  } catch (e) {
    setDataaiStatus(t("common.load_fail") + ": " + e.message, "error");
  }
}

async function deleteDataaiSave(id) {
  if (!confirm(t("dataai.confirm_delete"))) return;
  try {
    var res = await $.ajax({
      url: "/api/dataai/saves/" + id,
      method: "DELETE",
      dataType: "json"
    });
    if (!res.ok) { setDataaiStatus(res.error || t("common.delete_fail"), "error"); showToast(res.error || t("common.delete_fail"), "error"); return; }
    setDataaiStatus(t("common.delete_done"), "success");
    showToast(t("common.delete_done"), "success");
    loadDataaiSaves();
  } catch (e) {
    setDataaiStatus(t("common.delete_fail") + ": " + e.message, "error");
    showToast(t("common.delete_fail") + ": " + e.message, "error");
  }
}

// Ctrl+Enter로 생성
$dataaiPrompt.on("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    $dataaiGenerateBtn[0].click();
  }
});

// 초기 로드
i18nReady(loadDataaiSaves);
$(window).on("langchange", loadDataaiSaves);
})();
