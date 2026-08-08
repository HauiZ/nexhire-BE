import {
  CANVAS_FONT_FAMILIES,
  CANVAS_ICON_NAMES,
  CV_BINDING_FIELDS,
  CV_BINDING_PLACEHOLDERS,
} from '../canvas-design.constants';
import { CANVAS_DESIGN_SCHEMA } from '../schemas/canvas-design.schema';

type JsonSchema = Record<string, unknown>;

/** Duyệt mọi node object của schema, kể cả trong anyOf và items. */
const walk = (node: unknown, visit: (schema: JsonSchema) => void): void => {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }

  const schema = node as JsonSchema;
  visit(schema);

  walk(schema.anyOf, visit);
  walk(schema.items, visit);
  if (schema.properties && typeof schema.properties === 'object') {
    Object.values(schema.properties as JsonSchema).forEach((child) => walk(child, visit));
  }
};

const objectNodes = (): JsonSchema[] => {
  const found: JsonSchema[] = [];
  walk(CANVAS_DESIGN_SCHEMA, (schema) => {
    if (schema.type === 'object') {
      found.push(schema);
    }
  });
  return found;
};

const findEnum = (predicate: (values: string[]) => boolean): string[] | undefined => {
  let found: string[] | undefined;
  walk(CANVAS_DESIGN_SCHEMA, (schema) => {
    const values = schema.enum as string[] | undefined;
    if (Array.isArray(values) && predicate(values)) {
      found = values;
    }
  });
  return found;
};

describe('CANVAS_DESIGN_SCHEMA', () => {
  describe('tuân thủ ràng buộc strict mode của OpenAI', () => {
    it('mọi object đều đặt additionalProperties false', () => {
      const offenders = objectNodes().filter((s) => s.additionalProperties !== false);

      expect(offenders).toEqual([]);
    });

    it('mọi property của mọi object đều nằm trong required', () => {
      const offenders = objectNodes()
        .map((schema) => ({
          properties: Object.keys((schema.properties as JsonSchema) ?? {}).sort(),
          required: [...((schema.required as string[]) ?? [])].sort(),
        }))
        .filter((s) => JSON.stringify(s.properties) !== JSON.stringify(s.required));

      expect(offenders).toEqual([]);
    });

    it('không dùng từ khoá mà strict mode không hỗ trợ', () => {
      const unsupported = [
        'minimum',
        'maximum',
        'multipleOf',
        'minLength',
        'maxLength',
        'pattern',
        'format',
        'minItems',
        'maxItems',
        'oneOf',
        'allOf',
        '$ref',
      ];
      const used: string[] = [];

      walk(CANVAS_DESIGN_SCHEMA, (schema) => {
        unsupported.filter((keyword) => keyword in schema).forEach((k) => used.push(k));
      });

      expect(used).toEqual([]);
    });

    it('gốc schema là object chứ không phải anyOf', () => {
      expect(CANVAS_DESIGN_SCHEMA.type).toBe('object');
    });
  });

  describe('không lệch với hằng số dùng chung', () => {
    it('enum binding khớp CV_BINDING_FIELDS', () => {
      expect(findEnum((v) => v.includes('profile.fullName'))).toEqual([...CV_BINDING_FIELDS]);
    });

    it('enum fontFamily khớp CANVAS_FONT_FAMILIES', () => {
      expect(findEnum((v) => v.includes('Roboto, sans-serif'))).toEqual([...CANVAS_FONT_FAMILIES]);
    });

    it('enum icon khớp CANVAS_ICON_NAMES', () => {
      expect(findEnum((v) => v.includes('graduation-cap'))).toEqual([...CANVAS_ICON_NAMES]);
    });

    it('mọi binding field đều có placeholder tương ứng', () => {
      const missing = CV_BINDING_FIELDS.filter((field) => !CV_BINDING_PLACEHOLDERS[field]);

      expect(missing).toEqual([]);
    });

    it('không có placeholder thừa cho field không tồn tại', () => {
      expect(Object.keys(CV_BINDING_PLACEHOLDERS).sort()).toEqual([...CV_BINDING_FIELDS].sort());
    });
  });

  it('union element phủ đúng ba loại text, shape, icon', () => {
    const kinds = findEnum((v) => v.length === 1 && ['text', 'shape', 'icon'].includes(v[0]));

    expect(kinds).toBeDefined();
    const allKinds: string[] = [];
    walk(CANVAS_DESIGN_SCHEMA, (schema) => {
      const values = schema.enum as string[] | undefined;
      if (Array.isArray(values) && values.length === 1) {
        allKinds.push(values[0]);
      }
    });
    expect(allKinds.sort()).toEqual(['icon', 'shape', 'text']);
  });
});
