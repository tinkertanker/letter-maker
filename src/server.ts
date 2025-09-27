import 'dotenv/config';
import path from 'node:path';
import process from 'node:process';
import express from 'express';

import {
  RenderingError,
  TemplateMissingError,
  generatePdf,
  shutdownBrowser,
} from './services/matrix';
import { Resend } from 'resend';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, '..', 'public');
const EMAIL_DOMAIN = 'tinkertanker.com';
const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

if (!resendApiKey) {
  console.warn('RESEND_API_KEY is not set. Email delivery will fail.');
}

if (!emailFrom) {
  console.warn('EMAIL_FROM is not set. Email delivery will fail.');
}

const resend = resendApiKey ? new Resend(resendApiKey) : null;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(publicDir));

function normaliseFilename(name?: string): string {
  const fallback = 'generated-letter';
  if (!name) return `${fallback}.pdf`;
  const cleaned = name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  return `${cleaned || fallback}.pdf`;
}

function validateEmailUserId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const pattern = /^[a-z0-9._%+-]{1,64}$/;
  return pattern.test(trimmed) ? trimmed : null;
}

function validateName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed;
}

app.post('/api/generate', async (req, res, next) => {
  try {
    const { data, title, fileName, name, emailUserId } = req.body as {
      data?: Record<string, unknown>;
      title?: string;
      fileName?: string;
      name?: string;
      emailUserId?: string;
    };

    const validatedName = validateName(name);
    if (!validatedName) {
      return res.status(400).json({ error: 'Please provide a valid name.' });
    }

    const validatedUserId = validateEmailUserId(emailUserId);
    if (!validatedUserId) {
      return res.status(400).json({ error: 'Please provide a valid email user ID (before the @ sign).' });
    }

    if (!resend || !emailFrom) {
      return res.status(500).json({ error: 'Email service is not configured.' });
    }

    const targetEmail = `${validatedUserId}@${EMAIL_DOMAIN}`;
    const outputLabelBase = fileName || title || validatedName;
    const downloadName = normaliseFilename(`Generated - ${outputLabelBase}`);

    const templateData: Record<string, unknown> = { name: validatedName };
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      Object.assign(templateData, data);
    }
    templateData.email = templateData.email ?? targetEmail;

    const pdfBuffer = await generatePdf(templateData, title);

    const subjectLine = title ? `Your ${title} PDF` : 'Your generated PDF';
    const htmlBody = `
      <p>Hello ${validatedName},</p>
      <p>Your personalised PDF letter is ready. It is attached to this email. If there are any issues, please feel free to regenerate, or reach out to us.</p>
      <p>Best regards,<br />Tinkercademy Letter Maker</p>
    `;

    await resend.emails.send({
      from: emailFrom,
      to: targetEmail,
      subject: subjectLine,
      html: htmlBody,
      attachments: [
        {
          filename: downloadName,
          content: pdfBuffer.toString('base64'),
        },
      ],
    });

    res.json({
      message: `PDF sent to ${targetEmail}.`,
      to: targetEmail,
      fileName: downloadName,
    });
  } catch (error) {
    if (error instanceof TemplateMissingError) {
      return res.status(500).json({ error: error.message });
    }

    if (error instanceof RenderingError) {
      return res.status(400).json({ error: error.message });
    }

    return next(error);
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

const terminationSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const signal of terminationSignals) {
  process.on(signal, async () => {
    await shutdownBrowser();
    process.exit(0);
  });
}

process.on('exit', () => {
  shutdownBrowser().catch((error) => {
    console.error('Error shutting down browser', error);
  });
});
