require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const hallRoutes = require('./routes/halls');
const bookingRoutes = require('./routes/bookings');
const eventRoutes = require('./routes/events');
const attendeeRoutes = require('./routes/attendees');
const settingsRoutes = require('./routes/settings');
const billingRoutes = require('./routes/billing');
const reportRoutes = require('./routes/reports');
const superAdminRoutes = require('./routes/superAdmin');
const { handleWebhook } = require('./controllers/billingController');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const isProduction = process.env.NODE_ENV === 'production';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || (isProduction ? 10 : 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
  },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  handleWebhook
);

app.use(morgan('dev'));
app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authLimiter, authRoutes);
app.use(['/api/scan', '/api/attendees/scan'], scanLimiter);
app.use('/api', apiLimiter);

app.use('/api/clients', clientRoutes);
app.use('/api/halls', hallRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/events', eventRoutes);
app.use('/api', attendeeRoutes);
app.use('/api/attendees', attendeeRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', superAdminRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`EventsHub API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
