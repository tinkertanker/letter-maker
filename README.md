# Letter Matrix Portal

A lightweight Express + TypeScript service that merges submitted data into a Google Docs template, exports the result as PDF, and emails it back to the requester.

## Quick start

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Prepare Google Cloud**
   - Create or pick a Google Cloud project.
   - Enable the **Google Docs API** and **Google Drive API** for that project.
   - Create a **service account** and generate a JSON key. Keep the key safe.
   - Share your Google Docs template with the service account email, granting at least Editor access.
3. **Configure environment variables**
   - Duplicate `.env.example` (or create `.env`) and supply:
     - `RESEND_API_KEY` – API key from [Resend](https://resend.com/) for email delivery.
     - `EMAIL_FROM` – Verified sender address (e.g. `figmaletter@tinkertanker.com`).
     - `GOOGLE_TEMPLATE_DOCUMENT_ID` – The ID portion from your template’s Google Docs URL.
     - Either set `GOOGLE_APPLICATION_CREDENTIALS` to the JSON key path **or** provide all of:
       - `GOOGLE_CLIENT_EMAIL`
       - `GOOGLE_PRIVATE_KEY` (replace literal `\n` with real new lines)
       - `GOOGLE_PROJECT_ID` (optional but recommended)
     - Optional helpers:
       - `GOOGLE_IMPERSONATED_USER` – Delegated Workspace user email if you are using domain-wide delegation.
       - `GOOGLE_OUTPUT_FOLDER_ID` – Folder to store the temporary draft before it is deleted.
       - `GOOGLE_SHARED_DRIVE_ID` – Required if the template or folder lives on a shared drive.
4. **Run the development server**
   ```bash
   npm run dev
   ```
   The app listens on [http://localhost:3000](http://localhost:3000) by default.
5. **Generate a PDF**
   - Open the portal in your browser.
   - Provide the recipient’s name and email user ID (everything before `@tinkertanker.com`).
   - Supply any extra placeholder fields required by your template.
   - Hit “Generate PDF” to receive the merged document by email.

## How it works

1. **Copy** – Each request duplicates the Google Docs template into a temporary document (optionally inside a specific folder or shared drive).
2. **Merge** – The service replaces placeholders such as `{{NAME}}`, `{{ NAME }}`, `<<NAME>>`, or `[[NAME]]` with the submitted values. The special token `{{DOCUMENT_TITLE}}` receives the requested title.
3. **Export** – Google Drive exports the filled document to PDF.
4. **Clean up** – The temporary Google Doc is deleted to avoid clutter.
5. **Deliver** – The PDF is attached to an email sent via Resend to `<user>@tinkertanker.com`.

## Operational notes

- Share the template (and optional output folder) with the service account, otherwise Google Drive returns `404` during copy or export.
- `GOOGLE_PRIVATE_KEY` must contain real newline characters. Replace any escaped `\n` with actual line breaks in `.env`.
- Set `GOOGLE_IMPERSONATED_USER` if the service account needs to act on behalf of a Workspace user to access shared content.
- The request body fields become placeholders. For example, posting `{ name: "Felicia", team: "Spark" }` lets you place `{{name}}` and `{{team}}` in the document.
- Attachments are base64-encoded automatically before Resend receives them.

## Troubleshooting

- **Template missing** – A `Template document is missing or inaccessible` error usually means the Doc ID is wrong or the service account lacks access. Confirm sharing permissions and the document URL.
- **Credentials incomplete** – If you see `Google service account credentials are not fully configured`, ensure either `GOOGLE_APPLICATION_CREDENTIALS` is set or all discrete credential vars are present.
- **Placeholder unchanged** – Check that the placeholder text matches one of the recognised patterns (`{{KEY}}`, `{{ KEY }}`, `<<KEY>>`, `[[KEY]]`). The match is case-sensitive.
- **PDF export fails** – Verify the Drive API is enabled and, for shared drives, include `GOOGLE_SHARED_DRIVE_ID` (and ensure the service account has Content Manager or higher access).
- **Email delivery** – If emails fail to send, confirm `RESEND_API_KEY` and `EMAIL_FROM` are set and the sender address is verified in Resend.

## Folder structure

```
letter-maker/
├── public/              # Static assets powering the HTML form
├── src/
│   ├── services/
│   │   └── matrix.ts    # Google Docs merge + export service
│   └── server.ts        # Express bootstrap and routes
├── templates/           # Legacy Word exports (no longer used at runtime)
├── dist/                # Compiled output (after `npm run build`)
└── README.md
```

Ho say bo? Once the variables are in place, the portal lets Google Docs handle the gnarly DOCX rendering while we just deliver the polished PDF.
