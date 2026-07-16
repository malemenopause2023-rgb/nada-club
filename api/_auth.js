const jwt = require('jsonwebtoken');

function verify(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function require_auth(req, res) {
  const user = verify(req);
  if (!user) {
    res.status(401).json({ error: '認証が必要です' });
    return null;
  }
  return user;
}

module.exports = { verify, require_auth };
