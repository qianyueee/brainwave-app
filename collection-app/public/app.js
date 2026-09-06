// 素材收藏 · 前端逻辑（原生 ES 模块，无框架）
import { classify, mediaKind, isHttpUrl, ratioLabel } from "./classify.js";
import { analyzeImageFile, analyzeVideoFile, loadImageFromUrl, analyzeImageElement } from "./analyze.js";

const state = { dir: "", categories: [], items: [], filter: "all", query: "", selectedId: null };
const $ = (sel) => document.querySelector(sel);
const MAX_TOASTS = 4;
const CAT_COLORS = { cover: "var(--c-cover)", photo: "var(--c-photo)", video: "var(--c-video)", motion: "var(--c-motion)", misc: "var(--c-misc)" };

// ---------------------------------------------------------------- API

async function api(path, { method = "GET", json, body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (json !== undefined) { init.body = JSON.stringify(json); init.headers["content-type"] = "application/json"; }
  else if (body !== undefined) init.body = body;
  const r = await fetch(path, init);
  let data = null;
  try { data = await r.json(); } catch { data = null; }
  if (!r.ok) throw new Error((data && data.error) || `${r.status} ${r.statusText}`);
  return data;
}

const fileUrl = (rel) => "/files/" + rel.split("/").map(encodeURIComponent).join("/");
const catOf = (key) => state.categories.find((c) => c.key === key);
const catLabel = (key) => (catOf(key) || {}).label || key;
const catColor = (key) => CAT_COLORS[key] || "var(--c-misc)";

function upsert(item) {
  const i = state.items.findIndex((x) => x.id === item.id);
  if (i >= 0) state.items[i] = item; else state.items.unshift(item);
  render();
  if (state.selectedId === item.id) fillDrawer(item);
}

async function load() {
  const d = await api("/api/library");
  state.dir = d.dir; state.categories = d.categories; state.items = d.items;
  $("#lib-path").textContent = d.dir;
  render();
  for (const it of state.items) if (it.needsAnalysis) analyzeServerItem(it);
}

// ---------------------------------------------------------------- 收藏入口

async function addFiles(files, extra = {}) {
  for (const f of files) {
    try { await addFile(f, extra); } catch (e) { toast(`收藏失败：${f.name} — ${e.message}`, { error: true }); }
  }
}

async function addFile(file, extra = {}) {
  const kind = mediaKind(file.type, file.name);
  const meta = { name: file.name, mime: file.type || "", kind, url: extra.url || null };
  const t = toast(`正在分析 ${file.name} …`, { sticky: true });
  try {
    if (kind === "image") { const a = await analyzeImageFile(file); if (a) Object.assign(meta, a); }
    if (kind === "video") { const a = await analyzeVideoFile(file); if (a) Object.assign(meta, a); }
    const auto = classify(meta);
    meta.autoCategory = auto.category; meta.autoReason = auto.reason; meta.category = auto.category;
    const r = await api("/api/items/file", {
      method: "POST", body: file,
      headers: { "content-type": file.type || "application/octet-stream", "x-item-meta": encodeURIComponent(JSON.stringify(meta)) },
    });
    upsert(r.item); announce(r);
  } finally { t.remove(); }
}

async function addLink(url) {
  const t = toast(`正在抓取 ${url} …`, { sticky: true });
  try {
    const r = await api("/api/items/link", { method: "POST", json: { url } });
    upsert(r.item); announce(r);
    if (r.item.needsAnalysis) analyzeServerItem(r.item);
  } catch (e) { toast(`收藏失败：${e.message}`, { error: true }); }
  finally { t.remove(); }
}

async function addText(text) {
  try { const r = await api("/api/items/text", { method: "POST", json: { text } }); upsert(r.item); announce(r); }
  catch (e) { toast(`收藏失败：${e.message}`, { error: true }); }
}

function announce({ item, duplicate }) {
  if (duplicate) return toast(`已经收藏过了：${item.title}`, { action: "查看", onAction: () => openDrawer(item.id) });
  toast(`已收藏为「${catLabel(item.category)}」 · ${item.autoReason}`, { action: "不对？改分类", onAction: () => openDrawer(item.id) });
}

/** 服务端下载的图片/视频没有尺寸信息，这里补一遍分析，并在分类未被人改过时重新自动分类。 */
async function analyzeServerItem(item) {
  try {
    let a = null;
    if (item.kind === "image") { const img = await loadImageFromUrl(fileUrl(item.file)); a = analyzeImageElement(img); }
    else if (item.kind === "video") {
      a = await new Promise((resolve) => {
        const v = document.createElement("video"); v.preload = "metadata"; v.muted = true;
        const t = setTimeout(() => resolve(null), 6000);
        v.onloadedmetadata = () => { clearTimeout(t); resolve({ width: v.videoWidth, height: v.videoHeight, duration: isFinite(v.duration) ? v.duration : null }); };
        v.onerror = () => { clearTimeout(t); resolve(null); };
        v.src = fileUrl(item.file);
      });
    }
    const patch = { needsAnalysis: false };
    if (a) {
      Object.assign(patch, a);
      const auto = classify({ kind: item.kind, name: item.file.split("/").pop(), mime: item.mime, url: item.url, ...a });
      patch.autoCategory = auto.category; patch.autoReason = auto.reason;
      if (item.category === item.autoCategory) patch.category = auto.category; // 用户没改过才跟着变
    }
    const r = await api(`/api/items/${item.id}`, { method: "PATCH", json: patch });
    upsert(r.item);
  } catch { /* 分析失败就保持原样 */ }
}

// ---------------------------------------------------------------- 拖放 / 粘贴

let dragDepth = 0;
window.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; $("#drop-overlay").hidden = false; });
window.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
window.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $("#drop-overlay").hidden = true; });
window.addEventListener("drop", (e) => {
  e.preventDefault(); dragDepth = 0; $("#drop-overlay").hidden = true;
  handleTransfer(e.dataTransfer);
});

