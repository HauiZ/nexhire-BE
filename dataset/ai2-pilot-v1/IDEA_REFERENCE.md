# AI2 — Candidate–Job Ranking kết hợp tín hiệu AI1 và dữ liệu CV/JD

- Ngày: 2026-11-09
- Trạng thái: Đề xuất ý tưởng, chờ thống nhất phạm vi
- Đối tượng đọc: Nhóm phát triển và người hướng dẫn đề tài
- Căn cứ yêu cầu: `C11_C14.docx`, mục 2.5, 2.6, 3.4, 3.5, 6.2 và 9
- Phạm vi tài liệu: Mục tiêu, phân vai, đầu vào/đầu ra ở mức khái niệm và phương án kiểm chứng. Chưa chốt schema, API, công thức feature hoặc model cuối cùng.

## 1. Bối cảnh và vấn đề

AI1 thực hiện semantic matching giữa yêu cầu trong JD và bằng chứng trong CV. Kết quả truy xuất giúp tìm nội dung liên quan và cung cấp căn cứ cho người tuyển dụng kiểm tra.

Tuy nhiên, độ liên quan ngữ nghĩa không đồng nghĩa với mức độ đáp ứng công việc. Một CV có semantic score cao có thể chưa thể hiện đủ kinh nghiệm; một CV có semantic score thấp hơn có thể cung cấp kinh nghiệm và dự án phù hợp hơn.

Chỉ sắp xếp ứng viên theo điểm AI1 chưa tận dụng đầy đủ dữ liệu nghiệp vụ. Ngược lại, nếu mọi feature của AI2 đều chỉ được suy ra từ các đoạn AI1 chọn, việc AI1 bỏ sót một bằng chứng có thể làm sai đồng thời nhiều feature. AI2 khi đó phụ thuộc quá mạnh vào chất lượng truy xuất.

Bài toán cần giải quyết:

> Với một JD và tập CV ứng tuyển, học cách kết hợp tín hiệu semantic từ AI1 với các đặc trưng nghiệp vụ có căn cứ từ CV/JD để tạo thứ tự ưu tiên xem hồ sơ cho nhà tuyển dụng.

## 2. Người dùng và giá trị mong muốn

### Người dùng chính

Nhà tuyển dụng/HR sàng lọc hồ sơ cho một vị trí. Người phụ trách chuyên môn có thể kiểm tra lại căn cứ và thứ tự gợi ý.

### Giá trị mong muốn

- Ưu tiên các hồ sơ phù hợp với yêu cầu cụ thể của vị trí, không đánh giá một CV là tốt hoặc xấu một cách tuyệt đối.
- Giảm công sức tìm hồ sơ đáng xem trong một tập ứng viên.
- Tận dụng được kết quả semantic matching đã có từ AI1.
- Không để semantic score là tín hiệu duy nhất quyết định thứ tự.
- Giữ khả năng đối chiếu về CV/JD gốc và thể hiện thông tin còn thiếu.

Hệ thống hỗ trợ quyết định, không tự động tuyển hoặc loại ứng viên.

## 3. Định hướng được đề xuất

AI2 là model ranking độc lập. Với mỗi cặp CV–JD, model nhận vector feature gồm hai nhóm:

1. Tín hiệu semantic được tổng hợp từ đầu ra AI1.
2. Tín hiệu nghiệp vụ được xây dựng từ dữ liệu CV/JD đã chuẩn hóa, không giới hạn ở các đoạn AI1 truy xuất.

Model tạo điểm ranking; các CV của cùng một JD được sắp xếp theo điểm đó.

```text
                           ┌─ Kết quả AI1 → feature semantic ───────┐
Một cặp CV–JD ──────────────┤                                        ├─→ AI2 → Rank score
                           └─ CV/JD đã parse → feature nghiệp vụ ──┘

Các CV của cùng một JD → So sánh rank score → Danh sách ưu tiên xem
```

Sơ đồ này chỉ mô tả quan hệ khái niệm, không quy định luồng service hoặc thứ tự gọi API.

## 4. Phân định trách nhiệm

