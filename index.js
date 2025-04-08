require("dotenv").config();
const express = require("express");
const express_session = require("express-session");
const crypto = require("crypto");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const path = require("path");
const app = express();
const { Telegraf, Scenes, session } = require("telegraf");
const { Stage, BaseScene, WizardScene } = Scenes;
const bot = new Telegraf(process.env.BOT_TOKEN);
const stage = new Stage();
const {
  connectToDatabase,
  addUser,
  getUser,
  updateUser,
  updateWith,
  getBot,
  updateBot,
  userCount,
  pendingWith,
  clearAllUsersTasks,
} = require("./db/db");
const tasks = require("./tasks.json");
const weburl = process.env.WEB_URL;

const waitingForads = {};

connectToDatabase()
  .then()
  .catch(async (err) => {
    console.log("Error connecting to database");
    console.log(err);
    process.exit(1);
  });

async function generateWallet(u) {
  try {
    const res = await axios.post(
      "https://api.oxapay.com/merchants/request/staticaddress",
      {
        merchant: process.env.MERCHANT_KEY,
        currency: "TRX",
        network: "TRON TRC20",
        callbackUrl: `${weburl}/paidio?userId=${u}`,
      }
    );

    let generatedAddress = res.data.address;
    let stat = res.data.result;

    if (stat == "100") {
      return generatedAddress;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error generating address:", error);
    return null;
  }
}

bot.use(session());
bot.use(stage.middleware());

bot.start(async (ctx) => {
  await ctx.replyWithPhoto(
    {
      source: "public/img/logo.JPG",
    },
    {
      caption: `
👋🏻 Welcome to <b>ADSTradeX Official Bot!</b>

We will keep this simple

<i>You can promote apps, links, files, images, videos, anything permitted by Telegram.</i>

Your ads will only be available for 24 hours

HAVE FUN!!! 😊
        `,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🔗 Get Started",
              web_app: {
                url: weburl,
              },
            },
          ],
        ],
      },
    }
  );

  const userId = ctx.from.id;
  const u = await getUser(userId);

  if (u) {
    return;
  }

  const link = Number(ctx.message.text.split(" ")[1]);
  let upline = false;

  if (link && !isNaN(link) && link != userId) {
    upline = link;
  }

  const address = await generateWallet(userId);

  if (!address) {
    return ctx.reply("Error generating deposit address for user");
  }

  let userData = {
    tg_id: userId,
    mainBalance: 0,
    bonusBalance: 0,
    totalDeposit: 0,
    lastBonusTime: 0,
    totalDeposit: 0,
    totalWithdraw: 0,
    depositHistory: [],
    withdrawHistory: [],
    upline: upline,
    referral: 0,
    refEarnings: 0,
    address,
    downlines: [],
    performedTasks: [],
    canWithdraw: true,
    ban: false,
    premium: false,
    status: "Active",
  };

  await addUser(userData);

  console.log("User added to db!");

  if (upline) {
    const up = await getUser(Number(upline));

    if (!up || up.premium !== true) return;

    const bott = await getBot();
    const rb = bott.refer_bonus;

    try {
      await updateUser(Number(upline), {
        $inc: {
          referral: 1,
        },
        $push: {
          downlines: {
            id: userId,
            name: ctx.from.first_name || ctx.from.last_name,
            reward: rb,
            status: "unpaid",
          },
        },
      });
      await ctx.telegram.sendMessage(
        upline,
        `💰 <b>Congratulations</b>, you just got a new referral.`,
        {
          parse_mode: "HTML",
        }
      );
    } catch (e) {}
  }
});

// validate admin

const validAdmin = (ctx, next) => {
  if (ctx.from.id == process.env.ADMIN) {
    next();
    return;
  }
  ctx.reply("You are not authorized to use this command");
};

