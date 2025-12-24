const todayTotalEl = document.getElementById('todayTotal');
const lastDrinkEl = document.getElementById('lastDrink');
const nextReminderEl = document.getElementById('nextReminder');
const pendingCountEl = document.getElementById('pendingCount');
const syncErrorEl = document.getElementById('syncError');
const drinkButton = document.getElementById('drinkButton');
const toggleSettingsButton = document.getElementById('toggleSettings');
const settingsPanel = document.getElementById('settingsPanel');
const remindIntervalInput = document.getElementById('remindInterval');
const remindEnabledInput = document.getElementById('remindEnabled');
const userIdInput = document.getElementById('userId');
const remindContentInput = document.getElementById('remindContent');
const environmentSelect = document.getElementById('environment');
const environmentHint = document.getElementById('environmentHint');
const saveSettingsButton = document.getElementById('saveSettings');
const testReminderButton = document.getElementById('testReminder');
const resetDataButton = document.getElementById('resetData');

function formatTime(timestamp) {
  if (!timestamp) {
    return '暂无';
  }
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatNextReminder(status) {
  if (!status.settings.remindEnabled) {
    return '已关闭';
  }
  if (!status.nextReminderAt) {
    return '暂无';
  }
  const date = new Date(status.nextReminderAt);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function renderStatus(status) {
  todayTotalEl.textContent = `${status.todayTotal} ml`;
  lastDrinkEl.textContent = formatTime(status.lastDrankAt);
  nextReminderEl.textContent = formatNextReminder(status);
  pendingCountEl.textContent = `待同步 ${status.pendingCount} 条`;
  syncErrorEl.textContent = status.lastSyncError ? `同步失败：${status.lastSyncError}` : '';

  const intervalHours = status.settings.remindIntervalMs / (60 * 60 * 1000);
  remindIntervalInput.value = String(intervalHours);
  remindEnabledInput.checked = Boolean(status.settings.remindEnabled);
  userIdInput.value = status.settings.userId || '';
  remindContentInput.value = status.settings.remindContent || '';
  environmentSelect.value = status.settings.environment || 'dev';
  environmentSelect.disabled = Boolean(status.settings.environmentLocked);
  environmentHint.classList.toggle('hidden', !status.settings.environmentLocked);
  testReminderButton.classList.toggle('hidden', Boolean(status.settings.environmentLocked));
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
    remindContent: remindContentInput.value,
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

testReminderButton.addEventListener('click', async () => {
  try {
    const result = await window.drinkApi.testReminder();
    if (!result || !result.ok) {
      const reason = result && result.reason ? result.reason : '测试提醒失败';
      window.alert(reason);
      return;
    }
    window.alert('已触发测试提醒，请检查系统通知（需开启通知权限）。');
  } catch (error) {
    window.alert(`测试提醒失败：${error}`);
  }
});

init();
