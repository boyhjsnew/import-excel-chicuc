import * as XLSX from "xlsx";
import { parseNgayNhapFromExcelCell } from "@/lib/date";
import { validateRowsTaxCode } from "@/lib/tax-code";
import {
  INVOICE_COLUMNS,
  type InvoiceRow,
  type ParsedInvoiceFile,
} from "@/types/invoice";

const SAMPLE_ROWS: InvoiceRow[] = [
  {
    excelRowNumber: 2,
    stt: "1",
    ngayNhap: "30/12/2025",
    soTien: "2814947",
    dienGiai: "CÔNG TY TNHH MTV DỊCH VỤ CÔNG ÍCH QUẬN TÂN BÌNH",
    maSoThue: "0301416876",
    quyNam: "Q4/2025",
    email: "khachhang@example.com",
    chuyenVien: "Nguyễn Văn A",
    soBienLai: "",
    ghiChu: "",
    maHang: "NUOCTHAI",
  },
  {
    excelRowNumber: 3,
    stt: "2",
    ngayNhap: "15/01/2026",
    soTien: "1500000",
    dienGiai: "CÔNG TY TNHH XÂY DỰNG ABC",
    maSoThue: "0123456789",
    quyNam: "Q1/2026",
    email: "doanhnghiep@example.com",
    chuyenVien: "Trần Thị B",
    soBienLai: "",
    ghiChu: "",
    maHang: "KHITHAI",
  },
];

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const year = value.getFullYear();
    return `${day}/${month}/${year}`;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return String(value).trim();
}

function isRowEmpty(row: InvoiceRow): boolean {
  return INVOICE_COLUMNS.every(({ key }) => row[key] === "");
}

export function downloadSampleTemplate(): void {
  const headers = INVOICE_COLUMNS.map(({ header }) => header);
  const data = [
    headers,
    ...SAMPLE_ROWS.map((row) =>
      INVOICE_COLUMNS.map(({ key }) => row[key])
    ),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  worksheet["!cols"] = INVOICE_COLUMNS.map(({ header }) => ({
    wch: Math.max(header.length + 4, 16),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Mau_import");

  XLSX.writeFile(workbook, "mau_import_bien_lai.xlsx");
}

export function parseInvoiceExcel(file: File): Promise<ParsedInvoiceFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const buffer = event.target?.result;
        if (!buffer) {
          reject(new Error("Không đọc được nội dung file."));
          return;
        }

        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];

        if (!sheetName) {
          reject(new Error("File Excel không có sheet dữ liệu."));
          return;
        }

        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
          header: 1,
          defval: "",
          raw: true,
        });

        if (rawRows.length === 0) {
          reject(new Error("File Excel đang trống."));
          return;
        }

        const headerRow = (rawRows[0] ?? []).map(normalizeHeader);
        const columnIndexMap = new Map<InvoiceRow[keyof InvoiceRow], number>();

        INVOICE_COLUMNS.forEach(({ key, header }) => {
          const index = headerRow.indexOf(normalizeHeader(header));
          if (index !== -1) {
            columnIndexMap.set(key, index);
          }
        });

        const missingHeaders = INVOICE_COLUMNS.filter(
          ({ key }) => !columnIndexMap.has(key)
        ).map(({ header }) => header);

        if (missingHeaders.length > 0) {
          reject(
            new Error(
              `Thiếu các cột bắt buộc: ${missingHeaders.join(", ")}`
            )
          );
          return;
        }

        const ngayNhapCol = columnIndexMap.get("ngayNhap")!;
        const rows: InvoiceRow[] = [];

        for (let i = 1; i < rawRows.length; i += 1) {
          const rawRow = rawRows[i] ?? [];
          const row = INVOICE_COLUMNS.reduce(
            (acc, { key }) => {
              const columnIndex = columnIndexMap.get(key)!;
              acc[key] = cellToString(rawRow[columnIndex]);
              return acc;
            },
            { excelRowNumber: i + 1 } as InvoiceRow
          );

          const dateCellAddress = XLSX.utils.encode_cell({ r: i, c: ngayNhapCol });
          const dateCell = worksheet[dateCellAddress];
          row.ngayNhap = parseNgayNhapFromExcelCell(dateCell);

          if (!isRowEmpty(row)) {
            rows.push(row);
          }
        }

        const taxCodeErrors = validateRowsTaxCode(rows);

        resolve({
          fileName: file.name,
          rows,
          totalRows: rows.length,
          taxCodeErrors,
        });
      } catch {
        reject(new Error("Không thể phân tích file Excel. Vui lòng kiểm tra lại định dạng."));
      }
    };

    reader.onerror = () => {
      reject(new Error("Không thể đọc file. Vui lòng thử lại."));
    };

    reader.readAsArrayBuffer(file);
  });
}
