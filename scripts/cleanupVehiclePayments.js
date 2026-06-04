//  D abord
// npm run cleanup:vehicle-payments

// Dry run avec period
// npm run cleanup:vehicle-payments -- --from=2026-01-01 --to=2026-06-30

// Dry run test only
// npm run cleanup:vehicle-payments -- --test-only

// suppression reel
// npm run cleanup:vehicle-payments -- --apply

// suppression reel avec filtre 
// npm run cleanup:vehicle-payments -- --apply --from=2026-01-01 --to=2026-06-30 --test-only


// Le script affiche :

// nombre de candidats
// montant total impacté
// un échantillon (table) avant suppression.


require('dotenv').config();
const mongoose = require('mongoose');
const Payment = require('../src/models/Payment');
const Achat = require('../src/models/Achat');
const Article = require('../src/models/Article');

const uri =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  'mongodb://localhost:27017/tranoo';

function parseArgs(argv) {
  const args = {
    apply: false,
    from: null,
    to: null,
    testOnly: false,
    limit: 5000,
  };

  for (const token of argv) {
    if (token === '--apply') args.apply = true;
    else if (token === '--test-only') args.testOnly = true;
    else if (token.startsWith('--from=')) args.from = token.slice('--from='.length);
    else if (token.startsWith('--to=')) args.to = token.slice('--to='.length);
    else if (token.startsWith('--limit=')) args.limit = Number(token.slice('--limit='.length)) || 5000;
  }
  return args;
}

function buildBaseFilter(args) {
  const filter = {
    status: 'success',
    provider: 'feexpay',
    type: { $in: ['achat', 'vente'] },
  };
  if (args.from || args.to) {
    filter.createdAt = {};
    if (args.from) filter.createdAt.$gte = new Date(args.from);
    if (args.to) filter.createdAt.$lte = new Date(args.to);
  }
  return filter;
}

function looksLikeTestPayment(payment) {
  const text = `${payment.customId || ''} ${payment.transactionId || ''} ${payment.description || ''}`.toLowerCase();
  return text.includes('test') || text.includes('debug') || text.includes('sandbox') || text.includes('fake');
}

async function loadBrokenVehicleCandidates(args) {
  const base = buildBaseFilter(args);
  const payments = await Payment.find(base)
    .select('_id amount type customId transactionId description createdAt achat')
    .sort({ createdAt: -1 })
    .limit(args.limit)
    .lean();

  const achatIds = [...new Set(payments.map((p) => p.achat).filter(Boolean).map(String))];
  const achats = await Achat.find({ _id: { $in: achatIds } }).select('_id article').lean();
  const achatById = new Map(achats.map((a) => [String(a._id), a]));

  const articleIds = [...new Set(achats.map((a) => a.article).filter(Boolean).map(String))];
  const articles = await Article.find({ _id: { $in: articleIds } }).select('_id type').lean();
  const articleTypeById = new Map(articles.map((a) => [String(a._id), a.type]));

  const broken = [];
  for (const p of payments) {
    const achat = p.achat ? achatById.get(String(p.achat)) : null;
    const articleType = achat?.article ? articleTypeById.get(String(achat.article)) : null;

    // C'est précisément le cas polluant: achat/vente sans vrai article lié, classé voiture par défaut.
    const isBroken = !['voiture', 'piece'].includes(articleType);
    if (!isBroken) continue;
    if (args.testOnly && !looksLikeTestPayment(p)) continue;

    broken.push({
      _id: p._id,
      amount: Number(p.amount) || 0,
      type: p.type,
      customId: p.customId || null,
      transactionId: p.transactionId || null,
      description: p.description || null,
      createdAt: p.createdAt,
      reason: !achat ? 'achat_manquant' : !achat.article ? 'article_manquant_sur_achat' : 'article_introuvable',
    });
  }

  return broken;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  try {
    console.log(`[cleanupVehiclePayments] MongoDB: ${uri}`);
    await mongoose.connect(uri);

    const broken = await loadBrokenVehicleCandidates(args);
    const totalAmount = broken.reduce((sum, p) => sum + (p.amount || 0), 0);

    console.log(
      JSON.stringify(
        {
          mode: args.apply ? 'APPLY' : 'DRY_RUN',
          scannedLimit: args.limit,
          from: args.from,
          to: args.to,
          testOnly: args.testOnly,
          candidates: broken.length,
          candidatesAmount: totalAmount,
        },
        null,
        2
      )
    );

    if (!broken.length) {
      console.log('Aucun paiement à nettoyer.');
      return;
    }

    console.log('Exemples candidats (max 20):');
    console.table(
      broken.slice(0, 20).map((p) => ({
        id: String(p._id),
        amount: p.amount,
        type: p.type,
        reason: p.reason,
        customId: p.customId,
        tx: p.transactionId,
        createdAt: p.createdAt,
      }))
    );

    if (!args.apply) {
      console.log('DRY-RUN terminé. Relance avec --apply pour supprimer.');
      return;
    }

    const ids = broken.map((p) => p._id);
    const result = await Payment.deleteMany({ _id: { $in: ids } });
    console.log(`Suppression terminée: ${result.deletedCount} paiement(s) supprimé(s).`);
  } catch (error) {
    console.error('[cleanupVehiclePayments] Erreur:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();

