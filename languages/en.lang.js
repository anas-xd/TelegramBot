// Load config so language strings can dynamically use owner data
const config = require("../config.json");

module.exports = {
  /* ============================================================
     BASIC SYSTEM MESSAGES
  ============================================================ */
  unknownCommand: "I don’t recognize the command '%1'.",
  helpHint: "Use /help to view all available commands.",
  commandError: "Something went wrong! Please try again later.",

  startMessage: (name, botname, prefix) =>
    `Hello ${name}!\nWelcome to *${botname}* 🎉\nUse \`${prefix}help\` to get started.`,

  /* ============================================================
     PERMISSION SYSTEM
  ============================================================ */
  noPermission: `⚠️ You don’t have permission to use this command.\nOnly *${config.owner.name}* (${config.owner.contact}) can use it.`,

  /* ============================================================
     BAN SYSTEM
  ============================================================ */
  userBanned: `🚫 You are banned from using this bot.\nContact *${config.owner.name}* (${config.owner.contact}) for help.`,
  
  threadBanned: `⛔ This group is banned from using this bot.\nFor unban, contact *${config.owner.name}* (${config.owner.contact}).`,

  /* ============================================================
     COMMAND REACTIONS / STATUS
  ============================================================ */
  processing: "⏳ Processing your request...",
  success: "✅ Done!",
  failed: "❌ Failed to complete the command.",

  /* ============================================================
     HELP MENU (Optional - for /help command)
  ============================================================ */
  helpTitle: (botname) => `📘 *${botname} – Help Menu*`,
  helpFooter: `Tip: Use the prefix before commands.`,
};