const fs = require('fs');
const {
  db,
  logger,
  adminIds,
  ADMIN_WA,
  loadButtonConfig,
  saveButtonConfig,
  lastMenus,
  userState,
} = require('./config');
const { formatRupiah } = require('./utils');

async function sendAdminMenu(ctx) {
  const config = loadButtonConfig();
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  const showTrial = await new Promise((resolve) => {
    db.get('SELECT show_trial_button FROM ui_config WHERE id = 1', (err, row) => {
      if (err || !row) return resolve(1);
      resolve(row.show_trial_button === 1 ? 1 : 0);
    });
  });

  const showSewaScript = await new Promise((resolve) => {
    db.get('SELECT show_sewa_script_button FROM ui_config WHERE id = 1', (err, row) => {
      if (err || !row) return resolve(1);
      resolve(row.show_sewa_script_button === 1 ? 1 : 0);
    });
  });

  const adminKeyboard = [
    [{ text: '✏️ Tambah Server', callback_data: 'addserver' }, { text: '❌ Hapus Server', callback_data: 'deleteserver' }],
    [{ text: '💲 Edit Harga', callback_data: 'editserver_harga' }, { text: '📝 Edit Nama', callback_data: 'nama_server_edit' }],
    [{ text: '🌐 Edit Domain', callback_data: 'editserver_domain' }, { text: '🔑 Edit Auth', callback_data: 'editserver_auth' }],
    [{ text: '📊 Edit Quota', callback_data: 'editserver_quota' }, { text: '📶 Edit Limit IP', callback_data: 'editserver_limit_ip' }],
    [{ text: '🔢 Edit Batas Create', callback_data: 'editserver_batas_create_akun' }, { text: '🔢 Edit Total Create', callback_data: 'editserver_total_create_akun' }],
    [{ text: '💵 Tambah Saldo', callback_data: 'addsaldo_user' }, { text: '📋 List Server', callback_data: 'listserver' }],
    [{ text: '♻️ Reset Server', callback_data: 'resetdb' }, { text: 'ℹ️ Detail Server', callback_data: 'detailserver' }],
    [{ text: '🎁 Set Bonus TopUp', callback_data: 'bonus_topup_setting' }, { text: '📜 Log Bonus TopUp', callback_data: 'log_bonus_topup' }],
    [{ text: `${config.topup_saldo ? '✅' : '❌'} Topup QRIS Orkut`, callback_data: 'toggle_topup_saldo' }, { text: `${config.topup_saweria ? '✅' : '❌'} Topup QRIS Saweria`, callback_data: 'toggle_topup_saweria' }],
    [{ text: `${showTrial ? '✅' : '❌'} Tombol Trial`, callback_data: `toggle_trial_btn_${showTrial ? 'off' : 'on'}` }, { text: `${showSewaScript ? '✅' : '❌'} Tombol Sewa Script`, callback_data: `toggle_sewascript_btn_${showSewaScript ? 'off' : 'on'}` }],
    [{ text: '📈 Hasil Penjualan', callback_data: 'statistik_penjualan' }, { text: '📑 Log Topup', callback_data: 'log_topup' }],
    [{ text: '👥 List Reseller', callback_data: 'listreseller' }],
    [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }],
  ];

  const messageText = `
╔════════════════════════╗
║           🏷️ *≡ MENU ADMIN VPN ≡* 🏷️                        ║
╚════════════════════════╝
💸 *» PILIH MENU ADMIN DIBAWAH INI:*  
━━━━━━━━━━━━━━━━━━━━━━━━━━
✏️ TAMBAH SERVER        ❌ HAPUS SERVER
💲 EDIT HARGA               📝 EDIT NAMA
🌐 EDIT DOMAIN             🔑 EDIT AUTH
📊 EDIT QUOTA               📶 EDIT LIMIT IP
🔢 BATAS CREATE           🔢 TOTAL CREATE
💵 TAMBAH SALDO         📋 LIST SERVER
♻️ RESET SERVER           ℹ️ DETAIL SERVER
🎁 BONUS TOPUP           📜 LOG BONUS TOPUP
${config.topup_saldo ? '✅' : '❌'} TOPUP ORKUT           ${config.topup_saweria ? '✅' : '❌'} TOPUP SAWERIA
${showTrial ? '✅' : '❌'} TOMBOL TRIAL          ${showSewaScript ? '✅' : '❌'} TOMBOL SEWA SCRIPT
📈 HASIL PENJUALAN     📑 LOG TOPUP
👥 LIST RESELLER        
━━━━━━━━━━━━━━━━━━━━━━━━━━
🔙 KEMBALI
━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  if (lastMenus[userId]) {
    try { await ctx.telegram.deleteMessage(chatId, lastMenus[userId]); } catch (e) {}
    delete lastMenus[userId];
  }

  if (ctx.updateType === 'callback_query') {
    try {
      const sent = await ctx.editMessageText(messageText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: adminKeyboard },
      });
      if (sent?.message_id) lastMenus[userId] = sent.message_id;
      return sent;
    } catch (error) {}
  }

  const sent = await ctx.reply(messageText, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: adminKeyboard },
  });
  if (sent?.message_id) lastMenus[userId] = sent.message_id;
  return sent;
}

function registerAdminMenu(bot) {
  bot.command('admin', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) {
      try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch (e) {}
      return ctx.reply('❌ Anda tidak memiliki izin untuk mengakses menu admin.');
    }

    try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch (e) {}
    if (lastMenus[ctx.from.id]) {
      try { await ctx.telegram.deleteMessage(ctx.chat.id, lastMenus[ctx.from.id]); } catch (e) {}
      delete lastMenus[ctx.from.id];
    }

    const sent = await sendAdminMenu(ctx);
    if (sent?.message_id) lastMenus[ctx.from.id] = sent.message_id;
  });

  bot.command('hapuslog', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return ctx.reply('Tidak ada izin!');
    try {
      if (fs.existsSync('bot-combined.log')) fs.unlinkSync('bot-combined.log');
      if (fs.existsSync('bot-error.log')) fs.unlinkSync('bot-error.log');
      ctx.reply('Log berhasil dihapus.');
    } catch (e) {
      ctx.reply('Gagal menghapus log: ' + e.message);
    }
  });

  bot.command('helpadmin', async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
    }
    const helpMessage = `
