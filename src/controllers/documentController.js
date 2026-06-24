const Message = require('../models/Message');
const Achat = require('../models/Achat');
const Notification = require('../models/Notification');
const ChatRoom = require('../models/ChatRoom');
const User = require('../models/User');

function formatUserLabel(u) {
  if (u == null || u === '') return '—';
  if (typeof u === 'string') return u;
  const name = `${u.prenoms || ''} ${u.nom || ''}`.trim();
  if (name) return name;
  if (u.email) return u.email;
  if (u._id) return String(u._id);
  return '—';
}

function fileNameFromUrl(url) {
  if (!url || typeof url !== 'string') return 'Document';
  try {
    const clean = url.split('?')[0];
    const parts = clean.split('/');
    const last = parts[parts.length - 1] || 'Document';
    return decodeURIComponent(last);
  } catch {
    return 'Document';
  }
}

function inDateRange(date, from, to) {
  if (!date) return false;
  const t = new Date(date).getTime();
  if (from) {
    const f = new Date(from);
    f.setHours(0, 0, 0, 0);
    if (t < f.getTime()) return false;
  }
  if (to) {
    const e = new Date(to);
    e.setHours(23, 59, 59, 999);
    if (t > e.getTime()) return false;
  }
  return true;
}

function matchesSearch(item, q) {
  if (!q) return true;
  const hay = [
    item.title,
    item.fileUrl,
    item.senderLabel,
    ...(item.recipientLabels || []),
    item.source,
    item.status,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

/** Liste admin : tous les documents partagés sur l'app (chat, achats, notifications). */
exports.listAdminDocuments = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = (req.query.search || '').trim().toLowerCase();
    const from = req.query.from || null;
    const to = req.query.to || null;
    const sort = req.query.sort === 'oldest' ? 'oldest' : 'recent';
    const statusFilter = (req.query.status || 'all').toString();

    const items = [];

    const msgFilter = { fileUrl: { $exists: true, $nin: [null, ''] } };
    const messages = await Message.find(msgFilter)
      .sort({ createdAt: -1 })
      .limit(400)
      .populate('sender', 'nom prenoms email role')
      .populate({
        path: 'room',
        populate: { path: 'participants', select: 'nom prenoms email role' },
      })
      .lean();

    for (const m of messages) {
      if (!inDateRange(m.createdAt, from, to)) continue;
      const senderId = m.sender?._id ? String(m.sender._id) : '';
      const recipients = (m.room?.participants || [])
        .filter((p) => String(p._id) !== senderId)
        .map((p) => ({
          id: String(p._id),
          label: formatUserLabel(p),
          role: p.role || null,
        }));
      const row = {
        id: String(m._id),
        source: 'chat',
        title: (m.content || '').trim() || fileNameFromUrl(m.fileUrl),
        fileUrl: m.fileUrl,
        createdAt: m.createdAt,
        senderLabel: formatUserLabel(m.sender),
        senderRole: m.sender?.role || null,
        recipientLabels: recipients.map((r) => r.label),
        recipients,
        status: 'envoyé',
      };
      if (matchesSearch(row, search)) items.push(row);
    }

    const achatFilter = { fichierUrl: { $exists: true, $ne: null, $ne: '' } };
    const achats = await Achat.find(achatFilter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('article', 'titre type')
      .lean();

    const acheteurIds = [...new Set(achats.map((a) => a.acheteur).filter(Boolean))];
    const acheteurUsers = await User.find({ _id: { $in: acheteurIds } })
      .select('nom prenoms email role')
      .lean();
    const acheteurMap = Object.fromEntries(
      acheteurUsers.map((u) => [String(u._id), u])
    );

    for (const a of achats) {
      if (!inDateRange(a.createdAt, from, to)) continue;
      const buyer = acheteurMap[String(a.acheteur)] || null;
      const row = {
        id: `achat-${a._id}`,
        source: 'achat',
        title: a.fichierNom || fileNameFromUrl(a.fichierUrl) || 'Document achat',
        fileUrl: a.fichierUrl,
        createdAt: a.createdAt,
        senderLabel: formatUserLabel(buyer),
        senderRole: buyer?.role || 'acheteur',
        recipientLabels: ['Tranoo / Vendeur'],
        recipients: [{ id: null, label: 'Tranoo / Vendeur', role: 'system' }],
        status: 'soumis',
      };
      if (matchesSearch(row, search)) items.push(row);
    }

    const notifFilter = {
      $or: [
        { 'attachments.images.0': { $exists: true } },
        { 'attachments.stampUrl': { $exists: true, $nin: [null, ''] } },
        { 'attachments.signatureUrl': { $exists: true, $nin: [null, ''] } },
      ],
    };
    const notifications = await Notification.find(notifFilter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('recipient', 'nom prenoms email role')
      .lean();

    const senderIds = notifications
      .map((n) => n.sender)
      .filter((s) => s && typeof s === 'object' && s._id);
    const senderObjectIds = notifications
      .map((n) => n.sender)
      .filter((s) => typeof s === 'string' && /^[a-f0-9]{24}$/i.test(s));
    const senders = await User.find({
      _id: { $in: [...senderObjectIds, ...senderIds.map((s) => s._id)] },
    })
      .select('nom prenoms email role')
      .lean();
    const senderMap = Object.fromEntries(senders.map((u) => [String(u._id), u]));

    for (const n of notifications) {
      if (!inDateRange(n.createdAt, from, to)) continue;
      let senderLabel = '—';
      let senderRole = null;
      if (typeof n.sender === 'string') {
        senderLabel = senderMap[n.sender]
          ? formatUserLabel(senderMap[n.sender])
          : n.sender;
        senderRole = senderMap[n.sender]?.role || 'admin';
      } else if (n.sender && typeof n.sender === 'object') {
        senderLabel = formatUserLabel(n.sender);
        senderRole = n.sender.role || null;
      }

      const urls = [];
      if (Array.isArray(n.attachments?.images)) {
        urls.push(...n.attachments.images.filter(Boolean));
      }
      if (n.attachments?.stampUrl) urls.push(n.attachments.stampUrl);
      if (n.attachments?.signatureUrl) urls.push(n.attachments.signatureUrl);

      for (let i = 0; i < urls.length; i += 1) {
        const url = urls[i];
        const row = {
          id: `notif-${n._id}-${i}`,
          source: 'notification',
          title: n.title || fileNameFromUrl(url),
          fileUrl: url,
          createdAt: n.createdAt,
          senderLabel,
          senderRole,
          recipientLabels: [formatUserLabel(n.recipient)],
          recipients: n.recipient
            ? [
                {
                  id: String(n.recipient._id),
                  label: formatUserLabel(n.recipient),
                  role: n.recipient.role || null,
                },
              ]
            : [],
          status: n.status || 'envoyé',
        };
        if (matchesSearch(row, search)) items.push(row);
      }
    }

    if (statusFilter !== 'all') {
      const sf = statusFilter.toLowerCase();
      const filtered = items.filter(
        (it) => (it.status || '').toLowerCase() === sf
      );
      items.length = 0;
      items.push(...filtered);
    }

    items.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sort === 'oldest' ? ta - tb : tb - ta;
    });

    const total = items.length;
    const start = (page - 1) * limit;
    const pageItems = items.slice(start, start + limit);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const submittedToday = items.filter(
      (it) => new Date(it.createdAt) >= todayStart
    ).length;

    return res.json({
      items: pageItems,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      stats: {
        totalFiles: total,
        submittedToday,
        downloads: 0,
      },
    });
  } catch (error) {
    console.error('[listAdminDocuments]', error);
    return res.status(500).json({
      message: 'Erreur chargement documents',
      error: error.message,
    });
  }
};

