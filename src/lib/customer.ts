import { createTrace, readResponseText, truncatePreview, type ApiTrace } from "@/lib/api-trace";
import { assertMinvoiceConfig } from "@/lib/import-config";
import { normalizeMaSoThue } from "@/lib/tax-code";
import type { InvoiceRow } from "@/types/invoice";

const CUSTOMER_WINDOW_ID = "WIN00009";
const DEFAULT_CUSTOMER_API =
  "https://0319266205.minvoice.com.vn/api/System/GetDataByWindowNo1";
const DEFAULT_TAX_API = "https://mst.minvoice.com.vn/api/System/SearchTaxCodeV2";
const DEFAULT_GDT_TAX_API =
  "https://hoadondientu.gdt.gov.vn/api/category/public/dsdkts";
const DEFAULT_CUSTOMER_SAVE_API =
  "https://0319266205.minvoice.com.vn/api/Category/CustomerSaveChange";

export type BuyerInfo = {
  maDt: string;
  legalName: string;
  email: string | null;
  address: string;
  source: "customer" | "taxcode" | "gdt" | "excel";
};

export type BuyerLookupResult = {
  buyer?: BuyerInfo;
  traces: ApiTrace[];
  error?: string;
};

export type CustomerSaveResult = {
  maSoThue: string;
  success: boolean;
  message?: string;
};

type CustomerRecord = {
  ma_dt?: string;
  ten_dt?: string;
  dia_chi?: string;
  email?: string;
  ms_thue?: string;
};

type CustomerApiResponse = {
  data?: CustomerRecord[];
  total_count?: number;
};

type TaxApiResponse = {
  ma_so_thue?: string;
  ten_cty?: string;
  dia_chi?: string;
};

type GdtTaxApiResponse = {
  mst?: string;
  tennnt?: string;
  dctsdchi?: string;
  dctstinh?: string;
  dctsthuyen?: string;
  dctstxa?: string;
  dctstinhten?: string;
  dctshuyenten?: string;
  dctsxaten?: string;
};

function buildCustomerFilter(maSoThue: string) {
  return [
    { columnName: "ma_dt", columnType: "string", value: "" },
    { columnName: "ten_dt", columnType: "string", value: "" },
    { columnName: "dia_chi", columnType: "string", value: "" },
    { columnName: "ms_thue", columnType: "string", value: maSoThue },
    { columnName: "email", columnType: "string", value: "" },
    { columnName: "dien_thoai", columnType: "string", value: "" },
    { columnName: "dien_giai", columnType: "string", value: "" },
    { columnName: "dt_me_id", columnType: "string", value: "" },
    { columnName: "cccdan", columnType: "string", value: "" },
    { columnName: "mdvqhnsach_nmua", columnType: "string", value: "" },
  ];
}

export function getAuthToken(): string {
  return assertMinvoiceConfig().authToken;
}

async function lookupCustomerByMsThue(
  maSoThue: string,
  traces: ApiTrace[]
): Promise<CustomerRecord | null> {
  const apiUrl = process.env.MINVOICE_CUSTOMER_API_URL || DEFAULT_CUSTOMER_API;
  const startedAt = Date.now();

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json",
      Authorization: getAuthToken(),
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify({
      window_id: CUSTOMER_WINDOW_ID,
      start: 0,
      count: 50,
      filter: buildCustomerFilter(maSoThue),
      tlbparam: [],
    }),
  });

  const responseText = await readResponseText(response);

  if (!response.ok) {
    traces.push(
      createTrace(
        "lookup_customer",
        "GetDataByWindowNo1",
        "POST",
        apiUrl,
        startedAt,
        response,
        false,
        responseText,
        `HTTP ${response.status}`
      )
    );
    throw new Error(
      `Tra cứu danh mục KH thất bại (HTTP ${response.status}). Kiểm tra MINVOICE_AUTH_TOKEN. Response: ${truncatePreview(responseText)}`
    );
  }

  let body: CustomerApiResponse;
  try {
    body = JSON.parse(responseText) as CustomerApiResponse;
  } catch {
    traces.push(
      createTrace(
        "lookup_customer",
        "GetDataByWindowNo1",
        "POST",
        apiUrl,
        startedAt,
        response,
        false,
        responseText,
        "Response không phải JSON hợp lệ"
      )
    );
    throw new Error(
      `API danh mục KH trả về dữ liệu không hợp lệ. Response: ${truncatePreview(responseText)}`
    );
  }

  const matched = pickCustomerByExactMsThue(body.data ?? [], maSoThue);

  traces.push(
    createTrace(
      "lookup_customer",
      "GetDataByWindowNo1",
      "POST",
      apiUrl,
      startedAt,
      response,
      true,
      matched
        ? `Tìm thấy: ${matched.ten_dt ?? maSoThue} · ms_thue: ${matched.ms_thue ?? maSoThue}${matched.email?.trim() ? ` · email: ${matched.email}` : " · email: (trống)"}${(body.data?.length ?? 0) > 1 ? ` (khớp exact trong ${body.data!.length} kết quả)` : ""}`
        : body.data?.length
          ? `Có ${body.data.length} kết quả nhưng không khớp exact ms_thue=${maSoThue}`
          : "Không có trong danh mục KH"
    )
  );

  return matched;
}

