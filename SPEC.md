# Six Degrees of Wikipedia (Python) — Implementation Spec

**Version:** 2.2 (duyệt C-10..C-13; phân pha implementation; quy tắc test-first)

> Tài liệu này là nguồn sự thật (source of truth) cho việc implement.
> Khi code và spec mâu thuẫn, spec thắng. Khi spec mơ hồ hoặc thiếu, **hỏi lại, không tự suy diễn**.
> Mục "Open questions" ở cuối liệt kê các điểm chưa chốt; không implement các điểm đó cho tới khi được chốt.

Project gốc tham khảo: `Rani-Codes/sixth_degree` (Go + React + sigma.js).

---

## Changelog

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
- Mỗi test gắn ID của §7 bằng marker `@pytest.mark.spec("BFS-01")` (một test có thể mang nhiều ID; một ID có thể có nhiều test). Đăng ký marker `spec` trong cấu hình pytest để marker lạ bị báo lỗi.
- Invariant trong spec (I-*, F-*, N-*, S-*, R-*, G-*, P-*, A-*) được kiểm tra thông qua các test ID tương ứng ở §7.
- Test dùng fixture tự viết trong `backend/tests/fixtures/`, không dùng dữ liệu thật và không gọi mạng. Test phải chặn network (mọi kết nối ra ngoài làm test fail).
- Kiểm tra version thực tế của FastAPI và Pydantic sau khi cài, rồi pin trong `pyproject.toml`. Mọi hành vi phụ thuộc version (alias `from`, ràng buộc trên `list[str]`) phải được khóa bằng test, không dựa vào trí nhớ.

### 0.3 Phân pha implementation
| Pha | Phạm vi | Test phải có | Trạng thái |
|---|---|---|---|
| 1 | data loader + startup validation (không gồm placeholder), BFS, resolver, `validate_path`, schema, `/api/people`, `/api/search`, `/api/resolve`, `/api/path` | BFS-*, RES-*, SCH-01..08, API-*, PTH-01..10, DAT-01..07, DAT-09..16 | **Được phép bắt đầu** |
| 2 | `/share`, kiểm tra placeholder `<!--OG-->` | SHR-*, PTH-11, DAT-08 | **Chặn** cho tới khi Q-2 được chốt |
| 3 | fetcher | FET-* | Chưa mở; chờ chủ project mở pha |
| 4 | frontend | FE-* | Chưa mở; chờ chủ project mở pha; Q-3 cần chốt trước phần hiển thị OG/UI text |

- Không viết code của pha chưa mở, kể cả code "chuẩn bị sẵn".
- Pha 1 không phụ thuộc `dist/` hay frontend build: app phải khởi động và chạy test được khi chưa có `dist/`.
- Không implement tính năng ngoài spec: không database, cache (kể cả cache in-process cho resolver), auth, WebSocket, task queue, image generation, runtime Wikipedia fallback, autocomplete.
- Chính sách sử dụng Wikimedia API phải được đối chiếu với tài liệu hiện hành khi bắt đầu pha 3.

### 0.4 Trạng thái quyết định
Chỉ bảng này quyết định một điểm đã có hiệu lực hay chưa. "Chưa duyệt" nghĩa là nội dung đang có trong spec và được implement như đã viết, nhưng chủ project chưa xác nhận riêng; nếu chủ project thay đổi, spec và test sẽ được sửa theo.

