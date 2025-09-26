import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer, { Browser } from 'puppeteer';

const TEMPLATE_DIR = path.join(__dirname, '..', '..', 'templates');

function resolveTemplatePath(): string {
  const rawTemplate = process.env.TEMPLATE?.trim();
  const baseName = rawTemplate && rawTemplate.length > 0 ? rawTemplate.replace(/\.html?$/i, '') : 'template';
  const filename = `${baseName}.html`;
  return path.join(TEMPLATE_DIR, filename);
}

let templateCache: string | null = null;
let cachedTemplatePath: string | null = null;
let browserPromise: Promise<Browser> | null = null;

export class TemplateMissingError extends Error {
  constructor(message = `Template file not found at ${resolveTemplatePath()}`) {
    super(message);
    this.name = 'TemplateMissingError';
  }
}

export class RenderingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderingError';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function injectBaseHref(html: string, templatePath: string): string {
  if (/<base\s+/i.test(html)) {
    return html;
  }

  const directory = path.dirname(templatePath);
  const baseHref = pathToFileURL(directory.endsWith(path.sep) ? directory : `${directory}${path.sep}`).href;
  return html.replace(/<head([^>]*)>/i, `<head$1>\n<base href="${baseHref}">`);
}

async function loadTemplate(): Promise<{ content: string; path: string }> {
  const templatePath = resolveTemplatePath();

  if (templateCache && cachedTemplatePath === templatePath) {
    return { content: templateCache, path: templatePath };
  }

  try {
    templateCache = await fs.readFile(templatePath, 'utf8');
    cachedTemplatePath = templatePath;
    return { content: templateCache, path: templatePath };
  } catch (error) {
    throw new TemplateMissingError(`Template file not found at ${templatePath}`);
  }
}

async function ensureBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

function populatePlaceholders(html: string, data: Record<string, unknown>): string {
  let populated = html;

  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string') {
      continue;
    }

    const escapedKey = escapeRegExp(key);
    const safe = escapeHtml(value);
    const directPattern = new RegExp(`<<${escapedKey}>>`, 'g');
    const encodedPattern = new RegExp(`&lt;&lt;${escapedKey}&gt;&gt;`, 'gi');
    populated = populated.replace(directPattern, safe).replace(encodedPattern, safe);
  }

  return populated;
}

function applyTitle(html: string, title?: string): string {
  if (!title) {
    return html;
  }

  const safeTitle = escapeHtml(title);
  if (/<title>.*<\/title>/i.test(html)) {
    return html.replace(/<title>.*<\/title>/i, `<title>${safeTitle}<\/title>`);
  }

  return html.replace(/<head([^>]*)>/i, `<head$1>\n<title>${safeTitle}<\/title>`);
}

async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await ensureBrowser();
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', right: '16mm', bottom: '20mm', left: '16mm' },
    preferCSSPageSize: true,
  });
  await page.close();
  return Buffer.from(pdf);
}

export async function generatePdf(data: Record<string, unknown>, title?: string): Promise<Buffer> {
  const { content, path: templatePath } = await loadTemplate();

  const withBase = injectBaseHref(content, templatePath);
  const populated = populatePlaceholders(withBase, data);
  const html = applyTitle(populated, title);

  return htmlToPdf(html);
}

export async function shutdownBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}