/** API filter ms_thue có thể trả cả công ty mẹ + chi nhánh → chọn đúng MST trên Excel. */
function pickCustomerByExactMsThue(
  records: CustomerRecord[],
  maSoThue: string
): CustomerRecord | null {
  if (!records.length) return null;

  const target = normalizeMaSoThue(maSoThue);
  const exact = records.find(
    (item) => normalizeMaSoThue(item.ms_thue ?? "") === target
  );

  return exact ?? null;
}

async function lookupTaxByMaSoThue(
  taxCode: string,
  traces: ApiTrace[]
): Promise<TaxApiResponse | null> {
  const baseUrl = process.env.MINVOICE_TAX_API_URL || DEFAULT_TAX_API;
  const url = `${baseUrl}?tax=${encodeURIComponent(taxCode)}`;
  const startedAt = Date.now();

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Cache-Control": "no-cache",
    },
  });

  const responseText = await readResponseText(response);

  if (!response.ok) {
    traces.push(
      createTrace(
        "lookup_tax",
        "SearchTaxCodeV2",
        "GET",
        url,
        startedAt,
        response,
        false,
        responseText,
        `HTTP ${response.status}`
      )
    );
    throw new Error(
      `Tra cứu MST thất bại (HTTP ${response.status}). Response: ${truncatePreview(responseText)}`
    );
  }

  let body: TaxApiResponse;
  try {
    body = JSON.parse(responseText) as TaxApiResponse;
  } catch {
    traces.push(
      createTrace(
        "lookup_tax",
        "SearchTaxCodeV2",
        "GET",
        url,
        startedAt,
        response,
        false,
        responseText,
        "Response không phải JSON hợp lệ"
      )
    );
    throw new Error(
      `API MST trả về dữ liệu không hợp lệ. Response: ${truncatePreview(responseText)}`
    );
  }

  const found = Boolean(body.ten_cty);

  traces.push(
    createTrace(
      "lookup_tax",
      "SearchTaxCodeV2",
      "GET",
      url,
      startedAt,
      response,
      true,
      found
        ? `Tìm thấy: ${body.ten_cty} · email: (trống)`
        : "Không tìm thấy trên hệ thống MST"
    )
  );

  return found ? body : null;
}

/** Chuẩn hóa tỉnh/TP: "TP Hồ Chí Minh" → "Thành phố Hồ Chí Minh" */
function normalizeProvinceName(value: string): string {
  return value
    .trim()
    .replace(/^TP\.?\s+/i, "Thành phố ")
    .replace(/^Tinh\s+/i, "Tỉnh ");
}

/** Ghép địa chỉ từ các trường GDT, bỏ phần trống. */
export function buildGdtAddress(body: GdtTaxApiResponse): string {
  const parts = [
    body.dctsdchi,
    body.dctsxaten || body.dctstxa,
    body.dctshuyenten || body.dctsthuyen,
    normalizeProvinceName(body.dctstinhten || body.dctstinh || ""),
  ]
    .map((part) => part?.trim() || "")
    .filter(Boolean);

  if (parts.length === 0) return "";
  parts.push("Việt Nam");
  return parts.join(", ");
}

async function lookupTaxByGdt(
  taxCode: string,
  traces: ApiTrace[]
): Promise<TaxApiResponse | null> {
  const baseUrl = (process.env.MINVOICE_GDT_TAX_API_URL || DEFAULT_GDT_TAX_API).replace(
    /\/$/,
    ""
  );
  const url = `${baseUrl}/${encodeURIComponent(taxCode)}/manager`;
  const startedAt = Date.now();

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "*/*",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Referer: "https://0319266205.minvoice.com.vn/",
    },
  });

  const responseText = await readResponseText(response);

  if (!response.ok) {
    traces.push(
      createTrace(
        "lookup_tax_gdt",
        "GDT_dsdkts",
        "GET",
        url,
        startedAt,
        response,
        false,
        responseText,
        `HTTP ${response.status}`
      )
    );
    // Backup API: không throw — fallback Excel
    return null;
  }

  let body: GdtTaxApiResponse;
  try {
    body = JSON.parse(responseText) as GdtTaxApiResponse;
  } catch {
    traces.push(
      createTrace(
        "lookup_tax_gdt",
        "GDT_dsdkts",
        "GET",
        url,
        startedAt,
        response,
        false,
        responseText,
        "Response không phải JSON hợp lệ"
      )
    );
    return null;
  }

  const legalName = body.tennnt?.trim() || "";
  const address = buildGdtAddress(body);
  const found = Boolean(legalName);

  traces.push(
    createTrace(
      "lookup_tax_gdt",
      "GDT_dsdkts",
      "GET",
      url,
      startedAt,
      response,
      true,
      found
        ? `Tìm thấy: ${legalName}${address ? ` · ${address}` : ""}`
        : "Không tìm thấy trên GDT"
    )
  );

  if (!found) return null;

  return {
    ma_so_thue: body.mst || taxCode,
    ten_cty: legalName,
    dia_chi: address,
  };
}