| ID | Nội dung tóm tắt | Vị trí | Trạng thái |
|---|---|---|---|
| C-1 | Canonical cũng được tra theo match key, trước alias; exact canonical luôn thắng | §4A.3 | Đã duyệt (v2.1) |
| C-2 | Match key không xóa khoảng trắng, nên `安倍　晋三` chỉ khớp khi có alias `安倍 晋三`; không tự khớp `安倍晋三` | §4A.2 | Chưa duyệt |
| C-3 | Input chỉ gồm khoảng trắng → 404 `UNRESOLVED_NAME` ở `/api/search`, không phải 422 | §3.2 | Chưa duyệt |
| C-4 | Giới hạn độ dài 1..255 ký tự cho `from`, `to`, `q`; vượt → 422 | §3.2, §3.6 | Chưa duyệt |
| C-5 | `/api/resolve` luôn 200; `/api/search` chuyển unresolved/ambiguous thành 404 | §3.6 | Đã duyệt (v2.1) |
| C-6 | Langlink trỏ tới redirect trên jawiki: `ja_title` là bài đích, tiêu đề gốc thành `ja_redirect` | §6.4 bước 5 | Chưa duyệt |
| C-7 | Không canonical name hay alias nào chứa `_` (G-6, A-6) | §6.1, §6.3 | Chưa duyệt |
| C-8 | `alias == target` là lỗi dữ liệu (A-5); mảng alias phải sắp xếp (A-7) | §6.3 | Chưa duyệt |
| C-9 | Fetcher chạy validator trên output, không ghi đè file cũ nếu fail | §6.4 | Chưa duyệt |
| C-10 | Policy nội bộ của fetcher: 0,25 s giữa hai request, timeout 30 s, tối đa 5 retry, chờ `max(Retry-After, 5 × 2^(n-1) s)` | §6.4 | Đã duyệt (v2.2) |
| C-11 | Fetcher dùng `httpx.Client` đồng bộ; không `asyncio`/`Semaphore`/worker pool | §6.4 | Đã duyệt (v2.2) |
| C-12 | `/api/path` không bao giờ trả 422; mọi path không hợp lệ → `{"valid": false, "path": []}` | §3.7 | Đã duyệt (v2.2) |
| C-13 | Fetcher từ chối chạy nếu thiếu `WIKI_UA_CONTACT`; không hardcode contact | §6.4 | Đã duyệt (v2.2) |
| Q-1 | `GET /api/path` + `validate_path()` thuần dùng chung với `/share`; PTH-11 bảo đảm cùng phán quyết | §3.7, §5.3 | Đã chốt (v2.1) |
| Q-2 | Status code / representation của `/share` khi input không hợp lệ | §9 | **OPEN** — chặn pha 2 |
| Q-3 | Ngôn ngữ của `og:title` / UI | §9 | **OPEN** |
| Q-4 | Fetcher tuần tự, concurrency = 1; không có tùy chọn 2–3 | §6.4 | Đã chốt (v2.1) |

Các điểm C-2, C-3, C-4, C-6..C-9 nằm trong pha 1 (C-2, C-3, C-4, C-7, C-8 qua loader/resolver/API) sẽ được implement đúng như spec đang viết. Nếu chủ project sửa bất kỳ điểm nào, sửa SPEC.md trước (§0.1).

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
- **Decision:** Hoàn toàn phía frontend. Backend không có endpoint lịch sử.
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
- **Decision:** Multi-stage Dockerfile: build frontend → `python:3.12-slim`. Không tách frontend sang host khác (tránh CORS và hai lần deploy). Deploy bằng tính năng auto-deploy từ GitHub của nền tảng hosting; không tự dựng pipeline CD.

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
- **Query:** `from`, `to` bắt buộc; độ dài 1..255 ký tự. Giá trị có thể là canonical name, alias tiếng Anh (en redirect), tên tiếng Nhật (ja title) hoặc alias tiếng Nhật (ja redirect).
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
| Thiếu tham số / rỗng / dài hơn 255 ký tự | 422 | Mặc định của FastAPI |

- Resolve và kiểm tra `from` trước `to`. Nếu `from` lỗi, báo lỗi của `from` (`param="from"`) và không cần resolve `to`.
- Input chỉ gồm khoảng trắng (có độ dài ≥ 1 nên qua được 422) có match key rỗng → `UNRESOLVED_NAME`.
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

### 3.4 Static / SPA
- `dist/` được mount làm static; mọi route không khớp API trả `index.html` (SPA fallback).
- Route `/share` và `/api/*` phải được đăng ký **trước** catch-all.

### 3.5 Frontend types
- Sinh TypeScript type từ `/openapi.json` bằng `openapi-typescript`. Không viết tay type cho response API.

