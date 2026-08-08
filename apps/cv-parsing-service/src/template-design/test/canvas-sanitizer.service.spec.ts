import type { ParsedResume } from '@nexhire/shared';

import { CanvasSanitizerService } from '../canvas-sanitizer.service';
import {
  RawCanvasDesign,
  RawIconElement,
  RawShapeElement,
  RawTextElement,
  TextElement,
} from '../canvas.types';

const emptyResume = (): ParsedResume => ({
  profile: {},
  skills: [],
  experiences: [],
  educations: [],
  certifications: [],
  projects: [],
});

const rawText = (over: Partial<RawTextElement> = {}): RawTextElement => ({
  kind: 'text',
  x: 48,
  y: 42,
  width: 400,
  height: 46,
  text: 'NGUYỄN VĂN A',
  fontFamily: 'Roboto, sans-serif',
  fontSize: 36,
  fontWeight: 800,
  italic: false,
  underline: false,
  color: '#ffffff',
  align: 'left',
  binding: null,
  ...over,
});

const rawShape = (over: Partial<RawShapeElement> = {}): RawShapeElement => ({
  kind: 'shape',
  x: 0,
  y: 0,
  width: 794,
  height: 160,
  shape: 'rect',
  fill: '#2563eb',
  stroke: 'transparent',
  strokeWidth: 0,
  borderRadius: 0,
  ...over,
});

const rawIcon = (over: Partial<RawIconElement> = {}): RawIconElement => ({
  kind: 'icon',
  x: 48,
  y: 190,
  width: 18,
  height: 18,
  name: 'mail',
  color: '#2563eb',
  ...over,
});

const design = (...elements: RawCanvasDesign['pages'][number]['elements']): RawCanvasDesign => ({
  pages: [{ background: '#ffffff', elements }],
});

