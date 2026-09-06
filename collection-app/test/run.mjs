// 测试：分类规则 + 服务端接口（node --test 风格，零依赖）
//   node test/run.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classify, ratioLabel, mediaKind, isHttpUrl } from "../public/classify.js";
import { parseMeta } from "../server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

// ---------------------------------------------------------------- 规则

test("链接按站点分类", () => {
  assert.equal(classify({ kind: "link", url: "https://www.youtube.com/watch?v=abc" }).category, "video");
  assert.equal(classify({ kind: "link", url: "https://b23.tv/xyz" }).category, "video");
  assert.equal(classify({ kind: "link", url: "https://dribbble.com/shots/1" }).category, "motion");
  assert.equal(classify({ kind: "link", url: "https://unsplash.com/photos/1" }).category, "photo");
  assert.equal(classify({ kind: "link", url: "https://www.instagram.com/reel/abc/" }).category, "video");
  assert.equal(classify({ kind: "link", url: "https://example.com/post", og: { type: "video.other" } }).category, "video");
  const misc = classify({ kind: "link", url: "https://example.com/post" });
  assert.equal(misc.category, "misc");
  assert.match(misc.reason, /example\.com/);
});

test("图片：文字带 → 封面标题；否则照片；GIF → 动效", () => {
  const cover = classify({ kind: "image", name: "a.png", mime: "image/png", width: 1080, height: 1350, analysis: { band: { side: "bottom", ratio: 0.28, coverage: 0.9 } } });
  assert.equal(cover.category, "cover");
  assert.match(cover.reason, /底部 28%/);
  assert.equal(classify({ kind: "image", name: "IMG_0042.jpg", mime: "image/jpeg", width: 4032, height: 3024, analysis: { band: null } }).category, "photo");
  assert.equal(classify({ kind: "image", name: "Screenshot 2026-09-06.png", mime: "image/png", analysis: { band: null } }).category, "cover");
  assert.equal(classify({ kind: "image", name: "fun.gif", mime: "image/gif" }).category, "motion");
  assert.equal(classify({ kind: "image", name: "x.webp", mime: "image/webp", width: 1600, height: 900 }).reason, "16:9 的普通图片");
});

test("视频：录屏且短 → 动效；录屏长 → 视频；普通视频 → 视频", () => {
  assert.equal(classify({ kind: "video", name: "Screen Recording 2026-09-06.mov", mime: "video/quicktime", width: 886, height: 1920, duration: 8 }).category, "motion");
  assert.equal(classify({ kind: "video", name: "Screen Recording 2026-09-06.mov", mime: "video/quicktime", width: 886, height: 1920, duration: 95 }).category, "video");
  assert.equal(classify({ kind: "video", name: "clip.mp4", mime: "video/mp4", width: 1170, height: 2532, duration: 5 }).category, "motion");
  assert.equal(classify({ kind: "video", name: "IMG_1234.MOV", mime: "video/quicktime", width: 1920, height: 1080, duration: 12 }).category, "video");
  assert.equal(classify({ kind: "video", name: "capture.webm", mime: "video/webm", duration: 3 }).category, "motion");
});

test("其它种类", () => {
  assert.equal(classify({ kind: "text" }).category, "misc");
  assert.equal(classify({ kind: "lottie", name: "anim.lottie" }).category, "motion");
  assert.equal(classify({ kind: "other", name: "x.bin" }).category, "misc");
});

test("辅助函数", () => {
  assert.equal(ratioLabel(1920, 1080), "16:9");
  assert.equal(ratioLabel(1080, 1440), "3:4");
  assert.equal(ratioLabel(1000, 1000), "1:1");
  assert.equal(ratioLabel(1000, 613), "1000×613");
  assert.equal(mediaKind("", "a.HEIC"), "image");
  assert.equal(mediaKind("video/mp4", "x"), "video");
  assert.equal(mediaKind("", "walk.lottie"), "lottie");
  assert.equal(isHttpUrl(" https://a.b/c "), true);
  assert.equal(isHttpUrl("ftp://a.b"), false);
});

