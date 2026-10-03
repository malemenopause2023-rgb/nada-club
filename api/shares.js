const { createClient } = require('@supabase/supabase-js');
const { require_auth } = require('./_auth');

module.exports = async (req, res) => {
  const user = require_auth(req, res);
  if (!user) return;
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // GET: シェア一覧（新着順）
  if (req.method === 'GET') {
    const { event_id } = req.query;
    let query = db.from('shares')
      .select('*, users(id, name, avatar, status), events(id, title)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (event_id) query = query.eq('event_id', event_id);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const result = (data || []).filter(s => s.users?.status === 'active');
    return res.json(result);
  }

  // POST: シェア投稿・削除
  if (req.method === 'POST') {
    const { content, event_id, delete_id } = req.body;

    if (delete_id) {
      await db.from('shares').delete().eq('id', delete_id).eq('user_id', user.user_id);
      return res.json({ ok: true });
    }

    if (!content?.trim() || !event_id) {
      return res.status(400).json({ error: 'content と event_id は必須です' });
    }

    const { data, error } = await db.from('shares').insert({
      user_id: user.user_id, event_id: parseInt(event_id), content: content.trim(),
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.status(405).end();
};