bot.hears("/Panel", validAdmin, async (ctx) => {
  const user_count = await userCount();

  const txt = `
Welcome ${ctx.from.first_name} to Admin Panel!
  
Total Users : ${user_count} 
  
Here you can edit most of settings of the Bot.
  `;

  ctx.replyWithHTML(txt, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🔊Send Broadcast",
            callback_data: "/broadcast",
          },
        ],
        [
          {
            text: "💶 Add Ads bal",
            callback_data: "/addbal_1",
          },
          {
            text: "💶 Add Bonus bal",
            callback_data: "/addbal_2",
          },
        ],
        [
          {
            text: "📳 Notification Channel",
            callback_data: "/notchan",
          },
        ],
        [
          {
            text: "⛔️ Ban User",
            callback_data: "/ban",
          },
          {
            text: "✅ Unban User",
            callback_data: "/unban",
          },
        ],
        [
          {
            text: "🎁 Ref bonus",
            callback_data: "/refbonus",
          },
          {
            text: "🧳 Check balance",
            callback_data: "/checkbal",
          },
        ],
        [
          {
            text: "🧮 Minimum Ads buy",
            callback_data: "/minads",
          },
        ],
        [
          {
            text: "➖ Remove Ads bal",
            callback_data: "/removebal_1",
          },
        ],
        [
          {
            text: "➖ Remove bonus bal",
            callback_data: "/removebal_2",
          },
        ],
        [
          {
            text: "💰 Upgrade Price",
            callback_data: "/upgrade_price",
          },
          {
            text: "🔎 Find user",
            callback_data: "/finduser",
          },
        ],
        [
          {
            text: "⏳ Set Withdrawal Status",
            callback_data: "/withstat",
          },
        ],
      ],
    },
  });
});

bot.action("/broadcast", validAdmin, async (ctx) => {
  ctx.answerCbQuery();
  await ctx.reply("Wait fetching all user in the database...");
  const all_users = await starkNilX
    .aggregate([
      { $match: { status: "Active" } },
      { $project: { _id: 0, userId: 1 } },
      { $group: { _id: null, userIds: { $push: "$tg_id" } } },
      { $project: { _id: 0, userIds: 1 } },
    ])
    .toArray();

  let all_user = all_users.length > 0 ? all_users[0].userIds : [];

  const inactive_user = await starkNilX
    .aggregate([
      { $match: { status: "inactive" } },
      { $count: "inactiveUserCount" },
    ])
    .next();
  let inactiveUser = 0;
  if (inactive_user) {
    inactiveUser = inactive_user.inactiveUserCount;
  } else {
    inactiveUser = 0;
  }

  await ctx.replyWithHTML(
    "<b>All User Fetched Successfully</b>\n" +
      (all_user.length + inactiveUser) +
      " Users\n" +
      all_user.length +
      " Active User(s)\n" +
      inactiveUser +
      " Inactive User(s)"
  );
  const broad = new BaseScene("broad");
  broad.enter((ctx) => {
    ctx.reply("Enter the message you want to send");
  });
  broad.use(async (ctx) => {
    await ctx.scene.leave();
    await ctx.reply("Broadcasting message to all users...");
    let sucs = 0;
    let failed = 0;
    const MESSAGE_RATE_LIMIT = 30;

    const sendMessage = async (chatId) => {
      try {
        await ctx.telegram.copyMessage(
          chatId,
          ctx.chat.id,
          ctx.message.message_id
        );
        sucs++;
      } catch (error) {
        failed++;
        console.error(`Error: ${error.message}`);
      }
    };

    const limiter = new Bottleneck({
      minTime: 1000 / MESSAGE_RATE_LIMIT,
      maxConcurrent: 1,
    });

    const processMessages = async (userIds) => {
      const promises = userIds.map((userId) =>
        limiter.schedule(() => sendMessage(userId))
      );
      await Promise.all(promises);
    };

    processMessages(all_user)
      .then(() => {
        ctx.replyWithHTML(
          `<b>🔊 Broadcast Completed Successfully\n\n✅ Successful:</b> ${sucs} User(s)\n<b>⛔️ Failed:</b> ${failed} User(s)`
        );
        console.log("All messages have been sent.");
      })
      .catch((error) => {
        console.error(`Failed to send messages: ${error.message}`);
      });
  });
  stage.register(broad);
  ctx.scene.enter("broad");
});

bot.action(/\/addbal_(.+)/, validAdmin, async (ctx) => {
  ctx.answerCbQuery();
  let userId;
  const ttt = ctx.match[1];
  const text = new WizardScene(
    "addbal",
    async (ctx) => {
      await ctx.reply("Send the user id to add balance");
      return ctx.wizard.next();
    },
    async (ctx) => {
      userId = ctx.message.text;
      const user = await getUser(parseFloat(userId));
      if (!user) {
        return ctx.reply("User not found");
      }
      await ctx.reply("Send the amount to add");
      return ctx.wizard.next();
    },
    async (ctx) => {
      const amount = parseFloat(ctx.message.text);

      if (ttt == 1) {
        await updateUser(parseFloat(userId), { $inc: { mainBalance: amount } });
        ctx.telegram.sendMessage(
          userId,
          "Your Ads balance has been credited with " + amount
        );
      } else if (ttt == 2) {
        await updateUser(parseFloat(userId), {
          $inc: { bonusBalance: amount },
        });
        ctx.telegram.sendMessage(
          userId,
          "Your bonus balance has been credited with " + amount
        );
      }

      ctx.reply("Balance added successfully");
      return ctx.scene.leave();
    }
  );

  stage.register(text);
  ctx.scene.enter("addbal");
});

