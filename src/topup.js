const axios = require('axios');
const { QRISGenerator } = require('autoft-qris');
const {
  db,
  logger,
  vars,
  NAMA_STORE,
  DATA_QRIS,
  MERCHANT_ID,
  API_KEY,
  AUTHX,
  GROUP_USERNAME,
  primaryAdminId,
  loadButtonConfig,
  lastMenus,
} = require('./config');
const {
  generateRandomAmount,
  keyboard_nomor,
  updateUserBalance,
  getUserSaldo,
  getBotGroupData,
} = require('./utils');

let lastRequestTime = 0;
const requestInterval = 1000;

const qris = new QRISGenerator({
  storeName: NAMA_STORE,
  auth_username: MERCHANT_ID,
  auth_token: API_KEY,
  baseQrString: DATA_QRIS,
  logoPath: 'logo.png',
}, 'theme1');

function loadPendingDepositsFromDb() {
  db.all('SELECT * FROM pending_deposits WHERE status = "pending"', [], (err, rows) => {
    if (err) {
      logger.error('Gagal load pending_deposits:', err.message);
      return;
    }
    rows.forEach((row) => {
      global.pendingDeposits[row.unique_code] = {
        amount: row.amount,
        originalAmount: row.original_amount,
        userId: row.user_id,
        username: row.username,
        timestamp: row.timestamp,
        status: row.status,
        qrMessageId: row.qr_message_id,
      };
    });
    logger.info('Pending deposit loaded:', Object.keys(global.pendingDeposits).length);
  });
}

function insertPendingDeposit(uniqueCode, userId, username, finalAmount, originalAmount, qrMessageId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO pending_deposits (unique_code, user_id, username, amount, original_amount, timestamp, status, qr_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uniqueCode, userId, username, finalAmount, originalAmount, Date.now(), 'pending', qrMessageId],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

function deletePendingDeposit(uniqueCode) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function logTopup(user_id, username, amount, method) {
  db.run(
    'INSERT INTO topup_log (user_id, username, amount, method, waktu) VALUES (?, ?, ?, ?, ?)',
    [user_id, username || '', amount, method, new Date().toISOString()],
    (err) => {
      if (err) logger.error('❌ Gagal insert ke topup_log:', err.message);
      else logger.info(`✅ Log Topup: ${user_id} - ${username} - Rp${amount} - ${method}`);
    }
  );
}

function prosesBonusTopUp(bot, user_id, username, original_amount) {
  return new Promise((resolve) => {
    db.get('SELECT * FROM bonus_config WHERE id = 1', (err, config) => {
      if (err || !config) return resolve();

      if (config.enabled && original_amount >= config.min_topup) {
        const bonus = Math.floor(original_amount * config.bonus_percent / 100);
        db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [bonus, user_id], (err2) => {
          if (err2) return resolve();
          db.run(
            'INSERT INTO bonus_log (user_id, username, amount, bonus, timestamp) VALUES (?, ?, ?, ?, ?)',
            [user_id, username || '', original_amount, bonus, new Date().toISOString()],
            () => {
              bot.telegram.sendMessage(
                user_id,
                `🎁 *Bonus Top Up!* Kamu dapat saldo tambahan *Rp${bonus}* (${config.bonus_percent}%)`,
                { parse_mode: 'Markdown' }
              ).catch(() => {});
              resolve();
            }
          );
        });
      } else {
        resolve();
      }
    });
  });
}

