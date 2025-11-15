// MISS ﾉ尺卂 — MAIN ENGINE
require("dotenv").config();

const { Telegraf } = require("telegraf");
const fs = require("fs-extra");
const path = require("path");
const express = require("express");
const moment = require("moment-timezone");
const { execSync } = require("child_process");
const config = require("./config.json");

// Token check
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
global.commands = new Map();

// User languages
const LANG_DIR = path.join(__dirname, "languages");
const userLangFile = "./data/user_languages.json";
fs.ensureFileSync(userLangFile);

let userLang = {};
try {
  userLang = JSON.parse(fs.readFileSync(userLangFile, "utf8") || "{}");
} catch {
  userLang = {};
}

function saveUserLang() {
  fs.writeFileSync(userLangFile, JSON.stringify(userLang, null, 2));
}

function getLang(ctx) {
  const code = userLang[ctx.from.id] || config.language;
  try {
    return require(`./languages/${code}.lang.js`);
  } catch {
    return require(`./languages/${config.language}.lang.js`);
  }
}

// Auto-install deps
function ensureInstalled(pkg) {
  try {
    require.resolve(pkg);
  } catch {
    console.log(`Installing: ${pkg}`);
    execSync(`npm install ${pkg}`, { stdio: "inherit" });
  }
}

// Load commands
fs.readdirSync("./commands").forEach((f) => {
  if (!f.endsWith(".js")) return;
  const filePath = path.join(__dirname, "commands", f);
  const code = fs.readFileSync(filePath, "utf8");
  const reg = /require\(['"`](.*?)['"`]\)/g;

  let m;
  while ((m = reg.exec(code))) {
    const pkg = m[1];
    if (!pkg.startsWith(".")) ensureInstalled(pkg);
  }

  const cmd = require(filePath);
  if (cmd.name && typeof cmd.run === "function") {
    global.commands.set(config.prefix + cmd.name.toLowerCase(), cmd);
    console.log(`Loaded: ${cmd.name}`);
  }
});

// Reactions
function react(ctx, type) {
  if (!config.reactions.enabled) return;
  ctx.react?.(config.reactions[type]).catch(() => {});
}

// /start
bot.start((ctx) => {
  const L = getLang(ctx);
  ctx.reply(L.startMessage(ctx.from.first_name, config.botname, config.prefix), {
    parse_mode: "Markdown",
  });
});

// /lang
bot.command("lang", (ctx) => {
  const code = ctx.message.text.split(" ")[1];
  if (!code) return ctx.reply("Use: /lang en");

  if (!fs.existsSync(path.join(LANG_DIR, `${code}.lang.js`)))
    return ctx.reply("Language not found");

  userLang[ctx.from.id] = code;
  saveUserLang();
  ctx.reply(getLang(ctx).languageSet.replace("%1", code));
});

// Text handler
bot.on("text", async (ctx) => {
  const L = getLang(ctx);
  const txt = ctx.message.text.trim().toLowerCase();

  let cmdName = "",
    args = [];

  if (txt.startsWith(config.prefix)) {
    [cmdName, ...args] = txt.slice(config.prefix.length).split(" ");
  } else {
    const first = txt.split(" ")[0];
    const cmd = global.commands.get(config.prefix + first);
    if (!cmd?.noPrefix) return;
    cmdName = first;
    args = txt.split(" ").slice(1);
  }

  const command =
    global.commands.get(config.prefix + cmdName) ||
    global.commands.get(cmdName);

  if (!command) {
    if (txt.startsWith(config.prefix))
      return ctx.reply(L.unknownCommand.replace("%1", cmdName) + "\n" + L.helpHint);
    return;
  }

  const isAdmin = config.privilegedUsers.includes(String(ctx.from.id));
  if (command.adminOnly && !isAdmin) return ctx.reply(L.noPermission);

  try {
    react(ctx, "processing");
    ctx.args = args;
    await command.run(ctx);
    react(ctx, "success");
  } catch (err) {
    console.error(err);
    react(ctx, "error");
    ctx.reply(L.commandError);
  }
});

// Express server
const app = express();
const PORT = process.env.PORT || config.connection.webhookPort || 3000;

app.get("/", (req, res) => {
  res.send(
    `MISS ﾉ尺卂 — ${moment()
      .tz(config.timezone)
      .format("YYYY-MM-DD HH:mm:ss")}`
  );
});

// Webhook / Polling
async function startBot() {
  const url = config.connection.webhookDomain;

  if (!url) {
    console.log("Polling mode");
    await bot.launch();
    return console.log("Bot running");
  }

  const full = url + config.connection.webhookPath;
  await bot.telegram.setWebhook(full);
  app.use(bot.webhookCallback(config.connection.webhookPath));
  console.log("Webhook mode");
}

app.listen(PORT, () => console.log(`Server ${PORT}`));
startBot();

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);