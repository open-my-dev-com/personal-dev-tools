// i18n stub — i18n.js가 뒤에 로드되므로 다른 스크립트에서 t(), i18nReady() 호출 가능하도록
(function () {
  if (!window.t) window.t = function (key) { return key; };
  if (!window.i18nReady) {
    var q = [];
    window.i18nReady = function (fn) { q.push(fn); };
    window._i18nStubQueue = q;
  }
  if (!window.i18nLang) window.i18nLang = function () { return "ko"; };
})();

// Lucide 아이콘 초기화
lucide.createIcons();

// AI Provider 드롭다운 공통 로딩
var _aiProvidersCache = null;
function loadAiProviders(selectEl, callback) {
  var $sel = $(selectEl);
  if (!$sel.length) return;
  function populate(providers) {
    $sel.empty();
    if (!providers || providers.length === 0) {
      $sel.append($("<option>").val("").text("No AI Key").prop("disabled", true));
    } else {
      providers.forEach(function (p) {
        $sel.append($("<option>").val(p.id).text(p.label));
      });
    }
    if (callback) callback(providers);
  }
  if (_aiProvidersCache) {
    populate(_aiProvidersCache);
    return;
  }
  $.getJSON("/api/ai/providers").done(function (data) {
    _aiProvidersCache = data.ok ? data.providers : [];
    populate(_aiProvidersCache);
  }).fail(function () { populate([]); });
}
function refreshAiProviders() {
  _aiProvidersCache = null;
  $(".ai-provider-select").each(function () {
    loadAiProviders(this);
  });
}

// 사이드바 접기/펼기
(function initSidebarToggle() {
  var $sidebar = $("#sidebar");
  var $toggleBtn = $("#sidebarToggle");
  var collapsed = localStorage.getItem("sidebarCollapsed") === "true";

  // 툴팁용 data-tooltip 속성 세팅
  $(".nav-btn").each(function () {
    var $label = $(this).find(".nav-label");
    if ($label.length) $(this).attr("data-tooltip", $label.text().trim());
  });

  function setSidebarState(collapse) {
    $sidebar.toggleClass("collapsed", collapse);
    localStorage.setItem("sidebarCollapsed", collapse);
    // 토글 아이콘 변경 — lucide.createIcons()가 <i>를 <svg>로 변환하므로
    // 기존 svg를 제거하고 새 <i>를 삽입한 뒤 다시 createIcons 호출
    $toggleBtn.find("svg, i").remove();
    var newIcon = document.createElement("i");
    newIcon.setAttribute("data-lucide", collapse ? "chevrons-right" : "chevrons-left");
    $toggleBtn.append(newIcon);
    lucide.createIcons({ nodes: [newIcon] });
    $toggleBtn.attr("title", collapse ? "사이드바 펼치기" : "사이드바 접기");
  }

  if (collapsed) setSidebarState(true);
  $toggleBtn.on("click", function () {
    setSidebarState(!$sidebar.hasClass("collapsed"));
  });
})();

// 네비게이션 전환
function switchTab(tabName) {
  $(".nav-btn").removeClass("active");
  $(".tab-content").removeClass("active");
  var $btn = $(".nav-btn[data-tab='" + tabName + "']");
  if ($btn.length) $btn.addClass("active");
  var $content = $(".tab-content[data-tab='" + tabName + "']");
  if ($content.length) $content.addClass("active");
  localStorage.setItem("activeTab", tabName);
}

$(document).on("click", ".nav-btn", function () {
  switchTab($(this).data("tab"));
});

