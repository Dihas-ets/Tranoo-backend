const {
  normalizeArticleLocation,
  suggestCountries,
} = require('../services/locationGeocode');

exports.normalizeLocation = async (req, res) => {
  try {
    const input = (req.body.input || req.body.query || req.query.q || '')
      .toString()
      .trim();
    const result = await normalizeArticleLocation(input);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Erreur géocodage', error: error.message });
  }
};

exports.suggestCountries = (req, res) => {
  const q = (req.query.q || '').toString();
  res.json({ countries: suggestCountries(q) });
};