document.addEventListener("paste", (e) => {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
  if (e.clipboardData) handleTransfer(e.clipboardData);
});

function handleTransfer(dt) {
  const files = [...(dt.files || [])];
  const uriList = (dt.getData("text/uri-list") || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const text = (dt.getData("text/plain") || "").trim();
  if (files.length) {
    // 从网页拖图片进来时，Chrome 会同时给文件和它的来源网址——把网址一起记下来
    const src = files.length === 1 && uriList[0] && isHttpUrl(uriList[0]) ? uriList[0] : null;
    return addFiles(files, { url: src });
  }
  const urls = uriList.filter(isHttpUrl);
  if (urls.length) return urls.forEach((u) => addLink(u));
  if (isHttpUrl(text)) return addLink(text);
  const html = dt.getData("text/html") || "";
  const img = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  if (img && isHttpUrl(img[1])) return addLink(img[1]);
  if (text) return addText(text);
}

$("#file-input").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });
$("#link-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#link-input").value.trim();
  if (!v) return;
  if (!isHttpUrl(v)) return toast("请输入以 http(s):// 开头的链接", { error: true });
  $("#link-input").value = "";
  addLink(v);
});

// ---------------------------------------------------------------- 渲染

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "style") n.style.cssText = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of [].concat(children)) if (c != null) n.append(c);
  return n;
}

function visibleItems() {
  const q = state.query.toLowerCase();
  return state.items.filter((it) => {
    if (state.filter !== "all" && it.category !== state.filter) return false;
    if (!q) return true;
    return [it.title, it.note, it.url, it.text, it.og && it.og.description, it.file].filter(Boolean).some((s) => String(s).toLowerCase().includes(q));
  });
}

function render() {
  renderTabs();
  const items = visibleItems();
  const grid = $("#grid");
  grid.replaceChildren(...items.map(renderCard));
  $("#empty").hidden = state.items.length > 0;
}

function renderTabs() {
  const counts = {};
  for (const it of state.items) counts[it.category] = (counts[it.category] || 0) + 1;
  const tabs = [
    el("button", { class: `tab${state.filter === "all" ? " active" : ""}`, onclick: () => { state.filter = "all"; render(); } }, ["全部", el("span", { class: "count", text: String(state.items.length) })]),
    ...state.categories.map((c) => el("button", {
      class: `tab${state.filter === c.key ? " active" : ""}`, title: c.hint || "", style: `--cat-color:${catColor(c.key)}`,
      onclick: () => { state.filter = c.key; render(); },
    }, [el("span", { class: "dot" }), c.label, el("span", { class: "count", text: String(counts[c.key] || 0) })])),
    el("button", { class: "tab add", onclick: addCategory }, "＋ 新分类"),
  ];
  $("#tabs").replaceChildren(...tabs);
}