async function sendPaymentSuccessNotificationByUserId(bot, userId, deposit, currentBalance, username = 'Tidak tersedia') {
  try {
    const hasBonus = deposit.bonus && deposit.bonus > 0 && deposit.bonus_percent;
    const bonusLine = hasBonus
      ? `🎁 Bonus           : Rp${(deposit.bonus || 0).toLocaleString('id-ID')} (${deposit.bonus_percent || 0}%)\n`
      : '';

    const messageText =
`╭──────────────╮
   📦 TOP UP BERHASIL 📦
╰──────────────╯
\`\`\`
🏷️ Username        : @${username}
🆔 ID              : ${userId}
💰 Nominal Top Up  : Rp${deposit.amount.toLocaleString('id-ID')}
${bonusLine}💳 Saldo Sekarang  : Rp${currentBalance.toLocaleString('id-ID')}
\`\`\`

━━━━━━━━━━━━━━
✨ Terima kasih sudah melakukan Top Up ✨
━━━━━━━━━━━━━━`;

    await bot.telegram.sendMessage(userId, messageText, {
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💸 Top Up', callback_data: 'menu_topup' },
            { text: '📝 Menu Utama', callback_data: 'send_main_menu' },
          ],
        ],
      },
    });

    if (deposit.qrMessageId) {
      try {
        await bot.telegram.deleteMessage(userId, deposit.qrMessageId);
      } catch (e) {}
    }

    const group = getBotGroupData();
    if (group) {
      try {
        await axios.post(`https://api.telegram.org/bot${group.keyGroup}/sendMessage`, {
          chat_id: group.chatId,
          text: messageText,
          parse_mode: 'MarkdownV2',
        });
      } catch (err) {
        logger.warn(`❗ Gagal kirim notif topup ke grup: ${err.response?.data?.description || err.message}`);
      }
    }

    return true;
  } catch (error) {
    logger.error('❌ Error sending payment notification:', error);
    return false;
  }
}

async function processDeposit(ctx, amount) {
  const currentTime = Date.now();
  const userId = ctx.from.id;

  if (global.depositState?.[userId]) {
    return ctx.reply('⚠️ Kamu masih punya transaksi deposit yang belum selesai!');
  }

  if (currentTime - lastRequestTime < requestInterval) {
    return ctx.reply('⚠️ *Terlalu banyak permintaan. Silahkan tunggu sebentar sebelum mencoba lagi.*', { parse_mode: 'Markdown' });
  }
  lastRequestTime = currentTime;

  const uniqueCode = `user-${userId}-${currentTime}`;
  const finalAmount = generateRandomAmount(parseInt(amount, 10));
  global.pendingDeposits ??= {};
  global.depositState[userId] = true;

  const withTimeout = (promise, ms, message = 'Waktu tunggu habis') =>
    Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);

  async function resetDepositState() {
    delete global.depositState?.[userId];
    delete global.pendingDeposits?.[uniqueCode];
    await deletePendingDeposit(uniqueCode).catch(() => {});
  }

  let waitMsg;
  try {
    waitMsg = await ctx.reply('⏳ Mohon menunggu...');
    let dots = 0;
    const loading = setInterval(async () => {
      dots = (dots + 1) % 4;
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, '⏳ Mohon menunggu' + '.'.repeat(dots));
      } catch {
        clearInterval(loading);
      }
    }, 700);

    let qrString, qrBuffer;
    try {
      qrString = qris.generateQrString(finalAmount);
      qrBuffer = await withTimeout(qris.generateQRWithLogo(qrString), 10000, 'Timeout generate QR');
    } catch (err) {
      try {
        const QRCode = require('qrcode');
        qrBuffer = await QRCode.toBuffer(qrString, { width: 300 });
      } catch (fallbackErr) {
        clearInterval(loading);
        await ctx.reply('❌ Gagal membuat QRIS. Silakan coba lagi nanti.');
        await resetDepositState();
        return;
      }
    }

    clearInterval(loading);

    const caption = [
      `┏━━━━━━━━━━━━━━━━━━━━━┓`,
      `          🏷️*ᴅᴇᴛᴀɪʟ ᴘᴇᴍʙᴀʏᴀʀᴀɴ*🏷️`,
      `┗━━━━━━━━━━━━━━━━━━━━━┛`,
      ``,
      `💵 ɴᴏᴍɪɴᴀʟ: *Rp ${finalAmount}*`,
      `⏳ ʙᴀᴛᴀꜱ ᴡᴀᴋᴛᴜ: *5 ᴍᴇɴɪᴛ*`,
      `⚠️ ᴛʀᴀɴꜱꜰᴇʀ *ʜᴀʀᴜꜱ ꜱᴇꜱᴜᴀɪ ɴᴏᴍɪɴᴀʟ*`,
      ``,
      `✅ ᴘᴇᴍʙᴀʏᴀʀᴀɴ ᴏᴛᴏᴍᴀᴛɪꜱ`,
      `📌 ᴊᴀɴɢᴀɴ ᴛᴜᴛᴜᴘ ʜᴀʟᴀᴍᴀɴ ɪɴɪ`,
      ``,
      `┏━━━━━━━━━━━━━━━━━━━━━┓`,
      `    🌐 ᴅɪᴋᴇʟᴏʟᴀ ᴏʟᴇʜ *ᴀɴꜱᴇɴᴅᴀɴᴛ ɴᴇᴛᴡᴏʀᴋ*`,
      `┗━━━━━━━━━━━━━━━━━━━━━┛`,
    ].join('\n');

    const qrMessage = await ctx.replyWithPhoto(
      { source: qrBuffer },
      {
        caption,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📢 Join Channel', url: `https://t.me/${GROUP_USERNAME}` }],
            [{ text: '❌ Batal Topup', callback_data: `batal_topup_${uniqueCode}` }],
          ],
        },
      }
    );

    try { await ctx.deleteMessage(waitMsg.message_id); } catch {}

    global.pendingDeposits[uniqueCode] = {
      amount: finalAmount,
      originalAmount: parseInt(amount, 10),
      userId,
      username: ctx.from.username || `user_${userId}`,
      timestamp: Date.now(),
      status: 'pending',
      qrMessageId: qrMessage.message_id,
    };

    await insertPendingDeposit(
      uniqueCode,
      userId,
      ctx.from.username || `user_${userId}`,
      finalAmount,
      parseInt(amount, 10),
      qrMessage.message_id
    );

    delete global.depositState[userId];
  } catch (error) {
    logger.error('❌ Kesalahan saat memproses deposit:', error);
    await resetDepositState();
    await ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses pembayaran. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
}

