// ── 문자수 체크 ──
(function () {
  var input = document.getElementById("charCountInput");
  var resultEl = document.getElementById("charCountResult");
  if (!input || !resultEl) return;

  var sortCol = null; // "num", "text", "count"
  var sortAsc = true;

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function render() {
    var text = input.value;
    if (!text.trim()) {
      resultEl.innerHTML = "";
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

    var html = '<div class="char-count-summary">총 ' + totalLines + '줄 / ' + totalChars.toLocaleString() + '자</div>';
    html += "<table><thead><tr>";
    html += '<th class="line-num sortable" data-col="num">줄' + sortIcon("num") + "</th>";
    html += '<th class="line-text sortable" data-col="text">내용' + sortIcon("text") + "</th>";
    html += '<th class="line-count sortable" data-col="count">문자수' + sortIcon("count") + "</th>";
    html += "</tr></thead><tbody>";

    data.forEach(function (d) {
      html += "<tr>";
      html += '<td class="line-num">' + d.num + "</td>";
      html += '<td class="line-text">' + esc(d.text) + "</td>";
      html += '<td class="line-count">' + d.count + "</td>";
      html += "</tr>";
    });
    html += "</tbody></table>";

    resultEl.innerHTML = html;

    // 정렬 이벤트
    resultEl.querySelectorAll(".sortable").forEach(function (th) {
      th.addEventListener("click", function () {
        var col = this.dataset.col;
        if (sortCol === col) {
          sortAsc = !sortAsc;
        } else {
          sortCol = col;
          sortAsc = true;
        }
        render();
      });
    });
  }

  function sortIcon(col) {
    if (sortCol !== col) return "";
    return sortAsc ? " ▲" : " ▼";
  }

  input.addEventListener("input", render);
  input.addEventListener("paste", function () {
    setTimeout(render, 0);
  });
})();
