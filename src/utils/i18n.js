/** @type {Record<string, Record<string, string>>} */
const messages = {
  galleryTransitaireOnly: {
    fr: 'transitaireGallery réservé aux transitaires',
    en: 'transitaireGallery is reserved for forwarders',
    ar: 'معرض الوسيط مخصص لوسطاء الشحن فقط',
  },
  galleryMustBeArray: {
    fr: 'transitaireGallery doit être un tableau',
    en: 'transitaireGallery must be an array',
    ar: 'يجب أن يكون transitaireGallery مصفوفة',
  },
  galleryMaxItems: {
    fr: 'Maximum 20 éléments dans la galerie',
    en: 'Maximum 20 items in the gallery',
    ar: '20 عنصراً كحد أقصى في المعرض',
  },
  galleryInvalidItem: {
    fr: 'Élément de galerie invalide',
    en: 'Invalid gallery item',
    ar: 'عنصر معرض غير صالح',
  },
  galleryItemTypeUrl: {
    fr: 'Chaque élément doit avoir un type (image|video) et une url',
    en: 'Each item must have a type (image|video) and a url',
    ar: 'يجب أن يحتوي كل عنصر على نوع (image|video) وعنوان url',
  },
};

function resolveLocale(req) {
  const raw = req?.headers?.['accept-language'];
  if (!raw || typeof raw !== 'string') return 'fr';
  const primary = raw.split(',')[0]?.split('-')[0]?.trim().toLowerCase();
  if (primary === 'en' || primary === 'ar') return primary;
  return 'fr';
}

/**
 * @param {string} key
 * @param {string} [locale]
 */
function t(key, locale = 'fr') {
  const entry = messages[key];
  if (!entry) return key;
  return entry[locale] ?? entry.fr ?? key;
}

module.exports = { t, resolveLocale, messages };
