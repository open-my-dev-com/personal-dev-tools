(function() {
const $jsonFmtInput = $("#jsonFmtInput");
const $jsonFmtBtn = $("#jsonFmtBtn");
const $jsonMinifyBtn = $("#jsonMinifyBtn");
const $jsonSortKeys = $("#jsonSortKeys");
const $jsonIndent = $("#jsonIndent");
const $jsonFmtCopyBtn = $("#jsonFmtCopyBtn");
const $jsonFmtStatus = $("#jsonFmtStatus");

function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj && typeof obj === "object") {
    const sorted = {};
    Object.keys(obj).sort().forEach((k) => { sorted[k] = sortKeysDeep(obj[k]); });
    return sorted;
  }
  return obj;
}

function setJsonFmtStatus(text, isError = false) {
  $jsonFmtStatus.text(text);
  $jsonFmtStatus.css("color", isError ? "#bf233a" : "#65748b");
}

function formatJson(minify) {
  const raw = $jsonFmtInput.val().trim();
  if (!raw) { setJsonFmtStatus(""); return; }
  try {
    let parsed = JSON.parse(raw);
    if ($jsonSortKeys.prop("checked")) parsed = sortKeysDeep(parsed);
    if (minify) {
      $jsonFmtInput.val(JSON.stringify(parsed));
      setJsonFmtStatus(t("json.minify_done"));
    } else {
      const indentVal = $jsonIndent.val() === "tab" ? "\t" : Number($jsonIndent.val());
      $jsonFmtInput.val(JSON.stringify(parsed, null, indentVal));
      setJsonFmtStatus(t("json.sort_done"));
    }
  } catch (e) {
    setJsonFmtStatus(t("json.parse_fail", { msg: e.message }), true);
  }
}

$jsonFmtBtn.on("click", () => formatJson(false));
$jsonMinifyBtn.on("click", () => formatJson(true));
$jsonFmtCopyBtn.on("click", () => {
  navigator.clipboard.writeText($jsonFmtInput.val()).then(() => {
    setJsonFmtStatus(t("json.copy_done"));
    showToast(t("json.copy_done"), "success");
  });
});
$jsonFmtInput.on("paste", () => setTimeout(() => formatJson(false), 0));

$("#jsonFileInput").on("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $jsonFmtInput.val(reader.result);
    formatJson(false);
    setJsonFmtStatus(t("json.file_load_done", { name: file.name }));
  };
  reader.onerror = () => setJsonFmtStatus(t("json.file_read_fail"), true);
  reader.readAsText(file);
  e.target.value = "";
});

$("#jsonSaveFileBtn").on("click", () => {
  const text = $jsonFmtInput.val().trim();
  if (!text) { setJsonFmtStatus(t("json.no_content"), true); return; }
  const blob = new Blob([text], { type: "application/json" });
  const $a = $("<a>");
  $a.attr("href", URL.createObjectURL(blob));
  $a.attr("download", "formatted.json");
  $a[0].click();
  URL.revokeObjectURL($a.attr("href"));
  setJsonFmtStatus(t("json.file_save_done"));
  showToast(t("json.file_save_done"), "success");
});

// --- 임시저장 ---
const $jsonSavesBody = $("#jsonSavesTable tbody");
let jsonCurrentSaveId = null;

