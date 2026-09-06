const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'https://' + req.headers.host);
  const action = url.searchParams.get('action');

  // ── LINEログイン開始 ──────────────────────────────
  if (action === 'login') {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINE_CHANNEL_ID,
      redirect_uri: process.env.APP_URL + '/api/auth?action=callback',
      state: Math.random().toString(36).slice(2),
      scope: 'profile openid',
    });
    return res.redirect('https://access.line.me/oauth2/v2.1/authorize?' + params);
  }

  // ── LINEコールバック ──────────────────────────────
  if (action === 'callback') {
    const code = url.searchParams.get('code');
    if (!code) return res.redirect('/?error=no_code');
    try {
      // 1. アクセストークン取得
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
      if (!tokenData.access_token) {
        console.error('token error:', tokenData);
        return res.redirect('/?error=token_failed');
      }

      // 2. LINEプロフィール取得
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: 'Bearer ' + tokenData.access_token },
      });
      const { userId: line_uid, displayName: line_name } = await profileRes.json();

      // 3. Supabaseにupsert
      const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
      let { data: user } = await db.from('users').select('*').eq('line_uid', line_uid).single();

      if (!user) {
        // 完全な初回：レコード自体が存在しない
        const { data: newUser, error: insertError } = await db.from('users')
          .insert({ line_uid, line_name, name: line_name, status: 'active' })
          .select().single();
        if (insertError) {
          console.error('insert error:', insertError);
          return res.redirect('/?error=db_error');
        }
        user = newUser;
      } else {
        // 既存レコードあり：LINE名だけ更新（ニックネームnameは触らない）
        await db.from('users').update({ line_name }).eq('id', user.id);
        user.line_name = line_name;
      }

      // 4. 停止中は弾く
      if (user.status === 'suspended') {
        return res.redirect('/?error=suspended');
      }

      // 5. ニックネーム未設定判定：line_name と name が同じならまだ設定していない
      const needs_onboard = user.line_name === user.name;

      // 6. JWT発行
      const token = jwt.sign(
        { user_id: user.id, line_uid, name: user.name, status: user.status },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      if (needs_onboard) {
        return res.redirect('/onboard?token=' + token);
      }
      return res.redirect('/home?token=' + token);

    } catch (e) {
      console.error('callback error:', e);
      return res.redirect('/?error=server_error');
    }
  }

  res.status(400).json({ error: 'invalid action' });
};
