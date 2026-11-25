const axios = require('axios');
const {
  db,
  logger,
  adminIds,
  primaryAdminId,
  userState,
} = require('./config');
const {
  showLoading,
  getBotGroupData,
  getIspNameFromExternalSource,
  censorAccountUsername,
  getLastTransactionNumber,
  getUserSaldo,
} = require('./utils');

const {
  trialssh,
  trialvmess,
  trialvless,
  trialtrojan,
  trialshadowsocks,
  createssh,
  createvmess,
  createvless,
  createtrojan,
  createshadowsocks,
} = require('../modules/create');

const {
  renewssh,
  renewvmess,
  renewvless,
  renewtrojan,
  renewshadowsocks,
} = require('../modules/renew');

async function handleServiceAction(ctx, action) {
  let keyboard;
  if (action === 'trial') {
    keyboard = [
      [{ text: '💠 SSH', callback_data: 'trial_ssh' }],
      [{ text: '💠 Vmess', callback_data: 'trial_vmess' }, { text: '💠 Vless', callback_data: 'trial_vless' }],
      [{ text: '💠 Trojan', callback_data: 'trial_trojan' }, { text: '💠 Shadowsocks', callback_data: 'trial_shadowsocks' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }],
    ];
  } else if (action === 'create') {
    keyboard = [
      [{ text: '✨ SSH', callback_data: 'create_ssh' }],
      [{ text: '✨ Vmess', callback_data: 'create_vmess' }, { text: '✨ Vless', callback_data: 'create_vless' }],
      [{ text: '✨ Trojan', callback_data: 'create_trojan' }, { text: '✨ Shadowsocks', callback_data: 'create_shadowsocks' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }],
    ];
  } else if (action === 'sewascript') {
    keyboard = [
      [{ text: '🥇 Regist IP', callback_data: 'sewascript_daftar' }, { text: '🥈 Renew IP', callback_data: 'sewascript_perpanjang' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }],
    ];
  } else if (action === 'renew') {
    keyboard = [
      [{ text: '♻️ SSH', callback_data: 'renew_ssh' }],
      [{ text: '♻️ Vmess', callback_data: 'renew_vmess' }, { text: '♻️ Vless', callback_data: 'renew_vless' }],
      [{ text: '♻️ Trojan', callback_data: 'renew_trojan' }, { text: '♻️ Shadowsocks', callback_data: 'renew_shadowsocks' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }],
    ];
  }

  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: keyboard });
    logger.info(`${action} service menu sent`);
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      await ctx.reply(`Pilih jenis layanan yang ingin Anda ${action}:`, {
        reply_markup: { inline_keyboard: keyboard },
      });
    } else {
      logger.error(`Error saat mengirim menu ${action}:`, error);
    }
  }
}

