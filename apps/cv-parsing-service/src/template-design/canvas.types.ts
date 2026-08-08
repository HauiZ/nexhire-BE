// Mô hình CanvasDocument của CV-builder (freeform, kiểu Canva).
// GIỮ ĐỒNG BỘ với Nexthire-FE/src/pages/CvBuilderPage/canvas/canvas.types.ts
// Hai repo không dùng chung package nên phải nhân đôi.

export const CANVAS_PAGE_WIDTH = 794; // A4 @ 96dpi
export const CANVAS_PAGE_HEIGHT = 1123;

export type ShapeKind = 'rect' | 'ellipse' | 'line';
export type TextAlign = 'left' | 'center' | 'right';

export type CvBindingField =
  // Trường đơn — index luôn null.
  | 'profile.fullName'
  | 'profile.headline'
  | 'profile.contactEmail'
  | 'profile.phone'
  | 'profile.location'
  | 'profile.summary'
  | 'profile.linkedinUrl'
  | 'profile.portfolioUrl'
  // Trường trong danh sách — index >= 0.
  | 'experiences.companyName'
  | 'experiences.position'
  | 'experiences.period'
  | 'experiences.description'
  | 'educations.schoolName'
  | 'educations.degree'
  | 'educations.fieldOfStudy'
  | 'educations.period'
  | 'educations.description'
  | 'skills.name'
  | 'certifications.name'
  | 'certifications.issuer'
  | 'projects.name'
  | 'projects.description';

export interface CvBinding {
  field: CvBindingField;
  index: number | null;
}

export interface ElementBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  opacity: number;
  locked: boolean;
  hidden: boolean;
}

export interface TextElement extends ElementBase {
  type: 'text';
  text: string;
  binding?: CvBinding | null;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  color: string;
  align: TextAlign;
  lineHeight: number;
  letterSpacing: number;
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
}

export interface IconElement extends ElementBase {
  type: 'icon';
  name: string;
  color: string;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  src: string;
  objectFit: 'cover' | 'contain' | 'fill';
  borderRadius: number;
}

export type CanvasElement = TextElement | ShapeElement | IconElement | ImageElement;

export interface CanvasPage {
  id: string;
  elements: CanvasElement[];
  background: string;
}

export interface CanvasDocument {
  id: string;
  name: string;
  pageSize: { width: number; height: number };
  pages: CanvasPage[];
}

// ---- Đầu ra thô của model -------------------------------------------------
// Element tối giản: không có id/zIndex/rotation/opacity/locked/hidden.
// Server tự cấp ở luật 8 của sanitizer.

export interface RawTextElement {
  kind: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  color: string;
  align: string;
  binding: { field: string; index: number | null } | null;
}

export interface RawShapeElement {
  kind: 'shape';
  x: number;
  y: number;
  width: number;
  height: number;
  shape: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
}

export interface RawIconElement {
  kind: 'icon';
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  color: string;
}

export interface RawImageElement {
  kind: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  objectFit: string;
  borderRadius: number;
}

export type RawCanvasElement = RawTextElement | RawShapeElement | RawIconElement | RawImageElement;

export interface RawCanvasPage {
  background: string;
  elements: RawCanvasElement[];
}

export interface RawCanvasDesign {
  pages: RawCanvasPage[];
}

// ---- Báo cáo sanitize -----------------------------------------------------

export type DropReason =
  | 'UNKNOWN_KIND'
  | 'OFF_PAGE'
  | 'NON_POSITIVE_SIZE'
  | 'UNKNOWN_ICON'
  | 'PAGE_LIMIT'
  | 'ELEMENT_LIMIT';

export interface SanitizeReport {
  elementsReturned: number;
  elementsKept: number;
  dropped: Array<{ reason: DropReason; kind: string }>;
  clamped: number;
  bindingsResolved: number;
  bindingsCleared: number;
  piiScrubbed: number;
}

export interface SanitizeResult {
  canvas: CanvasDocument;
  report: SanitizeReport;
}
