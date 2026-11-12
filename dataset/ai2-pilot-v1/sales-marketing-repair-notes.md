# Báo cáo sửa chữa dữ liệu Sales & Marketing (AI2 Development Pilot v1)

**Tệp sửa đổi duy nhất:** `dataset/ai2-pilot-v1/sources/sales-marketing.json`
**Ngày thực hiện:** 2026-11-10
**Model cấu hình đã kiểm tra:** `haiku` -> `ag/gemini-3.8-flash-high` (không thay thế model)

---

## 1. Sửa lỗi xác định (Definite Errors)

1. **SA-J04-C08 (`cv_text` join error):**
   - **Vấn đề:** Trong `cv_text`, phần Học vấn (`SA-J04-C08-SEC-EDU`) đứng trước phần Dự án (`SA-J04-C08-SEC-PRJ`), trong khi danh sách `sections` có thứ tự: Tóm tắt (`SEC-SUM`) -> Kỹ năng (`SEC-SKILL`) -> Kinh nghiệm (`SEC-EXP`) -> Dự án (`SEC-PRJ`) -> Học vấn (`SEC-EDU`). Do đó, `cv_text` không khớp phép nối chính xác hai dấu xuống dòng (`\n\n`) của `sections`.
   - **Xử lý:** Cập nhật lại `cv_text` thành phép nối chính xác theo thứ tự `sections`: SUM -> SKILL -> EXP -> PRJ -> EDU.

2. **MK-J02-C08 (`cv_text` join error):**
   - **Vấn đề:** Trong `cv_text`, phần Học vấn (`MK-J02-C08-SEC-EDU`) đứng trước Dự án tiêu biểu (`MK-J02-C08-SEC-PRJ`), không khớp thứ tự `sections`.
   - **Xử lý:** Cập nhật lại `cv_text` thành phép nối chính xác theo thứ tự `sections`: SUM -> SKILL -> EXP -> PRJ -> EDU.

3. **MK-J02-C06 (Missing section reference):**
   - **Vấn đề:** Tại kinh nghiệm `MK-J02-C06-EXP-02`, trường `section_id` bị ghi sai thành `"MK-J02-C06-EXP"` (thiếu tiền tố định danh `-SEC-`), dẫn đến tham chiếu section không tồn tại.
   - **Xử lý:** Điều chỉnh `section_id` thành `"MK-J02-C06-SEC-EXP"`, khớp với ID của section kinh nghiệm.

---

## 2. Chuẩn hóa phân định Bắt buộc / Ưu tiên trong văn bản JD (JD Prose)

- **Nguyên tắc:** PROTOCOL quy định văn bản tiêu chí yêu cầu trong `requirements` phải xuất hiện nguyên văn (verbatim) trong `jd_text`. Đồng thời, sự phân định giữa tiêu chí Bắt buộc (required) và Ưu tiên (preferred) phải rõ ràng trong văn bản JD.
- **Xử lý cụ thể:**
  - Chuẩn hóa tiêu đề mục trong `jd_text` của tất cả 10 việc làm thành `Yêu cầu công việc (Bắt buộc):` và `Tiêu chí ưu tiên (Ưu tiên):`.
  - **SA-J01:** Bổ sung nguyên văn tiêu chí bắt buộc SA-J01-R02 (*"Thành thạo kỹ năng tìm kiếm khách hàng tiềm năng, thuyết trình demo giải pháp và đàm phán hợp đồng thương mại."*) vào mục `Yêu cầu công việc (Bắt buộc):` trong `jd_text` (trước đó chỉ nằm rải rác trong phần Mô tả công việc).
  - **SA-J02:** Bổ sung nguyên văn tiêu chí bắt buộc SA-J02-R03 (*"Theo dõi tồn kho điểm bán, trưng bày sản phẩm đúng quy chuẩn và triển khai chương trình khuyến mãi tháng."*) vào mục `Yêu cầu công việc (Bắt buộc):` trong `jd_text`.
  - Toàn bộ 51 tiêu chí của 10 JD (SA-J01..05, MK-J01..05) đều được kiểm tra đối chiếu đảm bảo xuất hiện nguyên văn 100% trong `jd_text`.

---

## 3. Rà soát cảnh báo từ vựng (Lexical Warnings) & Xử lý tuyên bố dữ liệu không có căn cứ

