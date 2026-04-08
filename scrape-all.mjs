import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config } from "dotenv";

config();

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const OUTPUT_DIR = "./output";
const SCREENSHOTS_DIR = "./output/screenshots/full-scrape";
const IMAGES_DIR = "./output/images";
const PROGRESS_FILE = "./output/scrape-progress.json";
let screenshotCounter = 0;

async function screenshot(page, label) {
  screenshotCounter++;
  const filename = path.join(
    SCREENSHOTS_DIR,
    `${String(screenshotCounter).padStart(3, "0")}_${label}.png`
  );
  await page.screenshot({ path: filename, fullPage: false });
  console.log(`  📸 ${filename}`);
}

async function fetchVerificationCode(maxWaitSecs = 120) {
  console.log("  Checking Gmail for Pearson verification code...");
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  });

  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitSecs * 1000) {
    try {
      await client.connect();
      await client.mailboxOpen("INBOX");
      const messages = await client.search({
        from: "pearson",
        since: new Date(Date.now() - 5 * 60 * 1000),
      });

      if (messages.length > 0) {
        const lastUid = messages[messages.length - 1];
        const msg = await client.fetchOne(lastUid, { source: true });
        const parsed = await simpleParser(msg.source);
        const textBody = parsed.text || "";
        console.log(`  Email subject: ${parsed.subject || "?"}`);

        const patterns = [
          /verification code[:\s]*(\d{6})/i,
          /code[:\s]+(\d{6})/i,
          /(\d{6})\s*(?:is your|verification)/i,
          /Your code:\s*(\d{6})/i,
          /^\s*(\d{6})\s*$/m,
        ];
        for (const pattern of patterns) {
          const match = textBody.match(pattern);
          if (match) {
            console.log(`  ✅ Found verification code: ${match[1]}`);
            await client.logout();
            return match[1];
          }
        }

        const cssColors = new Set(["000000","111111","222222","252525","333333",
          "444444","555555","666666","777777","888888","999999","ffffff"]);
        const allNums = textBody.match(/\b(\d{6})\b/g) || [];
        const filtered = allNums.filter((n) => !cssColors.has(n.toLowerCase()));
        if (filtered.length > 0) {
          console.log(`  ✅ Found verification code (fallback): ${filtered[0]}`);
          await client.logout();
          return filtered[0];
        }
      }
      await client.logout();
    } catch (e) {
      console.log(`  Gmail check error: ${e.message}`);
      try { await client.logout(); } catch (_) {}
    }
    console.log("  No code yet, waiting 5s...");
    await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
}

async function clickElementByText(page, text) {
  return page.evaluate((searchText) => {
    const els = document.querySelectorAll("button, a, input[type='submit'], div[role='button'], span[role='button']");
    for (const el of els) {
      const t = el.textContent?.trim() || el.value || "";
      if (t.includes(searchText)) { el.click(); return t.substring(0, 50); }
    }
    return false;
  }, text);
}

