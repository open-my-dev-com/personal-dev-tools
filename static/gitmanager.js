(function () {
  "use strict";

  // ── DOM refs ──
  const repoPathEl = document.getElementById("gitRepoPath");
  const pickRepoBtn = document.getElementById("gitPickRepoBtn");
  const refreshBtn = document.getElementById("gitRefreshBtn");
  const branchBar = document.getElementById("gitBranchBar");
  const currentBranchEl = document.getElementById("gitCurrentBranch");
  const branchSelect = document.getElementById("gitBranchSelect");
  const switchBranchBtn = document.getElementById("gitSwitchBranchBtn");
  const newBranchBtn = document.getElementById("gitNewBranchBtn");
  const mainEl = document.getElementById("gitMain");
  const fileListEl = document.getElementById("gitFileList");
  const diffHeader = document.getElementById("gitDiffHeader");
  const diffLeft = document.getElementById("gitDiffLeft");
  const diffRight = document.getElementById("gitDiffRight");
  const actionBar = document.getElementById("gitActionBar");
  const selectAllBtn = document.getElementById("gitSelectAllBtn");
  const deselectAllBtn = document.getElementById("gitDeselectAllBtn");
  const discardBtn = document.getElementById("gitDiscardBtn");
  const commitArea = document.getElementById("gitCommitArea");
  const commitMsg = document.getElementById("gitCommitMsg");
  const commitBtn = document.getElementById("gitCommitBtn");
  const templateSelect = document.getElementById("gitTemplateSelect");
  const templateManageBtn = document.getElementById("gitTemplateManageBtn");
  const templateModal = document.getElementById("gitTemplateModal");
  const templateModalClose = document.getElementById("gitTemplateModalClose");
  const templateList = document.getElementById("gitTemplateList");
  const templateNameInput = document.getElementById("gitTemplateNameInput");
  const templateContentInput = document.getElementById("gitTemplateContentInput");
  const templateAddBtn = document.getElementById("gitTemplateAddBtn");
  const logArea = document.getElementById("gitLogArea");
  const logBody = document.getElementById("gitLogBody");

  // ── State ──
  let repoPath = localStorage.getItem("gitRepoPath") || "";
  let currentBranch = "";
  let files = [];
  let selectedFile = null;
  let templates = [];
  let gitUser = "";
  let gitEmail = "";

  if (repoPath) {
    repoPathEl.value = repoPath;
    loadStatus();
  }

  // ── 저장소 선택 ──
  pickRepoBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/git/pick-repo", { method: "POST" });
      const data = await res.json();
      if (data.ok && data.path) {
        repoPath = data.path;
        repoPathEl.value = repoPath;
        localStorage.setItem("gitRepoPath", repoPath);
        loadStatus();
      }
    } catch (e) {
      alert("폴더 선택 실패: " + e.message);
    }
  });

  refreshBtn.addEventListener("click", () => {
    repoPath = repoPathEl.value.trim();
    if (repoPath) {
      localStorage.setItem("gitRepoPath", repoPath);
      loadStatus();
    }
  });

  repoPathEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      refreshBtn.click();
    }
  });

  // ── Status 로드 ──
  async function loadStatus() {
    if (!repoPath) return;
    try {
      const res = await fetch(`/api/git/status?repo=${encodeURIComponent(repoPath)}`);
      const data = await res.json();
      if (!data.ok) {
        alert(data.error);
        hideAll();
        return;
      }
      currentBranch = data.branch;
      gitUser = data.user || "";
      gitEmail = data.email || "";
      files = data.files.map((f) => ({ ...f, checked: true }));
      currentBranchEl.textContent = currentBranch;

      branchBar.style.display = "flex";
      mainEl.style.display = "flex";
      actionBar.style.display = "flex";
      commitArea.style.display = "block";
      logArea.style.display = "block";

      renderFileList();
      loadBranches();
      loadLog();
      loadTemplates();

      // 첫 번째 파일 자동 선택
      if (files.length > 0) {
        selectFile(files[0].file);
      } else {
        diffHeader.textContent = "변경된 파일이 없습니다";
        diffLeft.innerHTML = "";
        diffRight.innerHTML = "";
      }
    } catch (e) {
      alert("상태 조회 실패: " + e.message);
    }
  }

  function hideAll() {
    branchBar.style.display = "none";
    mainEl.style.display = "none";
    actionBar.style.display = "none";
    commitArea.style.display = "none";
    logArea.style.display = "none";
  }

  // ── 파일 목록 렌더링 ──
  function renderFileList() {
    fileListEl.innerHTML = "";
    files.forEach((f) => {
      const item = document.createElement("div");
      item.className = "git-file-item" + (selectedFile === f.file ? " active" : "");
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
      item.innerHTML =
        `<input type="checkbox" ${f.checked ? "checked" : ""}>` +
        `<span class="git-file-status git-file-status-${statusClass}">${statusChar}</span>` +
        `<span class="git-file-name" title="${f.file}">${f.file}</span>`;
      const cb = item.querySelector("input");
      cb.addEventListener("change", (e) => {
        e.stopPropagation();
        f.checked = cb.checked;
      });
      item.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT") return;
        selectFile(f.file);
      });
      fileListEl.appendChild(item);
    });
  }

  // ── Diff 로드 ──
  async function selectFile(fname) {
    selectedFile = fname;
    renderFileList();
    diffHeader.textContent = fname;
    diffLeft.innerHTML = "<div style='padding:12px;color:var(--muted)'>로딩 중...</div>";
    diffRight.innerHTML = "";
    try {
      const res = await fetch(`/api/git/diff?repo=${encodeURIComponent(repoPath)}&file=${encodeURIComponent(fname)}`);
      const data = await res.json();
      if (!data.ok) {
        diffLeft.innerHTML = `<div style="padding:12px;color:var(--danger)">${data.error}</div>`;
        return;
      }
      if (data.binary) {
        diffLeft.innerHTML = '<div style="padding:12px;color:var(--muted)">Binary file</div>';
        diffRight.innerHTML = '<div style="padding:12px;color:var(--muted)">Binary file</div>';
        return;
      }
      renderDiff(data.left, data.right);
    } catch (e) {
      diffLeft.innerHTML = `<div style="padding:12px;color:var(--danger)">${e.message}</div>`;
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

    diffLeft.innerHTML = leftHtml.join("");
    diffRight.innerHTML = rightHtml.join("");

    // 좌우 라인 높이 동기화
    requestAnimationFrame(function () {
      var leftEls = diffLeft.children;
      var rightEls = diffRight.children;
      var len = Math.min(leftEls.length, rightEls.length);
      for (var i = 0; i < len; i++) {
        leftEls[i].style.minHeight = "";
        rightEls[i].style.minHeight = "";
      }
      diffLeft.offsetHeight;
      for (var i = 0; i < len; i++) {
        var lh = leftEls[i].offsetHeight;
        var rh = rightEls[i].offsetHeight;
        if (lh !== rh) {
          var maxH = Math.max(lh, rh) + "px";
          leftEls[i].style.minHeight = maxH;
          rightEls[i].style.minHeight = maxH;
        }
      }
    });

    // 동기 스크롤
    setupSyncScroll(diffLeft, diffRight);
  }

  function diffLine(num, text, cls) {
    var escaped = (text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return '<div class="git-diff-line ' + cls + '">' +
      '<span class="git-diff-line-num">' + num + '</span>' +
      '<span class="git-diff-line-content">' + escaped + '</span></div>';
  }

  var scrollSyncing = false;
  function setupSyncScroll(left, right) {
    left.onscroll = function () {
      if (scrollSyncing) return;
      scrollSyncing = true;
      right.scrollTop = left.scrollTop;
      right.scrollLeft = left.scrollLeft;
      scrollSyncing = false;
    };
    right.onscroll = function () {
      if (scrollSyncing) return;
      scrollSyncing = true;
      left.scrollTop = right.scrollTop;
      left.scrollLeft = right.scrollLeft;
      scrollSyncing = false;
    };
  }

  // ── 전체 선택/해제 ──
  selectAllBtn.addEventListener("click", () => {
    files.forEach((f) => (f.checked = true));
    renderFileList();
  });
  deselectAllBtn.addEventListener("click", () => {
    files.forEach((f) => (f.checked = false));
    renderFileList();
  });

  // ── Discard ──
  discardBtn.addEventListener("click", async () => {
    var checked = files.filter((f) => f.checked);
    if (checked.length === 0) {
      alert("파일을 선택하세요");
      return;
    }
    if (!confirm("선택한 " + checked.length + "개 파일의 변경사항을 버리시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) {
      return;
    }
    try {
      var res = await fetch("/api/git/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: repoPath,
          files: checked.map((f) => ({ file: f.file, status: f.status })),
        }),
      });
      var data = await res.json();
      if (!data.ok) {
        alert("Discard 실패: " + data.error);
      }
      loadStatus();
    } catch (e) {
      alert("Discard 실패: " + e.message);
    }
  });

  // ── Commit ──
  commitBtn.addEventListener("click", async () => {
    var checked = files.filter((f) => f.checked);
    if (checked.length === 0) {
      alert("커밋할 파일을 선택하세요");
      return;
    }
    var msg = commitMsg.value.trim();
    if (!msg) {
      alert("커밋 메시지를 입력하세요");
      commitMsg.focus();
      return;
    }
    try {
      var res = await fetch("/api/git/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: repoPath,
          files: checked.map((f) => f.file),
          message: msg,
        }),
      });
      var data = await res.json();
      if (!data.ok) {
        alert("커밋 실패: " + data.error);
        return;
      }
      commitMsg.value = "";
      loadStatus();
    } catch (e) {
      alert("커밋 실패: " + e.message);
    }
  });

  // ── 브랜치 ──
  async function loadBranches() {
    try {
      var res = await fetch(`/api/git/branches?repo=${encodeURIComponent(repoPath)}`);
      var data = await res.json();
      if (!data.ok) return;
      branchSelect.innerHTML = "";
      data.local.forEach((b) => {
        var opt = document.createElement("option");
        opt.value = b;
        opt.textContent = b;
        if (b === data.current) opt.selected = true;
        branchSelect.appendChild(opt);
      });
      if (data.remote.length > 0) {
        var og = document.createElement("optgroup");
        og.label = "리모트";
        data.remote.forEach((b) => {
          var opt = document.createElement("option");
          opt.value = b;
          opt.textContent = b;
          og.appendChild(opt);
        });
        branchSelect.appendChild(og);
      }
    } catch (_) {}
  }

  switchBranchBtn.addEventListener("click", async () => {
    var branch = branchSelect.value;
    if (!branch) return;
    try {
      var res = await fetch("/api/git/switch-branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: repoPath, branch }),
      });
      var data = await res.json();
      if (!data.ok) {
        alert("브랜치 전환 실패: " + data.error);
        return;
      }
      loadStatus();
    } catch (e) {
      alert("브랜치 전환 실패: " + e.message);
    }
  });

  newBranchBtn.addEventListener("click", async () => {
    var name = prompt("새 브랜치 이름:");
    if (!name || !name.trim()) return;
    try {
      var res = await fetch("/api/git/create-branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: repoPath, branch: name.trim() }),
      });
      var data = await res.json();
      if (!data.ok) {
        alert("브랜치 생성 실패: " + data.error);
        return;
      }
      loadStatus();
    } catch (e) {
      alert("브랜치 생성 실패: " + e.message);
    }
  });

  // ── 커밋 로그 ──
  async function loadLog() {
    try {
      var res = await fetch(`/api/git/log?repo=${encodeURIComponent(repoPath)}&limit=20`);
      var data = await res.json();
      if (!data.ok) return;
      logBody.innerHTML = "";
      data.logs.forEach((log) => {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + esc(log.hash) + "</td>" +
          "<td>" + esc(log.message) + "</td>" +
          "<td>" + esc(log.author) + "</td>" +
          "<td>" + esc(log.date) + "</td>";
        logBody.appendChild(tr);
      });
    } catch (_) {}
  }

  // ── 템플릿 ──
  async function loadTemplates() {
    try {
      var res = await fetch(`/api/git/templates?repo=${encodeURIComponent(repoPath)}`);
      var data = await res.json();
      if (!data.ok) return;
      templates = data.templates;
      renderTemplateSelect();
    } catch (_) {}
  }

  function renderTemplateSelect() {
    templateSelect.innerHTML = '<option value="">템플릿 선택...</option>';
    templates.forEach((t) => {
      var opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      templateSelect.appendChild(opt);
    });
  }

  templateSelect.addEventListener("change", () => {
    var id = parseInt(templateSelect.value);
    if (!id) return;
    var tpl = templates.find((t) => t.id === id);
    if (tpl) {
      commitMsg.value = resolveTemplate(tpl.template);
      commitMsg.focus();
    }
  });

  templateManageBtn.addEventListener("click", () => {
    templateModal.style.display = templateModal.style.display === "none" ? "block" : "none";
    if (templateModal.style.display === "block") renderTemplateList();
  });

  templateModalClose.addEventListener("click", () => {
    templateModal.style.display = "none";
  });

  function renderTemplateList() {
    templateList.innerHTML = "";
    templates.forEach((t) => {
      var item = document.createElement("div");
      item.className = "git-template-item";
      item.innerHTML =
        '<span class="git-template-item-name">' + esc(t.name) + "</span>" +
        '<span class="git-template-item-content">' + esc(t.template) + "</span>" +
        '<button class="git-btn-sm git-btn-danger" data-id="' + t.id + '">삭제</button>';
      item.querySelector("button").addEventListener("click", async () => {
        await fetch("/api/git/templates/" + t.id, { method: "DELETE" });
        loadTemplates();
        renderTemplateList();
      });
      templateList.appendChild(item);
    });
  }

  templateAddBtn.addEventListener("click", async () => {
    var name = templateNameInput.value.trim();
    var content = templateContentInput.value;
    if (!name) {
      alert("템플릿 이름을 입력하세요");
      return;
    }
    try {
      await fetch("/api/git/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: repoPath, name, template: content }),
      });
      templateNameInput.value = "";
      templateContentInput.value = "";
      loadTemplates();
      renderTemplateList();
    } catch (e) {
      alert("템플릿 추가 실패: " + e.message);
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
})();