bot.action("/notchan", validAdmin, async (ctx) => {
  ctx.answerCbQuery();
  const text = new BaseScene("text");
  text.enter((ctx) =>
    ctx.reply("Please send the channel username to set as notification channel")
  );
  text.on("text", async (ctx) => {
    await ctx.scene.leave();
    const txt = ctx.message.text;
    try {
      const channel = await ctx.telegram.getChat(txt);

      await updateBot({ $set: { notification_channel: txt } });

      ctx.reply("Notification channel set successfully");
    } catch (err) {
      return ctx.reply("Invalid channel username");
    }
  });
  stage.register(text);
  ctx.scene.enter("text");
});

bot.action("/ban", validAdmin, async (ctx) => {
  ctx.answerCbQuery();
  const banScene = new BaseScene("ban");
  banScene.enter((ctx) => ctx.reply("Please send the user id to ban"));
  banScene.on("text", async (ctx) => {
    await ctx.scene.leave();
    const userId = ctx.message.text;

    const user = await getUser(parseFloat(userId));
    if (!user) {
      return ctx.reply("User not found");
    }
    await updateUser(parseFloat(userId), { $set: { ban: true } });
    ctx.reply("User banned successfully");
  });

  stage.register(banScene);
  ctx.scene.enter("ban");
});

bot.action("/unban", validAdmin, async (ctx) => {
  ctx.answerCbQuery();
  const banScene = new BaseScene("unban");
  banScene.enter((ctx) => ctx.reply("Please send the user id to unban"));
  banScene.on("text", async (ctx) => {
    await ctx.scene.leave();
    const userId = ctx.message.text;

    const user = await getUser(parseFloat(userId));
    if (!user) {
      return ctx.reply("User not found");
    }
    await updateUser(parseFloat(userId), { $set: { ban: false } });
    ctx.reply("User unbanned successfully");
  });
  stage.register(banScene);
  ctx.scene.enter("unban");
});

bot.action("/refbonus", validAdmin, async (ctx) => {
  ctx.answerCbQuery();
  const text = new BaseScene("text");
  text.enter((ctx) => ctx.reply("Send refer bonus for every upline"));
  text.on("text", async (ctx) => {
    await ctx.scene.leave();
    const txt = ctx.message.text;
    await updateBot({ $set: { refer_bonus: Number(txt) } });
    ctx.reply("Referral bonus set to " + txt);
  });
  stage.register(text);
  ctx.scene.enter("text");
});

bot.action("/minads", validAdmin, async (ctx) => {
  ctx.answerCbQuery();
  const text = new BaseScene("text");
  text.enter((ctx) => ctx.reply("Send minimum ads buy"));
  text.on("text", async (ctx) => {
    await ctx.scene.leave();
    const txt = ctx.message.text;
    await updateBot({ $set: { ads_price: Number(txt) } });
    ctx.reply("Per ads price set to " + txt);
  });
  stage.register(text);
  ctx.scene.enter("text");
});

bot.action("/checkbal", validAdmin, async (ctx) => {
  ctx.answerCbQuery();
  const text = new BaseScene("text");
  text.enter((ctx) => ctx.reply("Send the user id to check balance"));
  text.on("text", async (ctx) => {
    await ctx.scene.leave();
    const txt = ctx.message.text;
    const user = await getUser(parseFloat(txt));
    if (!user) {
      return ctx.reply("User not found");
    }
    ctx.reply(
      "Balance of " +
        txt +
        "\n\nAds Balance: " +
        user.mainBalance +
        "\nBonus Balance: " +
        user.bonusBalance
    );
  });
  stage.register(text);
  ctx.scene.enter("text");
});

bot.action(/\/removebal_(.+)/, validAdmin, async (ctx) => {
  ctx.answerCbQuery();
  let userId;
  const ttt = ctx.match[1];
  const text = new WizardScene(
    "rembal",
    async (ctx) => {
      await ctx.reply("Send the user id to remove balance");
      return ctx.wizard.next();
    },
    async (ctx) => {
      userId = ctx.message.text;
      const user = await getUser(parseFloat(userId));
      if (!user) {
        ctx.scene.leave();
        return ctx.reply("User not found");
      }
      await ctx.reply("Send the amount to remove");
      return ctx.wizard.next();
    },
    async (ctx) => {
      const amount = parseFloat(ctx.message.text);

      if (ttt == 1) {
        await updateUser(parseFloat(userId), {
          $inc: { mainBalance: -amount },
        });
        ctx.telegram.sendMessage(
          userId,
          "Your ads balance has been deducted by " + amount
        );
      } else if (ttt == 2) {
        await updateUser(parseFloat(userId), {
          $inc: { bonusBalance: -amount },
        });
        ctx.telegram.sendMessage(
          userId,
          "your bonus balance has been deducted by " + amount
        );
      }

      ctx.reply("Balance removed successfully");
      return ctx.scene.leave();
    }
  );

  stage.register(text);
  ctx.scene.enter("rembal");
});

