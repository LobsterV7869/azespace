const { SlashCommandBuilder } = require('discord.js');
const { getOption, publicReply } = require('../utils/interaction');

const LANGUAGE_MAP = {
    'spanish': 'es', 'es': 'es',
    'french': 'fr', 'fr': 'fr',
    'german': 'de', 'de': 'de',
    'azerbaijani': 'az', 'azeri': 'az', 'az': 'az',
    'turkish': 'tr', 'tr': 'tr',
    'russian': 'ru', 'ru': 'ru',
    'italian': 'it', 'it': 'it',
    'japanese': 'ja', 'ja': 'ja',
    'chinese': 'zh', 'zh': 'zh',
    'portuguese': 'pt', 'pt': 'pt',
    'arabic': 'ar', 'ar': 'ar',
    'english': 'en', 'en': 'en'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('translate')
        .setDescription('Translate text into another language')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('The text you want to translate')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('language')
                .setDescription('Target language (e.g. Spanish, French, az, tr, de, ru, ja)')
                .setRequired(true)
        ),
    async execute(interaction) {
        const text = getOption(interaction, 'text');
        const langInput = (getOption(interaction, 'language') || 'en').trim().toLowerCase();
        const targetCode = LANGUAGE_MAP[langInput] || langInput.substring(0, 2);

        try {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${encodeURIComponent(targetCode)}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(2200) });
            const data = await res.json();

            if (data && data.responseData && data.responseData.translatedText) {
                const translated = data.responseData.translatedText;
                return publicReply(null, [
                    {
                        title: '🌐 Quick Translation',
                        color: 0x5865f2,
                        fields: [
                            { name: 'Original Text', value: text },
                            { name: `Translated (${targetCode.toUpperCase()})`, value: translated }
                        ],
                        footer: { text: 'Powered by MyMemory Translation API' }
                    }
                ]);
            }
            throw new Error('Invalid translation response');
        } catch (e) {
            return publicReply(`❌ Failed to translate into \`${langInput}\`. Please check the language name/code (e.g. \`es\`, \`fr\`, \`de\`, \`az\`, \`tr\`) and try again.`);
        }
    }
};
