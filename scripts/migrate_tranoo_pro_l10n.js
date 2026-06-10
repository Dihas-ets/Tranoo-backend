/**
 * Bulk-migrates tranoo_pro UI strings to AppLocalizations.
 * Run: node scripts/migrate_tranoo_pro_l10n.js
 */
const fs = require('fs');
const path = require('path');

const catalogSrc = fs.readFileSync(path.join(__dirname, 'generate_l10n_arb.js'), 'utf8');
const catalogBody = catalogSrc.match(/const catalog = \{([\s\S]*?)\};/)[1];
const frToKey = new Map();
for (const m of catalogBody.matchAll(/(\w+):\s*\{[^}]*fr:\s*'((?:\\'|[^'])*)'/g)) {
  frToKey.set(m[2].replace(/\\'/g, "'"), m[1]);
}

const importLine = "import 'package:tranoo_pro/l10n/app_localizations.dart';";
const l10nDecl = 'final l10n = AppLocalizations.of(context)!;';

function walk(d, a = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, a);
    else if (p.endsWith('.dart') && !/_old|_backup/.test(p)) a.push(p);
  }
  return a;
}

const roots = [
  path.join(__dirname, '..', 'tranoo_pro', 'lib', 'data', 'screens'),
  path.join(__dirname, '..', 'tranoo_pro', 'lib', 'widgets'),
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function migrateFile(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  if (filePath.includes('languesentreprise.dart')) return false;
  if (filePath.includes('locale_helper.dart')) return false;
  if (filePath.includes('locale_provider.dart')) return false;

  let changed = false;

  if (!src.includes('app_localizations.dart') && !src.includes('package:flutter/')) {
    return false;
  }

  if (!src.includes('app_localizations.dart')) {
    const lines = src.split('\n');
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) insertAt = i + 1;
      else if (insertAt > 0 && !lines[i].startsWith('import ')) break;
    }
    lines.splice(insertAt, 0, importLine);
    src = lines.join('\n');
    changed = true;
  }

  // Sort by length desc to replace longer strings first
  const entries = [...frToKey.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [fr, key] of entries) {
    const patterns = [
      new RegExp(`const Text\\(\\s*'${escapeRe(fr)}'`, 'g'),
      new RegExp(`const Text\\(\\s*"${escapeRe(fr)}"`, 'g'),
      new RegExp(`Text\\(\\s*'${escapeRe(fr)}'`, 'g'),
      new RegExp(`Text\\(\\s*"${escapeRe(fr)}"`, 'g'),
      new RegExp(`title:\\s*const Text\\(\\s*'${escapeRe(fr)}'`, 'g'),
      new RegExp(`title:\\s*Text\\(\\s*'${escapeRe(fr)}'`, 'g'),
      new RegExp(`subtitle:\\s*const Text\\(\\s*'${escapeRe(fr)}'`, 'g'),
      new RegExp(`subtitle:\\s*Text\\(\\s*'${escapeRe(fr)}'`, 'g'),
      new RegExp(`labelText:\\s*'${escapeRe(fr)}'`, 'g'),
      new RegExp(`labelText:\\s*"${escapeRe(fr)}"`, 'g'),
      new RegExp(`hintText:\\s*'${escapeRe(fr)}'`, 'g'),
      new RegExp(`hintText:\\s*"${escapeRe(fr)}"`, 'g'),
      new RegExp(`buttonText:\\s*'${escapeRe(fr)}'`, 'g'),
      new RegExp(`child:\\s*const Text\\(\\s*'${escapeRe(fr)}'`, 'g'),
      new RegExp(`child:\\s*Text\\(\\s*'${escapeRe(fr)}'`, 'g'),
    ];
    const repls = [
      `Text(l10n.${key}`,
      `Text(l10n.${key}`,
      `Text(l10n.${key}`,
      `Text(l10n.${key}`,
      `title: Text(l10n.${key}`,
      `title: Text(l10n.${key}`,
      `subtitle: Text(l10n.${key}`,
      `subtitle: Text(l10n.${key}`,
      `labelText: l10n.${key}`,
      `labelText: l10n.${key}`,
      `hintText: l10n.${key}`,
      `hintText: l10n.${key}`,
      `buttonText: l10n.${key}`,
      `child: Text(l10n.${key}`,
      `child: Text(l10n.${key}`,
    ];
    for (let i = 0; i < patterns.length; i++) {
      if (patterns[i].test(src)) {
        src = src.replace(patterns[i], repls[i]);
        changed = true;
      }
    }
  }

  if (src.includes('l10n.') && !src.includes(l10nDecl)) {
    // Inject l10n in Widget build(BuildContext context) methods
    src = src.replace(
      /Widget build\(BuildContext context\)\s*\{/g,
      (match) => `${match}\n    ${l10nDecl}`,
    );
    // StatefulBuilder / dialog builders
    src = src.replace(
      /builder:\s*\(([^)]*context[^)]*)\)\s*=>\s*\{/g,
      (match, params) => {
        if (match.includes(l10nDecl)) return match;
        return `builder: (${params}) {\n        ${l10nDecl}`;
      },
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, src);
  }
  return changed;
}

let count = 0;
for (const root of roots) {
  for (const f of walk(root)) {
    if (migrateFile(f)) {
      count++;
      console.log('Migrated:', path.relative(path.join(__dirname, '..'), f));
    }
  }
}
console.log(`Done. ${count} files updated.`);
