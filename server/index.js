import { createApp } from './app.js';
import { config } from './config.js';
import { reconcilePendingUsdcDeposits, reconcileVirtualCards } from './bitnob.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(`Dink Card API running on http://localhost:${config.port}`);
});

let reconciliationRunning = false;
async function runReconciliation() {
  if (reconciliationRunning) return;
  reconciliationRunning = true;
  try {
    await reconcilePendingUsdcDeposits();
    await reconcileVirtualCards({ limit: 100 });
  } catch {
    // Provider reconciliation is a background safety net; request paths still handle user-visible errors.
  } finally {
    reconciliationRunning = false;
  }
}

setTimeout(runReconciliation, 15_000);
setInterval(runReconciliation, 60_000);
