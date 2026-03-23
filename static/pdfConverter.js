// ── PDF 변환기 ──
const pdfUploadZone = document.getElementById("pdfUploadZone");
const pdfFileInput = document.getElementById("pdfFileInput");
const pdfFileList = document.getElementById("pdfFileList");
const pdfToolbar = document.getElementById("pdfToolbar");
const pdfStatus = document.getElementById("pdfStatus");
const pdfPreview = document.getElementById("pdfPreview");

let pdfFiles = []; // { id, name, ext, size, data, htmlContent, status }
let pdfNextId = 0;

function setPdfStatus(text, isError = false) {
  pdfStatus.textContent = text;
  pdfStatus.style.color = isError ? "#bf233a" : "#65748b";
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function getFileExt(name) {
  return (name.split(".").pop() || "").toLowerCase();
}

const PDF_SUPPORTED_EXTS = new Set([
  "md", "txt", "html", "htm",
  "jpg", "jpeg", "png", "gif", "bmp", "webp",
  "docx", "xlsx", "pptx"
]);

const PDF_IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp"]);

// ── 파일 업로드 ──
pdfUploadZone.addEventListener("click", () => pdfFileInput.click());
pdfUploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  pdfUploadZone.classList.add("dragover");
});
pdfUploadZone.addEventListener("dragleave", () => pdfUploadZone.classList.remove("dragover"));
pdfUploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  pdfUploadZone.classList.remove("dragover");
  addFiles(e.dataTransfer.files);
});
pdfFileInput.addEventListener("change", () => {
  addFiles(pdfFileInput.files);
  pdfFileInput.value = "";
});

function addFiles(fileList) {
  for (const file of fileList) {
    const ext = getFileExt(file.name);
    if (!PDF_SUPPORTED_EXTS.has(ext)) {
      setPdfStatus(`지원하지 않는 형식: .${ext}`, true);
      continue;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const entry = {
        id: pdfNextId++,
        name: file.name,
        ext,
        size: file.size,
        data: reader.result,
        htmlContent: null,
        status: "pending"
      };
      pdfFiles.push(entry);
      renderFileList();
      convertFileToHtml(entry);
    };
    if (PDF_IMAGE_EXTS.has(ext) || ext === "docx" || ext === "xlsx" || ext === "pptx") {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }
}

// ── 파일 목록 렌더링 ──
function renderFileList() {
  pdfToolbar.style.display = pdfFiles.length ? "" : "none";
  if (!pdfFiles.length) {
    pdfFileList.innerHTML = "";
    pdfPreview.style.display = "none";
    return;
  }
  let html = "";
  pdfFiles.forEach((f, i) => {
    const statusClass = f.status === "ready" ? "pdf-status-ready" :
                        f.status === "error" ? "pdf-status-error" :
                        "pdf-status-pending";
    const statusText = f.status === "ready" ? "준비" :
                       f.status === "error" ? "실패" :
                       f.status === "converting" ? "변환중..." : "대기";
    html += `<div class="pdf-file-item" data-id="${f.id}">
      <span class="pdf-file-drag" title="드래그하여 순서 변경">☰</span>
      <span class="pdf-file-icon">${getFileIcon(f.ext)}</span>
      <span class="pdf-file-name">${escHtml(f.name)}</span>
      <span class="pdf-file-size">${formatFileSize(f.size)}</span>
      <span class="pdf-file-status ${statusClass}">${statusText}</span>
      <button class="pdf-file-preview-btn" data-id="${f.id}" title="미리보기">미리보기</button>
      <button class="pdf-file-remove" data-id="${f.id}" title="제거">✕</button>
    </div>`;
  });
  pdfFileList.innerHTML = html;

  // 이벤트
  pdfFileList.querySelectorAll(".pdf-file-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      pdfFiles = pdfFiles.filter(f => f.id !== parseInt(btn.dataset.id));
      renderFileList();
    });
  });
  pdfFileList.querySelectorAll(".pdf-file-preview-btn").forEach(btn => {
    btn.addEventListener("click", () => showPreview(parseInt(btn.dataset.id)));
  });

  // 드래그 순서 변경
  initDragSort();
}

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function getFileIcon(ext) {
  if (PDF_IMAGE_EXTS.has(ext)) return "🖼️";
  if (ext === "md") return "📝";
  if (ext === "docx") return "📄";
  if (ext === "xlsx") return "📊";
  if (ext === "pptx") return "📋";
  if (ext === "html" || ext === "htm") return "🌐";
  if (ext === "txt") return "📃";
  return "📎";
}

