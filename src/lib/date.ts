import type { InvoiceRow } from "@/types/invoice";

/** Parse ngày nhập Excel theo định dạng DMY: dd/mm/yyyy (vd: 20/05/2026) */
export function parseNgayNhap(value: string): Date {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Ngày nhập không được để trống");
  }

  const parts = trimmed.split(/[/\-.]/);
  if (parts.length === 3) {
    const day = Number(parts[0]);
    const month = Number(parts[1]);
    let year = Number(parts[2]);

    if (year < 100) year += 2000;

    if (
      Number.isNaN(day) ||
      Number.isNaN(month) ||
      Number.isNaN(year) ||
      day < 1 ||
      day > 31 ||
      month < 1 ||
      month > 12
    ) {
      throw new Error(`Ngày nhập không hợp lệ: ${value}`);
    }

    const date = new Date(year, month - 1, day, 12, 0, 0);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      throw new Error(`Ngày nhập không hợp lệ: ${value}`);
    }

    return date;
  }

  // ISO yyyy-mm-dd từ Excel
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    if (!Number.isNaN(date.getTime())) return date;
  }

  throw new Error(
    `Ngày nhập không hợp lệ: ${value}. Dùng định dạng dd/mm/yyyy (vd: 20/05/2026).`
  );
}

/** Hiển thị / chuẩn hóa DMY: 20/05/2026 */
export function formatNgayNhapDMY(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** Định dạng gửi API biên lai: 2026-05-20 */
export function formatNgayNhapApi(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function normalizeNgayNhapString(value: string): string {
  return formatNgayNhapDMY(parseNgayNhap(value));
}

/** Chuyển số serial Excel → Date (ô định dạng ngày trong Excel) */
export function excelSerialToLocalDate(serial: number): Date {
  const epoch = new Date(1899, 11, 30);
  const days = Math.floor(serial);
  const ms = epoch.getTime() + days * 86400000;
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

type ExcelDateCell = {
  v?: unknown;
  w?: string;
  t?: string;
};

/** Đọc ô Ngày nhập từ Excel — tránh bị đổi sang M/D/YY kiểu Mỹ */
export function parseNgayNhapFromExcelCell(cell: ExcelDateCell | undefined): string {
  if (!cell) return "";

  if (cell.v instanceof Date) {
    return formatNgayNhapDMY(cell.v);
  }

  if (typeof cell.v === "number" && (cell.t === "n" || cell.t === "d" || !cell.t)) {
    return formatNgayNhapDMY(excelSerialToLocalDate(cell.v));
  }

  const text = String(cell.w ?? cell.v ?? "").trim();
  if (!text) return "";

  return normalizeNgayNhapString(text);
}

/** Sắp xếp từ ngày nhỏ → lớn trước khi import */
export function sortRowsByNgayNhap(rows: InvoiceRow[]): InvoiceRow[] {
  return [...rows].sort((a, b) => {
    const diff =
      parseNgayNhap(a.ngayNhap).getTime() - parseNgayNhap(b.ngayNhap).getTime();
    if (diff !== 0) return diff;
    return a.excelRowNumber - b.excelRowNumber;
  });
}
