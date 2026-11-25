const { exec } = require('child_process');
const { db, logger, primaryAdminId, userState } = require('./config');
const { showLoading } = require('./utils');
const { handleServiceAction } = require('./vpnService');

function registerSewaScript(bot) {
  bot.action('service_sewascript', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch (e) {}
    await handleServiceAction(ctx, 'sewascript');
  });

  bot.action('sewascript_daftar', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    userState[ctx.from.id] = { step: 'sewascript_daftar_pilih_bulan' };

    await ctx.reply('📅 Pilih Durasi Sewa Script:', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '1 Bulan 10K', callback_data: 'daftar_1bln' },
            { text: '2 Bulan 20K', callback_data: 'daftar_2bln' },
            { text: '3 Bulan 30K', callback_data: 'daftar_3bln' },
          ],
          [{ text: '🔙 Kembali', callback_data: 'service_sewascript' }],
        ],
      },
    });
  });

  bot.action('sewascript_perpanjang', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    userState[ctx.from.id] = { step: 'sewascript_perpanjang_pilih_bulan' };

    await ctx.reply('📅 Pilih Durasi Perpanjangan Script:', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '1 Bulan 10K', callback_data: 'perpanjang_1bln' },
            { text: '2 Bulan 20K', callback_data: 'perpanjang_2bln' },
            { text: '3 Bulan 30K', callback_data: 'perpanjang_3bln' },
          ],
          [{ text: '🔙 Kembali', callback_data: 'service_sewascript' }],
        ],
      },
    });
  });

  bot.action(/^daftar_(\d+)bln$/, async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    const bulan = parseInt(ctx.match[1], 10);
    userState[ctx.from.id] = { step: 'sewascript_create_input', bulan };
    await ctx.reply('♂️ *Masukkan username:*', { parse_mode: 'Markdown' });
  });

  bot.action(/^perpanjang_(\d+)bln$/, async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    const bulan = parseInt(ctx.match[1], 10);
    userState[ctx.from.id] = { step: 'sewascript_perpanjang_ip_manual', bulan };
    await ctx.reply('🌀 *Masukkan IP yang ingin diperpanjang:*', { parse_mode: 'Markdown' });
  });

  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const teks = ctx.message?.text?.trim();
    const state = userState[userId];

    if (!teks || teks.startsWith('/') || !state || !state.step) {
      return next();
    }

    if (state.step === 'sewascript_create_input') {
      if (!/^[a-zA-Z0-9]{3,20}$/.test(teks)) {
        return ctx.reply('❌ *Username tidak valid. Harus 3-20 karakter alfanumerik.*', { parse_mode: 'Markdown' });
      }
      userState[userId] = {
        step: 'sewascript_create_input_ip',
        username: teks,
        bulan: state.bulan,
      };
      await ctx.reply('🏷️ *Masukkan IP Address:*', { parse_mode: 'Markdown' });
      return;
    }

    if (state.step === 'sewascript_create_input_ip') {
      const ip = teks;
      const { username, bulan } = state;

      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
        return ctx.reply('❌ *Format IP tidak valid.* Masukkan IP seperti 123.45.67.89', { parse_mode: 'Markdown' });
      }

      const priceharga = 10000 * bulan;

      db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], async (err, user) => {
        if (err || !user) {
          return ctx.reply('❌ Terjadi kesalahan mengambil saldo pengguna.', { parse_mode: 'Markdown' });
        }
        if (user.saldo < priceharga) {
          return ctx.reply('❌ *Saldo Anda tidak cukup.*', { parse_mode: 'Markdown' });
        }

        const cmd = `/usr/local/sbin/literegis ${username} ${bulan} ${ip}`;
        logger.info(`Menjalankan perintah sewa script untuk user ${userId}: ${cmd}`);
        const loadingState = await showLoading(ctx);

        let outputMessage;
        let successScriptAction = false;

        try {
          const { error, stdout, stderr } = await new Promise((resolve) => {
            exec(cmd, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
          });

          if (error) {
            outputMessage = `❌ Gagal daftar script:\n\n${stderr || error.message}`;
          } else if (/gagal|error/i.test(stdout)) {
            outputMessage = `❌ Gagal daftar script:\n\n${stdout}`;
          } else {
            successScriptAction = true;
            outputMessage = `✅ Pendaftaran IP Berhasil:\n${stdout}`;
          }
        } catch (e) {
          outputMessage = '❌ Terjadi kesalahan internal saat memproses pendaftaran script.';
        } finally {
          clearInterval(loadingState.intervalId);
          try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingState.messageId); } catch (e) {}
        }

        await ctx.reply(outputMessage, { parse_mode: 'HTML' }).catch(() => {});

        if (successScriptAction) {
          db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [priceharga, userId], (errUpdateSaldo) => {
            if (errUpdateSaldo) {
              bot.telegram.sendMessage(primaryAdminId, `🚨 *SALDO GAGAL DIKURANGI SETELAH SEWA SCRIPT SUKSES!* User ID: \`${userId}\`, Jumlah: Rp${priceharga.toLocaleString('id-ID')}`, { parse_mode: 'Markdown' }).catch(() => {});
            }
          });
        }
      });

      delete userState[userId];
      return;
    }

    if (state.step === 'sewascript_perpanjang_ip_manual') {
      const ip = teks;
      const bulan = state.bulan;

      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
        return ctx.reply('❌ *Format IP tidak valid.* Masukkan IP seperti 123.45.67.89', { parse_mode: 'Markdown' });
      }

      const priceharga = 10000 * bulan;

      db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], async (err, user) => {
        if (err || !user) {
          return ctx.reply('❌ Terjadi kesalahan mengambil saldo pengguna.', { parse_mode: 'Markdown' });
        }
        if (user.saldo < priceharga) {
          return ctx.reply('❌ *Saldo Anda tidak cukup untuk memperpanjang.*', { parse_mode: 'Markdown' });
        }

        const jumlahHari = bulan * 30;
        const cmd = `/usr/local/sbin/liteextend ${ip} ${jumlahHari}`;
        logger.info(`Menjalankan perintah perpanjang script untuk user ${userId}: ${cmd}`);
        const loadingState = await showLoading(ctx);

        let outputMessage;
        let successScriptAction = false;

        try {
          const { error, stdout, stderr } = await new Promise((resolve) => {
            exec(cmd, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
          });

          if (error) {
            outputMessage = `❌ Gagal memperpanjang script:\n\n${stderr || error.message}`;
          } else if (/gagal|error/i.test(stdout)) {
            outputMessage = `❌ Gagal memperpanjang script:\n\n${stdout}`;
          } else {
            successScriptAction = true;
            outputMessage = `✅ Perpanjangan IP Berhasil:\n${stdout}`;
          }
        } catch (e) {
          outputMessage = '❌ Terjadi kesalahan internal saat memproses perpanjangan script.';
        } finally {
          clearInterval(loadingState.intervalId);
          try { await ctx.telegram.deleteMessage(ctx.chat.id, loadingState.messageId); } catch (e) {}
        }

        await ctx.reply(outputMessage, { parse_mode: 'HTML' }).catch(() => {});

        if (successScriptAction) {
          db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [priceharga, userId], (errUpdateSaldo) => {
            if (errUpdateSaldo) {
              bot.telegram.sendMessage(primaryAdminId, `🚨 *SALDO GAGAL DIKURANGI SETELAH PERPANJANG SCRIPT SUKSES!* User ID: \`${userId}\`, Jumlah: Rp${priceharga.toLocaleString('id-ID')}`, { parse_mode: 'Markdown' }).catch(() => {});
            }
          });
        }
      });

      delete userState[userId];
      return;
    }

    return next();
  });
}

module.exports = {
  registerSewaScript,
};
