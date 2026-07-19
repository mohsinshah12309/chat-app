require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

async function run() {
  const username = process.argv[2];
  if (!username) {
    console.error("Usage: node scripts/makeAdmin.js <username>");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOneAndUpdate({ username }, { isAdmin: true }, { new: true });

  if (!user) console.error(`No user found with username "${username}".`);
  else console.log(`${user.username} is now an admin. They must log out and back in to get the updated token.`);

  await mongoose.disconnect();
}

run();