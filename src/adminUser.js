const { db, logger, adminIds, userState } = require('./config');
const { getUsernameById, keyboard_nomor } = require('./utils');

function updateUserSaldo(userId, saldo) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE Users SET saldo = saldo + ? WHERE id = ?', [saldo, userId], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function resetUserSaldo(userId) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET saldo = 0 WHERE user_id = ? AND saldo > 0', [userId], function (err) {
      if (err) return reject(err);
      resolve(this.changes > 0);
    });
  });
}

function getUserSaldoById(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT user_id, saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function getUsersWithSaldo(limit, offset) {
  return new Promise((resolve, reject) => {
    db.all('SELECT user_id, saldo FROM users WHERE saldo > 0 ORDER BY saldo DESC LIMIT ? OFFSET ?', [limit, offset], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function reduceUserSaldoByInput(userId, amount) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ? AND saldo >= ?', [amount, userId, amount], function (err) {
      if (err) return reject(err);
      resolve(this.changes > 0);
    });
  });
}

function getTotalUserWithSaldo() {
  return new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as count FROM users WHERE saldo > 0', (err, row) => {
      if (err) return reject(err);
      resolve(row.count);
    });
  });
}

async function sendPaginatedUserSaldo(bot, ctx, page = 1, isEdit = false) {
  const perPage = 10;
  const offset = (page - 1) * perPage;

  try {
    const [users, total] = await Promise.all([
      getUsersWithSaldo(perPage, offset),
      getTotalUserWithSaldo(),
    ]);

    if (users.length === 0) return ctx.reply('📭 Tidak ada data saldo untuk ditampilkan.');

    let message = `<b>📋 Daftar Saldo User (Halaman ${page})</b>\n\n`;
    for (const user of users) {
      const username = await getUsernameById(bot, user.user_id);
      message += `🏷️ @${username}\n🆔 <code>${user.user_id}</code>\n💰 Rp.${user.saldo.toLocaleString('id-ID')}\n\n`;
    }

    const hasNext = offset + perPage < total;
    const keyboard = {
      inline_keyboard: [[
        ...(page > 1 ? [{ text: '⬅️ Prev', callback_data: `listsaldo_${page - 1}` }] : []),
        ...(hasNext ? [{ text: '➡️ Next', callback_data: `listsaldo_${page + 1}` }] : []),
      ]],
    };

    if (isEdit && ctx.callbackQuery?.message) {
      return ctx.telegram.editMessageText(ctx.chat.id, ctx.callbackQuery.message.message_id, null, message, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      });
    }
    return ctx.reply(message, { parse_mode: 'HTML', reply_markup: keyboard });
  } catch (err) {
    logger.error('❌ Gagal mengambil daftar saldo:', err);
    return ctx.reply('❌ Terjadi kesalahan saat mengambil daftar saldo.');
  }
}

async function handleAddSaldo(ctx, userStateData, data) {
  let currentSaldo = userStateData.saldo || '';

  if (data === 'delete') {
    currentSaldo = currentSaldo.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentSaldo.length === 0) {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo tidak boleh kosong!*', { show_alert: true });
    }
    try {
      await updateUserSaldo(userStateData.userId, currentSaldo);
      ctx.reply(`✅ *Saldo user berhasil ditambahkan.*\n\n📄 *Detail Saldo:*\n- Jumlah Saldo: *Rp ${currentSaldo}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply('❌ *Terjadi kesalahan saat menambahkan saldo user.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.from.id];
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^[0-9]+$/.test(data)) {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo tidak valid!*', { show_alert: true });
    }
    if (currentSaldo.length < 10) {
      currentSaldo += data;
    } else {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo maksimal adalah 10 karakter!*', { show_alert: true });
    }
  }

  userStateData.saldo = currentSaldo;
  const newMessage = `📊 *Silahkan masukkan jumlah saldo yang ingin ditambahkan:*\n\nJumlah saldo saat ini: *${currentSaldo}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown',
    });
  }
}

