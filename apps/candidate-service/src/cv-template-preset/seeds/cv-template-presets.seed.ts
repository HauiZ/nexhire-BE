import { DataSource } from 'typeorm';
import candidateDataSource from '../../../data-source';
import {
  CvTemplatePresetCategory,
  CvTemplatePresetStatus,
  type CvTemplatePresetI18n,
} from '../entities/cv-template-preset.entity';

const CANVAS_PAGE_WIDTH = 794;
const CANVAS_PAGE_HEIGHT = 1123;
const ALL_CATEGORIES = [
  CvTemplatePresetCategory.IT,
  CvTemplatePresetCategory.MARKETING,
  CvTemplatePresetCategory.SALES,
  CvTemplatePresetCategory.HR,
];

type CanvasElement = Record<string, unknown>;

type PresetSeed = {
  id: string;
  key: string;
  nameI18n: CvTemplatePresetI18n;
  descriptionI18n: CvTemplatePresetI18n;
  categories: CvTemplatePresetCategory[];
  accent: string;
  thumbnailUrl: string | null;
  canvas: Record<string, unknown>;
  sortOrder: number;
};

type Builder = {
  key: string;
  z: number;
};

function nextId(builder: Builder, prefix: string) {
  builder.z += 1;
  return `${builder.key}-${prefix}-${builder.z}`;
}

function mkText(
  builder: Builder,
  options: Partial<CanvasElement> & {
    text: string;
    x: number;
    y: number;
    width: number;
  },
): CanvasElement {
  return {
    id: nextId(builder, 'text'),
    type: 'text',
    height: 28,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    fontFamily: 'Roboto, sans-serif',
    fontSize: 14,
    fontWeight: 400,
    italic: false,
    underline: false,
    color: '#111827',
    align: 'left',
    lineHeight: 1.4,
    letterSpacing: 0,
    zIndex: builder.z,
    ...options,
  };
}

function mkRect(
  builder: Builder,
  options: Partial<CanvasElement> & {
    x: number;
    y: number;
    width: number;
    height: number;
  },
): CanvasElement {
  return {
    id: nextId(builder, 'shape'),
    type: 'shape',
    shape: 'rect',
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    fill: '#2563eb',
    stroke: 'transparent',
    strokeWidth: 0,
    borderRadius: 0,
    zIndex: builder.z,
    ...options,
  };
}

function mkEllipse(
  builder: Builder,
  options: Partial<CanvasElement> & {
    x: number;
    y: number;
    width: number;
    height: number;
  },
): CanvasElement {
  return {
    ...mkRect(builder, options),
    shape: 'ellipse',
  };
}

function mkLine(
  builder: Builder,
  options: { x: number; y: number; width: number; stroke?: string; strokeWidth?: number },
): CanvasElement {
  return {
    id: nextId(builder, 'shape'),
    type: 'shape',
    shape: 'line',
    x: options.x,
    y: options.y,
    width: options.width,
    height: 4,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    fill: 'transparent',
    stroke: options.stroke ?? '#111827',
    strokeWidth: options.strokeWidth ?? 2,
    borderRadius: 0,
    zIndex: builder.z,
  };
}

function mkIcon(
  builder: Builder,
  options: { name: string; x: number; y: number; size?: number; color?: string },
): CanvasElement {
  const size = options.size ?? 18;
  return {
    id: nextId(builder, 'icon'),
    type: 'icon',
    name: options.name,
    x: options.x,
    y: options.y,
    width: size,
    height: size,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    color: options.color ?? '#111827',
    zIndex: builder.z,
  };
}

function wrapCanvas(key: string, name: string, elements: CanvasElement[], background = '#ffffff') {
  return {
    id: `template-${key}`,
    name,
    pageSize: {
      width: CANVAS_PAGE_WIDTH,
      height: CANVAS_PAGE_HEIGHT,
    },
    pages: [
      {
        id: `template-${key}-page-1`,
        elements,
        background,
      },
    ],
  };
}

