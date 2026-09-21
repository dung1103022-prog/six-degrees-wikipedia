# Six Degrees of Wikipedia (Python) — Implementation Spec

**Version:** 2.18 (layout đồ thị: path zích zắc theo vị trí cố định trên vỏ cầu thay vì một đường thẳng qua tâm; thêm pan bằng phím mũi tên/WASD và nút "Reset view"; cả hai vẫn nằm trong phần layout/tương tác do implementation quyết định của ADR-014, **không đổi contract HTTP**, không mở lại quyết định nào)

> Tài liệu này là nguồn sự thật (source of truth) cho việc implement.
> Khi code và spec mâu thuẫn, spec thắng. Khi spec mơ hồ hoặc thiếu, **hỏi lại, không tự suy diễn**.
> Mục "Open questions" ở cuối liệt kê các điểm chưa chốt; không implement các điểm đó cho tới khi được chốt.

Project gốc tham khảo: `Rani-Codes/sixth_degree` (Go + React + sigma.js).

---

## Changelog

### v2.18 — Layout path zích zắc; pan (mũi tên/WASD) + nút Reset view

Quyết định nguồn: chủ project, 2026-09-21. Chỉ Phase 4 (frontend), phần layout/tương tác của đồ thị mà ADR-014 đã giao cho implementation tự quyết (§"Đồ thị") — **không mở lại Q-14, không đổi contract HTTP** của `/api/*` hay `/share`.

- **Layout: path zích zắc thay vì một đường thẳng qua tâm.** Mỗi node — dù là path hay explored — giờ có đúng một vị trí cố định trên vỏ cầu của level nó (cùng công thức hash theo level như node explored); chỉ riêng node bắt đầu (start) được đặt cứng tại đúng tâm hình cầu. Path không còn là một trường hợp layout riêng, chỉ còn là một trường hợp tô màu/kích thước riêng (route qua các vị trí cố định đó theo đúng thứ tự BFS nên nhìn zích zắc giữa các lớp vỏ thay vì một tia thẳng). `frontend/src/graph/buildGraph.ts` viết lại phần layout; không đổi `Node3D`/`Link3D`/`GraphData3D`, không đổi `style.ts`, không đổi `GraphView.tsx` phần dựng dữ liệu.
- **Pan bằng phím mũi tên và WASD (mới).** Xoay (kéo chuột) và zoom (lăn chuột/pinch) vẫn từ `OrbitControls` có sẵn của `3d-force-graph`. Phím mũi tên dùng cơ chế pan bằng phím có sẵn nhưng tắt mặc định của `OrbitControls` (`listenToKeyEvents`), còn WASD dùng một handler riêng (vì `OrbitControls` chỉ nghe một bộ phím cố định tại một thời điểm) dịch chuyển camera và điểm neo (`target`) cùng lúc theo hướng camera đang nhìn. Cả hai chỉ nhận phím khi chính khung canvas đang có focus (`tabIndex`, listener gắn trên phần tử canvas, không phải `window`), nên không đụng tới việc gõ phím ở ô Start/End Person hay bất kỳ đâu khác trên trang.
- **Nút "Reset view" (mới).** Đưa camera bay mượt (600ms) về đúng khung hình lúc mới mount (trước khi có tương tác nào) và nhìn lại vào tâm hình cầu (node start).
- **Không thay đổi:** mọi contract HTTP; Q-3 (v2.16), Q-14 (v2.17, chỉ phần thư viện vẽ) không đổi; ADR-014 (mục "Đồ thị") cập nhật câu mô tả layout cho khớp thực tế mới, không phải một quyết định mới.

### v2.17 — Mở lại và chốt lại Q-14 (đồ thị 3D xoay được); ô Network Visualization luôn hiện; path liên kết Wikipedia; header giữa trang

Quyết định nguồn: chủ project, 2026-09-21 (kèm ảnh tham khảo header). Chỉ Phase 4 (frontend) và tài liệu; **không đổi contract HTTP** của `/api/*` hay `/share` (Phase 1–3 không đổi).

- **Q-14 mở lại và chốt lại:** đồ thị đổi từ Sigma.js (2D, canvas) + Graphology sang **`3d-force-graph`** (Three.js, WebGL) để vẽ **hình cầu 3D xoay được, có chiều sâu** — phương án được chọn giữa hai lựa chọn được hỏi lại (không phải "organic scatter 2D" của phiên bản trước). Dữ liệu vẽ **vẫn chỉ lấy từ `SearchResponse`** (`levels`, `path`); không BFS, không API mới, không đổi contract HTTP — chỉ phần "thư viện vẽ" của Q-14 được mở lại, các phần còn lại của ADR-014 (React/Vite/TS, Vitest, lịch sử 20 entry) không đổi. Layout: mỗi level nằm trên một lớp vỏ hình cầu (bán kính theo level, cùng nguyên tắc "band" cũ nhưng phân bố đều trên toàn mặt cầu thay vì một vòng phẳng); toàn bộ path vẫn nằm trên một đường thẳng qua tâm. Bố cục, màu, animation vẫn **do implementation quyết định, không thuộc contract** (không đổi so với ADR-014 gốc).
- **Hover hiện tên (mới, Q-14):** trỏ chuột vào bất kỳ node nào (không riêng path) hiện tên người tương ứng, dùng `nodeLabel` có sẵn của `3d-force-graph` (tooltip gốc của thư viện) — thay cho nhãn cố định chỉ ở path node của layout Sigma cũ; `frontend/src/graph/label.ts` (riêng cho Sigma) bị loại bỏ.
- **Ô "Network Visualization" luôn được mount (mới):** panel này (tiêu đề + khung canvas) hiện **ngay cả khi chưa có kết quả tìm kiếm** — canvas rỗng, không node/link, không badge "Nodes explored" và không chú thích màu cho tới khi có `SearchResponse` đầu tiên. Trước v2.17 panel chỉ mount sau khi có kết quả; đây là thay đổi hành vi hiển thị thuần túy (không có test ID §7 nào khóa hành vi cũ, không phải contract). Áp dụng cho trang tìm kiếm (`SearchPage`); trang `/share` không đổi (panel đồ thị ở đó vẫn chỉ hiện khi link không hợp lệ và search mới đã xong).
- **"Shortest path" liên kết Wikipedia (mới):** mỗi tên trong danh sách path (`PathList`) là một link `<a href={wiki_url} target="_blank" rel="noopener noreferrer">`; `wiki_url` đã có sẵn trên `PersonMeta` — không đổi contract, không sửa backend.
- **Header giữa trang (mới):** tiêu đề "Six Degrees of Wikipedia" trên `SearchPage` chuyển vào giữa trang, kèm icon, gradient chữ và tagline "Explore the threads that tie us together" theo ảnh tham khảo chủ project gửi (2026-09-21); thuộc thị giác/CSS, không phải contract.
- **§0.4 (hàng Q-14), ADR-014 (mục "Đồ thị") và §8 (out of scope) cập nhật để không còn nhắc "Sigma" như hiện trạng. §9: Q-14 tách thành mục riêng trong "Đã chốt", ghi rõ đã mở lại.**
- **Không thay đổi:** mọi contract HTTP của `/api/*`, `/share`, `validate_path`, dữ liệu, fetcher, Docker; C-2, C-3, C-4, C-7 vẫn "Chưa duyệt"; Q-3 (v2.16) không đổi.

### v2.16 — Mở lại và chốt lại Q-3 (UI tiếng Anh); nới lỏng exclusion "autocomplete" (§0.3)

Quyết định nguồn: chủ project, 2026-09-21. Chỉ Phase 4 (frontend) và tài liệu; **không đổi contract HTTP** của `/api/*` hay `/share` (Phase 1–3 không đổi).

- **Q-3 mở lại và chốt lại một phần:** ngôn ngữ của **UI hiển thị trên trình duyệt** (nhãn, nút, thông báo lỗi, lịch sử, chú thích đồ thị, tiêu đề trang, `index.html` `lang`/`description`) chuyển từ tiếng Việt (v2.5) sang **tiếng Anh**. **Không đổi:** `og:title` do `/share` sinh ra vẫn giữ nguyên format và ngôn ngữ tiếng Việt của Q-3/Q-9 (`"{first} → {last}: {n} bước"`, §5.4) — phần này **không thuộc "UI hiển thị trên màn hình"** theo yêu cầu, và đổi nó sẽ đụng vào backend (`app/share.py`) ngoài phạm vi lần này. `og:title` có thể được xem lại thành một quyết định riêng nếu cần.
- **§0.3 (nới lỏng một phần):** dòng "không implement... autocomplete" được hiểu là **không tự tạo hạ tầng backend mới** cho gợi ý tên (không endpoint, không cache server-side, không index tìm kiếm riêng). Một **combobox thuần client** ở Start/End Person — gọi `GET /api/people` (route đã có sẵn từ Phase 1, không đổi) đúng một lần, cache trong bộ nhớ trình duyệt, lọc hoàn toàn phía client khi gõ — **được phép** và không coi là vi phạm §0.3. Không thêm route, endpoint hay tham số mới ở `/api/people`.
- **Không thay đổi:** mọi contract HTTP của `/api/*`, `/share`, `validate_path`, dữ liệu, fetcher, Docker; C-2, C-3, C-4, C-7 vẫn "Chưa duyệt".

### v2.15 — Hoàn thành Phase 1–4; hoàn thiện tài liệu (không đổi contract)

Quyết định nguồn: chủ project, 2026-09-19. Chỉ tài liệu và một sửa cấu hình logging; **không thay đổi contract** của Phase 1–4 (`/api/*`, `/share`, `validate_path`, dữ liệu, fetcher, static/SPA, Docker). Không mở C-2, C-3, C-4, C-7.

- **§0.3:** Phase 1–4 chuyển sang "**Hoàn thành**". Phase 2, 3, 4 đã mở ở v2.4, v2.9, v2.13. Phase 4 gồm SPA (`1958654`), frontend FE-01..FE-06 (`2688e28`), GraphView (`d552c92`), history (`7469744`) và Dockerfile (`13d8297`).
- **Đoạn stale (§0.4, dưới bảng):** câu "pha 3 vẫn chưa mở nên chưa implement" (C-6, C-9) đã lỗi thời từ v2.9; sửa thành "đã implement khi pha 3 mở", kèm test ID.
- **§6.6:** ghi dataset chính thức hiện tại: **9.997 people / 427.057 edges / 119.335 aliases**, sinh từ 10.000 seed, đã commit ở `844123a`. Đây là ghi nhận trạng thái; nội dung dataset không phải contract.
- **§9:** N-3 đánh dấu đã xử lý; N-4 ghi các lựa chọn của history là **lựa chọn của implementation, không phải contract**; thêm mục "Nợ kỹ thuật còn lại" ghi **N-1** và **N-2** (chuyển từ "Ghi chú kỹ thuật", cập nhật theo thực tế).
- **§6.5 (log sau khi validate), không đổi nội dung:** loader vốn đã ghi INFO "aliases per source" và số match key mơ hồ (DAT-16), nhưng khi chạy dưới uvicorn (và trong container) các dòng này **bị mất**: uvicorn chỉ cấu hình logger của chính nó nên logger gốc không có handler, mức WARNING. `create_app` nay thêm một handler stderr mức INFO cho logger `app` **chỉ khi chưa ai cấu hình logging**; khi host đã cấu hình (pytest, `--log-config`) thì không đụng. Test: `backend/tests/test_startup_logging.py` (không có test ID trong §7).
- **Không thay đổi:** mọi contract và test ID; C-2, C-3, C-4, C-7 vẫn "Chưa duyệt"; `API-17` và `DAT-10` vẫn chưa có test vì phụ thuộc các điểm đó (§7.0).

### v2.14 — Duyệt C-15: lỗi transport được retry

Quyết định nguồn: chủ project, 2026-09-19. Trước v2.14, §6.4 chỉ retry maxlag-trong-HTTP-200, 429 và 5xx; mọi lỗi ở tầng kết nối (ví dụ `httpx.RemoteProtocolError` khi server ngắt kết nối mà không trả response) làm fetcher dừng ngay, dù mọi request đều là `GET` nên gửi lại an toàn. Chỉ thay đổi hành vi retry của fetcher (Phase 3); không thay đổi contract của Phase 1, 2 và 4.

- **C-15 (duyệt): lỗi transport được retry.** Được retry (theo tên exception của `httpx`): `RemoteProtocolError`, `ReadError`, `WriteError`, `ConnectError` và `TimeoutException` (mọi loại timeout, gồm timeout 30 giây của C-10). **Không** retry: `LocalProtocolError`, `UnsupportedProtocol`, `DecodingError`, `TooManyRedirects` và mọi `HTTPError` khác không nằm trong danh sách trên; các lỗi này dừng ngay với lỗi, không ghi file.
- **Không có response thì không có `Retry-After`:** thời gian chờ trước lần retry thứ `n` chỉ là `5 × 2^(n-1)` giây (5, 10, 20, 40, 80).
- **Chung một cap:** tối đa 5 retry cho một request, tính chung cho mọi nguyên nhân (429, 5xx, maxlag, lỗi transport), tức tối đa 6 lần thử. Hết cap → dừng với lỗi, không ghi file (C-9, không đổi).
- **Retry gửi lại đúng request:** cùng URL, cùng tham số (gồm `maxlag=5` và, khi đang phân trang, đúng object `continue` của lần lỗi). Lần thử lỗi không đóng góp dữ liệu; fetcher tiếp tục đúng continuation sau khi retry thành công.
- §0.4 (hàng C-15), §6.4 (mục "Lỗi và retry" và bullet timeout), §7.8 (FET-06, FET-15 sửa; thêm FET-21) cập nhật. §7.0 không đổi vì nhóm `FET-*` đã gồm mọi ID pha 3.
- **Không thay đổi:** C-10 (0,32 giây là mặc định và ngưỡng tối thiểu, concurrency 1, timeout 30 giây, tối đa 5 retry, công thức `max(Retry-After, 5 × 2^(n-1))`; mỗi lần thử, kể cả lần thử lại, vẫn là một request bắt đầu và chịu khoảng cách 0,32 giây), `maxlag=5`, cách xử lý `Retry-After` khi có response, C-9 (output transactional), C-13, mọi contract khác.

### v2.13 — Mở Phase 4 (frontend); chốt Q-12..Q-19

Quyết định nguồn: chủ project, 2026-09-19. Chỉ sửa SPEC.md: chưa có `frontend/`, chưa có code hay test của Phase 4. **Không thay đổi contract** của Phase 1–3 (`/api/*`, `/share`, `validate_path`, dữ liệu, fetcher).

- **Mở Phase 4** (§0.3): phạm vi gồm frontend, static mount + SPA fallback (§3.4) và Dockerfile (§6.6); test bắt buộc là FE-* và SPA-*.
- **Q-12 (chốt):** frontend dùng React + Vite + TypeScript, mã nguồn ở `frontend/` (ADR-014).
- **Q-13 (chốt):** test frontend dùng Vitest + Testing Library; không có test e2e trong trình duyệt ở phiên bản này (ADR-014, §7.9).
- **Q-14 (chốt):** vẽ đồ thị bằng Sigma.js + Graphology, chỉ dùng dữ liệu của `SearchResponse` (ADR-014).
- **Q-15 (chốt):** lịch sử tìm kiếm giữ tối đa **20 entry** (ADR-006, FE-02).
- **Q-16 (chốt):** test frontend gắn ID bằng thẻ `@spec FE-NN` trong tên test; phải có cơ chế kiểm tra đủ mọi FE-ID bắt buộc, đọc danh sách từ SPEC.md, và bộ test **thất bại** khi thiếu (§7.9). Coverage của FE-* do cơ chế này kiểm; coverage của SPA-* do `conftest.py` kiểm như các pha trước. Xem N-3.
- **Q-17 (chốt):** image Docker chạy với `DATA_DIR=/app/data`; dataset chính thức (ba file `graph.json`, `people.json`, `aliases.json`) được copy vào image lúc build; image không chạy fetcher và không gọi mạng (§6.6, ADR-012). Dockerfile không có test ID tự động ở v2.13.
- **Q-18 (chốt):** static mount `DIST_DIR` + SPA catch-all chỉ được đăng ký khi `enable_share=True`; `/api/*` không khớp route nào → 404, không trả `index.html`. §3.4 viết lại; thêm §7.10 với SPA-01..SPA-05 (test pytest, dùng fixture `dist/`).
- **Q-19 (chốt):** mọi nơi frontend hiển thị `PersonMeta` phải xử lý `thumbnail = null` bằng placeholder; thêm FE-06.
- **Bảng §7:** §7.0 thêm hàng SPA-* ở pha 4; FE-02 sửa (giới hạn 20); FE-05 làm rõ phải có bản build; thêm FE-06; §7.9 thêm quy tắc marker/coverage; thêm §7.10.
- **Ghi chú kỹ thuật mới (không phải quyết định):** N-3 (`conftest.py` phải loại FE-* khỏi coverage pytest khi pha 4 được đưa vào), N-4 (nội dung entry lịch sử và xử lý entry trùng chưa quy định). §9 cập nhật.
- Không thay đổi: Q-1..Q-11, C-1..C-14, ADR-001..ADR-013 (ADR-006 và ADR-012 chỉ được bổ sung), G/P/A/S/R/F/N invariants.

### v2.12 — Duyệt C-8 (alias == target bị bỏ), duyệt C-14 (aliases.json sắp xếp ổn định), chốt Q-11 (thumbnail giữ nguyên)

Quyết định nguồn: chủ project, 2026-09-19, sau smoke test với MediaWiki thật. Chưa chạy dataset lớn; pilot 100–200 seed đo trước. Không mở Phase 4.

- **C-8 (duyệt, sửa nội dung):** `alias == target` (so sánh chính xác sau NFC) **không phải lỗi dữ liệu**. Fetcher **bỏ** entry như vậy, không ghi vào `aliases.json`; loader không coi nó là lỗi (nên A-5 "không có entry `alias == target`" **bị bỏ**). Không đổi canonical identity. Lý do: jawiki có redirect mang tên tiếng Anh trỏ về bài (ví dụ `Albert Einstein` → bài Einstein), nên entry này xuất hiện trong dữ liệu thật; resolver vốn ưu tiên canonical chính xác (§4A.3 bước 1) nên entry đó dư thừa. §0.4, §6.3 (A-5), §6.4 (mục "Dữ liệu"), §6.5, §7.0, DAT-14, FET-07, FET-14 cập nhật; thêm FET-20.
- **C-14 (tách từ C-8, duyệt):** `aliases.json` phải được sắp xếp **ổn định** theo `(alias, target, source)` (so sánh chuỗi của Python, A-7). Bốn hệ quả: (1) fetcher ghi mảng đã sắp xếp và kết quả không phụ thuộc thứ tự hay cách phân trang/continuation của API (hai lần chạy trên cùng dữ liệu cho `aliases.json` giống hệt từng byte); (2) loader kiểm A-7 lúc khởi động và **fail** nếu mảng không sắp xếp (như G-5 cho adjacency), sau A-4 trong thứ tự kiểm; (3) DAT-15 trở thành ID bắt buộc, chỉ phần A-7 được test (phần A-6 vẫn chờ C-7, đưa vào bảng "một phần" ở §7.0); (4) FET-07 và FET-14 kiểm thêm A-7, FET-07 kiểm thêm tính ổn định. Chủ project chỉ duyệt phần sắp xếp; G-6/A-6 (C-7) vẫn chưa duyệt.
- **Q-11 (chốt):** `thumbnail` trong `people.json` là URL do MediaWiki API trả về, **giữ nguyên**: không cắt `utm_*` hay bất kỳ query string nào, không tự sửa kích thước trong URL. Phase 2 chỉ `html.escape` khi chèn vào `og:image` (§5.4). FET-05 mở rộng; thêm ca test SHR-08 cho `og:image` có `&`.
- Không thay đổi: `/api/*`, `validate_path`, C-1..C-7, C-9..C-13, Q-1..Q-10, G-6/A-6 (C-7).

### v2.11 — C-10: 0,32 giây là ngưỡng tối thiểu cho phép

Quyết định nguồn: chủ project, 2026-09-19. Wikimedia giới hạn client không xác thực có User-Agent hợp lệ ở 200 request/phút; 0,32 giây tương đương tối đa 187,5 request/phút và tạo margin an toàn. Chưa gọi MediaWiki thật, chưa có dữ liệu thật, chưa mở Phase 4.

