/**
 * 1. Cleans quiz/practice content from all data/md/*.md files
 * 2. Regenerates all data/pdf/*.pdf with clean content + embedded images
 */
import { mdToPdf } from "md-to-pdf";
import fs from "fs/promises";
import path from "path";

const MD_SRC = "./data/md";      // source md (with ../images/ paths already updated)
const PDF_OUT = "./data/pdf";
const IMAGES_DIR = "./data/images"; // images live here

await fs.mkdir(PDF_OUT, { recursive: true });

// ─── Quiz-removal logic ────────────────────────────────────────────────────

function cleanContent(md) {
  let lines = md.split("\n");
  const out = [];
  let skip = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── Remove "## Concept Check X.X" blocks ──
    // These appear in main chapter files between sections.
    // Pattern: heading + bullet questions + *For suggested answers*
    if (/^## Concept Check\s/i.test(trimmed)) {
      skip = true;
      continue;
    }
    // Also handles "### Concept Check" depth variants
    if (/^#{2,4} Concept Check\s/i.test(trimmed)) {
      skip = true;
      continue;
    }

    if (skip) {
      // End the skip block when we hit the "For suggested answers" marker
      if (/For suggested answers/i.test(trimmed) || /For selected answers/i.test(trimmed)) {
        skip = false;
        continue; // also skip this line itself
      }
      // Also end if we hit a non-bullet major heading or page marker
      // (catches cases where a concept check has no "For suggested answers")
      if (/^#{1,3} /.test(trimmed) && !/^#{1,3} Concept Check/.test(trimmed)) {
        skip = false;
        // fall through — keep this heading
      } else {
        continue;
      }
    }

    // ── Remove "## Test Your Understanding" and everything after ──
    if (/^## Test Your Understanding/i.test(trimmed)) {
      // Drop from here to end of current section (next "---" or EOF)
      // Keep searching until we find a clean "---" section break that
      // would indicate this quiz section truly ended (never, usually end of file)
      // Just cut the rest of the file after this point
      break;
    }

    // ── Remove stray quiz reference lines ──
    if (/^For more multiple-choice questions/i.test(trimmed)) continue;
    if (/^To review key terms.*Vocabulary Self-Quiz/i.test(trimmed)) continue;
    if (/^For selected answers.*Appendix/i.test(trimmed)) continue;
    if (/^For suggested answers.*Appendix/i.test(trimmed)) continue;
    // Inline italic versions of those lines
    if (/^\*For (suggested|selected) answers.*Appendix/i.test(trimmed)) continue;

    out.push(line);
  }

  // Clean up excessive blank lines left behind
  return out.join("\n").replace(/\n{4,}/g, "\n\n\n").trimEnd() + "\n";
}

// ─── PDF generation ─────────────────────────────────────────────────────────

const CSS = `
  @page { margin: 20mm 15mm; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 11pt;
    line-height: 1.7;
    color: #1a1a1a;
  }
  h1 {
    font-size: 22pt;
    font-weight: bold;
    border-bottom: 2px solid #2c4a7c;
    padding-bottom: 6px;
    margin-top: 28px;
    color: #1a2e52;
  }
  h2 {
    font-size: 16pt;
    color: #1a2e52;
    margin-top: 22px;
    border-bottom: 1px solid #aac;
    padding-bottom: 4px;
  }
  h3 { font-size: 13pt; color: #2c4a7c; margin-top: 16px; }
  h4, h5, h6 { font-size: 11pt; color: #333; margin-top: 12px; }
  p { margin: 6px 0 10px; }
  ul, ol { margin: 4px 0 10px 20px; }
  li { margin: 3px 0; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
    font-size: 10pt;
  }
  th, td { border: 1px solid #aaa; padding: 5px 9px; vertical-align: top; }
  th { background: #dce6f0; font-weight: bold; text-align: left; }
  tr:nth-child(even) td { background: #f7fafd; }
  img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 10px auto;
    border-radius: 3px;
  }
  figure { text-align: center; margin: 12px 0; }
  figcaption { font-size: 9pt; color: #555; font-style: italic; margin-top: 4px; }
  blockquote {
    border-left: 4px solid #2c4a7c;
    padding-left: 14px;
    color: #444;
    margin: 8px 0;
  }
  code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; font-size: 9.5pt; }
  pre code { display: block; padding: 10px; line-height: 1.4; }
  hr { border: none; border-top: 1px solid #ccc; margin: 18px 0; }
  strong { color: #111; }
  em { color: #444; }
  /* Hide HTML comments rendered as text */
  .page-marker { display: none; }
`;

async function buildPdf(mdFile) {
  const name = path.basename(mdFile);
  const pdfName = name.replace(/\.md$/, ".pdf");
  const pdfPath = path.join(PDF_OUT, pdfName);

  const rawMd = await fs.readFile(mdFile, "utf-8");
  const cleanedMd = cleanContent(rawMd);

  // Write a temp cleaned version so md-to-pdf can resolve relative paths
  // Images are at data/images/ and md uses ../images/ paths.
  // basedir = data/md so ../images/ resolves to data/images/ ✓
  const tmpPath = mdFile + ".tmp.md";
  await fs.writeFile(tmpPath, cleanedMd);

  try {
    await mdToPdf(
      { path: tmpPath },
      {
        dest: pdfPath,
        basedir: path.resolve(MD_SRC),
        pdf_options: {
          format: "Letter",
          margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: `<div style="font-size:8pt;color:#888;width:100%;text-align:center;font-family:sans-serif;">Campbell Biology AP Edition 12e</div>`,
          footerTemplate: `<div style="font-size:8pt;color:#888;width:100%;text-align:center;font-family:sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
        },
        launch_options: {
          args: ["--no-sandbox", "--allow-file-access-from-files"],
        },
        css: CSS,
      }
    );
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

const files = (await fs.readdir(MD_SRC))
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => path.join(MD_SRC, f));

console.log(`Processing ${files.length} files: clean quiz content + generate PDFs\n`);

let done = 0;
for (const f of files) {
  const name = path.basename(f, ".md");
  try {
    await buildPdf(f);
    done++;
    console.log(`  ✅ [${done}/${files.length}] ${name}.pdf`);
  } catch (e) {
    console.error(`  ❌ ${name}: ${e.message}`);
  }
}

console.log(`\nDone! ${done}/${files.length} clean PDFs in ${PDF_OUT}`);
