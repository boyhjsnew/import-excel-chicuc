import type { InvoiceRow, TaxCodeRowError } from "@/types/invoice";

export type TaxCodeType = "company" | "company-branch" | "household";

export type TaxCodeValidation = {
  valid: boolean;
  normalized: string;
  type?: TaxCodeType;
  message?: string;
};

const COMPANY_PATTERN = /^\d{10}$/;
const COMPANY_BRANCH_PATTERN = /^\d{10}-\d{3}$/;
const HOUSEHOLD_PATTERN = /^\d{12}$/;

export function formatExcelRowLabel(excelRowNumber: number): string {
  return `Dòng Excel ${excelRowNumber}`;
}

export function normalizeMaSoThue(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export function validateMaSoThue(value: string): TaxCodeValidation {
  const normalized = normalizeMaSoThue(value);

  if (!normalized) {
    return {
      valid: false,
      normalized,
      message: "Mã số thuế không được để trống",
    };
  }

  if (HOUSEHOLD_PATTERN.test(normalized)) {
    return { valid: true, normalized, type: "household" };
  }

  if (COMPANY_BRANCH_PATTERN.test(normalized)) {
    return { valid: true, normalized, type: "company-branch" };
  }

  if (COMPANY_PATTERN.test(normalized)) {
    return { valid: true, normalized, type: "company" };
  }

  return {
    valid: false,
    normalized,
    message:
      "Mã số thuế không đúng định dạng. Đơn vị: 10 số hoặc 10 số-3 số (vd: 1234567890-001). Hộ KD: 12 số (CCCD).",
  };
}

export function validateRowsTaxCode(rows: InvoiceRow[]): TaxCodeRowError[] {
  const errors: TaxCodeRowError[] = [];

  rows.forEach((row) => {
    const result = validateMaSoThue(row.maSoThue);
    if (!result.valid) {
      errors.push({
        excelRowNumber: row.excelRowNumber,
        maSoThue: row.maSoThue || "(trống)",
        message: result.message || "Mã số thuế không hợp lệ",
      });
    }
  });

  return errors;
}
