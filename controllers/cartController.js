const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Offer = require('../models/Offer');

const updateCartTotals = (cart, coupon = cart.coupon) => {
  const now = new Date();
  const subtotal = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);
  const couponIsValid = coupon && coupon.isActive &&
    (!coupon.startDate || coupon.startDate <= now) &&
    (!coupon.endDate || coupon.endDate > now) &&
    subtotal >= (coupon.minOrderValue || 0);

  let discount = 0;
  if (couponIsValid) {
    discount = coupon.type === 'percentage'
      ? subtotal * coupon.value / 100
      : coupon.value;
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  }

  cart.subtotal = subtotal;
  cart.discount = Math.min(subtotal, discount);
  cart.total = Math.max(0, subtotal - cart.discount);
};

exports.getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.userId }).populate('items.product coupon');
    if (!cart) {
      cart = new Cart({ user: req.user.userId, items: [] });
      await cart.save();
    }

    cart.items.forEach(item => {
      if (item.product) {
        item.price = item.product.price;
      }
    });
    updateCartTotals(cart);

    await cart.save();
    res.json({ success: true, cart });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.addToCart = async (req, res) => {
  try {
    const { productId, attributes } = req.body;
    const quantity = Number(req.body.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be a positive integer' });
    }

    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (product.stock < quantity) {
      return res.status(400).json({ success: false, message: 'Insufficient stock' });
    }

    let cart = await Cart.findOne({ user: req.user.userId });
    if (!cart) {
      cart = new Cart({ user: req.user.userId, items: [] });
    } else {
      await cart.populate('coupon');
    }

    const itemIndex = cart.items.findIndex(item =>
      item.product.toString() === productId &&
      JSON.stringify(item.attributes) === JSON.stringify(attributes)
    );

    if (itemIndex > -1) {
      if (cart.items[itemIndex].quantity + quantity > product.stock) {
        return res.status(400).json({ success: false, message: 'Insufficient stock' });
      }
      cart.items[itemIndex].quantity += quantity;
    } else {
      cart.items.push({
        product: productId,
        quantity,
        price: product.price,
        attributes
      });
    }

    updateCartTotals(cart);
    await cart.save();
    await cart.populate('items.product');
    res.json({ success: true, cart });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const itemId = req.params.itemId;
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be a positive integer' });
    }

    const cart = await Cart.findOne({ user: req.user.userId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });
    await cart.populate('coupon');

    const item = cart.items.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found in cart' });

    const product = await Product.findById(item.product);
    if (!product || product.stock < quantity) {
      return res.status(400).json({ success: false, message: 'Insufficient stock' });
    }

    item.quantity = quantity;
    updateCartTotals(cart);
    await cart.save();
    await cart.populate('items.product');
    res.json({ success: true, cart });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;

    const cart = await Cart.findOne({ user: req.user.userId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    cart.items.pull(itemId);
    await cart.populate('coupon');
    updateCartTotals(cart);
    await cart.save();
    await cart.populate('items.product');
    res.json({ success: true, cart });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.userId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    cart.items = [];
    cart.coupon = null;
    cart.discount = 0;
    cart.subtotal = 0;
    cart.total = 0;
    await cart.save();
    res.json({ success: true, cart });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;

    const now = new Date();
    const coupon = await Offer.findOne({
      code,
      isActive: true,
      endDate: { $gt: now },
      $or: [
        { startDate: { $lte: now } },
        { startDate: null },
        { startDate: { $exists: false } }
      ]
    });
    if (!coupon) return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
      return res.status(409).json({ success: false, message: 'Coupon usage limit has been reached' });
    }

    const cart = await Cart.findOne({ user: req.user.userId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    const subtotal = cart.items.reduce((total, item) => total + item.price * item.quantity, 0);
    if (subtotal < (coupon.minOrderValue || 0)) {
      return res.status(400).json({ success: false, message: 'Cart does not meet the minimum order value for this coupon' });
    }

    cart.coupon = coupon._id;
    updateCartTotals(cart, coupon);
    await cart.save();
    await cart.populate('coupon');

    res.json({ success: true, message: 'Coupon applied successfully', cart });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.removeCoupon = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.userId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    cart.coupon = null;
    updateCartTotals(cart, null);
    await cart.save();

    res.json({ success: true, message: 'Coupon removed successfully', cart });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}; 