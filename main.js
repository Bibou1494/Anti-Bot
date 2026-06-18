const { Client, Events, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on('messageCreate', async (message) => {
	if (message.author.bot) return;

	console.log(`[#${message.channel.name}] ${message.author.username}: ${message.content}`);

	if (message.channel.name === 'antibot') {
		console.log(`Bot account detected: ${message.author.tag}`);
		await message.delete();
		if (message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
			try {
				await message.member.ban({ reason: 'Bot account detected' });
				console.log(`Banned user: ${message.author.username}`);
			}
			catch (error) {
				console.error(`Error when banning: ${error.message}`);
			}
		}
		else {
			console.error('The bot doesn\'t have permission: Banning');
		}
		return;
	}
});

client.login(process.env.TOKEN);