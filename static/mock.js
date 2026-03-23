// ── Mock 서버 ──
(function () {
  var mockForm = document.getElementById("mockForm");
  var nameInput = document.getElementById("name");
  var methodInput = document.getElementById("method");
  var pathInput = document.getElementById("path");
  var statusInput = document.getElementById("status");
  var requestJsonInput = document.getElementById("requestJson");
  var responseHeadersInput = document.getElementById("responseHeaders");
  var responseBodyInput = document.getElementById("responseBody");
  var previewBtn = document.getElementById("previewBtn");
  var saveBtn = document.getElementById("saveBtn");
  var resetBtn = document.getElementById("resetBtn");
  var statusText = document.getElementById("statusText");
  var jsonTableWrap = document.getElementById("jsonTableWrap");
  var mockTable = document.getElementById("mockTable");
  var refreshLogsBtn = document.getElementById("refreshLogsBtn");
  var clearLogsBtn = document.getElementById("clearLogsBtn");
  var logTable = document.getElementById("logTable");

  if (!mockForm) return;

  var editingId = null; // 수정 중인 mock ID

  function setStatus(msg, isError) {
    statusText.textContent = msg;
    statusText.style.color = isError ? "var(--danger)" : "";
    if (msg) setTimeout(function () { statusText.textContent = ""; }, 3000);
  }

  function esc(s) {
    if (s === null || s === undefined) return "";
    var d = document.createElement("div");
    d.textContent = typeof s === "string" ? s : JSON.stringify(s);
    return d.innerHTML;
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
  async function loadMocks() {
    try {
      var res = await fetch("/api/mocks");
      var data = await res.json();
      var items = data.items || [];
      var tbody = mockTable.querySelector("tbody");
      tbody.innerHTML = "";

      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888">등록된 Mock이 없습니다.</td></tr>';
        return;
      }

      items.forEach(function (m) {
        var tr = document.createElement("tr");
        var reqSummary = m.request_json ? truncate(JSON.stringify(m.request_json), 40) : "(전체 매칭)";
        var resSummary = m.response_body ? truncate(JSON.stringify(m.response_body), 40) : "";
        tr.innerHTML =
          "<td>" + m.id + "</td>" +
          "<td>" + esc(m.name) + "</td>" +
          '<td><span class="method-badge">' + esc(m.method) + "</span></td>" +
          "<td><code>" + esc(m.path) + "</code></td>" +
          '<td class="text-sm">' + esc(reqSummary) + "</td>" +
          '<td class="text-sm">' + m.response_status + " / " + esc(resSummary) + "</td>" +
          '<td><button class="mock-edit-btn" data-id="' + m.id + '">수정</button> ' +
          '<button class="mock-del-btn" data-id="' + m.id + '">삭제</button></td>';
        tbody.appendChild(tr);
      });

      // 수정 버튼
      tbody.querySelectorAll(".mock-edit-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = parseInt(this.dataset.id);
          var mock = items.find(function (m) { return m.id === id; });
          if (mock) loadToForm(mock);
        });
      });

      // 삭제 버튼
      tbody.querySelectorAll(".mock-del-btn").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var id = parseInt(this.dataset.id);
          if (!confirm("Mock #" + id + "을(를) 삭제하시겠습니까?")) return;
          try {
            var res = await fetch("/api/mocks/" + id, { method: "DELETE" });
            var data = await res.json();
            if (data.ok) {
              setStatus("삭제 완료");
              loadMocks();
              if (editingId === id) resetForm();
            } else {
              setStatus(data.error || "삭제 실패", true);
            }
          } catch (e) {
            setStatus("삭제 실패: " + e.message, true);
          }
        });
      });
    } catch (e) {
      setStatus("목록 로드 실패: " + e.message, true);
    }
  }

  function loadToForm(mock) {
    editingId = mock.id;
    nameInput.value = mock.name;
    methodInput.value = mock.method;
    pathInput.value = mock.path;
    statusInput.value = mock.response_status;
    requestJsonInput.value = mock.request_json ? prettyJson(mock.request_json) : "";
    responseHeadersInput.value = prettyJson(mock.response_headers || {});
    responseBodyInput.value = mock.response_body ? prettyJson(mock.response_body) : "";
    saveBtn.textContent = "수정 저장";
    setStatus("Mock #" + mock.id + " 수정 모드");
    mockForm.scrollIntoView({ behavior: "smooth" });
  }

  function resetForm() {
    editingId = null;
    mockForm.reset();
    responseHeadersInput.value = "{}";
    saveBtn.textContent = "저장";
    jsonTableWrap.innerHTML = "";
    setStatus("");
  }

  // ── 저장/수정 ──
  mockForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var payload = {
      name: nameInput.value.trim(),
      method: methodInput.value,
      path: pathInput.value.trim(),
      response_status: parseInt(statusInput.value) || 200,
      request_json: requestJsonInput.value.trim() || null,
      response_headers: responseHeadersInput.value.trim() || "{}",
      response_body: responseBodyInput.value.trim() || null,
    };

    if (!payload.name) { setStatus("이름을 입력하세요.", true); return; }
    if (!payload.path) { setStatus("경로를 입력하세요.", true); return; }

    // JSON 유효성 검사
    if (payload.request_json) {
      try { JSON.parse(payload.request_json); } catch (e) {
        setStatus("요청 JSON이 유효하지 않습니다.", true); return;
      }
    }
    try { JSON.parse(payload.response_headers); } catch (e) {
      setStatus("응답 헤더 JSON이 유효하지 않습니다.", true); return;
    }
    if (payload.response_body) {
      try { JSON.parse(payload.response_body); } catch (e) {
        setStatus("응답 바디 JSON이 유효하지 않습니다.", true); return;
      }
    }

    try {
      var url, method;
      if (editingId) {
        url = "/api/mocks/" + editingId;
        method = "PUT";
      } else {
        url = "/api/mocks";
        method = "POST";
      }

      var res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      var data = await res.json();
      if (data.ok || data.id) {
        setStatus(editingId ? "수정 완료" : "저장 완료 (ID: " + data.id + ")");
        resetForm();
        loadMocks();
      } else {
        setStatus(data.error || "저장 실패", true);
      }
    } catch (e) {
      setStatus("저장 실패: " + e.message, true);
    }
  });

  resetBtn.addEventListener("click", resetForm);

  // ── JSON 미리보기/편집 (응답 바디) ──
  previewBtn.addEventListener("click", function () {
    var raw = responseBodyInput.value.trim();
    if (!raw) {
      jsonTableWrap.innerHTML = '<p style="color:#888">응답 바디를 입력하세요.</p>';
      return;
    }
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      jsonTableWrap.innerHTML = '<p style="color:var(--danger)">JSON 파싱 오류: ' + esc(e.message) + "</p>";
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
      jsonTableWrap.innerHTML = "<pre>" + esc(JSON.stringify(data, null, 2)) + "</pre>";
    }
  }

  function renderArrayTable(arr) {
    if (arr.length === 0) {
      jsonTableWrap.innerHTML = '<p style="color:#888">빈 배열입니다.</p>';
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
      jsonTableWrap.innerHTML = "<pre>" + esc(JSON.stringify(arr, null, 2)) + "</pre>";
      return;
    }

    var html = '<table class="json-edit-table"><thead><tr>';
    html += "<th>#</th>";
    keys.forEach(function (k) { html += "<th>" + esc(k) + "</th>"; });
    html += "<th>작업</th></tr></thead><tbody>";

    arr.forEach(function (item, idx) {
      html += "<tr>";
      html += "<td>" + (idx + 1) + "</td>";
      keys.forEach(function (k) {
        var val = item[k];
        var display = val === null || val === undefined ? "" :
          typeof val === "object" ? JSON.stringify(val) : String(val);
        html += '<td><input class="json-cell" data-idx="' + idx + '" data-key="' + esc(k) + '" value="' + esc(display) + '" /></td>';
      });
      html += '<td><button class="json-clone-btn" data-idx="' + idx + '">+ 복제</button></td>';
      html += "</tr>";
    });
    html += "</tbody></table>";
    html += '<button type="button" class="json-apply-btn" style="margin-top:8px">편집 내용 반영</button>';

    jsonTableWrap.innerHTML = html;

    // 복제 버튼
    jsonTableWrap.querySelectorAll(".json-clone-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = parseInt(this.dataset.idx);
        var clone = JSON.parse(JSON.stringify(arr[idx]));
        arr.splice(idx + 1, 0, clone);
        responseBodyInput.value = JSON.stringify(arr, null, 2);
        renderArrayTable(arr);
      });
    });

    // 반영 버튼
    var applyBtn = jsonTableWrap.querySelector(".json-apply-btn");
    if (applyBtn) {
      applyBtn.addEventListener("click", function () {
        jsonTableWrap.querySelectorAll(".json-cell").forEach(function (input) {
          var idx = parseInt(input.dataset.idx);
          var key = input.dataset.key;
          var val = input.value;
          // 숫자/boolean/null 자동 변환
          if (val === "null") arr[idx][key] = null;
          else if (val === "true") arr[idx][key] = true;
          else if (val === "false") arr[idx][key] = false;
          else if (val !== "" && !isNaN(val)) arr[idx][key] = Number(val);
          else {
            try { arr[idx][key] = JSON.parse(val); } catch (e) { arr[idx][key] = val; }
          }
        });
        responseBodyInput.value = JSON.stringify(arr, null, 2);
        setStatus("편집 내용이 응답 바디에 반영되었습니다.");
      });
    }
  }

  function renderObjectTable(obj) {
    var keys = Object.keys(obj);
    var html = '<table class="json-edit-table"><thead><tr><th>키</th><th>값</th></tr></thead><tbody>';
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
    html += '<button type="button" class="json-apply-btn" style="margin-top:8px">편집 내용 반영</button>';
    jsonTableWrap.innerHTML = html;

    var applyBtn = jsonTableWrap.querySelector(".json-apply-btn");
    if (applyBtn) {
      applyBtn.addEventListener("click", function () {
        jsonTableWrap.querySelectorAll(".json-cell").forEach(function (input) {
          var key = input.dataset.key;
          var val = input.value;
          if (val === "null") obj[key] = null;
          else if (val === "true") obj[key] = true;
          else if (val === "false") obj[key] = false;
          else if (val !== "" && !isNaN(val)) obj[key] = Number(val);
          else {
            try { obj[key] = JSON.parse(val); } catch (e) { obj[key] = val; }
          }
        });
        responseBodyInput.value = JSON.stringify(obj, null, 2);
        setStatus("편집 내용이 응답 바디에 반영되었습니다.");
      });
    }
  }

  // ── 로그 ──
  async function loadLogs() {
    try {
      var res = await fetch("/api/logs?limit=200");
      var data = await res.json();
      var items = data.items || [];
      var tbody = logTable.querySelector("tbody");
      tbody.innerHTML = "";

      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888">로그가 없습니다.</td></tr>';
        return;
      }

      items.forEach(function (log) {
        var tr = document.createElement("tr");
        var reqBody = log.request_json ? truncate(JSON.stringify(log.request_json), 30) : truncate(log.request_body, 30);
        var resBody = log.response_body ? truncate(JSON.stringify(log.response_body), 30) : "";
        tr.innerHTML =
          "<td>" + log.id + "</td>" +
          "<td>" + esc(log.created_at) + "</td>" +
          "<td>" + (log.matched ? '<span style="color:#059669">✓ #' + log.matched_mock_id + "</span>" : '<span style="color:#dc2626">✗</span>') + "</td>" +
          '<td><span class="method-badge">' + esc(log.method) + "</span></td>" +
          "<td><code>" + esc(log.path) + "</code></td>" +
          '<td class="text-sm">' + esc(reqBody) + "</td>" +
          '<td class="text-sm">' + log.response_status + " / " + esc(resBody) + "</td>";
        tbody.appendChild(tr);
      });
    } catch (e) {
      setStatus("로그 로드 실패: " + e.message, true);
    }
  }

  refreshLogsBtn.addEventListener("click", loadLogs);

  clearLogsBtn.addEventListener("click", async function () {
    if (!confirm("모든 로그를 삭제하시겠습니까?")) return;
    try {
      var res = await fetch("/api/logs", { method: "DELETE" });
      var data = await res.json();
      if (data.ok) {
        setStatus("로그 비우기 완료");
        loadLogs();
      }
    } catch (e) {
      setStatus("로그 삭제 실패: " + e.message, true);
    }
  });

  // 초기 로드
  loadMocks();
  loadLogs();
})();