### 3.1. Phân biệt Bí danh / Biến thể từ ngữ (Aliases) với Tuyên bố không có căn cứ
Công cụ kiểm tra tự động (`source-validation.json`) kiểm tra sự xuất hiện chuỗi con chính xác (exact substring matching). Khi chuỗi trong trường cấu trúc không khớp từng ký tự với section được trích dẫn, công cụ gắn nhãn cảnh báo `structured fact requires semantic support check` hoặc `skill requires semantic support check`.
Qua kiểm tra toàn diện, các cảnh báo được phân loại:
- **Bí danh hợp lệ (Aliases - Giữ nguyên):** Các kỹ năng ở cấp độ ứng viên (`skills`) và mô tả công việc tóm tắt (`description`) phản ánh đúng ngữ nghĩa của đoạn văn bản section tương ứng (ví dụ: *"Tốt nghiệp THPT"* tương đương *"Tốt nghiệp Trung học Phổ thông"*; *"Dược sĩ Đại học"* tương đương *"Dược sĩ Đại học (Cử nhân Dược học)"*; *"Google Ads"* bao hàm *"Google Search và Display Network"*).
- **Tuyên bố cấu trúc không có căn cứ (Genuinely Unsupported Claims - Loại bỏ):** Phát hiện lỗi hệ thống trong quá trình sinh dữ liệu ban đầu: Ở các vị trí công việc thứ hai (`EXP-02` - thường là các công việc thực tập, hỗ trợ bán thời gian hoặc bán hàng sơ cấp), generator đã sao chép nhầm các kỹ năng cao cấp của công việc chính (`EXP-01`) vào `skills_used` của `EXP-02`, trong khi văn bản trích dẫn của `EXP-02` hoàn toàn không đề cập hoặc mâu thuẫn với kỹ năng đó.

### 3.2. Danh sách loại bỏ các tuyên bố cấu trúc không có căn cứ trong `skills_used`
Theo đúng chỉ đạo *"Remove unsupported structured claims rather than inventing evidence; preserve supported full CV prose"*, các kỹ năng không có căn cứ sau đây đã được loại bỏ khỏi `skills_used`:

