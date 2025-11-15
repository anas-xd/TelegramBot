const { Telegraf } = require("telegraf");
const fs = require("fs-extra");
const path = require("path");
const { execSync } = require("child_process");
const express = require("express");
const moment = require("moment-timezone");

const config = require("./config.json");
const lang = require("./languages/en.lang");

require("dotenv").config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
global.commands = new Map();

/* ============================================================
   AUTO INSTALL MODULES USED INSIDE COMMAND FILES
============================================================ */
function ensureModuleInstalled(moduleName) {
  try {
    require.resolve(moduleName);
  } catch (e) {
    console.log(`📦 Installing missing module: ${moduleName}`);
    execSync(`npm install ${moduleName} --save`, { stdio: "inherit" });
  }
}

/* ============================================================
   LOAD COMMANDS FROM /commands FOLDER
============================================================ */
fs.readdirSync("./commands").forEach(file => {
  if (!file.endsWith(".js")) return;

  const commandPath = path.join(__dirname, "commands", file);
  const commandContent = fs.readFileSync(commandPath, "utf-8");

  // Detect required packages
  const requireRegex = /require\(['"`](.*?)['"`]\)/g;
  let match;

  while ((match = requireRegex.exec(commandContent)) !== null) {
    const moduleName = match[1];
    if (!moduleName.startsWith(".") && !moduleName.startsWith("/")) {
      ensureModuleInstalled(moduleName);
    }
  }

  const command = require(commandPath);

  if (command.name && typeof command.run === "function") {
    global.commands.set(config.prefix + command.name.toLowerCase(), command);
    console.log(`✅ Loaded command: ${command.name}`);
  }
});

/* ============================================================
   /START COMMAND
============================================================ */
bot.start((ctx) => {
  const name = ctx.from.first_name || "User";
  const welcomeMsg = lang.startMessage(name, config.botname, config.prefix);

  ctx.reply(welcomeMsg, { parse_mode: "Markdown" });
});

/* ============================================================
   COMMAND HANDLER
============================================================ */
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  const lower = text.toLowerCase();

  let cmdName = "";
  let args = [];

  // Prefixed command
  if (lower.startsWith(config.prefix)) {
    [cmdName, ...args] = lower.slice(config.prefix.length).split(" ");
  } else {
    // No-prefix commands
    const firstWord = lower.split(" ")[0];
    const noPrefixCmd = global.commands.get(config.prefix + firstWord);

    if (!noPrefixCmd?.noPrefix) return;

    cmdName = firstWord;
    args = lower.split(" ").slice(1);
  }

  const command =
    global.commands.get(config.prefix + cmdName) ||
    global.commands.get(cmdName);

  if (!command) {
    if (text.startsWith(config.prefix)) {
      return ctx.reply(lang.unknownCommand.replace("%1", cmdName) + "\n" + lang.helpHint);
    }
    return;
  }

  try {
    ctx.args = args;
    await command.run(ctx);
  } catch (err) {
    console.error(`❌ Error in command ${cmdName}:`, err);
    ctx.reply(lang.commandError);
  }
});

/* ============================================================
   EXPRESS SERVER (For Uptime on Render / Railway)
============================================================ */
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send(`Bot running at ${moment().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm:ss")}`);
});

app.listen(PORT, () => {
  console.log(`🌐 Express server running on port ${PORT}`);
});

/* ============================================================
   LAUNCH BOT
============================================================ */
bot.launch().then(() => {
  console.log("🚀 Telegram bot is live!");
});