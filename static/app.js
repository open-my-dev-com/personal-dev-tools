// Lucide 아이콘 초기화
lucide.createIcons();

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
        btn.setAttribute("data-tooltip", tab.label);
      } else {
        btn.textContent = tab.label;
      }
      btn.style.display = tab.visible ? "" : "none";
      if (content) {
        content.style.display = tab.visible ? "" : "none";
        const h2 = content.querySelector("section.panel > h2");
        if (h2) {
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
