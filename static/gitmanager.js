(function () {
  "use strict";

  // ── DOM refs (jQuery) ──
  const $repoPathEl = $("#gitRepoPath");
  const $pickRepoBtn = $("#gitPickRepoBtn");
  const $refreshBtn = $("#gitRefreshBtn");
  const $branchBar = $("#gitBranchBar");
  const $currentBranchEl = $("#gitCurrentBranch");
  const $branchSelect = $("#gitBranchSelect");
  const $switchBranchBtn = $("#gitSwitchBranchBtn");
  const $newBranchBtn = $("#gitNewBranchBtn");
  const $mainEl = $("#gitMain");
  const $fileListEl = $("#gitFileList");
  const $diffHeader = $("#gitDiffHeader");
  const $diffLeft = $("#gitDiffLeft");
  const $diffRight = $("#gitDiffRight");
  const $actionBar = $("#gitActionBar");
  const $selectAllBtn = $("#gitSelectAllBtn");
  const $deselectAllBtn = $("#gitDeselectAllBtn");
  const $discardBtn = $("#gitDiscardBtn");
  const $commitArea = $("#gitCommitArea");
  const $commitMsg = $("#gitCommitMsg");
  const $commitBtn = $("#gitCommitBtn");
  const $templateSelect = $("#gitTemplateSelect");
  const $templateManageBtn = $("#gitTemplateManageBtn");
  const $templateModal = $("#gitTemplateModal");
  const $templateModalClose = $("#gitTemplateModalClose");
  const $templateList = $("#gitTemplateList");
  const $templateNameInput = $("#gitTemplateNameInput");
  const $templateContentInput = $("#gitTemplateContentInput");
  const $templateAddBtn = $("#gitTemplateAddBtn");
  const $logArea = $("#gitLogArea");
  const $logBody = $("#gitLogBody");

  // ── State ──
  let repoPath = localStorage.getItem("gitRepoPath") || "";
  let currentBranch = "";
  let files = [];
  let selectedFile = null;
  let templates = [];
  let gitUser = "";
  let gitEmail = "";

  if (repoPath) {
    $repoPathEl.val(repoPath);
    loadStatus();
  }

  // ── 저장소 선택 ──
  $pickRepoBtn.on("click", async () => {
    try {
      const data = await $.ajax({
        url: "/api/git/pick-repo",
        method: "POST",
        dataType: "json"
      });
      if (data.ok && data.path) {
        repoPath = data.path;
        $repoPathEl.val(repoPath);
        localStorage.setItem("gitRepoPath", repoPath);
        loadStatus();
      }
    } catch (e) {
      showToast(t("git.folder_select_fail", { msg: e.message || e.statusText }), "error");
    }
  });

  $refreshBtn.on("click", () => {
    repoPath = $repoPathEl.val().trim();
    if (repoPath) {
      localStorage.setItem("gitRepoPath", repoPath);
      loadStatus();
    }
  });

  $repoPathEl.on("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $refreshBtn[0].click();
    }
  });

  // ── Status 로드 ──
  async function loadStatus() {
    if (!repoPath) return;
    try {
      const data = await $.getJSON(`/api/git/status?repo=${encodeURIComponent(repoPath)}`);
      if (!data.ok) {
        showToast(data.error, "error");
        hideAll();
        return;
      }
      currentBranch = data.branch;
      gitUser = data.user || "";
      gitEmail = data.email || "";
      files = data.files.map((f) => ({ ...f, checked: true }));
      $currentBranchEl.text(currentBranch);

      $branchBar.css("display", "flex");
      $mainEl.css("display", "flex");
      $actionBar.css("display", "flex");
      $commitArea.show();
      $logArea.show();

      renderFileList();
      loadBranches();
      loadLog();
      loadTemplates();

      // 첫 번째 파일 자동 선택
      if (files.length > 0) {
        selectFile(files[0].file);
      } else {
        $diffHeader.text(t("git.no_changes"));
        $diffLeft.html("");
        $diffRight.html("");
      }
    } catch (e) {
      showToast(t("git.status_fail", { msg: e.message || e.statusText }), "error");
    }
  }

  function hideAll() {
    $branchBar.hide();
    $mainEl.hide();
    $actionBar.hide();
    $commitArea.hide();
    $logArea.hide();
  }

  // ── 파일 목록 렌더링 ──
  function renderFileList() {
    $fileListEl.html("");
    files.forEach((f) => {
      var $item = $("<div>");
      $item.addClass("git-file-item");
      if (selectedFile === f.file) $item.addClass("active");
      const statusChar =
        f.status === "untracked" ? "?" :
        f.status === "added" ? "A" :
        f.status === "deleted" ? "D" :
        f.status === "renamed" ? "R" : "M";
      const statusClass =
        f.status === "untracked" ? "U" :
        f.status === "added" ? "A" :
        f.status === "deleted" ? "D" :
        f.status === "renamed" ? "R" : "M";
      $item.html(
        `<input type="checkbox" ${f.checked ? "checked" : ""}>` +
        `<span class="git-file-status git-file-status-${statusClass}">${statusChar}</span>` +
        `<span class="git-file-name" title="${f.file}">${f.file}</span>`);
      var $cb = $item.find("input");
      $cb.on("change", (e) => {
        e.stopPropagation();
        f.checked = $cb.prop("checked");
      });
      $item.on("click", (e) => {
        if (e.target.tagName === "INPUT") return;
        selectFile(f.file);
      });
      $fileListEl.append($item);
    });
  }

  // ── Diff 로드 ──
  async function selectFile(fname) {
    selectedFile = fname;
    renderFileList();
    $diffHeader.text(fname);
    $diffLeft.html("<div style='padding:12px;color:var(--muted)'>" + t("common.load") + "...</div>");
    $diffRight.html("");
    try {
      const data = await $.getJSON(`/api/git/diff?repo=${encodeURIComponent(repoPath)}&file=${encodeURIComponent(fname)}`);
      if (!data.ok) {
        $diffLeft.html(`<div style="padding:12px;color:var(--danger)">${data.error}</div>`);
        return;
      }
      if (data.binary) {
        $diffLeft.html('<div style="padding:12px;color:var(--muted)">Binary file</div>');
        $diffRight.html('<div style="padding:12px;color:var(--muted)">Binary file</div>');
        return;
      }
      renderDiff(data.left, data.right);
    } catch (e) {
      $diffLeft.html(`<div style="padding:12px;color:var(--danger)">${e.message || e.statusText}</div>`);
    }
  }

  // ── Side-by-side diff 렌더링 ──
  function renderDiff(leftText, rightText) {
    var dmp = new diff_match_patch();
    var leftLines = leftText.split("\n");
    var rightLines = rightText.split("\n");

    // 라인 레벨 diff
    var lineObj = dmp.diff_linesToChars_(leftText, rightText);
    var diffs = dmp.diff_main(lineObj.chars1, lineObj.chars2, false);
    dmp.diff_charsToLines_(diffs, lineObj.lineArray);

    var leftHtml = [];
    var rightHtml = [];
    var leftNum = 0;
    var rightNum = 0;

    diffs.forEach(function (d) {
      var op = d[0];
      var lines = d[1].split("\n");
      // 마지막 빈 줄 제거 (split 아티팩트)
      if (lines[lines.length - 1] === "") lines.pop();

      if (op === 0) {
        // 동일
        lines.forEach(function (line) {
          leftNum++;
          rightNum++;
          leftHtml.push(diffLine(leftNum, line, ""));
          rightHtml.push(diffLine(rightNum, line, ""));
        });
      } else if (op === -1) {
        // 삭제 (왼쪽에만)
        lines.forEach(function (line) {
          leftNum++;
          leftHtml.push(diffLine(leftNum, line, "git-diff-line-removed"));
          rightHtml.push(diffLine("", "", "git-diff-line-empty"));
        });
      } else if (op === 1) {
        // 추가 (오른쪽에만)
        lines.forEach(function (line) {
          rightNum++;
          leftHtml.push(diffLine("", "", "git-diff-line-empty"));
          rightHtml.push(diffLine(rightNum, line, "git-diff-line-added"));
        });
      }
    });

    $diffLeft.html(leftHtml.join(""));
    $diffRight.html(rightHtml.join(""));

    // 좌우 라인 높이 동기화
    requestAnimationFrame(function () {
      var leftEls = $diffLeft.children();
      var rightEls = $diffRight.children();
      var len = Math.min(leftEls.length, rightEls.length);
      for (var i = 0; i < len; i++) {
        $(leftEls[i]).css("minHeight", "");
        $(rightEls[i]).css("minHeight", "");
      }
      $diffLeft[0].offsetHeight;
      for (var i = 0; i < len; i++) {
        var lh = leftEls[i].offsetHeight;
        var rh = rightEls[i].offsetHeight;
        if (lh !== rh) {
          var maxH = Math.max(lh, rh) + "px";
          $(leftEls[i]).css("minHeight", maxH);
          $(rightEls[i]).css("minHeight", maxH);
        }
      }
    });

    // 동기 스크롤
    setupSyncScroll($diffLeft, $diffRight);
  }

  function diffLine(num, text, cls) {
    var escaped = (text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return '<div class="git-diff-line ' + cls + '">' +
      '<span class="git-diff-line-num">' + num + '</span>' +
      '<span class="git-diff-line-content">' + escaped + '</span></div>';
  }

  var scrollSyncing = false;
  function setupSyncScroll($left, $right) {
    $left.on("scroll", function () {
      if (scrollSyncing) return;
      scrollSyncing = true;
      $right[0].scrollTop = $left[0].scrollTop;
      $right[0].scrollLeft = $left[0].scrollLeft;
      scrollSyncing = false;
    });
    $right.on("scroll", function () {
      if (scrollSyncing) return;
      scrollSyncing = true;
      $left[0].scrollTop = $right[0].scrollTop;
      $left[0].scrollLeft = $right[0].scrollLeft;
      scrollSyncing = false;
    });
  }

  // ── 전체 선택/해제 ──
  $selectAllBtn.on("click", () => {
    files.forEach((f) => (f.checked = true));
    renderFileList();
  });
  $deselectAllBtn.on("click", () => {
    files.forEach((f) => (f.checked = false));
    renderFileList();
  });

  // ── Discard ──
  $discardBtn.on("click", async () => {
    var checked = files.filter((f) => f.checked);
    if (checked.length === 0) {
      showToast(t("git.select_files"), "error");
      return;
    }
    if (!confirm(t("git.confirm_discard", { count: checked.length }))) {
      return;
    }
    try {
      var data = await $.ajax({
        url: "/api/git/discard",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({
          repo: repoPath,
          files: checked.map((f) => ({ file: f.file, status: f.status })),
        }),
        dataType: "json"
      });
      if (!data.ok) {
        showToast(t("git.discard_fail", { msg: data.error }), "error");
      } else {
        showToast(t("git.discard_success"), "success");
      }
      loadStatus();
    } catch (e) {
      showToast(t("git.discard_fail", { msg: e.message || e.statusText }), "error");
    }
  });

  // ── Commit ──
  $commitBtn.on("click", async () => {
    var checked = files.filter((f) => f.checked);
    if (checked.length === 0) {
      showToast(t("git.select_commit_files"), "error");
      return;
    }
    var msg = $commitMsg.val().trim();
    if (!msg) {
      showToast(t("git.commit_msg_required"), "error");
      $commitMsg.trigger("focus");
      return;
    }
    try {
      var data = await $.ajax({
        url: "/api/git/commit",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({
          repo: repoPath,
          files: checked.map((f) => f.file),
          message: msg,
        }),
        dataType: "json"
      });
      if (!data.ok) {
        showToast(t("git.commit_fail", { msg: data.error }), "error");
        return;
      }
      showToast(t("git.commit_success"), "success");
      $commitMsg.val("");
      loadStatus();
    } catch (e) {
      showToast(t("git.commit_fail", { msg: e.message || e.statusText }), "error");
    }
  });

  // ── 브랜치 ──
  async function loadBranches() {
    try {
      var data = await $.getJSON(`/api/git/branches?repo=${encodeURIComponent(repoPath)}`);
      if (!data.ok) return;
      $branchSelect.html("");
      data.local.forEach((b) => {
        var $opt = $("<option>").val(b).text(b);
        if (b === data.current) $opt.prop("selected", true);
        $branchSelect.append($opt);
      });
      if (data.remote.length > 0) {
        var $og = $("<optgroup>").attr("label", t("git.remote"));
        data.remote.forEach((b) => {
          var $opt = $("<option>").val(b).text(b);
          $og.append($opt);
        });
        $branchSelect.append($og);
      }
    } catch (_) {}
  }

  $switchBranchBtn.on("click", async () => {
    var branch = $branchSelect.val();
    if (!branch) return;
    try {
      var data = await $.ajax({
        url: "/api/git/switch-branch",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({ repo: repoPath, branch }),
        dataType: "json"
      });
      if (!data.ok) {
        showToast(t("git.switch_fail", { msg: data.error }), "error");
        return;
      }
      showToast(t("git.switch_success"), "success");
      loadStatus();
    } catch (e) {
      showToast(t("git.switch_fail", { msg: e.message || e.statusText }), "error");
    }
  });

  $newBranchBtn.on("click", async () => {
    var name = prompt(t("git.new_branch_name"));
    if (!name || !name.trim()) return;
    try {
      var data = await $.ajax({
        url: "/api/git/create-branch",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({ repo: repoPath, branch: name.trim() }),
        dataType: "json"
      });
      if (!data.ok) {
        showToast(t("git.create_fail", { msg: data.error }), "error");
        return;
      }
      showToast(t("git.branch_create_success"), "success");
      loadStatus();
    } catch (e) {
      showToast(t("git.create_fail", { msg: e.message || e.statusText }), "error");
    }
  });

  // ── 커밋 로그 ──
  async function loadLog() {
    try {
      var data = await $.getJSON(`/api/git/log?repo=${encodeURIComponent(repoPath)}&limit=20`);
      if (!data.ok) return;
      $logBody.html("");
      data.logs.forEach((log) => {
        var $tr = $("<tr>");
        $tr.html(
          "<td>" + esc(log.hash) + "</td>" +
          "<td>" + esc(log.message) + "</td>" +
          "<td>" + esc(log.author) + "</td>" +
          "<td>" + esc(log.date) + "</td>");
        $logBody.append($tr);
      });
    } catch (_) {}
  }

  // ── 템플릿 ──
  async function loadTemplates() {
    try {
      var data = await $.getJSON(`/api/git/templates?repo=${encodeURIComponent(repoPath)}`);
      if (!data.ok) return;
      templates = data.templates;
      renderTemplateSelect();
    } catch (_) {}
  }

  function renderTemplateSelect() {
    $templateSelect.html('<option value="">' + t("git.template_select") + '</option>');
    templates.forEach((t) => {
      var $opt = $("<option>").val(t.id).text(t.name);
      $templateSelect.append($opt);
    });
  }

  $templateSelect.on("change", () => {
    var id = parseInt($templateSelect.val());
    if (!id) return;
    var tpl = templates.find((t) => t.id === id);
    if (tpl) {
      $commitMsg.val(resolveTemplate(tpl.template));
      $commitMsg.trigger("focus");
    }
  });

  $templateManageBtn.on("click", () => {
    if ($templateModal.css("display") === "none") {
      $templateModal.show();
      renderTemplateList();
    } else {
      $templateModal.hide();
    }
  });

  $templateModalClose.on("click", () => {
    $templateModal.hide();
  });

  function renderTemplateList() {
    $templateList.html("");
    templates.forEach((t) => {
      var $item = $("<div>").addClass("git-template-item");
      $item.html(
        '<span class="git-template-item-name">' + esc(t.name) + "</span>" +
        '<span class="git-template-item-content">' + esc(t.template) + "</span>" +
        '<button class="git-btn-sm git-btn-danger" data-id="' + t.id + '">' + window.t("common.delete") + '</button>');
      $item.find("button").on("click", async () => {
        await $.ajax({ url: "/api/git/templates/" + t.id, method: "DELETE" });
        loadTemplates();
        renderTemplateList();
      });
      $templateList.append($item);
    });
  }

  $templateAddBtn.on("click", async () => {
    var name = $templateNameInput.val().trim();
    var content = $templateContentInput.val();
    if (!name) {
      showToast(t("git.template_name_required"), "error");
      return;
    }
    try {
      await $.ajax({
        url: "/api/git/templates",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({ repo: repoPath, name, template: content }),
        dataType: "json"
      });
      $templateNameInput.val("");
      $templateContentInput.val("");
      loadTemplates();
      renderTemplateList();
    } catch (e) {
      showToast(t("git.template_add_fail", { msg: e.message || e.statusText }), "error");
    }
  });

  // ── 템플릿 변수 치환 ──
  function resolveTemplate(tpl) {
    var now = new Date();
    var checkedFiles = files.filter((f) => f.checked);

    // 포맷 토큰 치환
    function formatDate(fmt) {
      return fmt
        .replace("YYYY", String(now.getFullYear()))
        .replace("MM", pad(now.getMonth() + 1))
        .replace("DD", pad(now.getDate()))
        .replace("HH", pad(now.getHours()))
        .replace("mm", pad(now.getMinutes()))
        .replace("ss", pad(now.getSeconds()));
    }

    function pad(n) {
      return n < 10 ? "0" + n : String(n);
    }

    var defaultDate = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
    var defaultTime = pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());
    var defaultDatetime = defaultDate + " " + defaultTime;

    var result = tpl;
    // ${date:FORMAT} ${time:FORMAT} ${datetime:FORMAT}
    result = result.replace(/\$\{datetime:([^}]+)\}/g, function (_, fmt) { return formatDate(fmt); });
    result = result.replace(/\$\{date:([^}]+)\}/g, function (_, fmt) { return formatDate(fmt); });
    result = result.replace(/\$\{time:([^}]+)\}/g, function (_, fmt) { return formatDate(fmt); });
    // 기본값
    result = result.replace(/\$\{datetime\}/g, defaultDatetime);
    result = result.replace(/\$\{date\}/g, defaultDate);
    result = result.replace(/\$\{time\}/g, defaultTime);
    result = result.replace(/\$\{branch\}/g, currentBranch);
    result = result.replace(/\$\{user\}/g, gitUser);
    result = result.replace(/\$\{email\}/g, gitEmail);
    result = result.replace(/\$\{files\}/g, checkedFiles.map((f) => f.file.split("/").pop()).join(", "));
    result = result.replace(/\$\{file_count\}/g, String(checkedFiles.length));

    return result;
  }

  function esc(s) {
    if (!s) return "";
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  $(window).on("langchange", function () {
    if (templates.length) renderTemplateSelect();
  });
})();
