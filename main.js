const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_FILENAME = 'drink-data.json';
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const APP_KEY = 'Y3FOEGG7P8Kzudj2UwyQxFC36P2VxDcs';
const REPORT_ENDPOINT = '/api/ReportRecordProject/receive_report_db';
const DAY_CHECK_INTERVAL_MS = 60 * 1000;
const REMINDER_CHECK_INTERVAL_MS = 60 * 1000;
const DEFAULT_REMINDER_INTERVAL_HOURS = 2;

const defaultData = {
  records: [],
  settings: {
    environment: 'dev',
    userId: '',
    minimizeToTray: true,
    autoLaunch: false,
    reminderEnabled: true,
    reminderIntervalHours: DEFAULT_REMINDER_INTERVAL_HOURS
  },
  lastSyncError: ""
};

let mainWindow;
let tray;
let isQuitting = false;
let lastDayKey = null;
let data = { ...defaultData };
let reminderCheckpoint = {
  recordId: null,
  slot: 0
};
const iconPath = path.join(__dirname, 'water.png');

app.setName('DrinkWater');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.drinkwater.app');
}

function getEffectiveEnvironment() {
  return app.isPackaged ? 'prod' : data.settings.environment;
}

function getStoredEnvironment(environment) {
  if (app.isPackaged) {
    return 'prod';
  }
  return environment === 'prod' ? 'prod' : 'dev';
}

function loadData() {
  try {
    const filePath = getDataPath();
    if (!fs.existsSync(filePath)) {
      return { ...defaultData };
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const parsedSettings = parsed.settings || {};
    return {
      ...defaultData,
      ...parsed,
      settings: {
        environment: getStoredEnvironment(parsedSettings.environment),
        userId: (parsedSettings.userId || '').trim(),
        minimizeToTray: parsedSettings.minimizeToTray !== false,
        autoLaunch: Boolean(parsedSettings.autoLaunch),
        reminderEnabled: parsedSettings.reminderEnabled !== false,
        reminderIntervalHours: normalizeReminderIntervalHours(parsedSettings.reminderIntervalHours)
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

function normalizeReminderIntervalHours(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_REMINDER_INTERVAL_HOURS;
  }
  return parsed;
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

  mainWindow.on('close', (event) => {
    if (isQuitting || !data.settings.minimizeToTray) {
      return;
    }
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('minimize', (event) => {
    if (!data.settings.minimizeToTray) {
      return;
    }
    event.preventDefault();
    mainWindow.hide();
  });
}

function applyAppSettings() {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }
  app.setLoginItemSettings({
    openAtLogin: Boolean(data.settings.autoLaunch)
  });
}

function createTray() {
  if (tray) {
    return;
  }
  const trayIcon = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') {
    const resized = trayIcon.resize({ width: 16, height: 16 });
    resized.setTemplateImage(true);
    tray = new Tray(resized);
  } else {
    tray = new Tray(trayIcon);
  }
  tray.setToolTip('DrinkWater');
  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      sendStatus();
      return;
    }
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  const menu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          createWindow();
          sendStatus();
          return;
        }
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
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
  reminderCheckpoint = { recordId: record.id, slot: 0 };
  saveData();
  sendStatus();
  void syncPending();

  return record;
}

function showReminderNotification(lastDrankAt) {
  const lastDrinkTime = formatDateTime(lastDrankAt);
  const notification = new Notification({
    title: '该喝水了',
    body: `距离上次喝水（${lastDrinkTime}）已经超过 ${data.settings.reminderIntervalHours} 小时`
  });

  notification.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      sendStatus();
      return;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  notification.show();
}

function showWelcomeNotification() {
  if (!Notification.isSupported()) {
    return;
  }

  const notification = new Notification({
    title: 'DrinkWater 已启动',
    body: '欢迎回来，记得及时补充水分。'
  });

  notification.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      sendStatus();
      return;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  notification.show();
}

function showTestReminderNotification() {
  if (!Notification.isSupported()) {
    return false;
  }

  const notification = new Notification({
    title: '提醒测试',
    body: '这是一条测试提醒通知。'
  });

  notification.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      sendStatus();
      return;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  notification.show();
  return true;
}

function maybeTriggerReminder() {
  if (!data.settings.reminderEnabled || data.records.length === 0) {
    return;
  }
  if (!Notification.isSupported()) {
    return;
  }

  const lastRecord = data.records.reduce((latest, record) => {
    if (!latest || record.drankAt > latest.drankAt) {
      return record;
    }
    return latest;
  }, null);

  if (!lastRecord) {
    return;
  }

  const intervalMs = normalizeReminderIntervalHours(data.settings.reminderIntervalHours) * 60 * 60 * 1000;
  const elapsedMs = Date.now() - lastRecord.drankAt;
  const slot = Math.floor(elapsedMs / intervalMs);
  if (slot < 1) {
    reminderCheckpoint = { recordId: lastRecord.id, slot: 0 };
    return;
  }

  if (reminderCheckpoint.recordId === lastRecord.id && reminderCheckpoint.slot === slot) {
    return;
  }

  reminderCheckpoint = { recordId: lastRecord.id, slot };
  showReminderNotification(lastRecord.drankAt);
}

function buildStatus() {
  const now = Date.now();
  const lastDrankAt = data.records.length
    ? Math.max(...data.records.map((record) => record.drankAt))
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

function getDayKey(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sendStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status', buildStatus());
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
  const nextEnvironment = getStoredEnvironment(nextSettings.environment);

  data.settings = {
    ...data.settings,
    environment: nextEnvironment,
    userId: (nextSettings.userId || '').trim(),
    minimizeToTray: nextSettings.minimizeToTray !== false,
    autoLaunch: Boolean(nextSettings.autoLaunch),
    reminderEnabled: nextSettings.reminderEnabled !== false,
    reminderIntervalHours: normalizeReminderIntervalHours(nextSettings.reminderIntervalHours)
  };

  data.lastSyncError = '';
  saveData();
  applyAppSettings();
  sendStatus();
  maybeTriggerReminder();
  return buildStatus();
});

ipcMain.handle('test-reminder', () => {
  const shown = showTestReminderNotification();
  if (!shown) {
    return { ok: false, message: '当前系统不支持通知' };
  }
  return { ok: true };
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
  applyAppSettings();
  createTray();
  createWindow();
  sendStatus();
  showWelcomeNotification();
  maybeTriggerReminder();
  lastDayKey = getDayKey(Date.now());

  setInterval(() => {
    void syncPending();
  }, SYNC_INTERVAL_MS);

  setInterval(() => {
    const nextDayKey = getDayKey(Date.now());
    if (nextDayKey !== lastDayKey) {
      lastDayKey = nextDayKey;
      sendStatus();
    }
  }, DAY_CHECK_INTERVAL_MS);

  setInterval(() => {
    maybeTriggerReminder();
  }, REMINDER_CHECK_INTERVAL_MS);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