async function processMatchingPayment(bot, deposit, matchingTransaction) {
  const transactionId = matchingTransaction.issuer_reff;
  const amount = matchingTransaction.amount;

  if (!deposit.username) {
    try {
      const telegramUser = await bot.telegram.getChat(deposit.userId);
      deposit.username = telegramUser.username || 'Tidak tersedia';
    } catch (e) {
      deposit.username = 'Tidak tersedia';
    }
  }

  const transactionKey = `${transactionId}_${amount}`;
  if (global.processedTransactions.has(transactionKey)) return false;

  try {
    await updateUserBalance(deposit.userId, Number(deposit.originalAmount));

    const config = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM bonus_config WHERE id = 1', (err, row) => (err ? reject(err) : resolve(row)));
    });

    if (config?.enabled && deposit.originalAmount >= config.min_topup) {
      deposit.bonus = Math.floor(deposit.originalAmount * config.bonus_percent / 100);
      deposit.bonus_percent = config.bonus_percent;
      await prosesBonusTopUp(bot, deposit.userId, deposit.username, deposit.originalAmount);
    } else {
      deposit.bonus = 0;
      deposit.bonus_percent = 0;
    }

    logTopup(deposit.userId, deposit.username, deposit.originalAmount, 'QRIS Orkut');

    const userBalance = await new Promise((resolve, reject) => {
      db.get('SELECT saldo FROM users WHERE user_id = ?', [deposit.userId], (err, row) => (err ? reject(err) : resolve(row)));
    });

    if (!userBalance) throw new Error('User balance not found after update');

    const notificationSent = await sendPaymentSuccessNotificationByUserId(
      bot,
      deposit.userId,
      {
        amount: deposit.originalAmount,
        originalAmount: deposit.originalAmount,
        bonus: deposit.bonus,
        bonus_percent: deposit.bonus_percent,
        qrMessageId: deposit.qrMessageId,
      },
      userBalance.saldo,
      deposit.username
    );

    if (notificationSent) {
      global.processedTransactions.add(transactionKey);
      return true;
    }
    return false;
  } catch (error) {
    logger.error('❌ Error processing payment:', error);
    return false;
  }
}