async function login(page) {
  const email = process.env.PEARSON_EMAIL;
  const password = process.env.PEARSON_PASSWORD;

  console.log("Navigating to Pearson Plus login...");
  await page.goto("https://plus.pearson.com/home", { waitUntil: "networkidle2", timeout: 60000 });

  await new Promise((r) => setTimeout(r, 2000));
  await clickElementByText(page, "Allow and Continue");
  await new Promise((r) => setTimeout(r, 1500));

  await page.waitForSelector('input[type="password"]', { timeout: 30000 });
  console.log("Entering credentials...");
  const emailInput = await page.$('input[type="text"], input[type="email"], input[name="username"]');
  await emailInput.click({ clickCount: 3 });
  await emailInput.type(email, { delay: 30 });
  const passwordInput = await page.$('input[type="password"]');
  await passwordInput.click({ clickCount: 3 });
  await passwordInput.type(password, { delay: 30 });

  console.log("Clicking Sign In...");
  await page.evaluate(() => {
    const els = document.querySelectorAll("button, a, input[type='submit'], div[role='button']");
    for (const el of els) {
      if ((el.textContent?.trim() || el.value || "").match(/^Sign In$/i)) { el.click(); return; }
    }
  });

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));

  const pageText = await page.evaluate(() => document.body.innerText);
  if (pageText.includes("Multifactor") || pageText.includes("verification code")) {
    console.log("\n⚠️  MFA detected! Auto-handling...");
    await new Promise((r) => setTimeout(r, 1000));
    await clickElementByText(page, "Send verification code");
    await new Promise((r) => setTimeout(r, 3000));
    await screenshot(page, "mfa_code_sent");

    const code = await fetchVerificationCode(120);
    if (code) {
      await new Promise((r) => setTimeout(r, 2000));
      const codeInput = await page.evaluateHandle(() => {
        const inputs = document.querySelectorAll("input");
        for (const input of inputs) {
          if (input.type === "text" || input.type === "number" || input.type === "tel" ||
              input.getAttribute("aria-label")?.toLowerCase().includes("code") ||
              input.getAttribute("placeholder")?.toLowerCase().includes("code")) return input;
        }
        for (const input of inputs) {
          if (!["hidden","email","password","submit","button","checkbox","radio"].includes(input.type) &&
              input.offsetParent !== null) return input;
        }
        return null;
      });
      const el = codeInput.asElement();
      if (el) {
        await el.click({ clickCount: 3 });
        await page.keyboard.press("Backspace");
        await el.type(code, { delay: 50 });
        console.log(`  Code "${code}" typed.`);
        await new Promise((r) => setTimeout(r, 1000));
        await clickElementByText(page, "Continue");
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 5000));
        console.log("✅ MFA completed!");
      }
    } else {
      console.log("  ⚠️ Could not get code. Waiting for manual MFA (5 min)...");
      const s = Date.now();
      while (Date.now() - s < 300000) {
        await new Promise((r) => setTimeout(r, 2000));
        const t = await page.evaluate(() => document.body.innerText);
        if (!t.includes("Multifactor") && !t.includes("verification code")) break;
      }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  await new Promise((r) => setTimeout(r, 2000));
  await clickElementByText(page, "Open eTextbook");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 5000));
  console.log("Reader loaded.");
}

async function goToPage(page, targetPage) {
  const pageInput = await page.evaluateHandle(() => {
    const inputs = document.querySelectorAll("input");
    for (const input of inputs) {
      if (/^\d+$/.test(input.value.trim())) return input;
    }
    return null;
  });
  const el = pageInput.asElement();
  if (el) {
    await el.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await el.type(targetPage.toString());
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 3000));
    return true;
  }
  return false;
}

async function goToNextPage(page) {
  let clicked = false;
  try {
    clicked = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label*="next page"]');
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    });
  } catch (e) { clicked = false; }
  if (clicked) await new Promise((r) => setTimeout(r, 3500));
  return clicked;
}

async function getTotalPages(page) {
  return page.evaluate(() => {
    // Look for "of X" text near the page input
    const spans = document.querySelectorAll("span, div, p");
    for (const el of spans) {
      const m = el.textContent?.match(/of\s+(\d+)/);
      if (m) return parseInt(m[1]);
    }
    return null;
  });
}

async function getCurrentPage(page) {
  try {
    return await page.evaluate(() => {
      const inputs = document.querySelectorAll("input");
      for (const input of inputs) {
        if (/^\d+$/.test(input.value.trim())) return parseInt(input.value.trim());
      }
      return null;
    });
  } catch (e) { return null; }
}

async function hasNextPage(page) {
  try {
    return await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label*="next page"]');
      return !!(btn && !btn.disabled);
    });
  } catch (e) { return true; } // assume more pages if we can't check
}

async function isReaderLoaded(page) {
  try {
    return await page.evaluate(() => {
      const hasIframe = !!document.querySelector('#contentIframe, iframe[id*="content"], iframe[src*="pearson"]');
      const hasLoginForm = !!document.querySelector('input[type="password"]');
      return hasIframe && !hasLoginForm;
    });
  } catch (e) {
    // Frame temporarily detached during navigation — not a logout
    return true;
  }
}

async function ensureLoggedIn(page, pageNum) {
  // Let any in-flight navigation settle before evaluating
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 6000 }).catch(() => {});
  let loaded = true;
  try { loaded = await isReaderLoaded(page); } catch (e) { loaded = false; }
  if (!loaded) {
    console.log(`\n⚠️  Session expired at page ${pageNum}! Re-logging in...`);
    await login(page);
    await goToPage(page, pageNum);
    await new Promise(r => setTimeout(r, 3000));
    console.log(`  ✅ Re-logged in, back at page ${pageNum}`);
  }
}

