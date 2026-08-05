#!/usr/bin/env node
/**
 * Extract release notes for a version from CHANGELOG.md (Keep a Changelog format).
 * Usage: node scripts/extract-changelog.mjs 0.1.0
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2]?.replace(/^v/, "");
if (!version) {
  console.error("Usage: node scripts/extract-changelog.mjs <version>");
  process.exit(1);
}

const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const header = `## [${version}]`;
const start = changelog.indexOf(header);
if (start < 0) {
  console.log(`No changelog section found for ${version}.`);
  process.exit(0);
}

const afterHeader = changelog.slice(start + header.length);
const nextSection = afterHeader.search(/\n## \[/);
const body = nextSection >= 0 ? afterHeader.slice(0, nextSection) : afterHeader;
process.stdout.write(body.trim());