// 탭 설정 적용 (개발자 모드에서 저장한 이름/순서/표시 반영)
function applyTabConfig() {
  return $.getJSON("/api/dev/tabs").then(function (data) {
    if (!data.ok) return;
    var tabs = data.tabs.sort(function (a, b) { return a.order - b.order; });
    var $nav = $(".nav");
    tabs.forEach(function (tab) {
      var $btn = $nav.find(".nav-btn[data-tab='" + tab.id + "']");
      var $content = $(".tab-content[data-tab='" + tab.id + "']");
      if (!$btn.length) return;
      var $navLabel = $btn.find(".nav-label");
      if ($navLabel.length) {
        $navLabel.text(tab.label).removeAttr("data-i18n");
        $btn.attr("data-tooltip", tab.label).removeAttr("data-i18n-tooltip");
      } else {
        $btn.text(tab.label).removeAttr("data-i18n");
      }
      $btn.css("display", tab.visible ? "" : "none");
      if ($content.length) {
        $content.css("display", tab.visible ? "" : "none");
        var $h2 = $content.find("section.panel > h2");
        if ($h2.length) {
          $h2.removeAttr("data-i18n");
          var textNode = $h2.contents().filter(function () { return this.nodeType === 3; }).first();
          if (textNode.length) textNode[0].textContent = tab.label + " ";
          else if (!$h2.find("span, button").length) $h2.text(tab.label);
        }
      }
    });
    // DOM 순서 재정렬 — DEV 버튼과 구분선 앞에 삽입
    var $divider = $nav.find(".nav-divider");
    tabs.forEach(function (tab) {
      var $btn = $nav.find(".nav-btn[data-tab='" + tab.id + "']");
      if ($btn.length && $divider.length) $divider.before($btn);
    });
  }).fail(function () { /* 서버 미실행 시 무시 */ });
}

// 마지막 선택 탭 복원 + 탭 설정 적용
applyTabConfig().then(function () {
  var savedTab = localStorage.getItem("activeTab");
  if (savedTab && $(".nav-btn[data-tab='" + savedTab + "']").length) {
    switchTab(savedTab);
  }
});

// 공용 유틸
function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// ── Toast Notification ──
var _toastConfig = { position: "bottom-right", mode: "stack", duration: 3, size: "medium" };
var _toastContainer = null;
var _toastMaxStack = 5;

function _initToastContainer() {
  if (_toastContainer) return;
  _toastContainer = $("<div>").addClass("toast-container toast-" + _toastConfig.position + " toast-size-" + _toastConfig.size)
    .appendTo("body")[0];
}

function _updateToastPosition() {
  if (!_toastContainer) return;
  _toastContainer.className = "toast-container toast-" + _toastConfig.position + " toast-size-" + _toastConfig.size;
}

function loadToastConfig() {
  $.getJSON("/api/dev/site-config").done(function (data) {
    if (data.ok && data.config && data.config.toast_config) {
      try {
        var cfg = typeof data.config.toast_config === "string"
          ? JSON.parse(data.config.toast_config) : data.config.toast_config;
        _toastConfig.position = cfg.position || "bottom-right";
        _toastConfig.mode = cfg.mode || "stack";
        _toastConfig.duration = cfg.duration || 3;
        _toastConfig.size = cfg.size || "medium";
        _updateToastPosition();
      } catch (_) {}
    }
  });
}

function showToast(message, type) {
  type = type || "info";
  _initToastContainer();
  var $container = $(_toastContainer);

  // Replace mode: remove existing toasts
  if (_toastConfig.mode === "replace") {
    $container.empty();
  }

  // Stack mode: limit max
  if (_toastConfig.mode === "stack") {
    var $existing = $container.find(".toast");
    if ($existing.length >= _toastMaxStack) {
      $existing.first().remove();
    }
  }

  var iconName = type === "success" ? "check-circle" : type === "error" ? "alert-circle" : "info";

  var $toast = $("<div>").addClass("toast toast-" + type)
    .html('<i data-lucide="' + iconName + '" class="toast-icon"></i>' +
      '<span class="toast-message">' + escapeHtml(message) + '</span>' +
      '<button class="toast-close">&times;</button>');

  $container.append($toast);
  lucide.createIcons({ nodes: [$toast.find("i")[0]] });

  // Trigger enter animation
  requestAnimationFrame(function () {
    $toast.addClass("toast-show");
  });

  // Close button
  $toast.find(".toast-close").on("click", function () {
    _dismissToast($toast[0]);
  });

  // Auto-dismiss (error = 2x duration)
  var duration = _toastConfig.duration * 1000;
  if (type === "error") duration *= 2;
  setTimeout(function () {
    _dismissToast($toast[0]);
  }, duration);
}

function _dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  var $toast = $(toast);
  $toast.addClass("toast-hide");
  $toast.on("animationend", function () {
    $toast.remove();
  });
}

// Load toast config on init
loadToastConfig();
