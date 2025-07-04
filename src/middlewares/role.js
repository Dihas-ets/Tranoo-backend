const roleMiddleware = (...roles) => (req, res, next) => {
  const userRole = req.user?.typeAdmin || req.user?.role;
  if (!userRole || !roles.includes(userRole)) {
    return res.status(403).json({ message: 'Accès refusé : rôle non autorisé.' });
  }
  next();
};

module.exports = roleMiddleware; 