"use strict";

/* Smoke test for VALD credentials and connectivity. Run from the
 * server workspace:
 *
 *   node scripts/valdSmoke.js
 *
 * Loads .env, fetches a bearer token, then hits the Tenants API
 * /tenants endpoint to verify the configured tenantId is one this
 * client can see. Pure read-only — no DB writes.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { getAccessToken, valdFetch } = require("../src/vald/client");
const { getValdConfig } = require("../src/vald/config");

async function main() {
  const config = getValdConfig();
  console.log(`Region: ${config.region}`);
  console.log(`Token URL: ${config.tokenUrl}`);
  console.log(`Tenants host: ${config.hosts.tenants}`);
  console.log(`Configured tenantId: ${config.tenantId || "(none)"}`);
  console.log("");

  console.log("Fetching access token...");
  const token = await getAccessToken();
  console.log(`OK. Token prefix: ${token.slice(0, 20)}... (length ${token.length})`);
  console.log("");

  console.log("Hitting /tenants ...");
  const { status, data } = await valdFetch("tenants", "/tenants");
  console.log(`Status: ${status}`);
  if (Array.isArray(data)) {
    console.log(`Returned ${data.length} tenants:`);
    for (const t of data) {
      console.log(`  - ${t.id || t.tenantId || "?"}  ${t.name || t.displayName || ""}`);
    }
  } else if (data && Array.isArray(data.tenants)) {
    console.log(`Returned ${data.tenants.length} tenants:`);
    for (const t of data.tenants) {
      console.log(`  - ${t.id || t.tenantId || "?"}  ${t.name || t.displayName || ""}`);
    }
  } else {
    console.log("Raw response:");
    console.log(JSON.stringify(data, null, 2));
  }
}

main().catch((err) => {
  console.error("Smoke test failed:", err.message);
  process.exit(1);
});
