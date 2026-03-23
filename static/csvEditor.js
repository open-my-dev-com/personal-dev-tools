const csvFileInput = document.getElementById("csvFileInput");
const csvUploadZone = document.getElementById("csvUploadZone");
const csvGridWrap = document.getElementById("csvGridWrap");
const csvDelimiter = document.getElementById("csvDelimiter");
const csvEncoding = document.getElementById("csvEncoding");
const csvStatus = document.getElementById("csvStatus");
const csvAddRowBtn = document.getElementById("csvAddRowBtn");
const csvAddColBtn = document.getElementById("csvAddColBtn");
const csvDelRowBtn = document.getElementById("csvDelRowBtn");
const csvDelColBtn = document.getElementById("csvDelColBtn");
const csvDownloadBtn = document.getElementById("csvDownloadBtn");

let csvData = [];
let csvFilename = "data.csv";
let csvDetectedEncoding = "utf-8";
let csvFocusRow = -1;
let csvFocusCol = -1;
let csvSelectedCells = []; // [{row, col}]
let csvSelAnchor = null; // {row, col} — Shift 범위 선택 기준점
let csvFilters = {}; // { colIndex: Set(허용값) }
let csvVisibleRows = null; // 필터 적용된 행 인덱스 배열 (null = 전체)

function applyFilters() {
  const activeFilters = Object.entries(csvFilters).filter(([, set]) => set && set.size > 0);
  if (activeFilters.length === 0) {
    csvVisibleRows = null;
    renderGrid();
    const total = csvData.length > 1 ? csvData.length - 1 : 0;
    setCsvStatus(`전체 ${total}개 행 표시`);
    return;
  }
  csvVisibleRows = [];
  for (let i = 1; i < csvData.length; i++) {
    let visible = true;
    for (const [colStr, allowed] of activeFilters) {
      const ci = parseInt(colStr);
      const val = csvData[i][ci] ?? "";
      if (!allowed.has(val)) { visible = false; break; }
    }
    if (visible) csvVisibleRows.push(i);
  }
  renderGrid();
  const total = csvData.length > 1 ? csvData.length - 1 : 0;
  setCsvStatus(`${total}개 중 ${csvVisibleRows.length}개 행 표시 (필터 적용)`);
}

function clearAllFilters() {
  csvFilters = {};
  csvVisibleRows = null;
}

function setCsvStatus(text, isError = false) {
  csvStatus.textContent = text;
  csvStatus.style.color = isError ? "#bf233a" : "#65748b";
}

// --- 인코딩 감지 ---
function detectEncoding(buffer) {
  const encodings = ["utf-8", "euc-kr", "shift_jis", "iso-8859-1"];
  for (const enc of encodings) {
    try {
      const decoder = new TextDecoder(enc, { fatal: true });
      decoder.decode(buffer);
      return enc;
    } catch {}
  }
  return "utf-8";
}

function decodeBuffer(buffer) {
  const enc = detectEncoding(buffer);
  csvDetectedEncoding = enc;
  const decoder = new TextDecoder(enc);
  return decoder.decode(buffer);
}

