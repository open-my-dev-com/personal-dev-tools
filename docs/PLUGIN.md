# 커스텀 플러그인 가이드 / Custom Plugin Guide

Personal Dev Tools의 플러그인 시스템을 사용하면 **나만의 도구**를 추가할 수 있습니다.
`custom/` 디렉토리는 `.gitignore`에 포함되어 Git에 push되지 않으므로, 개인 전용 도구를 안전하게 관리할 수 있습니다.

---

## 빠른 시작

```bash
# 1. 템플릿 복사
cp -r custom_template/example-tool custom/my-tool

# 2. manifest.json에서 id, name 등 수정
# 3. 서버 재시작
python server.py
```

---

## 디렉토리 구조

```
custom/
  my-tool/
    manifest.json      ← 필수: 모듈 메타데이터
    template.html      ← 필수: 탭 콘텐츠 HTML
    main.js            ← 선택: 프론트엔드 로직
    style.css          ← 선택: 스타일
    routes.py          ← 선택: 서버 사이드 API
    lang/              ← 선택: 다국어 번역
      ko.json
      en.json
      ja.json
```

---

## manifest.json

```json
{
  "id": "my-tool",
  "name": "내 도구",
  "version": "1.0.0",
  "icon": "wrench",
  "description": "도구 설명",
  "author": "작성자",
  "has_routes": true,
  "db_tables": {
    "custom_my_tool_data": {
      "columns": {
        "id": "INTEGER PRIMARY KEY AUTOINCREMENT",
        "name": "TEXT NOT NULL",
        "created_at": "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP"
      }
    }
  }
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `id` | O | 디렉토리명과 일치해야 함 |
| `name` | O | 사이드바에 표시될 이름 |
| `version` | - | 버전 정보 |
| `icon` | - | [Lucide](https://lucide.dev/icons/) 아이콘 이름 (기본: `puzzle`) |
| `description` | - | 플러그인 설명 |
| `author` | - | 작성자 |
| `has_routes` | - | `true`면 `routes.py` 로드 |
| `db_tables` | - | 자동 생성할 DB 테이블 정의 |

### DB 테이블 규칙

- 테이블명은 반드시 `custom_` 접두사로 시작해야 합니다.
- `CREATE TABLE IF NOT EXISTS`로 실행되므로 이미 존재하면 무시됩니다.

---

## 프론트엔드 (template.html + main.js)

### template.html

탭 콘텐츠 영역에 삽입될 HTML입니다. `<section>` 태그 없이 내부 콘텐츠만 작성합니다.

```html
<div class="my-tool-wrap">
  <h3 data-i18n="custom.my-tool.title">내 도구</h3>
  <button id="myToolBtn" class="btn btn-primary">실행</button>
  <div id="myToolResult"></div>
</div>
```

### main.js

글로벌 함수를 자유롭게 사용할 수 있습니다:

| 함수 | 설명 |
|------|------|
| `showToast(message, type)` | 토스트 알림 (`"success"`, `"error"`, `"info"`) |
| `t(key)` | 다국어 번역 |
| `i18nReady(fn)` | i18n 로드 완료 후 콜백 |
| `escapeHtml(text)` | HTML 이스케이프 |
| `switchTab(tabName)` | 탭 전환 |

```javascript
(function () {
  var btn = document.getElementById("myToolBtn");
  btn.addEventListener("click", function () {
    showToast(t("custom.my-tool.done"), "success");
  });
})();
```

### CSS 스코핑

스타일 충돌을 방지하려면 `.custom-plugin[data-plugin="my-tool"]` 접두사를 사용하세요:

```css
.custom-plugin[data-plugin="my-tool"] .my-class {
  color: red;
}
```

---

## 서버 사이드 (routes.py)

`routes.py`는 `has_routes: true`일 때만 로드됩니다.

### 핸들러 인터페이스

```python
def handle_get(sub_path, handler, get_conn):
    """
    sub_path: /api/custom/{id}/ 이후의 경로
    handler: HTTP 핸들러 (응답 메서드 사용)
    get_conn: SQLite 연결 함수
    """
    if sub_path == "items":
        conn = get_conn()
        rows = conn.execute("SELECT * FROM custom_my_tool_data").fetchall()
        conn.close()
        handler._send_json({"ok": True, "items": [dict(r) for r in rows]})
        return
    handler._send_json({"ok": False, "error": "not found"}, status=404)

def handle_post(sub_path, handler, get_conn):
    body = handler._read_body()  # JSON 파싱된 문자열
    data = json.loads(body) if isinstance(body, str) else body
    ...

def handle_put(sub_path, handler, get_conn):
    ...

def handle_delete(sub_path, handler, get_conn):
    ...
```

### handler 응답 메서드

| 메서드 | 설명 |
|--------|------|
| `handler._send_json(data, status=200)` | JSON 응답 |
| `handler._send_text(text, content_type="text/plain")` | 텍스트/HTML 응답 |
| `handler._read_body()` | 요청 본문 읽기 |

### API 경로

플러그인 API는 `/api/custom/{plugin_id}/` 아래에 매핑됩니다:

```
GET  /api/custom/my-tool/items     → handle_get("items", ...)
POST /api/custom/my-tool/items     → handle_post("items", ...)
DELETE /api/custom/my-tool/items/3 → handle_delete("items/3", ...)
```

---

## 다국어 (i18n)

`lang/` 디렉토리에 JSON 파일을 추가하면 자동으로 `custom.{id}.{key}` 형태로 등록됩니다.

**lang/ko.json:**
```json
{
  "title": "내 도구",
  "done": "완료되었습니다."
}
```

**사용:**
```javascript
t("custom.my-tool.title")  // → "내 도구"
t("custom.my-tool.done")   // → "완료되었습니다."
```

```html
<h3 data-i18n="custom.my-tool.title">내 도구</h3>
```

---

## 활성화 / 비활성화

DEV > 플러그인 섹션에서 토글 스위치로 활성화/비활성화할 수 있습니다.
비활성화된 플러그인은 사이드바에 표시되지 않습니다.
변경 후 **페이지 새로고침**이 필요합니다.

---

## 주의사항

- 플러그인 추가/삭제 후 **서버 재시작**이 필요합니다.
- DB 테이블명은 반드시 `custom_` 접두사를 사용하세요.
- CSS는 스코핑 접두사를 사용하여 기존 스타일과 충돌을 방지하세요.
- `custom/` 디렉토리는 `.gitignore`에 포함되어 있어 Git에 push되지 않습니다.