- **C-10 (chốt ngưỡng):** khoảng cách tối thiểu giữa hai lần bắt đầu request có **mặc định 0,32 giây** và **ngưỡng tối thiểu cho phép cũng là 0,32 giây**: mọi cấu hình **nhỏ hơn 0,32 giây bị từ chối** khi khởi động fetcher; đúng 0,32 giây và các giá trị lớn hơn được chấp nhận. Thay ngưỡng cũ "không được đặt ≤ 0,2 giây" (đã ghi ở v2.10 là để nguyên, nay được thay thế). Concurrency vẫn cố định 1.
- **FET-17 (sửa):** cấu hình khoảng cách < 0,32 giây bị từ chối (gồm 0,31, 0,3, 0,25, 0,2, 0 và số âm); 0,32 giây được chấp nhận.
- §0.4 (hàng C-10) và §6.4 (bullet "Dưới giới hạn của Wikimedia") cập nhật. Không đổi: timeout 30 giây, tối đa 5 retry, công thức chờ `max(Retry-After, 5 × 2^(n-1) giây)`, `maxlag=5`, cách xử lý `Retry-After`, FET-15, FET-16.
- Lịch sử (changelog v2.1, v2.10) giữ nguyên nội dung cũ.

### v2.10 — C-10: khoảng cách tối thiểu giữa hai lần bắt đầu request 0,32 giây

Quyết định nguồn: chủ project, 2026-09-19, sau kết quả đối chiếu chính sách Wikimedia ở v2.9. Wikimedia hiện giới hạn client không xác thực có User-Agent hợp lệ ở **200 request/phút** (trang Wikimedia APIs/Rate limits, áp dụng từ 2026, có thể thay đổi). Khoảng cách 0,25 giây cho phép tới 240 request/phút nên không còn phù hợp; 0,32 giây cho tối đa 187,5 request/phút, tạo margin dưới giới hạn. Chưa gọi MediaWiki thật và chưa có dữ liệu thật ở bước này.

- **C-10 (sửa):** khoảng cách tối thiểu giữa hai lần bắt đầu request là **0,32 giây** (trước đây 0,25 giây). Không đổi: concurrency = 1 (Q-4, C-11), timeout 30 giây, tối đa 5 retry, công thức chờ `max(Retry-After, 5 × 2^(n-1) giây)`, `maxlag=5`, cách xử lý `Retry-After`.
- §0.4 (hàng C-10), §6.4 (ghi chú v2.2, bullet "Tốc độ và concurrency", nguồn tham chiếu) và FET-16 cập nhật số 0,25 → 0,32. FET-15 không nhắc khoảng cách này (nó kiểm công thức chờ retry) nên không đổi.
- **Không đổi:** ngưỡng từ chối cấu hình "không được đặt ≤ 0,2 giây" (FET-17). Lưu ý cho chủ project: ngưỡng này vẫn thấp hơn 0,3 giây, tức một cấu hình thủ công trong khoảng (0,2; 0,3) sẽ vượt 200 request/phút; chưa được yêu cầu thay đổi nên giữ nguyên.
- Lịch sử (changelog v2.1, v2.9) giữ nguyên nội dung cũ.

### v2.9 — Mở Phase 3 (fetcher)

Quyết định nguồn: chủ project, 2026-09-19. Chỉ đổi trạng thái pha; **không thay đổi contract** của Phase 1/2 hay của §6.4; không mở Phase 4.

- **§0.3:** hàng pha 3 chuyển từ "Chưa mở; chờ chủ project mở pha" sang "**Được phép bắt đầu** *(v2.9)*". Test bắt buộc của pha 3 là toàn bộ `FET-*` (FET-01..FET-19); không có ID nào phụ thuộc điểm chưa duyệt (C-6, C-9 đã duyệt; FET-07/FET-14 chỉ kiểm phần đã duyệt).
- Quy tắc §0.2 áp dụng: test viết trước hoặc cùng commit với code; fixture là response MediaWiki ghi sẵn, mock HTTP client, không gọi mạng; không gọi MediaWiki API trước khi có test/mock phù hợp.
- Việc đối chiếu chính sách Wikimedia hiện hành (§0.3, bullet cuối) do người implement thực hiện khi bắt đầu pha 3; kết quả đối chiếu (nếu khác §6.4) phải được đưa lên chủ project quyết định, không tự đổi SPEC.
- **Kết quả đối chiếu ngày 2026-09-19** (chỉ đọc trang tài liệu, không gọi Action API; nội dung lấy qua công cụ tóm tắt trang, chưa kiểm bằng bản gốc): Robot policy (sửa lần cuối 2026-03-16), API:Etiquette, Manual:Maxlag_parameter, User-Agent Policy **khớp** §6.4 (concurrency 1 và dưới 5 request/giây; gửi tuần tự; gộp tiêu đề bằng `|`; gzip; định dạng User-Agent với thông tin liên hệ; `maxlag=5`, lỗi maxlag trả HTTP 200 với `error.code == "maxlag"`, chờ ít nhất 5 giây; tôn trọng `Retry-After` khi 429). **Một điểm khác cần chủ project quyết định:** trang Wikimedia APIs/Rate limits (áp dụng từ 2026, "subject to experimentation and change") ghi bot không xác thực có User-Agent hợp lệ bị giới hạn **200 request/phút** (khoảng 3,3 request/giây), trong khi khoảng cách tối thiểu 0,25 giây của C-10 cho phép tới 240 request/phút. Chưa đổi gì trong SPEC hay code; fetcher xử lý 429 theo `Retry-After` nên không hỏng, nhưng có thể bị 429 thường xuyên nếu server trả lời nhanh hơn 0,25 giây/request.

### v2.8 — Làm rõ C-9: transactional output của fetcher; thêm FET-19

Quyết định nguồn: chủ project, 2026-09-19 (trước khi mở Phase 3). Chỉ làm rõ C-9 (đã duyệt ở v2.7) và thêm một test; mọi điểm khác giữ nguyên. **Không mở Phase 3**: chưa có `fetcher.py`, `data/` hay test FET. Không có thay đổi code hay test trong v2.8.

- **C-9 (làm rõ) — output transactional ở mức dataset (ba file):**
  1. Fetch và validate toàn bộ `graph.json`, `people.json`, `aliases.json` trước khi commit output.
  2. Output được ghi vào staging/tạm trước; không ghi trực tiếp lên các file `data/` hiện tại.
  3. Chỉ sau khi cả ba file đã được ghi thành công và validate thành công mới thay thế dataset hiện tại.
  4. Nếu một bước ghi hoặc thay thế thất bại trong khi fetcher đang chạy bình thường: rollback hoặc giữ nguyên dataset cũ; fetcher không chủ động để lại trạng thái partial hoặc lẫn mới/cũ.
  5. **Ngoài guarantee:** crash hoặc mất điện đúng giữa các thao tác thay thế nhiều file không thuộc guarantee của C-9. Không xây generation/manifest system hay database chỉ để giải quyết crash consistency.
  - Vị trí staging, module validator và cơ chế thay thế cụ thể **không** thuộc contract. §0.4 và §6.4 (mục "Dữ liệu") cập nhật; §8 thêm mục out of scope tương ứng.
- **FET-19 (mới):** lỗi ghi/thay thế được inject ở file thứ hai (không cần mạng) → dataset cũ nguyên vẹn, không có output partial nào được coi là dataset mới. §7.8 cập nhật; §7.0 không đổi vì nhóm `FET-*` đã gồm mọi ID pha 3.
- Không thay đổi `/api/*`, `/share`, Q-1..Q-10, các C-* khác, FET-01..FET-18, `validate_path`.

### v2.7 — Duyệt C-6, C-9; sửa FET-07/FET-14; Phase 3 vẫn chưa mở

Quyết định nguồn: chủ project, 2026-09-19 (sau review Archify của hai diagram Phase 3). Chỉ các điểm dưới đây thay đổi; mọi điểm khác giữ nguyên trạng thái. **Không mở Phase 3**: chưa có `fetcher.py`, `data/` hay test FET; §0.3 giữ "Chưa mở; chờ chủ project mở pha". Không có thay đổi code hay test trong v2.7.

- **C-6 (duyệt):** giữ nguyên behavior đã mô tả ở §6.4 bước 5: langlink trỏ tới redirect trên jawiki thì `ja_title` là bài đích sau khi resolve, tiêu đề langlink gốc thành `ja_redirect`. §0.4 và §6.4 bước 5 cập nhật trạng thái. FET-11 giờ là test bắt buộc của pha 3.
- **C-9 (duyệt):** fetcher validate output theo §6.5 trước khi ghi đè. Validator fail → **không ghi file output nào**, dữ liệu cũ giữ nguyên; `data/` không bao giờ ở trạng thái partial hoặc lẫn giữa dữ liệu mới và cũ. §0.4 và §6.4 (mục "Dữ liệu") cập nhật. Việc fetcher dùng module validator nào và cách hiện thực (ví dụ cách thay thế file) **không** thuộc contract; SPEC chỉ yêu cầu output phải pass §6.5 trước khi ghi.
- **FET-07 (sửa):** chỉ kiểm G-1..G-5, P-1..P-3, A-1..A-4. Bỏ G-6 (C-7 chưa duyệt) và bỏ cụm "chạy chung validator", vì SPEC không quy định module.
- **FET-14 (sửa):** chỉ kiểm A-1..A-4 (bỏ A-5..A-7, C-7/C-8 chưa duyệt), giữ các yêu cầu request-policy đã duyệt ở §6.4, và thay điều kiện cũ "validator fail thì không ghi đè file cũ" bằng điều kiện C-9 mới ("không ghi file output nào; dữ liệu cũ nguyên vẹn").
- G-6, A-5, A-6, A-7 (C-7, C-8) **vẫn chưa duyệt** và không được test cho tới khi được duyệt; §6.5 không đổi.
- Không thay đổi `/api/*`, `/share`, Q-1..Q-10, C-1..C-5, C-7, C-8, C-10..C-13, `validate_path`.

### v2.6 — `n` trong `og:title`; `DIST_DIR`; nợ kỹ thuật của test harness

Quyết định nguồn: chủ project, 2026-09-19 (sau khi implement Phase 2 adjustment của v2.5). Hai quyết định mới nhận số Q-9 và Q-10 (tiếp theo Q-8). Chỉ hai điểm này được chốt; mọi điểm khác giữ nguyên trạng thái. **Không thay đổi hành vi**: implementation hiện tại (`OG_TITLE_FORMAT.format(..., n=len(names) - 1)`; `create_app` chỉ đọc `DIST_DIR` khi `enable_share=True`) đã đúng với cả hai quyết định, nên không có thay đổi code hay test trong v2.6. Không mở pha 3/4.

- **Q-9 (chốt) — `n` trong `og:title`:** `n` = số cạnh của path = `len(path) - 1` = `SearchResponse.length`; **không** phải số node. Ví dụ path `A → B → C` có `n = 2`. Format vẫn nằm trong một hằng số duy nhất (`OG_TITLE_FORMAT`). §5.4 và SHR-01 (§7.6) cập nhật.
- **Q-10 (chốt) — `DIST_DIR`:** cấu hình runtime chính thức của server. Biến môi trường `DIST_DIR`, mặc định `./dist`. Chỉ được đọc khi `enable_share=True`; `DIST_DIR/index.html` là template runtime của `/share`. Khi `enable_share=False` không đọc `DIST_DIR` và không yêu cầu thư mục `dist/`. `DIST_DIR` là cấu hình của server, không thuộc dữ liệu (§6) hay contract của frontend. §0.3 và §5.5 cập nhật.
- **§9:** thêm ghi chú kỹ thuật N-2 (nợ kỹ thuật riêng, không phải quyết định mở): guard chặn network của `backend/tests/conftest.py` chặn mọi kết nối không phải `AF_UNIX`, trong khi trên Windows asyncio dùng loopback TCP cho event loop nội bộ, nên `TestClient` không chạy được nếu không có shim ngoài repo. **Không sửa `conftest.py` hay network guard trong v2.6**; sẽ xử lý bằng một commit riêng sau này.
- Không thay đổi `/api/*`, C-1..C-13, Q-1..Q-8, `validate_path`, danh sách test ID.

### v2.5 — Chế độ `/share` tường minh; chốt Q-3; hợp đồng `og:url`, `index.html`, placeholder

Quyết định nguồn: chủ project, 2026-09-19 (sau review `archify-review` của Phase 2). Các quyết định phát sinh từ review được đánh số Q-5..Q-8 (không dùng "A-*" vì trùng tên invariant alias §6.3). Chỉ các điểm dưới đây được chốt; mọi điểm khác giữ nguyên trạng thái. Không mở pha 3/4.

- **Q-5 (chốt) — chế độ `/share` tường minh:** việc `/share` có mặt hay không do cấu hình tường minh quyết định, **không** được suy ra từ việc `dist/index.html` có tồn tại hay không. Chế độ Phase 1: `/share` bị tắt tường minh, app không cần `dist/`. Chế độ Phase 2+: `/share` được bật (chế độ mặc định của app từ Phase 2), `dist/index.html` bắt buộc tồn tại và hợp lệ; thiếu hoặc không hợp lệ → app không khởi động (fail fast). Không bao giờ bỏ route một cách âm thầm. Test pha 1 phải tắt `/share` tường minh. Cấu hình là tham số `enable_share` của app factory (`False` ở chế độ Phase 1/test, mặc định `True`).
  - **§0.3:** thêm định nghĩa "Chế độ chạy của app"; sửa câu "Pha 1 không phụ thuộc `dist/`" thành áp dụng cho chế độ Phase 1; cập nhật hàng pha 2 (thêm DAT-17, DAT-18).
  - **§5.4:** "luôn 200 `text/html`, cho mọi input" áp dụng khi `/share` được bật; khi bị tắt (chế độ Phase 1) không có route `/share`.
  - **§6.5:** viết lại đoạn kiểm tra `dist/index.html` theo hai chế độ.
- **Q-3 (chốt):** ngôn ngữ của `og:title` / UI ở phiên bản hiện tại là **tiếng Việt**. Format `"{first} → {last}: {n} bước"` giữ trong một hằng số duy nhất. §5.4, §0.3 (hàng pha 4), §9 cập nhật; Q-3 chuyển xuống "Đã chốt".
- **Q-6 (chốt) — `og:url`:** dùng base URL của request hiện tại, gồm scheme, host và `root_path` nếu request có; path `/share` và query dựng lại từ canonical name đã validate; không echo query thô. **Không** thêm biến cấu hình `PUBLIC_BASE_URL` ở phiên bản này (thêm vào §8). §5.4 cập nhật.
- **Q-7 (chốt) — không trùng OG tag:** `frontend/index.html` (và `dist/index.html`) **không** chứa static `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`; năm property này chỉ do `/share` tạo cho path hợp lệ, tại vị trí placeholder. Hệ quả cho "OG meta mặc định" (định nghĩa ở v2.4): các meta tĩnh còn lại của `index.html`, không gồm năm property trên. §5.4, §5.5 cập nhật; thêm FE-05. Server không kiểm tra Q-7 lúc khởi động (yêu cầu đối với frontend).
- **Q-8 (chốt) — placeholder:** `<!--OG-->` phải xuất hiện đúng một lần và nằm trong `<head>`; thiếu, thừa hoặc nằm ngoài `<head>` → fail fast khi `/share` được bật. "Trong `<head>`": vị trí nằm giữa thẻ mở `<head ...>` và thẻ đóng `</head>`, tên thẻ không phân biệt hoa/thường, không cần parser HTML đầy đủ. §5.5, §6.5 cập nhật. Thay đổi so với v2.4: v2.4 chỉ yêu cầu server kiểm tra "có placeholder" và chưa yêu cầu vị trí trong `<head>`.
- **§7:** DAT-08 mở rộng (thiếu/thừa/ngoài `<head>`); thêm DAT-17 (bật `/share` nhưng thiếu `dist/index.html`), DAT-18 (tắt `/share` tường minh, không có `dist/`), SHR-14 (`og:url` dùng base URL của request, gồm `root_path` nếu có), FE-05 (`index.html` của frontend đúng contract). §7.0: hàng pha 2 thêm DAT-17, DAT-18.
- **§8:** thêm "biến cấu hình origin công khai (`PUBLIC_BASE_URL`)" vào out of scope.
- Không thay đổi `/api/*`, C-1..C-13, Q-1, Q-2, Q-4; không đổi contract `validate_path`.

### v2.4 — Chốt Q-2: `/share` luôn 200 HTML; định nghĩa "OG meta mặc định"

Quyết định nguồn: chủ project, 2026-09-19. Chỉ Q-2 được chốt; mọi điểm khác giữ nguyên trạng thái.

- **Q-2 (chốt):** `GET /share` luôn trả HTTP `200` với `text/html` cho mọi input. Không bao giờ trả JSON 422/404 từ `/share`. Pha 2 được mở.
- **§5.4 (sửa):** path hợp lệ → `<!--OG-->` được thay bằng bộ OG meta dựng từ canonical path đã validate. Path không hợp lệ → `<!--OG-->` được thay bằng **chuỗi rỗng**; server **không** chèn bộ OG mặc định riêng. "OG meta mặc định của site" được định nghĩa chính thức là **các meta tag tĩnh đã có sẵn trong `dist/index.html`**. Không thêm hằng số text mới, nên hành vi này **không phụ thuộc Q-3**.
- **§0.3:** pha 2 chuyển từ "**Chặn** cho tới khi Q-2 được chốt" sang "**Được phép bắt đầu**".
- **§0.4:** Q-2 chuyển từ "**OPEN** — chặn pha 2" sang "Đã chốt (v2.4)".
- **§5.3:** bỏ ghi chú "hành vi khi không hợp lệ phụ thuộc Q-2".
- **§7.0:** nhóm `SHR-*, PTH-11, DAT-08` bỏ chú thích "(chặn bởi Q-2)".
- **§7.6:** SHR-01 ghi rõ status 200. SHR-03, SHR-04 ghi rõ kỳ vọng của OG mặc định. SHR-05..07 đổi từ "bị từ chối theo Q-2" sang "200 `text/html`, OG mặc định". **Thêm SHR-13:** `/share` không có `p` → 200, OG mặc định (đối xứng với PTH-08). PTH-11 cập nhật danh sách input dùng chung.
- **§9:** Q-2 chuyển xuống mục "Đã chốt". **Q-3 vẫn OPEN.**
- Không thay đổi `/api/path` (C-12 giữ nguyên: 200 `{"valid": false, "path": []}`), không thay đổi C-3, C-4, C-6..C-9, không mở pha 3/4.

### v2.3 — Chỉ điểm "Đã duyệt" mới được implement và bắt buộc test

Quyết định nguồn: chủ project, 2026-09-18 (sau báo cáo Phase 1). Không điểm "Chưa duyệt" nào được duyệt ngược; contract được sửa cho khớp với phạm vi đã duyệt.

- **§0.4 (sửa nguyên tắc):** "Đã duyệt" + thuộc pha hiện tại → phải implement và phải có test. "Chưa duyệt"/"OPEN" → không implement, không bắt buộc test. Không được thay đổi behavior chỉ để có đủ test ID của một điểm chưa duyệt. Bỏ câu cũ "Chưa duyệt … được implement như đã viết".
- **§0.4 bảng:** C-2 ghi rõ không có behavior riêng (behavior tương ứng đến từ D-5, đã duyệt). C-4 ghi rõ phạm vi: cận trên 255 ký tự cho `from`/`to`/`q` và cận dưới 1 ký tự cho `q`; yêu cầu `from`/`to` không rỗng có từ v1 và không thuộc C-4.
- **§3.2 `/api/search`:** bỏ cận trên 255 ký tự (C-4) và quy tắc input chỉ gồm khoảng trắng (C-3) khỏi contract; ghi rõ hai trường hợp này **chưa được quy định**. Contract còn lại: thiếu hoặc rỗng → 422.
- **§3.6 `/api/resolve`:** contract chỉ còn "thiếu `q` → 422". `q=""` và `q` dài hơn 255 ký tự **chưa được quy định** (C-4); behavior hiện tại của code ở hai trường hợp này không phải contract.
- **§5.3:** chữ ký đổi thành `validate_path(names, edges)`.
- **§6.1, §6.3, §6.5:** G-6, A-5, A-6, A-7 đánh dấu "chưa duyệt — không kiểm tra ở pha 1".
- **§7.0:** định nghĩa lại coverage bắt buộc của pha = (ID thuộc pha) ∩ (ID gắn với requirement đã duyệt). Thêm bảng "Test ID phụ thuộc điểm chưa duyệt" (dạng máy đọc được; `conftest.py` đọc trực tiếp bảng này).
- **§7.4 SCH-08:** OpenAPI có thể chứa response 422 do FastAPI tự sinh; điều đó không làm thay đổi runtime contract của `/api/path`.
- **§7.5:** API-08 ghi rõ phần "dài 256 ký tự" phụ thuộc C-4; API-17 phụ thuộc C-3. **Thêm API-21:** `GET /api/resolve` thiếu `q` → 422 (behavior đã duyệt ở §3.6 nhưng trước đây chưa có test ID).
- **§7.7:** DAT-14 ghi rõ phần A-5 phụ thuộc C-8; DAT-10, DAT-15 phụ thuộc C-7/C-8.
- **§9:** thêm mục "Ghi chú kỹ thuật cần review" (cảnh báo deprecation của Starlette `TestClient` + `httpx`); không đổi dependency ở pha 1.

