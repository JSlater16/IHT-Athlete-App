"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { valdFetch } = require("../src/vald/client");

async function main() {
  const { status, data } = await valdFetch("forcedecks", "/resultdefinitions");
  console.log(`Status: ${status}`);
  const defs = Array.isArray(data?.resultDefinitions) ? data.resultDefinitions : Array.isArray(data) ? data : [];
  console.log(`Definitions: ${defs.length}`);
  console.log("");

  // Print as a wide table sorted by resultGroup + name for easy scanning.
  defs.sort((a, b) => {
    const ag = (a.resultGroup || "").localeCompare(b.resultGroup || "");
    if (ag !== 0) return ag;
    return (a.resultIdString || "").localeCompare(b.resultIdString || "");
  });

  console.log("resultId\tresultIdString\tname\tunit\tgroup\ttrend");
  for (const d of defs) {
    console.log(
      [
        d.resultId,
        d.resultIdString,
        d.resultName,
        d.resultUnitName,
        d.resultGroup,
        d.trendDirection
      ].join("\t")
    );
  }
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
