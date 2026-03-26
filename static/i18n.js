// ── i18n (국제화) ──
(function () {
  var _lang = "ko";
  var _dict = {};
  var _ready = false;
  var _queue = [];

  // 현재 언어 반환
  window.i18nLang = function () { return _lang; };

  // 번역 함수: t("key") 또는 t("key", {count: 3})
  window.t = function (key, params) {
    var s = _dict[key];
    if (s === undefined) return key; // fallback: key 그대로
    if (params) {
      Object.keys(params).forEach(function (k) {
        s = s.replace(new RegExp("\\{" + k + "\\}", "g"), params[k]);
      });
    }
    return s;
  };

  // HTML 요소에 번역 적용
  function applyDOM() {
    $("[data-i18n]").each(function () {
      var key = $(this).attr("data-i18n");
      var val = t(key);
      if (val !== key) $(this).text(val);
    });
    $("[data-i18n-placeholder]").each(function () {
      var key = $(this).attr("data-i18n-placeholder");
      var val = t(key);
      if (val !== key) $(this).attr("placeholder", val);
    });
    $("[data-i18n-title]").each(function () {
      var key = $(this).attr("data-i18n-title");
      var val = t(key);
      if (val !== key) $(this).attr("title", val);
    });
    $("[data-i18n-html]").each(function () {
      var key = $(this).attr("data-i18n-html");
      var val = t(key);
      if (val !== key) $(this).html(val);
    });
    // data-tooltip (sidebar)
    $("[data-i18n-tooltip]").each(function () {
      var key = $(this).attr("data-i18n-tooltip");
      var val = t(key);
      if (val !== key) $(this).attr("data-tooltip", val);
    });
    // <title>
    var $title = $("title[data-i18n]");
    if ($title.length) {
      var val = t($title.attr("data-i18n"));
      if (val !== $title.attr("data-i18n")) document.title = val;
    }
  }

  // 언어 로드
  function loadLang(code, cb) {
    $.getJSON("/api/lang/" + code).done(function (data) {
      if (data.ok && data.translations) {
        _dict = data.translations;
        _lang = code;
        applyDOM();
      }
      if (cb) cb();
    }).fail(function () {
      if (cb) cb();
    });
  }

  // 언어 변경 (외부에서 호출)
  window.i18nSetLang = function (code) {
    loadLang(code, function () {
      // 커스텀 이벤트 발행 (JS에서 동적 텍스트 갱신용)
      $(window).trigger("langchange", { lang: code });
    });
  };

  // 초기화: 서버에서 현재 언어 설정 조회 후 로드
  function init() {
    $.getJSON("/api/dev/site-config").done(function (data) {
      var lang = "ko";
      if (data.ok && data.config && data.config.lang) {
        lang = data.config.lang;
      }
      loadLang(lang, function () {
        _ready = true;
        _queue.forEach(function (fn) { fn(); });
        _queue = [];
      });
    }).fail(function () {
      loadLang("ko", function () {
        _ready = true;
      });
    });
  }

  // app.js stub에서 등록된 콜백 병합
  if (window._i18nStubQueue) {
    _queue = _queue.concat(window._i18nStubQueue);
    delete window._i18nStubQueue;
  }

  // 준비 완료 후 콜백
  window.i18nReady = function (fn) {
    if (_ready) fn();
    else _queue.push(fn);
  };

  // DOM 로드 후 초기화
  $(init);
})();
