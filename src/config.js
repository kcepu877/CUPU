const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const winston = require('winston');

const FOLDER_TEMPATDB = '/root/CUPU/sellvpn.db';
const BUTTON_CONFIG_FILE = './button_config.json';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: 'bot-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'bot-combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

const vars = JSON.parse(fs.readFileSync('./.vars.json', 'utf8'));

const SAWERIA_USERNAME = vars.SAWERIA_USERNAME;
const SAWERIA_EMAIL = vars.SAWERIA_EMAIL;
const BOT_TOKEN = vars.BOT_TOKEN;
const port = vars.PORT || 5889;
const ADMIN = vars.USER_ID;
const adminIds = Array.isArray(ADMIN) ? ADMIN : [ADMIN];
const primaryAdminId = Array.isArray(ADMIN) ? ADMIN[0] : ADMIN;
const NAMA_STORE = vars.NAMA_STORE || 'Z-STORE';
const DATA_QRIS = vars.DATA_QRIS;
const MERCHANT_ID = vars.MERCHANT_ID;
const API_KEY = vars.API_KEY;
const groupId = vars.GROUP_CHAT_ID;
const ADMIN_WA = vars.ADMIN_WA;
const AUTHX = vars.AUTHX;
const GROUP_USERNAME = vars.GROUP_USERNAME;

const db = new sqlite3.Database('./sellvpn.db', (err) => {
  if (err) {
    logger.error('Kesalahan koneksi SQLite3:', err.message);
    return;
  }
  logger.info('✅ Terhubung ke SQLite3');

  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS bonus_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        enabled INTEGER DEFAULT 0,
        min_topup INTEGER DEFAULT 0,
        bonus_percent INTEGER DEFAULT 0
      )
    `);
    db.run(`INSERT OR IGNORE INTO bonus_config (id, enabled, min_topup, bonus_percent) VALUES (1, 0, 0, 0)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS bonus_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        amount INTEGER,
        bonus INTEGER,
        timestamp TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS pending_deposits (
        unique_code TEXT PRIMARY KEY,
        user_id INTEGER,
        username TEXT,
        amount INTEGER,
        original_amount INTEGER,
        timestamp INTEGER,
        status TEXT,
        qr_message_id INTEGER
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS log_penjualan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        nama_server TEXT,
        tipe_akun TEXT,
        harga INTEGER,
        masa_aktif_hari INTEGER,
        waktu_transaksi TEXT,
        action_type TEXT,
        user_role TEXT DEFAULT 'member'
      )
    `, (errTable) => {
      if (!errTable) {
        db.all('PRAGMA table_info(log_penjualan)', (errInfo, columns) => {
          if (!errInfo && Array.isArray(columns) && !columns.some(col => col.name === 'user_role')) {
            db.run("ALTER TABLE log_penjualan ADD COLUMN user_role TEXT DEFAULT 'member'");
          }
        });
      }
    });

    db.run(`CREATE TABLE IF NOT EXISTS unlimited_trial_users (user_id INTEGER PRIMARY KEY)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS ui_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        show_trial_button INTEGER DEFAULT 1,
        show_sewa_script_button INTEGER DEFAULT 1
      )
    `, (errUi) => {
      if (!errUi) {
        db.run(`INSERT OR IGNORE INTO ui_config (id, show_trial_button, show_sewa_script_button) VALUES (1, 1, 1)`);
        db.all('PRAGMA table_info(ui_config)', (errCol, columns) => {
          if (!errCol && Array.isArray(columns) && !columns.some(col => col.name === 'show_sewa_script_button')) {
            db.run('ALTER TABLE ui_config ADD COLUMN show_sewa_script_button INTEGER DEFAULT 1');
          }
        });
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS reseller_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        discount_percent INTEGER DEFAULT 0
      )
    `);
    db.run(`INSERT OR IGNORE INTO reseller_config (id, discount_percent) VALUES (1, 0)`);

    db.run(`
      CREATE TABLE IF NOT EXISTS topup_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        amount INTEGER,
        method TEXT,
        waktu TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS Server (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT,
        auth TEXT,
        harga INTEGER,
        nama_server TEXT,
        quota INTEGER,
        iplimit INTEGER,
        batas_create_akun INTEGER,
        total_create_akun INTEGER
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        saldo INTEGER DEFAULT 0,
        role TEXT DEFAULT 'member',
        CONSTRAINT unique_user_id UNIQUE (user_id)
      )
    `, (errUser) => {
      if (!errUser) {
        db.all('PRAGMA table_info(users)', (errCol, columns) => {
          if (!errCol && Array.isArray(columns) && !columns.some(col => col.name === 'role')) {
            db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'");
          }
        });
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS TrialLog (
        user_id INTEGER,
        date TEXT,
        count INTEGER DEFAULT 0,
        UNIQUE(user_id, date)
      )
    `);
  });
});

function loadButtonConfig() {
  try {
    return JSON.parse(fs.readFileSync(BUTTON_CONFIG_FILE, 'utf8'));
  } catch (e) {
    return { topup_saldo: true, topup_saweria: true };
  }
}

function saveButtonConfig(config) {
  fs.writeFileSync(BUTTON_CONFIG_FILE, JSON.stringify(config, null, 2));
}

const lastMenus = {};
const userState = {};
global.depositState = {};
global.pendingDeposits = {};
global.pendingDepositsSaweria = {};
global.processedTransactions = new Set();

module.exports = {
  FOLDER_TEMPATDB,
  logger,
  vars,
  SAWERIA_USERNAME,
  SAWERIA_EMAIL,
  BOT_TOKEN,
  port,
  ADMIN,
  adminIds,
  primaryAdminId,
  NAMA_STORE,
  DATA_QRIS,
  MERCHANT_ID,
  API_KEY,
  groupId,
  ADMIN_WA,
  AUTHX,
  GROUP_USERNAME,
  db,
  loadButtonConfig,
  saveButtonConfig,
  lastMenus,
  userState,
};