async function startSelectServer(ctx, action, type, page = 0) {
  try {
    logger.info(`Memulai proses ${action} untuk ${type} di halaman ${page + 1}`);
    const userId = ctx.from.id;

    const userRole = await new Promise((resolve, reject) => {
      db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.role : 'member');
      });
    });

    let resellerDiscount = 0;
    if (userRole === 'reseller') {
      resellerDiscount = await new Promise((resolve, reject) => {
        db.get('SELECT discount_percent FROM reseller_config WHERE id = 1', (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.discount_percent : 0);
        });
      });
    }

    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err || servers.length === 0) {
        return ctx.reply('⚠️ *PERHATIAN!* Tidak ada server yang tersedia saat ini. Coba lagi nanti!', { parse_mode: 'Markdown' });
      }

      const serversPerPage = 6;
      const totalPages = Math.ceil(servers.length / serversPerPage);
      const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
      const start = currentPage * serversPerPage;
      const currentServers = servers.slice(start, start + serversPerPage);

      const keyboard = [];
      for (let i = 0; i < currentServers.length; i += 2) {
        const row = [];
        const server1 = currentServers[i];
        const server2 = currentServers[i + 1];
        row.push({ text: `${server1.nama_server}`, callback_data: `${action}_username_${type}_${server1.id}` });
        if (server2) {
          row.push({ text: `${server2.nama_server}`, callback_data: `${action}_username_${type}_${server2.id}` });
        }
        keyboard.push(row);
      }

      const navButtons = [];
      if (totalPages > 1) {
        if (currentPage > 0) navButtons.push({ text: '⬅️ Back', callback_data: `navigate_${action}_${type}_${currentPage - 1}` });
        if (currentPage < totalPages - 1) navButtons.push({ text: '➡️ Next', callback_data: `navigate_${action}_${type}_${currentPage + 1}` });
      }
      if (navButtons.length > 0) keyboard.push(navButtons);
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);

      const serverList = currentServers.map(server => {
        let hargaPerHariTampilan = server.harga;
        if (userRole === 'reseller' && resellerDiscount > 0) {
          hargaPerHariTampilan = Math.floor(server.harga * (100 - resellerDiscount) / 100);
        }
        const hargaPer30HariTampilan = hargaPerHariTampilan * 30;
        const isFull = server.total_create_akun >= server.batas_create_akun;

        return `━━━━━━━━━━━━━━━━━━━━━━\n` +
               `🌏 *${server.nama_server}*\n` +
               `━━━━━━━━━━━━━━━━━━━━━━\n` +
               `🏷️ Harga per hari: Rp${hargaPerHariTampilan}\n` +
               `📅 Harga per 30 hari: Rp${hargaPer30HariTampilan}\n` +
               `🌤 Quota: ${server.quota}GB\n` +
               `🚀 Limit IP: ${server.iplimit} IP\n` +
               (isFull ? `⚠️ *Server Penuh*` : `👥 Total Create Akun: ${server.total_create_akun}/${server.batas_create_akun}`);
      }).join('\n\n');

      const textOut = `📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`;
      if (ctx.updateType === 'callback_query') {
        ctx.editMessageText(textOut, { reply_markup: { inline_keyboard: keyboard }, parse_mode: 'Markdown' });
      } else {
        ctx.reply(textOut, { reply_markup: { inline_keyboard: keyboard }, parse_mode: 'Markdown' });
      }

      userState[userId] = { step: `${action}_username_${type}`, page: currentPage };
    });
  } catch (error) {
    logger.error(`❌ Error saat memulai proses ${action} untuk ${type}:`, error);
    await ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
}

