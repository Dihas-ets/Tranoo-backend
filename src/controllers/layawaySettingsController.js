const {
  ensureSettingsDoc,
  serialize,
} = require('../services/layaway/LayawaySettingsService');

function parseNonNegativeNumber(value, label) {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return { error: `${label} invalide` };
  }
  return { value: n };
}

exports.getLayawaySettings = async (_req, res) => {
  try {
    const doc = await ensureSettingsDoc();
    return res.status(200).json({
      success: true,
      settings: serialize(doc),
    });
  } catch (error) {
    console.error('[layaway-settings] get error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateLayawaySettings = async (req, res) => {
  try {
    const doc = await ensureSettingsDoc();
    const body = req.body || {};
    const update = { updatedAt: new Date() };

    const numericFields = [
      ['guaranteePercentage', body.guaranteePercentage],
      ['retentionPercentage', body.retentionPercentage],
      ['maxDurationMonths', body.maxDurationMonths],
      ['delayGracePeriodDays', body.delayGracePeriodDays],
      ['defaultThresholdMonths', body.defaultThresholdMonths],
    ];

    for (const [key, raw] of numericFields) {
      if (raw === undefined) continue;
      const parsed = parseNonNegativeNumber(raw, key);
      if (parsed.error) {
        return res.status(400).json({ message: parsed.error });
      }
      update[key] = key.includes('Percentage') || key.includes('Months') || key.includes('Days')
        ? Math.round(parsed.value)
        : parsed.value;
    }

    if (body.allowedFrequencies !== undefined) {
      if (!Array.isArray(body.allowedFrequencies) || body.allowedFrequencies.length < 1) {
        return res.status(400).json({ message: 'allowedFrequencies invalide' });
      }
      update.allowedFrequencies = body.allowedFrequencies.map((f) =>
        String(f).toUpperCase(),
      );
    }

    if (body.allowedDurationsMonths !== undefined) {
      if (
        !Array.isArray(body.allowedDurationsMonths) ||
        body.allowedDurationsMonths.length < 1
      ) {
        return res.status(400).json({ message: 'allowedDurationsMonths invalide' });
      }
      update.allowedDurationsMonths = body.allowedDurationsMonths.map((n) =>
        Math.round(Number(n)),
      );
    }

    if (body.currency !== undefined) {
      update.currency = String(body.currency).toUpperCase();
    }

    Object.assign(doc, update);
    await doc.save();

    return res.status(200).json({
      success: true,
      settings: serialize(doc),
    });
  } catch (error) {
    console.error('[layaway-settings] update error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
