const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

async function trialssh(username, password, exp, iplimit, serverId) {
  console.log(`Creating SSH account for ${username} with expiry ${exp} days, IP limit ${iplimit}, and password ${password}`);
  
  // Validasi username
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  // Ambil domain dari database
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
        return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      const param = `:5888/trialssh?user=${username}&password=${password}&exp=${exp}&iplimit=${iplimit}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const sshData = response.data.data;
            const msg = `
──────────────────────           
                 *✨SSH ACCOUNT✨*
──────────────────────
*Domain* : \`${sshData.domain}\`
*Nameserver*: \`${sshData.ns_domain}\`
*Username* : \`${sshData.username}\`
*Password* : \`${sshData.password}\`
*Port TLS* : \`443,8443\`
*Port HTTP*: \`80,8080,2086,8880\`
*OpenSSH* : \`22\`
*UdpSSH* : \`1-65535\`
*DNS* : \`53,2222\`
*Dropbear* : \`109,110\`
*BadVPN UDP*: \`7300\`
*Pub Key* : \`${sshData.pubkey}\`
───────────────────────
🫧*HTTP CUSTOM*
\`${sshData.domain}:80@${sshData.username}:${sshData.password}\`
───────────────────────
🫧*Payload*: 
\`GET /cdn-cgi/trace HTTP/1.1[crlf]Host: Bug_Kalian[crlf][crlf]GET-RAY / HTTP/1.1[crlf]Host: [host][crlf]Connection: Upgrade[crlf]User-Agent: [ua][crlf]Upgrade: websocket[crlf][crlf]\`
──────────────────────
🫧*Save Account*: [Click Link](https://${sshData.domain}:81/ssh-${sshData.username}.txt)
──────────────────────
*📅IP Limit*: \`${sshData.ip_limit}\`
*⏳Expired*: \`${sshData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
              console.log('SSH account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating SSH account');
              return resolve(`❌ Gagal: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat SSH:', error);
          return resolve('❌ Gagal membuat SSH. Silakan coba lagi nanti.');
        });
    });
  });
}
async function trialvmess(username, exp, quota, limitip, serverId) {
  console.log(`Creating VMess account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  
  // Validasi username
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  // Ambil domain dan auth dari database
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
        return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      const param = `:5888/trialvmess?user=${username}&exp=${exp}&quota=${quota}&iplimit=${limitip}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const vmessData = response.data.data;
            const msg = `
────────────────────── 
              *✨VMESS ACCOUNT✨*
──────────────────────
*Username* : \`${vmessData.username}\`
*Domain* : \`${vmessData.domain}\`
*Port TLS* : \`443,8443\`
*Port HTTP*: \`80,8080,2086,8880\`
*UUID* : \`${vmessData.uuid}\`
*Alter ID* : \`0\`
*Security* : \`Auto\`
*Path* : \`/vmess\`
*Path gRPC*: \`vmess-grpc\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${vmessData.vmess_tls_link}
\`\`\`
🫧*URL HTTP:*
\`\`\`
${vmessData.vmess_nontls_link}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${vmessData.vmess_grpc_link}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](https://${vmessData.domain}:81/vmess-${vmessData.username}.txt)
──────────────────────
🚀*Quota*: \`${vmessData.quota === '0 GB' ? 'Unlimited' : vmessData.quota}\`
🌤*IP Limit*: \`${vmessData.ip_limit === '0' ? 'Unlimited' : vmessData.ip_limit} IP\`
⏳*Expired*: \`${vmessData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
              console.log('VMess account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating VMess account');
              return resolve(`❌ Gagal: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat VMess:', error);
          return resolve('❌ Gagal membuat VMess. Silakan coba lagi nanti.');
        });
    });
  });
}
async function trialvless(username, exp, quota, limitip, serverId) {
  console.log(`Creating VLESS account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  
  // Validasi username
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  // Ambil domain dari database
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
        return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      const param = `:5888/trialvless?user=${username}&exp=${exp}&quota=${quota}&iplimit=${limitip}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const vlessData = response.data.data;
            const msg = `
────────────────────── 
               *✨VLESS ACCOUNT✨*
──────────────────────
*Username* : \`${vlessData.username}\`
*Domain* : \`${vlessData.domain}\`
*Port TLS* : \`443,8443\`
*Port HTTP*: \`80,8080,2086,8880\`
*UUID* : \`${vlessData.uuid}\`
*Path* : \`/vless\`
*Path gRPC*: \`vless-grpc\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${vlessData.vless_tls_link}
\`\`\`
🫧*URL HTTP:*
\`\`\`
${vlessData.vless_nontls_link}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${vlessData.vless_grpc_link}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](https://${vlessData.domain}:81/vless-${vlessData.username}.txt)
──────────────────────
🚀*Quota*: \`${vlessData.quota === '0 GB' ? 'Unlimited' : vlessData.quota}\`
🌤*IP Limit*: \`${vlessData.ip_limit === '0' ? 'Unlimited' : vlessData.ip_limit} IP\`
⏳*Expired*: \`${vlessData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
              console.log('VLESS account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating VLESS account');
              return resolve(`❌ Gagal: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat VLESS:', error);
          return resolve('❌ Gagal membuat VLESS. Silakan coba lagi nanti.');
        });
    });
  });
}
async function trialtrojan(username, exp, quota, limitip, serverId) {
  console.log(`Creating Trojan account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  // Ambil domain dari database
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
        return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      const param = `:5888/trialtrojan?user=${username}&exp=${exp}&quota=${quota}&iplimit=${limitip}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const trojanData = response.data.data;
            const msg = `
────────────────────── 
            *✨TROJAN ACCOUNT✨*
──────────────────────
*Username* : \`${trojanData.username}\`
*Domain* : \`${trojanData.domain}\`
*Port TLS* : \`443,8443\`
*Port HTTP*: \`80,8080,2086,8880\`
*UUID* : \`${trojanData.uuid}\`
*Path* : \`/trojan-ws\`
*Path gRPC*: \`trojan-grpc\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${trojanData.trojan_tls_link}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${trojanData.trojan_grpc_link}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](https://${trojanData.domain}:81/trojan-${trojanData.username}.txt)
──────────────────────
🚀*Quota*: \`${trojanData.quota === '0 GB' ? 'Unlimited' : trojanData.quota}\`
🌤*IP Limit*: \`${trojanData.ip_limit === '0' ? 'Unlimited' : trojanData.ip_limit} IP\`
⏳*Expired*: \`${trojanData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
              console.log('Trojan account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating Trojan account');
              return resolve(`❌ Gagal: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat Trojan:', error);
          return resolve('❌ Gagal membuat Trojan. Silakan coba lagi nanti.');
        });
    });
  });
}