### v2.2 — Duyệt C-10..C-13, phân pha implementation, quy tắc test-first

Quyết định nguồn: review của chủ project ngày 2026-09-18.

- **C-10, C-11, C-12, C-13:** đã duyệt. §6.4 ghi rõ các con số của fetcher là **policy nội bộ**, không phải giá trị Wikimedia bắt buộc.
- **Bảng trạng thái quyết định (mới, §0.4):** liệt kê mọi điểm C-1..C-13 và Q-1..Q-4 với trạng thái "Đã duyệt", "Chưa duyệt" hoặc "OPEN". Chỉ trạng thái trong bảng này có hiệu lực.
- **§0 viết lại:** SPEC.md là nguồn sự thật duy nhất (§0.1); test contract viết trước hoặc cùng lúc với implementation, mỗi test gắn ID của §7 (§0.2); phân pha implementation (§0.3).
- **§6.5:** kiểm tra placeholder `<!--OG-->` tách thành một kiểm tra riêng, chỉ bật từ pha có `/share`. Pha 1 không cần `dist/`. DAT-08 chuyển sang pha `/share`.
- **§7:** thêm cột "Pha" cho từng nhóm test (§7.0). PTH-11 vẫn là yêu cầu bắt buộc, được viết cùng lúc với `/share`.
- Sửa mô tả C-10 trong changelog v2.1 cho khớp công thức ở §6.4.
- **§5.3:** `validate_path` đặt trong `backend/app/paths.py` (thay cho `share.py`) để code pha 1 không nằm trong module của route pha 2; nêu rõ hai route có representation riêng.

### v2.1 — Chốt Q-1, Q-4, C-1, C-5

Quyết định nguồn: review của chủ project ngày 2026-09-18, và đối chiếu tài liệu Wikimedia hiện hành (xem §6.4 "Nguồn tham chiếu").

- **C-1 (duyệt):** §4A.3 viết lại theo đúng thứ tự 5 bước đã chốt; nêu rõ exact canonical luôn thắng, và mơ hồ ở tầng canonical dừng ngay, không xét alias. Thêm R-7: kết quả không phụ thuộc thứ tự key trong dict hay thứ tự entry trong file. Thêm test RES-20.
- **C-5 (duyệt):** `/api/resolve` luôn 200; `/api/search` mới chuyển `unresolved`/`ambiguous` thành 404. Nội dung §3.6 không đổi.
- **Q-1 (chốt):** thêm `GET /api/path` (§3.7) và schema `PathResponse` (§2). Tách hàm `validate_path` dùng chung cho `/api/path` và `/share` (§5.3). Viết lại §5.6. Thêm test PTH-01..11, SCH-08, FE-04.
- **Q-4 (chốt):** fetcher chạy tuần tự (concurrency = 1), không có tùy chọn song song. §6.4 viết lại phần gọi API theo tài liệu Wikimedia hiện hành: giới hạn tốc độ dưới 5 request/giây, `maxlag=5`, lỗi maxlag trả về HTTP 200 nên phải đọc trong body, tôn trọng `Retry-After`, User-Agent có thông tin liên hệ của người vận hành, `Accept-Encoding: gzip`, chỉ dùng GET. Thay FET-06, FET-14; thêm FET-15..18.
- **§0, ADR-007:** cập nhật thứ tự làm việc và tham chiếu `/api/path`.
- **§8:** thêm "fetcher chạy song song" và "xác thực (bot password/OAuth) cho fetcher" vào out of scope.
- **§9:** Q-1 và Q-4 chuyển sang "Đã chốt". Q-2, Q-3 vẫn mở.

#### Chi tiết do Claude bổ sung ở v2.1 (trạng thái: xem §0.4)
- **C-10 (§6.4):** các giá trị mặc định của fetcher: khoảng cách tối thiểu giữa hai lần bắt đầu request 0,25 giây (tối đa 4 request/giây, dưới ngưỡng 5); timeout 30 giây/request; tối đa 5 lần retry; thời gian chờ trước lần retry thứ n = `max(Retry-After, 5 × 2^(n-1) giây)`.
- **C-11 (§6.4):** bỏ `asyncio` + `Semaphore` khỏi fetcher. Vì concurrency cố định là 1, dùng `httpx.Client` đồng bộ trong một vòng lặp là đủ và đơn giản hơn.
- **C-12 (§3.7):** `/api/path` không bao giờ trả 422: mọi input không hợp lệ (kể cả thiếu `p`, sai số lượng, quá dài) đều là 200 `valid=false`. Lý do: để `/api/path` và `/share` luôn đưa ra cùng một phán quyết từ cùng một hàm, và không phụ thuộc cách FastAPI diễn giải ràng buộc trên `list[str]`.
- **C-13 (§6.4):** fetcher từ chối chạy nếu chưa cấu hình thông tin liên hệ cho User-Agent (biến môi trường), thay vì dùng một giá trị mặc định.

### v2 — Multilingual name input (tiếng Anh + tiếng Nhật)

Quyết định nguồn: D-1..D-9 (review ngày 2026-09-18).

- **ADR-009 (sửa):** fetcher tính trước cả alias. Production runtime không gọi Wikipedia API trong bất kỳ trường hợp nào.
- **ADR-010 (sửa):** tách *identity* (canonical name, NFC) và *match key* (NFKC + chuẩn hóa khoảng trắng). Input của user không phải identity. `_` và dấu cách là khác nhau ở tầng application.
- **ADR-013 (mới):** resolver đa ngôn ngữ theo hướng precompute-first. Graph vẫn chỉ là English Wikipedia.
- **§2 Schema:** `ErrorDetail` thay đổi không tương thích ngược (`UNKNOWN_PERSON` bị bỏ; thêm `UNRESOLVED_NAME`, `AMBIGUOUS_NAME`, `param`, `input`, `candidates`). Thêm `ResolveResponse`.
- **§3.2 `/api/search`:** `from`/`to` nhận input tiếng Anh, tiếng Nhật hoặc alias; response trả canonical name đã resolve; bảng lỗi mới; thêm giới hạn độ dài 255 ký tự cho `from`/`to`.
- **§3.6 `/api/resolve` (mới).**
- **§4A Name resolver (mới).**
- **§5 Share URL:** thêm invariant: `p` chỉ nhận canonical name chính xác, không đi qua resolver.
- **§6.1 / §6.2:** thêm invariant không có ký tự `_` trong canonical name (G-6).
- **§6.3 `aliases.json` (mới).** Đánh số lại: fetcher thành §6.4, startup validation thành §6.5.
- **§6.4 Fetcher:** thêm bước lấy `langlinks` (ja), en redirect, ja redirect; quy tắc throttling/User-Agent/timeout cụ thể hơn.
- **§6.5 Startup validation:** thêm kiểm tra `aliases.json`.
- **§7 Test:** thêm nhóm RES, cập nhật API-05..07 và API-12, thêm API-13..20, SHR-11..12, DAT-10..16, FET-08..14, FE-03.
- **§8 Out of scope:** nêu rõ những gì không làm cho multilingual.
- **§9 Open questions:** thêm Q-4 (mức concurrency mặc định của fetcher).
- **Sửa nhỏ để nhất quán:** §0 (thêm các mục không implement, thêm quy tắc đối chiếu chính sách Wikimedia), ADR-004 (thêm `aliases.json`), §2 (quy định thứ tự `candidates`), §3.1 (không chứa alias), §4.1 (BFS không nhận input chưa qua resolver), §5.1 (không chứa alias/input gốc).

#### Chi tiết do Claude bổ sung khi viết spec (trạng thái: xem §0.4)
Các điểm sau không nằm trong D-1..D-9; được thêm để spec không còn chỗ mơ hồ khi implement.
- **C-1 (§4A.3; bước 3 ở v2, bước 2 theo đánh số v2.1) — đã duyệt ở v2.1:** canonical name cũng được tra theo match key (trước alias). Nếu không có bước này, `安倍　晋三` resolve được qua alias nhưng `Shinzo  Abe` (hai dấu cách) lại không, dù cả hai chỉ khác nhau về khoảng trắng.
- **C-2 (§4A.2):** làm rõ hệ quả của D-5: match key không xóa khoảng trắng, nên `安倍　晋三` chỉ resolve được khi dữ liệu có alias `安倍 晋三` (thường là `ja_redirect`); nó không tự khớp với `安倍晋三`.
- **C-3 (§3.2):** input chỉ gồm khoảng trắng → 404 `UNRESOLVED_NAME` (không phải 422), vì nó qua được ràng buộc độ dài.
- **C-4 (§3.2, §3.6):** giới hạn độ dài 1..255 ký tự cho `from`, `to`, `q`, cùng giới hạn với `p` của share.
- **C-5 (§3.6) — đã duyệt ở v2.1:** `/api/resolve` luôn trả 200 cho mọi trạng thái resolve; 404 chỉ dùng ở `/api/search`.
- **C-6 (§6.4 bước 5):** khi langlink trỏ tới một redirect trên jawiki, `ja_title` là bài đích; tiêu đề langlink gốc thành `ja_redirect`.
- **C-7 (G-6, A-6):** không canonical name hay alias nào được chứa `_`; biến D-6 thành invariant kiểm tra được ở tầng dữ liệu.
- **C-8 (A-5, A-7):** alias trùng chính target bị coi là lỗi dữ liệu; mảng alias phải được sắp xếp.
- **C-9 (§6.4):** fetcher chạy validator trên output và không ghi đè file cũ nếu validator fail.

Trạng thái hiện hành của từng điểm: xem §0.4.

### v1
Bản đầu tiên.

---

## 0. Hướng dẫn cho Claude Code *(viết lại ở v2.2)*

### 0.1 Nguồn sự thật duy nhất
- **SPEC.md là nguồn sự thật duy nhất** cho hành vi, contract và test. Nội dung hội thoại, file review hay ghi chú bên ngoài không phải spec; nếu chúng khác SPEC.md thì SPEC.md thắng.
- Không tạo spec phụ, README mô tả contract, hay tài liệu thiết kế song song. Mọi thay đổi contract phải được sửa **trong SPEC.md trước**, kèm một mục changelog, rồi mới sửa code và test.
- Khi code và spec mâu thuẫn, spec thắng. Khi spec mơ hồ, thiếu, hoặc một điểm ở trạng thái "Chưa duyệt"/"OPEN" cần được quyết định để code tiếp: **dừng và hỏi**, không tự suy diễn.

### 0.2 Test-first
- Mỗi test contract trong §7 thuộc pha đang làm phải được viết **trước hoặc cùng commit** với code mà nó kiểm tra. Không có code nào của một pha được coi là xong khi test tương ứng chưa có và chưa pass.
- Mỗi test gắn ID của §7 bằng marker `@pytest.mark.spec("BFS-01")` (một test có thể mang nhiều ID; một ID có thể có nhiều test). Đăng ký marker `spec` trong cấu hình pytest để marker lạ bị báo lỗi. *(v2.13, Q-16)* Test frontend (Vitest) gắn ID bằng thẻ `@spec FE-NN` trong tên test, với cơ chế kiểm tra riêng ở §7.9.
- Invariant trong spec (I-*, F-*, N-*, S-*, R-*, G-*, P-*, A-*) được kiểm tra thông qua các test ID tương ứng ở §7.
- Test dùng fixture tự viết trong `backend/tests/fixtures/`, không dùng dữ liệu thật và không gọi mạng. Test phải chặn network (mọi kết nối ra ngoài làm test fail).
- Kiểm tra version thực tế của FastAPI và Pydantic sau khi cài, rồi pin trong `pyproject.toml`. Mọi hành vi phụ thuộc version (alias `from`, ràng buộc trên `list[str]`) phải được khóa bằng test, không dựa vào trí nhớ.

### 0.3 Phân pha implementation
| Pha | Phạm vi | Test phải có | Trạng thái |
|---|---|---|---|
| 1 | data loader + startup validation (không gồm placeholder), BFS, resolver, `validate_path`, schema, `/api/people`, `/api/search`, `/api/resolve`, `/api/path` | BFS-*, RES-*, SCH-01..08, API-*, PTH-01..10, DAT-01..07, DAT-09..16 | **Hoàn thành** *(v2.15)* |
| 2 | `/share` (bật tường minh, §0.3 "Chế độ chạy"), kiểm tra `dist/index.html` và placeholder `<!--OG-->` lúc khởi động | SHR-*, PTH-11, DAT-08, DAT-17, DAT-18 | **Hoàn thành** *(v2.15; mở ở v2.4)* |
| 3 | fetcher (`backend/fetcher.py`) | FET-* | **Hoàn thành** *(v2.15; mở ở v2.9)* |
| 4 | frontend (`frontend/`, ADR-014), static mount + SPA fallback (§3.4), Dockerfile (§6.6) | FE-*, SPA-* | **Hoàn thành** *(v2.15; mở ở v2.13)*; Q-3: UI tiếng Anh (v2.16; trước đó tiếng Việt, v2.5); `og:title` vẫn tiếng Việt; Q-14: đồ thị 3D xoay được (v2.17; trước đó Sigma.js 2D, v2.13) |

- Không viết code của pha chưa mở, kể cả code "chuẩn bị sẵn".
- Pha 1 không phụ thuộc `dist/` hay frontend build: ở chế độ Phase 1 (bên dưới) app phải khởi động và chạy test được khi chưa có `dist/`.
- **Chế độ chạy của app** *(v2.5, Q-5)*: việc `/share` có mặt hay không do **cấu hình tường minh** quyết định, không bao giờ được suy ra từ việc `dist/index.html` có tồn tại hay không.
  - **Chế độ Phase 1:** `/share` bị **tắt** tường minh. App khởi động và chạy được khi chưa có `dist/`; không có route `/share`; không kiểm tra `dist/index.html` hay placeholder.
  - **Chế độ Phase 2+:** `/share` được **bật**; đây là chế độ mặc định của app từ Phase 2. `dist/index.html` bắt buộc phải tồn tại và hợp lệ (§5.5); thiếu hoặc không hợp lệ → app **không khởi động** (fail fast, §6.5). Không được bỏ route `/share` một cách âm thầm. *(v2.13, Q-18)* Từ Phase 4, chế độ này cũng đăng ký static mount của `DIST_DIR` và SPA catch-all (§3.4); không có cờ cấu hình riêng cho hai thứ đó.
  - Test của pha 1 phải tắt `/share` tường minh, để kết quả test không phụ thuộc vào môi trường của máy chạy test (thư mục làm việc, biến môi trường, có hay không có `dist/`).
  - Cấu hình bật/tắt là tham số tường minh `enable_share` của app factory (`create_app`): chế độ Phase 1 và test pha 1 dùng `enable_share=False`; mặc định `enable_share=True` (chế độ Phase 2+ / production). `enable_share` không bao giờ được suy ra từ việc `dist/index.html` có tồn tại hay không. Khi `enable_share=False`: không kiểm tra `dist/` và `/share` không được đăng ký. Đây không phải contract HTTP.
  - **`DIST_DIR`** *(v2.6, Q-10)*: cấu hình runtime của server cho vị trí thư mục `dist/`; biến môi trường `DIST_DIR`, mặc định `./dist`. Chỉ được đọc khi `enable_share=True`. Khi `enable_share=False` không đọc `DIST_DIR` và không yêu cầu có thư mục `dist/`. Xem §5.5.
- Không implement tính năng ngoài spec: không database, cache (kể cả cache in-process cho resolver), auth, WebSocket, task queue, image generation, runtime Wikipedia fallback. *(v2.16)* "autocomplete" được nới lỏng một phần: xem changelog v2.16 và §9 (Đã chốt) — chỉ cho phép combobox thuần client trên `/api/people` có sẵn, không backend/cache/endpoint mới.
- Chính sách sử dụng Wikimedia API phải được đối chiếu với tài liệu hiện hành khi bắt đầu pha 3.

### 0.4 Trạng thái quyết định
Chỉ bảng này quyết định một điểm đã có hiệu lực hay chưa. *(viết lại ở v2.3)*

**Nguyên tắc:**
1. **"Đã duyệt"/"Đã chốt" + thuộc pha hiện tại** → phải implement và phải có test (§7.0).
2. **"Chưa duyệt" hoặc "OPEN"** → **không implement** và **không bắt buộc test** ở pha hiện tại. Nội dung của điểm đó trong spec chỉ là đề xuất, chưa phải contract.
3. **Không được thay đổi behavior** chỉ để có đủ test ID của một điểm chưa duyệt.
4. Behavior mà code tình cờ có ở vùng thuộc một điểm chưa duyệt **không phải contract**: không được viết test để khóa nó, và client không được dựa vào nó.

