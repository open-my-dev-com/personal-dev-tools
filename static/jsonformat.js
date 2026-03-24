const jsonFmtInput = document.getElementById("jsonFmtInput");
const jsonFmtBtn = document.getElementById("jsonFmtBtn");
const jsonMinifyBtn = document.getElementById("jsonMinifyBtn");
const jsonSortKeys = document.getElementById("jsonSortKeys");
const jsonIndent = document.getElementById("jsonIndent");
const jsonFmtCopyBtn = document.getElementById("jsonFmtCopyBtn");
const jsonFmtStatus = document.getElementById("jsonFmtStatus");

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
  jsonFmtStatus.textContent = text;
  jsonFmtStatus.style.color = isError ? "#bf233a" : "#65748b";
}

function formatJson(minify) {
  const raw = jsonFmtInput.value.trim();
  if (!raw) { setJsonFmtStatus(""); return; }
  try {
    let parsed = JSON.parse(raw);
    if (jsonSortKeys.checked) parsed = sortKeysDeep(parsed);
    if (minify) {
      jsonFmtInput.value = JSON.stringify(parsed);
      setJsonFmtStatus(t("json.minify_done"));
    } else {
      const indentVal = jsonIndent.value === "tab" ? "\t" : Number(jsonIndent.value);
      jsonFmtInput.value = JSON.stringify(parsed, null, indentVal);
      setJsonFmtStatus(t("json.sort_done"));
    }
  } catch (e) {
    setJsonFmtStatus(t("json.parse_fail", { msg: e.message }), true);
  }
}

jsonFmtBtn.addEventListener("click", () => formatJson(false));
jsonMinifyBtn.addEventListener("click", () => formatJson(true));
jsonFmtCopyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(jsonFmtInput.value).then(() => {
    setJsonFmtStatus(t("json.copy_done"));
    showToast(t("json.copy_done"), "success");
  });
});
jsonFmtInput.addEventListener("paste", () => setTimeout(() => formatJson(false), 0));

document.getElementById("jsonFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    jsonFmtInput.value = reader.result;
    formatJson(false);
    setJsonFmtStatus(t("json.file_load_done", { name: file.name }));
  };
  reader.onerror = () => setJsonFmtStatus(t("json.file_read_fail"), true);
  reader.readAsText(file);
  e.target.value = "";
});

document.getElementById("jsonSaveFileBtn").addEventListener("click", () => {
  const text = jsonFmtInput.value.trim();
  if (!text) { setJsonFmtStatus(t("json.no_content"), true); return; }
  const blob = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "formatted.json";
  a.click();
  URL.revokeObjectURL(a.href);
  setJsonFmtStatus(t("json.file_save_done"));
  showToast(t("json.file_save_done"), "success");
});

// --- 임시저장 ---
const jsonSavesBody = document.querySelector("#jsonSavesTable tbody");
let jsonCurrentSaveId = null;

async function saveJsonToDb() {
  const data = jsonFmtInput.value.trim();
  if (!data) { setJsonFmtStatus(t("json.no_content"), true); return; }
  const defaultName = jsonCurrentSaveId ? "" : new Date().toLocaleString("ko-KR");
  const name = prompt(t("json.enter_name"), defaultName);
  if (name === null) return;
  if (!name.trim()) { setJsonFmtStatus(t("json.name_required"), true); return; }
  try {
    let r;
    if (jsonCurrentSaveId) {
      r = await fetch(`/api/json/saves/${jsonCurrentSaveId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), data }),
      });
    } else {
      r = await fetch("/api/json/saves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), data }),
      });
    }
    const res = await r.json();
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
    const r = await fetch("/api/json/saves");
    const { items } = await r.json();
    jsonSavesBody.innerHTML = "";
    if (!items.length) {
      jsonSavesBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);">${t("json.no_saved")}</td></tr>`;
      return;
    }
    for (const item of items) {
      const tr = document.createElement("tr");
      if (jsonCurrentSaveId === item.id) tr.classList.add("json-save-active");
      tr.innerHTML = `
        <td>${item.id}</td>
        <td>${item.name}</td>
        <td>${item.updated_at}</td>
        <td>
          <button class="json-load-btn" data-id="${item.id}">${t("common.load")}</button>
          <button class="json-delete-btn" data-id="${item.id}">${t("common.delete")}</button>
        </td>`;
      jsonSavesBody.appendChild(tr);
    }
    jsonSavesBody.querySelectorAll(".json-load-btn").forEach((btn) => {
      btn.addEventListener("click", () => loadJsonSave(parseInt(btn.dataset.id)));
    });
    jsonSavesBody.querySelectorAll(".json-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => deleteJsonSave(parseInt(btn.dataset.id)));
    });
  } catch (e) {
    console.error("JSON saves load error:", e);
  }
}