async function checkQRISStatus(bot) {
  try {
    const pendingDeposits = Object.entries(global.pendingDeposits);
    for (const [uniqueCode, deposit] of pendingDeposits) {
      if (deposit.status !== 'pending') continue;

      if (Date.now() - deposit.timestamp > 5 * 60 * 1000) {
        try {
          if (deposit.qrMessageId) await bot.telegram.deleteMessage(deposit.userId, deposit.qrMessageId);
          await bot.telegram.sendMessage(
            deposit.userId,
            '❌ *Pembayaran Kedaluwarsa*\n\nWaktu pembayaran telah habis. Silahkan klik Top Up lagi untuk mendapatkan QR baru.',
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          logger.error('Error hapus QR expired:', error);
        } finally {
          delete global.pendingDeposits[uniqueCode];
          db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode]);
        }
        continue;
      }

      try {
        const checkPaymentUrl = `https://mutasiv1.autsc.my.id/check-payment?auth=${AUTHX}&merchant=${MERCHANT_ID}&token=${API_KEY}`;
        const result = await axios.get(checkPaymentUrl);

        if (result.data.status === 'success' && Array.isArray(result.data.data) && result.data.data.length > 0) {
          for (const transaction of result.data.data) {
            if (parseInt(transaction.amount, 10) === deposit.amount) {
              const transactionKey = `${transaction.issuer_reff}_${transaction.amount}`;
              if (global.processedTransactions.has(transactionKey)) continue;

              const success = await processMatchingPayment(bot, deposit, transaction);
              if (success) {
                delete global.pendingDeposits[uniqueCode];
                db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode]);
                break;
              }
            }
          }
        }
      } catch (error) {
        logger.error(`Error cek status QRIS untuk ${uniqueCode}:`, error.message);
      }
    }
  } catch (error) {
    logger.error('Error di checkQRISStatus:', error);
  }
}

