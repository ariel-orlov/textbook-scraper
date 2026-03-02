import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { config } from "dotenv";

config();

const COURSE_URL =
  "https://plus.pearson.com/courses/mancuso86168/products/BRNT-6MS7SLXU3D/pages/31c89f60-eac2-11ed-8aa5-635cfb2303b0";
const OUTPUT_DIR = "./output";
const SCREENSHOTS_DIR = "./output/screenshots";
const IMAGES_DIR = "./output/images";
let screenshotCounter = 0;
let imageCounter = 0;

// Chapter 14 pages: 269-293
const START_PAGE = 269;
const END_PAGE = 293;

async function screenshot(page, label) {
  screenshotCounter++;
  const filename = path.join(
    SCREENSHOTS_DIR,
    `${String(screenshotCounter).padStart(3, "0")}_${label}.png`
  );
  await page.screenshot({ path: filename, fullPage: false });
  console.log(`  📸 ${filename}`);
}

async function clickElementByText(page, text) {
  return page.evaluate((searchText) => {
    const els = document.querySelectorAll("button, a, input[type='submit'], div[role='button'], span[role='button']");
    for (const el of els) {
      const t = el.textContent?.trim() || el.value || "";
      if (t.includes(searchText)) {
        el.click();
        return el.tagName + ": " + t.substring(0, 50);
      }
    }
    return false;
  }, text);
}

async function login(page) {
  const email = process.env.PEARSON_EMAIL;
  const password = process.env.PEARSON_PASSWORD;
  if (!email || !password) {
    throw new Error("Set PEARSON_EMAIL and PEARSON_PASSWORD in your .env file");
  }

  console.log("Navigating to Pearson Plus login...");
  await page.goto("https://plus.pearson.com/home", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  // Dismiss cookie banner
  await new Promise((r) => setTimeout(r, 2000));
  await clickElementByText(page, "Allow and Continue");
  await new Promise((r) => setTimeout(r, 1500));

  // Fill email + password
  await page.waitForSelector('input[type="password"]', { timeout: 30000 });
  console.log("Entering credentials...");
  const emailInput = await page.$('input[type="text"], input[type="email"], input[name="username"]');
  await emailInput.click({ clickCount: 3 });
  await emailInput.type(email, { delay: 30 });
  const passwordInput = await page.$('input[type="password"]');
  await passwordInput.click({ clickCount: 3 });
  await passwordInput.type(password, { delay: 30 });

  // Click Sign In
  console.log("Clicking Sign In...");
  await page.evaluate(() => {
    const els = document.querySelectorAll("button, a, input[type='submit'], div[role='button']");
    for (const el of els) {
      if ((el.textContent?.trim() || el.value || "").match(/^Sign In$/i)) {
        el.click(); return;
      }
    }
  });

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));

  // Handle MFA
  const pageText = await page.evaluate(() => document.body.innerText);
  if (pageText.includes("Multifactor") || pageText.includes("verification code")) {
    console.log("\n⚠️  MFA detected!");
    await new Promise((r) => setTimeout(r, 1000));
    await clickElementByText(page, "Send verification code");
    console.log("👉 Enter the verification code in the browser and click Continue.");
    console.log("⏳ Waiting up to 5 minutes...\n");

    const mfaStart = Date.now();
    while (Date.now() - mfaStart < 300000) {
      await new Promise((r) => setTimeout(r, 2000));
      const text = await page.evaluate(() => document.body.innerText);
      if (!text.includes("Multifactor") && !text.includes("Check your email") && !text.includes("verification code")) {
        console.log("✅ MFA completed!");
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  // Click "Open eTextbook"
  await new Promise((r) => setTimeout(r, 2000));
  await clickElementByText(page, "Open eTextbook");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 5000));

  await screenshot(page, "reader_loaded");
  console.log("Reader loaded.");
}

async function goToPage(page, targetPage) {
  console.log(`  Navigating to page ${targetPage}...`);

  // Click the page number input at the bottom, clear it, type new page, press Enter
  const result = await page.evaluate((target) => {
    // Find the page number input in the footer
    const inputs = document.querySelectorAll("input");
    for (const input of inputs) {
      const val = input.value;
      if (val && /^\d+$/.test(val.trim())) {
        // This is likely the page number input
        input.focus();
        input.select();
        return { found: true, currentVal: val };
      }
    }
    return { found: false };
  }, targetPage);

  if (result.found) {
    // Triple-click to select all, then type new page number
    const pageInput = await page.evaluateHandle(() => {
      const inputs = document.querySelectorAll("input");
      for (const input of inputs) {
        if (/^\d+$/.test(input.value.trim())) return input;
      }
      return null;
    });

    if (pageInput) {
      await pageInput.click({ clickCount: 3 });
      await page.keyboard.press("Backspace");
      await pageInput.type(targetPage.toString());
      await page.keyboard.press("Enter");
      await new Promise((r) => setTimeout(r, 2000));
      return true;
    }
  }

  // Fallback: use next/prev page buttons
  return false;
}