async function trialshadowsocks(username, exp, quota, limitip, serverId) {
  console.log(`Creating Shadowsocks account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
        return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      const param = `:5888/trialshadowsocks?user=${username}&exp=${exp}&quota=${quota}&iplimit=${limitip}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const shadowsocksData = response.data.data;
            const msg = `
────────────────────── 
      *✨SHADOWSOCKS ACCOUNT✨*
──────────────────────
*Username* : \`${shadowsocksData.username}\`
*Domain* : \`${shadowsocksData.domain}\`
*Port TLS* : \`443,8443\`
*Port HTTP*: \`80,8080,2086,8880\`
*UUID* : \`${shadowsocksData.uuid}\`
*Path* : \`/ss-ws\`
*Path gRPC*: \`ss-grpc\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${shadowsocksData.ss_link_ws}
\`\`\`
🫧*URL HTTP:*
\`\`\`
${shadowsocksData.ss_link_nontls}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${shadowsocksData.ss_link_grpc}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](https://${shadowsocksData.domain}:81/ss-${shadowsocksData.username}.txt)
──────────────────────
🚀*Quota*: \`${shadowsocksData.quota === '0 GB' ? 'Unlimited' : shadowsocksData.quota}\`
🌤*IP Limit*: \`${shadowsocksData.ip_limit === '0' ? 'Unlimited' : shadowsocksData.ip_limit} IP\`
⏳*Expired*: \`${shadowsocksData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
              console.log('Shadowsocks account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating Shadowsocks account');
              return resolve(`❌ Gagal: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat Shadowsocks:', error);
          return resolve('❌ Gagal membuat Shadowsocks. Silakan coba lagi nanti.');
        });
    });
  });
}

