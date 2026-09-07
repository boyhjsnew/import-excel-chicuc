export type GdtTaxApiResponse = {
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

export type GdtTaxInfo = {
  maSoThue: string;
  legalName: string;
  address: string;
};

const DEFAULT_GDT_TAX_API =
  "https://hoadondientu.gdt.gov.vn/api/category/public/dsdkts";

export function getGdtTaxApiBase(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.MINVOICE_GDT_TAX_API_URL || process.env.NEXT_PUBLIC_GDT_TAX_API_URL
      : undefined;
  return (fromEnv || DEFAULT_GDT_TAX_API).replace(/\/$/, "");
}

export function getGdtTaxUrl(taxCode: string): string {
  return `${getGdtTaxApiBase()}/${encodeURIComponent(taxCode)}/manager`;
}

/** Chuẩn hóa tỉnh/TP: "TP Hồ Chí Minh" → "Thành phố Hồ Chí Minh" */
function normalizeProvinceName(value: string): string {
  return value
    .trim()
    .replace(/^TP\.?\s+/i, "Thành phố ")
    .replace(/^Tỉnh\s+/i, "Tỉnh ");
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

export function parseGdtTaxResponse(
  body: GdtTaxApiResponse,
  taxCode: string
): GdtTaxInfo | null {
  const legalName = body.tennnt?.trim() || "";
  if (!legalName) return null;

  return {
    maSoThue: body.mst?.trim() || taxCode,
    legalName,
    address: buildGdtAddress(body),
  };
}

/** Tra cứu GDT — dùng được cả browser (CORS) và server. Không throw. */
export async function fetchGdtTaxInfo(taxCode: string): Promise<GdtTaxInfo | null> {
  const url = getGdtTaxUrl(taxCode);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "*/*",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      // Browser: không gửi cookie cross-site
      credentials: "omit",
      cache: "no-store",
    });

    if (!response.ok) return null;

    const body = (await response.json()) as GdtTaxApiResponse;
    return parseGdtTaxResponse(body, taxCode);
  } catch {
    return null;
  }
}
