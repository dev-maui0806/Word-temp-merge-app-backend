import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { connectDB } from './src/config/db.js';
import routes from './src/routes/index.js';
import { subscriptionMaintenanceService } from './src/services/subscriptionMaintenance.service.js';
import { ensureDefaultSubscriptionPlans } from './src/services/subscriptionPlan.service.js';

const app = express();
const PORT = process.env.PORT || 3000;
const PAYMENT_MODE = (process.env.PAYMENT_MODE || 'test').toLowerCase();

function isLocalLikeEnvironment() {
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  if (nodeEnv !== 'production') return true;
  const appOrigin = String(process.env.APP_ORIGIN || process.env.CORS_ORIGIN || '').toLowerCase();
  return appOrigin.includes('localhost') || appOrigin.includes('127.0.0.1');
}

function validatePaymentModeGuard() {
  if (!['test', 'live'].includes(PAYMENT_MODE)) {
    throw new Error("Invalid PAYMENT_MODE. Allowed values are 'test' or 'live'.");
  }

  const keyId = String(process.env.RAZORPAY_KEY_ID || '');
  const isLiveKey = keyId.startsWith('rzp_live_');
  const isTestKey = keyId.startsWith('rzp_test_');
  const isLocal = isLocalLikeEnvironment();

  if (PAYMENT_MODE === 'test' && isLiveKey) {
    throw new Error('PAYMENT_MODE=test cannot be used with a live Razorpay key (rzp_live_*).');
  }
  if (PAYMENT_MODE === 'live' && isTestKey) {
    throw new Error('PAYMENT_MODE=live cannot be used with a test Razorpay key (rzp_test_*).');
  }
  if (PAYMENT_MODE === 'live' && isLocal) {
    throw new Error(
      'Refusing to start with PAYMENT_MODE=live in local/dev environment. Use PAYMENT_MODE=test for localhost.'
    );
  }
}

validatePaymentModeGuard();

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
