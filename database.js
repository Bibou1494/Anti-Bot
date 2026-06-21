const mysql = require('mysql2/promise');

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

const pool = mysql.createPool({
	host:     process.env.DB_HOST     || 'localhost',
	port:     parseInt(process.env.DB_PORT || '3306', 10),
	user:     process.env.DB_USER     || 'root',
	password: process.env.DB_PASSWORD || '',
	database: process.env.DB_DATABASE || 'antibot_db',
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
});

async function init() {
	await pool.execute(`
		CREATE TABLE IF NOT EXISTS guild_configs (
			guild_id              VARCHAR(20)  NOT NULL PRIMARY KEY,
			enabled               TINYINT(1)   NOT NULL DEFAULT 1,
			target_channel_id     VARCHAR(20)           DEFAULT NULL,
			log_channel_id        VARCHAR(20)           DEFAULT NULL,
			action                VARCHAR(10)  NOT NULL DEFAULT 'ban',
			delete_message_seconds INT         NOT NULL DEFAULT 604800,
			reason                VARCHAR(512) NOT NULL DEFAULT 'Bot account detected',
			bypass_roles          JSON         NOT NULL DEFAULT (JSON_ARRAY()),
			bypass_users          JSON         NOT NULL DEFAULT (JSON_ARRAY()),
			updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
				                                     ON UPDATE CURRENT_TIMESTAMP
		)
	`);
	console.log('[Database] MariaDB connection established and table verified.');
}

function rowToConfig(row) {
	return {
		enabled:              !!row.enabled,
		targetChannelId:      row.target_channel_id   || null,
		logChannelId:         row.log_channel_id       || null,
		action:               row.action,
		deleteMessageSeconds: row.delete_message_seconds,
		reason:               row.reason,
		bypassRoles:          typeof row.bypass_roles  === 'string' ? JSON.parse(row.bypass_roles)  : (row.bypass_roles  || []),
		bypassUsers:          typeof row.bypass_users  === 'string' ? JSON.parse(row.bypass_users)  : (row.bypass_users  || []),
	};
}

const Database = {
	async get(guildId) {
		if (!guildId) return { ...DEFAULT_CONFIG };
		try {
			const [rows] = await pool.execute(
				'SELECT * FROM guild_configs WHERE guild_id = ?',
				[guildId]
			);
			if (rows.length === 0) return { ...DEFAULT_CONFIG };
			return rowToConfig(rows[0]);
		}
		catch (error) {
			console.error('[Database] Error reading config:', error.message);
			return { ...DEFAULT_CONFIG };
		}
	},

	async set(guildId, config) {
		if (!guildId) return;
		const current = await this.get(guildId);
		const merged  = { ...current, ...config };

		try {
			await pool.execute(`
				INSERT INTO guild_configs
					(guild_id, enabled, target_channel_id, log_channel_id, action,
					 delete_message_seconds, reason, bypass_roles, bypass_users)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON DUPLICATE KEY UPDATE
					enabled               = VALUES(enabled),
					target_channel_id     = VALUES(target_channel_id),
					log_channel_id        = VALUES(log_channel_id),
					action                = VALUES(action),
					delete_message_seconds = VALUES(delete_message_seconds),
					reason                = VALUES(reason),
					bypass_roles          = VALUES(bypass_roles),
					bypass_users          = VALUES(bypass_users)
			`, [
				guildId,
				merged.enabled ? 1 : 0,
				merged.targetChannelId  || null,
				merged.logChannelId     || null,
				merged.action,
				merged.deleteMessageSeconds,
				merged.reason,
				JSON.stringify(merged.bypassRoles),
				JSON.stringify(merged.bypassUsers),
			]);
		}
		catch (error) {
			console.error('[Database] Error saving config:', error.message);
		}
	},
	
	async delete(guildId) {
		if (!guildId) return;
		try {
			await pool.execute(
				'DELETE FROM guild_configs WHERE guild_id = ?',
				[guildId]
			);
		}
		catch (error) {
			console.error('[Database] Error deleting config:', error.message);
		}
	},
};

module.exports = { Database, init };