test("Open Graph 解析（属性顺序 / 单引号 / 实体 / 相对路径）", () => {
  const html = `<html><head><title>Fallback &amp; Title</title>
    <meta content="OG Title &#x1F600;" property="og:title">
    <meta property='og:image' content='/cover.jpg'>
    <meta name="description" content="desc">
    <meta property="og:type" content="video.other"></head></html>`;
  const m = parseMeta(html, "https://site.example/a/b");
  assert.equal(m.title, "OG Title 😀");
  assert.equal(m.image, "https://site.example/cover.jpg");
  assert.equal(m.description, "desc");
  assert.equal(m.type, "video.other");
  assert.equal(parseMeta("<title> only\n title </title>", "https://x.y").title, "only title");
});

// ---------------------------------------------------------------- 服务端接口

function startMockSite() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.url === "/page") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(`<html><head><title>T</title><meta property="og:title" content="一篇好文章"><meta property="og:image" content="/og.png"><meta property="og:site_name" content="MockSite"></head><body>hi</body></html>`);
      }
      if (req.url === "/og.png" || req.url === "/direct.png") { res.writeHead(200, { "content-type": "image/png" }); return res.end(PNG_1x1); }
      if (req.url === "/video") { res.writeHead(200, { "content-type": "text/html" }); return res.end(`<meta property="og:type" content="video.movie"><meta property="og:title" content="片子">`); }
      res.writeHead(404); res.end();
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

function startApp(dir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(here, "..", "server.mjs"), "--dir", dir, "--port", "0"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; const m = /http:\/\/[\d.]+:(\d+)/.exec(out); if (m) resolve({ child, base: `http://127.0.0.1:${m[1]}` }); });
    child.stderr.on("data", (d) => process.stderr.write(d));
    child.on("exit", (c) => reject(new Error("server exited " + c)));
  });
}

