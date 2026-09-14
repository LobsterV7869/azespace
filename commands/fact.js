const { SlashCommandBuilder } = require('discord.js');
const { publicReply } = require('../utils/interaction');

const FALLBACK_FACTS = [
    "Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still edible.",
    "Bananas are curved because they grow towards the sun against gravity (a process known as negative geotropism).",
    "Octopuses have three hearts, nine brains, and blue blood.",
    "A day on Venus is longer than a year on Venus.",
    "Nintendo was founded in 1889 as a playing card company.",
    "Sea otters hold hands while they sleep so they don't drift apart."
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fact')
        .setDescription('Get a random fun or useless fact!'),
    async execute(interaction) {
        let fact = '';

        try {
            const res = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', {
                signal: AbortSignal.timeout(2000)
            });
            if (res.ok) {
                const data = await res.json();
                fact = data.text;
            } else {
                throw new Error('API non-200');
            }
        } catch (e) {
            fact = FALLBACK_FACTS[Math.floor(Math.random() * FALLBACK_FACTS.length)];
        }

        return publicReply(null, [
            {
                title: '🧠 Random Fun Fact',
                description: fact,
                color: 0x57f287,
                footer: { text: 'Did you know?' }
            }
        ]);
    }
};