async function handleTrial(ctx, type, serverId) {
  try {
    const username = `trial${Math.floor(Math.random() * 10000)}`;
    const password = Math.random().toString(36).slice(-6);
    const exp = 1;
    const quota = 1;
    const iplimit = 1;

    let msg;
    switch (type) {
      case 'vmess': msg = await trialvmess(username, exp, quota, iplimit, serverId); break;
      case 'vless': msg = await trialvless(username, exp, quota, iplimit, serverId); break;
      case 'trojan': msg = await trialtrojan(username, exp, quota, iplimit, serverId); break;
      case 'shadowsocks': msg = await trialshadowsocks(username, exp, quota, iplimit, serverId); break;
      case 'ssh': msg = await trialssh(username, password, exp, iplimit, serverId); break;
      default: msg = '❌ *Tipe layanan tidak dikenali.*';
    }

    if (msg) {
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    logger.error(`❌ Error trial ${type}:`, error);
    await ctx.reply('❌ *Gagal membuat akun trial. Silahkan coba lagi nanti.*', { parse_mode: 'Markdown' });
  } finally {
    delete userState[ctx.from.id];
    delete userState[ctx.chat.id];
  }
}

async function sendTransactionLogToGroup({
  trxNumber,
  userRole,
  tgUsername,
  tgUserId,
  serverName,
  ispName,
  domainName,
  accountUsername,
  serviceName,
  limitQuota,
  limitLogin,
  trxType,
  activeDays,
  costValue,
  hargaNormalPerHari,
  saldoDikurangi,
  userSaldoNow,
  dateLabel,
  timeLabel,
}) {
  const groupData = getBotGroupData();
  if (!groupData || !groupData.chatId || !groupData.keyGroup) {
    logger.warn('❌ Data grup tidak lengkap (chatId atau keyGroup), notifikasi tidak dikirim.');
    return;
  }

  let statusEmoji = '👤';
  let statusText = 'Member';
  if (userRole === 'admin') { statusEmoji = '👑'; statusText = 'Admin'; }
  else if (userRole === 'reseller') { statusEmoji = '🏆'; statusText = 'Reseller'; }

  const censoredAccountUsername = censorAccountUsername(accountUsername);

  const message =
`╭──────────────╮
   📦 TRANSAKSI BERHASIL 📦
╰──────────────╯

\`\`\`
📒 No Trx       : #${trxNumber}
🌀 Status       : ${statusText} ${statusEmoji}
👤 Username     : ${tgUsername}
🆔 ID           : ${tgUserId}

🌐 Server       : ${serverName}
📡 ISP          : ${ispName}
🔗 Domain/IP    : ${domainName}
🙍 Nama         : ${censoredAccountUsername}

📦 Produk       : ${serviceName}
📊 Limit Quota  : ${limitQuota} GB
📱 Limit Login  : ${limitLogin} HP
⚙️ Tipe         : ${trxType}
⏳ Durasi Akun  : ${activeDays} Hari — Rp.${costValue.toLocaleString('id-ID')}
💲 Normal/Hari  : Rp.${hargaNormalPerHari.toLocaleString('id-ID')}

💳 Saldo Keluar : Rp.${saldoDikurangi.toLocaleString('id-ID')}
💰 Saldo Now    : Rp.${userSaldoNow.toLocaleString('id-ID')}

📅 Tanggal      : ${dateLabel}
⏰ Waktu        : ${timeLabel}
\`\`\`

━━━━━━━━━━━━━━
📝 Catatan: Simpan nomor transaksi untuk support
━━━━━━━━━━━━━━`;

  try {
    await axios.post(`https://api.telegram.org/bot${groupData.keyGroup}/sendMessage`, {
      chat_id: groupData.chatId,
      text: message,
      parse_mode: 'MarkdownV2',
    });
    logger.info(`✅ Log transaksi #${trxNumber} dikirim ke grup ${groupData.chatId}`);
  } catch (err) {
    logger.error(`❌ Gagal kirim log transaksi ke grup: ${err.response?.data?.description || err.message}`);
  }
}

async function afterAccountTransaction({
  userId,
  username,
  produk,
  serverId,
  jenis,
  durasi,
  accountUsername,
}) {
  try {
    const now = new Date();
    const serverDetails = await new Promise((resolve, reject) => {
      db.get('SELECT nama_server, harga, domain, quota, iplimit FROM Server WHERE id = ?', [serverId], (err, row) => {
        if (err) return reject(err);
        resolve(row || {});
      });
    });

    const serverNamaTampilan = serverDetails.nama_server || '-';
    const hargaPerHari = serverDetails.harga || 0;
    const domainServer = serverDetails.domain || '-';
    const quotaServer = serverDetails.quota || 0;
    const iplimitServer = serverDetails.iplimit || 0;
    const ispServer = await getIspNameFromExternalSource(domainServer);

    let totalHarga = hargaPerHari * durasi;

    const userRole = await new Promise((resolve) => {
      db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => {
        resolve(row ? row.role : 'member');
      });
    });

    if (userRole === 'reseller') {
      const resellerDiscount = await new Promise((resolve, reject) => {
        db.get('SELECT discount_percent FROM reseller_config WHERE id = 1', (err, row) => {
          if (err) reject(err);
          else resolve(row ? row.discount_percent : 0);
        });
      });
      totalHarga = Math.floor(totalHarga * (100 - resellerDiscount) / 100);
    }

    const trxNumber = await getLastTransactionNumber();
    const saldo = await getUserSaldo(userId);

    const tanggal = now.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).replace(/\//g, '.');

    const waktu = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    }).replace(/\./g, ':') + ' WIB';

    await sendTransactionLogToGroup({
      trxNumber,
      userRole: adminIds.includes(userId) ? 'admin' : userRole,
      tgUsername: username ? (username.startsWith('@') ? username : `@${username}`) : 'Tidak tersedia',
      tgUserId: userId,
      serverName: serverNamaTampilan,
      ispName: ispServer,
      domainName: domainServer,
      accountUsername,
      serviceName: produk || 'Tidak diketahui',
      limitQuota: quotaServer,
      limitLogin: iplimitServer,
      trxType: jenis || 'Create',
      activeDays: durasi || 0,
      costValue: totalHarga || 0,
      hargaNormalPerHari: hargaPerHari || 0,
      saldoDikurangi: totalHarga || 0,
      userSaldoNow: saldo || 0,
      dateLabel: tanggal,
      timeLabel: waktu,
    });
  } catch (error) {
    logger.error(`❌ Error afterAccountTransaction user ${userId}:`, error?.stack || error?.message || error);
  }
}