### 3.6 `GET /api/resolve?q={input}` *(mới ở v2)*
- **Mục đích:** frontend kiểm tra một input trước khi tìm kiếm, và hiển thị danh sách ứng viên khi tên mơ hồ.
- **Query:** `q` bắt buộc, độ dài 1..255 ký tự. NFC-normalize rồi đi qua resolver (§4A). Không gọi network.
- **Response:** luôn **200** với `ResolveResponse` cho mọi kết quả resolve (`resolved`, `ambiguous`, `unresolved`). Kết quả resolve là tài nguyên được yêu cầu, nên "không resolve được" là một kết quả hợp lệ (cùng tinh thần ADR-011).
- **422:** thiếu `q`, rỗng, hoặc dài hơn 255 ký tự.
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
Logic nằm trong một hàm thuần duy nhất, `validate_path(names: list[str]) -> list[str] | None` (trả danh sách tên đã NFC nếu hợp lệ, `None` nếu không), trong `backend/app/paths.py` (pha 1; không đặt trong module của route `/share`). `/share` và `/api/path` đều chỉ gọi hàm này; không endpoint nào tự validate riêng. *(v2.1)* Hai route dùng chung phán quyết nhưng có representation riêng: `/api/path` trả JSON `PathResponse`, `/share` trả HTML (hành vi khi không hợp lệ phụ thuộc Q-2). *(v2.2)*

Path hợp lệ khi và chỉ khi:
1. Số phần tử và độ dài nằm trong giới hạn 5.2;
2. Mọi tên đều là key của graph (**exact match sau NFC; không đi qua resolver**);
3. Mọi cặp liên tiếp là một cạnh có hướng trong graph (tra bằng `dict[str, frozenset[str]]` dựng lúc khởi động).

**Invariant (v2):** share URL là biểu diễn của identity. Alias (`安倍晋三`, `Abe Shinzo`) hoặc tên có `_` trong `p` làm path không hợp lệ, kể cả khi resolver có thể resolve được chúng.

### 5.4 Response của `GET /share`
- Trả `text/html`: nội dung `dist/index.html` với placeholder `<!--OG-->` trong `<head>` được thay bằng các meta tag.
- **Path hợp lệ:**
  - `og:title` = `"{first} → {last}: {n} bước"` (format đặt trong một hằng số duy nhất);
  - `og:description` = các tên trên path nối bằng `" → "`;
  - `og:image` = thumbnail của người đầu tiên; **bỏ hẳn tag** nếu thumbnail là `None`;
  - `og:url` = URL share **dựng lại từ các tên đã validate** bằng `urlencode(..., doseq=True)`, không echo lại chuỗi query thô;
  - `twitter:card` = `summary`.
- **Path không hợp lệ:** OG meta mặc định của site (xem Open question Q-2 về status code).
- Mọi giá trị chèn vào HTML phải qua `html.escape(value, quote=True)`. URL encoding không phải là cơ chế bảo vệ HTML.

### 5.5 Placeholder
- `frontend/index.html` phải chứa đúng một `<!--OG-->` trong `<head>`.
- Khi khởi động, server kiểm tra `dist/index.html` có placeholder; nếu không có thì fail fast.

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
- **G-6** *(v2)* Không canonical name nào chứa ký tự `_` (tiêu đề MediaWiki lưu `_` dưới dạng dấu cách; `_` trong dữ liệu là dấu hiệu fetcher đã đọc sai).

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
- **A-5** Không có entry mà `alias == target`.
- **A-6** Không `alias` nào chứa ký tự `_` (lý do như G-6).
- **A-7** Mảng được sắp xếp theo `(alias, target, source)` để diff giữa các lần fetch ổn định.

### 6.4 Fetcher contract (`backend/fetcher.py`) *(sửa ở v2)*
- Input: `data/seed_names.txt` (mỗi dòng một tên).
- Fetcher chạy tay trên máy local, không chạy trên server. Đây là nơi duy nhất trong project gọi MediaWiki API.

**Bước 1 — Resolve seed:** resolve seed sang canonical English title (xử lý redirect và normalization của Wikipedia); gộp seed trùng sau khi resolve; loại seed không tồn tại (ghi log).

**Bước 2 — Graph:** lấy link đi ra với `redirects=1` để link tới trang redirect vẫn được tính; lọc chỉ giữ tên có trong tập canonical.

