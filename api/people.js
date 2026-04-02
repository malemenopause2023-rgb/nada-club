const { createClient } = require('@supabase/supabase-js');
const { require_auth } = require('./_auth');

module.exports = async (req, res) => {
  const user = require_auth(req, res);
  if (!user) return;
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // GET: ひとを探す・個別プロフィール
  if (req.method === 'GET') {
    const { category, area, uid } = req.query;
    if (uid) {
      const { data: u } = await db.from('users').select('*').eq('id', uid).eq('status', 'active').single();
      if (!u) return res.status(404).json({ error: 'not found' });
      const [{ data: offers }, { data: wants }, { data: conn }] = await Promise.all([
        db.from('offers').select('*').eq('user_id', uid).eq('is_open', true),
        db.from('wants').select('*').eq('user_id', uid).eq('is_open', true),
        db.from('connections').select('*')
          .or(`from_user.eq.${user.user_id},to_user.eq.${user.user_id}`)
          .or(`from_user.eq.${uid},to_user.eq.${uid}`),
      ]);
      const myConn = (conn || []).find(c =>
        (c.from_user === user.user_id && c.to_user === parseInt(uid)) ||
        (c.to_user === user.user_id && c.from_user === parseInt(uid))
      );
      return res.json({ user: u, offers: offers || [], wants: wants || [], connection: myConn || null });
    }
    let query = db.from('users')
      .select('*, offers(category, title, rtype), wants(category, title)')
      .eq('status', 'active')
      .neq('id', user.user_id)
      .order('created_at', { ascending: false })
      .limit(40);
    if (area) query = query.eq('area', area);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    let result = data || [];
    if (category) {
      result = result.filter(u =>
        (u.offers || []).some(o => o.category === category) ||
        (u.wants || []).some(w => w.category === category)
      );
    }
    return res.json(result);
  }

  // POST: つながり申請・承認・拒否
  if (req.method === 'POST') {
    const { action, to_user, connection_id } = req.body;
    if (action === 'request') {
      if (!to_user) return res.status(400).json({ error: 'to_user is required' });
      const { data, error } = await db.from('connections').insert({
        from_user: user.user_id, to_user: parseInt(to_user), status: 'pending',
      }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    if (action === 'accept') {
      await db.from('connections').update({ status: 'accepted' })
        .eq('id', connection_id).eq('to_user', user.user_id);
      return res.json({ ok: true });
    }
    if (action === 'decline') {
      await db.from('connections').update({ status: 'declined' })
        .eq('id', connection_id).eq('to_user', user.user_id);
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: '不正なaction' });
  }

  res.status(405).end();
};