async function goToNextPage(page) {
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label*="next page"]');
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  });
  if (clicked) {
    await new Promise((r) => setTimeout(r, 2000));
  }
  return clicked;
}

async function extractPageContent(page) {
  // Content is inside #contentIframe — access its document
  const content = await page.evaluate(() => {
    const iframe = document.querySelector("#contentIframe");
    if (!iframe) return { md: "", raw: "", images: [], debug: "no #contentIframe found" };

    let doc;
    try {
      doc = iframe.contentDocument || iframe.contentWindow?.document;
    } catch (e) {
      return { md: "", raw: "", images: [], debug: "cross-origin iframe: " + e.message };
    }

    if (!doc || !doc.body) return { md: "", raw: "", images: [], debug: "iframe has no body" };

    const images = [];

    // Helper for table conversion — build proper markdown table
    function tableToMd(tableNode) {
      const rows = tableNode.querySelectorAll("tr");
      if (rows.length === 0) return "";

      const tableData = [];
      for (const row of rows) {
        const cells = row.querySelectorAll("th, td");
        const rowData = [];
        for (const cell of cells) {
          const text = cell.innerText?.trim().replace(/\n/g, " ") || "";
          const isHeader = cell.tagName === "TH";
          rowData.push({ text, isHeader });
        }
        tableData.push(rowData);
      }

      if (tableData.length === 0) return "";

      // Find max columns
      const maxCols = Math.max(...tableData.map((r) => r.length));
      let md = "\n";

      // First row as header
      const headerRow = tableData[0];
      md += "| " + headerRow.map((c) => c.text).join(" | ") + " |\n";
      md += "| " + headerRow.map(() => "---").join(" | ") + " |\n";

      // Remaining rows
      for (let i = 1; i < tableData.length; i++) {
        const row = tableData[i];
        // Pad row to maxCols
        while (row.length < maxCols) row.push({ text: "", isHeader: false });
        md += "| " + row.map((c) => c.text).join(" | ") + " |\n";
      }

      return md + "\n";
    }

    function nodeToMd(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const tag = node.tagName.toLowerCase();
      if (["script", "style", "noscript", "svg", "button", "nav"].includes(tag)) return "";

      // Handle tables specially
      if (tag === "table") return tableToMd(node);

      const children = Array.from(node.childNodes).map((c) => nodeToMd(c)).join("");
      const trimmed = children.trim();

      switch (tag) {
        case "h1": return `\n# ${trimmed}\n\n`;
        case "h2": return `\n## ${trimmed}\n\n`;
        case "h3": return `\n### ${trimmed}\n\n`;
        case "h4": return `\n#### ${trimmed}\n\n`;
        case "h5": return `\n##### ${trimmed}\n\n`;
        case "h6": return `\n###### ${trimmed}\n\n`;
        case "p": return `\n${trimmed}\n\n`;
        case "br": return "\n";
        case "strong": case "b": return `**${trimmed}**`;
        case "em": case "i": return `*${trimmed}*`;
        case "ul": return `\n${children}\n`;
        case "ol": return `\n${children}\n`;
        case "li": return `- ${trimmed}\n`;
        case "blockquote": return `\n> ${trimmed}\n\n`;
        case "figure": return `\n${children}\n`;
        case "figcaption": return `\n*${trimmed}*\n`;
        case "img": {
          const alt = node.getAttribute("alt") || "image";
          const src = node.getAttribute("src") || node.getAttribute("data-src") || "";
          // Collect image info for downloading
          if (src) {
            const imgIndex = images.length;
            images.push({ alt, src });
            return `\n![${alt}](images/img_${imgIndex}.jpg)\n`;
          }
          return `\n![${alt}]\n`;
        }
        case "span": return children;
        case "div": return trimmed ? `\n${children}\n` : children;
        case "section": return `\n${children}\n`;
        // Skip table sub-elements (handled by tableToMd)
        case "thead": case "tbody": case "tr": case "th": case "td": return "";
        default: return children;
      }
    }

    const md = nodeToMd(doc.body);
    const raw = doc.body.innerText;

    return { md, raw, images, debug: "ok" };
  });

  return content;
}

