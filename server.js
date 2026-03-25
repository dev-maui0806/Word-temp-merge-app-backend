import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

// Ensure we always load the correct backend/.env regardless of PM2 working directory.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
let PAYMENT_MODE = (process.env.PAYMENT_MODE || 'test').toLowerCase();

function detectKeyMode(keyId) {
  const id = String(keyId || '').trim();
  if (id.startsWith('rzp_live_')) return 'live';
  if (id.startsWith('rzp_test_')) return 'test';
  return null;
}

function applyPaymentModeGuard() {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  const keyId = process.env.RAZORPAY_KEY_ID;

  const keyMode = detectKeyMode(keyId);
  const requestedMode = PAYMENT_MODE;

  if (!['test', 'live'].includes(requestedMode)) {
    // Default to safe test if invalid.
    console.warn(`Invalid PAYMENT_MODE="${requestedMode}". Defaulting to "test".`);
    PAYMENT_MODE = 'test';
  }

  // If key id clearly indicates live/test, trust the key (prevents outages from env mismatch).
  if (keyMode && requestedMode !== keyMode) {
    console.warn(`PAYMENT_MODE="${requestedMode}" mismatches Razorpay key (${keyMode}). Auto-switching to "${keyMode}".`);
    PAYMENT_MODE = keyMode;
  }

  // Safety: refuse to start with LIVE keys only when we can clearly detect local/dev.
  // (Avoids accidental prod outages if NODE_ENV is not set.)
  const appOrigin = String(process.env.APP_ORIGIN || process.env.CORS_ORIGIN || '').toLowerCase();
  const isLocalLike =
    appOrigin.includes('localhost') || appOrigin.includes('127.0.0.1') || appOrigin.includes('0.0.0.0');
  if (isLocalLike && keyMode === 'live') {
    throw new Error(
      'Refusing to start with live Razorpay key (rzp_live_*) on local/dev. Use test keys (rzp_test_*).'
    );
  }

  // For observability only (don't log secrets).
  console.log(`Payment mode: ${PAYMENT_MODE} (keyMode=${keyMode || 'unknown'}, requested=${requestedMode})`);
}

applyPaymentModeGuard();

// Dynamic imports ensure dotenv has populated process.env before modules read it.
const { connectDB } = await import('./src/config/db.js');
const routes = (await import('./src/routes/index.js')).default;
const { subscriptionMaintenanceService } = await import('./src/services/subscriptionMaintenance.service.js');
const { ensureDefaultSubscriptionPlans } = await import('./src/services/subscriptionPlan.service.js');

await connectDB();
await ensureDefaultSubscriptionPlans().catch((err) =>
  console.error('Subscription plan defaults:', err)
);
subscriptionMaintenanceService
  .runExpiryDowngrades()
  .catch((err) => console.error('Subscription expiry check:', err));

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(cookieParser());

// Allow larger JSON payloads for Arrange Venue (image uploads etc.)
app.use(express.json({ limit: '10mb' }));
app.use('/api', routes);

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use.`);
    console.error(`   Another process is running on port ${PORT}.`);
    console.error(`   Please stop the existing process or use a different port.\n`);
    console.error(`   To find and kill the process on Windows:`);
    console.error(`   netstat -ano | findstr :${PORT}`);
    console.error(`   taskkill /PID <PID> /F\n`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Forcing shutdown...');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
