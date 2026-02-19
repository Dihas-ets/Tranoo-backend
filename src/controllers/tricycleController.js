const User = require('../models/User');
const TricycleContact = require('../models/TricycleContact');
const notificationController = require('./notificationController');
const ChatRoom = require('../models/ChatRoom');

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Haversine distance (km)
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const getMaxRangeKm = (req) => {
  const fromQuery = toNumber(req.query?.maxRangeKm);
  if (fromQuery != null && fromQuery > 0) return fromQuery;
  const env = toNumber(process.env.TRICYCLE_MAX_RANGE_KM);
  return env != null && env > 0 ? env : 10;
};

const getSearchRadiusKm = (maxRangeKm) => {
  const env = toNumber(process.env.TRICYCLE_SEARCH_RADIUS_KM);
  if (env != null && env > 0) return env;
  return Math.max(maxRangeKm * 3, maxRangeKm);
};

const getAvgSpeedKmH = () => {
  const env = toNumber(process.env.TRICYCLE_AVG_SPEED_KMH);
  return env != null && env > 0 ? env : 25;
};

const isChauffeur = (u) => u && u.role === 'chauffeur';
const isAcheteur = (u) => u && u.role === 'acheteur';

// POST /api/tricycles/location
// Body: { latitude, longitude, address? }
exports.updateMyLocation = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Non authentifié' });

    const latitude = toNumber(req.body?.latitude);
    const longitude = toNumber(req.body?.longitude);
    if (latitude == null || longitude == null) {
      return res.status(400).json({ message: 'latitude et longitude requis' });
    }

    user.location = {
      type: 'Point',
      coordinates: [longitude, latitude],
    };
    user.lastLocationAt = new Date();
    // Optionnel: marque l'activité
    user.lastSeen = new Date();
    await user.save();

    res.json({ success: true, message: 'Localisation mise à jour' });
  } catch (error) {
    console.error('[TRICYCLE] updateMyLocation error:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// POST /api/tricycles/chauffeur/status
// Body: { status: 'available'|'busy'|'offline' }
exports.setChauffeurAvailability = async (req, res) => {
  try {
    const user = req.user;
    if (!isChauffeur(user)) {
      return res.status(403).json({ message: 'Accès réservé aux chauffeurs' });
    }
    const status = String(req.body?.status || '').toLowerCase();
    if (!['available', 'busy', 'offline'].includes(status)) {
      return res.status(400).json({ message: 'status invalide' });
    }
    user.availabilityStatus = status;
    user.lastSeen = new Date();
    await user.save();
    res.json({ success: true, availabilityStatus: user.availabilityStatus });
  } catch (error) {
    console.error('[TRICYCLE] setChauffeurAvailability error:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// GET /api/tricycles/nearby?lat=..&lng=..&maxRangeKm=..
exports.getNearbyChauffeurs = async (req, res) => {
  try {
    const lat = toNumber(req.query?.lat) ?? toNumber(req.query?.latitude);
    const lng = toNumber(req.query?.lng) ?? toNumber(req.query?.longitude);
    if (lat == null || lng == null) {
      // fallback: utiliser la position de l'utilisateur si disponible
      const coords = req.user?.location?.coordinates;
      if (Array.isArray(coords) && coords.length === 2) {
        // coords = [lng, lat]
        req.query.lat = coords[1];
        req.query.lng = coords[0];
        return exports.getNearbyChauffeurs(req, res);
      }
      return res.status(400).json({ message: 'lat et lng requis (ou position utilisateur enregistrée)' });
    }

    const maxRangeKm = getMaxRangeKm(req);
    const searchRadiusKm = getSearchRadiusKm(maxRangeKm);
    const avgSpeedKmH = getAvgSpeedKmH();

    const chauffeurs = await User.find({
      role: 'chauffeur',
      'location.coordinates': { $exists: true, $type: 'array' },
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: Math.round(searchRadiusKm * 1000),
        },
      },
    }).select('nom prenoms telephone photo isOnline availabilityStatus lastLocationAt location');

    const items = chauffeurs.map((c) => {
      const cLng = c.location?.coordinates?.[0];
      const cLat = c.location?.coordinates?.[1];
      const distanceKm =
        typeof cLat === 'number' && typeof cLng === 'number'
          ? haversineKm(lat, lng, cLat, cLng)
          : null;

      const inRange = distanceKm != null ? distanceKm <= maxRangeKm : false;
      let statusColor = 'yellow';
      let status = 'busy';
      if (!inRange) {
        statusColor = 'red';
        status = 'out_of_range';
      } else if (c.isOnline && c.availabilityStatus === 'available') {
        statusColor = 'green';
        status = 'available';
      } else {
        statusColor = 'yellow';
        status = 'busy';
      }

      const etaMinutes =
        distanceKm != null ? Math.max(1, Math.round((distanceKm / avgSpeedKmH) * 60)) : null;

      return {
        _id: c._id,
        nom: c.nom,
        prenoms: c.prenoms,
        photo: c.photo,
        telephone: c.telephone,
        latitude: typeof cLat === 'number' ? cLat : null,
        longitude: typeof cLng === 'number' ? cLng : null,
        distanceKm: distanceKm != null ? Number(distanceKm.toFixed(2)) : null,
        etaMinutes,
        status,
        statusColor,
        canContact: inRange,
        isOnline: !!c.isOnline,
        availabilityStatus: c.availabilityStatus,
        lastLocationAt: c.lastLocationAt,
      };
    });

    res.json({
      center: { lat, lng },
      maxRangeKm,
      searchRadiusKm,
      chauffeurs: items,
    });
  } catch (error) {
    console.error('[TRICYCLE] getNearbyChauffeurs error:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// POST /api/tricycles/:chauffeurId/contact
// Body: { latitude, longitude, address? }
exports.createContact = async (req, res) => {
  try {
    const user = req.user;
    if (!isAcheteur(user)) {
      return res.status(403).json({ message: 'Accès réservé aux acheteurs (Tranoo)' });
    }

    const chauffeurId = req.params.chauffeurId;
    const chauffeur = await User.findById(chauffeurId).select('role nom prenoms telephone photo location isOnline availabilityStatus');
    if (!chauffeur || !isChauffeur(chauffeur)) {
      return res.status(404).json({ message: 'Chauffeur introuvable' });
    }

    const latitude = toNumber(req.body?.latitude);
    const longitude = toNumber(req.body?.longitude);
    const address = req.body?.address;
    if (latitude == null || longitude == null) {
      return res.status(400).json({ message: 'latitude et longitude requis' });
    }

    const maxRangeKm = getMaxRangeKm(req);
    const cLng = chauffeur.location?.coordinates?.[0];
    const cLat = chauffeur.location?.coordinates?.[1];
    if (typeof cLat !== 'number' || typeof cLng !== 'number') {
      return res.status(400).json({ message: 'Chauffeur sans position. Réessayez plus tard.' });
    }
    const distanceKm = haversineKm(latitude, longitude, cLat, cLng);
    if (distanceKm > maxRangeKm) {
      return res.status(403).json({ message: 'Chauffeur hors de portée', distanceKm, maxRangeKm });
    }

    // Éviter les doublons actifs
    const existing = await TricycleContact.findOne({
      user: user._id,
      chauffeur: chauffeur._id,
      status: { $in: ['initiated', 'accepted'] },
    }).sort({ createdAt: -1 });

    if (existing) {
      return res.json({ success: true, contact: existing, reused: true });
    }

    const contact = await TricycleContact.create({
      user: user._id,
      chauffeur: chauffeur._id,
      status: 'initiated',
      userLocationSnapshot: {
        latitude,
        longitude,
        address,
        timestamp: new Date(),
      },
      chauffeurLocationSnapshot: {
        latitude: cLat,
        longitude: cLng,
        timestamp: new Date(),
      },
    });

    // Créer (ou récupérer) une room de chat dédiée au contact tricycle
    let room = await ChatRoom.findOne({
      participants: { $all: [user._id, chauffeur._id] },
      contextType: 'tricycle',
      contextId: contact._id,
    });
    if (!room) {
      room = await ChatRoom.create({
        participants: [user._id, chauffeur._id],
        contextType: 'tricycle',
        contextId: contact._id,
      });
    }
    try {
      await room.populate('participants', 'uid nom prenoms email photo role telephone');
    } catch (_) {}

    // Notifier le chauffeur
    try {
      await notificationController.createNotification(
        chauffeur._id,
        user._id,
        'Nouvelle demande Tricycle',
        `${user.prenoms} ${user.nom} souhaite vous contacter pour un déplacement en tricycle.`,
        'tricycle',
        contact._id,
        'TricycleContact'
      );
    } catch (e) {
      console.error('[TRICYCLE] notif createContact failed:', e.message);
    }

    res.status(201).json({ success: true, contact, roomId: room._id, room });
  } catch (error) {
    console.error('[TRICYCLE] createContact error:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// GET /api/tricycles/contacts/incoming  (chauffeur)
exports.getIncomingContacts = async (req, res) => {
  try {
    const user = req.user;
    if (!isChauffeur(user)) {
      return res.status(403).json({ message: 'Accès réservé aux chauffeurs' });
    }
    const contacts = await TricycleContact.find({
      chauffeur: user._id,
      status: { $in: ['initiated', 'accepted'] },
    })
      .sort({ updatedAt: -1 })
      .populate('user', 'nom prenoms telephone photo location lastLocationAt')
      .lean();

    res.json({ contacts });
  } catch (error) {
    console.error('[TRICYCLE] getIncomingContacts error:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// GET /api/tricycles/contacts/my (acheteur)
exports.getMyContacts = async (req, res) => {
  try {
    const user = req.user;
    if (!isAcheteur(user)) {
      return res.status(403).json({ message: 'Accès réservé aux acheteurs' });
    }
    const contacts = await TricycleContact.find({
      user: user._id,
      status: { $in: ['initiated', 'accepted', 'closed'] },
    })
      .sort({ updatedAt: -1 })
      .populate('chauffeur', 'nom prenoms telephone photo location lastLocationAt isOnline availabilityStatus')
      .lean();

    res.json({ contacts });
  } catch (error) {
    console.error('[TRICYCLE] getMyContacts error:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// GET /api/tricycles/contacts/:id
exports.getContactDetails = async (req, res) => {
  try {
    const contact = await TricycleContact.findById(req.params.id)
      .populate('user', 'nom prenoms telephone photo location lastLocationAt')
      .populate('chauffeur', 'nom prenoms telephone photo location lastLocationAt isOnline availabilityStatus')
      .lean();
    if (!contact) return res.status(404).json({ message: 'Contact introuvable' });

    // Autorisation: participant uniquement
    const me = req.user?._id?.toString();
    if (!me || (contact.user?._id?.toString() !== me && contact.chauffeur?._id?.toString() !== me)) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    // Room existante
    const room = await ChatRoom.findOne({
      participants: { $all: [contact.user._id, contact.chauffeur._id] },
      contextType: 'tricycle',
      contextId: contact._id,
    }).populate('participants', 'uid nom prenoms email photo role telephone');

    res.json({ contact, roomId: room?._id || null, room: room || null });
  } catch (error) {
    console.error('[TRICYCLE] getContactDetails error:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// POST /api/tricycles/contacts/:id/accept (chauffeur)
exports.acceptContact = async (req, res) => {
  try {
    const me = req.user;
    if (!isChauffeur(me)) {
      return res.status(403).json({ message: 'Accès réservé aux chauffeurs' });
    }
    const contact = await TricycleContact.findById(req.params.id);
    if (!contact) return res.status(404).json({ message: 'Contact introuvable' });
    if (String(contact.chauffeur) !== String(me._id)) {
      return res.status(403).json({ message: 'Vous n’êtes pas concerné par ce contact' });
    }
    contact.status = 'accepted';
    await contact.save();

    // Notifier l'utilisateur
    try {
      await notificationController.createNotification(
        contact.user,
        me._id,
        'Demande Tricycle acceptée',
        'Le chauffeur a accepté votre demande. Vous pouvez maintenant échanger librement.',
        'tricycle',
        contact._id,
        'TricycleContact'
      );
    } catch (e) {
      console.error('[TRICYCLE] notif acceptContact failed:', e.message);
    }

    res.json({ success: true, contact });
  } catch (error) {
    console.error('[TRICYCLE] acceptContact error:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// POST /api/tricycles/contacts/:id/close (participant)
exports.closeContact = async (req, res) => {
  try {
    const contact = await TricycleContact.findById(req.params.id);
    if (!contact) return res.status(404).json({ message: 'Contact introuvable' });
    const me = req.user?._id?.toString();
    if (!me || (String(contact.user) !== me && String(contact.chauffeur) !== me)) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    contact.status = 'closed';
    await contact.save();
    res.json({ success: true, contact });
  } catch (error) {
    console.error('[TRICYCLE] closeContact error:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