bot.action("/upgrade_price", validAdmin, async (ctx) => {
  ctx.answerCbQuery();
  const text = new BaseScene("text");
  text.enter((ctx) => ctx.reply("Send upgrade price TRX"));
  text.on("text", async (ctx) => {
    await ctx.scene.leave();
    const txt = ctx.message.text;
    await updateBot({ $set: { upgrade_price: Number(txt) } });
    ctx.reply("Price to upgrade set to " + txt);
  });
  stage.register(text);
  ctx.scene.enter("text");
});

bot.action("/finduser", validAdmin, async (ctx) => {
  ctx.answerCbQuery();
  const text = new BaseScene("text");
  text.enter((ctx) => ctx.reply("Send the user id to find"));
  text.on("text", async (ctx) => {
    await ctx.scene.leave();
    const txt = ctx.message.text;
    const user = await getUser(parseFloat(txt));
    if (!user) {
      return ctx.reply("User not found");
    }
    await ctx.reply("User found successfully");
    ctx.reply(
      "User id: " +
        user.tg_id +
        "\nBalance: " +
        user.mainBalance +
        "\nRefer count: " +
        user.referral +
        "\nBan Status: " +
        user.ban
    );
  });
  stage.register(text);
  ctx.scene.enter("text");
});

bot.action("/withstat", (ctx) => {
  ctx.reply("select one to set a withdrawal status", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "✅ Auto",
            callback_data: "/withh_auto",
          },
          {
            text: "⏳ Manual",
            callback_data: "/withh_manual",
          },
        ],
        [
          {
            text: "⛔️ Disable Withdrawal",
            callback_data: "/withh_disabled",
          },
        ],
      ],
    },
  });
});

bot.action(/\/withh_(.+)/, validAdmin, async (ctx) => {
  ctx.answerCbQuery();
  const ttt = ctx.match[1];
  await updateBot({
    $set: {
      withdrawal: ttt,
    },
  });
  ctx.reply("Withdrawal status updated: " + ttt);
});

// Admin Withdraw

bot.action(/\/paid_(.+)/, async (ctx) => {
  ctx.answerCbQuery();
  const withdrawId = parseInt(ctx.match[1]);
  const withdraw = await pendingWith("findOne", { id: withdrawId });
  if (!withdraw) {
    return ctx.reply("Withdrawal not found.");
  }

  if (withdraw.status !== "Pending") {
    return ctx.reply("Withdrawal already approved or declined.");
  }

  await pendingWith(
    "updateOne",
    { id: withdrawId },
    { $set: { status: "Successful" } }
  );

  await updateWith(
    { tg_id: Number(withdraw.user), "withdrawHistory.id": withdrawId },
    { $set: { "withdrawHistory.$.status": "Successful" } }
  );

  await ctx.reply("Withdrawal approved and its now completed.");
  await ctx.telegram.sendMessage(
    withdraw.user,
    "Your withdrawal id <code> #" +
      withdrawId +
      "</code> of <b>" +
      withdraw.amount +
      " TRX</b> has been approved and completed.",
    {
      parse_mode: "HTML",
    }
  );
});

bot.action(/\/decline_(.+)/, async (ctx) => {
  ctx.answerCbQuery();
  const withdrawId = parseInt(ctx.match[1]);
  const withdraw = await pendingWith("findOne", { id: withdrawId });
  if (!withdraw) {
    return ctx.reply("Withdrawal not found.");
  }

  if (withdraw.status !== "Pending") {
    return ctx.reply("Withdrawal already approved or declined.");
  }

  await pendingWith(
    "updateOne",
    { id: withdrawId },
    { $set: { status: "Refunded" } }
  );
  await updateUser(parseInt(withdraw.user), {
    $inc: { mainBalance: parseInt(withdraw.amount) },
  });

  await updateWith(
    { tg_id: Number(withdraw.user), "withdrawHistory.id": withdrawId },
    { $set: { "withdrawHistory.$.status": "Refunded" } }
  );

  await ctx.reply(
    "Withdrawal declined and " +
      withdraw.amount +
      " TRX has been refunded to the user."
  );
  await ctx.telegram.sendMessage(
    withdraw.user,
    "Your withdrawal id <code> #" +
      withdrawId +
      "</code> of <b>" +
      withdraw.amount +
      " TRX</b> has been declined and <b>" +
      withdraw.amount +
      " TRX</b> has been refunded to your account.",
    {
      parse_mode: "HTML",
    }
  );
});

