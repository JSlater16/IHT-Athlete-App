const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export async function apiRequest(
  path,
  { method = "GET", token, body, signal, skipAuthRedirect } = {}
) {
  const target = path.startsWith("http") ? path : `${API_BASE}${path}`;

  let response;
  try {
    response = await fetch(target, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {})
    });
  } catch (networkError) {
    // Preserve AbortError so callers can detect cleanup
    if (networkError?.name === "AbortError") {
      throw networkError;
    }
    throw networkError;
  }

  if (!response.ok) {
    let message = "Something went wrong.";

    try {
      const text = await response.text();
      if (text) {
        try {
          const payload = JSON.parse(text);
          if (payload?.error) {
            message = payload.error;
          }
        } catch (_parseError) {
          message = text;
        }
      } else {
        message = response.statusText || message;
      }
    } catch (_readError) {
      message = response.statusText || message;
    }

    if (
      response.status === 401 &&
      !skipAuthRedirect &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(
        new CustomEvent("app:auth-invalid", {
          detail: {
            status: response.status,
            message,
            path
          }
        })
      );
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  if (response.headers.get("content-length") === "0") {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (_parseError) {
    return null;
  }
}
