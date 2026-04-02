const { createClient } = require('@supabase/supabase-js');
const { require_auth } = require('./_auth');

module.exports = async (req, res) => {
  const user = require_auth(req, res);
  if (!user) return;
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const uid = user.user_id;

  // GET: マイページ全データ取得
  if (req.method === 'GET') {
    const [{ data: u }, { data: offers }, { data: wants }, { data: conns }, { data: acts }, { data: pending }] =
      await Promise.all([
        db.from('users').select('*').eq('id', uid).single(),
        db.from('offers').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        db.from('wants').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        db.from('connections').select('*, from:from_user(name,avatar), to:to_user(name,avatar)')
          .or(`from_user.eq.${uid},to_user.eq.${uid}`).eq('status', 'accepted'),
        db.from('activities').select('*').eq('user_id', uid)
          .order('created_at', { ascending: false }).limit(10),
        db.from('connections').select('*, from:from_user(name, avatar)')
          .eq('to_user', uid).eq('status', 'pending'),
      ]);
    return res.json({
      user: u, offers: offers || [], wants: wants || [],
      connections: conns || [], pending: pending || [], activities: acts || [],
    });
  }

  // POST: 各種更新（actionで分岐）
  if (req.method === 'POST') {
    const { action } = req.body;

    // プロフィール更新
    if (action === 'update_profile') {
      const { name, area, type, avatar, bio } = req.body;
      if (!name) return res.status(400).json({ error: '名前は必須です' });
      const { data, error } = await db.from('users')
        .update({ name, area: area || '', type: type || 'individual', avatar: avatar || '😊', bio: bio || '' })
        .eq('id', uid).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    // OFFER追加
    if (action === 'add_offer') {
      const { title, description = '', category = 'other', rtype = 'skill' } = req.body;
      if (!title) return res.status(400).json({ error: 'タイトルは必須です' });
      const { data, error } = await db.from('offers')
        .insert({ user_id: uid, title, description, category, rtype }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    // OFFER削除
    if (action === 'delete_offer') {
      await db.from('offers').delete().eq('id', req.body.id).eq('user_id', uid);
      return res.json({ ok: true });
    }

    // WANT追加
    if (action === 'add_want') {
      const { title, category = 'other' } = req.body;
      if (!title) return res.status(400).json({ error: 'タイトルは必須です' });
      const { data, error } = await db.from('wants')
        .insert({ user_id: uid, title, category }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    // WANT削除
    if (action === 'delete_want') {
      await db.from('wants').delete().eq('id', req.body.id).eq('user_id', uid);
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: '不正なaction' });
  }

  res.status(405).end();
};