| ID | Nội dung tóm tắt | Vị trí | Trạng thái |
|---|---|---|---|
| C-1 | Canonical cũng được tra theo match key, trước alias; exact canonical luôn thắng | §4A.3 | Đã duyệt (v2.1) |
| C-2 | Ghi chú giải thích: match key không xóa khoảng trắng, nên `安倍　晋三` chỉ khớp khi có alias `安倍 晋三`. **Không có behavior riêng**: behavior này là hệ quả trực tiếp của định nghĩa `match_key` theo D-5 (đã duyệt), được kiểm tra bởi RES-05, RES-06 | §4A.2 | Chưa duyệt |
| C-3 | Input chỉ gồm khoảng trắng → 404 `UNRESOLVED_NAME` ở `/api/search`, không phải 422 | §3.2 | Chưa duyệt |
| C-4 | Cận trên 255 ký tự cho `from`, `to`, `q` và cận dưới 1 ký tự cho `q`, vi phạm → 422. (Yêu cầu `from`/`to` không rỗng → 422 có từ v1, không thuộc C-4.) | §3.2, §3.6 | Chưa duyệt |
| C-5 | `/api/resolve` luôn 200; `/api/search` chuyển unresolved/ambiguous thành 404 | §3.6 | Đã duyệt (v2.1) |
| C-6 | Langlink trỏ tới redirect trên jawiki: `ja_title` là bài đích, tiêu đề gốc thành `ja_redirect` | §6.4 bước 5 | Đã duyệt (v2.7) |
| C-7 | Không canonical name hay alias nào chứa `_` (G-6, A-6) | §6.1, §6.3 | Chưa duyệt |
| C-8 | `alias == target` (chính xác, sau NFC) không phải lỗi dữ liệu: fetcher bỏ entry đó, không ghi vào `aliases.json`; loader chấp nhận; không đổi canonical identity (A-5 bị bỏ) | §6.3, §6.4 | Đã duyệt (v2.12, nội dung sửa so với đề xuất ban đầu) |
| C-14 | `aliases.json` sắp xếp ổn định theo `(alias, target, source)` (A-7): fetcher ghi mảng đã sắp xếp, không phụ thuộc thứ tự/phân trang của API; loader fail khi không sắp xếp. Tách ra từ C-8 | §6.3, §6.4, §6.5 | Đã duyệt (v2.12) |
| C-15 | Fetcher retry lỗi transport: `httpx.RemoteProtocolError`, `ReadError`, `WriteError`, `ConnectError`, `TimeoutException` (timeout 30 s cũng retry); không retry `LocalProtocolError`, `UnsupportedProtocol`, `DecodingError`, `TooManyRedirects` và các `HTTPError` khác. Không có response nên không có `Retry-After`: chờ 5, 10, 20, 40, 80 s. Chung cap 5 retry (tối đa 6 lần thử) với 429/5xx/maxlag; retry gửi lại đúng request (URL, tham số, `continue`); hết cap vẫn không ghi file (C-9) | §6.4, §7.8 | Đã duyệt (v2.14) |
| C-9 | Output fetcher transactional ở mức ba file: fetch và validate (§6.5) cả ba trước khi commit; ghi vào staging/tạm trước; chỉ thay dataset hiện tại sau khi cả ba đã ghi và validate thành công; validator fail hoặc lỗi ghi/thay thế khi chạy bình thường → rollback/giữ dataset cũ, không để partial hoặc lẫn mới/cũ. Crash/mất điện giữa các thao tác thay thế không thuộc guarantee. Vị trí staging, module validator và cơ chế không thuộc contract | §6.4, §7.8, §8 | Đã duyệt (v2.7; làm rõ v2.8) |
| C-10 | Policy nội bộ của fetcher: 0,32 s giữa hai lần bắt đầu request (tối đa 187,5 request/phút) là cả mặc định lẫn ngưỡng tối thiểu cho phép (cấu hình < 0,32 s bị từ chối, đúng 0,32 s được phép), concurrency 1, timeout 30 s, tối đa 5 retry, chờ `max(Retry-After, 5 × 2^(n-1) s)` | §6.4 | Đã duyệt (v2.2; khoảng cách sửa ở v2.10, ngưỡng ở v2.11) |
| C-11 | Fetcher dùng `httpx.Client` đồng bộ; không `asyncio`/`Semaphore`/worker pool | §6.4 | Đã duyệt (v2.2) |
| C-12 | `/api/path` không bao giờ trả 422; mọi path không hợp lệ → `{"valid": false, "path": []}` | §3.7 | Đã duyệt (v2.2) |
| C-13 | Fetcher từ chối chạy nếu thiếu `WIKI_UA_CONTACT`; không hardcode contact | §6.4 | Đã duyệt (v2.2) |
| Q-1 | `GET /api/path` + `validate_path()` thuần dùng chung với `/share`; PTH-11 bảo đảm cùng phán quyết | §3.7, §5.3 | Đã chốt (v2.1) |
| Q-2 | `/share` luôn 200 `text/html`; path không hợp lệ → placeholder thay bằng chuỗi rỗng, giữ meta tĩnh của `dist/index.html` | §5.4, §9 | Đã chốt (v2.4) |
| Q-3 | Ngôn ngữ của UI hiển thị là tiếng Anh (v2.16); `og:title` của `/share` vẫn tiếng Việt, format trong một hằng số duy nhất (không đổi, v2.5/v2.9) | §5.4, §9 | Đã chốt lại (v2.16) |
| Q-4 | Fetcher tuần tự, concurrency = 1; không có tùy chọn 2–3 | §6.4 | Đã chốt (v2.1) |
| Q-5 | Chế độ `/share` tường minh: Phase 1 tắt; Phase 2+ bật và bắt buộc có `dist/index.html`, thiếu → fail fast; không suy ra từ việc file tồn tại | §0.3, §5.4, §5.5, §6.5 | Đã chốt (v2.5) |
| Q-6 | `og:url` dùng base URL của request hiện tại (scheme, host, `root_path` nếu có) + path `/share` và query dựng lại từ tên đã validate; không có `PUBLIC_BASE_URL` | §5.4, §8 | Đã chốt (v2.5) |
| Q-7 | `index.html` không chứa static `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`; năm property này chỉ do `/share` tạo tại placeholder | §5.4, §5.5 | Đã chốt (v2.5) |
| Q-8 | `<!--OG-->` đúng một lần và nằm trong `<head>`; vi phạm → fail fast khi `/share` được bật | §5.5, §6.5 | Đã chốt (v2.5) |
| Q-9 | `n` trong `og:title` = số cạnh của path = `len(path) - 1` = `SearchResponse.length` (không phải số node); ví dụ `A → B → C` có `n = 2` | §5.4, §7.6 | Đã chốt (v2.6) |
| Q-10 | `DIST_DIR` là cấu hình runtime chính thức (env var, mặc định `./dist`); chỉ đọc khi `enable_share=True`; `DIST_DIR/index.html` là template của `/share`; không thuộc dữ liệu hay contract frontend | §0.3, §5.5 | Đã chốt (v2.6) |
| Q-11 | `thumbnail` trong `people.json` giữ nguyên URL do MediaWiki API trả về: không cắt `utm_*`/query string, không sửa kích thước trong URL | §6.2, §6.4, §5.4 | Đã chốt (v2.12) |
| Q-12 | Frontend dùng React + Vite + TypeScript; mã nguồn ở `frontend/` | ADR-014 | Đã chốt (v2.13) |
| Q-13 | Test frontend dùng Vitest + Testing Library; không có test e2e trong trình duyệt | ADR-014, §7.9 | Đã chốt (v2.13) |
| Q-14 | Vẽ đồ thị 3D xoay được (`3d-force-graph`/Three.js) bằng dữ liệu của `SearchResponse`, hover hiện tên mỗi node | ADR-014 | Đã chốt lại (v2.17; trước đó Sigma.js+Graphology, v2.13) |
| Q-15 | Lịch sử tìm kiếm tối đa 20 entry | ADR-006, FE-02 | Đã chốt (v2.13) |
| Q-16 | Test frontend gắn ID bằng thẻ `@spec FE-NN`; cơ chế kiểm tra đủ FE-ID bắt buộc đọc từ SPEC.md và làm bộ test thất bại khi thiếu | §0.2, §7.9 | Đã chốt (v2.13) |
| Q-17 | Docker: `DATA_DIR=/app/data`; dataset chính thức được copy vào image lúc build; image không chạy fetcher, không gọi mạng | ADR-012, §6.6 | Đã chốt (v2.13) |
| Q-18 | Static mount `DIST_DIR` + SPA catch-all chỉ khi `enable_share=True`; `/api/*` không khớp → 404 (không phải `index.html`) | §3.4, §7.10 | Đã chốt (v2.13) |
| Q-19 | `thumbnail = null` hiển thị placeholder ở mọi nơi hiển thị `PersonMeta` | §7.9 (FE-06) | Đã chốt (v2.13) |

Các điểm C-3, C-4, C-7 thuộc vùng của pha 1 nhưng **không được implement** ở pha 1 (nguyên tắc 2). C-14 đã được duyệt ở v2.12: loader kiểm A-7 (test DAT-15, phần A-7) và fetcher ghi mảng đã sắp xếp (FET-07, FET-14). C-8 đã được duyệt ở v2.12: phần loader (chấp nhận `alias == target`) đã đúng sẵn và có test ở DAT-14; phần fetcher (bỏ entry) thuộc pha 3, test FET-20. C-6, C-9 thuộc pha 3, được duyệt ở v2.7 và đã được implement khi pha 3 mở (v2.9): test FET-11 (C-6), FET-14 và FET-19 (C-9). C-15 đã được duyệt ở v2.14 và thuộc pha 3 (fetcher): test FET-06, FET-15, FET-21. Khi một điểm được duyệt, sửa SPEC.md và changelog trước (§0.1), rồi mới thêm test và code.

---

## 1. Architecture Decision Records

Định dạng mỗi ADR: Context / Decision / Consequences / Rejected.

### ADR-001: Backend dùng Python + FastAPI
- **Context:** Yêu cầu của chủ project. Không đánh giá lại.
- **Decision:** Python 3.12, FastAPI, uvicorn. Pydantic cho schema.
- **Consequences:** OpenAPI sinh tự động từ Pydantic; frontend sinh TypeScript type từ OpenAPI.

### ADR-002: Scope cá nhân/học tập, ưu tiên đơn giản và chi phí vận hành gần 0
- **Decision:** Không thiết kế cho scale. Mỗi thành phần hạ tầng mới phải trả lời được: giải quyết vấn đề gì, có cần ở scope hiện tại không, có thay bằng giải pháp local/free được không.
- **Consequences:** Các ADR bên dưới đều tuân theo nguyên tắc này.

### ADR-003: Ứng dụng stateless, không database
- **Context:** Hai tính năng mới (lịch sử, share) ban đầu được thiết kế với PostgreSQL. Database kéo theo docker-compose, ORM, migration và yêu cầu persistent disk (thứ khiến free hosting khó dùng).
- **Decision:** Không có database. Server không lưu trạng thái nào ngoài dữ liệu read-only nạp lúc khởi động.
- **Consequences:** Chạy được trên bất kỳ host nào có filesystem tạm thời. Lịch sử không đồng bộ giữa thiết bị (chấp nhận).
- **Rejected:** PostgreSQL, SQLite (chưa cần; chỉ xem xét lại nếu có nhu cầu lịch sử đa thiết bị hoặc thống kê toàn cục).

### ADR-004: Graph và metadata nạp toàn bộ vào RAM từ file JSON
- **Decision:** `data/graph.json`, `data/people.json` và `data/aliases.json` được nạp một lần lúc khởi động và validate (§6.5). Dữ liệu bất biến trong suốt vòng đời process.
- **Rejected:** Graph database, CSR/numpy, phân tán.

### ADR-005: Dùng một HTTP GET thay cho WebSocket
- **Context:** Bản gốc stream BFS qua WebSocket, gây ra vấn đề timeout và P95 cao. BFS trên ~10k node hoàn thành trong vài mili-giây.
- **Decision:** `GET /api/search` trả toàn bộ kết quả (levels + path) trong một response. Frontend tự phát animation theo level.
- **Rejected:** WebSocket, SSE.

### ADR-006: Lịch sử tìm kiếm lưu ở localStorage
- **Decision:** Hoàn toàn phía frontend. Backend không có endpoint lịch sử. *(v2.13, Q-15)* Giữ tối đa **20 entry**; thêm entry khi đã đủ 20 thì entry cũ nhất bị bỏ. Con số 20 nằm trong một hằng số duy nhất.
- **Consequences:** Gắn với trình duyệt; mất khi người dùng xóa dữ liệu trình duyệt.

### ADR-007: Share bằng path mã hóa trong URL, server validate lại
- **Decision:** Link share chỉ chứa danh sách canonical name theo thứ tự (repeated query param `p`). Không chứa metadata. Server validate từng cạnh với graph hiện tại.
- **Consequences:** Không cần lưu snapshot. Link bị sửa tay hoặc lỗi thời (graph đã fetch lại) được phát hiện qua validation. *(v2.1)* Frontend lấy kết quả validation và `PersonMeta` qua `GET /api/path`, dùng chung hàm `validate_path` với `/share`.
- **Rejected:** `/s/{id}` + database; delimiter tự định nghĩa (`A|B|C`).

### ADR-008: OG preview bằng meta tag chèn phía server, không sinh ảnh
- **Context:** Crawler Facebook/LINE không chạy JavaScript.
- **Decision:** `GET /share` trả `index.html` đã chèn OG meta vào placeholder. `og:image` là thumbnail Wikipedia của người đầu tiên trên path.
- **Rejected:** Sinh ảnh OG bằng Pillow (trang trí, không phải yêu cầu chức năng; có thể thêm sau).

### ADR-009: Metadata và alias được tính trước bởi fetcher *(sửa ở v2)*
- **Context:** Cần metadata để hiển thị (thumbnail, URL, mô tả) và cần alias để resolve input đa ngôn ngữ. Cả hai đều lấy được từ MediaWiki API.
- **Decision:** Fetcher (chạy tay trên máy local) lấy metadata và alias theo batch, ghi `people.json` và `aliases.json`. **Production runtime không gọi Wikipedia/MediaWiki API trong bất kỳ trường hợp nào**, kể cả để resolve tên. Ngoại lệ duy nhất: trình duyệt của user tải ảnh thumbnail qua URL có trong `PersonMeta`.
- **Consequences:** Production không phụ thuộc mạng bên ngoài, không có nguy cơ bị Wikimedia throttle, không thể bị lợi dụng làm proxy tới Wikipedia. Cách viết tên nào không có trong dữ liệu đã fetch thì không resolve được (chấp nhận ở v2).
- **Rejected:** Frontend gọi Wikipedia REST API mỗi lần hover; backend gọi Wikipedia API lúc runtime để resolve tên (xem ADR-013).

### ADR-010: Identity và match key *(sửa ở v2)*
- **Identity:** canonical name, tức tiêu đề bài English Wikipedia, dùng dấu cách, dạng NFC. Đây là định danh duy nhất:
  ```
  people.json key == graph.json key == aliases.json target
      == API response name (from, to, path[].name, candidates[].name)
      == share URL `p` value
  ```
- **Input của user không phải identity.** Input chỉ trở thành identity sau khi đi qua resolver (§4A).
- **Match key:** `match_key(s)` = NFKC → thay mọi chuỗi khoảng trắng liên tiếp bằng một dấu cách ASCII → trim. Không case-folding. Không xóa khoảng trắng. Match key chỉ dùng để tra cứu nội bộ trong resolver; **không bao giờ** xuất hiện trong file dữ liệu, response hay URL, và không bao giờ được dùng để thay đổi identity.
- **NFC ở boundary:** chuẩn hóa NFC xảy ra ở fetcher (khi ghi file) và ở HTTP input (khi nhận request). Không rải `normalize()` trong logic.
- **`_` và dấu cách là khác nhau ở tầng application.** Resolver và share validation không coi `Albert_Einstein` tương đương `Albert Einstein`. Mọi xử lý underscore/space đặc thù của MediaWiki chỉ nằm trong fetcher khi đọc dữ liệu từ API. `_` chỉ xuất hiện trong `wiki_url`.
- So khớp identity là exact match sau NFC.

### ADR-011: Không tìm thấy đường đi là kết quả hợp lệ (200), không phải lỗi
- **Decision:** `found: false` trả 200 với schema đầy đủ. Lỗi thật dùng HTTP status + mã lỗi máy đọc được (`detail.code`).

### ADR-012: Một container, FastAPI serve cả SPA
- **Decision:** Multi-stage Dockerfile: build frontend → `python:3.12-slim`. Không tách frontend sang host khác (tránh CORS và hai lần deploy). Deploy bằng tính năng auto-deploy từ GitHub của nền tảng hosting; không tự dựng pipeline CD. *(v2.13, Q-17)* Image chạy với `DATA_DIR=/app/data` và dataset chính thức được copy vào image lúc build (§6.6). Node chỉ có ở stage build, không có ở image chạy.

### ADR-013: Resolver tên đa ngôn ngữ theo hướng precompute-first *(mới ở v2)*
- **Context:** User cần nhập được tên bằng tiếng Anh và tiếng Nhật (ví dụ `Shinzo Abe`, `安倍晋三`). Graph phải giữ nguyên là English Wikipedia graph. Không được phát sinh chi phí hosting, database, cache server hay hạ tầng mới.
- **Decision:**
  - Graph không đổi: chỉ chứa canonical English name.
  - Fetcher thu thập ba loại alias qua MediaWiki API chính thức: `en_redirect`, `ja_title` (qua `langlinks` từ English Wikipedia, chiều en → ja), `ja_redirect`. Kết quả ghi vào `aliases.json`.
  - Runtime: resolver thuần (không I/O) tra cứu trong RAM theo thứ tự ưu tiên ở §4A.
  - Alias xung đột (một match key trỏ tới nhiều người) được giữ nguyên trạng thái mơ hồ; không tự chọn target ở bất kỳ tầng nào.
  - Flow: `input → resolver → canonical name → graph.json → BFS`.
- **Consequences:** Chỉ resolve được các cách viết có trong dữ liệu đã fetch. Mở rộng coverage đồng nghĩa với chạy lại fetcher, không phải thay đổi runtime.
- **Rejected:**
  - Runtime fallback gọi Wikipedia API: cần cache, rate limit, xử lý mất kết nối; tạo phụ thuộc mạng cho production. Sẽ xem xét ở phiên bản riêng nếu coverage thực tế không đủ.
  - Wikidata labels/aliases: alias không được đảm bảo duy nhất, tỷ lệ mơ hồ cao hơn redirect.
  - Graph riêng cho từng ngôn ngữ hoặc chuyển sang Japanese Wikipedia graph.
  - Autocomplete / endpoint gợi ý tiền tố.

### ADR-014: Stack frontend *(mới ở v2.13; Q-12, Q-13, Q-14, Q-15; Q-14 mở lại và chốt lại ở v2.17)*
- **Context:** §3.5 (type sinh từ OpenAPI), ADR-005 (animation theo level ở frontend), ADR-006 (lịch sử ở localStorage), ADR-012 (một container). Project gốc tham khảo dùng React + sigma.js.
- **Decision:**
  - **Ngôn ngữ và build:** React + Vite + TypeScript. Mã nguồn ở `frontend/`; bản build là `dist/` của §3.4 và §5.5.
  - **Test:** Vitest + Testing Library (môi trường DOM do Vitest cấu hình). Không có test e2e trong trình duyệt. Test không gọi mạng thật (§0.2): mọi lời gọi API được mock bằng payload theo các ví dụ ở §3, và `fetch` chưa được mock làm test fail. Cách gắn ID và kiểm coverage: §7.9.
  - **Đồ thị** *(v2.17, Q-14 mở lại; trước đó Sigma.js + Graphology, v2.13; layout zích zắc + pan/reset ở v2.18)*: `3d-force-graph` (Three.js, WebGL) vẽ hình cầu 3D xoay được, có chiều sâu; hover một node hiện tên người (tooltip gốc của thư viện). Dữ liệu vẽ chỉ lấy từ `SearchResponse` (`levels`, `path`); không thêm endpoint hay field để phục vụ việc vẽ. Bố cục (mỗi node — path hay explored — có một vị trí cố định trên vỏ cầu theo level, riêng start đặt đúng tâm; path chỉ khác biệt về màu/kích thước, không phải layout), màu, kiểu animation, và cách điều hướng (xoay/zoom sẵn có của `OrbitControls`, cộng pan bằng mũi tên/WASD và nút reset ở v2.18) do implementation quyết định và không thuộc contract. Cần WebGL nên không chạy được trong môi trường DOM của test: test không được yêu cầu render WebGL thật (component vẽ được mock hoặc tách khỏi logic dựng dữ liệu, cùng nguyên tắc như Sigma trước đây).
  - **Lịch sử:** tối đa 20 entry (ADR-006).
  - **Version:** pin version của thư viện sau khi cài (lockfile được commit); hành vi phụ thuộc version phải được khóa bằng test, không dựa vào trí nhớ (cùng tinh thần §0.2).
- **Consequences:** Cần Node để build (stage build của Dockerfile), không cần Node lúc chạy. Type API sinh bằng `openapi-typescript` từ `/openapi.json` (§3.5).
- **Rejected (ở phiên bản này):** test e2e trong trình duyệt; test render WebGL thật (Sigma trước v2.17, `3d-force-graph`/Three.js từ v2.17); endpoint hay field mới cho việc vẽ đồ thị.

---

## 2. Pydantic schema

Tất cả schema nằm trong `backend/app/schemas.py`.

```python
class PersonMeta(BaseModel):
    name: str                 # canonical name
    thumbnail: str | None     # URL tuyệt đối, hoặc None nếu trang không có ảnh
    wiki_url: str             # URL tuyệt đối, luôn có
    description: str | None   # short description, hoặc None

class Level(BaseModel):
    level: int                # >= 0
    nodes: list[str]          # canonical names, thứ tự phát hiện

class SearchResponse(BaseModel):
    found: bool
    from_: str = Field(alias="from")   # canonical name đã resolve, không phải input
    to: str                            # canonical name đã resolve, không phải input
    length: int | None                 # số cạnh; None khi found=False
    nodes_explored: int
    path: list[PersonMeta]             # [] khi found=False
    levels: list[Level]

class ResolveResponse(BaseModel):                       # mới ở v2
    query: str                                           # input sau NFC
    status: Literal["resolved", "ambiguous", "unresolved"]
    person: PersonMeta | None                            # có giá trị khi và chỉ khi status="resolved"
    candidates: list[PersonMeta]                         # >= 2 phần tử khi status="ambiguous", còn lại []

class PathResponse(BaseModel):                          # mới ở v2.1
    valid: bool
    path: list[PersonMeta]                               # [] khi valid=False; khi valid=True: đúng thứ tự p, len >= 2

class ErrorDetail(BaseModel):                           # thay đổi ở v2 (breaking)
    code: Literal["UNRESOLVED_NAME", "AMBIGUOUS_NAME"]
    param: Literal["from", "to"]
    input: str                                           # input sau NFC (không phải match key)
    candidates: list[PersonMeta]                         # >= 2 phần tử khi AMBIGUOUS_NAME, còn lại []

class ErrorResponse(BaseModel):
    detail: ErrorDetail
```

**Yêu cầu về alias `from`:**
- JSON response phải có key `"from"`, không bao giờ có `"from_"`.
- OpenAPI schema của `SearchResponse` phải hiển thị property `from`.
- Code Python có thể khởi tạo model bằng `from_=...` (cấu hình populate-by-name theo version Pydantic đang cài).
- Cả ba điểm trên phải có test (SCH-01..03).

**Không có field tùy chọn bị bỏ đi.** Mọi field của `SearchResponse`, `ResolveResponse`, `PathResponse` và `ErrorDetail` luôn có mặt trong JSON, chỉ khác giá trị.

**Thứ tự `candidates`:** sắp xếp theo `name` bằng `sorted()` của Python.

---

## 3. API contract

### 3.1 `GET /api/people`
- **Response 200:** `list[str]` — toàn bộ canonical name, sắp xếp bằng `sorted()` của Python.
- Không chứa alias.

### 3.2 `GET /api/search?from={input}&to={input}` *(sửa ở v2)*
- **Query:** `from`, `to` bắt buộc và không rỗng. *(v2.3)* Cận trên về độ dài chưa được quy định (C-4, chưa duyệt). Giá trị có thể là canonical name, alias tiếng Anh (en redirect), tên tiếng Nhật (ja title) hoặc alias tiếng Nhật (ja redirect).
- Tham số Python cho `from` dùng `Query(alias="from")`.
- Mỗi tham số được NFC-normalize rồi đi qua resolver (§4A). BFS chỉ chạy khi cả hai đều ở trạng thái `resolved`.
- Response `from`/`to` là **canonical name đã resolve**, không echo input.

