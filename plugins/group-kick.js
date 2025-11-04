const { cmd } = require('../command');

cmd({
  pattern: "kick",
  desc: "Kicks replied/quoted user from group.",
  category: "group",
  filename: __filename,
  use: "<reply|number>"
}, async (conn, mek, m, { 
  from, quoted, args, isGroup, reply 
}) => {
  if (!isGroup) {
    return reply("*This command can only be used in groups*.");
  }

  try {
    let users = m.mentionedJid?.[0] 
            || (m.quoted?.sender ?? null)
            || (args[0]?.replace(/[^0-9]/g, '') + "@s.whatsapp.net");

    if (!users) {
      return reply("*Please reply to a message or provide a valid number*");
    }

    await conn.groupParticipantsUpdate(from, [users], "remove");
    reply("*Sakura v2, this mf has been removed from the group successfully*.");
  } catch (error) {
    console.error("*Error kicking user*:", error);
    reply("*Failed to remove the user. Make sure I have permission to remove members.*");
  }
});
