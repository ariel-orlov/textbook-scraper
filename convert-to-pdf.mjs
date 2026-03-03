import { mdToPdf } from "md-to-pdf";
import fs from "fs/promises";
import path from "path";

const OUTPUT_DIR = "./output";
const PDF_DIR = "./data/pdf";

await fs.mkdir(PDF_DIR, { recursive: true });

const files = (await fs.readdir(OUTPUT_DIR))
  .filter((f) => f.endsWith(".md"))
  .sort();

console.log(`Converting ${files.length} markdown files to PDF...`);
let done = 0;

for (const file of files) {
  const mdPath = path.join(OUTPUT_DIR, file);
  const pdfName = file.replace(/\.md$/, ".pdf");
  const pdfPath = path.join(PDF_DIR, pdfName);

  // Skip if already converted
  try {
    await fs.access(pdfPath);
    console.log(`  ⏭  ${pdfName} (already exists)`);
    done++;
    continue;
  } catch {}

  try {
    await mdToPdf(
      { path: mdPath },
      {
        dest: pdfPath,
        // Launch headless browser from output dir so relative image paths resolve
        basedir: path.resolve(OUTPUT_DIR),
        pdf_options: {
          format: "Letter",
          margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
          printBackground: true,
        },
        launch_options: { args: ["--no-sandbox"] },
        css: `
          body { font-family: Georgia, serif; font-size: 11pt; line-height: 1.6; color: #222; }
          h1 { font-size: 20pt; border-bottom: 2px solid #333; padding-bottom: 6px; margin-top: 24px; }
          h2 { font-size: 16pt; color: #1a1a4e; margin-top: 20px; }
          h3 { font-size: 13pt; color: #2c2c6e; }
          h4, h5 { font-size: 11pt; }
          table { border-collapse: collapse; width: 100%; margin: 12px 0; }
          th, td { border: 1px solid #aaa; padding: 6px 10px; }
          th { background: #e8e8e8; font-weight: bold; }
          img { max-width: 100%; height: auto; display: block; margin: 8px auto; }
          blockquote { border-left: 4px solid #aaa; padding-left: 12px; color: #555; }
          code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; font-size: 10pt; }
          pre code { display: block; padding: 10px; overflow-x: auto; }
          hr { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
          em { color: #444; }
        `,
      }
    );
    done++;
    console.log(`  ✅ [${done}/${files.length}] ${pdfName}`);
  } catch (e) {
    console.error(`  ❌ ${file}: ${e.message}`);
  }
}

console.log(`\nDone! ${done}/${files.length} PDFs in ${PDF_DIR}`);
