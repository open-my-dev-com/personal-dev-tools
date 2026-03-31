// ── Mock 서버 ──
(function () {
  var $mockForm = $("#mockForm");
  var $nameInput = $("#name");
  var $methodInput = $("#method");
  var $pathInput = $("#path");
  var $statusInput = $("#status");
  var $requestJsonInput = $("#requestJson");
  var $responseHeaderRows = $("#responseHeaderRows");
  var $addResponseHeaderBtn = $("#addResponseHeaderBtn");
  var $responseBodyInput = $("#responseBody");
  var $requestJsonForm = $("#requestJsonForm");
  var $responseBodyForm = $("#responseBodyForm");
  var $saveBtn = $("#saveBtn");
  var $resetBtn = $("#resetBtn");
  var $statusText = $("#statusText");
  var $mockTable = $("#mockTable");
  var $refreshLogsBtn = $("#refreshLogsBtn");
  var $clearLogsBtn = $("#clearLogsBtn");
  var $logFilter = $("#logFilter");
  var $logTable = $("#logTable");

  if ($mockForm.length === 0) return;

  var editingId = null; // 수정 중인 mock ID
  var headerOptions = []; // API에서 로드된 헤더 목록

  // ── 헤더 드롭다운 관련 ──
  function loadHeaderOptions(callback) {
    $.getJSON("/api/mock-headers").done(function (data) {
      headerOptions = (data.ok && data.items) ? data.items : [];
      if (callback) callback();
    }).fail(function () { headerOptions = []; if (callback) callback(); });
  }

  function buildHeaderSelect(selectedName) {
    var $select = $("<select>").addClass("mock-header-select");
    headerOptions.forEach(function (h) {
      var $opt = $("<option>").val(h.name).text(h.name);
      if (h.name === selectedName) $opt.prop("selected", true);
      $select.append($opt);
    });
    $select.append($("<option>").val("__custom__").text(t("mock.header_custom")));
    if (selectedName && !headerOptions.some(function (h) { return h.name === selectedName; })) {
      $select.prepend($("<option>").val(selectedName).text(selectedName).prop("selected", true));
    }
    return $select;
  }

  function addHeaderRow(name, value) {
    var $row = $("<div>").addClass("mock-header-row");
    var $select = buildHeaderSelect(name || "");
    var $customInput = $("<input>").attr("type", "text").addClass("mock-header-custom-input")
      .attr("placeholder", t("mock.header_name")).val("").hide();
    var $valInput = $("<input>").attr("type", "text").addClass("mock-header-value")
      .attr("placeholder", t("mock.header_value")).val(value || "");
    var $delBtn = $("<button>").attr("type", "button").addClass("btn-sm btn-del").html("&times;");

    $select.on("change", function () {
      if ($(this).val() === "__custom__") {
        $select.hide();
        $customInput.show().focus();
      }
    });
    $customInput.on("blur", function () {
      var customName = $(this).val().trim();
      if (customName) {
        // DB에 커스텀 헤더 저장
        $.ajax({ url: "/api/mock-headers", method: "POST", contentType: "application/json",
          data: JSON.stringify({ name: customName }), dataType: "json" });
        // 현재 select에 옵션 추가하고 선택
        $select.find("option[value='__custom__']").before(
          $("<option>").val(customName).text(customName)
        );
        $select.val(customName).show();
        $customInput.hide();
        // 다음 번을 위해 headerOptions에도 추가
        if (!headerOptions.some(function (h) { return h.name === customName; })) {
          headerOptions.push({ name: customName, is_standard: false });
          headerOptions.sort(function (a, b) { return a.name.localeCompare(b.name); });
        }
      } else {
        $select.val("").show();
        $customInput.hide();
      }
    });
    $delBtn.on("click", function () { $row.remove(); });

    $row.append($select).append($customInput).append($valInput).append($delBtn);
    $responseHeaderRows.append($row);
  }

  function collectHeaders() {
    var headers = {};
    $responseHeaderRows.find(".mock-header-row").each(function () {
      var $row = $(this);
      var $select = $row.find(".mock-header-select");
      var $customInput = $row.find(".mock-header-custom-input");
      var name = $customInput.is(":visible") ? $customInput.val().trim() : $select.val();
      var value = $row.find(".mock-header-value").val().trim();
      if (name && name !== "__custom__") headers[name] = value;
    });
    return headers;
  }

  function populateHeaderRows(headersObj) {
    $responseHeaderRows.empty();
    if (!headersObj || typeof headersObj !== "object") return;
    Object.keys(headersObj).forEach(function (key) {
      addHeaderRow(key, headersObj[key]);
    });
  }

  $addResponseHeaderBtn.on("click", function () { addHeaderRow("", ""); });

  // 헤더 옵션 초기 로드
  loadHeaderOptions();

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
    populateHeaderRows(mock.response_headers || {});
    $responseBodyInput.val(mock.response_body ? prettyJson(mock.response_body) : "");
    $saveBtn.text(t("mock.edit_save"));
    setStatus(t("mock.edit_mode", {id: mock.id}));
    $mockForm[0].scrollIntoView({ behavior: "smooth" });
  }

  function resetForm() {
    editingId = null;
    $mockForm[0].reset();
    $responseHeaderRows.empty();
    $requestJsonForm.empty().hide();
    $requestJsonInput.show();
    $responseBodyForm.empty().hide();
    $responseBodyInput.show();
    $(".mock-mode-btn[data-mode='raw']").addClass("active");
    $(".mock-mode-btn[data-mode='form']").removeClass("active");
    $saveBtn.text(t("common.save"));
    setStatus("");
  }

  // ── 저장/수정 ──
  $mockForm.on("submit", function (e) {
    e.preventDefault();
    // Form 모드인 경우 폼 데이터를 textarea에 동기화
    ["request", "response"].forEach(function (target) {
      var els = getBodyFormElements(target);
      if (els.$form.is(":visible") && els.$form.find(".kv-form-table").length) {
        var isArray = els.$form.find("thead th").length > 3;
        var data = collectKvData(els.$form, isArray);
        els.$textarea.val(JSON.stringify(data, null, 2));
      }
    });

    var payload = {
      name: $nameInput.val().trim(),
      method: $methodInput.val(),
      path: $pathInput.val().trim(),
      response_status: parseInt($statusInput.val()) || 200,
      request_json: $requestJsonInput.val().trim() || null,
      response_headers: JSON.stringify(collectHeaders()),
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

  // ── 바디 입력 모드 토글 (Raw ↔ Form) ──
  function kvAutoType(val) {
    if (val === "null") return null;
    if (val === "true") return true;
    if (val === "false") return false;
    if (val !== "" && !isNaN(val)) return Number(val);
    try { var p = JSON.parse(val); if (typeof p === "object") return p; } catch (_) {}
    return val;
  }

  function renderKvForm($container, data) {
    $container.empty();
    if (Array.isArray(data)) {
      renderKvArray($container, data);
    } else if (typeof data === "object" && data !== null) {
      renderKvObject($container, data);
    } else {
      $container.html('<p style="color:#888">' + t("mock.form_parse_error") + '</p>');
    }
  }

  function renderKvObject($container, obj) {
    var html = '<table class="kv-form-table"><thead><tr><th>' + t("mock.field_key") +
      '</th><th>' + t("mock.field_value") + '</th><th></th></tr></thead><tbody>';
    Object.keys(obj).forEach(function (k) {
      var val = obj[k];
      var display = val === null ? "null" : typeof val === "object" ? JSON.stringify(val) : String(val);
      html += '<tr class="kv-row"><td><input class="kv-key" value="' + esc(k) + '" /></td>' +
        '<td><input class="kv-val" value="' + esc(display) + '" /></td>' +
        '<td><button type="button" class="btn-sm btn-del kv-del">&times;</button></td></tr>';
    });
    html += '</tbody></table>';
    html += '<button type="button" class="btn-sm kv-add">' + t("mock.add_field") + '</button>';
    $container.html(html);
    $container.find(".kv-del").on("click", function () { $(this).closest("tr").remove(); });
    $container.find(".kv-add").on("click", function () {
      var $tbody = $container.find("tbody");
      var $row = $('<tr class="kv-row"><td><input class="kv-key" value="" /></td>' +
        '<td><input class="kv-val" value="" /></td>' +
        '<td><button type="button" class="btn-sm btn-del kv-del">&times;</button></td></tr>');
      $row.find(".kv-del").on("click", function () { $row.remove(); });
      $tbody.append($row);
    });
  }

  function renderKvArray($container, arr) {
    // 배열의 키 추출
    var keys = [];
    arr.forEach(function (item) {
      if (typeof item === "object" && item !== null) {
        Object.keys(item).forEach(function (k) {
          if (keys.indexOf(k) === -1) keys.push(k);
        });
      }
    });
    if (keys.length === 0) {
      $container.html('<p style="color:#888">' + esc(JSON.stringify(arr, null, 2)) + '</p>');
      return;
    }
    var html = '<table class="kv-form-table"><thead><tr><th>#</th>';
    keys.forEach(function (k) { html += '<th>' + esc(k) + '</th>'; });
    html += '<th></th></tr></thead><tbody>';
    arr.forEach(function (item, idx) {
      html += '<tr class="kv-row" data-idx="' + idx + '"><td>' + (idx + 1) + '</td>';
      keys.forEach(function (k) {
        var val = item ? item[k] : undefined;
        var display = val === null || val === undefined ? "" :
          typeof val === "object" ? JSON.stringify(val) : String(val);
        html += '<td><input class="kv-val" data-key="' + esc(k) + '" value="' + esc(display) + '" /></td>';
      });
      html += '<td><button type="button" class="btn-sm btn-del kv-row-del">&times;</button></td></tr>';
    });
    html += '</tbody></table>';
    html += '<button type="button" class="btn-sm kv-add-row">' + t("mock.add_field") + '</button>';
    $container.html(html);
    $container.find(".kv-row-del").on("click", function () { $(this).closest("tr").remove(); });
    $container.find(".kv-add-row").on("click", function () {
      var $tbody = $container.find("tbody");
      var idx = $tbody.find("tr").length;
      var rowHtml = '<tr class="kv-row" data-idx="' + idx + '"><td>' + (idx + 1) + '</td>';
      keys.forEach(function (k) {
        rowHtml += '<td><input class="kv-val" data-key="' + esc(k) + '" value="" /></td>';
      });
      rowHtml += '<td><button type="button" class="btn-sm btn-del kv-row-del">&times;</button></td></tr>';
      var $row = $(rowHtml);
      $row.find(".kv-row-del").on("click", function () { $row.remove(); });
      $tbody.append($row);
    });
  }

  function collectKvData($container, isArray) {
    if (isArray) {
      var keys = [];
      $container.find("thead th").each(function (i) {
        if (i > 0 && $(this).text()) keys.push($(this).text());
      });
      keys.pop(); // 마지막은 액션 열
      var arr = [];
      $container.find("tbody .kv-row").each(function () {
        var obj = {};
        $(this).find(".kv-val").each(function () {
          var key = $(this).data("key");
          obj[key] = kvAutoType($(this).val());
        });
        arr.push(obj);
      });
      return arr;
    } else {
      var result = {};
      $container.find("tbody .kv-row").each(function () {
        var key = $(this).find(".kv-key").val().trim();
        var val = $(this).find(".kv-val").val();
        if (key) result[key] = kvAutoType(val);
      });
      return result;
    }
  }

  function getBodyFormElements(target) {
    if (target === "request") return { $textarea: $requestJsonInput, $form: $requestJsonForm };
    return { $textarea: $responseBodyInput, $form: $responseBodyForm };
  }

  $(document).on("click", ".mock-mode-btn", function () {
    var $btn = $(this);
    var target = $btn.data("target");
    var mode = $btn.data("mode");
    var els = getBodyFormElements(target);

    $btn.addClass("active").siblings(".mock-mode-btn").removeClass("active");

    if (mode === "form") {
      var raw = els.$textarea.val().trim();
      if (!raw) {
        renderKvForm(els.$form, {});
        els.$textarea.hide();
        els.$form.show();
        return;
      }
      try {
        var parsed = JSON.parse(raw);
        renderKvForm(els.$form, parsed);
        els.$textarea.hide();
        els.$form.show();
      } catch (e) {
        showToast(t("mock.form_parse_error"), "error");
        $btn.removeClass("active");
        $btn.siblings("[data-mode='raw']").addClass("active");
      }
    } else {
      // Form → Raw: 폼 데이터 수집 후 textarea에 반영
      if (els.$form.is(":visible") && els.$form.find(".kv-form-table").length) {
        var isArray = els.$form.find("thead th").length > 3;
        var data = collectKvData(els.$form, isArray);
        els.$textarea.val(JSON.stringify(data, null, 2));
      }
      els.$form.hide().empty();
      els.$textarea.show();
    }
  });

  // ── 로그 ──
  function loadLogs() {
    var filter = $logFilter.val() || "all";
    $.getJSON("/api/logs?limit=200&filter=" + filter).done(function (data) {
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
  $logFilter.on("change", loadLogs);

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
