import { randomUUID } from 'node:crypto';
import process from 'node:process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { GoogleAuth, JWTInput } from 'google-auth-library';
import { google, docs_v1, drive_v3 } from 'googleapis';

const TEMPLATE_ID = process.env.GOOGLE_TEMPLATE_DOCUMENT_ID?.trim();
const OUTPUT_FOLDER_ID = process.env.GOOGLE_OUTPUT_FOLDER_ID?.trim();
const SHARED_DRIVE_ID = process.env.GOOGLE_SHARED_DRIVE_ID?.trim();
const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive'
];

let googleAuthClient: GoogleAuth | null = null;

export class TemplateMissingError extends Error {
  constructor(message = 'Google Docs template is not configured or accessible.') {
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

function normalisePrivateKey(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.replace(/\\n/g, '\n');
}

function getGoogleAuth(): GoogleAuth {
  if (!googleAuthClient) {
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();

    if (keyFile) {
      const resolvedPath = path.isAbsolute(keyFile) ? keyFile : path.resolve(process.cwd(), keyFile);
      if (!existsSync(resolvedPath)) {
        console.error('[google-docs] GOOGLE_APPLICATION_CREDENTIALS does not point to an existing file:', resolvedPath);
      } else {
        console.info('[google-docs] Using service-account key file at', resolvedPath);
      }

      googleAuthClient = new google.auth.GoogleAuth({ keyFile: resolvedPath, scopes: SCOPES });
    } else {
      const clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
      const privateKey = normalisePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
      const subject = process.env.GOOGLE_IMPERSONATED_USER?.trim();

      if (!clientEmail || !privateKey) {
        const missing: string[] = [];
        if (!clientEmail) missing.push('GOOGLE_CLIENT_EMAIL');
        if (!privateKey) missing.push('GOOGLE_PRIVATE_KEY');
        console.error('[google-docs] Missing inline credential environment variables:', missing.join(', '));
        throw new RenderingError('Google service account credentials are not fully configured.');
      }

      const projectId = process.env.GOOGLE_PROJECT_ID?.trim();
      const credentials: JWTInput = {
        client_email: clientEmail,
        private_key: privateKey,
      };

      if (projectId) {
        credentials.project_id = projectId;
      }

      console.info('[google-docs] Using inline service-account credentials for', clientEmail);
      if (subject) {
        console.info('[google-docs] Impersonating Workspace user', subject);
      }

      googleAuthClient = new google.auth.GoogleAuth({
        credentials,
        scopes: SCOPES,
        clientOptions: subject ? { subject } : undefined,
      });
    }
  }

  return googleAuthClient;
}

function getGoogleClients(): { docs: docs_v1.Docs; drive: drive_v3.Drive } {
  const auth = getGoogleAuth();
  return {
    docs: google.docs({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth }),
  };
}

function generateDocumentName(title?: string, data?: Record<string, unknown>): string {
  const fallback = data && typeof data.name === 'string' && data.name.trim()
    ? data.name.trim()
    : `generated-${randomUUID()}`;
  return title?.trim() || fallback;
}

function buildReplacementRequests(data: Record<string, unknown>): docs_v1.Schema$Request[] {
  const requests: docs_v1.Schema$Request[] = [];

  for (const [rawKey, rawValue] of Object.entries(data)) {
    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    const key = rawKey.trim();
    if (!key) {
      continue;
    }

    const textValue = typeof rawValue === 'string' ? rawValue : String(rawValue);
    const placeholders = new Set([
      `{{${key}}}`,
      `{{ ${key} }}`,
      `<<${key}>>`,
      `[[${key}]]`,
    ]);

    for (const placeholder of placeholders) {
      requests.push({
        replaceAllText: {
          containsText: {
            text: placeholder,
            matchCase: true,
          },
          replaceText: textValue,
        },
      });
    }
  }

  return requests;
}

function buildDocumentUpdateRequests(title?: string): docs_v1.Schema$Request[] {
  if (!title?.trim()) {
    return [];
  }

  return [
    {
      replaceAllText: {
        containsText: {
          matchCase: false,
          text: '{{DOCUMENT_TITLE}}',
        },
        replaceText: title.trim(),
      },
    },
  ];
}

function supportsAllDrives(): boolean {
  return Boolean(OUTPUT_FOLDER_ID || SHARED_DRIVE_ID);
}

export async function generatePdf(data: Record<string, unknown>, title?: string): Promise<Buffer> {
  if (!TEMPLATE_ID) {
    throw new TemplateMissingError('GOOGLE_TEMPLATE_DOCUMENT_ID is not configured.');
  }

  const { docs, drive } = getGoogleClients();

  let copiedId: string | undefined;

  try {
    const copyResponse = await drive.files.copy({
      fileId: TEMPLATE_ID,
      requestBody: {
        name: generateDocumentName(title, data),
        parents: OUTPUT_FOLDER_ID ? [OUTPUT_FOLDER_ID] : undefined,
      },
      supportsAllDrives: supportsAllDrives(),
      fields: 'id',
    });

    copiedId = copyResponse.data.id ?? undefined;

    if (!copiedId) {
      throw new TemplateMissingError('Failed to copy template document.');
    }

    const replacementRequests = [
      ...buildReplacementRequests(data),
      ...buildDocumentUpdateRequests(title),
    ];

    if (replacementRequests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: copiedId,
        requestBody: {
          requests: replacementRequests,
        },
      });
    }

    const pdfResponse = await drive.files.export(
      {
        fileId: copiedId,
        mimeType: 'application/pdf',
      },
      { responseType: 'arraybuffer' },
    );

    const payload = pdfResponse.data;

    if (payload instanceof ArrayBuffer) {
      return Buffer.from(payload);
    }

    if (ArrayBuffer.isView(payload)) {
      const view = payload as ArrayBufferView;
      return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
    }

    if (Buffer.isBuffer(payload)) {
      return Buffer.from(payload);
    }

    throw new RenderingError('Google Drive export did not return a binary payload.');
  } catch (error) {
    if (error instanceof TemplateMissingError || error instanceof RenderingError) {
      throw error;
    }

    if (typeof error === 'object' && error !== null) {
      const code = (error as { code?: number }).code;
      if (code === 404) {
        throw new TemplateMissingError('Template document is missing or inaccessible.');
      }
    }

    throw new RenderingError('Failed to render document via Google Docs.');
  } finally {
    if (copiedId) {
      try {
        await drive.files.delete({
          fileId: copiedId,
          supportsAllDrives: supportsAllDrives(),
        });
      } catch (cleanupError) {
        console.warn('Failed to remove temporary Google Doc', cleanupError);
      }
    }
  }
}

export async function shutdownBrowser(): Promise<void> {
  // No browser to shut down when using Google Docs rendering.
}
