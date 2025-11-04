const { cmd } = require("../command");
const { toPTT } = require("../lib/converter");
const { downloadMediaMessage } = require("../lib/msg");

cmd(
  {
    pattern: "tovn",
    alias: ["tovoice", "tovn", "toaudio"],
    react: "🎧",
    desc: "Convert video/audio to voice note",
    category: "convert",
    filename: __filename,
  },
  async (
    malvin,
    mek,
    m,
    {
      from,
      quoted,
      body,
      isCmd,
      command,
      args,
      q,
      isGroup,
      sender,
      senderNumber,
      botNumber2,
      botNumber,
      pushname,
      isMe,
      isOwner,
      groupMetadata,
      groupName,
      participants,
      groupAdmins,
      isBotAdmins,
      isAdmins,
      reply,
    }
  ) => {
    try {
      // Check if message is quoted and contains media
      if (!quoted) {
        return reply("🎵 Please reply to a video or audio message to convert to voice note!");
      }

      // Determine media type
      const hasVideo = quoted.videoMessage;
      const hasAudio = quoted.audioMessage;
      const hasDocument = quoted.documentMessage;

      if (!hasVideo && !hasAudio && !hasDocument) {
        return reply("🎵 Please reply to a *video* or *audio* file you want to convert to voice note.");
      }

      await malvin.sendPresenceUpdate("recording", from);
      await malvin.sendMessage(from, { react: { text: '🎧', key: mek.key } });

      try {
        // Download the media
        const media = await downloadMediaMessage(quoted, "tovn_temp");
        if (!media) {
          return reply("⚠️ Failed to download media.");
        }

        // Detect file type for conversion
        const FileType = require('file-type');
        const type = await FileType.fromBuffer(media);
        
        if (!type?.ext) {
          return reply("❌ Unable to detect file type.");
        }

        // Convert to voice note format (PTT)
        const { toPTT } = require("../lib/converter");
        const audioBuffer = await toPTT(media, type.ext);

        // Send as voice note
        await malvin.sendMessage(
          from,
          {
            audio: audioBuffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true, // This makes it a voice note
          },
          { quoted: mek }
        );

        // Clear reaction
        await malvin.sendMessage(from, { react: { text: '', key: mek.key } });

      } catch (convertError) {
        console.error('TOVN Conversion Error:', convertError);
        await malvin.sendMessage(from, { react: { text: '', key: mek.key } });
        reply('❌ Error while converting media to voice note: ' + convertError.message);
      }

    } catch (error) {
      console.error("❌ Error in TOVN command:", error);
      reply("❌ Error occurred while processing: " + error.message);
    }
  }
);