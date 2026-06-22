let currentUser = null;
let clientId = null;
let currentGuildId = null;
let activeConfig = null;

document.addEventListener('DOMContentLoaded', () => {
  init();
});

async function init() {
  try {
    const response = await fetch('/api/auth/user');
    if (response.status === 401) {
      window.location.href = '/';
      return;
    }
    
    const data = await response.json();
    currentUser = data.user;
    clientId = data.clientId;
    
    renderHeader(data.user);
    renderServers(data.guilds);
  } catch (error) {
    console.error('Failed to initialize dashboard:', error);
    showToast('Failed to load dashboard data. Please try logging in again.', 'error');
  }
}

function renderHeader(user) {
  const headerUser = document.getElementById('header-user');
  const avatarUrl = user.avatar 
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';
  
  headerUser.innerHTML = `
    <div class="user-profile">
      <div class="avatar" style="background-image: url('${avatarUrl}')"></div>
      <span class="username">${user.username}</span>
      <button class="btn-logout" onclick="logout()">Logout</button>
    </div>
  `;
}

function renderServers(guilds) {
  const container = document.getElementById('server-list-container');
  if (!guilds || guilds.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">
        <h3>No manageable servers found.</h3>
        <p style="margin-top: 10px; font-size: 14px;">You must have 'Manage Server' or 'Administrator' permissions on a server to configure the bot.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  guilds.forEach(guild => {
    const card = document.createElement('div');
    card.className = 'server-card glass-panel';
    
    let iconHtml = '';
    if (guild.icon) {
      const iconUrl = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
      iconHtml = `<div class="server-icon" style="background-image: url('${iconUrl}')"></div>`;
    } else {
      const initials = guild.name.split(' ').map(w => w[0]).join('').substring(0, 3).toUpperCase();
      iconHtml = `<div class="server-icon">${initials}</div>`;
    }

    const statusClass = guild.botInGuild ? 'status-active' : 'status-inactive';
    const statusText = guild.botInGuild ? '● Protected' : '● Not Configured';
    
    let actionBtnHtml = '';
    if (guild.botInGuild) {
      actionBtnHtml = `<button class="btn-primary" onclick="configureGuild('${guild.id}')">Configure</button>`;
    } else {
      const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=4&scope=bot&guild_id=${guild.id}&disable_guild_select=true`;
      actionBtnHtml = `<a href="${inviteUrl}" target="_blank" class="btn-secondary" onclick="setTimeout(init, 3000)">Invite Bot</a>`;
    }

    card.innerHTML = `
      <div class="server-info">
        ${iconHtml}
        <div>
          <div class="server-name" title="${guild.name}">${guild.name}</div>
          <span class="server-status ${statusClass}">${statusText}</span>
        </div>
      </div>
      <div style="margin-top: 20px;">
        ${actionBtnHtml}
      </div>
    `;
    container.appendChild(card);
  });
}

async function configureGuild(guildId) {
  currentGuildId = guildId;
  const serverSelectionView = document.getElementById('server-selection-view');
  const configView = document.getElementById('config-view');
  
  try {
    const response = await fetch(`/api/guilds/${guildId}/config`);
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to load configuration');
    }
    
    const data = await response.json();
    activeConfig = data.config;
    
    const titleElem = document.getElementById('config-server-title');
    titleElem.innerText = data.guildName;
    
    const iconElem = document.getElementById('config-server-icon');
    if (data.guildIcon) {
      const iconUrl = `https://cdn.discordapp.com/icons/${guildId}/${data.guildIcon}.png`;
      iconElem.style.backgroundImage = `url('${iconUrl}')`;
      iconElem.innerText = '';
    } else {
      const initials = data.guildName.split(' ').map(w => w[0]).join('').substring(0, 3).toUpperCase();
      iconElem.style.backgroundImage = 'none';
      iconElem.innerText = initials;
    }
    
    const targetSelect = document.getElementById('field-target-channel');
    targetSelect.innerHTML = '<option value="">Fallback (#antibot)</option>';
    data.channels.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.innerText = `#${ch.name}`;
      targetSelect.appendChild(opt);
    });
    
    const logSelect = document.getElementById('field-log-channel');
    logSelect.innerHTML = '<option value="">Fallback (#antibot-logs)</option>';
    data.channels.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.innerText = `#${ch.name}`;
      logSelect.appendChild(opt);
    });
    
    document.getElementById('field-enabled').checked = activeConfig.enabled;
    targetSelect.value = activeConfig.targetChannelId || '';
    logSelect.value = activeConfig.logChannelId || '';
    document.getElementById('field-action').value = activeConfig.action;
    document.getElementById('field-delete-history').value = activeConfig.deleteMessageSeconds;
    document.getElementById('field-reason').value = activeConfig.reason || '';
    
    const roleContainer = document.getElementById('role-selector-container');
    roleContainer.innerHTML = '';
    if (data.roles.length === 0) {
      roleContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 13px; padding: 4px;">No server roles found.</div>';
    } else {
      data.roles.forEach(role => {
        const option = document.createElement('div');
        const isSelected = activeConfig.bypassRoles.includes(role.id);
        option.className = `role-option ${isSelected ? 'selected' : ''}`;
        option.setAttribute('data-id', role.id);
        
        const dotColor = role.color === '#000000' ? '#9ca3af' : role.color;
        
        option.innerHTML = `
          <span class="role-dot" style="background-color: ${dotColor}"></span>
          <span>${role.name}</span>
        `;
        
        option.addEventListener('click', () => {
          option.classList.toggle('selected');
        });
        
        roleContainer.appendChild(option);
      });
    }
    
    document.getElementById('field-bypass-users').value = (activeConfig.bypassUsers || []).join(', ');
    
    togglePunishmentFields();
    
    serverSelectionView.style.display = 'none';
    configView.style.display = 'block';
    
    const firstTabBtn = document.querySelector('.tab-btn');
    switchTab('general', firstTabBtn);
    
  } catch (error) {
    console.error('Error fetching server config:', error);
    showToast(error.message, 'error');
  }
}

