# AI1 — Quy tắc nhãn và sửa dữ liệu

## Phạm vi

Quy tắc cho vòng chuẩn bị dữ liệu sau assistant review 200 cặp raw train. Đây là protocol đề xuất để áp dụng khi sửa và duyệt dữ liệu, không phải xác nhận nhãn hiện tại là gold. Không thay checkpoint runtime hoặc tự cấp quyền training.

## Hai trục nhãn

### Relevance

- `relevant`: evidence nói trực tiếp về điều kiện trong requirement, kể cả phủ định điều kiện đó.
- `irrelevant`: không có quan hệ thực chất với điều kiện nào trong requirement.
- `unclear`: chưa đủ rõ để quyết định; cần người review.

Không chuyển nhãn support sang relevance bằng bảng ánh xạ tự động. Evidence mâu thuẫn vẫn có thể rất liên quan và hữu ích cho HR.

### Support

- `full`: chứng minh đủ các điều kiện bắt buộc được nêu rõ trong requirement.
- `partial`: chứng minh ít nhất một phần nhưng còn thiếu điều kiện bắt buộc.
- `insufficient`: có thông tin liên quan nhưng chưa chứng minh điều kiện được yêu cầu; không đồng nghĩa mâu thuẫn.
- `contradicted`: có phát biểu xung đột trực tiếp với ít nhất một điều kiện bắt buộc. Ghi rõ điều kiện xung đột và những phần vẫn được hỗ trợ.
- `irrelevant`: không có evidence liên quan thực chất.
- `unclear`: diễn đạt hoặc dữ liệu không đủ để phân biệt các nhãn trên; cách ly khỏi training.

Đánh giá dựa trên nội dung evidence, không xác thực tính thật của thông tin ứng viên. `full` không phải quyết định tuyển dụng.

## Điều kiện requirement

1. Chép nguyên văn requirement và giữ ID gốc.
2. Liệt kê từng điều kiện bắt buộc, điều kiện tùy chọn và phép nối AND/OR.
3. Với từng điều kiện, ghi đoạn evidence chứng minh, thiếu bằng chứng hoặc mâu thuẫn.
4. Không thêm điều kiện ngành, số năm, production, nền tảng hoặc vai trò từ suy đoán. JD chỉ dùng để giải nghĩa; nếu phải đổi requirement, tạo phiên bản mới và review lại.
5. Không xem chứng chỉ là kinh nghiệm thực hành khi requirement yêu cầu thực hành. Không tự loại coursework khi requirement không đòi kinh nghiệm production.
6. Không cộng thời gian kinh nghiệm chồng lấn hoặc đoán thời gian không được nêu.
7. Nếu nhiều section được dùng chung để chứng minh, đánh dấu đơn vị evidence là bundle và lưu ID tất cả section. Không lấy thông tin ngoài đoạn để gán `full` cho một đoạn đơn lẻ.

## Tạo comparison

- Retrieval: chỉ tạo cặp relevant–irrelevant khi cả hai nhãn relevance đã được review.
- Support-ranking: chỉ đề xuất full–partial/insufficient/contradicted/irrelevant khi chiều ưu tiên có lý do rõ ràng. Đây là nhánh thử nghiệm riêng, không phải negative relevance.
- Không ép thứ tự cố định giữa partial, insufficient và contradicted.
- Hai evidence cùng partial hoặc cùng full không tự trở thành cặp ưu tiên. Cách ly nếu không xác định được chiều so sánh.
- Giữ riêng mục tiêu relevance và support trong dữ liệu và báo cáo. Không trộn cả hai dưới một nhãn binary không có giải thích.
- Điểm M1 chỉ phục vụ chọn mẫu; không dùng điểm để quyết định nhãn đúng.

## Xử lý 200 cặp hiện tại

- 57 `keep_support_comparison`: kiểm tra điều kiện requirement và relevance độc lập; giữ trạng thái pending cho đến khi được duyệt.
- 135 `relabel_or_rewrite`: ưu tiên sửa nhãn đúng với evidence gốc. Nếu cả hai evidence chưa đủ full, không bắt buộc viết lại để cứu comparison; có thể giữ evidence cho mục đích khác và bỏ comparison.
- Chỉ viết evidence synthetic mới khi cần bổ sung nhóm lỗi cụ thể. Không biến nội dung tự sinh thành sự thật của CV gốc.
- 8 `ambiguous_exclude`: cách ly, chỉ khôi phục sau khi có lý do phân xử được ghi nhận.

Mỗi đề xuất sửa cần: comparison ID gốc, record IDs, requirement nguyên văn, evidence nguyên văn, relevance/support đề xuất, điều kiện được hỗ trợ/thiếu/mâu thuẫn, hành động, lý do, người review và trạng thái duyệt.

## Provenance và phê duyệt

- Sửa nhãn: giữ ID nguồn, lưu nhãn cũ, nhãn đề xuất và lý do trong artifact mới.
- Viết lại: tạo ID mới, liên kết record gốc, lưu nội dung cũ/mới và `synthetic=true`; giữ cùng nhóm split với nguồn.
- Không suy đoán evidence_source khi nguồn thiếu; giữ null.
- Assistant không tự thay `human_review_status=pending` thành approved.
- `approved_for_training=true` chỉ khi có quyết định duyệt của người review được ghi lại. Chấp thuận kế hoạch không phải duyệt từng nhãn.
- Không ghi đè dữ liệu gốc hoặc đưa cặp chưa duyệt vào bundle training chính thức.

## Kiểm tra trước khi xuất training

- ID duy nhất; tất cả nguồn tồn tại; requirement/evidence gốc không bị đổi âm thầm.
- Không có record heldout; bản dịch, bản viết lại và nhóm duplicate giữ cùng split với nguồn.
- Nhãn thuộc enum; comparison có mục tiêu rõ ràng; mọi cặp xuất đều đã được duyệt.
- Thống kê cả số cặp, số requirement và số JD; không coi nhiều cặp cùng nguồn là mẫu độc lập.
- Ghi checksum input/output, thống kê thay đổi và giới hạn trong AI1_EXPERIMENT_LOG.md.

## Điều kiện đánh giá

Đánh giá retrieval và support-ranking riêng. Evidence phản bác có thể quan trọng với HR dù không hỗ trợ requirement. Chỉ cân nhắc thay model sau khi kiểm tra khả năng truy hồi evidence liên quan, kể cả evidence phản bác, trên heldout cùng protocol. Không dùng 200 cặp train này để chứng minh khả năng tổng quát hóa.
