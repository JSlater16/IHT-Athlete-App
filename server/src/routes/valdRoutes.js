"use strict";

const express = require("express");
const { prisma } = require("../utils/prisma");
const { valdFetch } = require("../vald/client");
const { getValdConfig, assertValdCredentials, assertValdTenant } = require("../vald/config");
const { syncAthleteForceDecks, syncAllLinkedAthletes } = require("../vald/sync");
const { recordAudit } = require("../utils/audit");

const router = express.Router();

// GET /api/vald/profiles — returns all VALD profiles for the configured
// tenant, enriched with whether each is already linked to one of our
// athletes (so the UI can disable / surface "already linked to X").
router.get("/profiles", async (req, res, next) => {
  try {
    const config = getValdConfig();
    assertValdCredentials(config);
    assertValdTenant(config);

    const { status, data } = await valdFetch("profiles", "/profiles", {
      query: { tenantId: config.tenantId }
    });

    if (status === 204 || !data) {
      return res.json({ profiles: [] });
    }

    // VALD's response is either a bare array or {profiles: [...]} —
    // handle both so an API tweak doesn't break us.
    const raw = Array.isArray(data) ? data : Array.isArray(data.profiles) ? data.profiles : [];

    // Build a lookup of which VALD profileIds are already linked here.
    const linked = await prisma.athleteProfile.findMany({
      where: { valdProfileId: { not: null } },
      select: { id: true, valdProfileId: true, user: { select: { name: true } } }
    });
    const linkedByValdId = new Map(
      linked.map((a) => [a.valdProfileId, { athleteId: a.id, name: a.user?.name || "" }])
    );

    const profiles = raw
      // Exclude profiles being merged — they're transient and we
      // shouldn't link to them.
      .filter((p) => !p.beingMergedWithProfileId)
      .map((p) => ({
        profileId: p.profileId,
        givenName: p.givenName || "",
        familyName: p.familyName || "",
        dateOfBirth: p.dateOfBirth || null,
        externalId: p.externalId || null,
        linkedAthlete: linkedByValdId.get(p.profileId) || null
      }))
      .sort((a, b) => {
        const ax = `${a.familyName} ${a.givenName}`.trim().toLowerCase();
        const bx = `${b.familyName} ${b.givenName}`.trim().toLowerCase();
        return ax.localeCompare(bx);
      });

    return res.json({ profiles });
  } catch (error) {
    return next(error);
  }
});

// POST /api/vald/sync/:athleteId — coach-triggered manual sync for a
// single athlete. Pulls new CMJ tests since the last sync, writes them
// into ForceDecksTest/ForceDecksMetric idempotently on externalId.
router.post("/sync/:athleteId", async (req, res, next) => {
  try {
    // Manual coach sync re-pulls full history so corrections to the
    // mapping or aggregation overwrite existing rows. The nightly cron
    // uses the cursor for cheap deltas.
    const result = await syncAthleteForceDecks(req.params.athleteId, { fullHistory: true });
    await recordAudit({
      req,
      action: "vald.sync.athlete",
      targetType: "athlete",
      targetId: req.params.athleteId,
      targetLabel: result.athleteName || "",
      metadata: { imported: result.imported, skipped: result.skipped, total: result.total }
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

// POST /api/vald/sync — sync every athlete linked to a VALD profile.
// Owner only; used as the cron handler too.
router.post("/sync", async (req, res, next) => {
  try {
    if (req.user?.role !== "OWNER") {
      return res.status(403).json({ error: "Owner access required." });
    }
    const results = await syncAllLinkedAthletes();
    const imported = results.reduce((acc, r) => acc + (r.imported || 0), 0);
    const errors = results.filter((r) => r.error).length;
    await recordAudit({
      req,
      action: "vald.sync.all",
      targetType: "vald",
      targetId: null,
      targetLabel: "",
      metadata: { athletesSynced: results.length, imported, errors }
    });
    return res.json({ results, imported, errors });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