describe('CanvasSanitizerService', () => {
  let service: CanvasSanitizerService;

  beforeEach(() => {
    service = new CanvasSanitizerService();
  });

  describe('luật 8 — nở element tối giản thành CanvasElement đầy đủ', () => {
    it('cấp id duy nhất theo key cho từng element', () => {
      const { canvas } = service.sanitize(
        design(rawShape(), rawText(), rawIcon()),
        emptyResume(),
        'professional',
      );

      expect(canvas.pages[0].elements.map((el) => el.id)).toEqual([
        'professional-shape-1',
        'professional-text-2',
        'professional-icon-3',
      ]);
    });

    it('gán zIndex theo thứ tự mảng, bắt đầu từ 1', () => {
      const { canvas } = service.sanitize(
        design(rawShape(), rawText(), rawIcon()),
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].elements.map((el) => el.zIndex)).toEqual([1, 2, 3]);
    });

    it('điền mặc định cho các field không hỏi model', () => {
      const { canvas } = service.sanitize(design(rawText()), emptyResume(), 'k');

      expect(canvas.pages[0].elements[0]).toMatchObject({
        rotation: 0,
        opacity: 1,
        locked: false,
        hidden: false,
      });
    });

    it('điền lineHeight và letterSpacing cho text vì model không trả về', () => {
      const { canvas } = service.sanitize(design(rawText()), emptyResume(), 'k');

      expect(canvas.pages[0].elements[0]).toMatchObject({
        lineHeight: 1.4,
        letterSpacing: 0,
      });
    });

    it('cố định pageSize A4 và không lấy từ model', () => {
      const { canvas } = service.sanitize(design(rawText()), emptyResume(), 'k');

      expect(canvas.pageSize).toEqual({ width: 794, height: 1123 });
    });

    it('cấp id trang theo key và số thứ tự', () => {
      const { canvas } = service.sanitize(
        {
          pages: [
            { background: '#ffffff', elements: [rawText()] },
            { background: '#f9fafb', elements: [rawText()] },
          ],
        },
        emptyResume(),
        'modern',
      );

      expect(canvas.pages.map((p) => p.id)).toEqual(['modern-page-1', 'modern-page-2']);
    });

    it('giữ background của từng trang', () => {
      const { canvas } = service.sanitize(
        { pages: [{ background: '#f9fafb', elements: [rawText()] }] },
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].background).toBe('#f9fafb');
    });

    it('chuyển kind thành type và bỏ kind khỏi element đầu ra', () => {
      const { canvas } = service.sanitize(design(rawText()), emptyResume(), 'k');
      const element = canvas.pages[0].elements[0];

      expect(element.type).toBe('text');
      expect(element).not.toHaveProperty('kind');
    });

    it('báo cáo số element trả về và số element giữ lại', () => {
      const { report } = service.sanitize(
        design(rawShape(), rawText(), rawIcon()),
        emptyResume(),
        'k',
      );

      expect(report).toMatchObject({ elementsReturned: 3, elementsKept: 3, dropped: [] });
    });
  });

  describe('luật 6+7 — binding', () => {
    const resumeWithTwoJobs = (): ParsedResume => ({
      ...emptyResume(),
      profile: { fullName: 'Trần Thị Bích' },
      experiences: [
        { companyName: 'FPT Software', position: 'Dev' },
        { companyName: 'VNG', position: 'Senior Dev' },
      ],
    });

    it('giữ binding hợp lệ trỏ vào phần tử có thật', () => {
      const { canvas, report } = service.sanitize(
        design(rawText({ binding: { field: 'experiences.companyName', index: 1 } })),
        resumeWithTwoJobs(),
        'k',
      );

      expect((canvas.pages[0].elements[0] as TextElement).binding).toEqual({
        field: 'experiences.companyName',
        index: 1,
      });
      expect(report.bindingsResolved).toBe(1);
    });

    it('xoá binding khi index vượt quá độ dài mảng nhưng giữ nguyên text', () => {
      const { canvas, report } = service.sanitize(
        design(
          rawText({
            text: 'Công ty TNHH ABC',
            binding: { field: 'experiences.companyName', index: 5 },
          }),
        ),
        resumeWithTwoJobs(),
        'k',
      );

      const element = canvas.pages[0].elements[0] as TextElement;
      expect(element.binding).toBeNull();
      expect(element.text).toBe('Công ty TNHH ABC');
      expect(report.bindingsCleared).toBe(1);
    });

    it('xoá binding có field không nằm trong từ vựng cho phép', () => {
      const { canvas, report } = service.sanitize(
        design(rawText({ binding: { field: 'profile.taxCode', index: null } })),
        resumeWithTwoJobs(),
        'k',
      );

      expect((canvas.pages[0].elements[0] as TextElement).binding).toBeNull();
      expect(report.bindingsCleared).toBe(1);
    });

    it('ép index về null cho nhóm profile dù model gửi số', () => {
      const { canvas } = service.sanitize(
        design(rawText({ binding: { field: 'profile.fullName', index: 0 } })),
        resumeWithTwoJobs(),
        'k',
      );

      expect((canvas.pages[0].elements[0] as TextElement).binding).toEqual({
        field: 'profile.fullName',
        index: null,
      });
    });

    it('xoá binding nhóm danh sách khi model gửi index null', () => {
      const { canvas, report } = service.sanitize(
        design(rawText({ binding: { field: 'experiences.position', index: null } })),
        resumeWithTwoJobs(),
        'k',
      );

      expect((canvas.pages[0].elements[0] as TextElement).binding).toBeNull();
      expect(report.bindingsCleared).toBe(1);
    });

    it('xoá binding profile khi field đó không có trong ParsedResume', () => {
      const { canvas, report } = service.sanitize(
        design(rawText({ binding: { field: 'profile.linkedinUrl', index: null } })),
        resumeWithTwoJobs(),
        'k',
      );

      expect((canvas.pages[0].elements[0] as TextElement).binding).toBeNull();
      expect(report.bindingsCleared).toBe(1);
    });

    it('không đếm bindingsResolved cho element vốn không có binding', () => {
      const { report } = service.sanitize(
        design(rawText({ binding: null })),
        resumeWithTwoJobs(),
        'k',
      );

      expect(report).toMatchObject({ bindingsResolved: 0, bindingsCleared: 0 });
    });
  });

  describe('luật 1 — giới hạn số trang và số element', () => {
    it('cắt bỏ trang thứ tư trở đi', () => {
      const page = { background: '#ffffff', elements: [rawText()] };

      const { canvas, report } = service.sanitize(
        { pages: [page, page, page, page, page] },
        emptyResume(),
        'k',
      );

      expect(canvas.pages).toHaveLength(3);
      expect(report.dropped.filter((d) => d.reason === 'PAGE_LIMIT')).toHaveLength(2);
    });

    it('cắt bỏ element thứ 501 trở đi trong một trang', () => {
      const elements = Array.from({ length: 505 }, () => rawText());

      const { canvas, report } = service.sanitize(design(...elements), emptyResume(), 'k');

      expect(canvas.pages[0].elements).toHaveLength(500);
      expect(report.dropped.filter((d) => d.reason === 'ELEMENT_LIMIT')).toHaveLength(5);
      expect(report).toMatchObject({ elementsReturned: 505, elementsKept: 500 });
    });
  });

  describe('luật 2 — toạ độ và kích thước', () => {
    it('loại element có width bằng 0', () => {
      const { canvas, report } = service.sanitize(
        design(rawText({ width: 0 }), rawShape()),
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].elements.map((el) => el.type)).toEqual(['shape']);
      expect(report.dropped).toEqual([{ reason: 'NON_POSITIVE_SIZE', kind: 'text' }]);
    });

    it('loại element có height âm', () => {
      const { report } = service.sanitize(
        design(rawText({ height: -5 }), rawShape()),
        emptyResume(),
        'k',
      );

      expect(report.dropped).toEqual([{ reason: 'NON_POSITIVE_SIZE', kind: 'text' }]);
    });

    it('loại element nằm trọn bên phải ngoài trang', () => {
      const { canvas, report } = service.sanitize(
        design(rawText({ x: 900, width: 100 }), rawShape()),
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].elements.map((el) => el.type)).toEqual(['shape']);
      expect(report.dropped).toEqual([{ reason: 'OFF_PAGE', kind: 'text' }]);
    });

    it('loại element nằm trọn bên trên ngoài trang', () => {
      const { report } = service.sanitize(
        design(rawText({ y: -50, height: 20 }), rawShape()),
        emptyResume(),
        'k',
      );

      expect(report.dropped).toEqual([{ reason: 'OFF_PAGE', kind: 'text' }]);
    });

    it('kẹp toạ độ âm về 0 và đếm là đã kẹp', () => {
      const { canvas, report } = service.sanitize(
        design(rawText({ x: -20, y: -10 })),
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].elements[0]).toMatchObject({ x: 0, y: 0 });
      expect(report.clamped).toBe(1);
    });

    it('thu nhỏ element tràn qua mép phải để nằm gọn trong trang', () => {
      const { canvas } = service.sanitize(
        design(rawText({ x: 700, width: 300 })),
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].elements[0]).toMatchObject({ x: 700, width: 94 });
    });

    it('không đếm clamped cho element vốn đã nằm gọn trong trang', () => {
      const { report } = service.sanitize(design(rawText()), emptyResume(), 'k');

      expect(report.clamped).toBe(0);
    });
  });

  describe('luật 3 — màu', () => {
    it('thay màu text không hợp lệ bằng mặc định', () => {
      const { canvas } = service.sanitize(design(rawText({ color: 'blue' })), emptyResume(), 'k');

      expect(canvas.pages[0].elements[0]).toMatchObject({ color: '#111827' });
    });

    it('chấp nhận hex 3 ký tự', () => {
      const { canvas } = service.sanitize(design(rawText({ color: '#f00' })), emptyResume(), 'k');

      expect(canvas.pages[0].elements[0]).toMatchObject({ color: '#f00' });
    });

    it('thay fill shape không hợp lệ bằng mặc định', () => {
      const { canvas } = service.sanitize(
        design(rawShape({ fill: 'rgb(1,2,3)' })),
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].elements[0]).toMatchObject({ fill: '#e5e7eb' });
    });

    it('giữ nguyên chuỗi transparent cho stroke', () => {
      const { canvas } = service.sanitize(
        design(rawShape({ stroke: 'transparent' })),
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].elements[0]).toMatchObject({ stroke: 'transparent' });
    });

    it('thay background trang không hợp lệ bằng trắng', () => {
      const { canvas } = service.sanitize(
        { pages: [{ background: 'white', elements: [rawText()] }] },
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].background).toBe('#ffffff');
    });
  });

  describe('luật 4+5 — font', () => {
    it('kẹp fontSize quá lớn về 96', () => {
      const { canvas } = service.sanitize(design(rawText({ fontSize: 400 })), emptyResume(), 'k');

      expect(canvas.pages[0].elements[0]).toMatchObject({ fontSize: 96 });
    });

    it('kẹp fontSize quá nhỏ về 6', () => {
      const { canvas } = service.sanitize(design(rawText({ fontSize: 1 })), emptyResume(), 'k');

      expect(canvas.pages[0].elements[0]).toMatchObject({ fontSize: 6 });
    });

    it('làm tròn fontWeight về giá trị hợp lệ gần nhất', () => {
      const { canvas } = service.sanitize(design(rawText({ fontWeight: 450 })), emptyResume(), 'k');

      expect(canvas.pages[0].elements[0]).toMatchObject({ fontWeight: 400 });
    });

    it('làm tròn fontWeight 900 xuống 800', () => {
      const { canvas } = service.sanitize(design(rawText({ fontWeight: 900 })), emptyResume(), 'k');

      expect(canvas.pages[0].elements[0]).toMatchObject({ fontWeight: 800 });
    });

    it('thay fontFamily ngoài danh sách bằng Roboto', () => {
      const { canvas } = service.sanitize(
        design(rawText({ fontFamily: 'Comic Sans MS' })),
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].elements[0]).toMatchObject({ fontFamily: 'Roboto, sans-serif' });
    });

    it('thay align không hợp lệ bằng left', () => {
      const { canvas } = service.sanitize(
        design(rawText({ align: 'justify' })),
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].elements[0]).toMatchObject({ align: 'left' });
    });
  });

  describe('loại element không dùng được', () => {
    it('loại icon có tên ngoài ICON_REGISTRY', () => {
      const { canvas, report } = service.sanitize(
        design(rawIcon({ name: 'rocket' }), rawShape()),
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].elements.map((el) => el.type)).toEqual(['shape']);
      expect(report.dropped).toEqual([{ reason: 'UNKNOWN_ICON', kind: 'icon' }]);
    });

    it('loại element có kind lạ', () => {
      const { canvas, report } = service.sanitize(
        design({ kind: 'video', x: 0, y: 0, width: 10, height: 10 } as never, rawShape()),
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].elements.map((el) => el.type)).toEqual(['shape']);
      expect(report.dropped).toEqual([{ reason: 'UNKNOWN_KIND', kind: 'video' }]);
    });

    it('thay shape lạ bằng rect thay vì loại element', () => {
      const { canvas } = service.sanitize(
        design(rawShape({ shape: 'triangle' })),
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].elements[0]).toMatchObject({ type: 'shape', shape: 'rect' });
    });

    it('đánh số id liên tục sau khi đã loại element hỏng', () => {
      const { canvas } = service.sanitize(
        design(rawText({ width: 0 }), rawText(), rawIcon()),
        emptyResume(),
        'k',
      );

      expect(canvas.pages[0].elements.map((el) => el.id)).toEqual(['k-text-1', 'k-icon-2']);
      expect(canvas.pages[0].elements.map((el) => el.zIndex)).toEqual([1, 2]);
    });
  });

  describe('luật 10 — chốt chặn PII', () => {
    const realResume = (): ParsedResume => ({
      ...emptyResume(),
      profile: { fullName: 'Trần Thị Bích Ngọc', contactEmail: 'ngoc.tran@gmail.com' },
      experiences: [{ companyName: 'Ngân hàng Techcombank', position: 'Chuyên viên phân tích' }],
      skills: [{ name: 'Python' }],
    });

    it('thay text bằng placeholder khi model dán dữ liệu thật vào ô đã bind', () => {
      const { canvas, report } = service.sanitize(
        design(
          rawText({
            text: 'Trần Thị Bích Ngọc',
            binding: { field: 'profile.fullName', index: null },
          }),
        ),
        realResume(),
        'k',
      );

      const element = canvas.pages[0].elements[0] as TextElement;
      expect(element.text).toBe('NGUYỄN VĂN A');
      expect(report.piiScrubbed).toBe(1);
    });

    it('so khớp không phân biệt hoa thường và khoảng trắng thừa', () => {
      const { canvas, report } = service.sanitize(
        design(
          rawText({
            text: '  trần thị   bích ngọc ',
            binding: { field: 'profile.fullName', index: null },
          }),
        ),
        realResume(),
        'k',
      );

      expect((canvas.pages[0].elements[0] as TextElement).text).toBe('NGUYỄN VĂN A');
      expect(report.piiScrubbed).toBe(1);
    });

    it('thay dữ liệu thật trong phần tử danh sách theo đúng index', () => {
      const { canvas } = service.sanitize(
        design(
          rawText({
            text: 'Ngân hàng Techcombank',
            binding: { field: 'experiences.companyName', index: 0 },
          }),
        ),
        realResume(),
        'k',
      );

      expect((canvas.pages[0].elements[0] as TextElement).text).toBe('Công ty TNHH ABC');
    });

    it('không đụng vào text đã là placeholder', () => {
      const { canvas, report } = service.sanitize(
        design(
          rawText({ text: 'NGUYỄN VĂN A', binding: { field: 'profile.fullName', index: null } }),
        ),
        realResume(),
        'k',
      );

      expect((canvas.pages[0].elements[0] as TextElement).text).toBe('NGUYỄN VĂN A');
      expect(report.piiScrubbed).toBe(0);
    });

    it('không đụng vào element không có binding dù text trùng dữ liệu thật', () => {
      const { canvas, report } = service.sanitize(
        design(rawText({ text: 'Trần Thị Bích Ngọc', binding: null })),
        realResume(),
        'k',
      );

      expect((canvas.pages[0].elements[0] as TextElement).text).toBe('Trần Thị Bích Ngọc');
      expect(report.piiScrubbed).toBe(0);
    });

    it('không đụng vào element có binding đã bị xoá vì index sai', () => {
      const { canvas, report } = service.sanitize(
        design(
          rawText({
            text: 'Ngân hàng Techcombank',
            binding: { field: 'experiences.companyName', index: 7 },
          }),
        ),
        realResume(),
        'k',
      );

      expect((canvas.pages[0].elements[0] as TextElement).text).toBe('Ngân hàng Techcombank');
      expect(report.piiScrubbed).toBe(0);
    });

    it('bỏ qua field period vì không dựng lại được chuỗi ngày tháng để so', () => {
      const resume: ParsedResume = {
        ...emptyResume(),
        experiences: [{ companyName: 'A', position: 'B', startYear: 2021, endYear: 2023 }],
      };

      const { canvas, report } = service.sanitize(
        design(
          rawText({
            text: '2021 - 2023',
            binding: { field: 'experiences.period', index: 0 },
          }),
        ),
        resume,
        'k',
      );

      expect((canvas.pages[0].elements[0] as TextElement).text).toBe('2021 - 2023');
      expect(report.piiScrubbed).toBe(0);
    });
  });

  describe('luật 9 — canvas không dùng được', () => {
    it('ném CANVAS_INVALID khi model không trả trang nào', () => {
      expect(() => service.sanitize({ pages: [] }, emptyResume(), 'k')).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: 'TEMPLATE_DESIGN.CANVAS_INVALID' }),
        }),
      );
    });

    it('ném CANVAS_INVALID khi mọi element đều bị loại', () => {
      expect(() =>
        service.sanitize(
          design(rawText({ width: 0 }), rawIcon({ name: 'rocket' })),
          emptyResume(),
          'k',
        ),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: 'TEMPLATE_DESIGN.CANVAS_INVALID' }),
        }),
      );
    });

    it('không ném khi còn ít nhất một element sống sót', () => {
      expect(() =>
        service.sanitize(design(rawText({ width: 0 }), rawText()), emptyResume(), 'k'),
      ).not.toThrow();
    });

    it('loại trang rỗng thay vì giữ trang không có element nào', () => {
      const { canvas } = service.sanitize(
        {
          pages: [
            { background: '#ffffff', elements: [rawText()] },
            { background: '#ffffff', elements: [] },
          ],
        },
        emptyResume(),
        'k',
      );

      expect(canvas.pages).toHaveLength(1);
    });
  });
});
