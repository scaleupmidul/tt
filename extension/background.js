// GEP-5 Background Worker
// Monitors EA signal stream and issues high-priority desktop notifications on confirmed BUY/SELL

const CHECK_INTERVAL_MINUTES = 1;
let lastNotifiedBarTime = 0;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('checkGep5Signal', { periodInMinutes: CHECK_INTERVAL_MINUTES });
  console.log('[GEP-5 Extension] Installed & Alarm scheduled.');
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkGep5Signal') {
    await checkSignalIntegrity();
  }
});

async function checkSignalIntegrity() {
  try {
    const resp = await fetch('http://localhost:3000/api/connector/latest');
    if (!resp.ok) return;
    const json = await resp.json();
    if (json.status !== 'LIVE' || !json.data) return;

    const data = json.data;
    const strat = data.strategy;
    if (!strat || !strat.decision || strat.decision === 'NO_TRADE') return;

    const barTime = strat.closed_bar_time || 0;
    if (barTime > lastNotifiedBarTime) {
      lastNotifiedBarTime = barTime;
      const title = `GEP-5 ${strat.decision} SIGNAL CONFIRMED`;
      const message = `Symbol: ${data.symbol} @ $${strat.trade_levels?.entry} | SL: $${strat.trade_levels?.stop_loss} | TP: $${strat.trade_levels?.take_profit}`;

      chrome.notifications.create(`gep5-signal-${barTime}`, {
        type: 'basic',
        iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23fbbf24"><path d="M12 2L2 22h20L12 2z"/></svg>',
        title,
        message,
        priority: 2,
      });
    }
  } catch (e) {
    // Daemon offline
  }
}
