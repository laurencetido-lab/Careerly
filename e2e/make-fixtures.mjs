import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const dir = new URL("./fixtures/", import.meta.url).pathname;
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Funds");
ws.addRow(["Company", "Location", "Analyst Salary", "Graduate Programme", "Contact"]);
for (const r of [
  ["Ardian", "Paris", "€65,000", "Yes", ""],
  ["Tikehau Capital", "Paris", "€60,000", "No", ""],
  ["Eurazeo", "Paris", "", "Yes", ""],
  ["PAI Partners", "Paris", "62k", "", ""],
  ["Ardian", "Paris", "", "", ""],
  ["Wendel", "Paris", "not disclosed", "No", ""],
]) ws.addRow(r);
const notes = wb.addWorksheet("Notes");
notes.addRow(["Free text sheet"]);
await wb.xlsx.writeFile(dir + "funds.xlsx");

writeFileSync(dir + "tech.csv", "Employer,Role,Visa Sponsorship,Remote Work,Deadline\nAcme AI,ML Engineer Intern,Yes,Remote,2027-01-15\nBeta Labs,Data Engineer Intern,No,Hybrid,31/01/2027\nGamma Robotics,Robotics Intern,Yes,Onsite,2027-02-28\n");

writeFileSync(dir + "cv.txt", "Lea Martin\nMSc Finance candidate\n\nEducation\nESSEC Business School, MSc Finance 2025 - 2027\nUniversite Paris Dauphine, BSc Economics 2022 - 2025\n\nExperience\nM&A Intern at Rothschild & Co 2024 - 2024\n\nSkills: Excel, Python, Financial modelling, Valuation\nLanguages: French, English, Spanish\n");
execSync(`soffice --headless --convert-to pdf --outdir ${dir} ${dir}cv.txt`, { stdio: "ignore" });
console.log("fixtures ready");
