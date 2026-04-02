const { createClient } = require('@supabase/supabase-js');
const { require_auth } = require('./_auth');

module.exports = async (req, res) => {
  const user = require_auth(req, res);
  if (!user) return;
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // GET: 活動記録一覧
  if (req.method === 'GET') {
    const { category, mine } = req.query;
    let query = db.from('activities')
      .select('*, users(id, name, avatar, area, type, status)')
      .order('created_at', { ascending: false })
      .limit(30);
    if (category && category !== 'all') query = query.eq('category', category);
    if (mine === '1') query = query.eq('user_id', user.user_id);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json((data || []).filter(a => a.users?.status === 'active'));
  }

  // POST: 活動記録の保存・削除
  if (req.method === 'POST') {
    const { title, description = '', impact = '', category = 'other',
            act_date, reach_count = 0, delete_id } = req.body;
    if (delete_id) {
      await db.from('activities').delete().eq('id', delete_id).eq('user_id', user.user_id);
      return res.json({ ok: true });
    }
    if (!title) return res.status(400).json({ error: 'タイトルは必須です' });
    const { data, error } = await db.from('activities').insert({
      user_id: user.user_id, title, description, impact, category,
      act_date: act_date || new Date().toISOString().split('T')[0],
      reach_count: parseInt(reach_count) || 0,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.status(405).end();
};
