// Sirf admin role wale users aage ja sakte hain.
// Role har baar database se check hota hai (token par bharosa nahi),
// taaki kisi ka admin access hatane par turant effect ho.
const pool = require('../db');

module.exports = async function adminOnly(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0] || rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'This area is for admins only.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Could not verify access.' });
  }
};
