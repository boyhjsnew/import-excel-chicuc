export function assertMinvoiceConfig() {
  const apiUrl = process.env.MINVOICE_API_URL?.trim();
  const authToken = process.env.MINVOICE_AUTH_TOKEN?.trim();

  if (!apiUrl) {
    throw new Error("Thiếu MINVOICE_API_URL trong .env.local");
  }

  if (!authToken) {
    throw new Error("Thiếu MINVOICE_AUTH_TOKEN trong .env.local");
  }

  if (authToken.includes("YOUR_TOKEN")) {
    throw new Error(
      "MINVOICE_AUTH_TOKEN vẫn là giá trị mẫu YOUR_TOKEN_HERE. Thay bằng token thật từ minvoice, rồi restart npm run dev."
    );
  }

  return { apiUrl, authToken };
}