**Bước 3 — Metadata + ja title (enwiki):** theo batch tối đa 50 tiêu đề/request, `prop=pageimages|info|description|langlinks`, `pithumbsize=200`, `inprop=url`, `lllang=ja`. Người không có langlink `ja` thì không sinh alias `ja_title`.

**Bước 4 — en redirect (enwiki):** theo batch, `prop=redirects`, `rdnamespace=0`, `rdlimit=max`. Mỗi redirect sinh một entry `en_redirect`.

**Bước 5 — ja redirect (jawiki):** với tập tiêu đề thu được ở bước 3, gọi `ja.wikipedia.org` theo batch với `redirects=1`, `prop=redirects`, `rdnamespace=0`, `rdlimit=max`.
- Nếu tiêu đề lấy từ langlink bản thân là một redirect trên jawiki: `ja_title` là **tiêu đề bài đích sau khi resolve**, còn tiêu đề langlink gốc được ghi là một `ja_redirect`.
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

> **Ghi chú (v2.2):** các con số 0,25 giây, 30 giây, 5 lần retry và công thức backoff dưới đây là **policy nội bộ của fetcher** (C-10), không phải giá trị Wikimedia bắt buộc. Giới hạn 0,25 giây (tối đa 4 request/giây) là lựa chọn conservative để nằm dưới giới hạn hiện hành cho client Action API không xác thực (dưới 5 request/giây, concurrency 1). Nếu Wikimedia thay đổi giới hạn, cập nhật §6.4 và changelog trước khi đổi code.

- **Tuần tự tuyệt đối:** tại mọi thời điểm có tối đa một request đang chờ phản hồi. Không có tùy chọn chạy song song. Dùng `httpx.Client` đồng bộ trong một vòng lặp; không dùng `asyncio`/`Semaphore` (C-11).
- **Dưới 5 request/giây:** khoảng cách tối thiểu giữa hai lần bắt đầu request là 0,25 giây (C-10), cấu hình được nhưng không được đặt ≤ 0,2 giây.
- Timeout 30 giây cho mỗi request (C-10).

*Lỗi và retry*
- **Lỗi maxlag** có thể được trả về với **HTTP 200** và body JSON có `error.code == "maxlag"`. Vì vậy **mọi** response, kể cả HTTP 200, phải được kiểm tra `error.code` trong body trước khi coi là thành công; không chỉ dựa vào status code. Lỗi maxlag được chờ theo quy tắc bên dưới rồi retry.
- **HTTP 429** và **5xx**: chờ theo quy tắc bên dưới rồi retry.
- **Thời gian chờ** trước lần retry thứ `n` (n bắt đầu từ 1) = `max(Retry-After nếu có, 5 × 2^(n-1) giây)`. Khi Wikimedia trả `Retry-After`, **phải** tôn trọng giá trị đó, kể cả khi giá trị lớn hơn backoff nội bộ; ghi log thời gian chờ.
- Tối đa 5 lần retry cho một request (C-10). Hết số lần retry → fetcher dừng với lỗi, **không ghi** file output nào.
- Các lỗi khác (4xx khác 429, body có `error` khác `maxlag`, JSON không parse được) không retry: dừng với lỗi, không ghi file.
- Mọi lỗi và cảnh báo trong body (`warnings`) được ghi log.

*Dữ liệu*
- Tiêu đề lấy từ API được dùng nguyên dạng (dấu cách); fetcher không tự chuyển đổi `_`/dấu cách. Nếu có chỗ nào phải chuyển (ví dụ đọc từ URL), việc đó chỉ nằm trong fetcher.
- NFC-normalize mọi tiêu đề trước khi ghi.
- Ghi file theo đúng §6.1, §6.2, §6.3, và chạy validator §6.5 trên output trước khi ghi đè file cũ; nếu validator fail thì không ghi đè.

*Thời gian chạy:* với dataset khoảng 10k người và tốc độ trên, một lần fetch có thể mất từ vài chục phút tới vài giờ tùy số request continuation. Điều này được chấp nhận vì fetcher chạy tay, không nằm trên đường request của production.

