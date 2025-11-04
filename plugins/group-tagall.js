const config = require('../config');
const { cmd } = require('../command');
const { getGroupAdmins } = require('../lib/functions');

cmd({
    pattern: "tagall",
    alias: ["gc_tagall"],
    react: "🔊",
    desc: "Tag all group members",
    category: "group",
    use: '.tagall [ᴍᴇssᴀɢᴇ]',
    filename: __filename
}, async (conn, m, msg, {
    from,
    participants,
    reply,
    isGroup,
    senderNumber,
    groupAdmins,
    command,
    body,
    isOwner
}) => {
    try {
        if (!isGroup) return reply("❌ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ɪs ᴏɴʟʏ ғᴏʀ ɢʀᴏᴜᴘs.");

        const botOwner = conn.user.id.split(':')[0];
        const senderJid = senderNumber + "@s.whatsapp.net";
        const isAllowed = groupAdmins.includes(senderJid) || senderNumber === botOwner || isOwner;

        if (!isAllowed) return reply("❌ ᴏɴʟʏ ɢʀᴏᴜᴘ ᴀᴅᴍɪɴs ᴏʀ ʙᴏᴛ ᴏᴡɴᴇʀ ᴄᴀɴ ᴜsᴇ ᴛʜɪs.");

        const groupMeta = await conn.groupMetadata(from).catch(() => null);
        if (!groupMeta) return reply("❌ ᴄᴏᴜʟᴅɴ'ᴛ ғᴇᴛᴄʜ ɢʀᴏᴜᴘ ɪɴғᴏ.");

        const groupName = groupMeta.subject || "Group";
        const total = participants.length || 0;
        const emojis = ['📢', '🔊', '🌐', '🔰', '💥', '🧨', '🚨', '⚠️', '🔥', '🎯'];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];

        let text = body.slice(body.indexOf(command) + command.length).trim();
        if (!text) text = "ᴛᴀɢɢɪɴɢ ᴇᴠᴇʀʏᴏɴᴇ...";

        let caption = `▢ ɢʀᴏᴜᴘ: *${groupName}*\n▢ ᴍᴇᴍʙᴇʀs: *${total}*\n▢ ᴍᴇssᴀɢᴇ: *${text}*\n\n┌───⊷ *ᴍᴇɴᴛɪᴏɴs*\n`;
        for (let u of participants) {
            caption += `${emoji} @${u.id.split("@")[0]}\n`;
        }
        caption += "└── 🌸 SAKURA V2 🌸";

        await conn.sendMessage(from, {
            text: caption,
            mentions: participants.map(p => p.id)
        }, { quoted: m });

    } catch (err) {
        console.error("❌ tagall error:", err);
        reply("❌ Error: " + (err.message || err));
    }
});