function buildProfessionalCanvas() {
  const builder: Builder = { key: 'professional', z: 0 };
  const accent = '#2563eb';
  const elements = [
    mkRect(builder, { x: 0, y: 0, width: CANVAS_PAGE_WIDTH, height: 160, fill: accent }),
    mkText(builder, {
      text: 'NGUYỄN VĂN A',
      x: 48,
      y: 42,
      width: 500,
      height: 46,
      fontSize: 36,
      fontWeight: 800,
      color: '#ffffff',
    }),
    mkText(builder, {
      text: 'Kỹ sư phần mềm',
      x: 48,
      y: 96,
      width: 500,
      height: 28,
      fontSize: 18,
      color: '#dbeafe',
    }),
    mkIcon(builder, { name: 'mail', x: 48, y: 190, color: accent }),
    mkText(builder, { text: 'email@example.com', x: 76, y: 189, width: 240 }),
    mkIcon(builder, { name: 'phone', x: 320, y: 190, color: accent }),
    mkText(builder, { text: '0123 456 789', x: 348, y: 189, width: 200 }),
    mkIcon(builder, { name: 'map-pin', x: 540, y: 190, color: accent }),
    mkText(builder, { text: 'Hà Nội', x: 568, y: 189, width: 180 }),
    mkText(builder, {
      text: 'KINH NGHIỆM LÀM VIỆC',
      x: 48,
      y: 250,
      width: 400,
      height: 26,
      fontSize: 18,
      fontWeight: 700,
      color: accent,
    }),
    mkLine(builder, { x: 48, y: 282, width: 698, stroke: accent, strokeWidth: 2 }),
    mkText(builder, {
      text: 'Senior Frontend Developer — Công ty ABC',
      x: 48,
      y: 296,
      width: 600,
      height: 24,
      fontSize: 15,
      fontWeight: 600,
    }),
    mkText(builder, {
      text: '01/2022 - Hiện tại',
      x: 48,
      y: 320,
      width: 300,
      height: 20,
      fontSize: 13,
      color: '#6b7280',
    }),
    mkText(builder, {
      text: '- Phát triển sản phẩm với hàng triệu người dùng.\n- Tối ưu hiệu năng ứng dụng React.\n- Hướng dẫn thành viên mới.',
      x: 48,
      y: 344,
      width: 660,
      height: 78,
      fontSize: 14,
      lineHeight: 1.6,
    }),
    mkText(builder, {
      text: 'HỌC VẤN',
      x: 48,
      y: 448,
      width: 400,
      height: 26,
      fontSize: 18,
      fontWeight: 700,
      color: accent,
    }),
    mkLine(builder, { x: 48, y: 480, width: 698, stroke: accent, strokeWidth: 2 }),
    mkText(builder, {
      text: 'Đại học Bách Khoa Hà Nội',
      x: 48,
      y: 494,
      width: 500,
      height: 24,
      fontSize: 15,
      fontWeight: 600,
    }),
    mkText(builder, {
      text: 'KỸ NĂNG',
      x: 48,
      y: 566,
      width: 400,
      height: 26,
      fontSize: 18,
      fontWeight: 700,
      color: accent,
    }),
    mkLine(builder, { x: 48, y: 598, width: 698, stroke: accent, strokeWidth: 2 }),
    mkText(builder, {
      text: 'React · TypeScript · Node.js · PostgreSQL · Git',
      x: 48,
      y: 612,
      width: 660,
      height: 24,
      fontSize: 14,
    }),
  ];
  return wrapCanvas('professional', 'Professional', elements);
}

function buildMinimalCanvas() {
  const builder: Builder = { key: 'minimal', z: 0 };
  const elements = [
    mkText(builder, {
      text: 'NGUYỄN VĂN A',
      x: 97,
      y: 80,
      width: 600,
      height: 52,
      fontSize: 42,
      fontWeight: 300,
      letterSpacing: 2,
      align: 'center',
    }),
    mkText(builder, {
      text: 'KỸ SƯ PHẦN MỀM',
      x: 97,
      y: 138,
      width: 600,
      height: 24,
      fontSize: 15,
      letterSpacing: 4,
      color: '#6b7280',
      align: 'center',
    }),
    mkText(builder, {
      text: 'email@example.com   ·   0123 456 789   ·   Hà Nội',
      x: 97,
      y: 172,
      width: 600,
      height: 22,
      fontSize: 13,
      color: '#6b7280',
      align: 'center',
    }),
    mkLine(builder, { x: 297, y: 208, width: 200, stroke: '#111827', strokeWidth: 1 }),
    mkText(builder, {
      text: 'Kinh nghiệm',
      x: 97,
      y: 248,
      width: 600,
      height: 26,
      fontSize: 20,
      fontWeight: 600,
    }),
    mkText(builder, {
      text: 'Senior Frontend Developer, Công ty ABC — 2022 đến nay',
      x: 97,
      y: 282,
      width: 600,
      height: 22,
      fontSize: 14,
      fontWeight: 600,
    }),
    mkText(builder, {
      text: 'Phát triển và tối ưu ứng dụng web quy mô lớn, dẫn dắt nhóm nhỏ.',
      x: 97,
      y: 306,
      width: 600,
      height: 44,
      fontSize: 14,
      color: '#374151',
      lineHeight: 1.6,
    }),
    mkText(builder, {
      text: 'Học vấn',
      x: 97,
      y: 372,
      width: 600,
      height: 26,
      fontSize: 20,
      fontWeight: 600,
    }),
    mkText(builder, {
      text: 'Đại học Bách Khoa Hà Nội — Công nghệ Thông tin, 2016-2020',
      x: 97,
      y: 406,
      width: 600,
      height: 22,
      fontSize: 14,
    }),
    mkText(builder, {
      text: 'Kỹ năng',
      x: 97,
      y: 456,
      width: 600,
      height: 26,
      fontSize: 20,
      fontWeight: 600,
    }),
    mkText(builder, {
      text: 'React · TypeScript · Node.js · PostgreSQL · UI/UX',
      x: 97,
      y: 490,
      width: 600,
      height: 22,
      fontSize: 14,
      color: '#374151',
    }),
  ];
  return wrapCanvas('minimal', 'Minimal', elements);
}

