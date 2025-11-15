const fs = require("fs");
const path = require("path");

module.exports.cleanTemp = () => {
  try {
    const files = fs.readdirSync("./");

    files.forEach(file => {
      if (
        file.startsWith("yt_") &&
        (file.endsWith(".mp4") || file.endsWith(".mp3"))
      ) {
        try {
          fs.unlinkSync(path.join("./", file));
          console.log("[Auto Clean] Removed:", file);
        } catch (err) {
          console.error("[Auto Clean ERROR]:", err);
        }
      }
    });

  } catch (err) {
    console.error("[Temp Scan ERROR]:", err);
  }
};