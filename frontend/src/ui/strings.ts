// UI text: Vietnamese (SPEC Q-3). Kept in one place so the pages share the wording.
import type { ErrorDetail } from "../api/types";

const FIELD: Record<ErrorDetail["param"], string> = { from: "Từ", to: "Đến" };

export const strings = {
  from: FIELD.from,
  to: FIELD.to,
  search: "Tìm đường",
  searching: "Đang tìm…",
  pathLabel: "Đường đi",
  candidatesLabel: "Chọn một người",
  pathLength: (edges: number | null) => `Đường đi ngắn nhất: ${edges ?? "?"} bước`,
  noPath: (from: string, to: string) => `Không có đường đi từ "${from}" đến "${to}".`,
  unresolved: (input: string, param: ErrorDetail["param"]) => `Không tìm thấy "${input}" (ô ${FIELD[param]}).`,
  ambiguous: (input: string, param: ErrorDetail["param"]) => `Tên "${input}" (ô ${FIELD[param]}) không rõ ràng, hãy chọn một người:`,
  searchFailed: (reason: string) => `Không thể tìm kiếm: ${reason}.`,
  historyLabel: "Lịch sử tìm kiếm",
  historyEntry: (from: string, to: string) => `${from} → ${to}`,
  graphLabel: "Đồ thị các bước của lần tìm kiếm",
  graphUnavailable: "Không thể vẽ đồ thị (trình duyệt không hỗ trợ WebGL).",
  // the /share page (SPEC §5.6)
  loading: "Đang tải…",
  invalidLink: "Link không còn hợp lệ.",
  newSearch: (from: string, to: string) => `Kết quả tìm kiếm mới từ "${from}" đến "${to}":`,
  pathFailed: (reason: string) => `Không thể tải đường đi: ${reason}.`,
} as const;
