# Google Apps Script email demo

This is an optional, zero-cost classroom delivery path. It is not enabled in the public build
until the deployment owner configures the repository variables. The script sends the selected JPEG
to the participant-entered email only after Smart Smile has collected explicit consent.

## Ownership and privacy boundary

Deploy the script from the manager/team Google account, not a developer's personal account. The
deployment owner authorizes `MailApp`, and the script uses only transient `CacheService` data for
10-minute idempotency protection. It does not use Drive, Sheets, PropertiesService, or a permanent
photo store.

The Apps Script URL is public and is not a secret. Anyone who obtains it can consume the owner's
Apps Script execution and email quota. Keep the endpoint limited to this classroom demo, monitor
the account quota, and revoke the deployment when the demo ends. The email includes the required
first name and last name plus the optional nickname supplied by the participant.

## Deploy the script

1. Sign in to the manager/team Google account.
2. Open [Google Apps Script](https://script.google.com/) and create a standalone project.
3. Copy `integrations/google-apps-script/Code.gs` into the editor and save it.
4. Choose **Deploy → New deployment**.
5. Select **Web app**.
6. Set **Execute as** to the deploying account.
7. Set **Who has access** to the anonymous/public option available to the account.
8. Authorize `MailApp` when Google asks, then copy the deployed `/exec` URL.

Do not use the `/dev` URL in the website. It is restricted to editors and is not the classroom
endpoint.

If the project already has a web-app deployment, update it after every code change: choose
**Deploy → Manage deployments**, edit the existing web app, select **New version**, and deploy.
Keep the same `/exec` URL. Saving `Code.gs` alone does not update the deployed version.

The JPEG validator normalizes the signed bytes returned by Apps Script's `Utilities.base64Decode`
before checking the JPEG header. This matters because valid bytes above 127 are represented as
negative numbers by that service.

## Configure the GitHub Pages build

In each GitHub repository, add these repository variables under **Settings → Secrets and variables
→ Actions → Variables**:

```text
SMART_SMILE_EMAIL_MODE=apps-script
SMART_SMILE_EMAIL_ENDPOINT=https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
```

The endpoint URL is configuration, not a credential. Never add a Google OAuth token, password, or
private key to GitHub. The workflow remains in mock mode when these variables are absent.

## Test safely

Use a non-sensitive photo and a test mailbox. Confirm that:

1. A participant must enter first name, last name, a syntactically valid email, and check consent.
2. The request reaches the manager-owned mailbox with the JPEG attached.
3. Retrying the same idempotency key does not create a duplicate message within 10 minutes.
4. A missing consent, invalid email, non-JPEG, or oversized payload is rejected.
5. The public page shows a **Check your email** confirmation, not a false guarantee of inbox delivery.

If no message arrives, open the Apps Script project and check **Executions** for the exact
`doPost` run. A successful `GET` health check only proves that the web app is reachable; it does
not prove that `MailApp.sendEmail` was authorized, had quota, or accepted the attachment.

Apps Script Web Apps do not expose a browser-readable CORS response for this flow, so the frontend
uses a simple `text/plain` POST with `no-cors`. A network-level success means the request was
submitted; email delivery still depends on Google quota and the recipient's mail provider.