| Thành phần | Trách nhiệm | Không được mặc định suy ra |
|---|---|---|
| Parsing/chuẩn hóa | Tạo dữ liệu cấu trúc từ CV/JD, giữ nguồn và liên kết giữa các thông tin | Dữ liệu đã parse luôn đúng hoặc đầy đủ |
| AI1 | Tìm evidence liên quan theo yêu cầu JD, cung cấp điểm semantic và nguồn | Điểm semantic là xác suất đáp ứng hoặc bằng chứng năng lực đã xác minh |
| Feature engineering | Chuyển kết quả AI1 và dữ liệu CV/JD thành tín hiệu có định nghĩa, có thể tính lại | Tự tạo thông tin không có trong nguồn |
| AI2 | Học cách kết hợp feature để chấm điểm phục vụ ranking | Khôi phục được mọi bằng chứng AI1/parsing bỏ sót |
| Explanation/UI | Trình bày thông tin đối chiếu, evidence và giới hạn | Evidence hiển thị luôn là nguyên nhân model đưa ra thứ hạng |
| HR | Kiểm tra và quyết định bước tuyển dụng tiếp theo | Thứ hạng là quyết định tuyển dụng cuối cùng |

AI2 không được mở rộng thành một model đánh giá ngôn ngữ riêng cho từng cặp requirement–evidence trong phạm vi phiên bản đầu. Việc xây một model như vậy là hướng nghiên cứu khác, không phải điều kiện để thực hiện đề xuất này.

## 5. Phạm vi phiên bản đầu

### Bao gồm

- Ranking ứng viên đã ứng tuyển trong cùng một JD.
- Tận dụng đầu ra AI1 hiện có, không yêu cầu huấn luyện lại AI1 trong phạm vi spec.
- Xây các feature tính được từ dữ liệu thực sự có ở thời điểm suy luận.
- Xây ground truth có rubric và nguồn gán nhãn rõ ràng.
- Huấn luyện baseline và model ứng viên; lựa chọn theo thực nghiệm.
- Đánh giá chất lượng ranking và mức phụ thuộc vào AI1.
- Hiển thị thứ tự cùng dữ liệu/evidence để HR kiểm tra.

### Không bao gồm

- Tự động tuyển hoặc loại ứng viên.
- Dự đoán hiệu suất làm việc, tính cách hoặc khả năng được tuyển.
- Xây thêm model đọc hiểu để phán xét từng evidence.
- Sinh câu hỏi phỏng vấn hoặc tư vấn chỉnh sửa CV.
- Job recommendation cho ứng viên ở phiên bản đầu, dù tài liệu đề tài có mô tả chức năng này ở phạm vi hệ thống.
- So sánh rank score giữa các JD khác nhau như một thước đo năng lực chung.
- Cam kết điểm ranking là phần trăm phù hợp hoặc xác suất tuyển dụng.

## 6. Đầu vào khái niệm

### 6.1. JD

Nội dung yêu cầu, nhiệm vụ, kỹ năng, kinh nghiệm, bằng cấp/chứng chỉ, cấp bậc và các điều kiện liên quan được nêu rõ. Phân biệt yêu cầu bắt buộc và ưu tiên khi nguồn cho phép; không tự gán mức độ quan trọng cho nội dung mơ hồ.

### 6.2. CV đã chuẩn hóa

Kỹ năng, lịch sử công việc, thời gian, dự án, học vấn, chứng chỉ và thông tin liên quan. Cần giữ được mối liên hệ giữa kỹ năng/nhiệm vụ và công việc/dự án chứa chúng khi có dữ liệu.

### 6.3. Kết quả AI1

Requirement, evidence, điểm semantic, nguồn và trạng thái khả dụng. Dữ liệu phải thuộc đúng phiên bản CV/JD đang được đánh giá.

Đoạn highlight chỉ hỗ trợ đọc; không thay thế đầy đủ ngữ cảnh nguồn và không được coi là verdict đáp ứng.

## 7. Các nhóm feature ứng viên

Đây là danh sách để khảo sát, không phải danh sách bắt buộc hoặc công thức đã phê duyệt. Chỉ đưa feature vào model khi có định nghĩa rõ, tính được online và có kiểm tra dữ liệu.

### 7.1. Nhóm semantic từ AI1

Có thể khảo sát:

