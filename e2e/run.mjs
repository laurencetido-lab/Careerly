/**
 * End-to-end acceptance run (Playwright, real browser, real server + worker + Postgres).
 * Usage: start `npm run start` and `npm run worker`, then `npm run test:e2e`.
 * Live research providers are NOT configured in CI, so the script verifies that live
 * research is blocked with a clear message and uses the manual research workflow instead.
 */
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import ExcelJS from "exceljs";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const FIX = new URL("./fixtures/", import.meta.url).pathname;
const OUT = new URL("./artifacts/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const stamp = Date.now();
const results = [];
const step = async (name, fn) => {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`✔ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e.message ?? e).split("\n")[0] });
    await page?.screenshot({ path: `${OUT}FAILED.png` }).catch(() => {});
    console.log(`✘ ${name}: ${e.message}`);
    throw e;
  }
};

const browser = await chromium.launch();
const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
const page = await ctxA.newPage();
const shot = (n) => page.screenshot({ path: `${OUT}${n}.png`, fullPage: false });
let wsUrl = "", tableUrl = "";

async function signup(p, name, email) {
  await p.goto(`${BASE}/signup`);
  await p.getByLabel("Your name").fill(name);
  await p.getByLabel("Email").fill(email);
  await p.getByLabel("Password").fill("correct-horse-battery");
  await p.locator('input[name="privacy"]').check();
  await p.getByRole("button", { name: "Create account" }).click();
  await p.waitForURL("**/app/onboarding");
}

try {
  await step("1. New user creates an account", () => signup(page, "Léa Martin", `lea+${stamp}@example.com`));

  await step("2. Creates a workspace (objective, locations, roles)", async () => {
    await page.getByLabel("Workspace name").fill("Real Estate Investment CDI 2027");
    await page.getByLabel("Your career objective").fill("I am graduating in June 2027 and want a high-paying investment analyst position in Paris or London, preferably in private equity real estate.");
    await page.getByLabel("Target locations").fill("Paris, London");
    await page.getByLabel("Target roles").fill("Investment Analyst");
    await page.getByRole("button", { name: /I have a spreadsheet/ }).click();
    await page.waitForURL("**/import");
    wsUrl = page.url().replace(/\/import$/, "");
  });

  await step("4–5. Uploads an Excel file and reviews detected columns", async () => {
    await page.getByTestId("import-file").setInputFiles(FIX + "funds.xlsx");
    await page.getByText("Columns", { exact: true }).waitFor();
    // Detected types
    if ((await page.getByLabel("Type of Analyst Salary").inputValue()) !== "CURRENCY") throw new Error("salary not detected as currency");
    if ((await page.getByLabel("Type of Graduate Programme").inputValue()) !== "BOOLEAN") throw new Error("grad programme not boolean");
    if ((await page.getByLabel("Role of Company").inputValue()) !== "company.name") throw new Error("employer column not detected");
    await shot("01-import-mapping");
    await page.getByRole("button", { name: "Check data" }).click();
    await page.getByText(/duplicate/).first().waitFor();
    // Correct the invalid value before import
    const fix = page.getByLabel(/Correct row \d+ Analyst Salary/);
    await fix.first().fill("€58,000");
    await shot("02-import-review");
    await page.getByRole("button", { name: /Import \d+ rows/ }).click();
    await page.getByText("Import complete").waitFor();
    const summary = await page.locator("text=/new rows/").innerText();
    if (!summary.includes("5 new rows")) throw new Error(`expected 5 new rows, got: ${summary}`);
    await page.getByRole("link", { name: "Open table" }).click();
    await page.waitForURL("**/data/**");
    tableUrl = page.url();
    await page.getByRole("grid").getByText("Wendel").waitFor();
  });

  await step("6. Adds a custom AI research field with a natural-language instruction", async () => {
    await page.getByRole("button", { name: "Field" }).click();
    await page.getByRole("button", { name: "Analyst salary" }).click(); // preset
    await page.getByLabel("Field name").fill("Analyst base salary 2026");
    await page.getByRole("button", { name: "Add field" }).click();
    await page.getByRole("columnheader", { name: /Analyst base salary 2026/ }).waitFor();
  });

  await step("7–9. Research plan + budget review; live research blocked without credentials (no simulated results)", async () => {
    await page.getByRole("button", { name: "Analyst base salary 2026 options" }).click();
    await page.getByRole("menuitem", { name: "Research this column" }).click();
    await page.getByText("Review research plan").waitFor();
    await page.getByText("Live research is not available yet").waitFor();
    await page.getByText(/Estimated cost/).waitFor();
    await shot("03-plan-review");
    if (await page.getByRole("button", { name: /Approve & launch/ }).isEnabled()) throw new Error("launch should be disabled without providers");
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  await step("10–11. Records a sourced value (manual research) and inspects the cell evidence", async () => {
    const row = page.getByRole("row").filter({ hasText: "Ardian" });
    await row.hover();
    await row.getByRole("button", { name: "Open details" }).click();
    const section = page.getByRole("region", { name: "Analyst base salary 2026" });
    await section.getByRole("button", { name: "Add value with source" }).click();
    await page.getByLabel("Value").fill("€65,000");
    await page.getByLabel("Source URL").fill("https://www.ardian.com/careers");
    await page.getByLabel("Evidence").fill("Graduate analysts in Paris receive a base salary of €65,000.");
    await page.getByLabel("Confidence").selectOption("VERIFIED");
    await page.getByRole("button", { name: "Save value and evidence" }).click();
    await page.getByText("Saved with evidence").waitFor();
    await page.getByRole("region", { name: "Analyst base salary 2026" }).getByText("“Graduate analysts in Paris receive a base salary of €65,000.”").waitFor();
    await shot("04-cell-evidence");
    await page.keyboard.press("Escape");
  });

  await step("Inline edit with undo", async () => {
    await page.reload();
    const cell = page.getByRole("row").filter({ hasText: "Wendel" }).getByRole("gridcell").nth(2);
    await cell.focus();
    await page.keyboard.press("Enter"); // keyboard editing
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Paris 8e");
    await page.keyboard.press("Enter");
    await page.getByText("Location updated").waitFor();
    await page.getByRole("row").filter({ hasText: "Wendel" }).getByText("Paris 8e").waitFor();
    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForTimeout(1500);
  });

  await step("3. Uploads a CV, reviews the extracted profile and confirms it", async () => {
    await page.goto(`${BASE}/app/profile`);
    await page.getByTestId("cv-file").setInputFiles(FIX + "cv.pdf");
    await page.getByText(/Proposed by local parser/).waitFor({ timeout: 30000 });
    const inst = await page.getByPlaceholder("Institution").first().inputValue();
    if (!/ESSEC/.test(inst)) throw new Error(`education not extracted: ${inst}`);
    await page.getByLabel("Headline").fill("MSc Finance candidate, ESSEC");
    await shot("05-profile-review");
    await page.getByRole("button", { name: "Confirm profile" }).click();
    await page.getByText("Profile confirmed").waitFor();
  });

  await step("12. Compares companies with a personalised ranking", async () => {
    await page.goto(`${wsUrl}/ranking`);
    await page.getByRole("button", { name: "Add criterion" }).click();
    await page.getByLabel("Field").first().selectOption({ label: "Analyst Salary (Currency)" });
    await page.getByRole("button", { name: "Save ranking" }).click();
    await page.getByText("Ranking saved").waitFor();
    await page.getByText(/Provisional|Complete/).first().waitFor();
    await shot("06-ranking");
  });

  let contactUrl = "";
  await step("13. Contact discovery requires providers; adds a public professional contact", async () => {
    await page.goto(`${wsUrl}/networking`);
    await page.getByRole("button", { name: "Add contact" }).first().click();
    await page.getByLabel("Full name").fill("Camille Durand");
    await page.locator('select[name="company"]').selectOption({ label: "Ardian" });
    await page.getByLabel("Job title").fill("Investment Analyst, Real Estate");
    await page.getByLabel("Location").fill("Paris");
    await page.getByRole("dialog").getByRole("button", { name: "Add contact" }).click();
    await page.waitForURL("**/networking/**");
    contactUrl = page.url();
    await page.getByText(/Relevance \d+\/100/).waitFor();
  });

  await step("14–16. Generates a message, edits it, copies it and saves it to the CRM", async () => {
    await page.getByRole("button", { name: "Draft message" }).click();
    const box = page.getByLabel("Message", { exact: true });
    await box.waitFor();
    for (let i = 0; i < 20 && !(await box.inputValue()); i++) await page.waitForTimeout(250);
    const text = await box.inputValue();
    if (!text.includes("Camille")) throw new Error(`message not personalised: ${JSON.stringify(text.slice(0, 120))} (${await box.count()})`);
    if (/both studied/i.test(text)) throw new Error("fabricated shared background");
    await box.fill(text + " Thank you.");
    await page.getByRole("button", { name: "Copy" }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    if (!clip.endsWith("Thank you.")) throw new Error("copy failed");
    await page.getByRole("button", { name: "Save to CRM" }).click();
    await page.getByText("Saved to CRM").waitFor();
    await shot("07-message");
  });

  await step("17. Records a networking conversation with a follow-up", async () => {
    await page.getByRole("button", { name: "Record", exact: true }).click();
    await page.getByLabel("What did you learn?").fill("Team of 6 analysts; recruitment for 2027 opens in January.");
    await page.getByLabel("Salary insight").fill("Base around 65k plus 20% bonus");
    await page.getByLabel("Follow-up reminder").fill(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Save conversation" }).click();
    await page.getByText("Conversation saved").waitFor();
    await page.getByText("recruitment for 2027 opens in January").waitFor();
  });

  await step("18. Creates a job application", async () => {
    await page.goto(`${wsUrl}/applications`);
    await page.getByRole("button", { name: "New application" }).first().click();
    await page.getByLabel("Role").fill("Investment Analyst – Real Estate");
    await page.locator('select[name="company"]').selectOption({ label: "Ardian" });
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByText("Investment Analyst – Real Estate").waitFor();
    await shot("08-applications");
  });

  await step("19. Activates weekly monitoring", async () => {
    await page.goto(`${wsUrl}/monitoring`);
    const toggle = page.getByRole("button", { name: "Analyst base salary 2026" });
    if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click(); // AI fields are pre-selected
    await page.getByRole("button", { name: "Activate monitoring" }).click();
    await page.getByText("Monitoring activated").waitFor();
    await page.getByText(/weekly · cap/).waitFor();
  });

  await step("Home dashboard shows next best actions", async () => {
    await page.goto(wsUrl);
    await page.getByText("Next best actions").waitFor();
    await page.getByText(/Follow up with Camille|Reach out|Research \d+ missing/).first().waitFor();
    await shot("09-home");
  });

  await step("21. Exports the enriched data to Excel (with evidence, no formulas)", async () => {
    await page.goto(tableUrl);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export Excel" }).click()]);
    const path = `${OUT}export.xlsx`;
    await dl.saveAs(path);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(readFileSync(path));
    const names = wb.worksheets.map((w) => w.name);
    if (names.join() !== "funds,Evidence,Sources") throw new Error(`sheets: ${names}`);
    const ev = JSON.stringify(wb.getWorksheet("Evidence").getSheetValues());
    if (!ev.includes("ardian.com/careers")) throw new Error("evidence missing from export");
    wb.eachSheet((s) => s.eachRow((r) => r.eachCell((c) => { if (c.formula) throw new Error("formula in export"); })));
  });

  await step("Mobile layout", async () => {
    const m = await browser.newContext({ ...devices["iPhone 13"], storageState: await ctxA.storageState() });
    const mp = await m.newPage();
    await mp.goto(wsUrl);
    await mp.getByRole("button", { name: "Open navigation" }).click();
    await mp.getByRole("link", { name: "Networking" }).waitFor();
    await mp.screenshot({ path: `${OUT}10-mobile-nav.png` });
    await mp.keyboard.press("Escape");
    await mp.goto(tableUrl);
    await mp.getByRole("grid").waitFor();
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error("horizontal page overflow on mobile");
    await mp.screenshot({ path: `${OUT}11-mobile-table.png` });
    await m.close();
  });

  // ── Second user, different industry and columns ──
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const pb = await ctxB.newPage();
  await step("Second user (tech) imports completely different columns", async () => {
    await signup(pb, "Sam Lee", `sam+${stamp}@example.com`);
    await pb.getByLabel("Workspace name").fill("AI Engineering Internships");
    await pb.getByLabel("Your career objective").fill("AI engineering internships in Europe with visa sponsorship");
    await pb.getByRole("button", { name: /I have a spreadsheet/ }).click();
    await pb.waitForURL("**/import");
    await pb.getByTestId("import-file").setInputFiles(FIX + "tech.csv");
    await pb.getByText("Columns", { exact: true }).waitFor();
    if ((await pb.getByLabel("Role of Employer").inputValue()) !== "company.name") throw new Error("Employer not detected");
    if ((await pb.getByLabel("Type of Deadline").inputValue()) !== "DATE") throw new Error("Deadline not a date");
    await pb.getByRole("button", { name: "Check data" }).click();
    await pb.getByRole("button", { name: /Import 3 rows/ }).click();
    await pb.getByText("Import complete").waitFor();
    await pb.getByRole("link", { name: "Open table" }).click();
    await pb.getByRole("columnheader", { name: /Visa Sponsorship/ }).waitFor();
  });

  await step("Users cannot access each other's data", async () => {
    const r1 = await pb.goto(wsUrl);
    if (!(await pb.getByText("Not found").isVisible())) throw new Error(`workspace page leaked (status ${r1?.status()})`);
    const did = tableUrl.split("/data/")[1];
    const wid = wsUrl.split("/w/")[1];
    const r2 = await pb.request.get(`${BASE}/api/export/${did}?workspace=${wid}`);
    if (r2.status() !== 404) throw new Error(`export leaked: ${r2.status()}`);
    const r3 = await pb.goto(contactUrl);
    if (!(await pb.getByText("Not found").isVisible())) throw new Error(`contact leaked (status ${r3?.status()})`);
    const anon = await (await browser.newContext()).request.get(`${BASE}/api/export/${did}?workspace=${wid}`);
    if (anon.status() !== 401) throw new Error("anonymous export allowed");
  });
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  process.exitCode = failed.length ? 1 : 0;
}
