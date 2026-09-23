const mongoose = require('mongoose');
const Layaway = require('../../models/Layaway');
const { transition } = require('./LayawayStateMachine');

function contractError(message, code, status = 400, meta) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (meta) err.meta = meta;
  return err;
}

async function loadDossier(layawayId) {
  if (!mongoose.isValidObjectId(layawayId)) {
    throw contractError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  const layaway = await Layaway.findById(layawayId);
  if (!layaway) {
    throw contractError('Dossier introuvable', 'LAYAWAY_NOT_FOUND', 404);
  }
  return layaway;
}

function assertBuyerOwns(layaway, buyerId) {
  if (String(layaway.buyerId) !== String(buyerId)) {
    throw contractError('Accès refusé', 'LAYAWAY_FORBIDDEN', 403);
  }
}

function serializeContract(layaway) {
  const c = layaway.contract || {};
  return {
    status: c.status || 'NONE',
    documentUrl: c.documentUrl || null,
    signedDocumentUrl: c.signedDocumentUrl || null,
    signerFirstName: c.signerFirstName || null,
    signerLastName: c.signerLastName || null,
    hasSignature: Boolean(c.signatureData),
    // Ne pas renvoyer signatureData complète en liste ; OK en détail signé
    signatureData: c.signatureData || null,
    signedAt: c.signedAt || null,
    signedByUserId: c.signedByUserId || null,
  };
}

/**
 * Consultation contrat — acheteur propriétaire ou admin.
 */
async function getContract(layawayId, { buyerId, isAdmin }) {
  const layaway = await loadDossier(layawayId);
  if (!isAdmin) {
    assertBuyerOwns(layaway, buyerId);
  }
  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    contract: serializeContract(layaway),
  };
}

/**
 * Admin associe / remplace le document contrat (PDF URL).
 * Autorisé tant que le contrat n'est pas signé.
 */
async function attachDocument(layawayId, documentUrl) {
  const url = String(documentUrl || '').trim();
  if (!url) {
    throw contractError('documentUrl requis', 'LAYAWAY_CONTRACT_DOCUMENT_REQUIRED');
  }

  const layaway = await loadDossier(layawayId);
  if (layaway.contract?.status === 'SIGNED' || layaway.status === 'CONTRAT_SIGNE') {
    throw contractError(
      'Contrat déjà signé : document non modifiable',
      'LAYAWAY_CONTRACT_ALREADY_SIGNED',
      409,
    );
  }
  if (!['BROUILLON', 'CONTRAT_EN_ATTENTE'].includes(layaway.status)) {
    throw contractError(
      'Association du contrat impossible dans cet état',
      'LAYAWAY_CONTRACT_ATTACH_FORBIDDEN',
      409,
      { status: layaway.status },
    );
  }

  layaway.contract = layaway.contract || {};
  layaway.contract.documentUrl = url;
  if (!layaway.contract.status || layaway.contract.status === 'NONE') {
    layaway.contract.status = 'PENDING';
  }
  await layaway.save();

  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    contract: serializeContract(layaway),
  };
}

/**
 * Signature acheteur.
 * Exige signatureData + identité. Ne passe pas à SIGNED sans signature.
 * Transition dossier : CONTRAT_EN_ATTENTE → CONTRAT_SIGNE
 */
async function signContract(layawayId, {
  buyerId,
  firstName,
  lastName,
  signatureData,
  signedDocumentUrl,
  ip,
  userAgent,
}) {
  const layaway = await loadDossier(layawayId);
  assertBuyerOwns(layaway, buyerId);

  if (layaway.status !== 'CONTRAT_EN_ATTENTE') {
    throw contractError(
      'Le contrat ne peut être signé que lorsque le dossier est CONTRAT_EN_ATTENTE',
      'LAYAWAY_CONTRACT_SIGN_FORBIDDEN',
      409,
      { status: layaway.status },
    );
  }

  if (layaway.contract?.status === 'SIGNED') {
    throw contractError(
      'Contrat déjà signé',
      'LAYAWAY_CONTRACT_ALREADY_SIGNED',
      409,
    );
  }

  if (!layaway.contract?.documentUrl) {
    throw contractError(
      'Aucun document contrat associé au dossier',
      'LAYAWAY_CONTRACT_DOCUMENT_MISSING',
      409,
    );
  }

  const prenom = String(firstName || '').trim();
  const nom = String(lastName || '').trim();
  const signature = String(signatureData || '').trim();

  if (!prenom || !nom) {
    throw contractError(
      'Nom et prénom du signataire requis',
      'LAYAWAY_CONTRACT_SIGNER_REQUIRED',
    );
  }
  if (!signature) {
    throw contractError(
      'Signature requise : le contrat ne peut pas être considéré comme signé sans signature',
      'LAYAWAY_CONTRACT_SIGNATURE_REQUIRED',
    );
  }
  if (signature.length < 20) {
    throw contractError(
      'Données de signature invalides',
      'LAYAWAY_CONTRACT_SIGNATURE_INVALID',
    );
  }

  // Transition d'abord (refuse si illégale)
  transition(layaway.status, 'CONTRAT_SIGNE');

  layaway.contract.status = 'SIGNED';
  layaway.contract.signerFirstName = prenom;
  layaway.contract.signerLastName = nom;
  layaway.contract.signatureData = signature;
  layaway.contract.signedDocumentUrl = signedDocumentUrl
    ? String(signedDocumentUrl).trim()
    : layaway.contract.documentUrl;
  layaway.contract.signedAt = new Date();
  layaway.contract.signedByUserId = buyerId;
  layaway.contract.signedIp = ip || null;
  layaway.contract.signedUserAgent = userAgent || null;
  layaway.status = 'CONTRAT_SIGNE';

  await layaway.save();

  return {
    layawayId: layaway._id,
    dossierStatus: layaway.status,
    contract: serializeContract(layaway),
  };
}

module.exports = {
  getContract,
  attachDocument,
  signContract,
  serializeContract,
};
