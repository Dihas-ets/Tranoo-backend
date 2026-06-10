/**
 * Finalize Phase A i18n:
 * 1. Add AppLocalizations getter to State classes
 * 2. Replace remaining hardcoded French strings with l10n keys
 * Run: node scripts/finalize_l10n.js
 */
const fs = require('fs');
const path = require('path');

const roots = [
  path.join(__dirname, '..', 'tranoo', 'lib'),
  path.join(__dirname, '..', 'tranoo_pro', 'lib'),
];

/** @type {Array<[RegExp, string]>} */
const replacements = [
  [/Text\('Erreur détaillée: \$e'\)/g, 'Text(l10n.errorGeneric(e.toString()))'],
  [/Text\("Erreur détaillée: \$e"\)/g, 'Text(l10n.errorGeneric(e.toString()))'],
  [/const SnackBar\(content: Text\('Veuillez attendre la fin de l\\'upload\.'\)\)/g, 'SnackBar(content: Text(l10n.waitUploadFinish))'],
  [/SnackBar\(content: Text\('Veuillez attendre la fin de l\\'upload\.'\)\)/g, 'SnackBar(content: Text(l10n.waitUploadFinish))'],
  [/const SnackBar\(content: Text\('Modifications enregistrées\.'\)\)/g, 'SnackBar(content: Text(l10n.changesSaved))'],
  [/SnackBar\(content: Text\('Modifications enregistrées\.'\)\)/g, 'SnackBar(content: Text(l10n.changesSaved))'],
  [/Text\('Erreur sauvegarde: \$\{resp\.statusCode\}'\)/g, 'Text(l10n.saveErrorStatus(resp.statusCode.toString()))'],
  [/Text\('Erreur sauvegarde: \$e'\)/g, 'Text(l10n.saveErrorGeneric(e.toString()))'],
  [/Text\('Vidéo prête', style: TextStyle\(color: Colors\.white\)\)/g, 'Text(l10n.videoReady, style: TextStyle(color: Colors.white))'],
  [/Text\('Emplacement \$\{index \+ 1\}', style: const TextStyle\(color: Colors\.grey\)\)/g, 'Text(l10n.mediaSlot(index + 1), style: const TextStyle(color: Colors.grey))'],
  [/const Text\('Appuyer pour ajouter', style: TextStyle\(color: Colors\.grey, fontSize: 11\)\)/g, 'Text(l10n.tapToAddVideo, style: const TextStyle(color: Colors.grey, fontSize: 11))'],
  [/content: Text\('Maximum d\\'images atteint \(12 images\)'\)/g, 'content: Text(l10n.maxImages12)'],
  [/content: const Text\('Maximum d\\'images atteint \(10 images\)'\)/g, 'content: Text(l10n.maxImages10)'],
  [/content: Text\('Erreur caméra: \$\{e\.toString\(\)\}'\)/g, 'content: Text(l10n.cameraError(e.toString()))'],
  [/content: Text\('Erreur lors de la sélection: \$\{e\.toString\(\)\}'\)/g, 'content: Text(l10n.selectionError(e.toString()))'],
  [/content: Text\('Image ajoutée: \$\{image\.name\}'\)/g, 'content: Text(l10n.imageAdded(image.name))'],
  [/content: Text\('Erreur upload: \$\{e\.toString\(\)\}'\)/g, 'content: Text(l10n.uploadError(e.toString()))'],
  [/content: Text\('Image uploadée: \$\{image\.name\}'\)/g, 'content: Text(l10n.imageUploaded(image.name))'],
  [/SnackBar\(content: Text\('Erreur lors de la création de l\\'article\.'\)\)/g, 'SnackBar(content: Text(l10n.articleCreateError))'],
  [/content: Text\('Erreur réseau lors de la création de l\\'article: \$e'\)/g, 'content: Text(l10n.articleNetworkCreateError(e.toString()))'],
  [/SnackBar\(content: Text\('Erreur lors du chargement de l\\'article'\)\)/g, 'SnackBar(content: Text(l10n.articleLoadError))'],
  [/content: Text\('Erreur réseau lors du chargement de l\\'article'\)/g, 'content: Text(l10n.articleLoadNetworkError)'],
  [/SnackBar\(content: Text\('Erreur lors de l\\'upload des médias: \$e'\)\)/g, 'SnackBar(content: Text(l10n.mediaUploadError(e.toString()))'],
  [/SnackBar\(content: Text\('Erreur réseau ou serveur: \$e'\)\)/g, 'SnackBar(content: Text(l10n.errorNetwork(e.toString()))'],
  [/label: const Text\('Ajouter plusieurs images'\)/g, 'label: Text(l10n.addMultipleImages)'],
  [/label: const Text\('Utiliser ma position actuelle'\)/g, 'label: Text(l10n.saveCurrentPosition)'],
  [/label: const Text\('Choisir sur la carte'\)/g, 'label: Text(l10n.chooseOnMap)'],
  [/Text\('Recherche de l\\'adresse\.\.\.'\)/g, 'Text(l10n.searchingAddress)'],
  [/const SnackBar\(content: Text\('Aucune vidéo disponible'\)\)/g, 'SnackBar(content: Text(l10n.noVideoAvailable))'],
  [/content: Text\('Impossible d\\'ouvrir WhatsApp'\)/g, 'content: Text(l10n.cannotOpenWhatsApp)'],
  [/content: Text\('Impossible de passer un appel'\)/g, 'content: Text(l10n.cannotMakeCall)'],
  [/const Text\('En Consommation'\)/g, 'Text(l10n.inConsumption)'],
  [/const Text\('En Transit'\)/g, 'Text(l10n.inTransit)'],
  [/const Text\('Lieu', style: TextStyle\(fontWeight: FontWeight\.bold\)\)/g, 'Text(l10n.placeLabel, style: TextStyle(fontWeight: FontWeight.bold))'],
  [/content: Text\('Veuillez sélectionner un lieu\.'\)/g, 'content: Text(l10n.selectLocationPlease)'],
  [/const Text\('Payer les frais de vérification'\)/g, 'Text(l10n.payVerificationFees)'],
  [/child: const Text\('Payer les frais de vérification'\)/g, 'child: Text(l10n.payVerificationFees)'],
  [/SnackBar\(content: Text\('Erreur réseau ou serveur'\)\)/g, 'SnackBar(content: Text(l10n.networkOrServerError))'],
  [/Text\('\$disponibles véhicule\(s\) disponible\(s\)'\)/g, 'Text(l10n.vehiclesAvailableCount(disponibles))'],
  [/Text\('\$disponibles pièce\(s\) disponible\(s\)'\)/g, 'Text(l10n.partsAvailableCount(disponibles))'],
  [/child: const Text\("Vendez votre pièce"\)/g, 'child: Text(l10n.sellYourPart)'],
  [/Text\('Nom de la pièce: \$pieceName', style: TextStyle\(fontSize: 18\)\)/g, 'Text(l10n.partNameLabelShort(pieceName), style: TextStyle(fontSize: 18))'],
  [/label: const Text\('Espèces'\)/g, 'label: Text(l10n.cashOnDeliveryShort)'],
  [/const SnackBar\(content: Text\('Session expirée\. Reconnectez-vous\.'\)\)/g, 'SnackBar(content: Text(l10n.sessionExpiredReconnect))'],
  [/const SnackBar\(content: Text\('Profil mis à jour\.'\)\)/g, 'SnackBar(content: Text(l10n.profileUpdated))'],
  [/SnackBar\(content: Text\('Profil mis à jour\.'\)\)/g, 'SnackBar(content: Text(l10n.profileUpdated))'],
  [/const SnackBar\(content: Text\('Erreur lors de la mise à jour\.'\)\)/g, 'SnackBar(content: Text(l10n.saveProfileError))'],
  [/child: const Text\("Retour aux paramètres"\)/g, 'child: Text(l10n.backToSettings)'],
  [/content: Text\("Type de vendeur mis à jour avec succès !"\)/g, 'content: Text(l10n.sellerTypeUpdatedSuccess)'],
  [/content: Text\("Erreur lors de la mise à jour: \$\{e\.toString\(\)\}"\)/g, 'content: Text(l10n.updateError(e.toString()))'],
  [/content: Text\('Paiement réussi : abonnement activé avec succès\.'\)/g, 'content: Text(l10n.subscriptionPaymentSuccess)'],
  [/content: Text\('Échec du paiement ou de l\\'activation\.'\)/g, 'content: Text(l10n.subscriptionPaymentFailed)'],
  [/content: Text\('Livraison acceptée avec succès !'\)/g, 'content: Text(l10n.deliveryAcceptedSuccess)'],
  [/const SnackBar\(content: Text\('Colis livré'\)\)/g, 'SnackBar(content: Text(l10n.packageDelivered))'],
  [/const SnackBar\(content: Text\('Arrivée notifiée à l\\'acheteur'\)\)/g, 'SnackBar(content: Text(l10n.arrivalNotified))'],
  [/SnackBar\(content: Text\('Erreur arrivée: \$\{res\.statusCode\}'\)\)/g, 'SnackBar(content: Text(l10n.arrivalError(res.statusCode.toString())))'],
  [/SnackBar\(content: Text\('Erreur arrivée: \$e'\)\)/g, 'SnackBar(content: Text(l10n.arrivalError(e.toString())))'],
  [/label: const Text\('Géolocaliser fournisseur'\)/g, 'label: Text(l10n.geolocateSupplier)'],
  [/label: const Text\('Géolocaliser Acheteur'\)/g, 'label: Text(l10n.geolocateBuyer)'],
  [/child: const Text\('Terminé', style: TextStyle\(fontWeight: FontWeight\.w800\)\)/g, 'child: Text(l10n.finishedLabel, style: TextStyle(fontWeight: FontWeight.w800))'],
  [/content: Text\('Demande acceptée\. Vous pouvez maintenant échanger\.'\)/g, 'content: Text(l10n.tricycleRequestAcceptedChat)'],
  [/content: Text\('Demande rejetée\.'\)/g, 'content: Text(l10n.tricycleRequestRejected)'],
  [/title: 'Vous devez vous connecter pour continuer\.'/g, 'title: l10n.tricycleLoginRequiredTitle'],
  [/subtitle: 'Connectez-vous pour pouvoir commander un tricycle\.'/g, 'subtitle: l10n.tricycleLoginRequiredSubtitle'],
  [/title: 'Demande envoyée au chauffeur\.'/g, 'title: l10n.tricycleRequestSentToDriver'],
  [/title: 'Une erreur est survenue\.'/g, 'title: l10n.errorOccurredTitle'],
  [/subtitle: 'Vérifiez votre connexion internet puis réessayez\.'/g, 'subtitle: l10n.checkConnectionRetry'],
  [/title: 'Votre demande a été annulée\.'/g, 'title: l10n.tricycleRequestCancelled'],
  [/title: 'La demande ne peut plus être annulée\.'/g, 'title: l10n.tricycleCannotCancel'],
  [/subtitle: 'Le chauffeur a déjà accepté la demande\.'/g, 'subtitle: l10n.tricycleDriverAlreadyAccepted'],
  [/title: "Impossible d'annuler la demande\."/g, 'title: l10n.tricycleCancelFailed'],
  [/subtitle: 'Code: \$\{res\.statusCode\}\. Veuillez réessayer\.'/g, 'subtitle: l10n.tricycleCancelErrorCode(res.statusCode.toString())'],
  [/title: 'Erreur lors de l’annulation\.'/g, 'title: l10n.tricycleCancelError'],
  [/subtitle: 'Vérifiez votre connexion puis réessayez\.'/g, 'subtitle: l10n.checkConnectionAndRetry'],
  [/buttonText: 'Réessayer'/g, 'buttonText: l10n.retry'],
  [/buttonText: 'OK'/g, 'buttonText: l10n.ok'],
  [/title: "Mon compte"/g, 'title: l10n.myAccount'],
  [/subtitle: "Apporter des modifications à votre compte"/g, 'subtitle: l10n.editAccountSubtitle'],
  [/title: "Vendre ma voiture"/g, 'title: l10n.sellMyCar'],
  [/title: "Vendre ma pièce"/g, 'title: l10n.sellMyPart'],
  [/subtitle: "Devenir titulaire et vendez avec nous"/g, 'subtitle: l10n.becomeSellerSubtitle'],
  [/title: "Suppression de compte"/g, 'title: l10n.accountDeletion'],
  [/title: "Déconnexion"/g, 'title: l10n.logout'],
  [/title: "Historique des transits"/g, 'title: l10n.transitHistory'],
  [/"Notifications"/g, 'l10n.notifications'],
  [/"Devise"/g, 'l10n.currency'],
  [/const Center\(child: Text\('Page non disponible pour ce rôle'\)\)/g, 'Center(child: Text(l10n.pageNotAvailableForRole))'],
  [/content: Text\('Format non supporté: \$extension\. Formats: \$\{allowedFormats\.join\(', '\)\}'\)/g, 'content: Text(l10n.formatNotSupportedExt(extension, allowedFormats.join(\', \')))'],
  [/content: Text\('Erreur lors de l\\'upload de la vidéo\. Veuillez réessayer\.'\)/g, 'content: Text(l10n.videoUploadErrorRetry)'],
  [/Text\(\s*'Vous pouvez sélectionner au maximum \$_maxMediaSlots médias\.'\s*,\s*\)/g, 'Text(l10n.maxMediaSlots(_maxMediaSlots))'],
  [/Text\("Informations personnelles"\)/g, 'Text(l10n.personalInfo)'],
  [/Text\("Sécurité"\)/g, 'Text(l10n.security)'],
  [/title: "Informations personnelles"/g, 'title: l10n.personalInfo'],
  [/title: "Sécurité"/g, 'title: l10n.security'],
];

const GETTER = '\n  AppLocalizations get l10n => AppLocalizations.of(context)!;\n';

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.dart') && !entry.name.includes('_old') && !entry.name.includes('_backup')) files.push(full);
  }
  return files;
}

let changed = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    let content = fs.readFileSync(file, 'utf8');
    if (!content.includes('app_localizations.dart')) continue;
    const original = content;

    // Add l10n getter to State classes
    content = content.replace(
      /(class\s+_\w+State\s+extends\s+State<[^>]+>\s*\{)/g,
      (match, p1) => {
        const slice = content.slice(content.indexOf(match), content.indexOf(match) + 400);
        if (slice.includes('AppLocalizations get l10n')) return match;
        return p1 + GETTER;
      },
    );

    for (const [pattern, replacement] of replacements) {
      content = content.replace(pattern, replacement);
    }

    // Remove invalid const SnackBar with l10n
    content = content.replace(/const SnackBar\(\s*content: Text\(l10n\./g, 'SnackBar(content: Text(l10n.');

    if (content !== original) {
      fs.writeFileSync(file, content);
      changed++;
      console.log('Updated:', path.relative(path.join(__dirname, '..'), file));
    }
  }
}
console.log(`\nDone. ${changed} files updated.`);
