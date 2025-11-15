const { Telegraf } = require("telegraf");
const fs = require("fs-extra");
const path = require("path");
const express = require("express");
const moment = require("moment-timezone");
const { execSync } = require("child_process");

require("dotenv").config();

const config = require("./config.json");
const lang = require("./languages/en.lang.js");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
global.commands = new Map();

/* ============================================================
   AUTO INSTALL MODULES FROM COMMAND FILES
============================================================ */
function ensureModuleInstalled(moduleName) {
  try {
    require.resolve(moduleName);
  } catch {
    console.log(`📦 Installing missing module: ${moduleName}`);
    execSync(`npm install ${moduleName} --save`, { stdio: "inherit" });
  }
}

/* ============================================================
   LOAD COMMANDS
============================================================ */
fs.readdirSync("./commands").forEach((file) => {
  if (!file.endsWith(".js")) return;

  const commandPath = path.join(__dirname, "commands", file);
  const content = fs.readFileSync(commandPath, "utf-8");

  // Detect required packages
  const regex = /require\(['"`](.*?)['"`]\)/g;
  let match;

  while ((match = regex.exec(content))) {
    const pkg = match[1];
    if (!pkg.startsWith(".") && !pkg.startsWith("/")) {
      ensureModuleInstalled(pkg);
    }
  }

  const cmd = require(commandPath);

  if (cmd.name && typeof cmd.run === "function") {
    global.commands.set(config.prefix + cmd.name.toLowerCase(), cmd);
    console.log(`✅ Loaded command: ${cmd.name}`);
  }
});

/* ============================================================
   REACTION HELPER
============================================================ */
function react(ctx, type) {
  if (!config.reactions.enabled) return;
  ctx.react?.(config.reactions[type]).catch(() => {});
}

/* ============================================================
   START COMMAND
============================================================ */
bot.start((ctx) => {
  const name = ctx.from.first_name || "User";
  const message = lang.startMessage(name, config.botname, config.prefix);

  ctx.reply(message, { parse_mode: "Markdown" });
});

/* ============================================================
   COMMAND HANDLER
============================================================ */
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  const lower = text.toLowerCase();

  let cmdName = "";
  let args = [];

  // Prefixed
  if (lower.startsWith(config.prefix)) {
    [cmdName, ...args] = lower.slice(config.prefix.length).split(" ");
  } else {
    // No-prefix detection
    const first = lower.split(" ")[0];
    const noPrefixCmd = global.commands.get(config.prefix + first);
    if (!noPrefixCmd?.noPrefix) return;
    cmdName = first;
    args = lower.split(" ").slice(1);
  }

  const command =
    global.commands.get(config.prefix + cmdName) ||
    global.commands.get(cmdName);

  if (!command) {
    if (lower.startsWith(config.prefix)) {
      return ctx.reply(
        lang.unknownCommand.replace("%1", cmdName) + "\n" + lang.helpHint
      );
    }
    return;
  }

  /* ============================================================
     CHECK PRIVILEGED USERS (OWNER + ADMINS MERGED)
  ============================================================ */
  const userId = String(ctx.from.id);
  const isPrivileged = config.privilegedUsers.includes(userId);

  if (command.adminOnly && !isPrivileged) {
    return ctx.reply("⚠️ You don't have permission to use this command.");
  }

  /* ============================================================
     EXECUTE COMMAND
  ============================================================ */
  try {
    react(ctx, "processing");

    ctx.args = args;
    await command.run(ctx);

    react(ctx, "success");
  } catch (err) {
    console.error(`❌ Error in command [${cmdName}]:`, err);

    react(ctx, "error");
    ctx.reply(lang.commandError);
  }
});

/* ============================================================
   EXPRESS SERVER (RENDER / RAILWAY UPTIME)
============================================================ */
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send(
    `Bot running — ${moment()
      .tz(config.timezone)
      .format("YYYY-MM-DD HH:mm:ss")}`
  );
});

app.listen(PORT, () =>
  console.log(`🌍 Express server active on port ${PORT}`)
);

/* ============================================================
   LAUNCH BOT
============================================================ */
bot.launch().then(() => {
  console.log("🚀 Bot is now running!");
});