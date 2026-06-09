"use client";

import { useCallback, useRef, useState } from "react";
import { downloadSampleTemplate, parseInvoiceExcel } from "@/lib/excel";
import type { BuyerInfo } from "@/lib/customer";
import {
  formatLookupError,
  getUniqueMaSoThue,
  importBienLaiRows,
  lookupBuyer,
  type ImportResult,
} from "@/lib/minvoice";
import { formatExcelRowLabel, normalizeMaSoThue } from "@/lib/tax-code";
import type { ParsedInvoiceFile } from "@/types/invoice";
import LookupDebugPanel, { type LookupLogEntry } from "./LookupDebugPanel";
import InvoicePreviewTable from "./InvoicePreviewTable";

export default function ExcelImportTool() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [lookupLogs, setLookupLogs] = useState<LookupLogEntry[]>([]);
  const [parsedFile, setParsedFile] = useState<ParsedInvoiceFile | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
      setError("Chỉ hỗ trợ .xlsx / .xls");
      return;
    }

    setIsLoading(true);
    setError(null);
    setImportResult(null);

    try {
      setParsedFile(await parseInvoiceExcel(file));
    } catch (err) {
      setParsedFile(null);
      setError(err instanceof Error ? err.message : "Không đọc được file.");
    } finally {
      setIsLoading(false);
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

  const reset = () => {
    setParsedFile(null);
    setError(null);
    setImportResult(null);
    setImportStatus(null);
    setLookupLogs([]);
  };

  const runLookup = async (rows: ParsedInvoiceFile["rows"]) => {
    const buyers: Record<string, BuyerInfo> = {};
    const logs: LookupLogEntry[] = [];
    const uniqueMst = getUniqueMaSoThue(rows);

    for (const mst of uniqueMst) {
      setImportStatus(`Đang tra cứu MST ${mst}...`);
      const sampleRow = rows.find((row) => normalizeMaSoThue(row.maSoThue) === mst)!;
      const result = await lookupBuyer(mst, sampleRow);

      logs.push({
        time: new Date().toLocaleTimeString("vi-VN"),
        endpoint: result.endpoint,
        httpStatus: result.httpStatus,
        response: result.data,
      });
      setLookupLogs([...logs]);

      if (!result.data.ok || !result.data.buyer) {
        throw new Error(formatLookupError(result));
      }

      buyers[mst] = result.data.buyer;
    }

    return buyers;
  };

  const handleTestLookup = async () => {
    if (!parsedFile?.rows.length || parsedFile.taxCodeErrors.length > 0) return;

    setIsImporting(true);
    setError(null);
    setLookupLogs([]);

    try {
      await runLookup(parsedFile.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tra cứu thất bại");
    } finally {
      setIsImporting(false);
      setImportStatus(null);
    }
  };

  const handleImport = async () => {
    if (!parsedFile?.rows.length || parsedFile.taxCodeErrors.length > 0) return;

    setIsImporting(true);
    setError(null);
    setImportResult(null);
    setLookupLogs([]);

    try {
      const buyers = await runLookup(parsedFile.rows);
      setImportStatus("Đang lưu biên lai...");
      setImportResult(await importBienLaiRows(parsedFile.rows, buyers));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import thất bại");
    } finally {
      setIsImporting(false);
      setImportStatus(null);
    }
  };

  const hasRows = parsedFile && parsedFile.rows.length > 0;
  const hasTaxCodeErrors = (parsedFile?.taxCodeErrors.length ?? 0) > 0;
  const canImport = hasRows && !hasTaxCodeErrors;

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-gray-50 px-3 py-4 sm:px-4">
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
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:text-sm"
            >
              Chọn file
            </button>
            {hasRows && (
              <button
                type="button"
                onClick={() => void handleTestLookup()}
                disabled={isImporting || !canImport}
                className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 sm:text-sm"
              >
                Tra cứu thử
              </button>
            )}
            {hasRows && (
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={isImporting || !canImport}
                title={
                  hasTaxCodeErrors
                    ? "Sửa lỗi mã số thuế trước khi import"
                    : undefined
                }
                className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-50 sm:ml-auto sm:text-sm"
              >
                {isImporting
                  ? importStatus || "Đang import..."
                  : `Import (${parsedFile.totalRows})`}
              </button>
            )}
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => !parsedFile && inputRef.current?.click()}
            className={[
              "mt-2 rounded-md border border-dashed px-3 py-3 text-center text-xs sm:text-sm",
              isDragging
                ? "border-emerald-400 bg-emerald-50"
                : "border-gray-200 bg-gray-50",
              parsedFile ? "" : "cursor-pointer hover:border-emerald-300",
            ].join(" ")}
          >
            {isLoading ? (
              <span className="text-gray-500">Đang đọc...</span>
            ) : parsedFile ? (
              <span className="text-gray-600">
                <strong className="text-gray-800">{parsedFile.fileName}</strong>
                {" · "}
                <span className="text-emerald-600">{parsedFile.totalRows} dòng</span>
                {" · "}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    reset();
                  }}
                  className="text-gray-400 underline hover:text-gray-600"
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
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-600">
              {error}
            </pre>
          )}

          {importStatus && (
            <p className="mt-2 rounded-md bg-blue-50 px-2 py-1.5 text-xs text-blue-700">
              {importStatus}
            </p>
          )}

          <LookupDebugPanel logs={lookupLogs} />

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

          {importResult && importResult.failed === 0 && (
            <p className="mt-2 rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">
              Import thành công {importResult.success}/{importResult.total} biên lai.
            </p>
          )}

          {importResult && importResult.failed > 0 && (
            <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              <p className="font-medium">
                {importResult.success}/{importResult.total} thành công
              </p>
              <ul className="mt-1 space-y-0.5">
                {importResult.results
                  .filter((r) => !r.success)
                  .map((r) => (
                    <li key={`${r.excelRowNumber}-${r.stt}`}>
                      {r.message}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>

        {hasRows && (
          <section className="mt-3 w-full min-w-0">
            <p className="mb-2 text-xs font-medium text-gray-500">
              Xem trước · {parsedFile.totalRows} dòng
            </p>
            <InvoicePreviewTable
              rows={parsedFile.rows}
              invalidExcelRows={new Set(parsedFile.taxCodeErrors.map((e) => e.excelRowNumber))}
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
