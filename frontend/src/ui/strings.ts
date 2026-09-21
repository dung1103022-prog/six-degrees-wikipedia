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
  graphLegendStart: "Điểm bắt đầu",
  graphLegendEnd: "Điểm kết thúc",
  graphLegendPath: "Trên đường đi ngắn nhất",
  graphLegendOther: "Người khác được khám phá, mờ dần theo khoảng cách",
  // the /share page (SPEC §5.6)
  loading: "Đang tải…",
  invalidLink: "Link không còn hợp lệ.",
  backToHome: "← Về trang chủ",
  newSearch: (from: string, to: string) => `Kết quả tìm kiếm mới từ "${from}" đến "${to}":`,
  pathFailed: (reason: string) => `Không thể tải đường đi: ${reason}.`,
  // Panel titles (design: sixth-degree.ranisaro.com-DESIGN.md — "Pathfinding Search" / "Search Log" /
  // "Network Visualization"). The Search Log card is a client-only replay of the SearchResponse
  // already fetched (see SearchLog.tsx): there is no live socket to a server, so "connected" here
  // means "a search is in flight or done", not an actual connection.
  pathfindingSearchTitle: "Tìm đường đi",
  networkVisualizationTitle: "Trực quan hóa mạng lưới",
  nodesExplored: (n: number) => `Đã khám phá: ${n} node`,
  searchLogTitle: "Nhật ký tìm kiếm",
  searchLogStatusOn: "Đã kết nối",
  searchLogStatusOff: "Ngắt kết nối",
  searchLogEmpty: "Chưa có hoạt động tìm kiếm nào. Chọn điểm bắt đầu và kết thúc để bắt đầu.",
  searchLogConnected: "Đã kết nối tới máy chủ tìm đường.",
  searchLogSearching: (from: string, to: string) => `Đang tìm đường từ "${from}" đến "${to}"…`,
  searchLogLevel: (level: number, explored: number) => `Cấp ${level}: đã khám phá ${explored} node.`,
  searchLogPathNode: (name: string, level: number) => `Cấp ${level}: node trên đường đi — ${name}.`,
  searchLogFailed: "Tìm kiếm không thành công.",
} as const;