export function resolveInvoiceEmail(
  buyer: BuyerInfo,
  row?: Pick<InvoiceRow, "email">
): string | null {
  const fromCatalog = buyer.email?.trim();
  if (fromCatalog) return fromCatalog;

  const fromExcel = row?.email?.trim();
  return fromExcel || null;
}

function fromExcel(row: InvoiceRow, maSoThue: string): BuyerInfo {
  return {
    maDt: maSoThue,
    legalName: row.dienGiai || "",
    email: row.email || null,
    address: "",
    source: "excel",
  };
}

export async function resolveBuyerInfo(row: InvoiceRow): Promise<BuyerLookupResult> {
  const maSoThue = row.maSoThue.trim();
  const traces: ApiTrace[] = [];

  if (!maSoThue) {
    return { buyer: fromExcel(row, ""), traces };
  }

  try {
    const customer = await lookupCustomerByMsThue(maSoThue, traces);
    if (customer) {
      const buyer: BuyerInfo = {
        maDt: customer.ma_dt || maSoThue,
        legalName: customer.ten_dt || row.dienGiai || "",
        email: customer.email?.trim() || null,
        address: customer.dia_chi || "",
        source: "customer",
      };
      buyer.email = resolveInvoiceEmail(buyer, row);
      return { buyer, traces };
    }

    let tax: TaxApiResponse | null = null;
    try {
      tax = await lookupTaxByMaSoThue(maSoThue, traces);
    } catch {
      // SearchTaxCodeV2 lỗi → thử backup GDT
    }

    if (tax) {
      const buyer: BuyerInfo = {
        maDt: tax.ma_so_thue || maSoThue,
        legalName: tax.ten_cty || row.dienGiai || "",
        email: null,
        address: tax.dia_chi || "",
        source: "taxcode",
      };
      buyer.email = resolveInvoiceEmail(buyer, row);
      return { buyer, traces };
    }

    const gdt = await lookupTaxByGdt(maSoThue, traces);
    if (gdt) {
      const buyer: BuyerInfo = {
        maDt: gdt.ma_so_thue || maSoThue,
        legalName: gdt.ten_cty || row.dienGiai || "",
        email: null,
        address: gdt.dia_chi || "",
        source: "gdt",
      };
      buyer.email = resolveInvoiceEmail(buyer, row);
      return { buyer, traces };
    }

    return { buyer: fromExcel(row, maSoThue), traces };
  } catch (err) {
    return {
      traces,
      error: err instanceof Error ? err.message : "Tra cứu thất bại",
    };
  }
}

export function formatTracesForMessage(traces: ApiTrace[]): string {
  return traces
    .map(
      (t) =>
        `[${t.step}] ${t.method} ${t.api} → HTTP ${t.status ?? "?"} (${t.durationMs}ms)`
    )
    .join(" | ");
}

export function shouldSaveCustomerToCatalog(
  buyer: BuyerInfo,
  rowEmail: string
): boolean {
  return (
    (buyer.source === "taxcode" || buyer.source === "gdt") &&
    Boolean(rowEmail.trim())
  );
}

export async function saveCustomerToCatalog(
  buyer: BuyerInfo,
  maSoThue: string,
  email: string
): Promise<CustomerSaveResult> {
  const apiUrl =
    process.env.MINVOICE_CUSTOMER_SAVE_API_URL || DEFAULT_CUSTOMER_SAVE_API;

  const payload = {
    ma_dt: buyer.maDt || maSoThue,
    ms_thue: maSoThue,
    dt_me_id: "",
    ten_dt: buyer.legalName,
    email: email.trim(),
    dai_dien: "",
    dia_chi: buyer.address,
    dien_thoai: "",
    dien_giai: "",
    fax: "",
    cccdan: "",
    mdvqhnsach_nmua: "",
    ds_ngan_hang: [],
    ma_dvcs: "VP",
    editmode: 1,
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
        Authorization: getAuthToken(),
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await readResponseText(response);

    if (!response.ok) {
      return {
        maSoThue,
        success: false,
        message: `Lưu danh mục KH thất bại (HTTP ${response.status}): ${truncatePreview(responseText)}`,
      };
    }

    let body: { code?: string; message?: string | null };
    try {
      body = JSON.parse(responseText) as { code?: string; message?: string | null };
    } catch {
      return {
        maSoThue,
        success: false,
        message: "API danh mục KH trả về dữ liệu không hợp lệ",
      };
    }

    if (body.code === "00") {
      return {
        maSoThue,
        success: true,
        message: "Đã lưu vào danh mục KH",
      };
    }

    return {
      maSoThue,
      success: false,
      message: body.message || `Mã lỗi API: ${body.code ?? "?"}`,
    };
  } catch (err) {
    return {
      maSoThue,
      success: false,
      message: err instanceof Error ? err.message : "Lưu danh mục KH thất bại",
    };
  }
}