function showUnlimitedTrialPage(bot, ctx, page = 1, messageId = null) {
  const limit = 10;
  const offset = (page - 1) * limit;

  db.all('SELECT user_id FROM unlimited_trial_users ORDER BY user_id LIMIT ? OFFSET ?', [limit, offset], async (err, rows) => {
    if (err) return ctx.reply('❌ Terjadi kesalahan.');
    if (rows.length === 0) return ctx.reply('📭 Tidak ada data pengguna unlimited trial.');

    let text = `📋 *Daftar User Unlimited Trial (Halaman ${page}):*\n\n`;
    for (const [i, row] of rows.entries()) {
      const username = await getUsernameById(bot, row.user_id);
      text += `${offset + i + 1}. 👤 \`@${username}\`\n🆔 \`${row.user_id}\`\n\n`;
    }

    db.get('SELECT COUNT(*) AS total FROM unlimited_trial_users', (errCount, countRow) => {
      const total = countRow?.total || 0;
      const totalPages = Math.ceil(total / limit);
      const buttons = [];
      if (page > 1) buttons.push({ text: '⏮️ Prev', callback_data: `unlimitedtrial_prev_${page}` });
      if (page < totalPages) buttons.push({ text: 'Next ⏭️', callback_data: `unlimitedtrial_next_${page}` });

      const replyOptions = {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons.length ? [buttons] : [] },
      };

      if (messageId) {
        ctx.telegram.editMessageText(ctx.chat.id, messageId, null, text, replyOptions).catch(() => {});
      } else {
        ctx.reply(text, replyOptions);
      }
    });
  });
}

async function sendPaginatedResellerList(bot, ctx, page = 1, messageId = null) {
  const limit = 10;
  const offset = (page - 1) * limit;

  try {
    const resellers = await new Promise((resolve, reject) => {
      db.all("SELECT user_id, saldo FROM users WHERE role = 'reseller' ORDER BY user_id LIMIT ? OFFSET ?", [limit, offset], (err, rows) => (err ? reject(err) : resolve(rows)));
    });

    const totalResellers = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'reseller'", (err, row) => (err ? reject(err) : resolve(row.count)));
    });

    if (resellers.length === 0) {
      const msg = '📭 Belum ada reseller terdaftar.';
      return messageId ? ctx.telegram.editMessageText(ctx.chat.id, messageId, null, msg) : ctx.reply(msg);
    }

    let message = `👥 *Daftar Reseller (Halaman ${page}):*\n\n`;
    for (const reseller of resellers) {
      const username = await getUsernameById(bot, reseller.user_id);
      message += `👤 \`@${username}\`\n🆔 \`${reseller.user_id}\`\n💰 Saldo: Rp${(reseller.saldo || 0).toLocaleString('id-ID')}\n\n`;
    }

    const totalPages = Math.ceil(totalResellers / limit);
    const navButtons = [];
    if (page > 1) navButtons.push({ text: '⬅️ Prev', callback_data: `listreseller_prev_${page}` });
    if (page < totalPages) navButtons.push({ text: 'Next ➡️', callback_data: `listreseller_next_${page}` });

    const replyOptions = {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: navButtons.length > 0 ? [navButtons] : [] },
    };

    if (messageId) {
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, messageId, null, message, replyOptions);
      } catch (e) {
        await ctx.reply(message, replyOptions);
      }
    } else {
      await ctx.reply(message, replyOptions);
    }
  } catch (err) {
    logger.error('❌ Gagal menampilkan daftar reseller:', err);
    await ctx.reply('❌ Terjadi kesalahan saat mengambil daftar reseller.');
  }
}

