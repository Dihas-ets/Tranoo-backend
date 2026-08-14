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

function neededExports(content) {
  const needed = [];
  if (content.includes('DASHBOARD_FILTER_SELECT_CLASS')) needed.push('DASHBOARD_FILTER_SELECT_CLASS');
  if (content.includes('DASHBOARD_FILTER_SELECT_CONTENT_CLASS')) needed.push('DASHBOARD_FILTER_SELECT_CONTENT_CLASS');
  if (content.includes('DASHBOARD_FILTER_SELECT_ITEM_CLASS')) needed.push('DASHBOARD_FILTER_SELECT_ITEM_CLASS');
  if (content.includes('DASHBOARD_FILTER_NATIVE_SELECT_CLASS')) needed.push('DASHBOARD_FILTER_NATIVE_SELECT_CLASS');
  if (content.includes('DASHBOARD_FILTER_INPUT_CLASS')) needed.push('DASHBOARD_FILTER_INPUT_CLASS');
  return needed;
}

let count = 0;
for (const file of walk(root)) {
  if (file.includes('DashboardFilterSelect.tsx')) continue;
  let content = fs.readFileSync(file, 'utf8');
  const needed = neededExports(content);
  if (!needed.length) continue;

  const importRe =
    /import \{([^}]+)\} from ['"]@\/app\/dashboard\/components\/DashboardFilterSelect['"];/;
  const match = content.match(importRe);
  if (match) {
    const existing = match[1].split(',').map((s) => s.trim()).filter(Boolean);
    let changed = false;
    for (const n of needed) {
      if (!existing.includes(n)) {
        existing.push(n);
        changed = true;
      }
    }
    if (changed) {
      content = content.replace(
        importRe,
        `import { ${existing.join(', ')} } from '@/app/dashboard/components/DashboardFilterSelect';`,
      );
      fs.writeFileSync(file, content);
      console.log('Fixed', path.relative(root, file));
      count += 1;
    }
  } else if (needed.length) {
    const useClient = content.match(/^["']use client["'];?\s*\n/m);
    const line = `import { ${needed.join(', ')} } from '@/app/dashboard/components/DashboardFilterSelect';`;
    if (useClient) {
      const idx = useClient.index + useClient[0].length;
      content = content.slice(0, idx) + line + '\n' + content.slice(idx);
    } else {
      content = line + '\n' + content;
    }
    fs.writeFileSync(file, content);
    console.log('Added import', path.relative(root, file));
    count += 1;
  }
}
console.log('Total:', count);
