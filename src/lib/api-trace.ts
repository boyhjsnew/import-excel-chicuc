export type ApiTrace = {
  step: string;
  api: string;
  method: string;
  url: string;
  ok: boolean;
  status?: number;
  durationMs: number;
  responsePreview?: string;
  error?: string;
};

export async function readResponseText(response: Response): Promise<string> {
  const text = await response.text();
  return text || "(empty)";
}

export function truncatePreview(text: string, maxLength = 300): string {
  if (!text) return "(empty)";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function createTrace(
  step: string,
  api: string,
  method: string,
  url: string,
  startedAt: number,
  response: Response | null,
  ok: boolean,
  responsePreview?: string,
  error?: string
): ApiTrace {
  return {
    step,
    api,
    method,
    url,
    ok,
    status: response?.status,
    durationMs: Date.now() - startedAt,
    responsePreview: responsePreview ? truncatePreview(responsePreview) : undefined,
    error,
  };
}
