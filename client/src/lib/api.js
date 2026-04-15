export async function apiRequest(path, { method = "GET", token, body } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  if (!response.ok) {
    let message = "Something went wrong.";
    let payload;

    try {
      payload = await response.json();
      if (payload?.error) {
        message = payload.error;
      }
    } catch (_error) {
      message = response.statusText || message;
    }

    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      /token|expired|authentication/i.test(message)
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

  return response.json();
}