async function createssh(username, password, exp, iplimit, serverId) {
  console.log(`Creating SSH account for ${username} with expiry ${exp} days, IP limit ${iplimit}, and password ${password}`);
  
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
        return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      const param = `:5888/createssh?user=${username}&password=${password}&exp=${exp}&iplimit=${iplimit}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const sshData = response.data.data;
            const msg = `
──────────────────────           
                 *✨SSH ACCOUNT✨*
──────────────────────
*Domain* : \`${sshData.domain}\`
*Nameserver*: \`${sshData.ns_domain}\`
*Username* : \`${sshData.username}\`
*Password* : \`${sshData.password}\`
*Port TLS* : \`443,8443\`
*Port HTTP*: \`80,8080,2086,8880\`
*OpenSSH* : \`22\`
*UdpSSH* : \`1-65535\`
*DNS* : \`53,2222\`
*Dropbear* : \`109,110\`
*BadVPN UDP*: \`7300\`
*Pub Key* : \`${sshData.pubkey}\`
───────────────────────
🫧*HTTP CUSTOM*
\`${sshData.domain}:80@${sshData.username}:${sshData.password}\`
───────────────────────
🫧*Payload*: 
\`GET /cdn-cgi/trace HTTP/1.1[crlf]Host: Bug_Kalian[crlf][crlf]GET-RAY / HTTP/1.1[crlf]Host: [host][crlf]Connection: Upgrade[crlf]User-Agent: [ua][crlf]Upgrade: websocket[crlf][crlf]\`
──────────────────────
🫧*Save Account*: [Click Link](https://${sshData.domain}:81/ssh-${sshData.username}.txt)
──────────────────────
🚀*IP Limit*: \`${sshData.ip_limit}\`
⏳*Expired*: \`${sshData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
              console.log('SSH account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating SSH account');
              return resolve(`❌ Gagal: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat SSH:', error);
          return resolve('❌ Gagal membuat SSH. Silakan coba lagi nanti.');
        });
    });
  });
}
async function createvmess(username, exp, quota, limitip, serverId) {
  console.log(`Creating VMess account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
        return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      const param = `:5888/createvmess?user=${username}&exp=${exp}&quota=${quota}&iplimit=${limitip}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const vmessData = response.data.data;
            const msg = `
────────────────────── 
              *✨VMESS ACCOUNT✨*
──────────────────────
*Username* : \`${vmessData.username}\`
*Domain* : \`${vmessData.domain}\`
*Port TLS* : \`443,8443\`
*Port HTTP*: \`80,8080,2086,8880\`
*UUID* : \`${vmessData.uuid}\`
*Alter ID* : \`0\`
*Security* : \`Auto\`
*Path* : \`/vmess\`
*Path gRPC*: \`vmess-grpc\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${vmessData.vmess_tls_link}
\`\`\`
🫧*URL HTTP:*
\`\`\`
${vmessData.vmess_nontls_link}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${vmessData.vmess_grpc_link}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](https://${vmessData.domain}:81/vmess-${vmessData.username}.txt)
──────────────────────
🚀*Quota*: \`${vmessData.quota === '0 GB' ? 'Unlimited' : vmessData.quota}\`
🌤*IP Limit*: \`${vmessData.ip_limit === '0' ? 'Unlimited' : vmessData.ip_limit} IP\`
⏳*Expired*: \`${vmessData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
              console.log('VMess account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating VMess account');
              return resolve(`❌ Gagal: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat VMess:', error);
          return resolve('❌ Gagal membuat VMess. Silakan coba lagi nanti.');
        });
    });
  });
}
async function createvless(username, exp, quota, limitip, serverId) {
  console.log(`Creating VLESS account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
        return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      const param = `:5888/createvless?user=${username}&exp=${exp}&quota=${quota}&iplimit=${limitip}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const vlessData = response.data.data;
            const msg = `
────────────────────── 
               *✨VLESS ACCOUNT✨*
──────────────────────
*Username* : \`${vlessData.username}\`
*Domain* : \`${vlessData.domain}\`
*Port TLS* : \`443,8443\`
*Port HTTP*: \`80,8080,2086,8880\`
*UUID* : \`${vlessData.uuid}\`
*Path* : \`/vless\`
*Path gRPC*: \`vless-grpc\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${vlessData.vless_tls_link}
\`\`\`
🫧*URL HTTP:*
\`\`\`
${vlessData.vless_nontls_link}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${vlessData.vless_grpc_link}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](https://${vlessData.domain}:81/vless-${vlessData.username}.txt)
──────────────────────
🚀*Quota*: \`${vlessData.quota === '0 GB' ? 'Unlimited' : vlessData.quota}\`
🌤*IP Limit*: \`${vlessData.ip_limit === '0' ? 'Unlimited' : vlessData.ip_limit} IP\`
⏳*Expired*: \`${vlessData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
              console.log('VLESS account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating VLESS account');
              return resolve(`❌ Gagal: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat VLESS:', error);
          return resolve('❌ Gagal membuat VLESS. Silakan coba lagi nanti.');
        });
    });
  });
}
async function createtrojan(username, exp, quota, limitip, serverId) {
  console.log(`Creating Trojan account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
        return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      const param = `:5888/createtrojan?user=${username}&exp=${exp}&quota=${quota}&iplimit=${limitip}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const trojanData = response.data.data;
            const msg = `
────────────────────── 
            *✨TROJAN ACCOUNT✨*
──────────────────────
*Username* : \`${trojanData.username}\`
*Domain* : \`${trojanData.domain}\`
*Port TLS* : \`443,8443\`
*Port HTTP*: \`80,8080,2086,8880\`
*UUID* : \`${trojanData.uuid}\`
*Path* : \`/trojan-ws\`
*Path gRPC*: \`trojan-grpc\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${trojanData.trojan_tls_link}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${trojanData.trojan_grpc_link}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](https://${trojanData.domain}:81/trojan-${trojanData.username}.txt)
──────────────────────
🚀*Quota*: \`${trojanData.quota === '0 GB' ? 'Unlimited' : trojanData.quota}\`
🌤*IP Limit*: \`${trojanData.ip_limit === '0' ? 'Unlimited' : trojanData.ip_limit} IP\`
⏳*Expired*: \`${trojanData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
              console.log('Trojan account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating Trojan account');
              return resolve(`❌ Gagal: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat Trojan:', error);
          return resolve('❌ Gagal membuat Trojan. Silakan coba lagi nanti.');
        });
    });
  });
}

