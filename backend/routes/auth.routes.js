const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { requireVoter } = require('../middleware/auth.middleware');

router.post('/register', ctrl.register);
router.post('/resend-code', ctrl.resendCode);
router.post('/verify-code', ctrl.verifyCode);
router.post('/set-password', ctrl.setPassword);
router.post('/login', ctrl.login);
router.get('/me', requireVoter, ctrl.me);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/forgot-password/resend', ctrl.resendResetCode);
router.post('/reset-password', ctrl.resetPassword);

module.exports = router;
