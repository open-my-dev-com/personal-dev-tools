"""
Example Tool — 서버 사이드 라우트 예시

핸들러 인터페이스:
  def handle_get(sub_path, handler, get_conn): ...
  def handle_post(sub_path, handler, get_conn): ...
  def handle_put(sub_path, handler, get_conn): ...
  def handle_delete(sub_path, handler, get_conn): ...

- sub_path: /api/custom/{plugin_id}/ 이후의 경로 (예: "notes", "notes/3")
- handler: HTTP 요청 핸들러 (응답 메서드 사용 가능)
  - handler._send_json(data, status=200)
  - handler._send_text(text, content_type="text/plain")
  - handler._read_body()  -> dict (JSON 파싱된 요청 본문)
- get_conn: SQLite 연결 함수 (get_conn() -> connection)
"""

import json
import re


def handle_get(sub_path, handler, get_conn):
    if sub_path == "notes":
        conn = get_conn()
        rows = conn.execute(
            "SELECT id, title, content, created_at FROM custom_example_notes ORDER BY id DESC"
        ).fetchall()
        conn.close()
        handler._send_json({"ok": True, "items": [dict(r) for r in rows]})
        return

    handler._send_json({"ok": False, "error": "not found"}, status=404)


def handle_post(sub_path, handler, get_conn):
    if sub_path == "notes":
        raw = handler._read_body()
        body = json.loads(raw) if isinstance(raw, str) else raw
        title = (body.get("title") or "").strip()
        content = (body.get("content") or "").strip()
        if not title:
            handler._send_json({"ok": False, "error": "title required"}, status=400)
            return
        conn = get_conn()
        conn.execute(
            "INSERT INTO custom_example_notes (title, content) VALUES (?, ?)",
            (title, content),
        )
        conn.commit()
        conn.close()
        handler._send_json({"ok": True})
        return

    handler._send_json({"ok": False, "error": "not found"}, status=404)


def handle_delete(sub_path, handler, get_conn):
    m = re.match(r"^notes/(\d+)$", sub_path)
    if m:
        note_id = int(m.group(1))
        conn = get_conn()
        conn.execute("DELETE FROM custom_example_notes WHERE id = ?", (note_id,))
        conn.commit()
        conn.close()
        handler._send_json({"ok": True})
        return

    handler._send_json({"ok": False, "error": "not found"}, status=404)