*Nguồn tham chiếu (kiểm tra ngày 2026-09-18; implement phải đối chiếu lại):*
- Wikitech — Robot policy: Action API, client không xác thực: concurrency 1, dưới 5 request/giây.
- mediawiki.org — Wikimedia APIs/Rate limits: giới hạn toàn cục áp dụng từ 2026; tôn trọng `Retry-After` khi nhận 429; User-Agent có thông tin liên hệ.
- mediawiki.org — API:Etiquette: gửi request tuần tự; gộp nhiều tiêu đề; dùng gzip.
- mediawiki.org — Manual:Maxlag parameter: `maxlag=5`; lỗi maxlag trả HTTP 200; header `Retry-After`; chờ ít nhất 5 giây.
- Wikimedia Foundation — User-Agent Policy: định dạng User-Agent và yêu cầu thông tin liên hệ của người vận hành.

### 6.5 Startup validation (`backend/app/data.py`)
Khi khởi động, loader kiểm tra:
- G-1..G-6, P-1..P-3, A-1..A-7;
- mọi tên và alias ở dạng NFC.

Kiểm tra placeholder `<!--OG-->` (§5.5) là một hàm riêng, **chỉ được gọi khi route `/share` được đăng ký** (pha 2). Ở pha 1, app khởi động được khi chưa có `dist/`. *(v2.2)*

Bất kỳ vi phạm nào → raise lỗi với thông báo chỉ rõ tên/entry và vi phạm, app không khởi động. Không tự sửa dữ liệu lúc runtime.

Sau khi validate, loader dựng `ResolverIndex` (§4A) và ghi log (không fail): số alias theo từng `source`, số match key mơ hồ.

---

## 7. Test cases

### 7.0 Pha của từng nhóm test *(v2.2)*
| Nhóm | Pha |
|---|---|
| BFS-*, RES-*, SCH-01..08, API-*, PTH-01..10, DAT-01..07, DAT-09..16 | 1 |
| SHR-*, PTH-11, DAT-08 | 2 (chặn bởi Q-2) |
| FET-* | 3 |
| FE-* | 4 |

Quy tắc viết test: §0.2.

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
| SCH-08 | *(v2.1)* `/openapi.json` có `GET /api/path` với response `PathResponse`; không khai báo response 422 là một kết quả mong đợi của endpoint này (xem PTH-08) |

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
| API-08 | thiếu `from` / `to` rỗng / dài 256 ký tự | 422 |
| API-09 | tên có `&`, `+`, `?`, `(`, `/`, Unicode | encode bằng chuẩn → 200, tra đúng người |
| API-10 | tên gửi ở dạng NFD (`Nguyễn Du` phân tách) | được NFC-normalize, 200 |
| API-11 | `PersonMeta` với thumbnail/description null trong people.json | response trả `null`, không phải `""` |
| API-12 | gửi `Albert_Einstein` | 404, `code=UNRESOLVED_NAME` (`_` khác dấu cách) |
| API-13 | *(v2)* `from=安倍晋三` | 200, `from == "Shinzo Abe"`, `path[0].name == "Shinzo Abe"` |
| API-14 | *(v2)* `from=Abe Shinzo` | 200, `from == "Shinzo Abe"` |
| API-15 | *(v2)* `from=安倍晋三&to=Abe Shinzo` | 200, found=true, length=0 |
| API-16 | *(v2)* `from` là alias xung đột | 404, `code=AMBIGUOUS_NAME`, `candidates` ≥ 2, đã sắp xếp, là `PersonMeta` đầy đủ |
| API-17 | *(v2)* `from` chỉ gồm khoảng trắng | 404, `UNRESOLVED_NAME` |
| API-18 | *(v2)* `GET /api/resolve?q=安倍晋三` | 200, `status=resolved`, `person.name == "Shinzo Abe"`, `candidates=[]` |
| API-19 | *(v2)* `GET /api/resolve` với input unresolved / ambiguous | 200, `status` tương ứng, `person=null`; `candidates` đúng theo §2 |
| API-20 | *(v2)* mọi input trong §7.1 | `/api/resolve` và `/api/search` cho cùng kết quả resolve; không có request mạng nào được thực hiện (chặn network trong test) |

