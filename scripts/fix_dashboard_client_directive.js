const fs = require('fs');
const path = require('path');

const files = [
  'tranoo_landing/app/dashboard/publicites/create/page.tsx',
  'tranoo_landing/app/dashboard/documents/page.tsx',
  'tranoo_landing/app/dashboard/components/ArticleDateRangeFilter.tsx',
];

for (const rel of files) {
  const filePath = path.join(__dirname, '..', rel);
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('"use client"')) continue;
  const lines = content.split('\n');
  const useClientIdx = lines.findIndex((l) => l.trim() === '"use client";' || l.trim() === '"use client"');
  if (useClientIdx <= 0) continue;
  const before = lines.slice(0, useClientIdx).filter((l) => l.trim());
  const after = lines.slice(useClientIdx);
  if (before.length === 0) continue;
  content = [...after.slice(0, 1), '', ...before, ...after.slice(1)].join('\n');
  fs.writeFileSync(filePath, content);
  console.log('Fixed directive order:', rel);
}

// Clean transitaires page — remove commented duplicate block
const transPath = path.join(
  __dirname,
  '..',
  'tranoo_landing/app/dashboard/utilisateurs/transitaires/page.tsx',
);
const transLines = fs.readFileSync(transPath, 'utf8').split(/\r?\n/);
const cardImportIdx = transLines.findIndex((l, i) => i > 10 && l.startsWith('import { Card }'));
if (cardImportIdx > 0) {
  const header = [
    '"use client"',
    '',
    "import { DASHBOARD_FILTER_SELECT_CLASS, DASHBOARD_FILTER_NATIVE_SELECT_CLASS } from '@/app/dashboard/components/DashboardFilterSelect';",
    'import { DashboardBackButton } from "@/app/dashboard/components/DashboardBackButton";',
    'import { UserPhotoThumb } from "@/app/dashboard/components/ProfileMedia";',
    '',
  ];
  const body = transLines.slice(cardImportIdx - 1); // include Button import line before Card
  // body starts with Button import - find it
  const btnIdx = transLines.findIndex((l, i) => i > 10 && l.startsWith('import { Button }'));
  const cleanBody = transLines.slice(btnIdx).join('\n');
  fs.writeFileSync(transPath, header.join('\n') + cleanBody);
  console.log('Cleaned transitaires page from line', btnIdx + 1);
}