function registerVpnService(bot) {
  bot.action('service_create', async (ctx) => handleServiceAction(ctx, 'create'));
  bot.action('service_trial', async (ctx) => handleServiceAction(ctx, 'trial'));
  bot.action('service_renew', async (ctx) => handleServiceAction(ctx, 'renew'));

  const protocols = ['ssh', 'vmess', 'vless', 'trojan', 'shadowsocks'];
  for (const proto of protocols) {
    bot.action(`trial_${proto}`, async (ctx) => startSelectServer(ctx, 'trial', proto));
    bot.action(`create_${proto}`, async (ctx) => startSelectServer(ctx, 'create', proto));
    bot.action(`renew_${proto}`, async (ctx) => startSelectServer(ctx, 'renew', proto));
  }

  bot.action(/navigate_(\w+)_(\w+)_(\d+)/, async (ctx) => {
    const [, action, type, page] = ctx.match;
    await startSelectServer(ctx, action, type, parseInt(page, 10));
  });

  bot.action(/^(create|renew|trial)_username_(vmess|vless|trojan|shadowsocks|ssh)_(.+)$/, async (ctx) => {
    await ctx.telegram.answerCbQuery(ctx.callbackQuery.id);
    const [, action, type, serverId] = ctx.match || [];
    if (!action || !type || !serverId) {
      return ctx.reply('❌ *Perintah tidak dikenali.*', { parse_mode: 'Markdown' });
    }

    const userId = ctx.from.id;

    if (action === 'trial') {
      const today = new Date().toISOString().split('T')[0];
      if (adminIds.includes(userId)) {
        return await handleTrial(ctx, type, serverId);
      }

      db.get('SELECT batas_create_akun, total_create_akun FROM Server WHERE id = ?', [serverId], (err, server) => {
        if (err || !server) {
          return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
        }
        if (server.total_create_akun >= server.batas_create_akun) {
          return ctx.reply('❌ *Server penuh. Trial tidak dapat dibuat di server ini.*', { parse_mode: 'Markdown' });
        }

        db.get('SELECT count FROM TrialLog WHERE user_id = ? AND date = ?', [userId, today], (errLog, row) => {
          if (errLog) {
            return ctx.reply('❌ *Terjadi kesalahan saat memproses trial.*', { parse_mode: 'Markdown' });
          }
          const trialCount = row?.count || 0;

          db.get('SELECT * FROM unlimited_trial_users WHERE user_id = ?', [userId], async (errUnlim, result) => {
            if (errUnlim) {
              return ctx.reply('❌ Terjadi kesalahan saat memeriksa hak trial.', { parse_mode: 'Markdown' });
            }
            const isUnlimited = result != null;
            if (!isUnlimited && trialCount >= 2) {
              return ctx.reply('⚠️ *Kamu sudah trial hari ini, Gass Order* 😖', { parse_mode: 'Markdown' });
            }

            await handleTrial(ctx, type, serverId);

            if (!isUnlimited) {
              const newCount = trialCount + 1;
              db.run(`
                INSERT INTO TrialLog (user_id, date, count)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id, date) DO UPDATE SET count = ?
              `, [userId, today, newCount, newCount]);
            }
          });
        });
      });
    } else {
      userState[userId] = { step: `username_${action}_${type}`, serverId, type, action };

      db.get('SELECT batas_create_akun, total_create_akun FROM Server WHERE id = ?', [serverId], async (err, server) => {
        if (err || !server) {
          return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
        }
        if (server.total_create_akun >= server.batas_create_akun) {
          return ctx.reply('❌ *Server penuh. Tidak dapat membuat akun baru di server ini.*', { parse_mode: 'Markdown' });
        }
        await ctx.reply('👤 *Masukkan username:*', { parse_mode: 'Markdown' });
      });
    }
  });

  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const teks = ctx.message?.text?.trim();
    const state = userState[userId];

    if (!teks || teks.startsWith('/') || !state || !state.step) {
      return next();
    }

    if (state.step.startsWith('username_')) {
      state.username = teks;
      if (state.username.length < 3 || state.username.length > 20) {
        return ctx.reply('❌ *Username harus terdiri dari 3 hingga 20 karakter.*', { parse_mode: 'Markdown' });
      }
      if (/[^a-zA-Z0-9]/.test(state.username)) {
        return ctx.reply('❌ *Username tidak boleh mengandung karakter khusus atau spasi.*', { parse_mode: 'Markdown' });
      }

      if (state.action === 'create' && state.type === 'ssh') {
        state.step = `password_${state.action}_${state.type}`;
        await ctx.reply('🔑 *Masukkan password:*', { parse_mode: 'Markdown' });
      } else {
        state.step = `exp_${state.action}_${state.type}`;
        await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
      }
      return;
    }

    if (state.step.startsWith('password_')) {
      state.password = teks;
      if (/[^a-zA-Z0-9]/.test(state.password)) {
        return ctx.reply('❌ *Password tidak boleh mengandung karakter khusus atau spasi.*', { parse_mode: 'Markdown' });
      }
      state.step = `exp_${state.action}_${state.type}`;
      await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
      return;
    }

    if (state.step.startsWith('exp_')) {
      if (!/^\d+$/.test(teks)) {
        return ctx.reply('❌ *Masa aktif tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
      }
      const exp = parseInt(teks, 10);
      if (isNaN(exp) || exp <= 0) {
        return ctx.reply('❌ *Masa aktif tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
      }
      if (exp > 365) {
        return ctx.reply('❌ *Masa aktif tidak boleh lebih dari 365 hari.*', { parse_mode: 'Markdown' });
      }
      state.exp = exp;

      db.get('SELECT quota, iplimit, harga, nama_server, domain FROM Server WHERE id = ?', [state.serverId], async (err, server) => {
        if (err || !server) {
          return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
        }

        let totalHarga = server.harga * state.exp;

        const userRole = await new Promise((resolve) => {
          db.get('SELECT role FROM users WHERE user_id = ?', [userId], (errRole, row) => {
            resolve(row ? row.role : 'member');
          });
        });

        if (userRole === 'reseller') {
          const resellerDiscount = await new Promise((resolve) => {
            db.get('SELECT discount_percent FROM reseller_config WHERE id = 1', (errDisc, row) => {
              resolve(!errDisc && row ? row.discount_percent : 0);
            });
          });
          totalHarga = Math.floor(totalHarga * (100 - resellerDiscount) / 100);
        }

        db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], async (errUser, user) => {
          if (errUser || !user) {
            return ctx.reply('❌ *Pengguna tidak ditemukan.*', { parse_mode: 'Markdown' });
          }

          if (user.saldo < totalHarga) {
            delete userState[userId];
            return ctx.reply(
              `❌ *Saldo Anda tidak mencukupi untuk melakukan transaksi ini. Saldo Anda: Rp${user.saldo.toLocaleString('id-ID')}, Harga: Rp${totalHarga.toLocaleString('id-ID')}*`,
              { parse_mode: 'Markdown' }
            );
          }

          let msg;
          let successAction = false;
          let actionTypeLabel = '';
          const loadingState = await showLoading(ctx);

          try {
            if (state.action === 'create') {
              actionTypeLabel = 'Buat Akun';
              switch (state.type) {
                case 'vmess': msg = await createvmess(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                case 'vless': msg = await createvless(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                case 'trojan': msg = await createtrojan(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                case 'shadowsocks': msg = await createshadowsocks(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                case 'ssh': msg = await createssh(state.username, state.password, exp, server.iplimit, state.serverId); break;
                default: msg = '❌ *Tipe layanan tidak dikenali.*'; break;
              }
            } else if (state.action === 'renew') {
              actionTypeLabel = 'Perpanjang Akun';
              switch (state.type) {
                case 'vmess': msg = await renewvmess(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                case 'vless': msg = await renewvless(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                case 'trojan': msg = await renewtrojan(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                case 'shadowsocks': msg = await renewshadowsocks(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                case 'ssh': msg = await renewssh(state.username, exp, server.iplimit, state.serverId); break;
                default: msg = '❌ *Tipe layanan tidak dikenali.*'; break;
              }
            }

            if (msg && typeof msg === 'string' && !msg.toLowerCase().includes('gagal') && !msg.toLowerCase().includes('error')) {
              successAction = true;
            } else {
              msg = msg || `❌ Gagal ${actionTypeLabel} akun. Mohon coba lagi atau hubungi admin.`;
            }
          } catch (e) {
            logger.error(`Error saat ${actionTypeLabel} akun ${state.type}:`, e.message);
            msg = '❌ Terjadi kesalahan internal saat memproses akun Anda. Mohon coba lagi nanti.';
            successAction = false;
          } finally {
            clearInterval(loadingState.intervalId);
            try {
              await ctx.telegram.deleteMessage(ctx.chat.id, loadingState.messageId);
            } catch (e) {}
          }

          if (!successAction) {
            delete userState[userId];
            return ctx.reply(msg, { parse_mode: 'Markdown' });
          }

          db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [totalHarga, userId], (errDeduct) => {
            if (errDeduct) {
              logger.error('⚠️ Kesalahan saat mengurangi saldo pengguna:', errDeduct.message);
              bot.telegram.sendMessage(primaryAdminId, `🚨 *PERHATIAN: SALDO GAGAL DIKURANGI!*
User ID: \`${userId}\`
Username TG: \`@${ctx.from.username || 'N/A'}\`
Produk: ${state.type.toUpperCase()}
Jenis: ${actionTypeLabel}
Jumlah: Rp${totalHarga.toLocaleString('id-ID')}
Pesan Error: ${errDeduct.message}`, { parse_mode: 'Markdown' }).catch(() => {});
            }
          });

          db.run('UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?', [state.serverId]);

          db.run(`INSERT INTO log_penjualan (
            user_id, username, nama_server, tipe_akun, harga, masa_aktif_hari, waktu_transaksi, action_type, user_role
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            ctx.from.id,
            ctx.from.username || '',
            server.nama_server || 'Unknown',
            state.type,
            totalHarga,
            state.exp,
            new Date().toISOString(),
            state.action,
            userRole,
          ]);

          await afterAccountTransaction({
            userId,
            username: ctx.from.username,
            produk: state.type.toUpperCase(),
            serverId: state.serverId,
            jenis: actionTypeLabel,
            durasi: state.exp,
            accountUsername: state.username,
          });

          await ctx.reply(msg, { parse_mode: 'Markdown' });
          delete userState[userId];
        });
      });
      return;
    }

    return next();
  });
}

module.exports = {
  registerVpnService,
  handleServiceAction,
};