| Tình huống | Status | Body |
|---|---|---|
| Cả hai resolved, tìm được đường | 200 | `SearchResponse`, `found=true` |
| Cả hai resolved, không có đường | 200 | `SearchResponse`, `found=false` |
| Cả hai resolve về cùng một người (kể cả qua alias khác nhau) | 200 | `found=true`, `path=[person]`, `length=0` |
| Một tham số `unresolved` | 404 | `ErrorResponse`, `code="UNRESOLVED_NAME"`, `candidates=[]` |
| Một tham số `ambiguous` | 404 | `ErrorResponse`, `code="AMBIGUOUS_NAME"`, `candidates` ≥ 2 |
| Thiếu tham số / rỗng | 422 | Mặc định của FastAPI |
| Dài hơn 255 ký tự | *chưa quy định* (C-4) | — |
| Chỉ gồm khoảng trắng | *chưa quy định* (C-3) | — |

- Resolve và kiểm tra `from` trước `to`. Nếu `from` lỗi, báo lỗi của `from` (`param="from"`) và không cần resolve `to`.
- *(v2.3)* Input chỉ gồm khoảng trắng và input dài hơn 255 ký tự: behavior **chưa được quy định** (C-3, C-4 chưa duyệt). Behavior hiện tại của code ở hai trường hợp này không phải contract (§0.4 nguyên tắc 4).
- Khai báo trong decorator: `response_model=SearchResponse`, `responses={404: {"model": ErrorResponse}}`.
- Raise lỗi bằng `HTTPException(status_code=404, detail=ErrorDetail(...).model_dump())` (hoặc tương đương theo version), sao cho body khớp `ErrorResponse`.

**Ví dụ input tiếng Nhật:**
```
GET /api/search?from=%E5%AE%89%E5%80%8D%E6%99%8B%E4%B8%89&to=Barack+Obama
```
```json
{
  "found": true,
  "from": "Shinzo Abe",
  "to": "Barack Obama",
  "length": 1,
  "nodes_explored": 57,
  "path": [
    {"name": "Shinzo Abe", "thumbnail": "https://...", "wiki_url": "https://en.wikipedia.org/wiki/Shinzo_Abe", "description": "..."},
    {"name": "Barack Obama", "thumbnail": "https://...", "wiki_url": "https://en.wikipedia.org/wiki/Barack_Obama", "description": "..."}
  ],
  "levels": [
    {"level": 0, "nodes": ["Shinzo Abe"]},
    {"level": 1, "nodes": ["...", "Barack Obama"]}
  ]
}
```
(Giá trị `nodes_explored`, `length` ở trên chỉ minh họa hình dạng, không phải dữ liệu thật.)

**Ví dụ `found=false`:**
```json
{
  "found": false,
  "from": "A",
  "to": "Z",
  "length": null,
  "nodes_explored": 4,
  "path": [],
  "levels": [
    {"level": 0, "nodes": ["A"]},
    {"level": 1, "nodes": ["B", "C", "D"]}
  ]
}
```

**Ví dụ 404 unresolved:**
```json
{"detail": {"code": "UNRESOLVED_NAME", "param": "to", "input": "Albert_Einstein", "candidates": []}}
```

**Ví dụ 404 ambiguous:**
```json
{
  "detail": {
    "code": "AMBIGUOUS_NAME",
    "param": "from",
    "input": "X",
    "candidates": [
      {"name": "Person One", "thumbnail": null, "wiki_url": "https://...", "description": null},
      {"name": "Person Two", "thumbnail": null, "wiki_url": "https://...", "description": null}
    ]
  }
}
```

### 3.3 `GET /share?p={name}&p={name}...`
Xem mục 5.

### 3.4 Static / SPA *(viết lại ở v2.13, Q-18)*
- **Khi nào:** chỉ khi `enable_share=True` (chế độ Phase 2+, §0.3). Lý do: `DIST_DIR` chỉ được đọc và `dist/` chỉ bắt buộc có ở chế độ này (Q-5, Q-10). Khi `enable_share=False` thì **không** đăng ký static mount hay catch-all, không đọc `DIST_DIR`, và mọi đường dẫn không thuộc `/api/*` trả 404 mặc định của FastAPI.
- **Static mount:** thư mục `DIST_DIR` được mount làm static; một file có trong `DIST_DIR` (ví dụ `assets/app.js`) được phục vụ đúng nội dung của nó tại đường dẫn tương ứng.
- **SPA fallback:** một `GET` không khớp route đã đăng ký, không khớp file tĩnh và không bắt đầu bằng `/api/` trả **200 `text/html`** với nội dung `index.html` **nguyên văn** (giữ nguyên `<!--OG-->`, vốn chỉ là comment HTML; OG meta chỉ do `/share` chèn, §5.4).
- **`/api/*` không khớp route nào** trả **404** mặc định của FastAPI (JSON), **không** trả `index.html`.
- **Thứ tự:** `/api/*` và `/share` được đăng ký **trước** static mount và catch-all; hai thứ sau không được che route đã đăng ký.
- Kiểm bởi SPA-01..SPA-05 (§7.10).

### 3.5 Frontend types
- Sinh TypeScript type từ `/openapi.json` bằng `openapi-typescript`. Không viết tay type cho response API.

### 3.6 `GET /api/resolve?q={input}` *(mới ở v2)*
- **Mục đích:** frontend kiểm tra một input trước khi tìm kiếm, và hiển thị danh sách ứng viên khi tên mơ hồ.
- **Query:** `q` bắt buộc. NFC-normalize rồi đi qua resolver (§4A). Không gọi network. *(v2.3)* Ràng buộc độ dài của `q` (cận dưới 1, cận trên 255) chưa được quy định (C-4, chưa duyệt).
- **Response:** luôn **200** với `ResolveResponse` cho mọi kết quả resolve (`resolved`, `ambiguous`, `unresolved`) của một `q` thuộc phạm vi đã quy định. Kết quả resolve là tài nguyên được yêu cầu, nên "không resolve được" là một kết quả hợp lệ (cùng tinh thần ADR-011).
- **422:** thiếu `q`.
- *(v2.3)* **`q=""` và `q` dài hơn 255 ký tự: chưa được quy định** (C-4). Behavior hiện tại của code ở hai trường hợp này không phải contract (§0.4 nguyên tắc 4); không có test khóa behavior đó.
- `/api/search` và `/api/resolve` dùng **chung một hàm resolver**; cùng input phải cho cùng kết quả ở cả hai endpoint.

```json
{"query": "安倍晋三", "status": "resolved",
 "person": {"name": "Shinzo Abe", "thumbnail": "https://...", "wiki_url": "https://en.wikipedia.org/wiki/Shinzo_Abe", "description": "..."},
 "candidates": []}
```
```json
{"query": "Albert_Einstein", "status": "unresolved", "person": null, "candidates": []}
```

### 3.7 `GET /api/path?p={name}&p={name}...` *(mới ở v2.1)*
- **Mục đích:** frontend tại trang `/share` kiểm tra path trong URL và lấy `PersonMeta` để hiển thị.
- **Query:** `p` lặp lại, **không bắt buộc** ở tầng FastAPI (mặc định danh sách rỗng). Mọi ràng buộc về số lượng và độ dài được kiểm tra bên trong `validate_path` (§5.3), không bằng ràng buộc `Query`.
- **Không đi qua resolver.** `p` phải là canonical name chính xác sau NFC.
- **Response:** luôn **200** với `PathResponse`. Không bao giờ trả 422 hay 404.
  - Hợp lệ: `valid=true`, `path` là `PersonMeta` của từng tên, đúng thứ tự.
  - Không hợp lệ vì bất kỳ lý do nào (thiếu `p`, sai số lượng, quá dài, tên không có trong graph, alias, cạnh không tồn tại): `valid=false`, `path=[]`.
- Không trả lý do không hợp lệ ở v2.1.
- **Invariant:** với cùng danh sách `p`, `/api/path` trả `valid=true` khi và chỉ khi `/share` coi path là hợp lệ (cùng gọi `validate_path`).

```json
{"valid": true, "path": [
  {"name": "Shinzo Abe", "thumbnail": "https://...", "wiki_url": "https://en.wikipedia.org/wiki/Shinzo_Abe", "description": "..."},
  {"name": "Barack Obama", "thumbnail": "https://...", "wiki_url": "https://en.wikipedia.org/wiki/Barack_Obama", "description": "..."}
]}
```
```json
{"valid": false, "path": []}
```

---

## 4. BFS invariants

### 4.1 Vị trí và chữ ký
- File `backend/app/graph.py`. Hàm thuần: không I/O, không phụ thuộc FastAPI hay Pydantic.
- Chữ ký (khái niệm):
  ```python
  @dataclass(frozen=True)
  class BfsResult:
      found: bool
      path: list[str]          # canonical names
      levels: list[list[str]]

  def shortest_path(graph: Mapping[str, Sequence[str]], start: str, target: str) -> BfsResult
  ```
- Precondition: `start` và `target` là key của `graph` (tức là canonical name đã resolve). Vi phạm thì raise `ValueError`. BFS không bao giờ nhận input chưa qua resolver.
- Tầng API chịu trách nhiệm chuyển `BfsResult` thành `SearchResponse` (tra `people.json` để dựng `PersonMeta`).

### 4.2 Semantics của `levels` (ghi nguyên văn vào docstring)
```
levels[k] contains nodes discovered at BFS depth k.
The final level may be incomplete because BFS terminates immediately
when the target is discovered (goal test on enqueue, not on dequeue).
```

### 4.3 Invariants — mọi kết quả
- **I-1** `levels[0] == [start]`.
- **I-2** Mỗi node xuất hiện tối đa một lần trong toàn bộ `levels`.
- **I-3** Không có level rỗng.
- **I-4** Với mọi `k >= 1`, mỗi node trong `levels[k]` có ít nhất một cạnh đến từ một node trong `levels[k-1]`.
- **I-5** `nodes_explored == sum(len(l) for l in levels)` (định nghĩa: số node phân biệt đã được phát hiện, tính cả `start`).
- **I-6** Tất định: cùng graph + cùng input luôn cho cùng kết quả (dựa vào adjacency list đã sắp xếp, §6.1). Thứ tự node trong mỗi level là thứ tự phát hiện.
- **I-7** Kiểm tra đích khi enqueue: ngay khi `target` được phát hiện, dừng thuật toán.

### 4.4 Khi `found = True`
- **F-1** `path != []`, `path[0] == start`, `path[-1] == target`.
- **F-2** `length == len(path) - 1`.
- **F-3** Mọi cặp liên tiếp `(path[i], path[i+1])` là một cạnh có hướng trong graph.
- **F-4** Các node trong `path` phân biệt.
- **F-5** `path[i] in levels[i]` với mọi `i`; `len(levels) == length + 1`.
- **F-6** `target` là phần tử cuối cùng của level cuối cùng.
- **F-7** `length` là khoảng cách ngắn nhất (không tồn tại đường ngắn hơn).

### 4.5 Khi `found = False`
- **N-1** `path == []`, `length is None`.
- **N-2** Hợp các `levels` bằng đúng tập node reachable từ `start` (BFS đã duyệt hết).
- **N-3** `target` không xuất hiện trong `levels`.

### 4.6 Trường hợp đặc biệt
- **S-1** `start == target` → `found=True`, `path=[start]`, `length=0`, `levels=[[start]]`, `nodes_explored=1`.
- **S-2** `start` không có cạnh ra (adjacency rỗng) và `start != target` → `found=False`, `levels=[[start]]`.
- **S-3** Graph có hướng: `A→B` tìm được không có nghĩa `B→A` tìm được.
- **S-4** Graph có chu trình không làm BFS lặp vô hạn.

---

## 4A. Name resolver *(mới ở v2)*

### 4A.1 Vị trí và chữ ký
- File `backend/app/resolver.py`. Hàm thuần: không I/O, không network, không phụ thuộc FastAPI hay Pydantic.
- Chữ ký (khái niệm):
  ```python
  @dataclass(frozen=True)
  class ResolveResult:
      status: Literal["resolved", "ambiguous", "unresolved"]
      name: str | None           # canonical name khi resolved
      candidates: list[str]      # canonical names đã sắp xếp khi ambiguous

  def match_key(s: str) -> str
  def build_index(canonical_names: Iterable[str], aliases: Iterable[AliasEntry]) -> ResolverIndex
  def resolve(index: ResolverIndex, text: str) -> ResolveResult   # text đã NFC
  ```
- `ResolverIndex` được dựng **một lần** lúc khởi động và bất biến sau đó.

### 4A.2 `match_key`
```
match_key(s) = " ".join(unicodedata.normalize("NFKC", s).split())
```
- `str.split()` không tham số tách theo mọi ký tự khoảng trắng Unicode, sau đó nối bằng một dấu cách ASCII; việc này đồng thời thực hiện trim.
- Không case-folding. Không xóa khoảng trắng. Không thay `_` bằng dấu cách.
- **Hệ quả cần lưu ý:** vì không xóa khoảng trắng, `安倍　晋三` (dấu cách toàn góc) có match key là `安倍 晋三`. Nó chỉ resolve được nếu dữ liệu có alias mà match key bằng `安倍 晋三` (ví dụ một `ja_redirect` tên `安倍 晋三`). Nó **không** tự khớp với `安倍晋三` (không dấu cách).

### 4A.3 Thứ tự tra cứu *(viết lại ở v2.1)*
Cho `text` (đã NFC). Các bước chạy theo đúng thứ tự; bước nào cho kết quả thì dừng ngay.

1. **Exact canonical:** nếu `text` là một canonical name → `resolved(text)`. Exact canonical luôn thắng mọi bước sau.
2. **Canonical theo match key:** tính `k = match_key(text)`. Nếu `k == ""` → `unresolved` (dừng). Đặt `C = { c ∈ canonical names | match_key(c) == k }`.
   - `|C| == 1` → `resolved`.
   - `|C| >= 2` → `ambiguous(sorted(C))`. **Dừng; không xét alias.**
3. **Alias theo match key:** `T = { target | alias entry có match_key(alias) == k }` (tập hợp, đã khử trùng).
   - `|T| == 1` → `resolved`.
   - `|T| >= 2` → `ambiguous(sorted(T))`.
4. **Ambiguous:** chỉ phát sinh ở bước 2 hoặc bước 3, với toàn bộ ứng viên của đúng bước đó.
5. **Unresolved:** không bước nào ở trên cho kết quả.

Quy tắc hệ quả:
- **R-1** Canonical luôn thắng alias: nếu một alias của người X có match key trùng với canonical name của người Y, input đó resolve về Y. Nếu match key trùng với nhiều canonical name, kết quả là `ambiguous` giữa các canonical đó, kể cả khi alias có một target duy nhất.
- **R-2** Cùng một alias trỏ về cùng một target từ nhiều `source` khác nhau không gây mơ hồ (T là tập hợp).
- **R-3** Resolver không bao giờ trả một tên không có trong graph.
- **R-4** Resolver không bao giờ chọn một ứng viên thay cho user khi mơ hồ.
- **R-5** Tất định: cùng index + cùng input luôn cho cùng kết quả, kể cả thứ tự `candidates`.
- **R-6** `source` không ảnh hưởng tới kết quả resolve (chỉ dùng cho dữ liệu/debug).
- **R-7** *(v2.1)* Kết quả không phụ thuộc thứ tự key trong `graph.json`, thứ tự entry trong `aliases.json`, hay thứ tự duyệt dict. Không được chọn "phần tử gặp trước" ở bất kỳ bước nào; index lưu **tập hợp** ứng viên cho mỗi match key.

---

## 5. Share URL contract

### 5.1 Định dạng
```
/share?p=Albert+Einstein&p=Nikola+Tesla&p=Isaac+Newton
```
- Repeated param `p`, thứ tự = thứ tự path. Không delimiter tự định nghĩa.
- Chỉ chứa canonical name. **Không** chứa thumbnail, description, alias, input gốc của user hay bất kỳ metadata nào.
- Frontend tạo bằng `URLSearchParams.append("p", name)` với `name` lấy từ `path[].name` của `SearchResponse`, và đọc bằng `URLSearchParams.getAll("p")`. Không dùng `encodeURIComponent` thủ công, không tự nối chuỗi.
- Backend dùng parser chuẩn của FastAPI/Starlette. Mỗi giá trị được NFC-normalize.
- Encoding: dấu cách thành `+`, dấu `+` thật thành `%2B`. Hai phía dùng cùng chuẩn `application/x-www-form-urlencoded`.

### 5.2 Giới hạn
- Số phần tử `p`: từ 2 đến 10.
- Độ dài mỗi phần tử: tối đa 255 ký tự (giới hạn độ dài tiêu đề Wikipedia).
- **Lưu ý version:** ràng buộc `min_length`/`max_length` trên `list[str]` có thể được hiểu là độ dài list hoặc độ dài từng phần tử tùy version FastAPI/Pydantic. Không dựa vào cú pháp này: validate số phần tử và độ dài từng phần tử một cách tường minh trong `validate_path` (§5.3), và khóa hành vi bằng test SHR-05..07 và PTH-05..07.

### 5.3 Validation phía server
Logic nằm trong một hàm thuần duy nhất, `validate_path(names: Sequence[str], edges: Mapping[str, frozenset[str]]) -> list[str] | None` *(chữ ký sửa ở v2.3)*, trong đó `edges` là dict cạnh dựng lúc khởi động (trả danh sách tên đã NFC nếu hợp lệ, `None` nếu không), trong `backend/app/paths.py` (pha 1; không đặt trong module của route `/share`). `/share` và `/api/path` đều chỉ gọi hàm này; không endpoint nào tự validate riêng. *(v2.1)* Hai route dùng chung phán quyết nhưng có representation riêng: `/api/path` trả JSON `PathResponse`, `/share` trả HTML (§5.4). *(v2.2; Q-2 chốt ở v2.4)*

Path hợp lệ khi và chỉ khi:
1. Số phần tử và độ dài nằm trong giới hạn 5.2;
2. Mọi tên đều là key của graph (**exact match sau NFC; không đi qua resolver**);
3. Mọi cặp liên tiếp là một cạnh có hướng trong graph (tra bằng `dict[str, frozenset[str]]` dựng lúc khởi động).

**Invariant (v2):** share URL là biểu diễn của identity. Alias (`安倍晋三`, `Abe Shinzo`) hoặc tên có `_` trong `p` làm path không hợp lệ, kể cả khi resolver có thể resolve được chúng.

### 5.4 Response của `GET /share` *(chốt Q-2 ở v2.4)*
- Áp dụng khi `/share` được **bật** (chế độ Phase 2+, §0.3). Khi bị tắt tường minh (chế độ Phase 1) thì không có route `/share` và mục này không áp dụng. *(v2.5, Q-5)*
- **Luôn HTTP `200`, luôn `text/html`**, cho mọi input — kể cả thiếu `p`, sai số lượng, tên quá dài, tên không có trong graph, hay cạnh không tồn tại. `/share` **không bao giờ** trả JSON 422/404. Cùng tinh thần với C-12 cho `/api/path`.
- Body là nội dung `dist/index.html` với placeholder `<!--OG-->` trong `<head>` được thay thế; phần còn lại của file giữ nguyên.
- Phán quyết hợp lệ/không hợp lệ đến **duy nhất** từ `validate_path` (§5.3); `/share` không tự validate.
- **Path hợp lệ** (`validate_path` trả danh sách tên) — placeholder được thay bằng các meta tag:
  - `og:title` = `"{first} → {last}: {n} bước"` (format đặt trong một hằng số duy nhất; ngôn ngữ là tiếng Việt theo Q-3, đã chốt ở v2.5). *(v2.6, Q-9)* `n` = số cạnh của path = `len(path) - 1` = `SearchResponse.length`, **không** phải số node; ví dụ path `A → B → C` có `n = 2`, nên `og:title` là `"A → C: 2 bước"`;
  - `og:description` = các tên trên path nối bằng `" → "`;
  - `og:image` = thumbnail của người đầu tiên, giữ nguyên URL kể cả query string (Q-11; chỉ `html.escape`, nên `&` thành `&amp;`); **bỏ hẳn tag** nếu thumbnail là `None`;
  - `og:url` = URL share **dựng lại từ các tên đã validate** bằng `urlencode(..., doseq=True)`, không echo lại chuỗi query thô. *(v2.5, Q-6)* `og:url` sử dụng base URL của request hiện tại, gồm scheme, host và `root_path` nếu request có; path `/share` và query được dựng lại từ canonical name đã validate. Không có biến cấu hình `PUBLIC_BASE_URL` ở phiên bản này;
  - `twitter:card` = `summary`.
