import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';

import type { ParsedResume } from '@nexhire/shared';

import { AiManagementService } from '../../ai-management/ai-management.service';
import { GeminiResumeNormalizerService } from '../../gemini/gemini-resume-normalizer.service';
import { CANVAS_DESIGN_SCHEMA } from '../schemas/canvas-design.schema';
import { DocumentBuffer, OpenAiTemplateDesignClient } from '../openai-template-design.client';

const CONFIG: Record<string, unknown> = {
  'cvParsingService.openai.apiKey': 'sk-test',
  'cvParsingService.openai.baseUrl': 'https://modelapi.vn/v1',
  'cvParsingService.openai.timeoutMs': 60000,
  'cvParsingService.templateDesign.maxOutputTokens': 16384,
};

const pdf = (): DocumentBuffer => ({
  data: Buffer.from('%PDF-1.7 fake'),
  mimeType: 'application/pdf',
});

const resume = (): ParsedResume => ({
  profile: { fullName: 'Trần Thị Bích' },
  skills: [],
  experiences: [],
  educations: [],
  certifications: [],
  projects: [],
});

const responseOf = (payload: unknown, extra: Record<string, unknown> = {}) =>
  of({
    data: {
      status: 'completed',
      output_text: JSON.stringify(payload),
      usage: { input_tokens: 1200, output_tokens: 3400, total_tokens: 4600 },
      ...extra,
    },
  } as never);

const minimalDesign = () => ({
  pages: [
    {
      background: '#ffffff',
      elements: [
        {
          kind: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 20,
          text: 'NGUYỄN VĂN A',
          fontFamily: 'Roboto, sans-serif',
          fontSize: 24,
          fontWeight: 700,
          italic: false,
          underline: false,
          color: '#111827',
          align: 'left',
          binding: { field: 'profile.fullName', index: null },
        },
      ],
    },
  ],
});

