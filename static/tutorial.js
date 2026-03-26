// ── Tutorial Page ──
(function () {
  "use strict";

  var cardsEl = document.getElementById("tutorialCards");
  var pluginCardsEl = document.getElementById("tutorialPluginCards");
  var detailEl = document.getElementById("tutorialDetail");
  var detailContent = document.getElementById("tutorialDetailContent");
  var backBtn = document.getElementById("tutorialBackBtn");
  if (!cardsEl) return;

  var PLUGINS = [
    { id: "plugin-system", icon: "puzzle", titleKey: "tutorial.plugin_title", descKey: "tutorial.plugin_desc", guideKey: "tutorial.plugin_guide" },
  ];

  var TOOLS = [
    { id: "mock",         icon: "server",           titleKey: "tutorial.mock_title",      descKey: "tutorial.mock_desc",      guideKey: "tutorial.mock_guide" },
    { id: "charcount",    icon: "text-cursor-input", titleKey: "tutorial.charcount_title", descKey: "tutorial.charcount_desc", guideKey: "tutorial.charcount_guide" },
    { id: "mybatis",      icon: "scroll-text",      titleKey: "tutorial.mybatis_title",    descKey: "tutorial.mybatis_desc",   guideKey: "tutorial.mybatis_guide" },
    { id: "jsonformat",   icon: "braces",           titleKey: "tutorial.json_title",       descKey: "tutorial.json_desc",      guideKey: "tutorial.jsonformat_guide" },
    { id: "translate",    icon: "languages",        titleKey: "tutorial.translate_title",   descKey: "tutorial.translate_desc", guideKey: "tutorial.translate_guide" },
    { id: "csv",          icon: "table",            titleKey: "tutorial.csv_title",         descKey: "tutorial.csv_desc",       guideKey: "tutorial.csv_guide" },
    { id: "markdown",     icon: "file-pen",         titleKey: "tutorial.md_title",          descKey: "tutorial.md_desc",        guideKey: "tutorial.markdown_guide" },
    { id: "paramchanger", icon: "arrow-left-right", titleKey: "tutorial.param_title",       descKey: "tutorial.param_desc",     guideKey: "tutorial.paramchanger_guide" },
    { id: "pdfconvert",   icon: "file-text",        titleKey: "tutorial.pdf_title",         descKey: "tutorial.pdf_desc",       guideKey: "tutorial.pdfconvert_guide" },
    { id: "diffcompare",  icon: "git-compare",      titleKey: "tutorial.diff_title",        descKey: "tutorial.diff_desc",      guideKey: "tutorial.diffcompare_guide" },
    { id: "git",          icon: "git-branch",       titleKey: "tutorial.git_title",         descKey: "tutorial.git_desc",       guideKey: "tutorial.git_guide" },
    { id: "dataai",       icon: "sparkles",         titleKey: "tutorial.dataai_title",      descKey: "tutorial.dataai_desc",    guideKey: "tutorial.dataai_guide" },
  ];

  var ALL_ITEMS = TOOLS.concat(PLUGINS);

  function renderCards() {
    var html = "";
    TOOLS.forEach(function (tool) {
      html +=
        '<div class="tutorial-card" data-tool="' + tool.id + '">' +
          '<div class="tutorial-card-icon"><i data-lucide="' + tool.icon + '"></i></div>' +
          '<h4>' + t(tool.titleKey) + '</h4>' +
          '<p>' + t(tool.descKey) + '</p>' +
        '</div>';
    });
    cardsEl.innerHTML = html;
    lucide.createIcons({ nodes: cardsEl.querySelectorAll("[data-lucide]") });

    cardsEl.querySelectorAll(".tutorial-card").forEach(function (card) {
      card.addEventListener("click", function () {
        showDetail(card.dataset.tool);
      });
    });

    // 플러그인 카드
    if (pluginCardsEl) {
      var pHtml = "";
      PLUGINS.forEach(function (p) {
        pHtml +=
          '<div class="tutorial-card" data-tool="' + p.id + '">' +
            '<div class="tutorial-card-icon"><i data-lucide="' + p.icon + '"></i></div>' +
            '<h4>' + t(p.titleKey) + '</h4>' +
            '<p>' + t(p.descKey) + '</p>' +
          '</div>';
      });
      pluginCardsEl.innerHTML = pHtml;
      lucide.createIcons({ nodes: pluginCardsEl.querySelectorAll("[data-lucide]") });

      pluginCardsEl.querySelectorAll(".tutorial-card").forEach(function (card) {
        card.addEventListener("click", function () {
          showDetail(card.dataset.tool);
        });
      });
    }
  }

  function showDetail(toolId) {
    var tool = ALL_ITEMS.find(function (t) { return t.id === toolId; });
    if (!tool) return;

    cardsEl.style.display = "none";
    if (pluginCardsEl) pluginCardsEl.style.display = "none";
    document.querySelectorAll(".tutorial-section-title").forEach(function (el) { el.style.display = "none"; });
    detailEl.style.display = "block";

    var guideHtml = t(tool.guideKey);
    // If guide key returned as-is (not translated), show fallback
    if (guideHtml === tool.guideKey) guideHtml = "<p>" + t(tool.descKey) + "</p>";

    var isTool = TOOLS.some(function (t) { return t.id === toolId; });
    detailContent.innerHTML =
      '<div class="tutorial-detail-header">' +
        '<div class="tutorial-detail-icon"><i data-lucide="' + tool.icon + '"></i></div>' +
        '<div>' +
          '<h3>' + t(tool.titleKey) + '</h3>' +
          '<p class="desc">' + t(tool.descKey) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="tutorial-guide">' + guideHtml + '</div>' +
      (isTool ? '<button class="tutorial-try-btn" data-tab="' + tool.id + '">' + t("tutorial.try_it") + ' &rarr;</button>' : '');

    lucide.createIcons({ nodes: detailContent.querySelectorAll("[data-lucide]") });

    var tryBtn = detailContent.querySelector(".tutorial-try-btn");
    if (tryBtn) {
      tryBtn.addEventListener("click", function () {
        switchTab(this.dataset.tab);
      });
    }
  }

  function showCards() {
    detailEl.style.display = "none";
    cardsEl.style.display = "";
    if (pluginCardsEl) pluginCardsEl.style.display = "";
    document.querySelectorAll(".tutorial-section-title").forEach(function (el) { el.style.display = ""; });
  }

  backBtn.addEventListener("click", showCards);

  i18nReady(renderCards);
  window.addEventListener("langchange", function () {
    renderCards();
    showCards();
  });
})();
