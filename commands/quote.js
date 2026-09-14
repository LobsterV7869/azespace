const { SlashCommandBuilder } = require('discord.js');
const { publicReply } = require('../utils/interaction');

const FALLBACK_QUOTES = [
    { quote: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
    { quote: "It always seems impossible until it's done.", author: "Nelson Mandela" },
    { quote: "Life is what happens when you're busy making other plans.", author: "John Lennon" },
    { quote: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { quote: "Simplicity is the soul of efficiency.", author: "Austin Freeman" }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quote')
        .setDescription('Get a random inspirational or funny quote!'),
    async execute(interaction) {
        let quoteText = '';
        let authorText = '';

        try {
            // Use free public quotes API with a strict 2-second timeout to meet Discord 3s webhook deadline
            const res = await fetch('https://dummyjson.com/quotes/random', {
                signal: AbortSignal.timeout(2000)
            });
            if (res.ok) {
                const data = await res.json();
                quoteText = data.quote;
                authorText = data.author;
            } else {
                throw new Error('Non-200 API response');
            }
        } catch (e) {
            const fallback = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
            quoteText = fallback.quote;
            authorText = fallback.author;
        }

        return publicReply(null, [
            {
                title: '💬 Inspirational Quote',
                description: `*"${quoteText}"*`,
                color: 0xfee75c,
                footer: { text: `— ${authorText || 'Anonymous'}` }
            }
        ]);
    }
};
