#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const scanner = path.join(__dirname, "secret-scanner-v1.cjs");
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "code-secret-scanner-"),
);

function unifiedDiff(addedLines, contextLines = ["base"]) {
  const body = [
    "diff --git a/config.txt b/config.txt",
    "index 1111111..2222222 100644",
    "--- a/config.txt",
    "+++ b/config.txt",
    `@@ -1,${contextLines.length} +1,${contextLines.length + addedLines.length} @@`,
    ...contextLines.map((line) => ` ${line}`),
    ...addedLines.map((line) => `+${line}`),
    "",
  ];
  return body.join("\n");
}

function run(diff) {
  const diffPath = path.join(temporaryDirectory, "change.patch");
  fs.writeFileSync(diffPath, diff);
  return spawnSync(process.execPath, [scanner, diffPath], {
    encoding: "utf8",
  });
}

function findings(result, expectedStatus) {
  assert.equal(result.status, expectedStatus, result.stderr);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout);
  assert.ok(Array.isArray(parsed));
  for (const finding of parsed) {
    assert.deepEqual(Object.keys(finding).sort(), ["file", "line", "rule"]);
    assert.equal(finding.file, "config.txt");
    assert.equal(typeof finding.line, "number");
    assert.equal(typeof finding.rule, "string");
  }
  return parsed;
}

try {
  const githubToken = "ghp_" + "A".repeat(36);
  const known = findings(run(unifiedDiff([githubToken])), 1);
  assert.deepEqual(known, [
    { rule: "known-token.github", file: "config.txt", line: 2 },
  ]);
  assert.ok(!JSON.stringify(known).includes(githubToken));

  const privateKey = findings(
    run(unifiedDiff(["-----BEGIN OPENSSH PRIVATE KEY-----"])),
    1,
  );
  assert.equal(privateKey[0].rule, "private-key");

  const assignedSecret = "correct-horse-battery-staple";
  const assignment = findings(
    run(unifiedDiff([`api_key = "${assignedSecret}"`])),
    1,
  );
  assert.equal(assignment[0].rule, "generic-secret-assignment");
  assert.ok(!assignment[0].rule.includes(assignedSecret));

  const randomValue = "N7vQ2xL9pR4mT8kW3zC6sH1jF5uB0aYd";
  const entropy = findings(
    run(unifiedDiff([`const opaque = "${randomValue}";`])),
    1,
  );
  assert.equal(entropy[0].rule, "high-entropy-value");
  assert.ok(!JSON.stringify(entropy).includes(randomValue));

  const baseOnly = findings(
    run(unifiedDiff(["safe"], [githubToken, "base"])),
    0,
  );
  assert.deepEqual(baseOnly, []);

  const clean = findings(
    run(unifiedDiff(['const token = process.env["API_TOKEN"];'])),
    0,
  );
  assert.deepEqual(clean, []);

  const malformed = run(
    [
      "--- a/config.txt",
      "+++ b/config.txt",
      "@@ -1,1 +1,2 @@",
      " base",
      "",
    ].join("\n"),
  );
  assert.equal(malformed.status, 2);
  assert.equal(malformed.stdout, "");
  assert.match(malformed.stderr, /^secret scanner error: malformed unified diff/);

  const extraAddedLine = run(
    [
      "--- a/config.txt",
      "+++ b/config.txt",
      "@@ -1,1 +1,1 @@",
      " base",
      `+${githubToken}`,
      "",
    ].join("\n"),
  );
  assert.equal(extraAddedLine.status, 2);
  assert.equal(extraAddedLine.stdout, "");
  assert.match(
    extraAddedLine.stderr,
    /^secret scanner error: malformed unified diff/,
  );

  const invalidHeader = run("diff --git malformed\n");
  assert.equal(invalidHeader.status, 2);
  assert.equal(invalidHeader.stdout, "");
  assert.match(
    invalidHeader.stderr,
    /^secret scanner error: malformed unified diff/,
  );

  const missing = spawnSync(
    process.execPath,
    [scanner, path.join(temporaryDirectory, "missing.patch")],
    { encoding: "utf8" },
  );
  assert.equal(missing.status, 2);
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /^secret scanner error: unable to read diff file/);

  process.stdout.write("secret-scanner-v1 self-test passed\n");
} finally {
  fs.rmSync(temporaryDirectory, { force: true, recursive: true });
}
