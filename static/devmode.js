// ── 개발자 모드 (탭 방식) ──
(function () {
  const authBadge = document.getElementById("devAuthBadge");
  const lockBtn = document.getElementById("devLockBtn");

  let devToken = sessionStorage.getItem("devToken") || "";
  let authRegistered = false;
  let devInitialized = false;

  // ── 탭 활성화 감지: switchTab 호출 시 devmode 탭이면 초기화 ──
  const origSwitchTab = window.switchTab;
  window.switchTab = function (tabName) {
    origSwitchTab(tabName);
    if (tabName === "devmode" && !devInitialized) {
      devInitialized = true;
      initDevMode();
    } else if (tabName === "devmode") {
      // 재진입 시 현재 활성 섹션 리로드
      const activeSec = document.querySelector(".dev-sec-btn.active");
      if (activeSec) loadDevSection(activeSec.dataset.sec);
    }
  };

  async function initDevMode() {
    await checkAuthStatus();
    loadDevSection("db");
  }

  // ── 섹션 탭 전환 ──
  document.querySelectorAll(".dev-sec-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".dev-sec-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".dev-section").forEach((s) => s.classList.remove("active"));
      btn.classList.add("active");
      const sec = document.querySelector(`.dev-section[data-sec="${btn.dataset.sec}"]`);
      if (sec) sec.classList.add("active");
      loadDevSection(btn.dataset.sec);
    });
  });

  // ── 인증 상태 확인 ──
  async function checkAuthStatus() {
    try {
      const res = await fetch("/api/dev/auth/status");
      const data = await res.json();
      authRegistered = data.registered;
      updateAuthBadge();
    } catch (e) {
      authRegistered = false;
    }
  }

  function updateAuthBadge() {
    if (!authBadge) return;
    if (!authRegistered) {
      authBadge.textContent = "";
      authBadge.title = "";
      lockBtn.style.display = "none";
    } else if (devToken) {
      authBadge.textContent = "\uD83D\uDD12";
      authBadge.title = "인증됨";
      lockBtn.style.display = "inline-block";
    } else {
      authBadge.textContent = "\uD83D\uDD13";
      authBadge.title = "미인증";
      lockBtn.style.display = "none";
    }
  }

  lockBtn.addEventListener("click", () => {
    devToken = "";
    sessionStorage.removeItem("devToken");
    updateAuthBadge();
    // 현재 활성 섹션 리로드하여 인증 게이트 표시
    const activeSec = document.querySelector(".dev-sec-btn.active");
    if (activeSec) loadDevSection(activeSec.dataset.sec);
  });

  // ── 인증 게이트: 민감 섹션 접근 시 ──
  function showAuthGate(gateEl, onSuccess) {
    gateEl.style.display = "block";
    const msgEl = gateEl.querySelector(".dev-auth-msg");
    const formEl = gateEl.querySelector(".dev-auth-form");

    if (!authRegistered) {
      msgEl.textContent = "보안을 위해 계정을 등록하세요.";
      formEl.innerHTML = `
        <input type="text" id="devRegUser" placeholder="아이디" class="dev-input">
        <input type="password" id="devRegPass" placeholder="비밀번호" class="dev-input">
        <input type="password" id="devRegPass2" placeholder="비밀번호 확인" class="dev-input">
        <button class="dev-btn dev-btn-primary" id="devRegBtn">등록</button>
        <span class="dev-auth-error" id="devRegError"></span>
      `;
      const doRegister = async () => {
        const user = formEl.querySelector("#devRegUser").value.trim();
        const pass = formEl.querySelector("#devRegPass").value;
        const pass2 = formEl.querySelector("#devRegPass2").value;
        const errEl = formEl.querySelector("#devRegError");
        if (!user || !pass) { errEl.textContent = "아이디와 비밀번호를 입력하세요."; return; }
        if (pass !== pass2) { errEl.textContent = "비밀번호가 일치하지 않습니다."; return; }
        try {
          const res = await fetch("/api/dev/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user, password: pass }),
          });
          const data = await res.json();
          if (data.ok) {
            devToken = data.token;
            sessionStorage.setItem("devToken", devToken);
            authRegistered = true;
            updateAuthBadge();
            gateEl.style.display = "none";
            onSuccess();
          } else {
            errEl.textContent = data.error;
          }
        } catch (e) {
          errEl.textContent = "등록 실패: " + e.message;
        }
      };
      formEl.querySelector("#devRegBtn").addEventListener("click", doRegister);
      formEl.querySelectorAll("input").forEach((inp) => inp.addEventListener("keydown", (e) => { if (e.key === "Enter") doRegister(); }));
    } else {
      msgEl.textContent = "인증이 필요합니다.";
      formEl.innerHTML = `
        <input type="text" id="devLoginUser" placeholder="아이디" class="dev-input">
        <input type="password" id="devLoginPass" placeholder="비밀번호" class="dev-input">
        <button class="dev-btn dev-btn-primary" id="devLoginBtn">로그인</button>
        <span class="dev-auth-error" id="devLoginError"></span>
      `;
      const doLogin = async () => {
        const user = formEl.querySelector("#devLoginUser").value.trim();
        const pass = formEl.querySelector("#devLoginPass").value;
        const errEl = formEl.querySelector("#devLoginError");
        if (!user || !pass) { errEl.textContent = "아이디와 비밀번호를 입력하세요."; return; }
        try {
          const res = await fetch("/api/dev/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: user, password: pass }),
          });
          const data = await res.json();
          if (data.ok) {
            devToken = data.token;
            sessionStorage.setItem("devToken", devToken);
            updateAuthBadge();
            gateEl.style.display = "none";
            onSuccess();
          } else {
            errEl.textContent = data.error;
          }
        } catch (e) {
          errEl.textContent = "로그인 실패: " + e.message;
        }
      };
      formEl.querySelector("#devLoginBtn").addEventListener("click", doLogin);
      formEl.querySelectorAll("input").forEach((inp) => inp.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); }));
    }
  }

  function devFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    if (devToken) options.headers["X-Dev-Token"] = devToken;
    return fetch(url, options);
  }

  // ── 섹션 로드 ──
  function loadDevSection(sec) {
    if (sec === "db") loadDbExplorer();
    else if (sec === "tabs") loadTabManager();
    else if (sec === "modules") loadModuleSettings();
    else if (sec === "cdn") loadCdnManager();
  }

  // ══════════════════════════════════
  // DB 탐색기
  // ══════════════════════════════════
  const tableSelect = document.getElementById("devTableSelect");
  const tableLoadBtn = document.getElementById("devTableLoad");
  const tableResult = document.getElementById("devTableResult");
  const sqlInput = document.getElementById("devSqlInput");
  const sqlRunBtn = document.getElementById("devSqlRun");
  const sqlResult = document.getElementById("devSqlResult");
  const dbAuthGate = document.getElementById("devDbAuthGate");
  const dbContent = document.getElementById("devDbContent");

  async function loadDbExplorer() {
    // 인증 필요 확인
    if (authRegistered && !devToken) {
      dbContent.style.display = "none";
      showAuthGate(dbAuthGate, () => {
        dbContent.style.display = "";
        loadDbExplorer();
      });
      return;
    }
    dbAuthGate.style.display = "none";
    dbContent.style.display = "";

    try {
      const res = await devFetch("/api/dev/tables");
      if (res.status === 401) {
        devToken = "";
        sessionStorage.removeItem("devToken");
        updateAuthBadge();
        dbContent.style.display = "none";
        showAuthGate(dbAuthGate, () => { dbContent.style.display = ""; loadDbExplorer(); });
        return;
      }
      const data = await res.json();
      if (data.ok) {
        tableSelect.innerHTML = '<option value="">테이블 선택...</option>';
        data.tables.forEach((t) => {
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t;
          tableSelect.appendChild(opt);
        });
      }
    } catch (e) {
      tableResult.innerHTML = `<p class="dev-error">테이블 목록 로드 실패: ${e.message}</p>`;
    }
  }

  tableLoadBtn.addEventListener("click", async () => {
    const name = tableSelect.value;
    if (!name) return;
    try {
      const res = await devFetch(`/api/dev/tables/${name}`);
      const data = await res.json();
      if (data.ok) {
        renderSchemaAccordion(tableResult, data.columns, name);
        renderTable(tableResult, data.columns, data.data, name, true);
      } else {
        tableResult.innerHTML = `<p class="dev-error">${data.error}</p>`;
      }
    } catch (e) {
      tableResult.innerHTML = `<p class="dev-error">${e.message}</p>`;
    }
  });

  sqlRunBtn.addEventListener("click", async () => {
    const sql = sqlInput.value.trim();
    if (!sql) return;
    try {
      const res = await devFetch("/api/dev/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const data = await res.json();
      if (data.ok) {
        renderReadonlyTable(sqlResult, data.columns, data.data);
      } else {
        sqlResult.innerHTML = `<p class="dev-error">${data.error}</p>`;
      }
    } catch (e) {
      sqlResult.innerHTML = `<p class="dev-error">${e.message}</p>`;
    }
  });

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── 테이블 스키마 아코디언 ──
  function renderSchemaAccordion(container, columns, tableName) {
    let html = `<details class="dev-schema-accordion">
      <summary>테이블 정보: <strong>${esc(tableName)}</strong> (${columns.length}개 컬럼)</summary>
      <div class="dev-schema-content">
        <table class="dev-table dev-schema-table">
          <thead><tr>
            <th>순서</th><th>컬럼명</th><th>타입</th><th>NOT NULL</th><th>기본값</th><th>PK</th>
          </tr></thead><tbody>`;
    columns.forEach((c) => {
      html += `<tr>
        <td>${c.cid}</td>
        <td><strong>${esc(c.name)}</strong></td>
        <td>${esc(c.type || "—")}</td>
        <td>${c.notnull ? "YES" : "—"}</td>
        <td>${c.default != null ? esc(String(c.default)) : "—"}</td>
        <td>${c.pk ? "PK" : "—"}</td>
      </tr>`;
    });
    html += "</tbody></table></div></details>";
    container.innerHTML = html;
  }

  function renderTable(container, columns, data, tableName, append) {
    if (!data.length) {
      const msg = "<p>데이터 없음</p>";
      if (append) container.insertAdjacentHTML("beforeend", msg);
      else container.innerHTML = msg;
      return;
    }
    const colNames = columns.map((c) => c.name);
    const pkCol = columns.find((c) => c.pk === 1)?.name || "id";
    let html = '<div class="dev-table-wrap"><table class="dev-table"><thead><tr>';
    colNames.forEach((c) => (html += `<th>${esc(c)}</th>`));
    html += "<th>작업</th></tr></thead><tbody>";
    data.forEach((row) => {
      const rid = row[pkCol];
      html += `<tr data-id="${rid}">`;
      colNames.forEach((c) => {
        const val = row[c];
        const displayVal = typeof val === "string" && val.length > 100 ? val.slice(0, 100) + "..." : val;
        html += `<td class="dev-cell" data-col="${esc(c)}" data-full="${esc(JSON.stringify(val))}">${esc(displayVal)}</td>`;
      });
      html += `<td class="dev-actions">
        <button class="dev-btn-sm dev-edit-btn" data-table="${esc(tableName)}" data-id="${rid}">수정</button>
        <button class="dev-btn-sm dev-btn-danger dev-del-btn" data-table="${esc(tableName)}" data-id="${rid}">삭제</button>
      </td></tr>`;
    });
    html += "</tbody></table></div>";
    if (append) container.insertAdjacentHTML("beforeend", html);
    else container.innerHTML = html;

    // 카드 열기 공통 함수
    function openDetailCard(tr, editMode) {
      const existing = tr.nextElementSibling;
      if (existing && existing.classList.contains("dev-row-detail")) {
        existing.remove();
        tr.classList.remove("dev-row-selected");
        return;
      }
      container.querySelectorAll(".dev-row-detail").forEach(el => {
        el.previousElementSibling?.classList.remove("dev-row-selected");
        el.remove();
      });
      tr.classList.add("dev-row-selected");
      const cells = tr.querySelectorAll(".dev-cell");
      const rowId = tr.dataset.id;
      let detailHtml = '<td colspan="' + (colNames.length + 1) + '"><div class="dev-detail-wrap">';
      cells.forEach((cell) => {
        const col = cell.dataset.col;
        let val;
        try { val = JSON.parse(cell.dataset.full); } catch(_) { val = cell.dataset.full; }
        const strVal = val == null ? "" : (typeof val === "string" ? val : JSON.stringify(val, null, 2));
        const needsTextarea = strVal.length > 60 || strVal.includes("\n");
        detailHtml += `<div class="dev-detail-field">
          <div class="dev-detail-label">${esc(col)}</div>
          <div class="dev-detail-value">`;
        if (editMode) {
          detailHtml += needsTextarea
            ? `<textarea class="dev-detail-edit" data-col="${esc(col)}" rows="${Math.min(10, Math.max(2, strVal.split("\n").length))}">${esc(strVal)}</textarea>`
            : `<input type="text" class="dev-detail-edit" data-col="${esc(col)}" value="${esc(strVal)}">`;
        } else {
          const displayVal = val == null ? '<span style="color:#999">NULL</span>' : esc(strVal);
          detailHtml += `<div class="dev-detail-text${needsTextarea ? ' dev-detail-long' : ''}">${displayVal}</div>`;
        }
        detailHtml += `</div></div>`;
      });
      detailHtml += `<div class="dev-detail-actions">`;
      if (editMode) {
        detailHtml += `<button class="dev-btn dev-btn-primary dev-detail-save" data-table="${esc(tableName)}" data-id="${esc(String(rowId))}">저장</button>`;
      }
      detailHtml += `<button class="dev-btn dev-detail-cancel">닫기</button></div>`;
      detailHtml += '</div></td>';
      const detailRow = document.createElement("tr");
      detailRow.className = "dev-row-detail";
      detailRow.innerHTML = detailHtml;
      tr.after(detailRow);

      if (editMode) {
        detailRow.querySelector(".dev-detail-save").addEventListener("click", async () => {
          const inputs = detailRow.querySelectorAll(".dev-detail-edit");
          const updates = {};
          inputs.forEach((inp) => {
            let val = inp.value;
            try { val = JSON.parse(val); } catch (_) {}
            updates[inp.dataset.col] = val;
          });
          const res = await devFetch(`/api/dev/tables/${tableName}/${rowId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          });
          const d = await res.json();
          if (d.ok) tableLoadBtn.click();
          else alert("수정 실패: " + d.error);
        });
      }

      detailRow.querySelector(".dev-detail-cancel").addEventListener("click", () => {
        detailRow.remove();
        tr.classList.remove("dev-row-selected");
      });
    }

    // 행 클릭 → 읽기 전용 상세보기
    container.querySelectorAll(".dev-table tbody tr").forEach((tr) => {
      tr.style.cursor = "pointer";
      tr.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        openDetailCard(tr, false);
      });
    });

    // 수정 버튼 → 편집 모드 카드
    container.querySelectorAll(".dev-edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tr = btn.closest("tr");
        openDetailCard(tr, true);
      });
    });

    // 삭제 버튼
    container.querySelectorAll(".dev-del-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(`정말 삭제하시겠습니까? (ID: ${btn.dataset.id})`)) return;
        const res = await devFetch(`/api/dev/tables/${btn.dataset.table}/${btn.dataset.id}`, { method: "DELETE" });
        const d = await res.json();
        if (d.ok) tableLoadBtn.click();
        else alert("삭제 실패: " + d.error);
      });
    });
  }

  function renderReadonlyTable(container, columns, data) {
    if (!data.length) { container.innerHTML = "<p>결과 없음</p>"; return; }
    let html = '<div class="dev-table-wrap"><table class="dev-table"><thead><tr>';
    columns.forEach((c) => (html += `<th>${esc(c)}</th>`));
    html += "</tr></thead><tbody>";
    data.forEach((row) => {
      html += "<tr>";
      columns.forEach((c) => {
        const val = row[c];
        const displayVal = typeof val === "string" && val.length > 100 ? val.slice(0, 100) + "..." : val;
        html += `<td class="dev-ro-cell" data-col="${esc(c)}" data-full="${esc(JSON.stringify(val))}">${esc(displayVal)}</td>`;
      });
      html += "</tr>";
    });
    html += "</tbody></table></div>";
    container.innerHTML = html;

    // 행 클릭 → 상세보기
    container.querySelectorAll(".dev-table tbody tr").forEach((tr) => {
      tr.style.cursor = "pointer";
      tr.addEventListener("click", (e) => {
        const existing = tr.nextElementSibling;
        if (existing && existing.classList.contains("dev-row-detail")) {
          existing.remove();
          tr.classList.remove("dev-row-selected");
          return;
        }
        container.querySelectorAll(".dev-row-detail").forEach(el => {
          el.previousElementSibling?.classList.remove("dev-row-selected");
          el.remove();
        });
        tr.classList.add("dev-row-selected");
        const cells = tr.querySelectorAll(".dev-ro-cell");
        let detailHtml = '<td colspan="' + columns.length + '"><div class="dev-detail-wrap">';
        cells.forEach((cell) => {
          const col = cell.dataset.col;
          let val;
          try { val = JSON.parse(cell.dataset.full); } catch(_) { val = cell.dataset.full; }
          const displayVal = val == null ? '<span style="color:#999">NULL</span>' : esc(typeof val === "string" ? val : JSON.stringify(val, null, 2));
          const isLong = typeof val === "string" && val.length > 100;
          detailHtml += `<div class="dev-detail-field">
            <div class="dev-detail-label">${esc(col)}</div>
            <div class="dev-detail-value${isLong ? ' dev-detail-long' : ''}">${displayVal}</div>
          </div>`;
        });
        detailHtml += '</div></td>';
        const detailRow = document.createElement("tr");
        detailRow.className = "dev-row-detail";
        detailRow.innerHTML = detailHtml;
        tr.after(detailRow);
      });
    });
  }

  // ══════════════════════════════════
  // 탭 관리
  // ══════════════════════════════════
  const tabsList = document.getElementById("devTabsList");
  const tabsSaveBtn = document.getElementById("devTabsSave");

  async function loadTabManager() {
    try {
      const res = await fetch("/api/dev/tabs");
      const data = await res.json();
      if (!data.ok) return;
      const tabs = data.tabs.sort((a, b) => a.order - b.order);
      let html = '<div class="dev-tabs-list">';
      tabs.forEach((tab, i) => {
        html += `<div class="dev-tab-row" data-id="${esc(tab.id)}" draggable="true">
          <span class="dev-tab-drag" title="드래그하여 순서 변경">☰</span>
          <input type="checkbox" class="dev-tab-visible" ${tab.visible ? "checked" : ""} title="표시 여부">
          <input type="text" class="dev-input dev-tab-label" value="${esc(tab.label)}">
          <span class="dev-tab-id">(${esc(tab.id)})</span>
          <button class="dev-btn-sm dev-tab-up" ${i === 0 ? "disabled" : ""}>▲</button>
          <button class="dev-btn-sm dev-tab-down" ${i === tabs.length - 1 ? "disabled" : ""}>▼</button>
        </div>`;
      });
      html += "</div>";
      tabsList.innerHTML = html;

      // 드래그 & 드롭
      let dragRow = null;
      tabsList.querySelectorAll(".dev-tab-row").forEach((row) => {
        row.addEventListener("dragstart", (e) => {
          dragRow = row;
          row.classList.add("dev-tab-dragging");
          e.dataTransfer.effectAllowed = "move";
        });
        row.addEventListener("dragend", () => {
          row.classList.remove("dev-tab-dragging");
          tabsList.querySelectorAll(".dev-tab-row").forEach((r) => r.classList.remove("dev-tab-dragover"));
          dragRow = null;
          refreshTabButtons();
        });
        row.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (row !== dragRow) row.classList.add("dev-tab-dragover");
        });
        row.addEventListener("dragleave", () => {
          row.classList.remove("dev-tab-dragover");
        });
        row.addEventListener("drop", (e) => {
          e.preventDefault();
          row.classList.remove("dev-tab-dragover");
          if (!dragRow || dragRow === row) return;
          const list = row.parentNode;
          const rows = [...list.querySelectorAll(".dev-tab-row")];
          const fromIdx = rows.indexOf(dragRow);
          const toIdx = rows.indexOf(row);
          if (fromIdx < toIdx) list.insertBefore(dragRow, row.nextSibling);
          else list.insertBefore(dragRow, row);
          refreshTabButtons();
        });
      });

      // 위/아래 버튼
      tabsList.querySelectorAll(".dev-tab-up").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = btn.closest(".dev-tab-row");
          const prev = row.previousElementSibling;
          if (prev) row.parentNode.insertBefore(row, prev);
          refreshTabButtons();
        });
      });
      tabsList.querySelectorAll(".dev-tab-down").forEach((btn) => {
        btn.addEventListener("click", () => {
          const row = btn.closest(".dev-tab-row");
          const next = row.nextElementSibling;
          if (next) row.parentNode.insertBefore(next, row);
          refreshTabButtons();
        });
      });
    } catch (e) {
      tabsList.innerHTML = `<p class="dev-error">${e.message}</p>`;
    }
  }

  function refreshTabButtons() {
    const rows = tabsList.querySelectorAll(".dev-tab-row");
    rows.forEach((row, i) => {
      row.querySelector(".dev-tab-up").disabled = i === 0;
      row.querySelector(".dev-tab-down").disabled = i === rows.length - 1;
    });
  }

  tabsSaveBtn.addEventListener("click", async () => {
    const rows = tabsList.querySelectorAll(".dev-tab-row");
    const tabs = [];
    rows.forEach((row, i) => {
      tabs.push({
        id: row.dataset.id,
        label: row.querySelector(".dev-tab-label").value.trim(),
        visible: row.querySelector(".dev-tab-visible").checked,
        order: i,
      });
    });
    try {
      const res = await fetch("/api/dev/tabs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabs }),
      });
      const data = await res.json();
      if (data.ok) {
        alert("탭 설정이 저장되었습니다.");
        if (typeof applyTabConfig === "function") applyTabConfig();
      } else {
        alert("저장 실패: " + data.error);
      }
    } catch (e) {
      alert("저장 실패: " + e.message);
    }
  });

  // ══════════════════════════════════
  // 모듈 설정
  // ══════════════════════════════════
  const modContent = document.getElementById("devModContent");
  const modSaveBtn = document.getElementById("devModSave");
  const modAuthGate = document.getElementById("devModAuthGate");

  const MODULE_META = {
    mock: { label: "Mock 서버", fields: {
      log_fetch_limit: { label: "로그 조회 수", type: "number" },
      log_max_limit: { label: "로그 최대 수", type: "number" },
    }},
    translate: { label: "번역", fields: {
      openai_model: { label: "OpenAI 모델", type: "text" },
    }},
    csv: { label: "CSV 편집", fields: {
      default_col_width: { label: "기본 열 너비(px)", type: "number" },
      min_col_width: { label: "최소 열 너비(px)", type: "number" },
    }},
    markdown: { label: "Markdown", fields: {
      debounce_ms: { label: "미리보기 지연(ms)", type: "number" },
      min_pane_px: { label: "최소 패널 크기(px)", type: "number" },
      max_versions: { label: "최대 버전 수", type: "number" },
      autosave_interval: { label: "자동저장 간격(초)", type: "number", step: "1" },
    }},
  };

  async function loadModuleSettings() {
    // 먼저 인증 상태 재확인 (탭 전환 시 최신 상태 반영)
    await checkAuthStatus();

    if (authRegistered && !devToken) {
      modContent.style.display = "none";
      modSaveBtn.style.display = "none";
      showAuthGate(modAuthGate, () => {
        modContent.style.display = "";
        modSaveBtn.style.display = "";
        loadModuleSettings();
      });
      return;
    }
    modAuthGate.style.display = "none";
    modContent.style.display = "";

    try {
      const res = await devFetch("/api/dev/modules");
      if (res.status === 401) {
        devToken = "";
        sessionStorage.removeItem("devToken");
        updateAuthBadge();
        modContent.style.display = "none";
        modSaveBtn.style.display = "none";
        showAuthGate(modAuthGate, () => { modContent.style.display = ""; modSaveBtn.style.display = ""; loadModuleSettings(); });
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        modContent.innerHTML = `<p class="dev-error">${data.error || "모듈 설정을 불러올 수 없습니다."}</p>`;
        return;
      }
      const modules = data.modules || {};
      let html = "";
      for (const [modId, meta] of Object.entries(MODULE_META)) {
        const vals = modules[modId] || {};
        html += `<div class="dev-module-card"><h4>${esc(meta.label)}</h4><div class="dev-module-fields">`;
        for (const [key, field] of Object.entries(meta.fields)) {
          const val = vals[key] != null ? vals[key] : "";
          const step = field.step ? `step="${field.step}"` : "";
          html += `<label class="dev-field">
            <span>${esc(field.label)}</span>
            <input type="${field.type}" class="dev-input dev-mod-input" data-mod="${modId}" data-key="${key}" value="${esc(val)}" ${step}>
          </label>`;
        }
        html += "</div></div>";
      }
      modContent.innerHTML = html;
      modSaveBtn.style.display = "";
    } catch (e) {
      modContent.innerHTML = `<p class="dev-error">${e.message}</p>`;
    }
  }

  modSaveBtn.addEventListener("click", async () => {
    const inputs = modContent.querySelectorAll(".dev-mod-input");
    const modules = {};
    inputs.forEach((input) => {
      const mod = input.dataset.mod;
      const key = input.dataset.key;
      if (!modules[mod]) modules[mod] = {};
      let val = input.value;
      if (input.type === "number") val = parseFloat(val) || 0;
      modules[mod][key] = val;
    });
    try {
      const res = await devFetch("/api/dev/modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules }),
      });
      const data = await res.json();
      if (data.ok) alert("모듈 설정이 저장되었습니다.");
      else alert("저장 실패: " + data.error);
    } catch (e) {
      alert("저장 실패: " + e.message);
    }
  });

  // ══════════════════════════════════
  // CDN 관리
  // ══════════════════════════════════
  const cdnContent = document.getElementById("devCdnContent");
  const cdnAuthGate = document.getElementById("devCdnAuthGate");
  const cdnSyncBtn = document.getElementById("devCdnSync");
  const cdnSyncLatestBtn = document.getElementById("devCdnSyncLatest");
  const cdnCheckLatestBtn = document.getElementById("devCdnCheckLatest");
  const cdnStatus = document.getElementById("devCdnStatus");
  const cdnList = document.getElementById("devCdnList");

  async function loadCdnManager() {
    await checkAuthStatus();
    if (authRegistered && !devToken) {
      cdnContent.style.display = "none";
      showAuthGate(cdnAuthGate, () => { cdnContent.style.display = ""; loadCdnManager(); });
      return;
    }
    cdnAuthGate.style.display = "none";
    cdnContent.style.display = "";

    try {
      var res = await devFetch("/api/dev/cdn/status");
      if (res.status === 401) {
        devToken = ""; sessionStorage.removeItem("devToken"); updateAuthBadge();
        cdnContent.style.display = "none";
        showAuthGate(cdnAuthGate, () => { cdnContent.style.display = ""; loadCdnManager(); });
        return;
      }
      var data = await res.json();
      if (!data.ok) { cdnList.innerHTML = '<p class="dev-error">상태 조회 실패</p>'; return; }
      renderCdnList(data.libs);
    } catch (e) {
      cdnList.innerHTML = '<p class="dev-error">' + e.message + '</p>';
    }
  }

  function renderCdnList(libs) {
    var html = '<table class="dev-table"><thead><tr><th>라이브러리</th><th>파일</th><th>저장 버전</th><th>상태</th><th>크기</th></tr></thead><tbody>';
    libs.forEach(function(lib) {
      var statusText = lib.exists ? '<span style="color:#22c55e">저장됨</span>' : '<span style="color:#ef4444">미다운로드</span>';
      var sizeText = lib.exists ? (lib.size > 1024 ? (lib.size / 1024).toFixed(1) + " KB" : lib.size + " B") : "-";
      var verText = lib.currentVersion || lib.configVersion || "-";
      html += '<tr><td>' + esc(lib.name) + '</td><td><code>' + esc(lib.file) + '</code></td><td>' + esc(verText) + '</td><td>' + statusText + '</td><td>' + sizeText + '</td></tr>';
    });
    html += '</tbody></table>';
    cdnList.innerHTML = html;
  }

  function setCdnButtonsDisabled(disabled) {
    cdnSyncBtn.disabled = disabled;
    cdnSyncLatestBtn.disabled = disabled;
    cdnCheckLatestBtn.disabled = disabled;
  }

  // 최신 버전 확인
  cdnCheckLatestBtn.addEventListener("click", async function() {
    setCdnButtonsDisabled(true);
    cdnStatus.textContent = "npm registry에서 최신 버전 확인 중...";
    cdnStatus.style.color = "#f59e0b";
    try {
      var res = await devFetch("/api/dev/cdn/check-latest");
      var data = await res.json();
      if (data.ok) {
        var html = '<table class="dev-table"><thead><tr><th>패키지</th><th>현재 버전</th><th>최신 버전</th><th>상태</th></tr></thead><tbody>';
        data.results.forEach(function(r) {
          var isNew = r.latest !== "조회실패" && r.current !== r.latest;
          var stText = r.latest === "조회실패" ? '<span style="color:#f59e0b">조회실패</span>'
            : isNew ? '<span style="color:#3b82f6">업데이트 가능</span>'
            : '<span style="color:#22c55e">최신</span>';
          html += '<tr><td>' + esc(r.npm) + '</td><td>' + esc(r.current) + '</td><td>' + esc(r.latest) + '</td><td>' + stText + '</td></tr>';
        });
        html += '</tbody></table>';
        cdnList.innerHTML = html;
        cdnStatus.textContent = "버전 확인 완료";
        cdnStatus.style.color = "#22c55e";
      } else {
        cdnStatus.textContent = "확인 실패";
        cdnStatus.style.color = "#ef4444";
      }
    } catch (e) {
      cdnStatus.textContent = "오류: " + e.message;
      cdnStatus.style.color = "#ef4444";
    }
    setCdnButtonsDisabled(false);
  });

  // 현재 버전 다운로드
  async function doSync(useLatest) {
    setCdnButtonsDisabled(true);
    cdnStatus.textContent = (useLatest ? "최신 버전" : "현재 설정 버전") + " 다운로드 중...";
    cdnStatus.style.color = "#f59e0b";
    try {
      var res = await devFetch("/api/dev/cdn/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useLatest: useLatest }),
      });
      var data = await res.json();
      if (data.ok) {
        cdnStatus.textContent = data.summary;
        cdnStatus.style.color = "#22c55e";
        var libs = data.results.map(function(r) {
          return { name: r.name, file: r.file, exists: r.ok, size: r.size || 0, currentVersion: r.version || "", configVersion: "" };
        });
        renderCdnList(libs);
        var failed = data.results.filter(function(r) { return !r.ok; });
        if (failed.length > 0) {
          cdnStatus.textContent += " (실패: " + failed.map(function(f) { return f.name; }).join(", ") + ")";
          cdnStatus.style.color = "#ef4444";
        }
      } else {
        cdnStatus.textContent = "동기화 실패";
        cdnStatus.style.color = "#ef4444";
      }
    } catch (e) {
      cdnStatus.textContent = "오류: " + e.message;
      cdnStatus.style.color = "#ef4444";
    }
    setCdnButtonsDisabled(false);
  }

  cdnSyncBtn.addEventListener("click", function() { doSync(false); });
  cdnSyncLatestBtn.addEventListener("click", function() { doSync(true); });
})();
