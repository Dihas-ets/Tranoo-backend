const fs = require('fs');
const path = require('path');

const DASH_ROOT = path.join(__dirname, '..', 'tranoo_landing', 'app', 'dashboard');
const FILTER_IMPORT =
  "import { DASHBOARD_FILTER_SELECT_CLASS, DASHBOARD_FILTER_NATIVE_SELECT_CLASS, DASHBOARD_FILTER_INPUT_CLASS } from '@/app/dashboard/components/DashboardFilterSelect';";

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(tsx|ts)$/.test(ent.name)) files.push(p);
  }
  return files;
}

function ensureImport(content) {
  if (content.includes('DashboardFilterSelect')) {
    if (!content.includes('DASHBOARD_FILTER_INPUT_CLASS')) {
      content = content.replace(
        /import \{([^}]+)\} from '@\/app\/dashboard\/components\/DashboardFilterSelect';/,
        (match, imports) => {
          const parts = imports.split(',').map((s) => s.trim()).filter(Boolean);
          if (!parts.includes('DASHBOARD_FILTER_INPUT_CLASS')) {
            parts.push('DASHBOARD_FILTER_INPUT_CLASS');
          }
          return `import { ${parts.join(', ')} } from '@/app/dashboard/components/DashboardFilterSelect';`;
        },
      );
      content = content.replace(
        /import \{([^}]+)\} from "@\/app\/dashboard\/components\/DashboardFilterSelect";/,
        (match, imports) => {
          const parts = imports.split(',').map((s) => s.trim()).filter(Boolean);
          if (!parts.includes('DASHBOARD_FILTER_INPUT_CLASS')) {
            parts.push('DASHBOARD_FILTER_INPUT_CLASS');
          }
          return `import { ${parts.join(', ')} } from "@/app/dashboard/components/DashboardFilterSelect";`;
        },
      );
    }
    return content;
  }
  const useClient = content.match(/^"use client"\s*\n/m) || content.match(/^'use client';\s*\n/m);
  if (useClient) {
    const idx = useClient.index + useClient[0].length;
    return content.slice(0, idx) + FILTER_IMPORT + '\n' + content.slice(idx);
  }
  const firstImport = content.match(/^import .+\n/m);
  if (firstImport) {
    return content.slice(0, firstImport.index) + FILTER_IMPORT + '\n' + content.slice(firstImport.index);
  }
  return FILTER_IMPORT + '\n' + content;
}