async function extractPageContent(page) {
  return page.evaluate(() => {
    const iframe = document.querySelector("#contentIframe");
    if (!iframe) return { md: "", raw: "", images: [] };

    let doc;
    try { doc = iframe.contentDocument || iframe.contentWindow?.document; }
    catch (e) { return { md: "", raw: "", images: [] }; }
    if (!doc || !doc.body) return { md: "", raw: "", images: [] };

    const images = [];

    function tableToMd(tableNode) {
      const rows = tableNode.querySelectorAll("tr");
      if (rows.length === 0) return "";
      const tableData = [];
      for (const row of rows) {
        const cells = row.querySelectorAll("th, td");
        const rowData = [];
        for (const cell of cells) {
          rowData.push({ text: cell.innerText?.trim().replace(/\n/g, " ") || "", isHeader: cell.tagName === "TH" });
        }
        tableData.push(rowData);
      }
      if (tableData.length === 0) return "";
      const maxCols = Math.max(...tableData.map((r) => r.length));
      let md = "\n";
      md += "| " + tableData[0].map((c) => c.text).join(" | ") + " |\n";
      md += "| " + tableData[0].map(() => "---").join(" | ") + " |\n";
      for (let i = 1; i < tableData.length; i++) {
        const row = tableData[i];
        while (row.length < maxCols) row.push({ text: "" });
        md += "| " + row.map((c) => c.text).join(" | ") + " |\n";
      }
      return md + "\n";
    }

    function nodeToMd(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = node.tagName.toLowerCase();
      if (["script","style","noscript","svg","button","nav"].includes(tag)) return "";
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
          if (src) { images.push({ alt, src }); return `\n![${alt}](images/img_${images.length - 1}.jpg)\n`; }
          return `\n![${alt}]\n`;
        }
        case "span": return children;
        case "div": return trimmed ? `\n${children}\n` : children;
        case "section": return `\n${children}\n`;
        case "thead": case "tbody": case "tr": case "th": case "td": return "";
        default: return children;
      }
    }

    const md = nodeToMd(doc.body);
    const raw = doc.body.innerText;
    // Try to detect chapter title from the first heading
    const firstH1 = doc.querySelector("h1, h2");
    const title = firstH1?.innerText?.trim() || "";
    return { md, raw, images, title };
  });
}

async function downloadImages(page, images, pageNum) {
  const downloaded = [];
  for (let i = 0; i < images.length; i++) {
    if (!images[i].src) continue;
    try {
      const imageBuffer = await page.evaluate(async (src) => {
        const iframe = document.querySelector("#contentIframe");
        const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
        if (!doc) return null;
        const fullUrl = new URL(src, doc.baseURI || iframe.src).href;
        try {
          const r = await fetch(fullUrl);
          if (!r.ok) return null;
          const b = await r.blob();
          return Array.from(new Uint8Array(await b.arrayBuffer()));
        } catch { return null; }
      }, images[i].src);

      if (imageBuffer) {
        const ext = images[i].src.match(/\.(png|jpg|jpeg|gif|webp|svg)/i)?.[1] || "jpg";
        const filename = `img_p${pageNum}_${i}.${ext}`;
        await fs.writeFile(path.join(IMAGES_DIR, filename), Buffer.from(imageBuffer));
        downloaded.push(filename);
      }
    } catch {}
  }
  return downloaded;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9\s\-_.]/g, "").replace(/\s+/g, "_").substring(0, 100);
}

