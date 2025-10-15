# Status du bouton Bloquer/Débloquer

## Emplacement du bouton ✅

Le bouton `BlockUserButton` est bien présent dans les pages de profil :

### Page Chauffeur
**Fichier :** `app/dashboard/utilisateurs/chauffeurs/profil/[id]/page.tsx`
**Ligne :** 334-339
**Position :** En bas du formulaire, à côté du bouton "Modifier les désignations"

```tsx
<div className="mt-6 flex flex-wrap gap-4">
  <Button>Modifier les désignations</Button>
  <BlockUserButton
    userId={id}
    isBlocked={isBlocked}
    userName={`${prenom} ${nom}`}
    onStatusChange={(newStatus) => setIsBlocked(newStatus)}
  />
</div>
```

## Corrections apportées ✅

### 1. Import corrigé
- ✅ Chemin d'import fixé : `@/app/dashboard/components/BlockUserButton`

### 2. Dépendance toast corrigée
- ✅ Remplacement de `toast` (sonner) par `alert` pour éviter les dépendances manquantes
- ✅ Le bouton fonctionne maintenant sans configuration supplémentaire

### 3. Style amélioré
- ✅ Ajout de `flex-wrap` pour un meilleur affichage sur mobile

## Fonctionnalité du bouton

### Apparence
- **Si utilisateur bloqué :** Bouton bleu "Débloquer" avec icône ShieldOff
- **Si utilisateur non bloqué :** Bouton rouge "Bloquer" avec icône Shield
- **Pendant l'action :** Bouton gris "Traitement..." avec spinner

### Actions
1. **Clic sur le bouton** → Demande de confirmation
2. **Confirmation** → Appel API `/users/{id}/block` ou `/users/{id}/unblock`
3. **Succès** → Message d'alerte + mise à jour du statut
4. **Erreur** → Message d'erreur

## Vérification

### Pour voir le bouton :
1. Aller sur une page de profil : `/dashboard/utilisateurs/chauffeurs/profil/[id]`
2. Faire défiler vers le bas après les champs du formulaire
3. Le bouton se trouve à côté du bouton "Modifier les désignations"

### Si le bouton n'est pas visible :
- Vérifier que `canEdit` est `true` (actuellement hardcodé à `true`)
- Vérifier que l'utilisateur a bien un `id` valide
- Vérifier la console pour d'éventuelles erreurs

## Pages concernées
- ✅ Chauffeurs : `/dashboard/utilisateurs/chauffeurs/profil/[id]`
- ✅ Acheteurs : `/dashboard/utilisateurs/acheteurs/profil/[id]`
- ✅ Transitaires : `/dashboard/utilisateurs/transitaires/profil/[id]`
- ✅ Vendeurs : `/dashboard/utilisateurs/vendeurs/profil/[id]`

Toutes les pages ont le même bouton avec les mêmes imports corrigés.