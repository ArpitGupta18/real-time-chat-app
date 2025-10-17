import { Op } from "sequelize";
import { sequelize } from "../db/sequelize.js";
import { Room, User, UserRoom } from "../models/index.js";

export async function ensureDirectRoom(userAId, userBId) {
	const [a, b] = [userAId, userBId].sort();
	const syntheticName = `dm:${a}:${b}`;

	let room = await Room.findOne({
		where: { name: syntheticName, is_group: false },
	});

	if (!room) {
		room = await Room.create({ name: syntheticName, is_group: false });
	}

	await Promise.all([
		UserRoom.findOrCreate({ where: { user_id: a, room_id: room.id } }),
		UserRoom.findOrCreate({ where: { user_id: b, room_id: room.id } }),
	]);

	return room;
}

export async function addUserToRoom(userId, roomId) {
	await UserRoom.findOrCreate({
		where: { user_id: userId, room_id: roomId },
	});
}

export async function removeUserFromRoom(
	userId,
	roomId,
	{ destroyEmptyRooms = true, groupsOnly = true } = {}
) {
	return sequelize.transaction(async (t) => {
		await UserRoom.destroy({
			where: { user_id: userId, room_id: roomId },
			transaction: t,
		});

		if (!destroyEmptyRooms) {
			const remaining = await UserRoom.count({
				where: { room_id: roomId },
				transaction: t,
			});
			return { removed: true, remaining, roomDeleted: false };
		}

		if (groupsOnly) {
			const room = await Room.findByPk(roomId, {
				transaction: t,
				attributes: ["id", "is_group"],
			});
			if (!room || !room.is_group) {
				const remaining = await UserRoom.count({
					where: { room_id: roomId },
					transaction: t,
				});
				return { removed: true, remaining, roomDeleted: false };
			}
		}

		const remainingMembers = await UserRoom.findAll({
			where: { room_id: roomId },
			attributes: ["user_id"],
			transaction: t,
			lock: t.LOCK.UPDATE,
		});

		if (remainingMembers.length === 0) {
			await Room.destroy({ where: { id: roomId }, transaction: t });
			return { removed: true, remaining: 0, roomDeleted: true };
		}

		return {
			removed: true,
			remaining: remainingMembers.length,
			roomDeleted: false,
		};
	});
}

export async function getUserRooms(userId) {
	const user = await User.findByPk(userId);
	if (!user) return [];

	return user.getRooms();
}
