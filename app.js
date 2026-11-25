const express = require('express');
const { Telegraf } = require('telegraf');
const { BOT_TOKEN, port, logger, userState } = require('./src/config');
const { applySafetyWrappers } = require('./src/utils');
const { registerMenu } = require('./src/menu');
const { registerVpnService } = require('./src/vpnService');
const { registerSewaScript } = require('./src/sewaScript');
const {
  registerTopup,
  loadPendingDepositsFromDb,
  checkQRISStatus,
  checkSaweriaStatus,
  handleDepositState,
} = require('./src/topup');
const { registerAdminMenu } = require('./src/adminMenu');
const {
  registerAdminServer,
  handleEditHarga,
  handleEditBatasCreateAkun,
  handleEditTotalCreateAkun,
  handleEditiplimit,
  handleEditQuota,
  handleEditAuth,
  handleEditDomain,
  handleEditNama,
} = require('./src/adminServer');
const {
  registerAdminUser,
  sendPaginatedUserSaldo,
  sendPaginatedResellerList,
  showUnlimitedTrialPage,
  handleAddSaldo,
  downgradeInactiveResellers,
} = require('./src/adminUser');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const bot = new Telegraf(BOT_TOKEN);

// Pasang proteksi anti-crash sebelum mendaftarkan seluruh handler
applySafetyWrappers(bot);
loadPendingDepositsFromDb();

// Daftarkan seluruh modul fitur
registerMenu(bot);
registerVpnService(bot);
registerSewaScript(bot);
registerTopup(bot);
registerAdminMenu(bot);
registerAdminServer(bot);
registerAdminUser(bot);

// Router fallback untuk tombol keypad angka/huruf & paginasi
bot.on('callback_query', async (ctx) => {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  const userStateData = userState[userId] || userState[ctx.chat.id];

  await ctx.answerCbQuery();

  if (data.startsWith('listsaldo_')) {
    const page = parseInt(data.split('_')[1], 10);
    return sendPaginatedUserSaldo(bot, ctx, page, true);
  }

  if (data.startsWith('listreseller_')) {
    const parts = data.split('_');
    let page = parseInt(parts[2], 10);
    page = parts[1] === 'next' ? page + 1 : Math.max(1, page - 1);
    return sendPaginatedResellerList(bot, ctx, page, ctx.callbackQuery.message.message_id);
  }

  if (data.startsWith('listunlimitedtrial_')) {
    const parts = data.split('_');
    let page = parseInt(parts[2], 10);
    page = parts[1] === 'next' ? page + 1 : Math.max(1, page - 1);
    return showUnlimitedTrialPage(bot, ctx, page, ctx.callbackQuery.message.message_id);
  }

  if (userStateData) {
    const isNumericInput = !isNaN(parseInt(data, 10)) || data === 'delete' || data === 'confirm';
    const isAlphaNumericInput = /^[a-zA-Z0-9.-]+$/.test(data) || data === 'delete' || data === 'confirm';

    if (global.depositState?.[userId]?.action === 'request_amount' && isNumericInput) {
      return handleDepositState(ctx, userId, data);
    }

    switch (userStateData.step) {
      case 'add_saldo':
        if (isNumericInput) await handleAddSaldo(ctx, userStateData, data);
        break;
      case 'edit_batas_create_akun':
        if (isNumericInput) await handleEditBatasCreateAkun(ctx, userStateData, data);
        break;
      case 'edit_limit_ip':
        if (isNumericInput) await handleEditiplimit(ctx, userStateData, data);
        break;
      case 'edit_quota':
        if (isNumericInput) await handleEditQuota(ctx, userStateData, data);
        break;
      case 'edit_auth':
        if (isAlphaNumericInput) await handleEditAuth(ctx, userStateData, data);
        break;
      case 'edit_domain':
        if (isAlphaNumericInput) await handleEditDomain(ctx, userStateData, data);
        break;
      case 'edit_harga':
        if (isNumericInput) await handleEditHarga(ctx, userStateData, data);
        break;
      case 'edit_nama':
        if (isAlphaNumericInput) await handleEditNama(ctx, userStateData, data);
        break;
      case 'edit_total_create_akun':
        if (isNumericInput) await handleEditTotalCreateAkun(ctx, userStateData, data);
        break;
      default:
        logger.warn(`Unhandled callback_query: ${data} for step: ${userStateData.step}`);
        break;
    }
  }
});

// Interval pengecekan pembayaran & reseller
setInterval(() => checkQRISStatus(bot), 5000);
setInterval(() => checkSaweriaStatus(bot), 10000);

app.listen(port)
  .on('listening', () => {
    logger.info(`Express server listening on port ${port}`);
    bot.launch()
      .then(() => {
        logger.info('Bot launched');
        setInterval(() => {
          logger.info('🔁 Menjalankan pengecekan downgrade reseller...');
          downgradeInactiveResellers(bot);
        }, 6 * 60 * 60 * 1000);
      })
      .catch((err) => logger.error('Bot failed to launch:', err));
  })
  .on('error', (err) => {
    logger.error('Express failed to start:', err.message);
    bot.launch().catch((e) => logger.error('Bot fallback launch error:', e.message));
  });