### 7.6 Share
| ID | Request | Kỳ vọng |
|---|---|---|
| SHR-01 | path hợp lệ | HTML chứa `og:title`, `og:description`, `og:url` đúng |
| SHR-02 | người đầu không có thumbnail | không có tag `og:image` |
| SHR-03 | cạnh không tồn tại (path bị sửa) | OG mặc định |
| SHR-04 | tên không tồn tại | OG mặc định |
| SHR-05 | 1 phần tử `p` | bị từ chối theo Q-2 |
| SHR-06 | 11 phần tử `p` | bị từ chối theo Q-2 |
| SHR-07 | một phần tử dài 256 ký tự | bị từ chối theo Q-2 |
| SHR-08 | tên chứa `<script>`, `"`, `&` | được escape trong HTML, không phá vỡ thuộc tính |
| SHR-09 | tên chứa `&`, `+`, `?`, Unicode | round-trip: URL tạo bằng `urlencode(doseq=True)` → parse lại → đúng danh sách tên |
| SHR-10 | `og:url` | dựng từ tên đã validate, không chứa param lạ từ request gốc |
| SHR-11 | *(v2)* share URL dựng từ response của search với input `安倍晋三` | chỉ chứa `p=Shinzo+Abe`, không chứa ký tự tiếng Nhật |
| SHR-12 | *(v2)* `p=安倍晋三` hoặc `p=Abe Shinzo` (alias) trong path có cạnh đúng | không hợp lệ (share không đi qua resolver) |

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
| PTH-11 | *(pha 2)* bảng input dùng chung cho SHR-01..07, SHR-12 và PTH-01..09 | với mọi input, `/api/path` trả `valid=true` khi và chỉ khi `/share` sinh OG của path hợp lệ; cả hai gọi `validate_path` (kiểm tra bằng spy/mock) |

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
| DAT-08 | *(pha 2)* `dist/index.html` thiếu `<!--OG-->` khi route `/share` được bật | fail |
| DAT-09 | dữ liệu hợp lệ | load thành công |
| DAT-10 | *(v2)* canonical name chứa `_` (G-6) | fail |
| DAT-11 | *(v2)* alias có `target` không phải key của graph (A-1) | fail |
| DAT-12 | *(v2)* alias rỗng, không NFC, hoặc match key rỗng (A-2) | fail |
| DAT-13 | *(v2)* `source` không hợp lệ (A-3) | fail |
| DAT-14 | *(v2)* entry trùng lặp hoàn toàn (A-4) hoặc `alias == target` (A-5) | fail |
| DAT-15 | *(v2)* alias chứa `_` (A-6) hoặc mảng chưa sắp xếp (A-7) | fail |
| DAT-16 | *(v2)* alias xung đột | load thành công, log số match key mơ hồ |

