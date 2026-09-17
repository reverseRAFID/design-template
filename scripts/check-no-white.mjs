#!/usr/bin/env node
/**
 * Non-negotiable rule 1: the "white" is always --mt-cream (#F4F3EE).
 * Fails on #fff / #ffffff / bare `white` anywhere in src/, outside comments.
 * tokens.css is exempt for hex values only — it is the one file that owns them.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const EXTS = /\.(ts|tsx|css|html)$/;
const TOKENS = join(SRC, 'styles/tokens.css');

/** Strip // line comments, block comments and JSX comments so prose about the rule is allowed. */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p) => p);
}

const OFFENDERS = [
  { re: /#ffffff\b/gi, what: '#ffffff' },
  { re: /#fff\b/gi, what: '#fff' },
  { re: /(?<![-\w])white(?![-\w])/gi, what: 'white' },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXTS.test(entry)) out.push(p);
  }
  return out;
}

let failures = 0;
for (const file of walk(SRC)) {
  const raw = readFileSync(file, 'utf8');
  const code = stripComments(raw);
  const isTokens = file === TOKENS;
  for (const { re, what } of OFFENDERS) {
    if (isTokens && what !== 'white') continue; // tokens.css owns the hex values
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code))) {
      const line = code.slice(0, m.index).split('\n').length;
      console.error(`${relative(ROOT, file)}:${line}  forbidden "${what}" — use var(--mt-cream)`);
      failures++;
    }
  }
}

if (failures) {
  console.error(`\ncheck-no-white: ${failures} violation(s). The white is #F4F3EE.`);
  process.exit(1);
}
console.log('check-no-white: clean');
