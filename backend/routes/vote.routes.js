const router = require('express').Router();
const ctrl = require('../controllers/vote.controller');
const { requireVoter } = require('../middleware/auth.middleware');

router.get('/elections/current', requireVoter, ctrl.getCurrentElection);
router.post('/vote', requireVoter, ctrl.castVote);
router.get('/vote/receipt', requireVoter, ctrl.getReceipt);

// Public — no login required. Live vote counts, with a winner announcement
// per position once the election is closed.
router.get('/results/public', ctrl.getPublicResults);

module.exports = router;