*📋 Daftar Perintah:*

1. /start - Mengaktifkan bot.
2. /menu - Menampilkan daftar menu bot.
3. /admin - Menampilkan fitur-fitur admin.
4. /broadcast - Kirim pesan siaran ke semua pengguna.
5. /addserver - Menambahkan server baru.
6. /addsaldo - Menambahkan saldo ke akun pengguna.
7. /kurangisaldo - Mengurangi saldo user.
8. /resetsaldo - Mengatur ulang saldo user.
9. /listsaldo - Menampilkan daftar saldo user.
10. /ceksaldo - Melihat saldo user.
11. /editharga - Mengedit harga layanan.
12. /editnama - Mengedit nama server.
13. /editdomain - Mengedit domain server.
14. /editauth - Mengedit auth server.
15. /editlimitquota - Mengedit batas quota server.
16. /editlimitip - Mengedit batas IP server.
17. /editlimitcreate - Mengedit batas pembuatan akun server.
18. /edittotalcreate - Mengedit total pembuatan akun server.
19. /hapuslog - Menghapus log bot.
20. /unlimitedtrial - Memberikan akses trial unlimited ke user.
21. /removeunlimitedtrial - Mencabut akses trial unlimited dari user.
22. /listunlimitedtrial - Melihat daftar user yang memiliki trial unlimited.
23. /setreseller - Mengubah role user menjadi reseller.
24. /unsetreseller - Mengubah role reseller menjadi member biasa.
25. /listreseller - Melihat daftar semua reseller.
26. /setdiskonreseller - Mengatur persentase diskon untuk reseller.
27. /resetdiskonreseller - Mereset persentase diskon reseller ke 0%.
28. /helpadmin - Menampilkan daftar perintah admin.

