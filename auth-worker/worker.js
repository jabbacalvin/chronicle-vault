const OAUTH_STATE_COOKIE = "chronicle_vault_oauth_state";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";

function secureRandomString(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function baseHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

function textResponse(message, status = 400) {
  return new Response(message, {
    status,
    headers: {
      ...baseHeaders(),
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function redirectResponse(location, cookie = "") {
  const headers = new Headers(baseHeaders());
  headers.set("Location", location);
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function getAppUrl(env) {
  if (!env.APP_URL) throw new Error("APP_URL is not configured.");
  const appUrl = new URL(env.APP_URL);
  if (appUrl.protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS.");
  }
  appUrl.hash = "";
  return appUrl;
}

function redirectWithState(env, state, result, cookie = "") {
  const returnUrl = getAppUrl(env);
  returnUrl.hash = new URLSearchParams({
    cv_auth: "1",
    state,
    ...result,
  }).toString();
  return redirectResponse(returnUrl.toString(), cookie);
}

function readCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookie = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(name + "="));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : "";
}

function clearStateCookie() {
  return OAUTH_STATE_COOKIE + "=; HttpOnly; Secure; SameSite=Lax; Path=/auth/google/callback; Max-Age=0";
}

async function startGoogleOAuth(request, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return textResponse("The Google OAuth Worker is missing its client ID or client secret.", 500);
  }

  const url = new URL(request.url);
  const appState = url.searchParams.get("state") || "";
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(appState)) {
    return textResponse("Missing or invalid sign-in state. Return to Chronicle Vault and try again.");
  }

  try {
    getAppUrl(env);
  } catch (error) {
    return textResponse(error.message, 500);
  }

  const csrfState = secureRandomString();
  const oauthState = csrfState + "." + appState;
  const callbackUrl = new URL("/auth/google/callback", url.origin);

  const authorizationUrl = new URL(AUTHORIZE_URL);
  authorizationUrl.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl.toString(),
    response_type: "code",
    scope: "openid email " + DRIVE_SCOPE,
    include_granted_scopes: "true",
    access_type: "online",
    prompt: "select_account",
    state: oauthState,
  }).toString();

  const cookie = OAUTH_STATE_COOKIE + "=" + encodeURIComponent(oauthState) +
    "; HttpOnly; Secure; SameSite=Lax; Path=/auth/google/callback; Max-Age=600";
  return redirectResponse(authorizationUrl.toString(), cookie);
}

async function finishGoogleOAuth(request, env) {
  try {
    getAppUrl(env);
  } catch (error) {
    return textResponse(error.message, 500);
  }

  const url = new URL(request.url);
  const returnedState = url.searchParams.get("state") || "";
  const savedState = readCookie(request, OAUTH_STATE_COOKIE);
  const stateCookie = clearStateCookie();

  if (!savedState || !returnedState || returnedState !== savedState) {
    return redirectWithState(
      env,
      "",
      {
        error: "invalid_state",
        error_description: "Sign-in verification expired. Please try again.",
      },
      stateCookie,
    );
  }

  const separatorIndex = returnedState.indexOf(".");
  if (separatorIndex < 1) {
    return redirectWithState(env, "", { error: "invalid_state" }, stateCookie);
  }
  const appState = returnedState.slice(separatorIndex + 1);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return redirectWithState(
      env,
      appState,
      {
        error: oauthError,
        error_description: url.searchParams.get("error_description") || "",
      },
      stateCookie,
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return redirectWithState(
      env,
      appState,
      {
        error: "missing_code",
        error_description: "Google did not return an authorization code.",
      },
      stateCookie,
    );
  }

  try {
    const callbackUrl = new URL("/auth/google/callback", url.origin).toString();
    const tokenBody = new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackUrl,
      grant_type: "authorization_code",
    });
    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) {
      console.error("Google token exchange failed:", tokens.error || tokenResponse.status);
      return redirectWithState(
        env,
        appState,
        {
          error: "token_exchange_failed",
          error_description: "Google could not complete sign-in. Please try again.",
        },
        stateCookie,
      );
    }

    const profileResponse = await fetch(USERINFO_URL, {
      headers: { Authorization: "Bearer " + tokens.access_token },
    });
    const profile = await profileResponse.json();
    if (
      !profileResponse.ok ||
      !profile.email ||
      profile.email_verified === false ||
      profile.email_verified === "false"
    ) {
      console.error("Google profile verification failed:", profileResponse.status);
      return redirectWithState(
        env,
        appState,
        {
          error: "profile_verification_failed",
          error_description: "Google did not return a verified email for this account.",
        },
        stateCookie,
      );
    }

    return redirectWithState(
      env,
      appState,
      {
        access_token: tokens.access_token,
        expires_in: String(tokens.expires_in || ""),
        email: profile.email,
        client_id: env.GOOGLE_CLIENT_ID,
      },
      stateCookie,
    );
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return redirectWithState(
      env,
      appState,
      {
        error: "oauth_callback_failed",
        error_description: "Could not complete Google sign-in. Please try again.",
      },
      stateCookie,
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET") return textResponse("Method not allowed.", 405);

    if (url.pathname === "/auth/google/start") {
      return startGoogleOAuth(request, env);
    }
    if (url.pathname === "/auth/google/callback") {
      return finishGoogleOAuth(request, env);
    }
    if (url.pathname === "/health") {
      return new Response("ok", { headers: baseHeaders() });
    }
    return textResponse("Not found.", 404);
  },
};
