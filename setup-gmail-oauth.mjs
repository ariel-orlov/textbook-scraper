import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { config } from "dotenv";

config();

const GMAIL = process.env.GMAIL_USER;
const PASSWORD = process.env.GMAIL_PASSWORD;
const SCREENSHOTS_DIR = "./output/screenshots/gmail-setup";
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

async function main() {
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--no-sandbox", "--start-maximized"],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  try {
    // Step 1: Go to Google Cloud Console
    console.log("Navigating to Google Cloud Console...");
    await page.goto("https://console.cloud.google.com/", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 3000));
    await screenshot(page, "cloud_console_initial");

    // Handle Google login if needed
    const url = page.url();
    if (url.includes("accounts.google.com") || url.includes("signin")) {
      console.log("Google login required...");

      // Email input
      await page.waitForSelector('input[type="email"]', { timeout: 15000 });
      await page.type('input[type="email"]', GMAIL, { delay: 30 });
      await screenshot(page, "email_entered");

      // Click Next
      await page.evaluate(() => {
        const btns = document.querySelectorAll("button, div[role='button']");
        for (const btn of btns) {
          if (btn.textContent?.trim() === "Next" || btn.textContent?.trim() === "Volgende") {
            btn.click(); return;
          }
        }
      });
      await new Promise((r) => setTimeout(r, 3000));
      await screenshot(page, "after_email_next");

      // Password input
      await page.waitForSelector('input[type="password"]', { timeout: 15000 }).catch(() => {});
      const pwInput = await page.$('input[type="password"]');
      if (pwInput) {
        await pwInput.type(PASSWORD, { delay: 30 });
        await screenshot(page, "password_entered");

        // Click Next
        await page.evaluate(() => {
          const btns = document.querySelectorAll("button, div[role='button']");
          for (const btn of btns) {
            if (btn.textContent?.trim() === "Next" || btn.textContent?.trim() === "Volgende") {
              btn.click(); return;
            }
          }
        });
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 5000));
        await screenshot(page, "after_login");
      }

      // Handle any 2FA or verification prompts
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (bodyText.includes("2-Step Verification") || bodyText.includes("Verify")) {
        console.log("\n⚠️  Google 2FA detected! Complete it in the browser.");
        console.log("⏳ Waiting up to 3 minutes...\n");
        const start = Date.now();
        while (Date.now() - start < 180000) {
          await new Promise((r) => setTimeout(r, 2000));
          const curUrl = page.url();
          if (curUrl.includes("console.cloud.google.com")) {
            console.log("✅ Login completed!");
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 3000));
        await screenshot(page, "after_2fa");
      }
    }

    // Accept any ToS if prompted
    await new Promise((r) => setTimeout(r, 3000));
    const tosText = await page.evaluate(() => document.body.innerText);
    if (tosText.includes("Terms of Service") || tosText.includes("I agree")) {
      console.log("Accepting Terms of Service...");
      await page.evaluate(() => {
        // Check any checkboxes
        document.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          if (!cb.checked) cb.click();
        });
      });
      await new Promise((r) => setTimeout(r, 500));
      await page.evaluate(() => {
        const btns = document.querySelectorAll("button, div[role='button']");
        for (const btn of btns) {
          if (btn.textContent?.includes("Agree") || btn.textContent?.includes("AGREE")) {
            btn.click(); return;
          }
        }
      });
      await new Promise((r) => setTimeout(r, 3000));
    }

    await screenshot(page, "console_ready");
    console.log("Cloud Console loaded.");

    // Step 2: Create a new project
    console.log("\nCreating new project...");
    await page.goto("https://console.cloud.google.com/projectcreate", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 3000));
    await screenshot(page, "create_project_page");

    // Fill project name
    const projectNameInput = await page.$('input[aria-label="Project name"], input[formcontrolname="projectName"], input[type="text"]');
    if (projectNameInput) {
      await projectNameInput.click({ clickCount: 3 });
      await projectNameInput.type("gmail-mcp-server", { delay: 30 });
      await screenshot(page, "project_name_entered");
    }

    // Click Create
    await page.evaluate(() => {
      const btns = document.querySelectorAll("button");
      for (const btn of btns) {
        if (btn.textContent?.trim() === "CREATE" || btn.textContent?.trim() === "Create") {
          btn.click(); return;
        }
      }
    });

    console.log("Waiting for project creation...");
    await new Promise((r) => setTimeout(r, 15000));
    await screenshot(page, "project_created");

    // Step 3: Enable Gmail API
    console.log("\nEnabling Gmail API...");
    await page.goto("https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=gmail-mcp-server", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 5000));
    await screenshot(page, "gmail_api_page");

    // Click Enable
    await page.evaluate(() => {
      const btns = document.querySelectorAll("button");
      for (const btn of btns) {
        const text = btn.textContent?.trim().toUpperCase();
        if (text === "ENABLE" || text === "ENABLE API") {
          btn.click(); return;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 10000));
    await screenshot(page, "gmail_api_enabled");

    // Step 4: Configure OAuth consent screen
    console.log("\nConfiguring OAuth consent screen...");
    await page.goto("https://console.cloud.google.com/apis/credentials/consent?project=gmail-mcp-server", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 5000));
    await screenshot(page, "oauth_consent_page");

    // Select External user type
    await page.evaluate(() => {
      const labels = document.querySelectorAll("label, mat-radio-button, div[role='radio']");
      for (const el of labels) {
        if (el.textContent?.includes("External")) {
          el.click(); return;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Click Create
    await page.evaluate(() => {
      const btns = document.querySelectorAll("button");
      for (const btn of btns) {
        if (btn.textContent?.trim() === "CREATE" || btn.textContent?.trim() === "Create") {
          btn.click(); return;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 5000));
    await screenshot(page, "consent_type_selected");

    // Fill in app name and user support email
    const bodyText2 = await page.evaluate(() => document.body.innerText);
    if (bodyText2.includes("App name") || bodyText2.includes("app name")) {
      // App name
      const appNameInput = await page.$('input[formcontrolname="displayName"], input[aria-label*="App name"]');
      if (appNameInput) {
        await appNameInput.click({ clickCount: 3 });
        await appNameInput.type("Gmail MCP", { delay: 30 });
      } else {
        // Try first visible text input
        const inputs = await page.$$('input[type="text"]');
        if (inputs.length > 0) {
          await inputs[0].click({ clickCount: 3 });
          await inputs[0].type("Gmail MCP", { delay: 30 });
        }
      }

      // User support email
      const emailInputs = await page.$$('input[type="email"], input[aria-label*="email"]');
      for (const input of emailInputs) {
        await input.click({ clickCount: 3 });
        await input.type(GMAIL, { delay: 30 });
      }

      await screenshot(page, "consent_form_filled");

      // Scroll down and fill developer contact email if needed
      await page.evaluate(() => window.scrollBy(0, 500));
      await new Promise((r) => setTimeout(r, 1000));

      // Click Save and Continue
      await page.evaluate(() => {
        const btns = document.querySelectorAll("button");
        for (const btn of btns) {
          if (btn.textContent?.includes("SAVE AND CONTINUE") || btn.textContent?.includes("Save and Continue") || btn.textContent?.includes("SAVE")) {
            btn.click(); return;
          }
        }
      });
      await new Promise((r) => setTimeout(r, 5000));
      await screenshot(page, "consent_saved");

      // Skip scopes page — just click Save and Continue again
      await page.evaluate(() => {
        const btns = document.querySelectorAll("button");
        for (const btn of btns) {
          if (btn.textContent?.includes("SAVE AND CONTINUE") || btn.textContent?.includes("Save and Continue") || btn.textContent?.includes("SAVE")) {
            btn.click(); return;
          }
        }
      });
      await new Promise((r) => setTimeout(r, 3000));

      // Skip test users — Save and Continue
      await page.evaluate(() => {
        const btns = document.querySelectorAll("button");
        for (const btn of btns) {
          if (btn.textContent?.includes("SAVE AND CONTINUE") || btn.textContent?.includes("Save and Continue") || btn.textContent?.includes("SAVE")) {
            btn.click(); return;
          }
        }
      });
      await new Promise((r) => setTimeout(r, 3000));
      await screenshot(page, "consent_complete");
    }

    // Step 5: Create OAuth credentials
    console.log("\nCreating OAuth credentials...");
    await page.goto("https://console.cloud.google.com/apis/credentials/oauthclient?project=gmail-mcp-server", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 5000));
    await screenshot(page, "create_oauth_page");

    // Select "Desktop app" from application type dropdown
    // Click the dropdown first
    await page.evaluate(() => {
      const dropdowns = document.querySelectorAll("mat-select, [role='listbox'], [aria-label*='Application type'], select");
      for (const dd of dropdowns) {
        dd.click(); return;
      }
      // Fallback: click any dropdown-looking element
      const divs = document.querySelectorAll("[class*='select'], [class*='dropdown']");
      for (const d of divs) {
        d.click(); return;
      }
    });
    await new Promise((r) => setTimeout(r, 2000));
    await screenshot(page, "dropdown_opened");

    // Select Desktop app
    await page.evaluate(() => {
      const options = document.querySelectorAll("mat-option, [role='option'], option, li");
      for (const opt of options) {
        if (opt.textContent?.includes("Desktop app") || opt.textContent?.includes("Desktop")) {
          opt.click(); return;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 2000));
    await screenshot(page, "desktop_app_selected");

    // Set name
    const nameInput = await page.$('input[formcontrolname="name"], input[aria-label*="Name"]');
    if (nameInput) {
      await nameInput.click({ clickCount: 3 });
      await nameInput.type("Gmail MCP Client", { delay: 30 });
    }

    // Click Create
    await page.evaluate(() => {
      const btns = document.querySelectorAll("button");
      for (const btn of btns) {
        if (btn.textContent?.trim() === "CREATE" || btn.textContent?.trim() === "Create") {
          btn.click(); return;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 5000));
    await screenshot(page, "oauth_client_created");

    // Step 6: Download the JSON
    console.log("\nDownloading OAuth credentials JSON...");

    // Look for "DOWNLOAD JSON" button in the dialog
    const downloadClicked = await page.evaluate(() => {
      const btns = document.querySelectorAll("button, a");
      for (const btn of btns) {
        const text = btn.textContent?.trim().toUpperCase();
        if (text?.includes("DOWNLOAD JSON") || text?.includes("DOWNLOAD")) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (downloadClicked) {
      console.log("Download triggered, waiting for file...");
      await new Promise((r) => setTimeout(r, 5000));
    }

    await screenshot(page, "download_clicked");

    // If download didn't work from dialog, go to credentials page and download from there
    console.log("Checking credentials page for download...");
    await page.goto("https://console.cloud.google.com/apis/credentials?project=gmail-mcp-server", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await new Promise((r) => setTimeout(r, 5000));
    await screenshot(page, "credentials_page");

    // Look for the OAuth client and click download
    await page.evaluate(() => {
      // Find download icons/buttons near OAuth 2.0 Client IDs
      const downloadBtns = document.querySelectorAll('[aria-label*="Download"], [aria-label*="download"], button[mattooltip*="Download"]');
      if (downloadBtns.length > 0) {
        downloadBtns[0].click();
      }
    });
    await new Promise((r) => setTimeout(r, 5000));
    await screenshot(page, "final_state");

    // Check Downloads folder for the JSON file
    const downloadsDir = path.join(process.env.HOME, "Downloads");
    const files = await fs.readdir(downloadsDir);
    const oauthFile = files.find((f) => f.startsWith("client_secret") && f.endsWith(".json"));

    if (oauthFile) {
      const src = path.join(downloadsDir, oauthFile);
      const dest = path.join(process.env.HOME, ".gmail-mcp", "gcp-oauth.keys.json");
      await fs.copyFile(src, dest);
      console.log(`\n✅ OAuth credentials saved to ${dest}`);
    } else {
      console.log("\n⚠️  Could not find downloaded JSON file automatically.");
      console.log("Check ~/Downloads/ for a file starting with 'client_secret'");
      console.log("Then run: cp ~/Downloads/client_secret_*.json ~/.gmail-mcp/gcp-oauth.keys.json");
    }

    console.log("\nDone with Google Cloud setup!");
  } catch (err) {
    console.error("Error:", err.message);
    await screenshot(page, "error");
  } finally {
    await browser.close();
  }
}

main();
