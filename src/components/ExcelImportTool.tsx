"use client";

import { useCallback, useRef, useState } from "react";
import { downloadSampleTemplate, parseInvoiceExcel } from "@/lib/excel";
import {
  getBuyerSourceLabel,
  isOfficialBuyer,
  type BuyerInfo,
} from "@/lib/customer";
import {
  formatLookupError,
  getUniqueMaSoThue,
  importBienLaiRows,
  lookupBuyer,
  mergeImportResults,
  sortRowsByNgayNhap,
  type ImportResult,
} from "@/lib/minvoice";
import { formatExcelRowLabel, normalizeMaSoThue } from "@/lib/tax-code";
import type { ParsedInvoiceFile, RowImportState } from "@/types/invoice";
import ImportResultList from "./ImportResultList";
import InvoicePreviewTable from "./InvoicePreviewTable";

function emptyRowStates(file: ParsedInvoiceFile): Record<number, RowImportState> {
  return Object.fromEntries(
    file.rows.map((row) => [row.excelRowNumber, { status: "pending" as const }])
  );
}

export default function ExcelImportTool() {
  const inputRef = useRef<HTMLInputElement>(null);
  const isBusyRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [parsedFile, setParsedFile] = useState<ParsedInvoiceFile | null>(null);
  const [buyers, setBuyers] = useState<Record<string, BuyerInfo>>({});
  const [lookupErrors, setLookupErrors] = useState<Record<string, string>>({});
  const [lookupDone, setLookupDone] = useState(false);
  const [rowStates, setRowStates] = useState<Record<number, RowImportState>>({});

  const resetSession = () => {
    setParsedFile(null);
    setError(null);
    setImportResult(null);
    setStatus(null);
    setBuyers({});
    setLookupErrors({});
    setLookupDone(false);
    setRowStates({});
  };

  const runLookup = async (rows: ParsedInvoiceFile["rows"]) => {
    const nextBuyers: Record<string, BuyerInfo> = {};
    const nextErrors: Record<string, string> = {};
    const uniqueMst = getUniqueMaSoThue(rows);

    for (let i = 0; i < uniqueMst.length; i += 1) {
      const mst = uniqueMst[i];
      setStatus(`Đang tra cứu MST ${mst} (${i + 1}/${uniqueMst.length})...`);
      const sampleRow = rows.find((row) => normalizeMaSoThue(row.maSoThue) === mst)!;

      try {
        const result = await lookupBuyer(mst, sampleRow);
        if (!result.data.ok || !isOfficialBuyer(result.data.buyer)) {
          nextErrors[mst] = result.data.ok
            ? `Không tra cứu được tên công ty cho MST ${mst}. Không lấy từ cột Diễn giải Excel.`
            : formatLookupError(result);
          continue;
        }
        nextBuyers[mst] = result.data.buyer;
      } catch (err) {
        nextErrors[mst] = err instanceof Error ? err.message : "Tra cứu thất bại";
      }
    }

    setBuyers(nextBuyers);
    setLookupErrors(nextErrors);
    setLookupDone(true);
    return { nextBuyers, nextErrors };
  };

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setError("Chỉ hỗ trợ .xlsx / .xls");
      return;
    }

    setIsLoading(true);
    setError(null);
    setImportResult(null);
    setBuyers({});
    setLookupErrors({});
    setLookupDone(false);
    setRowStates({});

    try {
      const parsed = await parseInvoiceExcel(file);
      setParsedFile(parsed);
      setRowStates(emptyRowStates(parsed));

      if (!parsed.rows.length || parsed.taxCodeErrors.length > 0) {
        return;
      }

      setIsLookingUp(true);
      isBusyRef.current = true;
      await runLookup(parsed.rows);
    } catch (err) {
      setParsedFile(null);
      setError(err instanceof Error ? err.message : "Không đọc được file.");
    } finally {
      isBusyRef.current = false;
      setIsLoading(false);
      setIsLookingUp(false);
      setStatus(null);
    }
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const getImportableRows = (failedOnly: boolean) => {
    if (!parsedFile) return [];

    return parsedFile.rows.filter((row) => {
      const mst = normalizeMaSoThue(row.maSoThue);
      if (!isOfficialBuyer(buyers[mst])) return false;

      const state = rowStates[row.excelRowNumber];
      if (state?.status === "success") return false;
      if (failedOnly) return state?.status === "failed";
      return true;
    });
  };

  const handleImport = async (failedOnly: boolean) => {
    if (!parsedFile?.rows.length || parsedFile.taxCodeErrors.length > 0) return;
    if (!lookupDone || isBusyRef.current) return;

    const rowsToImport = getImportableRows(failedOnly);
    if (!rowsToImport.length) return;

    isBusyRef.current = true;
    setIsImporting(true);
    setError(null);

    try {
      setStatus(
        failedOnly
          ? `Đang import ${rowsToImport.length} dòng lỗi...`
          : `Đang lưu biên lai (${rowsToImport.length} dòng)...`
      );
      const sortedRows = sortRowsByNgayNhap(rowsToImport);
      const next = await importBienLaiRows(sortedRows, buyers);
      const merged = mergeImportResults(importResult, next);
      setImportResult(merged);
      setRowStates((prev) => {
        const copy = { ...prev };
        next.results.forEach((item) => {
          copy[item.excelRowNumber] = {
            status: item.success ? "success" : "failed",
            message: item.message,
          };
        });
        return copy;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import thất bại");
    } finally {
      isBusyRef.current = false;
      setIsImporting(false);
      setStatus(null);
    }
  };

  const hasRows = parsedFile && parsedFile.rows.length > 0;
  const hasTaxCodeErrors = (parsedFile?.taxCodeErrors.length ?? 0) > 0;
  const pendingCount = parsedFile
    ? parsedFile.rows.filter((row) => {
        const state = rowStates[row.excelRowNumber];
        return !state || state.status === "pending";
      }).length
    : 0;
  const failedCount = parsedFile
    ? parsedFile.rows.filter((row) => rowStates[row.excelRowNumber]?.status === "failed")
        .length
    : 0;
  const successCount = parsedFile
    ? parsedFile.rows.filter((row) => rowStates[row.excelRowNumber]?.status === "success")
        .length
    : 0;
  const canImport =
    hasRows &&
    !hasTaxCodeErrors &&
    lookupDone &&
    pendingCount > 0 &&
    getImportableRows(false).length > 0;
  const canRetryFailed = lookupDone && getImportableRows(true).length > 0;
  const busy = isLoading || isLookingUp || isImporting;
  const lookupErrorCount = Object.keys(lookupErrors).length;

  return (
    <div className="w-full overflow-x-hidden bg-gray-50 px-3 py-4 sm:px-4">
      <div className="mx-auto w-full min-w-0 max-w-3xl">
        <header className="mb-3">
          <h1 className="text-base font-bold text-gray-900 sm:text-lg">
            Import biên lai từ Excel
          </h1>
        </header>

        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={onInputChange}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadSampleTemplate}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 sm:text-sm"
            >
              Tải mẫu
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 sm:text-sm"
            >
              Chọn file
            </button>
            {hasRows && (
              <>
                <button
                  type="button"
                  onClick={() => void handleImport(false)}
                  disabled={busy || !canImport}
                  title={
                    hasTaxCodeErrors
                      ? "Sửa lỗi mã số thuế trước khi import"
                      : !lookupDone
                        ? "Đang tra cứu, chờ xong rồi import"
                        : pendingCount === 0
                          ? "Không còn dòng chờ import"
                          : undefined
                  }
                  className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:pointer-events-none disabled:opacity-50 sm:ml-auto sm:text-sm"
                >
                  {isLookingUp
                    ? status || "Đang tra cứu..."
                    : isImporting && pendingCount > 0
                      ? status || "Đang import..."
                      : `Import (${pendingCount})`}
                </button>
                {failedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleImport(true)}
                    disabled={busy || !canRetryFailed}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:pointer-events-none disabled:opacity-50 sm:text-sm"
                  >
                    Import dòng lỗi ({failedCount})
                  </button>
                )}
              </>
            )}
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => !parsedFile && !busy && inputRef.current?.click()}
            className={[
              "mt-2 rounded-md border border-dashed px-3 py-3 text-center text-xs sm:text-sm",
              isDragging
                ? "border-emerald-400 bg-emerald-50"
                : "border-gray-200 bg-gray-50",
              parsedFile || busy ? "" : "cursor-pointer hover:border-emerald-300",
            ].join(" ")}
          >
            {isLoading ? (
              <span className="text-gray-500">Đang đọc...</span>
            ) : parsedFile ? (
              <span className="text-gray-600">
                <strong className="text-gray-800">{parsedFile.fileName}</strong>
                {" · "}
                <span className="text-emerald-600">{parsedFile.totalRows} dòng</span>
                {lookupDone && (
                  <>
                    {" · "}
                    <span>
                      Tra cứu {Object.keys(buyers).length} MST
                      {lookupErrorCount > 0 ? ` · ${lookupErrorCount} không ra tên CTY` : ""}
                    </span>
                  </>
                )}
                {successCount > 0 && (
                  <>
                    {" · "}
                    <span className="text-emerald-700">{successCount} đã tạo</span>
                  </>
                )}
                {" · "}
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    resetSession();
                  }}
                  className="text-gray-400 underline hover:text-gray-600 disabled:opacity-50"
                >
                  Đổi file
                </button>
              </span>
            ) : (
              <span className="text-gray-500">
                Kéo thả hoặc bấm chọn file (.xlsx, .xls)
              </span>
            )}
          </div>

          {error && (
            <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-600">
              {error}
            </p>
          )}

          {status && (
            <p className="mt-2 rounded-md bg-blue-50 px-2 py-1.5 text-xs text-blue-700">
              {status}
            </p>
          )}

          {lookupDone && !hasTaxCodeErrors && (
            <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
              Đã tra cứu xong. Kiểm tra tên/địa chỉ bên dưới rồi bấm Import.
              {Object.values(buyers).some((item) => item.source === "customer") &&
                ` Danh mục KH: ${Object.values(buyers).filter((item) => item.source === "customer").length}.`}
              {Object.values(buyers).some((item) => item.source === "taxcode" || item.source === "gdt") &&
                ` MST/GDT: ${Object.values(buyers).filter((item) => item.source === "taxcode" || item.source === "gdt").length}.`}
            </p>
          )}

          {hasTaxCodeErrors && parsedFile && (
            <div className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
              <p className="font-medium">
                {parsedFile.taxCodeErrors.length} dòng có mã số thuế không hợp lệ
              </p>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                {parsedFile.taxCodeErrors.map((item) => (
                  <li key={`${item.excelRowNumber}-${item.maSoThue}`}>
                    {formatExcelRowLabel(item.excelRowNumber)} ({item.maSoThue}): {item.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lookupErrorCount > 0 && (
            <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              <p className="font-medium">{lookupErrorCount} MST tra cứu lỗi (bỏ qua khi import)</p>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                {Object.entries(lookupErrors).map(([mst, message]) => (
                  <li key={mst}>
                    MST {mst}: {message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importResult && <ImportResultList result={importResult} />}
        </div>

        {hasRows && (
          <section className="mt-3 w-full min-w-0">
            <p className="mb-2 text-xs font-medium text-gray-500">
              Xem trước · {parsedFile.totalRows} dòng
              {lookupDone
                ? ` · ${Object.values(buyers)
                    .map((item) => getBuyerSourceLabel(item.source))
                    .filter((label, index, all) => all.indexOf(label) === index)
                    .join(" / ")}`
                : ""}
            </p>
            <InvoicePreviewTable
              rows={parsedFile.rows}
              invalidExcelRows={new Set(parsedFile.taxCodeErrors.map((e) => e.excelRowNumber))}
              buyers={buyers}
              rowStates={rowStates}
            />
          </section>
        )}

        {parsedFile && parsedFile.rows.length === 0 && (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
            File không có dữ liệu.
          </p>
        )}
      </div>
    </div>
  );
}
