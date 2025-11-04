const { cmd } = require('../command');
const { igdl } = require('ruhend-scraper');

cmd({
    pattern: "insta",
    alias: ["instagram", "ig", "igdl"],
    react: "⬇️",
    desc: "Download media (video or image) from Instagram.",
    category: "download",
    use: ".insta <Instagram URL>",
    filename: __filename
}, async (conn, mek, m, { from, reply, args, q }) => {
    try {
        const instagramUrl = args[0] || q;
        
        if (!instagramUrl) {
            await reply(`❌ Please provide an Instagram URL (e.g., .insta https://www.instagram.com/p/xyz)`);
            return;
        }

        // Show processing reaction
        await conn.sendMessage(from, { react: { text: '⏳', key: m.key } });

        const res = await igdl(instagramUrl);
        const data = res.data;
        
        if (data && data.length > 0) {
            for (let media of data) {
                const mediaUrl = media.url;
                
                if (mediaUrl && instagramUrl.includes('/reel/')) {
                    await conn.sendMessage(from, { 
                        video: { url: mediaUrl }, 
                        caption: `🎥 *ɪɴsᴛᴀɢʀᴀᴍ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n\n` +
                                `- ❄️ *ǫᴜᴀʟɪᴛʏ*: HD\n\n` +
                                `> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ 🌸 SAKURA V2 🌸*`, 
                        mimetype: 'video/mp4' 
                    }, { quoted: mek });
                } else if (mediaUrl && instagramUrl.includes('/p/')) {
                    await conn.sendMessage(from, { 
                        image: { url: mediaUrl }, 
                        caption: `🎥 *ɪɴsᴛᴀɢʀᴀᴍ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ*\n\n` +
                                `- ❄️ *ǫᴜᴀʟɪᴛʏ*: HD\n\n` +
                                `> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ 🌸 SAKURA V2 🌸*`
                    }, { quoted: mek });
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
            // Success reaction
            await conn.sendMessage(from, { react: { text: '✅', key: m.key } });
        } else {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
            await reply('❌ No media found or an error occurred with the Instagram URL.');
        }
    } catch (error) {
        console.error('Error fetching Instagram media:', error);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
        await reply('❌ Error occurred while fetching Instagram media.');
    }
});