# Tracking des demos Tranoo_pro

Ce document décrit la logique de comptage des demonstrations pour les agents commerciaux Tranoo_pro.

## Objectif

- Mesurer les demos reelles effectuees par un agent dans la journee.
- Eviter les fraudes (spam de clics / refresh / deconnexion-reconnexion artificielle).
- Aligner le KPI avec l'objectif metier: **20 demos / jour**.

## Evenements preuves utilises

Les actions suivantes sont trackees depuis le mobile:

- `seller_create_started` (bouton **Apercu** dans `create_sell.dart`)
- `seller_create_started` + `seller_create_completed` (bouton **Apercu** dans `create_sell2.dart`)
- `subscription_initiated` (bouton **Souscrire maintenant** dans `subscription_payment.dart`)
- `campaign_initiated` (bouton **Boostez vos ventes** dans `cars_info.dart`)
- `listing_opened_une` + `campaign_initiated` (ouverture + bouton **Payer** dans `une.dart`)

Les evenements sont stockes dans la collection `DemoEvent` via:

- `POST /api/demo-events/track`

## Regle de validation d'une demo

Une demo est comptee si:

1. un `seller_create_started` est present (debut du cycle), puis
2. dans une fenetre de `DEMO_WINDOW_MINUTES` (defaut 30 min), il existe au moins une action commerciale:
   - `campaign_initiated` ou `subscription_initiated`

`seller_create_completed` est conserve comme signal qualite, mais n'est pas bloquant.

## Anti-spam / anti-fraude

- dedup des events au tracking: `DEMO_EVENT_DEDUP_MS` (defaut 30s)
- cooldown entre 2 demos comptees: `DEMO_COOLDOWN_MINUTES` (defaut 15 min)

Ainsi, rester connecte n'empeche pas de compter plusieurs demos, mais un spam rapide ne gonfle pas artificiellement le score.

## Variables d'environnement

- `DEMO_WINDOW_MINUTES` (defaut `30`)
- `DEMO_COOLDOWN_MINUTES` (defaut `15`)
- `DEMO_EVENT_DEDUP_MS` (defaut `30000`)

## Ou le KPI est calcule

Le KPI `demonstrations` est calcule dans:

- `src/controllers/agentController.js`
  - fonction `computeValidatedDemosForRange(...)`
  - utilisee par `computeKpisForRange(...)`

Le comptage est effectue sur les events de la periode demandee (jour filtre), avec fallback sur les vendeurs rattaches a l'agent.

## Verification rapide en test

1. Ouvrir `create_sell.dart` ou `create_sell2.dart`
2. Cliquer **Apercu**
3. Realiser une action commerciale (`campaign_initiated` ou `subscription_initiated`)
4. Recharger le dashboard agent-pro (date du jour)
5. Verifier la valeur de `demonstrations`

## Notes importantes

- Un simple refresh de token Firebase (`getIdToken`) ne doit pas compter comme nouvelle demo.
- Le comptage repose sur les actions metier (preuves), pas sur la deconnexion.
- Le KPI journalier peut depasser 1 meme sans deconnexion, si des cycles preuves distincts sont completes.

