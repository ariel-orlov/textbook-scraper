/**
 * Reorganizes data/ into:
 *   data/md/Chapter_14/Chapter_14.md, 14.1.md, 14.2.md ..., Chapter_14_Review.md
 *   data/pdf/Chapter_14/Chapter_14.pdf, 14.1.pdf ...
 *
 * - Removes numeric prefix from all names
 * - Splits chapters by "# Concept X.Y:" headings into subchapters
 * - Cleans quiz/practice content
 * - Inlines images as base64 for guaranteed PDF embedding
 */

import { mdToPdf } from "md-to-pdf";
import fs from "fs/promises";
import path from "path";

const OLD_MD   = "./data/md";
const OLD_PDF  = "./data/pdf";
const IMG_DIR  = "./data/images";
const NEW_MD   = "./data/md_new";
const NEW_PDF  = "./data/pdf_new";

// ─── Quiz-removal ─────────────────────────────────────────────────────────────

function cleanQuizContent(md) {
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

// ─── Image inlining for PDF (base64) ──────────────────────────────────────────

const imgCache = new Map();

async function loadImageBase64(imgPath) {
  if (imgCache.has(imgPath)) return imgCache.get(imgPath);
  try {
    const data = await fs.readFile(imgPath);
    const ext = path.extname(imgPath).toLowerCase().replace(".", "");
    const mime = ext === "svg" ? "image/svg+xml"
               : ext === "png" ? "image/png"
               : ext === "gif" ? "image/gif"
               : ext === "webp" ? "image/webp"
               : "image/jpeg";
    const b64 = `data:${mime};base64,${data.toString("base64")}`;
    imgCache.set(imgPath, b64);
    return b64;
  } catch {
    return null;
  }
}

async function inlineImages(md) {
  // Match ![alt](../images/filename.ext)
  const re = /!\[([^\]]*)\]\((\.\.\/images\/[^)]+)\)/g;
  const promises = [];
  const matches = [];

  for (const m of md.matchAll(re)) {
    const imgFile = path.join(IMG_DIR, path.basename(m[2]));
    matches.push({ full: m[0], alt: m[1], file: imgFile });
    promises.push(loadImageBase64(imgFile));
  }

  const b64s = await Promise.all(promises);
  let result = md;

  for (let i = 0; i < matches.length; i++) {
    const { full, alt } = matches[i];
    const b64 = b64s[i];
    if (b64) {
      result = result.replace(full, `![${alt}](${b64})`);
    }
  }
  return result;
}

// ─── PDF generator ────────────────────────────────────────────────────────────

const CSS = `
  @page { margin: 20mm 15mm; }
  body { font-family: Georgia,"Times New Roman",serif; font-size:11pt; line-height:1.7; color:#1a1a1a; }
  h1 { font-size:22pt; font-weight:bold; border-bottom:2px solid #2c4a7c; padding-bottom:6px; margin-top:28px; color:#1a2e52; }
  h2 { font-size:15pt; color:#1a2e52; margin-top:20px; border-bottom:1px solid #aac; padding-bottom:3px; }
  h3 { font-size:12.5pt; color:#2c4a7c; margin-top:14px; }
  h4,h5,h6 { font-size:11pt; color:#333; margin-top:10px; }
  p { margin:5px 0 9px; }
  ul,ol { margin:4px 0 10px 22px; }
  li { margin:3px 0; }
  table { border-collapse:collapse; width:100%; margin:12px 0; font-size:10pt; }
  th,td { border:1px solid #aaa; padding:5px 9px; vertical-align:top; }
  th { background:#dce6f0; font-weight:bold; }
  tr:nth-child(even) td { background:#f7fafd; }
  img { max-width:90%; height:auto; display:block; margin:10px auto; border-radius:2px; }
  blockquote { border-left:4px solid #2c4a7c; padding-left:14px; color:#444; margin:8px 0; }
  code { background:#f4f4f4; padding:2px 5px; border-radius:3px; font-size:9.5pt; }
  hr { border:none; border-top:1px solid #ccc; margin:16px 0; }
  strong { color:#111; }
  em { color:#555; }
`;

