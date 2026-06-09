import type { LookupBuyerResponse } from "@/lib/minvoice";

export type LookupLogEntry = {
  time: string;
  endpoint: string;
  httpStatus: number;
  response: LookupBuyerResponse & { ok: boolean };
};

type LookupDebugPanelProps = {
  logs: LookupLogEntry[];
};

export default function LookupDebugPanel({ logs }: LookupDebugPanelProps) {
  if (!logs.length) return null;

  return (
    <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs">
      <p className="font-medium text-gray-700">
        Nhật ký tra cứu ({logs.length} request) — Network tab tìm:{" "}
        <code className="text-blue-600">buyer</code>
      </p>
      <div className="mt-2 space-y-2">
        {logs.map((log, index) => (
          <details
            key={`${log.time}-${log.response.maSoThue}-${index}`}
            className="rounded border border-gray-200 bg-white p-2"
            open={!log.response.ok}
          >
            <summary className="cursor-pointer font-medium text-gray-800">
              {log.time} · POST {log.endpoint} · HTTP {log.httpStatus} · MST{" "}
              {log.response.maSoThue}{" "}
              <span className={log.response.ok ? "text-emerald-600" : "text-red-600"}>
                {log.response.ok ? "OK" : "LỖI"}
              </span>
            </summary>

            {log.response.error && (
              <p className="mt-2 text-red-600">{log.response.error}</p>
            )}

            {log.response.buyer && (
              <p className="mt-2 text-gray-600">
                Nguồn: {log.response.buyer.source} · {log.response.buyer.legalName}
              </p>
            )}

            {log.response.traces?.length > 0 && (
              <ul className="mt-2 space-y-1 text-gray-600">
                {log.response.traces.map((trace, traceIndex) => (
                  <li key={`${trace.step}-${traceIndex}`} className="rounded bg-gray-50 p-1.5">
                    <p>
                      <strong>{trace.step}</strong> · {trace.method} {trace.api} → HTTP{" "}
                      {trace.status ?? "?"} ({trace.durationMs}ms)
                    </p>
                    <p className="break-all text-gray-500">{trace.url}</p>
                    {(trace.responsePreview || trace.error) && (
                      <p className="mt-1 break-all text-gray-700">
                        {trace.responsePreview || trace.error}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}