- **Path không hợp lệ** (`validate_path` trả `None`) — placeholder được thay bằng **chuỗi rỗng**. Server **không** chèn bộ OG mặc định riêng và không thêm hằng số text nào. *(v2.4)* **"OG meta mặc định của site" được định nghĩa là các meta tag tĩnh đã có sẵn trong `dist/index.html`**; chúng nguyên vẹn vì chỉ placeholder bị thay. Vì không sinh text mới, hành vi này **không phụ thuộc Q-3**. *(v2.5, Q-7)* Các meta tĩnh đó **không** gồm `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card` (§5.5): năm property này chỉ do `/share` tạo cho path hợp lệ. Hệ quả: với path không hợp lệ, trang không có năm property này và crawler dùng các meta tĩnh còn lại (ví dụ `<title>`, `description`, `og:site_name`).
- *(v2.5, Q-7)* Vì `dist/index.html` không chứa năm property trên, HTML trả về chứa mỗi property đó **tối đa một lần**.
- Trong cả hai trường hợp, HTML trả về **không còn chuỗi `<!--OG-->`**.
- Frontend tại `/share` hiển thị thông báo "link không còn hợp lệ" theo §5.6; backend không sinh thông báo lỗi trong HTML.
- Mọi giá trị chèn vào HTML phải qua `html.escape(value, quote=True)`. URL encoding không phải là cơ chế bảo vệ HTML.

### 5.5 Placeholder và `dist/index.html` *(viết lại ở v2.5; `DIST_DIR` ở v2.6)*
- **`DIST_DIR`** *(v2.6, Q-10)*: biến môi trường của server, mặc định `./dist`; `DIST_DIR/index.html` là template runtime của `/share`. Chỉ được đọc khi `enable_share=True` (§0.3); khi `enable_share=False` không đọc `DIST_DIR` và không yêu cầu có thư mục `dist/`. Đây là cấu hình của server, không phải dữ liệu (§6) và không thuộc contract của frontend.
- `frontend/index.html` và bản build `dist/index.html` phải chứa **đúng một** `<!--OG-->`, nằm **trong `<head>`** (Q-8).
- Vị trí placeholder là chỗ **duy nhất** server chèn OG meta. Các file này **không** được chứa static `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card` (Q-7). Đây là yêu cầu đối với frontend, kiểm tra bởi FE-05; server không kiểm tra lúc khởi động.
- Khi `/share` được bật (§0.3, Q-5), server kiểm tra lúc khởi động và **fail fast** (app không khởi động) nếu:
  1. `dist/index.html` không tồn tại;
  2. số lần xuất hiện của `<!--OG-->` khác một (thiếu hoặc thừa);
  3. `<!--OG-->` không nằm trong `<head>`. "Nằm trong `<head>`" nghĩa là vị trí của placeholder nằm giữa thẻ mở `<head>` (có thể kèm thuộc tính) và thẻ đóng `</head>`; tên thẻ không phân biệt hoa/thường; kiểm tra bằng so vị trí trong chuỗi, không cần parser HTML đầy đủ. *(v2.5, Q-8)*
- Thông báo lỗi nêu rõ vi phạm và đường dẫn file. Khi `/share` bị tắt tường minh (chế độ Phase 1) không có kiểm tra nào ở mục này.

### 5.6 Hành vi frontend tại `/share` *(viết lại ở v2.1)*
1. Đọc `p` bằng `URLSearchParams.getAll("p")`.
2. Gọi `GET /api/path` với đúng danh sách đó (dựng lại query bằng `URLSearchParams.append`).
3. `valid=true` → hiển thị path từ `PathResponse.path`. Frontend không tự validate path.
4. `valid=false` → hiển thị thông báo "link không còn hợp lệ". Nếu có ít nhất hai phần tử `p`, chạy một **tìm kiếm mới** `GET /api/search?from={p[0]}&to={p[-1]}`.
   - Đây là một search bình thường, nên `from`/`to` đi qua resolver; kết quả mang canonical name. Điều này không mâu thuẫn với §5.3: link share vẫn bị coi là không hợp lệ, chỉ là UI chủ động đề xuất kết quả mới.
   - Nếu search trả 404 thì hiển thị lỗi theo `detail.code` như ở trang tìm kiếm.

---

## 6. Data format

Cả ba file: UTF-8, `ensure_ascii=False`, mọi chuỗi tên ở dạng NFC. Nằm trong `data/`, được commit vào git (không dùng Git LFS). Đường dẫn cấu hình qua biến môi trường `DATA_DIR` (mặc định `./data`).

### 6.1 `data/graph.json`
```json
{
  "Albert Einstein": ["Isaac Newton", "Niels Bohr"],
  "Isaac Newton": [],
  "Niels Bohr": ["Albert Einstein"]
}
```
- Object: key = canonical English name, value = danh sách canonical name mà trang đó link tới (cạnh có hướng). **Không chứa alias hay tên tiếng Nhật.**
- **G-1** Mọi người trong dataset đều là key, kể cả khi không có cạnh ra (list rỗng).
- **G-2** Mọi phần tử trong value đều là key của graph (tập đóng).
- **G-3** Không có self-loop.
- **G-4** Không trùng lặp trong một adjacency list.
- **G-5** Mỗi adjacency list được sắp xếp bằng `sorted()` (bảo đảm BFS tất định, I-6).
- **G-6** *(v2; **chưa duyệt — C-7**; không kiểm tra ở pha 1)* Không canonical name nào chứa ký tự `_` (tiêu đề MediaWiki lưu `_` dưới dạng dấu cách; `_` trong dữ liệu là dấu hiệu fetcher đã đọc sai).

### 6.2 `data/people.json`
```json
{
  "Albert Einstein": {
    "thumbnail": "https://upload.wikimedia.org/...",
    "wiki_url": "https://en.wikipedia.org/wiki/Albert_Einstein",
    "description": "German-born theoretical physicist (1879–1955)"
  }
}
```
- Object: key = canonical name; value không lặp lại `name` (API tự ghép thành `PersonMeta`).
- **P-1** Tập key của `people.json` bằng đúng tập key của `graph.json`.
- **P-2** `wiki_url` là chuỗi không rỗng, lấy nguyên giá trị từ API (`inprop=url`), không tự dựng.
- **P-3** `thumbnail` và `description` là chuỗi hoặc `null`; không dùng chuỗi rỗng để biểu diễn "không có".
- **Thumbnail giữ nguyên** *(Q-11, v2.12)*: `thumbnail` là URL do MediaWiki API trả về, không sửa: không cắt `utm_*` hay query string nào, không đổi kích thước trong URL (API có thể trả cỡ khác `pithumbsize`, ví dụ `250px` khi yêu cầu `200`). Đây là quy tắc dữ liệu của fetcher, không phải invariant mà loader kiểm tra.
- Không đổi ở v2: `people.json` không chứa tên tiếng Nhật hay link Japanese Wikipedia.

### 6.3 `data/aliases.json` *(mới ở v2)*
```json
[
  {"alias": "Abe Shinzo", "target": "Shinzo Abe", "source": "en_redirect"},
  {"alias": "安倍 晋三",  "target": "Shinzo Abe", "source": "ja_redirect"},
  {"alias": "安倍晋三",   "target": "Shinzo Abe", "source": "ja_title"}
]
```
- Mảng các entry `{alias, target, source}`. Chỉ phục vụ resolver; không phải dữ liệu hiển thị, không được trả qua API.
- `alias` lưu ở dạng gốc (NFC). Match key **không** được lưu trong file; resolver tính khi dựng index.
- `source` ∈ `{"en_redirect", "ja_title", "ja_redirect"}`:
  - `en_redirect`: tiêu đề một trang redirect trên English Wikipedia trỏ tới `target`.
  - `ja_title`: tiêu đề bài Japanese Wikipedia tương ứng với `target`, lấy qua `langlinks` của bài English Wikipedia.
  - `ja_redirect`: tiêu đề một trang redirect trên Japanese Wikipedia trỏ tới bài `ja_title` của `target`.
- Alias xung đột (cùng `alias`, khác `target`) được **giữ nguyên** trong file; đó không phải lỗi dữ liệu.
- **A-1** Mọi `target` là key của graph.
- **A-2** `alias` không rỗng, ở dạng NFC, và `match_key(alias) != ""`.
- **A-3** `source` thuộc tập giá trị trên.
- **A-4** Không có entry trùng lặp hoàn toàn (cùng `alias`, `target`, `source`).
- **A-5** *(bỏ ở v2.12, C-8)* `alias == target` **không phải lỗi dữ liệu**: loader không kiểm tra và chấp nhận entry như vậy nếu có trong file. Fetcher không ghi entry `alias == target` (§6.4).
- **A-6** *(chưa duyệt — C-7; không kiểm tra ở pha 1)* Không `alias` nào chứa ký tự `_` (lý do như G-6).
- **A-7** *(đã duyệt — C-14, v2.12)* Mảng được sắp xếp theo `(alias, target, source)` để diff giữa các lần fetch ổn định. Loader kiểm và fail nếu không sắp xếp; fetcher ghi mảng đã sắp xếp (§6.4).

### 6.4 Fetcher contract (`backend/fetcher.py`) *(sửa ở v2)*
- Input: `data/seed_names.txt` (mỗi dòng một tên).
- Fetcher chạy tay trên máy local, không chạy trên server. Đây là nơi duy nhất trong project gọi MediaWiki API.

**Bước 1 — Resolve seed:** resolve seed sang canonical English title (xử lý redirect và normalization của Wikipedia); gộp seed trùng sau khi resolve; loại seed không tồn tại (ghi log).

**Bước 2 — Graph:** lấy link đi ra với `redirects=1` để link tới trang redirect vẫn được tính; lọc chỉ giữ tên có trong tập canonical.

**Bước 3 — Metadata + ja title (enwiki):** theo batch tối đa 50 tiêu đề/request, `prop=pageimages|info|description|langlinks`, `pithumbsize=200`, `inprop=url`, `lllang=ja`. Người không có langlink `ja` thì không sinh alias `ja_title`.

**Bước 4 — en redirect (enwiki):** theo batch, `prop=redirects`, `rdnamespace=0`, `rdlimit=max`. Mỗi redirect sinh một entry `en_redirect`.

**Bước 5 — ja redirect (jawiki):** với tập tiêu đề thu được ở bước 3, gọi `ja.wikipedia.org` theo batch với `redirects=1`, `prop=redirects`, `rdnamespace=0`, `rdlimit=max`.
- Nếu tiêu đề lấy từ langlink bản thân là một redirect trên jawiki: `ja_title` là **tiêu đề bài đích sau khi resolve**, còn tiêu đề langlink gốc được ghi là một `ja_redirect`. *(C-6, đã duyệt ở v2.7)*
- Nếu tiêu đề langlink không tồn tại trên jawiki: bỏ, ghi log, không sinh alias nào từ nó.
- Nếu nhiều `target` cùng có một `ja_title` (xung đột): mỗi `ja_redirect` của bài jawiki đó được sinh cho **từng** `target`, giữ nguyên xung đột.

**Quy tắc chung khi gọi API** *(viết lại ở v2.1)*:

*Nội dung request*
- Chỉ dùng `GET` tới Action API (`/w/api.php`), `format=json`, `formatversion=2`.
- Tuân theo cơ chế continuation chung của MediaWiki: lặp cho tới khi response không còn object `continue`, gửi lại **toàn bộ** các tham số trong `continue` (không chỉ xử lý riêng `plcontinue`/`llcontinue`/`rdcontinue`).
- Gộp nhiều tiêu đề vào một request (tối đa 50 tiêu đề qua `titles=A|B|C`) thay vì một request cho mỗi tiêu đề.
- Mọi request gửi `maxlag=5`.

*Định danh client*
- Header `User-Agent` theo định dạng của Wikimedia User-Agent Policy: `<tên>/<version> (<liên hệ>) <thư viện>/<version>`, ví dụ `SixDegreesPy/0.1 (https://github.com/<owner>/<repo>; <email>) httpx/<version>`.
- Thông tin liên hệ phải là của **người vận hành** fetcher (email hoặc URL), đọc từ biến môi trường `WIKI_UA_CONTACT`. Nếu biến này chưa được đặt, fetcher dừng ngay với thông báo lỗi, trước khi gửi request nào (C-13).
- Gửi `Accept-Encoding: gzip` (mặc định của httpx; test phải xác nhận header có mặt).
- Không xác thực (không bot password, không OAuth).

*Tốc độ và concurrency*

> **Ghi chú (v2.2, sửa ở v2.10):** các con số 0,32 giây, 30 giây, 5 lần retry và công thức backoff dưới đây là **policy nội bộ của fetcher** (C-10), không phải giá trị Wikimedia bắt buộc. Khoảng cách 0,32 giây (tối đa 187,5 request/phút, khoảng 3,1 request/giây) là lựa chọn conservative để nằm dưới các giới hạn hiện hành cho client không xác thực có User-Agent hợp lệ: concurrency 1 và dưới 5 request/giây (Robot policy), và 200 request/phút (Wikimedia APIs/Rate limits, áp dụng từ 2026, có thể thay đổi). Nếu Wikimedia thay đổi giới hạn, cập nhật §6.4 và changelog trước khi đổi code.

- **Tuần tự tuyệt đối:** tại mọi thời điểm có tối đa một request đang chờ phản hồi. Không có tùy chọn chạy song song. Dùng `httpx.Client` đồng bộ trong một vòng lặp; không dùng `asyncio`/`Semaphore` (C-11).
- **Dưới giới hạn của Wikimedia:** khoảng cách tối thiểu giữa hai lần bắt đầu request là **0,32 giây** (C-10, sửa ở v2.10; tối đa 187,5 request/phút, dưới giới hạn 200 request/phút và dưới 5 request/giây). Đây cũng là ngưỡng tối thiểu cho phép *(v2.11)*: cấu hình được nhưng mọi giá trị **nhỏ hơn 0,32 giây bị từ chối**; đúng 0,32 giây được phép.
- Timeout 30 giây cho mỗi request (C-10). *(v2.14, C-15)* Hết timeout là một lỗi transport và được retry (xem "Lỗi và retry").

*Lỗi và retry*
- **Lỗi maxlag** có thể được trả về với **HTTP 200** và body JSON có `error.code == "maxlag"`. Vì vậy **mọi** response, kể cả HTTP 200, phải được kiểm tra `error.code` trong body trước khi coi là thành công; không chỉ dựa vào status code. Lỗi maxlag được chờ theo quy tắc bên dưới rồi retry.
- **HTTP 429** và **5xx**: chờ theo quy tắc bên dưới rồi retry.
- **Lỗi transport** *(v2.14, C-15)*: một request không nhận được response hoàn chỉnh vì lỗi ở tầng kết nối (ví dụ server ngắt kết nối mà không trả response) được chờ theo quy tắc bên dưới rồi retry. Các loại được retry, theo tên exception của `httpx`: `RemoteProtocolError`, `ReadError`, `WriteError`, `ConnectError` và `TimeoutException` (gồm timeout 30 giây). Mọi `HTTPError` khác không nằm trong danh sách này (ví dụ `LocalProtocolError`, `UnsupportedProtocol`, `DecodingError`, `TooManyRedirects`) **không** retry: dừng với lỗi, không ghi file.
- **Retry gửi lại đúng request** *(C-15)*: cùng URL, cùng tham số (gồm `maxlag=5` và, khi đang phân trang, đúng object `continue` của lần lỗi). Lần thử lỗi không đóng góp dữ liệu nào; sau khi retry thành công fetcher tiếp tục đúng continuation. Mỗi lần thử, kể cả lần thử lại, là một request bắt đầu và chịu khoảng cách tối thiểu 0,32 giây (C-10).
- **Thời gian chờ** trước lần retry thứ `n` (n bắt đầu từ 1) = `max(Retry-After nếu có, 5 × 2^(n-1) giây)`. Khi Wikimedia trả `Retry-After`, **phải** tôn trọng giá trị đó, kể cả khi giá trị lớn hơn backoff nội bộ; ghi log thời gian chờ. *(C-15)* Lỗi transport không có response nên không có `Retry-After`: thời gian chờ chỉ là `5 × 2^(n-1)` giây (5, 10, 20, 40, 80).
- Tối đa 5 lần retry cho một request (C-10), **tính chung cho mọi nguyên nhân** (429, 5xx, maxlag, lỗi transport), tức tối đa 6 lần thử *(C-15)*. Hết số lần retry → fetcher dừng với lỗi, **không ghi** file output nào (C-9).
- Các lỗi khác (4xx khác 429, body có `error` khác `maxlag`, JSON không parse được, `HTTPError` ngoài danh sách C-15) không retry: dừng với lỗi, không ghi file.
- Mọi lỗi và cảnh báo trong body (`warnings`) được ghi log.

*Dữ liệu*
- Tiêu đề lấy từ API được dùng nguyên dạng (dấu cách); fetcher không tự chuyển đổi `_`/dấu cách. Nếu có chỗ nào phải chuyển (ví dụ đọc từ URL), việc đó chỉ nằm trong fetcher.
- NFC-normalize mọi tiêu đề trước khi ghi.
- Ghi file theo đúng §6.1, §6.2, §6.3.
- *(C-8, đã duyệt ở v2.12)* Entry có `alias == target` (so sánh chính xác, sau NFC; áp dụng cho mọi `source`) **bị bỏ**, không ghi vào `aliases.json`. Nó không phải lỗi dữ liệu; canonical identity không đổi. Trường hợp thật: jawiki có redirect mang tên tiếng Anh, ví dụ `Albert Einstein` → bài Einstein.
- *(Q-11, v2.12)* `thumbnail` được ghi đúng URL mà API trả về, không cắt `utm_*`, không sửa kích thước (§6.2).
- *(C-14, v2.12)* `aliases.json` được ghi đã sắp xếp theo `(alias, target, source)` và ổn định: cùng dữ liệu API thì cùng từng byte, bất kể thứ tự trả về hay cách phân trang/continuation của API.
- *(C-9, đã duyệt ở v2.7; làm rõ ở v2.8)* **Output là transactional ở mức dataset (ba file `graph.json`, `people.json`, `aliases.json`):**
  1. Fetch và validate toàn bộ ba file (các kiểm tra của §6.5) trước khi commit output.
  2. Ghi output vào staging/tạm trước; không ghi trực tiếp lên các file `data/` hiện tại.
  3. Chỉ sau khi cả ba file đã được ghi thành công và validate thành công mới thay thế dataset hiện tại.
  4. Validator fail → không ghi file output nào, dữ liệu cũ giữ nguyên. Nếu một bước ghi hoặc thay thế thất bại trong khi fetcher đang chạy bình thường → rollback hoặc giữ nguyên dataset cũ; fetcher không chủ động để `data/` ở trạng thái partial hoặc lẫn giữa dữ liệu mới và cũ.
  5. **Ngoài guarantee:** crash hoặc mất điện đúng giữa các thao tác thay thế nhiều file không thuộc guarantee của C-9. Không xây generation/manifest system hay database chỉ để giải quyết crash consistency.
  - Vị trí staging, việc fetcher dùng module validator nào và cơ chế thay thế cụ thể không thuộc contract; SPEC chỉ yêu cầu các điểm trên.

*Thời gian chạy:* với dataset khoảng 10k người và tốc độ trên, một lần fetch có thể mất từ vài chục phút tới vài giờ tùy số request continuation. Điều này được chấp nhận vì fetcher chạy tay, không nằm trên đường request của production.

*Nguồn tham chiếu (kiểm tra ngày 2026-09-18; implement phải đối chiếu lại):*
- Wikitech — Robot policy: Action API, client không xác thực: concurrency 1, dưới 5 request/giây.
- mediawiki.org — Wikimedia APIs/Rate limits: giới hạn toàn cục áp dụng từ 2026; tôn trọng `Retry-After` khi nhận 429; User-Agent có thông tin liên hệ. *(kiểm tra ngày 2026-09-19, v2.10)* client không xác thực có User-Agent hợp lệ: 200 request/phút.
- mediawiki.org — API:Etiquette: gửi request tuần tự; gộp nhiều tiêu đề; dùng gzip.
- mediawiki.org — Manual:Maxlag parameter: `maxlag=5`; lỗi maxlag trả HTTP 200; header `Retry-After`; chờ ít nhất 5 giây.
- Wikimedia Foundation — User-Agent Policy: định dạng User-Agent và yêu cầu thông tin liên hệ của người vận hành.

### 6.5 Startup validation (`backend/app/data.py`)
Khi khởi động, loader kiểm tra:
- G-1..G-5, P-1..P-3, A-1..A-4;
- A-7: `aliases.json` sắp xếp theo `(alias, target, source)` *(C-14, v2.12; kiểm sau A-4)*;
- mọi tên và alias ở dạng NFC.

*(v2.3, sửa ở v2.12)* G-6 và A-6 (C-7) chưa duyệt nên loader **không** kiểm tra (A-7 đã duyệt, C-14, nên được kiểm); khi được duyệt, thêm vào danh sách trên. A-5 đã bị bỏ (C-8, v2.12): `alias == target` không phải lỗi và loader chấp nhận.

