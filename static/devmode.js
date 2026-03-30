// ── 사이트 이름 적용 (전역) ──
function applySiteName(name) {
  if (!name) return;
  document.title = name;
  var $logo = $(".logo");
  if ($logo.length) $logo.text(name);
}

// 페이지 로드 시 사이트 이름 불러오기
(function () {
  $.getJSON("/api/dev/site-config").done(function (data) {
    if (data.ok && data.config && data.config.siteName) applySiteName(data.config.siteName);
  }).fail(function () {});
})();

// ── 개발자 모드 (탭 방식) ──
(function () {
  const $authBadge = $("#devAuthBadge");
  const $lockBtn = $("#devLockBtn");

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
      const $activeSec = $(".dev-sec-btn.active");
      if ($activeSec.length) loadDevSection($activeSec.data("sec"));
    }
  };

  async function initDevMode() {
    await checkAuthStatus();
    loadDevSection("general");
  }

  // ══════════════════════════════════
  // 일반 설정 (사이트 이름 등)
  // ══════════════════════════════════
  const $siteNameInput = $("#devSiteName");
  const $siteLangSelect = $("#devSiteLang");
  const $siteConfigSaveBtn = $("#devSiteConfigSave");
  const $toastPositionGrid = $("#devToastPosition");
  const $toastModeSelect = $("#devToastMode");
  const $toastSizeSelect = $("#devToastSize");
  const $toastDurationInput = $("#devToastDuration");
  const $toastPreviewBtn = $("#devToastPreview");

  // Toast preview button — temporarily apply selected settings and show a test toast
  var _previewRestoreTimer = null;
  $toastPreviewBtn.on("click", function () {
    if (_previewRestoreTimer) clearTimeout(_previewRestoreTimer);
    _toastConfig.position = _toastSelectedPosition;
    _toastConfig.mode = $toastModeSelect.val();
    _toastConfig.size = $toastSizeSelect.val();
    _toastConfig.duration = parseInt($toastDurationInput.val()) || 3;
    _updateToastPosition();
    showToast(t("toast.preview_message"), "success");
  });

  // Toast position grid click handler
  var _toastSelectedPosition = "bottom-right";
  $toastPositionGrid.on("click", function (e) {
    const $btn = $(e.target).closest(".toast-pos-btn");
    if (!$btn.length) return;
    $toastPositionGrid.find(".toast-pos-btn").removeClass("active");
    $btn.addClass("active");
    _toastSelectedPosition = $btn.data("pos");
  });

  async function loadSiteConfig() {
    try {
      const res = await fetch("/api/dev/site-config");
      const data = await res.json();
      if (data.ok) {
        $siteNameInput.val(data.config.siteName || "");
        if (data.config.lang) $siteLangSelect.val(data.config.lang);
        // Toast config
        if (data.config.toast_config) {
          try {
            const tc = typeof data.config.toast_config === "string"
              ? JSON.parse(data.config.toast_config) : data.config.toast_config;
            if (tc.position) {
              _toastSelectedPosition = tc.position;
              $toastPositionGrid.find(".toast-pos-btn").each(function () {
                $(this).toggleClass("active", $(this).data("pos") === tc.position);
              });
            }
            if (tc.mode) $toastModeSelect.val(tc.mode);
            if (tc.size) $toastSizeSelect.val(tc.size);
            if (tc.duration) $toastDurationInput.val(tc.duration);
          } catch (_) {}
        }
      }
    } catch (e) {
      console.error("Site config load failed:", e);
    }
  }

  $siteConfigSaveBtn.on("click", async function () {
    try {
      const res = await fetch("/api/dev/site-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteName: $siteNameInput.val().trim(),
          lang: $siteLangSelect.val(),
          toast_config: JSON.stringify({
            position: _toastSelectedPosition,
            mode: $toastModeSelect.val(),
            size: $toastSizeSelect.val(),
            duration: parseInt($toastDurationInput.val()) || 3,
          }),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        applySiteName($siteNameInput.val().trim());
        if (typeof i18nSetLang === "function") i18nSetLang($siteLangSelect.val());
        // Apply toast config immediately
        if (typeof loadToastConfig === "function") loadToastConfig();
        showToast(t("dev.site_saved"), "success");
      } else {
        showToast(t("common.save_fail") + ": " + data.error, "error");
      }
    } catch (e) {
      showToast(t("common.save_fail") + ": " + e.message, "error");
    }
  });

  loadSiteConfig();

  // ── 섹션 탭 전환 ──
  $(".dev-sec-btn").on("click", function () {
    $(".dev-sec-btn").removeClass("active");
    $(".dev-section").removeClass("active");
    $(this).addClass("active");
    const $sec = $(`.dev-section[data-sec="${$(this).data("sec")}"]`);
    if ($sec.length) $sec.addClass("active");
    loadDevSection($(this).data("sec"));
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
    if (!$authBadge.length) return;
    if (!authRegistered) {
      $authBadge.text("");
      $authBadge.attr("title", "");
      $lockBtn.hide();
    } else if (devToken) {
      $authBadge.text("\uD83D\uDD12");
      $authBadge.attr("title", t("dev.auth_badge_on"));
      $lockBtn.css("display", "inline-block");
    } else {
      $authBadge.text("\uD83D\uDD13");
      $authBadge.attr("title", t("dev.auth_badge_off"));
      $lockBtn.hide();
    }
  }

  $lockBtn.on("click", function () {
    devToken = "";
    sessionStorage.removeItem("devToken");
    updateAuthBadge();
    // 현재 활성 섹션 리로드하여 인증 게이트 표시
    const $activeSec = $(".dev-sec-btn.active");
    if ($activeSec.length) loadDevSection($activeSec.data("sec"));
  });

  // ── 인증 게이트: 민감 섹션 접근 시 ──
  function showAuthGate(gateEl, onSuccess) {
    var $gate = $(gateEl);
    $gate.show();
    const $msgEl = $gate.find(".dev-auth-msg");
    const $formEl = $gate.find(".dev-auth-form");

    if (!authRegistered) {
      $msgEl.text(t("dev.register_msg"));
      $formEl.html(`
        <input type="text" id="devRegUser" placeholder="${t("dev.register_id_ph")}" class="dev-input">
        <input type="password" id="devRegPass" placeholder="${t("dev.register_pw_ph")}" class="dev-input">
        <input type="password" id="devRegPass2" placeholder="${t("dev.register_pw2_ph")}" class="dev-input">
        <button class="dev-btn dev-btn-primary" id="devRegBtn">${t("dev.register_btn")}</button>
        <span class="dev-auth-error" id="devRegError"></span>
      `);
      const doRegister = async () => {
        const user = $formEl.find("#devRegUser").val().trim();
        const pass = $formEl.find("#devRegPass").val();
        const pass2 = $formEl.find("#devRegPass2").val();
        const $errEl = $formEl.find("#devRegError");
        if (!user || !pass) { $errEl.text(t("dev.id_pw_required")); return; }
        if (pass !== pass2) { $errEl.text(t("dev.pw_mismatch")); return; }
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
            $gate.hide();
            onSuccess();
          } else {
            $errEl.text(data.error);
          }
        } catch (e) {
          $errEl.text(t("dev.register_fail", { msg: e.message }));
        }
      };
      $formEl.find("#devRegBtn").on("click", doRegister);
      $formEl.find("input").on("keydown", function (e) { if (e.key === "Enter") doRegister(); });
    } else {
      $msgEl.text(t("dev.login_msg"));
      $formEl.html(`
        <input type="text" id="devLoginUser" placeholder="${t("dev.register_id_ph")}" class="dev-input">
        <input type="password" id="devLoginPass" placeholder="${t("dev.register_pw_ph")}" class="dev-input">
        <button class="dev-btn dev-btn-primary" id="devLoginBtn">${t("dev.login_btn")}</button>
        <span class="dev-auth-error" id="devLoginError"></span>
      `);
      const doLogin = async () => {
        const user = $formEl.find("#devLoginUser").val().trim();
        const pass = $formEl.find("#devLoginPass").val();
        const $errEl = $formEl.find("#devLoginError");
        if (!user || !pass) { $errEl.text(t("dev.id_pw_required")); return; }
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
            $gate.hide();
            onSuccess();
          } else {
            $errEl.text(data.error);
          }
        } catch (e) {
          $errEl.text(t("dev.login_fail", { msg: e.message }));
        }
      };
      $formEl.find("#devLoginBtn").on("click", doLogin);
      $formEl.find("input").on("keydown", function (e) { if (e.key === "Enter") doLogin(); });
    }
  }

  function devFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    if (devToken) options.headers["X-Dev-Token"] = devToken;
    return fetch(url, options);
  }

  // ── 섹션 로드 ──
  function loadDevSection(sec) {
    if (sec === "general") { loadSiteConfig(); loadVersionInfo(); }
    else if (sec === "db") loadDbExplorer();
    else if (sec === "tabs") loadTabManager();
    else if (sec === "modules") loadModuleSettings();
    else if (sec === "cdn") loadCdnManager();
    else if (sec === "plugins") loadPluginManager();
  }

  // ══════════════════════════════════
  // 버전 관리
  // ══════════════════════════════════
  var $verCurrent = $("#devVersionCurrent");
  var $verBadge = $("#devVersionBadge");
  var $verCheckBtn = $("#devVersionCheck");
  var $verUpdateBtn = $("#devVersionUpdate");
  var $verStatus = $("#devVersionStatus");
  var $releaseNotesBtn = $("#devReleaseNotesBtn");
  var $releaseNotes = $("#devReleaseNotes");

  function loadVersionInfo() {
    $verCheckBtn.prop("disabled", true).text(t("dev.version_checking"));
    $verBadge.hide();
    $verUpdateBtn.hide();
    $verStatus.hide();

    $.getJSON("/api/dev/version").done(function (data) {
      $verCurrent.text("v" + data.current);
      if (data.update_available) {
        $verBadge.text(t("dev.version_new", { version: "v" + data.latest }))
          .removeClass("badge-ok").addClass("badge-warn").show();
        $verUpdateBtn.show();
      } else {
        $verBadge.text(t("dev.version_latest"))
          .removeClass("badge-warn").addClass("badge-ok").show();
      }
    }).fail(function () {
      $verCurrent.text("-");
    }).always(function () {
      $verCheckBtn.prop("disabled", false).text(t("dev.version_check"));
    });
  }

  $verCheckBtn.on("click", function () {
    loadVersionInfo();
  });

  $verUpdateBtn.on("click", function () {
    if (!confirm(t("dev.version_update_confirm"))) return;
    $verUpdateBtn.prop("disabled", true).text(t("dev.version_updating"));
    $verStatus.hide();

    devFetch("/api/dev/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) {
        $verCurrent.text("v" + data.version);
        $verBadge.text(t("dev.version_latest")).removeClass("badge-warn").addClass("badge-ok");
        $verUpdateBtn.hide();
        $verStatus.text(t("dev.version_updated") + " " + t("dev.version_restart_required"))
          .removeClass("status-error").addClass("status-success").show();
        showToast(t("dev.version_updated"), "success");
      } else if (data.error === "local_changes") {
        $verStatus.text(t("dev.version_local_changes"))
          .removeClass("status-success").addClass("status-error").show();
        showToast(t("dev.version_local_changes"), "error");
      } else if (data.error === "merge_conflict") {
        $verStatus.text(t("dev.version_conflict"))
          .removeClass("status-success").addClass("status-error").show();
        showToast(t("dev.version_conflict"), "error");
      } else {
        $verStatus.text(data.error)
          .removeClass("status-success").addClass("status-error").show();
      }
    }).catch(function () {
      $verStatus.text("Update failed").removeClass("status-success").addClass("status-error").show();
    }).finally(function () {
      $verUpdateBtn.prop("disabled", false).text(t("dev.version_update"));
    });
  });

  $releaseNotesBtn.on("click", function () {
    if ($releaseNotes.is(":visible")) {
      $releaseNotes.slideUp(200);
      return;
    }
    $releaseNotesBtn.prop("disabled", true).text(t("dev.version_checking"));
    $.getJSON("/api/dev/releases").done(function (data) {
      if (!data.ok || !data.releases || !data.releases.length) {
        $releaseNotes.html("<p class='dev-release-empty'>" + t("dev.version_no_releases") + "</p>").slideDown(200);
        return;
      }
      var html = "";
      data.releases.forEach(function (r) {
        var date = r.published_at ? r.published_at.substring(0, 10) : "";
        var body = escapeHtml(r.body || "").replace(/\n/g, "<br>");
        html += "<div class='dev-release-item'>"
          + "<div class='dev-release-header'>"
          + "<strong>" + escapeHtml(r.name || r.tag) + "</strong>"
          + "<span class='dev-release-date'>" + date + "</span>"
          + "</div>"
          + "<div class='dev-release-body'>" + body + "</div>"
          + "</div>";
      });
      $releaseNotes.html(html).slideDown(200);
    }).fail(function () {
      $releaseNotes.html("<p class='dev-release-empty'>" + t("dev.version_releases_fail") + "</p>").slideDown(200);
    }).always(function () {
      $releaseNotesBtn.prop("disabled", false).text(t("dev.version_release_notes"));
    });
  });

  // ══════════════════════════════════
  // DB 탐색기
  // ══════════════════════════════════
  const $tableSelect = $("#devTableSelect");
  const $tableLoadBtn = $("#devTableLoad");
  const $tableResult = $("#devTableResult");
  const $sqlInput = $("#devSqlInput");
  const $sqlRunBtn = $("#devSqlRun");
  const $sqlResult = $("#devSqlResult");
  const $dbAuthGate = $("#devDbAuthGate");
  const $dbContent = $("#devDbContent");

  async function loadDbExplorer() {
    // 인증 필요 확인
    if (authRegistered && !devToken) {
      $dbContent.hide();
      showAuthGate($dbAuthGate[0], () => {
        $dbContent.show();
        loadDbExplorer();
      });
      return;
    }
    $dbAuthGate.hide();
    $dbContent.show();

    try {
      const res = await devFetch("/api/dev/tables");
      if (res.status === 401) {
        devToken = "";
        sessionStorage.removeItem("devToken");
        updateAuthBadge();
        $dbContent.hide();
        showAuthGate($dbAuthGate[0], () => { $dbContent.show(); loadDbExplorer(); });
        return;
      }
      const data = await res.json();
      if (data.ok) {
        $tableSelect.html('<option value="">' + t("dev.table_select") + '</option>');
        data.tables.forEach((tbl) => {
          $tableSelect.append($("<option>").val(tbl).text(tbl));
        });
      }
    } catch (e) {
      $tableResult.html(`<p class="dev-error">${t("dev.table_fail")}: ${e.message}</p>`);
    }
  }

  $tableLoadBtn.on("click", async function () {
    const name = $tableSelect.val();
    if (!name) return;
    try {
      const res = await devFetch(`/api/dev/tables/${name}`);
      const data = await res.json();
      if (data.ok) {
        renderSchemaAccordion($tableResult, data.columns, name);
        renderTable($tableResult, data.columns, data.data, name, true);
      } else {
        $tableResult.html(`<p class="dev-error">${data.error}</p>`);
      }
    } catch (e) {
      $tableResult.html(`<p class="dev-error">${e.message}</p>`);
    }
  });

  $sqlRunBtn.on("click", async function () {
    const sql = $sqlInput.val().trim();
    if (!sql) return;
    try {
      const res = await devFetch("/api/dev/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const data = await res.json();
      if (data.ok) {
        renderReadonlyTable($sqlResult, data.columns, data.data);
      } else {
        $sqlResult.html(`<p class="dev-error">${data.error}</p>`);
      }
    } catch (e) {
      $sqlResult.html(`<p class="dev-error">${e.message}</p>`);
    }
  });

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── 테이블 스키마 아코디언 ──
  function renderSchemaAccordion($container, columns, tableName) {
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
    $container.html(html);
  }

  function renderTable($container, columns, data, tableName, append) {
    if (!data.length) {
      const msg = "<p>" + t("dev.no_data") + "</p>";
      if (append) $container.append(msg);
      else $container.html(msg);
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
    if (append) $container.append(html);
    else $container.html(html);

    // 카드 열기 공통 함수
    function openDetailCard($tr, editMode) {
      const $existing = $tr.next();
      if ($existing.hasClass("dev-row-detail")) {
        // 같은 모드면 토글(닫기), 다른 모드면 교체
        const wasEdit = !!$existing.find(".dev-detail-save").length;
        $existing.remove();
        $tr.removeClass("dev-row-selected");
        if (wasEdit === editMode) return;
      }
      $container.find(".dev-row-detail").each(function () {
        $(this).prev().removeClass("dev-row-selected");
        $(this).remove();
      });
      $tr.addClass("dev-row-selected");
      const $cells = $tr.find(".dev-cell");
      const rowId = $tr.data("id");
      let detailHtml = '<td colspan="' + (colNames.length + 1) + '"><div class="dev-detail-wrap">';
      $cells.each(function () {
        const col = $(this).data("col");
        let val;
        try { val = JSON.parse($(this).attr("data-full")); } catch(_) { val = $(this).attr("data-full"); }
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
      const $detailRow = $("<tr>").addClass("dev-row-detail").html(detailHtml);
      $tr.after($detailRow);

      if (editMode) {
        $detailRow.find(".dev-detail-save").on("click", async function () {
          const $inputs = $detailRow.find(".dev-detail-edit");
          const updates = {};
          $inputs.each(function () {
            let val = $(this).val();
            try { val = JSON.parse(val); } catch (_) {}
            updates[$(this).data("col")] = val;
          });
          const res = await devFetch(`/api/dev/tables/${encodeURIComponent(tableName)}/${encodeURIComponent(rowId)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          });
          const d = await res.json();
          if (d.ok) { showToast(t("dev.edit_success"), "success"); $tableLoadBtn.trigger("click"); }
          else showToast(t("dev.edit_fail", { msg: d.error }), "error");
        });
      }

      $detailRow.find(".dev-detail-cancel").on("click", function () {
        $detailRow.remove();
        $tr.removeClass("dev-row-selected");
      });
    }

    // 행 클릭 → 읽기 전용 상세보기
    $container.find(".dev-table tbody tr").each(function () {
      const $tr = $(this);
      $tr.css("cursor", "pointer");
      $tr.on("click", function (e) {
        if ($(e.target).closest("button").length) return;
        openDetailCard($tr, false);
      });
    });

    // 수정 버튼 → 편집 모드 카드
    $container.find(".dev-edit-btn").each(function () {
      const $btn = $(this);
      $btn.on("click", function () {
        const $tr = $btn.closest("tr");
        openDetailCard($tr, true);
      });
    });

    // 삭제 버튼
    $container.find(".dev-del-btn").each(function () {
      const $btn = $(this);
      $btn.on("click", async function () {
        if (!confirm(t("dev.confirm_delete", { id: $btn.data("id") }))) return;
        const res = await devFetch(`/api/dev/tables/${encodeURIComponent($btn.data("table"))}/${encodeURIComponent($btn.data("id"))}`, { method: "DELETE" });
        const d = await res.json();
        if (d.ok) { showToast(t("dev.delete_success"), "success"); $tableLoadBtn.trigger("click"); }
        else showToast(t("dev.delete_fail", { msg: d.error }), "error");
      });
    });
  }

  function renderReadonlyTable($container, columns, data) {
    if (!data.length) { $container.html("<p>" + t("dev.no_result") + "</p>"); return; }
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
    $container.html(html);

    // 행 클릭 → 상세보기
    $container.find(".dev-table tbody tr").each(function () {
      const $tr = $(this);
      $tr.css("cursor", "pointer");
      $tr.on("click", function (e) {
        const $existing = $tr.next();
        if ($existing.hasClass("dev-row-detail")) {
          $existing.remove();
          $tr.removeClass("dev-row-selected");
          return;
        }
        $container.find(".dev-row-detail").each(function () {
          $(this).prev().removeClass("dev-row-selected");
          $(this).remove();
        });
        $tr.addClass("dev-row-selected");
        const $cells = $tr.find(".dev-ro-cell");
        let detailHtml = '<td colspan="' + columns.length + '"><div class="dev-detail-wrap">';
        $cells.each(function () {
          const col = $(this).data("col");
          let val;
          try { val = JSON.parse($(this).attr("data-full")); } catch(_) { val = $(this).attr("data-full"); }
          const displayVal = val == null ? '<span style="color:#999">NULL</span>' : esc(typeof val === "string" ? val : JSON.stringify(val, null, 2));
          const isLong = typeof val === "string" && val.length > 100;
          detailHtml += `<div class="dev-detail-field">
            <div class="dev-detail-label">${esc(col)}</div>
            <div class="dev-detail-value${isLong ? ' dev-detail-long' : ''}">${displayVal}</div>
          </div>`;
        });
        detailHtml += '</div></td>';
        const $detailRow = $("<tr>").addClass("dev-row-detail").html(detailHtml);
        $tr.after($detailRow);
      });
    });
  }

  // ══════════════════════════════════
  // 탭 관리
  // ══════════════════════════════════
  const $tabsList = $("#devTabsList");
  const $tabsSaveBtn = $("#devTabsSave");

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
      $tabsList.html(html);

      // 드래그 & 드롭
      let dragRow = null;
      $tabsList.find(".dev-tab-row").each(function () {
        const row = this;
        const $row = $(this);
        $row.on("dragstart", function (e) {
          dragRow = row;
          $row.addClass("dev-tab-dragging");
          e.originalEvent.dataTransfer.effectAllowed = "move";
        });
        $row.on("dragend", function () {
          $row.removeClass("dev-tab-dragging");
          $tabsList.find(".dev-tab-row").removeClass("dev-tab-dragover");
          dragRow = null;
          refreshTabButtons();
        });
        $row.on("dragover", function (e) {
          e.preventDefault();
          e.originalEvent.dataTransfer.dropEffect = "move";
          if (row !== dragRow) $row.addClass("dev-tab-dragover");
        });
        $row.on("dragleave", function () {
          $row.removeClass("dev-tab-dragover");
        });
        $row.on("drop", function (e) {
          e.preventDefault();
          $row.removeClass("dev-tab-dragover");
          if (!dragRow || dragRow === row) return;
          const $list = $row.parent();
          const rows = $list.find(".dev-tab-row").toArray();
          const fromIdx = rows.indexOf(dragRow);
          const toIdx = rows.indexOf(row);
          if (fromIdx < toIdx) $(dragRow).insertAfter($row);
          else $(dragRow).insertBefore($row);
          refreshTabButtons();
        });
      });

      // 위/아래 버튼
      $tabsList.find(".dev-tab-up").on("click", function () {
        const $row = $(this).closest(".dev-tab-row");
        const $prev = $row.prev();
        if ($prev.length) $row.insertBefore($prev);
        refreshTabButtons();
      });
      $tabsList.find(".dev-tab-down").on("click", function () {
        const $row = $(this).closest(".dev-tab-row");
        const $next = $row.next();
        if ($next.length) $row.insertAfter($next);
        refreshTabButtons();
      });
    } catch (e) {
      $tabsList.html(`<p class="dev-error">${e.message}</p>`);
    }
  }

  function refreshTabButtons() {
    const $rows = $tabsList.find(".dev-tab-row");
    $rows.each(function (i) {
      $(this).find(".dev-tab-up").prop("disabled", i === 0);
      $(this).find(".dev-tab-down").prop("disabled", i === $rows.length - 1);
    });
  }

  $tabsSaveBtn.on("click", async function () {
    const $rows = $tabsList.find(".dev-tab-row");
    const tabs = [];
    $rows.each(function (i) {
      tabs.push({
        id: $(this).data("id"),
        label: $(this).find(".dev-tab-label").val().trim(),
        visible: $(this).find(".dev-tab-visible").prop("checked"),
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
        showToast(t("dev.tabs_saved"), "success");
        if (typeof applyTabConfig === "function") applyTabConfig();
      } else {
        showToast(t("common.save_fail") + ": " + data.error, "error");
      }
    } catch (e) {
      showToast(t("common.save_fail") + ": " + e.message, "error");
    }
  });

  // ══════════════════════════════════
  // 모듈 설정
  // ══════════════════════════════════
  const $modContent = $("#devModContent");
  const $modSaveBtn = $("#devModSave");
  const $modAuthGate = $("#devModAuthGate");

  var AI_PROVIDERS_META = {
    openai:  { label: "OpenAI",  placeholder: "sk-..." },
    gemini:  { label: "Gemini",  placeholder: "AIza..." },
    claude:  { label: "Claude",  placeholder: "sk-ant-..." },
    grok:    { label: "Grok",    placeholder: "xai-..." },
  };

  function getModuleMeta() {
    return {
      mock: { label: t("dev.mod_mock"), fields: {
        log_fetch_limit: { label: t("dev.mod_log_fetch"), type: "number" },
        log_max_limit: { label: t("dev.mod_log_max"), type: "number" },
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
      $modContent.hide();
      $modSaveBtn.hide();
      showAuthGate($modAuthGate[0], () => {
        $modContent.show();
        $modSaveBtn.show();
        loadModuleSettings();
      });
      return;
    }
    $modAuthGate.hide();
    $modContent.show();

    try {
      const res = await devFetch("/api/dev/modules");
      if (res.status === 401) {
        devToken = "";
        sessionStorage.removeItem("devToken");
        updateAuthBadge();
        $modContent.hide();
        $modSaveBtn.hide();
        showAuthGate($modAuthGate[0], () => { $modContent.show(); $modSaveBtn.show(); loadModuleSettings(); });
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        $modContent.html(`<p class="dev-error">${data.error || t("dev.modules_fail")}</p>`);
        return;
      }
      const modules = data.modules || {};
      let html = "";

      // AI API Keys card (first)
      html += '<div class="dev-module-card"><h4>' + esc(t("dev.ai_api_keys")) + '</h4>';
      html += '<p class="desc" style="margin:0 0 10px;font-size:12px;color:#6b7280">' + esc(t("dev.ai_api_keys_desc")) + '</p>';
      html += '<div class="dev-module-fields">';
      // Fetch AI keys and render
      var aiKeysData = null;
      try {
        var aiRes = await fetch("/api/dev/ai-keys");
        aiKeysData = await aiRes.json();
      } catch (e) { /* ignore */ }
      for (var pid of Object.keys(AI_PROVIDERS_META)) {
        var pmeta = AI_PROVIDERS_META[pid];
        var masked = (aiKeysData && aiKeysData.keys && aiKeysData.keys[pid]) || "";
        var statusBadge = masked
          ? '<span class="ai-key-status registered">' + masked + '</span>'
          : '<span class="ai-key-status">' + (t("dev.ai_not_set") || "미등록") + '</span>';
        html += '<label class="dev-field">' +
          '<span>' + pmeta.label + ' ' + statusBadge + '</span>' +
          '<input type="password" class="dev-input dev-ai-key-input" data-provider="' + pid + '"' +
          ' placeholder="' + pmeta.placeholder + '" autocomplete="off">' +
          '</label>';
      }
      html += '</div></div>';

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
      $modContent.html(html);
      $modSaveBtn.show();
    } catch (e) {
      $modContent.html(`<p class="dev-error">${e.message}</p>`);
    }
  }

  $modSaveBtn.on("click", async function () {
    // Save module settings
    const $inputs = $modContent.find(".dev-mod-input");
    const modules = {};
    $inputs.each(function () {
      const $input = $(this);
      const mod = $input.data("mod");
      const key = $input.data("key");
      if (!modules[mod]) modules[mod] = {};
      let val = $input.val();
      if ($input.attr("type") === "number") val = parseFloat(val) || 0;
      modules[mod][key] = val;
    });

    // Save AI API keys (only non-empty ones)
    var $aiKeyInputs = $modContent.find(".dev-ai-key-input");
    var aiKeys = {};
    $aiKeyInputs.each(function () {
      var val = $(this).val().trim();
      if (val) aiKeys[$(this).data("provider")] = val;
    });

    try {
      var promises = [];
      promises.push(devFetch("/api/dev/modules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modules }),
      }));
      if (Object.keys(aiKeys).length > 0) {
        promises.push(fetch("/api/dev/ai-keys", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: aiKeys }),
        }));
      }
      var results = await Promise.all(promises);
      var allOk = true;
      for (var r of results) {
        var d = await r.json();
        if (!d.ok) { allOk = false; break; }
      }
      if (allOk) {
        showToast(t("dev.modules_saved"), "success");
        loadModuleSettings();
      } else {
        showToast(t("common.save_fail"), "error");
      }
    } catch (e) {
      showToast(t("common.save_fail") + ": " + e.message, "error");
    }
  });

  // ══════════════════════════════════
  // 플러그인 관리
  // ══════════════════════════════════
  const $pluginListEl = $("#devPluginList");

  async function loadPluginManager() {
    if (!$pluginListEl.length) return;
    try {
      const res = await fetch("/api/custom/plugins");
      const data = await res.json();
      if (!data.ok) return;

      $pluginListEl.empty();

      if (data.plugins.length === 0) {
        $pluginListEl.html('<p class="desc">' + t("dev.plugins_empty") + '</p>');
        return;
      }

      data.plugins.forEach(function (plugin) {
        var $card = $("<div>").addClass("plugin-card");
        $card.html(
          '<div class="plugin-card-header">' +
            '<div class="plugin-card-info">' +
              '<i data-lucide="' + (plugin.icon || "puzzle") + '"></i>' +
              '<div>' +
                '<strong>' + escapeHtml(plugin.name) + '</strong>' +
                '<span class="plugin-version">v' + escapeHtml(plugin.version) + '</span>' +
                (plugin.author ? '<span class="plugin-author"> · ' + escapeHtml(plugin.author) + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<label class="plugin-toggle">' +
              '<input type="checkbox" ' + (plugin.enabled ? 'checked' : '') + ' data-plugin-id="' + plugin.id + '">' +
              '<span class="plugin-toggle-slider"></span>' +
            '</label>' +
          '</div>' +
          (plugin.description ? '<p class="plugin-desc">' + escapeHtml(plugin.description) + '</p>' : ''));

        var $checkbox = $card.find('input[type="checkbox"]');
        $checkbox.on("change", async function () {
          var enabled = $(this).prop("checked");
          var pid = $(this).data("pluginId");
          try {
            await fetch("/api/custom/plugins/toggle", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: pid, enabled: enabled })
            });
            showToast(enabled ? t("dev.plugins_enabled") : t("dev.plugins_disabled"), "success");
          } catch (e) {
            showToast("Toggle failed", "error");
            $(this).prop("checked", !enabled);
          }
        });

        $pluginListEl.append($card);
      });

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      $pluginListEl.html('<p class="desc">Failed to load plugins</p>');
    }
  }

  // ══════════════════════════════════
  // CDN 관리
  // ══════════════════════════════════
  const $cdnContent = $("#devCdnContent");
  const $cdnAuthGate = $("#devCdnAuthGate");
  const $cdnSyncBtn = $("#devCdnSync");
  const $cdnSyncLatestBtn = $("#devCdnSyncLatest");
  const $cdnCheckLatestBtn = $("#devCdnCheckLatest");
  const $cdnStatus = $("#devCdnStatus");
  const $cdnList = $("#devCdnList");

  async function loadCdnManager() {
    await checkAuthStatus();
    if (authRegistered && !devToken) {
      $cdnContent.hide();
      showAuthGate($cdnAuthGate[0], () => { $cdnContent.show(); loadCdnManager(); });
      return;
    }
    $cdnAuthGate.hide();
    $cdnContent.show();

    try {
      var res = await devFetch("/api/dev/cdn/status");
      if (res.status === 401) {
        devToken = ""; sessionStorage.removeItem("devToken"); updateAuthBadge();
        $cdnContent.hide();
        showAuthGate($cdnAuthGate[0], () => { $cdnContent.show(); loadCdnManager(); });
        return;
      }
      var data = await res.json();
      if (!data.ok) { $cdnList.html('<p class="dev-error">' + t("dev.cdn_status_fail") + '</p>'); return; }
      renderCdnList(data.libs);
    } catch (e) {
      $cdnList.html('<p class="dev-error">' + e.message + '</p>');
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
    $cdnList.html(html);
  }

  function setCdnButtonsDisabled(disabled) {
    $cdnSyncBtn.prop("disabled", disabled);
    $cdnSyncLatestBtn.prop("disabled", disabled);
    $cdnCheckLatestBtn.prop("disabled", disabled);
  }

  // 최신 버전 확인
  $cdnCheckLatestBtn.on("click", async function() {
    setCdnButtonsDisabled(true);
    $cdnStatus.text(t("dev.cdn_checking"));
    $cdnStatus.css("color", "#f59e0b");
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
        $cdnList.html(html);
        $cdnStatus.text(t("dev.cdn_check_done"));
        $cdnStatus.css("color", "#22c55e");
      } else {
        $cdnStatus.text(t("dev.cdn_check_error"));
        $cdnStatus.css("color", "#ef4444");
      }
    } catch (e) {
      $cdnStatus.text(t("common.error") + ": " + e.message);
      $cdnStatus.css("color", "#ef4444");
    }
    setCdnButtonsDisabled(false);
  });

  // 현재 버전 다운로드
  async function doSync(useLatest) {
    setCdnButtonsDisabled(true);
    $cdnStatus.text((useLatest ? t("dev.cdn_latest_ver") : t("dev.cdn_config_ver")) + " " + t("dev.cdn_downloading"));
    $cdnStatus.css("color", "#f59e0b");
    try {
      var res = await devFetch("/api/dev/cdn/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useLatest: useLatest }),
      });
      var data = await res.json();
      if (data.ok) {
        $cdnStatus.text(data.summary);
        $cdnStatus.css("color", "#22c55e");
        var libs = data.results.map(function(r) {
          return { name: r.name, file: r.file, exists: r.ok, size: r.size || 0, currentVersion: r.version || "", configVersion: "" };
        });
        renderCdnList(libs);
        var failed = data.results.filter(function(r) { return !r.ok; });
        if (failed.length > 0) {
          $cdnStatus.text($cdnStatus.text() + t("dev.cdn_fail_count", { count: failed.map(function(f) { return f.name; }).join(", ") }));
          $cdnStatus.css("color", "#ef4444");
        }
      } else {
        $cdnStatus.text(t("dev.cdn_sync_fail"));
        $cdnStatus.css("color", "#ef4444");
      }
    } catch (e) {
      $cdnStatus.text(t("common.error") + ": " + e.message);
      $cdnStatus.css("color", "#ef4444");
    }
    setCdnButtonsDisabled(false);
  }

  $cdnSyncBtn.on("click", function() { doSync(false); });
  $cdnSyncLatestBtn.on("click", function() { doSync(true); });
})();