async function generatePdf(cleanedMd, destPath) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const mdWithB64 = await inlineImages(cleanedMd);
  const tmp = destPath + ".tmp.md";
  await fs.writeFile(tmp, mdWithB64);
  try {
    await mdToPdf(
      { path: tmp },
      {
        dest: destPath,
        pdf_options: {
          format: "Letter",
          margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: `<div style="font-size:8pt;color:#999;width:100%;text-align:center;font-family:sans-serif;padding-top:5px;">Campbell Biology AP Edition 12e</div>`,
          footerTemplate: `<div style="font-size:8pt;color:#999;width:100%;text-align:center;font-family:sans-serif;padding-bottom:5px;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
        },
        launch_options: { args: ["--no-sandbox"] },
        css: CSS,
      }
    );
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

// ─── Split chapter into subchapters ───────────────────────────────────────────

function splitChapter(md, chapterNum) {
  // Regex: "# Concept 14.1:" at line start (may have unicode/whitespace artifacts)
  const conceptHeading = new RegExp(
    `^# Concept\\s*${chapterNum}\\.(\\d+)\\s*:`,
    "m"
  );

  const parts = [];
  const lines = md.split("\n");
  let currentSection = null; // { num: "14.1", title: "...", lines: [] }
  let introParts = [];       // lines before first Concept heading

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(new RegExp(`^# Concept\\s*${chapterNum}\\.(\\d+)\\s*:(.*)$`));

    if (m) {
      // Save previous section
      if (currentSection) parts.push(currentSection);
      currentSection = {
        num: `${chapterNum}.${m[1]}`,
        title: m[2].trim(),
        lines: [line],
      };
    } else if (currentSection) {
      currentSection.lines.push(line);
    } else {
      introParts.push(line);
    }
  }
  if (currentSection) parts.push(currentSection);

  return { intro: introParts.join("\n"), sections: parts };
}

// ─── Figure out chapter number from filename ──────────────────────────────────

function parseChapterNum(filename) {
  // "30_Chapter_14.md" → 14
  // "02_Chapter_1.md" → 1
  // "25_Chapter_11_Review.md" → 11 (review)
  const m = filename.match(/Chapter[_\s﻿]*(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

function folderName(filename) {
  const n = parseChapterNum(filename);
  if (n !== null) return `Chapter_${n}`;
  if (/Unit[_\s]*(\d+)/i.test(filename)) {
    const um = filename.match(/Unit[_\s]*(\d+)/i);
    return `Unit_${um[1]}`;
  }
  return "Front_Matter";
}

function outputFilename(filename) {
  // Remove "NN_" numeric prefix
  return filename.replace(/^\d+_/, "");
}

// ─── Main ────────────────────────────────────────────────────────────────────

await fs.mkdir(NEW_MD, { recursive: true });
await fs.mkdir(NEW_PDF, { recursive: true });

const allFiles = (await fs.readdir(OLD_MD))
  .filter((f) => f.endsWith(".md"))
  .sort();

console.log(`Reorganizing ${allFiles.length} files...\n`);
let filesDone = 0;

for (const file of allFiles) {
  const raw = await fs.readFile(path.join(OLD_MD, file), "utf-8");
  const cleaned = cleanQuizContent(raw);
  const folder = folderName(file);
  const isReview = /Review/i.test(file);
  const isUnit   = /^Unit/i.test(folder);
  const isFront  = folder === "Front_Matter";
  const chNum    = parseChapterNum(file);

  const mdFolder  = path.join(NEW_MD,  folder);
  const pdfFolder = path.join(NEW_PDF, folder);
  await fs.mkdir(mdFolder,  { recursive: true });
  await fs.mkdir(pdfFolder, { recursive: true });

  // ── Non-chapter files (units, front matter, reviews) → single file ──
  if (isReview || isUnit || isFront || chNum === null) {
    const outName = outputFilename(file);
    const mdOut   = path.join(mdFolder,  outName);
    const pdfOut  = path.join(pdfFolder, outName.replace(/\.md$/, ".pdf"));

    await fs.writeFile(mdOut, cleaned);
    await generatePdf(cleaned, pdfOut);
    filesDone++;
    console.log(`  ✅ ${folder}/${path.basename(pdfOut)}`);
    continue;
  }

  // ── Chapter files → split by subchapter ──
  const { intro, sections } = splitChapter(cleaned, chNum);

  // Write intro (chapter opening pages)
  const introName = `Chapter_${chNum}.md`;
  await fs.writeFile(path.join(mdFolder, introName), intro.trimEnd() + "\n");
  await generatePdf(intro.trimEnd() + "\n", path.join(pdfFolder, introName.replace(/\.md$/, ".pdf")));
  console.log(`  ✅ ${folder}/Chapter_${chNum}.pdf (intro)`);

  // Write each subchapter
  for (const sec of sections) {
    const secMd  = `# ${sec.num}: ${sec.title}\n\n` + sec.lines.slice(1).join("\n").trimEnd() + "\n";
    const mdFile  = path.join(mdFolder,  `${sec.num}.md`);
    const pdfFile = path.join(pdfFolder, `${sec.num}.pdf`);
    await fs.writeFile(mdFile, secMd);
    await generatePdf(secMd, pdfFile);
    console.log(`  ✅ ${folder}/${sec.num}.pdf`);
  }

  filesDone++;
}

// ─── Swap new folders into place ─────────────────────────────────────────────
console.log("\nSwapping md and pdf folders into place...");

// Rename old → _old, new → live
const OLD_MD_BAK  = "./data/md_old";
const OLD_PDF_BAK = "./data/pdf_old";

// Remove any previous backup
await fs.rm(OLD_MD_BAK,  { recursive: true, force: true });
await fs.rm(OLD_PDF_BAK, { recursive: true, force: true });

await fs.rename(OLD_MD,  OLD_MD_BAK);
await fs.rename(OLD_PDF, OLD_PDF_BAK);
await fs.rename(NEW_MD,  OLD_MD);
await fs.rename(NEW_PDF, OLD_PDF);

// Remove backups
await fs.rm(OLD_MD_BAK,  { recursive: true, force: true });
await fs.rm(OLD_PDF_BAK, { recursive: true, force: true });

console.log(`\n✅ Done! Files reorganized into data/md/ and data/pdf/`);
