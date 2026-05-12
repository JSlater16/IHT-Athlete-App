"use strict";

const { getValdConfig, assertValdCredentials } = require("./config");

// Token cache lives at module scope so all callers within a process
// share one cached bearer. VALD rate-limits the auth endpoint, so
// refetching per request would get us throttled.
let tokenCache = { accessToken: null, expiresAt: 0 };

// Refresh slightly before actual expiry to avoid the race where a
// request leaves with a valid token but VALD rejects it as expired
// by the time it lands.
const EXPIRY_SKEW_MS = 60 * 1000;

async function fetchToken(config) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    audience: config.audience
  }).toString();

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`VALD auth failed (${response.status}): ${text || response.statusText}`);
  }

  const data = await response.json();
  if (!data.access_token || !Number.isFinite(Number(data.expires_in))) {
    throw new Error("VALD auth response missing access_token or expires_in.");
  }

  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in) * 1000 - EXPIRY_SKEW_MS
  };
}

async function getAccessToken({ forceRefresh = false } = {}) {
  const config = getValdConfig();
  assertValdCredentials(config);

  if (!forceRefresh && tokenCache.accessToken && tokenCache.expiresAt > Date.now()) {
    return tokenCache.accessToken;
  }

  tokenCache = await fetchToken(config);
  return tokenCache.accessToken;
}

// Authenticated fetch against a VALD external API. Pick the host with
// `product` ("forcedecks" | "profiles" | "tenants"). Retries once on
// 401 with a fresh token, in case the cached token was revoked or
// expired faster than expected.
async function valdFetch(product, path, { query, method = "GET", signal } = {}) {
  const config = getValdConfig();
  const host = config.hosts[product];
  if (!host) {
    throw new Error(`Unknown VALD product "${product}".`);
  }

  const url = new URL(path.startsWith("/") ? path : `/${path}`, host);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  async function request(token) {
    return fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      signal
    });
  }

  let token = await getAccessToken();
  let response = await request(token);
  if (response.status === 401) {
    token = await getAccessToken({ forceRefresh: true });
    response = await request(token);
  }

  if (response.status === 204) {
    return { status: 204, data: null };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`VALD ${product} ${path} failed (${response.status}): ${text || response.statusText}`);
  }

  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

// Exposed so tests / scripts can reset between runs.
function _resetTokenCacheForTests() {
  tokenCache = { accessToken: null, expiresAt: 0 };
}

module.exports = { getAccessToken, valdFetch, _resetTokenCacheForTests };