async function processDepositSaweria(ctx, amount) {
  try {
    const SAWERIA_USERNAME = process.env.SAWERIA_USERNAME || vars.SAWERIA_USERNAME;
    const SAWERIA_EMAIL = process.env.SAWERIA_EMAIL || vars.SAWERIA_EMAIL;

    if (!SAWERIA_USERNAME || !SAWERIA_EMAIL) {
      return ctx.reply('❌ *Konfigurasi Saweria belum lengkap.*', { parse_mode: 'Markdown' });
    }

    const amountInt = parseInt(amount, 10);
    const apiUrl = `https://saweria.autsc.my.id/api/create?username=${encodeURIComponent(SAWERIA_USERNAME)}&amount=${amountInt}&email=${encodeURIComponent(SAWERIA_EMAIL)}`;
    const res = await axios.get(apiUrl);
    const result = res.data;

    if (!result.success || !result.data?.qrImageUrl || !result.data?.transactionId) {
      return ctx.reply('❌ *Gagal membuat QR Saweria.*', { parse_mode: 'Markdown' });
    }

    const { qrImageUrl, transactionId, timestamp } = result.data;
    let bonus = 0;
    let bonus_percent = 0;

    await new Promise((resolve) => {
      db.get('SELECT * FROM bonus_config WHERE id = 1', (err, config) => {
        if (!err && config && config.enabled && amountInt >= config.min_topup) {
          bonus_percent = config.bonus_percent;
          bonus = Math.floor(amountInt * bonus_percent / 100);
        }
        resolve();
      });
    });

    if (!global.pendingDepositsSaweria) global.pendingDepositsSaweria = {};
    global.pendingDepositsSaweria[transactionId] = {
      userId: ctx.from.id,
      username: ctx.from.username ? `@${ctx.from.username}` : 'Tidak tersedia',
      amount: amountInt,
      bonus,
      bonus_percent,
      created_at: Date.now(),
      checked: false,
    };

    const qrMessage = await ctx.replyWithPhoto(qrImageUrl, {
      caption: `❇️ *Informasi Deposit Anda* ❇️

🏷️ *» Kode Transaksi:* \`${transactionId}\`
🏷️ *» Jumlah:* Rp${amountInt.toLocaleString('id-ID')}
🏷️ *» Waktu:* ${timestamp}

🏷️ *» Silahkan scan QR berikut untuk membayar melalui QRIS.*
🏷️ *» Expired:* 5 menit dari sekarang`,
      parse_mode: 'Markdown',
    });

    global.pendingDepositsSaweria[transactionId].qrMessageId = qrMessage.message_id;
  } catch (err) {
    logger.error('❌ Gagal proses QRIS Saweria:', err.stack || err);
    await ctx.reply('❌ *Gagal membuat QRIS Saweria.* Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
}

async function checkSaweriaStatus(bot) {
  try {
    const pending = global.pendingDepositsSaweria || {};
    const transactions = Object.entries(pending);
    if (transactions.length === 0) return;

    for (const [idtrx, dep] of transactions) {
      if (dep.checked) continue;

      if (Date.now() - dep.created_at > 5 * 60 * 1000) {
        try {
          if (dep.qrMessageId) await bot.telegram.deleteMessage(dep.userId, dep.qrMessageId).catch(() => {});
          await bot.telegram.sendMessage(
            dep.userId,
            '❌ *Pembayaran Saweria Expired*\n\nWaktu pembayaran telah habis. Silahkan klik Top Up lagi untuk mendapatkan QR baru.',
            { parse_mode: 'Markdown' }
          );
        } finally {
          delete global.pendingDepositsSaweria[idtrx];
        }
        continue;
      }

      try {
        const res = await axios.get(`https://saweria.autsc.my.id/check-payment?idtransaksi=${idtrx}`);
        const data = res.data;

        if (data?.success && data.data?.isPaid) {
          dep.checked = true;
          await updateUserBalance(dep.userId, dep.amount);
          await prosesBonusTopUp(bot, dep.userId, dep.username, dep.amount);
          logTopup(dep.userId, dep.username, dep.amount, 'Saweria');

          const saldoTerbaru = await getUserSaldo(dep.userId);
          const success = await sendPaymentSuccessNotificationByUserId(
            bot,
            dep.userId,
            {
              amount: dep.amount,
              originalAmount: dep.amount,
              bonus: dep.bonus || 0,
              bonus_percent: dep.bonus_percent || 0,
              qrMessageId: dep.qrMessageId,
            },
            saldoTerbaru,
            dep.username
          );

          if (success && dep.qrMessageId) {
            await bot.telegram.deleteMessage(dep.userId, dep.qrMessageId).catch(() => {});
          }
          delete global.pendingDepositsSaweria[idtrx];
        }
      } catch (e) {
        logger.error(`Cek pembayaran Saweria error untuk ${idtrx}: ${e.message}`);
      }
    }
  } catch (err) {
    logger.error('❌ ERROR FATAL di polling Saweria:', err);
  }
}

async function handleDepositState(ctx, userId, data) {
  const state = global.depositState[userId];
  if (!state) return;

  let currentAmount = state.amount || '';
  const action = state.action;

  if (data === 'delete') {
    currentAmount = currentAmount.slice(0, -1);
  } else if (data === 'confirm') {
    if (!currentAmount || currentAmount.length === 0) {
      return await ctx.answerCbQuery('⚠️ Jumlah tidak boleh kosong!', { show_alert: true });
    }
    if (parseInt(currentAmount, 10) < 100) {
      return await ctx.answerCbQuery('⚠️ Jumlah minimal top-up adalah 100 Ya Kak...!!!', { show_alert: true });
    }

    try { await ctx.deleteMessage(); } catch (e) {}

    if (action === 'request_amount_saweria') {
      await processDepositSaweria(ctx, currentAmount);
    } else {
      global.depositState[userId].action = 'confirm_amount';
      await processDeposit(ctx, currentAmount);
    }

    delete global.depositState[userId];
    return;
  } else {
    const maxDigits = action === 'request_amount_saweria' ? 8 : 12;
    if (currentAmount.length < maxDigits) {
      currentAmount += data;
    } else {
      return await ctx.answerCbQuery(`⚠️ Jumlah maksimal adalah ${maxDigits} digit!`, { show_alert: true });
    }
  }

  global.depositState[userId].amount = currentAmount;
  const newMessage = action === 'request_amount_saweria'
    ? `💰 Masukkan nominal topup Saweria QRIS:\n\nNominal saat ini: *Rp${currentAmount}*`
    : `💳 Topup Saldo Otomatis QRIS\n━━━━━━━━━━━━━━━━━━━━━━\nMasukkan nominal topup:\n\nRp ${currentAmount}\n\nMinimal topup Rp 100\n━━━━━━━━━━━━━━━━━━━━━━\nGunakan tombol di bawah untuk input nominal.`;

  try {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown',
    });
  } catch (error) {
    if (!error.description?.includes('message is not modified')) {
      logger.error('❌ Gagal update pesan nominal top-up:', error);
    }
  }
}

