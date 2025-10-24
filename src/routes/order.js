const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middlewares/auth');
const role = require('../middlewares/role');

// Routes publiques (nécessitent authentification)
router.post('/', auth, orderController.createOrder);
router.get('/my-orders', auth, orderController.getUserOrders);
router.get('/:id', auth, orderController.getOrderById);

// Routes admin
router.get('/admin/all', auth, role('admin'), orderController.getAllOrders);
router.put('/admin/:id/status', auth, role('admin'), orderController.updateOrderStatus);

module.exports = router;