### 7.8 Fetcher (không gọi mạng)
Dùng response JSON của MediaWiki API đã ghi sẵn làm fixture và mock HTTP client.
| ID | Kiểm tra |
|---|---|
| FET-01 | continuation gộp đủ link từ nhiều trang |
| FET-02 | link tới trang redirect được resolve về canonical name |
| FET-03 | seed là redirect được resolve; seed trùng sau resolve được gộp |
| FET-04 | seed không tồn tại bị loại và ghi log |
| FET-05 | metadata batch: trang không có ảnh → `thumbnail: null` |
| FET-06 | *(sửa ở v2.1)* 429 và 5xx được retry; response HTTP 200 có `error.code == "maxlag"` được nhận ra là lỗi maxlag và retry; body có `error` khác không retry; hết 5 lần retry thì dừng và không ghi file |
| FET-07 | output thỏa mãn toàn bộ G-1..G-6, P-1..P-3 (chạy chung validator của §6.5) |
| FET-08 | *(v2)* langlinks `ja` sinh `ja_title`; người không có langlink `ja` không sinh alias |
| FET-09 | *(v2)* continuation khi một request có nhiều prop (`langlinks`, `redirects`) gửi lại toàn bộ tham số `continue` |
| FET-10 | *(v2)* en redirect sinh `en_redirect` cho đúng target |
| FET-11 | *(v2)* langlink trỏ tới redirect trên jawiki: `ja_title` là bài đích, tiêu đề gốc thành `ja_redirect` |
| FET-12 | *(v2)* langlink trỏ tới trang không tồn tại trên jawiki: bị bỏ, ghi log |
| FET-13 | *(v2)* hai target cùng `ja_title`: xung đột được giữ nguyên, `ja_redirect` sinh cho cả hai target |
| FET-14 | *(sửa ở v2.1)* mọi request là `GET`, có `maxlag=5`, `format=json`, `formatversion=2`, header `User-Agent` đúng định dạng và chứa giá trị `WIKI_UA_CONTACT`, header `Accept-Encoding` có `gzip`, timeout 30 giây; output thỏa mãn A-1..A-7; validator fail thì không ghi đè file cũ |
| FET-15 | *(v2.1)* thời gian chờ retry = `max(Retry-After, 5 × 2^(n-1))`: `Retry-After` lớn hơn backoff thì dùng `Retry-After`; không có header thì dùng backoff (dùng đồng hồ giả, không sleep thật) |
| FET-16 | *(v2.1)* không bao giờ có hai request chờ phản hồi cùng lúc; khoảng cách giữa hai lần bắt đầu request ≥ 0,25 giây (đồng hồ giả) |
| FET-17 | *(v2.1)* cấu hình khoảng cách ≤ 0,2 giây bị từ chối khi khởi động fetcher |
| FET-18 | *(v2.1)* thiếu `WIKI_UA_CONTACT` → fetcher dừng trước khi gửi request đầu tiên |

### 7.9 Frontend (mức tối thiểu)
| ID | Kiểm tra |
|---|---|
| FE-01 | hàm tạo share URL dùng `URLSearchParams`; round-trip với các tên đặc biệt ở §7.1 |
| FE-02 | history hook: thêm, giới hạn số entry, đọc lại khi localStorage rỗng hoặc hỏng (JSON không parse được) mà không crash |
| FE-03 | *(v2)* xử lý lỗi theo `detail.code` (không parse message): `AMBIGUOUS_NAME` hiển thị `candidates`; chọn một ứng viên thì search lại bằng canonical name của ứng viên đó |
| FE-04 | *(v2.1)* trang `/share`: gọi `/api/path` với đúng danh sách `p` và không tự validate; `valid=false` và có ≥ 2 phần tử `p` thì gọi `/api/search?from={p[0]}&to={p[-1]}`; `valid=false` với < 2 phần tử thì chỉ hiển thị thông báo |

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
- *(v2.1, fetcher)*:
  - chạy song song (concurrency > 1);
  - xác thực bằng bot password hoặc OAuth để có giới hạn cao hơn;
  - khả năng tiếp tục một lần fetch bị dừng giữa chừng (resume/checkpoint); lần chạy lỗi thì chạy lại từ đầu.

---

## 9. Open questions (chưa implement cho tới khi chốt)

- **Q-2 [OPEN — chặn pha 2]: `/share` phản hồi thế nào với input không hợp lệ (sai số lượng, quá dài)?**
  `/share` là trang cho người và crawler, nên 422 JSON mặc định của FastAPI sẽ hiện ra một trang JSON thô.
  - Phương án đề xuất: `/share` luôn trả 200 HTML; input không hợp lệ → OG mặc định, frontend hiển thị thông báo (theo §5.6). Khi đó `/share` và `/api/path` cùng một kiểu hành xử (C-12).
  - Phương án khác: trả 400 kèm HTML thông báo lỗi.
- **Q-3 [OPEN]: Ngôn ngữ của `og:title` / UI** (tiếng Việt, tiếng Anh, hay tiếng Nhật). Format đặt trong một hằng số nên có thể đổi sau mà không ảnh hưởng contract.

### Đã chốt
- **Q-1 (v2.1):** thêm `GET /api/path` (§3.7), dùng chung `validate_path` với `/share` (§5.3).
- **Q-4 (v2.1):** fetcher tuần tự, concurrency = 1, dưới 5 request/giây (§6.4), theo Robot policy của Wikimedia cho client Action API không xác thực.