async function loadProgress() {
  try {
    const data = await fs.readFile(PROGRESS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return { lastPage: 0, chapters: [], totalPages: null };
  }
}

async function saveProgress(progress) {
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
  await fs.mkdir(IMAGES_DIR, { recursive: true });

  const progress = await loadProgress();
  console.log(`Previous progress: last page=${progress.lastPage}, chapters found=${progress.chapters.length}`);

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--no-sandbox", "--start-maximized"],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    await login(page);

    // Get total page count
    await new Promise((r) => setTimeout(r, 2000));
    const totalPages = await getTotalPages(page);
    console.log(`Total pages in textbook: ${totalPages || "unknown"}`);
    if (totalPages) progress.totalPages = totalPages;

    // Resume from where we left off (or start at page 1)
    const startPage = progress.lastPage > 0 ? progress.lastPage + 1 : 1;
    const endPage = totalPages || 2000; // fallback high number

    if (startPage > 1) {
      console.log(`Resuming from page ${startPage}...`);
      await goToPage(page, startPage);
    } else {
      await goToPage(page, 1);
    }
    await new Promise((r) => setTimeout(r, 2000));

    let lastContentHash = "";
    let currentChapterTitle = "";
    let currentChapterPages = [];
    let currentChapterImages = [];
    let chaptersCompleted = progress.chapters.length;

    for (let p = startPage; p <= endPage; p++) {
      if (p > startPage) {
        // Check end-of-book WITHOUT clicking (avoids frame detachment)
        const more = await hasNextPage(page);
        if (!more) {
          console.log(`\nNo more pages after page ${p - 1}. End of textbook.`);
          break;
        }
        // Navigate by typing the page number — no iframe detachment
        await goToPage(page, p);
      }

      await ensureLoggedIn(page, p);

      // Verify current page
      const actual = await getCurrentPage(page);

      let content;
      try { content = await extractPageContent(page); } catch (e) { content = { md: "", raw: "", images: [] }; }
      let text = (content.md || "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "").trim();
      const rawText = (content.raw || "").trim();
      const finalText = text.length > 20 ? text : rawText;

      // Simple hash for dedup
      const hash = finalText.substring(0, 500);

      if (hash === lastContentHash) {
        // Same section, skip (duplicate page in same section)
        continue;
      }
      lastContentHash = hash;

      // Detect chapter changes from title
      const sectionTitle = content.title || "";
      const chapterMatch = sectionTitle.match(/^(Chapter[\s\u00A0\uFEFF\u200B]*\d+|Unit[\s\u00A0\uFEFF]*\d+|Appendix|Index|Glossary)/i);

      // If we detect a new chapter and have accumulated content, save the previous chapter
      if (chapterMatch && currentChapterPages.length > 0) {
        await saveChapter(currentChapterTitle, currentChapterPages, currentChapterImages, chaptersCompleted);
        chaptersCompleted++;
        progress.chapters.push(currentChapterTitle);
        currentChapterPages = [];
        currentChapterImages = [];
      }

      if (chapterMatch) {
        currentChapterTitle = sectionTitle;
        console.log(`\n📖 New chapter: ${sectionTitle} (page ${p})`);
      }
      if (!currentChapterTitle) currentChapterTitle = sectionTitle || `Section_starting_page_${p}`;

      // Download images
      let dlCount = 0;
      if (content.images && content.images.length > 0) {
        const dl = await downloadImages(page, content.images, p);
        dlCount = dl.length;
      }

      currentChapterPages.push({ page: p, content: finalText });
      console.log(`  Page ${actual || p}: ${finalText.length} chars, ${dlCount} imgs [${currentChapterTitle.substring(0, 40)}]`);

      // Save progress every page
      progress.lastPage = p;
      await saveProgress(progress);

      // Brief pause to be gentle on the server
      await new Promise((r) => setTimeout(r, 500));
    }

    // Save final chapter
    if (currentChapterPages.length > 0) {
      await saveChapter(currentChapterTitle, currentChapterPages, currentChapterImages, chaptersCompleted);
      progress.chapters.push(currentChapterTitle);
      await saveProgress(progress);
    }

    console.log(`\n\n✅ COMPLETE! Scraped ${progress.chapters.length} chapters, last page: ${progress.lastPage}`);
    await screenshot(page, "complete");

  } catch (err) {
    console.error(`\nFatal error: ${err.message}`);
    console.error(err.stack);
    await screenshot(page, "error").catch(() => {});
    await saveProgress(progress);
  } finally {
    await browser.close();
  }
}

async function saveChapter(title, pages, images, index) {
  const safeName = sanitizeFilename(title) || `section_${index}`;
  const filename = `${String(index + 1).padStart(2, "0")}_${safeName}.md`;

  let md = `# ${title}\n\n`;
  md += `*Campbell Biology, AP Edition, 12e*\n\n---\n\n`;
  for (const p of pages) {
    const cleaned = p.content.replace(/\n{4,}/g, "\n\n\n");
    md += `<!-- Page ${p.page} -->\n${cleaned}\n\n---\n\n`;
  }

  const filepath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(filepath, md);
  console.log(`\n  💾 Saved: ${filename} (${md.length} chars, ${pages.length} sections)`);
}

main();
