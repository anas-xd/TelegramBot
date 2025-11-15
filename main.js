// MISS ﾉ尺卂 — MAIN ENGINE
require("dotenv").config();

const { Telegraf } = require("telegraf");
const fs = require("fs-extra");
const path = require("path");
const express = require("express");
const moment = require("moment-timezone");
const { execSync } = require("child_process");
const config = require("./config.json");
const { cleanTemp } = require("./helpers/cleaner"); // ⬅ YT Auto-Cleaner

// =============================
// BOT TOKEN CHECK
// =============================
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("❌ Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
global.commands = new Map();
global.pendingReplies = {}; // ⬅ Needed for YouTube reply-selection

// =============================
// LANGUAGE SYSTEM
// =============================
const LANG_DIR = path.join(__dirname, "languages");
const userLangFile = "./data/user_languages.json";
fs.ensureFileSync(userLangFile);

let userLang = {};
try {
  userLang = JSON.parse(fs.readFileSync(userLangFile, "utf8") || "{}");
} catch {
  userLang = {};
}

const saveUserLang = () =>
  fs.writeFileSync(userLangFile, JSON.stringify(userLang, null, 2));

function getLang(ctx) {
  const code = userLang[ctx.from.id] || config.language;
  try {
    return require(`./languages/${code}.lang.js`);
  } catch {
    return require(`./languages/${config.language}.lang.js`);
  }
}

// =============================
// LOAD COMMANDS + AUTO INSTALL
// =============================
function ensureInstalled(pkg) {
  try {
    require.resolve(pkg);
  } catch {
    console.log(`📦 Installing → ${pkg}`);
    execSync(`npm install ${pkg}`, { stdio: "inherit" });
  }
}

fs.readdirSync("./commands").forEach((file) => {
  if (!file.endsWith(".js")) return;

  const filePath = path.join(__dirname, "commands", file);
  const code = fs.readFileSync(filePath, "utf8");

  const reg = /require\(['"`](.*?)['"`]\)/g;
  let match;
  while ((match = reg.exec(code))) {
    const pkg = match[1];
    if (!pkg.startsWith(".")) ensureInstalled(pkg);
  }

  const cmd = require(filePath);
  if (cmd.name && typeof cmd.run === "function") {
    global.commands.set(config.prefix + cmd.name.toLowerCase(), cmd);
    console.log(`✔ Loaded: ${cmd.name}`);
  }
});

// =============================
// REACTIONS
// =============================
function react(ctx, name) {
  if (!config.reactions.enabled) return;
  ctx.react?.(config.reactions[name]).catch(() => {});
}

// =============================
// START
// =============================
bot.start((ctx) => {
  const L = getLang(ctx);
  ctx.reply(
    L.startMessage(ctx.from.first_name, config.botname, config.prefix),
    { parse_mode: "Markdown" }
  );
});

// =============================
// /lang
// =============================
bot.command("lang", (ctx) => {
  const code = ctx.message.text.split(" ")[1];
  if (!code) return ctx.reply("Available: en, bn, hi, id\nUse: /lang en");

  if (!fs.existsSync(path.join(LANG_DIR, `${code}.lang.js`)))
    return ctx.reply("❌ Language not found.");

  userLang[ctx.from.id] = code;
  saveUserLang();
  ctx.reply(getLang(ctx).languageSet.replace("%1", code));
});

// =============================
// MESSAGE HANDLER (YT REPLY SAFE)
// =============================
bot.on("text", async (ctx) => {
  // reply selection handler (YouTube search support)
  if (ctx.message.reply_to_message?.message_id) {
    const replyHandler =
      global.pendingReplies[ctx.message.reply_to_message.message_id];
    if (replyHandler) return replyHandler(ctx);
  }

  const L = getLang(ctx);
  const msg = ctx.message.text.trim().toLowerCase();

  let cmdName = "",
    args = [];

  if (msg.startsWith(config.prefix)) {
    [cmdName, ...args] = msg.slice(config.prefix.length).split(" ");
  } else {
    const first = msg.split(" ")[0];
    const cmd = global.commands.get(config.prefix + first);
    if (!cmd?.noPrefix) return;
    cmdName = first;
    args = msg.split(" ").slice(1);
  }

  const command =
    global.commands.get(config.prefix + cmdName) ||
    global.commands.get(cmdName);

  if (!command) {
    if (msg.startsWith(config.prefix))
      return ctx.reply(
        L.unknownCommand.replace("%1", cmdName) + "\n" + L.helpHint
      );
    return;
  }

  const isAdmin = config.privilegedUsers.includes(String(ctx.from.id));
  if (command.adminOnly && !isAdmin) return ctx.reply(L.noPermission);

  try {
    react(ctx, "processing");
    ctx.args = args;
    await command.run(ctx);

    cleanTemp(); // ⬅ Auto-clean after every command  
    react(ctx, "success");
  } catch (err) {
    console.log(err);
    cleanTemp();
    react(ctx, "error");
    ctx.reply(L.commandError);
  }
});

// =============================
// EXPRESS SERVER / WEBHOOK
// =============================
const app = express();
const PORT = process.env.PORT || config.connection.webhookPort || 3000;

app.get("/", (req, res) =>
  res.send(
    `MISS ﾉ尺卂 — ${moment()
      .tz(config.timezone)
      .format("YYYY-MM-DD HH:mm:ss")}`
  )
);

// =============================
// AUTO SWITCH: WEBHOOK / POLLING
// =============================
async function startBot() {
  const url = config.connection.webhookDomain;

  if (!url) {
    console.log("📡 Polling Mode Enabled");
    await bot.launch();
    return console.log("🚀 MISS ﾉ尺卂 running (Polling)");
  }

  const fullURL = url + config.connection.webhookPath;
  await bot.telegram.setWebhook(fullURL);
  app.use(bot.webhookCallback(config.connection.webhookPath));

  console.log("🔗 Webhook active:", fullURL);
  console.log("🚀 MISS ﾉ尺卂 running (Webhook)");
}

app.listen(PORT, () => console.log(`🌍 Server running on port ${PORT}`));
startBot();

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);