async function downgradeInactiveResellers(bot) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  db.all("SELECT user_id FROM users WHERE role = 'reseller'", [], (err, resellers) => {
    if (err) return logger.error('❌ Error mengambil daftar reseller untuk downgrade:', err.message);

    for (const reseller of resellers) {
      if (adminIds.includes(reseller.user_id)) continue;

      db.get(
        "SELECT COUNT(*) AS total_transactions FROM log_penjualan WHERE user_id = ? AND waktu_transaksi >= ? AND action_type IN ('create', 'renew')",
        [reseller.user_id, thirtyDaysAgo],
        (errTrx, row) => {
          if (errTrx) return;
          const totalTransactions = row?.total_transactions || 0;

          if (totalTransactions < 3) {
            db.run("UPDATE users SET role = 'member' WHERE user_id = ?", [reseller.user_id], (errUpd) => {
              if (!errUpd) {
                logger.info(`📉 Reseller ${reseller.user_id} didowngrade ke member (transaksi: ${totalTransactions})`);
                bot.telegram.sendMessage(
                  reseller.user_id,
                  '⚠️ *Pemberitahuan Penting: Role Reseller Anda telah dinonaktifkan.*\n\n' +
                  'Anda telah didowngrade menjadi *Member Biasa* karena jumlah transaksi Anda dalam 30 hari terakhir kurang dari 3 transaksi. ' +
                  'Jika Anda ingin menjadi Reseller kembali, silakan hubungi administrator.',
                  { parse_mode: 'Markdown' }
                ).catch(() => {});
              }
            });
          }
        }
      );
    }
  });
}

