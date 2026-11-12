# Google Calendar and Google Meet setup (Requirement 4)

HireSmart creates a Google Calendar event with a Google Meet conference for each interview, using the official
Google Calendar API. A recruiter connects their own Google account once, in **Settings → Integrations**.

This guide is for the developer who runs the server locally. Do not commit any value from it to Git.

## What the integration does, and what it does not

- Requests one scope: `https://www.googleapis.com/auth/calendar.events` (create, update and delete events on the
  recruiter's primary calendar). It does not read mail, contacts or other calendars.
- Creates each event with `conferenceDataVersion=1`, `conferenceSolutionKey.type = hangoutsMeet` and a new
  `createRequest.requestId` per interview. A Meet link is never reused across interviews.
- Stores the event id and the Meet link on the interview. A link is labelled **Google Meet** only when Google returns a
  `video` entry point. If Google reports the conference as `pending` or `failure`, the interview says so, and the
  recruiter can retry from the interview page. A manually entered link is labelled **Manual link**.
- Stores the refresh token encrypted with AES-256-GCM (`GOOGLE_TOKEN_ENCRYPTION_KEY`). The browser never receives the
  client secret, the refresh token or an access token.
- Rescheduling patches the existing event. Cancelling deletes it.

**Not verified in this repository:** a live OAuth consent and a real Calendar event. The automated tests use a fake
Google client. Run the manual checks in section 6 before you rely on the integration.

## 1. Create the Google Cloud project and OAuth client

1. Open https://console.cloud.google.com and create a project (for example `hiresmart-dev`).
2. **APIs & Services → Library**: search for **Google Calendar API** and click **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** (for a personal Google account), or **Internal** if you use Google Workspace.
   - App name and support email: any values you choose.
   - Scopes: add `.../auth/calendar.events`.
   - Test users: add every Google account that will connect during development. While the app is in *Testing*,
     only listed test users can connect.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorised redirect URI: exactly the value you put in `GOOGLE_OAUTH_REDIRECT_URI`, for example
     `http://localhost:5000/api/v1/integrations/google/callback`.
5. Copy the **Client ID** and **Client secret** into `server/.env`. Do not paste them into chat, docs or code.

## 2. Configure the server

Add these to `server/.env` (names are from `server/.env.example`):

```env
GOOGLE_OAUTH_CLIENT_ID=<from the Google console>
GOOGLE_OAUTH_CLIENT_SECRET=<from the Google console>
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:5000/api/v1/integrations/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=<32 random bytes, base64 or hex>
```

Generate the encryption key on your machine:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep the key. If it changes, existing connections cannot be decrypted and recruiters must reconnect.

Restart the server after changing `.env`. The status endpoint reports `setup_required` until all four values are set.

## 3. Connect a recruiter account

1. Sign in as a recruiter, open **Settings → Integrations** (`/app/settings/integrations`).
2. Click **Connect Google Calendar**. Google asks for consent. Approve the calendar scope.
3. You are returned to Settings with the status **Connected**. Any other outcome is shown with a reason
   (`denied`, `invalid_state`, `not_configured` or `error`).

The state parameter is signed with the server secret, expires, and names the user who started the flow. A callback
without a valid state is refused.

## 4. Disconnect

**Settings → Integrations → Disconnect** revokes the token with Google (best effort) and deletes the local connection.
Interviews already scheduled keep their stored links. New interviews need a reconnect.

## 5. Revoked or expired access

If Google reports `invalid_grant` when the server refreshes the token, the connection becomes **Reconnect required**.
Scheduling then reports the meeting as `failure` with a reason, and the recruiter must reconnect.

## 6. Manual verification on your PC

1. Connect a recruiter account (section 3). Status must read **Connected**.
2. Schedule an interview for a job application, at least 30 minutes in the future (Asia/Kolkata).
3. Open the interview. The meeting label must read **Google Meet** with a `https://meet.google.com/…` link.
   If it reads **Meet link pending**, wait 10 seconds and use **Retry Meet link**. If it reads **Meet link failed**, the
   reason is shown below the label.
4. Open Google Calendar with the recruiter account. The event must exist, with the candidate as a guest and the Meet
   link attached.
5. Reschedule the interview. The same calendar event must move (no duplicate event).
6. Cancel the interview. The calendar event must be removed.
7. Disconnect, then schedule again. The interview must show **Google Meet not set up** (or the Settings page must show
   **Setup required** / **Reconnect required**). No Meet link may appear.

## 7. Fallbacks that never claim a Meet exists

| Situation | What the app shows |
| --- | --- |
| Situation | Label on the interview | Where the connection state appears |
| --- | --- | --- |
| No Google variables set | Google Meet not set up | Settings: Setup required |
| Recruiter not connected | Google Meet not set up | Settings: Not connected |
| Token revoked | Google Meet not set up | Settings: Reconnect required |
| Google returns no video entry point yet | Meet link pending (Retry Meet link) | not applicable |
| Google reports conference failure | Meet link failed (with reason) | not applicable |
| Recruiter entered a link by hand | Manual link | not applicable |
| Google created the link | Google Meet | not applicable |
