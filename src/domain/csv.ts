/** CSV output that is safe to open in Excel/Sheets: quotes are escaped and formula-looking text is neutralised. */

const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  let s = String(value);
  // Spreadsheet formula injection: a leading = + - @ tab or CR makes the cell executable.
  if (/^[=+\-@\t\r]/.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(","));
  // BOM so Excel reads UTF-8 correctly; CRLF per RFC 4180.
  return `﻿${lines.join("\r\n")}\r\n`;
}