function buildModernCanvas() {
  const builder: Builder = { key: 'modern', z: 0 };
  const sidebar = '#1f2937';
  const accent = '#38bdf8';
  const elements = [
    mkRect(builder, { x: 0, y: 0, width: 280, height: CANVAS_PAGE_HEIGHT, fill: sidebar }),
    mkEllipse(builder, { x: 80, y: 56, width: 120, height: 120, fill: '#374151' }),
    mkText(builder, {
      text: 'LIÊN HỆ',
      x: 32,
      y: 210,
      width: 216,
      height: 22,
      fontSize: 14,
      fontWeight: 700,
      color: accent,
      letterSpacing: 1,
    }),
    mkIcon(builder, { name: 'mail', x: 32, y: 244, color: accent, size: 16 }),
    mkText(builder, {
      text: 'email@example.com',
      x: 56,
      y: 243,
      width: 200,
      height: 20,
      fontSize: 12,
      color: '#e5e7eb',
    }),
    mkIcon(builder, { name: 'phone', x: 32, y: 272, color: accent, size: 16 }),
    mkText(builder, {
      text: '0123 456 789',
      x: 56,
      y: 271,
      width: 200,
      height: 20,
      fontSize: 12,
      color: '#e5e7eb',
    }),
    mkText(builder, {
      text: 'KỸ NĂNG',
      x: 32,
      y: 356,
      width: 216,
      height: 22,
      fontSize: 14,
      fontWeight: 700,
      color: accent,
      letterSpacing: 1,
    }),
    mkText(builder, {
      text: 'React / Next.js\nTypeScript\nNode.js\nPostgreSQL\nUI/UX Design',
      x: 32,
      y: 388,
      width: 216,
      height: 120,
      fontSize: 13,
      color: '#e5e7eb',
      lineHeight: 1.9,
    }),
    mkText(builder, {
      text: 'NGUYỄN VĂN A',
      x: 320,
      y: 64,
      width: 430,
      height: 44,
      fontSize: 34,
      fontWeight: 800,
      color: '#111827',
    }),
    mkText(builder, {
      text: 'Kỹ sư phần mềm',
      x: 320,
      y: 112,
      width: 430,
      height: 26,
      fontSize: 17,
      color: accent,
      fontWeight: 600,
    }),
    mkLine(builder, { x: 320, y: 150, width: 426, stroke: '#e5e7eb', strokeWidth: 2 }),
    mkText(builder, {
      text: 'KINH NGHIỆM',
      x: 320,
      y: 178,
      width: 430,
      height: 24,
      fontSize: 17,
      fontWeight: 700,
      color: sidebar,
    }),
    mkText(builder, {
      text: 'Senior Frontend Developer — Công ty ABC',
      x: 320,
      y: 210,
      width: 430,
      height: 22,
      fontSize: 14,
      fontWeight: 600,
    }),
    mkText(builder, {
      text: 'Phát triển sản phẩm hàng triệu người dùng, tối ưu hiệu năng và dẫn dắt nhóm.',
      x: 320,
      y: 256,
      width: 430,
      height: 48,
      fontSize: 13,
      color: '#374151',
      lineHeight: 1.6,
    }),
  ];
  return wrapCanvas('modern', 'Modern', elements);
}

