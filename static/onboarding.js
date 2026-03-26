// ── Onboarding Wizard ──
(function () {
  "use strict";

  var currentStep = 0;
  var selectedLang = "";
  var tabsData = [];
  var $overlay = null;

  // ── Check onboarding status ──
  function checkOnboarding() {
    $.getJSON("/api/dev/onboarding").done(function (data) {
      if (data.ok && !data.completed) {
        showWizard();
      }
    }).fail(function () { /* server unreachable */ });
  }

  // ── Create overlay ──
  function showWizard() {
    $overlay = $("<div>").attr("id", "onboardingOverlay").addClass("onboarding-overlay");
    $overlay.html(
      '<div class="onboarding-wizard">' +
        '<div class="onboarding-progress" id="onboardingProgress"></div>' +
        '<div class="onboarding-body" id="onboardingBody"></div>' +
        '<div class="onboarding-footer" id="onboardingFooter"></div>' +
      '</div>'
    );
    $("body").append($overlay);
    renderStep(0);
  }

  var TOTAL_STEPS = 4;

  // ── Progress dots ──
  function updateProgress(step) {
    var html = "";
    for (var i = 0; i < TOTAL_STEPS; i++) {
      var cls = "onboarding-step-dot";
      if (i < step) cls += " done";
      else if (i === step) cls += " active";
      html += '<div class="' + cls + '"></div>';
    }
    $("#onboardingProgress").html(html);
  }

  // ── Step router ──
  function renderStep(step) {
    currentStep = step;
    updateProgress(step);
    var $body = $("#onboardingBody");
    var $footer = $("#onboardingFooter");
    if (step === 0) renderWelcome($body, $footer);
    else if (step === 1) renderTabs($body, $footer);
    else if (step === 2) renderApiKeys($body, $footer);
    else if (step === 3) renderComplete($body, $footer);
  }

  // ── Step 1: Welcome + Language ──
  var WELCOME_TEXT = {
    ko: { title: "Personal Dev Tools에 오신 것을 환영합니다", desc: "간단한 초기 설정을 시작합니다.<br>아래에서 언어를 선택하세요.", next: "다음" },
    en: { title: "Welcome to Personal Dev Tools", desc: "Let's get started with a quick setup.<br>Choose your language below.", next: "Next" },
    ja: { title: "Personal Dev Toolsへようこそ", desc: "簡単な初期設定を始めましょう。<br>下から言語を選択してください。", next: "次へ" }
  };

  function renderWelcome($body, $footer) {
    var lang = selectedLang || "en";
    var txt = WELCOME_TEXT[lang] || WELCOME_TEXT.en;
    $body.html(
      '<div class="onboarding-welcome-icon"><i data-lucide="wrench"></i></div>' +
      '<h2 id="onboardingTitle">' + txt.title + '</h2>' +
      '<p id="onboardingDesc" style="color:var(--muted);line-height:1.6;margin-bottom:20px">' + txt.desc + '</p>' +
      '<div class="onboarding-lang-options">' +
        '<button class="onboarding-lang-btn" data-lang="ko"><b>한국어</b></button>' +
        '<button class="onboarding-lang-btn" data-lang="en"><b>English</b></button>' +
        '<button class="onboarding-lang-btn" data-lang="ja"><b>日本語</b></button>' +
      '</div>'
    );
    initLucideInOverlay();
    var $btns = $body.find(".onboarding-lang-btn");
    $btns.each(function () {
      var $btn = $(this);
      if ($btn.data("lang") === lang) $btn.addClass("selected");
      $btn.on("click", function () {
        $btns.removeClass("selected");
        $btn.addClass("selected");
        selectedLang = $btn.data("lang");
        // Update wizard text only
        var t = WELCOME_TEXT[selectedLang] || WELCOME_TEXT.en;
        $("#onboardingTitle").text(t.title);
        $("#onboardingDesc").html(t.desc);
        $("#onboardingNext1").text(t.next + " →");
      });
    });
    $footer.html(
      '<div></div>' +
      '<button class="onboarding-btn-primary" id="onboardingNext1">' + txt.next + ' &rarr;</button>'
    );
    $("#onboardingNext1").on("click", function () {
      // Save language + apply i18n on proceed
      if (selectedLang && selectedLang !== i18nLang()) {
        i18nSetLang(selectedLang);
        $.ajax({
          url: "/api/dev/site-config",
          method: "PUT",
          contentType: "application/json",
          data: JSON.stringify({ lang: selectedLang }),
          dataType: "json"
        }).always(function () {
          setTimeout(function () { renderStep(1); }, 300);
        });
      } else {
        renderStep(1);
      }
    });
  }

  // ── Step 2: Tabs ──
  function renderTabs($body, $footer) {
    $body.html(
      '<h2>' + t("onboarding.tabs_title") + '</h2>' +
      '<p>' + t("onboarding.tabs_desc") + '</p>' +
      '<div class="onboarding-tabs-list" id="onboardingTabsList">' +
        '<div style="text-align:center;color:var(--muted);">Loading...</div>' +
      '</div>'
    );
    $footer.html(
      '<button id="onboardingBack2">' + t("onboarding.btn_back") + '</button>' +
      '<div>' +
        '<button id="onboardingSkip2" style="margin-right:8px">' + t("onboarding.btn_skip") + '</button>' +
        '<button class="onboarding-btn-primary" id="onboardingNext2">' + t("onboarding.btn_next") + ' &rarr;</button>' +
      '</div>'
    );
    $("#onboardingBack2").on("click", function () { renderStep(0); });
    $("#onboardingSkip2").on("click", function () { renderStep(2); });
    $("#onboardingNext2").on("click", saveTabs);

    loadTabs();
  }

  // tab.id → i18n nav key
  var TAB_I18N = {
    mock: "nav.mock", charcount: "nav.charcount", mybatis: "nav.mybatis",
    jsonformat: "nav.json", translate: "nav.translate", csv: "nav.csv",
    markdown: "nav.markdown", paramchanger: "nav.param", pdfconvert: "nav.pdf",
    diffcompare: "nav.diff", git: "nav.git", dataai: "nav.dataai"
  };

  function loadTabs() {
    $.getJSON("/api/dev/tabs").done(function (data) {
      if (!data.ok) return;
      tabsData = data.tabs.sort(function (a, b) { return a.order - b.order; });
      var $list = $("#onboardingTabsList");
      $list.html("");
      tabsData.forEach(function (tab) {
        var i18nKey = TAB_I18N[tab.id];
        var label = i18nKey ? t(i18nKey) : tab.label;
        if (label === i18nKey) label = tab.label; // fallback if key not translated
        var $item = $("<div>").addClass("onboarding-tab-item");
        $item.html(
          '<input type="checkbox" data-id="' + tab.id + '"' + (tab.visible ? ' checked' : '') + '>' +
          '<label>' + escOnb(label) + '</label>'
        );
        $list.append($item);
      });
    }).fail(function () { /* ignore */ });
  }

  function saveTabs() {
    $("#onboardingTabsList input[type=checkbox]").each(function () {
      var $cb = $(this);
      var tab = tabsData.find(function (t) { return t.id === $cb.data("id"); });
      if (tab) tab.visible = $cb.prop("checked");
    });
    $.ajax({
      url: "/api/dev/tabs",
      method: "PUT",
      contentType: "application/json",
      data: JSON.stringify({ tabs: tabsData }),
      dataType: "json"
    }).always(function () {
      // Refresh sidebar
      if (typeof applyTabConfig === "function") applyTabConfig();
      renderStep(2);
    });
  }

  // ── Step 3: API Keys (skippable) ──
  var API_KEY_META = {
    openai:  { label: "OpenAI",  placeholder: "sk-..." },
    gemini:  { label: "Gemini",  placeholder: "AIza..." },
    claude:  { label: "Claude",  placeholder: "sk-ant-..." },
    grok:    { label: "Grok",    placeholder: "xai-..." },
  };

  function renderApiKeys($body, $footer) {
    var html = '<h2>' + t("onboarding.apikeys_title") + '</h2>' +
      '<p>' + t("onboarding.apikeys_desc") + '</p>' +
      '<div class="onboarding-apikeys-list">';
    for (var pid in API_KEY_META) {
      var meta = API_KEY_META[pid];
      html += '<label class="onboarding-apikey-field">' +
        '<span>' + meta.label + '</span>' +
        '<input type="password" class="onboarding-apikey-input" data-provider="' + pid + '" placeholder="' + meta.placeholder + '" autocomplete="off">' +
        '</label>';
    }
    html += '</div>';
    $body.html(html);
    $footer.html(
      '<button id="onboardingBack3">' + t("onboarding.btn_back") + '</button>' +
      '<div>' +
        '<button id="onboardingSkip3" style="margin-right:8px">' + t("onboarding.btn_skip") + '</button>' +
        '<button class="onboarding-btn-primary" id="onboardingNext3">' + t("onboarding.btn_next") + ' &rarr;</button>' +
      '</div>'
    );
    $("#onboardingBack3").on("click", function () { renderStep(1); });
    $("#onboardingSkip3").on("click", function () { renderStep(3); });
    $("#onboardingNext3").on("click", saveApiKeys);
  }

  function saveApiKeys() {
    var keys = {};
    $(".onboarding-apikey-input").each(function () {
      var $input = $(this);
      var val = $input.val().trim();
      if (val) keys[$input.data("provider")] = val;
    });
    if (Object.keys(keys).length > 0) {
      $.ajax({
        url: "/api/dev/ai-keys",
        method: "PUT",
        contentType: "application/json",
        data: JSON.stringify({ keys: keys }),
        dataType: "json"
      }).always(function () {
        // Refresh provider dropdowns
        if (typeof refreshAiProviders === "function") refreshAiProviders();
        renderStep(3);
      });
    } else {
      renderStep(3);
    }
  }

  // ── Step 4: Complete ──
  function renderComplete($body, $footer) {
    $body.html(
      '<div class="onboarding-complete-icon"><i data-lucide="check-circle"></i></div>' +
      '<h2>' + t("onboarding.complete_title") + '</h2>' +
      '<p>' + t("onboarding.complete_desc") + '</p>'
    );
    initLucideInOverlay();
    $footer.html(
      '<button id="onboardingTutorial">' + t("onboarding.btn_tutorial") + '</button>' +
      '<button class="onboarding-btn-primary" id="onboardingFinish">' + t("onboarding.btn_finish") + '</button>'
    );
    $("#onboardingTutorial").on("click", function () {
      completeOnboarding(function () {
        switchTab("tutorial");
      });
    });
    $("#onboardingFinish").on("click", function () {
      completeOnboarding();
    });
  }

  function completeOnboarding(callback) {
    $.ajax({
      url: "/api/dev/onboarding/complete",
      method: "POST",
      dataType: "json"
    }).always(function () {
      if ($overlay) $overlay.remove();
      $overlay = null;
      if (typeof callback === "function") callback();
    });
  }

  // ── Utils ──
  function escOnb(s) {
    return $("<div>").text(s).html();
  }

  function initLucideInOverlay() {
    if (typeof lucide !== "undefined" && $overlay) {
      lucide.createIcons({ nodes: $overlay.find("[data-lucide]").toArray() });
    }
  }

  // ── Init ──
  i18nReady(function () {
    checkOnboarding();
  });
})();