async function saveJsonToDb() {
  const data = $jsonFmtInput.val().trim();
  if (!data) { setJsonFmtStatus(t("json.no_content"), true); return; }
  const defaultName = jsonCurrentSaveId ? "" : new Date().toLocaleString("ko-KR");
  const name = prompt(t("json.enter_name"), defaultName);
  if (name === null) return;
  if (!name.trim()) { setJsonFmtStatus(t("json.name_required"), true); return; }
  try {
    let res;
    if (jsonCurrentSaveId) {
      res = await $.ajax({
        url: `/api/json/saves/${jsonCurrentSaveId}`,
        method: "PUT",
        contentType: "application/json",
        data: JSON.stringify({ name: name.trim(), data }),
        dataType: "json"
      });
    } else {
      res = await $.ajax({
        url: "/api/json/saves",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({ name: name.trim(), data }),
        dataType: "json"
      });
    }
    if (res.id) jsonCurrentSaveId = res.id;
    setJsonFmtStatus(t("json.temp_save_done"));
    showToast(t("json.temp_save_done"), "success");
    loadJsonSaves();
  } catch (e) {
    setJsonFmtStatus(t("json.temp_save_fail"), true);
    showToast(t("json.temp_save_fail"), "error");
  }
}

async function loadJsonSaves() {
  try {
    const { items } = await $.getJSON("/api/json/saves");
    $jsonSavesBody.html("");
    if (!items.length) {
      $jsonSavesBody.html(`<tr><td colspan="4" style="text-align:center;color:var(--muted);">${t("json.no_saved")}</td></tr>`);
      return;
    }
    for (const item of items) {
      const $tr = $("<tr>");
      if (jsonCurrentSaveId === item.id) $tr.addClass("json-save-active");
      $tr.html(`
        <td>${item.id}</td>
        <td>${item.name}</td>
        <td>${item.updated_at}</td>
        <td>
          <button class="json-load-btn" data-id="${item.id}">${t("common.load")}</button>
          <button class="json-delete-btn" data-id="${item.id}">${t("common.delete")}</button>
        </td>`);
      $jsonSavesBody.append($tr);
    }
    $jsonSavesBody.find(".json-load-btn").on("click", function() {
      loadJsonSave(parseInt($(this).data("id")));
    });
    $jsonSavesBody.find(".json-delete-btn").on("click", function() {
      deleteJsonSave(parseInt($(this).data("id")));
    });
  } catch (e) {
    console.error("JSON saves load error:", e);
  }
}

async function loadJsonSave(id) {
  try {
    const item = await $.getJSON(`/api/json/saves/${id}`);
    if (item.error) { setJsonFmtStatus(item.error, true); return; }
    $jsonFmtInput.val(item.data);
    jsonCurrentSaveId = id;
    setJsonFmtStatus(t("json.load_done", { name: item.name }));
    loadJsonSaves();
  } catch (e) {
    setJsonFmtStatus(t("common.load_fail"), true);
  }
}

async function deleteJsonSave(id) {
  if (!confirm(t("json.confirm_delete"))) return;
  try {
    await $.ajax({ url: `/api/json/saves/${id}`, method: "DELETE" });
    if (jsonCurrentSaveId === id) jsonCurrentSaveId = null;
    setJsonFmtStatus(t("common.delete_done"));
    showToast(t("common.delete_done"), "success");
    loadJsonSaves();
  } catch (e) {
    setJsonFmtStatus(t("common.delete_fail"), true);
    showToast(t("common.delete_fail"), "error");
  }
}

$("#jsonSaveDbBtn").on("click", saveJsonToDb);
i18nReady(loadJsonSaves);
$(window).on("langchange", loadJsonSaves);

// ── 유틸: 빈 값 제거 ──
function removeEmptyValues(obj) {
  if (Array.isArray(obj)) {
    const arr = obj.map(removeEmptyValues).filter(v =>
      v !== null && v !== undefined && v !== "" &&
      !(Array.isArray(v) && v.length === 0) &&
      !(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0)
    );
    return arr;
  }
  if (obj && typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      const cleaned = removeEmptyValues(v);
      if (cleaned === null || cleaned === undefined || cleaned === "") continue;
      if (Array.isArray(cleaned) && cleaned.length === 0) continue;
      if (cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0) continue;
      result[k] = cleaned;
    }
    return result;
  }
  return obj;
}

