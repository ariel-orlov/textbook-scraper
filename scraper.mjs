import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";

const COURSE_URL =
  "https://plus.pearson.com/courses/mancuso86168/products/BRNT-6MS7SLXU3D/pages/31c89f60-eac2-11ed-8aa5-635cfb2303b0";
const OUTPUT_DIR = "./output";

async function login(page) {
  const email = process.env.PEARSON_EMAIL;
  const password = process.env.PEARSON_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set PEARSON_EMAIL and PEARSON_PASSWORD in your .env file"
    );
  }

  console.log("Navigating to Pearson Plus login...");
  await page.goto("https://plus.pearson.com/home", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  // Wait for and handle the login flow
  // Pearson uses a redirect-based auth — wait for email input
  await page.waitForSelector('input[type="email"], input[name="email"], #email, input[name="username"]', {
    timeout: 30000,
  });
  console.log("Login page loaded, entering credentials...");

  const emailInput = await page.$(
    'input[type="email"], input[name="email"], #email, input[name="username"]'
  );
  await emailInput.click({ clickCount: 3 });
  await emailInput.type(email, { delay: 50 });

  // Look for a "next" or "sign in" button after email
  const nextBtn = await page.$(
    'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Next")'
  );
  if (nextBtn) {
    await nextBtn.click();
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  }

  // Wait for password field (may appear on same or next page)
  await page
    .waitForSelector('input[type="password"]', { timeout: 15000 })
    .catch(() => {});
  const passwordInput = await page.$('input[type="password"]');
  if (passwordInput) {
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 50 });
  }

  // Submit login
  const submitBtn = await page.$(
    'button[type="submit"], input[type="submit"]'
  );
  if (submitBtn) {
    await submitBtn.click();
  }

  // Wait for redirect back to Pearson Plus
  console.log("Waiting for login to complete...");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });

  // Verify we're logged in by checking URL or page content
  const currentUrl = page.url();
  console.log(`Post-login URL: ${currentUrl}`);
  if (currentUrl.includes("signin") || currentUrl.includes("login")) {
    throw new Error("Login appears to have failed — still on login page");
  }
  console.log("Login successful!");
}

async function getTableOfContents(page) {
  console.log("Navigating to textbook...");
  await page.goto(COURSE_URL, { waitUntil: "networkidle2", timeout: 60000 });

  // Wait for the reader to load
  await page.waitForSelector('[class*="toc"], [class*="sidebar"], nav, [role="navigation"]', {
    timeout: 30000,
  }).catch(() => {});

  // Try to open the table of contents / sidebar
  const tocTriggers = [
    '[aria-label*="table of contents" i]',
    '[aria-label*="menu" i]',
    'button[class*="toc"]',
    '[class*="sidebar-toggle"]',
    '[data-testid*="toc"]',
  ];
  for (const selector of tocTriggers) {
    const btn = await page.$(selector);
    if (btn) {
      await btn.click();
      await new Promise((r) => setTimeout(r, 2000));
      break;
    }
  }

  // Take a screenshot for debugging
  await page.screenshot({ path: path.join(OUTPUT_DIR, "_debug_toc.png"), fullPage: false });

  // Extract all section links from TOC
  const sections = await page.evaluate(() => {
    const links = [];
    // Try multiple selectors for TOC entries
    const selectors = [
      'a[href*="/pages/"]',
      '[class*="toc"] a',
      'nav a[href*="page"]',
      '[role="navigation"] a',
      '[class*="sidebar"] a[href]',
    ];
    const seen = new Set();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        const href = el.href || el.getAttribute("href");
        const text = el.textContent?.trim();
        if (href && text && !seen.has(href)) {
          seen.add(href);
          links.push({ title: text, url: href });
        }
      });
    }
    return links;
  });

  console.log(`Found ${sections.length} sections in table of contents`);
  return sections;
}

function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9\s\-_.]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}