function initDragSort() {
  let dragItem = null;
  pdfFileList.querySelectorAll(".pdf-file-item").forEach(item => {
    item.draggable = true;
    item.addEventListener("dragstart", (e) => {
      dragItem = item;
      item.classList.add("pdf-dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("pdf-dragging");
      pdfFileList.querySelectorAll(".pdf-file-item").forEach(r => r.classList.remove("pdf-dragover"));
      dragItem = null;
      // DOM 순서에 맞게 pdfFiles 재정렬
      const newOrder = [...pdfFileList.querySelectorAll(".pdf-file-item")].map(el => parseInt(el.dataset.id));
      pdfFiles.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
    });
    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (item !== dragItem) item.classList.add("pdf-dragover");
    });
    item.addEventListener("dragleave", () => item.classList.remove("pdf-dragover"));
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      item.classList.remove("pdf-dragover");
      if (!dragItem || dragItem === item) return;
      const items = [...pdfFileList.querySelectorAll(".pdf-file-item")];
      const fromIdx = items.indexOf(dragItem);
      const toIdx = items.indexOf(item);
      if (fromIdx < toIdx) pdfFileList.insertBefore(dragItem, item.nextSibling);
      else pdfFileList.insertBefore(dragItem, item);
    });
  });
}

// ── 포맷별 HTML 변환 ──
async function convertFileToHtml(entry) {
  entry.status = "converting";
  renderFileList();
  try {
    const ext = entry.ext;
    let html = "";

    if (ext === "md") {
      const { meta, body } = parseFrontmatter(entry.data);
      const fmHtml = renderFrontmatterHtml(meta);
      html = fmHtml + processAlerts(marked.parse(body));
    } else if (ext === "txt") {
      html = `<pre style="white-space:pre-wrap;word-break:break-word;font-family:'SF Mono',Consolas,monospace;font-size:13px;line-height:1.6">${escHtml(entry.data)}</pre>`;
    } else if (ext === "html" || ext === "htm") {
      html = entry.data;
    } else if (PDF_IMAGE_EXTS.has(ext)) {
      const mimeMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };
      const blob = new Blob([entry.data], { type: mimeMap[ext] || "image/png" });
      const dataUrl = await blobToDataUrl(blob);
      html = `<div style="text-align:center;padding:20px"><img src="${dataUrl}" style="max-width:100%;max-height:90vh;object-fit:contain" /></div>`;
    } else if (ext === "docx") {
      const result = await mammoth.convertToHtml({ arrayBuffer: entry.data });
      html = result.value;
      if (result.messages.length) {
        console.warn("mammoth warnings:", result.messages);
      }
    } else if (ext === "xlsx") {
      html = await serverConvert(entry.data, "/api/pdf/convert/xlsx");
    } else if (ext === "pptx") {
      html = await serverConvert(entry.data, "/api/pdf/convert/pptx");
    }

    entry.htmlContent = html;
    entry.status = "ready";
  } catch (e) {
    console.error("PDF convert error:", e);
    entry.status = "error";
    entry.htmlContent = `<p style="color:red">변환 실패: ${escHtml(e.message)}</p>`;
  }
  renderFileList();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function serverConvert(arrayBuffer, url) {
  const formData = new FormData();
  formData.append("file", new Blob([arrayBuffer]));
  const res = await fetch(url, { method: "POST", body: formData });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "서버 변환 실패");
  return data.html;
}

// ── 미리보기 ──
async function showPreview(fileId) {
  const file = pdfFiles.find(f => f.id === fileId);
  if (!file || !file.htmlContent) return;
  pdfPreview.style.display = "";
  pdfPreview.innerHTML = `<div class="pdf-preview-header">
    <span>미리보기: ${escHtml(file.name)}</span>
    <button class="pdf-preview-close" id="pdfPreviewClose">닫기</button>
  </div>
  <div class="pdf-preview-content">${file.htmlContent}</div>`;
  document.getElementById("pdfPreviewClose").addEventListener("click", () => {
    pdfPreview.style.display = "none";
  });
  // mermaid 다이어그램 렌더링
  if (file.ext === "md" && typeof mermaid !== "undefined") {
    const blocks = pdfPreview.querySelectorAll(".mermaid");
    for (const el of blocks) {
      if (el.dataset.processed) continue;
      const code = el.textContent;
      el.dataset.processed = "true";
      try {
        const { svg } = await mermaid.render("pdf-mermaid-" + Date.now() + Math.random().toString(36).slice(2), code);
        el.innerHTML = svg;
      } catch (e) {
        el.innerHTML = `<pre style="color:#bf233a;font-size:12px">Mermaid 오류: ${e.message || e}</pre>`;
      }
    }
  }
}

