import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config } from "dotenv";

config();

const client = new ImapFlow({
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  logger: false,
});

async function main() {
  await client.connect();
  console.log("Connected to Gmail.");

  const lock = await client.getMailboxLock("INBOX");
  try {
    // Search for recent Pearson emails
    const messages = await client.search({
      since: new Date(Date.now() - 30 * 60 * 1000), // last 30 minutes
    });
    console.log(`Found ${messages.length} recent messages.`);

    for (const uid of messages) {
      const msg = await client.fetchOne(uid, { source: true });
      const rawBody = msg.source.toString();

      // Check if it's from Pearson
      const fromMatch = rawBody.match(/From:.*?(pearson|verification)/i);
      const subjectMatch = rawBody.match(/Subject:\s*(.+)/i);

      console.log(`\n--- UID: ${uid} ---`);
      console.log(`Subject: ${subjectMatch?.[1]?.trim() || "unknown"}`);
      console.log(`From Pearson: ${!!fromMatch}`);

      // Show a chunk of the body to find the code pattern
      // Strip headers, just get the body part
      const bodyStart = rawBody.indexOf("\r\n\r\n");
      const bodyPart = rawBody.substring(bodyStart, bodyStart + 2000);
      console.log(`Body preview:\n${bodyPart}\n`);

      // Try to find 6-digit codes
      const allNumbers = rawBody.match(/\b\d{6}\b/g);
      console.log(`All 6-digit numbers found: ${JSON.stringify(allNumbers)}`);
    }
  } finally {
    lock.release();
  }

  await client.logout();
}

main().catch(console.error);
