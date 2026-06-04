/**
 * Normalisation téléphone (E.164 / chiffres) — inscription, OTP, WhatsApp.
 */

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

/** Bénin : 22901XXXXXXXX → 229XXXXXXXX */
function normalizeBeninDigits(phoneDigits) {
  let d = digitsOnly(phoneDigits);
  if (!d) return d;
  if (d.startsWith('22901') && d.length >= 12) {
    return `229${d.slice(5)}`;
  }
  if (d.startsWith('2290') && d.length >= 12) {
    return `229${d.slice(4)}`;
  }
  return d;
}

function normalizeBeninNational(nat) {
  let n = digitsOnly(nat);
  if (!n) return n;
  if (n.startsWith('01') && n.length >= 10) {
    n = n.slice(2);
  } else if (n.startsWith('0')) {
    n = n.replace(/^0+/, '');
  }
  if (n.length === 9 && n.startsWith('1')) {
    n = n.slice(1);
  }
  return n;
}

function canonicalPhoneDigits({ telephone, countryCode, nationalNumber } = {}) {
  let d = digitsOnly(telephone);
  if (!d && countryCode && nationalNumber) {
    const cc = digitsOnly(countryCode);
    let nat = digitsOnly(nationalNumber);
    if (cc === '229') {
      nat = normalizeBeninNational(nat);
    }
    d = `${cc}${nat}`;
  }
  if (d.startsWith('229')) {
    d = normalizeBeninDigits(d);
  }
  return d;
}

function internationalPhoneFromDigits(phoneDigits) {
  const d = digitsOnly(phoneDigits);
  return d ? `+${d}` : '';
}

function phoneLookupVariants(phoneDigits) {
  const variants = new Set();
  const d = digitsOnly(phoneDigits);
  if (!d) return [];

  variants.add(d);
  variants.add(`+${d}`);

  const benin = normalizeBeninDigits(d);
  variants.add(benin);
  variants.add(`+${benin}`);

  if (benin.startsWith('229') && benin.length === 11) {
    variants.add(`2290${benin.slice(3)}`);
    variants.add(`+2290${benin.slice(3)}`);
  }

  return [...variants];
}

function maskPhone(phone) {
  const d = digitsOnly(phone);
  if (d.length < 6) return '***';
  const local = d.length > 3 ? d.slice(-8) : d;
  return `***${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`.trim();
}

module.exports = {
  digitsOnly,
  normalizeBeninDigits,
  canonicalPhoneDigits,
  internationalPhoneFromDigits,
  phoneLookupVariants,
  maskPhone,
};
