const router = require('express').Router();
const controller = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', authenticate, controller.me);
module.exports = router;
