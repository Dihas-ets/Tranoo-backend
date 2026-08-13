const DEFAULT_CAR_TIERS = [
  { minPrice: 5_500_000, gain: 200_000 },
  { minPrice: 2_500_000, gain: 100_000 },
  { minPrice: 1_500_000, gain: 50_000 },
];

const DEFAULT_GAIN_VOITURE = 50_000;
const DEFAULT_GAIN_MOTO = 5_000;
const DEFAULT_GAIN_MOTO_TRICYCLE = 10_000;
const MOTO_PERCENT_FROM = 1_500_000;
const MOTO_PERCENT_RATE = 10;

function normalizeCarTiers(rawTiers) {
  if (!Array.isArray(rawTiers) || rawTiers.length === 0) {
    return DEFAULT_CAR_TIERS.map((t) => ({ ...t }));
  }
  return rawTiers
    .map((t) => ({
      minPrice: Math.round(Number(t?.minPrice) || 0),
      gain: Math.round(Number(t?.gain) || 0),
    }))
    .filter((t) => t.minPrice > 0 && t.gain >= 0)
    .sort((a, b) => b.minPrice - a.minPrice);
}

function computeCarGainFcfa(price, carTiers) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return 0;
  const tiers = normalizeCarTiers(carTiers);
  for (const tier of tiers) {
    if (p >= tier.minPrice) return tier.gain;
  }
  return tiers.length ? tiers[tiers.length - 1].gain : DEFAULT_GAIN_VOITURE;
}

function computeMotoGainFcfa(price, typeMoto, config = {}) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return 0;

  const percentFrom = Number(config.motoPercentFrom ?? MOTO_PERCENT_FROM);
  const percentRate = Number(config.motoPercentRate ?? MOTO_PERCENT_RATE);
  const neuveGain = Number(config.motoNeuveGain ?? DEFAULT_GAIN_MOTO);
  const tricycleGain = Number(config.motoTricycleGain ?? DEFAULT_GAIN_MOTO_TRICYCLE);

  if (p >= percentFrom && percentRate > 0) {
    return Math.round(p * (percentRate / 100));
  }

  const type = String(typeMoto || '').trim().toLowerCase();
  if (type === 'tricycle') return tricycleGain;
  return neuveGain;
}

function serializePricing(doc) {
  const carTiers = normalizeCarTiers(doc?.carTiers);
  return {
    gainVoiture: Number(doc?.gainVoiture) || DEFAULT_GAIN_VOITURE,
    gainMoto: Number(doc?.gainMoto) || DEFAULT_GAIN_MOTO,
    carTiers,
    motoNeuveGain: Number(doc?.motoNeuveGain ?? DEFAULT_GAIN_MOTO),
    motoTricycleGain: Number(doc?.motoTricycleGain ?? DEFAULT_GAIN_MOTO_TRICYCLE),
    motoPercentFrom: Number(doc?.motoPercentFrom ?? MOTO_PERCENT_FROM),
    motoPercentRate: Number(doc?.motoPercentRate ?? MOTO_PERCENT_RATE),
  };
}

module.exports = {
  DEFAULT_CAR_TIERS,
  DEFAULT_GAIN_VOITURE,
  DEFAULT_GAIN_MOTO,
  DEFAULT_GAIN_MOTO_TRICYCLE,
  MOTO_PERCENT_FROM,
  MOTO_PERCENT_RATE,
  normalizeCarTiers,
  computeCarGainFcfa,
  computeMotoGainFcfa,
  serializePricing,
};
