#!/usr/bin/env node
// Tool-agnostic secret scanner. Reads a unified git diff on stdin, inspects the
// ADDED lines, and exits non-zero if any look like a committed credential.
//
// It is intentionally conservative about printing: it reports file:line and the
// rule name, never the matched secret value.
//
// Bypass a single false positive by adding `secret-scan:allow` (or
// `gitleaks:allow`) anywhere on the offending line.
//
// Optional project deny-list: put exact known-bad strings (one per line) in
// `.githooks/secret-denylist.local` (gitignored) to hard-block them forever.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function loadDenylist() {
  try {
    return readFileSync(join(here, 'secret-denylist.local'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  } catch {
    return []
  }
}

// Files whose content we never scan (they legitimately contain patterns).
const EXCLUDED = [
  /^\.githooks\//,
  /^\.claude\/hooks\//,
  /(^|\/)\.env\.example$/,
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/,
  /(^|\/)secret-denylist\.local$/,
]

// Auth-ish files get an extra rule that flags hardcoded credential literals
// passed to form fillers (the exact shape of the leak we are guarding against).
const AUTH_FILE = /auth|login|credential|\.setup\.|(^|\/)e2e\//i

// Values that are obviously placeholders, not real secrets.
const PLACEHOLDER =
  /^(x{3,}|\*{3,}|\.{3,}|change[_-]?me|your[_-]|placeholder|example|sample|dummy|redacted|<.*>|\$\{?[a-z_]+\}?|process\.env)/i

const ALLOW = /(secret-scan:allow|gitleaks:allow)/

const RULES = [
  {
    name: 'env-fallback-secret',
    desc: "hardcoded fallback for a secret env var, e.g. process.env.X_PASSWORD ?? '...'",
    test: (line) =>
      /process\.env\.[A-Za-z0-9_]*(PASSWORD|PASSWD|PWD|SECRET|TOKEN|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CREDENTIAL)[A-Za-z0-9_]*\s*(\?\?|\|\|)\s*(['"`])[^'"`]+\3/i.test(
        line,
      ),
  },
  {
    name: 'secret-assignment',
    desc: "secret-named variable assigned a string literal, e.g. password: '...'",
    test: (line) => {
      const m = line.match(
        /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?key|secret[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?token|token)\b['"`]?\s*[:=]\s*(['"`])([^'"`\s]{5,})\2/i,
      )
      return m ? !PLACEHOLDER.test(m[3]) : false
    },
  },
  {
    name: 'private-key-block',
    desc: 'PEM private key material',
    test: (line) => /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(line),
  },
]

function authRule(line) {
  const m = line.match(/\.(fill|type|setValue)\(\s*(['"`])([^'"`@\s]{6,})\2/i)
  return m ? !PLACEHOLDER.test(m[3]) : false
}

function parseDiff(diff) {
  // Yields { file, line, content } for every added line, and { envFile } markers.
  const out = []
  let file = null
  let lineNo = 0
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      const p = raw.slice(4).replace(/^b\//, '').trim()
      file = p === '/dev/null' ? null : p
      continue
    }
    if (raw.startsWith('@@')) {
      const m = raw.match(/\+(\d+)/)
      lineNo = m ? parseInt(m[1], 10) : 0
      continue
    }
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      if (file) out.push({ file, line: lineNo, content: raw.slice(1) })
      lineNo++
    }
  }
  return out
}

function main() {
  const diff = readStdin()
  if (!diff.trim()) process.exit(0)

  const denylist = loadDenylist()
  const added = parseDiff(diff)
  const findings = []
  const flaggedEnvFiles = new Set()

  for (const { file, line, content } of added) {
    // Rule: a real .env file must never be committed (only .env.example).
    const b = basename(file)
    if ((b === '.env' || /^\.env\..+/.test(b)) && b !== '.env.example') {
      if (!flaggedEnvFiles.has(file)) {
        flaggedEnvFiles.add(file)
        findings.push({ file, line: 1, rule: 'env-file', desc: 'environment file committed (use .env.example instead)' })
      }
    }

    if (EXCLUDED.some((re) => re.test(file))) continue
    if (ALLOW.test(content)) continue

    for (const r of RULES) {
      if (r.test(content)) findings.push({ file, line, rule: r.name, desc: r.desc })
    }
    if (AUTH_FILE.test(file) && authRule(content)) {
      findings.push({ file, line, rule: 'hardcoded-credential-in-auth-file', desc: 'credential-looking literal in an auth/test file' })
    }
    for (const bad of denylist) {
      if (content.includes(bad)) findings.push({ file, line, rule: 'denylist', desc: 'matches a known-bad string in secret-denylist.local' })
    }
  }

  if (findings.length === 0) process.exit(0)

  console.error('\n⛔ secret-scan blocked: possible secret(s) in added lines\n')
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  [${f.rule}] ${f.desc}`)
  }
  console.error('\nRemove the secret (use env vars / .env.local), or append `secret-scan:allow`')
  console.error('to the line if it is a genuine false positive.\n')
  process.exit(1)
}

main()