- Thống kê điểm evidence tốt nhất theo requirement.
- Thống kê điểm theo nhóm yêu cầu nếu việc phân nhóm có căn cứ.
- Mức bao phủ truy xuất: số/tỷ lệ requirement có kết quả liên quan theo ngưỡng được kiểm chứng.
- Tín hiệu thiếu dữ liệu hoặc trạng thái truy xuất không khả dụng.

Ràng buộc:

- Điểm liên quan không phải điểm đáp ứng.
- Có evidence được truy xuất không đồng nghĩa đạt requirement.
- Không đếm lặp cùng một evidence thành nhiều kinh nghiệm độc lập.
- Trạng thái AI1 lỗi không được chuyển thành semantic score bằng 0.
- Ngưỡng và phép tổng hợp phải được chọn trên dữ liệu phát triển, không tối ưu trên test set.

### 7.2. Nhóm nghiệp vụ từ CV/JD

| Nhóm | Tín hiệu có thể khảo sát | Giới hạn |
|---|---|---|
| Kỹ năng | Mức giao nhau giữa kỹ năng được ghi nhận và kỹ năng JD yêu cầu | Việc có tên kỹ năng không chứng minh độ thành thạo |
| Kinh nghiệm | Thời gian liên quan so với yêu cầu khi xác định được vai trò, phạm vi và thời gian | Không lấy tổng thâm niên làm thâm niên của mọi kỹ năng; tránh cộng trùng thời gian |
| Dự án | Công nghệ/nhiệm vụ được gắn rõ với dự án liên quan | Không coi số dự án hoặc độ dài CV là chất lượng |
| Học vấn | Thông tin học vấn đối chiếu yêu cầu rõ ràng của JD | Không dùng uy tín trường làm đại diện mặc định cho năng lực |
| Chứng chỉ | Chứng chỉ được nêu rõ và có liên quan yêu cầu | Không ghi trong CV không đồng nghĩa chắc chắn không có |
| Cấp bậc | Tín hiệu về vai trò/phạm vi trách nhiệm nếu xác định được | Tên chức danh không đủ để khẳng định mức năng lực |
| Điều kiện làm việc | Địa điểm/hình thức làm việc nếu JD và ứng viên có thông tin liên quan | Không suy đoán khả năng di chuyển từ địa chỉ hoặc dùng làm proxy cho thuộc tính nhạy cảm |

Nhóm này dùng dữ liệu toàn bộ CV/JD đã chuẩn hóa, không chỉ những đoạn AI1 đã chọn. Điều đó giảm phụ thuộc vào truy xuất AI1 nhưng không loại bỏ sai số parsing và feature extraction.

Không dùng giới tính, tuổi, ảnh, tình trạng hôn nhân hoặc thuộc tính nhạy cảm làm feature ranking.

### 7.3. Dữ liệu thiếu và chất lượng dữ liệu

- Phân biệt giá trị thấp có quan sát với giá trị chưa biết.
- Có thể dùng missing indicator và phương pháp xử lý thiếu dữ liệu được fit chỉ trên tập train.
- Không biến thiếu thông tin thành kết luận chắc chắn không đáp ứng.
- Theo dõi liệu model có học cách ưu tiên CV dài hoặc nhiều thông tin một cách không hợp lý hay không.
- Nếu một feature không thể tính đáng tin, bỏ feature hoặc biểu diễn thiếu; không tạo số để đủ danh sách.

## 8. Vai trò model AI2 và phương án thực nghiệm

AI2 học quan hệ giữa vector feature và nhãn phù hợp/thứ tự ưu tiên. Model không chỉ sắp xếp lại semantic score và không dùng một bộ trọng số thủ công làm kết quả nghiên cứu cuối cùng.

Phương án ban đầu:

- Logistic Regression làm baseline. Nếu nhãn là phù hợp/không phù hợp, dùng đầu ra model để xếp thứ tự, nhưng không mặc định diễn giải thành xác suất được tuyển.
- XGBoost hoặc Learning-to-Rank làm model ứng viên theo yêu cầu thực nghiệm trong DOCX.
- Nếu dùng Learning-to-Rank, nhóm dữ liệu theo JD và xây nhãn graded relevance hoặc preference phù hợp với mục tiêu học.

