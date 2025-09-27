# Letter Maker Deployment Guide

## Prerequisites

- Docker and Docker Compose installed on the server
- Access to the `devtksg` Docker network (shared with nginx-proxy/Traefik)
- Domain `lettermaker.tk.sg` pointing to your server

## Environment Variables

Create a `.env` file with the following variables:

```env
# Resend API for sending emails
RESEND_API_KEY=your_resend_api_key

# Google Service Account for Google Docs access (base64 encoded)
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=your_base64_encoded_json

# Template configuration
TEMPLATE_DOC_ID=your_google_doc_template_id
TEMPLATE_TITLE=Figma Education Verification

# Email configuration
EMAIL_FROM=Letter Maker <letters@tinkertanker.com>
```

## Deployment Steps

### Initial Setup

1. Clone the repository on your server:
```bash
git clone https://github.com/tinkertanker/letter-maker.git
cd letter-maker
```

2. Copy your `.env` file to the server

3. Run the deployment:
```bash
./deploy.sh
```

### Updates

To deploy updates:

```bash
cd letter-maker
git pull
./deploy.sh
```

## Docker Configuration

The application runs in Docker with:
- Node.js 20 Alpine base image
- Chromium for PDF generation via Puppeteer
- Exposed on port 3000 internally
- Connected to `devtksg` network for nginx-proxy integration
- SSL via Let's Encrypt configured automatically

## Monitoring

Check application status:
```bash
docker-compose ps
```

View logs:
```bash
docker-compose logs -f letter-maker
```

Restart if needed:
```bash
docker-compose restart letter-maker
```

## Troubleshooting

If PDF generation fails:
- Check Chromium is properly installed in container
- Verify PUPPETEER_EXECUTABLE_PATH is set correctly
- Check /app/tmp directory has write permissions

If emails don't send:
- Verify RESEND_API_KEY is correct
- Check Resend dashboard for API logs
- Ensure EMAIL_FROM domain is verified in Resend

## Domain Configuration

The application is configured to run at `https://lettermaker.tk.sg`

SSL certificates are automatically managed via Let's Encrypt through the nginx-proxy setup.