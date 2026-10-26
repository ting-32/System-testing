/**
 * 防禦試算表公式注入 (Formula / CSV Injection - CWE-1236)
 *
 * 若字串開頭是 =, +, -, @, \t, \r 則在前面加上單引號 '，
 * 強制 Google Sheets / Excel 視為純文字而非公式執行。
 */
export function sanitizeCellForSheet(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'string') return val;
  const trimmed = val.trim();
  if (/^[=\+\-@\t\r]/.test(trimmed)) {
    return "'" + val;
  }
  return val;
}

/**
 * 批次過濾單列資料（一維陣列）
 */
export function sanitizeRowForSheet<T extends unknown[]>(row: T): T {
  if (!Array.isArray(row)) return row;
  return row.map(cell => sanitizeCellForSheet(cell)) as T;
}

/**
 * 批次過濾二維矩陣（多列資料）
 */
export function sanitizeMatrixForSheet<T extends unknown[][]>(matrix: T): T {
  if (!Array.isArray(matrix)) return matrix;
  return matrix.map(row => sanitizeRowForSheet(row)) as T;
}