function fmtDuration(s) { if (s == null) return ""; s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function fmtSize(b) { if (b == null) return ""; if (b < 1024) return `${b} B`; if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`; return `${(b / 1048576).toFixed(1)} MB`; }
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }

function thumbFor(it, big = false) {
  if (it.kind === "image" && it.file) return el("img", { src: fileUrl(it.file), alt: it.title, loading: big ? null : "lazy" });
  if (it.kind === "video" && it.file) {
    const v = el("video", { src: fileUrl(it.file), preload: "metadata", muted: true, playsinline: true, controls: big || null });
    if (big) return v;
    return [v, el("span", { class: "play", text: "▶" }), it.duration != null ? el("span", { class: "dur", text: fmtDuration(it.duration) }) : null];
  }
  if (it.preview) return el("img", { class: big ? null : "preview", src: fileUrl(it.preview), alt: it.title, loading: big ? null : "lazy" });
  if (it.kind === "text") return el("div", { class: "ph text", text: it.text });
  if (it.kind === "link") return el("div", { class: "ph", text: (hostOf(it.url) || "🔗").slice(0, 1).toUpperCase() });
  if (it.kind === "lottie") return el("div", { class: "ph", text: "✦" });
  return el("div", { class: "ph", text: "📄" });
}

function renderCard(it) {
  const corrected = it.autoCategory && it.autoCategory !== it.category;
  const metaBits = [];
  if (it.width && it.height) metaBits.push(ratioLabel(it.width, it.height));
  if (it.kind === "link" && it.url) metaBits.push(hostOf(it.url));
  if (it.kind === "video" && it.duration != null) metaBits.push(fmtDuration(it.duration));
  return el("article", { class: `card${state.selectedId === it.id ? " selected" : ""}`, "data-id": it.id, onclick: () => openDrawer(it.id) }, [
    el("div", { class: "thumb" }, thumbFor(it)),
    el("div", { class: "card-body" }, [
      el("h3", { class: "card-title", text: it.title || "(无标题)" }),
      el("div", { class: "card-meta" }, [
        el("span", { class: `chip${corrected ? " corrected" : ""}`, style: `--cat-color:${catColor(it.category)}`, title: corrected ? `自动分类是「${catLabel(it.autoCategory)}」，已手动改正` : it.autoReason, text: catLabel(it.category) }),
        ...metaBits.map((b) => el("span", { text: b })),
      ]),
      it.note ? el("p", { class: "card-note", text: it.note }) : null,
    ]),
  ]);
}

// ---------------------------------------------------------------- 详情抽屉

let saveTimer = null;
const drawer = $("#drawer");

function openDrawer(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  state.selectedId = id;
  fillDrawer(it);
  drawer.hidden = false;
  document.querySelectorAll(".card").forEach((c) => c.classList.toggle("selected", c.dataset.id === id));
}

function closeDrawer() { state.selectedId = null; drawer.hidden = true; document.querySelectorAll(".card.selected").forEach((c) => c.classList.remove("selected")); }
$("#d-close").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) closeDrawer(); });

const KIND_LABEL = { image: "图片", video: "视频文件", link: "链接", text: "文字", lottie: "Lottie", other: "文件" };

function fillDrawer(it) {
  $("#d-kind").textContent = KIND_LABEL[it.kind] || it.kind;
  $("#d-preview").replaceChildren(...[].concat(thumbFor(it, true)));
  if ($("#d-title").value !== it.title) $("#d-title").value = it.title || "";
  if ($("#d-note").value !== it.note) $("#d-note").value = it.note || "";
  const urlBox = $("#d-url");
  urlBox.replaceChildren(...(it.url ? [el("a", { href: it.url, target: "_blank", rel: "noopener", text: it.url })] : []));
  $("#d-cats").replaceChildren(...state.categories.map((c) => el("button", {
    class: "cat-btn", role: "radio", "aria-checked": String(c.key === it.category), style: `--cat-color:${catColor(c.key)}`, title: c.hint || "",
    onclick: () => changeCategory(it.id, c.key),
  }, [el("span", { class: "dot" }), c.label])));
  const corrected = it.autoCategory && it.autoCategory !== it.category;
  $("#d-auto").textContent = it.autoReason ? `自动分类：「${catLabel(it.autoCategory)}」 — ${it.autoReason}${corrected ? "（已手动改正）" : ""}` : "";

  const rows = [];
  if (it.file) rows.push(["文件", it.file]);
  if (it.width && it.height) rows.push(["尺寸", `${it.width} × ${it.height}（${ratioLabel(it.width, it.height)}）`]);
  if (it.duration != null) rows.push(["时长", fmtDuration(it.duration)]);
  if (it.size != null) rows.push(["大小", fmtSize(it.size)]);
  if (it.mime) rows.push(["类型", it.mime]);
  if (it.og && it.og.siteName) rows.push(["站点", it.og.siteName]);
  if (it.og && it.og.description) rows.push(["简介", it.og.description]);
  if (it.analysis && it.analysis.band) rows.push(["结构", `${it.analysis.band.side === "bottom" ? "下方" : "上方"}文字带 ${Math.round(it.analysis.band.ratio * 100)}%，底色覆盖 ${Math.round(it.analysis.band.coverage * 100)}%`]);
  rows.push(["收藏于", new Date(it.addedAt).toLocaleString()]);
  $("#d-meta").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { text: k }), el("dd", { text: v })]));

  const open = $("#d-open");
  if (it.file) { open.href = fileUrl(it.file); open.hidden = false; } else { open.hidden = true; }
  $("#d-reveal").textContent = it.file ? "在文件夹中显示" : "打开素材库文件夹";
}

async function changeCategory(id, key) {
  const it = state.items.find((x) => x.id === id);
  if (!it || it.category === key) return;
  try {
    const r = await api(`/api/items/${id}`, { method: "PATCH", json: { category: key } });
    upsert(r.item);
    toast(`已改为「${catLabel(key)}」${r.item.file ? "，文件已移到对应文件夹" : ""}`);
  } catch (e) { toast(`改分类失败：${e.message}`, { error: true }); }
}

function scheduleSave() {
  const id = state.selectedId;
  if (!id) return;
  $("#d-save").textContent = "编辑中…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveFields(id), 600);
}

async function saveFields(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  const patch = {};
  const title = $("#d-title").value.trim();
  const note = $("#d-note").value;
  if (title !== it.title) patch.title = title;
  if (note !== it.note) patch.note = note;
  if (!Object.keys(patch).length) { $("#d-save").textContent = ""; return; }
  try {
    const r = await api(`/api/items/${id}`, { method: "PATCH", json: patch });
    const i = state.items.findIndex((x) => x.id === id);
    if (i >= 0) state.items[i] = r.item;
    render();
    $("#d-save").textContent = "已保存";
    setTimeout(() => { if ($("#d-save").textContent === "已保存") $("#d-save").textContent = ""; }, 1500);
  } catch (e) { $("#d-save").textContent = "保存失败"; toast(`保存失败：${e.message}`, { error: true }); }
}

$("#d-title").addEventListener("input", scheduleSave);
$("#d-note").addEventListener("input", scheduleSave);
$("#d-title").addEventListener("blur", () => { clearTimeout(saveTimer); if (state.selectedId) saveFields(state.selectedId); });
$("#d-note").addEventListener("blur", () => { clearTimeout(saveTimer); if (state.selectedId) saveFields(state.selectedId); });

$("#d-reveal").addEventListener("click", async () => {
  if (!state.selectedId) return;
  try { await api(`/api/items/${state.selectedId}/reveal`, { method: "POST" }); } catch (e) { toast(e.message, { error: true }); }
});

$("#d-delete").addEventListener("click", async () => {
  const it = state.items.find((x) => x.id === state.selectedId);
  if (!it) return;
  if (!confirm(`删除「${it.title}」？\n原文件会移到素材库的 .trash 文件夹，不会真的删掉。`)) return;
  try {
    await api(`/api/items/${it.id}`, { method: "DELETE" });
    state.items = state.items.filter((x) => x.id !== it.id);
    closeDrawer(); render();
    toast("已移到回收站（.trash）");
  } catch (e) { toast(`删除失败：${e.message}`, { error: true }); }
});

async function addCategory() {
  const label = prompt("新分类的名字（同时会在素材库里建一个同名文件夹）：");
  if (!label || !label.trim()) return;
  try {
    const r = await api("/api/categories", { method: "POST", json: { label: label.trim() } });
    state.categories.push(r.category);
    render();
    if (state.selectedId) { const it = state.items.find((x) => x.id === state.selectedId); if (it) fillDrawer(it); }
    toast(`已新建分类「${r.category.label}」`);
  } catch (e) { toast(`新建失败：${e.message}`, { error: true }); }
}

// ---------------------------------------------------------------- 搜索 / 提示

$("#search").addEventListener("input", (e) => { state.query = e.target.value.trim(); render(); });

function toast(msg, { action, onAction, error, sticky } = {}) {
  const node = el("div", { class: `toast${error ? " error" : ""}` }, [
    el("span", { class: "msg", text: msg }),
    action ? el("button", { class: "act", text: action, onclick: () => { onAction && onAction(); node.remove(); } }) : null,
  ]);
  const box = $("#toasts");
  box.append(node);
  while (box.children.length > MAX_TOASTS) box.firstElementChild.remove(); // 连拖一堆文件时不让提示堆成墙
  if (!sticky) setTimeout(() => node.remove(), error ? 7000 : 4500);
  return node;
}

load().catch((e) => toast(`无法读取素材库：${e.message}`, { error: true, sticky: true }));