$("#jsonRemoveEmptyBtn").on("click", () => {
  const raw = $jsonFmtInput.val().trim();
  if (!raw) { setJsonFmtStatus(t("common.no_input"), true); return; }
  try {
    const parsed = JSON.parse(raw);
    const cleaned = removeEmptyValues(parsed);
    const indentVal = $jsonIndent.val() === "tab" ? "\t" : Number($jsonIndent.val());
    const before = JSON.stringify(parsed).length;
    const after = JSON.stringify(cleaned).length;
    $jsonFmtInput.val(JSON.stringify(cleaned, null, indentVal));
    const diff = before - after;
    setJsonFmtStatus(diff > 0 ? t("json.empty_remove_done", { count: before - after }) : t("json.no_empty"));
  } catch (e) {
    setJsonFmtStatus(t("json.parse_fail", { msg: e.message }), true);
  }
});

// ── 유틸: 중복 키 찾기 ──
function findDuplicateKeys(jsonStr) {
  const dupes = {};
  let depth = 0;
  const stack = [{}]; // 각 depth의 키 카운트
  let i = 0;
  while (i < jsonStr.length) {
    const ch = jsonStr[i];
    if (ch === "{") {
      depth++;
      stack[depth] = {};
      i++;
    } else if (ch === "}") {
      // 현재 depth의 중복 체크
      const counts = stack[depth];
      for (const [k, c] of Object.entries(counts)) {
        if (c > 1) {
          dupes[k] = (dupes[k] || 0) + c;
        }
      }
      delete stack[depth];
      depth--;
      i++;
    } else if (ch === '"') {
      // 키인지 확인: { 또는 , 뒤의 문자열
      const start = i;
      i++;
      while (i < jsonStr.length && jsonStr[i] !== '"') {
        if (jsonStr[i] === "\\") i++;
        i++;
      }
      const str = jsonStr.slice(start + 1, i);
      i++; // closing "
      // 다음 비공백이 : 이면 키
      let j = i;
      while (j < jsonStr.length && /\s/.test(jsonStr[j])) j++;
      if (jsonStr[j] === ":") {
        if (stack[depth]) {
          stack[depth][str] = (stack[depth][str] || 0) + 1;
        }
      }
    } else {
      i++;
    }
  }
  return dupes;
}

$("#jsonFindDupKeysBtn").on("click", () => {
  const raw = $jsonFmtInput.val().trim();
  if (!raw) { setJsonFmtStatus(t("common.no_input"), true); return; }
  const dupes = findDuplicateKeys(raw);
  const keys = Object.keys(dupes);
  if (keys.length === 0) {
    setJsonFmtStatus(t("json.no_dup"));
  } else {
    const desc = keys.map(k => `${k} (${t("json.dup_count", { count: dupes[k] })})`).join(", ");
    setJsonFmtStatus(t("json.dup_found", { desc }), true);
  }
});

// ── 유틸 패널 토글 ──
$(".json-util-tab").on("click", function() {
  const panelId = $(this).data("panel");
  const isActive = $(this).hasClass("active");
  // 모든 탭/패널 닫기
  $(".json-util-tab").removeClass("active");
  $(".json-util-panel").hide();
  if (!isActive) {
    $(this).addClass("active");
    $("#" + panelId).show();
    // 패널 열릴 때 초기화
    if (panelId === "jsonTreePanel") refreshTreeView();
  }
});

// ── 트리 뷰어 ──
function refreshTreeView() {
  const $container = $("#jsonTreeView");
  $container.html("");
  const raw = $jsonFmtInput.val().trim();
  if (!raw) { $container.html(`<span style="color:var(--muted)">${t("json.input_required")}</span>`); return; }
  try {
    const parsed = JSON.parse(raw);
    $container.append(buildTreeNode(parsed, null, true));
  } catch (e) {
    $container.html(`<span style="color:#bf233a">${t("json.parse_fail", { msg: e.message })}</span>`);
  }
}

