// ============================================================
//  MKBot Main Engine
//  Clean • Stable • Webhook + Polling Auto • Minimal
// ============================================================

const { Telegraf } = require("telegraf");
const fs = require("fs-extra");
const path = require("path");
const express = require("express");
const moment = require("moment-timezone");
const { execSync } = require("child_process");

const config = require("./config.json");
const lang = require("./languages/en.lang.js");

const bot = new Telegraf(config.apiKey); // API directly in config.json
global.commands = new Map();

// ============================================================
//  Auto Install Missing Modules inside Command Files
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

  // Detect "require()" imports
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
//  Start Command
// ============================================================

bot.start((ctx) => {
  const name = ctx.from.first_name || "User";
  const msg = lang.startMessage(name, config.botname, config.prefix);

  ctx.reply(msg, { parse_mode: "Markdown" });
});

// ============================================================
//  Command Handler
// ============================================================

bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  const lower = text.toLowerCase();
  let cmdName = "";
  let args = [];

  // Prefixed commands
  if (lower.startsWith(config.prefix)) {
    [cmdName, ...args] = lower.slice(config.prefix.length).split(" ");
  } else {
    // No-prefix commands
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
        lang.unknownCommand.replace("%1", cmdName) + "\n" + lang.helpHint
      );
    }
    return;
  }

  // Check privileged users
  const userId = String(ctx.from.id);
  const isPrivileged = config.privilegedUsers.includes(userId);

  if (command.adminOnly && !isPrivileged) {
    return ctx.reply("⚠️ You don't have permission to use this command.");
  }

  try {
    react(ctx, "processing");

    ctx.args = args;
    await command.run(ctx);

    react(ctx, "success");
  } catch (e) {
    console.error(`❌ Error in command [${cmdName}]:`, e);

    react(ctx, "error");
    ctx.reply(lang.commandError);
  }
});

// ============================================================
//  Express Server (Needed for Webhook Hosting)
// ============================================================

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send(
    `MKBot Active — ${moment()
      .tz(config.timezone)
      .format("YYYY-MM-DD HH:mm:ss")}`
  );
});

// ============================================================
//  WEBHOOK + POLLING SYSTEM (Auto)
// ============================================================
//
//  If config.webhookURL === "" → POLLING
//  If config.webhookURL !== "" → WEBHOOK MODE
//
// ============================================================

async function startBot() {
  if (!config.webhookURL) {
    console.log("📡 Webhook OFF — using POLLING mode.");
    return bot.launch().then(() => {
      console.log("🚀 MKBot running in polling mode!");
    });
  }

  const url = config.webhookURL;
  console.log("🔗 Webhook enabled →", url);

  // Register webhook
  bot.telegram.setWebhook(url);

  // Express listens for updates
  app.use(bot.webhookCallback("/webhook"));

  console.log("🚀 MKBot running in webhook mode!");
}

app.listen(PORT, () => {
  console.log(`🌍 Server Active on port ${PORT}`);
});

startBot();