function isFormOnlyPage(filePath) {
  return /add_form|edit[/\\]\[id\]|profil[/\\]\[id\]|VerificationComposer/.test(filePath);
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const orig = content;

  if (filePath.includes('DashboardFilterSelect.tsx')) return false;
  if (isFormOnlyPage(filePath)) return false;

  const skipTransparent = filePath.includes('utilisateurs/details/page');

  // bg-white border-gray-200 SelectTriggers
  content = content.replace(
    /<SelectTrigger className="([^"]*\s)?bg-white border-gray-200([^"]*)"/g,
    (match, before = '', after = '') => {
      if (skipTransparent) return match;
      const extra = `${before || ''}${after || ''}`.trim();
      return extra
        ? `<SelectTrigger className={\`\${DASHBOARD_FILTER_SELECT_CLASS} ${extra}\`}`
        : `<SelectTrigger className={DASHBOARD_FILTER_SELECT_CLASS}`;
    },
  );

  // amber filter classes -> shared constant
  content = content.replace(
    /<SelectTrigger className="bg-amber-100 border-amber-200([^"]*)"/g,
    (match, rest = '') => {
      const extra = rest.trim();
      return extra
        ? `<SelectTrigger className={\`\${DASHBOARD_FILTER_SELECT_CLASS} ${extra}\`}`
        : `<SelectTrigger className={DASHBOARD_FILTER_SELECT_CLASS}`;
    },
  );

  content = content.replace(
    /<SelectTrigger className=\{SELECT_TRIGGER_CLASS\}/g,
    '<SelectTrigger className={DASHBOARD_FILTER_SELECT_CLASS}',
  );

  // Pagination / compact selects
  content = content.replace(
    /<SelectTrigger className="(w-\[[^\]]+\][^"]*)"/g,
    (match, cls) => {
      if (match.includes('DASHBOARD_FILTER')) return match;
      if (cls.includes('border-0') || cls.includes('bg-transparent')) return match;
      return `<SelectTrigger className={\`\${DASHBOARD_FILTER_SELECT_CLASS} ${cls}\`}`;
    },
  );

  content = content.replace(
    /<SelectTrigger className="(w-\d+[^"]*)"/g,
    (match, cls) => {
      if (match.includes('DASHBOARD_FILTER')) return match;
      if (cls.includes('border-0') || cls.includes('bg-transparent')) return match;
      return `<SelectTrigger className={\`\${DASHBOARD_FILTER_SELECT_CLASS} ${cls}\`}`;
    },
  );

  // Bare SelectTrigger (list pages filters)
  content = content.replace(/<SelectTrigger>\s*\n\s*<SelectValue/g, () => {
    return `<SelectTrigger className={DASHBOARD_FILTER_SELECT_CLASS}>\n                  <SelectValue`;
  });

  // Native selects in filter bars
  content = content.replace(
    /<select([^>]*)className="([^"]*?)bg-white([^"]*)"/g,
    (match, attrs, before, after) => {
      const rest = `${before}${after}`.replace(/\s+/g, ' ').trim();
      return `<select${attrs}className={\`\${DASHBOARD_FILTER_NATIVE_SELECT_CLASS} ${rest}\`}`;
    },
  );

  content = content.replace(
    /className="border rounded-md px-3 py-2 bg-amber-100 border-amber-200"/g,
    'className={DASHBOARD_FILTER_NATIVE_SELECT_CLASS}',
  );

  content = content.replace(
    /className="border rounded-md px-3 py-2 flex-1"/g,
    'className={`${DASHBOARD_FILTER_NATIVE_SELECT_CLASS} flex-1`}',
  );

  // Native text search inputs in filter bars
  content = content.replace(
    /className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-200"/g,
    'className={`w-full py-2 pl-10 pr-4 ${DASHBOARD_FILTER_NATIVE_SELECT_CLASS}`}',
  );

  // Search Input filters (pl-10 / pl-9 variants)
  const searchInputPatterns = [
    /className="pl-10 bg-white border-gray-200 rounded-md"/g,
    /className="pl-10 bg-white border-gray-200"/g,
    /className="pl-10 bg-white"/g,
    /className="pl-9 bg-white border-gray-200"/g,
  ];
  for (const pattern of searchInputPatterns) {
    content = content.replace(pattern, (match) => {
      const prefix = match.includes('pl-9') ? 'pl-9' : 'pl-10';
      const extra = match.includes('rounded-md') ? ' rounded-md' : '';
      return `className={\`${prefix} \${DASHBOARD_FILTER_INPUT_CLASS}${extra}\`}`;
    });
  }

  // Date Input filters
  content = content.replace(
    /className="bg-white w-full lg:w-40"/g,
    'className={`w-full lg:w-40 ${DASHBOARD_FILTER_INPUT_CLASS}`}',
  );
  content = content.replace(
    /<Input type="date" className="bg-white border-gray-200"/g,
    '<Input type="date" className={DASHBOARD_FILTER_INPUT_CLASS}',
  );

  // Dashboard search bar with extra classes
  content = content.replace(
    /className="pl-10 bg-white border-gray-200 rounded-md text-xs sm:text-base"/g,
    'className={`pl-10 ${DASHBOARD_FILTER_INPUT_CLASS} rounded-md text-xs sm:text-base`}',
  );

  // Remove local SELECT_TRIGGER_CLASS constant
  content = content.replace(/const SELECT_TRIGGER_CLASS =\s*\n\s*"[^"]+";\s*\n/g, '');

  // ArticleDateRangeFilter date inputs
  if (filePath.includes('ArticleDateRangeFilter')) {
    content = content.replace(
      /className="w-40 bg-white border-gray-200"/g,
      'className={`w-40 ${DASHBOARD_FILTER_INPUT_CLASS}`}',
    );
  }

  if (content !== orig) {
    if (
      content.includes('DASHBOARD_FILTER_SELECT_CLASS') ||
      content.includes('DASHBOARD_FILTER_NATIVE_SELECT_CLASS') ||
      content.includes('DASHBOARD_FILTER_INPUT_CLASS')
    ) {
      content = ensureImport(content);
    }
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

// Fix transitaires build error: strip duplicate content before first "use client"
const transPath = path.join(DASH_ROOT, 'utilisateurs', 'transitaires', 'page.tsx');
if (fs.existsSync(transPath)) {
  let trans = fs.readFileSync(transPath, 'utf8');
  const firstUseClient = trans.indexOf('"use client"');
  const secondUseClient = trans.indexOf('"use client"', firstUseClient + 1);
  if (secondUseClient > 0) {
    trans = trans.slice(firstUseClient);
    fs.writeFileSync(transPath, trans);
    console.log('Fixed transitaires page duplicate "use client"');
  }
}

const files = walk(DASH_ROOT);
let count = 0;
for (const f of files) {
  if (processFile(f)) {
    count += 1;
    console.log('Updated', path.relative(DASH_ROOT, f));
  }
}
console.log('Total updated:', count);