Kiểm tra `dist/index.html` và placeholder `<!--OG-->` (§5.5) là một hàm riêng, **chỉ được gọi khi `/share` được bật** (chế độ Phase 2+, §0.3); loader dữ liệu ở trên không gọi nó. Ở chế độ Phase 1 (`/share` bị tắt tường minh), app khởi động được khi chưa có `dist/`. *(v2.2, viết lại ở v2.5)* Khi `/share` được bật mà `dist/index.html` thiếu hoặc không hợp lệ → raise lỗi, app không khởi động; không được bỏ route `/share` một cách âm thầm. *(v2.5, Q-5, Q-8)*

Bất kỳ vi phạm nào → raise lỗi với thông báo chỉ rõ tên/entry và vi phạm, app không khởi động. Không tự sửa dữ liệu lúc runtime.

Sau khi validate, loader dựng `ResolverIndex` (§4A) và ghi log (không fail): số alias theo từng `source`, số match key mơ hồ.

### 6.6 Dataset trong image Docker *(mới ở v2.13, Q-17)*
- **Cấu hình runtime của image:** `DATA_DIR=/app/data` (đặt trong Dockerfile). `DIST_DIR` (Q-10) phải trỏ tới bản build frontend nằm trong image; vị trí cụ thể không thuộc contract.
- **Dataset chính thức** là ba file `graph.json`, `people.json`, `aliases.json` (§6.1–6.3) trong thư mục `data/` của build context, được **copy vào `/app/data` lúc build image**. Dataset không được tải, sinh hay chỉnh lúc khởi động, và không cần volume hay mount lúc chạy.
- **Image không chứa và không chạy fetcher** (không cài extra `fetcher`, tức không có `httpx`). Production runtime không gọi mạng (ADR-009).
- Dữ liệu thiếu hoặc vi phạm §6.5 → app không khởi động, nên container thoát ngay (fail fast). Không có cơ chế sửa dữ liệu lúc chạy.
- **Đổi dataset = build lại image.**
- **Dataset chính thức hiện tại** *(ghi nhận ở v2.15, không phải contract)*: **9.997 people / 427.057 edges / 119.335 aliases** (`en_redirect` 98.578, `ja_redirect` 12.347, `ja_title` 8.410; 0 match key mơ hồ), sinh bởi fetcher từ 10.000 seed (3 seed được gộp vì là redirect của một seed khác) và đã commit ở `844123a`. Con số này có thể đổi mỗi khi dataset được fetch lại; chỉ các invariant của §6.1–6.5 là contract.
- Phase 4 **không tạo, không sửa và không chọn** dataset. Việc xác nhận nội dung `data/` là dataset chính thức là quyết định riêng của chủ project.
- Dockerfile **không có test ID tự động** ở v2.13; kiểm bằng `docker build` và chạy container thủ công, và không thuộc coverage của §7.0.

---

## 7. Test cases

### 7.0 Pha của từng nhóm test *(v2.2)*
| Nhóm | Pha |
|---|---|
| BFS-*, RES-*, SCH-01..08, API-*, PTH-01..10, DAT-01..07, DAT-09..16 | 1 |
| SHR-*, PTH-11, DAT-08, DAT-17, DAT-18 | 2 |
| FET-* | 3 |
| FE-* | 4 |
| SPA-* | 4 |

Quy tắc viết test: §0.2.

*(v2.13)* Hai hàng của pha 4 do hai công cụ kiểm coverage khác nhau: **FE-\*** do cơ chế của frontend (§7.9, Q-16); **SPA-\*** do `backend/tests/conftest.py` như các pha trước. Cả hai đọc bảng này từ SPEC.md, không hardcode. Xem N-3.

**Coverage bắt buộc của một pha** *(v2.3)* = các ID thuộc pha đó (bảng trên) **trừ** các ID có phạm vi "toàn bộ" trong bảng dưới. ID có phạm vi "một phần" vẫn bắt buộc, nhưng test không kiểm tra phần phụ thuộc điểm chưa duyệt. `backend/tests/conftest.py` đọc trực tiếp hai bảng này từ SPEC.md để tính coverage; không được hardcode danh sách ở nơi khác.

#### Test ID phụ thuộc điểm chưa duyệt
| ID | Phụ thuộc | Phạm vi | Phần phụ thuộc |
|---|---|---|---|
| API-17 | C-3 | toàn bộ | input chỉ gồm khoảng trắng ở `/api/search` |
| DAT-10 | C-7 | toàn bộ | G-6 |
| DAT-15 | C-7 | một phần | A-6 |
| API-08 | C-4 | một phần | trường hợp "dài 256 ký tự" |

Khi một điểm được duyệt, xóa dòng tương ứng khỏi bảng này (và ghi changelog); ID đó trở thành bắt buộc.

Công cụ: `pytest` + `fastapi.testclient.TestClient`. Test dùng **fixture nhỏ tự viết** trong `backend/tests/fixtures/`, không dùng file dữ liệu thật và không gọi mạng.

### 7.1 Fixture
**Graph** bao phủ:
- đường thẳng `A → B → C → D`;
- đường tắt để kiểm tra "ngắn nhất": `A → E → D` (khoảng cách A→D là 2);
- chu trình: `C → A`;
- cạnh một chiều: `D → F`, không có `F → D`;
- node không có cạnh ra: `F`;
- thành phần rời: `X → Y`;
- tên đặc biệt: `Earth, Wind & Fire`, `Florence + the Machine`, `Prince (musician)`, `Who? (band)`, `Beyoncé`, `Nguyễn Du`, `AC/DC` — nối vào graph sao cho có path đi qua chúng;
- *(v2)* `Shinzo Abe` nối vào graph;
- *(v2)* hai canonical name khác nhau nhưng có cùng match key (ví dụ `X²` và `X2`, vì NFKC chuyển `²` thành `2`).

**Aliases** *(v2)* bao phủ:
- `Abe Shinzo` → `Shinzo Abe` (`en_redirect`);
- `安倍晋三` → `Shinzo Abe` (`ja_title`);
- `安倍 晋三` → `Shinzo Abe` (`ja_redirect`);
- cùng alias trỏ về cùng target từ hai `source` khác nhau;
- một alias xung đột trỏ tới hai người khác nhau;
- một alias của người X có match key trùng canonical name của người Y;
- một alias tiếng Nhật chỉ có dạng không dấu cách (không có biến thể có dấu cách);
- *(v2.1)* một alias có match key `X2` trỏ tới một người thứ ba (dùng cho RES-21).

### 7.2 BFS (thuần, không API)
| ID | Case | Kiểm tra |
|---|---|---|
| BFS-01 | A→D | found, length=2 (qua E), F-1..F-7 |
| BFS-02 | A→A | S-1 |
| BFS-03 | F→A (F không có cạnh ra) | S-2, N-1..N-3 |
| BFS-04 | A→X (khác thành phần) | found=False, N-2 đúng tập reachable |
| BFS-05 | D→F đúng, F→D không có | S-3 |
| BFS-06 | Graph có chu trình | kết thúc, I-2 |
| BFS-07 | Chạy cùng input nhiều lần | kết quả giống hệt (I-6) |
| BFS-08 | Kết thúc sớm | target là phần tử cuối của level cuối (F-6); các node chưa phát hiện cùng depth không có mặt |
| BFS-09 | Mọi cặp (start, target) trong fixture | I-1..I-5 luôn đúng; nếu found thì length bằng khoảng cách tính bằng brute force |
| BFS-10 | start hoặc target không có trong graph | raise `ValueError` |

### 7.3 Resolver (thuần, không API) *(mới ở v2)*
| ID | Input | Kỳ vọng |
|---|---|---|
| RES-01 | `Shinzo Abe` | resolved (exact canonical) |
| RES-02 | `Abe Shinzo` | resolved → `Shinzo Abe` (en_redirect) |
| RES-03 | `安倍晋三` | resolved → `Shinzo Abe` (ja_title) |
| RES-04 | `安倍 晋三` | resolved → `Shinzo Abe` (ja_redirect) |
| RES-05 | `安倍　晋三` (dấu cách toàn góc U+3000) | resolved → `Shinzo Abe` qua match key khớp `安倍 晋三` |
| RES-06 | alias chỉ có dạng không dấu cách, input thêm dấu cách | unresolved (match key không xóa khoảng trắng) |
| RES-07 | katakana nửa góc của một alias katakana toàn góc | resolved (NFKC) |
| RES-08 | `  Shinzo   Abe  ` | resolved qua bước 2 (canonical theo match key) |
| RES-09 | `shinzo abe` | unresolved (không case-folding) |
| RES-10 | `Shinzo_Abe` | unresolved (`_` khác dấu cách) |
| RES-11 | alias xung đột | ambiguous, `candidates` đúng hai người, đã sắp xếp |
| RES-12 | alias trùng target từ hai source | resolved, không ambiguous (R-2) |
| RES-13 | alias của X trùng match key canonical của Y | resolved → Y (R-1) |
| RES-14 | chuỗi chỉ gồm khoảng trắng | unresolved |
| RES-15 | tên không có trong dữ liệu | unresolved |
| RES-16 | mọi alias trong fixture | kết quả resolved/ambiguous chỉ chứa tên có trong graph (R-3) |
| RES-17 | `match_key` áp lên mọi canonical name trong fixture | resolve canonical name luôn cho chính nó, kể cả khi NFKC làm thay đổi chuỗi (ví dụ tên chứa ký tự `²`); identity không bị đổi |
| RES-18 | chạy cùng input nhiều lần | kết quả giống hệt (R-5) |
| RES-19 | `X2 ` (có dấu cách cuối): không khớp exact, match key `X2` trùng với match key của cả `X²` và `X2` | ambiguous, `candidates == ["X2", "X²"]` (bước 2); còn input chính xác `X²` hoặc `X2` thì resolved về chính nó (bước 1) |
| RES-20 | *(v2.1)* dựng index từ cùng dữ liệu nhưng xáo trộn thứ tự key của graph và thứ tự entry của aliases (nhiều seed khác nhau) | mọi input trong §7.1 cho kết quả giống hệt, kể cả thứ tự `candidates` (R-7) |
| RES-21 | *(v2.1)* `X2 ` khi có alias match key `X2` trỏ tới người thứ ba | ambiguous giữa `X2` và `X²`; người thứ ba không có trong `candidates` (bước 2 dừng, không xét alias) |

### 7.4 Schema / serialization
| ID | Kiểm tra |
|---|---|
| SCH-01 | JSON của `SearchResponse` có key `"from"`, không có `"from_"` |
| SCH-02 | `/openapi.json`: schema `SearchResponse` có property `from` |
| SCH-03 | Khởi tạo được model bằng `from_=...` trong Python |
| SCH-04 | `/openapi.json`: `GET /api/search` khai báo response 404 với schema `ErrorResponse`; `code` enum đúng hai giá trị `UNRESOLVED_NAME`, `AMBIGUOUS_NAME` |
| SCH-05 | Response `found=false` vẫn có đủ mọi field (`length` là `null`, `path` là `[]`) |
| SCH-06 | *(v2)* `/openapi.json` có `GET /api/resolve` với response `ResolveResponse` |
| SCH-07 | *(v2)* `ResolveResponse` và `ErrorDetail` luôn có đủ mọi field |
| SCH-08 | *(sửa ở v2.3)* `/openapi.json` có `GET /api/path` với response 200 là `PathResponse`. OpenAPI **có thể** chứa response `422` do FastAPI tự sinh cho query validation; test không được yêu cầu có hay không có entry đó, và không được tùy biến OpenAPI để loại bỏ nó. Entry 422 trong OpenAPI không thay đổi runtime contract: `/api/path` vẫn luôn trả 200 `PathResponse`, path không hợp lệ → `valid=false` (xem PTH-02..08) |

### 7.5 API
| ID | Request | Kỳ vọng |
|---|---|---|
| API-01 | `GET /api/people` | 200, list đã sắp xếp, bằng tập key của graph, không chứa alias |
| API-02 | search A→D | 200, found=true, `length == len(path)-1`, `path[i].name` khớp BFS |
| API-03 | search A→X | 200, found=false, `levels` không rỗng, `nodes_explored == sum(len(levels))` |
| API-04 | search A→A | 200, found=true, length=0, path có 1 phần tử |
| API-05 | `from` không resolve được | 404, `code=UNRESOLVED_NAME`, `param=from`, `input` đúng, `candidates=[]` |
| API-06 | `from` hợp lệ, `to` không resolve được | 404, `param=to` |
| API-07 | cả hai không resolve được | 404, `param=from` |
| API-08 | thiếu `from` / `to` rỗng / dài 256 ký tự | 422. *(v2.3)* Phần "dài 256 ký tự" phụ thuộc C-4 (chưa duyệt), không test ở pha 1 |
| API-09 | tên có `&`, `+`, `?`, `(`, `/`, Unicode | encode bằng chuẩn → 200, tra đúng người |
| API-10 | tên gửi ở dạng NFD (`Nguyễn Du` phân tách) | được NFC-normalize, 200 |
| API-11 | `PersonMeta` với thumbnail/description null trong people.json | response trả `null`, không phải `""` |
| API-12 | gửi `Albert_Einstein` | 404, `code=UNRESOLVED_NAME` (`_` khác dấu cách) |
| API-13 | *(v2)* `from=安倍晋三` | 200, `from == "Shinzo Abe"`, `path[0].name == "Shinzo Abe"` |
| API-14 | *(v2)* `from=Abe Shinzo` | 200, `from == "Shinzo Abe"` |
| API-15 | *(v2)* `from=安倍晋三&to=Abe Shinzo` | 200, found=true, length=0 |
| API-16 | *(v2)* `from` là alias xung đột | 404, `code=AMBIGUOUS_NAME`, `candidates` ≥ 2, đã sắp xếp, là `PersonMeta` đầy đủ |
| API-17 | *(v2; phụ thuộc C-3 — chưa duyệt)* `from` chỉ gồm khoảng trắng | 404, `UNRESOLVED_NAME` |
| API-18 | *(v2)* `GET /api/resolve?q=安倍晋三` | 200, `status=resolved`, `person.name == "Shinzo Abe"`, `candidates=[]` |
| API-19 | *(v2)* `GET /api/resolve` với input unresolved / ambiguous | 200, `status` tương ứng, `person=null`; `candidates` đúng theo §2 |
| API-20 | *(v2)* mọi input trong §7.1, *(v2.3)* trừ input thuộc phạm vi chưa quy định (chỉ gồm khoảng trắng, rỗng, dài hơn 255 ký tự) | `/api/resolve` và `/api/search` cho cùng kết quả resolve; không có request mạng nào được thực hiện (chặn network trong test) |
| API-21 | *(v2.3)* `GET /api/resolve` không có `q` | 422 |

### 7.6 Share
| ID | Request | Kỳ vọng |
|---|---|---|
| SHR-01 | path hợp lệ | 200 `text/html`; HTML chứa `og:title`, `og:description`, `og:url` đúng; không còn `<!--OG-->`. *(v2.6, Q-9)* `n` trong `og:title` là số cạnh (`len(path) - 1`): path `A → E → D` cho `og:title` = `"A → D: 2 bước"` |
| SHR-02 | người đầu không có thumbnail | không có tag `og:image` |
| SHR-03 | cạnh không tồn tại (path bị sửa) | *(v2.4)* 200 `text/html`; placeholder thay bằng chuỗi rỗng → không còn `<!--OG-->`, không có `og:title`/`og:description`/`og:image`/`og:url` do server sinh; meta tĩnh của `dist/index.html` vẫn còn nguyên |
| SHR-04 | tên không tồn tại | *(v2.4)* như SHR-03 |
| SHR-05 | 1 phần tử `p` | *(v2.4)* 200 `text/html`, OG mặc định (như SHR-03) |
| SHR-06 | 11 phần tử `p` | *(v2.4)* 200 `text/html`, OG mặc định (như SHR-03) |
| SHR-07 | một phần tử dài 256 ký tự | *(v2.4)* 200 `text/html`, OG mặc định (như SHR-03) |
| SHR-08 | tên chứa `<script>`, `"`, `&` | được escape trong HTML, không phá vỡ thuộc tính |
| SHR-09 | tên chứa `&`, `+`, `?`, Unicode | round-trip: URL tạo bằng `urlencode(doseq=True)` → parse lại → đúng danh sách tên |
| SHR-10 | `og:url` | dựng từ tên đã validate, không chứa param lạ từ request gốc |
| SHR-11 | *(v2)* share URL dựng từ response của search với input `安倍晋三` | chỉ chứa `p=Shinzo+Abe`, không chứa ký tự tiếng Nhật |
| SHR-12 | *(v2)* `p=安倍晋三` hoặc `p=Abe Shinzo` (alias) trong path có cạnh đúng | không hợp lệ (share không đi qua resolver) |
| SHR-13 | *(v2.4)* không có `p` nào | 200 `text/html`, OG mặc định (như SHR-03); không phải 422 — đối xứng với PTH-08 |
| SHR-14 | *(v2.5, Q-6)* path hợp lệ, request tới các base URL khác nhau (khác scheme/host/port; và một request có `root_path`) | `og:url` bắt đầu bằng base URL của request đó (scheme, host, `root_path` nếu có), theo sau là `/share?` và query dựng lại từ tên đã validate; không có cấu hình origin nào khác |

### 7.6A Path validation (`/api/path` và `validate_path`) *(mới ở v2.1)*
| ID | Request | Kỳ vọng |
|---|---|---|
| PTH-01 | path hợp lệ A→E→D | 200, `valid=true`, `path` là `PersonMeta` đúng thứ tự |
| PTH-02 | cạnh không tồn tại | 200, `valid=false`, `path=[]` |
| PTH-03 | tên không có trong graph | 200, `valid=false` |
| PTH-04 | alias (`安倍晋三`, `Abe Shinzo`) hoặc tên có `_` trong path có cạnh đúng | 200, `valid=false` (không đi qua resolver) |
| PTH-05 | 1 phần tử `p` | 200, `valid=false` |
| PTH-06 | 11 phần tử `p` | 200, `valid=false` |
| PTH-07 | một phần tử dài 256 ký tự | 200, `valid=false` |
| PTH-08 | không có `p` | 200, `valid=false` (không phải 422) |
| PTH-09 | tên gửi ở dạng NFD | được NFC-normalize, `valid=true` nếu path đúng |
| PTH-10 | tên có `&`, `+`, `?`, `(`, `/`, Unicode, encode bằng `URLSearchParams` | round-trip đúng, `valid=true` |
| PTH-11 | *(pha 2)* bảng input dùng chung cho SHR-01..07, SHR-12, SHR-13 và PTH-01..09 | với mọi input, `/api/path` trả `valid=true` khi và chỉ khi `/share` sinh OG của path hợp lệ; cả hai gọi `validate_path` (kiểm tra bằng spy/mock) |

### 7.7 Data loader
| ID | Dữ liệu fixture lỗi | Kỳ vọng |
|---|---|---|
| DAT-01 | adjacency trỏ tới tên không phải key (vi phạm G-2) | fail khi khởi động |
| DAT-02 | self-loop | fail |
| DAT-03 | trùng lặp trong adjacency | fail |
| DAT-04 | adjacency chưa sắp xếp | fail |
| DAT-05 | key của people.json khác graph.json | fail |
| DAT-06 | tên không ở dạng NFC | fail |
| DAT-07 | `thumbnail: ""` | fail |
| DAT-08 | *(pha 2; mở rộng ở v2.5, Q-8)* khi `/share` được bật, `dist/index.html` có số `<!--OG-->` khác một (thiếu hoặc thừa), hoặc `<!--OG-->` nằm ngoài `<head>` (cả ba nhóm thiếu / thừa / ngoài `<head>` đều phải có test) | fail khi khởi động, thông báo nêu vi phạm |
| DAT-09 | dữ liệu hợp lệ | load thành công |
| DAT-10 | *(v2; phụ thuộc C-7 — chưa duyệt)* canonical name chứa `_` (G-6) | fail |
| DAT-11 | *(v2)* alias có `target` không phải key của graph (A-1) | fail |
| DAT-12 | *(v2)* alias rỗng, không NFC, hoặc match key rỗng (A-2) | fail |
| DAT-13 | *(v2)* `source` không hợp lệ (A-3) | fail |
| DAT-14 | *(v2; sửa ở v2.12)* entry trùng lặp hoàn toàn (A-4) | fail. *(C-8, v2.12)* Entry có `alias == target` **không** phải lỗi: load thành công (A-5 đã bị bỏ); test `alias == target` nạp được và resolver vẫn phân giải đúng |
| DAT-15 | *(v2; sửa ở v2.12)* mảng alias chưa sắp xếp theo `(alias, target, source)` (A-7, C-14 đã duyệt); alias chứa `_` (A-6) phụ thuộc C-7 (chưa duyệt) | fail. Phần A-6 không test cho tới khi C-7 được duyệt |
| DAT-16 | *(v2)* alias xung đột | load thành công, log số match key mơ hồ |
| DAT-17 | *(pha 2; v2.5, Q-5)* `/share` được bật (chế độ Phase 2+) nhưng `dist/index.html` không tồn tại | fail khi khởi động, thông báo nêu đường dẫn thiếu; route `/share` không bị bỏ âm thầm |
| DAT-18 | *(pha 2; v2.5, Q-5)* `enable_share=False` (chế độ Phase 1), không có `dist/` (kể cả khi `dist/index.html` tồn tại nhưng không hợp lệ, `/share` vẫn không được đăng ký và không bị kiểm tra) | app khởi động thành công; `/api/*` hoạt động; không có route `/share` (`GET /share` → 404); không kiểm tra placeholder; kết quả không phụ thuộc biến môi trường hay thư mục làm việc |