// --- CSV 파싱 (RFC 4180) ---
function parseCsv(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        row.push(field);
        field = "";
        i++;
      } else if (ch === "\r") {
        if (i + 1 < text.length && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i++;
      } else if (ch === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // 빈 마지막 행 제거
  if (rows.length > 0 && rows[rows.length - 1].every((c) => c === "")) {
    rows.pop();
  }

  // 열 수 통일
  const maxCols = Math.max(...rows.map((r) => r.length), 0);
  rows.forEach((r) => { while (r.length < maxCols) r.push(""); });

  return rows;
}

// --- CSV 직렬화 ---
function serializeCsv(data, delimiter = ",") {
  return data.map((row) =>
    row.map((cell) => {
      const s = String(cell);
      if (s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(delimiter)
  ).join("\r\n");
}

// --- 열 너비 저장 ---
let csvColWidths = [];

// --- 그리드 렌더링 ---
function renderGrid() {
  csvGridWrap.innerHTML = "";
  if (csvData.length === 0) return;

  const colCount = csvData[0]?.length || 0;

  // 열 너비 초기화 (새 파일이거나 열 수가 달라졌을 때)
  if (csvColWidths.length !== colCount) {
    csvColWidths = new Array(colCount).fill(120);
  }

  const table = document.createElement("table");
  table.className = "csv-grid";

  // colgroup으로 열 너비 제어
  const colgroup = document.createElement("colgroup");
  const rowNumCol = document.createElement("col");
  rowNumCol.style.width = "44px";
  colgroup.appendChild(rowNumCol);
  csvColWidths.forEach((w) => {
    const col = document.createElement("col");
    col.style.width = w + "px";
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);

  // 필터 적용: 표시할 행 결정
  const rowsToRender = csvVisibleRows
    ? [0, ...csvVisibleRows.filter(i => i !== 0)]
    : csvData.map((_, i) => i);

  rowsToRender.forEach((origIdx) => {
    const row = csvData[origIdx];
    if (!row) return;
    const tr = document.createElement("tr");
    // 행 번호
    const numTd = document.createElement("td");
    numTd.className = "row-num";
    numTd.textContent = origIdx + 1;
    numTd.addEventListener("click", (e) => {
      selectRow(origIdx, e.shiftKey);
      e.preventDefault();
    });
    tr.appendChild(numTd);

    row.forEach((cell, ci) => {
      const td = document.createElement("td");
      td.className = "csv-cell";
      td.dataset.row = origIdx;
      td.dataset.col = ci;
      td.style.position = "relative";
      const input = document.createElement("input");
      input.type = "text";
      input.value = cell;
      if (origIdx === 0) {
        input.classList.add("csv-header-cell");
        input.style.paddingRight = "24px";
      }
      input.addEventListener("input", () => { csvData[origIdx][ci] = input.value; });
      input.addEventListener("mousedown", (e) => {
        csvFocusRow = origIdx;
        csvFocusCol = ci;
        if (e.shiftKey && csvSelAnchor) {
          e.preventDefault();
          selectRange(csvSelAnchor.row, csvSelAnchor.col, origIdx, ci);
        } else if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          toggleCellSelection(origIdx, ci);
        } else {
          clearCsvSelection();
          csvSelAnchor = { row: origIdx, col: ci };
        }
      });

      // 헤더 셀 더블클릭 → 열 전체 선택
      if (origIdx === 0) {
        td.addEventListener("dblclick", (e) => {
          if (e.target === input) { selectColumn(ci); e.preventDefault(); }
        });
      }

      td.appendChild(input);

      // 첫 행: 필터 버튼 + 리사이즈 핸들
      if (origIdx === 0) {
        const filterBtn = document.createElement("div");
        filterBtn.className = "csv-filter-btn";
        filterBtn.textContent = csvFilters[ci] ? "▼" : "▽";
        if (csvFilters[ci]) filterBtn.classList.add("csv-filter-active");
        filterBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openFilterMenu(ci, filterBtn);
        });
        td.appendChild(filterBtn);

        const handle = document.createElement("div");
        handle.className = "csv-col-resize";
        handle.addEventListener("mousedown", (e) => startColResize(e, ci, colgroup));
        td.appendChild(handle);
      }

      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  csvGridWrap.appendChild(table);
}

// --- 필터 드롭다운 메뉴 ---
let _activeFilterMenu = null;

function closeFilterMenu() {
  if (_activeFilterMenu) {
    _activeFilterMenu.remove();
    _activeFilterMenu = null;
  }
  document.removeEventListener("mousedown", _onFilterOutsideClick);
}

function _onFilterOutsideClick(e) {
  if (_activeFilterMenu && !_activeFilterMenu.contains(e.target)) {
    closeFilterMenu();
  }
}

function openFilterMenu(colIndex, anchorEl) {
  closeFilterMenu();

  const menu = document.createElement("div");
  menu.className = "csv-filter-menu";
  _activeFilterMenu = menu;

  // 고유값 추출 (헤더 제외)
  const allValues = [];
  for (let i = 1; i < csvData.length; i++) {
    allValues.push(csvData[i][colIndex] ?? "");
  }
  const uniqueValues = [...new Set(allValues)].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b, "ko");
  });

  // 현재 필터 상태
  const currentFilter = csvFilters[colIndex];
  const checkedSet = new Set(currentFilter ? currentFilter : uniqueValues);

  // -- 정렬 버튼 --
  const sortSection = document.createElement("div");
  sortSection.className = "csv-filter-sort";
  const sortAsc = document.createElement("div");
  sortAsc.className = "csv-filter-sort-item";
  sortAsc.textContent = "▲ 오름차순 정렬";
  sortAsc.addEventListener("click", () => { sortColumn(colIndex, true); closeFilterMenu(); });
  const sortDesc = document.createElement("div");
  sortDesc.className = "csv-filter-sort-item";
  sortDesc.textContent = "▼ 내림차순 정렬";
  sortDesc.addEventListener("click", () => { sortColumn(colIndex, false); closeFilterMenu(); });
  sortSection.appendChild(sortAsc);
  sortSection.appendChild(sortDesc);
  menu.appendChild(sortSection);

  // -- 구분선 --
  menu.appendChild(Object.assign(document.createElement("div"), { className: "csv-filter-divider" }));

  // -- 검색 --
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "csv-filter-search";
  searchInput.placeholder = "값 검색...";
  menu.appendChild(searchInput);

  // -- 구분선 --
  menu.appendChild(Object.assign(document.createElement("div"), { className: "csv-filter-divider" }));

  // -- 체크박스 목록 --
  const listWrap = document.createElement("div");
  listWrap.className = "csv-filter-list";

  // (모두 선택)
  const allItem = document.createElement("label");
  allItem.className = "csv-filter-item csv-filter-all";
  const allCb = document.createElement("input");
  allCb.type = "checkbox";
  allCb.checked = checkedSet.size === uniqueValues.length;
  allItem.appendChild(allCb);
  allItem.appendChild(document.createTextNode("(모두 선택)"));
  listWrap.appendChild(allItem);

  // 개별 값
  const itemElements = [];
  for (const val of uniqueValues) {
    const item = document.createElement("label");
    item.className = "csv-filter-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checkedSet.has(val);
    cb.dataset.val = val;
    item.appendChild(cb);
    item.appendChild(document.createTextNode(val === "" ? "(빈 값)" : val));
    listWrap.appendChild(item);
    itemElements.push({ el: item, cb, val });
  }
  menu.appendChild(listWrap);

  // (모두 선택) 토글
  allCb.addEventListener("change", () => {
    const visibleItems = itemElements.filter(it => it.el.style.display !== "none");
    visibleItems.forEach(it => { it.cb.checked = allCb.checked; });
  });

  // 개별 체크박스 변경 시 (모두 선택) 업데이트
  listWrap.addEventListener("change", (e) => {
    if (e.target === allCb) return;
    const visibleItems = itemElements.filter(it => it.el.style.display !== "none");
    allCb.checked = visibleItems.every(it => it.cb.checked);
  });

  // 검색 필터링
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase();
    for (const it of itemElements) {
      const show = !q || it.val.toLowerCase().includes(q);
      it.el.style.display = show ? "" : "none";
    }
    const visibleItems = itemElements.filter(it => it.el.style.display !== "none");
    allCb.checked = visibleItems.length > 0 && visibleItems.every(it => it.cb.checked);
  });

  // -- 구분선 --
  menu.appendChild(Object.assign(document.createElement("div"), { className: "csv-filter-divider" }));

  // -- 액션 버튼 --
  const actions = document.createElement("div");
  actions.className = "csv-filter-actions";
  const applyBtn = document.createElement("button");
  applyBtn.textContent = "적용";
  applyBtn.className = "csv-filter-apply-btn";
  applyBtn.addEventListener("click", () => {
    const selected = new Set(itemElements.filter(it => it.cb.checked).map(it => it.val));
    if (selected.size === uniqueValues.length || selected.size === 0) {
      delete csvFilters[colIndex];
    } else {
      csvFilters[colIndex] = selected;
    }
    closeFilterMenu();
    applyFilters();
  });
  const resetBtn = document.createElement("button");
  resetBtn.textContent = "초기화";
  resetBtn.addEventListener("click", () => {
    delete csvFilters[colIndex];
    closeFilterMenu();
    applyFilters();
  });
  actions.appendChild(applyBtn);
  actions.appendChild(resetBtn);
  menu.appendChild(actions);

  // -- 위치 계산 --
  document.body.appendChild(menu);
  const rect = anchorEl.getBoundingClientRect();
  let top = rect.bottom + 2;
  let left = rect.left;
  const menuRect = menu.getBoundingClientRect();
  if (left + menuRect.width > window.innerWidth) left = window.innerWidth - menuRect.width - 8;
  if (top + menuRect.height > window.innerHeight) top = rect.top - menuRect.height - 2;
  if (left < 0) left = 4;
  if (top < 0) top = 4;
  menu.style.top = top + "px";
  menu.style.left = left + "px";

  setTimeout(() => {
    document.addEventListener("mousedown", _onFilterOutsideClick);
    searchInput.focus();
  }, 0);
}

// --- 열 정렬 ---
function sortColumn(colIndex, ascending) {
  if (csvData.length <= 1) return;
  const header = csvData[0];
  const rows = csvData.slice(1);
  // 숫자 컬럼 판별
  const isNumeric = rows.every(r => {
    const v = r[colIndex] ?? "";
    return v === "" || !isNaN(Number(v));
  });
  rows.sort((a, b) => {
    const va = a[colIndex] ?? "", vb = b[colIndex] ?? "";
    if (isNumeric) {
      const na = va === "" ? -Infinity : Number(va);
      const nb = vb === "" ? -Infinity : Number(vb);
      return ascending ? na - nb : nb - na;
    }
    const cmp = va.localeCompare(vb, "ko");
    return ascending ? cmp : -cmp;
  });
  csvData = [header, ...rows];
  applyFilters();
  setCsvStatus(`열 ${colIndex + 1} ${ascending ? "오름차순" : "내림차순"} 정렬 완료`);
}

// --- 열 자동 맞춤 (더블클릭) ---
function autoFitColumn(colIndex, colgroup) {
  // 실제 DOM input의 scrollWidth로 측정
  const inputs = csvGridWrap.querySelectorAll(`.csv-cell[data-col="${colIndex}"] input`);
  let maxW = 40;
  for (const input of inputs) {
    // 임시로 너비를 줄여 scrollWidth가 실제 콘텐츠 폭을 반환하게 함
    const origW = input.style.width;
    input.style.width = "0";
    const w = input.scrollWidth + 8; // 약간의 여유
    input.style.width = origW;
    if (w > maxW) maxW = w;
  }
  maxW = Math.min(maxW, 600);
  csvColWidths[colIndex] = maxW;
  colgroup.children[colIndex + 1].style.width = maxW + "px";
}

// --- 열 리사이즈 ---
let _lastResizeTime = 0;
let _lastResizeCol = -1;

function startColResize(e, colIndex, colgroup) {
  e.preventDefault();
  e.stopPropagation();

  // 더블클릭 감지: 같은 열을 300ms 이내 재클릭
  const now = Date.now();
  if (colIndex === _lastResizeCol && now - _lastResizeTime < 300) {
    _lastResizeTime = 0;
    _lastResizeCol = -1;
    autoFitColumn(colIndex, colgroup);
    return;
  }
  _lastResizeTime = now;
  _lastResizeCol = colIndex;

  const startX = e.clientX;
  const startWidth = csvColWidths[colIndex];
  const col = colgroup.children[colIndex + 1]; // +1: rowNum col 건너뛰기

  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;cursor:col-resize;";
  document.body.appendChild(overlay);

  function onMove(ev) {
    const diff = ev.clientX - startX;
    const newWidth = Math.max(40, startWidth + diff);
    csvColWidths[colIndex] = newWidth;
    col.style.width = newWidth + "px";
  }

  function onUp() {
    overlay.remove();
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

// --- 파일 로드 ---
function loadFile(file) {
  csvFilename = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    const text = decodeBuffer(reader.result);
    // 구분자 자동 감지
    const firstLine = text.split("\n")[0] || "";
    if (firstLine.split("\t").length > firstLine.split(",").length) {
      csvDelimiter.value = "\t";
    } else {
      csvDelimiter.value = ",";
    }
    csvData = parseCsv(text, csvDelimiter.value);
    csvEncoding.value = csvDetectedEncoding === "euc-kr" ? "euc-kr"
      : csvDetectedEncoding === "shift_jis" ? "shift_jis" : "utf-8";
    csvColWidths = [];
    csvCurrentSaveId = null;
    clearAllFilters();
    renderGrid();
    setCsvStatus(`${csvFilename} 로드 완료 (${csvData.length}행 × ${csvData[0]?.length || 0}열, 감지: ${csvDetectedEncoding})`);
    csvUploadZone.style.display = "none";
    loadCsvSaves();
  };
  reader.readAsArrayBuffer(file);
}

// --- 다운로드 ---
async function downloadCsv() {
  if (csvData.length === 0) { setCsvStatus("데이터가 없습니다.", true); return; }

  const text = serializeCsv(csvData, csvDelimiter.value);
  const encoding = csvEncoding.value;

  if (encoding === "utf-8") {
    downloadBlob(new Blob([text], { type: "text/csv;charset=utf-8" }));
  } else if (encoding === "utf-8-bom") {
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    downloadBlob(new Blob([bom, text], { type: "text/csv;charset=utf-8" }));
  } else {
    try {
      const r = await fetch("/api/csv/encode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, encoding, filename: csvFilename }),
      });
      if (!r.ok) {
        const err = await r.json();
        setCsvStatus(err.error || "인코딩 변환 실패", true);
        return;
      }
      downloadBlob(await r.blob());
    } catch (e) {
      setCsvStatus(`다운로드 실패: ${e.message}`, true);
      return;
    }
  }
  setCsvStatus(`${csvFilename} 다운로드 완료 (${encoding})`);
}

function downloadBlob(blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = csvFilename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- 행/열 조작 ---
function addRow(dir) {
  if (csvData.length === 0) { csvData.push([""]); renderGrid(); setCsvStatus("행 추가됨"); return; }
  var newRow = new Array(csvData[0].length).fill("");
  if (dir === "above" && csvFocusRow >= 0) {
    csvData.splice(csvFocusRow, 0, newRow);
    setCsvStatus("행 " + (csvFocusRow + 1) + " 위에 추가됨");
  } else if (dir === "below" && csvFocusRow >= 0) {
    csvData.splice(csvFocusRow + 1, 0, newRow);
    setCsvStatus("행 " + (csvFocusRow + 1) + " 아래에 추가됨");
  } else {
    csvData.push(newRow);
    setCsvStatus("행 추가됨 (맨 아래)");
  }
  if (Object.keys(csvFilters).length > 0) applyFilters();
  else renderGrid();
}

function addCol(dir) {
  if (csvData.length === 0) { csvData.push([""]); renderGrid(); setCsvStatus("열 추가됨"); return; }
  if (dir === "left" && csvFocusCol >= 0) {
    csvData.forEach(row => row.splice(csvFocusCol, 0, ""));
    // 필터 인덱스 조정
    var nf = {};
    for (var k in csvFilters) { var ki = parseInt(k); nf[ki >= csvFocusCol ? ki + 1 : ki] = csvFilters[k]; }
    csvFilters = nf;
    setCsvStatus("열 " + (csvFocusCol + 1) + " 왼쪽에 추가됨");
  } else if (dir === "right" && csvFocusCol >= 0) {
    csvData.forEach(row => row.splice(csvFocusCol + 1, 0, ""));
    var nf2 = {};
    for (var k2 in csvFilters) { var ki2 = parseInt(k2); nf2[ki2 > csvFocusCol ? ki2 + 1 : ki2] = csvFilters[k2]; }
    csvFilters = nf2;
    setCsvStatus("열 " + (csvFocusCol + 1) + " 오른쪽에 추가됨");
  } else {
    csvData.forEach(row => row.push(""));
    setCsvStatus("열 추가됨 (맨 오른쪽)");
  }
  csvColWidths = [];
  renderGrid();
}

// 기본 클릭: 아래/오른쪽 추가
csvAddRowBtn.addEventListener("click", () => addRow("below"));
csvAddColBtn.addEventListener("click", () => addCol("right"));

// 드롭다운 메뉴
function setupSplitMenu(arrowId, menuId, handler) {
  var arrow = document.getElementById(arrowId);
  var menu = document.getElementById(menuId);
  arrow.addEventListener("click", function (e) {
    e.stopPropagation();
    // 다른 메뉴 닫기
    document.querySelectorAll(".csv-split-menu.open").forEach(m => { if (m !== menu) m.classList.remove("open"); });
    menu.classList.toggle("open");
  });
  menu.querySelectorAll("[data-dir]").forEach(function (item) {
    item.addEventListener("click", function (e) {
      e.stopPropagation();
      menu.classList.remove("open");
      handler(item.dataset.dir);
    });
  });
}
setupSplitMenu("csvAddRowArrow", "csvAddRowMenu", addRow);
setupSplitMenu("csvAddColArrow", "csvAddColMenu", addCol);

// 외부 클릭 시 메뉴 닫기
document.addEventListener("click", function () {
  document.querySelectorAll(".csv-split-menu.open").forEach(m => m.classList.remove("open"));
});

csvDelRowBtn.addEventListener("click", () => {
  if (csvData.length === 0 || csvFocusRow < 0) { setCsvStatus("삭제할 행을 선택하세요.", true); return; }
  csvData.splice(csvFocusRow, 1);
  csvFocusRow = Math.min(csvFocusRow, csvData.length - 1);
  if (Object.keys(csvFilters).length > 0) applyFilters();
  else renderGrid();
  setCsvStatus("행 삭제됨");
});

csvDelColBtn.addEventListener("click", () => {
  if (csvData.length === 0 || csvFocusCol < 0) { setCsvStatus("삭제할 열을 선택하세요.", true); return; }
  // 해당 열의 필터 제거
  delete csvFilters[csvFocusCol];
  // 필터 인덱스 재정렬 (삭제된 열 이후의 필터 인덱스 조정)
  const newFilters = {};
  for (const [k, v] of Object.entries(csvFilters)) {
    const ki = parseInt(k);
    if (ki > csvFocusCol) newFilters[ki - 1] = v;
    else newFilters[ki] = v;
  }
  csvFilters = newFilters;
  csvData.forEach((row) => row.splice(csvFocusCol, 1));
  if (csvData[0]?.length === 0) csvData = [];
  csvFocusCol = Math.min(csvFocusCol, (csvData[0]?.length || 0) - 1);
  if (Object.keys(csvFilters).length > 0) applyFilters();
  else { csvVisibleRows = null; renderGrid(); }
  setCsvStatus("열 삭제됨");
});

csvDownloadBtn.addEventListener("click", downloadCsv);

// --- 임시저장 ---
const csvSaveBtn = document.getElementById("csvSaveBtn");
const csvSavesBody = document.querySelector("#csvSavesTable tbody");
let csvCurrentSaveId = null;

async function saveCsv() {
  if (csvData.length === 0) { setCsvStatus("저장할 데이터가 없습니다.", true); return; }

  const defaultName = csvCurrentSaveId ? csvFilename : csvFilename.replace(/\.[^.]+$/, "");
  const name = prompt("저장 이름을 입력하세요:", defaultName);
  if (!name) return;

  const payload = {
    name,
    data: csvData,
    delimiter: csvDelimiter.value,
    encoding: csvEncoding.value,
    col_widths: csvColWidths,
  };

  try {
    let r;
    if (csvCurrentSaveId) {
      r = await fetch(`/api/csv/saves/${csvCurrentSaveId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      r = await fetch("/api/csv/saves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    const res = await r.json();
    if (!r.ok) { setCsvStatus(res.error || "저장 실패", true); return; }
    if (res.id) csvCurrentSaveId = res.id;
    setCsvStatus(`"${name}" 저장 완료`);
    loadCsvSaves();
  } catch (e) {
    setCsvStatus(`저장 실패: ${e.message}`, true);
  }
}

async function loadCsvSaves() {
  try {
    const r = await fetch("/api/csv/saves");
    const res = await r.json();
    csvSavesBody.innerHTML = "";
    if (!res.items || res.items.length === 0) {
      csvSavesBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);">저장된 항목이 없습니다.</td></tr>';
      return;
    }
    const delimLabel = (d) => d === "\t" ? "탭" : "콤마";
    for (const item of res.items) {
      const tr = document.createElement("tr");
      if (csvCurrentSaveId === item.id) tr.classList.add("csv-save-active");
      tr.innerHTML = `
        <td>${item.id}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${delimLabel(item.delimiter)}</td>
        <td>${escapeHtml(item.encoding)}</td>
        <td>${item.updated_at}</td>
        <td class="row-actions">
          <button class="csv-load-btn" data-id="${item.id}">불러오기</button>
          <button class="csv-delete-btn" data-id="${item.id}">삭제</button>
        </td>
      `;
      csvSavesBody.appendChild(tr);
    }
    csvSavesBody.querySelectorAll(".csv-load-btn").forEach((btn) => {
      btn.addEventListener("click", () => loadCsvSave(parseInt(btn.dataset.id)));
    });
    csvSavesBody.querySelectorAll(".csv-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteCsvSave(parseInt(btn.dataset.id)));
    });
  } catch (e) {
    setCsvStatus(`목록 로드 실패: ${e.message}`, true);
  }
}

async function loadCsvSave(id) {
  try {
    const r = await fetch(`/api/csv/saves/${id}`);
    const res = await r.json();
    if (!r.ok) { setCsvStatus(res.error || "불러오기 실패", true); return; }
    csvData = res.data;
    csvFilename = res.name;
    csvDelimiter.value = res.delimiter;
    csvEncoding.value = res.encoding;
    if (res.col_widths) csvColWidths = res.col_widths;
    else csvColWidths = [];
    csvCurrentSaveId = id;
    clearAllFilters();
    csvUploadZone.style.display = "none";
    renderGrid();
    setCsvStatus(`"${res.name}" 불러오기 완료 (${csvData.length}행 × ${csvData[0]?.length || 0}열)`);
    loadCsvSaves();
  } catch (e) {
    setCsvStatus(`불러오기 실패: ${e.message}`, true);
  }
}

async function deleteCsvSave(id) {
  if (!confirm("이 저장을 삭제하시겠습니까?")) return;
  try {
    const r = await fetch(`/api/csv/saves/${id}`, { method: "DELETE" });
    const res = await r.json();
    if (!r.ok) { setCsvStatus(res.error || "삭제 실패", true); return; }
    if (csvCurrentSaveId === id) csvCurrentSaveId = null;
    setCsvStatus("저장 삭제됨");
    loadCsvSaves();
  } catch (e) {
    setCsvStatus(`삭제 실패: ${e.message}`, true);
  }
}

csvSaveBtn.addEventListener("click", saveCsv);
loadCsvSaves();

// --- 셀 선택 & 복사 ---
function clearCsvSelection() {
  csvSelectedCells = [];
  csvGridWrap.querySelectorAll(".csv-cell-selected").forEach((el) => el.classList.remove("csv-cell-selected"));
}

function applyCsvSelection() {
  csvGridWrap.querySelectorAll(".csv-cell-selected").forEach((el) => el.classList.remove("csv-cell-selected"));
  for (const { row, col } of csvSelectedCells) {
    const td = csvGridWrap.querySelector(`.csv-cell[data-row="${row}"][data-col="${col}"]`);
    if (td) td.classList.add("csv-cell-selected");
  }
}

function selectColumn(colIndex) {
  csvSelectedCells = csvData.map((_, ri) => ({ row: ri, col: colIndex }));
  csvSelAnchor = { row: 0, col: colIndex };
  applyCsvSelection();
  setCsvStatus(`열 ${colIndex + 1} 선택됨 (${csvData.length}셀) — Ctrl+C로 복사`);
}

function selectRow(rowIndex, extend) {
  if (!extend) csvSelectedCells = [];
  const colCount = csvData[0]?.length || 0;
  for (let ci = 0; ci < colCount; ci++) {
    if (!csvSelectedCells.some((s) => s.row === rowIndex && s.col === ci)) {
      csvSelectedCells.push({ row: rowIndex, col: ci });
    }
  }
  csvSelAnchor = { row: rowIndex, col: 0 };
  applyCsvSelection();
  setCsvStatus(`행 ${rowIndex + 1} 선택됨 — Ctrl+C로 복사`);
}

function selectRange(r1, c1, r2, c2) {
  const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
  const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
  csvSelectedCells = [];
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      csvSelectedCells.push({ row: r, col: c });
    }
  }
  applyCsvSelection();
  const count = csvSelectedCells.length;
  setCsvStatus(`${maxR - minR + 1}행 × ${maxC - minC + 1}열 (${count}셀) 선택됨 — Ctrl+C로 복사`);
}

function toggleCellSelection(row, col) {
  const idx = csvSelectedCells.findIndex((s) => s.row === row && s.col === col);
  if (idx >= 0) {
    csvSelectedCells.splice(idx, 1);
  } else {
    csvSelectedCells.push({ row, col });
  }
  csvSelAnchor = { row, col };
  applyCsvSelection();
  setCsvStatus(`${csvSelectedCells.length}셀 선택됨 — Ctrl+C로 복사`);
}

csvGridWrap.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "c" && csvSelectedCells.length > 0) {
    e.preventDefault();
    // 선택된 셀을 행/열 기준으로 정렬 후 TSV 포맷으로 복사
    const rows = {};
    for (const { row, col } of csvSelectedCells) {
      if (!rows[row]) rows[row] = {};
      rows[row][col] = csvData[row]?.[col] ?? "";
    }
    const sortedRows = Object.keys(rows).map(Number).sort((a, b) => a - b);
    const allCols = [...new Set(csvSelectedCells.map((s) => s.col))].sort((a, b) => a - b);
    const text = sortedRows.map((ri) => allCols.map((ci) => rows[ri]?.[ci] ?? "").join("\t")).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCsvStatus(`${csvSelectedCells.length}셀 복사 완료`);
    });
  }
});

// --- 파일 업로드 이벤트 ---
csvUploadZone.addEventListener("click", () => csvFileInput.click());
csvFileInput.addEventListener("change", () => {
  if (csvFileInput.files[0]) loadFile(csvFileInput.files[0]);
});
const csvFileInput2 = document.getElementById("csvFileInput2");
csvFileInput2.addEventListener("change", () => {
  if (csvFileInput2.files[0]) loadFile(csvFileInput2.files[0]);
  csvFileInput2.value = "";
});
csvUploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  csvUploadZone.classList.add("dragover");
});
csvUploadZone.addEventListener("dragleave", () => {
  csvUploadZone.classList.remove("dragover");
});
csvUploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  csvUploadZone.classList.remove("dragover");
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

// --- 초기화 ---
document.getElementById("csvResetBtn").addEventListener("click", function () {
  if (csvData.length > 0 && !confirm("현재 데이터를 모두 지우시겠습니까?")) return;
  csvData = [];
  csvFilename = "data.csv";
  csvColWidths = [];
  csvCurrentSaveId = null;
  csvFocusRow = -1;
  csvFocusCol = -1;
  csvSelectedCells = [];
  csvSelAnchor = null;
  clearAllFilters();
  csvGridWrap.innerHTML = "";
  csvUploadZone.style.display = "";
  setCsvStatus("초기화 완료");
});

// --- 클립보드 붙여넣기 ---
function loadFromClipboardText(text) {
  if (!text || !text.trim()) return;
  // 구분자 자동 감지 (탭 vs 콤마)
  const firstLine = text.split("\n")[0] || "";
  if (firstLine.split("\t").length > firstLine.split(",").length) {
    csvDelimiter.value = "\t";
  } else {
    csvDelimiter.value = ",";
  }
  csvData = parseCsv(text, csvDelimiter.value);
  csvColWidths = [];
  csvCurrentSaveId = null;
  csvFilename = "clipboard.csv";
  clearAllFilters();
  renderGrid();
  setCsvStatus(`클립보드에서 붙여넣기 완료 (${csvData.length}행 × ${csvData[0]?.length || 0}열)`);
  csvUploadZone.style.display = "none";
  loadCsvSaves();
}

// --- 중복 분석 ---
document.getElementById("csvDupCheckBtn").addEventListener("click", function () {
  if (csvData.length <= 1) { setCsvStatus("분석할 데이터가 없습니다.", true); return; }

  // 선택된 열 추출 (선택된 셀의 고유 열 인덱스)
  var selectedCols = [...new Set(csvSelectedCells.map(s => s.col))].sort((a, b) => a - b);
  if (selectedCols.length === 0) {
    setCsvStatus("분석할 열을 먼저 선택하세요. (헤더 더블클릭 또는 셀 선택)", true);
    return;
  }

  // 헤더 구성: 선택 열 이름 + 갯수
  var header = selectedCols.map(ci => csvData[0][ci] || ("열" + (ci + 1)));
  header.push("갯수");

  // 데이터 행에서 선택 열 값 조합별 카운트
  var countMap = {};
  var dataRows = csvVisibleRows ? csvVisibleRows : [];
  if (!csvVisibleRows) {
    for (var i = 1; i < csvData.length; i++) dataRows.push(i);
  }

  for (var idx = 0; idx < dataRows.length; idx++) {
    var ri = dataRows[idx];
    var key = selectedCols.map(ci => csvData[ri][ci] || "").join("\t");
    if (!countMap[key]) countMap[key] = { values: selectedCols.map(ci => csvData[ri][ci] || ""), count: 0 };
    countMap[key].count++;
  }

  // 결과를 새 CSV 데이터로 변환 (갯수 내림차순)
  var entries = Object.values(countMap).sort((a, b) => b.count - a.count);
  var newData = [header];
  for (var e = 0; e < entries.length; e++) {
    newData.push([...entries[e].values, String(entries[e].count)]);
  }

  // 새 CSV로 교체
  csvData = newData;
  csvColWidths = [];
  csvCurrentSaveId = null;
  clearAllFilters();
  renderGrid();
  setCsvStatus("중복 분석 완료: " + header.slice(0, -1).join(", ") + " 기준 — " + entries.length + "개 고유값, 총 " + dataRows.length + "행");
});

document.addEventListener("paste", function (e) {
  // CSV 탭이 활성화 상태인지 확인
  var csvTab = document.querySelector('.tab-content[data-tab="csv"]');
  if (!csvTab || !csvTab.classList.contains("active")) return;

  // 이미 그리드 셀을 편집 중이면 무시 (셀 내부 붙여넣기)
  var active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && active.closest("#csvGridWrap")) return;

  var text = (e.clipboardData || window.clipboardData).getData("text");
  if (!text || !text.trim()) return;

  // 최소 2개 이상의 셀이 있는 데이터인지 확인 (탭이나 콤마 포함)
  if (text.indexOf("\t") !== -1 || text.indexOf(",") !== -1 || text.indexOf("\n") !== -1) {
    e.preventDefault();
    loadFromClipboardText(text);
  }
});
