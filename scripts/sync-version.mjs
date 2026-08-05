#!/usr/bin/env node
/**
 * Sync app version across package.json, tauri.conf.json, and Cargo.toml.
 * Usage: node scripts/sync-version.mjs 0.2.0
 *        node scripts/sync-version.mjs v0.2.0
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = process.argv[2];
if (!raw) {
  console.error("Usage: node scripts/sync-version.mjs <version>");
  process.exit(1);
}

const version = raw.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(version)) {
  console.error(`Invalid semver: ${raw}`);
  process.exit(1);
}

function updateJson(file, mutator) {
  const text = fs.readFileSync(file, "utf8");
  const data = JSON.parse(text);
  mutator(data);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

updateJson(path.join(root, "package.json"), (data) => {
  data.version = version;
});

updateJson(path.join(root, "src-tauri/tauri.conf.json"), (data) => {
  data.version = version;
});

const cargoPath = path.join(root, "src-tauri/Cargo.toml");
const cargo = fs.readFileSync(cargoPath, "utf8");
const nextCargo = cargo.replace(
  /^version = "[^"]+"/m,
  `version = "${version}"`,
);
if (nextCargo === cargo) {
  console.error("Could not update version in Cargo.toml");
  process.exit(1);
}
fs.writeFileSync(cargoPath, nextCargo);

console.log(`Synced version to ${version}`);