async function extractPageContent(page, url, title, index) {
  console.log(`\n[${index}] Extracting: ${title}`);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

  // Wait for content to render
  await new Promise((r) => setTimeout(r, 3000));

  // Scroll to load lazy content
  await autoScroll(page);

  // Extract the main content
  const content = await page.evaluate(() => {
    // Try to find the main reading content area
    const contentSelectors = [
      '[class*="page-content"]',
      '[class*="reader-content"]',
      '[class*="content-body"]',
      '[role="main"]',
      "main",
      "article",
      '[class*="epub"]',
      '[class*="chapter"]',
      "#content",
    ];

    let container = null;
    for (const sel of contentSelectors) {
      container = document.querySelector(sel);
      if (container) break;
    }
    if (!container) container = document.body;

    // Convert DOM to markdown-ish text
    function nodeToMd(node, depth = 0) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const tag = node.tagName.toLowerCase();
      const children = Array.from(node.childNodes)
        .map((c) => nodeToMd(c, depth))
        .join("");

      switch (tag) {
        case "h1":
          return `\n# ${children.trim()}\n\n`;
        case "h2":
          return `\n## ${children.trim()}\n\n`;
        case "h3":
          return `\n### ${children.trim()}\n\n`;
        case "h4":
          return `\n#### ${children.trim()}\n\n`;
        case "h5":
          return `\n##### ${children.trim()}\n\n`;
        case "h6":
          return `\n###### ${children.trim()}\n\n`;
        case "p":
          return `\n${children.trim()}\n\n`;
        case "br":
          return "\n";
        case "strong":
        case "b":
          return `**${children.trim()}**`;
        case "em":
        case "i":
          return `*${children.trim()}*`;
        case "ul":
          return `\n${children}\n`;
        case "ol":
          return `\n${children}\n`;
        case "li":
          return `- ${children.trim()}\n`;
        case "blockquote":
          return `\n> ${children.trim()}\n\n`;
        case "code":
          return `\`${children}\``;
        case "pre":
          return `\n\`\`\`\n${children}\n\`\`\`\n\n`;
        case "img": {
          const alt = node.getAttribute("alt") || "";
          const src = node.getAttribute("src") || "";
          return `\n![${alt}](${src})\n`;
        }
        case "a": {
          const href = node.getAttribute("href") || "";
          return `[${children.trim()}](${href})`;
        }
        case "table":
          return `\n${children}\n`;
        case "tr":
          return `| ${children} |\n`;
        case "th":
        case "td":
          return ` ${children.trim()} |`;
        case "sup":
          return `^(${children})`;
        case "sub":
          return `_(${children})`;
        case "script":
        case "style":
        case "nav":
        case "header":
        case "footer":
          return "";
        default:
          return children;
      }
    }

    return nodeToMd(container);
  });

  // Clean up the markdown
  const cleaned = content
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();

  return cleaned;
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 200);
      // Safety timeout
      setTimeout(() => {
        clearInterval(timer);
        window.scrollTo(0, 0);
        resolve();
      }, 30000);
    });
  });
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false, // Use headed mode so you can see what's happening & handle CAPTCHAs
    defaultViewport: { width: 1280, height: 900 },
    args: ["--no-sandbox"],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    await login(page);
    const sections = await getTableOfContents(page);

    if (sections.length === 0) {
      console.log(
        "\nNo sections found automatically. Taking a screenshot for debugging..."
      );
      await page.screenshot({
        path: path.join(OUTPUT_DIR, "_debug_page.png"),
        fullPage: true,
      });
      console.log("Screenshot saved to output/_debug_page.png");
      console.log(
        "You may need to adjust the TOC selectors based on the page structure."
      );

      // Fallback: try to extract just the current page
      console.log("\nExtracting current page as fallback...");
      const content = await extractPageContent(
        page,
        COURSE_URL,
        "current_page",
        0
      );
      const filename = path.join(OUTPUT_DIR, "00_current_page.md");
      await fs.writeFile(filename, `# Current Page\n\n${content}`);
      console.log(`Saved: ${filename}`);
    } else {
      // Save TOC index
      const tocMd = sections
        .map((s, i) => `${i + 1}. [${s.title}](${s.url})`)
        .join("\n");
      await fs.writeFile(
        path.join(OUTPUT_DIR, "00_table_of_contents.md"),
        `# Table of Contents\n\n${tocMd}\n`
      );

      // Extract each section
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        try {
          const content = await extractPageContent(
            page,
            section.url,
            section.title,
            i + 1
          );
          const filename = path.join(
            OUTPUT_DIR,
            `${String(i + 1).padStart(2, "0")}_${sanitizeFilename(section.title)}.md`
          );
          await fs.writeFile(
            filename,
            `# ${section.title}\n\n${content}\n`
          );
          console.log(`  Saved: ${filename}`);
        } catch (err) {
          console.error(`  Error extracting "${section.title}": ${err.message}`);
        }
        // Small delay between pages to be gentle
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    console.log("\nDone! Content saved to ./output/");
  } catch (err) {
    console.error("Fatal error:", err.message);
    await page.screenshot({
      path: path.join(OUTPUT_DIR, "_error_screenshot.png"),
      fullPage: true,
    });
    console.log("Error screenshot saved to output/_error_screenshot.png");
  } finally {
    await browser.close();
  }
}

main();
