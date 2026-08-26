/* global console, process */
import { readFileSync } from "node:fs";

const reviewedLicenses = new Set([
  "(BSD-2-Clause OR MIT OR Apache-2.0)",
  "(MIT OR WTFPL)",
  "0BSD",
  "Apache-2.0",
  "Apache-2.0 AND LGPL-3.0-or-later",
  "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "ISC",
  "LGPL-3.0-or-later",
  "MIT",
  "MPL-2.0",
]);

function isReviewedMissingMetadata(path) {
  return (
    path.startsWith("node_modules/@mentionish/") ||
    path.startsWith("apps/dashboard/node_modules/@next/swc-")
  );
}

const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8"));
const counts = new Map();
const failures = [];

for (const [path, dependency] of Object.entries(lockfile.packages ?? {})) {
  if (!path.includes("node_modules/")) continue;
  const license = dependency.license;
  if (!license) {
    if (!isReviewedMissingMetadata(path))
      failures.push(`${path}: missing license metadata`);
    continue;
  }
  counts.set(license, (counts.get(license) ?? 0) + 1);
  if (!reviewedLicenses.has(license))
    failures.push(`${path}: unreviewed license ${license}`);
}

for (const [license, count] of [...counts].sort(([left], [right]) =>
  left.localeCompare(right),
)) {
  console.log(`${license}: ${count}`);
}

if (failures.length > 0) {
  console.error("\nLicense review failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("\nDependency license inventory matches the reviewed set.");
}
