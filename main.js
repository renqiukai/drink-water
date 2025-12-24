const { app, BrowserWindow, ipcMain, Notification, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_FILENAME = 'drink-data.json';
const REMIND_CHECK_INTERVAL_MS = 60 * 1000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const APP_KEY = 'Y3FOEGG7P8Kzudj2UwyQxFC36P2VxDcs';
const REPORT_ENDPOINT = '/api/ReportRecordProject/receive_report_db';

const defaultData = {
  records: [],
  settings: {
    remindIntervalMs: 2 * 60 * 60 * 1000,
    remindEnabled: true,
    environment: 'dev',
    userId: '',
    remindContent: '距离上次喝水已经超过 2 小时，记得喝水哦。'
  },
  lastReminderForDrinkAt: null,
  lastSyncError: ""
};

let mainWindow;
let data = { ...defaultData };
const iconPath = path.join(__dirname, 'water.png');

app.setName('DrinkWater');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.drinkwater.app');
}

function getEffectiveEnvironment() {
  return app.isPackaged ? 'prod' : data.settings.environment;
}

function loadData() {
  try {
    const filePath = getDataPath();
    if (!fs.existsSync(filePath)) {
      return { ...defaultData };
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...defaultData,
      ...parsed,
      settings: {
        ...defaultData.settings,
        ...(parsed.settings || {})
      }
    };
  } catch (error) {
    return { ...defaultData, lastSyncError: String(error) };
  }
}

function saveData() {
  const filePath = getDataPath();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getDataPath() {
  return path.join(app.getPath('userData'), DATA_FILENAME);
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 260;
  const windowHeight = 260;

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: width - windowWidth - 12,
    y: height - windowHeight - 12,
    resizable: false,
    alwaysOnTop: true,
    icon: iconPath,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 },
    frame: false,
    autoHideMenuBar: true,
    menuBarVisible: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function addDrinkRecord() {
  const now = Date.now();
  const record = {
    id: crypto.randomUUID(),
    amountMl: 300,
    drankAt: now,
    createdAt: now,
    synced: false
  };

  data.records.push(record);
  data.lastSyncError = "";
  saveData();
  sendStatus();
  void syncPending();

  return record;
}

function buildStatus() {
  const now = Date.now();
  const lastDrankAt = data.records.length
    ? Math.max(...data.records.map((record) => record.drankAt))
    : null;
  const nextReminderAt = data.settings.remindEnabled && lastDrankAt
    ? lastDrankAt + data.settings.remindIntervalMs
    : null;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTotal = data.records
    .filter((record) => record.drankAt >= todayStart.getTime())
    .reduce((sum, record) => sum + record.amountMl, 0);

  const pendingCount = data.records.filter((record) => !record.synced).length;

  return {
    now,
    lastDrankAt,
    nextReminderAt,
    todayTotal,
    pendingCount,
    settings: {
      ...data.settings,
      environment: getEffectiveEnvironment(),
      environmentLocked: app.isPackaged
    },
    lastSyncError: data.lastSyncError
  };
}

function sendStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status', buildStatus());
  }
}

function checkReminder() {
  if (!data.settings.remindEnabled) {
    return;
  }

  const lastDrankAt = data.records.length
    ? Math.max(...data.records.map((record) => record.drankAt))
    : null;

  if (!lastDrankAt) {
    return;
  }

  const elapsed = Date.now() - lastDrankAt;
  if (elapsed >= data.settings.remindIntervalMs) {
    if (data.lastReminderForDrinkAt === lastDrankAt) {
      return;
    }

    data.lastReminderForDrinkAt = lastDrankAt;
    saveData();

    if (Notification.isSupported()) {
      const notification = new Notification({
        title: '喝水提醒',
        body: data.settings.remindContent || defaultData.settings.remindContent,
        icon: iconPath
      });
      notification.show();
    }
  }
}

async function syncPending() {
  const { userId } = data.settings;
  const environment = getEffectiveEnvironment();
  if (!userId) {
    data.lastSyncError = '请先设置用户 ID';
    saveData();
    sendStatus();
    return;
  }

  const serverBaseUrl = environment === 'prod'
    ? 'https://qkode.renqiukai.com'
    : 'http://127.0.0.1:8000';

  if (!serverBaseUrl) {
    return;
  }

  const pending = data.records.filter((record) => !record.synced);
  if (pending.length === 0) {
    return;
  }

  try {
    for (const record of pending) {
      const drinkTime = formatDateTime(record.drankAt);
      const response = await fetch(`${serverBaseUrl}${REPORT_ENDPOINT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_key: APP_KEY,
          index_field: 'userid_drinktime',
          docs: [
            {
              userid_drinktime: `${userId}_${drinkTime}`,
              user_id: userId,
              water: record.amountMl,
              drink_time: drinkTime
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      record.synced = true;
    }

    data.lastSyncError = "";
    saveData();
    sendStatus();
  } catch (error) {
    data.lastSyncError = String(error);
    saveData();
    sendStatus();
  }
}

ipcMain.handle('get-status', () => buildStatus());
ipcMain.handle('add-drink', () => {
  addDrinkRecord();
  return buildStatus();
});

ipcMain.handle('update-settings', (event, nextSettings) => {
  const nextIntervalHours = Number(nextSettings.remindIntervalHours);
  const remindIntervalMs = Number.isFinite(nextIntervalHours) && nextIntervalHours > 0
    ? nextIntervalHours * 60 * 60 * 1000
    : data.settings.remindIntervalMs;
  const remindContent = (nextSettings.remindContent || '').trim()
    || data.settings.remindContent;
  const nextEnvironment = app.isPackaged
    ? data.settings.environment
    : (nextSettings.environment === 'prod' ? 'prod' : 'dev');

  data.settings = {
    ...data.settings,
    remindIntervalMs,
    remindEnabled: Boolean(nextSettings.remindEnabled),
    environment: nextEnvironment,
    userId: (nextSettings.userId || '').trim(),
    remindContent
  };

  data.lastSyncError = '';
  saveData();
  sendStatus();
  return buildStatus();
});

ipcMain.handle('test-reminder', () => {
  if (app.isPackaged) {
    return { ok: false, reason: '仅开发环境可用' };
  }
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: '喝水提醒（测试）',
      body: data.settings.remindContent || defaultData.settings.remindContent,
      icon: iconPath
    });
    notification.show();
    return { ok: true };
  }
  return { ok: false, reason: '系统不支持通知' };
});

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

ipcMain.handle('reset-data', () => {
  data = {
    ...defaultData,
    settings: {
      ...data.settings
    }
  };
  saveData();
  sendStatus();
  return buildStatus();
});

app.whenReady().then(() => {
  data = loadData();
  if (app.isPackaged && data.settings.environment !== 'prod') {
    data.settings.environment = 'prod';
    saveData();
  }
  if (app.dock && fs.existsSync(iconPath)) {
    app.dock.setIcon(iconPath);
  }
  createWindow();
  sendStatus();

  setInterval(checkReminder, REMIND_CHECK_INTERVAL_MS);
  setInterval(() => {
    void syncPending();
  }, SYNC_INTERVAL_MS);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
