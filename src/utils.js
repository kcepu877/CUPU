const axios = require('axios');
const { db, logger, groupId, BOT_TOKEN } = require('./config');

function formatRupiah(angka) {
  return `Rp${(angka || 0).toLocaleString('id-ID')}`;
}

function kaburMark(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function censorAccountUsername(username) {
  if (!username || typeof username !== 'string') return 'N/A';
  if (username.length <= 3) return username + 'xxx';
  return username.substring(0, 3) + 'xxx';
}

function generateRandomAmount(baseAmount) {
  const random = Math.floor(Math.random() * 99) + 1;
  return baseAmount + random;
}

async function showLoading(ctx) {
  const waitMsg = await ctx.reply('⏳ Mohon menunggu.');
  const dots = ['.', '..', '...', ' '];
  let i = 0;

  const intervalId = setInterval(async () => {
    i = (i + 1) % dots.length;
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        waitMsg.message_id,
        null,
        `⏳ Mohon menunggu${dots[i]}`
      );
    } catch (e) {
      clearInterval(intervalId);
    }
  }, 1000);

  return { messageId: waitMsg.message_id, intervalId };
}

async function getUsernameById(bot, userId) {
  try {
    const telegramUser = await bot.telegram.getChat(userId);
    if (telegramUser.username) return `${telegramUser.username}`;
    if (telegramUser.first_name) return telegramUser.first_name;
    return 'N/A';
  } catch (err) {
    logger.error(`❌ Kesalahan saat mengambil username dari Telegram untuk ID ${userId}:`, err.message);
    return 'N/A';
  }
}

function getBotGroupData() {
  try {
    if (!groupId || !BOT_TOKEN) {
      logger.warn('❌ Konfigurasi grup tidak lengkap di .vars.json (GROUP_CHAT_ID atau BOT_TOKEN kosong).');
      return null;
    }
    return { keyGroup: BOT_TOKEN, chatId: groupId };
  } catch (err) {
    logger.error('❌ Terjadi kesalahan saat mendapatkan data grup:', err.message);
    return null;
  }
}

async function getIspNameFromExternalSource(domainOrIp) {
  if (!domainOrIp || domainOrIp === '-') return 'N/A';
  try {
    const response = await axios.get(`http://ip-api.com/json/${domainOrIp}?fields=isp`);
    if (response.data && response.data.isp) return response.data.isp;
    return 'Unknown ISP';
  } catch (error) {
    logger.error(`❌ Gagal mengambil ISP untuk ${domainOrIp}:`, error.message);
    return 'Failed to get ISP';
  }
}

function keyboard_abc() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    buttons.push(alphabet.slice(i, i + 3).split('').map(char => ({ text: char, callback_data: char })));
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

function keyboard_nomor() {
  const digits = '1234567890';
  const buttons = [];
  for (let i = 0; i < digits.length; i += 3) {
    buttons.push(digits.slice(i, i + 3).split('').map(char => ({ text: char, callback_data: char })));
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

function keyboard_full() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buttons = [];
  for (let i = 0; i < chars.length; i += 3) {
    buttons.push(chars.slice(i, i + 3).split('').map(char => ({ text: char, callback_data: char })));
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

function updateUserBalance(userId, amount) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, userId], function (err) {
      if (err) {
        logger.error('Kesalahan saat mengupdate saldo pengguna:', err.message);
        return reject(err);
      }
      resolve(this.changes);
    });
  });
}

function getUserBalance(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function getUserSaldo(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.saldo : 0);
    });
  });
}

function getLastTransactionNumber() {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM log_penjualan ORDER BY id DESC LIMIT 1', (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.id + 1 : 1000);
    });
  });
}

function applySafetyWrappers(bot) {
  function wrapHandler(fnName, fn) {
    if (!fn) return fn;
    return async function wrapped(...args) {
      try {
        return await fn.apply(this, args);
      } catch (err) {
        try {
          logger.error(`❌ Unhandled error in handler (${fnName}): ${err && (err.stack || err.message)}`);
        } catch (e) {
          console.error(err);
        }
        const maybeCtx = args[0];
        try {
          if (maybeCtx && typeof maybeCtx.reply === 'function') {
            await maybeCtx.reply('⚠️ Terjadi kesalahan internal, silakan coba lagi nanti.');
          } else if (maybeCtx && maybeCtx.answerCbQuery) {
            await maybeCtx.answerCbQuery('⚠️ Terjadi kesalahan internal.');
          }
        } catch (e2) {}
        return null;
      }
    };
  }

  try {
    const _origCommand = bot.command.bind(bot);
    bot.command = function (cmd, ...fns) {
      return _origCommand(cmd, ...fns.map(fn => (typeof fn === 'function' ? wrapHandler(`command:${cmd}`, fn) : fn)));
    };

    const _origAction = bot.action.bind(bot);
    bot.action = function (pattern, ...fns) {
      return _origAction(pattern, ...fns.map(fn => (typeof fn === 'function' ? wrapHandler(`action:${pattern}`, fn) : fn)));
    };

    if (bot.hears) {
      const _origHears = bot.hears.bind(bot);
      bot.hears = function (pattern, ...fns) {
        return _origHears(pattern, ...fns.map(fn => (typeof fn === 'function' ? wrapHandler(`hears:${pattern}`, fn) : fn)));
      };
    }

    if (bot.on) {
      const _origOn = bot.on.bind(bot);
      bot.on = function (event, ...fns) {
        return _origOn(event, ...fns.map(fn => (typeof fn === 'function' ? wrapHandler(`on:${event}`, fn) : fn)));
      };
    }
  } catch (e) {
    logger.error('❌ Gagal pasang wrapper Telegraf: ' + (e && e.stack || e));
  }

  const _setInterval = global.setInterval;
  global.setInterval = function (fn, ms, ...args) {
    return _setInterval(() => {
      try {
        fn(...args);
      } catch (err) {
        logger.error('❌ Error di setInterval callback: ' + (err && (err.stack || err.message)));
      }
    }, ms);
  };

  const _setTimeout = global.setTimeout;
  global.setTimeout = function (fn, ms, ...args) {
    return _setTimeout(() => {
      try {
        fn(...args);
      } catch (err) {
        logger.error('❌ Error di setTimeout callback: ' + (err && (err.stack || err.message)));
      }
    }, ms);
  };

  try {
    const _axiosGet = axios.get.bind(axios);
    axios.get = async function (...args) {
      try {
        return await _axiosGet(...args);
      } catch (err) {
        logger.error('❌ Axios.get error: ' + (err && (err.stack || err.message)));
        throw err;
      }
    };
    const _axiosPost = axios.post.bind(axios);
    axios.post = async function (...args) {
      try {
        return await _axiosPost(...args);
      } catch (err) {
        logger.error('❌ Axios.post error: ' + (err && (err.stack || err.message)));
        throw err;
      }
    };
  } catch (e) {
    logger.error('❌ Gagal pasang wrapper axios: ' + (e && e.stack || e));
  }

  process.on('uncaughtException', (err) => {
    logger.error('🚨 uncaughtException: ' + (err && (err.stack || err.message)));
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('🚨 unhandledRejection: ' + (reason && (reason.stack || reason)));
  });
}

module.exports = {
  formatRupiah,
  kaburMark,
  censorAccountUsername,
  generateRandomAmount,
  showLoading,
  getUsernameById,
  getBotGroupData,
  getIspNameFromExternalSource,
  keyboard_abc,
  keyboard_nomor,
  keyboard_full,
  updateUserBalance,
  getUserBalance,
  getUserSaldo,
  getLastTransactionNumber,
  applySafetyWrappers,
};
