var $paramInput = $("#paramInput");
var $paramOutput = $("#paramOutput");
var $paramDelimiter = $("#paramDelimiter");
var $paramFormat = $("#paramFormat");
var $paramConvertBtn = $("#paramConvertBtn");
var $paramCopyBtn = $("#paramCopyBtn");
var $paramStatus = $("#paramStatus");

function setParamStatus(text, isError) {
  $paramStatus.text(text).css("color", isError ? "#bf233a" : "#65748b");
}

function detectDelimiter(text) {
  if (text.includes("\n")) return "\n";
  if (text.includes("\t")) return "\t";
  if (text.includes(",")) return ",";
  return /\s+/;
}

function parseItems(text) {
  var raw = text.trim();
  if (!raw) return [];
  var sel = $paramDelimiter.val();
  var delim;
  if (sel === "auto") {
    delim = detectDelimiter(raw);
  } else {
    delim = sel === "\\n" ? "\n" : sel === "\\t" ? "\t" : sel;
  }
  return raw.split(delim).map(function (s) { return s.trim(); }).filter(Boolean);
}

function convertParams() {
  var items = parseItems($paramInput.val());
  if (!items.length) {
    $paramOutput.val("");
    setParamStatus(t("common.no_input"), true);
    return;
  }
  var fmt = $paramFormat.val();
  var result;
  switch (fmt) {
    case "comma":   result = items.join(","); break;
    case "sq":      result = items.map(function (v) { return "'" + v + "'"; }).join(","); break;
    case "dq":      result = items.map(function (v) { return '"' + v + '"'; }).join(","); break;
    case "sql":     result = "(" + items.map(function (v) { return "'" + v + "'"; }).join(",") + ")"; break;
    case "newline": result = items.join("\n"); break;
    case "space":   result = items.join(" "); break;
    case "tab":     result = items.join("\t"); break;
    default:        result = items.join(",");
  }
  $paramOutput.val(result);
  setParamStatus(t("param.convert_done", {count: items.length}));
}

$paramConvertBtn.on("click", convertParams);
$paramInput.on("input", convertParams);
$paramFormat.on("change", convertParams);
$paramDelimiter.on("change", convertParams);

$paramCopyBtn.on("click", function () {
  var text = $paramOutput.val();
  if (!text) { setParamStatus(t("param.no_copy"), true); return; }
  navigator.clipboard.writeText(text).then(function () {
    setParamStatus(t("param.copy_done"));
    showToast(t("param.copy_done"), "success");
  });
});
