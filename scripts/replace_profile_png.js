const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'tranoo_landing');
const files = [
  'app/dashboard/utilisateurs/acheteurs/page.tsx',
  'app/dashboard/utilisateurs/chauffeurs/page.tsx',
  'app/dashboard/utilisateurs/vendeurs/page.tsx',
  'app/dashboard/utilisateurs/admin/page.tsx',
  'app/dashboard/utilisateurs/agents/page.tsx',
  'app/dashboard/utilisateurs/livreurs/page.tsx',
  'app/dashboard/utilisateurs/transitaires/page.tsx',
  'app/dashboard/utilisateurs/transitaires/TransitaireVerificationDemandesSection.tsx',
  'app/dashboard/utilisateurs/transitaires/demandes/[id]/page.tsx',
  'app/dashboard/utilisateurs/agents/profil/[id]/page.tsx',
  'app/agent/page.tsx',
];

const IMPORT_LINE =
  'import { UserPhotoThumb } from "@/app/dashboard/components/ProfileMedia";\n';

for (const f of files) {
  const p = path.join(root, f);
  let s = fs.readFileSync(p, 'utf8');
  const before = s;

  // Multi-line Image inside rounded div with profile.png fallback
  s = s.replace(
    /<div className="w-\d+ h-\d+ rounded-full[^"]*"[^>]*>\s*<Image[\s\S]*?\/images\/dashboard\/profile\.png[\s\S]*?\/>\s*<\/div>/g,
    (block) => {
      const m = block.match(/src=\{\s*([\w.?]+)\s*\|\|/);
      const photoExpr = m ? m[1].trim() : 'undefined';
      return `<UserPhotoThumb photoUrl={${photoExpr}} size={32} />`;
    },
  );

  // Single-line / compact Image
  s = s.replace(
    /<Image\s+src=\{\s*([\w.]+)\.photo\s*\|\|\s*["']\/images\/dashboard\/profile\.png["']\s*\}[^>]*\/>/g,
    (_full, obj) => `<UserPhotoThumb photoUrl={${obj}.photo} size={32} />`,
  );

  // agent page single quotes
  s = s.replace(
    /src=\{agent\?\.photo \|\| '\/images\/dashboard\/profile\.png'\}/g,
    'src={agent?.photo || ""}',
  );

  // agents profil
  s = s.replace(
    /const src = photo \|\| "\/images\/dashboard\/profile\.png";/g,
    'const src = photo || "";',
  );
  s = s.replace(
    /src=\{photo \|\| "\/images\/dashboard\/profile\.png"\}/g,
    'src={photo || ""}',
  );

  // livreurs multiline photo ||
  s = s.replace(
    /src=\{\s*livreur\.photo\s*\|\|\s*"\/images\/dashboard\/profile\.png"\s*\}/g,
    '/*replaced*/',
  );

  if (s.includes('/*replaced*/')) {
    s = s.replace(
      /<div className="w-8 h-8 rounded-full[^"]*"[^>]*>\s*<Image[\s\S]*?\/\*replaced\*\/[\s\S]*?\/>\s*<\/div>/g,
      '<UserPhotoThumb photoUrl={livreur.photo} size={32} />',
    );
  }

  if (s !== before) {
    if (s.includes('UserPhotoThumb') && !s.includes(IMPORT_LINE.trim())) {
      if (s.startsWith('"use client"')) {
        s = s.replace(/"use client";?\r?\n/, (m) => `${m}\n${IMPORT_LINE}`);
      } else {
        s = IMPORT_LINE + s;
      }
    }
    if (!/<Image[\s>]/.test(s) && !s.includes('<Image')) {
      s = s.replace(/import Image from "next\/image";\r?\n/g, '');
    }
    fs.writeFileSync(p, s);
    console.log('updated', f);
  } else {
    console.log('no change', f);
  }
}