function buildTreeNode(value, key, expanded) {
  const $wrap = $("<div>").addClass("json-tree-item");
  if (value !== null && typeof value === "object") {
    const isArr = Array.isArray(value);
    const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
    const $toggle = $("<span>").addClass("json-tree-toggle").text(expanded ? "▼ " : "▶ ");
    const $keySpan = $("<span>").addClass("json-tree-key").text(key !== null ? `${key}: ` : "");
    const $bracket = $("<span>").addClass("json-tree-bracket").text(isArr ? `[${entries.length}]` : `{${entries.length}}`);
    const $header = $("<div>").addClass("json-tree-header");
    $header.append($toggle).append($keySpan).append($bracket);
    const $children = $("<div>").addClass("json-tree-children")
      .css({ display: expanded ? "" : "none", paddingLeft: "20px" });
    for (const [k, v] of entries) {
      $children.append(buildTreeNode(v, k, false));
    }
    $toggle.on("click", () => {
      const open = $children.css("display") !== "none";
      $children.css("display", open ? "none" : "");
      $toggle.text(open ? "▶ " : "▼ ");
    });
    $header.css("cursor", "pointer");
    $header.on("click", (e) => {
      if (e.target === $toggle[0]) return;
      $toggle.trigger("click");
    });
    $wrap.append($header).append($children);
  } else {
    const $line = $("<div>").addClass("json-tree-leaf");
    if (key !== null) {
      const $keySpan = $("<span>").addClass("json-tree-key").text(`${key}: `);
      $line.append($keySpan);
    }
    const $valSpan = $("<span>");
    if (value === null) { $valSpan.addClass("json-tree-null").text("null"); }
    else if (typeof value === "string") { $valSpan.addClass("json-tree-string").text(`"${value}"`); }
    else if (typeof value === "number") { $valSpan.addClass("json-tree-number").text(value); }
    else if (typeof value === "boolean") { $valSpan.addClass("json-tree-boolean").text(value); }
    $line.append($valSpan);
    $wrap.append($line);
  }
  return $wrap;
}

$("#jsonTreeExpandAll").on("click", () => {
  $("#jsonTreeView .json-tree-children").css("display", "");
  $("#jsonTreeView .json-tree-toggle").text("▼ ");
});
$("#jsonTreeCollapseAll").on("click", () => {
  $("#jsonTreeView .json-tree-children").css("display", "none");
  $("#jsonTreeView .json-tree-toggle").text("▶ ");
});

// ── JSON Diff ──
function deepDiff(a, b, path) {
  const results = [];
  if (a === b) return results;
  if (a === null || b === null || typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
    results.push({ path, type: "changed", from: a, to: b });
    return results;
  }
  if (typeof a !== "object") {
    results.push({ path, type: "changed", from: a, to: b });
    return results;
  }
  if (Array.isArray(a)) {
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= a.length) results.push({ path: `${path}[${i}]`, type: "added", to: b[i] });
      else if (i >= b.length) results.push({ path: `${path}[${i}]`, type: "removed", from: a[i] });
      else results.push(...deepDiff(a[i], b[i], `${path}[${i}]`));
    }
    return results;
  }
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of allKeys) {
    const childPath = path ? `${path}.${k}` : k;
    if (!(k in a)) results.push({ path: childPath, type: "added", to: b[k] });
    else if (!(k in b)) results.push({ path: childPath, type: "removed", from: a[k] });
    else results.push(...deepDiff(a[k], b[k], childPath));
  }
  return results;
}

