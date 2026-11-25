const os = require('os');
const {
  db,
  logger,
  NAMA_STORE,
  adminIds,
  primaryAdminId,
  lastMenus,
  userState,
} = require('./config');

const REQUIRED_CHANNEL = '@dstore8';
const REQUIRED_GROUP = '@ZstoreVpn';
const channelLink = 'https://t.me/dstore8';
const groupLink = 'https://t.me/ZstoreVpn';

async function sendJoinGate(ctx) {
  const gateText =
`🔔 *Selamat Datang Di ${NAMA_STORE} 🤗*

\`\`\`
Untuk menggunakan bot ini, Anda harus bergabung
dengan komunitas kami terlebih dahulu.
\`\`\`

📢 *Channel*: ${REQUIRED_CHANNEL}
👥 *Group*  : ${REQUIRED_GROUP}

Silakan gabung ke keduanya, lalu tekan tombol
"✅ Saya Sudah Bergabung" di bawah ini untuk lanjut.`;

  try {
    await ctx.reply(gateText, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔗 Gabung Channel kami', url: channelLink }],
          [{ text: '💬 Gabung Group kami', url: groupLink }],
          [{ text: '✅ Saya Sudah Bergabung, Lanjutkan', callback_data: 'continue_after_join' }],
        ],
      },
    });
  } catch (e) {
    logger.error('Gagal mengirim Join Gate:', e.message);
  }
}

async function checkMembership(ctx) {
  const userId = ctx.from?.id;
  if (!userId) return true;

  try {
    const ch = await ctx.telegram.getChatMember(REQUIRED_CHANNEL, userId);
    const gr = await ctx.telegram.getChatMember(REQUIRED_GROUP, userId);
    const okStatus = new Set(['creator', 'administrator', 'member', 'owner']);
    if (okStatus.has(ch?.status) && okStatus.has(gr?.status)) {
      return true;
    }
  } catch (e) {
    logger.warn('checkMembership warn:', e.message);
  }
  return true;
}

async function sendNewMenu(ctx, text, keyboard, userId) {
  try {
    const sentMessage = await ctx.reply(text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: keyboard },
    });
    lastMenus[userId] = sentMessage.message_id;
    logger.info(`✅ Menu utama baru dikirim untuk user ${userId}`);
    return sentMessage;
  } catch (e) {
    logger.error(`❌ Gagal kirim menu baru untuk user ${userId}:`, e.message);
    return null;
  }
}

