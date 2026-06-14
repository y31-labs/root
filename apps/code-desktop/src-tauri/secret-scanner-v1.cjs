#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const { TextDecoder } = require("node:util");

const MAX_DIFF_BYTES = 64 * 1024 * 1024;
const PRIVATE_KEY_PATTERN =
  /-----BEGIN (?:[A-Z0-9][A-Z0-9 ]* )?PRIVATE KEY-----/i;
const KNOWN_TOKEN_PATTERNS = [
  ["known-token.aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  [
    "known-token.github",
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})\b/,
  ],
  ["known-token.google-api-key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ["known-token.slack", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["known-token.stripe-live", /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/],
];
const SECRET_NAME =
  String.raw`(?:api[_-]?key|secret(?:[_-]?key)?|client[_-]?secret|access[_-]?token|auth[_-]?token|password|passwd|pwd|token)`;
const SECRET_ASSIGNMENT_PATTERN = new RegExp(
  String.raw`["']?\b${SECRET_NAME}\b["']?\s*(?:=|:)\s*(?:"([^"\r\n]+)"|'([^'\r\n]+)'|` +
    "`([^`\\r\\n]+)`" +
    String.raw`|([^\s,;#}]+))`,
  "i",
);
const HIGH_ENTROPY_PATTERN =
  /(?:^|[^A-Za-z0-9+/_=-])([A-Za-z0-9+/_=-]{24,})(?=$|[^A-Za-z0-9+/_=-])/g;

function fail(message) {
  process.stderr.write(`secret scanner error: ${message}\n`);
  process.exitCode = 2;
}

function parseQuotedPath(value) {
  let result = "";
  let index = 1;

  while (index < value.length) {
    const character = value[index++];
    if (character === '"') {
      const remainder = value.slice(index);
      if (remainder !== "" && !remainder.startsWith("\t")) {
        throw new Error("unexpected data after quoted path");
      }
      return result;
    }
    if (character !== "\\") {
      result += character;
      continue;
    }
    if (index >= value.length) {
      throw new Error("unterminated path escape");
    }

    const escaped = value[index++];
    const simpleEscapes = {
      '"': '"',
      "\\": "\\",
      a: "\x07",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      v: "\v",
    };
    if (Object.hasOwn(simpleEscapes, escaped)) {
      result += simpleEscapes[escaped];
      continue;
    }
    if (/[0-7]/.test(escaped)) {
      let octal = escaped;
      while (octal.length < 3 && /[0-7]/.test(value[index] || "")) {
        octal += value[index++];
      }
      result += String.fromCharCode(Number.parseInt(octal, 8));
      continue;
    }
    throw new Error("unsupported path escape");
  }

  throw new Error("unterminated quoted path");
}

function parseHeaderPath(value) {
  const raw = value.startsWith('"')
    ? parseQuotedPath(value)
    : value.split("\t", 1)[0].trimEnd();
  if (raw === "/dev/null") return null;
  if (raw.length === 0 || raw.length > 4096 || raw.includes("\0")) {
    throw new Error("invalid file path");
  }
  return raw.startsWith("a/") || raw.startsWith("b/") ? raw.slice(2) : raw;
}

function parseHunkHeader(line) {
  const match =
    /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(line);
  if (!match) throw new Error("invalid hunk header");

  const values = match.slice(1).map((value) =>
    value === undefined ? undefined : Number.parseInt(value, 10),
  );
  if (values.some((value) => value !== undefined && !Number.isSafeInteger(value))) {
    throw new Error("invalid hunk range");
  }

  const hunk = {
    oldLine: values[0],
    oldCount: values[1] ?? 1,
    newLine: values[2],
    newCount: values[3] ?? 1,
  };
  if (
    (hunk.oldCount > 0 && hunk.oldLine === 0) ||
    (hunk.newCount > 0 && hunk.newLine === 0) ||
    (hunk.oldCount === 0 && hunk.newCount === 0)
  ) {
    throw new Error("invalid hunk range");
  }
  return hunk;
}