$("#jsonDiffRunBtn").on("click", () => {
  const $container = $("#jsonDiffResult");
  $container.html("");
  const rawA = $jsonFmtInput.val().trim();
  const rawB = $("#jsonDiffTarget").val().trim();
  if (!rawA || !rawB) { $container.html(`<span style="color:var(--muted)">${t("json.both_required")}</span>`); return; }
  try {
    const a = JSON.parse(rawA);
    const b = JSON.parse(rawB);
    const diffs = deepDiff(a, b, "$");
    if (diffs.length === 0) {
      $container.html(`<div style="color:#0b7611;padding:8px">${t("json.identical")}</div>`);
      return;
    }
    const $table = $("<table>").addClass("json-diff-table");
    $table.html(`<thead><tr><th>${t("json.diff_path")}</th><th>${t("json.diff_change")}</th><th>${t("json.diff_content")}</th></tr></thead>`);
    const $tbody = $("<tbody>");
    for (const d of diffs) {
      const $tr = $("<tr>").addClass(`json-diff-${d.type}`);
      const $pathTd = $("<td>").text(d.path);
      const $typeTd = $("<td>").text(d.type === "added" ? t("json.diff_added") : d.type === "removed" ? t("json.diff_removed") : t("json.diff_changed"));
      const $valTd = $("<td>");
      if (d.type === "added") $valTd.text(JSON.stringify(d.to));
      else if (d.type === "removed") $valTd.text(JSON.stringify(d.from));
      else $valTd.text(`${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`);
      $tr.append($pathTd, $typeTd, $valTd);
      $tbody.append($tr);
    }
    $table.append($tbody);
    $container.append($table);
  } catch (e) {
    $container.html(`<span style="color:#bf233a">${t("json.parse_fail", { msg: e.message })}</span>`);
  }
});