Chưa chốt model chính. Model phức tạp hơn chỉ được chọn khi có bằng chứng cải thiện trên dữ liệu tách biệt.

## 9. Ground truth và nguyên tắc huấn luyện

Ground truth đến từ recruiter/chuyên gia hoặc rubric gán nhãn có kiểm soát, đúng hướng DOCX.

Nguyên tắc:

1. Người gán nhãn đánh giá từ CV/JD đầy đủ, không chỉ xem evidence AI1 truy xuất.
2. Không dùng semantic score hoặc tổng điểm feature làm nhãn rồi kết luận AI2 sửa được AI1.
3. Rubric nêu rõ ý nghĩa nhãn: mức liên quan/phù hợp để ưu tiên xem xét cho JD, không phải quyết định tuyển dụng cuối cùng.
4. Lưu bất đồng và cách xử lý bất đồng giữa người gán nhãn; nhãn tổng hợp tự động không được gọi là nhãn chuyên gia.
5. Không đưa nhãn, nhận xét gán nhãn hoặc thông tin quyết định xảy ra sau thời điểm sàng lọc vào feature suy luận.
6. Tách dữ liệu theo JD để kiểm tra khả năng tổng quát hóa; kiểm soát CV trùng và các JD/CV gần trùng giữa các tập. Thiết kế thêm đánh giá trên ứng viên chưa thấy nếu tuyên bố tổng quát hóa đến ứng viên mới.
7. Nếu dữ liệu huấn luyện AI1 có giao với dữ liệu phát triển AI2, phải kiểm soát leakage; dùng dự đoán out-of-fold khi phù hợp. Test cuối không được dùng để huấn luyện hoặc lựa chọn cả hai tầng.

Nhãn nhị phân, graded relevance hay pairwise preference sẽ được chốt sau khảo sát dữ liệu và nguồn lực gán nhãn.

## 10. Đầu ra mong muốn

Theo từng JD:

- Danh sách ứng viên được sắp xếp và Top-K.
- Rank score với ý nghĩa rõ là điểm phục vụ thứ tự, không mặc định là phần trăm phù hợp.
- Thông tin đối chiếu theo nhóm tiêu chí và evidence nguồn để HR kiểm tra.
- Các giới hạn/thiếu dữ liệu quan trọng.
- Phiên bản model và feature để tái hiện kết quả.

Phải phân biệt:

- **Căn cứ hồ sơ:** nội dung CV/JD được trình bày để người dùng kiểm tra.
- **Giải thích model:** đóng góp thực tế của feature vào đầu ra, chỉ công bố khi có phương pháp phù hợp và được kiểm tra.

Không khẳng định một evidence là lý do model xếp cao chỉ vì evidence đó đang được hiển thị.

## 11. Ví dụ minh họa

JD yêu cầu backend Python/FastAPI, ít nhất hai năm kinh nghiệm backend và có dự án PostgreSQL.

| Tín hiệu | Ứng viên A | Ứng viên B |
|---|---|---|
| Semantic từ AI1 | Cao hơn | Thấp hơn một chút |
| Kinh nghiệm backend xác định được | Sáu tháng | Ba năm |
| Dự án PostgreSQL | Chưa rõ | Có mô tả gắn với dự án |

Sắp theo AI1 đơn thuần có thể đưa A lên trước. AI2 được học từ nhãn độc lập để có thể ưu tiên B khi kinh nghiệm và dự án là các yếu tố quan trọng của JD.

Đây là ví dụ về khả năng mong muốn, không phải quy tắc cứng rằng B luôn đứng trước A. Nếu thời gian backend của B không có căn cứ, không được tự gán ba năm vào feature.

## 12. Kế hoạch kiểm chứng giá trị

### 12.1. So sánh tối thiểu

| Cấu hình | Mục đích |
|---|---|
| Chỉ sắp theo tín hiệu semantic AI1 | Đo chất lượng khi không có model AI2 tổng hợp |
| Model chỉ dùng feature nghiệp vụ | Đo khả năng của tín hiệu ngoài AI1 |
| Model kết hợp semantic và nghiệp vụ | Kiểm chứng lợi ích của đề xuất |
| Cùng họ model và protocol, bỏ nhóm semantic | Ablation để đo đóng góp của AI1, tránh nhầm với khác biệt thuật toán |

