const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'https://' + req.headers.host);
  const action = url.searchParams.get('action');

  if (action === 'login') {
    const state = Math.random().toString(36).slice(2) + Date.now();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINE_CHANNEL_ID,
      redirect_uri: process.env.APP_URL + '/api/auth?action=callback',
      state,
      scope: 'profile openid',
    });
    res.setHeader('Set-Cookie', `nc_state=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
    return res.redirect('https://access.line.me/oauth2/v2.1/authorize?' + params);
  }

  if (action === 'callback') {
    const code = url.searchParams.get('code');
    const returnedState = url.searchParams.get('state');
    const cookies = req.headers.cookie || '';
    const match = cookies.match(/nc_state=([^;]+)/);
    const savedState = match ? match[1] : null;

    // stateが一致しない、または既に使用済みなら何もせず終了（二重発火対策）
    if (!code || !returnedState || returnedState !== savedState) {
      return res.redirect('/?error=invalid_state');
    }

    // 使用済みにする（Cookieを即座に無効化）
    res.setHeader('Set-Cookie', `nc_state=; Path=/; Max-Age=0`);

    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.APP_URL + '/api/auth?action=callback',
        client_id: process.env.LINE_CHANNEL_ID,
        client_secret: process.env.LINE_CHANNEL_SECRET,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect('/?error=token_failed');

    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
    });
    const { userId: line_uid, displayName: line_name } = await profileRes.json();

    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    const { count } = await db
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('line_uid', line_uid);

    const isNew = count === 0;

    let user;
    if (isNew) {
      const { data } = await db
        .from('users')
        .insert({ line_uid, line_name, name: line_name, status: 'active' })
        .select()
        .single();
      user = data;
    } else {
      const { data } = await db
        .from('users')
        .update({ line_name })
        .eq('line_uid', line_uid)
        .select()
        .single();
      user = data;
    }

    const token = jwt.sign(
      { user_id: user.id, line_uid, name: user.name, status: user.status },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return res.redirect((isNew ? '/onboard' : '/home') + '?token=' + token);
  }

  res.status(400).json({ error: 'invalid action' });
};
