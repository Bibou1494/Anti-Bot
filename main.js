const { Client, Events, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();
const Database = require('./database');
const startServer = require('./server');

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	readyClient.user.setPresence({
		status: 'invisible',
	});

	try {
		startServer(readyClient);
	}
	catch (error) {
		console.error('Failed to start configuration web server:', error);
	}
});

client.on('messageCreate', async (message) => {
	if (!message.guild || message.author.bot) return;

	const guildId = message.guild.id;
	const config = Database.get(guildId);

	if (!config.enabled) return;
	const isMonitoredChannel = config.targetChannelId
		? message.channel.id === config.targetChannelId
		: message.channel.name === 'antibot';

	if (!isMonitoredChannel) return;

	if (config.bypassUsers.includes(message.author.id)) {
		console.log(`Bypass triggered: User ${message.author.tag} (${message.author.id}) is whitelisted.`);
		return;
	}

	if (message.member && message.member.roles) {
		const hasBypassRole = message.member.roles.cache.some(role => config.bypassRoles.includes(role.id));
		if (hasBypassRole) {
			console.log(`Bypass triggered: User ${message.author.tag} has a whitelisted role.`);
			return;
		}
	}

	console.log(`Bot/Spam account suspected: ${message.author.tag} in channel #${message.channel.name}`);

	try {
		if (message.channel.permissionsFor(message.guild.members.me).has(PermissionFlagsBits.ManageMessages)) {
			await message.delete();
		}
		else {
			console.error(`Missing 'Manage Messages' permission to delete message in #${message.channel.name}`);
		}
	}
	catch (error) {
		console.error(`Failed to delete message: ${error.message}`);
	}

	let actionTaken = 'None (Message Deleted Only)';
	let success = false;
	let errorMsg = null;

	if (config.action === 'ban') {
		if (message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) {
			try {
				await message.member.ban({
					deleteMessageSeconds: config.deleteMessageSeconds,
					reason: config.reason,
				});
				console.log(`Banned user: ${message.author.tag}`);
				actionTaken = 'Ban';
				success = true;
			}
			catch (error) {
				errorMsg = error.message;
				console.error(`Error when banning: ${error.message}`);
			}
		}
		else {
			errorMsg = 'Missing \'Ban Members\' permission';
			console.error('The bot doesn\'t have permission: Banning');
		}
	}
	else if (config.action === 'kick') {
		if (message.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
			try {
				await message.member.kick(config.reason);
				console.log(`Kicked user: ${message.author.tag}`);
				actionTaken = 'Kick';
				success = true;
			}
			catch (error) {
				errorMsg = error.message;
				console.error(`Error when kicking: ${error.message}`);
			}
		}
		else {
			errorMsg = 'Missing \'Kick Members\' permission';
			console.error('The bot doesn\'t have permission: Kicking');
		}
	}
	else if (config.action === 'timeout') {
		if (message.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
			try {
				const timeoutDuration = 24 * 60 * 60 * 1000;
				await message.member.timeout(timeoutDuration, config.reason);
				console.log(`Timed out user: ${message.author.tag}`);
				actionTaken = 'Timeout (24 Hours)';
				success = true;
			}
			catch (error) {
				errorMsg = error.message;
				console.error(`Error when timing out: ${error.message}`);
			}
		}
		else {
			errorMsg = 'Missing \'Moderate Members\' permission (Timeout)';
			console.error('The bot doesn\'t have permission: Timeout');
		}
	}
	else {
		success = true;
	}

	try {
		let logChannel = null;
		if (config.logChannelId) {
			logChannel = message.guild.channels.cache.get(config.logChannelId);
		}
		else {
			logChannel = message.guild.channels.cache.find(c => c.name === 'antibot-logs' && c.type === 0);
		}

		if (logChannel) {
			const botPermissions = logChannel.permissionsFor(message.guild.members.me);
			if (botPermissions && botPermissions.has(PermissionFlagsBits.SendMessages)) {
				const fields = [
					{ name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
					{ name: 'Monitored Channel', value: `<#${message.channel.id}>`, inline: true },
					{ name: 'Action Attempted', value: config.action.toUpperCase(), inline: true },
					{ name: 'Action Outcome', value: success ? `✅ Successfully executed: **${actionTaken}**` : `❌ Failed: ${errorMsg}`, inline: false },
				];

				if (success && config.action !== 'none') {
					fields.push({ name: 'Reason Given', value: config.reason, inline: false });
				}

				const logEmbed = {
					title: '🛡️ Anti-Bot Security Alert',
					color: success ? (config.action === 'none' ? 0x3498db : 0xe74c3c) : 0x95a5a6,
					description: 'An account posted in the monitored channel and security measures were triggered.',
					fields: fields,
					timestamp: new Date().toISOString(),
					footer: { text: 'Anti-Bot Security System' },
				};

				await logChannel.send({ embeds: [logEmbed] });
			}
		}
	}
	catch (logError) {
		console.error(`Failed to send log embed: ${logError.message}`);
	}
});

client.login(process.env.TOKEN);