async function loadJsonSave(id) {
  try {
    const r = await fetch(`/api/json/saves/${id}`);
    const item = await r.json();
    if (item.error) { setJsonFmtStatus(item.error, true); return; }
    jsonFmtInput.value = item.data;
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
    await fetch(`/api/json/saves/${id}`, { method: "DELETE" });
    if (jsonCurrentSaveId === id) jsonCurrentSaveId = null;
    setJsonFmtStatus(t("common.delete_done"));
    showToast(t("common.delete_done"), "success");
    loadJsonSaves();
  } catch (e) {
    setJsonFmtStatus(t("common.delete_fail"), true);
    showToast(t("common.delete_fail"), "error");
  }
}

document.getElementById("jsonSaveDbBtn").addEventListener("click", saveJsonToDb);
i18nReady(loadJsonSaves);
window.addEventListener("langchange", loadJsonSaves);

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

document.getElementById("jsonRemoveEmptyBtn").addEventListener("click", () => {
  const raw = jsonFmtInput.value.trim();
  if (!raw) { setJsonFmtStatus(t("common.no_input"), true); return; }
  try {
    const parsed = JSON.parse(raw);
    const cleaned = removeEmptyValues(parsed);
    const indentVal = jsonIndent.value === "tab" ? "\t" : Number(jsonIndent.value);
    const before = JSON.stringify(parsed).length;
    const after = JSON.stringify(cleaned).length;
    jsonFmtInput.value = JSON.stringify(cleaned, null, indentVal);
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

document.getElementById("jsonFindDupKeysBtn").addEventListener("click", () => {
  const raw = jsonFmtInput.value.trim();
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
document.querySelectorAll(".json-util-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    const panelId = btn.dataset.panel;
    const isActive = btn.classList.contains("active");
    // 모든 탭/패널 닫기
    document.querySelectorAll(".json-util-tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".json-util-panel").forEach(p => p.style.display = "none");
    if (!isActive) {
      btn.classList.add("active");
      document.getElementById(panelId).style.display = "";
      // 패널 열릴 때 초기화
      if (panelId === "jsonTreePanel") refreshTreeView();
    }
  });
});

// ── 트리 뷰어 ──
function refreshTreeView() {
  const container = document.getElementById("jsonTreeView");
  container.innerHTML = "";
  const raw = jsonFmtInput.value.trim();
  if (!raw) { container.innerHTML = `<span style="color:var(--muted)">${t("json.input_required")}</span>`; return; }
  try {
    const parsed = JSON.parse(raw);
    container.appendChild(buildTreeNode(parsed, null, true));
  } catch (e) {
    container.innerHTML = `<span style="color:#bf233a">${t("json.parse_fail", { msg: e.message })}</span>`;
  }
}

function buildTreeNode(value, key, expanded) {
  const wrap = document.createElement("div");
  wrap.className = "json-tree-item";
  if (value !== null && typeof value === "object") {
    const isArr = Array.isArray(value);
    const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
    const toggle = document.createElement("span");
    toggle.className = "json-tree-toggle";
    toggle.textContent = expanded ? "▼ " : "▶ ";
    const keySpan = document.createElement("span");
    keySpan.className = "json-tree-key";
    keySpan.textContent = key !== null ? `${key}: ` : "";
    const bracket = document.createElement("span");
    bracket.className = "json-tree-bracket";
    bracket.textContent = isArr ? `[${entries.length}]` : `{${entries.length}}`;
    const header = document.createElement("div");
    header.className = "json-tree-header";
    header.appendChild(toggle);
    header.appendChild(keySpan);
    header.appendChild(bracket);
    const children = document.createElement("div");
    children.className = "json-tree-children";
    children.style.display = expanded ? "" : "none";
    children.style.paddingLeft = "20px";
    for (const [k, v] of entries) {
      children.appendChild(buildTreeNode(v, k, false));
    }
    toggle.addEventListener("click", () => {
      const open = children.style.display !== "none";
      children.style.display = open ? "none" : "";
      toggle.textContent = open ? "▶ " : "▼ ";
    });
    header.style.cursor = "pointer";
    header.addEventListener("click", (e) => {
      if (e.target === toggle) return;
      toggle.click();
    });
    wrap.appendChild(header);
    wrap.appendChild(children);
  } else {
    const line = document.createElement("div");
    line.className = "json-tree-leaf";
    if (key !== null) {
      const keySpan = document.createElement("span");
      keySpan.className = "json-tree-key";
      keySpan.textContent = `${key}: `;
      line.appendChild(keySpan);
    }
    const valSpan = document.createElement("span");
    if (value === null) { valSpan.className = "json-tree-null"; valSpan.textContent = "null"; }
    else if (typeof value === "string") { valSpan.className = "json-tree-string"; valSpan.textContent = `"${value}"`; }
    else if (typeof value === "number") { valSpan.className = "json-tree-number"; valSpan.textContent = value; }
    else if (typeof value === "boolean") { valSpan.className = "json-tree-boolean"; valSpan.textContent = value; }
    line.appendChild(valSpan);
    wrap.appendChild(line);
  }
  return wrap;
}

document.getElementById("jsonTreeExpandAll").addEventListener("click", () => {
  document.querySelectorAll("#jsonTreeView .json-tree-children").forEach(el => el.style.display = "");
  document.querySelectorAll("#jsonTreeView .json-tree-toggle").forEach(el => el.textContent = "▼ ");
});
document.getElementById("jsonTreeCollapseAll").addEventListener("click", () => {
  document.querySelectorAll("#jsonTreeView .json-tree-children").forEach(el => el.style.display = "none");
  document.querySelectorAll("#jsonTreeView .json-tree-toggle").forEach(el => el.textContent = "▶ ");
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

document.getElementById("jsonDiffRunBtn").addEventListener("click", () => {
  const container = document.getElementById("jsonDiffResult");
  container.innerHTML = "";
  const rawA = jsonFmtInput.value.trim();
  const rawB = document.getElementById("jsonDiffTarget").value.trim();
  if (!rawA || !rawB) { container.innerHTML = `<span style="color:var(--muted)">${t("json.both_required")}</span>`; return; }
  try {
    const a = JSON.parse(rawA);
    const b = JSON.parse(rawB);
    const diffs = deepDiff(a, b, "$");
    if (diffs.length === 0) {
      container.innerHTML = `<div style="color:#0b7611;padding:8px">${t("json.identical")}</div>`;
      return;
    }
    const table = document.createElement("table");
    table.className = "json-diff-table";
    table.innerHTML = `<thead><tr><th>${t("json.diff_path")}</th><th>${t("json.diff_change")}</th><th>${t("json.diff_content")}</th></tr></thead>`;
    const tbody = document.createElement("tbody");
    for (const d of diffs) {
      const tr = document.createElement("tr");
      tr.className = `json-diff-${d.type}`;
      const pathTd = document.createElement("td");
      pathTd.textContent = d.path;
      const typeTd = document.createElement("td");
      typeTd.textContent = d.type === "added" ? t("json.diff_added") : d.type === "removed" ? t("json.diff_removed") : t("json.diff_changed");
      const valTd = document.createElement("td");
      if (d.type === "added") valTd.textContent = JSON.stringify(d.to);
      else if (d.type === "removed") valTd.textContent = JSON.stringify(d.from);
      else valTd.textContent = `${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`;
      tr.append(pathTd, typeTd, valTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);
  } catch (e) {
    container.innerHTML = `<span style="color:#bf233a">${t("json.parse_fail", { msg: e.message })}</span>`;
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
  const container = document.getElementById("jsonPathResult");
  const pathStr = document.getElementById("jsonPathInput").value.trim();
  const raw = jsonFmtInput.value.trim();
  if (!raw || !pathStr) { container.innerHTML = ""; return; }
  try {
    const parsed = JSON.parse(raw);
    const results = evaluateJsonPath(parsed, pathStr);
    if (results.length === 0) {
      container.innerHTML = `<span style="color:var(--muted)">${t("json.no_match")}</span>`;
    } else {
      container.innerHTML = results.map(r =>
        `<div class="json-path-match"><span class="json-path-match-path">${r.path}</span> <span class="json-path-match-value">${JSON.stringify(r.value, null, 2)}</span></div>`
      ).join("");
    }
  } catch (e) {
    container.innerHTML = `<span style="color:#bf233a">${t("json.parse_fail", { msg: e.message })}</span>`;
  }
}

document.getElementById("jsonPathRunBtn").addEventListener("click", runJsonPath);
document.getElementById("jsonPathInput").addEventListener("input", () => {
  clearTimeout(jsonPathTimer);
  jsonPathTimer = setTimeout(runJsonPath, 300);
});

// ── K-V 폼 빌더 ──
const jsonBuilderRows = document.getElementById("jsonBuilderRows");

function createBuilderRow(key, type, value, depth) {
  const row = document.createElement("div");
  row.className = "json-builder-row";
  row.style.paddingLeft = (depth * 24) + "px";
  row.dataset.depth = depth;

  const keyInput = document.createElement("input");
  keyInput.className = "json-builder-key";
  keyInput.placeholder = t("json.key_ph");
  keyInput.value = key || "";

  const typeSelect = document.createElement("select");
  typeSelect.className = "json-builder-type";
  ["string", "number", "boolean", "null", "object", "array"].forEach(t => {
    const opt = document.createElement("option");
    opt.value = t; opt.textContent = t;
    if (t === type) opt.selected = true;
    typeSelect.appendChild(opt);
  });

  const valueInput = document.createElement("input");
  valueInput.className = "json-builder-value";
  valueInput.placeholder = t("json.value_ph");

  const boolSelect = document.createElement("select");
  boolSelect.className = "json-builder-value-bool";
  boolSelect.innerHTML = '<option value="true">true</option><option value="false">false</option>';
  boolSelect.style.display = "none";

  const addChildBtn = document.createElement("button");
  addChildBtn.className = "json-builder-add-child";
  addChildBtn.textContent = t("json.add_child");
  addChildBtn.style.display = "none";

  const removeBtn = document.createElement("button");
  removeBtn.className = "json-builder-remove";
  removeBtn.textContent = "✕";

  function updateTypeUI() {
    const t = typeSelect.value;
    valueInput.style.display = (t === "string" || t === "number") ? "" : "none";
    boolSelect.style.display = t === "boolean" ? "" : "none";
    addChildBtn.style.display = (t === "object" || t === "array") ? "" : "none";
    if (t === "number") valueInput.type = "number";
    else { valueInput.type = "text"; }
  }

  if (type === "boolean") {
    boolSelect.value = String(value);
  } else if (type !== "object" && type !== "array" && type !== "null") {
    valueInput.value = value !== undefined && value !== null ? String(value) : "";
  }
  updateTypeUI();

  typeSelect.addEventListener("change", updateTypeUI);
  removeBtn.addEventListener("click", () => {
    // 중첩된 자식 행도 함께 삭제
    const myDepth = parseInt(row.dataset.depth);
    let next = row.nextElementSibling;
    const toRemove = [row];
    while (next && parseInt(next.dataset.depth) > myDepth) {
      toRemove.push(next);
      next = next.nextElementSibling;
    }
    toRemove.forEach(r => r.remove());
  });
  addChildBtn.addEventListener("click", () => {
    const childRow = createBuilderRow("", "string", "", depth + 1);
    // 자식 행을 현재 행의 마지막 자식 뒤에 삽입
    const myDepth = parseInt(row.dataset.depth);
    let insertAfter = row;
    let next = row.nextElementSibling;
    while (next && parseInt(next.dataset.depth) > myDepth) {
      insertAfter = next;
      next = next.nextElementSibling;
    }
    insertAfter.after(childRow);
  });

  row.append(keyInput, typeSelect, valueInput, boolSelect, addChildBtn, removeBtn);
  return row;
}

function builderToJson() {
  const rows = [...jsonBuilderRows.children];
  function buildLevel(startIdx, parentDepth) {
    const obj = {};
    let i = startIdx;
    while (i < rows.length) {
      const row = rows[i];
      const d = parseInt(row.dataset.depth);
      if (d <= parentDepth) break;
      if (d > parentDepth + 1) { i++; continue; }
      const key = row.querySelector(".json-builder-key").value || `field${i}`;
      const type = row.querySelector(".json-builder-type").value;
      let val;
      if (type === "string") val = row.querySelector(".json-builder-value").value;
      else if (type === "number") val = Number(row.querySelector(".json-builder-value").value) || 0;
      else if (type === "boolean") val = row.querySelector(".json-builder-value-bool").value === "true";
      else if (type === "null") val = null;
      else if (type === "object") val = buildLevel(i + 1, d);
      else if (type === "array") val = Object.values(buildLevel(i + 1, d));
      obj[key] = val;
      // skip children
      i++;
      while (i < rows.length && parseInt(rows[i].dataset.depth) > d) i++;
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
    jsonBuilderRows.appendChild(createBuilderRow(k, type, val, depth));
    if (type === "object" || type === "array") {
      jsonToBuilderRows(v, depth + 1);
    }
  }
}

document.getElementById("jsonBuilderAddBtn").addEventListener("click", () => {
  jsonBuilderRows.appendChild(createBuilderRow("", "string", "", 0));
});

document.getElementById("jsonBuilderInsertBtn").addEventListener("click", () => {
  try {
    const json = builderToJson();
    const indentVal = jsonIndent.value === "tab" ? "\t" : Number(jsonIndent.value);
    jsonFmtInput.value = JSON.stringify(json, null, indentVal);
    setJsonFmtStatus(t("json.builder_done"));
  } catch (e) {
    setJsonFmtStatus(t("json.builder_fail", { msg: e.message }), true);
  }
});

document.getElementById("jsonBuilderFromJsonBtn").addEventListener("click", () => {
  const raw = jsonFmtInput.value.trim();
  if (!raw) { setJsonFmtStatus(t("common.no_input"), true); return; }
  try {
    const parsed = JSON.parse(raw);
    jsonBuilderRows.innerHTML = "";
    if (typeof parsed === "object" && parsed !== null) {
      jsonToBuilderRows(parsed, 0);
    }
    setJsonFmtStatus(t("json.builder_load_done"));
  } catch (e) {
    setJsonFmtStatus(t("json.parse_fail", { msg: e.message }), true);
  }
});
