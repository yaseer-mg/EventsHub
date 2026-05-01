const express = require('express');

const {
  getPlans,
  getBillingInfo,
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
} = require('../controllers/billingController');
const { protect } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');

const router = express.Router();

router.get('/plans', getPlans);
router.post('/webhook', handleWebhook);

router.use(protect, tenantScope);

router.get('/', getBillingInfo);
router.post('/checkout', createCheckoutSession);
router.post('/portal', createPortalSession);

module.exports = router;
