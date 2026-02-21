import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { connectDB } from './src/config/db.js';
import routes from './src/routes/index.js';
import stripeRoutes, { getWebhookRoute } from './src/routes/stripe.routes.js';
import { stripeService } from './src/services/stripe.service.js';

const app = express();
const PORT = process.env.PORT || 3000;

await connectDB();
stripeService.runExpiryDowngrades().catch((err) => console.error('Stripe expiry check:', err));

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(cookieParser());

// Stripe webhook needs the raw body, so mount before JSON parser
app.post('/api/stripe/webhook', ...getWebhookRoute(express));

// Allow larger JSON payloads for Arrange Venue (image uploads etc.)
app.use(express.json({ limit: '10mb' }));

app.use('/api/stripe', stripeRoutes);
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
