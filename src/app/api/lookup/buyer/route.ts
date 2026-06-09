import { NextResponse } from "next/server";
import { formatTracesForMessage, resolveBuyerInfo } from "@/lib/customer";
import { assertMinvoiceConfig } from "@/lib/import-config";
import type { InvoiceRow } from "@/types/invoice";

export async function POST(request: Request) {
  try {
    assertMinvoiceConfig();

    const { maSoThue, row } = (await request.json()) as {
      maSoThue?: string;
      row?: InvoiceRow;
    };

    const lookupRow: InvoiceRow =
      row ??
      ({
        excelRowNumber: 0,
        stt: "",
        ngayNhap: "",
        soTien: "",
        dienGiai: "",
        maSoThue: maSoThue || "",
        quyNam: "",
        email: "",
        chuyenVien: "",
        soBienLai: "",
        ghiChu: "",
        maHang: "",
      } satisfies InvoiceRow);

    if (maSoThue) {
      lookupRow.maSoThue = maSoThue;
    }

    const result = await resolveBuyerInfo(lookupRow);

    if (result.error) {
      return NextResponse.json(
        {
          ok: false,
          maSoThue: lookupRow.maSoThue,
          error: result.error,
          traces: result.traces,
          traceSummary: formatTracesForMessage(result.traces),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      maSoThue: lookupRow.maSoThue,
      buyer: result.buyer,
      traces: result.traces,
      traceSummary: formatTracesForMessage(result.traces),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Tra cứu thất bại",
        traces: [],
      },
      { status: 500 }
    );
  }
}
