import { Injectable, UnprocessableEntityException } from '@nestjs/common';

import { ERROR_CODES, type ParsedResume } from '@nexhire/shared';

import {
  ALLOWED_FONT_WEIGHTS,
  CANVAS_FONT_FAMILIES,
  CANVAS_ICON_NAMES,
  CV_BINDING_FIELDS,
  CV_BINDING_LIST_GROUPS,
  CV_BINDING_PLACEHOLDERS,
  DEFAULT_FILL_COLOR,
  DEFAULT_PAGE_BACKGROUND,
  DEFAULT_STROKE_COLOR,
  DEFAULT_TEXT_COLOR,
  MAX_CANVAS_PAGES,
  MAX_ELEMENTS_PER_PAGE,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
} from './canvas-design.constants';
import {
  CanvasDocument,
  CanvasElement,
  CanvasPage,
  CvBinding,
  CvBindingField,
  DropReason,
  RawCanvasDesign,
  RawCanvasElement,
  SanitizeReport,
  SanitizeResult,
  ShapeKind,
  TextAlign,
  CANVAS_PAGE_HEIGHT,
  CANVAS_PAGE_WIDTH,
} from './canvas.types';

const BINDING_FIELD_SET = new Set<string>(CV_BINDING_FIELDS);
const LIST_GROUP_SET = new Set<string>(CV_BINDING_LIST_GROUPS);
const FONT_FAMILY_SET = new Set<string>(CANVAS_FONT_FAMILIES);
const ICON_NAME_SET = new Set<string>(CANVAS_ICON_NAMES);
const SHAPE_KINDS = new Set<string>(['rect', 'ellipse', 'line']);
const TEXT_ALIGNS = new Set<string>(['left', 'center', 'right']);
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const emptyReport = (): SanitizeReport => ({
  elementsReturned: 0,
  elementsKept: 0,
  dropped: [],
  clamped: 0,
  bindingsResolved: 0,
  bindingsCleared: 0,
  piiScrubbed: 0,
});

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  clamped: boolean;
}

/**
 * Biến đầu ra thô của model thành CanvasDocument hợp lệ.
 * Thuần tuý: không I/O, không phụ thuộc. Toàn bộ luật ở đây test được bằng unit test.
 *
 * Nguyên tắc: hỏng một element thì bỏ element đó, không đánh hỏng cả canvas.
 */
@Injectable()
export class CanvasSanitizerService {
  sanitize(raw: RawCanvasDesign, parsedResume: ParsedResume, key: string): SanitizeResult {
    const report = emptyReport();
    const rawPages = Array.isArray(raw?.pages) ? raw.pages : [];

    report.elementsReturned = rawPages.reduce(
      (total, page) => total + (Array.isArray(page?.elements) ? page.elements.length : 0),
      0,
    );

    // Luật 1 — cắt trang thừa.
    for (let i = MAX_CANVAS_PAGES; i < rawPages.length; i += 1) {
      report.dropped.push({ reason: 'PAGE_LIMIT', kind: 'page' });
    }

    let sequence = 0;

    const pages: CanvasPage[] = rawPages
      .slice(0, MAX_CANVAS_PAGES)
      .map((rawPage, pageIndex) => {
        const rawElements = Array.isArray(rawPage?.elements) ? rawPage.elements : [];
        const elements: CanvasElement[] = [];

        // Luật 1 — cắt element thừa.
        for (let i = MAX_ELEMENTS_PER_PAGE; i < rawElements.length; i += 1) {
          report.dropped.push({
            reason: 'ELEMENT_LIMIT',
            kind: String((rawElements[i] as RawCanvasElement)?.kind ?? 'unknown'),
          });
        }

        for (const rawElement of rawElements.slice(0, MAX_ELEMENTS_PER_PAGE)) {
          const rejection = this.reject(rawElement);
          if (rejection) {
            report.dropped.push({
              reason: rejection,
              kind: String((rawElement as RawCanvasElement)?.kind ?? 'unknown'),
            });
            continue;
          }

          sequence += 1;
          elements.push(
            this.expand(rawElement, key, sequence, elements.length + 1, parsedResume, report),
          );
        }

        report.elementsKept += elements.length;

        return {
          id: `${key}-page-${pageIndex + 1}`,
          background: this.safeColor(rawPage?.background, DEFAULT_PAGE_BACKGROUND),
          elements,
        };
      })
      // Trang không còn element nào thì giữ lại cũng vô nghĩa.
      .filter((page) => page.elements.length > 0);

    // Luật 9 — canvas rỗng là hỏng thật, không cứu được.
    if (pages.length === 0) {
      throw new UnprocessableEntityException({
        code: ERROR_CODES.TEMPLATE_DESIGN.CANVAS_INVALID,
        message: 'AI did not return any usable canvas element',
      });
    }

    const canvas: CanvasDocument = {
      id: `template-${key}`,
      name: key,
      pageSize: { width: CANVAS_PAGE_WIDTH, height: CANVAS_PAGE_HEIGHT },
      pages,
    };

    return { canvas, report };
  }