describe('OpenAiTemplateDesignClient', () => {
  let client: OpenAiTemplateDesignClient;
  let httpService: { post: jest.Mock; get: jest.Mock };
  let configService: ConfigService;

  const lastPostBody = (): Record<string, any> => httpService.post.mock.calls.at(-1)![1];
  const lastPostConfig = (): Record<string, any> => httpService.post.mock.calls.at(-1)![2];

  beforeEach(() => {
    // Các test đường lỗi cố tình kích hoạt logger.error — giữ output test sạch.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    httpService = { post: jest.fn(), get: jest.fn() };
    configService = {
      get: jest.fn((key: string, fallback?: unknown) => CONFIG[key] ?? fallback),
    } as unknown as ConfigService;

    client = new OpenAiTemplateDesignClient(
      httpService as unknown as HttpService,
      configService,
      { getOpenAiModel: jest.fn().mockResolvedValue('gpt-4o') } as unknown as AiManagementService,
      new GeminiResumeNormalizerService(),
    );
  });

  describe('designCanvas — cách gọi provider', () => {
    it('gửi CANVAS_DESIGN_SCHEMA ở chế độ strict', async () => {
      httpService.post.mockReturnValue(responseOf(minimalDesign()));

      await client.designCanvas(pdf(), resume());

      expect(lastPostBody().text.format).toEqual({
        type: 'json_schema',
        name: 'canvas_design',
        strict: true,
        schema: CANVAS_DESIGN_SCHEMA,
      });
    });

    it('dùng ngân sách token riêng của template design, không dùng của parse CV', async () => {
      httpService.post.mockReturnValue(responseOf(minimalDesign()));

      await client.designCanvas(pdf(), resume());

      expect(lastPostBody().max_output_tokens).toBe(16384);
    });

    it('dùng model do AiManagementService phân giải', async () => {
      httpService.post.mockReturnValue(responseOf(minimalDesign()));

      await client.designCanvas(pdf(), resume());

      expect(lastPostBody().model).toBe('gpt-4o');
    });

    it('gửi PDF dạng data URL base64 kèm prompt', async () => {
      httpService.post.mockReturnValue(responseOf(minimalDesign()));

      await client.designCanvas(pdf(), resume());

      const content = lastPostBody().input[0].content;
      expect(content[0]).toMatchObject({
        type: 'input_file',
        file_data: `data:application/pdf;base64,${Buffer.from('%PDF-1.7 fake').toString('base64')}`,
      });
      expect(content[1].type).toBe('input_text');
    });

    it('nhúng dữ liệu đã trích vào prompt để model biết bind vào đâu', async () => {
      httpService.post.mockReturnValue(responseOf(minimalDesign()));

      await client.designCanvas(pdf(), resume());

      expect(lastPostBody().input[0].content[1].text).toContain('Trần Thị Bích');
    });

    it('gọi đúng endpoint /responses với Authorization và timeout', async () => {
      httpService.post.mockReturnValue(responseOf(minimalDesign()));

      await client.designCanvas(pdf(), resume());

      expect(httpService.post.mock.calls.at(-1)![0]).toBe('https://modelapi.vn/v1/responses');
      expect(lastPostConfig()).toMatchObject({
        timeout: 60000,
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      });
    });

    it('trả về design đã parse và số token đã dùng', async () => {
      httpService.post.mockReturnValue(responseOf(minimalDesign()));

      const result = await client.designCanvas(pdf(), resume());

      expect(result.design.pages).toHaveLength(1);
      expect(result.usage).toEqual({ inputTokens: 1200, outputTokens: 3400, totalTokens: 4600 });
    });
  });

  describe('designCanvas — chế độ hỏng', () => {
    it('ném OUTPUT_TRUNCATED khi provider báo chạm trần token, không cố JSON.parse', async () => {
      httpService.post.mockReturnValue(
        of({
          data: {
            status: 'incomplete',
            incomplete_details: { reason: 'max_output_tokens' },
            output_text: '{"pages":[{"background":"#fff","eleme',
          },
        } as never),
      );

      await expect(client.designCanvas(pdf(), resume())).rejects.toMatchObject({
        response: { code: 'TEMPLATE_DESIGN.OUTPUT_TRUNCATED' },
      });
    });

    it('ném OUTPUT_TRUNCATED cho mọi lý do incomplete khác', async () => {
      httpService.post.mockReturnValue(
        of({
          data: {
            status: 'incomplete',
            incomplete_details: { reason: 'content_filter' },
            output_text: '{}',
          },
        } as never),
      );

      await expect(client.designCanvas(pdf(), resume())).rejects.toMatchObject({
        response: { code: 'TEMPLATE_DESIGN.OUTPUT_TRUNCATED' },
      });
    });

    it('ném AI.SERVICE_UNAVAILABLE khi provider trả lỗi HTTP', async () => {
      httpService.post.mockReturnValue(throwError(() => new AxiosError('boom')));

      await expect(client.designCanvas(pdf(), resume())).rejects.toMatchObject({
        response: { code: 'AI.SERVICE_UNAVAILABLE' },
      });
    });

    it('ném AI.SERVICE_UNAVAILABLE khi chưa cấu hình API key', async () => {
      (configService.get as jest.Mock).mockImplementation((key: string, fallback?: unknown) =>
        key === 'cvParsingService.openai.apiKey' ? undefined : (CONFIG[key] ?? fallback),
      );

      await expect(client.designCanvas(pdf(), resume())).rejects.toMatchObject({
        response: { code: 'AI.SERVICE_UNAVAILABLE' },
      });
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('ném AI.SERVICE_UNAVAILABLE khi response không có output text', async () => {
      httpService.post.mockReturnValue(of({ data: { status: 'completed' } } as never));

      await expect(client.designCanvas(pdf(), resume())).rejects.toMatchObject({
        response: { code: 'AI.SERVICE_UNAVAILABLE' },
      });
    });

    it('không rò rỉ API key ra message của lỗi', async () => {
      httpService.post.mockReturnValue(throwError(() => new AxiosError('boom')));

      await expect(client.designCanvas(pdf(), resume())).rejects.toMatchObject({
        response: { message: expect.not.stringContaining('sk-test') },
      });
    });
  });

  describe('extractResume', () => {
    const rawResume = {
      profile: { fullName: '  Nguyễn Minh Khoa  ', phone: null },
      skills: [{ name: 'NestJS' }, { name: 'nestjs' }, 'PostgreSQL'],
      experiences: [],
      educations: [],
      certifications: [],
      projects: [],
    };

    it('chạy normalizer thay vì trả thẳng payload thô', async () => {
      httpService.post.mockReturnValue(responseOf(rawResume));

      const result = await client.extractResume(pdf());

      expect(result.parsedResume.profile.fullName).toBe('Nguyễn Minh Khoa');
      expect(result.parsedResume.skills.map((s) => s.name)).toEqual(['NestJS', 'PostgreSQL']);
    });

    it('giữ lại payload thô của provider để lưu khi cần điều tra', async () => {
      httpService.post.mockReturnValue(responseOf(rawResume));

      const result = await client.extractResume(pdf());

      expect(result.rawPayload).toEqual(rawResume);
    });

    it('dùng schema parse CV có sẵn chứ không dùng schema canvas', async () => {
      httpService.post.mockReturnValue(responseOf(rawResume));

      await client.extractResume(pdf());

      expect(lastPostBody().text.format.name).toBe('parsed_resume');
      expect(lastPostBody().text.format.strict).toBe(true);
    });

    it('cũng phát hiện output bị cắt cụt', async () => {
      httpService.post.mockReturnValue(
        of({
          data: {
            status: 'incomplete',
            incomplete_details: { reason: 'max_output_tokens' },
            output_text: '{"profile"',
          },
        } as never),
      );

      await expect(client.extractResume(pdf())).rejects.toMatchObject({
        response: { code: 'TEMPLATE_DESIGN.OUTPUT_TRUNCATED' },
      });
    });
  });

  describe('fetchDocument', () => {
    it('tải PDF và lấy mime type từ content-type', async () => {
      httpService.get.mockReturnValue(
        of({
          data: new Uint8Array([1, 2, 3]).buffer,
          headers: { 'content-type': 'application/pdf; charset=binary' },
        } as never),
      );

      const result = await client.fetchDocument('https://storage/cv.pdf');

      expect(result.mimeType).toBe('application/pdf');
      expect(result.data).toEqual(Buffer.from([1, 2, 3]));
    });

    it('mặc định application/pdf khi thiếu content-type', async () => {
      httpService.get.mockReturnValue(
        of({ data: new Uint8Array([1]).buffer, headers: {} } as never),
      );

      const result = await client.fetchDocument('https://storage/cv.pdf');

      expect(result.mimeType).toBe('application/pdf');
    });

    it('ném AI.SERVICE_UNAVAILABLE khi không tải được tài liệu', async () => {
      httpService.get.mockReturnValue(throwError(() => new AxiosError('404')));

      await expect(client.fetchDocument('https://storage/gone.pdf')).rejects.toMatchObject({
        response: { code: 'AI.SERVICE_UNAVAILABLE' },
      });
    });
  });
});
