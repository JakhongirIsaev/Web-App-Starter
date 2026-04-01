import multer from "multer";
import { parse } from "csv-parse/sync";

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export function parseCsvBuffer(buffer: Buffer): Record<string, string>[] {
  const content = buffer.toString("utf-8").replace(/^\uFEFF/, "");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}
