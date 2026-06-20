const express = require('express');
const session = require('express-session');
const path = require('path');
const Database = require('./database');

function startServer(client) {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(session({
    secret: process.env.SESSION_SECRET || 'anti-bot-session-secret-12345',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000
    }
  }));

  app.use(express.json());

  app.use(express.static(path.join(__dirname, 'public')));

  function requireAuth(req, res, next) {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized. Please login first.' });
    }
    next();
  }

  app.get('/api/auth/login', (req, res) => {
    const clientId = process.env.CLIENT_ID;
    const redirectUri = process.env.REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return res.status(500).send('Server error: CLIENT_ID and REDIRECT_URI must be configured in .env');
    }

    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds`;
    res.redirect(discordAuthUrl);
  });

  app.get('/api/auth/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.redirect('/?error=no_code');
    }

    try {
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: process.env.REDIRECT_URI
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error('Token exchange error:', errorData);
        return res.redirect('/?error=token_exchange_failed');
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      const tokenType = tokenData.token_type;

      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: {
          authorization: `${tokenType} ${accessToken}`
        }
      });
      const userData = await userResponse.json();

      const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: {
          authorization: `${tokenType} ${accessToken}`
        }
      });
      const guildsData = await guildsResponse.json();
      const MANAGE_GUILD = 0x20n;
      const ADMINISTRATOR = 0x8n;

      const adminGuilds = Array.isArray(guildsData) ? guildsData.filter(guild => {
        try {
          const perms = BigInt(guild.permissions);
          return (perms & MANAGE_GUILD) === MANAGE_GUILD || (perms & ADMINISTRATOR) === ADMINISTRATOR;
        } catch (e) {
          return false;
        }
      }) : [];

      req.session.user = {
        id: userData.id,
        username: userData.username,
        avatar: userData.avatar,
        guilds: adminGuilds
      };

      res.redirect('/dashboard');
    } catch (error) {
      console.error('Error during Discord OAuth2 callback:', error);
      res.redirect('/?error=server_error');
    }
  });

  app.get('/api/auth/user', (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ authenticated: false });
    }

    const guilds = req.session.user.guilds.map(guild => {
      const isBotInGuild = client.guilds.cache.has(guild.id);
      return {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        botInGuild: isBotInGuild
      };
    });

    res.json({
      authenticated: true,
      clientId: process.env.CLIENT_ID,
      user: {
        id: req.session.user.id,
        username: req.session.user.username,
        avatar: req.session.user.avatar
      },
      guilds: guilds
    });
  });

  app.get('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.json({ success: true });
    });
  });

  function checkGuildPermission(req, res, next) {
    const { guildId } = req.params;
    if (!req.session.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const managesGuild = req.session.user.guilds.some(g => g.id === guildId);
    if (!managesGuild) {
      return res.status(403).json({ error: 'Forbidden. You do not manage this server.' });
    }
    next();
  }

  app.get('/api/guilds/:guildId/config', requireAuth, checkGuildPermission, (req, res) => {
    const { guildId } = req.params;
    const isBotInGuild = client.guilds.cache.has(guildId);

    if (!isBotInGuild) {
      return res.status(400).json({ error: 'Bot is not in this guild. Please invite it first.' });
    }

    const guildObj = client.guilds.cache.get(guildId);
    
    const channels = guildObj.channels.cache
      .filter(c => c.type === 0)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, name: c.name }));

    const roles = guildObj.roles.cache
      .filter(r => r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor }));

    const config = Database.get(guildId);

    res.json({
      guildName: guildObj.name,
      guildIcon: guildObj.icon,
      channels,
      roles,
      config
    });
  });

  app.post('/api/guilds/:guildId/config', requireAuth, checkGuildPermission, (req, res) => {
    const { guildId } = req.params;
    const isBotInGuild = client.guilds.cache.has(guildId);

    if (!isBotInGuild) {
      return res.status(400).json({ error: 'Bot is not in this guild.' });
    }

    const {
      enabled,
      targetChannelId,
      logChannelId,
      action,
      deleteMessageSeconds,
      reason,
      bypassRoles,
      bypassUsers
    } = req.body;

    const updatedConfig = {};
    if (typeof enabled === 'boolean') updatedConfig.enabled = enabled;
    updatedConfig.targetChannelId = targetChannelId || null;
    updatedConfig.logChannelId = logChannelId || null;
    
    if (['ban', 'kick', 'timeout', 'none'].includes(action)) {
      updatedConfig.action = action;
    }
    
    if (typeof deleteMessageSeconds === 'number') {
      updatedConfig.deleteMessageSeconds = deleteMessageSeconds;
    }
    
    if (typeof reason === 'string') {
      updatedConfig.reason = reason.trim().substring(0, 512);
    }
    
    if (Array.isArray(bypassRoles)) {
      updatedConfig.bypassRoles = bypassRoles.filter(id => typeof id === 'string');
    }
    
    if (Array.isArray(bypassUsers)) {
      updatedConfig.bypassUsers = bypassUsers
        .filter(id => typeof id === 'string')
        .map(id => id.trim())
        .filter(id => /^\d+$/.test(id));
    }

    Database.set(guildId, updatedConfig);

    res.json({ success: true, config: Database.get(guildId) });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.listen(PORT, () => {
    console.log(`Web Dashboard is running at http://localhost:${PORT}`);
  });
}

module.exports = startServer;
