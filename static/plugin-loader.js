// ── Custom Plugin Loader ──
// 서버에서 플러그인 목록을 가져와 사이드바 + 탭 콘텐츠를 동적으로 생성
(function () {
  function loadPlugins() {
    fetch("/api/custom/plugins")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok || !data.plugins || data.plugins.length === 0) return;

        var enabledPlugins = data.plugins.filter(function (p) { return p.enabled; });
        if (enabledPlugins.length === 0) return;

        var nav = document.querySelector(".nav");
        var mainEl = document.querySelector(".main");
        var divider = nav.querySelector(".nav-divider");
        if (!nav || !mainEl || !divider) return;

        // 커스텀 구분선 + 라벨 삽입
        var customDivider = document.createElement("hr");
        customDivider.className = "nav-divider custom-divider";
        nav.insertBefore(customDivider, divider);

        var sectionLabel = document.createElement("span");
        sectionLabel.className = "nav-section-label";
        sectionLabel.setAttribute("data-i18n", "nav.custom_section");
        sectionLabel.textContent = t("nav.custom_section");
        nav.insertBefore(sectionLabel, divider);

        var loadPromises = [];

        enabledPlugins.forEach(function (plugin) {
          var tabId = "custom-" + plugin.id;

          // 사이드바 버튼 생성
          var btn = document.createElement("button");
          btn.className = "nav-btn";
          btn.setAttribute("data-tab", tabId);
          btn.setAttribute("data-tooltip", plugin.name);
          btn.innerHTML =
            '<i data-lucide="' + plugin.icon + '"></i>' +
            '<span class="nav-label">' + plugin.name + '</span>';
          btn.addEventListener("click", function () { switchTab(tabId); });
          nav.insertBefore(btn, divider);

          // 탭 콘텐츠 영역 생성
          var tabContent = document.createElement("div");
          tabContent.className = "tab-content";
          tabContent.setAttribute("data-tab", tabId);
          tabContent.innerHTML =
            '<section class="panel custom-plugin" data-plugin="' + plugin.id + '">' +
            '<h2>' + plugin.name + '</h2><p>Loading...</p></section>';
          mainEl.appendChild(tabContent);

          // template.html 로드
          var tplPromise = fetch("/api/custom/" + plugin.id + "/template")
            .then(function (r) { return r.ok ? r.text() : ""; })
            .then(function (html) {
              if (html) {
                var section = tabContent.querySelector("section.custom-plugin");
                section.innerHTML = '<h2>' + plugin.name + '</h2>' + html;
              }
            })
            .catch(function () { /* ignore */ });

          loadPromises.push(tplPromise);

          // CSS 로드 (선택)
          var link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = "/api/custom/" + plugin.id + "/style.css";
          link.onerror = function () { link.remove(); };
          document.head.appendChild(link);
        });

        // 모든 template 로드 후 JS를 순차 로드 + 완료 후 i18n 적용
        Promise.all(loadPromises).then(function () {
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
            script.onerror = loadNextScript; // 실패해도 다음으로
            document.body.appendChild(script);
          }
          loadNextScript();
        });
      })
      .catch(function (err) {
        console.warn("[PluginLoader] Failed to load plugins:", err);
      });
  }

  // DOM 준비 후 로드
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadPlugins);
  } else {
    loadPlugins();
  }
})();