// Post ADS

bot.use(async (ctx) => {
  const userId = ctx.from.id;

  if (ctx.chat.type != "private") return;
  if (!waitingForads[userId]) return;
  delete waitingForads[userId];

  const bott = await getBot();
  const minWith = bott.ads_price;
  const chan = bott.notification_channel;

  if (minWith == false) {
    return ctx.reply("Sorry, ads price has not been set by admin");
  }

  if (chan == false) {
    return ctx.reply("Sorry, notification channel has not been set by admin");
  }

  const user = await getUser(userId);
  if (!user) {
    return ctx.reply(
      "You are not registered in the database. Please use /start to register."
    );
  }

  const bal = user.mainBalance;
  const can = user.ban;

  if (can === true) {
    return ctx.reply("You are banned from placing ads in the bot");
  }
  if (bal < minWith) {
    return ctx.reply(
      "To post ads you need to have at least " +
        minWith +
        " TRX (TRON TRC20) in your balance"
    );
  }

  await updateUser(userId, { $inc: { mainBalance: -minWith } });

  const idd = await ctx.telegram.copyMessage(
    chan,
    userId,
    ctx.message.message_id
  );

  ctx.reply("Ads Posted Successfully");

  setTimeout(() => {
    try {
      ctx.telegram.deleteMessage(chan, idd.message_id);
      ctx.reply("Your ads has expired");
    } catch (err) {
      return;
    }
  }, 24 * 60 * 60 * 1000);

  const upline = user.upline;
  if (upline) {
    const up = await getUser(Number(upline));

    if (!up || up.premium !== true) return;

    let rb = minWith * 0.2;

    await updateUser(Number(upline), {
      $inc: {
        mainBalance: rb,
        refEarnings: rb,
      },
    });

    await bot.telegram.sendMessage(
      upline,
      "You just got 20% of " + minWith + " posted by one of your referrals!"
    );
  }
});

// Site start

app.use(
  express_session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);
app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/validate-user", async (req, res) => {
  try {
    
    const { initData, initDataUnsafe } = req.body.data;

    if (
      !initData ||
      !initDataUnsafe ||
      Object.keys(initDataUnsafe).length === 0
    ) {
      console.log("Invalid request: Missing initData or initDataUnsafe");
      return res
        .status(400)
        .json({ error: "Invalid request: Missing initData or initDataUnsafe" });
    }

    const { query_id, user, auth_date, hash } = initDataUnsafe;

    if (!query_id || !user || !auth_date || !hash) {
      console.log("Invalid request: Missing required fields in initDataUnsafe");
      return res
        .status(400)
        .json({ error: "Invalid request: Missing required fields" });
    }

    const authDateTimestamp = parseInt(auth_date, 10);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const maxAge = 24 * 60 * 60;
    if (currentTimestamp - authDateTimestamp > maxAge) {
      console.log("Invalid request: auth_date is too old");
      return res
        .status(403)
        .json({ error: "Invalid request: auth_date is too old" });
    }

    const init = new URLSearchParams(initData);
    const hashh = init.get("hash");
    init.delete("hash");

    const dataToCheck = [...init.entries()]
      .map(([key, value]) => `${key}=${decodeURIComponent(value)}`)
      .sort()
      .join("\n");

    const secret = crypto
      .createHmac("sha256", "WebAppData")
      .update(process.env.BOT_TOKEN)
      .digest();

    const calculatedHash = crypto
      .createHmac("sha256", secret)
      .update(dataToCheck)
      .digest("hex");

    if (calculatedHash !== hashh) {
      console.log("Invalid user data: Hash verification failed");
      return res
        .status(403)
        .json({ error: "Invalid user data: Hash verification failed" });
    }

    //let user = { id: 7911459703 };
    console.log("User validated successfully");

    let amm = await getBot();
    am = amm.upgrade_price;

    if (!am) {
      console.log("Upgrade price not set");
      return res
        .status(403)
        .json({ error: "Invalid upgrade data: price not found!" });
    }

    let userData = await getUser(user.id);

    if (!userData) {
      console.log("Invalid user: Not found in db.");
      return res
        .status(403)
        .json({ error: "Invalid user data: not found in db!" });
    }

    userData.profilePic = user.photo_url;
    userData.username = user.first_name || user.last_name;
    userData.refLink = userData.premium
      ? `${process.env.BOT_LINK}?start=${userData.tg_id}`
      : "Upgrade to premium to get your referral link!";
    userData.upgrade_price = am;

    delete userData._id;
    delete userData.tg_id;

    const setTasks = tasks.tasks.map((t) => {
      if (userData.performedTasks.includes(t.id)) {
        t.type = "completed";
      }
      return t;
    });

    userData.tasks = setTasks || [];
    userData.refP = amm.refer_bonus;

    req.session.user = user.id;
    res.status(200).json(userData);
  } catch (err) {
    console.error("An error occurred:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/task/:id", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Invalid user" });
  }

  const taskId = req.params.id;
  const user = await getUser(req.session.user);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (!user.premium) {
    console.log("Not a premium user");
    return res.status(403).json({
      error: "Tasks available to premium user only",
    });
  }

  const allTasks = tasks.tasks;
  const performedTasks = user.performedTasks || [];

  if (performedTasks.includes(taskId)) {
    return res.status(403).json({ error: "Task already performed" });
  }

  const task = allTasks.find((t) => t.id == taskId);

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  return res.json({ url: task.url });
});

