const PaymentTransaction = require('../models/PaymentTransaction');

const recordPaymentTransaction = async (transaction) => {
  const {
    order,
    user,
    provider,
    type = 'payment',
    status,
    amountMinor,
    currency = 'INR',
    method,
    gatewayOrderId,
    gatewayPaymentId,
    gatewayRefundId,
    gatewayEventId,
    failureCode,
    failureDescription
  } = transaction;

  const identity = { provider, type };
  if (gatewayRefundId) {
    identity.gatewayRefundId = gatewayRefundId;
  } else if (gatewayPaymentId) {
    identity.gatewayPaymentId = gatewayPaymentId;
  } else {
    identity.gatewayOrderId = gatewayOrderId;
    identity.gatewayPaymentId = { $exists: false };
  }

  let existing = await PaymentTransaction.findOne(identity);
  if (!existing && type === 'payment' && gatewayPaymentId && gatewayOrderId) {
    existing = await PaymentTransaction.findOne({
      provider,
      type,
      gatewayOrderId,
      gatewayPaymentId: { $exists: false }
    });
  }

  const effectiveStatus = existing?.status === 'completed' && status !== 'refunded'
    ? 'completed'
    : status;
  const filter = existing ? { _id: existing._id } : identity;
  const update = {
    $set: {
      order,
      user,
      status: effectiveStatus,
      amountMinor,
      currency: currency.toUpperCase(),
      method,
      ...(gatewayOrderId ? { gatewayOrderId } : {}),
      ...(gatewayPaymentId ? { gatewayPaymentId } : {}),
      ...(gatewayRefundId ? { gatewayRefundId } : {}),
      ...(failureCode ? { failureCode } : {}),
      ...(failureDescription ? { failureDescription: failureDescription.slice(0, 500) } : {}),
      ...(effectiveStatus === 'completed' || (type === 'refund' && effectiveStatus === 'refunded')
        ? { completedAt: new Date() }
        : {})
    },
    $setOnInsert: { initiatedAt: new Date() }
  };
  if (effectiveStatus === 'pending' || effectiveStatus === 'authorized' || effectiveStatus === 'completed') {
    update.$unset = { failureCode: 1, failureDescription: 1 };
  }
  if (gatewayEventId) update.$addToSet = { gatewayEventIds: gatewayEventId };

  return PaymentTransaction.findOneAndUpdate(filter, update, {
    new: true,
    upsert: true,
    runValidators: true,
    setDefaultsOnInsert: true
  });
};

module.exports = { recordPaymentTransaction };