function registerAdminUser(bot) {
  // === SALDO COMMANDS ===
  bot.command('addsaldo', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
    }
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/addsaldo <user_id> <jumlah>`', { parse_mode: 'Markdown' });
    }
    const targetUserId = parseInt(args[1], 10);
    const amount = parseInt(args[2], 10);
    if (isNaN(targetUserId) || isNaN(amount)) {
      return ctx.reply('⚠️ `user_id` dan `jumlah` harus berupa angka.', { parse_mode: 'Markdown' });
    }

    db.get('SELECT * FROM users WHERE user_id = ?', [targetUserId], (err, row) => {
      if (err) return ctx.reply('⚠️ Kesalahan saat memeriksa `user_id`.', { parse_mode: 'Markdown' });
      if (!row) return ctx.reply('⚠️ `user_id` tidak terdaftar.', { parse_mode: 'Markdown' });

      db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, targetUserId], function (errUpd) {
        if (errUpd || this.changes === 0) return ctx.reply('⚠️ Gagal menambahkan saldo.', { parse_mode: 'Markdown' });
        ctx.reply(`✅ Saldo sebesar \`${amount}\` berhasil ditambahkan untuk \`user_id\` \`${targetUserId}\`.`, { parse_mode: 'Markdown' });
      });
    });
  });

  bot.command('ceksaldo', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return ctx.reply('❌ Anda tidak memiliki izin untuk menggunakan perintah ini.');
    const input = ctx.message.text.split(' ')[1];
    if (!input) return ctx.reply('⚠️ Contoh: /ceksaldo 123456789');

    const targetId = parseInt(input, 10);
    if (isNaN(targetId)) return ctx.reply('❌ Hanya mendukung ID, bukan username. Contoh: /ceksaldo 123456789');

    const user = await getUserSaldoById(targetId);
    if (!user) return ctx.reply('❌ User tidak ditemukan.');
    ctx.reply(`📋 *Saldo User:*\n🆔 \`${user.user_id}\`\n💰 Rp${user.saldo.toLocaleString('id-ID')}`, { parse_mode: 'Markdown' });
  });

  bot.command('kurangisaldo', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return ctx.reply('❌ Anda tidak memiliki izin untuk menggunakan perintah ini.');
    const args = ctx.message.text.trim().split(' ');
    if (args.length !== 3) return ctx.reply('⚠️ Format salah. Contoh: /kurangisaldo 123456789 5000');

    const targetId = parseInt(args[1], 10);
    const amount = parseInt(args[2], 10);
    if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Format salah. Gunakan ID dan nominal angka yang valid.');
    }

    const user = await getUserSaldoById(targetId);
    if (!user) return ctx.reply('❌ User tidak ditemukan.');
    if (user.saldo < amount) return ctx.reply(`❌ Saldo user hanya Rp${user.saldo.toLocaleString('id-ID')}, tidak cukup.`);

    const success = await reduceUserSaldoByInput(targetId, amount);
    if (!success) return ctx.reply('❌ Gagal mengurangi saldo.');

    const newUser = await getUserSaldoById(targetId);
    ctx.reply(`✅ Saldo berhasil dikurangi.\n\n🆔 \`${newUser.user_id}\`\n💰 Saldo Sekarang: *Rp${newUser.saldo.toLocaleString('id-ID')}*`, { parse_mode: 'Markdown' });
  });

  bot.command('resetsaldo', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return ctx.reply('❌ Anda tidak memiliki izin untuk menggunakan perintah ini.');
    const input = ctx.message.text.split(' ')[1];
    if (!input) return ctx.reply('⚠️ Contoh: /resetsaldo 123456789');

    const success = await resetUserSaldo(input);
    if (success) ctx.reply(`✅ Saldo untuk user *${input}* telah direset ke 0.`, { parse_mode: 'Markdown' });
    else ctx.reply('❌ Gagal reset saldo. Mungkin user tidak ditemukan atau saldonya sudah 0.');
  });

  bot.command('listsaldo', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return ctx.reply('❌ Anda tidak memiliki izin untuk melihat daftar saldo.');
    await sendPaginatedUserSaldo(bot, ctx, 1);
  });

  // === SALDO INLINE ACTIONS ===
  async function renderUserSaldoPage(ctx, pageIndex) {
    const offset = pageIndex * 20;
    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT id, user_id FROM Users LIMIT 20 OFFSET ${offset}`, [], (err, rows) => (err ? reject(err) : resolve(rows)));
    });
    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM Users', [], (err, row) => (err ? reject(err) : resolve(row.count)));
    });

    const buttons = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const u1 = await getUsernameById(bot, users[i].user_id);
      row.push({ text: u1 || String(users[i].user_id), callback_data: `add_saldo_${users[i].id}` });
      if (i + 1 < users.length) {
        const u2 = await getUsernameById(bot, users[i + 1].user_id);
        row.push({ text: u2 || String(users[i + 1].user_id), callback_data: `add_saldo_${users[i + 1].id}` });
      }
      buttons.push(row);
    }

    if (pageIndex > 0) buttons.push([{ text: '⬅️ Back', callback_data: `prev_users_${pageIndex - 1}` }]);
    if (offset + 20 < totalUsers) buttons.push([{ text: '➡️ Next', callback_data: `next_users_${pageIndex + 1}` }]);

    return { inline_keyboard: buttons };
  }

  bot.action('addsaldo_user', async (ctx) => {
    await ctx.answerCbQuery();
    const replyMarkup = await renderUserSaldoPage(ctx, 0);
    await ctx.reply('📊 *Silahkan pilih user untuk menambahkan saldo:*', { reply_markup: replyMarkup, parse_mode: 'Markdown' });
  });

  bot.action(/next_users_(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const replyMarkup = await renderUserSaldoPage(ctx, parseInt(ctx.match[1], 10));
    await ctx.editMessageReplyMarkup(replyMarkup);
  });

  bot.action(/prev_users_(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const replyMarkup = await renderUserSaldoPage(ctx, parseInt(ctx.match[1], 10));
    await ctx.editMessageReplyMarkup(replyMarkup);
  });

  bot.action(/add_saldo_(\d+)/, async (ctx) => {
    userState[ctx.from.id] = { step: 'add_saldo', userId: ctx.match[1] };
    await ctx.reply('📊 *Silahkan masukkan jumlah saldo yang ingin ditambahkan:*', {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown',
    });
  });

  // === UNLIMITED TRIAL ===
  bot.command('unlimitedtrial', (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return ctx.reply('❌ Anda tidak memiliki izin.');
    const args = ctx.message.text.split(' ');
    if (args.length !== 2 || isNaN(args[1])) return ctx.reply('⚠️ Format salah. Gunakan: /unlimitedtrial <user_id>');

    const targetUserId = parseInt(args[1], 10);
    if (adminIds.includes(targetUserId)) return;

    db.run('INSERT OR IGNORE INTO unlimited_trial_users (user_id) VALUES (?)', [targetUserId], (err) => {
      if (err) return ctx.reply('❌ Gagal menambahkan user unlimited trial.');
      ctx.reply(`✅ User \`${targetUserId}\` sekarang bisa trial tanpa batas.`, { parse_mode: 'Markdown' });
    });
  });

  bot.command('listunlimitedtrial', (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return;
    showUnlimitedTrialPage(bot, ctx, 1);
  });

  bot.action(/^unlimitedtrial_(next|prev)_(\d+)$/, async (ctx) => {
    let page = parseInt(ctx.match[2], 10);
    page = ctx.match[1] === 'next' ? page + 1 : Math.max(1, page - 1);
    await ctx.answerCbQuery();
    showUnlimitedTrialPage(bot, ctx, page, ctx.callbackQuery.message.message_id);
  });

  bot.command('removeunlimitedtrial', (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return;
    const args = ctx.message.text.split(' ');
    if (args.length !== 2 || isNaN(args[1])) return ctx.reply('⚠️ Format salah. Gunakan: /removeunlimitedtrial <user_id>');

    const targetId = parseInt(args[1], 10);
    db.run('DELETE FROM unlimited_trial_users WHERE user_id = ?', [targetId], function (err) {
      if (err) return ctx.reply('❌ Gagal menghapus user.');
      if (this.changes === 0) return ctx.reply(`ℹ️ User \`${targetId}\` tidak ditemukan di daftar unlimited.`, { parse_mode: 'Markdown' });
      ctx.reply(`✅ Izin trial unlimited untuk user \`${targetId}\` telah dicabut.`, { parse_mode: 'Markdown' });
    });
  });

  // === RESELLER MANAGEMENT ===
  bot.command('setreseller', (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return ctx.reply('⚠️ Anda tidak memiliki izin.', { parse_mode: 'Markdown' });
    const args = ctx.message.text.split(' ');
    if (args.length !== 2 || isNaN(args[1])) return ctx.reply('⚠️ Format salah. Gunakan: `/setreseller <user_id>`', { parse_mode: 'Markdown' });

    const targetUserId = parseInt(args[1], 10);
    if (adminIds.includes(targetUserId)) return ctx.reply('⚠️ Tidak dapat mengubah role admin lain.', { parse_mode: 'Markdown' });

    db.run("UPDATE users SET role = 'reseller' WHERE user_id = ?", [targetUserId], function (err) {
      if (err || this.changes === 0) return ctx.reply('⚠️ Pengguna tidak ditemukan atau sudah menjadi reseller.', { parse_mode: 'Markdown' });
      ctx.reply(`✅ Pengguna \`${targetUserId}\` berhasil diatur sebagai *Reseller*.`, { parse_mode: 'Markdown' });
      bot.telegram.sendMessage(targetUserId, '🎉 Selamat! Akun Anda telah diupgrade menjadi *Reseller*! Nikmati harga khusus dan fitur reseller.', { parse_mode: 'Markdown' }).catch(() => {});
    });
  });

  bot.command('unsetreseller', (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return ctx.reply('⚠️ Anda tidak memiliki izin.', { parse_mode: 'Markdown' });
    const args = ctx.message.text.split(' ');
    if (args.length !== 2 || isNaN(args[1])) return ctx.reply('⚠️ Format salah. Gunakan: `/unsetreseller <user_id>`', { parse_mode: 'Markdown' });

    const targetUserId = parseInt(args[1], 10);
    if (adminIds.includes(targetUserId)) return ctx.reply('⚠️ Tidak dapat mengubah role admin lain.', { parse_mode: 'Markdown' });

    db.run("UPDATE users SET role = 'member' WHERE user_id = ?", [targetUserId], function (err) {
      if (err || this.changes === 0) return ctx.reply('⚠️ Pengguna tidak ditemukan atau sudah menjadi member.', { parse_mode: 'Markdown' });
      ctx.reply(`✅ Pengguna \`${targetUserId}\` berhasil diubah menjadi *Member Biasa*.`, { parse_mode: 'Markdown' });
      bot.telegram.sendMessage(targetUserId, '😔 Informasi: Role akun Anda telah diubah menjadi *Member Biasa*.', { parse_mode: 'Markdown' }).catch(() => {});
    });
  });

  bot.command('listreseller', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return ctx.reply('❌ Anda tidak memiliki izin.', { parse_mode: 'Markdown' });
    await sendPaginatedResellerList(bot, ctx, 1);
  });

  bot.action('listreseller', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) {
      return ctx.answerCbQuery('❌ Anda tidak memiliki izin.', { show_alert: true });
    }
    await ctx.answerCbQuery();
    await sendPaginatedResellerList(bot, ctx, 1);
  });

  bot.action(/^listreseller_(next|prev)_(\d+)$/, async (ctx) => {
    let page = parseInt(ctx.match[2], 10);
    page = ctx.match[1] === 'next' ? page + 1 : Math.max(1, page - 1);
    await ctx.answerCbQuery();
    await sendPaginatedResellerList(bot, ctx, page, ctx.callbackQuery.message.message_id);
  });

  bot.command('setdiskonreseller', (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return ctx.reply('⚠️ Anda tidak memiliki izin.', { parse_mode: 'Markdown' });
    const args = ctx.message.text.split(' ');
    const discountPercent = parseInt(args[1], 10);
    if (args.length !== 2 || isNaN(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/setdiskonreseller <persen>` (0-100)', { parse_mode: 'Markdown' });
    }
    db.run('UPDATE reseller_config SET discount_percent = ? WHERE id = 1', [discountPercent], (err) => {
      if (err) return ctx.reply('❌ Kesalahan saat mengatur diskon reseller.', { parse_mode: 'Markdown' });
      ctx.reply(`✅ Diskon reseller berhasil diatur menjadi *${discountPercent}%*.`, { parse_mode: 'Markdown' });
    });
  });

  bot.command('resetdiskonreseller', (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return ctx.reply('⚠️ Anda tidak memiliki izin.', { parse_mode: 'Markdown' });
    db.run('UPDATE reseller_config SET discount_percent = 0 WHERE id = 1', (err) => {
      if (err) return ctx.reply('❌ Kesalahan saat mereset diskon reseller.', { parse_mode: 'Markdown' });
      ctx.reply('✅ Diskon reseller berhasil direset menjadi *0%*.', { parse_mode: 'Markdown' });
    });
  });

  // === TEXT INPUT ADD SALDO ===
  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const teks = ctx.message?.text?.trim();
    const state = userState[userId];

    if (!teks || teks.startsWith('/') || !state || state.step !== 'add_saldo') return next();

    const amount = parseInt(teks, 10);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('⚠️ *Jumlah saldo tidak valid. Masukkan angka positif.*', { parse_mode: 'Markdown' });
    }

    db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, state.userId], function (err) {
      if (err) {
        ctx.reply('❌ *Terjadi kesalahan saat menambahkan saldo user.*', { parse_mode: 'Markdown' });
      } else if (this.changes > 0) {
        ctx.reply(`✅ *Saldo sebesar \`${amount}\` berhasil ditambahkan ke user ID \`${state.userId}\`.*`, { parse_mode: 'Markdown' });
      } else {
        ctx.reply('⚠️ *Pengguna tidak ditemukan atau saldo tidak berubah.*', { parse_mode: 'Markdown' });
      }
    });

    delete userState[userId];
  });
}

module.exports = {
  registerAdminUser,
  sendPaginatedUserSaldo,
  sendPaginatedResellerList,
  showUnlimitedTrialPage,
  handleAddSaldo,
  downgradeInactiveResellers,
};
