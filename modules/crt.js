const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

// ========================================================
// API BARU (Go API Server)
// ========================================================
// Bot lama → API baru:
//   - Port 5888 → https://domain/api
//   - GET + query → POST + JSON
//   - auth=KEY → Authorization: Bearer TOKEN
//   - {status:"success"} → {success:true}
// ========================================================

// Helper: API request ke server baru
async function apiRequest(domain, token, endpoint, method = 'POST', data = null) {
  const url = `https://${domain}/api${endpoint}`;
  const config = {
    method: method,
    url: url,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  };
  if (data) config.data = data;

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      return error.response.data;
    }
    throw error;
  }
}

// ========================================================
// TRIAL SSH
// ========================================================
async function trialssh(username, password, exp, iplimit, serverId) {
  console.log(`Creating trial SSH for ${username}`);
  
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], async (err, server) => {
      if (err || !server) return resolve('❌ Gagal: Server tidak ditemukan.');

      try {
        const response = await apiRequest(
          server.domain,
          server.auth,
          '/trials/ssh',
          'POST',
          {
            username: username,
            password: password,
            expired: parseInt(exp),
            limit_ip: parseInt(iplimit)
          }
        );

        if (response.success === true) {
          const sshData = response.data;
          const msg = `
──────────────────────           
                 *✨SSH ACCOUNT✨*
──────────────────────
*Domain* : \`${sshData.domain}\`
*Username* : \`${sshData.username}\`
*Password* : \`${sshData.password}\`
*Port TLS* : \`443\`
*Port HTTP*: \`80\`
*OpenSSH* : \`22\`
*Dropbear* : \`109\`
───────────────────────
🫧*HTTP CUSTOM*
\`${sshData.domain}:80@${sshData.username}:${sshData.password}\`
───────────────────────
🫧*Save Account*: [Click Link](https://${sshData.domain}/vvip/ssh-${sshData.username}.txt)
──────────────────────
*📅IP Limit*: \`${sshData.limit_ip}\`
*⏳Expired*: \`${sshData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
          return resolve(msg);
        } else {
          return resolve(`❌ Gagal: ${response.message}`);
        }
      } catch (error) {
        console.error('Error:', error.message);
        return resolve('❌ Gagal: Server tidak merespon.');
      }
    });
  });
}

// ========================================================
// TRIAL VMESS
// ========================================================
async function trialvmess(username, exp, quota, limitip, serverId) {
  console.log(`Creating trial VMess for ${username}`);

  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], async (err, server) => {
      if (err || !server) return resolve('❌ Gagal: Server tidak ditemukan.');

      try {
        const response = await apiRequest(
          server.domain,
          server.auth,
          '/trials/vmess',
          'POST',
          {
            username: username,
            expired: parseInt(exp),
            quota: parseInt(quota),
            limit_ip: parseInt(limitip)
          }
        );

        if (response.success === true) {
          const vmessData = response.data;
          const msg = `
────────────────────── 
              *✨VMESS ACCOUNT✨*
──────────────────────
*Username* : \`${vmessData.username}\`
*Domain* : \`${vmessData.domain}\`
*UUID* : \`${vmessData.uuid}\`
*Path* : \`/vmess\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${vmessData.vmess_tls_link || 'N/A'}
\`\`\`
──────────────────────
🚀*Quota*: \`${vmessData.quota || 'Unlimited'}\`
🌤*IP Limit*: \`${vmessData.limit_ip}\`
⏳*Expired*: \`${vmessData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
          return resolve(msg);
        } else {
          return resolve(`❌ Gagal: ${response.message}`);
        }
      } catch (error) {
        console.error('Error:', error.message);
        return resolve('❌ Gagal: Server tidak merespon.');
      }
    });
  });
}

// ========================================================
// TRIAL VLESS
// ========================================================
async function trialvless(username, exp, quota, limitip, serverId) {
  console.log(`Creating trial VLESS for ${username}`);

  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], async (err, server) => {
      if (err || !server) return resolve('❌ Gagal: Server tidak ditemukan.');

      try {
        const response = await apiRequest(
          server.domain,
          server.auth,
          '/trials/vless',
          'POST',
          {
            username: username,
            expired: parseInt(exp),
            quota: parseInt(quota),
            limit_ip: parseInt(limitip)
          }
        );

        if (response.success === true) {
          const vlessData = response.data;
          const msg = `
────────────────────── 
               *✨VLESS ACCOUNT✨*
──────────────────────
*Username* : \`${vlessData.username}\`
*Domain* : \`${vlessData.domain}\`
*UUID* : \`${vlessData.uuid}\`
*Path* : \`/vless\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${vlessData.vless_tls_link || 'N/A'}
\`\`\`
──────────────────────
🚀*Quota*: \`${vlessData.quota || 'Unlimited'}\`
🌤*IP Limit*: \`${vlessData.limit_ip}\`
⏳*Expired*: \`${vlessData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
          return resolve(msg);
        } else {
          return resolve(`❌ Gagal: ${response.message}`);
        }
      } catch (error) {
        console.error('Error:', error.message);
        return resolve('❌ Gagal: Server tidak merespon.');
      }
    });
  });
}

// ========================================================
// TRIAL TROJAN
// ========================================================
async function trialtrojan(username, exp, quota, limitip, serverId) {
  console.log(`Creating trial Trojan for ${username}`);

  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], async (err, server) => {
      if (err || !server) return resolve('❌ Gagal: Server tidak ditemukan.');

      try {
        const response = await apiRequest(
          server.domain,
          server.auth,
          '/trials/trojan',
          'POST',
          {
            username: username,
            expired: parseInt(exp),
            quota: parseInt(quota),
            limit_ip: parseInt(limitip)
          }
        );

        if (response.success === true) {
          const trojanData = response.data;
          const msg = `
────────────────────── 
            *✨TROJAN ACCOUNT✨*
──────────────────────
*Username* : \`${trojanData.username}\`
*Domain* : \`${trojanData.domain}\`
*UUID* : \`${trojanData.uuid}\`
*Path* : \`/trojan\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${trojanData.trojan_tls_link || 'N/A'}
\`\`\`
──────────────────────
🚀*Quota*: \`${trojanData.quota || 'Unlimited'}\`
🌤*IP Limit*: \`${trojanData.limit_ip}\`
⏳*Expired*: \`${trojanData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
          return resolve(msg);
        } else {
          return resolve(`❌ Gagal: ${response.message}`);
        }
      } catch (error) {
        console.error('Error:', error.message);
        return resolve('❌ Gagal: Server tidak merespon.');
      }
    });
  });
}

// ========================================================
// CREATE SSH
// ========================================================
async function createssh(username, password, exp, iplimit, serverId) {
  console.log(`Creating SSH for ${username}`);

  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], async (err, server) => {
      if (err || !server) return resolve('❌ Gagal: Server tidak ditemukan.');

      try {
        const response = await apiRequest(
          server.domain,
          server.auth,
          '/accounts/ssh',
          'POST',
          {
            username: username,
            password: password,
            expired: parseInt(exp),
            limit_ip: parseInt(iplimit)
          }
        );

        if (response.success === true) {
          const sshData = response.data;
          const msg = `
──────────────────────           
                 *✨SSH ACCOUNT✨*
──────────────────────
*Domain* : \`${sshData.domain}\`
*Username* : \`${sshData.username}\`
*Password* : \`${sshData.password}\`
*Port TLS* : \`443\`
*Port HTTP*: \`80\`
*OpenSSH* : \`22\`
*Dropbear* : \`109\`
───────────────────────
🫧*HTTP CUSTOM*
\`${sshData.domain}:80@${sshData.username}:${sshData.password}\`
───────────────────────
🫧*Save Account*: [Click Link](https://${sshData.domain}/vvip/ssh-${sshData.username}.txt)
──────────────────────
🚀*IP Limit*: \`${sshData.limit_ip}\`
⏳*Expired*: \`${sshData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
          return resolve(msg);
        } else {
          return resolve(`❌ Gagal: ${response.message}`);
        }
      } catch (error) {
        console.error('Error:', error.message);
        return resolve('❌ Gagal: Server tidak merespon.');
      }
    });
  });
}

// ========================================================
// CREATE VMESS
// ========================================================
async function createvmess(username, exp, quota, limitip, serverId) {
  console.log(`Creating VMess for ${username}`);

  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], async (err, server) => {
      if (err || !server) return resolve('❌ Gagal: Server tidak ditemukan.');

      try {
        const response = await apiRequest(
          server.domain,
          server.auth,
          '/accounts/vmess',
          'POST',
          {
            username: username,
            expired: parseInt(exp),
            quota: parseInt(quota),
            limit_ip: parseInt(limitip)
          }
        );

        if (response.success === true) {
          const vmessData = response.data;
          const msg = `
────────────────────── 
              *✨VMESS ACCOUNT✨*
──────────────────────
*Username* : \`${vmessData.username}\`
*Domain* : \`${vmessData.domain}\`
*UUID* : \`${vmessData.uuid}\`
*Path* : \`/vmess\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${vmessData.vmess_tls_link || 'N/A'}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](https://${vmessData.domain}/vvip/vmess-${vmessData.username}.txt)
──────────────────────
🚀*Quota*: \`${vmessData.quota || 'Unlimited'}\`
🌤*IP Limit*: \`${vmessData.limit_ip}\`
⏳*Expired*: \`${vmessData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
          return resolve(msg);
        } else {
          return resolve(`❌ Gagal: ${response.message}`);
        }
      } catch (error) {
        console.error('Error:', error.message);
        return resolve('❌ Gagal: Server tidak merespon.');
      }
    });
  });
}

// ========================================================
// CREATE VLESS
// ========================================================
async function createvless(username, exp, quota, limitip, serverId) {
  console.log(`Creating VLESS for ${username}`);

  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], async (err, server) => {
      if (err || !server) return resolve('❌ Gagal: Server tidak ditemukan.');

      try {
        const response = await apiRequest(
          server.domain,
          server.auth,
          '/accounts/vless',
          'POST',
          {
            username: username,
            expired: parseInt(exp),
            quota: parseInt(quota),
            limit_ip: parseInt(limitip)
          }
        );

        if (response.success === true) {
          const vlessData = response.data;
          const msg = `
────────────────────── 
               *✨VLESS ACCOUNT✨*
──────────────────────
*Username* : \`${vlessData.username}\`
*Domain* : \`${vlessData.domain}\`
*UUID* : \`${vlessData.uuid}\`
*Path* : \`/vless\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${vlessData.vless_tls_link || 'N/A'}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](https://${vlessData.domain}/vvip/vless-${vlessData.username}.txt)
──────────────────────
🚀*Quota*: \`${vlessData.quota || 'Unlimited'}\`
🌤*IP Limit*: \`${vlessData.limit_ip}\`
⏳*Expired*: \`${vlessData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
          return resolve(msg);
        } else {
          return resolve(`❌ Gagal: ${response.message}`);
        }
      } catch (error) {
        console.error('Error:', error.message);
        return resolve('❌ Gagal: Server tidak merespon.');
      }
    });
  });
}

// ========================================================
// CREATE TROJAN
// ========================================================
async function createtrojan(username, exp, quota, limitip, serverId) {
  console.log(`Creating Trojan for ${username}`);

  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], async (err, server) => {
      if (err || !server) return resolve('❌ Gagal: Server tidak ditemukan.');

      try {
        const response = await apiRequest(
          server.domain,
          server.auth,
          '/accounts/trojan',
          'POST',
          {
            username: username,
            expired: parseInt(exp),
            quota: parseInt(quota),
            limit_ip: parseInt(limitip)
          }
        );

        if (response.success === true) {
          const trojanData = response.data;
          const msg = `
────────────────────── 
            *✨TROJAN ACCOUNT✨*
──────────────────────
*Username* : \`${trojanData.username}\`
*Domain* : \`${trojanData.domain}\`
*UUID* : \`${trojanData.uuid}\`
*Path* : \`/trojan\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${trojanData.trojan_tls_link || 'N/A'}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](https://${trojanData.domain}/vvip/trojan-${trojanData.username}.txt)
──────────────────────
🚀*Quota*: \`${trojanData.quota || 'Unlimited'}\`
🌤*IP Limit*: \`${trojanData.limit_ip}\`
⏳*Expired*: \`${trojanData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
          return resolve(msg);
        } else {
          return resolve(`❌ Gagal: ${response.message}`);
        }
      } catch (error) {
        console.error('Error:', error.message);
        return resolve('❌ Gagal: Server tidak merespon.');
      }
    });
  });
}

module.exports = { trialssh, trialvmess, trialvless, trialtrojan, createssh, createvmess, createvless, createtrojan };
