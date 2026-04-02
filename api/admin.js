const { createClient } = require('@supabase/supabase-js');

function isAdmin(req) {
  return req.headers['authorization'] === 'Bearer ' + process.env.ADMIN_SECRET;
}

module.exports = async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: '管理者のみ' });
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  if (req.method === 'GET') {
    const { data } = await db.from('users').select('*').order('created_at', { ascending: false });
    return res.json(data || []);
  }

  if (req.method === 'POST') {
    const { user_id, action } = req.body;
    const status = action === 'approve' ? 'active' : 'suspended';
    await db.from('users').update({ status }).eq('id', user_id);
    return res.json({ ok: true });
  }

  res.status(405).end();
};
