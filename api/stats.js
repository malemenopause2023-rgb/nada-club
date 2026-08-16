const { createClient } = require('@supabase/supabase-js');
const { require_auth } = require('./_auth');

module.exports = async (req, res) => {
  const user = require_auth(req, res);
  if (!user) return;

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  const { count, error } = await db
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  if (error) return res.status(500).json({ error: error.message });

  res.json({ user_count: count || 0 });
};
