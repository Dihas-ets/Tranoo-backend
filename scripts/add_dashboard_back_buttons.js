const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'tranoo_landing');

/** [relative file, back href, label?] */
const PAGES = [
  // Accueil for section roots
  ['app/dashboard/utilisateurs/vendeurs/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/utilisateurs/acheteurs/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/utilisateurs/transitaires/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/utilisateurs/chauffeurs/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/utilisateurs/livreurs/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/utilisateurs/agents/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/utilisateurs/admin/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/articles/voitures/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/articles/pieces/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/tranoo/voitures/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/tranoo/pieces/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/annonces/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/verification/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/parrainage/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/paiements/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/messages/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/documents/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/notifications/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/parametres/page.tsx', '/dashboard', 'Accueil'],

  // Sub-pages → parent
  ['app/dashboard/utilisateurs/vendeurs/profil/[id]/page.tsx', '/dashboard/utilisateurs/vendeurs'],
  ['app/dashboard/utilisateurs/vendeurs/add_form/page.tsx', '/dashboard/utilisateurs/vendeurs'],
  ['app/dashboard/utilisateurs/acheteurs/add_form/page.tsx', '/dashboard/utilisateurs/acheteurs'],
  ['app/dashboard/utilisateurs/acheteurs/profil/page.tsx', '/dashboard/utilisateurs/acheteurs'],
  ['app/dashboard/utilisateurs/transitaires/profil/[id]/page.tsx', '/dashboard/utilisateurs/transitaires'],
  ['app/dashboard/utilisateurs/transitaires/profil/page.tsx', '/dashboard/utilisateurs/transitaires'],
  ['app/dashboard/utilisateurs/transitaires/add_form/page.tsx', '/dashboard/utilisateurs/transitaires'],
  ['app/dashboard/utilisateurs/transitaires/demandes/page.tsx', '/dashboard/utilisateurs/transitaires'],
  ['app/dashboard/utilisateurs/transitaires/historique-transits/page.tsx', '/dashboard/utilisateurs/transitaires'],
  ['app/dashboard/utilisateurs/livreurs/profil/[id]/page.tsx', '/dashboard/utilisateurs/livreurs'],
  ['app/dashboard/utilisateurs/livreurs/add_form/page.tsx', '/dashboard/utilisateurs/livreurs'],
  ['app/dashboard/utilisateurs/livreurs/demandes/page.tsx', '/dashboard/utilisateurs/livreurs'],
  ['app/dashboard/utilisateurs/chauffeurs/profil/[id]/page.tsx', '/dashboard/utilisateurs/chauffeurs'],
  ['app/dashboard/utilisateurs/chauffeurs/add_form/page.tsx', '/dashboard/utilisateurs/chauffeurs'],
  ['app/dashboard/utilisateurs/chauffeurs/demandes/[id]/page.tsx', '/dashboard/utilisateurs/chauffeurs'],
  ['app/dashboard/utilisateurs/agents/profil/[id]/page.tsx', '/dashboard/utilisateurs/agents'],
  ['app/dashboard/utilisateurs/admin/profil/[id]/page.tsx', '/dashboard/utilisateurs/admin'],
  ['app/dashboard/utilisateurs/admin/profil/page.tsx', '/dashboard/utilisateurs/admin'],
  ['app/dashboard/utilisateurs/admin/add_form/page.tsx', '/dashboard/utilisateurs/admin'],
  ['app/dashboard/utilisateurs/details/page.tsx', '/dashboard/utilisateurs/vendeurs'],

  ['app/dashboard/articles/voitures/details/[id]/page.tsx', '/dashboard/articles/voitures'],
  ['app/dashboard/articles/voitures/edit/[id]/page.tsx', '/dashboard/articles/voitures'],
  ['app/dashboard/articles/pieces/details/[id]/page.tsx', '/dashboard/articles/pieces'],
  ['app/dashboard/articles/pieces/edit/[id]/page.tsx', '/dashboard/articles/pieces'],
  ['app/dashboard/tranoo/voitures/edit/[id]/page.tsx', '/dashboard/tranoo/voitures'],
  ['app/dashboard/tranoo/pieces/details/[id]/page.tsx', '/dashboard/tranoo/pieces'],
  ['app/dashboard/tranoo/pieces/edit/[id]/page.tsx', '/dashboard/tranoo/pieces'],

  ['app/dashboard/annonces/[id]/details/page.tsx', '/dashboard/annonces'],
  ['app/dashboard/messages/compose/page.tsx', '/dashboard/messages'],
  ['app/dashboard/messages/history/page.tsx', '/dashboard/messages'],
  ['app/dashboard/messages/[id]/page.tsx', '/dashboard/messages'],
  ['app/dashboard/paiements-details/page.tsx', '/dashboard/paiements'],
  ['app/dashboard/profile/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/formulaire/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/shipment-tracking/page.tsx', '/dashboard', 'Accueil'],
  ['app/dashboard/commandes/page.tsx', '/dashboard', 'Accueil'],
];

const IMPORT =
  'import { DashboardBackButton } from "@/app/dashboard/components/DashboardBackButton";\n';

function injectBack(src, href, label) {
  if (src.includes('DashboardBackButton')) return src; // already has
  // Skip if page already has ArrowLeft navigation near top (manual pages)
  const early = src.slice(0, 2500);
  if (
    early.includes('ArrowLeft') &&
    (early.includes('router.back()') || early.includes('router.push'))
  ) {
    return src;
  }

  let out = src;
  if (!out.includes(IMPORT.trim())) {
    if (out.startsWith('"use client"') || out.startsWith("'use client'")) {
      out = out.replace(/['"]use client['"];?\r?\n/, (m) => `${m}\n${IMPORT}`);
    } else {
      out = IMPORT + out;
    }
  }

  const btn =
    label && label !== 'Retour'
      ? `<div className="mb-4"><DashboardBackButton href="${href}" label="${label}" /></div>\n`
      : `<div className="mb-4"><DashboardBackButton href="${href}" /></div>\n`;

  // Prefer after opening of main content container
  const patterns = [
    /(<div className="[^"]*(?:container|min-h-screen|p-4|p-6|space-y)[^"]*"[^>]*>\s*\n)/,
    /(return \(\s*\n\s*<div[^>]*>\s*\n)/,
    /(return \(\s*\n\s*<>\s*\n)/,
  ];

  let injected = false;
  for (const re of patterns) {
    if (re.test(out)) {
      out = out.replace(re, (m) => m + '      ' + btn);
      injected = true;
      break;
    }
  }
  if (!injected) {
    // fallback: before first <h1 or CardTitle
    if (out.includes('<h1')) {
      out = out.replace(/(\s*)(<h1[\s>])/, `\n$1${btn}$1$2`);
      injected = true;
    }
  }
  return injected ? out : src;
}

let ok = 0;
let skip = 0;
let miss = 0;
for (const [file, href, label] of PAGES) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) {
    console.log('missing', file);
    miss++;
    continue;
  }
  const before = fs.readFileSync(p, 'utf8');
  const after = injectBack(before, href, label);
  if (after !== before) {
    fs.writeFileSync(p, after);
    console.log('updated', file);
    ok++;
  } else {
    console.log('skip', file);
    skip++;
  }
}
console.log({ ok, skip, miss });