async function sendMainMenu(ctx, bot) {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  try {
    if (lastMenus[userId]) {
      try {
        await ctx.telegram.deleteMessage(chatId, lastMenus[userId]);
        logger.info(`🧹 Menu lama user ${userId} dihapus`);
      } catch (e) {
        if (!e.message.includes('message to delete not found')) {
          console.warn(`⚠️ Gagal hapus menu lama user ${userId}:`, e.message);
        }
      }
      delete lastMenus[userId];
    }

    delete userState[chatId];
    delete userState[userId];
    if (global.depositState && global.depositState[userId]) {
      delete global.depositState[userId];
    }

    const userName = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Member');
    let saldo = 0;
    let userRole = 'member';

    try {
      const row = await new Promise((resolve, reject) => {
        db.get('SELECT saldo, role FROM users WHERE user_id = ?', [userId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      saldo = row ? row.saldo : 0;
      userRole = row ? row.role : 'member';
    } catch (e) {
      logger.error('Error fetching user data:', e.message);
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let userToday = 0, userWeek = 0, userMonth = 0;
    let globalToday = 0, globalWeek = 0, globalMonth = 0;

    try {
      [userToday, userWeek, userMonth] = await Promise.all([
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM log_penjualan WHERE user_id = ? AND waktu_transaksi >= ? AND action_type IN ("create","renew")',
            [userId, todayStart], (err, row) => resolve(row ? row.count : 0));
        }),
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM log_penjualan WHERE user_id = ? AND waktu_transaksi >= ? AND action_type IN ("create","renew")',
            [userId, weekStart], (err, row) => resolve(row ? row.count : 0));
        }),
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM log_penjualan WHERE user_id = ? AND waktu_transaksi >= ? AND action_type IN ("create","renew")',
            [userId, monthStart], (err, row) => resolve(row ? row.count : 0));
        }),
      ]);

      [globalToday, globalWeek, globalMonth] = await Promise.all([
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM log_penjualan WHERE waktu_transaksi >= ? AND action_type IN ("create","renew")',
            [todayStart], (err, row) => resolve(row ? row.count : 0));
        }),
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM log_penjualan WHERE waktu_transaksi >= ? AND action_type IN ("create","renew")',
            [weekStart], (err, row) => resolve(row ? row.count : 0));
        }),
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM log_penjualan WHERE waktu_transaksi >= ? AND action_type IN ("create","renew")',
            [monthStart], (err, row) => resolve(row ? row.count : 0));
        }),
      ]);
    } catch (e) {
      logger.error('Error fetching statistics:', e.message);
    }

    let jumlahPengguna = 0;
    let jumlahServer = 0;
    try {
      const [userCount, serverCount] = await Promise.all([
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) AS count FROM users', (err, row) => resolve(err ? 0 : row.count));
        }),
        new Promise((resolve) => {
          db.get('SELECT COUNT(*) AS count FROM Server', (err, row) => resolve(err ? 0 : row.count));
        }),
      ]);
      jumlahPengguna = userCount;
      jumlahServer = serverCount;
    } catch (e) {
      logger.error('Gagal ambil data jumlah user/server:', e.message);
    }

    const [tombolTrialAktif, tombolSewaScriptAktif, isUnlimited] = await Promise.all([
      new Promise((resolve) => {
        db.get('SELECT show_trial_button FROM ui_config WHERE id = 1', (err, row) => resolve(err ? false : row?.show_trial_button === 1));
      }),
      new Promise((resolve) => {
        db.get('SELECT show_sewa_script_button FROM ui_config WHERE id = 1', (err, row) => resolve(err ? false : row?.show_sewa_script_button === 1));
      }),
      new Promise((resolve) => {
        db.get('SELECT * FROM unlimited_trial_users WHERE user_id = ?', [userId], (err, row) => resolve(err ? false : row != null));
      }),
    ]);

    const isAdmin = adminIds.includes(userId);
    const bolehLihatTrial = tombolTrialAktif || isUnlimited || isAdmin;

    let adminUsername = 'Admin';
    try {
      const telegramClient = bot ? bot.telegram : ctx.telegram;
      const adminChat = await telegramClient.getChat(primaryAdminId);
      if (adminChat.username) adminUsername = adminChat.username;
    } catch (e) {
      logger.warn('⚠️ Gagal mengambil username admin:', e.message);
    }

    const uptime = os.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const uptimeFormatted = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const currentDay = dayNames[now.getDay()];
    const currentDate = new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(now);
    const timeNow = now.toTimeString().split(' ')[0];

    let statusText = `👤 <b>ꜱᴛᴀᴛᴜꜱ:</b> <code>Member</code>`;
    if (isAdmin) statusText = `👑 <b>ꜱᴛᴀᴛᴜꜱ:</b> <code>Admin</code>`;
    else if (userRole === 'reseller') statusText = `🏆 <b>ꜱᴛᴀᴛᴜꜱ:</b> <code>Reseller</code>`;

    const messageText = `
📦━━━━━━━━━━━━━━━━━━━━━📦
      <b>✨ Z-STORE VPN ✨</b>
📦━━━━━━━━━━━━━━━━━━━━━📦

<blockquote>ꜱᴇʟᴀᴍᴀᴛ ᴅᴀᴛᴀɴɢ ᴅɪ <b>${NAMA_STORE}</b> 💎
ɴɪᴋᴍᴀᴛɪ ᴘᴇɴɢᴀʟᴀᴍᴀɴ ᴍᴇᴍʙᴇʟɪ ᴀᴋᴜɴ ᴠᴘɴ ᴛᴇʀᴄᴇᴘᴀᴛ, ᴀᴍᴀɴ, ᴅᴀɴ ᴀᴜᴛᴏᴍᴀᴛɪꜱ 🚀</blockquote>

🧭 <b>ɪɴꜰᴏʀᴍᴀꜱɪ ᴀᴋᴜɴ</b>
┏━━━━━━━━━━━━━━━━━━━━━┓
┃ 💰 <b>ꜱᴀʟᴅᴏ:</b> <code>Rp.${saldo.toLocaleString('id-ID')}</code>
┃ ${statusText}
┃ 🌐 <b>ᴜꜱᴇʀɴᴀᴍᴇ:</b> ${userName}
┃ 🆔 <b>ɪᴅ ᴘᴇɴɢɢᴜɴᴀ:</b> <code>${userId}</code>
┃ ⏱️ <b>ʙᴏᴛ ᴀᴋᴛɪꜰ:</b> <code>${uptimeFormatted}</code>
┗━━━━━━━━━━━━━━━━━━━━━┛

🎯 <b>ꜰɪᴛᴜʀ & ᴋᴇᴜɴɢɢᴜʟᴀɴ</b>
┏━━━━━━━━━━━━━━━━━━━━━┓
┃ ✨ ᴛʀɪᴀʟ 2x ꜱᴇʜᴀʀɪ
┃ 🔐 ꜱᴜᴘᴘᴏʀᴛ ᴡɪʟᴅᴄᴀʀᴅ & ᴇɴʜᴀɴᴄᴇᴅ
┃ ⚡ ꜱɪꜱᴛᴇᴍ ᴄᴇᴘᴀᴛ & ꜱᴛᴀʙɪʟ
┗━━━━━━━━━━━━━━━━━━━━━┛

📊 <b>ꜱᴛᴀᴛɪꜱᴛɪᴋ ᴀɴᴅᴀ</b>
┏━━━━━━━━━━━━━━━━━━━━━┓
┃ 📆 ʜᴀʀɪ ɪɴɪ: ${userToday} ᴀᴋᴜɴ
┃ 📅 ᴍɪɴɢɢᴜ ɪɴɪ: ${userWeek} ᴀᴋᴜɴ
┃ 🗓️ ʙᴜʟᴀɴ ɪɴɪ: ${userMonth} ᴀᴋᴜɴ
┗━━━━━━━━━━━━━━━━━━━━━┛

🌍 <b>ꜱᴛᴀᴛɪꜱᴛɪᴋ ɢʟᴏʙᴀʟ</b>
┏━━━━━━━━━━━━━━━━━━━━━┓
┃ 📆 ʜᴀʀɪ ɪɴɪ: ${globalToday} ᴀᴋᴜɴ
┃ 📅 ᴍɪɴɢɢᴜ ɪɴɪ: ${globalWeek} ᴀᴋᴜɴ
┃ 🗓️ ʙᴜʟᴀɴ ɪɴɪ: ${globalMonth} ᴀᴋᴜɴ
┗━━━━━━━━━━━━━━━━━━━━━┛

🕒 <b>ᴡᴀᴋᴛᴜ & ꜱᴇʀᴠᴇʀ</b>
┏━━━━━━━━━━━━━━━━━━━━━┓
┃ 🧭 ᴡᴀᴋᴛᴜ: <code>${timeNow} WIB</code>
┃ 📅 ᴛᴀɴɢɢᴀʟ: <code>${currentDay}, ${currentDate}</code>
┃ 🖥️ ꜱᴇʀᴠᴇʀ: <code>${jumlahServer}</code> | 👥 ᴜꜱᴇʀ: <code>${jumlahPengguna}</code>
┗━━━━━━━━━━━━━━━━━━━━━┛

☎️ <b>ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ</b>
<a href="https://t.me/${adminUsername}">╰📨 @${adminUsername}</a>

📦━━━━━━━━━━━━━━━━━━━━━📦
     <code>🌐 ᴅɪᴋᴇʟᴏʟᴀ ᴏʟᴇʜ ${NAMA_STORE} ɴᴇᴛᴡᴏʀᴋ</code>
📦━━━━━━━━━━━━━━━━━━━━━📦
`;

    const keyboard = [];
    if (bolehLihatTrial) keyboard.push([{ text: '💠 Trial Akun', callback_data: 'service_trial' }]);
    keyboard.push([
      { text: '✏️ Buat Akun', callback_data: 'service_create' },
      { text: '♻️ Renew Akun', callback_data: 'service_renew' },
    ]);
    if (tombolSewaScriptAktif) keyboard.push([{ text: '🛒 Sewa Script', callback_data: 'service_sewascript' }]);
    keyboard.push([{ text: '💰 TopUp Saldo', callback_data: 'menu_topup' }]);

    let sentMessage = null;
    if (ctx.updateType === 'callback_query' && ctx.callbackQuery?.message) {
      try {
        sentMessage = await ctx.editMessageText(messageText, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: keyboard },
        });
        logger.info(`✅ Menu utama diedit untuk user ${userId}`);
      } catch (error) {
        sentMessage = await sendNewMenu(ctx, messageText, keyboard, userId);
      }
    } else {
      sentMessage = await sendNewMenu(ctx, messageText, keyboard, userId);
    }

    if (sentMessage?.message_id) {
      lastMenus[userId] = sentMessage.message_id;
      return sentMessage;
    }

    const resent = await sendNewMenu(ctx, messageText, keyboard, userId);
    if (resent?.message_id) lastMenus[userId] = resent.message_id;
    return resent;
  } catch (error) {
    logger.error(`❌ Error fatal di sendMainMenu untuk user ${userId}:`, error.message);
    return ctx.reply('⚠️ Gagal menampilkan menu utama, coba /menu.').catch(() => null);
  }
}

