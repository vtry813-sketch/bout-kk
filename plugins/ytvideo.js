// plugins/ytvideo.js
const { cmd } = require("../command");
const yts = require("yt-search");
const axios = require("axios");

cmd(
  {
    pattern: "video",
    react: "🎥",
    desc: "Download YouTube Video",
    category: "download",
    filename: __filename,
  },
  async (malvin, mek, m, { from, args, reply }) => {
    try {
      const q = args.join(" ");
      if (!q) return reply("*Provide a name or a YouTube link.* 🎥❤️");

      // 1) Find the URL
      let url = q;
      try {
        url = new URL(q).toString();
      } catch {
        const s = await yts(q);
        if (!s.videos.length) return reply("❌ No videos found!");
        url = s.videos[0].url;
      }

      // 2) Send metadata + thumbnail
      const info = (await yts(url)).videos[0];
      const desc = `
🧩 *SAKURA V2 DOWNLOADER* 🧩
📌 *Title:* ${info.title}

📝 *Description:* ${info.description}

⏱️ *Uploaded:* ${info.timestamp} (${info.ago} ago)

👀 *Views:* ${info.views}

🔗 *Download URL:*
${info.url}

━━━━━━━━━━━━━━━━━━
*SAKURA V2 Tech🌸*
      `.trim();

      await malvin.sendMessage(
        from,
        { image: { url: info.thumbnail }, caption: desc },
        { quoted: mek }
      );

      // 3) Video download helper
      const downloadVideo = async (videoUrl, quality = "720") => {
        // <-- wrap the URL in backticks so ${} works correctly
        const apiUrl = `https://p.oceansaver.in/ajax/download.php?format=${quality}&url=${encodeURIComponent(
          videoUrl
        )}&api=dfcb6d76f2f6a9894gjkege8a4ab232222`;

        const res = await axios.get(apiUrl);
        if (!res.data.success) throw new Error("Failed to fetch video details.");

        const { id, title } = res.data;
        // <-- remove the stray semicolon from the URL
        const progressUrl = `https://p.oceansaver.in/ajax/progress.php?id=${id}`;

        // poll until ready
        while (true) {
          const prog = (await axios.get(progressUrl)).data;
          if (prog.success && prog.progress === 1000) {
            const vid = await axios.get(prog.download_url, { responseType: "arraybuffer" });
            return { buffer: vid.data, title };
          }
          // wait 5s and poll again
          await new Promise((r) => setTimeout(r, 5000));
        }
      };

      // 4) Download + send
      const { buffer, title } = await downloadVideo(url, "720");
      await malvin.sendMessage(
        from,
        {
          video: buffer,
          mimetype: "video/mp4",
          caption: `🎥 *${title}*\n\nⒸ ALL RIGHTS RESERVED SAKURA V2`,
        },
        { quoted: mek }
      );

      reply("*Thanks for using my bot!* 🎥");
    } catch (e) {
      console.error(e);
      reply(`❌ Error: ${e.message}`);
    }
  }
);
