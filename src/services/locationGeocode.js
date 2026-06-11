const axios = require('axios');

const KNOWN_COUNTRIES = [
  { label: 'Bénin', keys: ['benin', 'bj', 'republic of benin'] },
  { label: 'Mali', keys: ['mali', 'ml'] },
  { label: 'Niger', keys: ['niger', 'ne'] },
  { label: 'Burkina-Faso', keys: ['burkina-faso', 'burkina faso', 'bf'] },
  { label: "Côte d'Ivoire", keys: ['cote d ivoire', 'ivory coast', 'ci'] },
  { label: 'Sénégal', keys: ['senegal', 'sn'] },
  { label: 'Togo', keys: ['togo', 'tg'] },
  { label: 'Ghana', keys: ['ghana', 'gh'] },
  { label: 'Nigéria', keys: ['nigeria', 'ng'] },
  { label: 'Maroc', keys: ['maroc', 'morocco', 'ma'] },
];

function normalizeKey(input) {
  let s = (input || '').toString().trim().toLowerCase();
  const replacements = {
    à: 'a', â: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e',
    ï: 'i', î: 'i', ô: 'o', ö: 'o', ù: 'u', û: 'u', ü: 'u', ç: 'c', œ: 'oe',
  };
  for (const [from, to] of Object.entries(replacements)) {
    s = s.split(from).join(to);
  }
  return s.replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchKnownCountry(text) {
  const key = normalizeKey(text);
  if (!key) return null;
  for (const country of KNOWN_COUNTRIES) {
    const labelKey = normalizeKey(country.label);
    if (key === labelKey || key.includes(labelKey) || labelKey.includes(key)) {
      return country.label;
    }
    for (const alias of country.keys) {
      const aliasKey = normalizeKey(alias);
      if (key === aliasKey || key.includes(aliasKey) || aliasKey.includes(key)) {
        return country.label;
      }
    }
  }
  if ((text || '').toString().toLowerCase().includes("cote d'ivoire")) {
    return "Côte d'Ivoire";
  }
  return null;
}

function parseCityCountry(raw) {
  const parts = raw.split(/[,;/|]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const country = matchKnownCountry(parts[parts.length - 1]);
    if (country) {
      const city = parts.slice(0, -1).join(', ');
      const display = city ? `${city}, ${country}` : country;
      return {
        city,
        country,
        pays: country,
        localisation: display,
        lieu: country,
        geocoded: false,
      };
    }
  }
  const countryOnly = matchKnownCountry(raw);
  if (countryOnly) {
    return {
      city: '',
      country: countryOnly,
      pays: countryOnly,
      localisation: countryOnly,
      lieu: countryOnly,
      geocoded: false,
    };
  }
  return null;
}

async function forwardGeocode(query) {
  try {
    const resp = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: query,
        format: 'json',
        addressdetails: 1,
        limit: 1,
      },
      headers: { 'User-Agent': 'TranooAPI/1.0' },
      timeout: 10000,
    });
    const hit = Array.isArray(resp.data) ? resp.data[0] : null;
    if (!hit) return null;
    const addr = hit.address || {};
    const countryRaw = addr.country || '';
    const city =
      addr.city || addr.town || addr.village || addr.municipality || '';
    const country = matchKnownCountry(countryRaw) || countryRaw;
    const display =
      city && country ? `${city}, ${country}` : hit.display_name || query;
    return {
      city,
      country,
      pays: country,
      localisation: display,
      lieu: country || display,
      lat: hit.lat ? parseFloat(hit.lat) : null,
      lng: hit.lon ? parseFloat(hit.lon) : null,
      geocoded: true,
    };
  } catch (err) {
    console.warn('[GEOCODE] forward failed:', err.message);
    return null;
  }
}

async function normalizeArticleLocation(rawInput) {
  const raw = (rawInput || '').toString().trim();
  if (!raw) {
    return { lieu: '', localisation: '', pays: '', city: '', geocoded: false };
  }

  const parsed = parseCityCountry(raw);
  if (parsed) return parsed;

  const geo = await forwardGeocode(raw);
  if (geo) return geo;

  return {
    lieu: raw,
    localisation: raw,
    pays: '',
    city: '',
    geocoded: false,
  };
}

function suggestCountries(query) {
  const q = normalizeKey(query);
  const labels = KNOWN_COUNTRIES.map((c) => c.label);
  if (!q) return labels;
  return labels.filter((label) => normalizeKey(label).includes(q));
}

module.exports = {
  normalizeArticleLocation,
  forwardGeocode,
  matchKnownCountry,
  suggestCountries,
};
