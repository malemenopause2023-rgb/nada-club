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

    if (filter === 'joined') {
      const { data: joins } = await db.from('event_joins').select('event_id').eq('user_id', user.user_id);
      const ids = (joins || []).map(j => j.event_id);
      if (!ids.length) return res.json([]);
      const { data, error } = await db.from('events')
        .select('*, users(id, name, avatar, area, status), event_joins(user_id)')
        .in('id', ids)
        .order('event_date', { ascending: true });
      if (error) return res.status(500).json({ error: error.message });
      const result = (data || []).map(e => ({
        ...e, join_count: e.event_joins?.length || 0,
        joined: (e.event_joins || []).some(j => j.user_id === user.user_id),
      }));
      return res.json(result);
    }

    let query = db.from('events')
      .select('*, users(id, name, avatar, area, status), event_joins(user_id)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (filter === 'upcoming') {
      // 日時ありは開催日順、日時なし（相談）も一緒に含める
      query = db.from('events')
        .select('*, users(id, name, avatar, area, status), event_joins(user_id)')
        .or(`event_date.gte.${today},event_date.is.null`)
        .order('created_at', { ascending: false })
        .limit(30);
    } else if (filter === 'mine') {
      query = query.eq('user_id', user.user_id);
    }

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

  // POST
  if (req.method === 'POST') {
    const { action } = req.body;

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

    const { delete_id } = req.body;
    if (delete_id) {
      await db.from('events').delete().eq('id', delete_id).eq('user_id', user.user_id);
      return res.json({ ok: true });
    }

    const { title, description = '', category = 'other', event_date = null,
            event_time = null, deadline = null, location = '', capacity = 0, items = '' } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'タイトルと内容は必須です' });

    const { data, error } = await db.from('events').insert({
      user_id: user.user_id, title, description, category,
      event_date: event_date || null,
      event_time: event_time || null,
      deadline: deadline || null,
      location, capacity: parseInt(capacity) || 0,
      items,
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  res.status(405).end();
};
