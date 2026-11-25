const { db, logger, adminIds, userState } = require('./config');
const { keyboard_nomor } = require('./utils');

function updateServerField(serverId, value, query) {
  return new Promise((resolve, reject) => {
    db.run(query, [value, serverId], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function handleEditField(ctx, userStateData, data, field, fieldName, query) {
  let currentValue = userStateData[field] || '';

  if (data === 'delete') {
    currentValue = currentValue.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentValue.length === 0) {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} tidak boleh kosong!*`, { show_alert: true });
    }
    try {
      await updateServerField(userStateData.serverId, currentValue, query);
      ctx.reply(
        `✅ *${fieldName} server berhasil diupdate.*\n\n📄 *Detail Server:*\n- ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}: *${currentValue}*`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      ctx.reply(`❌ *Terjadi kesalahan saat mengupdate ${fieldName} server.*`, { parse_mode: 'Markdown' });
    }
    delete userState[ctx.from.id];
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^[a-zA-Z0-9.-]+$/.test(data)) {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} tidak valid!*`, { show_alert: true });
    }
    if (currentValue.length < 253) {
      currentValue += data;
    } else {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} maksimal adalah 253 karakter!*`, { show_alert: true });
    }
  }

  userStateData[field] = currentValue;
  const newMessage = `📊 *Silahkan masukkan ${fieldName} server baru:*\n\n${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} saat ini: *${currentValue}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown',
    });
  }
}

async function handleEditHarga(ctx, userStateData, data) {
  let currentAmount = userStateData.amount || '';

  if (data === 'delete') {
    currentAmount = currentAmount.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentAmount.length === 0) {
      return await ctx.answerCbQuery('⚠️ *Jumlah tidak boleh kosong!*', { show_alert: true });
    }
    const hargaBaru = parseFloat(currentAmount);
    if (isNaN(hargaBaru) || hargaBaru <= 0) {
      return ctx.reply('❌ *Harga tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
    }
    try {
      await updateServerField(userStateData.serverId, hargaBaru, 'UPDATE Server SET harga = ? WHERE id = ?');
      ctx.reply(`✅ *Harga server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Harga Baru: *Rp ${hargaBaru}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply('❌ *Terjadi kesalahan saat mengupdate harga server.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.from.id];
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^\d+$/.test(data)) {
      return await ctx.answerCbQuery('⚠️ *Hanya angka yang diperbolehkan!*', { show_alert: true });
    }
    if (currentAmount.length < 12) {
      currentAmount += data;
    } else {
      return await ctx.answerCbQuery('⚠️ *Jumlah maksimal adalah 12 digit!*', { show_alert: true });
    }
  }

  userStateData.amount = currentAmount;
  const newMessage = `💰 *Silahkan masukkan harga server baru:*\n\nJumlah saat ini: *Rp ${currentAmount}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown',
    });
  }
}

const handleEditBatasCreateAkun = (ctx, st, d) => handleEditField(ctx, st, d, 'batasCreateAkun', 'batas create akun', 'UPDATE Server SET batas_create_akun = ? WHERE id = ?');
const handleEditTotalCreateAkun = (ctx, st, d) => handleEditField(ctx, st, d, 'totalCreateAkun', 'total create akun', 'UPDATE Server SET total_create_akun = ? WHERE id = ?');
const handleEditiplimit = (ctx, st, d) => handleEditField(ctx, st, d, 'iplimit', 'limit IP', 'UPDATE Server SET iplimit = ? WHERE id = ?');
const handleEditQuota = (ctx, st, d) => handleEditField(ctx, st, d, 'quota', 'quota', 'UPDATE Server SET quota = ? WHERE id = ?');
const handleEditAuth = (ctx, st, d) => handleEditField(ctx, st, d, 'auth', 'auth', 'UPDATE Server SET auth = ? WHERE id = ?');
const handleEditDomain = (ctx, st, d) => handleEditField(ctx, st, d, 'domain', 'domain', 'UPDATE Server SET domain = ? WHERE id = ?');
const handleEditNama = (ctx, st, d) => handleEditField(ctx, st, d, 'name', 'nama server', 'UPDATE Server SET nama_server = ? WHERE id = ?');

