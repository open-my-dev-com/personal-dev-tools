// ── Mock 서버 ──
(function () {
  var $mockForm = $("#mockForm");
  var $nameInput = $("#name");
  var $methodInput = $("#method");
  var $pathInput = $("#path");
  var $statusInput = $("#status");
  var $requestJsonInput = $("#requestJson");
  var $responseHeadersInput = $("#responseHeaders");
  var $responseBodyInput = $("#responseBody");
  var $previewBtn = $("#previewBtn");
  var $saveBtn = $("#saveBtn");
  var $resetBtn = $("#resetBtn");
  var $statusText = $("#statusText");
  var $jsonTableWrap = $("#jsonTableWrap");
  var $mockTable = $("#mockTable");
  var $refreshLogsBtn = $("#refreshLogsBtn");
  var $clearLogsBtn = $("#clearLogsBtn");
  var $logTable = $("#logTable");

  if ($mockForm.length === 0) return;

  var editingId = null; // 수정 중인 mock ID

  function setStatus(msg, isError) {
    $statusText.text(msg);
    $statusText.css("color", isError ? "var(--danger)" : "");
    if (msg) setTimeout(function () { $statusText.text(""); }, 3000);
  }

  function esc(s) {
    if (s === null || s === undefined) return "";
    var $d = $("<div>");
    $d.text(typeof s === "string" ? s : JSON.stringify(s));
    return $d.html();
  }

  function prettyJson(obj) {
    if (obj === null || obj === undefined) return "";
    try {
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return String(obj);
    }
  }

  function truncate(s, len) {
    if (!s) return "";
    if (s.length > len) return s.substring(0, len) + "...";
    return s;
  }

  // ── Mock 목록 ──
  function loadMocks() {
    $.getJSON("/api/mocks").done(function (data) {
      var items = data.items || [];
      var $tbody = $mockTable.find("tbody");
      $tbody.html("");

      if (items.length === 0) {
        $tbody.html('<tr><td colspan="7" style="text-align:center;color:#888">' + t("mock.no_mocks") + '</td></tr>');
        return;
      }

      items.forEach(function (m) {
        var $tr = $("<tr>");
        var reqSummary = m.request_json ? truncate(JSON.stringify(m.request_json), 40) : t("mock.all_match");
        var resSummary = m.response_body ? truncate(JSON.stringify(m.response_body), 40) : "";
        $tr.html(
          "<td>" + m.id + "</td>" +
          "<td>" + esc(m.name) + "</td>" +
          '<td><span class="method-badge">' + esc(m.method) + "</span></td>" +
          "<td><code>" + esc(m.path) + "</code></td>" +
          '<td class="text-sm">' + esc(reqSummary) + "</td>" +
          '<td class="text-sm">' + m.response_status + " / " + esc(resSummary) + "</td>" +
          '<td><button class="mock-edit-btn" data-id="' + m.id + '">' + t("common.edit") + '</button> ' +
          '<button class="mock-del-btn" data-id="' + m.id + '">' + t("common.delete") + '</button></td>');
        $tbody.append($tr);
      });

      // 수정 버튼
      $tbody.find(".mock-edit-btn").on("click", function () {
        var id = parseInt($(this).data("id"));
        var mock = items.find(function (m) { return m.id === id; });
        if (mock) loadToForm(mock);
      });

      // 삭제 버튼
      $tbody.find(".mock-del-btn").on("click", function () {
        var id = parseInt($(this).data("id"));
        if (!confirm(t("mock.confirm_delete", {id: id}))) return;
        $.ajax({
          url: "/api/mocks/" + id,
          method: "DELETE",
          dataType: "json"
        }).done(function (data) {
          if (data.ok) {
            setStatus(t("common.delete_done"));
            showToast(t("common.delete_done"), "success");
            loadMocks();
            if (editingId === id) resetForm();
          } else {
            setStatus(data.error || t("common.delete_fail"), true);
            showToast(data.error || t("common.delete_fail"), "error");
          }
        }).fail(function (jqXHR, textStatus, errorThrown) {
          setStatus(t("common.delete_fail") + ": " + errorThrown, true);
          showToast(t("common.delete_fail") + ": " + errorThrown, "error");
        });
      });
    }).fail(function (jqXHR, textStatus, errorThrown) {
      setStatus(t("common.load_fail") + ": " + errorThrown, true);
    });
  }

  function loadToForm(mock) {
    editingId = mock.id;
    $nameInput.val(mock.name);
    $methodInput.val(mock.method);
    $pathInput.val(mock.path);
    $statusInput.val(mock.response_status);
    $requestJsonInput.val(mock.request_json ? prettyJson(mock.request_json) : "");
    $responseHeadersInput.val(prettyJson(mock.response_headers || {}));
    $responseBodyInput.val(mock.response_body ? prettyJson(mock.response_body) : "");
    $saveBtn.text(t("mock.edit_save"));
    setStatus(t("mock.edit_mode", {id: mock.id}));
    $mockForm[0].scrollIntoView({ behavior: "smooth" });
  }

  function resetForm() {
    editingId = null;
    $mockForm[0].reset();
    $responseHeadersInput.val("{}");
    $saveBtn.text(t("common.save"));
    $jsonTableWrap.html("");
    setStatus("");
  }

  // ── 저장/수정 ──
  $mockForm.on("submit", function (e) {
    e.preventDefault();
    var payload = {
      name: $nameInput.val().trim(),
      method: $methodInput.val(),
      path: $pathInput.val().trim(),
      response_status: parseInt($statusInput.val()) || 200,
      request_json: $requestJsonInput.val().trim() || null,
      response_headers: $responseHeadersInput.val().trim() || "{}",
      response_body: $responseBodyInput.val().trim() || null,
    };

    if (!payload.name) { setStatus(t("mock.name_required"), true); return; }
    if (!payload.path) { setStatus(t("mock.path_required"), true); return; }

    // JSON 유효성 검사
    if (payload.request_json) {
      try { JSON.parse(payload.request_json); } catch (e) {
        setStatus(t("mock.invalid_request_json"), true); return;
      }
    }
    try { JSON.parse(payload.response_headers); } catch (e) {
      setStatus(t("mock.invalid_header_json"), true); return;
    }
    if (payload.response_body) {
      try { JSON.parse(payload.response_body); } catch (e) {
        setStatus(t("mock.invalid_body_json"), true); return;
      }
    }

    var url, method;
    if (editingId) {
      url = "/api/mocks/" + editingId;
      method = "PUT";
    } else {
      url = "/api/mocks";
      method = "POST";
    }

    $.ajax({
      url: url,
      method: method,
      contentType: "application/json",
      data: JSON.stringify(payload),
      dataType: "json"
    }).done(function (data) {
      if (data.ok || data.id) {
        setStatus(editingId ? t("mock.edit_done") : t("mock.save_done_id", {id: data.id}));
        showToast(editingId ? t("mock.edit_done") : t("mock.save_done_id", {id: data.id}), "success");
        resetForm();
        loadMocks();
      } else {
        setStatus(data.error || t("common.save_fail"), true);
        showToast(data.error || t("common.save_fail"), "error");
      }
    }).fail(function (jqXHR, textStatus, errorThrown) {
      setStatus(t("common.save_fail") + ": " + errorThrown, true);
      showToast(t("common.save_fail") + ": " + errorThrown, "error");
    });
  });

  $resetBtn.on("click", resetForm);

  // ── JSON 미리보기/편집 (응답 바디) ──
  $previewBtn.on("click", function () {
    var raw = $responseBodyInput.val().trim();
    if (!raw) {
      $jsonTableWrap.html('<p style="color:#888">' + t("mock.body_required") + '</p>');
      return;
    }
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      $jsonTableWrap.html('<p style="color:var(--danger)">' + t("mock.json_parse_error", {msg: esc(e.message)}) + "</p>");
      return;
    }
    renderJsonTable(parsed);
  });

  function renderJsonTable(data) {
    if (Array.isArray(data)) {
      renderArrayTable(data);
    } else if (typeof data === "object" && data !== null) {
      renderObjectTable(data);
    } else {
      $jsonTableWrap.html("<pre>" + esc(JSON.stringify(data, null, 2)) + "</pre>");
    }
  }

  function renderArrayTable(arr) {
    if (arr.length === 0) {
      $jsonTableWrap.html('<p style="color:#888">' + t("mock.empty_array") + '</p>');
      return;
    }
    // 배열의 첫 항목에서 키 추출
    var keys = [];
    arr.forEach(function (item) {
      if (typeof item === "object" && item !== null) {
        Object.keys(item).forEach(function (k) {
          if (keys.indexOf(k) === -1) keys.push(k);
        });
      }
    });

    if (keys.length === 0) {
      $jsonTableWrap.html("<pre>" + esc(JSON.stringify(arr, null, 2)) + "</pre>");
      return;
    }

    var html = '<table class="json-edit-table"><thead><tr>';
    html += "<th>#</th>";
    keys.forEach(function (k) { html += "<th>" + esc(k) + "</th>"; });
    html += "<th>" + t("common.action") + "</th></tr></thead><tbody>";

    arr.forEach(function (item, idx) {
      html += "<tr>";
      html += "<td>" + (idx + 1) + "</td>";
      keys.forEach(function (k) {
        var val = item[k];
        var display = val === null || val === undefined ? "" :
          typeof val === "object" ? JSON.stringify(val) : String(val);
        html += '<td><input class="json-cell" data-idx="' + idx + '" data-key="' + esc(k) + '" value="' + esc(display) + '" /></td>';
      });
      html += '<td><button class="json-clone-btn" data-idx="' + idx + '">' + t("mock.clone") + '</button></td>';
      html += "</tr>";
    });
    html += "</tbody></table>";
    html += '<button type="button" class="json-apply-btn" style="margin-top:8px">' + t("mock.apply_edit") + '</button>';

    $jsonTableWrap.html(html);

    // 복제 버튼
    $jsonTableWrap.find(".json-clone-btn").on("click", function () {
      var idx = parseInt($(this).data("idx"));
      var clone = JSON.parse(JSON.stringify(arr[idx]));
      arr.splice(idx + 1, 0, clone);
      $responseBodyInput.val(JSON.stringify(arr, null, 2));
      renderArrayTable(arr);
    });

    // 반영 버튼
    var $applyBtn = $jsonTableWrap.find(".json-apply-btn");
    if ($applyBtn.length) {
      $applyBtn.on("click", function () {
        $jsonTableWrap.find(".json-cell").each(function () {
          var $input = $(this);
          var idx = parseInt($input.data("idx"));
          var key = $input.data("key");
          var val = $input.val();
          // 숫자/boolean/null 자동 변환
          if (val === "null") arr[idx][key] = null;
          else if (val === "true") arr[idx][key] = true;
          else if (val === "false") arr[idx][key] = false;
          else if (val !== "" && !isNaN(val)) arr[idx][key] = Number(val);
          else {
            try { arr[idx][key] = JSON.parse(val); } catch (e) { arr[idx][key] = val; }
          }
        });
        $responseBodyInput.val(JSON.stringify(arr, null, 2));
        setStatus(t("mock.edit_applied"));
      });
    }
  }

  function renderObjectTable(obj) {
    var keys = Object.keys(obj);
    var html = '<table class="json-edit-table"><thead><tr><th>' + t("json.key_ph") + '</th><th>' + t("json.value_ph") + '</th></tr></thead><tbody>';
    keys.forEach(function (k) {
      var val = obj[k];
      var display = val === null || val === undefined ? "" :
        typeof val === "object" ? JSON.stringify(val) : String(val);
      html += "<tr>";
      html += "<td>" + esc(k) + "</td>";
      html += '<td><input class="json-cell" data-key="' + esc(k) + '" value="' + esc(display) + '" /></td>';
      html += "</tr>";
    });
    html += "</tbody></table>";
    html += '<button type="button" class="json-apply-btn" style="margin-top:8px">' + t("mock.apply_edit") + '</button>';
    $jsonTableWrap.html(html);

    var $applyBtn = $jsonTableWrap.find(".json-apply-btn");
    if ($applyBtn.length) {
      $applyBtn.on("click", function () {
        $jsonTableWrap.find(".json-cell").each(function () {
          var $input = $(this);
          var key = $input.data("key");
          var val = $input.val();
          if (val === "null") obj[key] = null;
          else if (val === "true") obj[key] = true;
          else if (val === "false") obj[key] = false;
          else if (val !== "" && !isNaN(val)) obj[key] = Number(val);
          else {
            try { obj[key] = JSON.parse(val); } catch (e) { obj[key] = val; }
          }
        });
        $responseBodyInput.val(JSON.stringify(obj, null, 2));
        setStatus(t("mock.edit_applied"));
      });
    }
  }

  // ── 로그 ──
  function loadLogs() {
    $.getJSON("/api/logs?limit=200").done(function (data) {
      var items = data.items || [];
      var $tbody = $logTable.find("tbody");
      $tbody.html("");

      if (items.length === 0) {
        $tbody.html('<tr><td colspan="7" style="text-align:center;color:#888">' + t("mock.no_logs") + '</td></tr>');
        return;
      }

      items.forEach(function (log) {
        var $tr = $("<tr>");
        var reqBody = log.request_json ? truncate(JSON.stringify(log.request_json), 30) : truncate(log.request_body, 30);
        var resBody = log.response_body ? truncate(JSON.stringify(log.response_body), 30) : "";
        $tr.html(
          "<td>" + log.id + "</td>" +
          "<td>" + esc(log.created_at) + "</td>" +
          "<td>" + (log.matched ? '<span style="color:#059669">' + String.fromCharCode(10003) + ' #' + log.matched_mock_id + "</span>" : '<span style="color:#dc2626">' + String.fromCharCode(10007) + '</span>') + "</td>" +
          '<td><span class="method-badge">' + esc(log.method) + "</span></td>" +
          "<td><code>" + esc(log.path) + "</code></td>" +
          '<td class="text-sm">' + esc(reqBody) + "</td>" +
          '<td class="text-sm">' + log.response_status + " / " + esc(resBody) + "</td>");
        $tbody.append($tr);
      });
    }).fail(function (jqXHR, textStatus, errorThrown) {
      setStatus(t("common.load_fail") + ": " + errorThrown, true);
    });
  }

  $refreshLogsBtn.on("click", loadLogs);

  $clearLogsBtn.on("click", function () {
    if (!confirm(t("mock.confirm_clear_logs"))) return;
    $.ajax({
      url: "/api/logs",
      method: "DELETE",
      dataType: "json"
    }).done(function (data) {
      if (data.ok) {
        setStatus(t("mock.log_cleared"));
        showToast(t("mock.log_cleared"), "success");
        loadLogs();
      }
    }).fail(function (jqXHR, textStatus, errorThrown) {
      setStatus(t("common.delete_fail") + ": " + errorThrown, true);
      showToast(t("common.delete_fail") + ": " + errorThrown, "error");
    });
  });

  // 초기 로드
  loadMocks();
  loadLogs();
  i18nReady(function () { loadMocks(); loadLogs(); });
})();
