(function () {
  "use strict";

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  // DOM refs
  const modeRadios = document.querySelectorAll('input[name="diffMode"]');
  const textInputs = document.getElementById("diffTextInputs");
  const fileInputs = document.getElementById("diffFileInputs");
  const folderInputs = document.getElementById("diffFolderInputs");
  const compareBtn = document.getElementById("diffCompareBtn");
  const clearBtn = document.getElementById("diffClearBtn");
  const copyLeftBtn = document.getElementById("diffCopyLeftBtn");
  const copyRightBtn = document.getElementById("diffCopyRightBtn");
  const saveLeftBtn = document.getElementById("diffSaveLeftBtn");
  const saveRightBtn = document.getElementById("diffSaveRightBtn");
  const statusEl = document.getElementById("diffStatus");
  const leftTextEl = document.getElementById("diffLeftText");
  const rightTextEl = document.getElementById("diffRightText");
  const leftFileNameEl = document.getElementById("diffLeftFileName");
  const rightFileNameEl = document.getElementById("diffRightFileName");
  const leftFilePathEl = document.getElementById("diffLeftFilePath");
  const rightFilePathEl = document.getElementById("diffRightFilePath");
  const leftFilePickBtn = document.getElementById("diffLeftFilePickBtn");
  const rightFilePickBtn = document.getElementById("diffRightFilePickBtn");
  const leftFolderEl = document.getElementById("diffLeftFolder");
  const rightFolderEl = document.getElementById("diffRightFolder");
  const leftFolderBtn = document.getElementById("diffLeftFolderBtn");
  const rightFolderBtn = document.getElementById("diffRightFolderBtn");
  const leftFolderNameEl = document.getElementById("diffLeftFolderName");
  const rightFolderNameEl = document.getElementById("diffRightFolderName");
  const fileTreeEl = document.getElementById("diffFileTree");
  const resultEl = document.getElementById("diffResult");
  const statsEl = document.getElementById("diffStats");
  const viewLeftEl = document.getElementById("diffViewLeft");
  const viewRightEl = document.getElementById("diffViewRight");

  // State
  let currentMode = "text";
  let diffBlocks = [];
  let activeBlockIndex = -1;
  let alignedLeft = [];
  let alignedRight = [];

  // ── Utility ──

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? "#bf233a" : "#65748b";
  }

  function isTabActive() {
    const tab = document.querySelector('.tab-content[data-tab="diffcompare"]');
    return tab && tab.classList.contains("active");
  }

  // ── Mode switching ──

  function switchMode(mode) {
    currentMode = mode;
    textInputs.style.display = mode === "text" ? "" : "none";
    fileInputs.style.display = mode === "file" ? "" : "none";
    folderInputs.style.display = mode === "folder" ? "" : "none";
    fileTreeEl.style.display = "none";
  }

  modeRadios.forEach(function (radio) {
    radio.addEventListener("change", function () {
      switchMode(radio.value);
    });
  });

  // ── File mode: 서버 네이티브 파일 선택 ──

  async function pickFile(inputEl) {
    try {
      var res = await fetch("/api/diff/pick-file", { method: "POST" });
      var data = await res.json();
      if (data.ok) {
        inputEl.value = data.path;
      }
    } catch (e) {
      setStatus(t("diff.file_select_fail", { msg: e.message }), true);
    }
  }

  leftFilePickBtn.addEventListener("click", function () { pickFile(leftFilePathEl); });
  rightFilePickBtn.addEventListener("click", function () { pickFile(rightFilePathEl); });

  // ── Compare button ──

  compareBtn.addEventListener("click", function () {
    if (currentMode === "text") {
      var left = leftTextEl.value;
      var right = rightTextEl.value;
      if (!left && !right) {
        setStatus(t("diff.input_required"), true);
        return;
      }
      runDiff(left, right);
    } else if (currentMode === "file") {
      compareFiles();
    } else if (currentMode === "folder") {
      compareFolders();
    }
  });

  // ── Line-level diff using diff-match-patch ──

  function normalizeLineEndings(text) {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function runDiff(leftText, rightText) {
    leftText = normalizeLineEndings(leftText);
    rightText = normalizeLineEndings(rightText);
    var dmp = new diff_match_patch();

    // Line-level diff
    var a = dmp.diff_linesToChars_(leftText, rightText);
    var lineText1 = a.chars1;
    var lineText2 = a.chars2;
    var lineArray = a.lineArray;

    var diffs = dmp.diff_main(lineText1, lineText2, false);
    dmp.diff_charsToLines_(diffs, lineArray);

    // Build aligned line arrays
    var leftLines = leftText.split("\n");
    var rightLines = rightText.split("\n");

    alignedLeft = [];
    alignedRight = [];
    diffBlocks = [];

    var leftIdx = 0;
    var rightIdx = 0;

    for (var d = 0; d < diffs.length; d++) {
      var op = diffs[d][0]; // -1=removed, 0=equal, 1=added
      var text = diffs[d][1];
      var lines = text.replace(/\n$/, "").split("\n");
      if (text === "") continue;

      // Check if this delete is followed by an insert (i.e. "changed")
      if (op === -1 && d + 1 < diffs.length && diffs[d + 1][0] === 1) {
        var addedText = diffs[d + 1][1];
        var addedLines = addedText.replace(/\n$/, "").split("\n");
        var blockStart = alignedLeft.length;
        var maxLen = Math.max(lines.length, addedLines.length);
        for (var i = 0; i < maxLen; i++) {
          if (i < lines.length && i < addedLines.length) {
            alignedLeft.push({ text: lines[i], lineNum: leftIdx + i + 1, type: "changed" });
            alignedRight.push({ text: addedLines[i], lineNum: rightIdx + i + 1, type: "changed" });
          } else if (i < lines.length) {
            alignedLeft.push({ text: lines[i], lineNum: leftIdx + i + 1, type: "removed" });
            alignedRight.push({ text: "", lineNum: null, type: "empty" });
          } else {
            alignedLeft.push({ text: "", lineNum: null, type: "empty" });
            alignedRight.push({ text: addedLines[i], lineNum: rightIdx + i + 1, type: "added" });
          }
        }
        diffBlocks.push({
          startIdx: blockStart,
          endIdx: alignedLeft.length - 1,
          type: "changed"
        });
        leftIdx += lines.length;
        rightIdx += addedLines.length;
        d++; // skip the next (added) diff
      } else if (op === -1) {
        var blockStart2 = alignedLeft.length;
        for (var j = 0; j < lines.length; j++) {
          alignedLeft.push({ text: lines[j], lineNum: leftIdx + j + 1, type: "removed" });
          alignedRight.push({ text: "", lineNum: null, type: "empty" });
        }
        diffBlocks.push({
          startIdx: blockStart2,
          endIdx: alignedLeft.length - 1,
          type: "removed"
        });
        leftIdx += lines.length;
      } else if (op === 1) {
        var blockStart3 = alignedLeft.length;
        for (var k = 0; k < lines.length; k++) {
          alignedLeft.push({ text: "", lineNum: null, type: "empty" });
          alignedRight.push({ text: lines[k], lineNum: rightIdx + k + 1, type: "added" });
        }
        diffBlocks.push({
          startIdx: blockStart3,
          endIdx: alignedLeft.length - 1,
          type: "added"
        });
        rightIdx += lines.length;
      } else {
        // equal
        for (var m = 0; m < lines.length; m++) {
          alignedLeft.push({ text: lines[m], lineNum: leftIdx + m + 1, type: "equal" });
          alignedRight.push({ text: lines[m], lineNum: rightIdx + m + 1, type: "equal" });
        }
        leftIdx += lines.length;
        rightIdx += lines.length;
      }
    }

    activeBlockIndex = -1;
    renderDiff();
    renderStats();
    resultEl.style.display = "";
    copyLeftBtn.style.display = "";
    copyRightBtn.style.display = "";
    // 파일 모드에서만 저장 버튼 표시
    var showSave = currentMode === "file" || currentMode === "folder";
    saveLeftBtn.style.display = showSave ? "" : "none";
    saveRightBtn.style.display = showSave ? "" : "none";
    setStatus(t("diff.done"), false);
  }

  // ── Render side-by-side ──

  function renderDiff() {
    viewLeftEl.innerHTML = "";
    viewRightEl.innerHTML = "";

    for (var i = 0; i < alignedLeft.length; i++) {
      viewLeftEl.appendChild(createLineEl(alignedLeft[i], i, "left"));
      viewRightEl.appendChild(createLineEl(alignedRight[i], i, "right"));
    }

    // 좌우 라인 높이 동기화
    requestAnimationFrame(function () {
      var leftLines = viewLeftEl.children;
      var rightLines = viewRightEl.children;
      var len = Math.min(leftLines.length, rightLines.length);
      for (var i = 0; i < len; i++) {
        leftLines[i].style.minHeight = "";
        rightLines[i].style.minHeight = "";
      }
      viewLeftEl.offsetHeight;
      for (var i = 0; i < len; i++) {
        var lh = leftLines[i].offsetHeight;
        var rh = rightLines[i].offsetHeight;
        if (lh !== rh) {
          var maxH = Math.max(lh, rh) + "px";
          leftLines[i].style.minHeight = maxH;
          rightLines[i].style.minHeight = maxH;
        }
      }
    });

    setupSyncScroll();
  }

  function createLineEl(lineData, idx, side) {
    var div = document.createElement("div");
    div.className = "diff-line";
    div.dataset.idx = idx;

    var typeClass = "";
    if (lineData.type === "added") typeClass = "diff-line-added";
    else if (lineData.type === "removed") typeClass = "diff-line-removed";
    else if (lineData.type === "changed") typeClass = "diff-line-changed";
    else if (lineData.type === "empty") typeClass = "diff-line-empty";

    if (typeClass) div.classList.add(typeClass);

    if (activeBlockIndex >= 0 && activeBlockIndex < diffBlocks.length) {
      var block = diffBlocks[activeBlockIndex];
      if (idx >= block.startIdx && idx <= block.endIdx) {
        div.classList.add("diff-active");
      }
    }

    var numSpan = document.createElement("span");
    numSpan.className = "diff-line-num";
    numSpan.textContent = lineData.lineNum !== null ? lineData.lineNum : "";

    var textSpan = document.createElement("span");
    textSpan.className = "diff-line-text";
    textSpan.innerHTML = lineData.text ? escapeHtml(lineData.text) : "&nbsp;";

    div.appendChild(numSpan);
    div.appendChild(textSpan);

    if (lineData.type !== "equal") {
      div.style.cursor = "pointer";
      div.addEventListener("click", function () {
        var blockIdx = findBlockForLine(idx);
        if (blockIdx >= 0) {
          activeBlockIndex = blockIdx;
          updateActiveHighlight();
        }
      });
    }

    return div;
  }

  function findBlockForLine(lineIdx) {
    for (var i = 0; i < diffBlocks.length; i++) {
      if (lineIdx >= diffBlocks[i].startIdx && lineIdx <= diffBlocks[i].endIdx) {
        return i;
      }
    }
    return -1;
  }

  function updateActiveHighlight() {
    viewLeftEl.querySelectorAll(".diff-active").forEach(function (el) {
      el.classList.remove("diff-active");
    });
    viewRightEl.querySelectorAll(".diff-active").forEach(function (el) {
      el.classList.remove("diff-active");
    });

    if (activeBlockIndex < 0 || activeBlockIndex >= diffBlocks.length) return;

    var block = diffBlocks[activeBlockIndex];
    for (var i = block.startIdx; i <= block.endIdx; i++) {
      var leftEl = viewLeftEl.querySelector('[data-idx="' + i + '"]');
      var rightEl = viewRightEl.querySelector('[data-idx="' + i + '"]');
      if (leftEl) leftEl.classList.add("diff-active");
      if (rightEl) rightEl.classList.add("diff-active");
    }

    scrollToBlock(block.startIdx);
  }

  // ── Synchronized scroll ──

  var scrollSyncing = false;
  var scrollSetup = false;

  function setupSyncScroll() {
    if (scrollSetup) return;
    scrollSetup = true;

    viewLeftEl.addEventListener("scroll", function () {
      if (scrollSyncing) return;
      scrollSyncing = true;
      viewRightEl.scrollTop = viewLeftEl.scrollTop;
      viewRightEl.scrollLeft = viewLeftEl.scrollLeft;
      scrollSyncing = false;
    });

    viewRightEl.addEventListener("scroll", function () {
      if (scrollSyncing) return;
      scrollSyncing = true;
      viewLeftEl.scrollTop = viewRightEl.scrollTop;
      viewLeftEl.scrollLeft = viewRightEl.scrollLeft;
      scrollSyncing = false;
    });
  }

  function scrollToBlock(blockStartIdx) {
    var firstEl = viewLeftEl.querySelector('[data-idx="' + blockStartIdx + '"]');
    if (!firstEl) return;
    var containerTop = viewLeftEl.getBoundingClientRect().top;
    var elTop = firstEl.getBoundingClientRect().top;
    var offset = elTop - containerTop;
    var scrollTo = viewLeftEl.scrollTop + offset - viewLeftEl.clientHeight / 3;
    scrollSyncing = true;
    viewLeftEl.scrollTop = scrollTo;
    viewRightEl.scrollTop = scrollTo;
    scrollSyncing = false;
  }

  // ── Stats ──

  function renderStats() {
    var added = 0;
    var removed = 0;
    var changed = 0;

    for (var i = 0; i < diffBlocks.length; i++) {
      var b = diffBlocks[i];
      if (b.type === "added") added++;
      else if (b.type === "removed") removed++;
      else if (b.type === "changed") changed++;
    }

    var total = diffBlocks.length;
    statsEl.innerHTML =
      "<strong>" + t("diff.block") + "</strong> " + total + " &nbsp;|&nbsp; " +
      '<span style="color:#16a34a">' + t("diff.added") + " " + added + "</span> &nbsp;|&nbsp; " +
      '<span style="color:#dc2626">' + t("diff.deleted") + " " + removed + "</span> &nbsp;|&nbsp; " +
      '<span style="color:#d97706">' + t("diff.changed") + " " + changed + "</span>";

    if (activeBlockIndex >= 0) {
      statsEl.innerHTML += " &nbsp;|&nbsp; " + (activeBlockIndex + 1) + "/" + total;
    }
  }

  // ── Diff block navigation ──

  function goNextBlock() {
    if (diffBlocks.length === 0) return;
    activeBlockIndex = (activeBlockIndex + 1) % diffBlocks.length;
    updateActiveHighlight();
    renderStats();
  }

  function goPrevBlock() {
    if (diffBlocks.length === 0) return;
    if (activeBlockIndex <= 0) activeBlockIndex = diffBlocks.length - 1;
    else activeBlockIndex--;
    updateActiveHighlight();
    renderStats();
  }

  // ── Keyboard shortcuts (블록 탐색만) ──

  document.addEventListener("keydown", function (e) {
    if (!isTabActive()) return;

    // Ctrl+↑/↓ 또는 Alt+↑/↓ 로 블록 이동
    if (!(e.ctrlKey || e.metaKey || e.altKey)) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      goNextBlock();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      goPrevBlock();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      mergeBlock("left"); // 오른쪽 → 왼쪽 반영
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      mergeBlock("right"); // 왼쪽 → 오른쪽 반영
    }
  });

  // ── Merge (블록 반영) ──

  function mergeBlock(direction) {
    if (activeBlockIndex < 0 || activeBlockIndex >= diffBlocks.length) {
      setStatus(t("diff.select_block"), true);
      return;
    }

    var block = diffBlocks[activeBlockIndex];

    if (direction === "left") {
      // 오른쪽 내용을 왼쪽으로 반영
      for (var i = block.startIdx; i <= block.endIdx; i++) {
        alignedLeft[i] = {
          text: alignedRight[i].text,
          lineNum: alignedLeft[i].lineNum,
          type: "equal"
        };
        alignedRight[i] = Object.assign({}, alignedRight[i], { type: "equal" });
      }
    } else {
      // 왼쪽 내용을 오른쪽으로 반영
      for (var i = block.startIdx; i <= block.endIdx; i++) {
        alignedRight[i] = {
          text: alignedLeft[i].text,
          lineNum: alignedRight[i].lineNum,
          type: "equal"
        };
        alignedLeft[i] = Object.assign({}, alignedLeft[i], { type: "equal" });
      }
    }

    // 반영된 블록 제거
    diffBlocks.splice(activeBlockIndex, 1);
    if (activeBlockIndex >= diffBlocks.length) activeBlockIndex = diffBlocks.length - 1;

    renderDiff();
    renderStats();
    updateActiveHighlight();
    setStatus(direction === "left" ? t("diff.apply_rtl") : t("diff.apply_ltr"), false);
  }

  // ── Copy ──

  function getTextFromAligned(aligned) {
    var lines = [];
    for (var i = 0; i < aligned.length; i++) {
      if (aligned[i].lineNum !== null) lines.push(aligned[i].text);
    }
    return lines.join("\n");
  }

  copyLeftBtn.addEventListener("click", function () {
    navigator.clipboard.writeText(getTextFromAligned(alignedLeft)).then(function () {
      setStatus(t("diff.left_copied"), false);
      showToast(t("diff.left_copied"), "success");
    });
  });

  copyRightBtn.addEventListener("click", function () {
    navigator.clipboard.writeText(getTextFromAligned(alignedRight)).then(function () {
      setStatus(t("diff.right_copied"), false);
      showToast(t("diff.right_copied"), "success");
    });
  });

  // ── Save ──

  function getFilePath(side) {
    if (currentMode === "file") {
      return side === "left" ? leftFilePathEl.value.trim() : rightFilePathEl.value.trim();
    }
    // 폴더 모드: 현재 선택된 파일의 전체 경로
    var basePath = side === "left" ? leftFolderEl.value.trim() : rightFolderEl.value.trim();
    var activeItem = fileTreeEl.querySelector(".diff-file-tree-item.active");
    if (!activeItem || !basePath) return "";
    var relPath = activeItem.querySelector("span:last-child").textContent;
    return basePath + "/" + relPath;
  }

  async function saveFile(side) {
    var filePath = getFilePath(side);
    if (!filePath) {
      setStatus(t("diff.no_file_path"), true);
      return;
    }
    var aligned = side === "left" ? alignedLeft : alignedRight;
    var content = getTextFromAligned(aligned);
    try {
      var res = await fetch("/api/diff/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, content: content }),
      });
      var data = await res.json();
      if (data.ok) {
        setStatus(t("diff.file_saved", { path: filePath }), false);
        showToast(t("diff.file_saved", { path: filePath }), "success");
      } else {
        setStatus(data.error, true);
        showToast(data.error, "error");
      }
    } catch (e) {
      setStatus(t("diff.file_save_fail", { msg: e.message }), true);
      showToast(t("diff.file_save_fail", { msg: e.message }), "error");
    }
  }

  saveLeftBtn.addEventListener("click", function () { saveFile("left"); });
  saveRightBtn.addEventListener("click", function () { saveFile("right"); });

  // ── File mode: path or upload ──

  async function fetchFileByPath(path) {
    var res = await fetch("/api/diff/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: path }),
    });
    return await res.json();
  }

  async function compareFiles() {
    var leftPath = leftFilePathEl.value.trim();
    var rightPath = rightFilePathEl.value.trim();

    if (!leftPath || !rightPath) {
      setStatus(t("diff.both_path_required"), true);
      return;
    }

    try {
      setStatus(t("diff.reading"), false);
      var lr = await fetchFileByPath(leftPath);
      if (!lr.ok) { setStatus(lr.error, true); return; }
      leftFileNameEl.textContent = lr.name;

      var rr = await fetchFileByPath(rightPath);
      if (!rr.ok) { setStatus(rr.error, true); return; }
      rightFileNameEl.textContent = rr.name;

      runDiff(lr.content, rr.content);
    } catch (e) {
      setStatus(t("diff.read_fail", { msg: e.message }), true);
    }
  }

  // ── Clear ──

  clearBtn.addEventListener("click", function () {
    leftTextEl.value = "";
    rightTextEl.value = "";
    leftFilePathEl.value = "";
    rightFilePathEl.value = "";
    leftFileNameEl.textContent = "";
    rightFileNameEl.textContent = "";
    leftFolderEl.value = "";
    rightFolderEl.value = "";
    leftFolderNameEl.textContent = "";
    rightFolderNameEl.textContent = "";
    fileTreeEl.style.display = "none";
    fileTreeEl.innerHTML = "";
    resultEl.style.display = "none";
    copyLeftBtn.style.display = "none";
    copyRightBtn.style.display = "none";
    saveLeftBtn.style.display = "none";
    saveRightBtn.style.display = "none";
    viewLeftEl.innerHTML = "";
    viewRightEl.innerHTML = "";
    statsEl.innerHTML = "";
    diffBlocks = [];
    activeBlockIndex = -1;
    alignedLeft = [];
    alignedRight = [];
    setStatus("", false);
  });

  // ── Folder mode ──

  // 서버 네이티브 폴더 선택
  async function pickFolder(inputEl) {
    try {
      var res = await fetch("/api/diff/pick-folder", { method: "POST" });
      var data = await res.json();
      if (data.ok) {
        inputEl.value = data.path;
      }
    } catch (e) {
      setStatus(t("diff.folder_select_fail", { msg: e.message }), true);
    }
  }

  leftFolderBtn.addEventListener("click", function () { pickFolder(leftFolderEl); });
  rightFolderBtn.addEventListener("click", function () { pickFolder(rightFolderEl); });

  async function compareFolders() {
    // 경로 → 서버 비교
    var leftPath = leftFolderEl.value.trim();
    var rightPath = rightFolderEl.value.trim();

    if (!leftPath || !rightPath) {
      setStatus(t("diff.both_folder_required"), true);
      return;
    }

    setStatus(t("diff.comparing"), false);

    try {
      var res = await fetch("/api/diff/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ left: leftPath, right: rightPath }),
      });
      var data = await res.json();

      if (!data.ok) {
        setStatus(data.error || t("diff.folder_fail"), true);
        return;
      }

      renderFileTree(data.files, leftPath, rightPath);
      setStatus(t("diff.folder_done", { count: data.files.length }), false);
    } catch (e) {
      setStatus(t("diff.folder_request_fail", { msg: e.message }), true);
    }
  }

  function renderFileTree(files, leftPath, rightPath) {
    fileTreeEl.innerHTML = "";
    fileTreeEl.style.display = "";

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var item = document.createElement("div");
      item.className = "diff-file-tree-item";

      var statusSpan = document.createElement("span");
      statusSpan.className = "diff-ft-status";

      if (file.status === "modified") {
        statusSpan.classList.add("diff-ft-modified");
        statusSpan.textContent = t("diff.status_changed");
      } else if (file.status === "added") {
        statusSpan.classList.add("diff-ft-added");
        statusSpan.textContent = t("diff.status_added");
      } else if (file.status === "removed") {
        statusSpan.classList.add("diff-ft-removed");
        statusSpan.textContent = t("diff.status_deleted");
      } else {
        statusSpan.classList.add("diff-ft-same");
        statusSpan.textContent = t("diff.status_same");
      }

      var nameSpan = document.createElement("span");
      nameSpan.textContent = file.path;

      item.appendChild(statusSpan);
      item.appendChild(nameSpan);

      (function (f) {
        item.addEventListener("click", function () {
          // Highlight active
          fileTreeEl.querySelectorAll(".diff-file-tree-item").forEach(function (el) {
            el.classList.remove("active");
          });
          item.classList.add("active");

          // Fetch file contents and diff
          loadFolderFileDiff(f);
        });
      })(file);

      fileTreeEl.appendChild(item);
    }
  }

  function loadFolderFileDiff(file) {
    runDiff(file.left || "", file.right || "");
  }
})();