### 7.8 Fetcher (không gọi mạng)
Dùng response JSON của MediaWiki API đã ghi sẵn làm fixture và mock HTTP client.
| ID | Kiểm tra |
|---|---|
| FET-01 | continuation gộp đủ link từ nhiều trang |
| FET-02 | link tới trang redirect được resolve về canonical name |
| FET-03 | seed là redirect được resolve; seed trùng sau resolve được gộp |
| FET-04 | seed không tồn tại bị loại và ghi log |
| FET-05 | metadata batch: trang không có ảnh → `thumbnail: null`. *(Q-11, v2.12)* URL thumbnail trả về được ghi nguyên văn, kể cả query `utm_*` và cỡ ảnh khác `pithumbsize` |
| FET-06 | *(sửa ở v2.1, v2.14)* 429 và 5xx được retry; response HTTP 200 có `error.code == "maxlag"` được nhận ra là lỗi maxlag và retry; body có `error` khác không retry; hết 5 lần retry thì dừng và không ghi file. *(C-15)* mỗi lỗi transport trong danh sách (`RemoteProtocolError`, `ReadError`, `WriteError`, `ConnectError`, `TimeoutException`) được retry và request được gửi lại đúng nguyên; `LocalProtocolError` không retry (một lần thử rồi dừng với lỗi, không ghi file) |
| FET-07 | *(sửa ở v2.7)* output thỏa mãn G-1..G-5, P-1..P-3, A-1..A-4 và A-7 (các kiểm tra của §6.5; A-7 từ C-14, v2.12). Không test G-6 và A-6 (C-7) cho tới khi được duyệt; A-5 đã bị bỏ (C-8, v2.12). *(C-14)* Tính ổn định: hai lần chạy trên cùng dữ liệu API, kể cả khi API phân trang/continuation khác nhau, cho `aliases.json` (và hai file kia) giống hệt từng byte |
| FET-08 | *(v2)* langlinks `ja` sinh `ja_title`; người không có langlink `ja` không sinh alias |
| FET-09 | *(v2)* continuation khi một request có nhiều prop (`langlinks`, `redirects`) gửi lại toàn bộ tham số `continue` |
| FET-10 | *(v2)* en redirect sinh `en_redirect` cho đúng target |
| FET-11 | *(v2)* langlink trỏ tới redirect trên jawiki: `ja_title` là bài đích, tiêu đề gốc thành `ja_redirect` |
| FET-12 | *(v2)* langlink trỏ tới trang không tồn tại trên jawiki: bị bỏ, ghi log |
| FET-13 | *(v2)* hai target cùng `ja_title`: xung đột được giữ nguyên, `ja_redirect` sinh cho cả hai target |
| FET-14 | *(sửa ở v2.1, v2.7)* mọi request là `GET`, có `maxlag=5`, `format=json`, `formatversion=2`, header `User-Agent` đúng định dạng và chứa giá trị `WIKI_UA_CONTACT`, header `Accept-Encoding` có `gzip`, timeout 30 giây; output thỏa mãn A-1..A-4 và A-7 (không test A-6 cho tới khi C-7 được duyệt; A-5 đã bị bỏ, C-8; A-7 từ C-14). *(C-9, v2.7)* validator fail → không ghi file output nào, ba file cũ nguyên vẹn |
| FET-15 | *(v2.1; v2.14)* thời gian chờ retry = `max(Retry-After, 5 × 2^(n-1))`: `Retry-After` lớn hơn backoff thì dùng `Retry-After`; không có header thì dùng backoff (dùng đồng hồ giả, không sleep thật). *(C-15)* lỗi transport không có response nên không có `Retry-After`: các lần chờ liên tiếp là 5, 10, 20, 40, 80 giây; cap 5 retry dùng chung cho mọi nguyên nhân (429/5xx/maxlag trộn với lỗi transport vẫn tối đa 6 lần thử) |
| FET-16 | *(v2.1; sửa ở v2.10)* không bao giờ có hai request chờ phản hồi cùng lúc; khoảng cách giữa hai lần bắt đầu request ≥ 0,32 giây, tức không quá 187,5 request/phút (đồng hồ giả); giá trị mặc định của cấu hình là 0,32 giây |
| FET-17 | *(v2.1; sửa ở v2.11)* cấu hình khoảng cách < 0,32 giây bị từ chối khi khởi động fetcher (gồm 0,31, 0,3, 0,25, 0,2, 0 và số âm), trước khi gửi request nào; đúng 0,32 giây được chấp nhận |
| FET-18 | *(v2.1)* thiếu `WIKI_UA_CONTACT` → fetcher dừng trước khi gửi request đầu tiên |
| FET-19 | *(v2.8, C-9)* lỗi ghi/thay thế được inject ở file output thứ hai (thứ tự ghi do implementation chọn; không cần mạng) | fetcher dừng với lỗi; sau đó ba file `data/` hiện tại có nội dung y như trước (dataset cũ nguyên vẹn); không có output partial nào được coi là dataset mới, tức không có file mới nào nằm ở vị trí production. Một ID có thể có nhiều test (§0.2), nên có thể thêm ca lỗi ở bước thay thế |
| FET-20 | *(v2.12, C-8)* dữ liệu API cho ra entry có `alias == target` (ví dụ một redirect jawiki mang tên tiếng Anh của người đó, hoặc ja title trùng canonical name) | không có entry `alias == target` nào trong `aliases.json`; các entry khác của cùng người vẫn còn; canonical name trong `graph.json` và `people.json` không đổi; output vẫn qua các kiểm tra của §6.5 |
| FET-21 | *(v2.14, C-15)* một request của một trang phân trang (continuation) bị lỗi transport (ví dụ `RemoteProtocolError`) rồi lần thử lại thành công; và ca lỗi liên tục ở cùng request | lần thử lại dùng đúng nguyên URL, tham số và object `continue` của lần lỗi; fetcher tiếp tục đúng continuation (không bỏ, không lặp trang) và ba file output giống hệt từng byte lần chạy đối chứng không có lỗi. Lỗi liên tục: đúng 6 lần thử (1 + 5 retry) rồi dừng với lỗi; ba file `data/` cũ nguyên vẹn, không còn staging, không có output partial (C-9) |

### 7.9 Frontend (mức tối thiểu)

**Công cụ và marker** *(v2.13, Q-13, Q-16)*: Vitest + Testing Library (ADR-014). Test không gọi mạng thật; `fetch` chưa được mock làm test fail (§0.2).
- **Gắn ID:** tên đầy đủ của test (các `describe` bao quanh nối với tiêu đề `it`/`test`) chứa một hoặc nhiều thẻ `@spec FE-NN`, ví dụ `it("@spec FE-01 round-trip tên đặc biệt", ...)`. Một test có thể mang nhiều ID; một ID có thể có nhiều test.
- **Cơ chế kiểm tra đủ ID** là một phần bắt buộc của bộ test frontend (cách viết, tên file và vị trí trong `frontend/` không thuộc contract), và phải:
  1. lấy danh sách FE-ID bắt buộc **trực tiếp từ SPEC.md**: mọi ID `FE-NN` trong §7, trừ ID có phạm vi "toàn bộ" trong bảng "Test ID phụ thuộc điểm chưa duyệt" (§7.0); không hardcode danh sách ở nơi khác;
  2. báo lỗi cho thẻ `@spec` có ID không tồn tại trong §7 hoặc không có tiền tố `FE-` (tương đương `--strict-markers` và kiểm ID của `conftest.py`);
  3. coi một ID là được phủ khi có ít nhất một test mang ID đó **chạy và pass**; test bị skip, todo hoặc fail không tính;
  4. khi chạy **toàn bộ** bộ test: nếu còn ID bắt buộc chưa được phủ thì bộ test **thất bại** (exit code khác 0) và in danh sách ID thiếu. Khi chạy lọc theo file hoặc tên test thì chỉ áp dụng mục 2, không kiểm đủ.
- Bản build `dist/index.html` mà FE-05 kiểm là output của lệnh build của frontend; thiếu bản build thì FE-05 **fail**, không được skip.

| ID | Kiểm tra |
|---|---|
| FE-01 | hàm tạo share URL dùng `URLSearchParams`; round-trip với các tên đặc biệt ở §7.1 |
| FE-02 | *(v2.13, Q-15)* history hook: thêm; giữ tối đa **20 entry**, thêm entry thứ 21 thì entry cũ nhất bị bỏ (kiểm với entry khác nhau); đọc lại khi localStorage rỗng hoặc hỏng (JSON không parse được) mà không crash |
| FE-03 | *(v2)* xử lý lỗi theo `detail.code` (không parse message): `AMBIGUOUS_NAME` hiển thị `candidates`; chọn một ứng viên thì search lại bằng canonical name của ứng viên đó |
| FE-04 | *(v2.1)* trang `/share`: gọi `/api/path` với đúng danh sách `p` và không tự validate; `valid=false` và có ≥ 2 phần tử `p` thì gọi `/api/search?from={p[0]}&to={p[-1]}`; `valid=false` với < 2 phần tử thì chỉ hiển thị thông báo |
| FE-05 | *(v2.5, Q-7, Q-8; làm rõ ở v2.13)* `frontend/index.html` và bản build `dist/index.html` có đúng một `<!--OG-->` nằm trong `<head>`, và không chứa static `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card` |
| FE-06 | *(v2.13, Q-19)* `PersonMeta` có `thumbnail = null` ở mọi nơi frontend hiển thị `PersonMeta` (path của kết quả search, `candidates` của `AMBIGUOUS_NAME`, path ở trang `/share`): hiển thị placeholder do frontend chọn; **không** render `<img>` (không có `src` rỗng, `"null"` hay `"None"`) và không phát request ảnh; không crash; `name` vẫn hiển thị. Khi `thumbnail` là chuỗi thì `<img>` dùng đúng chuỗi đó nguyên văn (Q-11) |

### 7.10 Static mount và SPA fallback *(mới ở v2.13, Q-18)*
Test pytest với `TestClient`, `enable_share=True`, dùng fixture `backend/tests/fixtures/dist/` (bổ sung một file tĩnh, ví dụ `assets/app.js`, khi implement; không dùng bản build thật của frontend) và fixture dữ liệu ở §7.1. Gắn ID bằng `@pytest.mark.spec("SPA-NN")`.

| ID | Kiểm tra |
|---|---|
| SPA-01 | `GET /assets/app.js` (file có trong `DIST_DIR`): 200, body đúng nội dung file |
| SPA-02 | `GET /`, `GET /history` và `GET /a/b/c` (không phải file tĩnh, không bắt đầu bằng `/api/`, không phải `/share`): 200, `text/html`, body **bằng từng byte** `dist/index.html` (còn nguyên `<!--OG-->`) |
| SPA-03 | static mount và catch-all không che route đã đăng ký: `/api/people`, `/api/resolve`, `/api/search`, `/api/path` vẫn trả JSON theo contract; `GET /share` với path hợp lệ vẫn do route `/share` xử lý (HTML không còn `<!--OG-->`, khác nội dung nguyên văn của `index.html`) |
| SPA-04 | `GET /api/khong-ton-tai`: 404, JSON, **không** phải `index.html` |
| SPA-05 | `enable_share=False`, không có thư mục `dist/`: app khởi động được; `GET /` và `GET /history` trả 404 (không có static mount, không có catch-all) |

---

## 8. Out of scope (giai đoạn hiện tại)

- Database, đăng nhập, lịch sử đa thiết bị, thống kê toàn cục, link share rút gọn, sinh ảnh OG, WebSocket/SSE, bidirectional BFS, graph lớn hơn RAM, CI/CD tự dựng.
- *(v2, multilingual)*:
  - gọi Wikipedia/MediaWiki API từ production runtime (runtime fallback) và mọi thứ đi kèm: cache in-process cho resolver, semaphore/rate limit runtime, mã lỗi `RESOLVER_UNAVAILABLE`, `NOT_IN_GRAPH`;
  - autocomplete, `/api/suggest`, tìm kiếm tiền tố hoặc gần đúng (fuzzy);
  - case-folding, xóa khoảng trắng, coi `_` bằng dấu cách trong resolver;
  - hiển thị tên tiếng Nhật hoặc link Japanese Wikipedia (`name_ja`, `wiki_url_ja`);
  - graph Japanese Wikipedia hoặc graph riêng theo ngôn ngữ;
  - ngôn ngữ input khác ngoài tiếng Anh và tiếng Nhật;
  - Wikidata làm nguồn alias.
- *(v2.5, og:url)*: biến cấu hình origin công khai (`PUBLIC_BASE_URL`) cho `og:url` (Q-6).
- *(v2.13, Phase 4)*:
  - test e2e trong trình duyệt và test render WebGL thật (Sigma trước v2.17, `3d-force-graph`/Three.js từ v2.17) (ADR-014);
  - dataset nằm ngoài image (volume, tải lúc khởi động) và fetcher trong image (§6.6);
  - test tự động cho Dockerfile.
- *(v2.1, fetcher)*:
  - chạy song song (concurrency > 1);
  - xác thực bằng bot password hoặc OAuth để có giới hạn cao hơn;
  - khả năng tiếp tục một lần fetch bị dừng giữa chừng (resume/checkpoint); lần chạy lỗi thì chạy lại từ đầu;
  - *(v2.8, C-9)* generation/manifest system hoặc database chỉ để bảo đảm crash consistency khi thay thế nhiều file; crash/mất điện giữa các thao tác thay thế không thuộc guarantee.

---

## 9. Open questions (chưa implement cho tới khi chốt)

Hiện không còn câu hỏi mở. *(v2.5: Q-3 đã chốt; v2.13: Q-12..Q-19 đã chốt, Phase 4 mở; v2.16: Q-3 mở lại và chốt lại — UI tiếng Anh, `og:title` không đổi; v2.17: Q-14 mở lại và chốt lại — đồ thị 3D xoay được.)*

### Ghi chú kỹ thuật cần review *(v2.3)*
Không phải quyết định mở. *(v2.15: N-1 và N-2 là nợ kỹ thuật, chuyển sang mục "Nợ kỹ thuật còn lại" bên dưới.)*
- **N-3 (v2.13; đã xử lý, v2.15):** `backend/tests/conftest.py` phải loại các ID có tiền tố `FE-` khỏi coverage của pytest khi pha 4 được đưa vào, vì FE-* do cơ chế của frontend kiểm (§7.9). Đã làm ở commit `2c44232`: `required_ids` bỏ `FE-*`, `OPEN_PHASES = (1, 2, 3, 4)`, pytest chỉ báo SPA-* cho pha 4.
- **N-4 (v2.13; các lựa chọn được ghi ở v2.15):** nội dung một entry lịch sử và cách xử lý entry trùng chưa được quy định; đó là lựa chọn của implementation, **không phải contract**, và không được viết test để khóa (§0.4 nguyên tắc 4). FE-02 chỉ kiểm giới hạn 20 entry (Q-15) với entry khác nhau và khả năng chịu storage rỗng/hỏng. Cũng chưa quy định cách hiển thị `description = null` (FE-06 chỉ nói về `thumbnail`). **Các lựa chọn hiện tại của implementation** (có thể đổi mà không đổi SPEC; không test nào khóa chúng, các test của `tests/search-history.test.tsx` chỉ quan sát qua giao diện):
  - một entry là cặp `{from, to}` **tên canonical lấy từ response** của search, không phải chữ đã gõ;
  - lưu trong `localStorage` với key `sixth-degree.history`, entry mới nhất đứng đầu;
  - một search có câu trả lời (HTTP 200, kể cả `found=false`) được lưu; search lỗi (`UNRESOLVED_NAME`, `AMBIGUOUS_NAME` chưa chọn, 5xx, mất mạng) thì không;
  - bấm một entry trong lịch sử chạy lại search với hai tên đó và **không** thêm entry lần thứ hai; một search gõ tay trùng entry cũ vẫn được thêm (không loại trùng).

### Nợ kỹ thuật còn lại *(mới ở v2.15)*
Không chặn việc nào của Phase 1–4 (đã hoàn thành) và không phải quyết định mở.
- **N-1:** với các version đã pin (`fastapi==0.141.1`, `starlette==1.6.0`, `httpx==0.28.1`), `fastapi.testclient.TestClient` phát cảnh báo deprecation: `StarletteDeprecationWarning` ("dùng `httpx` với `starlette.testclient` là deprecated, nên cài `httpx2`") và một cảnh báo về alias `anyio.abc.BlockingPortal`; tức 2 cảnh báo ở mỗi lần chạy pytest. Chỉ ảnh hưởng test (`TestClient`); production runtime không dùng `httpx`, còn fetcher dùng `httpx==0.28.1` không bị ảnh hưởng. Chưa đổi dependency vì cảnh báo này; review riêng khi nâng dependency.
- **N-2 (v2.6):** guard chặn network của `backend/tests/conftest.py` chặn mọi kết nối không phải `AF_UNIX`. Trên Windows, asyncio dùng loopback TCP cho event loop nội bộ (self-pipe qua `socketpair()`), nên `TestClient` không khởi động được và test fail ngay từ đầu; chỉ chạy được khi có shim cho phép loopback đặt ngoài repo (các lần chạy pytest trên Windows đến nay đều dùng shim như vậy). Chưa xử lý. Hướng xử lý: một commit riêng cho phép loopback (`127.0.0.1`, `::1`) trong guard và vẫn chặn mọi kết nối khác, giữ nguyên yêu cầu §0.2 (mọi kết nối ra ngoài phải làm test fail). **Không sửa `conftest.py` hay network guard trong v2.15.**

### Đã chốt
- **Q-12..Q-19 (v2.13):** stack frontend (React + Vite + TypeScript; Vitest + Testing Library; Sigma.js + Graphology), history 20 entry, marker `@spec FE-NN` và cơ chế coverage FE-*, Docker `DATA_DIR=/app/data` với dataset copy vào image, static mount + SPA fallback (SPA-01..05), `thumbnail = null` (FE-06). Xem ADR-014, §3.4, §6.6, §7.9, §7.10.
- **Q-9 (v2.6):** `n` trong `og:title` = số cạnh của path = `len(path) - 1` = `SearchResponse.length` (§5.4).
- **Q-10 (v2.6):** `DIST_DIR` là cấu hình runtime chính thức, mặc định `./dist`, chỉ đọc khi `enable_share=True` (§0.3, §5.5).
- **Q-3 (v2.16, mở lại và chốt lại; trước đó v2.5):** ngôn ngữ của **UI hiển thị** là tiếng Anh. `og:title` do `/share` sinh ra **không đổi**: vẫn tiếng Việt, format giữ trong một hằng số duy nhất (§5.4).
- **Q-14 (v2.17, mở lại và chốt lại; trước đó v2.13):** đồ thị dùng `3d-force-graph` (Three.js) thay Sigma.js + Graphology — hình cầu 3D xoay được, hover hiện tên mỗi node. Dữ liệu vẫn chỉ từ `SearchResponse`, không đổi contract (ADR-014).
- **Q-5 (v2.5):** chế độ `/share` tường minh; Phase 2+ bắt buộc có `dist/index.html`, thiếu → fail fast (§0.3, §5.5, §6.5).
- **Q-6 (v2.5):** `og:url` dùng base URL của request hiện tại (scheme, host, `root_path` nếu có), không có `PUBLIC_BASE_URL` (§5.4).
- **Q-7 (v2.5):** `index.html` không chứa static OG property do `/share` tạo (§5.5).
- **Q-8 (v2.5):** đúng một `<!--OG-->`, nằm trong `<head>` (§5.5).
- **Q-2 (v2.4):** `/share` luôn trả 200 `text/html` cho mọi input; path không hợp lệ → placeholder `<!--OG-->` được thay bằng chuỗi rỗng và các meta tĩnh của `dist/index.html` giữ nguyên (§5.4). Không trả JSON 422/404 từ `/share`. `/api/path` không đổi (C-12). Pha 2 được mở.
- **Q-1 (v2.1):** thêm `GET /api/path` (§3.7), dùng chung `validate_path` với `/share` (§5.3).
- **Q-4 (v2.1):** fetcher tuần tự, concurrency = 1, dưới 5 request/giây (§6.4), theo Robot policy của Wikimedia cho client Action API không xác thực.
