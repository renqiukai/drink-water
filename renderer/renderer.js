const todayTotalEl = document.getElementById('todayTotal');
const lastDrinkEl = document.getElementById('lastDrink');
const pendingCountEl = document.getElementById('pendingCount');
const syncErrorEl = document.getElementById('syncError');
const drinkButton = document.getElementById('drinkButton');
const toggleSettingsButton = document.getElementById('toggleSettings');
const settingsPanel = document.getElementById('settingsPanel');
const remindIntervalInput = document.getElementById('remindInterval');
const remindEnabledInput = document.getElementById('remindEnabled');
const userIdInput = document.getElementById('userId');
const environmentSelect = document.getElementById('environment');
const saveSettingsButton = document.getElementById('saveSettings');
const resetDataButton = document.getElementById('resetData');

function formatTime(timestamp) {
  if (!timestamp) {
    return '暂无';
  }
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function renderStatus(status) {
  todayTotalEl.textContent = `${status.todayTotal} ml`;
  lastDrinkEl.textContent = formatTime(status.lastDrankAt);
  pendingCountEl.textContent = `待同步 ${status.pendingCount} 条`;
  syncErrorEl.textContent = status.lastSyncError ? `同步失败：${status.lastSyncError}` : '';

  const intervalHours = status.settings.remindIntervalMs / (60 * 60 * 1000);
  remindIntervalInput.value = String(intervalHours);
  remindEnabledInput.checked = Boolean(status.settings.remindEnabled);
  userIdInput.value = status.settings.userId || '';
  environmentSelect.value = status.settings.environment || 'dev';
}

async function init() {
  const status = await window.drinkApi.getStatus();
  renderStatus(status);

  window.drinkApi.onStatus((nextStatus) => {
    renderStatus(nextStatus);
  });
}

function toggleSettings() {
  settingsPanel.classList.toggle('hidden');
}

async function saveSettings() {
  const nextSettings = {
    remindIntervalHours: Number(remindIntervalInput.value),
    remindEnabled: remindEnabledInput.checked,
    userId: userIdInput.value,
    environment: environmentSelect.value
  };

  const status = await window.drinkApi.updateSettings(nextSettings);
  renderStatus(status);
  settingsPanel.classList.add('hidden');
}

drinkButton.addEventListener('click', async () => {
  const status = await window.drinkApi.addDrink();
  renderStatus(status);
});

toggleSettingsButton.addEventListener('click', toggleSettings);
saveSettingsButton.addEventListener('click', saveSettings);
resetDataButton.addEventListener('click', async () => {
  const confirmed = window.confirm('确定要清空所有喝水记录吗？');
  if (!confirmed) {
    return;
  }
  const status = await window.drinkApi.resetData();
  renderStatus(status);
});

init();
