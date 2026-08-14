const fs = require("fs");
const file =
  "C:/FlutterProjects/tranoo-api/tranoo_landing/app/dashboard/verification/page.tsx";
let s = fs.readFileSync(file, "utf8");

const reps = [
  ["vÃ©rifiÃ©", "vérifié"],
  ["VÃ©rifiÃ©", "Vérifié"],
  ["AcceptÃ©", "Accepté"],
  ["RefusÃ©", "Refusé"],
  ["trouvÃ©e", "trouvée"],
  ["rÃ©sultat", "résultat"],
  ["RÃ©essayer", "Réessayer"],
  ["DÃ©tails", "Détails"],
  ["marquÃ©", "marqué"],
  ["rÃ©ussi", "réussi"],
  ["donnÃ©es", "données"],
  ["Ã  jour", "à jour"],
  ["vendeurâ€¦", "vendeur…"],
  ["â€”", "—"],
  ["â€¦", "…"],
  ["Â·", "·"],
];

for (const [from, to] of reps) {
  s = s.split(from).join(to);
}

// Section comment lines (corrupted box-drawing)
s = s.replace(/\/\/ [^\n]*â[^\n]*/g, (line) =>
  line.replace(/â[^\s]*/g, "").replace(/\/\/\s*$/, "//").trimEnd(),
);

fs.writeFileSync(file, s, "utf8");
console.log("Fixed verification page strings");
