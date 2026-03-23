const translateInput = document.getElementById("translateInput");
const translateBtn = document.getElementById("translateBtn");
const translateSource = document.getElementById("translateSource");
const translateStatus = document.getElementById("translateStatus");
const translateResultsWrap = document.getElementById("translateResults");
const translateTargetChecks = document.querySelectorAll(".translate-target");
const translateSelectAll = document.getElementById("translateSelectAll");

const LANG_LABELS = { ko: "한국어", en: "영어", ja: "일본어" };

function setTranslateStatus(text, isError = false) {
  translateStatus.textContent = text;
  translateStatus.style.color = isError ? "#bf233a" : "#65748b";
}

function syncTargetChecks() {
  const src = translateSource.value;
  translateTargetChecks.forEach((cb) => {
    if (cb.value === src) {
      cb.checked = false;
      cb.disabled = true;
    } else {
      cb.disabled = false;
    }
  });
  syncSelectAll();
}

function syncSelectAll() {
  const enabled = [...translateTargetChecks].filter((cb) => !cb.disabled);
  const allChecked = enabled.length > 0 && enabled.every((cb) => cb.checked);
  const someChecked = enabled.some((cb) => cb.checked);
  translateSelectAll.checked = allChecked;
  translateSelectAll.indeterminate = !allChecked && someChecked;
}

function getSelectedTargets() {
  return [...translateTargetChecks]
    .filter((cb) => cb.checked && !cb.disabled)
    .map((cb) => cb.value);
}

async function doTranslate() {
  const text = translateInput.value.trim();
  if (!text) {
    setTranslateStatus("텍스트를 입력하세요.", true);
    return;
  }
  const targets = getSelectedTargets();
  if (targets.length === 0) {
    setTranslateStatus("대상 언어를 1개 이상 선택하세요.", true);
    return;
  }

  translateBtn.disabled = true;
  setTranslateStatus(`번역 중... (${targets.length}개 언어)`);
  translateResultsWrap.innerHTML = "";

  const results = await Promise.allSettled(
    targets.map((target) =>
      fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: translateSource.value, target }),
      }).then((r) => r.json().then((data) => ({ target, ok: r.ok && data.ok, result: data.result, error: data.error })))
    )
  );

  let successCount = 0;
  for (const r of results) {
    const data = r.status === "fulfilled" ? r.value : { target: "?", ok: false, error: r.reason?.message || "요청 실패" };
    const block = document.createElement("div");
    block.className = "translate-block";

    if (data.ok) {
      successCount++;
      block.innerHTML = `
        <div class="translate-block-header">
          <span class="badge">${LANG_LABELS[data.target] || data.target}</span>
          <button class="translate-copy-btn">복사</button>
        </div>
        <textarea readonly rows="6">${escapeHtml(data.result)}</textarea>
      `;
      block.querySelector(".translate-copy-btn").addEventListener("click", (e) => {
        navigator.clipboard.writeText(data.result).then(() => {
          e.target.textContent = "OK!";
          setTimeout(() => { e.target.textContent = "복사"; }, 1000);
        });
      });
    } else {
      block.innerHTML = `
        <div class="translate-block-header">
          <span class="badge">${LANG_LABELS[data.target] || data.target}</span>
        </div>
        <div class="translate-error">${escapeHtml(data.error || "번역 실패")}</div>
      `;
    }
    translateResultsWrap.appendChild(block);
  }

  translateBtn.disabled = false;
  if (successCount === targets.length) {
    setTranslateStatus(`${successCount}개 언어 번역 완료`);
  } else {
    setTranslateStatus(`${successCount}/${targets.length} 완료 (일부 실패)`, true);
  }
}

translateBtn.addEventListener("click", doTranslate);
translateSource.addEventListener("change", syncTargetChecks);
translateSelectAll.addEventListener("change", () => {
  const checked = translateSelectAll.checked;
  translateTargetChecks.forEach((cb) => { if (!cb.disabled) cb.checked = checked; });
  translateSelectAll.indeterminate = false;
});
translateTargetChecks.forEach((cb) => cb.addEventListener("change", syncSelectAll));
syncTargetChecks();
