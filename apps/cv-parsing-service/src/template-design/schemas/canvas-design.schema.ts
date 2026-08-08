import {
  CANVAS_FONT_FAMILIES,
  CANVAS_ICON_NAMES,
  CV_BINDING_FIELDS,
} from '../canvas-design.constants';

/**
 * JSON Schema cho lệnh gọi #2 (dựng layout), dùng ở chế độ `strict: true` của
 * OpenAI Responses API.
 *
 * Ràng buộc của strict mode — theo đúng khuôn OPENAI_PARSED_RESUME_SCHEMA đã chạy được:
 *  - mọi object phải có `additionalProperties: false`
 *  - mọi property phải nằm trong `required`; optional biểu diễn bằng type nullable
 *  - KHÔNG dùng `minimum`/`maximum`/`pattern`/`minItems` — không được hỗ trợ.
 *    Mọi ràng buộc số và màu đẩy sang CanvasSanitizerService.
 *
 * ImageElement bị loại khỏi union: model không sinh được bytes ảnh, mà
 * ImageElement.src là dataURL. Ảnh chân dung biểu diễn bằng shape.
 */
export const CANVAS_DESIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pages'],
  properties: {
    pages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['background', 'elements'],
        properties: {
          background: { type: 'string' },
          elements: {
            type: 'array',
            items: {
              anyOf: [
                {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'kind',
                    'x',
                    'y',
                    'width',
                    'height',
                    'text',
                    'fontFamily',
                    'fontSize',
                    'fontWeight',
                    'italic',
                    'underline',
                    'color',
                    'align',
                    'binding',
                  ],
                  properties: {
                    kind: { type: 'string', enum: ['text'] },
                    x: { type: 'number' },
                    y: { type: 'number' },
                    width: { type: 'number' },
                    height: { type: 'number' },
                    text: { type: 'string' },
                    fontFamily: { type: 'string', enum: [...CANVAS_FONT_FAMILIES] },
                    fontSize: { type: 'number' },
                    fontWeight: { type: 'number' },
                    italic: { type: 'boolean' },
                    underline: { type: 'boolean' },
                    color: { type: 'string' },
                    align: { type: 'string', enum: ['left', 'center', 'right'] },
                    binding: {
                      anyOf: [
                        { type: 'null' },
                        {
                          type: 'object',
                          additionalProperties: false,
                          required: ['field', 'index'],
                          properties: {
                            field: { type: 'string', enum: [...CV_BINDING_FIELDS] },
                            index: { type: ['number', 'null'] },
                          },
                        },
                      ],
                    },
                  },
                },
                {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'kind',
                    'x',
                    'y',
                    'width',
                    'height',
                    'shape',
                    'fill',
                    'stroke',
                    'strokeWidth',
                    'borderRadius',
                  ],
                  properties: {
                    kind: { type: 'string', enum: ['shape'] },
                    x: { type: 'number' },
                    y: { type: 'number' },
                    width: { type: 'number' },
                    height: { type: 'number' },
                    shape: { type: 'string', enum: ['rect', 'ellipse', 'line'] },
                    fill: { type: 'string' },
                    stroke: { type: 'string' },
                    strokeWidth: { type: 'number' },
                    borderRadius: { type: 'number' },
                  },
                },
                {
                  type: 'object',
                  additionalProperties: false,
                  required: ['kind', 'x', 'y', 'width', 'height', 'name', 'color'],
                  properties: {
                    kind: { type: 'string', enum: ['icon'] },
                    x: { type: 'number' },
                    y: { type: 'number' },
                    width: { type: 'number' },
                    height: { type: 'number' },
                    name: { type: 'string', enum: [...CANVAS_ICON_NAMES] },
                    color: { type: 'string' },
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
} as const;
