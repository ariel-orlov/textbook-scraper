/**
 * Fixes image references in all markdown files.
 *
 * The scraper saved images as img_p{pageNum}_{index}.jpeg
 * but the markdown references them as ../images/img_{index}.jpg
 *
 * Strategy: use <!-- Page N --> comments to track which page
 * each image belongs to, then replace img_X.jpg → img_pN_X.{ext}
 */

import fs from "fs/promises";
import path from "path";

const MD_ROOT   = "./data/md";
const IMG_DIR   = "./data/images";

// ─── Build image lookup: page → { index → filename } ─────────────────────────

const imageIndex = new Map(); // key: "pageNum_idx" → filename

const imgFiles = await fs.readdir(IMG_DIR);
for (const f of imgFiles) {
  const m = f.match(/^img_p(\d+)_(\d+)\.(jpeg|jpg|png|gif|webp)$/i);
  if (m) {
    const key = `${m[1]}_${m[2]}`;
    imageIndex.set(key, f);
  }
}
console.log(`Indexed ${imageIndex.size} image files.\n`);

// ─── Get files in textbook order ─────────────────────────────────────────────

function sortSubchapterFiles(files, chapterNum) {
  // Order: Chapter_N.md, N.1.md, N.2.md, ..., Chapter_N_Review.md
  // For Unit/Front_Matter folders, just sort alphabetically.
  return files.sort((a, b) => {
    const aBase = path.basename(a);
    const bBase = path.basename(b);
    const aIsIntro  = aBase === `Chapter_${chapterNum}.md`;
    const bIsIntro  = bBase === `Chapter_${chapterNum}.md`;
    const aIsReview = /Review/i.test(aBase);
    const bIsReview = /Review/i.test(bBase);
    const aSubNum = aBase.match(/^(\d+\.\d+)\.md$/);
    const bSubNum = bBase.match(/^(\d+\.\d+)\.md$/);

    if (aIsIntro) return -1;
    if (bIsIntro) return 1;
    if (aIsReview && !bIsReview) return 1;
    if (!aIsReview && bIsReview) return -1;
    if (aSubNum && bSubNum) {
      return parseFloat(aSubNum[1]) - parseFloat(bSubNum[1]);
    }
    return aBase.localeCompare(bBase);
  });
}

async function getChapterFolders() {
  const entries = await fs.readdir(MD_ROOT, { withFileTypes: true });
  // Sort chapter folders in textbook order
  const folders = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort((a, b) => {
      // Extract number: Chapter_14 → 14, Unit_2 → 2, Front_Matter → -1
      const getNum = name => {
        const m = name.match(/(\d+)/);
        return m ? parseInt(m[1]) : -1;
      };
      // Front_Matter first
      if (a === "Front_Matter") return -1;
      if (b === "Front_Matter") return 1;
      // Units before chapters? Actually in textbook they interleave.
      // Just sort numerically.
      return getNum(a) - getNum(b);
    });
  return folders;
}

// ─── Fix image references in a file given the current page state ──────────────

function lookupImage(page, idx) {
  if (!page) return null;
  const key = `${page}_${idx}`;
  return imageIndex.get(key) || null;
}

function fixImageRefs(content, currentPage) {
  // Process line by line, tracking current page
  const lines = content.split("\n");
  const result = [];
  let page = currentPage;

  for (const line of lines) {
    // Detect page marker
    const pageMatch = line.match(/<!--\s*Page\s+(\d+)\s*-->/);
    if (pageMatch) {
      page = parseInt(pageMatch[1]);
      result.push(line);
      continue;
    }

    // Replace image references: ../images/img_X.jpg
    const fixed = line.replace(
      /\.\.\/images\/img_(\d+)\.jpg/g,
      (_, idx) => {
        const filename = lookupImage(page, parseInt(idx));
        if (filename) return `../images/${filename}`;
        return `../images/img_${idx}.jpg`; // leave unchanged if not found
      }
    );
    result.push(fixed);
  }

  return { content: result.join("\n"), lastPage: page };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

let totalFixed = 0;
let totalUnresolved = 0;
let currentPage = null;

const folders = await getChapterFolders();

for (const folder of folders) {
  const folderPath = path.join(MD_ROOT, folder);
  const chNum = folder.match(/(\d+)/)?.[1];

  const files = (await fs.readdir(folderPath))
    .filter(f => f.endsWith(".md"))
    .map(f => path.join(folderPath, f));

  const sorted = sortSubchapterFiles(files, chNum);

  for (const filePath of sorted) {
    const raw = await fs.readFile(filePath, "utf-8");

    // Count images before fix
    const beforeBroken = (raw.match(/\.\.\/images\/img_\d+\.jpg/g) || []).length;

    const { content: fixed, lastPage } = fixImageRefs(raw, currentPage);
    currentPage = lastPage;

    // Count remaining broken refs
    const afterBroken = (fixed.match(/\.\.\/images\/img_\d+\.jpg/g) || []).length;
    const resolved = beforeBroken - afterBroken;
    totalFixed += resolved;
    totalUnresolved += afterBroken;

    if (fixed !== raw) {
      await fs.writeFile(filePath, fixed);
    }

    const rel = path.relative(MD_ROOT, filePath);
    if (beforeBroken > 0) {
      console.log(`  ${rel}: fixed ${resolved}/${beforeBroken} refs (page ${currentPage})`);
    }
  }
}

console.log(`\n✅ Done! Fixed ${totalFixed} image refs. Unresolved: ${totalUnresolved}`);
