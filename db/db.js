const { MongoClient } = require("mongodb");
const mongoURL = process.env.MONGO_URI;
const client = new MongoClient(mongoURL);
const dbName = process.env.MONGO_DB;
const bt = "BOT";
let db, stark, withd;

const connectToDatabase = async () => {
  try {
    await client.connect();
    db = client.db(dbName);
    stark = db.collection("All-Users");
    withd = db.collection("Withdrawals");
    const bott = await stark.findOne({ name: bt });

    if (!bott) {
      await stark.insertOne({
        name: bt,
        notification_channel: false,
        refer_bonus: false,
        ads_price: false,
        upgrade_price: false,
        withdrawal: "disabled",
      });
      console.log("Bot's data configured successfully!");
    }

    console.log(`Connected to database`);
  } catch (err) {
    console.log(`Error connecting to database`);

    console.log(err);
  }
};

async function getUser(user) {
  try {
    const u = await stark.findOne({ tg_id: user });
    return u;
  } catch (err) {
    console.log(err);
    return null;
  }
}

async function addUser(user) {
  try {
    await stark.insertOne(user);
    return true;
  } catch (err) {
    console.log(err);
    return null;
  }
}

async function updateUser(user, data) {
  try {
    const res = await stark.updateOne({ tg_id: user }, data);
    return true;
  } catch (err) {
    console.log(err);
    return null;
  }
}

async function updateWith(f, u, o) {
  try {
    const res = await stark.updateOne(f, u, o);
    return true;
  } catch (err) {
    console.log(err);
    return null;
  }
}

const getBot = async () => {
  try {
    return await stark.findOne({ name: bt });
  } catch (e) {
    console.log(e);
    return null;
  }
};

const updateBot = async (data) => {
  try {
    const res = await stark.updateOne({ name: bt }, data);
    return true;
  } catch (err) {
    console.log(err);
    return null;
  }
};

const userCount = async () => {
  try {
    return await stark.countDocuments();
  } catch (e) {
    console.log(e);
    return null;
  }
};

async function pendingWith(a, d, q) {
  try {
    if (q) {
      const r = await withd[a](d, q);
      return r;
    } else {
      const r = await withd[a](d);
      return r;
    }
    return true;
  } catch (err) {
    console.log(err);
    return null;
  }
}


async function clearAllUsersTasks() {
  try {
    const result = await stark.updateMany({}, { $set: { performedTasks: [] } });
    console.log(`Cleared performedTasks for ${result.modifiedCount} users.`);
    return true;
  } catch (err) {
    console.error("Error clearing performedTasks:", err);
    return null;
  }
}



module.exports = {
  connectToDatabase,
  getUser,
  addUser,
  updateUser,
  updateWith,
  getBot,
  updateBot,
  userCount,
  pendingWith,
  clearAllUsersTasks
};