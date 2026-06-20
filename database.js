const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'guilds.json');

const DEFAULT_CONFIG = {
	enabled: true,
	targetChannelId: null,
	logChannelId: null,
	action: 'ban',
	deleteMessageSeconds: 604800,
	reason: 'Bot account detected',
	bypassRoles: [],
	bypassUsers: [],
};


if (!fs.existsSync(DB_DIR)) {
	fs.mkdirSync(DB_DIR, { recursive: true });
}

if (!fs.existsSync(DB_FILE)) {
	fs.writeFileSync(DB_FILE, JSON.stringify({}, null, 2), 'utf-8');
}

function readDb() {
	try {
		const data = fs.readFileSync(DB_FILE, 'utf-8');
		return JSON.parse(data);
	}
	catch (error) {
		console.error('Error reading database file:', error);
		return {};
	}
}

function writeDb(data) {
	try {
		const tempFile = `${DB_FILE}.tmp`;
		fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
		fs.renameSync(tempFile, DB_FILE);
	}
	catch (error) {
		console.error('Error writing database file:', error);
	}
}

const Database = {
	get(guildId) {
		if (!guildId) return { ...DEFAULT_CONFIG };
		const db = readDb();
		return {
			...DEFAULT_CONFIG,
			...(db[guildId] || {}),
		};
	},

	set(guildId, config) {
		if (!guildId) return;
		const db = readDb();
		db[guildId] = {
			...DEFAULT_CONFIG,
			...(db[guildId] || {}),
			...config,
		};
		writeDb(db);
	},

	delete(guildId) {
		if (!guildId) return;
		const db = readDb();
		if (db[guildId]) {
			delete db[guildId];
			writeDb(db);
		}
	},
};

module.exports = Database;
