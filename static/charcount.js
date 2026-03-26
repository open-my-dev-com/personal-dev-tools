// ── 문자수 체크 ──
(function () {
  var $input = $("#charCountInput");
  var $resultEl = $("#charCountResult");
  if (!$input.length || !$resultEl.length) return;

  var sortCol = null; // "num", "text", "count"
  var sortAsc = true;

  function esc(s) {
    return $("<div>").text(s).html();
  }

  function render() {
    var text = $input.val();
    if (!text.trim()) {
      $resultEl.html("");
      return;
    }

    var lines = text.split("\n");
    var data = lines.map(function (line, i) {
      return { num: i + 1, text: line, count: line.length };
    });

    // 정렬
    if (sortCol) {
      data.sort(function (a, b) {
        var va = a[sortCol], vb = b[sortCol];
        if (typeof va === "string") {
          var cmp = va.localeCompare(vb);
          return sortAsc ? cmp : -cmp;
        }
        return sortAsc ? va - vb : vb - va;
      });
    }

    var totalChars = data.reduce(function (s, d) { return s + d.count; }, 0);
    var totalLines = data.length;

    var html = '<div class="char-count-summary">' + t("charcount.summary", {lines: totalLines, chars: totalChars.toLocaleString()}) + '</div>';
    html += "<table><thead><tr>";
    html += '<th class="line-num sortable" data-col="num">' + t("charcount.col_line") + sortIcon("num") + "</th>";
    html += '<th class="line-text sortable" data-col="text">' + t("charcount.col_content") + sortIcon("text") + "</th>";
    html += '<th class="line-count sortable" data-col="count">' + t("charcount.col_count") + sortIcon("count") + "</th>";
    html += "</tr></thead><tbody>";

    data.forEach(function (d) {
      html += "<tr>";
      html += '<td class="line-num">' + d.num + "</td>";
      html += '<td class="line-text">' + esc(d.text) + "</td>";
      html += '<td class="line-count">' + d.count + "</td>";
      html += "</tr>";
    });
    html += "</tbody></table>";

    $resultEl.html(html);

    // 정렬 이벤트 (이벤트 위임)
    $resultEl.find(".sortable").on("click", function () {
      var col = $(this).data("col");
      if (sortCol === col) {
        sortAsc = !sortAsc;
      } else {
        sortCol = col;
        sortAsc = true;
      }
      render();
    });
  }

  function sortIcon(col) {
    if (sortCol !== col) return "";
    return sortAsc ? " ▲" : " ▼";
  }

  $input.on("input", render);
  $input.on("paste", function () {
    setTimeout(render, 0);
  });
})();