function collectNotifAttachmentUrls(n) {
  const urls = [];
  if (Array.isArray(n.attachments?.images)) {
    urls.push(...n.attachments.images.filter(Boolean));
  }
  if (n.attachments?.stampUrl) urls.push(n.attachments.stampUrl);
  if (n.attachments?.signatureUrl) urls.push(n.attachments.signatureUrl);
  return urls;
}

/** Suppression admin : retire la référence fichier (chat, achat, notification). */
exports.deleteAdminDocuments = async (req, res) => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids requis' });
    }

    let deleted = 0;
    const errors = [];

    for (const rawId of ids) {
      const id = String(rawId || '');
      try {
        if (id.startsWith('achat-')) {
          const achatId = id.slice(6);
          const result = await Achat.updateOne(
            { _id: achatId },
            { $unset: { fichierUrl: '', fichierNom: '' } },
          );
          if (result.matchedCount) deleted += 1;
          continue;
        }

        if (id.startsWith('notif-')) {
          const match = id.match(/^notif-([a-f0-9]{24})-(\d+)$/i);
          if (!match) continue;
          const notifId = match[1];
          const idx = parseInt(match[2], 10);
          const notif = await Notification.findById(notifId);
          if (!notif) continue;

          const urls = collectNotifAttachmentUrls(notif);
          const urlToRemove = urls[idx];
          if (!urlToRemove) continue;

          if (Array.isArray(notif.attachments?.images)) {
            notif.attachments.images = notif.attachments.images.filter(
              (u) => u !== urlToRemove,
            );
          }
          if (notif.attachments?.stampUrl === urlToRemove) {
            notif.attachments.stampUrl = undefined;
          }
          if (notif.attachments?.signatureUrl === urlToRemove) {
            notif.attachments.signatureUrl = undefined;
          }
          await notif.save();
          deleted += 1;
          continue;
        }

        if (/^[a-f0-9]{24}$/i.test(id)) {
          const result = await Message.updateOne(
            { _id: id },
            { $unset: { fileUrl: '' } },
          );
          if (result.matchedCount) deleted += 1;
        }
      } catch (itemErr) {
        errors.push({ id, message: itemErr.message });
      }
    }

    return res.json({ deleted, errors });
  } catch (error) {
    console.error('[deleteAdminDocuments]', error);
    return res.status(500).json({
      message: 'Erreur suppression documents',
      error: error.message,
    });
  }
};
