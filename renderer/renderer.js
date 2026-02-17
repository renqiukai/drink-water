const todayTotalEl = document.getElementById('todayTotal');
const lastDrinkEl = document.getElementById('lastDrink');
const pendingCountEl = document.getElementById('pendingCount');
const syncErrorEl = document.getElementById('syncError');
const drinkButton = document.getElementById('drinkButton');
const toggleSettingsButton = document.getElementById('toggleSettings');
const settingsDialog = document.getElementById('settingsDialog');
const closeSettingsButton = document.getElementById('closeSettings');
const userIdInput = document.getElementById('userId');
const environmentSelect = document.getElementById('environment');
const environmentHint = document.getElementById('environmentHint');
const minimizeToTrayInput = document.getElementById('minimizeToTray');
const autoLaunchInput = document.getElementById('autoLaunch');
const reminderEnabledInput = document.getElementById('reminderEnabled');
const reminderIntervalHoursInput = document.getElementById('reminderIntervalHours');
const testReminderButton = document.getElementById('testReminder');
const saveSettingsButton = document.getElementById('saveSettings');
const resetDataButton = document.getElementById('resetData');

function formatTime(timestamp, now) {
  if (!timestamp) {
    return '暂无';
  }
  const date = new Date(timestamp);
  const nowDate = new Date(now || Date.now());
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (value) => {
    const copy = new Date(value);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
  };
  const dayDiff = Math.floor((startOfDay(nowDate) - startOfDay(date)) / (24 * 60 * 60 * 1000));
  if (dayDiff <= 0) {
    return time;
  }
  if (dayDiff === 1) {
    return `昨天 ${time}`;
  }
  if (dayDiff === 2) {
    return `前天 ${time}`;
  }
  if (dayDiff < 7) {
    return `${dayDiff} 天前 ${time}`;
  }
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day} ${time}`;
}

function renderStatus(status) {
  todayTotalEl.textContent = `${status.todayTotal} ml`;
  lastDrinkEl.textContent = formatTime(status.lastDrankAt, status.now);
  pendingCountEl.textContent = `待同步 ${status.pendingCount} 条`;
  syncErrorEl.textContent = status.lastSyncError ? `同步失败：${status.lastSyncError}` : '';

  userIdInput.value = status.settings.userId || '';
  environmentSelect.value = status.settings.environment || 'dev';
  environmentSelect.disabled = Boolean(status.settings.environmentLocked);
  environmentHint.classList.toggle('hidden', !status.settings.environmentLocked);
  minimizeToTrayInput.checked = status.settings.minimizeToTray !== false;
  autoLaunchInput.checked = Boolean(status.settings.autoLaunch);
  reminderEnabledInput.checked = status.settings.reminderEnabled !== false;
  reminderIntervalHoursInput.value = String(status.settings.reminderIntervalHours || 2);
  reminderIntervalHoursInput.disabled = !reminderEnabledInput.checked;
}

async function init() {
  const status = await window.drinkApi.getStatus();
  renderStatus(status);

  window.drinkApi.onStatus((nextStatus) => {
    renderStatus(nextStatus);
  });
}

function toggleSettings() {
  if (settingsDialog.open) {
    settingsDialog.close();
  } else {
    settingsDialog.showModal();
  }
}

async function saveSettings() {
  const nextSettings = {
    userId: userIdInput.value,
    environment: environmentSelect.value,
    minimizeToTray: minimizeToTrayInput.checked,
    autoLaunch: autoLaunchInput.checked,
    reminderEnabled: reminderEnabledInput.checked,
    reminderIntervalHours: reminderIntervalHoursInput.value
  };

  const status = await window.drinkApi.updateSettings(nextSettings);
  renderStatus(status);
  settingsDialog.close();
}

drinkButton.addEventListener('click', async () => {
  const status = await window.drinkApi.addDrink();
  renderStatus(status);
});

toggleSettingsButton.addEventListener('click', toggleSettings);
closeSettingsButton.addEventListener('click', () => settingsDialog.close());
settingsDialog.addEventListener('click', (event) => {
  if (event.target === settingsDialog) {
    settingsDialog.close();
  }
});
saveSettingsButton.addEventListener('click', saveSettings);
testReminderButton.addEventListener('click', async () => {
  const result = await window.drinkApi.testReminder();
  if (!result.ok) {
    window.alert(result.message || '测试提醒失败');
  }
});
reminderEnabledInput.addEventListener('change', () => {
  reminderIntervalHoursInput.disabled = !reminderEnabledInput.checked;
});
resetDataButton.addEventListener('click', async () => {
  const confirmed = window.confirm('确定要清空所有喝水记录吗？');
  if (!confirmed) {
    return;
  }
  const status = await window.drinkApi.resetData();
  renderStatus(status);
});

init();
