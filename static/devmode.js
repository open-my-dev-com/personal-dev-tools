// ── 사이트 이름 적용 (전역) ──
function applySiteName(name) {
  if (!name) return;
  document.title = name;
  var logo = document.querySelector(".logo");
  if (logo) logo.textContent = name;
}

// 페이지 로드 시 사이트 이름 불러오기
(function () {
  fetch("/api/dev/site-config").then(function (r) { return r.json(); }).then(function (data) {
    if (data.ok && data.config && data.config.siteName) applySiteName(data.config.siteName);
  }).catch(function () {});
})();

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
    loadDevSection("general");
  }

  // ══════════════════════════════════
  // 일반 설정 (사이트 이름 등)
  // ══════════════════════════════════
  const siteNameInput = document.getElementById("devSiteName");
  const siteLangSelect = document.getElementById("devSiteLang");
  const siteConfigSaveBtn = document.getElementById("devSiteConfigSave");

  async function loadSiteConfig() {
    try {
      const res = await fetch("/api/dev/site-config");
      const data = await res.json();
      if (data.ok) {
        siteNameInput.value = data.config.siteName || "";
        if (data.config.lang) siteLangSelect.value = data.config.lang;
      }
    } catch (e) {
      console.error("Site config load failed:", e);
    }
  }

  siteConfigSaveBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/dev/site-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteName: siteNameInput.value.trim(),
          lang: siteLangSelect.value,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        applySiteName(siteNameInput.value.trim());
        // Apply language change
        if (typeof i18nSetLang === "function") i18nSetLang(siteLangSelect.value);
        alert(t("dev.site_saved"));
      } else {
        alert(t("common.save_fail") + ": " + data.error);
      }
    } catch (e) {
      alert(t("common.save_fail") + ": " + e.message);
    }
  });

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
      authBadge.title = t("dev.auth_badge_on");
      lockBtn.style.display = "inline-block";
    } else {
      authBadge.textContent = "\uD83D\uDD13";
      authBadge.title = t("dev.auth_badge_off");
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
      msgEl.textContent = t("dev.register_msg");
      formEl.innerHTML = `
        <input type="text" id="devRegUser" placeholder="${t("dev.register_id_ph")}" class="dev-input">
        <input type="password" id="devRegPass" placeholder="${t("dev.register_pw_ph")}" class="dev-input">
        <input type="password" id="devRegPass2" placeholder="${t("dev.register_pw2_ph")}" class="dev-input">
        <button class="dev-btn dev-btn-primary" id="devRegBtn">${t("dev.register_btn")}</button>
        <span class="dev-auth-error" id="devRegError"></span>
      `;
      const doRegister = async () => {
        const user = formEl.querySelector("#devRegUser").value.trim();
        const pass = formEl.querySelector("#devRegPass").value;
        const pass2 = formEl.querySelector("#devRegPass2").value;
        const errEl = formEl.querySelector("#devRegError");
        if (!user || !pass) { errEl.textContent = t("dev.id_pw_required"); return; }
        if (pass !== pass2) { errEl.textContent = t("dev.pw_mismatch"); return; }
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
          errEl.textContent = t("dev.register_fail", { msg: e.message });
        }
      };
      formEl.querySelector("#devRegBtn").addEventListener("click", doRegister);
      formEl.querySelectorAll("input").forEach((inp) => inp.addEventListener("keydown", (e) => { if (e.key === "Enter") doRegister(); }));
    } else {
      msgEl.textContent = t("dev.login_msg");
      formEl.innerHTML = `
        <input type="text" id="devLoginUser" placeholder="${t("dev.register_id_ph")}" class="dev-input">
        <input type="password" id="devLoginPass" placeholder="${t("dev.register_pw_ph")}" class="dev-input">
        <button class="dev-btn dev-btn-primary" id="devLoginBtn">${t("dev.login_btn")}</button>
        <span class="dev-auth-error" id="devLoginError"></span>
      `;
      const doLogin = async () => {
        const user = formEl.querySelector("#devLoginUser").value.trim();
        const pass = formEl.querySelector("#devLoginPass").value;
        const errEl = formEl.querySelector("#devLoginError");
        if (!user || !pass) { errEl.textContent = t("dev.id_pw_required"); return; }
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
          errEl.textContent = t("dev.login_fail", { msg: e.message });
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
    if (sec === "general") loadSiteConfig();
    else if (sec === "db") loadDbExplorer();
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
        tableSelect.innerHTML = '<option value="">' + t("dev.table_select") + '</option>';
        data.tables.forEach((t) => {
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t;
          tableSelect.appendChild(opt);
        });
      }
    } catch (e) {
      tableResult.innerHTML = `<p class="dev-error">${t("dev.table_fail")}: ${e.message}</p>`;
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
      <summary>${t("dev.table_info", { name: esc(tableName), count: columns.length })}</summary>
      <div class="dev-schema-content">
        <table class="dev-table dev-schema-table">
          <thead><tr>
            <th>${t("dev.col_order")}</th><th>${t("dev.col_name")}</th><th>${t("dev.col_type")}</th><th>${t("dev.col_notnull")}</th><th>${t("dev.col_default")}</th><th>${t("dev.col_pk")}</th>
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
      const msg = "<p>" + t("dev.no_data") + "</p>";
      if (append) container.insertAdjacentHTML("beforeend", msg);
      else container.innerHTML = msg;
      return;
    }
    const colNames = columns.map((c) => c.name);
    const pkCol = columns.find((c) => c.pk === 1)?.name || "id";
    let html = '<div class="dev-table-wrap"><table class="dev-table"><thead><tr>';
    colNames.forEach((c) => (html += `<th>${esc(c)}</th>`));
    html += "<th>" + t("common.action") + "</th></tr></thead><tbody>";
    data.forEach((row) => {
      const rid = row[pkCol];
      html += `<tr data-id="${rid}">`;
      colNames.forEach((c) => {
        const val = row[c];
        const displayVal = typeof val === "string" && val.length > 100 ? val.slice(0, 100) + "..." : val;
        html += `<td class="dev-cell" data-col="${esc(c)}" data-full="${esc(JSON.stringify(val))}">${esc(displayVal)}</td>`;
      });
      html += `<td class="dev-actions">
        <button class="dev-btn-sm dev-edit-btn" data-table="${esc(tableName)}" data-id="${rid}">${t("common.edit")}</button>
        <button class="dev-btn-sm dev-btn-danger dev-del-btn" data-table="${esc(tableName)}" data-id="${rid}">${t("common.delete")}</button>
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
        detailHtml += `<button class="dev-btn dev-btn-primary dev-detail-save" data-table="${esc(tableName)}" data-id="${esc(String(rowId))}">${t("common.save")}</button>`;
      }
      detailHtml += `<button class="dev-btn dev-detail-cancel">${t("common.close")}</button></div>`;
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
          else alert(t("dev.edit_fail", { msg: d.error }));
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
        if (!confirm(t("dev.confirm_delete", { id: btn.dataset.id }))) return;
        const res = await devFetch(`/api/dev/tables/${btn.dataset.table}/${btn.dataset.id}`, { method: "DELETE" });
        const d = await res.json();
        if (d.ok) tableLoadBtn.click();
        else alert(t("dev.delete_fail", { msg: d.error }));
      });
    });
  }

  function renderReadonlyTable(container, columns, data) {
    if (!data.length) { container.innerHTML = "<p>" + t("dev.no_result") + "</p>"; return; }
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
          <span class="dev-tab-drag" title="${t("dev.drag_reorder")}">☰</span>
          <input type="checkbox" class="dev-tab-visible" ${tab.visible ? "checked" : ""} title="${t("dev.visibility")}">
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
        alert(t("dev.tabs_saved"));
        if (typeof applyTabConfig === "function") applyTabConfig();
      } else {
        alert(t("common.save_fail") + ": " + data.error);
      }
    } catch (e) {
      alert(t("common.save_fail") + ": " + e.message);
    }
  });

  // ══════════════════════════════════
  // 모듈 설정
  // ══════════════════════════════════
  const modContent = document.getElementById("devModContent");
  const modSaveBtn = document.getElementById("devModSave");
  const modAuthGate = document.getElementById("devModAuthGate");

  function getModuleMeta() {
    return {
      mock: { label: t("dev.mod_mock"), fields: {
        log_fetch_limit: { label: t("dev.mod_log_fetch"), type: "number" },
        log_max_limit: { label: t("dev.mod_log_max"), type: "number" },
      }},
      translate: { label: t("dev.mod_translate"), fields: {
        openai_model: { label: t("dev.mod_openai_model"), type: "text" },
      }},
      csv: { label: t("dev.mod_csv"), fields: {
        default_col_width: { label: t("dev.mod_col_width"), type: "number" },
        min_col_width: { label: t("dev.mod_col_min_width"), type: "number" },
      }},
      markdown: { label: t("dev.mod_markdown"), fields: {
        debounce_ms: { label: t("dev.mod_debounce"), type: "number" },
        min_pane_px: { label: t("dev.mod_min_pane"), type: "number" },
        max_versions: { label: t("dev.mod_max_versions"), type: "number" },
        autosave_interval: { label: t("dev.mod_autosave"), type: "number", step: "1" },
      }},
    };
  }

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
        modContent.innerHTML = `<p class="dev-error">${data.error || t("dev.modules_fail")}</p>`;
        return;
      }
      const modules = data.modules || {};
      let html = "";
      for (const [modId, meta] of Object.entries(getModuleMeta())) {
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
      if (data.ok) alert(t("dev.modules_saved"));
      else alert(t("common.save_fail") + ": " + data.error);
    } catch (e) {
      alert(t("common.save_fail") + ": " + e.message);
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
      if (!data.ok) { cdnList.innerHTML = '<p class="dev-error">' + t("dev.cdn_status_fail") + '</p>'; return; }
      renderCdnList(data.libs);
    } catch (e) {
      cdnList.innerHTML = '<p class="dev-error">' + e.message + '</p>';
    }
  }

  function renderCdnList(libs) {
    var html = '<table class="dev-table"><thead><tr><th>' + t("dev.cdn_col_lib") + '</th><th>' + t("dev.cdn_col_file") + '</th><th>' + t("dev.cdn_col_version") + '</th><th>' + t("dev.cdn_col_status") + '</th><th>' + t("dev.cdn_col_size") + '</th></tr></thead><tbody>';
    libs.forEach(function(lib) {
      var statusText = lib.exists ? '<span style="color:#22c55e">' + t("dev.cdn_saved") + '</span>' : '<span style="color:#ef4444">' + t("dev.cdn_not_downloaded") + '</span>';
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
    cdnStatus.textContent = t("dev.cdn_checking");
    cdnStatus.style.color = "#f59e0b";
    try {
      var res = await devFetch("/api/dev/cdn/check-latest");
      var data = await res.json();
      if (data.ok) {
        var html = '<table class="dev-table"><thead><tr><th>' + t("dev.cdn_col_package") + '</th><th>' + t("dev.cdn_col_current") + '</th><th>' + t("dev.cdn_col_latest") + '</th><th>' + t("dev.cdn_col_status") + '</th></tr></thead><tbody>';
        data.results.forEach(function(r) {
          var isNew = r.latest !== t("dev.cdn_check_fail") && r.current !== r.latest;
          var stText = r.latest === t("dev.cdn_check_fail") ? '<span style="color:#f59e0b">' + t("dev.cdn_check_fail") + '</span>'
            : isNew ? '<span style="color:#3b82f6">' + t("dev.cdn_updatable") + '</span>'
            : '<span style="color:#22c55e">' + t("dev.cdn_up_to_date") + '</span>';
          html += '<tr><td>' + esc(r.npm) + '</td><td>' + esc(r.current) + '</td><td>' + esc(r.latest) + '</td><td>' + stText + '</td></tr>';
        });
        html += '</tbody></table>';
        cdnList.innerHTML = html;
        cdnStatus.textContent = t("dev.cdn_check_done");
        cdnStatus.style.color = "#22c55e";
      } else {
        cdnStatus.textContent = t("dev.cdn_check_error");
        cdnStatus.style.color = "#ef4444";
      }
    } catch (e) {
      cdnStatus.textContent = t("common.error") + ": " + e.message;
      cdnStatus.style.color = "#ef4444";
    }
    setCdnButtonsDisabled(false);
  });

  // 현재 버전 다운로드
  async function doSync(useLatest) {
    setCdnButtonsDisabled(true);
    cdnStatus.textContent = (useLatest ? t("dev.cdn_latest_ver") : t("dev.cdn_config_ver")) + " " + t("dev.cdn_downloading");
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
          cdnStatus.textContent += t("dev.cdn_fail_count", { count: failed.map(function(f) { return f.name; }).join(", ") });
          cdnStatus.style.color = "#ef4444";
        }
      } else {
        cdnStatus.textContent = t("dev.cdn_sync_fail");
        cdnStatus.style.color = "#ef4444";
      }
    } catch (e) {
      cdnStatus.textContent = t("common.error") + ": " + e.message;
      cdnStatus.style.color = "#ef4444";
    }
    setCdnButtonsDisabled(false);
  }

  cdnSyncBtn.addEventListener("click", function() { doSync(false); });
  cdnSyncLatestBtn.addEventListener("click", function() { doSync(true); });
})();
