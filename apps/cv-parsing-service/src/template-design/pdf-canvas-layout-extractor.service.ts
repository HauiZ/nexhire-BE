import { execFile } from 'child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, extname, join } from 'path';
import { promisify } from 'util';

import { Injectable, Logger } from '@nestjs/common';

import { type ParsedResume } from '@nexhire/shared';

import { CV_BINDING_PLACEHOLDERS } from './canvas-design.constants';
import {
  CANVAS_PAGE_HEIGHT,
  CANVAS_PAGE_WIDTH,
  CvBindingField,
  RawCanvasDesign,
  RawCanvasElement,
  RawImageElement,
  RawShapeElement,
  RawTextElement,
} from './canvas.types';
import { DocumentBuffer } from './openai-template-design.client';

const execFileAsync = promisify(execFile);
const MAX_PAGES = 3;
const PDFTOHTML_TIMEOUT_MS = 15000;

interface PdfFontSpec {
  size: number;
  family: string;
  color: string;
  opacity: number;
}

interface PdfTextBox {
  top: number;
  left: number;
  width: number;
  height: number;
  fontId: string;
  text: string;
  bold: boolean;
  italic: boolean;
}

interface PdfImageBox {
  top: number;
  left: number;
  width: number;
  height: number;
  src: string;
}

interface PdfPage {
  width: number;
  height: number;
  fonts: Map<string, PdfFontSpec>;
  texts: PdfTextBox[];
  images: PdfImageBox[];
}

interface BoundValue {
  field: CvBindingField;
  index: number | null;
  value: string;
}

export interface PdfCanvasLayoutExtraction {
  rawPayload: Record<string, unknown>;
  design: RawCanvasDesign;
}

/**
 * Dựng canvas từ layout thật của PDF bằng Poppler.
 *
 * AI đọc PDF tốt để parse dữ liệu, nhưng khi bắt nó vẽ lại template nó có xu hướng
 * tự chọn một layout "đẹp" khác. Nhánh này giữ nguyên toạ độ text từ file nguồn,
 * rồi để sanitizer xử lý binding/PII như các output AI khác.
 */
@Injectable()
export class PdfCanvasLayoutExtractorService {
  private readonly logger = new Logger(PdfCanvasLayoutExtractorService.name);

  async extract(
    document: DocumentBuffer,
    parsedResume: ParsedResume,
  ): Promise<PdfCanvasLayoutExtraction | null> {
    if (document.mimeType !== 'application/pdf' || !document.data.byteLength) {
      return null;
    }

    let artifacts: { xml: string; images: Record<string, string> };
    try {
      artifacts = await this.extractArtifacts(document.data);
    } catch (error) {
      this.logger.warn(`PDF layout extraction skipped: ${String(error)}`);
      return null;
    }

    const pages = this.parsePages(artifacts.xml).slice(0, MAX_PAGES);
    const designPages = pages.map((page) =>
      this.toCanvasPage(page, parsedResume, artifacts.images),
    );
    const usablePages = designPages.filter((page) => page.elements.length > 0);
    if (usablePages.length === 0) {
      return null;
    }

    return {
      rawPayload: {
        source: 'pdftohtml',
        pageCount: pages.length,
        elementsReturned: usablePages.reduce((total, page) => total + page.elements.length, 0),
      },
      design: { pages: usablePages },
    };
  }

