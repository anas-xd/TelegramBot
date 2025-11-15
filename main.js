// ============================================================
//  MISS ﾉ尺卂 — MAIN ENGINE
//  Clean • Stable • Dynamic Language • Webhook+Polling Auto
// ============================================================

const { Telegraf } = require("telegraf");
const fs = require("fs-extra");
const path = require("path");
const express = require("express");
const moment = require("moment-timezone");
const { execSync } = require("child_process");

const config = require("./config.json");

// Dynamic language files
const LANG_DIR = path.join(__dirname, "languages");

// Load default language
let lang = require(`./languages/${config.language}.lang.js`);

const bot = new Telegraf(config.apiKey);
global.commands = new Map();

// User language settings (saved persistently)
const userLangFile = "./data/user_languages.json";
fs.ensureFileSync(userLangFile);

let userLang = {};
try {
  userLang = JSON.parse(fs.readFileSync(userLangFile, "utf-8") || "{}");
} catch {
  userLang = {};
}

// Save user languages
function saveUserLang() {
  fs.writeFileSync(userLangFile, JSON.stringify(userLang, null, 2));
}

// ============================================================
//  Auto Install Missing Command Dependencies
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
//  Load Commands
// ============================================================

fs.readdirSync("./commands").forEach((file) => {
  if (!file.endsWith(".js")) return;
  const filePath = path.join(__dirname, "commands", file);
  const content = fs.readFileSync(filePath, "utf-8");

  const regex = /require\(['"`](.*?)['"`]\)/g;
  let m;
  while ((m = regex.exec(content))) {
    const pkg = m[1];
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
//  Dynamic Language Helper
// ============================================================

function getLang(ctx) {
  const id = ctx.from.id;
  const userLanguage = userLang[id] || config.language;

  try {
    return require(`./languages/${userLanguage}.lang.js`);
  } catch {
    return lang; // fallback
  }
}

// ============================================================
//  /start
// ============================================================

bot.start((ctx) => {
  const L = getLang(ctx);
  const name = ctx.from.first_name || "User";

  ctx.reply(L.startMessage(name, config.botname, config.prefix), {
    parse_mode: "Markdown",
  });
});

// ============================================================
//  /lang <code>
// ============================================================

bot.command("lang", async (ctx) => {
  const args = ctx.message.text.split(" ");
  const code = args[1];

  if (!code)
    return ctx.reply("Available languages: en, hi, id, es\nUse: /lang en");

  const filePath = path.join(LANG_DIR, `${code}.lang.js`);
  if (!fs.existsSync(filePath))
    return ctx.reply("❌ Language file not found.");

  userLang[ctx.from.id] = code;
  saveUserLang();

  const L = getLang(ctx);
  return ctx.reply(L.languageSet.replace("%1", code));
});

// ============================================================
//  Command Handler
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
    const noPrefix = global.commands.get(config.prefix + first);
    if (!noPrefix?.noPrefix) return;

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

  const isPrivileged = config.privilegedUsers.includes(String(ctx.from.id));

  if (command.adminOnly && !isPrivileged)
    return ctx.reply("⚠️ You don't have permission.");

  try {
    react(ctx, "processing");
    ctx.args = args;
    await command.run(ctx);
    react(ctx, "success");
  } catch (e) {
    console.log(`❌ Error in command [${cmdName}]`, e);
    react(ctx, "error");
    ctx.reply(L.commandError);
  }
});

// ============================================================
//  Express Server (Webhook Support)
// ============================================================

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send(
    `MISS ﾉ尺卂 Active — ${moment()
      .tz(config.timezone)
      .format("YYYY-MM-DD HH:mm:ss")}`
  );
});

// ============================================================
//  AUTO: Webhook + Polling
// ============================================================

async function startBot() {
  if (!config.webhookURL) {
    console.log("📡 Using POLLING mode");
    return bot.launch().then(() => console.log("🚀 Bot running (Polling)!"));
  }

  console.log("🔗 Webhook:", config.webhookURL);
  bot.telegram.setWebhook(config.webhookURL);
  app.use(bot.webhookCallback("/webhook"));
  console.log("🚀 Bot running (Webhook)!");
}

app.listen(PORT, () => console.log(`🌍 Server on ${PORT}`));
startBot();