import {
  getBuyerSourceLabel,
  resolveInvoiceEmail,
  type BuyerInfo,
} from "@/lib/customer";
import { normalizeMaSoThue } from "@/lib/tax-code";
import {
  INVOICE_COLUMNS,
  type InvoiceRow,
  type RowImportState,
} from "@/types/invoice";

type InvoicePreviewTableProps = {
  rows: InvoiceRow[];
  invalidExcelRows?: Set<number>;
  buyers?: Record<string, BuyerInfo>;
  rowStates?: Record<number, RowImportState>;
};

function formatCell(key: string, value: string) {
  if (key === "soTien" && value) {
    const num = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isNaN(num) ? value : num.toLocaleString("vi-VN");
  }
  return value || "—";
}

const MOBILE_FIELDS = INVOICE_COLUMNS.filter(
  ({ key }) => !["stt", "soTien", "ghiChu", "maHang"].includes(key)
);

function isInvalidRow(row: InvoiceRow, invalidExcelRows?: Set<number>) {
  if (!invalidExcelRows?.size) return false;
  return invalidExcelRows.has(row.excelRowNumber);
}

function statusLabel(state?: RowImportState) {
  if (!state || state.status === "pending") return "Chờ import";
  if (state.status === "success") return "Đã tạo";
  return "Lỗi";
}

function statusClass(state?: RowImportState) {
  if (!state || state.status === "pending") return "text-gray-500";
  if (state.status === "success") return "text-emerald-700";
  return "text-red-700";
}

function getBuyer(row: InvoiceRow, buyers?: Record<string, BuyerInfo>) {
  return buyers?.[normalizeMaSoThue(row.maSoThue)];
}

export default function InvoicePreviewTable({
  rows,
  invalidExcelRows,
  buyers,
  rowStates,
}: InvoicePreviewTableProps) {
  return (
    <>
      <div className="space-y-2 lg:hidden">
        {rows.map((row, index) => {
          const invalid = isInvalidRow(row, invalidExcelRows);
          const buyer = getBuyer(row, buyers);
          const state = rowStates?.[row.excelRowNumber];
          return (
            <div
              key={`card-${index}`}
              className={[
                "rounded-md border bg-white px-3 py-2 text-xs",
                invalid
                  ? "border-red-300 bg-red-50"
                  : state?.status === "failed"
                    ? "border-amber-300 bg-amber-50"
                    : state?.status === "success"
                      ? "border-emerald-200 bg-emerald-50/50"
                      : "border-gray-200",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-800">
                  Dòng {row.excelRowNumber} · {buyer?.legalName || row.dienGiai || "—"}
                </span>
                <span className="shrink-0 font-medium text-emerald-600">
                  {formatCell("soTien", row.soTien)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-gray-500">
                <span className={statusClass(state)}>{statusLabel(state)}</span>
                {buyer && (
                  <span>
                    Nguồn:{" "}
                    <span className="text-gray-700">{getBuyerSourceLabel(buyer.source)}</span>
                  </span>
                )}
                {MOBILE_FIELDS.filter(({ key }) => key !== "dienGiai").map(({ key, header }) => (
                  <span key={key}>
                    {header}:{" "}
                    <span
                      className={
                        invalid && key === "maSoThue" ? "font-medium text-red-600" : "text-gray-700"
                      }
                    >
                      {formatCell(key, row[key])}
                    </span>
                  </span>
                ))}
              </div>
              {state?.status === "failed" && state.message && (
                <p className="mt-1 text-red-700">{state.message}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden w-full min-w-0 lg:block">
        <div className="w-full min-w-0 overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="w-max min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                  Trạng thái
                </th>
                <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                  Tên KH (tra cứu)
                </th>
                <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                  Nguồn
                </th>
                {INVOICE_COLUMNS.map(({ header }) => (
                  <th key={header} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {rows.map((row, index) => {
                const invalid = isInvalidRow(row, invalidExcelRows);
                const buyer = getBuyer(row, buyers);
                const state = rowStates?.[row.excelRowNumber];
                return (
                  <tr
                    key={`row-${index}`}
                    className={
                      invalid
                        ? "bg-red-50 hover:bg-red-50"
                        : state?.status === "failed"
                          ? "bg-amber-50 hover:bg-amber-50"
                          : state?.status === "success"
                            ? "bg-emerald-50/60 hover:bg-emerald-50"
                            : "hover:bg-gray-50"
                    }
                  >
                    <td className={`whitespace-nowrap px-2 py-1.5 ${statusClass(state)}`}>
                      {statusLabel(state)}
                    </td>
                    <td
                      className="max-w-[200px] truncate px-2 py-1.5"
                      title={
                        buyer
                          ? `${buyer.legalName}${buyer.address ? ` · ${buyer.address}` : ""}${resolveInvoiceEmail(buyer, row) ? ` · ${resolveInvoiceEmail(buyer, row)}` : ""}`
                          : ""
                      }
                    >
                      {buyer?.legalName || "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-gray-500">
                      {buyer ? getBuyerSourceLabel(buyer.source) : "—"}
                    </td>
                    {INVOICE_COLUMNS.map(({ key, header }) => (
                      <td
                        key={`${header}-${index}`}
                        className={[
                          "max-w-[160px] truncate px-2 py-1.5",
                          invalid && key === "maSoThue" ? "font-medium text-red-600" : "",
                        ].join(" ")}
                        title={row[key]}
                      >
                        {formatCell(key, row[key])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
