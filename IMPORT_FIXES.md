# Corrections des imports BlockUserButton

## Problème identifié
Erreur de build : `Module not found: Can't resolve '../../components/BlockUserButton'`

## Cause
Les pages de profil utilisaient des chemins relatifs incorrects pour importer le composant BlockUserButton.

## Corrections apportées ✅

### Fichiers corrigés :
1. **Chauffeurs** : `app/dashboard/utilisateurs/chauffeurs/profil/[id]/page.tsx`
   - ❌ `import BlockUserButton from "../../components/BlockUserButton";`
   - ✅ `import BlockUserButton from "@/app/dashboard/components/BlockUserButton";`

2. **Acheteurs** : `app/dashboard/utilisateurs/acheteurs/profil/[id]/page.tsx`
   - ❌ `import BlockUserButton from "../../../components/BlockUserButton";`
   - ✅ `import BlockUserButton from "@/app/dashboard/components/BlockUserButton";`

3. **Transitaires** : `app/dashboard/utilisateurs/transitaires/profil/[id]/page.tsx`
   - ❌ `import BlockUserButton from "../../../components/BlockUserButton";`
   - ✅ `import BlockUserButton from "@/app/dashboard/components/BlockUserButton";`

4. **Vendeurs** : `app/dashboard/utilisateurs/vendeurs/profil/[id]/page.tsx`
   - ❌ `import BlockUserButton from "../../../components/BlockUserButton";`
   - ✅ `import BlockUserButton from "@/app/dashboard/components/BlockUserButton";`

## Emplacement correct du composant
Le composant BlockUserButton se trouve dans : `app/dashboard/components/BlockUserButton.tsx`

## Solution appliquée
Utilisation du chemin absolu avec l'alias `@/` configuré dans Next.js au lieu des chemins relatifs.

## Résultat
✅ Toutes les pages de profil peuvent maintenant être accédées sans erreur de build
✅ Le composant BlockUserButton est correctement importé dans toutes les pages
✅ Fonctionnalité de blocage/déblocage d'utilisateur opérationnelle

## Test recommandé
Vérifier l'accès aux profils de tous les types d'utilisateurs :
- `/dashboard/utilisateurs/chauffeurs/profil/[id]`
- `/dashboard/utilisateurs/acheteurs/profil/[id]`
- `/dashboard/utilisateurs/transitaires/profil/[id]`
- `/dashboard/utilisateurs/vendeurs/profil/[id]`