app.post("/perform-task/:id", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Invalid user" });
  }

  const taskId = req.params.id;
  const user = await getUser(req.session.user);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (!user.premium) {
    console.log("Not a premium user");
    return res.status(403).json({
      error: "Tasks available to premium user only",
    });
  }

  const allTasks = tasks.tasks;
  const performedTasks = user.performedTasks || [];

  if (performedTasks.includes(taskId)) {
    return res.status(403).json({ error: "Task already performed" });
  }

  const task = allTasks.find((t) => t.id == taskId);

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  const { reward, id, _for } = task;

  if (_for) {
    try {
      console.log(`checking user ${user.tg_id} in @${_for}`);
      const joined = await bot.telegram.getChatMember(_for, user.tg_id);
      console.log(joined);
      if (joined.status == "left") {
        return res.status(500).json({ error: "Join the channel to continue" });
      }
    } catch (error) {
      console.log(error);
      return res.status(500).json({ error: "Internal server Error" });
    }
  }

  await updateUser(user.tg_id, {
    $inc: {
      mainBalance: Number(reward),
    },
    $push: {
      performedTasks: id,
    },
  });

  return res.json({ reward });
});

app.post("/claim", async (req, res) => {
  const userId = Number(req.session.user);

  if (!userId) {
    console.log("Invalid user");
    return res.json({
      suc: false,
      error: "Invalid user",
    });
  }
  let userdata = await getUser(userId);

  if (!userdata) {
    console.log("User not in database");
    return res.json({
      suc: false,
      error: "User not in database",
    });
  }

  if (!userdata.premium) {
    console.log("Not a premium user");
    return res.json({
      suc: false,
      error: "Bonus available to premium user only",
    });
  }

  let bonus = 10;

  const { lastBonusTime } = userdata;

  const currentTime = Date.now();
  const timeElapsed = currentTime - (lastBonusTime || 0);
  const claimInterval = 1 * 60 * 60 * 1000;

  if (timeElapsed < claimInterval) {
    console.log("Not yet time to claim");
    return res.json({
      suc: false,
      error: "Not yet time to claim",
    });
  }

  await updateUser(userId, {
    $set: {
      lastBonusTime: Date.now(),
    },
    $inc: {
      mainBalance: bonus,
    },
  });

  console.log("claim " + bonus + " for " + userId);

  res.json({
    suc: true,
    ll: Date.now(),
    bonus,
  });

  await bot.telegram.sendMessage(
    userId,
    "<b>🎉 Congratulations!</b>, you received daily bonus of " + bonus + "TRX!",
    { parse_mode: "HTML" }
  );

  return;
});

