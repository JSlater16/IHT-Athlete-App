"use strict";

const express = require("express");
const { prisma } = require("../utils/prisma");
const { valdFetch } = require("../vald/client");
const { getValdConfig, assertValdCredentials, assertValdTenant } = require("../vald/config");

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

module.exports = router;
