# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

개인 개발 도구 모음 웹 앱. Python 단일 서버 + 순수 바닐라 JavaScript 프론트엔드. 빌드 도구 없음.

## Commands

```bash
# 서버 실행 (기본 http://127.0.0.1:8080, 브라우저 자동 오픈)
python3 server.py
python3 server.py --port 9090      # 포트 변경
python3 server.py --no-open        # 브라우저 자동 오픈 비활성화

# macOS/Linux 원클릭 실행
./start.sh

# windows 원클릭 실행
./start.bat

# 테스트/빌드 시스템 없음 - 서버 실행 후 브라우저에서 직접 확인
```

## Architecture

### Backend: `server.py` (단일 파일)
- `ThreadingHTTPServer` + `MockHandler(BaseHTTPRequestHandler)` 기반
- SQLite DB (`dev-tool.db`) - 자동 마이그레이션, 스키마 관리
- 핵심 헬퍼: `_read_body()`, `_send_json(payload, status)`, `_send_text(text, content_type)`
- AI 프로바이더 추상화: `_ai_chat(provider, system_prompt, user_prompt, model=None)` - OpenAI/Gemini/Claude/Grok 지원
- 누락 패키지 자동 설치 (`cryptography`, `openai`, `anthropic`, `google-genai` 등)

### Frontend: `static/` (빌드 없는 바닐라 JS)
- **`index.html`** - 메인 SPA, 14개+ 도구 탭이 모두 포함된 단일 HTML
- **`app.js`** - 공통 로직: 사이드바 토글, 탭 전환, 토스트 시스템, AI 프로바이더 로딩
- **`i18n.js`** - 다국어(ko/en/ja) 관리, `t(key)` 함수로 번역
- **`plugin-loader.js`** - 커스텀 플러그인 동적 로딩
- **각 도구별 JS 파일** - IIFE 패턴 (`(function() { ... })()`)으로 모듈 분리

### API 라우트 패턴
```
/api/[tool-name]/...       - 도구별 엔드포인트
/api/custom/[id]/...       - 커스텀 플러그인 엔드포인트
/api/dev/...               - 개발 모드 설정
/api/lang/[code]           - i18n 번역 데이터
/api/ai/...                - AI 프로바이더 엔드포인트
```

### 커스텀 플러그인 시스템 (`custom/`, `custom_template/`)
- `custom/` 디렉터리에서 자동 디스커버리 (`manifest.json` 필수)
- 플러그인 구조: `manifest.json`, `template.html`, `main.js`, `style.css`, `routes.py`, `lang/`
- 플러그인 라우트 핸들러: `handle_get(sub_path, handler, get_conn)` 등
- 플러그인 i18n 키 패턴: `custom.{plugin-id}.{key}`

## Key Patterns

### 프론트엔드 전역 함수
```javascript
showToast(message, type)   // "success" | "error" | "info"
t(key, params)             // i18n 번역 (예: t("common.save"))
i18nReady(fn)              // 번역 로드 완료 후 콜백
escapeHtml(text)           // HTML 이스케이프
switchTab(tabName)         // 탭 전환
```

### i18n HTML 속성
- `data-i18n="key"` → textContent
- `data-i18n-placeholder="key"` → placeholder
- `data-i18n-title="key"` → title
- `data-i18n-html="key"` → innerHTML


## Development Notes

- 모든 UI 텍스트는 i18n 키를 사용해야 함 (`static/lang/ko.json`, `en.json`, `ja.json` 동시 수정)
- 새 도구 추가 시: `index.html`에 탭 HTML + 별도 JS 파일(IIFE) + `server.py`에 API 라우트 + i18n 키 등록
- CDN 라이브러리는 `server.py`의 `CDN_LIBS` 리스트에서 관리, `static/vendor/`에 캐시 (gitignored)
- 커밋 메시지 컨벤션: `[Feature]`, `Fix`, `Merge pull request` 형식