app.post("/paidio", async (req, res) => {
  let u = Number(req.query.userId);

  const deals = req.body;

  if (!u) {
    res.status(400).send("Invalid user.");
    console.log("invalid user");
    return;
  }

  if (!deals) {
    res.status(400).send("Missing userId or deals in request.");
    console.log("missing id or data");
    return;
  }

  res.status(200).send("Webhook received successfully.");
  console.log("Received data of " + u);

  const user = await getUser(u);

  if (!user) {
    console.log("Can't find user " + user);
    return;
  }

  let { status, txID, amount } = deals;

  amount = parseFloat(amount);

  if (!amount || !txID || !status) {
    console.log("Incorrect datas");
    return;
  }

  if (status === "Confirming") {
    if (u) {
      await bot.telegram.sendMessage(
        u,
        `📥<b> You have an incoming deposit of ${amount} TRX</b>\n\n⌛️ <i>Confirmed  1/3...</i>`,
        {
          parse_mode: "HTML",
        }
      );
    }
    return;
  }

  if (status === "Paid") {
    if (amount < 0) {
      if (u) {
        await bot.telegram.sendMessage(
          u,
          `📥 You have deposited ${amount} TRX which is less than the minimum deposit`
        );
        return;
      }
    }

    await updateUser(u, {
      $inc: {
        mainBalance: Number(amount),
        totalDeposit: Number(amount),
      },
      $push: {
        depositHistory: {
          date: Date.now(),
          amount,
          status: "Successful",
        },
      },
    });

    await bot.telegram.sendMessage(u, `📥 You have deposited ${amount} TRX`);

    await bot.telegram.sendMessage(
      process.env.ADMIN,
      `
<b>⭐️ TRX Deposit Confirmed
  
USERID:</b> ${u}
<b>DEPOSITED AMOUNT:</b> ${amount} TRX

<i>Your USDT deposit is now active and earning! View your transaction here:
<a href="https://TRON TRC20scan.org/transaction/#/${txID}">${txID}</a></i>
`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }
    );

    console.log("done");
  } else {
    console.log("Status != paid");
  }
});

app.post("/withdraw", async (req, res) => {
  try {
    const { amount, walletAddress } = req.body;
    console.log(req.body);

    const userId = req.session.user;
    if (!userId) {
      console.log("Invalid user id");
      return res.status(401).json({ suc: false, message: "Invalid user ID" });
    }

    const userdata = await getUser(userId);
    if (!userdata) {
      console.log("User not found in the database");
      return res.status(404).json({ suc: false, message: "User not found" });
    }

    if (!walletAddress) {
      return res
        .status(400)
        .json({ suc: false, message: "Please input a valid wallet address!" });
    }

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ suc: false, message: "Invalid withdrawal amount." });
    }

    if (amount < 5) {
      return res
        .status(400)
        .json({ suc: false, message: "Minimum withdrawal is 5 TRX." });
    }

    if (amount > userdata.mainBalance) {
      return res
        .status(400)
        .json({ suc: false, message: "Withdrawal amount exceeds balance." });
    }

    const bott = await getBot();
    if (!bott) {
      return res.status(500).json({
        suc: false,
        message: "Something went wrong. Please try again later.",
      });
    }

    if (bott.withdrawal === "disabled") {
      return res
        .status(403)
        .json({ suc: false, error: "Withdrawal is currently disabled." });
    }

    async function u(status, id) {
      try {
        await updateUser(userId, {
          $inc: { mainBalance: -Number(amount), totalWithdraw: Number(amount) },
          $push: { withdrawHistory: { date: Date.now(), amount, status, id } },
        });
      } catch (e) {
        console.error("Error updating user:", e);
      }
    }

    async function send(_to, m) {
      try {
        await bot.telegram.sendMessage(_to, m, { parse_mode: "HTML" });
      } catch (e) {
        console.error("Error sending Telegram message:", e);
      }
    }

    if (bott.withdrawal === "auto") {

      const url = "https://api.oxapay.com/api/send";
      const data = {
        key: process.env.PAYOUT_API_KEY,
        address: walletAddress,
        amount,
        currency: "TRX",
        network: "TRC20",
        callbackUrl: "https://example.com/callback",
      };

      const response = await axios.post(url, data);
      console.log(response.data);

      if (response.data.result != "100") {
        throw new Error("Withdrawal request failed.");
      }

      await u("Successful");

      await send(
        userdata.tg_id,
        `
          💰 <b>Withdrawal paid\n\n💰 Amount:</b> ${amount} USDT\n<b>📟 Status:</b> <code>Successful</code>`
      );

      await send(
        process.env.ADMIN,
        `
          💰<b>New Withdrawal Paid\n\n💸 Amount:</b> ${amount} USDT\n👤 <b>User:</b> ${userId}\n<b>🤑 Address</b>: <code>${walletAddress}</code>`
      );
    } else {
      const withdrawId = Math.floor(Math.random() * 9000000000) + 1000000000;

      await pendingWith("insertOne", {
        id: withdrawId,
        amount: amount,
        wallet: walletAddress,
        status: "Pending",
        user: userId,
      });

      await u("Pending", withdrawId);

      await send(
        userdata.tg_id,
        `
💰 <b>Withdrawal pending\n\n💰 Amount:</b> ${amount} USDT\n<b>📟 Status:</b> <code>Pending</code>`
      );

      await bot.telegram.sendMessage(
        process.env.ADMIN,
        `
<b>✅ #NEW_WITHDRAWAL_REQUESTED
            
🆔 <b>UserId:</b> <code>${userId}</code>
👤 UserLink:</b> <a href="tg://user?id=${userId}">${userId}</a>
💼 <b>Wallet:</b> <code>${walletAddress}</code>
💶 <b>Amount:</b> ${amount} TRX
⏳ <b>Status:</b> <i>pending...</i>
`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Paid",
                  callback_data: "/paid_" + withdrawId,
                },
                {
                  text: "⛔️ Decline",
                  callback_data: "/decline_" + withdrawId,
                },
              ],
            ],
          },
        }
      );
    }

    res.status(200).json({
      suc: true,
      message: "Withdrawal has been submitted successfully!",
    });
  } catch (error) {
    console.error("Withdrawal error:", error.response?.data || error.message);

    res.status(error.response?.status || 500).json({
      suc: false,
      error: "Withdrawal failed. Please try again later.",
    });
  }
});