  /** Trả lý do loại bỏ, hoặc null nếu element dùng được. */
  private reject(raw: RawCanvasElement): DropReason | null {
    if (
      !raw ||
      (raw.kind !== 'text' && raw.kind !== 'shape' && raw.kind !== 'icon' && raw.kind !== 'image')
    ) {
      return 'UNKNOWN_KIND';
    }

    // Luật 2 — kích thước phải dương.
    if (!(raw.width > 0) || !(raw.height > 0)) {
      return 'NON_POSITIVE_SIZE';
    }

    // Luật 2 — nằm trọn ngoài trang thì không cứu được bằng cách kẹp.
    if (
      raw.x >= CANVAS_PAGE_WIDTH ||
      raw.y >= CANVAS_PAGE_HEIGHT ||
      raw.x + raw.width <= 0 ||
      raw.y + raw.height <= 0
    ) {
      return 'OFF_PAGE';
    }

    if (raw.kind === 'icon' && !ICON_NAME_SET.has(raw.name)) {
      return 'UNKNOWN_ICON';
    }

    return null;
  }

  /** Luật 8 — nở element tối giản của model thành CanvasElement đầy đủ. */
  private expand(
    raw: RawCanvasElement,
    key: string,
    sequence: number,
    zIndex: number,
    parsedResume: ParsedResume,
    report: SanitizeReport,
  ): CanvasElement {
    const geometry = this.clampGeometry(raw);
    if (geometry.clamped) {
      report.clamped += 1;
    }

    const base = {
      id: `${key}-${raw.kind}-${sequence}`,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      rotation: 0,
      zIndex,
      opacity: 1,
      locked: false,
      hidden: false,
    };

    if (raw.kind === 'shape') {
      return {
        ...base,
        type: 'shape',
        shape: (SHAPE_KINDS.has(raw.shape) ? raw.shape : 'rect') as ShapeKind,
        fill: this.safeColor(raw.fill, DEFAULT_FILL_COLOR, true),
        stroke: this.safeColor(raw.stroke, DEFAULT_STROKE_COLOR, true),
        strokeWidth: Number.isFinite(raw.strokeWidth) ? Math.max(0, raw.strokeWidth) : 0,
        borderRadius: Number.isFinite(raw.borderRadius) ? Math.max(0, raw.borderRadius) : 0,
      };
    }

    if (raw.kind === 'icon') {
      return {
        ...base,
        type: 'icon',
        name: raw.name,
        color: this.safeColor(raw.color, DEFAULT_TEXT_COLOR),
      };
    }

    if (raw.kind === 'image') {
      return {
        ...base,
        type: 'image',
        src: typeof raw.src === 'string' && raw.src.startsWith('data:image/') ? raw.src : '',
        objectFit:
          raw.objectFit === 'contain' || raw.objectFit === 'fill' ? raw.objectFit : 'cover',
        borderRadius: Number.isFinite(raw.borderRadius) ? Math.max(0, raw.borderRadius) : 0,
      };
    }

    const binding = this.resolveBinding(raw.binding, parsedResume, report);
    const text = typeof raw.text === 'string' ? raw.text : '';

    return {
      ...base,
      type: 'text',
      text: this.scrubPii(text, binding, parsedResume, report),
      binding,
      fontFamily: FONT_FAMILY_SET.has(raw.fontFamily) ? raw.fontFamily : CANVAS_FONT_FAMILIES[0],
      fontSize: this.clampFontSize(raw.fontSize),
      fontWeight: this.nearestFontWeight(raw.fontWeight),
      italic: raw.italic === true,
      underline: raw.underline === true,
      color: this.safeColor(raw.color, DEFAULT_TEXT_COLOR),
      align: (TEXT_ALIGNS.has(raw.align) ? raw.align : 'left') as TextAlign,
      lineHeight: 1.4,
      letterSpacing: 0,
    };
  }

