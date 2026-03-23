// ── Onboarding Wizard ──
(function () {
  "use strict";

  var currentStep = 0;
  var selectedLang = "";
  var tabsData = [];
  var overlay = null;

  // ── Check onboarding status ──
  async function checkOnboarding() {
    try {
      var res = await fetch("/api/dev/onboarding");
      var data = await res.json();
      if (data.ok && !data.completed) {
        showWizard();
      }
    } catch (_) { /* server unreachable */ }
  }

  // ── Create overlay ──
  function showWizard() {
    overlay = document.createElement("div");
    overlay.id = "onboardingOverlay";
    overlay.className = "onboarding-overlay";
    overlay.innerHTML =
      '<div class="onboarding-wizard">' +
        '<div class="onboarding-progress" id="onboardingProgress"></div>' +
        '<div class="onboarding-body" id="onboardingBody"></div>' +
        '<div class="onboarding-footer" id="onboardingFooter"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    renderStep(0);
  }

  // ── Progress dots ──
  function updateProgress(step) {
    var html = "";
    for (var i = 0; i < 3; i++) {
      var cls = "onboarding-step-dot";
      if (i < step) cls += " done";
      else if (i === step) cls += " active";
      html += '<div class="' + cls + '"></div>';
    }
    document.getElementById("onboardingProgress").innerHTML = html;
  }

  // ── Step router ──
  function renderStep(step) {
    currentStep = step;
    updateProgress(step);
    var body = document.getElementById("onboardingBody");
    var footer = document.getElementById("onboardingFooter");
    if (step === 0) renderWelcome(body, footer);
    else if (step === 1) renderTabs(body, footer);
    else if (step === 2) renderComplete(body, footer);
  }

  // ── Step 1: Welcome + Language ──
  var WELCOME_TEXT = {
    ko: { title: "Personal Dev Tools에 오신 것을 환영합니다", desc: "간단한 초기 설정을 시작합니다.<br>아래에서 언어를 선택하세요.", next: "다음" },
    en: { title: "Welcome to Personal Dev Tools", desc: "Let's get started with a quick setup.<br>Choose your language below.", next: "Next" },
    ja: { title: "Personal Dev Toolsへようこそ", desc: "簡単な初期設定を始めましょう。<br>下から言語を選択してください。", next: "次へ" }
  };

  function renderWelcome(body, footer) {
    var lang = selectedLang || "en";
    var txt = WELCOME_TEXT[lang] || WELCOME_TEXT.en;
    body.innerHTML =
      '<div class="onboarding-welcome-icon"><i data-lucide="wrench"></i></div>' +
      '<h2 id="onboardingTitle">' + txt.title + '</h2>' +
      '<p id="onboardingDesc" style="color:var(--muted);line-height:1.6;margin-bottom:20px">' + txt.desc + '</p>' +
      '<div class="onboarding-lang-options">' +
        '<button class="onboarding-lang-btn" data-lang="ko"><b>한국어</b></button>' +
        '<button class="onboarding-lang-btn" data-lang="en"><b>English</b></button>' +
        '<button class="onboarding-lang-btn" data-lang="ja"><b>日本語</b></button>' +
      '</div>';
    initLucideInOverlay();
    var btns = body.querySelectorAll(".onboarding-lang-btn");
    btns.forEach(function (btn) {
      if (btn.dataset.lang === lang) btn.classList.add("selected");
      btn.addEventListener("click", function () {
        btns.forEach(function (b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
        selectedLang = btn.dataset.lang;
        // Update wizard text only
        var t = WELCOME_TEXT[selectedLang] || WELCOME_TEXT.en;
        document.getElementById("onboardingTitle").textContent = t.title;
        document.getElementById("onboardingDesc").innerHTML = t.desc;
        document.getElementById("onboardingNext1").textContent = t.next + " →";
      });
    });
    footer.innerHTML =
      '<div></div>' +
      '<button class="onboarding-btn-primary" id="onboardingNext1">' + txt.next + ' &rarr;</button>';
    document.getElementById("onboardingNext1").addEventListener("click", async function () {
      // Save language + apply i18n on proceed
      if (selectedLang && selectedLang !== i18nLang()) {
        i18nSetLang(selectedLang);
        try {
          await fetch("/api/dev/site-config", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lang: selectedLang })
          });
        } catch (_) {}
        await new Promise(function (r) { setTimeout(r, 300); });
      }
      renderStep(1);
    });
  }

  // ── Step 2: Tabs ──
  function renderTabs(body, footer) {
    body.innerHTML =
      '<h2>' + t("onboarding.tabs_title") + '</h2>' +
      '<p>' + t("onboarding.tabs_desc") + '</p>' +
      '<div class="onboarding-tabs-list" id="onboardingTabsList">' +
        '<div style="text-align:center;color:var(--muted);">Loading...</div>' +
      '</div>';
    footer.innerHTML =
      '<button id="onboardingBack2">' + t("onboarding.btn_back") + '</button>' +
      '<div>' +
        '<button id="onboardingSkip2" style="margin-right:8px">' + t("onboarding.btn_skip") + '</button>' +
        '<button class="onboarding-btn-primary" id="onboardingNext2">' + t("onboarding.btn_next") + ' &rarr;</button>' +
      '</div>';
    document.getElementById("onboardingBack2").addEventListener("click", function () { renderStep(0); });
    document.getElementById("onboardingSkip2").addEventListener("click", function () { renderStep(2); });
    document.getElementById("onboardingNext2").addEventListener("click", saveTabs);

    loadTabs();
  }

  // tab.id → i18n nav key
  var TAB_I18N = {
    mock: "nav.mock", charcount: "nav.charcount", mybatis: "nav.mybatis",
    jsonformat: "nav.json", translate: "nav.translate", csv: "nav.csv",
    markdown: "nav.markdown", paramchanger: "nav.param", pdfconvert: "nav.pdf",
    diffcompare: "nav.diff", git: "nav.git", dataai: "nav.dataai"
  };

  async function loadTabs() {
    try {
      var res = await fetch("/api/dev/tabs");
      var data = await res.json();
      if (!data.ok) return;
      tabsData = data.tabs.sort(function (a, b) { return a.order - b.order; });
      var list = document.getElementById("onboardingTabsList");
      list.innerHTML = "";
      tabsData.forEach(function (tab) {
        var i18nKey = TAB_I18N[tab.id];
        var label = i18nKey ? t(i18nKey) : tab.label;
        if (label === i18nKey) label = tab.label; // fallback if key not translated
        var item = document.createElement("div");
        item.className = "onboarding-tab-item";
        item.innerHTML =
          '<input type="checkbox" data-id="' + tab.id + '"' + (tab.visible ? ' checked' : '') + '>' +
          '<label>' + escOnb(label) + '</label>';
        list.appendChild(item);
      });
    } catch (_) {}
  }

  async function saveTabs() {
    var checks = document.querySelectorAll("#onboardingTabsList input[type=checkbox]");
    checks.forEach(function (cb) {
      var tab = tabsData.find(function (t) { return t.id === cb.dataset.id; });
      if (tab) tab.visible = cb.checked;
    });
    try {
      await fetch("/api/dev/tabs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabs: tabsData })
      });
      // Refresh sidebar
      if (typeof applyTabConfig === "function") applyTabConfig();
    } catch (_) {}
    renderStep(2);
  }

  // ── Step 4: Complete ──
  function renderComplete(body, footer) {
    body.innerHTML =
      '<div class="onboarding-complete-icon"><i data-lucide="check-circle"></i></div>' +
      '<h2>' + t("onboarding.complete_title") + '</h2>' +
      '<p>' + t("onboarding.complete_desc") + '</p>';
    initLucideInOverlay();
    footer.innerHTML =
      '<button id="onboardingTutorial">' + t("onboarding.btn_tutorial") + '</button>' +
      '<button class="onboarding-btn-primary" id="onboardingFinish">' + t("onboarding.btn_finish") + '</button>';
    document.getElementById("onboardingTutorial").addEventListener("click", async function () {
      await completeOnboarding();
      switchTab("devmode");
      // Activate tutorial section
      setTimeout(function () {
        var tutBtn = document.querySelector('.dev-sec-btn[data-sec="tutorial"]');
        if (tutBtn) tutBtn.click();
      }, 100);
    });
    document.getElementById("onboardingFinish").addEventListener("click", function () {
      completeOnboarding();
    });
  }

  async function completeOnboarding() {
    try {
      await fetch("/api/dev/onboarding/complete", { method: "POST" });
    } catch (_) {}
    if (overlay) overlay.remove();
    overlay = null;
  }

  // ── Utils ──
  function escOnb(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function initLucideInOverlay() {
    if (typeof lucide !== "undefined" && overlay) {
      lucide.createIcons({ nodes: overlay.querySelectorAll("[data-lucide]") });
    }
  }

  // ── Init ──
  i18nReady(function () {
    checkOnboarding();
  });
})();
