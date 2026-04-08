/**
 * Processes only NEW chapters (45+) from output/ into:
 *   data/md/Chapter_45/Chapter_45.md, 45.1.md, ...
 *   data/pdf/Chapter_45/Chapter_45.pdf, 45.1.pdf, ...
 *
 * Also syncs new images from output/images/ → data/images/.
 * Safe to run multiple times — skips chapters already present in data/md/.
 */

import { mdToPdf } from "md-to-pdf";
import fs from "fs/promises";
import path from "path";

const OUTPUT_DIR = "./output";
const DATA_MD    = "./data/md";
const DATA_PDF   = "./data/pdf";
const IMG_SRC    = "./output/images";
const IMG_DEST   = "./data/images";

// ─── Quiz-removal (same as reorganize.mjs) ────────────────────────────────────

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

// ─── Image inlining for PDF ───────────────────────────────────────────────────

const imgCache = new Map();

async function loadImageBase64(imgPath) {
  if (imgCache.has(imgPath)) return imgCache.get(imgPath);
  try {
    const data = await fs.readFile(imgPath);
    const ext  = path.extname(imgPath).toLowerCase().replace(".", "");
    const mime = ext === "svg" ? "image/svg+xml"
               : ext === "png" ? "image/png"
               : ext === "gif" ? "image/gif"
               : ext === "webp" ? "image/webp"
               : "image/jpeg";
    const b64 = `data:${mime};base64,${data.toString("base64")}`;
    imgCache.set(imgPath, b64);
    return b64;
  } catch { return null; }
}

async function inlineImages(md) {
  const re = /!\[([^\]]*)\]\((\.\.\/images\/[^)]+)\)/g;
  const matches = [];
  const promises = [];
  for (const m of md.matchAll(re)) {
    const imgFile = path.join(IMG_DEST, path.basename(m[2]));
    matches.push({ full: m[0], alt: m[1], file: imgFile });
    promises.push(loadImageBase64(imgFile));
  }
  const b64s = await Promise.all(promises);
  let result = md;
  for (let i = 0; i < matches.length; i++) {
    const b64 = b64s[i];
    if (b64) result = result.replace(matches[i].full, `![${matches[i].alt}](${b64})`);
  }
  return result;
}

// ─── PDF generator (same CSS as reorganize.mjs) ───────────────────────────────

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

// ─── Split chapter into subchapters (same as reorganize.mjs) ─────────────────

function splitChapter(md, chapterNum) {
  const parts = [];
  const lines = md.split("\n");
  let currentSection = null;
  let introParts = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(new RegExp(`^# Concept\\s*${chapterNum}\\.(\\d+)\\s*:(.*)$`));
    if (m) {
      if (currentSection) parts.push(currentSection);
      currentSection = { num: `${chapterNum}.${m[1]}`, title: m[2].trim(), lines: [line] };
    } else if (currentSection) {
      currentSection.lines.push(line);
    } else {
      introParts.push(line);
    }
  }
  if (currentSection) parts.push(currentSection);
  return { intro: introParts.join("\n"), sections: parts };
}

