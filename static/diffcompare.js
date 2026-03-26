(function () {
  "use strict";

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  // DOM refs (jQuery)
  const $modeRadios = $('input[name="diffMode"]');
  const $textInputs = $("#diffTextInputs");
  const $fileInputs = $("#diffFileInputs");
  const $folderInputs = $("#diffFolderInputs");
  const $compareBtn = $("#diffCompareBtn");
  const $clearBtn = $("#diffClearBtn");
  const $copyLeftBtn = $("#diffCopyLeftBtn");
  const $copyRightBtn = $("#diffCopyRightBtn");
  const $saveLeftBtn = $("#diffSaveLeftBtn");
  const $saveRightBtn = $("#diffSaveRightBtn");
  const $statusEl = $("#diffStatus");
  const $leftTextEl = $("#diffLeftText");
  const $rightTextEl = $("#diffRightText");
  const $leftFileNameEl = $("#diffLeftFileName");
  const $rightFileNameEl = $("#diffRightFileName");
  const $leftFilePathEl = $("#diffLeftFilePath");
  const $rightFilePathEl = $("#diffRightFilePath");
  const $leftFilePickBtn = $("#diffLeftFilePickBtn");
  const $rightFilePickBtn = $("#diffRightFilePickBtn");
  const $leftFolderEl = $("#diffLeftFolder");
  const $rightFolderEl = $("#diffRightFolder");
  const $leftFolderBtn = $("#diffLeftFolderBtn");
  const $rightFolderBtn = $("#diffRightFolderBtn");
  const $leftFolderNameEl = $("#diffLeftFolderName");
  const $rightFolderNameEl = $("#diffRightFolderName");
  const $fileTreeEl = $("#diffFileTree");
  const $resultEl = $("#diffResult");
  const $statsEl = $("#diffStats");
  const $viewLeftEl = $("#diffViewLeft");
  const $viewRightEl = $("#diffViewRight");

  // State
  let currentMode = "text";
  let diffBlocks = [];
  let activeBlockIndex = -1;
  let alignedLeft = [];
  let alignedRight = [];

  // ── Utility ──

  function setStatus(msg, isError) {
    $statusEl.text(msg);
    $statusEl.css("color", isError ? "#bf233a" : "#65748b");
  }

  function isTabActive() {
    var $tab = $('.tab-content[data-tab="diffcompare"]');
    return $tab.length && $tab.hasClass("active");
  }

  // ── Mode switching ──

  function switchMode(mode) {
    currentMode = mode;
    $textInputs.css("display", mode === "text" ? "" : "none");
    $fileInputs.css("display", mode === "file" ? "" : "none");
    $folderInputs.css("display", mode === "folder" ? "" : "none");
    $fileTreeEl.hide();
  }

  $modeRadios.on("change", function () {
    switchMode($(this).val());
  });

  // ── File mode: 서버 네이티브 파일 선택 ──

  async function pickFile($inputEl) {
    try {
      var res = await fetch("/api/diff/pick-file", { method: "POST" });
      var data = await res.json();
      if (data.ok) {
        $inputEl.val(data.path);
      }
    } catch (e) {
      setStatus(t("diff.file_select_fail", { msg: e.message }), true);
    }
  }

  $leftFilePickBtn.on("click", function () { pickFile($leftFilePathEl); });
  $rightFilePickBtn.on("click", function () { pickFile($rightFilePathEl); });

  // ── Compare button ──

  $compareBtn.on("click", function () {
    if (currentMode === "text") {
      var left = $leftTextEl.val();
      var right = $rightTextEl.val();
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
    $resultEl.css("display", "");
    $copyLeftBtn.css("display", "");
    $copyRightBtn.css("display", "");
    // 파일 모드에서만 저장 버튼 표시
    var showSave = currentMode === "file" || currentMode === "folder";
    $saveLeftBtn.css("display", showSave ? "" : "none");
    $saveRightBtn.css("display", showSave ? "" : "none");
    setStatus(t("diff.done"), false);
  }

  // ── Render side-by-side ──

  function renderDiff() {
    $viewLeftEl.html("");
    $viewRightEl.html("");

    for (var i = 0; i < alignedLeft.length; i++) {
      $viewLeftEl.append(createLineEl(alignedLeft[i], i, "left"));
      $viewRightEl.append(createLineEl(alignedRight[i], i, "right"));
    }

    // 좌우 라인 높이 동기화
    requestAnimationFrame(function () {
      var leftLines = $viewLeftEl.children();
      var rightLines = $viewRightEl.children();
      var len = Math.min(leftLines.length, rightLines.length);
      for (var i = 0; i < len; i++) {
        $(leftLines[i]).css("minHeight", "");
        $(rightLines[i]).css("minHeight", "");
      }
      $viewLeftEl[0].offsetHeight;
      for (var i = 0; i < len; i++) {
        var lh = leftLines[i].offsetHeight;
        var rh = rightLines[i].offsetHeight;
        if (lh !== rh) {
          var maxH = Math.max(lh, rh) + "px";
          $(leftLines[i]).css("minHeight", maxH);
          $(rightLines[i]).css("minHeight", maxH);
        }
      }
    });

    setupSyncScroll();
  }

  function createLineEl(lineData, idx, side) {
    var $div = $("<div>");
    $div.addClass("diff-line");
    $div.attr("data-idx", idx);

    var typeClass = "";
    if (lineData.type === "added") typeClass = "diff-line-added";
    else if (lineData.type === "removed") typeClass = "diff-line-removed";
    else if (lineData.type === "changed") typeClass = "diff-line-changed";
    else if (lineData.type === "empty") typeClass = "diff-line-empty";

    if (typeClass) $div.addClass(typeClass);

    if (activeBlockIndex >= 0 && activeBlockIndex < diffBlocks.length) {
      var block = diffBlocks[activeBlockIndex];
      if (idx >= block.startIdx && idx <= block.endIdx) {
        $div.addClass("diff-active");
      }
    }

    var $numSpan = $("<span>");
    $numSpan.addClass("diff-line-num");
    $numSpan.text(lineData.lineNum !== null ? lineData.lineNum : "");

    var $textSpan = $("<span>");
    $textSpan.addClass("diff-line-text");
    $textSpan.html(lineData.text ? escapeHtml(lineData.text) : "&nbsp;");

    $div.append($numSpan);
    $div.append($textSpan);

    if (lineData.type !== "equal") {
      $div.css("cursor", "pointer");
      $div.on("click", function () {
        var blockIdx = findBlockForLine(idx);
        if (blockIdx >= 0) {
          activeBlockIndex = blockIdx;
          updateActiveHighlight();
        }
      });
    }

    return $div;
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
    $viewLeftEl.find(".diff-active").removeClass("diff-active");
    $viewRightEl.find(".diff-active").removeClass("diff-active");

    if (activeBlockIndex < 0 || activeBlockIndex >= diffBlocks.length) return;

    var block = diffBlocks[activeBlockIndex];
    for (var i = block.startIdx; i <= block.endIdx; i++) {
      $viewLeftEl.find('[data-idx="' + i + '"]').addClass("diff-active");
      $viewRightEl.find('[data-idx="' + i + '"]').addClass("diff-active");
    }

    scrollToBlock(block.startIdx);
  }

  // ── Synchronized scroll ──

  var scrollSyncing = false;
  var scrollSetup = false;

  function setupSyncScroll() {
    if (scrollSetup) return;
    scrollSetup = true;

    $viewLeftEl.on("scroll", function () {
      if (scrollSyncing) return;
      scrollSyncing = true;
      $viewRightEl[0].scrollTop = $viewLeftEl[0].scrollTop;
      $viewRightEl[0].scrollLeft = $viewLeftEl[0].scrollLeft;
      scrollSyncing = false;
    });

    $viewRightEl.on("scroll", function () {
      if (scrollSyncing) return;
      scrollSyncing = true;
      $viewLeftEl[0].scrollTop = $viewRightEl[0].scrollTop;
      $viewLeftEl[0].scrollLeft = $viewRightEl[0].scrollLeft;
      scrollSyncing = false;
    });
  }

  function scrollToBlock(blockStartIdx) {
    var $firstEl = $viewLeftEl.find('[data-idx="' + blockStartIdx + '"]');
    if (!$firstEl.length) return;
    var containerTop = $viewLeftEl[0].getBoundingClientRect().top;
    var elTop = $firstEl[0].getBoundingClientRect().top;
    var offset = elTop - containerTop;
    var scrollTo = $viewLeftEl[0].scrollTop + offset - $viewLeftEl[0].clientHeight / 3;
    scrollSyncing = true;
    $viewLeftEl[0].scrollTop = scrollTo;
    $viewRightEl[0].scrollTop = scrollTo;
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
    $statsEl.html(
      "<strong>" + t("diff.block") + "</strong> " + total + " &nbsp;|&nbsp; " +
      '<span style="color:#16a34a">' + t("diff.added") + " " + added + "</span> &nbsp;|&nbsp; " +
      '<span style="color:#dc2626">' + t("diff.deleted") + " " + removed + "</span> &nbsp;|&nbsp; " +
      '<span style="color:#d97706">' + t("diff.changed") + " " + changed + "</span>");

    if (activeBlockIndex >= 0) {
      $statsEl.html($statsEl.html() + " &nbsp;|&nbsp; " + (activeBlockIndex + 1) + "/" + total);
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

  $(document).on("keydown", function (e) {
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

  $copyLeftBtn.on("click", function () {
    navigator.clipboard.writeText(getTextFromAligned(alignedLeft)).then(function () {
      setStatus(t("diff.left_copied"), false);
      showToast(t("diff.left_copied"), "success");
    });
  });

  $copyRightBtn.on("click", function () {
    navigator.clipboard.writeText(getTextFromAligned(alignedRight)).then(function () {
      setStatus(t("diff.right_copied"), false);
      showToast(t("diff.right_copied"), "success");
    });
  });

  // ── Save ──

  function getFilePath(side) {
    if (currentMode === "file") {
      return side === "left" ? $leftFilePathEl.val().trim() : $rightFilePathEl.val().trim();
    }
    // 폴더 모드: 현재 선택된 파일의 전체 경로
    var basePath = side === "left" ? $leftFolderEl.val().trim() : $rightFolderEl.val().trim();
    var $activeItem = $fileTreeEl.find(".diff-file-tree-item.active");
    if (!$activeItem.length || !basePath) return "";
    var relPath = $activeItem.find("span:last-child").text();
    return basePath + "/" + relPath;
  }

  function saveFile(side) {
    var filePath = getFilePath(side);
    if (!filePath) {
      setStatus(t("diff.no_file_path"), true);
      return;
    }
    var aligned = side === "left" ? alignedLeft : alignedRight;
    var content = getTextFromAligned(aligned);
    $.ajax({
      url: "/api/diff/save",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ path: filePath, content: content }),
      dataType: "json"
    }).done(function (data) {
      if (data.ok) {
        setStatus(t("diff.file_saved", { path: filePath }), false);
        showToast(t("diff.file_saved", { path: filePath }), "success");
      } else {
        setStatus(data.error, true);
        showToast(data.error, "error");
      }
    }).fail(function (jqXHR, textStatus, errorThrown) {
      var msg = errorThrown || textStatus;
      setStatus(t("diff.file_save_fail", { msg: msg }), true);
      showToast(t("diff.file_save_fail", { msg: msg }), "error");
    });
  }

  $saveLeftBtn.on("click", function () { saveFile("left"); });
  $saveRightBtn.on("click", function () { saveFile("right"); });

  // ── File mode: path or upload ──

  function fetchFileByPath(path) {
    return $.ajax({
      url: "/api/diff/file",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ path: path }),
      dataType: "json"
    });
  }

  function compareFiles() {
    var leftPath = $leftFilePathEl.val().trim();
    var rightPath = $rightFilePathEl.val().trim();

    if (!leftPath || !rightPath) {
      setStatus(t("diff.both_path_required"), true);
      return;
    }

    setStatus(t("diff.reading"), false);
    fetchFileByPath(leftPath).done(function (lr) {
      if (!lr.ok) { setStatus(lr.error, true); return; }
      $leftFileNameEl.text(lr.name);

      fetchFileByPath(rightPath).done(function (rr) {
        if (!rr.ok) { setStatus(rr.error, true); return; }
        $rightFileNameEl.text(rr.name);

        runDiff(lr.content, rr.content);
      }).fail(function (jqXHR, textStatus, errorThrown) {
        setStatus(t("diff.read_fail", { msg: errorThrown || textStatus }), true);
      });
    }).fail(function (jqXHR, textStatus, errorThrown) {
      setStatus(t("diff.read_fail", { msg: errorThrown || textStatus }), true);
    });
  }

  // ── Clear ──

  $clearBtn.on("click", function () {
    $leftTextEl.val("");
    $rightTextEl.val("");
    $leftFilePathEl.val("");
    $rightFilePathEl.val("");
    $leftFileNameEl.text("");
    $rightFileNameEl.text("");
    $leftFolderEl.val("");
    $rightFolderEl.val("");
    $leftFolderNameEl.text("");
    $rightFolderNameEl.text("");
    $fileTreeEl.hide();
    $fileTreeEl.html("");
    $resultEl.hide();
    $copyLeftBtn.hide();
    $copyRightBtn.hide();
    $saveLeftBtn.hide();
    $saveRightBtn.hide();
    $viewLeftEl.html("");
    $viewRightEl.html("");
    $statsEl.html("");
    diffBlocks = [];
    activeBlockIndex = -1;
    alignedLeft = [];
    alignedRight = [];
    setStatus("", false);
  });

  // ── Folder mode ──

  // 서버 네이티브 폴더 선택
  async function pickFolder($inputEl) {
    try {
      var res = await fetch("/api/diff/pick-folder", { method: "POST" });
      var data = await res.json();
      if (data.ok) {
        $inputEl.val(data.path);
      }
    } catch (e) {
      setStatus(t("diff.folder_select_fail", { msg: e.message }), true);
    }
  }

  $leftFolderBtn.on("click", function () { pickFolder($leftFolderEl); });
  $rightFolderBtn.on("click", function () { pickFolder($rightFolderEl); });

  function compareFolders() {
    // 경로 → 서버 비교
    var leftPath = $leftFolderEl.val().trim();
    var rightPath = $rightFolderEl.val().trim();

    if (!leftPath || !rightPath) {
      setStatus(t("diff.both_folder_required"), true);
      return;
    }

    setStatus(t("diff.comparing"), false);

    $.ajax({
      url: "/api/diff/folder",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ left: leftPath, right: rightPath }),
      dataType: "json"
    }).done(function (data) {
      if (!data.ok) {
        setStatus(data.error || t("diff.folder_fail"), true);
        return;
      }

      renderFileTree(data.files, leftPath, rightPath);
      setStatus(t("diff.folder_done", { count: data.files.length }), false);
    }).fail(function (jqXHR, textStatus, errorThrown) {
      setStatus(t("diff.folder_request_fail", { msg: errorThrown || textStatus }), true);
    });
  }

  function renderFileTree(files, leftPath, rightPath) {
    $fileTreeEl.html("");
    $fileTreeEl.css("display", "");

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var $item = $("<div>");
      $item.addClass("diff-file-tree-item");

      var $statusSpan = $("<span>");
      $statusSpan.addClass("diff-ft-status");

      if (file.status === "modified") {
        $statusSpan.addClass("diff-ft-modified");
        $statusSpan.text(t("diff.status_changed"));
      } else if (file.status === "added") {
        $statusSpan.addClass("diff-ft-added");
        $statusSpan.text(t("diff.status_added"));
      } else if (file.status === "removed") {
        $statusSpan.addClass("diff-ft-removed");
        $statusSpan.text(t("diff.status_deleted"));
      } else {
        $statusSpan.addClass("diff-ft-same");
        $statusSpan.text(t("diff.status_same"));
      }

      var $nameSpan = $("<span>");
      $nameSpan.text(file.path);

      $item.append($statusSpan);
      $item.append($nameSpan);

      (function (f, $el) {
        $el.on("click", function () {
          // Highlight active
          $fileTreeEl.find(".diff-file-tree-item").removeClass("active");
          $el.addClass("active");

          // Fetch file contents and diff
          loadFolderFileDiff(f);
        });
      })(file, $item);

      $fileTreeEl.append($item);
    }
  }

  function loadFolderFileDiff(file) {
    runDiff(file.left || "", file.right || "");
  }
})();