// ── JSON Path 테스터 ──
function evaluateJsonPath(obj, pathStr) {
  if (!pathStr.startsWith("$")) return [];
  const results = [];

  function tokenize(expr) {
    const tokens = [];
    let i = 1; // skip $
    while (i < expr.length) {
      if (expr[i] === ".") {
        if (expr[i + 1] === ".") {
          tokens.push({ type: "deepScan" });
          i += 2;
        } else {
          i++;
          let key = "";
          while (i < expr.length && expr[i] !== "." && expr[i] !== "[") {
            key += expr[i]; i++;
          }
          if (key) tokens.push({ type: "key", value: key });
        }
      } else if (expr[i] === "[") {
        i++;
        let inner = "";
        while (i < expr.length && expr[i] !== "]") { inner += expr[i]; i++; }
        i++; // ]
        if (inner === "*") tokens.push({ type: "wildcard" });
        else if (/^\d+$/.test(inner)) tokens.push({ type: "index", value: parseInt(inner) });
        else {
          const key = inner.replace(/^['"]|['"]$/g, "");
          tokens.push({ type: "key", value: key });
        }
      } else { i++; }
    }
    return tokens;
  }

  function resolve(current, tokens, idx, path) {
    if (idx >= tokens.length) {
      results.push({ path, value: current });
      return;
    }
    const token = tokens[idx];
    if (token.type === "key") {
      if (current && typeof current === "object" && !Array.isArray(current) && token.value in current) {
        resolve(current[token.value], tokens, idx + 1, `${path}.${token.value}`);
      }
    } else if (token.type === "index") {
      if (Array.isArray(current) && token.value < current.length) {
        resolve(current[token.value], tokens, idx + 1, `${path}[${token.value}]`);
      }
    } else if (token.type === "wildcard") {
      if (Array.isArray(current)) {
        current.forEach((v, i) => resolve(v, tokens, idx + 1, `${path}[${i}]`));
      } else if (current && typeof current === "object") {
        Object.entries(current).forEach(([k, v]) => resolve(v, tokens, idx + 1, `${path}.${k}`));
      }
    } else if (token.type === "deepScan") {
      // 다음 토큰의 키를 재귀적으로 검색
      const nextToken = tokens[idx + 1];
      if (!nextToken) return;
      function scan(node, p) {
        if (node && typeof node === "object") {
          if (Array.isArray(node)) {
            node.forEach((v, i) => {
              if (nextToken.type === "key" && v && typeof v === "object" && !Array.isArray(v) && nextToken.value in v) {
                resolve(v[nextToken.value], tokens, idx + 2, `${p}[${i}].${nextToken.value}`);
              }
              scan(v, `${p}[${i}]`);
            });
          } else {
            if (nextToken.type === "key" && nextToken.value in node) {
              resolve(node[nextToken.value], tokens, idx + 2, `${p}.${nextToken.value}`);
            }
            Object.entries(node).forEach(([k, v]) => scan(v, `${p}.${k}`));
          }
        }
      }
      scan(current, path);
    }
  }

  const tokens = tokenize(pathStr);
  resolve(obj, tokens, 0, "$");
  return results;
}

let jsonPathTimer = null;
function runJsonPath() {
  const $container = $("#jsonPathResult");
  const pathStr = $("#jsonPathInput").val().trim();
  const raw = $jsonFmtInput.val().trim();
  if (!raw || !pathStr) { $container.html(""); return; }
  try {
    const parsed = JSON.parse(raw);
    const results = evaluateJsonPath(parsed, pathStr);
    if (results.length === 0) {
      $container.html(`<span style="color:var(--muted)">${t("json.no_match")}</span>`);
    } else {
      $container.html(results.map(r =>
        `<div class="json-path-match"><span class="json-path-match-path">${r.path}</span> <span class="json-path-match-value">${JSON.stringify(r.value, null, 2)}</span></div>`
      ).join(""));
    }
  } catch (e) {
    $container.html(`<span style="color:#bf233a">${t("json.parse_fail", { msg: e.message })}</span>`);
  }
}

$("#jsonPathRunBtn").on("click", runJsonPath);
$("#jsonPathInput").on("input", () => {
  clearTimeout(jsonPathTimer);
  jsonPathTimer = setTimeout(runJsonPath, 300);
});

// ── K-V 폼 빌더 ──
const $jsonBuilderRows = $("#jsonBuilderRows");

function createBuilderRow(key, type, value, depth) {
  const $row = $("<div>").addClass("json-builder-row")
    .css("paddingLeft", (depth * 24) + "px")
    .data("depth", depth);

  const $keyInput = $("<input>").addClass("json-builder-key")
    .attr("placeholder", t("json.key_ph"))
    .val(key || "");

  const $typeSelect = $("<select>").addClass("json-builder-type");
  ["string", "number", "boolean", "null", "object", "array"].forEach(tp => {
    const $opt = $("<option>").val(tp).text(tp);
    if (tp === type) $opt.prop("selected", true);
    $typeSelect.append($opt);
  });

  const $valueInput = $("<input>").addClass("json-builder-value")
    .attr("placeholder", t("json.value_ph"));

  const $boolSelect = $("<select>").addClass("json-builder-value-bool")
    .html('<option value="true">true</option><option value="false">false</option>')
    .hide();

  const $addChildBtn = $("<button>").addClass("json-builder-add-child")
    .text(t("json.add_child"))
    .hide();

  const $removeBtn = $("<button>").addClass("json-builder-remove")
    .text("✕");

  function updateTypeUI() {
    const tp = $typeSelect.val();
    $valueInput.css("display", (tp === "string" || tp === "number") ? "" : "none");
    $boolSelect.css("display", tp === "boolean" ? "" : "none");
    $addChildBtn.css("display", (tp === "object" || tp === "array") ? "" : "none");
    if (tp === "number") $valueInput.attr("type", "number");
    else { $valueInput.attr("type", "text"); }
  }

  if (type === "boolean") {
    $boolSelect.val(String(value));
  } else if (type !== "object" && type !== "array" && type !== "null") {
    $valueInput.val(value !== undefined && value !== null ? String(value) : "");
  }
  updateTypeUI();

  $typeSelect.on("change", updateTypeUI);
  $removeBtn.on("click", () => {
    // 중첩된 자식 행도 함께 삭제
    const myDepth = $row.data("depth");
    let $next = $row.next();
    const toRemove = [$row];
    while ($next.length && $next.data("depth") > myDepth) {
      toRemove.push($next);
      $next = $next.next();
    }
    toRemove.forEach($r => $r.remove());
  });
  $addChildBtn.on("click", () => {
    const $childRow = createBuilderRow("", "string", "", depth + 1);
    // 자식 행을 현재 행의 마지막 자식 뒤에 삽입
    const myDepth = $row.data("depth");
    let $insertAfter = $row;
    let $next = $row.next();
    while ($next.length && $next.data("depth") > myDepth) {
      $insertAfter = $next;
      $next = $next.next();
    }
    $insertAfter.after($childRow);
  });

  $row.append($keyInput, $typeSelect, $valueInput, $boolSelect, $addChildBtn, $removeBtn);
  return $row;
}

function builderToJson() {
  const rows = $jsonBuilderRows.children().toArray();
  function buildLevel(startIdx, parentDepth) {
    const obj = {};
    let i = startIdx;
    while (i < rows.length) {
      const $row = $(rows[i]);
      const d = $row.data("depth");
      if (d <= parentDepth) break;
      if (d > parentDepth + 1) { i++; continue; }
      const key = $row.find(".json-builder-key").val() || `field${i}`;
      const type = $row.find(".json-builder-type").val();
      let val;
      if (type === "string") val = $row.find(".json-builder-value").val();
      else if (type === "number") val = Number($row.find(".json-builder-value").val()) || 0;
      else if (type === "boolean") val = $row.find(".json-builder-value-bool").val() === "true";
      else if (type === "null") val = null;
      else if (type === "object") val = buildLevel(i + 1, d);
      else if (type === "array") val = Object.values(buildLevel(i + 1, d));
      obj[key] = val;
      // skip children
      i++;
      while (i < rows.length && $(rows[i]).data("depth") > d) i++;
    }
    return obj;
  }
  return buildLevel(0, -1);
}

function jsonToBuilderRows(obj, depth) {
  const entries = Array.isArray(obj) ? obj.map((v, i) => [String(i), v]) : Object.entries(obj);
  for (const [k, v] of entries) {
    let type, val;
    if (v === null) { type = "null"; val = null; }
    else if (Array.isArray(v)) { type = "array"; val = null; }
    else if (typeof v === "object") { type = "object"; val = null; }
    else if (typeof v === "boolean") { type = "boolean"; val = v; }
    else if (typeof v === "number") { type = "number"; val = v; }
    else { type = "string"; val = v; }
    $jsonBuilderRows.append(createBuilderRow(k, type, val, depth));
    if (type === "object" || type === "array") {
      jsonToBuilderRows(v, depth + 1);
    }
  }
}

$("#jsonBuilderAddBtn").on("click", () => {
  $jsonBuilderRows.append(createBuilderRow("", "string", "", 0));
});

$("#jsonBuilderInsertBtn").on("click", () => {
  try {
    const json = builderToJson();
    const indentVal = $jsonIndent.val() === "tab" ? "\t" : Number($jsonIndent.val());
    $jsonFmtInput.val(JSON.stringify(json, null, indentVal));
    setJsonFmtStatus(t("json.builder_done"));
  } catch (e) {
    setJsonFmtStatus(t("json.builder_fail", { msg: e.message }), true);
  }
});

$("#jsonBuilderFromJsonBtn").on("click", () => {
  const raw = $jsonFmtInput.val().trim();
  if (!raw) { setJsonFmtStatus(t("common.no_input"), true); return; }
  try {
    const parsed = JSON.parse(raw);
    $jsonBuilderRows.html("");
    if (typeof parsed === "object" && parsed !== null) {
      jsonToBuilderRows(parsed, 0);
    }
    setJsonFmtStatus(t("json.builder_load_done"));
  } catch (e) {
    setJsonFmtStatus(t("json.parse_fail", { msg: e.message }), true);
  }
});

})();
