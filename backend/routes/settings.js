const express = require('express');

const {
  getSettings,
  updateBusinessInfo,
  uploadLogo,
  updateBranding,
  updateProfile,
  changePassword,
  getTeamMembers,
  inviteTeamMember,
  acceptInvitation,
  updateTeamMember,
  removeTeamMember,
  updateNotifications,
} = require('../controllers/settingsController');
const { protect } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');
const { requirePlan } = require('../middleware/planGuard');
const { checkUsageLimit } = require('../middleware/usageGuard');
const { requireRole } = require('../middleware/roleGuard');

const router = express.Router();

router.post('/team/accept', acceptInvitation);

router.use(protect, tenantScope);

router.get('/', getSettings);
router.put('/business', updateBusinessInfo);
router.post('/logo', requirePlan('custom_branding'), uploadLogo);
router.put('/branding', requirePlan('custom_branding'), updateBranding);
router.put('/profile', updateProfile);
router.put('/password', changePassword);
router.get('/team', getTeamMembers);
router.post(
  '/team/invite',
  requireRole(['owner', 'manager']),
  checkUsageLimit('team_member'),
  inviteTeamMember
);
router.put('/team/:userId', requireRole(['owner']), updateTeamMember);
router.delete('/team/:userId', requireRole(['owner']), removeTeamMember);
router.put('/notifications', updateNotifications);

module.exports = router;
