// Example Tool — 커스텀 플러그인 예시
// showToast(), t() 등 글로벌 함수 사용 가능
(function () {
  var PLUGIN_ID = "example-tool";
  var API_BASE = "/api/custom/" + PLUGIN_ID;

  var titleInput = document.getElementById("exampleNoteTitle");
  var contentInput = document.getElementById("exampleNoteContent");
  var saveBtn = document.getElementById("exampleNoteSaveBtn");
  var listEl = document.getElementById("exampleNoteList");

  // 메모 목록 불러오기
  function loadNotes() {
    fetch(API_BASE + "/notes")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) return;
        listEl.innerHTML = "";
        if (data.items.length === 0) {
          listEl.innerHTML = '<p class="desc">' + t("custom.example-tool.empty") + '</p>';
          return;
        }
        data.items.forEach(function (note) {
          var card = document.createElement("div");
          card.className = "example-note-card";
          card.innerHTML =
            '<div class="example-note-title">' + escapeHtml(note.title) + '</div>' +
            '<div class="example-note-content">' + escapeHtml(note.content || "") + '</div>' +
            '<div class="example-note-date">' + note.created_at + '</div>' +
            '<button type="button" class="btn btn-sm btn-danger" data-id="' + note.id + '">' + t("custom.example-tool.delete") + '</button>';
          card.querySelector("button").addEventListener("click", function () {
            deleteNote(note.id);
          });
          listEl.appendChild(card);
        });
      })
      .catch(function () {
        showToast(t("custom.example-tool.load_error"), "error");
      });
  }

  // 메모 저장
  function saveNote() {
    var title = titleInput.value.trim();
    if (!title) {
      showToast(t("custom.example-tool.title_required"), "error");
      return;
    }
    fetch(API_BASE + "/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title, content: contentInput.value.trim() })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          showToast(t("custom.example-tool.saved"), "success");
          titleInput.value = "";
          contentInput.value = "";
          loadNotes();
        } else {
          showToast(data.error || "Save failed", "error");
        }
      })
      .catch(function () {
        showToast(t("custom.example-tool.save_error"), "error");
      });
  }

  // 메모 삭제
  function deleteNote(id) {
    fetch(API_BASE + "/notes/" + id, { method: "DELETE" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          showToast(t("custom.example-tool.deleted"), "success");
          loadNotes();
        }
      })
      .catch(function () {
        showToast(t("custom.example-tool.delete_error"), "error");
      });
  }

  // 이벤트 바인딩
  if (saveBtn) saveBtn.addEventListener("click", saveNote);

  // 초기 로드
  i18nReady(function () {
    loadNotes();
  });
})();