  private async extractArtifacts(
    pdf: Buffer,
  ): Promise<{ xml: string; images: Record<string, string> }> {
    const dir = await mkdtemp(join(tmpdir(), 'nexhire-template-'));
    const file = join(dir, 'source.pdf');

    try {
      await writeFile(file, pdf);
      const { stdout } = await execFileAsync('pdftohtml', ['-xml', '-stdout', file], {
        timeout: PDFTOHTML_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
      });
      const images = await this.readExtractedImages(dir);

      return { xml: stdout, images };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private parsePages(xml: string): PdfPage[] {
    const pages: PdfPage[] = [];
    const pagePattern = /<page\b([^>]*)>([\s\S]*?)<\/page>/g;

    for (const match of xml.matchAll(pagePattern)) {
      const attrs = this.parseAttrs(match[1]);
      const body = match[2];
      const width = this.toNumber(attrs.width);
      const height = this.toNumber(attrs.height);
      if (!(width > 0) || !(height > 0)) {
        continue;
      }

      const fonts = new Map<string, PdfFontSpec>();
      for (const fontMatch of body.matchAll(/<fontspec\b([^>]*)\/>/g)) {
        const fontAttrs = this.parseAttrs(fontMatch[1]);
        const id = fontAttrs.id;
        if (!id) {
          continue;
        }
        fonts.set(id, {
          size: this.toNumber(fontAttrs.size, 12),
          family: fontAttrs.family ?? '',
          color: this.safeHexColor(fontAttrs.color),
          opacity: this.toNumber(fontAttrs.opacity, 1),
        });
      }

      const texts: PdfTextBox[] = [];
      const images: PdfImageBox[] = [];
      for (const imageMatch of body.matchAll(/<image\b([^>]*)\/>/g)) {
        const imageAttrs = this.parseAttrs(imageMatch[1]);
        const src = imageAttrs.src;
        const imageWidth = this.toNumber(imageAttrs.width);
        const imageHeight = this.toNumber(imageAttrs.height);
        if (!src || !(imageWidth > 0) || !(imageHeight > 0)) {
          continue;
        }
        images.push({
          top: this.toNumber(imageAttrs.top),
          left: this.toNumber(imageAttrs.left),
          width: imageWidth,
          height: imageHeight,
          src,
        });
      }

      for (const textMatch of body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
        const textAttrs = this.parseAttrs(textMatch[1]);
        const rawContent = textMatch[2];
        const text = this.decodeXml(rawContent.replace(/<[^>]+>/g, '')).trim();
        if (!text) {
          continue;
        }
        const font = fonts.get(textAttrs.font ?? '');
        if (font && font.opacity <= 0.01) {
          continue;
        }

        texts.push({
          top: this.toNumber(textAttrs.top),
          left: this.toNumber(textAttrs.left),
          width: this.toNumber(textAttrs.width),
          height: this.toNumber(textAttrs.height),
          fontId: textAttrs.font ?? '',
          text,
          bold: /<b\b/i.test(rawContent),
          italic: /<i\b/i.test(rawContent),
        });
      }

      pages.push({ width, height, fonts, texts, images });
    }

    return pages;
  }

  private toCanvasPage(
    page: PdfPage,
    parsedResume: ParsedResume,
    imageSources: Record<string, string>,
  ): {
    background: string;
    elements: RawCanvasElement[];
  } {
    const scaleX = CANVAS_PAGE_WIDTH / page.width;
    const scaleY = CANVAS_PAGE_HEIGHT / page.height;

    const textElements = page.texts
      .map((box) =>
        this.toTextElement(box, page.fonts.get(box.fontId), scaleX, scaleY, parsedResume),
      )
      .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

    const lines = this.inferSectionRules(textElements, scaleX);
    const imageElements = page.images
      .map((image) => this.toImageElement(image, imageSources, scaleX, scaleY))
      .filter((image): image is RawImageElement => Boolean(image));

    return {
      background: '#ffffff',
      elements: [...imageElements, ...lines, ...textElements],
    };
  }

  private toImageElement(
    image: PdfImageBox,
    imageSources: Record<string, string>,
    scaleX: number,
    scaleY: number,
  ): RawImageElement | null {
    const src = this.resolveImageSource(image.src, imageSources);
    if (!src) {
      return null;
    }
    return {
      kind: 'image',
      x: Math.round(image.left * scaleX),
      y: Math.round(image.top * scaleY),
      width: Math.max(1, Math.round(image.width * scaleX)),
      height: Math.max(1, Math.round(image.height * scaleY)),
      src,
      objectFit: 'fill',
      borderRadius: 0,
    };
  }

  private toTextElement(
    box: PdfTextBox,
    font: PdfFontSpec | undefined,
    scaleX: number,
    scaleY: number,
    parsedResume: ParsedResume,
  ): RawTextElement {
    const fontSize = Math.max(6, Math.round((font?.size ?? 12) * scaleY * 10) / 10);
    const binding = this.resolveBinding(box, scaleX, scaleY, parsedResume);

    return {
      kind: 'text',
      x: Math.round(box.left * scaleX),
      y: Math.round(box.top * scaleY),
      width: Math.max(1, Math.round(box.width * scaleX * 1.18)),
      height: Math.max(Math.round(box.height * scaleY), Math.ceil(fontSize * 1.25)),
      text: binding ? CV_BINDING_PLACEHOLDERS[binding.field] : box.text,
      fontFamily: this.fontFamily(font?.family, fontSize, box.bold),
      fontSize,
      fontWeight: box.bold ? 700 : 400,
      italic: box.italic,
      underline: false,
      color: this.safeHexColor(font?.color),
      align: box.left * scaleX > CANVAS_PAGE_WIDTH * 0.7 ? 'right' : 'left',
      binding,
    };
  }

  private inferSectionRules(textElements: RawTextElement[], scaleX: number): RawShapeElement[] {
    const headings = textElements.filter(
      (element) =>
        element.x < CANVAS_PAGE_WIDTH * 0.28 &&
        element.fontWeight >= 700 &&
        element.italic &&
        this.looksLikeSectionHeading(element.text),
    );
    const lines: RawShapeElement[] = [];
    const lineX = Math.round(70 * scaleX);
    const lineWidth = Math.round(754 * scaleX);

    for (const heading of headings) {
      const y = Math.round(heading.y - 24);
      if (y < 110 || lines.some((line) => Math.abs(line.y - y) < 8)) {
        continue;
      }
      lines.push({
        kind: 'shape',
        x: lineX,
        y,
        width: lineWidth,
        height: 2,
        shape: 'line',
        fill: '#111111',
        stroke: '#111111',
        strokeWidth: 1,
        borderRadius: 0,
      });
    }

    return lines;
  }

  private looksLikeSectionHeading(text: string): boolean {
    const normalized = this.normalize(text);
    return [
      'a propos',
      'competences',
      'experiences',
      'formation',
      'realisations cles',
      'certifications',
    ].includes(normalized);
  }

  private resolveBinding(
    box: PdfTextBox,
    scaleX: number,
    scaleY: number,
    parsedResume: ParsedResume,
  ): { field: CvBindingField; index: number | null } | null {
    const normalized = this.normalize(box.text);
    const values = this.boundValues(parsedResume);
    const match = values.find((candidate) => this.normalize(candidate.value) === normalized);
    if (match && !this.isBindingInExpectedRegion(match.field, box, scaleX, scaleY)) {
      return null;
    }
    return match ? { field: match.field, index: match.index } : null;
  }

  private isBindingInExpectedRegion(
    field: CvBindingField,
    box: PdfTextBox,
    scaleX: number,
    scaleY: number,
  ): boolean {
    const x = box.left * scaleX;
    const y = box.top * scaleY;

    if (field === 'profile.fullName' || field === 'profile.headline') {
      return y < 130 && x < CANVAS_PAGE_WIDTH * 0.45;
    }

    if (
      field === 'profile.phone' ||
      field === 'profile.contactEmail' ||
      field === 'profile.location' ||
      field === 'profile.linkedinUrl' ||
      field === 'profile.portfolioUrl'
    ) {
      return y < 130 && x > CANVAS_PAGE_WIDTH * 0.55;
    }

    return true;
  }

  private boundValues(parsedResume: ParsedResume): BoundValue[] {
    const profile = parsedResume.profile ?? {};
    const values: BoundValue[] = [];

    this.addValue(values, 'profile.fullName', null, profile.fullName);
    this.addValue(values, 'profile.headline', null, profile.headline);
    this.addValue(values, 'profile.contactEmail', null, profile.contactEmail);
    this.addValue(values, 'profile.phone', null, profile.phone);
    this.addValue(values, 'profile.location', null, profile.location);
    this.addValue(values, 'profile.linkedinUrl', null, profile.linkedinUrl);
    this.addValue(values, 'profile.portfolioUrl', null, profile.portfolioUrl);

    parsedResume.skills?.forEach((skill, index) =>
      this.addValue(values, 'skills.name', index, skill.name),
    );
    parsedResume.certifications?.forEach((certification, index) => {
      this.addValue(values, 'certifications.name', index, certification.name);
      this.addValue(values, 'certifications.issuer', index, certification.issuer);
    });
    parsedResume.projects?.forEach((project, index) => {
      this.addValue(values, 'projects.name', index, project.name);
      this.addValue(values, 'projects.description', index, project.description);
    });

    return values;
  }

  private addValue(
    values: BoundValue[],
    field: CvBindingField,
    index: number | null,
    value: unknown,
  ): void {
    if (typeof value === 'string' && value.trim()) {
      values.push({ field, index, value });
    }
  }

  private fontFamily(family = '', fontSize: number, bold: boolean): string {
    if (/LeagueSpartan/i.test(family) || fontSize >= 16 || bold) {
      return 'Montserrat, sans-serif';
    }
    return 'Arial, sans-serif';
  }

  private async readExtractedImages(dir: string): Promise<Record<string, string>> {
    const images: Record<string, string> = {};
    const imageFiles = (await readdir(dir)).filter((name) => /\.(?:png|jpe?g)$/i.test(name));

    await Promise.all(
      imageFiles.map(async (name) => {
        const path = join(dir, name);
        const image = await readFile(path);
        const dataUrl = `data:${this.imageMimeType(name)};base64,${image.toString('base64')}`;
        images[this.imageSourceKey(name)] = dataUrl;
        images[this.imageSourceKey(path)] = dataUrl;
      }),
    );

    return images;
  }

  private resolveImageSource(src: string, imageSources: Record<string, string>): string | null {
    const key = this.imageSourceKey(src);
    return imageSources[key] ?? imageSources[this.imageSourceKey(basename(key))] ?? null;
  }

  private imageSourceKey(src: string): string {
    return src.replace(/^file:\/\//, '');
  }

  private imageMimeType(name: string): string {
    return /\.png$/i.test(extname(name)) ? 'image/png' : 'image/jpeg';
  }

  private parseAttrs(input: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (const match of input.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g)) {
      attrs[match[1]] = this.decodeXml(match[2]);
    }
    return attrs;
  }

  private decodeXml(input: string): string {
    return input
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  private toNumber(value: unknown, fallback = 0): number {
    if (typeof value !== 'string') {
      return fallback;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private safeHexColor(value: unknown): string {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#111111';
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }
}
