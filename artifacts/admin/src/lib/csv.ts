import * as XLSX from "xlsx";

export function downloadCsv(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const xlsxName = filename.replace(/\.csv$/, ".xlsx");
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ma'lumotlar");
  XLSX.writeFile(wb, xlsxName);
}
