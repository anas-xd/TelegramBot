const axios = require("axios");
const fs = require("fs");

async function baseApiUrl() {
  const base = await axios.get(
    "https://raw.githubusercontent.com/cyber-ullash/cyber-ullash/refs/heads/main/UllashApi.json"
  );
  return base.data.api;
}

async function downloadFile(url, filePath) {
  const buffer = (await axios.get(url, { responseType: "arraybuffer" })).data;
  fs.writeFileSync(filePath, buffer);
  return fs.createReadStream(filePath);
}

module.exports = {
  name: "song",
  aliases: ["music", "play"],
  adminOnly: false,

  run: async (ctx) => {
    const args = ctx.args;
    if (!args.length) return ctx.reply("❌ Please provide a song name or YouTube URL.");

    const text = args.join(" ");

    // YouTube URL Check
    const checkurl =
      /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))((\w|-){11})(?:\S+)?$/;

    let videoID;
    const isYtURL = checkurl.test(args[0]);

    // -------------------------------------------------
    // If user gives a YouTube link
    // -------------------------------------------------
    if (isYtURL) {
      const match = args[0].match(checkurl);
      videoID = match ? match[1] : null;

      const { data } = await axios.get(
        `${await baseApiUrl()}/ytDl3?link=${videoID}&format=mp3`
      );

      const file = await downloadFile(data.downloadLink, "audio.mp3");

      await ctx.replyWithAudio(
        { source: file },
        { caption: data.title }
      );

      fs.unlinkSync("audio.mp3");
      return;
    }

    // -------------------------------------------------
    // YouTube Search
    // -------------------------------------------------
    const search = (
      await axios.get(`${await baseApiUrl()}/ytFullSearch?songName=${text}`)
    ).data;

    if (!search.length)
      return ctx.reply("⭕ No results found for: " + text);

    let message = "🎵 **Search Results:**\n\n";
    let i = 1;

    for (const info of search.slice(0, 6)) {
      message += `${i}. *${info.title}*\n⏱ ${info.time} | 📺 ${info.channel.name}\n\n`;
      i++;
    }

    message += "Reply with a number (1-6) to download.";

    const sent = await ctx.reply(message, { parse_mode: "Markdown" });

    // Save reply handler
    global.pendingReplies = global.pendingReplies || {};
    global.pendingReplies[sent.message_id] = {
      type: "song",
      results: search.slice(0, 6),
      user: ctx.from.id,
    };
  },
};

// ======================================================
// HANDLE REPLY (User Chooses a Song)
// ======================================================
module.exports.handleReply = async (ctx) => {
  if (!global.pendingReplies) return;

  const reply = global.pendingReplies[ctx.message.reply_to_message.message_id];
  if (!reply || reply.type !== "song") return;

  if (ctx.from.id !== reply.user)
    return ctx.reply("This reply is not for you.");

  const choice = parseInt(ctx.message.text);

  if (isNaN(choice) || choice < 1 || choice > reply.results.length)
    return ctx.reply("❌ Invalid choice (1-6 only).");

  const info = reply.results[choice - 1];
  const id = info.id;

  const { data } = await axios.get(
    `${await baseApiUrl()}/ytDl3?link=${id}&format=mp3`
  );

  const file = await downloadFile(data.downloadLink, "audio.mp3");

  await ctx.replyWithAudio(
    { source: file },
    { caption: `🎵 *${data.title}*\n🎧 Quality: ${data.quality}`, parse_mode: "Markdown" }
  );

  fs.unlinkSync("audio.mp3");

  delete global.pendingReplies[ctx.message.reply_to_message.message_id];
};
