const paramInput = document.getElementById("paramInput");
const paramOutput = document.getElementById("paramOutput");
const paramDelimiter = document.getElementById("paramDelimiter");
const paramFormat = document.getElementById("paramFormat");
const paramConvertBtn = document.getElementById("paramConvertBtn");
const paramCopyBtn = document.getElementById("paramCopyBtn");
const paramStatus = document.getElementById("paramStatus");

function setParamStatus(text, isError = false) {
  paramStatus.textContent = text;
  paramStatus.style.color = isError ? "#bf233a" : "#65748b";
}

function detectDelimiter(text) {
  if (text.includes("\n")) return "\n";
  if (text.includes("\t")) return "\t";
  if (text.includes(",")) return ",";
  return /\s+/;
}

function parseItems(text) {
  const raw = text.trim();
  if (!raw) return [];
  const sel = paramDelimiter.value;
  let delim;
  if (sel === "auto") {
    delim = detectDelimiter(raw);
  } else {
    delim = sel === "\\n" ? "\n" : sel === "\\t" ? "\t" : sel;
  }
  return raw.split(delim).map((s) => s.trim()).filter(Boolean);
}

function convertParams() {
  const items = parseItems(paramInput.value);
  if (!items.length) {
    paramOutput.value = "";
    setParamStatus("입력값이 없습니다", true);
    return;
  }
  const fmt = paramFormat.value;
  let result;
  switch (fmt) {
    case "comma":   result = items.join(","); break;
    case "sq":      result = items.map((v) => `'${v}'`).join(","); break;
    case "dq":      result = items.map((v) => `"${v}"`).join(","); break;
    case "sql":     result = `(${items.map((v) => `'${v}'`).join(",")})`;  break;
    case "newline": result = items.join("\n"); break;
    case "space":   result = items.join(" "); break;
    case "tab":     result = items.join("\t"); break;
    default:        result = items.join(",");
  }
  paramOutput.value = result;
  setParamStatus(`${items.length}개 항목 변환 완료`);
}

paramConvertBtn.addEventListener("click", convertParams);
paramInput.addEventListener("input", convertParams);
paramFormat.addEventListener("change", convertParams);
paramDelimiter.addEventListener("change", convertParams);

paramCopyBtn.addEventListener("click", () => {
  const text = paramOutput.value;
  if (!text) { setParamStatus("복사할 내용이 없습니다", true); return; }
  navigator.clipboard.writeText(text).then(() => setParamStatus("복사 완료"));
});