const PRESETS: PresetSeed[] = [
  {
    id: '0bafc70d-8a1e-4e56-83f6-cc0d16bbf895',
    key: 'professional',
    nameI18n: {
      vi: 'Chuyên nghiệp',
      en: 'Professional',
      ja: 'プロフェッショナル',
    },
    descriptionI18n: {
      vi: 'Header màu nổi bật, bố cục 1 cột rõ ràng.',
      en: 'A polished one-column layout with a strong header.',
      ja: '印象的なヘッダーを備えた明快な1カラム構成です。',
    },
    categories: ALL_CATEGORIES,
    accent: '#2563eb',
    thumbnailUrl: null,
    canvas: buildProfessionalCanvas(),
    sortOrder: 10,
  },
  {
    id: '1bafc70d-8a1e-4e56-83f6-cc0d16bbf896',
    key: 'minimal',
    nameI18n: {
      vi: 'Tối giản',
      en: 'Minimal',
      ja: 'ミニマル',
    },
    descriptionI18n: {
      vi: 'Nhiều khoảng trắng, canh giữa, thanh lịch.',
      en: 'A quiet, spacious layout with centered identity and clean sections.',
      ja: '余白を活かした、中央配置の上品で読みやすい構成です。',
    },
    categories: ALL_CATEGORIES,
    accent: '#111827',
    thumbnailUrl: null,
    canvas: buildMinimalCanvas(),
    sortOrder: 20,
  },
  {
    id: '2bafc70d-8a1e-4e56-83f6-cc0d16bbf897',
    key: 'modern',
    nameI18n: {
      vi: 'Hiện đại',
      en: 'Modern',
      ja: 'モダン',
    },
    descriptionI18n: {
      vi: 'Sidebar tối 2 cột, có chỗ đặt ảnh đại diện.',
      en: 'A two-column layout with a dark sidebar and avatar space.',
      ja: '暗色サイドバーとアバター枠を備えた2カラム構成です。',
    },
    categories: ALL_CATEGORIES,
    accent: '#1f2937',
    thumbnailUrl: null,
    canvas: buildModernCanvas(),
    sortOrder: 30,
  },
];

export async function seedCvTemplatePresets(dataSource: DataSource): Promise<void> {
  for (const preset of PRESETS) {
    await dataSource.query(
      `
        INSERT INTO "cv_template_presets" (
          "id",
          "key",
          "name_i18n",
          "description_i18n",
          "categories",
          "accent",
          "thumbnail_url",
          "canvas",
          "status",
          "sort_order",
          "version"
        )
        VALUES (
          $1,
          $2,
          $3::jsonb,
          $4::jsonb,
          $5::"cv_template_preset_category_enum"[],
          $6,
          $7,
          $8::jsonb,
          $9,
          $10,
          1
        )
        ON CONFLICT ("key") DO UPDATE
        SET
          "name_i18n" = EXCLUDED."name_i18n",
          "description_i18n" = EXCLUDED."description_i18n",
          "categories" = EXCLUDED."categories",
          "accent" = EXCLUDED."accent",
          "thumbnail_url" = EXCLUDED."thumbnail_url",
          "version" = CASE
            WHEN "cv_template_presets"."canvas" IS DISTINCT FROM EXCLUDED."canvas"
              THEN "cv_template_presets"."version" + 1
            ELSE "cv_template_presets"."version"
          END,
          "canvas" = EXCLUDED."canvas",
          "status" = CASE
            WHEN "cv_template_presets"."status" = 'ARCHIVED'
              THEN "cv_template_presets"."status"
            ELSE EXCLUDED."status"
          END,
          "sort_order" = COALESCE("cv_template_presets"."sort_order", EXCLUDED."sort_order"),
          "deleted_at" = CASE
            WHEN "cv_template_presets"."status" = 'ARCHIVED'
              THEN "cv_template_presets"."deleted_at"
            ELSE NULL
          END,
          "updated_at" = now()
      `,
      [
        preset.id,
        preset.key,
        JSON.stringify(preset.nameI18n),
        JSON.stringify(preset.descriptionI18n),
        preset.categories,
        preset.accent,
        preset.thumbnailUrl,
        JSON.stringify(preset.canvas),
        CvTemplatePresetStatus.PUBLISHED,
        preset.sortOrder,
      ],
    );
  }
}

export async function seed(): Promise<void> {
  await candidateDataSource.initialize();
  try {
    await seedCvTemplatePresets(candidateDataSource);
    // eslint-disable-next-line no-console
    console.log('cv template presets seeded');
  } finally {
    await candidateDataSource.destroy();
  }
}

export default seed;