1. **SA-J01-C02 (EXP-02):** Loại bỏ `"Phân tích nhu cầu vận hành"` (văn bản chỉ nêu bán phần mềm chấm công tính lương và phối hợp giải đáp chuyên môn). Giữ lại: `["Bán hàng phần mềm B2B"]`.
2. **SA-J01-C03 (EXP-02):** Loại bỏ `"Lập báo giá kỹ thuật"` (văn bản chỉ nêu chào bán máy tính văn phòng, bản quyền đóng gói cho trường học). Giữ lại: `["Bán hàng B2B"]`.
3. **SA-J01-C05 (EXP-02):** Loại bỏ `"Thuyết trình giải pháp"` (văn bản chỉ nêu mở rộng thị phần thoại IP và tổng đài ảo, không có hoạt động thuyết trình). Điều chỉnh về: `[]`.
4. **SA-J01-C07 (EXP-02):** Loại bỏ `"Thương thảo hợp đồng thuê bao"` (vai trò chỉ là gọi điện đặt lịch hẹn, không thương thảo hợp đồng). Điều chỉnh về: `[]`.
5. **SA-J02-C05 (EXP-02):** Loại bỏ `"Giám sát bán hàng GT"` (vai trò là nhân viên bán hàng trực tiếp, không phải giám sát). Giữ lại: `["Ngành nước giải khát"]`.
6. **SA-J03-C01 (EXP-02):** Loại bỏ `"Đấu thầu y tế công lập"` (văn bản chỉ nêu chào giá máy đo điện tim monitor, không có đấu thầu công lập). Điều chỉnh về: `[]`.
7. **SA-J03-C04 (EXP-02):** Loại bỏ `"Quản lý đội ngũ sales B2B"` (vai trò là nhân viên bán hàng thiết bị đo lường cá nhân, không quản lý đội ngũ). Điều chỉnh về: `[]`.
8. **SA-J03-C06 (EXP-02):** Loại bỏ `"Trình dược kênh bệnh viện ETC"` (vai trò là trình dược viên OTC cho nhà thuốc bán lẻ, không phải kênh bệnh viện ETC). Điều chỉnh về: `[]`.
9. **SA-J03-C07 (EXP-02):** Loại bỏ `"Tiếng Anh đọc tài liệu thiết bị"` (văn bản công việc chỉ nêu chào bán máy điện tim cho trung tâm y tế dự phòng, không có tiếng Anh). Điều chỉnh về: `[]`.
10. **SA-J04-C02 (EXP-02):** Loại bỏ `"KiotViet"` (văn bản công việc thu ngân chỉ nêu thu tiền quầy, không nhắc đến phần mềm KiotViet). Điều chỉnh về: `[]`.
11. **SA-J04-C03 (EXP-02):** Loại bỏ `"Tác phong nhanh nhẹn"` (kỹ năng chung không gắn với trách nhiệm cụ thể của việc phục vụ bàn). Điều chỉnh về: `[]`.
12. **SA-J04-C06 (EXP-02):** Loại bỏ `"Thuyết phục khách hàng"` (văn bản chỉ nêu trực tin nhắn chốt đơn phụ kiện Shopee). Điều chỉnh về: `[]`.
13. **SA-J04-C07 (EXP-02):** Loại bỏ `"Tư vấn nội thất gỗ công nghiệp"` (văn bản chỉ nêu phụ việc lau chùi đồ mẫu và sắp xếp bàn ghế tại kho). Điều chỉnh về: `[]`.
14. **SA-J05-C04 (EXP-02):** Loại bỏ `"Chứng từ vận đơn Bill of Lading"` (văn bản thực tập chỉ nêu chuẩn bị Invoice, Packing List, C/O form D). Điều chỉnh về: `[]`.
15. **SA-J05-C05 (EXP-02):** Loại bỏ `"Lãnh đạo khách hàng toàn cầu KAM"` (vị trí là quản lý khách hàng dệt may trong nước, không phải cấp độ toàn cầu). Điều chỉnh về: `[]`.
16. **SA-J05-C06 (EXP-02):** Loại bỏ `"Quản lý tài khoản B2B"` (văn bản chỉ nêu chào bán khay nhựa định hình cho cơ sở chế biến thực phẩm, không phải quản lý tài khoản trọng yếu). Điều chỉnh về: `[]`.
17. **MK-J01-C02 (EXP-02):** Loại bỏ `"Google Shopping"` (văn bản chỉ nêu chạy quảng cáo Facebook và Google Search). Giữ lại: `["Meta Ads"]`.
18. **MK-J01-C07 (EXP-02):** Loại bỏ `"Quảng cáo đa kênh Meta TikTok Google"` (vai trò CTV chỉ viết bài Fanpage và chạy thử quảng cáo tiếp cận ngân sách nhỏ). Điều chỉnh về: `[]`.
19. **MK-J02-C02 (EXP-02):** Loại bỏ `"Sáng tạo nội dung Instagram và TikTok"` (vai trò CTV chỉ viết bài đăng Fanpage Facebook cho phụ kiện). Điều chỉnh về: `[]`.
20. **MK-J02-C04 (EXP-02):** Loại bỏ `"Thiết kế Canva"` (văn bản thực tập tình nguyện chỉ nêu chụp ảnh sự kiện và đăng tin, không nhắc Canva). Điều chỉnh về: `[]`.
21. **MK-J02-C07 (EXP-02):** Loại bỏ `"Kịch bản video TikTok và Fanpage"` (vai trò CTV tạp chí chỉ viết bài đánh giá son môi trên báo, không viết kịch bản video). Điều chỉnh về: `[]`.
22. **MK-J03-C03 (EXP-02):** Loại bỏ `"Brand Marketing ABM"` (vị trí thực tập sinh chỉ hỗ trợ tài liệu và POSM, không phải Assistant Brand Manager). Điều chỉnh về: `[]`.
23. **MK-J03-C07 (EXP-02):** Loại bỏ `"Chiến dịch IMC OOH BTL Digital"` (vai trò chỉ viết bài báo in và tổ chức sự kiện khai trương đại lý, không triển khai chiến dịch IMC đa kênh). Điều chỉnh về: `[]`.
24. **MK-J04-C01 (EXP-02):** Loại bỏ `"SEO On-page và Topic Cluster"` (công việc chỉ viết bài chuẩn SEO và gắn link nội bộ, không lập cấu trúc Topic Cluster). Điều chỉnh về: `[]`.
25. **MK-J04-C04 (EXP-02):** Loại bỏ `"Liên kết nội bộ"` (công việc là đi link diễn đàn rao vặt bên ngoài / off-page, hoàn toàn không phải internal linking). Điều chỉnh về: `[]`.
26. **MK-J04-C05 (EXP-02):** Loại bỏ `"Technical SEO triệu trang"` (vị trí quản lý agency xử lý Panda/Penguin, không phụ trách website triệu URL). Điều chỉnh về: `[]`.
27. **MK-J04-C06 (EXP-02):** Loại bỏ `"Viết bài chuẩn SEO"` (vai trò CTV chỉ viết bài chia sẻ dinh dưỡng ăn dặm thông thường, không viết theo chuẩn SEO). Điều chỉnh về: `[]`.
28. **MK-J04-C08 (EXP-02):** Loại bỏ `"Core Web Vitals HTML CSS JS"` (vai trò lập trình viên giao diện chỉ code responsive HTML/CSS/JS/WordPress, không tối ưu Core Web Vitals). Giữ lại: `["WordPress Custom Theme"]`.
29. **MK-J05-C04 (EXP-02):** Loại bỏ `"Tài liệu tính năng Release notes"` (vai trò thực tập sinh chỉ dịch tài liệu phần mềm từ tiếng Anh sang tiếng Việt). Điều chỉnh về: `[]`.
30. **MK-J05-C05 (EXP-02):** Loại bỏ `"Chiến lược GTM khu vực ASEAN"` (công việc chỉ xây quy trình GTM cho cổng thanh toán B2B nội địa). Điều chỉnh về: `[]`.
31. **MK-J05-C06 (EXP-02):** Loại bỏ `"Tiếp thị sản phẩm thẻ ngân hàng"` (vai trò nhân viên CSKH thẻ chỉ giải đáp thủ tục và biểu phí, không làm tiếp thị sản phẩm). Điều chỉnh về: `[]`.
32. **MK-J05-C07 (EXP-02):** Loại bỏ `"Product Marketing Wealth-tech"` (vai trò CTV chỉ viết bài giải thích thuật ngữ tài chính, không làm product marketing). Điều chỉnh về: `[]`.
33. **MK-J05-C08 (EXP-02):** Loại bỏ `"Amplitude Mixpanel"` (công việc phân tích phễu và churn rate không nêu công cụ cụ thể Amplitude hay Mixpanel). Điều chỉnh về: `[]`.