app.post("/subs", async (req, res) => {
  const userId = req.session.user;

  console.log(req.session)

  if (!userId) {
    console.log("Invalid user id");
    return res.json({
      suc: false,
      message: "Invalid user ID",
    });
  }

  const userdata = await getUser(userId);

  if (!userdata) {
    console.log("User not found in the database");
    return res.json({
      suc: false,
      message: "User not found",
    });
  }

  let am = await getBot();
  am = am.upgrade_price;

  if (!am) {
    console.log("Upgrade price not set in the database");
    return res.json({
      suc: false,
      message: "Upgrade Price Error",
    });
  }

  if (userdata.mainBalance < am) {
    return res.json({
      suc: false,
      message: "Not enough balance to upgrade, need " + am + " TRX",
    });
  }

  try {
    await updateUser(userId, {
      $inc: {
        mainBalance: -am,
      },
      $set: {
        premium: true,
      },
    });

    await bot.telegram.sendMessage(
      userdata.tg_id,
      `✅ <b>Upgrade Successful</b>`,
      {
        parse_mode: "HTML",
      }
    );

    await bot.telegram.sendMessage(
      process.env.ADMIN,
      `💰<b>New User Upgrade\n\n💸 Amount:</b> ${am} TRX\n👤 <b>User:</b> ${userId}`,
      {
        parse_mode: "HTML",
      }
    );

    res.json({
      suc: true,
      message: "✅ Upgrade Successful!",
    });

    const upline = userdata.upline;
    if (upline) {
      const up = await getUser(Number(upline));

      if (!up || up.premium !== true) return;

      const bott = await getBot();
      const rb = bott.refer_bonus;

      await updateUser(Number(upline), {
        $inc: {
          mainBalance: rb,
          refEarnings: rb,
        },
      });

      await updateWith(
        {
          "downlines.id": userdata.tg_id,
        },
        {
          $set: {
            "downlines.$[element].status": "paid",
          },
        },
        {
          arrayFilters: [
            {
              "element.id": userdata.tg_id,
            },
          ],
        }
      );

      await bot.telegram.sendMessage(
        upline,
        `💰 <b>Congratulations</b>, you just got ${rb} TRX for a new referral upgrade.`,
        {
          parse_mode: "HTML",
        }
      );
    }
  } catch (error) {
    res.json({
      suc: false,
      message: "Upgrade failed. Please try again later.",
    });

    console.error(error.response?.data || error.message);
    return;
  }
});

app.post("/create-ad", async (req, res) => {
  const userId = req.session.user;

  if (!userId) {
    console.log("Invalid user id");
    return res.json({
      suc: false,
      message: "Invalid user ID",
    });
  }

  const userdata = await getUser(userId);

  if (!userdata) {
    console.log("User not found in the database");
    return res.json({
      suc: false,
      message: "User not found",
    });
  }

  try {
    await bot.telegram.sendMessage(
      userdata.tg_id,
      `
<b>Please send your ad text

⛔️ NOTE:</b> Only 1 image is accepted. If you send 2 images you will be charged 2 times, and more if you add more images
`,
      {
        parse_mode: "HTML",
      }
    );

    waitingForads[userId] = true;

    res.json({
      suc: true,
    });
  } catch (error) {
    res.json({
      suc: false,
    });

    console.error(error.response?.data || error.message);
    return;
  }
});

setInterval(async () => {
  await clearAllUsersTasks();
}, 60 * 60 * 1000);

bot.launch({ dropPendingUpdates: true });

const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
