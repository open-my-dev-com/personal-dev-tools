// ── MyBatis 로그 변환 ──
(function () {
  var queryInput = document.getElementById("mybatisQuery");
  var paramsInput = document.getElementById("mybatisParams");
  var convertBtn = document.getElementById("mybatisConvertBtn");
  var stripComments = document.getElementById("mybatisStripComments");
  var formatSql = document.getElementById("mybatisFormatSql");
  var statusEl = document.getElementById("mybatisStatus");
  var resultEl = document.getElementById("mybatisResult");

  if (!queryInput || !convertBtn) return;

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? "var(--danger)" : "";
  }

  // "==>  Preparing: " 또는 "==> Parameters: " 앞의 모든 문자열 포함 제거
  function cleanPrefix(text, prefix) {
    var idx = text.indexOf(prefix);
    if (idx !== -1) {
      return text.substring(idx + prefix.length).trim();
    }
    // 여러 줄일 수 있으니 각 줄에서도 시도
    var lines = text.split("\n");
    var cleaned = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var li = line.indexOf(prefix);
      if (li !== -1) {
        cleaned.push(line.substring(li + prefix.length).trim());
      } else {
        cleaned.push(line);
      }
    }
    return cleaned.join("\n").trim();
  }

  // "Preparing:" 패턴 (공백 다양) 제거
  function extractQuery(text) {
    text = text.trim();
    // "==>  Preparing:" 패턴 제거 (앞에 어떤 문자열이든)
    var match = text.match(/==>[\s]*Preparing[\s]*:/i);
    if (match) {
      text = text.substring(text.indexOf(match[0]) + match[0].length).trim();
    }
    return text;
  }

  function extractParams(text) {
    text = text.trim();
    // "==> Parameters:" 패턴 제거 (앞에 어떤 문자열이든)
    var match = text.match(/==>[\s]*Parameters[\s]*:/i);
    if (match) {
      text = text.substring(text.indexOf(match[0]) + match[0].length).trim();
    }
    return text;
  }

  // 파라미터 문자열 파싱: "1(Integer), Hong(String), null" → [{value, type}, ...]
  function parseParams(paramStr) {
    if (!paramStr.trim()) return [];
    var params = [];
    var current = "";
    var depth = 0;

    for (var i = 0; i < paramStr.length; i++) {
      var ch = paramStr[i];
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        params.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    if (current.trim()) params.push(current.trim());

    return params.map(function (p) {
      var m = p.match(/^(.+?)\((\w+)\)$/);
      if (m) {
        return { value: m[1], type: m[2] };
      }
      // null이나 타입 없는 값
      return { value: p, type: null };
    });
  }

  // 파라미터 값을 SQL에 바인딩할 형태로 변환
  function formatValue(param) {
    if (param.value === "null") return "null";

    var type = (param.type || "").toLowerCase();
    // 숫자 계열
    var numericTypes = ["integer", "int", "long", "short", "byte", "float", "double", "bigdecimal", "numeric"];
    if (numericTypes.indexOf(type) !== -1) {
      return param.value;
    }
    // boolean
    if (type === "boolean") {
      return param.value;
    }
    // 문자열, 날짜 등 → 따옴표
    return "'" + param.value.replace(/'/g, "''") + "'";
  }

  // ? 에 파라미터 바인딩
  function bindParams(sql, params) {
    var paramIdx = 0;
    var result = "";
    var inString = false;
    var stringChar = "";

    for (var i = 0; i < sql.length; i++) {
      var ch = sql[i];

      // 문자열 안인지 추적 (SQL 문자열 리터럴 내의 ?는 치환 안 함)
      if (!inString && (ch === "'" || ch === '"')) {
        inString = true;
        stringChar = ch;
        result += ch;
      } else if (inString && ch === stringChar) {
        // 이스케이프 체크
        if (i + 1 < sql.length && sql[i + 1] === stringChar) {
          result += ch + sql[i + 1];
          i++;
        } else {
          inString = false;
          result += ch;
        }
      } else if (!inString && ch === "?") {
        if (paramIdx < params.length) {
          result += formatValue(params[paramIdx]);
          paramIdx++;
        } else {
          result += "?"; // 파라미터 부족 시 그대로
        }
      } else {
        result += ch;
      }
    }

    return result;
  }

  // SQL 주석 제거
  function stripSqlComments(sql) {
    // 한 줄 주석 (-- ...)
    sql = sql.replace(/--[^\n]*/g, "");
    // 블록 주석 (/* ... */)
    sql = sql.replace(/\/\*[\s\S]*?\*\//g, "");
    // 빈 줄 정리
    sql = sql.replace(/\n\s*\n/g, "\n").trim();
    return sql;
  }

  // SQL 기본 포맷팅
  function formatSqlText(sql) {
    var keywords = [
      "SELECT", "FROM", "WHERE", "AND", "OR", "ORDER BY", "GROUP BY",
      "HAVING", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "OUTER JOIN",
      "JOIN", "ON", "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM",
      "LIMIT", "OFFSET", "UNION ALL", "UNION", "CASE", "WHEN", "THEN",
      "ELSE", "END", "IN", "NOT IN", "EXISTS", "NOT EXISTS", "BETWEEN",
      "LIKE", "IS NULL", "IS NOT NULL", "AS"
    ];

    // 줄바꿈 정규화
    sql = sql.replace(/\s+/g, " ").trim();

    // 주요 키워드 앞에 줄바꿈
    var breakBefore = [
      "SELECT", "FROM", "WHERE", "AND", "OR", "ORDER BY", "GROUP BY",
      "HAVING", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "OUTER JOIN",
      "JOIN", "ON", "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM",
      "LIMIT", "OFFSET", "UNION ALL", "UNION"
    ];

    breakBefore.forEach(function (kw) {
      var re = new RegExp("\\b(" + kw.replace(/\s+/g, "\\s+") + ")\\b", "gi");
      sql = sql.replace(re, "\n$1");
    });

    // 첫 줄 앞 줄바꿈 제거, 들여쓰기 정리
    var lines = sql.split("\n");
    var formatted = [];
    var indentKw = ["AND", "OR", "ON", "SET"];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var upper = line.toUpperCase();
      var needsIndent = false;
      for (var j = 0; j < indentKw.length; j++) {
        if (upper.indexOf(indentKw[j]) === 0) {
          needsIndent = true;
          break;
        }
      }
      formatted.push(needsIndent ? "  " + line : line);
    }

    return formatted.join("\n");
  }

  // HTML 이스케이프
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // 변환 실행
  function convert() {
    var rawQuery = queryInput.value.trim();
    var rawParams = paramsInput.value.trim();

    if (!rawQuery) {
      setStatus("SQL 쿼리를 입력하세요.", true);
      return;
    }

    // 자동 로그 프리픽스 제거
    var sql = extractQuery(rawQuery);
    var paramStr = extractParams(rawParams);

    // 파라미터 파싱 및 바인딩
    var params = parseParams(paramStr);
    var bound = bindParams(sql, params);

    // 옵션 적용
    if (stripComments.checked) {
      bound = stripSqlComments(bound);
    }
    if (formatSql.checked) {
      bound = formatSqlText(bound);
    }

    // 결과 출력
    var paramInfo = params.length > 0
      ? params.length + "개 파라미터 바인딩 완료"
      : "파라미터 없음";
    setStatus(paramInfo);

    resultEl.innerHTML =
      '<div class="mybatis-query-block" style="position:relative">' +
      '<pre><code>' + esc(bound) + '</code></pre>' +
      '<button type="button" class="mybatis-copy-btn">복사</button>' +
      "</div>";

    // 복사 버튼
    resultEl.querySelector(".mybatis-copy-btn").addEventListener("click", function () {
      navigator.clipboard.writeText(bound).then(function () {
        setStatus("클립보드에 복사되었습니다.");
      });
    });
  }

  // 이벤트
  convertBtn.addEventListener("click", convert);

  // Ctrl+Enter로 변환
  queryInput.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); convert(); }
  });
  paramsInput.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); convert(); }
  });

  // 쿼리 textarea에 통합 로그를 붙여넣으면 자동 분리
  queryInput.addEventListener("paste", function (e) {
    setTimeout(function () {
      var text = queryInput.value;
      var hasQuery = /==>[\s]*Preparing[\s]*:/i.test(text);
      var hasParams = /==>[\s]*Parameters[\s]*:/i.test(text);

      if (hasQuery && hasParams) {
        // 쿼리와 파라미터 모두 포함된 로그 → 자동 분리
        var lines = text.split("\n");
        var queryLines = [];
        var paramLines = [];

        for (var i = 0; i < lines.length; i++) {
          if (/==>[\s]*Parameters[\s]*:/i.test(lines[i])) {
            paramLines.push(lines[i]);
          } else {
            queryLines.push(lines[i]);
          }
        }

        queryInput.value = queryLines.join("\n").trim();
        paramsInput.value = paramLines.join("\n").trim();
        paramsInput.focus();
        setStatus("로그에서 쿼리와 파라미터를 자동 분리했습니다.");
      }
    }, 0);
  });
})();