### 12.2. Metric

- Precision@K, Recall@K, MRR và NDCG@K theo yêu cầu DOCX.
- Định nghĩa trước nhãn relevant và các giá trị K dựa trên nhu cầu sàng lọc.
- Báo cáo theo JD rồi tổng hợp; nêu rõ cách xử lý JD không có ứng viên relevant và denominator không xác định.
- Với nhãn graded relevance, ưu tiên dùng NDCG@K để phản ánh mức phù hợp khác nhau.
- Có phân tích sai số và độ bất định của chênh lệch giữa các cấu hình; không kết luận chỉ từ một con số tổng.

### 12.3. Kiểm tra phụ thuộc AI1

Thử nghiệm có kiểm soát khi một phần kết quả semantic bị thiếu hoặc nhiễu; kiểm tra riêng các trường hợp AI1 bỏ sót evidence quan trọng. Báo cáo mức giảm chất lượng ranking và nhóm hồ sơ bị ảnh hưởng.

Thử nghiệm này đánh giá độ bền, không chứng minh hệ thống có thể tự phục hồi mọi lỗi và không cho phép thay kết quả AI1 thật bằng điểm giả trong vận hành.

## 13. Xử lý khi AI1 không khả dụng

Phiên bản đầu không tự động đổi sang một model/điểm khác mà không thông báo.

- Không biến lỗi AI1 thành điểm 0.
- Không đưa vector thiếu semantic vào model chưa được huấn luyện/kiểm chứng cho trường hợp đó.
- Nếu chưa có chế độ suy luận thiếu semantic được đánh giá riêng, trả trạng thái ranking chưa khả dụng; HR vẫn xem được hồ sơ gốc.
- Model chỉ dùng feature nghiệp vụ trước hết là cấu hình thực nghiệm. Muốn dùng làm fallback phải có quyết định và kiểm chứng riêng, với phiên bản/chế độ được công bố rõ.

## 14. Tiêu chí chấp nhận hướng tiếp cận

Đề xuất chỉ được coi là có giá trị khi:

1. Feature tính được từ dữ liệu thực ở thời điểm suy luận và tái hiện được.
2. Ground truth độc lập với điểm dự đoán AI1.
3. Có baseline và so sánh model trên cùng protocol.
4. Đo được liệu model kết hợp có cải thiện so với chỉ dùng AI1 và chỉ dùng feature nghiệp vụ hay không.
5. Có phân tích trường hợp AI1 sai, dữ liệu thiếu và ranking sai.
6. Đầu ra không gây hiểu nhầm thành quyết định tuyển dụng hoặc xác suất phù hợp đã được hiệu chuẩn.

Chưa đặt ngưỡng cải thiện số học trong spec ý tưởng. Sau khảo sát dữ liệu, cần chốt metric chính, K, mức cải thiện có ý nghĩa và protocol trước khi đánh giá test cuối.

Nếu model kết hợp không cải thiện, báo cáo đúng kết quả, xem lại feature/dữ liệu và chưa coi model phức tạp hơn là phương án được chấp nhận.

## 15. Quyết định cần chốt ở bước thiết kế tiếp theo

1. Dữ liệu CV/JD hiện có hỗ trợ những feature nào một cách đáng tin?
2. Nhóm feature semantic nào phù hợp với đầu ra AI1 đã hoàn thành?
3. Ai gán nhãn, rubric ra sao, nhãn nhị phân hay nhiều mức?
4. Phạm vi ngành nghề/cấp bậc và quy mô tập dữ liệu ban đầu?
5. Protocol chia tập, các baseline và metric chính?
6. Phần explanation tối thiểu cần hiển thị những gì?

## Kết luận

> AI1 tìm nội dung liên quan; feature engineering bổ sung các tín hiệu nghiệp vụ có căn cứ; AI2 học cách kết hợp chúng để xếp thứ tự hồ sơ theo từng JD.

Hướng này giữ đúng yêu cầu Candidate–Job Ranking trong DOCX, tận dụng AI1 mà không buộc toàn bộ feature phải đi qua bước truy xuất của AI1. Nó không cam kết loại bỏ sai số đầu vào; giá trị phải được xác nhận bằng dữ liệu và thực nghiệm.
