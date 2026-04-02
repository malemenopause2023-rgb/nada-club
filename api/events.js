const { createClient } = require('@supabase/supabase-js');
const { require_auth } = require('./_auth');

module.exports = async (req, res) => {
  const user = require_auth(req, res);
  if (!user) return;
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // GET: イベント一覧
  if (req.method === 'GET') {
    const { filter = 'upcoming' } = req.query;
    const today = new Date().toISOString().split('T')[0];
    let query = db.from('events')
      .select('*, users(id, name, avatar, area, status), event_joins(user_id)')
      .order('event_date', { ascending: true })
      .limit(30);
    if (filter === 'upcoming') query = query.gte('event_date', today);
    else if (filter === 'past')  query = query.lt('event_date', today);
    else if (filter === 'mine')  query = query.eq('user_id', user.user_id);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    const result = (data || [])
      .filter(e => e.users?.status === 'active' || filter === 'mine')
      .map(e => ({
        ...e,
        join_count: e.event_joins?.length || 0,
        joined: (e.event_joins || []).some(j => j.user_id === user.user_id),
      }));
    return res.json(result);
  }

  // POST: イベント保存・削除・参加表明・参加取消
  if (req.method === 'POST') {
    const { action } = req.body;

    // 参加表明・取消
    if (action === 'join' || action === 'cancel_join') {
      const { event_id } = req.body;
      if (!event_id) return res.status(400).json({ error: 'event_id is required' });
      if (action === 'cancel_join') {
        await db.from('event_joins').delete().eq('event_id', event_id).eq('user_id', user.user_id);
        return res.json({ ok: true });
      }
      const { data, error } = await db.from('event_joins').insert({
        event_id: parseInt(event_id), user_id: user.user_id,
      }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    // イベント削除
    const { delete_id } = req.body;
    if (delete_id) {
      await db.from('events').delete().eq('id', delete_id).eq('user_id', user.user_id);
      return res.json({ ok: true });
    }

    // イベント新規登録
    const { title, description = '', category = 'other', event_date,
            event_time = null, location = '', capacity = 0 } = req.body;
    if (!title || !event_date) return res.status(400).json({ error: 'タイトルと日付は必須です' });
    const { data, error } = await db.from('events').insert({
      user_id: user.user_id, title, description, category, event_date,
      event_time: event_time || null, location, capacity: parseInt(capacity) || 0,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.status(405).end();
};