function registerTopup(bot) {
  bot.action('menu_topup', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      try {
        if (ctx.callbackQuery?.message?.message_id) {
          await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        }
      } catch (err) {}

      let adminUsername = 'Admin';
      try {
        const adminChat = await bot.telegram.getChat(primaryAdminId);
        if (adminChat.username) adminUsername = adminChat.username;
      } catch (e) {}

      const storeName = vars?.NAMA_STORE || 'XWANSTORE';
      const config = loadButtonConfig();
      const keyboard = [];
      if (config.topup_saldo) keyboard.push([{ text: '💸 Topup QRIS Orkut', callback_data: 'topup_saldo' }]);
      if (config.topup_saweria) keyboard.push([{ text: '💸 Topup QRIS Saweria', callback_data: 'topup_saweria' }]);
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);

      const messageText = `
📦━━━━━━━━━━━━━━━━━━━━📦
      <b>⚡ Z-STORE VPN ⚡</b>
📦━━━━━━━━━━━━━━━━━━━━📦

💳 <b>ᴍᴇɴᴜ ᴛᴏᴘ-ᴜᴘ ꜱᴀʟᴅᴏ</b>  
ᴘɪʟɪʜ ᴍᴇᴛᴏᴅᴇ ᴛᴏᴘ-ᴜᴘ ʏᴀɴɢ ᴋᴀᴍᴜ ɪɴɢɪɴᴋᴀɴ ᴅɪ ʙᴀᴡᴀʜ ɪɴɪ ⤵️

┏━━━━━━━━━━━━━━━━━━━┓
┃ 💸 <b>Qʀɪꜱ Oʀᴋᴜᴛ</b> — ᴘʀᴏꜱᴇꜱ ᴀᴜᴛᴏᴍᴀᴛɪꜱ  
┃ 💸 <b>Qʀɪꜱ Sᴀᴡᴇʀɪᴀ</b> — ᴠᴇʀɪꜰɪᴋᴀꜱɪ ᴄᴇᴘᴀᴛ  
┗━━━━━━━━━━━━━━━━━━━┛

📘 <b>ᴛᴀᴛᴀ ᴄᴀʀᴀ ᴛᴏᴘ-ᴜᴘ</b>  
1️⃣ ᴋʟɪᴋ ᴛᴏᴍʙᴏʟ ᴍᴇᴛᴏᴅᴇ ᴘᴇᴍʙᴀʏᴀʀᴀɴ ᴅɪ ʙᴀᴡᴀʜ.  
2️⃣ ꜱᴄᴀɴ ᴋᴏᴅᴇ Qʀ ᴀᴛᴀᴜ ꜱᴀʟɪɴ ʟɪɴᴋ ᴘᴇᴍʙᴀʏᴀʀᴀɴ.  
3️⃣ ʟᴀᴋᴜᴋᴀɴ ᴘᴇᴍʙᴀʏᴀʀᴀɴ ꜱᴇꜱᴜᴀɪ ɴᴏᴍɪɴᴀʟ.  
4️⃣ ᴛᴜɴɢɢᴜ ±1 ᴍᴇɴɪᴛ, ꜱᴀʟᴅᴏ ᴀᴋᴀɴ ᴍᴀꜱᴜᴋ ᴀᴜᴛᴏᴍᴀᴛɪꜱ.  
5️⃣ ᴊɪᴋᴀ ʙᴇʟᴜᴍ ᴍᴀꜱᴜᴋ, ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ᴅᴇɴɢᴀɴ ʙᴜᴋᴛɪ ᴛʀᴀɴꜱᴀᴋꜱɪ.  

☎️ <b>ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ:</b>  
╰<a href="https://t.me/${adminUsername}">@${adminUsername}</a>

📦━━━━━━━━━━━━━━━━━━━━📦
     <code>🌐 ᴅɪᴋᴇʟᴏʟᴀ ᴏʟᴇʜ ${storeName} ɴᴇᴛᴡᴏʀᴋ</code>
📦━━━━━━━━━━━━━━━━━━━━📦
`;

      const sent = await ctx.reply(messageText, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
        disable_web_page_preview: true,
      });

      if (sent?.message_id) lastMenus[ctx.from.id] = sent.message_id;
    } catch (err) {
      logger.error('❌ Error di menu_topup:', err);
      await ctx.reply('⚠️ Gagal menampilkan menu TopUp. Silakan coba lagi.');
    }
  });

  bot.action('topup_saldo', async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    try {
      await ctx.answerCbQuery();
      if (lastMenus[userId]) {
        try {
          await bot.telegram.deleteMessage(chatId, lastMenus[userId]);
          delete lastMenus[userId];
        } catch (e) {}
      }

      global.depositState[userId] = { action: 'request_amount_orkut', amount: '' };
      const sent = await ctx.reply(
`💳━━━━━━━━━━━━━━━━━━━━💳
        *Qʀɪꜱ Oʀᴋᴜᴛ ᴛᴏᴘ-ᴜᴘ*
💳━━━━━━━━━━━━━━━━━━━━💳

⚡ *ꜱɪʟᴀʜᴋᴀɴ ᴋᴇᴛɪᴋ ɴᴏᴍɪɴᴀʟ ᴛᴏᴘ-ᴜᴘ*  
ʏᴀɴɢ ɪɴɢɪɴ ᴀɴᴅᴀ ʙᴀʏᴀʀᴋᴀɴ ᴍᴇʟᴀʟᴜɪ ᴍᴇᴛᴏᴅᴇ Qʀɪꜱ Oʀᴋᴜᴛ.  

💰 ᴍɪɴɪᴍᴀʟ ᴛᴏᴘ-ᴜᴘ: *Rp 100*  
🧾 ᴄᴏɴᴛᴏʜ: \`10000\`

━━━━━━━━━━━━━━━━━━━━━━━
⌛ ᴋᴇᴍᴜᴅɪᴀɴ ᴛᴜɴɢɢᴜ ᴘʀᴏꜱᴇꜱ ᴏᴛᴏᴍᴀᴛɪꜱ.  
ᴀᴘᴀʙɪʟᴀ ꜱᴀʟᴅᴏ ʙᴇʟᴜᴍ ᴍᴀꜱᴜᴋ,  
ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ᴅᴇɴɢᴀɴ ʙᴜᴋᴛɪ ᴛʀᴀɴꜱᴀᴋꜱɪ.  
━━━━━━━━━━━━━━━━━━━━━━━`,
        { parse_mode: 'Markdown' }
      );
      if (sent?.message_id) lastMenus[userId] = sent.message_id;
    } catch (error) {
      logger.error('❌ Kesalahan topup_saldo:', error);
      await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda.*', { parse_mode: 'Markdown' });
    }
  });

  bot.action('topup_saweria', async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    try {
      await ctx.answerCbQuery();
      if (lastMenus[userId]) {
        try {
          await bot.telegram.deleteMessage(chatId, lastMenus[userId]);
          delete lastMenus[userId];
        } catch (e) {}
      }

      global.depositState[userId] = { action: 'request_amount_saweria', amount: '' };
      const sent = await ctx.reply(
        '💰 *Silahkan ketik nominal top-up yang ingin Anda bayarkan melalui QRIS Saweria.*\n\nContoh: `1000`',
        { parse_mode: 'Markdown' }
      );
      if (sent?.message_id) lastMenus[userId] = sent.message_id;
    } catch (error) {
      logger.error('❌ Kesalahan topup_saweria:', error);
      await ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses top-up Saweria Anda.', { parse_mode: 'Markdown' });
    }
  });

  bot.action(/^saweria_nominal_(\d+)$/, async (ctx) => {
    const userId = ctx.from.id;
    const amount = parseInt(ctx.match[1], 10);
    delete global.depositState[userId];
    await ctx.answerCbQuery();
    await ctx.reply(`🔄 Memproses QRIS Saweria untuk Rp${amount}...`);
    await processDepositSaweria(ctx, amount);
  });

  bot.action(/^batal_topup_(.+)$/, async (ctx) => {
    const uniqueCode = ctx.match[1];
    const deposit = global.pendingDeposits[uniqueCode];

    if (!deposit) {
      return ctx.answerCbQuery('Transaksi sudah tidak aktif atau telah dibatalkan.', { show_alert: true });
    }

    try {
      if (deposit.qrMessageId) {
        try { await bot.telegram.deleteMessage(deposit.userId, deposit.qrMessageId); } catch (e) {}
      }
      delete global.pendingDeposits[uniqueCode];
      await deletePendingDeposit(uniqueCode);
      await ctx.answerCbQuery('Topup dibatalkan.');

      await ctx.reply('❌ Topup QRIS Orkut telah dibatalkan. Silahkan topup ulang jika ingin mencoba lagi.', {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '🔙 Kembali ke Menu Top-up', callback_data: 'menu_topup' }]],
        },
      });

      const messageId = ctx.update.callback_query.message?.message_id;
      if (messageId) {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, messageId); } catch (e) {}
      }
    } catch (e) {
      logger.error('Gagal batal topup:', e);
      await ctx.answerCbQuery('Gagal batal topup.', { show_alert: true });
    }
  });

  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const teks = ctx.message?.text?.trim();
    if (!teks || teks.startsWith('/')) return next();

    const depAction = global.depositState?.[userId]?.action;
    if (depAction === 'request_amount_saweria' || depAction === 'request_amount_orkut') {
      const nominal = parseInt(teks.replace(/[^\d]/g, ''), 10);
      if (isNaN(nominal) || nominal < 100) {
        return ctx.reply('❌ *Nominal tidak valid. Minimal Rp100.*', { parse_mode: 'Markdown' });
      }

      delete global.depositState[userId];
      try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch (e) {}

      if (lastMenus[userId]) {
        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, lastMenus[userId]);
          delete lastMenus[userId];
        } catch (e) {}
      }

      if (depAction === 'request_amount_saweria') {
        await processDepositSaweria(ctx, nominal);
      } else {
        await processDeposit(ctx, nominal);
      }
      return;
    }

    return next();
  });
}

module.exports = {
  registerTopup,
  loadPendingDepositsFromDb,
  checkQRISStatus,
  checkSaweriaStatus,
  handleDepositState,
};
