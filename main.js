// ============================================================
//  MISS ﾉ尺卂 — MAIN ENGINE
//  Clean • Stable • Webhook + Polling Auto • Multi-Language
// ============================================================

require("dotenv").config();

const { Telegraf } = require("telegraf");
const fs = require("fs-extra");
const path = require("path");
const express = require("express");
const moment = require("moment-timezone");
const { execSync } = require("child_process");

const config = require("./config.json");

// Language handling
const LANG_DIR = path.join(__dirname, "languages");
let defaultLang = require(`./languages/${config.language}.lang.js`);

// Bot instance using ENV API key
const bot = new Telegraf(process.env.BOT_TOKEN);

global.commands = new Map();

// ============================================================
//  Load User Language Settings
// ============================================================

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

// ============================================================
//  Auto-Install Command Dependencies
// ============================================================

function ensureInstalled(moduleName) {
  try {
    require.resolve(moduleName);
  } catch {
    console.log(`📦 Installing missing module: ${moduleName}`);
    execSync(`npm install ${moduleName} --save`, { stdio: "inherit" });
  }
}

// ============================================================
//  Load Commands Automatically
// ============================================================

fs.readdirSync("./commands").forEach((file) => {
  if (!file.endsWith(".js")) return;

  const filePath = path.join(__dirname, "commands", file);
  const content = fs.readFileSync(filePath, "utf8");

  const regex = /require\(['"`](.*?)['"`]\)/g;
  let match;
  while ((match = regex.exec(content))) {
    const pkg = match[1];
    if (!pkg.startsWith(".") && !pkg.startsWith("/")) {
      ensureInstalled(pkg);
    }
  }

  const cmd = require(filePath);

  if (cmd.name && typeof cmd.run === "function") {
    global.commands.set(config.prefix + cmd.name.toLowerCase(), cmd);
    console.log(`✅ Loaded command: ${cmd.name}`);
  }
});

// ============================================================
//  Reaction Helper
// ============================================================

function react(ctx, type) {
  if (!config.reactions.enabled) return;
  ctx.react?.(config.reactions[type]).catch(() => {});
}

// ============================================================
//  Language Loader (Per User)
// ============================================================

function getLang(ctx) {
  const id = ctx.from.id;
  const chosen = userLang[id] || config.language;

  try {
    return require(`./languages/${chosen}.lang.js`);
  } catch {
    return defaultLang;
  }
}

// ============================================================
//  /start handler
// ============================================================

bot.start((ctx) => {
  const L = getLang(ctx);
  const name = ctx.from.first_name || "User";

  ctx.reply(L.startMessage(name, config.botname, config.prefix), {
    parse_mode: "Markdown",
  });
});

// ============================================================
//  /lang command
// ============================================================

bot.command("lang", (ctx) => {
  const args = ctx.message.text.split(" ");
  const code = args[1];

  if (!code)
    return ctx.reply("Available: en, bn, hi, id\nUse: /lang en");

  const langFile = path.join(LANG_DIR, `${code}.lang.js`);
  if (!fs.existsSync(langFile)) return ctx.reply("❌ Language not found.");

  userLang[ctx.from.id] = code;
  saveUserLang();

  const L = getLang(ctx);
  ctx.reply(L.languageSet.replace("%1", code));
});

// ============================================================
//  TEXT Message Handler (Command System)
// ============================================================

bot.on("text", async (ctx) => {
  const L = getLang(ctx);
  const text = ctx.message.text.trim();
  const lower = text.toLowerCase();

  let cmdName = "";
  let args = [];

  if (lower.startsWith(config.prefix)) {
    [cmdName, ...args] = lower.slice(config.prefix.length).split(" ");
  } else {
    const first = lower.split(" ")[0];
    const cmd = global.commands.get(config.prefix + first);
    if (!cmd?.noPrefix) return;

    cmdName = first;
    args = lower.split(" ").slice(1);
  }

  const command =
    global.commands.get(config.prefix + cmdName) ||
    global.commands.get(cmdName);

  if (!command) {
    if (lower.startsWith(config.prefix)) {
      return ctx.reply(
        L.unknownCommand.replace("%1", cmdName) + "\n" + L.helpHint
      );
    }
    return;
  }

  const userId = String(ctx.from.id);
  const isAdmin = config.privilegedUsers.includes(userId);

  if (command.adminOnly && !isAdmin)
    return ctx.reply(L.noPermission);

  try {
    react(ctx, "processing");
    ctx.args = args;
    await command.run(ctx);
    react(ctx, "success");
  } catch (err) {
    console.error(`❌ Command error: ${cmdName}`, err);
    react(ctx, "error");
    ctx.reply(L.commandError);
  }
});

// ============================================================
//  EXPRESS SERVER (Webhook Support)
// ============================================================

const app = express();
const PORT = config.connection.webhookPort || 3000;

app.get("/", (req, res) => {
  res.send(
    `MISS ﾉ尺卂 Active — ${moment()
      .tz(config.timezone)
      .format("YYYY-MM-DD HH:mm:ss")}`
  );
});

// ============================================================
//  Auto Webhook + Polling Switch
// ============================================================

async function startBot() {
  const url = config.connection.webhookDomain;

  if (!url) {
    console.log("📡 Webhook OFF → Polling mode.");
    return bot.launch().then(() =>
      console.log("🚀 MISS ﾉ尺卂 running (Polling Mode)")
    );
  }

  console.log("🔗 Webhook enabled:", url);

  const fullURL = url + config.connection.webhookPath;

  bot.telegram.setWebhook(fullURL);
  app.use(bot.webhookCallback(config.connection.webhookPath));

  console.log("🚀 MISS ﾉ尺卂 running (Webhook Mode)");
}

app.listen(PORT, () =>
  console.log(`🌍 Express server running on port ${PORT}`)
);

startBot();