function registerMenu(bot) {
  bot.action('continue_after_join', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    if (await checkMembership(ctx)) {
      return sendMainMenu(ctx, bot);
    }
    return sendJoinGate(ctx);
  });

  bot.command(['start', 'menu'], async (ctx) => {
    logger.info('📥 Perintah /start atau /menu diterima');
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;

    try { await ctx.telegram.deleteMessage(chatId, ctx.message.message_id); } catch (e) {}

    const joined = await checkMembership(ctx);
    if (!joined) {
      return sendJoinGate(ctx);
    }

    await new Promise((resolve) => {
      db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat memeriksa user_id:', err.message);
          return resolve();
        }
        if (!row) {
          db.run('INSERT INTO users (user_id, role) VALUES (?, ?)', [userId, 'member'], (errIns) => {
            if (errIns) logger.error('❌ Gagal menyimpan user_id:', errIns.message);
            else logger.info(`✅ User ID ${userId} berhasil disimpan`);
            resolve();
          });
        } else {
          resolve();
        }
      });
    });

    await sendMainMenu(ctx, bot);
  });

  bot.action('send_main_menu', async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;

    try {
      await ctx.answerCbQuery();
      if (lastMenus[userId]) {
        try {
          await ctx.telegram.deleteMessage(chatId, lastMenus[userId]);
        } catch (e) {}
      }
      const sent = await sendMainMenu(ctx, bot);
      if (sent?.message_id) {
        lastMenus[userId] = sent.message_id;
      } else {
        await ctx.reply('⚠️ Gagal menampilkan menu utama, coba /menu.');
      }
    } catch (error) {
      logger.error(`❌ Gagal handle tombol send_main_menu untuk user ${userId}:`, error.message);
      await ctx.reply('❌ Terjadi kesalahan saat memuat menu utama.\nSilakan ketik /menu untuk kembali.');
    }
  });

  bot.action('cek_saldo', async (ctx) => {
    try {
      const userId = ctx.from.id;
      const row = await new Promise((resolve, reject) => {
        db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
          if (err) return reject(new Error('❌ *Terjadi kesalahan saat memeriksa saldo Anda. Silahkan coba lagi nanti.*'));
          resolve(row);
        });
      });

      if (row) {
        await ctx.reply(`📊 *Cek Saldo*\n\n🆔 ID Telegram: ${userId}\n💰 Sisa Saldo: Rp${row.saldo}`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💸 Top Up', callback_data: 'menu_topup' }, { text: '📝 Menu Utama', callback_data: 'send_main_menu' }],
            ],
          },
        });
      } else {
        await ctx.reply('⚠️ *Anda belum memiliki saldo. Silahkan tambahkan saldo terlebih dahulu.*', { parse_mode: 'Markdown' });
      }
    } catch (error) {
      logger.error('❌ Kesalahan saat memeriksa saldo:', error);
      await ctx.reply(`❌ *${error.message}*`, { parse_mode: 'Markdown' });
    }
  });
}

module.exports = {
  registerMenu,
  sendMainMenu,
};
