# AI 검수 기능 설계 스펙

## 개요

마크다운 에디터에 AI 기반 맞춤법/오탈자/문체 검수 기능을 추가한다.
PDF 내보내기 옆에 분할 버튼(split button)을 배치하고, 검수 결과를 아코디언 패널에 테이블로 표시하여 사용자가 개별 또는 일괄로 수정을 적용할 수 있게 한다.

## 요구사항

- 모델: gpt-5-nano (기존 번역 기능과 동일)
- 기본 검수: 맞춤법/오탈자
- 선택 검수: 문체/가독성 (드롭다운 옵션)
- 언어 감지: 자동 (한/영/일 혼합 텍스트 대응)
- 마크다운 구문은 검수 대상에서 제외
- 결과 테이블 컬럼: 줄번호, 수정전, 수정후, 수정이유
- 개별 적용 버튼 (행 단위) + 모두 적용 버튼
- 적용된 행은 시각적으로 비활성화

## UI 설계

### 분할 버튼 (Split Button)

PDF 내보내기 옆에 별도 `toolbar-group`으로 위치 (`position: relative` 필요). 두 영역으로 구성:

```
[ AI 검수 | ▾ ]
```

- **왼쪽 영역 클릭**: 현재 옵션으로 즉시 검수 실행
- **▾ 영역 클릭**: 드롭다운 메뉴 토글
  - `☐ 문체/가독성 포함` 체크박스
  - (향후 옵션 추가 가능)
- 드롭다운 외부 클릭 시 자동 닫힘

### 결과 패널 (아코디언)

위치: 툴바(`</section>` line 425) 직후, 저장 목록 패널(`<section>` line 427) 직전.

**접힌 상태** (기본):
```
▶ AI 검수 결과 (N건)                    [모두 적용]
```

**펼친 상태**:
```
▼ AI 검수 결과 (N건)                    [모두 적용]
┌──────┬────────────┬────────────┬────────────┬──────┐
│  줄  │   수정전   │   수정후   │  수정이유  │ 적용 │
├──────┼────────────┼────────────┼────────────┼──────┤
│   3  │ 됬다       │ 됐다       │ 맞춤법     │ [적용]│
│  11  │ 되요       │ 돼요       │ 맞춤법     │ [적용]│
│  25  │ 이 기능... │ 이 기능... │ 문장이 길음│ [적용]│
└──────┴────────────┴────────────┴────────────┴──────┘
```

- 검수 완료 시 자동으로 펼쳐짐
- 수정 사항 없으면 "수정 사항이 없습니다" 메시지
- 적용된 행: 취소선 + opacity 0.5 + 버튼 비활성화
- 아코디언 헤더 클릭으로 접기/펼치기 토글

### 글자 수 표시

기존 `mdStatus` 영역에 실시간 글자 수 표시. 에디터 입력 시 debounce로 업데이트.
- 기본: `1,234자`
- 50,000자 초과 시: `52,100자 (제한 초과)` + 빨간색 강조

## 백엔드 설계

### 엔드포인트

`POST /api/md/proofread`

### 요청

```json
{
  "text": "마크다운 전문 (에디터 내용 그대로)",
  "includeStyle": false
}
```

### 서버 처리 흐름

1. `OPENAI_API_KEY` 확인
2. 에디터 텍스트를 줄번호 포함 형태로 변환 (예: `1: # 제목`, `2: 본문...`)
3. `includeStyle` 값에 따라 프롬프트 분기
4. 텍스트 길이 검증 (50,000자 초과 시 에러 반환)
5. 코드 블록(```...```) 내부를 플레이스홀더로 치환하여 검수 대상에서 제외
6. gpt-5-nano 호출 (OpenAI `responses.create`)
7. AI 응답을 `json.loads()`로 파싱. 실패 시 `{"ok": false, "error": "AI 응답 파싱 실패"}` 반환

### AI 프롬프트