// ── 컨테이너 내 mermaid 다이어그램 렌더링 ──
async function renderMermaidInContainer(container) {
  if (typeof mermaid === "undefined") return;
  var blocks = container.querySelectorAll(".mermaid");
  for (var i = 0; i < blocks.length; i++) {
    var el = blocks[i];
    if (el.dataset.processed) continue;
    var code = el.textContent;
    el.dataset.processed = "true";
    try {
      var result = await mermaid.render("pdf-mermaid-" + Date.now() + "-" + i, code);
      el.innerHTML = result.svg;
    } catch (e) {
      el.innerHTML = '<pre style="color:#bf233a;font-size:12px">Mermaid 오류: ' + (e.message || e) + '</pre>';
    }
  }
}

// ── PDF 아웃라인(북마크) 추가 ──
function addOutlineFromHeadings(pdf, headings, containerH, opts) {
  if (headings.length === 0 || containerH === 0) return;
  var totalPages = pdf.internal.getNumberOfPages();
  var pageH = pdf.internal.pageSize.getHeight();
  var margin = opts.margin || 0;
  var contentH = pageH - margin * 2;

  console.log("[PDF Outline] containerH:", containerH, "totalPages:", totalPages, "pageH:", pageH, "contentH:", contentH);

  headings.forEach(function(h) {
    // DOM px → canvas px → PDF mm 변환
    // html2pdf는 canvas를 페이지 너비에 맞추므로, 그 비율로 y도 변환됨
    // 최종적으로 container 높이 대비 전체 PDF 콘텐츠 높이의 비율
    var ratio = h.top / containerH;
    // 전체 콘텐츠 높이 (모든 페이지의 콘텐츠 영역 합)
    var totalContentH = totalPages * contentH;
    var absY = ratio * totalContentH;
    var page = Math.min(Math.floor(absY / contentH) + 1, totalPages);
    var yInPage = margin + (absY - (page - 1) * contentH);

    // 페이지 경계에 가까우면 다음 페이지 시작으로 보정 (breakBefore: page 대응)
    var remainInPage = contentH - (absY - (page - 1) * contentH);
    if (remainInPage < 5 && page < totalPages) {
      page = page + 1;
      yInPage = margin;
    }

    console.log("[PDF Outline]", h.text, "| top:", h.top.toFixed(1), "| ratio:", ratio.toFixed(4), "| page:", page, "| yInPage:", yInPage.toFixed(1));
    pdf.outline.add(null, h.text, { pageNumber: page, top: yInPage });
  });
}

// ── PDF 생성 옵션 ──
function getPdfOptions() {
  return {
    margin: parseInt(document.getElementById("pdfMargin").value),
    image: { type: "jpeg", quality: 0.95 },
    enableLinks: true,
    pagebreak: { mode: ["avoid-all", "css"], avoid: ["h1","h2","h3","h4","h5","h6","p","li","tr","td","th","pre","blockquote","code",".mermaid","img","figure","dl","dt","dd"] },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: {
      unit: "mm",
      format: document.getElementById("pdfPageSize").value,
      orientation: document.getElementById("pdfOrientation").value
    }
  };
}

// ── 개별 변환 ──
document.getElementById("pdfConvertBtn").addEventListener("click", async () => {
  const readyFiles = pdfFiles.filter(f => f.status === "ready");
  if (!readyFiles.length) { setPdfStatus("변환할 파일이 없습니다", true); return; }
  setPdfStatus(`${readyFiles.length}개 파일 변환 중...`);
  const opts = getPdfOptions();

  for (const file of readyFiles) {
    try {
      const container = document.createElement("div");
      container.className = "pdf-preview-content";
      container.innerHTML = file.htmlContent;
      container.style.cssText = "max-height:none;overflow:visible;padding:10px";
      document.body.appendChild(container);
      // h2 페이지 분리 옵션
      if (document.getElementById("pdfPageBreakH2").checked) {
        var h2s = container.querySelectorAll("h2");
        for (var i = 1; i < h2s.length; i++) { h2s[i].style.breakBefore = "page"; }
      }
      // 앵커 링크(#...)는 PDF에서 localhost URL로 변환되므로 링크 해제
      container.querySelectorAll('a[href^="#"]').forEach(function(a) {
        var span = document.createElement("span");
        span.innerHTML = a.innerHTML;
        span.style.color = a.style.color || "";
        a.replaceWith(span);
      });
      // mermaid 다이어그램 렌더링
      await renderMermaidInContainer(container);
      const filename = file.name.replace(/\.\w+$/, "") + ".pdf";
      // heading 위치 수집 (PDF 아웃라인용) - getBoundingClientRect 기준
      var containerRect = container.getBoundingClientRect();
      var headings = [];
      container.querySelectorAll("h1,h2").forEach(function(el) {
        headings.push({ text: el.textContent.trim(), depth: parseInt(el.tagName[1]), top: el.getBoundingClientRect().top - containerRect.top });
      });
      var containerH = containerRect.height;
      // toPdf 후 outline 추가, 그 다음 save
      var worker = html2pdf().set({ ...opts, filename }).from(container);
      await worker.toPdf().get("pdf").then(function(pdf) {
        addOutlineFromHeadings(pdf, headings, containerH, opts);
      }).save();
      document.body.removeChild(container);
    } catch (e) {
      console.error("PDF generation error:", e);
      setPdfStatus(`${file.name} 변환 실패: ${e.message}`, true);
      return;
    }
  }
  setPdfStatus(`${readyFiles.length}개 파일 PDF 변환 완료`);
});