async function createshadowsocks(username, exp, quota, limitip, serverId) {
  console.log(`Creating Shadowsocks account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
  
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err) {
        console.error('Error fetching server:', err.message);
        return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');
      }

      if (!server) return resolve('❌ Gagal: Server tidak ditemukan. Silakan coba lagi.');

      const domain = server.domain;
      const auth = server.auth;
      const param = `:5888/createshadowsocks?user=${username}&exp=${exp}&quota=${quota}&iplimit=${limitip}&auth=${auth}`;
      const url = `http://${domain}${param}`;
      axios.get(url)
        .then(response => {
          if (response.data.status === "success") {
            const shadowsocksData = response.data.data;
            const msg = `
────────────────────── 
      *✨SHADOWSOCKS ACCOUNT✨*
──────────────────────
*Username* : \`${shadowsocksData.username}\`
*Domain* : \`${shadowsocksData.domain}\`
*Port TLS* : \`443,8443\`
*Port HTTP*: \`80,8080,2086,8880\`
*UUID* : \`${shadowsocksData.uuid}\`
*Path* : \`/ss-ws\`
*Path gRPC*: \`ss-grpc\`
──────────────────────
🫧*URL TLS:*
\`\`\`
${shadowsocksData.ss_link_ws}
\`\`\`
🫧*URL HTTP:*
\`\`\`
${shadowsocksData.ss_link_nontls}
\`\`\`
🫧*URL gRPC:*
\`\`\`
${shadowsocksData.ss_link_grpc}
\`\`\`
──────────────────────
🫧*Save Account*: [Click Link](https://${shadowsocksData.domain}:81/ss-${shadowsocksData.username}.txt)
──────────────────────
🚀*Quota*: \`${shadowsocksData.quota === '0 GB' ? 'Unlimited' : shadowsocksData.quota}\`
🌤*IP Limit*: \`${shadowsocksData.ip_limit === '0' ? 'Unlimited' : shadowsocksData.ip_limit} IP\`
⏳*Expired*: \`${shadowsocksData.expired}\`
──────────────────────
✨ Selamat menggunakan layanan kami! ✨
`;
              console.log('Shadowsocks account created successfully');
              return resolve(msg);
            } else {
              console.log('Error creating Shadowsocks account');
              return resolve(`❌ Gagal: ${response.data.message}`);
            }
          })
        .catch(error => {
          console.error('Error saat membuat Shadowsocks:', error);
          return resolve('❌ Gagal membuat Shadowsocks. Silakan coba lagi nanti.');
        });
    });
  });
}

module.exports = { trialssh, trialvmess, trialvless, trialtrojan, trialshadowsocks, createssh, createvmess, createvless, createtrojan, createshadowsocks };