async function promptSelectServerForEdit(ctx, title, prefix) {
  await ctx.answerCbQuery();
  const servers = await new Promise((resolve, reject) => {
    db.all('SELECT id, nama_server FROM Server', [], (err, rows) => (err ? reject(err) : resolve(rows)));
  });

  if (servers.length === 0) {
    return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
  }

  const buttons = servers.map(s => ({ text: s.nama_server, callback_data: `${prefix}_${s.id}` }));
  const inlineKeyboard = [];
  for (let i = 0; i < buttons.length; i += 2) {
    inlineKeyboard.push(buttons.slice(i, i + 2));
  }

  await ctx.reply(title, {
    reply_markup: { inline_keyboard: inlineKeyboard },
    parse_mode: 'Markdown',
  });
}

function registerAdminServer(bot) {
  // === COMMANDS SERVER ===
  bot.command('addserver', async (ctx) => {
    if (!adminIds.includes(ctx.message.from.id)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
    }
    const args = ctx.message.text.split(' ');
    if (args.length !== 8) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/addserver <domain> <auth> <harga> <nama_server> <quota> <iplimit> <batas_create_account>`', { parse_mode: 'Markdown' });
    }
    const [domain, auth, harga, nama_server, quota, iplimit, batas_create_akun] = args.slice(1);
    if (![harga, quota, iplimit, batas_create_akun].every(v => /^\d+$/.test(v))) {
      return ctx.reply('⚠️ `harga`, `quota`, `iplimit`, dan `batas_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
    }

    db.run(
      'INSERT INTO Server (domain, auth, harga, nama_server, quota, iplimit, batas_create_akun, total_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
      [domain, auth, parseInt(harga, 10), nama_server, parseInt(quota, 10), parseInt(iplimit, 10), parseInt(batas_create_akun, 10)],
      (err) => {
        if (err) return ctx.reply('⚠️ Kesalahan saat menambahkan server.', { parse_mode: 'Markdown' });
        ctx.reply(`✅ Server \`${nama_server}\` berhasil ditambahkan.`, { parse_mode: 'Markdown' });
      }
    );
  });

  const singleFieldCommands = [
    { cmd: 'editharga', col: 'harga', label: 'Harga', numeric: true },
    { cmd: 'editnama', col: 'nama_server', label: 'Nama', numeric: false },
    { cmd: 'editauth', col: 'auth', label: 'Auth', numeric: false },
    { cmd: 'editlimitquota', col: 'quota', label: 'Quota', numeric: true },
    { cmd: 'editlimitip', col: 'iplimit', label: 'Iplimit', numeric: true },
    { cmd: 'editlimitcreate', col: 'batas_create_akun', label: 'Batas create akun', numeric: true },
    { cmd: 'edittotalcreate', col: 'total_create_akun', label: 'Total create akun', numeric: true },
  ];

  for (const item of singleFieldCommands) {
    bot.command(item.cmd, async (ctx) => {
      if (!adminIds.includes(ctx.message.from.id)) {
        return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
      }
      const args = ctx.message.text.split(' ');
      if (args.length !== 3) {
        return ctx.reply(`⚠️ Format salah. Gunakan: \`/${item.cmd} <domain> <nilai>\``, { parse_mode: 'Markdown' });
      }
      const [domain, val] = args.slice(1);
      if (item.numeric && !/^\d+$/.test(val)) {
        return ctx.reply(`⚠️ \`${item.col}\` harus berupa angka.`, { parse_mode: 'Markdown' });
      }
      const parsedVal = item.numeric ? parseInt(val, 10) : val;

      db.run(`UPDATE Server SET ${item.col} = ? WHERE domain = ?`, [parsedVal, domain], function (err) {
        if (err) return ctx.reply(`⚠️ Kesalahan saat mengedit ${item.label.toLowerCase()} server.`, { parse_mode: 'Markdown' });
        if (this.changes === 0) return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
        ctx.reply(`✅ ${item.label} server \`${domain}\` berhasil diubah menjadi \`${val}\`.`, { parse_mode: 'Markdown' });
      });
    });
  }

  bot.command('editdomain', async (ctx) => {
    if (!adminIds.includes(ctx.message.from.id)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
    }
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editdomain <old_domain> <new_domain>`', { parse_mode: 'Markdown' });
    }
    const [old_domain, new_domain] = args.slice(1);
    db.run('UPDATE Server SET domain = ? WHERE domain = ?', [new_domain, old_domain], function (err) {
      if (err) return ctx.reply('⚠️ Kesalahan saat mengedit domain server.', { parse_mode: 'Markdown' });
      if (this.changes === 0) return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      ctx.reply(`✅ Domain server \`${old_domain}\` berhasil diubah menjadi \`${new_domain}\`.`, { parse_mode: 'Markdown' });
    });
  });

  // === ACTIONS SERVER ===
  bot.action('addserver', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('🌐 *Silahkan masukkan domain/ip server:*', { parse_mode: 'Markdown' });
    userState[ctx.from.id] = { step: 'addserver' };
  });

  bot.action('detailserver', async (ctx) => {
    await ctx.answerCbQuery();
    db.all('SELECT * FROM Server', [], async (err, servers) => {
      if (err || servers.length === 0) {
        return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
      }
      const buttons = [];
      for (let i = 0; i < servers.length; i += 2) {
        const row = [{ text: servers[i].nama_server, callback_data: `server_detail_${servers[i].id}` }];
        if (i + 1 < servers.length) row.push({ text: servers[i + 1].nama_server, callback_data: `server_detail_${servers[i + 1].id}` });
        buttons.push(row);
      }
      await ctx.reply('📋 *Silahkan pilih server untuk melihat detail:*', {
        reply_markup: { inline_keyboard: buttons },
        parse_mode: 'Markdown',
      });
    });
  });

  bot.action(/server_detail_(\d+)/, async (ctx) => {
    const serverId = ctx.match[1];
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], async (err, server) => {
      if (err || !server) return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
      const serverDetails = `📋 *Detail Server* 📋\n\n` +
        `🌏 *Domain:* \`${server.domain}\`\n` +
        `🔑 *Auth:* \`${server.auth}\`\n` +
        `🏷️ *Nama Server:* \`${server.nama_server}\`\n` +
        `🌤 *Quota:* \`${server.quota}\`\n` +
        `🚀 *Limit IP:* \`${server.iplimit}\`\n` +
        `🔢 *Batas Create Akun:* \`${server.batas_create_akun}\`\n` +
        `📋 *Total Create Akun:* \`${server.total_create_akun}\`\n` +
        `💵 *Harga:* \`Rp ${server.harga}\`\n\n`;
      await ctx.reply(serverDetails, { parse_mode: 'Markdown' });
    });
  });

  bot.action('listserver', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const userRole = await new Promise((resolve) => {
      db.get('SELECT role FROM users WHERE user_id = ?', [userId], (err, row) => resolve(!err && row ? row.role : 'member'));
    });

    let resellerDiscount = 0;
    if (userRole === 'reseller') {
      resellerDiscount = await new Promise((resolve) => {
        db.get('SELECT discount_percent FROM reseller_config WHERE id = 1', (err, row) => resolve(!err && row ? row.discount_percent : 0));
      });
    }

    db.all('SELECT * FROM Server', [], async (err, servers) => {
      if (err || servers.length === 0) {
        return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
      }
      let serverList = '📜 *Daftar Server* 📜\n\n';
      servers.forEach((server) => {
        let hargaPerHari = server.harga;
        if (userRole === 'reseller' && resellerDiscount > 0) {
          hargaPerHari = Math.floor(server.harga * (100 - resellerDiscount) / 100);
        }
        serverList += `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🌏 *${server.nama_server}*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🏷️ Harga per hari: Rp${hargaPerHari}\n` +
          `📅 Harga per 30 hari: Rp${hargaPerHari * 30}\n` +
          `🌤 Quota: ${server.quota}GB\n` +
          `🚀 Limit IP: ${server.iplimit} IP\n` +
          `👥 Total Create Akun: ${server.total_create_akun}/${server.batas_create_akun}\n\n`;
      });
      serverList += `\nTotal Jumlah Server: ${servers.length}`;
      await ctx.reply(serverList, { parse_mode: 'Markdown' });
    });
  });

  bot.action('resetdb', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('🚨 *PERHATIAN! Anda akan menghapus semua server yang tersedia. Apakah Anda yakin?*', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Ya', callback_data: 'confirm_resetdb' }],
          [{ text: '❌ Tidak', callback_data: 'cancel_resetdb' }],
        ],
      },
      parse_mode: 'Markdown',
    });
  });

  bot.action('confirm_resetdb', async (ctx) => {
    await ctx.answerCbQuery();
    db.run('DELETE FROM Server', async (err) => {
      if (err) return ctx.reply('❌ *Terjadi kesalahan saat mereset database.*', { parse_mode: 'Markdown' });
      await ctx.reply('🚨 *PERHATIAN! Database telah DIRESET SEPENUHNYA. Semua server telah DIHAPUS TOTAL.*', { parse_mode: 'Markdown' });
    });
  });

  bot.action('cancel_resetdb', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('❌ *Proses reset database dibatalkan.*', { parse_mode: 'Markdown' });
  });

  bot.action('deleteserver', async (ctx) => {
    await ctx.answerCbQuery();
    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err || servers.length === 0) {
        return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
      }
      const keyboard = servers.map(s => [{ text: s.nama_server, callback_data: `confirm_delete_server_${s.id}` }]);
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
      ctx.reply('🗑️ *Pilih server yang ingin dihapus:*', {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown',
      });
    });
  });

  bot.action(/confirm_delete_server_(\d+)/, async (ctx) => {
    db.run('DELETE FROM Server WHERE id = ?', [ctx.match[1]], function (err) {
      if (err) return ctx.reply('⚠️ *PERHATIAN! Terjadi kesalahan saat menghapus server.*', { parse_mode: 'Markdown' });
      if (this.changes === 0) return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
      ctx.reply('✅ *Server berhasil dihapus.*', { parse_mode: 'Markdown' });
    });
  });

  bot.action('editserver_limit_ip', (ctx) => promptSelectServerForEdit(ctx, '📊 *Silahkan pilih server untuk mengedit limit IP:*', 'edit_limit_ip'));
  bot.action('editserver_batas_create_akun', (ctx) => promptSelectServerForEdit(ctx, '📊 *Silahkan pilih server untuk mengedit batas create akun:*', 'edit_batas_create_akun'));
  bot.action('editserver_total_create_akun', (ctx) => promptSelectServerForEdit(ctx, '📊 *Silahkan pilih server untuk mengedit total create akun:*', 'edit_total_create_akun'));
  bot.action('editserver_quota', (ctx) => promptSelectServerForEdit(ctx, '📊 *Silahkan pilih server untuk mengedit quota:*', 'edit_quota'));
  bot.action('editserver_auth', (ctx) => promptSelectServerForEdit(ctx, '🌐 *Silahkan pilih server untuk mengedit auth:*', 'edit_auth'));
  bot.action('editserver_harga', (ctx) => promptSelectServerForEdit(ctx, '💰 *Silahkan pilih server untuk mengedit harga:*', 'edit_harga'));
  bot.action('editserver_domain', (ctx) => promptSelectServerForEdit(ctx, '🌐 *Silahkan pilih server untuk mengedit domain:*', 'edit_domain'));
  bot.action('nama_server_edit', (ctx) => promptSelectServerForEdit(ctx, '🏷️ *Silahkan pilih server untuk mengedit nama:*', 'edit_nama'));

  bot.action(/edit_harga_(\d+)/, async (ctx) => {
    userState[ctx.from.id] = { step: 'edit_harga', serverId: ctx.match[1] };
    await ctx.reply('💰 *Silahkan masukkan harga server baru:*', { reply_markup: { inline_keyboard: keyboard_nomor() }, parse_mode: 'Markdown' });
  });
  bot.action(/edit_batas_create_akun_(\d+)/, async (ctx) => {
    userState[ctx.from.id] = { step: 'edit_batas_create_akun', serverId: ctx.match[1] };
    await ctx.reply('📊 *Silahkan masukkan batas create akun server baru:*', { reply_markup: { inline_keyboard: keyboard_nomor() }, parse_mode: 'Markdown' });
  });
  bot.action(/edit_total_create_akun_(\d+)/, async (ctx) => {
    userState[ctx.from.id] = { step: 'edit_total_create_akun', serverId: ctx.match[1] };
    await ctx.reply('📊 *Silahkan masukkan total create akun server baru:*', { reply_markup: { inline_keyboard: keyboard_nomor() }, parse_mode: 'Markdown' });
  });
  bot.action(/edit_limit_ip_(\d+)/, async (ctx) => {
    userState[ctx.from.id] = { step: 'edit_limit_ip', serverId: ctx.match[1] };
    await ctx.reply('📊 *Silahkan masukkan limit IP server baru:*', { reply_markup: { inline_keyboard: keyboard_nomor() }, parse_mode: 'Markdown' });
  });
  bot.action(/edit_quota_(\d+)/, async (ctx) => {
    userState[ctx.from.id] = { step: 'edit_quota', serverId: ctx.match[1] };
    await ctx.reply('📊 *Silahkan masukkan quota server baru:*', { reply_markup: { inline_keyboard: keyboard_nomor() }, parse_mode: 'Markdown' });
  });
  bot.action(/edit_auth_(\d+)/, async (ctx) => {
    userState[ctx.from.id] = { step: 'edit_auth', serverId: ctx.match[1] };
    await ctx.reply('✏️ *Silahkan kirim auth server baru sekarang:*', { parse_mode: 'Markdown' });
  });
  bot.action(/edit_domain_(\d+)/, async (ctx) => {
    userState[ctx.from.id] = { step: 'edit_domain', serverId: ctx.match[1] };
    await ctx.reply('🌐 *Silahkan kirim domain server baru sekarang:*', { parse_mode: 'Markdown' });
  });
  bot.action(/edit_nama_(\d+)/, async (ctx) => {
    userState[ctx.from.id] = { step: 'edit_nama', serverId: ctx.match[1] };
    await ctx.reply('🏷️ *Silahkan kirim nama server baru sekarang:*', { parse_mode: 'Markdown' });
  });

  // === TEXT WIZARD SERVER ===
  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const teks = ctx.message?.text?.trim();
    const state = userState[userId];

    if (!teks || teks.startsWith('/') || !state || !state.step) return next();

    if (state.step === 'addserver') {
      state.step = 'addserver_auth';
      state.domain = teks;
      return ctx.reply('🔑 *Silahkan masukkan auth server:*', { parse_mode: 'Markdown' });
    }
    if (state.step === 'addserver_auth') {
      state.step = 'addserver_nama_server';
      state.auth = teks;
      return ctx.reply('🏷️ *Silahkan masukkan nama server:*', { parse_mode: 'Markdown' });
    }
    if (state.step === 'addserver_nama_server') {
      state.step = 'addserver_quota';
      state.nama_server = teks;
      return ctx.reply('📊 *Silahkan masukkan quota server:*', { parse_mode: 'Markdown' });
    }
    if (state.step === 'addserver_quota') {
      const quota = parseInt(teks, 10);
      if (isNaN(quota)) return ctx.reply('⚠️ *Quota tidak valid.*', { parse_mode: 'Markdown' });
      state.step = 'addserver_iplimit';
      state.quota = quota;
      return ctx.reply('🔢 *Silahkan masukkan limit IP server:*', { parse_mode: 'Markdown' });
    }
    if (state.step === 'addserver_iplimit') {
      const iplimit = parseInt(teks, 10);
      if (isNaN(iplimit)) return ctx.reply('⚠️ *Limit IP tidak valid.*', { parse_mode: 'Markdown' });
      state.step = 'addserver_batas_create_akun';
      state.iplimit = iplimit;
      return ctx.reply('🔢 *Silahkan masukkan batas create akun server:*', { parse_mode: 'Markdown' });
    }
    if (state.step === 'addserver_batas_create_akun') {
      const batas = parseInt(teks, 10);
      if (isNaN(batas)) return ctx.reply('⚠️ *Batas create akun tidak valid.*', { parse_mode: 'Markdown' });
      state.step = 'addserver_harga';
      state.batas_create_akun = batas;
      return ctx.reply('💰 *Silahkan masukkan harga server:*', { parse_mode: 'Markdown' });
    }
    if (state.step === 'addserver_harga') {
      const harga = parseFloat(teks);
      if (isNaN(harga) || harga <= 0) return ctx.reply('⚠️ *Harga tidak valid.*', { parse_mode: 'Markdown' });
      const { domain, auth, nama_server, quota, iplimit, batas_create_akun } = state;

      db.run(
        'INSERT INTO Server (domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, total_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
        [domain, auth, nama_server, quota, iplimit, batas_create_akun, harga],
        (err) => {
          if (err) {
            ctx.reply('❌ *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' });
          } else {
            ctx.reply(
              `✅ *Server baru dengan domain ${domain} telah berhasil ditambahkan.*\n\n📄 *Detail Server:*\n- Domain: ${domain}\n- Auth: ${auth}\n- Nama Server: ${nama_server}\n- Quota: ${quota}\n- Limit IP: ${iplimit}\n- Batas Create Akun: ${batas_create_akun}\n- Harga: Rp ${harga}`,
              { parse_mode: 'Markdown' }
            );
          }
        }
      );
      delete userState[userId];
      return;
    }

    const editMap = {
      edit_batas_create_akun: { col: 'batas_create_akun', label: 'batas create akun', num: true },
      edit_limit_ip: { col: 'iplimit', label: 'limit IP', num: true },
      edit_quota: { col: 'quota', label: 'quota', num: true },
      edit_auth: { col: 'auth', label: 'auth', num: false },
      edit_domain: { col: 'domain', label: 'domain', num: false },
      edit_nama: { col: 'nama_server', label: 'nama server', num: false },
      edit_total_create_akun: { col: 'total_create_akun', label: 'total create akun', num: true },
    };

    if (editMap[state.step]) {
      const cfg = editMap[state.step];
      if (cfg.num && (isNaN(parseInt(teks, 10)) || parseInt(teks, 10) < 0)) {
        return ctx.reply(`⚠️ *${cfg.label} tidak valid.* Masukkan angka positif yang valid.`, { parse_mode: 'Markdown' });
      }
      const valueToStore = cfg.num ? parseInt(teks, 10) : teks;
      db.run(`UPDATE Server SET ${cfg.col} = ? WHERE id = ?`, [valueToStore, state.serverId], function (err) {
        if (err || this.changes === 0) {
          ctx.reply(`⚠️ *Server tidak ditemukan atau ${cfg.label} tidak berubah.*`, { parse_mode: 'Markdown' });
        } else {
          ctx.reply(`✅ *${cfg.label} server berhasil diubah menjadi \`${teks}\`.*`, { parse_mode: 'Markdown' });
        }
      });
      delete userState[userId];
      return;
    }

    if (state.step === 'edit_harga') {
      const hargaBaru = parseFloat(teks);
      if (isNaN(hargaBaru) || hargaBaru <= 0) {
        return ctx.reply('⚠️ *Harga tidak valid. Masukkan angka positif yang valid.*', { parse_mode: 'Markdown' });
      }
      db.run('UPDATE Server SET harga = ? WHERE id = ?', [hargaBaru, state.serverId], function (err) {
        if (err || this.changes === 0) {
          ctx.reply('⚠️ *Server tidak ditemukan atau harga tidak berubah.*', { parse_mode: 'Markdown' });
        } else {
          ctx.reply(`✅ *Harga server berhasil diubah menjadi \`Rp${hargaBaru}\`.*`, { parse_mode: 'Markdown' });
        }
      });
      delete userState[userId];
      return;
    }

    return next();
  });
}

module.exports = {
  registerAdminServer,
  handleEditHarga,
  handleEditBatasCreateAkun,
  handleEditTotalCreateAkun,
  handleEditiplimit,
  handleEditQuota,
  handleEditAuth,
  handleEditDomain,
  handleEditNama,
};