// ── 병합 변환 ──
document.getElementById("pdfMergeBtn").addEventListener("click", async () => {
  const readyFiles = pdfFiles.filter(f => f.status === "ready");
  if (readyFiles.length < 2) { setPdfStatus("병합하려면 2개 이상의 파일이 필요합니다", true); return; }
  setPdfStatus(`${readyFiles.length}개 파일 병합 중...`);
  const opts = getPdfOptions();

  const container = document.createElement("div");
  container.className = "pdf-preview-content";
  container.style.cssText = "max-height:none;overflow:visible;padding:10px";
  readyFiles.forEach((file, i) => {
    const section = document.createElement("div");
    if (i > 0) section.style.pageBreakBefore = "always";
    section.innerHTML = file.htmlContent;
    container.appendChild(section);
  });

  document.body.appendChild(container);
  // mermaid 다이어그램 렌더링
  await renderMermaidInContainer(container);
  // h2 페이지 분리 옵션
  if (document.getElementById("pdfPageBreakH2").checked) {
    container.querySelectorAll("h2").forEach(function(el) { el.style.breakBefore = "page"; });
  }
  // 앵커 링크(#...)는 PDF에서 localhost URL로 변환되므로 링크 해제
  container.querySelectorAll('a[href^="#"]').forEach(function(a) {
    var span = document.createElement("span");
    span.innerHTML = a.innerHTML;
    span.style.color = a.style.color || "";
    a.replaceWith(span);
  });
  // heading 위치 수집 (PDF 아웃라인용)
  var containerRect = container.getBoundingClientRect();
  var headings = [];
  container.querySelectorAll("h1,h2").forEach(function(el) {
    headings.push({ text: el.textContent.trim(), depth: parseInt(el.tagName[1]), top: el.getBoundingClientRect().top - containerRect.top });
  });
  var containerH = containerRect.height;
  try {
    var worker = html2pdf().set({ ...opts, filename: "merged.pdf" }).from(container);
    await worker.toPdf().get("pdf").then(function(pdf) {
      addOutlineFromHeadings(pdf, headings, containerH, opts);
    }).save();
    setPdfStatus(`${readyFiles.length}개 파일 병합 PDF 완료`);
  } catch (e) {
    setPdfStatus("병합 실패: " + e.message, true);
  }
  document.body.removeChild(container);
});

// ── 전체 제거 ──
document.getElementById("pdfClearBtn").addEventListener("click", () => {
  pdfFiles = [];
  pdfNextId = 0;
  renderFileList();
  pdfPreview.style.display = "none";
  setPdfStatus("");
});

// ── Markdown 저장 파일 연동 ──
const pdfMdSaveSelect = document.getElementById("pdfMdSaveSelect");
const pdfLoadMdSaveBtn = document.getElementById("pdfLoadMdSaveBtn");

pdfLoadMdSaveBtn.addEventListener("click", async () => {
  if (pdfMdSaveSelect.style.display !== "none") {
    pdfMdSaveSelect.style.display = "none";
    return;
  }
  try {
    const res = await fetch("/api/md/saves");
    const items = await res.json();
    if (!items || !items.length) { setPdfStatus("저장된 Markdown이 없습니다", true); return; }
    pdfMdSaveSelect.innerHTML = '<option value="">-- 선택 --</option>';
    items.forEach(item => {
      pdfMdSaveSelect.innerHTML += `<option value="${item.id}">${escHtml(item.name)}</option>`;
    });
    pdfMdSaveSelect.style.display = "";
  } catch (e) {
    setPdfStatus("Markdown 목록 로드 실패", true);
  }
});

pdfMdSaveSelect.addEventListener("change", async () => {
  const id = pdfMdSaveSelect.value;
  if (!id) return;
  try {
    const res = await fetch(`/api/md/saves/${id}`);
    const item = await res.json();

    const entry = {
      id: pdfNextId++,
      name: (item.name || "markdown") + ".md",
      ext: "md",
      size: new Blob([item.content || ""]).size,
      data: item.content || "",
      htmlContent: null,
      status: "pending"
    };
    pdfFiles.push(entry);
    renderFileList();
    convertFileToHtml(entry);
    pdfMdSaveSelect.style.display = "none";
    setPdfStatus(`"${item.name}" 추가됨`);
  } catch (e) {
    setPdfStatus("Markdown 불러오기 실패", true);
  }
});
