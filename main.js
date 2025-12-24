const { app, BrowserWindow, ipcMain, Notification, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_FILENAME = 'drink-data.json';
const REMIND_CHECK_INTERVAL_MS = 60 * 1000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

const defaultData = {
  records: [],
  settings: {
    remindIntervalMs: 2 * 60 * 60 * 1000,
    remindEnabled: true,
    serverBaseUrl: ""
  },
  lastReminderForDrinkAt: null,
  lastSyncError: ""
};

let mainWindow;
let data = { ...defaultData };
const iconPath = path.join(__dirname, 'water.png');

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
    settings: data.settings,
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
        body: '距离上次喝水已经超过 2 小时，记得喝水哦。'
      });
      notification.show();
    }
  }
}

async function syncPending() {
  const { serverBaseUrl } = data.settings;
  if (!serverBaseUrl) {
    return;
  }

  const pending = data.records.filter((record) => !record.synced);
  if (pending.length === 0) {
    return;
  }

  try {
    for (const record of pending) {
      const response = await fetch(`${serverBaseUrl}/api/drinks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: record.id,
          amountMl: record.amountMl,
          drankAt: record.drankAt
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

  data.settings = {
    ...data.settings,
    remindIntervalMs,
    remindEnabled: Boolean(nextSettings.remindEnabled),
    serverBaseUrl: (nextSettings.serverBaseUrl || "").trim()
  };

  saveData();
  sendStatus();
  return buildStatus();
});

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
