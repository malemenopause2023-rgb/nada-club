const { createClient } = require('@supabase/supabase-js');
const { require_auth } = require('./_auth');

module.exports = async (req, res) => {
  const user = require_auth(req, res);
  if (!user) return;
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // GET: 自分のお気に入り一覧（詳細情報付き）
  if (req.method === 'GET') {
    const { data: favs, error } = await db
      .from('favorites')
      .select('*')
      .eq('user_id', user.user_id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const personIds = favs.filter(f => f.target_type === 'person').map(f => f.target_id);
    const eventIds  = favs.filter(f => f.target_type === 'event').map(f => f.target_id);

    let people = [];
    let events = [];

    if (personIds.length) {
      const { data } = await db.from('users').select('id, name, avatar, area, type, status').in('id', personIds);
      people = (data || []).filter(p => p.status === 'active');
    }
    if (eventIds.length) {
      const { data } = await db.from('events').select('*, users(name, avatar)').in('id', eventIds);
      events = data || [];
    }

    return res.json({ people, events });
  }

  // POST: お気に入り追加・削除
  if (req.method === 'POST') {
    const { action, target_type, target_id } = req.body;
    if (!target_type || !target_id) return res.status(400).json({ error: 'target_type, target_id は必須です' });

    if (action === 'add') {
      const { data, error } = await db.from('favorites').insert({
        user_id: user.user_id, target_type, target_id,
      }).select().single();
      if (error) {
        if (error.code === '23505') return res.json({ ok: true, already: true });
        return res.status(500).json({ error: error.message });
      }
      return res.json(data);
    }

    if (action === 'remove') {
      await db.from('favorites').delete()
        .eq('user_id', user.user_id)
        .eq('target_type', target_type)
        .eq('target_id', target_id);
      return res.json({ ok: true });
    }

    if (action === 'check') {
      const { data } = await db.from('favorites').select('id')
        .eq('user_id', user.user_id)
        .eq('target_type', target_type)
        .eq('target_id', target_id)
        .maybeSingle();
      return res.json({ favorited: !!data });
    }

    res.status(400).json({ error: '不正なaction' });
  }

  else res.status(405).end();
};
