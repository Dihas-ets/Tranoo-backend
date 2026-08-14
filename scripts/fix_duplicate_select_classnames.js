const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'tranoo_landing', 'app', 'dashboard');

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.tsx$/.test(ent.name)) files.push(p);
  }
  return files;
}

let count = 0;
for (const file of walk(root)) {
  let content = fs.readFileSync(file, 'utf8');
  const orig = content;
  content = content.replace(/ className="hover:bg-[^"]+"/g, '');
  content = content.replace(
    /\$\{DASHBOARD_FILTER_SELECT_CONTENT_CLASS\} bg-yellow-500 text-white/g,
    '${DASHBOARD_FILTER_SELECT_CONTENT_CLASS}',
  );
  content = content.replace(
    /\$\{DASHBOARD_FILTER_SELECT_CONTENT_CLASS\} bg-amber-400/g,
    '${DASHBOARD_FILTER_SELECT_CONTENT_CLASS}',
  );
  if (content !== orig) {
    fs.writeFileSync(file, content);
    console.log('Fixed', path.relative(root, file));
    count += 1;
  }
}
console.log('Total:', count);
