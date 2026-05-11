const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Offer = require('../models/Offer');

exports.getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.userId }).populate('items.product coupon');
    if (!cart) {
      cart = new Cart({ user: req.user.userId, items: [] });
      await cart.save();
    }

    // Calculate totals
    let subtotal = 0;
    cart.items.forEach(item => {
      if (item.product) {
        item.price = item.product.price;
        subtotal += item.price * item.quantity;
      }
    });

    cart.subtotal = subtotal;
    cart.total = subtotal;

    // Apply coupon discount
    if (cart.coupon && cart.coupon.isActive && cart.coupon.endDate > new Date()) {
      if (subtotal >= cart.coupon.minOrderValue) {
        if (cart.coupon.type === 'percentage') {
          cart.discount = (subtotal * cart.coupon.value) / 100;
          if (cart.coupon.maxDiscount && cart.discount > cart.coupon.maxDiscount) {
            cart.discount = cart.coupon.maxDiscount;
          }
        } else {
          cart.discount = cart.coupon.value;
        }
        cart.total = subtotal - cart.discount;
      }
    }

    await cart.save();
    res.json({ success: true, cart });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, attributes } = req.body;

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
    }

    const itemIndex = cart.items.findIndex(item =>
      item.product.toString() === productId &&
      JSON.stringify(item.attributes) === JSON.stringify(attributes)
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity += quantity;
    } else {
      cart.items.push({
        product: productId,
        quantity,
        price: product.price,
        attributes
      });
    }

    await cart.save();
    await cart.populate('items.product');
    res.json({ success: true, cart });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const { itemId, quantity } = req.body;

    const cart = await Cart.findOne({ user: req.user.userId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    const item = cart.items.id(itemId);
    if (!item) return res.status(404).json({ success: false, message: 'Item not found in cart' });

    const product = await Product.findById(item.product);
    if (!product || product.stock < quantity) {
      return res.status(400).json({ success: false, message: 'Insufficient stock' });
    }

    item.quantity = quantity;
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
    await cart.save();
    res.json({ success: true, cart });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;

    const coupon = await Offer.findOne({ code, isActive: true, endDate: { $gt: new Date() } });
    if (!coupon) return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });

    const cart = await Cart.findOne({ user: req.user.userId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    cart.coupon = coupon._id;
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
    cart.discount = 0;
    await cart.save();

    res.json({ success: true, message: 'Coupon removed successfully', cart });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}; 