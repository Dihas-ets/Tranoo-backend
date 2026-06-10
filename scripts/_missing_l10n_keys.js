const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, 'generate_l10n_arb.js');
const catalogSrc = fs.readFileSync(catalogPath, 'utf8');
const catalogMatch = catalogSrc.match(/const catalog = \{([\s\S]*?)\};/);
const frValues = new Set();
for (const m of catalogMatch[1].matchAll(/fr:\s*'((?:\\'|[^'])*)'/g)) {
  frValues.add(m[1].replace(/\\'/g, "'"));
}

function walk(d, a = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, a);
    else if (p.endsWith('.dart') && !/_old|_backup/.test(p)) a.push(p);
  }
  return a;
}

const dirs = ['tranoo_pro/lib/data/screens', 'tranoo_pro/lib/widgets'];
const files = dirs.flatMap((d) => walk(path.join(__dirname, '..', d)));
const re = /(?:Text|title|subtitle|labelText|hintText|buttonText|message|child|return)\s*(?:\([^)]*\))?\s*:\s*(?:const\s+)?['"]([^'"\$]{4,})['"]/g;
const found = new Set();
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(t))) {
    const s = m[1];
    if (/^[a-z_]+$/.test(s) || s.includes('http') || s.includes('assets/')) continue;
    if (!frValues.has(s)) found.add(s);
  }
}
console.log('Missing count:', found.size);
console.log([...found].sort().join('\n'));