function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  document.querySelectorAll('.config-section').forEach(sec => sec.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');
}

function togglePunishmentFields() {
  const action = document.getElementById('field-action').value;
  const historyGroup = document.getElementById('group-delete-history');
  const reasonGroup = document.getElementById('group-reason');
  
  if (action === 'none') {
    historyGroup.style.display = 'none';
    reasonGroup.style.display = 'none';
  } else if (action === 'kick') {
    historyGroup.style.display = 'none';
    reasonGroup.style.display = 'flex';
  } else if (action === 'timeout') {
    historyGroup.style.display = 'none';
    reasonGroup.style.display = 'flex';
  } else {
    historyGroup.style.display = 'flex';
    reasonGroup.style.display = 'flex';
  }
}

async function saveConfig(event) {
  event.preventDefault();
  
  const saveBtn = document.getElementById('save-btn');
  const originalBtnText = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = `<div class="spinner"></div> <span>Saving...</span>`;
  
  const selectedRoleOptions = document.querySelectorAll('.role-option.selected');
  const bypassRoles = Array.from(selectedRoleOptions).map(opt => opt.getAttribute('data-id'));
  
  const bypassUsersRaw = document.getElementById('field-bypass-users').value;
  const bypassUsers = bypassUsersRaw
    .split(',')
    .map(id => id.trim())
    .filter(id => id !== '');
  
  const configPayload = {
    enabled: document.getElementById('field-enabled').checked,
    targetChannelId: document.getElementById('field-target-channel').value || null,
    logChannelId: document.getElementById('field-log-channel').value || null,
    action: document.getElementById('field-action').value,
    deleteMessageSeconds: parseInt(document.getElementById('field-delete-history').value, 10),
    reason: document.getElementById('field-reason').value,
    bypassRoles,
    bypassUsers
  };
  
  try {
    const response = await fetch(`/api/guilds/${currentGuildId}/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(configPayload)
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to save configuration');
    }
    
    const data = await response.json();
    activeConfig = data.config;
    
    showToast('Configuration updated successfully!');
  } catch (error) {
    console.error('Error saving configuration:', error);
    showToast(error.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalBtnText;
  }
}

function showServerList() {
  document.getElementById('config-view').style.display = 'none';
  const serverView = document.getElementById('server-selection-view');
  serverView.style.display = 'block';
  
  init();
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '';
  if (type === 'success') {
    icon = `<svg style="width:18px; height:18px; fill:currentColor;" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
  } else {
    icon = `<svg style="width:18px; height:18px; fill:currentColor;" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`;
  }
  
  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s reverse forwards';
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4000);
}

async function logout() {
  try {
    const response = await fetch('/api/auth/logout');
    if (response.ok) {
      window.location.href = '/';
    }
  } catch (error) {
    console.error('Logout error:', error);
    showToast('Failed to log out.', 'error');
  }
}
