import { type ParsedResume } from '@nexhire/shared';

import { PdfCanvasLayoutExtractorService } from '../pdf-canvas-layout-extractor.service';

describe('PdfCanvasLayoutExtractorService', () => {
  let service: PdfCanvasLayoutExtractorService;

  beforeEach(() => {
    service = new PdfCanvasLayoutExtractorService();
  });

  it('converts PDF text and embedded images to canvas elements instead of a page snapshot', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <pdf2xml>
        <page number="1" top="0" left="0" height="400" width="200">
          <fontspec id="0" size="20" family="CanvaSans" color="#040404"/>
          <image top="10" left="20" width="50" height="60" src="/tmp/source-1_1.jpg"/>
          <text top="20" left="30" width="120" height="24" font="0"><b>TRẦN MINH KIÊN</b></text>
        </page>
      </pdf2xml>`;
    const imageSrc = 'data:image/jpeg;base64,portrait';

    jest
      .spyOn(
        service as unknown as {
          extractArtifacts: (pdf: Buffer) => Promise<{
            xml: string;
            images: Record<string, string>;
          }>;
        },
        'extractArtifacts',
      )
      .mockResolvedValue({
        xml,
        images: {
          '/tmp/source-1_1.jpg': imageSrc,
          'source-1_1.jpg': imageSrc,
        },
      });

    const result = await service.extract(
      {
        data: Buffer.from('%PDF-1.4'),
        mimeType: 'application/pdf',
      },
      { profile: { fullName: 'TRẦN MINH KIÊN' } } as ParsedResume,
    );

    expect(result).toEqual(
      expect.objectContaining({
        rawPayload: expect.objectContaining({
          source: 'pdftohtml',
          pageCount: 1,
          elementsReturned: 2,
        }),
      }),
    );
    expect(result?.design.pages[0].elements).toEqual([
      expect.objectContaining({
        kind: 'image',
        src: imageSrc,
        x: 79,
        y: 28,
        width: 199,
        height: 168,
      }),
      expect.objectContaining({
        kind: 'text',
        binding: { field: 'profile.fullName', index: null },
        text: 'NGUYỄN VĂN A',
        x: 119,
        y: 56,
      }),
    ]);
  });

  it('returns null for PDFs without extractable text or embedded image elements', async () => {
    jest
      .spyOn(
        service as unknown as {
          extractArtifacts: (pdf: Buffer) => Promise<{
            xml: string;
            images: Record<string, string>;
          }>;
        },
        'extractArtifacts',
      )
      .mockResolvedValue({
        xml: '<pdf2xml><page number="1" top="0" left="0" height="400" width="200"></page></pdf2xml>',
        images: {},
      });

    await expect(
      service.extract(
        {
          data: Buffer.from('%PDF-1.4'),
          mimeType: 'application/pdf',
        },
        { profile: {} } as ParsedResume,
      ),
    ).resolves.toBeNull();
  });
});