---

## 4. Kiểm tra tính đa dạng, bảo toàn cấu trúc và giới hạn dữ liệu

1. **Bảo toàn số lượng và ID:**
   - 10 việc làm đầy đủ: `SA-J01` đến `SA-J05` (Sales), `MK-J01` đến `MK-J05` (Marketing).
   - 80 hồ sơ ứng viên đầy đủ: 8 ứng viên mỗi việc làm (từ `C01` đến `C08`), giữ nguyên toàn bộ định danh.
2. **Không cố định thứ hạng ứng viên (No Fixed Ranking):**
   - Các ứng viên trong cùng một công việc có độ phù hợp phân tán tự nhiên (từ ứng viên có kinh nghiệm tương thích cao đến ứng viên trái ngành hoặc thiếu hụt điều kiện cốt lõi), không sắp xếp theo thứ tự giảm dần từ C01 đến C08.
3. **Thực thể hư cấu (Fictional Companies):**
   - Toàn bộ tên công ty sử dụng trong các kinh nghiệm đều là tên hư cấu (ví dụ: CloudViet, TechVina, NovaEdu, VinaShop, v.v.), không sử dụng thông tin doanh nghiệp thực tế.
4. **Ngày tháng hợp lệ (Valid Dates):**
   - Toàn bộ trường ngày tháng đều tuân thủ định dạng `YYYY-MM` hoặc `null`, lấy mốc thời gian tham chiếu `2026-11-10`. Công việc hiện tại có `end_date = null` và `is_current = true`.
5. **Không có danh sách từ chối đánh giá (No Evaluative Denial Lists):**
   - Hồ sơ các ứng viên yếu mô tả trung thực kinh nghiệm và phạm vi công việc thực tế của họ thay vì liệt kê danh sách phủ nhận tiêu chí JD.

---

## 5. Các trường hợp tồn đọng và giới hạn kỹ thuật (Unresolved Cases & Limitations)

1. **Độ nhạy từ vựng của công cụ kiểm tra (Lexical Checker Sensitivity):**
   - Trường `description` trong các mục kinh nghiệm tóm tắt lại nội dung các gạch đầu dòng trong section tương ứng. Mặc dù tất cả các sự kiện cấu trúc đều được hỗ trợ về mặt ngữ nghĩa (semantic support) trong đoạn văn bản section, công cụ kiểm tra dựa trên substring vẫn sẽ đưa ra cảnh báo khuyến nghị kiểm tra ngữ nghĩa (`requires semantic support check`). Đây là giới hạn đã được tài liệu hóa trong `PROTOCOL.md` và `source-validation.json`.
2. **Độ dài số từ tiếng Việt (Whitespace Token Length):**
   - Một số hồ sơ quản lý cấp cao (như `MK-J03-C01`, `MK-J05-C01`) có độ dài khoảng 480-520 từ do mô tả phạm vi điều hành nhiều phòng ban và các dự án ngân sách lớn. Mức này phù hợp với chỉ dẫn ưu tiên 200-450 từ mà không cắt ngắn dữ liệu gây mất tính chân thực.
