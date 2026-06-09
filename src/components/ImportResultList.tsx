import { formatExcelRowLabel } from "@/lib/tax-code";
import type { ImportResult } from "@/lib/minvoice";

type ImportResultListProps = {
  result: ImportResult;
};

export default function ImportResultList({ result }: ImportResultListProps) {
  const sorted = [...result.results].sort((a, b) => a.excelRowNumber - b.excelRowNumber);
  const allSuccess = result.failed === 0;

  return (
    <div
      className={[
        "mt-2 rounded-md px-2 py-1.5 text-xs",
        allSuccess ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900",
      ].join(" ")}
    >
      <p className="font-medium">
        Kết quả import: {result.success}/{result.total} thành công
      </p>
      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
        {sorted.map((row) => (
          <li
            key={`${row.excelRowNumber}-${row.stt}`}
            className={[
              "flex flex-wrap items-baseline gap-x-2 rounded px-1.5 py-1",
              row.success ? "bg-emerald-100/60" : "bg-red-100/80 text-red-800",
            ].join(" ")}
          >
            <span className="font-medium">
              {formatExcelRowLabel(row.excelRowNumber)}
            </span>
            <span className="text-gray-500">STT {row.stt}</span>
            <span className={row.success ? "text-emerald-700" : "text-red-700"}>
              {row.success ? "✓ Thành công" : "✗ Thất bại"}
            </span>
            {!row.success && row.message && (
              <span className="w-full text-red-700">{row.message}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
