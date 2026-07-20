const jwt = require('jsonwebtoken');

function requireVoter(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'voter') throw new Error('wrong role');
    req.voter = payload; // { matric, name, role }
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('wrong role');
    req.admin = payload; // { adminId, name, role }
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
}

module.exports = { requireVoter, requireAdmin };
