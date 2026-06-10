import { NextResponse } from "next/server";
import {
  saveCustomerToCatalog,
  shouldSaveCustomerToCatalog,
  type BuyerInfo,
  type CustomerSaveResult,
} from "@/lib/customer";
import { assertMinvoiceConfig } from "@/lib/import-config";
import {
  buildInvoicePayload,
  sortRowsByNgayNhap,
  type ImportResult,
  type ImportRowResult,
} from "@/lib/minvoice";
import { formatExcelRowLabel, validateMaSoThue } from "@/lib/tax-code";
import type { InvoiceRow } from "@/types/invoice";

const WINDOW_ID = "WIN00193";
const DEFAULT_ORIGIN = "https://0319266205.minvoice.com.vn";

function getOrigin(apiUrl: string): string {
  try {
    return new URL(apiUrl).origin;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

async function saveInvoice(
  data: ReturnType<typeof buildInvoicePayload>,
  config: ReturnType<typeof assertMinvoiceConfig>
) {
  const { apiUrl, authToken } = config;
  const origin = getOrigin(apiUrl);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json",
      Authorization: authToken,
      Origin: origin,
      Referer: `${origin}/`,
    },
    body: JSON.stringify({
      windowid: WINDOW_ID,
      editmode: 1,
      data: [data],
    }),
  });

  const text = await response.text();
  let body: unknown = text;

  try {
    body = JSON.parse(text);
  } catch {
    // giữ nguyên text nếu không phải JSON
  }

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : text || `HTTP ${response.status}`;
    throw new Error(`Lưu biên lai thất bại (HTTP ${response.status}): ${message}`);
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "ok" in body &&
    (body as { ok: unknown }).ok === false
  ) {
    const message =
      "message" in body
        ? String((body as { message: unknown }).message)
        : "API trả về lỗi";
    throw new Error(message);
  }

  return body;
}

export async function POST(request: Request) {
  try {
    const { rows, buyers } = (await request.json()) as {
      rows?: InvoiceRow[];
      buyers?: Record<string, BuyerInfo>;
    };

    if (!rows?.length) {
      return NextResponse.json({ error: "Không có dữ liệu để import" }, { status: 400 });
    }

    if (!buyers || Object.keys(buyers).length === 0) {
      return NextResponse.json(
        { error: "Thiếu dữ liệu tra cứu KH. Vui lòng tra cứu trước khi import." },
        { status: 400 }
      );
    }

    const config = assertMinvoiceConfig();
    const results: ImportRowResult[] = [];
    const customerSaves: CustomerSaveResult[] = [];
    const savedCustomerMst = new Set<string>();
    const sortedRows = sortRowsByNgayNhap(rows);

    for (let i = 0; i < sortedRows.length; i += 1) {
      const row = sortedRows[i];
      const stt = row.stt || String(i + 1);
      const excelRowNumber = row.excelRowNumber ?? i + 2;

      try {
        const taxCheck = validateMaSoThue(row.maSoThue);
        if (!taxCheck.valid) {
          throw new Error(taxCheck.message || "Mã số thuế không hợp lệ");
        }

        const buyer = buyers[taxCheck.normalized];
        if (!buyer) {
          throw new Error(`Chưa tra cứu thông tin cho MST ${taxCheck.normalized}`);
        }

        const payload = buildInvoicePayload(row, i, buyer);
        await saveInvoice(payload, config);
        results.push({ excelRowNumber, stt, success: true });

        const rowEmail = row.email?.trim() ?? "";
        if (
          shouldSaveCustomerToCatalog(buyer, rowEmail) &&
          !savedCustomerMst.has(taxCheck.normalized)
        ) {
          const saveResult = await saveCustomerToCatalog(
            buyer,
            taxCheck.normalized,
            rowEmail
          );
          customerSaves.push(saveResult);
          if (saveResult.success) {
            savedCustomerMst.add(taxCheck.normalized);
          }
        }
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : "Lỗi không xác định";

        results.push({
          excelRowNumber,
          stt,
          success: false,
          message: `${formatExcelRowLabel(excelRowNumber)}: ${rawMessage}`,
        });
      }
    }

    const success = results.filter((r) => r.success).length;
    const result: ImportResult = {
      total: rows.length,
      success,
      failed: rows.length - success,
      results,
      customerSaves: customerSaves.length ? customerSaves : undefined,
    };

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lỗi server" },
      { status: 500 }
    );
  }
}