async function downloadImages(page, images, pageNum) {
  // Download images from the iframe's context
  const downloaded = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (!img.src) continue;

    try {
      // Resolve relative URLs using the iframe's base URL
      const imageBuffer = await page.evaluate(async (src) => {
        const iframe = document.querySelector("#contentIframe");
        const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
        if (!doc) return null;

        // Resolve URL relative to iframe
        const baseUrl = doc.baseURI || iframe.src;
        const fullUrl = new URL(src, baseUrl).href;

        try {
          const response = await fetch(fullUrl);
          if (!response.ok) return null;
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          return Array.from(new Uint8Array(arrayBuffer));
        } catch (e) {
          return null;
        }
      }, img.src);

      if (imageBuffer) {
        const ext = img.src.match(/\.(png|jpg|jpeg|gif|webp|svg)/i)?.[1] || "jpg";
        const filename = `img_p${pageNum}_${i}.${ext}`;
        const filepath = path.join(IMAGES_DIR, filename);
        await fs.writeFile(filepath, Buffer.from(imageBuffer));
        downloaded.push({ index: i, filename, alt: img.alt });
      }
    } catch (e) {
      // Skip failed downloads silently
    }
  }
  return downloaded;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9\s\-_.]/g, "").replace(/\s+/g, "_").substring(0, 100);
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
  await fs.mkdir(IMAGES_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--no-sandbox", "--start-maximized"],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    await login(page);

    // Navigate to first page of Chapter 14
    console.log(`\nExtracting Chapter 14 (pages ${START_PAGE}-${END_PAGE})...`);
    await goToPage(page, START_PAGE);
    await screenshot(page, "start_page");

    // First page: dump debug info about the content container
    const firstPageContent = await extractPageContent(page);
    await fs.writeFile(
      path.join(OUTPUT_DIR, "_debug_content_info.json"),
      JSON.stringify({
        containerTag: firstPageContent.containerTag,
        containerClass: firstPageContent.containerClass,
        childCount: firstPageContent.childCount,
        innerHTML_preview: firstPageContent.innerHTML_preview,
        mdLength: firstPageContent.md?.length || 0,
        rawLength: firstPageContent.raw?.length || 0,
        iframeContentLength: firstPageContent.iframeContent?.length || 0,
      }, null, 2)
    );
    console.log(`First page debug: md=${firstPageContent.md?.length || 0} chars, raw=${firstPageContent.raw?.length || 0} chars`);

    // Extract page by page
    const allPages = [];
    for (let p = START_PAGE; p <= END_PAGE; p++) {
      if (p > START_PAGE) {
        const hasNext = await goToNextPage(page);
        if (!hasNext) {
          console.log("  No next page — stopping.");
          break;
        }
      }

      const content = await extractPageContent(page);
      // Use markdown if available, fall back to raw text
      let text = (content.md || "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "").trim();
      const rawText = (content.raw || "").trim();
      const finalText = text.length > 20 ? text : rawText;

      // Download images from this page
      if (content.images && content.images.length > 0) {
        const downloaded = await downloadImages(page, content.images, p);
        console.log(`  Page ${p}: ${finalText.length} chars, ${downloaded.length}/${content.images.length} images`);
      } else {
        console.log(`  Page ${p}: ${finalText.length} chars`);
      }

      allPages.push({ page: p, content: finalText });

      if (p === START_PAGE || p % 5 === 0) {
        await screenshot(page, `page_${p}`);
      }
    }

    // Deduplicate — the iframe loads entire sections, so consecutive pages often have identical content
    const uniquePages = [];
    let lastContent = "";
    for (const p of allPages) {
      if (p.content !== lastContent) {
        uniquePages.push(p);
        lastContent = p.content;
      } else {
        console.log(`  Page ${p.page}: duplicate of previous, skipping.`);
      }
    }
    console.log(`\n${allPages.length} pages extracted, ${uniquePages.length} unique sections.`);

    // Save as one markdown file
    let fullMd = `# Chapter 14: Mendel and the Gene Idea\n\n`;
    fullMd += `*Campbell Biology, AP Edition, 12e*\n\n`;
    fullMd += `---\n\n`;
    for (const p of uniquePages) {
      // Clean up excessive blank lines
      const cleaned = p.content.replace(/\n{4,}/g, "\n\n\n");
      fullMd += `<!-- Page ${p.page} -->\n${cleaned}\n\n---\n\n`;
    }
    await fs.writeFile(path.join(OUTPUT_DIR, "Chapter_14_Mendel_and_the_Gene_Idea.md"), fullMd);
    console.log(`Saved: Chapter_14_Mendel_and_the_Gene_Idea.md (${fullMd.length} chars total)`);

    await screenshot(page, "done");
    console.log("\n✅ Done!");
  } catch (err) {
    console.error("Fatal error:", err.message);
    console.error(err.stack);
    await screenshot(page, "error_fatal");
  } finally {
    await browser.close();
  }
}

main();