function parseChapterNum(filename) {
  const m = filename.match(/Chapter[_\s\u{FEFF}]*(\d+)/iu);
  return m ? parseInt(m[1]) : null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// 1. Sync new images
console.log("Syncing new images from output/images/ → data/images/...");
await fs.mkdir(IMG_DEST, { recursive: true });
const srcImgs  = new Set(await fs.readdir(IMG_SRC).catch(() => []));
const destImgs = new Set(await fs.readdir(IMG_DEST).catch(() => []));
let newImgs = 0;
for (const img of srcImgs) {
  if (!destImgs.has(img)) {
    await fs.copyFile(path.join(IMG_SRC, img), path.join(IMG_DEST, img));
    newImgs++;
  }
}
console.log(`  Copied ${newImgs} new images.\n`);

// 2. Find new chapter files in output/ (chapters not yet in data/md/)
const existingChapters = new Set(await fs.readdir(DATA_MD).catch(() => []));
const outputFiles = (await fs.readdir(OUTPUT_DIR))
  .filter(f => f.endsWith(".md"))
  .sort();

const newFiles = outputFiles.filter(f => {
  const chNum = parseChapterNum(f);
  if (chNum !== null) return !existingChapters.has(`Chapter_${chNum}`);
  // Units/Front_Matter — check by derived folder name
  if (/Unit[_\s]*(\d+)/i.test(f)) {
    const um = f.match(/Unit[_\s]*(\d+)/i);
    return !existingChapters.has(`Unit_${um[1]}`);
  }
  return false; // skip reviews — they'll be caught via chapter number presence
});

// Also include Review files for new chapters
const allNewFiles = outputFiles.filter(f => {
  const chNum = parseChapterNum(f);
  if (chNum === null) {
    if (/Unit[_\s]*(\d+)/i.test(f)) {
      const um = f.match(/Unit[_\s]*(\d+)/i);
      return !existingChapters.has(`Unit_${um[1]}`);
    }
    return false;
  }
  return !existingChapters.has(`Chapter_${chNum}`);
});

if (allNewFiles.length === 0) {
  console.log("No new chapters found in output/ that aren't already in data/md/.");
  console.log("Run the scraper first, then re-run this script.");
  process.exit(0);
}

console.log(`Found ${allNewFiles.length} new files to process:\n`);
for (const f of allNewFiles) console.log(`  ${f}`);
console.log();

// 3. Process each new file
for (const file of allNewFiles) {
  const raw     = await fs.readFile(path.join(OUTPUT_DIR, file), "utf-8");
  const cleaned = cleanQuizContent(raw);
  const chNum   = parseChapterNum(file);
  const isReview = /Review/i.test(file);

  if (isReview && chNum !== null) {
    // Review → single file in Chapter_N folder
    const folder    = `Chapter_${chNum}`;
    const outName   = file.replace(/^\d+_/, "");  // strip numeric prefix
    const mdOut     = path.join(DATA_MD,  folder, outName);
    const pdfOut    = path.join(DATA_PDF, folder, outName.replace(/\.md$/, ".pdf"));
    await fs.mkdir(path.join(DATA_MD,  folder), { recursive: true });
    await fs.mkdir(path.join(DATA_PDF, folder), { recursive: true });
    await fs.writeFile(mdOut, cleaned);
    await generatePdf(cleaned, pdfOut);
    console.log(`  ✅ ${folder}/${outName.replace(/\.md$/, ".pdf")}`);
    continue;
  }

  if (chNum !== null) {
    // Chapter → split into subchapters
    const folder = `Chapter_${chNum}`;
    await fs.mkdir(path.join(DATA_MD,  folder), { recursive: true });
    await fs.mkdir(path.join(DATA_PDF, folder), { recursive: true });

    const { intro, sections } = splitChapter(cleaned, chNum);

    const introName = `Chapter_${chNum}.md`;
    await fs.writeFile(path.join(DATA_MD, folder, introName), intro.trimEnd() + "\n");
    await generatePdf(intro.trimEnd() + "\n", path.join(DATA_PDF, folder, `Chapter_${chNum}.pdf`));
    console.log(`  ✅ ${folder}/Chapter_${chNum}.pdf (intro)`);

    for (const sec of sections) {
      const secMd = `# ${sec.num}: ${sec.title}\n\n` + sec.lines.slice(1).join("\n").trimEnd() + "\n";
      await fs.writeFile(path.join(DATA_MD,  folder, `${sec.num}.md`), secMd);
      await generatePdf(secMd, path.join(DATA_PDF, folder, `${sec.num}.pdf`));
      console.log(`  ✅ ${folder}/${sec.num}.pdf`);
    }
    continue;
  }

  // Unit file
  const um     = file.match(/Unit[_\s]*(\d+)/i);
  const folder = `Unit_${um[1]}`;
  const outName = file.replace(/^\d+_/, "");
  await fs.mkdir(path.join(DATA_MD,  folder), { recursive: true });
  await fs.mkdir(path.join(DATA_PDF, folder), { recursive: true });
  await fs.writeFile(path.join(DATA_MD, folder, outName), cleaned);
  await generatePdf(cleaned, path.join(DATA_PDF, folder, outName.replace(/\.md$/, ".pdf")));
  console.log(`  ✅ ${folder}/${outName.replace(/\.md$/, ".pdf")}`);
}

console.log("\n✅ Done! New chapters added to data/md/ and data/pdf/");
