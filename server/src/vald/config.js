"use strict";

// VALD External APIs are region-locked. Each region has its own host
// per product, but auth is global.

const TOKEN_URL = "https://auth.prd.vald.com/oauth/token";
const AUDIENCE = "vald-api-external";

const REGION_HOSTS = {
  aue: {
    forcedecks: "https://prd-aue-api-extforcedecks.valdperformance.com",
    profiles: "https://prd-aue-api-externalprofile.valdperformance.com",
    tenants: "https://prd-aue-api-externaltenants.valdperformance.com"
  },
  use: {
    forcedecks: "https://prd-use-api-extforcedecks.valdperformance.com",
    profiles: "https://prd-use-api-externalprofile.valdperformance.com",
    tenants: "https://prd-use-api-externaltenants.valdperformance.com"
  },
  euw: {
    forcedecks: "https://prd-euw-api-extforcedecks.valdperformance.com",
    profiles: "https://prd-euw-api-externalprofile.valdperformance.com",
    tenants: "https://prd-euw-api-externaltenants.valdperformance.com"
  }
};

function getValdConfig() {
  const region = (process.env.VALD_REGION || "use").toLowerCase();
  const hosts = REGION_HOSTS[region];
  if (!hosts) {
    throw new Error(`Unknown VALD_REGION "${region}". Expected aue, use, or euw.`);
  }
  return {
    region,
    tokenUrl: TOKEN_URL,
    audience: AUDIENCE,
    clientId: process.env.VALD_CLIENT_ID || "",
    clientSecret: process.env.VALD_CLIENT_SECRET || "",
    tenantId: process.env.VALD_TENANT_ID || "",
    hosts
  };
}

function assertValdCredentials(config) {
  if (!config.clientId || !config.clientSecret) {
    throw new Error("VALD_CLIENT_ID and VALD_CLIENT_SECRET must be set.");
  }
}

function assertValdTenant(config) {
  if (!config.tenantId) {
    throw new Error("VALD_TENANT_ID must be set.");
  }
}

module.exports = { getValdConfig, assertValdCredentials, assertValdTenant };
