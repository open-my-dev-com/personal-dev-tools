// ── PDF 변환기 ──
(function() {
const $pdfUploadZone = $("#pdfUploadZone");
const $pdfFileInput = $("#pdfFileInput");
const $pdfFileList = $("#pdfFileList");
const $pdfToolbar = $("#pdfToolbar");
const $pdfStatus = $("#pdfStatus");
const $pdfPreview = $("#pdfPreview");

let pdfFiles = []; // { id, name, ext, size, data, htmlContent, status }
let pdfNextId = 0;

function setPdfStatus(text, isError = false) {
  $pdfStatus.text(text);
  $pdfStatus.css("color", isError ? "#bf233a" : "#65748b");
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
$pdfUploadZone.on("click", function() { $pdfFileInput[0].click(); });
$pdfUploadZone.on("dragover", function(e) {
  e.preventDefault();
  $pdfUploadZone.addClass("dragover");
});
$pdfUploadZone.on("dragleave", function() { $pdfUploadZone.removeClass("dragover"); });
$pdfUploadZone.on("drop", function(e) {
  e.preventDefault();
  $pdfUploadZone.removeClass("dragover");
  addFiles(e.originalEvent.dataTransfer.files);
});
$pdfFileInput.on("change", function() {
  addFiles($pdfFileInput[0].files);
  $pdfFileInput.val("");
});

function addFiles(fileList) {
  for (const file of fileList) {
    const ext = getFileExt(file.name);
    if (!PDF_SUPPORTED_EXTS.has(ext)) {
      setPdfStatus(t("pdf.unsupported", {ext}), true);
      continue;
    }
    const reader = new FileReader();
    reader.onload = function() {
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
  $pdfToolbar.css("display", pdfFiles.length ? "" : "none");
  if (!pdfFiles.length) {
    $pdfFileList.html("");
    $pdfPreview.hide();
    return;
  }
  let html = "";
  pdfFiles.forEach(function(f, i) {
    const statusClass = f.status === "ready" ? "pdf-status-ready" :
                        f.status === "error" ? "pdf-status-error" :
                        "pdf-status-pending";
    const statusText = f.status === "ready" ? t("pdf.status_ready") :
                       f.status === "error" ? t("pdf.status_fail") :
                       f.status === "converting" ? t("pdf.status_converting") : t("pdf.status_waiting");
    html += `<div class="pdf-file-item" data-id="${f.id}">
      <span class="pdf-file-drag" title="${t("pdf.drag_reorder")}">☰</span>
      <span class="pdf-file-icon">${getFileIcon(f.ext)}</span>
      <span class="pdf-file-name">${escHtml(f.name)}</span>
      <span class="pdf-file-size">${formatFileSize(f.size)}</span>
      <span class="pdf-file-status ${statusClass}">${statusText}</span>
      <button class="pdf-file-preview-btn" data-id="${f.id}" title="${t("common.preview")}">${t("common.preview")}</button>
      <button class="pdf-file-remove" data-id="${f.id}" title="${t("pdf.remove")}">✕</button>
    </div>`;
  });
  $pdfFileList.html(html);

  // 이벤트
  $pdfFileList.find(".pdf-file-remove").on("click", function() {
    pdfFiles = pdfFiles.filter(function(f) { return f.id !== parseInt($(this).data("id")); }.bind(this));
    renderFileList();
  });
  $pdfFileList.find(".pdf-file-preview-btn").on("click", function() {
    showPreview(parseInt($(this).data("id")));
  });

  // 드래그 순서 변경
  initDragSort();
}

function escHtml(s) {
  var $d = $("<div>");
  $d.text(s);
  return $d.html();
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
  $pdfFileList.find(".pdf-file-item").each(function() {
    var $item = $(this);
    $item.attr("draggable", true);
    $item.on("dragstart", function(e) {
      dragItem = this;
      $item.addClass("pdf-dragging");
      e.originalEvent.dataTransfer.effectAllowed = "move";
    });
    $item.on("dragend", function() {
      $item.removeClass("pdf-dragging");
      $pdfFileList.find(".pdf-file-item").removeClass("pdf-dragover");
      dragItem = null;
      // DOM 순서에 맞게 pdfFiles 재정렬
      var newOrder = $pdfFileList.find(".pdf-file-item").toArray().map(function(el) { return parseInt($(el).data("id")); });
      pdfFiles.sort(function(a, b) { return newOrder.indexOf(a.id) - newOrder.indexOf(b.id); });
    });
    $item.on("dragover", function(e) {
      e.preventDefault();
      e.originalEvent.dataTransfer.dropEffect = "move";
      if (this !== dragItem) $item.addClass("pdf-dragover");
    });
    $item.on("dragleave", function() { $item.removeClass("pdf-dragover"); });
    $item.on("drop", function(e) {
      e.preventDefault();
      $item.removeClass("pdf-dragover");
      if (!dragItem || dragItem === this) return;
      var items = $pdfFileList.find(".pdf-file-item").toArray();
      var fromIdx = items.indexOf(dragItem);
      var toIdx = items.indexOf(this);
      if (fromIdx < toIdx) $(dragItem).insertAfter($item);
      else $(dragItem).insertBefore($item);
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
    entry.htmlContent = `<p style="color:red">${t("pdf.convert_fail", {msg: escHtml(e.message)})}</p>`;
  }
  renderFileList();
}

function blobToDataUrl(blob) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function serverConvert(arrayBuffer, url) {
  var formData = new FormData();
  formData.append("file", new Blob([arrayBuffer]));
  return new Promise(function(resolve, reject) {
    $.ajax({
      url: url,
      method: "POST",
      data: formData,
      processData: false,
      contentType: false,
      dataType: "json"
    }).done(function(data) {
      if (!data.ok) { reject(new Error(data.error || t("pdf.server_fail"))); return; }
      resolve(data.html);
    }).fail(function(jqXHR, textStatus, errorThrown) {
      reject(new Error(errorThrown || t("pdf.server_fail")));
    });
  });
}

// ── 미리보기 ──
async function showPreview(fileId) {
  const file = pdfFiles.find(function(f) { return f.id === fileId; });
  if (!file || !file.htmlContent) return;
  $pdfPreview.css("display", "");
  $pdfPreview.html(`<div class="pdf-preview-header">
    <span>${t("pdf.preview_title", {name: escHtml(file.name)})}</span>
    <button class="pdf-preview-close" id="pdfPreviewClose">${t("common.close")}</button>
  </div>
  <div class="pdf-preview-content">${file.htmlContent}</div>`);
  $("#pdfPreviewClose").on("click", function() {
    $pdfPreview.hide();
  });
  // mermaid 다이어그램 렌더링
  if (file.ext === "md" && typeof mermaid !== "undefined") {
    var $blocks = $pdfPreview.find(".mermaid");
    for (var i = 0; i < $blocks.length; i++) {
      var el = $blocks[i];
      var $el = $(el);
      if ($el.data("processed")) continue;
      var code = $el.text();
      $el.data("processed", "true");
      try {
        var result = await mermaid.render("pdf-mermaid-" + Date.now() + Math.random().toString(36).slice(2), code);
        $el.html(result.svg);
      } catch (e) {
        $el.html(`<pre style="color:#bf233a;font-size:12px">${t("md.mermaid_error", {msg: e.message || e})}</pre>`);
      }
    }
  }
}

// ── 컨테이너 내 mermaid 다이어그램 렌더링 ──
async function renderMermaidInContainer(container) {
  if (typeof mermaid === "undefined") return;
  var $blocks = $(container).find(".mermaid");
  for (var i = 0; i < $blocks.length; i++) {
    var el = $blocks[i];
    var $el = $(el);
    if ($el.data("processed")) continue;
    var code = $el.text();
    $el.data("processed", "true");
    try {
      var result = await mermaid.render("pdf-mermaid-" + Date.now() + "-" + i, code);
      $el.html(result.svg);
    } catch (e) {
      $el.html('<pre style="color:#bf233a;font-size:12px">' + t("md.mermaid_error", {msg: e.message || e}) + '</pre>');
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
    var ratio = h.top / containerH;
    var totalContentH = totalPages * contentH;
    var absY = ratio * totalContentH;
    var page = Math.min(Math.floor(absY / contentH) + 1, totalPages);
    var yInPage = margin + (absY - (page - 1) * contentH);

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
    margin: parseInt($("#pdfMargin").val()),
    image: { type: "jpeg", quality: 0.95 },
    enableLinks: true,
    pagebreak: { mode: ["avoid-all", "css"], avoid: ["h1","h2","h3","h4","h5","h6","p","li","tr","td","th","pre","blockquote","code",".mermaid","img","figure","dl","dt","dd"] },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: {
      unit: "mm",
      format: $("#pdfPageSize").val(),
      orientation: $("#pdfOrientation").val()
    }
  };
}

// ── 개별 변환 ──
$("#pdfConvertBtn").on("click", async function() {
  const readyFiles = pdfFiles.filter(function(f) { return f.status === "ready"; });
  if (!readyFiles.length) { setPdfStatus(t("pdf.no_files"), true); return; }
  setPdfStatus(t("pdf.converting", {count: readyFiles.length}));
  const opts = getPdfOptions();

  for (const file of readyFiles) {
    try {
      const $container = $("<div>");
      $container.addClass("pdf-preview-content");
      $container.html(file.htmlContent);
      $container.css({ "max-height": "none", "overflow": "visible", "padding": "10px" });
      $("body").append($container);
      var container = $container[0];
      // h2 페이지 분리 옵션
      if ($("#pdfPageBreakH2").prop("checked")) {
        var $h2s = $container.find("h2");
        $h2s.each(function(i) { if (i > 0) $(this).css("break-before", "page"); });
      }
      // 앵커 링크(#...)는 PDF에서 localhost URL로 변환되므로 링크 해제
      $container.find('a[href^="#"]').each(function() {
        var $a = $(this);
        var $span = $("<span>");
        $span.html($a.html());
        $span.css("color", $a.css("color") || "");
        $a.replaceWith($span);
      });
      // mermaid 다이어그램 렌더링
      await renderMermaidInContainer(container);
      const filename = file.name.replace(/\.\w+$/, "") + ".pdf";
      // heading 위치 수집 (PDF 아웃라인용) - getBoundingClientRect 기준
      var containerRect = container.getBoundingClientRect();
      var headings = [];
      $container.find("h1,h2").each(function() {
        headings.push({ text: $(this).text().trim(), depth: parseInt(this.tagName[1]), top: this.getBoundingClientRect().top - containerRect.top });
      });
      var containerH = containerRect.height;
      // toPdf 후 outline 추가, 그 다음 save
      var worker = html2pdf().set({ ...opts, filename }).from(container);
      await worker.toPdf().get("pdf").then(function(pdf) {
        addOutlineFromHeadings(pdf, headings, containerH, opts);
      }).save();
      $container.remove();
    } catch (e) {
      console.error("PDF generation error:", e);
      setPdfStatus(t("pdf.file_fail", {name: file.name, msg: e.message}), true);
      return;
    }
  }
  setPdfStatus(t("pdf.convert_done", {count: readyFiles.length}));
});

// ── 병합 변환 ──
$("#pdfMergeBtn").on("click", async function() {
  const readyFiles = pdfFiles.filter(function(f) { return f.status === "ready"; });
  if (readyFiles.length < 2) { setPdfStatus(t("pdf.merge_min"), true); return; }
  setPdfStatus(t("pdf.merging", {count: readyFiles.length}));
  const opts = getPdfOptions();

  const $container = $("<div>");
  $container.addClass("pdf-preview-content");
  $container.css({ "max-height": "none", "overflow": "visible", "padding": "10px" });
  readyFiles.forEach(function(file, i) {
    var $section = $("<div>");
    if (i > 0) $section.css("page-break-before", "always");
    $section.html(file.htmlContent);
    $container.append($section);
  });

  $("body").append($container);
  var container = $container[0];
  // mermaid 다이어그램 렌더링
  await renderMermaidInContainer(container);
  // h2 페이지 분리 옵션
  if ($("#pdfPageBreakH2").prop("checked")) {
    $container.find("h2").each(function() { $(this).css("break-before", "page"); });
  }
  // 앵커 링크(#...)는 PDF에서 localhost URL로 변환되므로 링크 해제
  $container.find('a[href^="#"]').each(function() {
    var $a = $(this);
    var $span = $("<span>");
    $span.html($a.html());
    $span.css("color", $a.css("color") || "");
    $a.replaceWith($span);
  });
  // heading 위치 수집 (PDF 아웃라인용)
  var containerRect = container.getBoundingClientRect();
  var headings = [];
  $container.find("h1,h2").each(function() {
    headings.push({ text: $(this).text().trim(), depth: parseInt(this.tagName[1]), top: this.getBoundingClientRect().top - containerRect.top });
  });
  var containerH = containerRect.height;
  try {
    var worker = html2pdf().set({ ...opts, filename: "merged.pdf" }).from(container);
    await worker.toPdf().get("pdf").then(function(pdf) {
      addOutlineFromHeadings(pdf, headings, containerH, opts);
    }).save();
    setPdfStatus(t("pdf.merge_done", {count: readyFiles.length}));
  } catch (e) {
    setPdfStatus(t("pdf.merge_fail", {msg: e.message}), true);
  }
  $container.remove();
});

// ── 전체 제거 ──
$("#pdfClearBtn").on("click", function() {
  pdfFiles = [];
  pdfNextId = 0;
  renderFileList();
  $pdfPreview.hide();
  setPdfStatus("");
});

// ── Markdown 저장 파일 연동 ──
const $pdfMdSaveSelect = $("#pdfMdSaveSelect");
const $pdfLoadMdSaveBtn = $("#pdfLoadMdSaveBtn");

$pdfLoadMdSaveBtn.on("click", async function() {
  if ($pdfMdSaveSelect.css("display") !== "none") {
    $pdfMdSaveSelect.hide();
    return;
  }
  try {
    const data = await $.getJSON("/api/md/saves");
    if (!data || !data.length) { setPdfStatus(t("pdf.no_md_saved"), true); return; }
    $pdfMdSaveSelect.html('<option value="">-- ' + t("common.file_select") + ' --</option>');
    data.forEach(function(item) {
      $pdfMdSaveSelect.append($("<option>").val(item.id).text(item.name));
    });
    $pdfMdSaveSelect.css("display", "");
  } catch (e) {
    setPdfStatus(t("pdf.md_list_fail"), true);
  }
});

$pdfMdSaveSelect.on("change", async function() {
  const id = $pdfMdSaveSelect.val();
  if (!id) return;
  try {
    const item = await $.getJSON("/api/md/saves/" + id);

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
    $pdfMdSaveSelect.hide();
    setPdfStatus(t("pdf.md_added", {name: item.name}));
  } catch (e) {
    setPdfStatus(t("pdf.md_load_fail"), true);
  }
});

})();