test("接口：收藏文件 / 链接 / 改分类移动文件 / 删除进回收站 / 新分类 / Range", async (t) => {
  const dir = path.join(here, "tmp", "lib-" + Date.now());
  const mock = await startMockSite();
  const app = await startApp(dir);
  t.after(() => { app.child.kill(); mock.srv.close(); });
  const j = async (p, init) => { const r = await fetch(app.base + p, init); const body = await r.json().catch(() => null); return { status: r.status, body }; };

  // 初始库
  let lib = await j("/api/library");
  assert.equal(lib.status, 200);
  assert.deepEqual(lib.body.categories.map((c) => c.key), ["cover", "photo", "video", "motion", "misc"]);
  for (const c of lib.body.categories) assert.ok(fs.existsSync(path.join(dir, c.label)), "分类文件夹 " + c.label);

  // 文件（前端已算好分类）
  const meta = { name: "封面 样本.png", mime: "image/png", kind: "image", width: 1080, height: 1350, category: "cover", autoCategory: "cover", autoReason: "测试", analysis: { band: { side: "bottom", ratio: 0.3, coverage: 0.9 } } };
  let r = await j("/api/items/file", { method: "POST", body: PNG_1x1, headers: { "content-type": "image/png", "x-item-meta": encodeURIComponent(JSON.stringify(meta)) } });
  assert.equal(r.status, 201);
  const item = r.body.item;
  assert.equal(item.category, "cover");
  assert.equal(item.title, "封面_样本");
  assert.match(item.file, /^封面标题\/.+-封面_样本\.png$/);
  assert.ok(fs.existsSync(path.join(dir, item.file)));
  assert.equal(item.size, PNG_1x1.length);
  assert.equal(item.sha256.length, 64);

  // 同一文件再传 → 去重
  r = await j("/api/items/file", { method: "POST", body: PNG_1x1, headers: { "content-type": "image/png", "x-item-meta": encodeURIComponent(JSON.stringify({ ...meta, name: "again.png" })) } });
  assert.equal(r.status, 200); assert.equal(r.body.duplicate, true); assert.equal(r.body.item.id, item.id);
  assert.equal((await fsp.readdir(path.join(dir, ".tmp"))).length, 0, "临时文件已清理");

  // 未给分类时由服务端分类
  r = await j("/api/items/file", { method: "POST", body: Buffer.concat([PNG_1x1, Buffer.from("x")]), headers: { "content-type": "image/gif", "x-item-meta": encodeURIComponent(JSON.stringify({ name: "loop.gif", mime: "image/gif" })) } });
  assert.equal(r.body.item.category, "motion");

  // 网页链接 → og 标题 + 预览图缓存
  r = await j("/api/items/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: mock.base + "/page" }) });
  assert.equal(r.status, 201);
  const link = r.body.item;
  assert.equal(link.kind, "link"); assert.equal(link.title, "一篇好文章"); assert.equal(link.category, "misc");
  assert.match(link.preview, /^_previews\/.+\.png$/); assert.ok(fs.existsSync(path.join(dir, link.preview)));
  assert.equal(link.og.siteName, "MockSite");
  r = await j("/api/items/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: mock.base + "/page" }) });
  assert.equal(r.body.duplicate, true);

  // og:type video → 视频
  r = await j("/api/items/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: mock.base + "/video" }) });
  assert.equal(r.body.item.category, "video"); assert.equal(r.body.item.title, "片子");

  // 直接指向图片的链接 → 下载成文件条目，等前端补分析
  r = await j("/api/items/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: mock.base + "/direct.png" }) });
  assert.equal(r.status, 200, "内容与已收藏文件相同 → 去重");
  assert.equal(r.body.duplicate, true);

  // 抓不到的链接也能收藏
  r = await j("/api/items/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "http://127.0.0.1:1/nothing" }) });
  assert.equal(r.status, 201); assert.equal(r.body.item.fetchFailed, true); assert.equal(r.body.item.title, "127.0.0.1");

  // 文字
  r = await j("/api/items/text", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "一句好标题\n第二行" }) });
  assert.equal(r.body.item.title, "一句好标题"); assert.equal(r.body.item.kind, "text");

  // 改分类 → 文件移动
  r = await j(`/api/items/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "photo", note: "颜色克制" }) });
  assert.equal(r.status, 200);
  assert.match(r.body.item.file, /^照片\//);
  assert.ok(fs.existsSync(path.join(dir, r.body.item.file)));
  assert.ok(!fs.existsSync(path.join(dir, item.file)));
  assert.equal(r.body.item.note, "颜色克制"); assert.equal(r.body.item.autoCategory, "cover");
  r = await j(`/api/items/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: "nope" }) });
  assert.equal(r.status, 400);

  // 新分类 → 文件夹；再把条目挪进去
  r = await j("/api/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: "排版" }) });
  assert.equal(r.status, 201); assert.ok(fs.existsSync(path.join(dir, "排版")));
  const newKey = r.body.category.key;
  r = await j(`/api/items/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ category: newKey }) });
  assert.match(r.body.item.file, /^排版\//);
  const moved = r.body.item;
  r = await j("/api/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: "排版" }) });
  assert.equal(r.status, 409);

  // 静态文件 + Range
  const enc = "/files/" + moved.file.split("/").map(encodeURIComponent).join("/");
  let f = await fetch(app.base + enc);
  assert.equal(f.status, 200); assert.equal(f.headers.get("content-type"), "image/png"); assert.equal((await f.arrayBuffer()).byteLength, PNG_1x1.length);
  f = await fetch(app.base + enc, { headers: { range: "bytes=0-3" } });
  assert.equal(f.status, 206); assert.equal(f.headers.get("content-range"), `bytes 0-3/${PNG_1x1.length}`); assert.equal((await f.arrayBuffer()).byteLength, 4);
  f = await fetch(app.base + "/files/..%2Fserver.mjs");
  assert.ok([400, 404].includes(f.status), "越界路径被拒绝");
  f = await fetch(app.base + "/files/library.json");
  assert.equal(f.status, 200);

  // 删除 → 回收站
  r = await j(`/api/items/${item.id}`, { method: "DELETE" });
  assert.equal(r.status, 200);
  const trash = await fsp.readdir(path.join(dir, ".trash"));
  assert.ok(trash.some((n) => n.endsWith("封面_样本.png")), "原文件进了回收站");
  assert.ok(trash.includes(`${item.id}.json`), "回收站里有元数据副本");
  lib = await j("/api/library");
  assert.ok(!lib.body.items.some((i) => i.id === item.id));

  // 索引落盘
  const onDisk = JSON.parse(await fsp.readFile(path.join(dir, "library.json"), "utf8"));
  assert.equal(onDisk.items.length, lib.body.items.length);
  assert.ok(onDisk.categories.some((c) => c.label === "排版"));
});
