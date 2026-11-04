import { AppError } from "./errors";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const SPREADSHEET_EXT = [".xlsx", ".xls", ".csv"];
const CV_EXT = [".pdf", ".docx"];

function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function startsWith(buf: Buffer, bytes: number[]) {
  return bytes.every((b, i) => buf[i] === b);
}

/** Validate size, extension AND magic bytes. Returns the canonical extension. */
export function validateUpload(name: string, buf: Buffer, kind: "SPREADSHEET" | "CV" | "DOCUMENT") {
  if (buf.length === 0) throw new AppError("The file is empty.", "INVALID");
  if (buf.length > MAX_UPLOAD_BYTES) throw new AppError("Files must be 10 MB or smaller.", "INVALID");
  const e = ext(name);
  const allowed = kind === "SPREADSHEET" ? SPREADSHEET_EXT : kind === "CV" ? CV_EXT : [...CV_EXT, ".txt"];
  if (!allowed.includes(e)) throw new AppError(`Unsupported file type. Allowed: ${allowed.join(", ")}`, "INVALID");
  const zip = startsWith(buf, [0x50, 0x4b, 0x03, 0x04]);
  const ole = startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0]);
  const pdf = startsWith(buf, [0x25, 0x50, 0x44, 0x46]);
  const ok =
    (e === ".xlsx" && zip) ||
    (e === ".docx" && zip) ||
    (e === ".xls" && ole) ||
    (e === ".pdf" && pdf) ||
    ((e === ".csv" || e === ".txt") && !buf.subarray(0, 4096).includes(0));
  if (!ok) throw new AppError("The file content does not match its extension.", "INVALID");
  return e;
}

export function mimeFor(e: string) {
  return (
    {
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".xls": "application/vnd.ms-excel",
      ".csv": "text/csv",
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".txt": "text/plain",
    } as Record<string, string>
  )[e] ?? "application/octet-stream";
}
