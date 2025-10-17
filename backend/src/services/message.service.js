import { Message, User } from "../models/index.js";

export async function createMessage({ roomId, senderId, content }) {
	const created = await Message.create({
		room_id: roomId,
		sender_id: senderId,
		content,
	});

	console.log("Created:", created);
	const populated = await Message.findByPk(created.id, {
		attributes: ["id", "content", "created_at", "type", "meta", "room_id"],
		include: [
			{ model: User, as: "sender", attributes: ["id", "username"] },
		],
	});

	console.log("Populated:", populated);

	return populated;
}

export async function getRecentMessages(roomId, limit = 50) {
	return Message.findAll({
		where: { room_id: roomId },
		order: [["created_at", "ASC"]],
		limit,
		attributes: ["id", "content", "created_at", "type", "meta", "room_id"],
		include: [
			{ model: User, as: "sender", attributes: ["id", "username"] },
		],
	});
}
