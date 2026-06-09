import type { ApiTrace } from "@/lib/api-trace";
import type { BuyerInfo } from "@/lib/customer";
import { normalizeMaSoThue } from "@/lib/tax-code";
import type { InvoiceRow } from "@/types/invoice";

const MA_HANG_TEN: Record<string, string> = {
  NUOCTHAI: "Phí bảo vệ môi trường đối với nước thải công nghiệp",
  KHITHAI: "Phí bảo vệ môi trường đối với khí thải",
};

const TAB_ID = "TAB00196";

export type LookupBuyerResponse = {
  ok: boolean;
  maSoThue: string;
  buyer?: BuyerInfo;
  error?: string;
  traces: ApiTrace[];
  traceSummary?: string;
};

export type ImportRowResult = {
  excelRowNumber: number;
  stt: string;
  success: boolean;
  message?: string;
  traces?: ApiTrace[];
};

export type ImportResult = {
  total: number;
  success: number;
  failed: number;
  results: ImportRowResult[];
};

export function parseNgayNhap(value: string): Date {
  const trimmed = value.trim();
  const parts = trimmed.split(/[/\-.]/);

  if (parts.length === 3) {
    const day = Number(parts[0]);
    const month = Number(parts[1]);
    let year = Number(parts[2]);

    if (year < 100) year += 2000;

    const date = new Date(year, month - 1, day, 12, 0, 0);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  throw new Error(`Ngày nhập không hợp lệ: ${value}`);
}

export function getInvoiceSeries(date: Date): string {
  const yearSuffix = String(date.getFullYear()).slice(-2);
  return `EBL01-${yearSuffix}T`;
}

export function parseSoTien(value: string): number {
  const amount = Number(value.replace(/[^\d.-]/g, ""));
  if (Number.isNaN(amount) || amount <= 0) {
    throw new Error(`Số tiền không hợp lệ: ${value}`);
  }
  return amount;
}

export function getTenHang(maHang: string): string {
  const ma = maHang.trim().toUpperCase();
  return MA_HANG_TEN[ma] ?? maHang;
}

function toDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function generateSophieu(index: number): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const base = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = String((now.getMilliseconds() + index) % 1000).padStart(3, "0");
  return `${base}.${suffix}`;
}

export function buildInvoicePayload(
  row: InvoiceRow,
  index: number,
  buyer: BuyerInfo
) {
  const ngayNhap = parseNgayNhap(row.ngayNhap);
  const soTien = parseSoTien(row.soTien);
  const maHang = row.maHang.trim().toUpperCase();
  const ngayStr = toDateString(ngayNhap);

  if (!maHang) {
    throw new Error("Mã hàng không được để trống");
  }

  return {
    key_api: null,
    inv_originalId: null,
    ngayvb: null,
    sovb: "",
    inv_invoiceType: "01BLP",
    inv_adjustmentType: 1,
    ma_ct: "01LP",
    inv_invoiceName: "Biên lại thu tiền phí, lệ phí ",
    signature: null,
    nguoi_ky: null,
    ngay_hs: ngayStr,
    so_hs: row.quyNam || "",
    sophieu: generateSophieu(index),
    inv_invoiceSeries: getInvoiceSeries(ngayNhap),
    inv_invoiceNumber: row.soBienLai || null,
    inv_invoiceIssuedDate: ngayStr,
    inv_currencyCode: "VND",
    inv_exchangeRate: 1,
    inv_buyerDisplayName: "",
    ma_dt: buyer.maDt,
    inv_buyerLegalName: buyer.legalName,
    inv_buyerTaxCode: row.maSoThue || "",
    inv_buyerAddressLine: buyer.address,
    inv_buyerEmail: buyer.email,
    inv_paymentMethodName: "TM/CK",
    mau_hd: "01BLP0-001",
    inv_TotalAmountWithoutVat: soTien,
    inv_vatAmount: 0,
    inv_TotalAmount: soTien,
    inv_discountAmount: 0,
    details: [
      {
        tab_id: TAB_ID,
        tab_table: "inv_InvoiceAuthDetail",
        data: [
          {
            stt_rec0: null,
            inv_itemCode: maHang,
            inv_itemName: getTenHang(maHang),
            inv_unitCode: "",
            inv_unitPrice: 0,
            inv_TotalAmountWithoutVat: soTien,
            inv_vatAmount: 0,
            inv_discountAmount: 0,
            inv_TotalAmount: soTien,
            tchat: "5",
            ma_thue: -1,
          },
        ],
      },
    ],
  };
}

export type LookupBuyerCallResult = {
  httpStatus: number;
  endpoint: string;
  data: LookupBuyerResponse;
};

export async function lookupBuyer(
  maSoThue: string,
  row?: InvoiceRow
): Promise<LookupBuyerCallResult> {
  const endpoint = "/api/lookup/buyer";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maSoThue, row }),
  });

  const data = (await response.json()) as LookupBuyerResponse;
  return { httpStatus: response.status, endpoint, data };
}

export function formatLookupError(result: LookupBuyerCallResult): string {
  const { data } = result;
  const traceInfo = data.traces?.length
    ? `\n${data.traces.map((t) => `• ${t.method} ${t.api} → ${t.status} (${t.durationMs}ms)\n  ${t.url}\n  ${t.responsePreview || t.error || ""}`).join("\n")}`
    : "";
  return (data.error || "Tra cứu thất bại") + traceInfo;
}

export async function importBienLaiRows(
  rows: InvoiceRow[],
  buyers: Record<string, BuyerInfo>
): Promise<ImportResult> {
  const response = await fetch("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, buyers }),
  });

  const data = (await response.json()) as ImportResult & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || "Import thất bại");
  }

  return data;
}

export function getUniqueMaSoThue(rows: InvoiceRow[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  rows.forEach((row) => {
    const mst = normalizeMaSoThue(row.maSoThue);
    if (mst && !seen.has(mst)) {
      seen.add(mst);
      result.push(mst);
    }
  });

  return result;
}
