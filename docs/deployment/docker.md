# Docker local deployment

Docker runs the Smart Smile web build in the same way on macOS, Windows, and Linux. The
browser still owns camera permission; Docker serves the web application and does not need direct
access to the camera device.

## Requirements

- Docker Desktop on macOS or Windows, or Docker Engine with Compose on Linux
- A browser with camera support

## Start the local app

From the repository root:

```bash
docker compose up --build
```

Open [http://localhost:4173/](http://localhost:4173/) and allow camera access when the browser
asks. Stop it with `Ctrl+C`, or run `docker compose down` from another terminal.

The default Docker build uses demo delivery mode. It never sends an email.

## Test Google Apps Script delivery

The endpoint is compiled into the frontend at build time. Set the values before building; do not
put private provider keys in these variables:

```bash
VITE_SMART_SMILE_EMAIL_MODE=apps-script \
VITE_SMART_SMILE_EMAIL_ENDPOINT="https://script.google.com/macros/s/DEPLOYMENT_ID/exec" \
docker compose up --build
```

On Windows PowerShell:

```powershell
$env:VITE_SMART_SMILE_EMAIL_MODE = "apps-script"
$env:VITE_SMART_SMILE_EMAIL_ENDPOINT = "https://script.google.com/macros/s/DEPLOYMENT_ID/exec"
docker compose up --build
```

Use the same deployed Apps Script `/exec` URL that has the latest `Code.gs` version. After a
successful submission, check the recipient inbox, spam folder, and Apps Script **Executions**.

## Camera notes

- Use `http://localhost:4173/`; browsers treat localhost as a camera-eligible secure context.
- If testing from another device using a LAN address, configure HTTPS; an ordinary HTTP LAN
  address may be blocked by the browser.
- Docker Desktop does not grant the container camera access. This is expected: the host browser
  captures the camera stream and runs the on-device vision code.

## Useful commands

```bash
docker compose ps
docker compose logs -f web
docker compose down
```
