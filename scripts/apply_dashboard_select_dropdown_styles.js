const fs = require('fs');
const path = require('path');

const DASH_ROOT = path.join(__dirname, '..', 'tranoo_landing', 'app', 'dashboard');

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.tsx$/.test(ent.name)) files.push(p);
  }
  return files;
}

function ensureImport(content) {
  const needContent = content.includes('DASHBOARD_FILTER_SELECT_CONTENT_CLASS');
  const needItem = content.includes('DASHBOARD_FILTER_SELECT_ITEM_CLASS');
  if (!needContent && !needItem) return content;
  if (!content.includes('DashboardFilterSelect')) {
    const useClient = content.match(/^["']use client["'];?\s*\n/m);
    const line =
      "import { DASHBOARD_FILTER_SELECT_CLASS, DASHBOARD_FILTER_SELECT_CONTENT_CLASS, DASHBOARD_FILTER_SELECT_ITEM_CLASS } from '@/app/dashboard/components/DashboardFilterSelect';";
    if (useClient) {
      const idx = useClient.index + useClient[0].length;
      return content.slice(0, idx) + line + '\n' + content.slice(idx);
    }
    return line + '\n' + content;
  }
  let updated = content;
  const add = [];
  if (needContent && !content.includes('DASHBOARD_FILTER_SELECT_CONTENT_CLASS')) {
    add.push('DASHBOARD_FILTER_SELECT_CONTENT_CLASS');
  }
  if (needItem && !content.includes('DASHBOARD_FILTER_SELECT_ITEM_CLASS')) {
    add.push('DASHBOARD_FILTER_SELECT_ITEM_CLASS');
  }
  if (add.length) {
    updated = updated.replace(
      /import \{([^}]+)\} from ['"]@\/app\/dashboard\/components\/DashboardFilterSelect['"];/,
      (m, imports) => {
        const parts = imports.split(',').map((s) => s.trim()).filter(Boolean);
        for (const a of add) {
          if (!parts.includes(a)) parts.push(a);
        }
        return `import { ${parts.join(', ')} } from '@/app/dashboard/components/DashboardFilterSelect';`;
      },
    );
  }
  return updated;
}

function skipFile(filePath) {
  if (filePath.includes('DashboardFilterSelect.tsx')) return true;
  if (filePath.includes('utilisateurs/details/page')) return true;
  return false;
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const orig = content;
  if (skipFile(filePath)) return false;

  // Skip transparent profile overlay selects
  if (content.includes('border-0 bg-transparent focus:ring-0')) return false;

  // SelectContent without className
  content = content.replace(/<SelectContent>/g, '<SelectContent className={DASHBOARD_FILTER_SELECT_CONTENT_CLASS}>');

  // Replace manual amber content classes
  content = content.replace(
    /<SelectContent className="bg-amber-400 text-white">/g,
    '<SelectContent className={DASHBOARD_FILTER_SELECT_CONTENT_CLASS}>',
  );

  // SelectContent with other className — prepend constant if missing
  content = content.replace(
    /<SelectContent className=\{`([^`]*?)`\}>/g,
    (match, cls) => {
      if (cls.includes('DASHBOARD_FILTER_SELECT_CONTENT')) return match;
      return `<SelectContent className={\`\${DASHBOARD_FILTER_SELECT_CONTENT_CLASS} ${cls}\`}>`;
    },
  );
  content = content.replace(
    /<SelectContent className="([^"]+)">/g,
    (match, cls) => {
      if (cls.includes('DASHBOARD_FILTER_SELECT_CONTENT')) return match;
      return `<SelectContent className={\`\${DASHBOARD_FILTER_SELECT_CONTENT_CLASS} ${cls}\`}>`;
    },
  );

  // SelectItem without className (filters)
  content = content.replace(
    /<SelectItem (value=)/g,
    '<SelectItem className={DASHBOARD_FILTER_SELECT_ITEM_CLASS} $1',
  );
  content = content.replace(
    /<SelectItem (key=)/g,
    '<SelectItem className={DASHBOARD_FILTER_SELECT_ITEM_CLASS} $1',
  );

  // Remove duplicate className on SelectItem
  content = content.replace(
    /className=\{DASHBOARD_FILTER_SELECT_ITEM_CLASS\} className="hover:bg-amber-500"/g,
    'className={DASHBOARD_FILTER_SELECT_ITEM_CLASS}',
  );
  content = content.replace(
    /className=\{DASHBOARD_FILTER_SELECT_ITEM_CLASS\} className=\{DASHBOARD_FILTER_SELECT_ITEM_CLASS\}/g,
    'className={DASHBOARD_FILTER_SELECT_ITEM_CLASS}',
  );

  if (content !== orig) {
    content = ensureImport(content);
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

let count = 0;
for (const f of walk(DASH_ROOT)) {
  if (processFile(f)) {
    console.log('Updated', path.relative(DASH_ROOT, f));
    count += 1;
  }
}
console.log('Total:', count);
