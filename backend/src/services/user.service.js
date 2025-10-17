import { User } from "../models/index.js";

export async function findOrCreateUserById(id, usernameIfNew) {
	if (id) {
		const existing = await User.findByPk(id);
		if (existing) return existing;
	}

	return User.create({ username: usernameIfNew });
}

export async function setOnline(userId, online) {
	await User.update({ is_online: online }, { where: { id: userId } });
}
