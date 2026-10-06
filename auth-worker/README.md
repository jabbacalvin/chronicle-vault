# Mobile Google sign-in Worker

Chronicle Vault is hosted as a static GitHub Pages site. Its existing Google Identity Services token flow uses a popup, which can stall in some mobile browser environments. This Cloudflare Worker provides a full-page OAuth authorization-code flow for the app.

The Worker keeps the Google OAuth client secret server-side, validates OAuth state with a short-lived HttpOnly cookie, exchanges the authorization code, verifies the Google email, and returns the access token to the app in a URL fragment. The app immediately removes that fragment from browser history and stores the same short-lived token it previously received from Google. The Worker does not store Drive contents or OAuth tokens.

## 1. Deploy the Worker once

From the repository root:

~~~sh
npm install --save-dev wrangler
npx wrangler login
npx wrangler deploy --config auth-worker/wrangler.toml
~~~

The first deploy establishes your Worker host, for example https://chronicle-vault-auth.YOUR-SUBDOMAIN.workers.dev. The auth endpoint will report missing OAuth settings until you add them.

## 2. Configure the Google OAuth web client

In the Google Cloud project:

1. Enable the Google Drive API and configure the OAuth consent screen.
2. Create or select a Web application OAuth client.
3. Add the exact redirect URI using your deployed Worker host:

~~~text
https://YOUR-WORKER-HOST/auth/google/callback
~~~

4. Keep the client ID and client secret available. The client secret goes only into Cloudflare Worker secrets.

The Authorized JavaScript origin for the app can remain https://jabbacalvin.github.io. If you host the app on another domain, register that origin too.

## 3. Add OAuth credentials to the Worker

From the repository root, run these commands and paste the matching values when Wrangler prompts:

~~~sh
npx wrangler secret put GOOGLE_CLIENT_ID --config auth-worker/wrangler.toml
npx wrangler secret put GOOGLE_CLIENT_SECRET --config auth-worker/wrangler.toml
~~~

The client ID is public, but this implementation stores both values as Worker secrets for simplicity. Neither value is committed to the app. Check that https://YOUR-WORKER-HOST/health returns ok.

Update APP_URL in auth-worker/wrangler.toml if the app is hosted somewhere other than https://jabbacalvin.github.io/chronicle-vault/.

## 4. Connect from Chronicle Vault

1. Open Chronicle Vault and select Configure Vault if it is already connected.
2. Paste the Worker base URL into OAuth Redirect Worker URL.
3. Enter the Google Drive folder URL and submit.
4. Google opens as a full-page navigation. Choose an account and approve the requested Drive access; Google then redirects back to the app.

When the Worker URL is provided, the app uses the redirect flow and does not require a client ID in the form. Leave the Worker URL blank to keep using the existing popup flow.

## Security and deployment notes

- Google OAuth returns a short-lived access token. When it expires, sign in again through Configure Vault; this Worker does not request offline access or persist refresh tokens.
- The token is sent back in the URL fragment, which is not included in HTTP requests. The app removes it from the address bar immediately.
- The app continues making Drive API requests directly from the browser with the user's access token; the Worker only handles the OAuth callback.
- This app requests the Drive scope needed to list and manage evidence in the configured folder.
- If the OAuth consent screen is in Testing mode, add the accounts that will test the app as test users. Public distribution may require Google OAuth verification for the scopes requested.
