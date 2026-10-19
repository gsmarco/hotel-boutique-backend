const router = require('express').Router();
const controller = require('../controllers/roomController');
router.get('/', controller.list);
router.get('/availability', controller.availability);
router.get('/:id', controller.get);
module.exports = router;