  /**
   * Luật 10 — chốt chặn PII.
   *
   * Prompt yêu cầu model dùng placeholder cho ô đã bind, nhưng prompt là lời khuyên
   * chứ không phải ràng buộc. Chế độ hỏng dễ xảy ra nhất là model lười, dán thẳng
   * dữ liệu vừa trích ở lệnh gọi #1 vào text — và template là hàng công khai.
   *
   * `period` bị bỏ qua: nó là trường dẫn xuất từ 4 số tháng/năm, không dựng lại được
   * chuỗi để so, và bản thân khoảng thời gian không định danh được ai.
   */
  private scrubPii(
    text: string,
    binding: CvBinding | null,
    parsedResume: ParsedResume,
    report: SanitizeReport,
  ): string {
    if (!binding) {
      return text;
    }

    const [group, property] = binding.field.split('.');
    if (property === 'period') {
      return text;
    }

    const source =
      binding.index === null
        ? (parsedResume.profile as Record<string, unknown> | undefined)
        : (parsedResume[group as keyof ParsedResume] as Record<string, unknown>[] | undefined)?.[
            binding.index
          ];

    const real = source?.[property];
    if (typeof real !== 'string' || this.normalize(real) !== this.normalize(text)) {
      return text;
    }

    report.piiScrubbed += 1;
    return CV_BINDING_PLACEHOLDERS[binding.field];
  }

  private normalize(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  /** Luật 2 — kẹp element vào trong khung trang. */
  private clampGeometry(raw: RawCanvasElement): Geometry {
    let { x, y, width, height } = raw;
    let clamped = false;

    if (x < 0) {
      x = 0;
      clamped = true;
    }
    if (y < 0) {
      y = 0;
      clamped = true;
    }
    if (x + width > CANVAS_PAGE_WIDTH) {
      width = CANVAS_PAGE_WIDTH - x;
      clamped = true;
    }
    if (y + height > CANVAS_PAGE_HEIGHT) {
      height = CANVAS_PAGE_HEIGHT - y;
      clamped = true;
    }

    return { x, y, width, height, clamped };
  }

  /** Luật 3 — chỉ nhận hex; 'transparent' hợp lệ cho fill/stroke nhưng không cho chữ. */
  private safeColor(value: unknown, fallback: string, allowTransparent = false): string {
    if (typeof value !== 'string') {
      return fallback;
    }
    if (allowTransparent && value === 'transparent') {
      return value;
    }
    return HEX_COLOR.test(value) ? value : fallback;
  }

  /** Luật 4 */
  private clampFontSize(value: number): number {
    if (!Number.isFinite(value)) {
      return 14;
    }
    return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));
  }

  /** Luật 5 — làm tròn về giá trị hợp lệ gần nhất; hoà thì lấy giá trị nhỏ hơn. */
  private nearestFontWeight(value: number): number {
    if (!Number.isFinite(value)) {
      return 400;
    }
    return ALLOWED_FONT_WEIGHTS.reduce((best, candidate) =>
      Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
    );
  }

  /**
   * Luật 6 + 7 — chỉ giữ binding trỏ tới dữ liệu có thật.
   * Binding hỏng thì xoá binding nhưng GIỮ NGUYÊN text: mất liên kết còn hơn mất chữ.
   */
  private resolveBinding(
    raw: { field: string; index: number | null } | null,
    parsedResume: ParsedResume,
    report: SanitizeReport,
  ): CvBinding | null {
    if (!raw) {
      return null;
    }

    const clear = (): null => {
      report.bindingsCleared += 1;
      return null;
    };

    if (!BINDING_FIELD_SET.has(raw.field)) {
      return clear();
    }

    const field = raw.field as CvBindingField;
    const [group, property] = field.split('.');

    if (!LIST_GROUP_SET.has(group)) {
      // Nhóm profile: index luôn null, và field phải có mặt trong dữ liệu đã trích.
      const value = (parsedResume.profile as Record<string, unknown> | undefined)?.[property];
      if (value === undefined || value === null || value === '') {
        return clear();
      }
      report.bindingsResolved += 1;
      return { field, index: null };
    }

    const list = parsedResume[group as keyof ParsedResume];
    if (
      typeof raw.index !== 'number' ||
      !Number.isInteger(raw.index) ||
      raw.index < 0 ||
      !Array.isArray(list) ||
      raw.index >= list.length
    ) {
      return clear();
    }

    report.bindingsResolved += 1;
    return { field, index: raw.index };
  }
}
