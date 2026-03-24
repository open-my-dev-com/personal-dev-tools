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
  if (!selectEl) return;
  function populate(providers) {
    selectEl.innerHTML = "";
    if (!providers || providers.length === 0) {
      var opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No AI Key";
      opt.disabled = true;
      selectEl.appendChild(opt);
    } else {
      providers.forEach(function (p) {
        var opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.label;
        selectEl.appendChild(opt);
      });
    }
    if (callback) callback(providers);
  }
  if (_aiProvidersCache) {
    populate(_aiProvidersCache);
    return;
  }
  fetch("/api/ai/providers").then(function (r) { return r.json(); }).then(function (data) {
    _aiProvidersCache = data.ok ? data.providers : [];
    populate(_aiProvidersCache);
  }).catch(function () { populate([]); });
}
function refreshAiProviders() {
  _aiProvidersCache = null;
  document.querySelectorAll(".ai-provider-select").forEach(function (sel) {
    loadAiProviders(sel);
  });
}

// 사이드바 접기/펼기
(function initSidebarToggle() {
  const sidebar = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("sidebarToggle");
  const collapsed = localStorage.getItem("sidebarCollapsed") === "true";

  // 툴팁용 data-tooltip 속성 세팅
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const label = btn.querySelector(".nav-label");
    if (label) btn.setAttribute("data-tooltip", label.textContent.trim());
  });

  function setSidebarState(collapse) {
    sidebar.classList.toggle("collapsed", collapse);
    localStorage.setItem("sidebarCollapsed", collapse);
    // 토글 아이콘 변경 — lucide.createIcons()가 <i>를 <svg>로 변환하므로
    // 기존 svg를 제거하고 새 <i>를 삽입한 뒤 다시 createIcons 호출
    const oldIcon = toggleBtn.querySelector("svg") || toggleBtn.querySelector("i");
    if (oldIcon) oldIcon.remove();
    const newIcon = document.createElement("i");
    newIcon.setAttribute("data-lucide", collapse ? "chevrons-right" : "chevrons-left");
    toggleBtn.appendChild(newIcon);
    lucide.createIcons({ nodes: [newIcon] });
    toggleBtn.title = collapse ? "사이드바 펼치기" : "사이드바 접기";
  }

  if (collapsed) setSidebarState(true);
  toggleBtn.addEventListener("click", () => {
    setSidebarState(!sidebar.classList.contains("collapsed"));
  });
})();

// 네비게이션 전환
function switchTab(tabName) {
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  const btn = document.querySelector(`.nav-btn[data-tab="${tabName}"]`);
  if (btn) btn.classList.add("active");
  const content = document.querySelector(`.tab-content[data-tab="${tabName}"]`);
  if (content) content.classList.add("active");
  localStorage.setItem("activeTab", tabName);
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// 탭 설정 적용 (개발자 모드에서 저장한 이름/순서/표시 반영)
async function applyTabConfig() {
  try {
    const res = await fetch("/api/dev/tabs");
    const data = await res.json();
    if (!data.ok) return;
    const tabs = data.tabs.sort((a, b) => a.order - b.order);
    const nav = document.querySelector(".nav");
    tabs.forEach((tab) => {
      const btn = nav.querySelector(`.nav-btn[data-tab="${tab.id}"]`);
      const content = document.querySelector(`.tab-content[data-tab="${tab.id}"]`);
      if (!btn) return;
      const navLabel = btn.querySelector(".nav-label");
      if (navLabel) {
        navLabel.textContent = tab.label;
        navLabel.removeAttribute("data-i18n");
        btn.setAttribute("data-tooltip", tab.label);
        btn.removeAttribute("data-i18n-tooltip");
      } else {
        btn.textContent = tab.label;
        btn.removeAttribute("data-i18n");
      }
      btn.style.display = tab.visible ? "" : "none";
      if (content) {
        content.style.display = tab.visible ? "" : "none";
        const h2 = content.querySelector("section.panel > h2");
        if (h2) {
          h2.removeAttribute("data-i18n");
          const textNode = [...h2.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
          if (textNode) textNode.textContent = tab.label + " ";
          else if (!h2.querySelector("span, button")) h2.textContent = tab.label;
        }
      }
    });
    // DOM 순서 재정렬 — DEV 버튼과 구분선 앞에 삽입
    const divider = nav.querySelector(".nav-divider");
    tabs.forEach((tab) => {
      const btn = nav.querySelector(`.nav-btn[data-tab="${tab.id}"]`);
      if (btn && divider) nav.insertBefore(btn, divider);
    });
  } catch (_) { /* 서버 미실행 시 무시 */ }
}

// 마지막 선택 탭 복원 + 탭 설정 적용
applyTabConfig().then(() => {
  const savedTab = localStorage.getItem("activeTab");
  if (savedTab && document.querySelector(`.nav-btn[data-tab="${savedTab}"]`)) {
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
  _toastContainer = document.createElement("div");
  _toastContainer.className = "toast-container toast-" + _toastConfig.position + " toast-size-" + _toastConfig.size;
  document.body.appendChild(_toastContainer);
}

function _updateToastPosition() {
  if (!_toastContainer) return;
  _toastContainer.className = "toast-container toast-" + _toastConfig.position + " toast-size-" + _toastConfig.size;
}

function loadToastConfig() {
  fetch("/api/dev/site-config").then(function (r) { return r.json(); }).then(function (data) {
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
  }).catch(function () {});
}

function showToast(message, type) {
  type = type || "info";
  _initToastContainer();

  // Replace mode: remove existing toasts
  if (_toastConfig.mode === "replace") {
    while (_toastContainer.firstChild) {
      _toastContainer.removeChild(_toastContainer.firstChild);
    }
  }

  // Stack mode: limit max
  if (_toastConfig.mode === "stack") {
    var existing = _toastContainer.querySelectorAll(".toast");
    if (existing.length >= _toastMaxStack) {
      existing[0].remove();
    }
  }

  var iconName = type === "success" ? "check-circle" : type === "error" ? "alert-circle" : "info";

  var toast = document.createElement("div");
  toast.className = "toast toast-" + type;
  toast.innerHTML =
    '<i data-lucide="' + iconName + '" class="toast-icon"></i>' +
    '<span class="toast-message">' + escapeHtml(message) + '</span>' +
    '<button class="toast-close">&times;</button>';

  _toastContainer.appendChild(toast);
  lucide.createIcons({ nodes: [toast.querySelector("i")] });

  // Trigger enter animation
  requestAnimationFrame(function () {
    toast.classList.add("toast-show");
  });

  // Close button
  toast.querySelector(".toast-close").addEventListener("click", function () {
    _dismissToast(toast);
  });

  // Auto-dismiss (error = 2x duration)
  var duration = _toastConfig.duration * 1000;
  if (type === "error") duration *= 2;
  setTimeout(function () {
    _dismissToast(toast);
  }, duration);
}

function _dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add("toast-hide");
  toast.addEventListener("animationend", function () {
    if (toast.parentNode) toast.remove();
  });
}

// Load toast config on init
loadToastConfig();