```
You are a proofreader for documents written in Korean, English, and Japanese.

The user will provide numbered lines of text extracted from a Markdown document.
Markdown syntax (headers, links, code blocks, etc.) should NOT be corrected.

Review ONLY the natural language text for:
- Spelling errors and typos
{includeStyle인 경우: - Style and readability issues (awkward phrasing, overly long sentences, unclear subjects)}

Return a JSON array of corrections. Each item:
{
  "line": <line number>,
  "before": "<original text fragment>",
  "after": "<corrected text fragment>",
  "reason": "<brief reason in the document's language>"
}

If no corrections are needed, return an empty array: []
Return ONLY the JSON array, no other text.
```

### 응답

```json
{
  "ok": true,
  "items": [
    { "line": 3, "before": "됬다", "after": "됐다", "reason": "맞춤법" },
    { "line": 11, "before": "되요", "after": "돼요", "reason": "맞춤법" }
  ]
}
```

에러 시:
```json
{
  "ok": false,
  "error": "OPENAI_API_KEY가 .env에 설정되지 않았습니다."
}
```

## 프론트엔드 설계

### 검수 실행 흐름

1. "AI 검수" 클릭 → 버튼 비활성화 + 로딩 텍스트 ("검수 중...")
2. `mdInput.value`를 `/api/md/proofread`로 POST
3. 응답 수신 → 결과 패널 렌더링 + 아코디언 펼침
4. 버튼 복원

### 개별 적용

1. "적용" 버튼 클릭
2. 에디터에서 해당 줄번호의 텍스트를 찾음
3. 해당 줄에 `before` 텍스트가 존재하는지 검증. 없으면 "내용이 변경되어 적용할 수 없습니다" 경고 표시
4. `before` 문자열을 `after`로 치환 (`String.replace` — 첫 번째 매칭만 치환)
5. `document.execCommand("insertText")` 사용하여 undo 지원
6. 해당 행 비활성화 처리

### 모두 적용

1. 미적용 항목을 줄번호 내림차순으로 정렬 (뒤에서부터 적용하여 줄번호 밀림 방지)
2. 각 항목에 대해 개별 적용과 동일한 로직 실행
3. 완료 후 전체 행 비활성화

### HTML 구조

```html
<!-- 툴바에 추가 -->
<div class="md-proofread-split-btn" id="mdProofreadSplit">
  <button type="button" id="mdProofreadBtn">AI 검수</button>
  <button type="button" class="md-proofread-split-toggle" id="mdProofreadToggle">▾</button>
  <div class="md-proofread-split-menu" id="mdProofreadMenu" hidden>
    <label><input type="checkbox" id="mdProofreadStyle"> 문체/가독성 포함</label>
  </div>
</div>

<!-- 툴바 아래, 저장 목록 위에 추가 -->
<section class="panel md-proofread-panel" id="mdProofreadPanel" hidden>
  <div class="md-proofread-header">
    <span class="md-proofread-toggle-icon">▶</span>
    <h3>AI 검수 결과 (<span id="mdProofreadCount">0</span>건)</h3>
    <button type="button" id="mdProofreadApplyAll" class="btn-sm">모두 적용</button>
  </div>
  <div class="md-proofread-body" hidden>
    <table id="mdProofreadTable">
      <thead>
        <tr>
          <th>줄</th>
          <th>수정전</th>
          <th>수정후</th>
          <th>수정이유</th>
          <th>적용</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>
</section>
```

## 파일 변경 목록

| 파일 | 변경 내용 |
|------|-----------|
| `static/index.html` | 분할 버튼 HTML + 결과 패널 HTML 추가 |
| `static/markdown.js` | 검수 실행, 결과 렌더링, 적용 로직 추가 |
| `static/styles.css` | 분할 버튼, 드롭다운 메뉴, 결과 패널/테이블 스타일 |
| `server.py` | `POST /api/md/proofread` 엔드포인트 추가 |

## 제약사항

- 문서 길이 제한: 50,000자 초과 시 서버에서 에러 반환
- AI 응답 JSON 파싱 실패 시 에러 메시지 표시
- 코드 블록(fenced + inline) 내부는 서버 전처리로 제외
- `String.replace`는 첫 번째 매칭만 치환 — 동일 줄에 같은 오류가 2회 이상이면 재검수로 처리
- 검수 후 에디터 내용이 변경되면 적용 시 검증하여 경고 표시
