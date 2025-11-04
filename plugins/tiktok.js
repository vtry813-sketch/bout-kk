const { cmd } = require('../command');
const axios = require('axios');

const API_ENDPOINT = 'https://api.neoxr.my.id/api';
const API_KEY = 'iamgay';

cmd({
    pattern: "tiktok",
    alias: ["tt", "tikwm"],
    react: "🎵",
    desc: "Download media from TikTok using Neoxr API",
    category: "download",
    use: ".tiktok <TikTok URL>",
    filename: __filename
}, async (conn, mek, m, { from, reply, args, q, command }) => {
    try {
        const tiktokUrl = args[0] || q;
        
        if (!tiktokUrl) {
            await reply(`❌ Please provide a TikTok URL (e.g., .tiktok https://www.tiktok.com/@user/video/12345)`);
            return;
        }
        
        if (!tiktokUrl.includes('tiktok.com')) {
            await reply('❌ Invalid TikTok link.');
            return;
        }

        // Show processing reaction
        await conn.sendMessage(from, { react: { text: '⏳', key: m.key } });

        const res = await axios.get(`${API_ENDPOINT}/tiktok`, {
            params: { url: tiktokUrl, apikey: API_KEY }
        });
        const json = res.data;

        if (!json.status) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
            await reply('❌ API returned error:\n' + JSON.stringify(json, null, 2));
            return;
        }

        // Send video (for tiktok/tt/tikwm)
        if ((command === 'tiktok' || command === 'tt' || command === 'tikwm') && json.data.video) {
            await conn.sendMessage(from, {
                video: { url: (command === 'tikwm' && json.data.videoWM) ? json.data.videoWM : json.data.video },
                caption: `🎵 *ᴛɪᴋᴛᴏᴋ ᴠɪᴅᴇᴏ* 🎵\n\n` +
                        `> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ 🌸 SAKURA V2 🌸*`,
                mimetype: 'video/mp4'
            }, { quoted: mek });
            
            await conn.sendMessage(from, { react: { text: '✅', key: m.key } });
            return;
        }

        // Send album (photo)
        if (json.data.photo) {
            for (let photo of json.data.photo) {
                await conn.sendMessage(from, {
                    image: { url: photo },
                    caption: `🎵 *ᴛɪᴋᴛᴏᴋ ᴘʜᴏᴛᴏ* 🎵\n\n` +
                            `> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ 🌸 SAKURA V2 🌸*`
                }, { quoted: mek });
                await new Promise(res => setTimeout(res, 1500));
            }
            
            await conn.sendMessage(from, { react: { text: '✅', key: m.key } });
            return;
        }

        // If nothing matched
        if (!json.data.video && !json.data.photo) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
            await reply('❌ No media found or unsupported content.');
        }

    } catch (error) {
        console.error('Error fetching TikTok media:', error);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
        await reply('❌ Error occurred while fetching TikTok media.');
    }
});

// Separate command for TikTok MP3
cmd({
    pattern: "tikmp3",
    alias: ["ttmp3"],
    react: "🎵",
    desc: "Download audio from TikTok using Neoxr API",
    category: "download",
    use: ".tikmp3 <TikTok URL>",
    filename: __filename
}, async (conn, mek, m, { from, reply, args, q }) => {
    try {
        const tiktokUrl = args[0] || q;
        
        if (!tiktokUrl) {
            await reply(`❌ Please provide a TikTok URL (e.g., .tikmp3 https://www.tiktok.com/@user/video/12345)`);
            return;
        }
        
        if (!tiktokUrl.includes('tiktok.com')) {
            await reply('❌ Invalid TikTok link.');
            return;
        }

        // Show processing reaction
        await conn.sendMessage(from, { react: { text: '⏳', key: m.key } });

        const res = await axios.get(`${API_ENDPOINT}/tiktok`, {
            params: { url: tiktokUrl, apikey: API_KEY }
        });
        const json = res.data;

        if (!json.status) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
            await reply('❌ API returned error:\n' + JSON.stringify(json, null, 2));
            return;
        }

        // Send audio
        if (json.data.audio) {
            await conn.sendMessage(from, {
                audio: { url: json.data.audio },
                caption: `🎵 *ᴛɪᴋᴛᴏᴋ ᴀᴜᴅɪᴏ* 🎵\n\n` +
                        `> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ 🌸 SAKURA V2 🌸*`,
                mimetype: 'audio/mp3',
                ptt: false
            }, { quoted: mek });
            
            await conn.sendMessage(from, { react: { text: '✅', key: m.key } });
        } else {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
            await reply('❌ No audio found for this TikTok video.');
        }

    } catch (error) {
        console.error('Error fetching TikTok audio:', error);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
        await reply('❌ Error occurred while fetching TikTok audio.');
    }
});
