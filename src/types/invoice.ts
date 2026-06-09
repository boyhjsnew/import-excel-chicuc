export const INVOICE_COLUMNS = [
  { key: "stt", header: "STT" },
  { key: "ngayNhap", header: "Ngày nhập" },
  { key: "soTien", header: "Số tiền" },
  { key: "dienGiai", header: "Diễn giải" },
  { key: "maSoThue", header: "Mã số thuế" },
  { key: "quyNam", header: "Quý/năm" },
  { key: "email", header: "Email" },
  { key: "chuyenVien", header: "Chuyên viên" },
  { key: "soBienLai", header: "Số biên lai" },
  { key: "ghiChu", header: "Ghi chú" },
  { key: "maHang", header: "Mã hàng" },
] as const;

export type InvoiceColumnKey = (typeof INVOICE_COLUMNS)[number]["key"];

export type InvoiceRow = Record<InvoiceColumnKey, string> & {
  excelRowNumber: number;
};

export type TaxCodeRowError = {
  excelRowNumber: number;
  maSoThue: string;
  message: string;
};

export type ParsedInvoiceFile = {
  fileName: string;
  rows: InvoiceRow[];
  totalRows: number;
  taxCodeErrors: TaxCodeRowError[];
};
