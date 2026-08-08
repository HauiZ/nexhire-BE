import { CvBindingField } from './canvas.types';

/**
 * Font mà CV-builder render được.
 * GIỮ ĐỒNG BỘ với FONT_FAMILIES ở
 * Nexthire-FE/src/pages/CvBuilderPage/canvas/components/PropertiesPanel.tsx
 */
export const CANVAS_FONT_FAMILIES = [
  'Roboto, sans-serif',
  'Arial, sans-serif',
  'Montserrat, sans-serif',
  'Georgia, serif',
] as const;

/**
 * Icon mà CV-builder render được.
 * GIỮ ĐỒNG BỘ với các khoá của ICON_REGISTRY ở
 * Nexthire-FE/src/pages/CvBuilderPage/canvas/icons.ts
 */
export const CANVAS_ICON_NAMES = [
  'mail',
  'phone',
  'map-pin',
  'globe',
  'at-sign',
  'share',
  'message',
  'calendar',
  'user',
  'briefcase',
  'graduation-cap',
  'award',
  'star',
  'heart',
  'languages',
  'code',
  'send',
  'link',
  'building',
  'check',
  'circle',
] as const;

export const CV_BINDING_FIELDS: readonly CvBindingField[] = [
  'profile.fullName',
  'profile.headline',
  'profile.contactEmail',
  'profile.phone',
  'profile.location',
  'profile.summary',
  'profile.linkedinUrl',
  'profile.portfolioUrl',
  'experiences.companyName',
  'experiences.position',
  'experiences.period',
  'experiences.description',
  'educations.schoolName',
  'educations.degree',
  'educations.fieldOfStudy',
  'educations.period',
  'educations.description',
  'skills.name',
  'certifications.name',
  'certifications.issuer',
  'projects.name',
  'projects.description',
] as const;

/**
 * Placeholder hiển thị trong template. Một nguồn sự thật dùng chung giữa
 * prompt (nhúng vào text yêu cầu model) và luật 10 của sanitizer (chốt chặn PII).
 * Tách đôi sẽ khiến mọi element bound bị đánh dấu piiScrubbed oan.
 *
 * Chuỗi literal cố định — golden fixture của test phụ thuộc vào chúng.
 */
export const CV_BINDING_PLACEHOLDERS: Record<CvBindingField, string> = {
  'profile.fullName': 'NGUYỄN VĂN A',
  'profile.headline': 'Lập trình viên Frontend',
  'profile.contactEmail': 'email@example.com',
  'profile.phone': '0900 000 000',
  'profile.location': 'Hà Nội, Việt Nam',
  'profile.summary':
    'Lập trình viên với 3 năm kinh nghiệm xây dựng ứng dụng web. Thành thạo React và Node.js, quen làm việc trong nhóm Agile và chú trọng chất lượng mã nguồn.',
  'profile.linkedinUrl': 'linkedin.com/in/nguyenvana',
  'profile.portfolioUrl': 'nguyenvana.dev',
  'experiences.companyName': 'Công ty TNHH ABC',
  'experiences.position': 'Chuyên viên',
  'experiences.period': '01/2021 – 12/2023',
  'experiences.description':
    'Phát triển và bảo trì các tính năng chính của sản phẩm. Phối hợp với nhóm thiết kế và kiểm thử để đưa tính năng lên môi trường thật đúng hạn. Tối ưu hiệu năng trang và giảm thời gian tải.',
  'educations.schoolName': 'Đại học Bách khoa Hà Nội',
  'educations.degree': 'Cử nhân',
  'educations.fieldOfStudy': 'Công nghệ thông tin',
  'educations.period': '09/2017 – 06/2021',
  'educations.description': 'Tốt nghiệp loại Giỏi. Đồ án tốt nghiệp về hệ thống phân tán.',
  'skills.name': 'React',
  'certifications.name': 'AWS Certified Developer',
  'certifications.issuer': 'Amazon Web Services',
  'projects.name': 'Hệ thống quản lý nội bộ',
  'projects.description':
    'Ứng dụng web quản lý quy trình nội bộ cho khoảng 200 người dùng. Đảm nhiệm phần giao diện và tích hợp API. Rút ngắn thời gian xử lý hồ sơ từ hai ngày xuống nửa ngày.',
};

/** Nhóm binding trỏ vào một mảng của ParsedResume (index bắt buộc là số). */
export const CV_BINDING_LIST_GROUPS = [
  'experiences',
  'educations',
  'skills',
  'certifications',
  'projects',
] as const;

export const MAX_CANVAS_PAGES = 3;
export const MAX_ELEMENTS_PER_PAGE = 500;
export const MIN_FONT_SIZE = 6;
export const MAX_FONT_SIZE = 96;
export const ALLOWED_FONT_WEIGHTS = [300, 400, 500, 600, 700, 800] as const;

export const DEFAULT_TEXT_COLOR = '#111827';
export const DEFAULT_FILL_COLOR = '#e5e7eb';
export const DEFAULT_STROKE_COLOR = 'transparent';
export const DEFAULT_PAGE_BACKGROUND = '#ffffff';
