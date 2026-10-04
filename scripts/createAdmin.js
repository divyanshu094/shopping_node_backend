require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');

const createAdmin = async () => {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!name || !email || !password || password.length < 12) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and an ADMIN_PASSWORD of at least 12 characters.');
  }

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/grocery');
  const user = await User.findOne({ email });
  const hashedPassword = await bcrypt.hash(password, 12);

  if (user) {
    user.name = name;
    user.password = hashedPassword;
    user.isAdmin = true;
    user.isVerified = true;
    user.refreshToken = null;
    await user.save();
    console.log(`Administrator account updated for ${email}`);
  } else {
    await User.create({
      name,
      email,
      password: hashedPassword,
      isAdmin: true,
      isVerified: true
    });
    console.log(`Administrator account created for ${email}`);
  }
};

createAdmin()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
