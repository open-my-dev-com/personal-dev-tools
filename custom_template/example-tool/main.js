// Example Tool — 커스텀 플러그인 예시
// showToast(), t() 등 글로벌 함수 사용 가능
(function () {
  var PLUGIN_ID = "example-tool";
  var API_BASE = "/api/custom/" + PLUGIN_ID;

  var $titleInput = $("#exampleNoteTitle");
  var $contentInput = $("#exampleNoteContent");
  var $saveBtn = $("#exampleNoteSaveBtn");
  var $listEl = $("#exampleNoteList");

  // 메모 목록 불러오기
  function loadNotes() {
    $.getJSON(API_BASE + "/notes").done(function (data) {
      if (!data.ok) return;
      $listEl.html("");
      if (data.items.length === 0) {
        $listEl.html('<p class="desc">' + t("custom.example-tool.empty") + '</p>');
        return;
      }
      data.items.forEach(function (note) {
        var $card = $("<div>").addClass("example-note-card")
          .html(
            '<div class="example-note-title">' + escapeHtml(note.title) + '</div>' +
            '<div class="example-note-content">' + escapeHtml(note.content || "") + '</div>' +
            '<div class="example-note-date">' + note.created_at + '</div>' +
            '<button type="button" class="btn btn-sm btn-danger" data-id="' + note.id + '">' + t("custom.example-tool.delete") + '</button>'
          );
        $card.find("button").on("click", function () {
          deleteNote(note.id);
        });
        $listEl.append($card);
      });
    }).fail(function () {
      showToast(t("custom.example-tool.load_error"), "error");
    });
  }

  // 메모 저장
  function saveNote() {
    var title = $titleInput.val().trim();
    if (!title) {
      showToast(t("custom.example-tool.title_required"), "error");
      return;
    }
    $.ajax({
      url: API_BASE + "/notes",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ title: title, content: $contentInput.val().trim() }),
      dataType: "json"
    }).done(function (data) {
      if (data.ok) {
        showToast(t("custom.example-tool.saved"), "success");
        $titleInput.val("");
        $contentInput.val("");
        loadNotes();
      } else {
        showToast(data.error || "Save failed", "error");
      }
    }).fail(function () {
      showToast(t("custom.example-tool.save_error"), "error");
    });
  }

  // 메모 삭제
  function deleteNote(id) {
    $.ajax({
      url: API_BASE + "/notes/" + id,
      method: "DELETE",
      dataType: "json"
    }).done(function (data) {
      if (data.ok) {
        showToast(t("custom.example-tool.deleted"), "success");
        loadNotes();
      }
    }).fail(function () {
      showToast(t("custom.example-tool.delete_error"), "error");
    });
  }

  // 이벤트 바인딩
  $saveBtn.on("click", saveNote);

  // 초기 로드
  i18nReady(function () {
    loadNotes();
  });
})();
