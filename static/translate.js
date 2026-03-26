var $translateInput = $("#translateInput");
var $translateBtn = $("#translateBtn");
var $translateSource = $("#translateSource");
var $translateProvider = $("#translateProvider");
var $translateStatus = $("#translateStatus");
var $translateResultsWrap = $("#translateResults");
var $translateTargetChecks = $(".translate-target");
var $translateSelectAll = $("#translateSelectAll");

loadAiProviders($("#translateProvider")[0]);

function getLangLabel(code) { return t("translate." + code) || code; }

function setTranslateStatus(text, isError) {
  $translateStatus.text(text).css("color", isError ? "#bf233a" : "#65748b");
}

function syncTargetChecks() {
  var src = $translateSource.val();
  $translateTargetChecks.each(function () {
    if ($(this).val() === src) {
      $(this).prop({ checked: false, disabled: true });
    } else {
      $(this).prop("disabled", false);
    }
  });
  syncSelectAll();
}

function syncSelectAll() {
  var $enabled = $translateTargetChecks.filter(":not(:disabled)");
  var allChecked = $enabled.length > 0 && $enabled.filter(":checked").length === $enabled.length;
  var someChecked = $enabled.filter(":checked").length > 0;
  $translateSelectAll.prop({ checked: allChecked, indeterminate: !allChecked && someChecked });
}

function getSelectedTargets() {
  var targets = [];
  $translateTargetChecks.filter(":checked:not(:disabled)").each(function () {
    targets.push($(this).val());
  });
  return targets;
}

function doTranslate() {
  var text = $translateInput.val().trim();
  if (!text) {
    setTranslateStatus(t("translate.input_required"), true);
    return;
  }
  var targets = getSelectedTargets();
  if (targets.length === 0) {
    setTranslateStatus(t("translate.select_target"), true);
    return;
  }

  $translateBtn.prop("disabled", true);
  setTranslateStatus(t("translate.translating", { count: targets.length }));
  $translateResultsWrap.html("");

  var promises = targets.map(function (target) {
    return $.ajax({
      url: "/api/translate",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({ text: text, source: $translateSource.val(), target: target, provider: $translateProvider.val() }),
      dataType: "json"
    }).then(
      function (data) { return { target: target, ok: data.ok, result: data.result, error: data.error }; },
      function () { return { target: target, ok: false, error: t("translate.request_fail") }; }
    );
  });

  Promise.allSettled(promises).then(function (results) {
    var successCount = 0;
    results.forEach(function (r) {
      var data = r.status === "fulfilled" ? r.value : { target: "?", ok: false, error: t("translate.request_fail") };

      var $block = $("<div>").addClass("translate-block");

      if (data.ok) {
        successCount++;
        $block.html(
          '<div class="translate-block-header">' +
            '<span class="badge">' + getLangLabel(data.target) + '</span>' +
            '<button class="translate-copy-btn">' + t("common.copy") + '</button>' +
          '</div>' +
          '<textarea readonly rows="6">' + escapeHtml(data.result) + '</textarea>'
        );
        $block.find(".translate-copy-btn").on("click", function () {
          var $btn = $(this);
          navigator.clipboard.writeText(data.result).then(function () {
            $btn.text("OK!");
            setTimeout(function () { $btn.text(t("common.copy")); }, 1000);
            showToast(t("common.copy_done"), "success");
          });
        });
      } else {
        $block.html(
          '<div class="translate-block-header">' +
            '<span class="badge">' + getLangLabel(data.target) + '</span>' +
          '</div>' +
          '<div class="translate-error">' + escapeHtml(data.error || t("translate.fail")) + '</div>'
        );
      }
      $translateResultsWrap.append($block);
    });

    $translateBtn.prop("disabled", false);
    if (successCount === targets.length) {
      setTranslateStatus(t("translate.done", { count: successCount }));
    } else {
      setTranslateStatus(t("translate.partial", { done: successCount, total: targets.length }), true);
    }
  });
}

$translateBtn.on("click", doTranslate);
$translateSource.on("change", syncTargetChecks);
$translateSelectAll.on("change", function () {
  var checked = $translateSelectAll.prop("checked");
  $translateTargetChecks.each(function () {
    if (!$(this).prop("disabled")) $(this).prop("checked", checked);
  });
  $translateSelectAll.prop("indeterminate", false);
});
$translateTargetChecks.on("change", syncSelectAll);
syncTargetChecks();