📝 *Catatan:* Gunakan perintah ini dengan format yang benar untuk menghindari kesalahan.
`;
    ctx.reply(helpMessage, { parse_mode: 'Markdown' });
  });

  bot.command('broadcast', async (ctx) => {
    if (!adminIds.includes(ctx.message.from.id)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
    }

    const reply = ctx.message.reply_to_message;
    const inputText = ctx.message.text.split(' ').slice(1).join(' ');

    if (!reply && !inputText) {
      return ctx.reply(
        '📌 *Cara menggunakan perintah broadcast:*\n\n' +
        '1. Balas pesan (teks/gambar/video/dokumen) lalu ketik /broadcast untuk menyiarkan media tersebut\n' +
        '2. Atau langsung kirim `/broadcast Pesanmu` untuk broadcast teks biasa\n\n' +
        'Contoh:\n`/broadcast Hallo semua!`',
        { parse_mode: 'Markdown' }
      );
    }

    db.all('SELECT user_id FROM users', [], async (err, rows) => {
      if (err) return ctx.reply('⚠️ Gagal mengambil daftar pengguna.');

      let success = 0;
      let failed = 0;

      for (const row of rows) {
        try {
          let sent;
          if (reply && reply.message_id) {
            sent = await bot.telegram.copyMessage(row.user_id, ctx.chat.id, reply.message_id);
          } else if (inputText) {
            sent = await bot.telegram.sendMessage(row.user_id, inputText, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[{ text: '🌐 WhatsApp Admin', url: `https://wa.me/${ADMIN_WA}` }]],
              },
            });
          }

          const messageIdToPin = sent?.message_id || sent;
          if (messageIdToPin) {
            try { await bot.telegram.pinChatMessage(row.user_id, messageIdToPin, { disable_notification: false }); } catch (e) {}
          }
          success++;
        } catch (error) {
          failed++;
          if (error.response?.error_code === 429) {
            const retryAfter = error.response.parameters?.retry_after || 5;
            await new Promise((resolve) => setTimeout(resolve, (retryAfter + 1) * 1000));
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      ctx.reply(`📣 Broadcast selesai!\n✅ Berhasil: ${success}\n❌ Gagal: ${failed}`);
    });
  });

  bot.action('statistik_penjualan', async (ctx) => {
    await ctx.answerCbQuery();
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const startOfWeek = new Date(new Date().setDate(today.getDate() - today.getDay())).toISOString();
    const startOf7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

    db.all('SELECT tipe_akun, COUNT(*) AS jumlah, SUM(harga) AS total_harga FROM log_penjualan GROUP BY tipe_akun', [], (err, rows) => {
      if (err || rows.length === 0) return ctx.reply('⚠️ Belum ada data penjualan.');

      let totalAkun = 0;
      let totalUang = 0;
      const hasil = rows.map((r) => {
        totalAkun += r.jumlah;
        totalUang += r.total_harga;
        return `📦 *${r.tipe_akun.toUpperCase()}*\nJumlah Terjual: ${r.jumlah}\nTotal: ${formatRupiah(r.total_harga)}`;
      }).join('\n\n');

      db.get('SELECT SUM(harga) AS total FROM log_penjualan WHERE waktu_transaksi >= ?', [startOfToday], (e1, todayRow) => {
        db.get('SELECT SUM(harga) AS total FROM log_penjualan WHERE waktu_transaksi >= ?', [startOf7Days], (e2, week7Row) => {
          db.get('SELECT SUM(harga) AS total FROM log_penjualan WHERE waktu_transaksi >= ?', [startOfWeek], (e3, weekRow) => {
            db.get('SELECT SUM(harga) AS total FROM log_penjualan WHERE waktu_transaksi >= ?', [startOfMonth], (e4, monthRow) => {
              const message =
                `📊 *Statistik Penjualan per Tipe Akun:*\n\n${hasil}\n\n` +
                `🧾 *Total Semua Akun Terjual:* ${totalAkun}\n` +
                `💰 *Total Uang Masuk:* ${formatRupiah(totalUang)}\n\n` +
                `📅 *Hari Ini:* ${formatRupiah(todayRow?.total || 0)}\n` +
                `📈 *7 Hari Terakhir:* ${formatRupiah(week7Row?.total || 0)}\n` +
                `🗓️ *Minggu Ini:* ${formatRupiah(weekRow?.total || 0)}\n` +
                `📆 *Bulan Ini:* ${formatRupiah(monthRow?.total || 0)}`;
              ctx.reply(message, { parse_mode: 'Markdown' });
            });
          });
        });
      });
    });
  });

  bot.action('toggle_topup_saldo', async (ctx) => {
    await ctx.answerCbQuery();
    const config = loadButtonConfig();
    config.topup_saldo = !config.topup_saldo;
    saveButtonConfig(config);
    await sendAdminMenu(ctx);
  });

  bot.action('toggle_topup_saweria', async (ctx) => {
    await ctx.answerCbQuery();
    const config = loadButtonConfig();
    config.topup_saweria = !config.topup_saweria;
    saveButtonConfig(config);
    await sendAdminMenu(ctx);
  });

  bot.action(/^toggle_trial_btn_(on|off)$/, async (ctx) => {
    if (!adminIds.includes(ctx.from.id)) return;
    const newStatus = ctx.match[1] === 'on' ? 1 : 0;

    db.run('UPDATE ui_config SET show_trial_button = ? WHERE id = 1', [newStatus], async (err) => {
      if (err) return ctx.answerCbQuery('❌ Gagal mengubah status.');
      await ctx.answerCbQuery('✅ Status tombol trial diperbarui.');
      try { await ctx.telegram.deleteMessage(ctx.chat.id, ctx.callbackQuery.message.message_id); } catch (e) {}
      await sendAdminMenu(ctx);
    });
  });

  bot.action(/toggle_sewascript_btn_(on|off)/, async (ctx) => {
    const newValue = ctx.match[1] === 'on' ? 1 : 0;
    db.run('UPDATE ui_config SET show_sewa_script_button = ? WHERE id = 1', [newValue], (err) => {
      if (err) return ctx.answerCbQuery('Gagal mengubah status tombol.');
      ctx.answerCbQuery(`Tombol Sewa Script ${newValue === 1 ? 'diaktifkan ✅' : 'dinonaktifkan ❌'}`);
      return sendAdminMenu(ctx);
    });
  });

  bot.action('bonus_topup_setting', async (ctx) => {
    await ctx.answerCbQuery();
    db.get('SELECT * FROM bonus_config WHERE id = 1', (err, row) => {
      if (err || !row) return ctx.reply('❌ Gagal mengambil pengaturan bonus.');
      ctx.reply(
        `⚙️ *Pengaturan Bonus Top Up*\n\nStatus: *${row.enabled ? 'Aktif ✅' : 'Nonaktif ❌'}*\nMinimal TopUp: *Rp${row.min_topup}*\nBonus: *${row.bonus_percent}%*\n\nKlik tombol di bawah ini untuk mengatur:`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[{ text: '🔧 Atur Bonus TopUp', callback_data: 'atur_bonus_topup' }]] },
        }
      );
    });
  });

  bot.action('atur_bonus_topup', async (ctx) => {
    await ctx.answerCbQuery();
    userState[ctx.from.id] = { step: 'atur_bonus_input' };
    await ctx.reply('✍️ Kirim format:\n`on|off <minimal_topup> <persen_bonus>`\n\nContoh:\n`on 10000 25`', { parse_mode: 'Markdown' });
  });

  bot.action('log_bonus_topup', async (ctx) => {
    await ctx.answerCbQuery();
    db.all('SELECT * FROM bonus_log ORDER BY id DESC LIMIT 10', [], (err, rows) => {
      if (err || rows.length === 0) return ctx.reply('⚠️ Belum ada data bonus');
      let isi = rows.map((row, i) => {
        const username = row.username ? `\`${row.username}\`` : `\`${row.user_id}\``;
        const ts = new Date(row.timestamp).toLocaleString('id-ID', { hour12: false });
        return `━━━━━━━━━━━━━━\n🔹 *${i + 1}*\n👤 User: ${username}\n🆔 ID: \`${row.user_id}\`\n💰 TopUp: *Rp${row.amount}*\n🎁 Bonus: *Rp${row.bonus}*\n⏰ ${ts}`;
      }).join('\n\n') + '\n━━━━━━━━━━━━━━';

      ctx.reply(`✨ *Riwayat Bonus Top Up*\n_10 Data Terbaru_\n\n${isi}`, { parse_mode: 'Markdown' });
    });
  });

  bot.action('log_topup', async (ctx) => {
    await ctx.answerCbQuery();
    db.all('SELECT * FROM topup_log ORDER BY id DESC LIMIT 10', [], (err, rows) => {
      if (err || rows.length === 0) return ctx.reply('⚠️ Belum ada data topup');
      let isi = rows.map((row, i) => {
        const username = row.username ? `\`${row.username}\`` : `\`${row.user_id}\``;
        const ts = new Date(row.waktu).toLocaleString('id-ID', { hour12: false });
        return `━━━━━━━━━━━━━━\n🔹 *${i + 1}*\n👤 User: ${username}\n🆔 ID: \`${row.user_id}\`\n💰 TopUp: *Rp${row.amount}*\n⏰ ${ts}`;
      }).join('\n\n') + '\n━━━━━━━━━━━━━━';

      ctx.reply(`💳 *Riwayat Top Up*\n_10 Data Terbaru_\n\n${isi}`, { parse_mode: 'Markdown' });
    });
  });

  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const teks = ctx.message?.text?.trim();
    const state = userState[userId];

    if (!teks || teks.startsWith('/') || !state || state.step !== 'atur_bonus_input') {
      return next();
    }

    const [status, minStr, persenStr] = teks.split(/\s+/);
    const min = parseInt(minStr, 10);
    const persen = parseInt(persenStr, 10);

    if (!status || isNaN(min) || isNaN(persen)) {
      return ctx.reply('⚠️ Format salah. Gunakan: `on|off <minimal_topup> <persen_bonus>`\nContoh: `on 10000 25`', { parse_mode: 'Markdown' });
    }

    const enabled = status.toLowerCase() === 'on' ? 1 : 0;
    db.run('UPDATE bonus_config SET enabled = ?, min_topup = ?, bonus_percent = ? WHERE id = 1', [enabled, min, persen], (err) => {
      if (err) return ctx.reply('❌ Gagal menyimpan pengaturan bonus.');
      ctx.reply(`✅ Bonus Top Up *${enabled ? 'Aktif' : 'Nonaktif'}*\n📌 Minimal Top Up: Rp${min}\n🎁 Bonus: ${persen}%`, { parse_mode: 'Markdown' });
      delete userState[userId];
    });
  });
}

module.exports = {
  registerAdminMenu,
  sendAdminMenu,
};
