// Ye middleware check karta hai ki request bhejne wala user logged in hai ya nahi
const jwt = require('jsonwebtoken');

module.exports = function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Please login first.' });
  }

  try {
    // Token sahi hai to user ki info (id, name, email) req.user mein aa jaati hai
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }
};