function validateGitDiffHeader(line) {
  const value = line.slice("diff --git ".length);
  const startsWithOldPath = value.startsWith("a/") || value.startsWith('"a/');
  const newPathIndex = Math.max(
    value.lastIndexOf(" b/"),
    value.lastIndexOf(' "b/'),
  );
  if (!startsWithOldPath || newPathIndex <= 0) {
    throw new Error("invalid git diff header");
  }
}

function shannonEntropy(value) {
  const counts = new Map();
  for (const character of value) {
    counts.set(character, (counts.get(character) || 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function looksLikePlaceholder(value) {
  const normalized = value.toLowerCase();
  return (
    value.length < 8 ||
    /^(?:true|false|null|undefined|none)$/.test(normalized) ||
    /(?:example|sample|placeholder|changeme|redacted|replace[_-]?me)/.test(
      normalized,
    ) ||
    /^(?:process\.env|env\.|\$\{|<)/i.test(value)
  );
}

function isHighEntropy(value) {
  const candidate = value.replace(/=+$/, "");
  if (candidate.length < 24 || new Set(candidate).size < 10) return false;

  if (/^[A-Fa-f0-9]{32,}$/.test(candidate)) {
    return shannonEntropy(candidate) >= 3.5;
  }

  const classes = [
    /[a-z]/.test(candidate),
    /[A-Z]/.test(candidate),
    /\d/.test(candidate),
    /[+/_-]/.test(candidate),
  ].filter(Boolean).length;
  return classes >= 3 && shannonEntropy(candidate) >= 4.2;
}

function rulesForLine(text) {
  const rules = new Set();

  for (const [rule, pattern] of KNOWN_TOKEN_PATTERNS) {
    if (pattern.test(text)) rules.add(rule);
  }
  if (PRIVATE_KEY_PATTERN.test(text)) {
    rules.add("private-key");
  }

  const assignment = SECRET_ASSIGNMENT_PATTERN.exec(text);
  if (assignment) {
    const value = assignment.slice(1).find((candidate) => candidate !== undefined);
    if (value !== undefined && !looksLikePlaceholder(value)) {
      rules.add("generic-secret-assignment");
    }
  }

  HIGH_ENTROPY_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(HIGH_ENTROPY_PATTERN)) {
    if (isHighEntropy(match[1])) {
      rules.add("high-entropy-value");
      break;
    }
  }

  return [...rules].sort();
}

function scanUnifiedDiff(diff) {
  if (diff.length === 0 || diff.includes("\0")) {
    throw new Error("empty or binary input");
  }

  const findings = [];
  const lines = diff.replace(/\r\n/g, "\n").split("\n");
  let sawStructure = false;
  let pendingOldPath;
  let currentFile;
  let sectionStarted = false;
  let sectionHasEvidence = false;
  let binaryPatch = false;
  let inHunk = false;
  let oldRemaining = 0;
  let newRemaining = 0;
  let newLine = 0;

  const beginSection = () => {
    if (sectionStarted && !sectionHasEvidence) {
      throw new Error("diff section has no changes");
    }
    sectionStarted = true;
    sectionHasEvidence = false;
    binaryPatch = false;
    pendingOldPath = undefined;
    currentFile = undefined;
  };

  for (const line of lines) {
    if (inHunk && oldRemaining === 0 && newRemaining === 0) {
      inHunk = false;
    }

    if (inHunk) {
      if (line === "\\ No newline at end of file") continue;

      const prefix = line[0];
      if (prefix === " ") {
        oldRemaining -= 1;
        newRemaining -= 1;
        newLine += 1;
      } else if (prefix === "-") {
        oldRemaining -= 1;
      } else if (prefix === "+") {
        newRemaining -= 1;
        for (const rule of rulesForLine(line.slice(1))) {
          findings.push({ rule, file: currentFile, line: newLine });
        }
        newLine += 1;
      } else {
        throw new Error("invalid hunk body");
      }
      if (oldRemaining < 0 || newRemaining < 0) {
        throw new Error("hunk exceeds declared range");
      }
      continue;
    }

    if (line.startsWith("diff --git ")) {
      validateGitDiffHeader(line);
      beginSection();
      sawStructure = true;
      continue;
    }
    if (binaryPatch) {
      continue;
    }
    if (line.startsWith("--- ")) {
      if (pendingOldPath !== undefined) {
        throw new Error("duplicate old file header");
      }
      if (!sectionStarted || currentFile !== undefined) {
        beginSection();
      }
      pendingOldPath = parseHeaderPath(line.slice(4));
      sawStructure = true;
      continue;
    }
    if (line.startsWith("+++ ")) {
      if (pendingOldPath === undefined) {
        throw new Error("new file header without old file header");
      }
      const newPath = parseHeaderPath(line.slice(4));
      currentFile = newPath ?? pendingOldPath;
      pendingOldPath = undefined;
      if (currentFile === null || currentFile === undefined) {
        throw new Error("file header has no usable path");
      }
      continue;
    }
    if (line.startsWith("@@")) {
      if (pendingOldPath !== undefined || currentFile === undefined) {
        throw new Error("hunk without complete file header");
      }
      const hunk = parseHunkHeader(line);
      newLine = hunk.newLine;
      oldRemaining = hunk.oldCount;
      newRemaining = hunk.newCount;
      inHunk = true;
      sectionHasEvidence = true;
      continue;
    }
    if (line === "GIT binary patch") {
      if (!sectionStarted) throw new Error("binary patch without file header");
      binaryPatch = true;
      sectionHasEvidence = true;
      continue;
    }
    if (/^Binary files .+ differ$/.test(line)) {
      if (!sectionStarted) throw new Error("binary diff without file header");
      sectionHasEvidence = true;
      continue;
    }
    if (
      /^(?:new file mode|deleted file mode|old mode|new mode) \d+$/.test(line) ||
      /^(?:similarity|dissimilarity) index \d+%$/.test(line) ||
      /^(?:rename|copy) (?:from|to) .+$/.test(line)
    ) {
      if (!sectionStarted) throw new Error("metadata without file header");
      sectionHasEvidence = true;
      continue;
    }
    if (
      line === "" ||
      line === "\\ No newline at end of file" ||
      /^index [0-9a-f]+\.\.[0-9a-f]+(?: \d+)?$/i.test(line)
    ) {
      continue;
    }
    throw new Error("unexpected data outside hunk");
  }

  if (inHunk && (oldRemaining !== 0 || newRemaining !== 0)) {
    throw new Error("truncated hunk");
  }
  if (pendingOldPath !== undefined) {
    throw new Error("incomplete file header");
  }
  if (!sawStructure || !sectionStarted || !sectionHasEvidence) {
    throw new Error("input is not a unified diff");
  }

  return findings;
}

function main() {
  if (process.argv.length !== 3) {
    fail("exactly one unified diff file is required");
    return;
  }

  let bytes;
  try {
    const stats = fs.statSync(process.argv[2]);
    if (!stats.isFile() || stats.size === 0 || stats.size > MAX_DIFF_BYTES) {
      fail("diff file is empty, oversized, or not a regular file");
      return;
    }
    bytes = fs.readFileSync(process.argv[2]);
  } catch {
    fail("unable to read diff file");
    return;
  }

  let diff;
  try {
    diff = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("diff file is not valid UTF-8");
    return;
  }

  let findings;
  try {
    findings = scanUnifiedDiff(diff);
  } catch {
    fail("malformed unified diff");
    return;
  }

  process.stdout.write(`${JSON.stringify(findings)}\n`);
  process.exitCode = findings.length === 0 ? 0 : 1;
}

main();
