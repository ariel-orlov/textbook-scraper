/**
 * Proper HTML pipeline: markdown → marked HTML → inline base64 images → Puppeteer PDF
 * No md-to-pdf; images embedded directly in HTML <img src="data:...">
 */
import { marked } from "marked";
import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";

const MD_ROOT  = "./data/md";
const PDF_ROOT = "./data/pdf";
const IMG_DIR  = "./data/images";

// ─── Quiz removal ─────────────────────────────────────────────────────────────

function cleanQuiz(md) {
  const lines = md.split("\n");
  const out = [];
  let skip = false;
  for (const line of lines) {
    const t = line.trim();
    if (/^#{2,4} Concept Check\b/i.test(t)) { skip = true; continue; }
    if (skip) {
      if (/\*?For (suggested|selected) answers/i.test(t)) { skip = false; continue; }
      if (/^#{1,3} /.test(t) && !/^#{1,3} Concept Check/i.test(t)) skip = false;
      else { continue; }
    }
    if (/^## Test Your Understanding\b/i.test(t)) break;
    if (/^For more multiple-choice questions/i.test(t)) continue;
    if (/^To review key terms.*Vocabulary Self-Quiz/i.test(t)) continue;
    if (/^\*?For (suggested|selected) answers.*Appendix/i.test(t)) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n";
}

// ─── Image cache ──────────────────────────────────────────────────────────────

const cache = new Map();
async function imgToB64(file) {
  if (cache.has(file)) return cache.get(file);
  try {
    const buf = await fs.readFile(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime = { png:"image/png", gif:"image/gif", webp:"image/webp", svg:"image/svg+xml" }[ext] || "image/jpeg";
    const uri = `data:${mime};base64,${buf.toString("base64")}`;
    cache.set(file, uri);
    return uri;
  } catch { return null; }
}

// ─── Replace img src attributes in HTML with base64 ──────────────────────────

async function inlineHTMLImages(html) {
  // Match src="...images/filename.ext" (relative paths from the markdown)
  const re = /src="([^"]*(?:\.\.\/)*images\/([^"]+))"/gi;
  const matches = [...html.matchAll(re)];
  if (!matches.length) return html;

  // Load all images in parallel
  const b64s = await Promise.all(
    matches.map(m => imgToB64(path.join(IMG_DIR, m[2])))
  );

  let result = html;
  // Replace in reverse order to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const b64 = b64s[i];
    if (b64) {
      result = result.slice(0, m.index) + `src="${b64}"` + result.slice(m.index + m[0].length);
    }
  }
  return result;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 11pt;
    line-height: 1.7;
    color: #1a1a1a;
    background: white;
    max-width: 100%;
    margin: 0;
    padding: 0;
  }
  h1 {
    font-size: 20pt; font-weight: bold;
    border-bottom: 2px solid #2c4a7c;
    padding-bottom: 6px; margin-top: 28px; color: #1a2e52;
    page-break-after: avoid;
  }
  h2 {
    font-size: 14pt; color: #1a2e52;
    margin-top: 20px; border-bottom: 1px solid #aac;
    padding-bottom: 3px;
    page-break-after: avoid;
  }
  h3 { font-size: 12pt; color: #2c4a7c; margin-top: 14px; page-break-after: avoid; }
  h4, h5, h6 { font-size: 11pt; color: #333; margin-top: 10px; page-break-after: avoid; }
  p { margin: 5px 0 9px; orphans: 3; widows: 3; }
  ul, ol { margin: 4px 0 10px 22px; }
  li { margin: 3px 0; }

  /* Tables */
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 14px 0;
    font-size: 10pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #999;
    padding: 6px 10px;
    vertical-align: top;
    text-align: left;
  }
  th {
    background: #dce6f0;
    font-weight: bold;
    color: #1a2e52;
  }
  tr:nth-child(even) td { background: #f5f9fd; }
  thead { display: table-header-group; }

  /* Images */
  img {
    max-width: 85%;
    height: auto;
    display: block;
    margin: 12px auto;
    page-break-inside: avoid;
  }
  figure { text-align: center; margin: 14px 0; page-break-inside: avoid; }
  figcaption { font-size: 9pt; color: #555; font-style: italic; margin-top: 4px; }

  blockquote { border-left: 4px solid #2c4a7c; padding-left: 14px; color: #444; margin: 8px 0; }
  code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; font-size: 9.5pt; font-family: monospace; }
  pre code { display: block; padding: 10px; line-height: 1.4; overflow-x: auto; }
  hr { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
  strong { color: #111; }
  em { color: #555; }
`;

// ─── Markdown → HTML ─────────────────────────────────────────────────────────

marked.setOptions({ gfm: true, breaks: false });

async function mdToHtml(md, title) {
  const body = await marked.parse(md);
  const withImages = await inlineHTMLImages(body);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
${withImages}
</body>
</html>`;
}

// ─── Puppeteer PDF ────────────────────────────────────────────────────────────

let browser;
async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  }
  return browser;
}

async function htmlToPdf(html, destPath) {
  const br = await getBrowser();
  const page = await br.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    await page.pdf({
      path: destPath,
      format: "Letter",
      margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8pt;color:#aaa;width:100%;text-align:center;font-family:sans-serif;padding-top:4px;">Campbell Biology AP Edition 12e</div>`,
      footerTemplate: `<div style="font-size:8pt;color:#aaa;width:100%;text-align:center;font-family:sans-serif;padding-bottom:4px;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    });
  } finally {
    await page.close();
  }
}

// ─── Screenshot verification ──────────────────────────────────────────────────

export async function screenshotHtml(html, outPath) {
  const br = await getBrowser();
  const page = await br.newPage();
  await page.setViewport({ width: 900, height: 1100 });
  try {
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    await page.screenshot({ path: outPath, fullPage: false });
  } finally {
    await page.close();
  }
}

// ─── Process one markdown file ────────────────────────────────────────────────

async function processFile(mdPath, pdfPath, title) {
  await fs.mkdir(path.dirname(pdfPath), { recursive: true });
  const raw = await fs.readFile(mdPath, "utf-8");
  const cleaned = cleanQuiz(raw);
  const html = await mdToHtml(cleaned, title);
  await htmlToPdf(html, pdfPath);
  return html; // for verification
}

// ─── Walk all chapter folders ─────────────────────────────────────────────────

async function walkDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...await walkDir(full));
    else if (e.name.endsWith(".md")) files.push(full);
  }
  return files.sort();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const allMd = await walkDir(MD_ROOT);
  console.log(`Processing ${allMd.length} markdown files...\n`);

  let done = 0;
  let verifyHtml = null;   // save one HTML for screenshot verification
  let verifyPdf  = null;

  for (const mdPath of allMd) {
    const rel     = path.relative(MD_ROOT, mdPath);          // e.g. Chapter_14/14.1.md
    const pdfPath = path.join(PDF_ROOT, rel.replace(/\.md$/, ".pdf"));
    const title   = path.basename(rel, ".md").replace(/_/g, " ");

    try {
      const html = await processFile(mdPath, pdfPath, title);
      done++;
      console.log(`  ✅ [${done}/${allMd.length}] ${rel.replace(/\.md$/, ".pdf")}`);

      // Save Chapter 14 / 14.2 for verification (has a table + images)
      if (rel === "Chapter_14/14.2.md") {
        verifyHtml = html;
        verifyPdf  = pdfPath;
      }
    } catch (e) {
      console.error(`  ❌ ${rel}: ${e.message}`);
    }
  }

  // ── Screenshot verification ──
  if (verifyHtml) {
    console.log("\nTaking verification screenshot of Chapter 14/14.2...");
    await screenshotHtml(verifyHtml, "./verify_chapter14_2.png");
    console.log("  Screenshot saved: verify_chapter14_2.png");
  }

  if (browser) await browser.close();
  console.log(`\n✅ Done! ${done}/${allMd.length} PDFs rebuilt.`);
}

main().catch(e => { console.error(e); process.exit(1); });
