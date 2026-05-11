"use strict";

// Lazy Anthropic client. Instantiated on first use so the server can
// still boot when ANTHROPIC_API_KEY isn't configured — only the
// report endpoint fails, not the whole app.

const Anthropic = require("@anthropic-ai/sdk").default;

let client = null;

function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error("ANTHROPIC_API_KEY is not configured on the server.");
    err.status = 503;
    throw err;
  }
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

module.exports = { getAnthropicClient, Anthropic };
