const router = require('express').Router();
const authCtrl = require('../controllers/admin.auth.controller');
const dataCtrl = require('../controllers/admin.data.controller');
const { requireAdmin } = require('../middleware/auth.middleware');

// Two-step login: password check + emailed OTP
router.post('/login/request-otp', authCtrl.requestOtp);
router.post('/login/verify-otp', authCtrl.verifyOtp);

// Everything below requires a valid admin JWT
router.get('/results', requireAdmin, dataCtrl.getResults);
router.get('/candidates', requireAdmin, dataCtrl.listCandidates);
router.post('/candidates', requireAdmin, dataCtrl.addCandidate);
router.patch('/candidates/:id/approve', requireAdmin, dataCtrl.approveCandidate);
router.delete('/candidates/:id', requireAdmin, dataCtrl.deleteCandidate);
router.get('/voters', requireAdmin, dataCtrl.listVoters);
router.post('/voters/reset', requireAdmin, dataCtrl.resetVoterRoll);
router.get('/positions', requireAdmin, dataCtrl.listPositions);
router.post('/positions', requireAdmin, dataCtrl.addPosition);
router.delete('/positions/:id', requireAdmin, dataCtrl.deletePosition);
router.get('/election', requireAdmin, dataCtrl.getElection);
router.patch('/election', requireAdmin, dataCtrl.updateElectionWindow);
router.patch('/election/status', requireAdmin, dataCtrl.setElectionStatus);
router.post('/election/certify', requireAdmin, dataCtrl.certifyElection);

module.exports = router;
