const { createClient } = require('@supabase/supabase-js');
const { require_auth } = require('./_auth');

module.exports = async (req, res) => {
  const user = require_auth(req, res);
  if (!user) return;

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // GET: クーポン一覧（有効期限が切れていないもの優先）
  if (req.method === 'GET') {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await db
      .from('coupons')
      .select('*, users(id, name, avatar, status)')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return res.status(500).json({ error: error.message });

    const result = (data || [])
      .filter(c => c.users?.status === 'active')
      .filter(c => !c.valid_until || c.valid_until >= today);

    return res.json(result);
  }

  // POST: クーポン投稿・削除
  if (req.method === 'POST') {
    const { title, description = '', discount = '', valid_until = null, delete_id } = req.body;

    if (delete_id) {
      await db.from('coupons').delete().eq('id', delete_id).eq('user_id', user.user_id);
      return res.json({ ok: true });
    }

    if (!title) return res.status(400).json({ error: 'タイトルは必須です' });

    const { data, error } = await db.from('coupons').insert({
      user_id: user.user_id, title, description, discount,
      valid_until: valid_until || null,
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.status(405).end();
};
