// Usage: node scripts/check-mdx.mjs [files or dirs...]   (default: src/units)
// Compiles every .mdx file with the same plugins as the app and reports syntax errors,
// plus duplicate checkpoint ids across the whole course.
import { compile } from '@mdx-js/mdx';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import remarkSteps from '../remark-steps.js';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const roots = args.length ? args : ['src/units'];
const files = [];
const walk = (p) => {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f));
  else if (p.endsWith('.mdx')) files.push(p);
};
roots.forEach(walk);
let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  try {
    await compile(src, { remarkPlugins: [remarkMath, remarkGfm, remarkSteps], rehypePlugins: [[rehypeKatex, { strict: false, throwOnError: true }]], providerImportSource: '@mdx-js/react' });
    console.log('ok   ', f);
  } catch (e) {
    bad++;
    console.log('FAIL ', f, '\n      ', String(e.message ?? e).split('\n').slice(0, 4).join('\n       '));
  }
}
// duplicate ids across ALL lessons
const all = [];
const walkAll = (p) => {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) walkAll(path.join(p, f));
  else if (p.endsWith('.mdx')) all.push(p);
};
walkAll('src/units');
const ids = new Map();
for (const f of all) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/<(?:Quiz|NumQuiz|Predict)\s+[^>]*id="([^"]+)"/g)) {
    if (ids.has(m[1]) && ids.get(m[1]) !== f) { console.log(`DUP id "${m[1]}" in ${f} and ${ids.get(m[1])}`); bad++; }
    ids.set(m[1], f);
  }
  for (const m of src.matchAll(/challengeId="([^"]+)"/g)) {
    const k = 'ch:' + m[1];
    if (ids.has(k) && ids.get(k) !== f) { console.log(`DUP challengeId "${m[1]}" in ${f}`); bad++; }
    ids.set(k, f);
  }
}
console.log(bad ? `\n${bad} problem(s).` : `\nAll ${files.length} file(s) OK.`);
process.exit(bad ? 1 : 0);
