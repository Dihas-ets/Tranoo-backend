const Invoice = require('../models/Invoice');

const getMyInvoices = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    console.log('[INVOICE] GET /my - userId:', userId?.toString?.() || userId);
    if (!userId) {
      console.error('[INVOICE] userId introuvable dans req.user:', req.user);
      return res.status(400).json({ message: 'Utilisateur non identifié pour les factures' });
    }
    const invoices = await Invoice.find({ userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    const unreadCount = invoices.filter((i) => i.isRead !== true).length;
    console.log('[INVOICE] Factures trouvées:', invoices.length, '| unread:', unreadCount);
    return res.json({ invoices, unreadCount });
  } catch (error) {
    console.error('Erreur récupération factures:', error);
    if (error?.stack) {
      console.error('[INVOICE] Stack:', error.stack);
    }
    return res
      .status(500)
      .json({ message: 'Erreur serveur lors de la récupération des factures' });
  }
};

const markInvoiceAsRead = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { id } = req.params;
    const invoice = await Invoice.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!invoice) {
      return res.status(404).json({ message: 'Facture introuvable' });
    }
    return res.json({ invoice });
  } catch (error) {
    console.error('Erreur marquage facture lue:', error);
    return res
      .status(500)
      .json({ message: 'Erreur serveur lors du marquage de la facture' });
  }
};

const markAllInvoicesAsRead = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    await Invoice.updateMany(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Erreur marquage global factures lues:', error);
    return res
      .status(500)
      .json({ message: 'Erreur serveur lors du marquage global' });
  }
};

module.exports = {
  getMyInvoices,
  markInvoiceAsRead,
  markAllInvoicesAsRead,
};
