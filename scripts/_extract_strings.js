const fs = require('fs');
const path = require('path');

function walk(d, a = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p, a);
    else if (p.endsWith('.dart') && !p.includes('_old') && !p.includes('_backup')) a.push(p);
  }
  return a;
}

const dirs = ['tranoo_pro/lib/data/screens', 'tranoo_pro/lib/widgets'];
const files = dirs.flatMap((d) => walk(path.join(__dirname, '..', d)));
const re = /(?:Text|title|subtitle|labelText|hintText|buttonText|message|child)\s*:\s*(?:const\s+)?['"]([^'"]{4,})['"]/g;
const set = new Set();
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(t))) {
    if (/^[a-z_]+$/.test(m[1]) || m[1].includes('http') || m[1].includes('assets/')) continue;
    set.add(m[1]);
  }
}
console.log([...set].sort().join('\n'));
