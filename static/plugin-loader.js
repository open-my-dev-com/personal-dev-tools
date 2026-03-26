// ── Custom Plugin Loader ──
// 서버에서 플러그인 목록을 가져와 사이드바 + 탭 콘텐츠를 동적으로 생성
(function () {
  function loadPlugins() {
    $.getJSON("/api/custom/plugins").done(function (data) {
      if (!data.ok || !data.plugins || data.plugins.length === 0) return;

      var enabledPlugins = data.plugins.filter(function (p) { return p.enabled; });
      if (enabledPlugins.length === 0) return;

      var $nav = $(".nav");
      var $mainEl = $(".main");
      var $divider = $nav.find(".nav-divider").first();
      if (!$nav.length || !$mainEl.length || !$divider.length) return;

      // 커스텀 구분선 + 라벨 삽입
      $("<hr>").addClass("nav-divider custom-divider").insertBefore($divider);
      $("<span>").addClass("nav-section-label")
        .attr("data-i18n", "nav.custom_section")
        .text(t("nav.custom_section"))
        .insertBefore($divider);

      var loadPromises = [];

      enabledPlugins.forEach(function (plugin) {
        var tabId = "custom-" + plugin.id;

        // 사이드바 버튼 생성
        var $btn = $("<button>").addClass("nav-btn")
          .attr({ "data-tab": tabId, "data-tooltip": plugin.name })
          .html('<i data-lucide="' + plugin.icon + '"></i>' +
            '<span class="nav-label">' + plugin.name + '</span>')
          .on("click", function () { switchTab(tabId); })
          .insertBefore($divider);

        // 탭 콘텐츠 영역 생성
        var $tabContent = $("<div>").addClass("tab-content").attr("data-tab", tabId)
          .html('<section class="panel custom-plugin" data-plugin="' + plugin.id + '">' +
            '<h2>' + plugin.name + '</h2><p>Loading...</p></section>')
          .appendTo($mainEl);

        // template.html 로드
        var tplPromise = $.ajax({
          url: "/api/custom/" + plugin.id + "/template",
          dataType: "text"
        }).then(function (html) {
          if (html) {
            $tabContent.find("section.custom-plugin")
              .html('<h2>' + plugin.name + '</h2>' + html);
          }
        }).then(null, function () { /* ignore */ });

        loadPromises.push(tplPromise);

        // CSS 로드 (선택)
        $("<link>").attr({ rel: "stylesheet", href: "/api/custom/" + plugin.id + "/style.css" })
          .on("error", function () { $(this).remove(); })
          .appendTo("head");
      });

      // 모든 template 로드 후 JS를 순차 로드 + 완료 후 i18n 적용
      $.when.apply($, loadPromises).always(function () {
        // Lucide 아이콘 재초기화 (사이드바 버튼 + template 내 아이콘)
        if (window.lucide) lucide.createIcons();

        // JS 파일을 순차적으로 로드 (onload 체이닝)
        var scriptQueue = enabledPlugins.slice();
        function loadNextScript() {
          if (scriptQueue.length === 0) {
            // 모든 JS 로드 완료 → i18n 재적용
            if (window.i18nSetLang && window.i18nLang) {
              i18nSetLang(i18nLang());
            }
            return;
          }
          var plugin = scriptQueue.shift();
          var script = document.createElement("script");
          script.src = "/api/custom/" + plugin.id + "/main.js";
          script.onload = loadNextScript;
          script.onerror = loadNextScript;
          document.body.appendChild(script);
        }
        loadNextScript();
      });
    }).fail(function (err) {
      console.warn("[PluginLoader] Failed to load plugins:", err);
    });
  }

  // DOM 준비 후 로드
  $(loadPlugins);
})();
