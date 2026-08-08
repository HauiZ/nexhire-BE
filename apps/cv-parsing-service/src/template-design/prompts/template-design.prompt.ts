import type { ParsedResume } from '@nexhire/shared';

import {
  CANVAS_FONT_FAMILIES,
  CANVAS_ICON_NAMES,
  CV_BINDING_PLACEHOLDERS,
  MAX_CANVAS_PAGES,
  MAX_ELEMENTS_PER_PAGE,
} from '../canvas-design.constants';
import { CANVAS_PAGE_HEIGHT, CANVAS_PAGE_WIDTH } from '../canvas.types';

const placeholderTable = (): string =>
  Object.entries(CV_BINDING_PLACEHOLDERS)
    .map(([field, placeholder]) => `- ${field} -> "${placeholder}"`)
    .join('\n');

/**
 * Prompt cho lệnh gọi #2 — dựng lại layout của PDF thành CanvasDocument.
 *
 * Điểm khó nhất không phải toạ độ mà là GIỮ HÌNH DÁNG NHƯNG THAY NỘI DUNG:
 * template là hàng công khai, chữ trong canvas không được là tên và số điện
 * thoại thật của người trong PDF.
 *
 * `parsedResume` được đưa vào với vai trò nói rõ là để BIẾT ô nào ứng với binding
 * nào — không phải để chép lại. Không nói rõ thì model rất dễ hiểu là được phép
 * dán dữ liệu thật vào.
 */
export const buildTemplateDesignPrompt = (parsedResume: ParsedResume): string => `
You are a CV template designer. You are given a CV/resume PDF and the data that has
already been extracted from it. Rebuild the VISUAL DESIGN of that PDF as a canvas
document of absolutely-positioned elements.

The canvas page is exactly ${CANVAS_PAGE_WIDTH} x ${CANVAS_PAGE_HEIGHT} pixels (A4 at 96dpi).
All coordinates are pixels from the top-left corner of the page.

Return at most ${MAX_CANVAS_PAGES} pages and at most ${MAX_ELEMENTS_PER_PAGE} elements per page.

## Already-extracted data

This is what the PDF contains. Use it ONLY to decide which "binding" each text box
should carry and which array index it refers to. Do NOT copy these values into the
"text" field — see the placeholder rules below.

${JSON.stringify(parsedResume)}

## Rules for the "text" field

1. If a text box carries a "binding", set "text" to the GENERIC PLACEHOLDER for that
   binding field, taken from the table below. Never the real value from the data above.
   This template will be published publicly and must not contain anyone's personal data.

2. If a text box has "binding": null, copy its text VERBATIM from the PDF. These are
   section headings and static labels (for example "KINH NGHIỆM LÀM VIỆC", "Kỹ năng").
   They are generic already and they are what gives the template its character.

3. Keep each element's width and height close to what the original text occupied, so the
   layout still looks right with placeholder text of a similar length.

## Placeholder table

${placeholderTable()}

## Binding rules

- Use "binding": null for headings, labels, and any decorative text.
- For "profile.*" fields, "index" must be null.
- For list fields (experiences, educations, skills, certifications, projects), "index" is
  the zero-based position in the corresponding array of the extracted data above.
- "experiences.period" and "educations.period" are for a single text box that shows a date
  range such as "01/2021 – 12/2023". Use them instead of trying to bind months and years
  separately.

## Element rules

- Portrait photos and avatar frames: emit a "shape" (use "ellipse" for a round photo, or
  "rect" with borderRadius for a rounded one) at the same position and size, with
  fill "#e5e7eb". Do not attempt to reproduce the image itself.
- Coloured banners, sidebars, dividers and rules: emit "shape" elements.
- Contact icons: emit "icon" elements. Allowed names: ${CANVAS_ICON_NAMES.join(', ')}.
  If the PDF uses an icon that is not in this list, omit the icon and keep the text.
- Allowed fonts: ${CANVAS_FONT_FAMILIES.join(' | ')}. Pick the closest match.
- Colours must be hex strings such as "#2563eb". For a shape with no stroke use
  "transparent" for "stroke".
- Order elements back-to-front: backgrounds and banners first, text on top.

Reproduce the layout as faithfully as you can: column structure, banner heights, margins,
font sizes and weights, and the vertical rhythm between sections.
`.trim();
