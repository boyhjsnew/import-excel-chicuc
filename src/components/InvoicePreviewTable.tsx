import { INVOICE_COLUMNS, type InvoiceRow } from "@/types/invoice";

type InvoicePreviewTableProps = {
  rows: InvoiceRow[];
  invalidExcelRows?: Set<number>;
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

export default function InvoicePreviewTable({
  rows,
  invalidExcelRows,
}: InvoicePreviewTableProps) {
  return (
    <>
      <div className="space-y-2 lg:hidden">
        {rows.map((row, index) => {
          const invalid = isInvalidRow(row, invalidExcelRows);
          return (
            <div
              key={`card-${index}`}
              className={[
                "rounded-md border bg-white px-3 py-2 text-xs",
                invalid ? "border-red-300 bg-red-50" : "border-gray-200",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-800">
                  Dòng {row.excelRowNumber} · {row.dienGiai || "—"}
                </span>
                <span className="shrink-0 font-medium text-emerald-600">
                  {formatCell("soTien", row.soTien)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-gray-500">
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
            </div>
          );
        })}
      </div>

      <div className="hidden w-full min-w-0 lg:block">
        <div className="w-full min-w-0 overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="w-max min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
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
                return (
                  <tr
                    key={`row-${index}`}
                    className={invalid ? "bg-red-50 hover:bg-red-50" : "hover:bg-gray-50"}
                  >
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
