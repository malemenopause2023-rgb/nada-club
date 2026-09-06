const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'https://' + req.headers.host);
  const action = url.searchParams.get('action');

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

  if (action === 'callback') {
    const code = url.searchParams.get('code');
    if (!code) return res.redirect('/?error=no_code');

    try {
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
        return res.redirect('/?error=token_failed');
      }

      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: 'Bearer ' + tokenData.access_token },
      });
      const { userId: line_uid, displayName: line_name } = await profileRes.json();

      const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

      // 既存ユーザーを検索（存在しなければ data は null）
      const { data: existingUser } = await db
        .from('users')
        .select('*')
        .eq('line_uid', line_uid)
        .maybeSingle();

      let finalUser;
      let redirectPath;

      if (existingUser) {
        // ケースA：既存ユーザー → home へ
        await db.from('users').update({ line_name }).eq('id', existingUser.id);
        finalUser = existingUser;
        redirectPath = '/home';
      } else {
        // ケースB：新規ユーザー → onboard へ
        const { data: newUser, error: insertError } = await db
          .from('users')
          .insert({ line_uid, line_name, name: line_name, status: 'active' })
          .select()
          .single();
        if (insertError) {
          console.error('insert error:', insertError);
          return res.redirect('/?error=db_error');
        }
        finalUser = newUser;
        redirectPath = '/onboard';
      }

      if (finalUser.status === 'suspended') {
        return res.redirect('/?error=suspended');
      }

      const token = jwt.sign(
        { user_id: finalUser.id, line_uid, name: finalUser.name, status: finalUser.status },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      return res.redirect(redirectPath + '?token=' + token);

    } catch (e) {
      console.error('callback error:', e);
      return res.redirect('/?error=server_error');
    }
  }

  res.status(400).json({ error: 'invalid action' });
};
