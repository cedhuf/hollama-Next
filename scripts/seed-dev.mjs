#!/usr/bin/env node
/**
 * Fill a development database with something to look at: every feature about a
 * conversation having a history needs one to be looked at at all.
 *
 * Writes straight into SQLite, in server mode, for the account given or the only
 * one there is. Everything carries its own ids, so a second run replaces its own
 * seed and nothing else.
 *
 *   DATA_DIR=./_local/hollama-dev node scripts/seed-dev.mjs [email]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const dataDir = process.env.DATA_DIR?.trim() || './data';
const db = new DatabaseSync(join(dataDir, 'llooma.db'));

const email = process.argv[2];
const user = email
	? db.prepare('SELECT id, email FROM users WHERE email = ?').get(email)
	: db.prepare('SELECT id, email FROM users ORDER BY created_at LIMIT 1').get();

if (!user) {
	console.error(
		email ? `No account for ${email}` : 'No account in this database yet. Sign up first.'
	);
	process.exit(1);
}

const now = Date.now();
const at = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();

// --- what the store publishes, installed as if from the store ---------------
const STORE = fileURLToPath(new URL('../store/', import.meta.url));

function bundles(kind) {
	const dir = join(STORE, kind, 'bundles');
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

const personas = bundles('personas').map((bundle, i) => ({
	id: `seed-persona-${bundle.id}`,
	name: bundle.persona.name,
	tagline: bundle.persona.tagline ?? '',
	avatarColor: bundle.persona.avatar?.color ?? '#888780',
	avatarGlyph: bundle.persona.avatar?.kind === 'glyph' ? bundle.persona.avatar.id : undefined,
	systemPrompt: bundle.persona.systemPrompt,
	greeting: bundle.persona.greeting,
	modelName: '',
	suggestions: bundle.persona.suggestions,
	tags: bundle.persona.tags,
	webSearch: bundle.persona.webSearch,
	source: { origin: 'official', id: bundle.id, revision: bundle.revision ?? 1 },
	createdAt: at(60 * 24 * (i + 3)),
	updatedAt: at(60 * (i + 2))
}));

const playbooks = bundles('playbooks').map((bundle, i) => ({
	id: `seed-playbook-${bundle.id}`,
	name: bundle.playbook.name,
	summary: bundle.playbook.summary ?? '',
	instructions: bundle.playbook.instructions,
	tags: bundle.playbook.tags,
	source: { origin: 'official', id: bundle.id, revision: bundle.revision ?? 1 },
	createdAt: at(60 * 24 * (i + 2)),
	updatedAt: at(60 * (i + 1))
}));

// One of each edited, so the "edited" badge and the "put the published text
// back" button have something to be about.
if (playbooks[0]) {
	playbooks[0].instructions += '\n\n## My own addition\n\nAlways answer in metric units.';
	playbooks[0].summary += ' (my version)';
}

const knowledge = [
	{
		id: 'seed-knowledge-lease',
		name: 'Lease renewal letter',
		content:
			'Dear tenant,\n\nYour lease at 14 rue des Lilas ends on 30 September. Renewal is automatic unless notice is given in writing at least three months before that date. The rent will be indexed to the reference index published for the second quarter.\n\nReference: BAIL-2026-0142.',
		createdAt: at(60 * 24 * 5),
		updatedAt: at(60 * 24 * 5)
	},
	{
		id: 'seed-knowledge-router',
		name: 'Router model notes',
		content:
			'Model: UDM-Pro. Firmware 4.2.1. Two SSIDs, one 2.4 GHz only for the older plugs. The freezer sensor is on the 2.4 GHz network and has dropped out twice since the firmware update.',
		createdAt: at(60 * 24 * 4),
		updatedAt: at(60 * 24 * 4)
	}
];

// --- conversations, one per thing worth looking at --------------------------
const msg = (role, content, extra = {}) => ({ role, content, ...extra });

const sessions = [
	{
		id: 'seed-session-plain',
		title: 'Vélo qui déraille en montée',
		updatedAt: at(12),
		messages: [
			msg('user', 'Mon vélo déraille dès que je monte une côte. Par où je commence ?', {
				createdAt: at(20)
			}),
			msg(
				'assistant',
				"Par le réglage du dérailleur arrière, presque toujours. Sous charge, une chaîne saute quand la butée basse ou la tension du câble a bougé.\n\nVérifie dans cet ordre :\n\n1. Le galet supérieur est-il aligné avec le pignon sélectionné, vélo au repos ?\n2. Le câble a-t-il du mou quand tu es sur le plus petit pignon ?\n3. La patte de dérailleur est-elle droite ? Un coup de guidon au sol suffit à la tordre.\n\nSi c'est la patte, rien d'autre ne se réglera correctement tant qu'elle est faussée.",
				{ createdAt: at(19) }
			),
			msg('user', 'La patte a l’air un peu tordue effectivement.', { createdAt: at(14) }),
			msg(
				'assistant',
				"Alors c'est là. Une patte tordue se redresse avec un outil dédié, et se casse assez volontiers si on la force à la main : elle est en aluminium tendre exprès, pour céder avant le cadre.\n\nEn atelier c'est dix minutes. Si tu veux essayer toi-même, achète une patte de rechange en même temps, sur le modèle exact du cadre.",
				{ createdAt: at(12) }
			)
		]
	},
	{
		id: 'seed-session-compacted',
		title: 'Levain qui ne double plus',
		updatedAt: at(90),
		messages: [
			msg('user', 'Mon levain a arrêté de doubler après une semaine où tout allait bien.', {
				createdAt: at(200)
			}),
			msg(
				'assistant',
				'Quelle température fait-il là où il est posé, et as-tu changé de farine ?',
				{
					createdAt: at(199)
				}
			),
			msg('user', 'Il est passé de 24 °C à 18 °C, la farine n’a pas changé.', {
				createdAt: at(198)
			}),
			{
				role: 'system',
				content:
					'## Task\nTroubleshoot a sourdough starter that stopped doubling after a week of success.\n\n## Decisions\n- Cause identified as a temperature drop (24 °C → 18 °C), which slows fermentation rather than stopping it.\n- Fix: either lower the feeding ratio to 1:2:2, or raise the ambient temperature (oven with the light on, around 26 °C).\n\n## Facts and constraints\n- Previous temperature: 24 °C. Current: 18 °C.\n- Flour and routine unchanged.',
				createdAt: at(150),
				note: {
					kind: 'compaction',
					generatedAt: at(150),
					replacedCount: 3,
					model: 'google/gemma-4-31b-it',
					automatic: false
				}
			},
			msg('user', 'J’ai mis le four avec la lumière allumée, il a doublé en 5 h.', {
				createdAt: at(95)
			}),
			msg(
				'assistant',
				"C'était bien la température. À 26 °C tu es dans la zone confortable des levains, et cinq heures est un délai normal.\n\nGarde le ratio 1:2:2 tant que tu es au four : plus de farine que de levain ralentit la montée et t'évite de rater le pic.",
				{ createdAt: at(90) }
			)
		]
	},
	{
		id: 'seed-session-cleared',
		title: 'Devis isolation des combles',
		updatedAt: at(300),
		messages: [
			msg('user', 'Trois devis pour l’isolation des combles, je te les résume.', {
				createdAt: at(400)
			}),
			msg('assistant', 'Vas-y, donne-moi les montants et l’épaisseur proposée pour chacun.', {
				createdAt: at(399)
			}),
			msg('user', 'Le premier est à 4 200 € pour 30 cm de laine soufflée.', {
				createdAt: at(398)
			}),
			{
				role: 'system',
				content: '',
				createdAt: at(320),
				note: { kind: 'cleared', generatedAt: at(320), replacedCount: 3 }
			},
			msg('user', 'On repart de zéro : quelle épaisseur vise-t-on en combles perdus ?', {
				createdAt: at(305)
			}),
			msg(
				'assistant',
				"En combles perdus, la référence est une résistance thermique d'environ 7 m²·K/W, ce qui donne 30 à 35 cm de laine soufflée selon le produit.\n\nEn dessous de 30 cm, tu perds l'essentiel du bénéfice et souvent l'éligibilité aux aides.",
				{ createdAt: at(300) }
			)
		]
	},
	{
		id: 'seed-session-playbooks',
		title: 'Menus de la semaine',
		updatedAt: at(45),
		playbookIds: ['seed-playbook-weekly-meals'],
		messages: [
			msg('user', 'On est quatre, il me reste un chou, des œufs et du riz.', { createdAt: at(60) }),
			{
				role: 'system',
				content: '',
				createdAt: at(50),
				note: { kind: 'playbooks', generatedAt: at(50) }
			},
			msg(
				'assistant',
				'Avec le chou, les œufs et le riz, tu as déjà deux soirs. Dis-moi combien de soirs sont vraiment à cuisiner cette semaine et combien de temps tu as en semaine, et je te fais le tableau et la liste de courses.',
				{ createdAt: at(45) }
			)
		]
	},
	{
		id: 'seed-session-context',
		title: 'Sauvegardes du NAS',
		updatedAt: at(180),
		messages: [
			msg('user', 'Je veux une vraie stratégie de sauvegarde pour le NAS, pas juste un RAID.', {
				createdAt: at(240)
			}),
			msg(
				'assistant',
				"Le RAID n'est pas une sauvegarde : il protège d'un disque mort, pas d'une suppression, d'un chiffrement ou d'un dégât des eaux.\n\nLa règle utile est 3-2-1 : trois copies, sur deux supports différents, dont une hors du logement. Le NAS compte pour une.",
				{ createdAt: at(239) }
			),
			{
				role: 'system',
				content: '',
				createdAt: at(180),
				note: {
					kind: 'context',
					generatedAt: at(180),
					tokens: 1180,
					limit: 8192,
					limitSource: 'threshold',
					systemTokens: 96,
					messageTokens: 1084,
					sourceTokens: 0,
					messageCount: 2,
					totalCount: 2,
					heaviest: {
						role: 'assistant',
						tokens: 1060,
						preview: "Le RAID n'est pas une sauvegarde : il protège d'un disque mort, pas d'une…"
					},
					model: 'google/gemma-4-31b-it'
				}
			}
		]
	},
	{
		id: 'seed-session-nova',
		title: 'Nova',
		personaId: 'seed-persona-nova',
		updatedAt: at(30),
		messages: [
			msg('assistant', 'Hi! What can I help you with today?', { createdAt: at(240) }),
			msg('user', 'Rappelle-moi de sortir les poubelles le mardi soir.', { createdAt: at(200) }),
			msg(
				'assistant',
				"Noté : poubelles le mardi soir. Je n'ai pas de minuteur à moi, donc si tu veux une vraie alerte, mets-la sur ton téléphone — je peux te rédiger le rappel si tu me dis à quelle heure.",
				{ createdAt: at(199) }
			),
			{
				role: 'system',
				content: '',
				createdAt: at(30),
				note: {
					kind: 'mention',
					generatedAt: at(30),
					sessionId: 'seed-session-plain',
					title: 'Vélo qui déraille en montée',
					asked: '@Nova tu retiens que la patte de dérailleur est à changer ?',
					answered:
						'Oui : patte de dérailleur faussée, à remplacer sur le modèle exact du cadre, et acheter une pièce de rechange en même temps.'
				}
			}
		]
	}
];

// Nova's conversation is the one she is bound to, which is what puts her in the
// sidebar under the conversations she has had.
const nova = personas.find((p) => p.id === 'seed-persona-nova');
if (nova) nova.sessionId = 'seed-session-nova';

// --- a model everything can actually run on --------------------------------
//
// Seeded conversations used to arrive with no model, which looks fine in a list
// and is a dead end the moment you answer in one. So one is picked from what
// this instance really offers, shared models first, since in server mode those
// are the ones a user may pick.
const pickModel = () => {
	const shared = db
		.prepare(
			`SELECT sm.model_name AS name, sm.server_id AS serverId
			 FROM shared_models sm JOIN servers s ON s.id = sm.server_id
			 WHERE s.is_enabled = 1
			 ORDER BY sm.model_name LIMIT 1`
		)
		.get();
	if (shared) return { name: shared.name, serverId: shared.serverId };

	const server = db.prepare('SELECT id FROM servers WHERE is_enabled = 1 LIMIT 1').get();
	return server ? { name: '', serverId: server.id } : undefined;
};

const model = pickModel();
if (model?.name) {
	for (const session of sessions) session.model = model;
	// A persona with no model of its own falls back to yours, which is what these
	// are meant to demonstrate.
	for (const persona of personas) if (persona.modelName) persona.modelName = model.name;
} else {
	console.warn(
		'[seed] No enabled connection with a shared model: conversations are seeded without one, and you will have to pick a model before you can answer in them.'
	);
}

// --- write ------------------------------------------------------------------
const upsert = (table, item) =>
	db
		.prepare(
			`INSERT INTO ${table} (id, user_id, data, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
		)
		.run(item.id, user.id, JSON.stringify(item), item.updatedAt ?? new Date().toISOString());

db.exec('BEGIN');
try {
	for (const persona of personas) upsert('personas', persona);
	for (const playbook of playbooks) upsert('playbooks', playbook);
	for (const item of knowledge) upsert('knowledge', item);
	for (const session of sessions) upsert('sessions', session);
	db.exec('COMMIT');
} catch (error) {
	db.exec('ROLLBACK');
	throw error;
}

// The index and the marker table are derived from the conversations, and the app
// fills them as it writes. Seeding behind its back means filling them here.
for (const session of sessions) {
	db.prepare('DELETE FROM sessions_fts WHERE session_id = ?').run(session.id);
	db.prepare('DELETE FROM session_markers WHERE session_id = ?').run(session.id);
}
db.exec(`
	INSERT INTO sessions_fts (content, session_id, user_id, message_index, role)
	SELECT json_extract(m.value, '$.content'), s.id, s.user_id, m.key, json_extract(m.value, '$.role')
	FROM sessions s, json_each(s.data, '$.messages') m
	WHERE s.id LIKE 'seed-session-%'
	  AND json_extract(m.value, '$.content') IS NOT NULL
	  AND json_extract(m.value, '$.content') <> ''
`);
db.exec(`
	INSERT INTO session_markers (session_id, user_id, message_index, kind)
	SELECT s.id, s.user_id, m.key, json_extract(m.value, '$.note.kind')
	FROM sessions s, json_each(s.data, '$.messages') m
	WHERE s.id LIKE 'seed-session-%'
	  AND json_extract(m.value, '$.note.kind') IN ('cleared', 'compaction')
`);

console.log(
	`Seeded ${user.email}: ${sessions.length} conversations, ${personas.length} personas, ` +
		`${playbooks.length} playbooks, ${knowledge.length} documents.`
);
