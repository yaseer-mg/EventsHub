const express = require('express');

const {
  getAllEvents,
  getEventById,
  getCalendarEvents,
  updateEventStatus,
} = require('../controllers/eventController');
const { protect } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { requireRole } = require('../middleware/roleGuard');

const router = express.Router();

router.use(protect, tenantScope);

router.get('/', getAllEvents);
router.get('/calendar', getCalendarEvents);
router.get('/:id', getEventById);
router.patch('/:id/status', requireRole(['owner', 'manager']), updateEventStatus);

module.exports = router;
