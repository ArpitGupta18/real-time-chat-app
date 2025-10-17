import { Router } from "express";
import { Room, User, UserRoom, Message } from "../models/index.js";
import { ensureDirectRoom, getUserRooms } from "../services/room.service.js";

const router = Router();

// create a group room
router.post("/", async (req, res) => {
	try {
		const { name, creatorId } = req.body;
		console.log("Name:", name);
		if (!name.trim())
			return res.status(400).json({ ok: false, error: "name_required" });

		const room = await Room.create({
			name: name.trim(),
			is_group: true,
		});

		// add the creator as a member (idempotent if called twice)
		if (creatorId) {
			await UserRoom.findOrCreate({
				where: { user_id: creatorId, room_id: room.id },
			});
		}

		// optional: bump updated_at so it sorts to top
		await Room.update(
			{ updated_at: new Date() },
			{ where: { id: room.id } }
		);

		res.json({ ok: true, room });
	} catch (e) {
		console.error("create group error:", e);
		res.status(500).json({ ok: false, error: "create_failed" });
	}
});

// ensure a direct (1:1) room between two users (by IDs)
router.post("/direct", async (req, res) => {
	try {
		const { userAId, userBId } = req.body;
		if (!userAId || !userBId || userAId === userBId) {
			return res
				.status(400)
				.json({ ok: false, error: "invalid_user_ids" });
		}

		const room = await ensureDirectRoom(userAId, userBId);

		res.json({ ok: true, room });
	} catch (e) {
		res.status(500).json({ ok: false, error: "direct_failed" });
	}
});

// list rooms for a user (basic info + member count)
router.get("/mine/:userId", async (req, res) => {
	try {
		const { userId } = req.params;
		if (!userId) {
			return res.json({ ok: true, rooms: [] });
		}
		// const rooms = await getUserRooms(userId);

		const rooms = await Room.findAll({
			include: [
				{
					model: User,
					attributes: [],
					where: { id: userId },
					through: { attributes: [] },
				},
			],
			order: [["updated_at", "DESC"]],
		});

		const withMeta = await Promise.all(
			rooms.map(async (r) => {
				try {
					const [members, last] = await Promise.all([
						UserRoom.count({ where: { room_id: r.id } }),
						Message.findOne({
							where: { room_id: r.id },
							order: [["created_at", "DESC"]],
							attributes: ["id", "content", "created_at"],
							include: [
								{
									model: User,
									as: "sender",
									attributes: ["id", "username"],
								},
							],
						}),
					]);

					const lastMessage = last
						? {
								id: last.id,
								content: last.content,
								created_at: last.created_at,
								sender: last.sender
									? {
											id: last.sender.id,
											username: last.sender.username,
									  }
									: null,
						  }
						: null;

					return { ...r.toJSON(), members, lastMessage };
				} catch {
					return { ...r.toJSON(), members: null, lastMessage: null };
				}
			})
		);

		// console.log("With meta:", withMeta);

		res.json({ ok: true, rooms: withMeta });
	} catch (e) {
		res.status(500).json({ ok: false, error: "list_failed" });
	}
});

router.post("/:roomId/invite", async (req, res) => {
	try {
		const { roomId } = req.params;
		const { username, userId } = req.body;

		if (!roomId) {
			return res.status(400).json({ ok: false, error: "room_required" });
		}

		if (!username && !userId) {
			return res.status(400).json({ ok: false, error: "user_required" });
		}

		let user = null;
		if (userId) {
			user = await User.findByPk(userId);
		} else if (username) {
			user = await User.findOne({ where: { username } });
		}

		if (!user) {
			return res.status(404).json({ ok: false, error: "user_not_found" });
		}

		await UserRoom.findOrCreate({
			where: { user_id: user.id, room_id: roomId },
		});

		await Message.create({
			room_id: roomId,
			sender_id: null,
			type: "system",
			content: `${user.username} joined`,
			meta: {
				kind: "invite_join",
				user: { id: user.id, username: user.username },
			},
		});
		await Room.update(
			{ updated_at: new Date() },
			{ where: { id: roomId } }
		);

		const io = req.app.get("io");
		if (io) {
			io.to(roomId).emit("user_joined_room", {
				roomId,
				user: { id: user.id, username: user.username },
			});
		}

		const session = req.app.get("session");
		if (io && session) {
			for (const [sid, uid] of session.entries()) {
				if (uid === user.id) {
					const s = io.sockets.sockets.get(sid);
					if (s) s.join(roomId);
				}
			}
		}

		// if (req.app.get("io")) {
		// 	const io = req.app.get("io");
		// 	const session = req.app.get("session");

		// 	for (const [sid, uid] of session.entries()) {
		// 		if (uid === user.id) {
		// 			const s = io.sockets.sockets.get(sid);
		// 			if (s) {
		// 				s.join(roomId);
		// 				s.to(roomId).emit("user_joined_room", {
		// 					roomId,
		// 					user: { id: user.id, username: user.username },
		// 				});
		// 			}
		// 		}
		// 	}
		// }

		return res.json({
			ok: true,
			invited: { id: user.id, username: user.username },
		});
	} catch (e) {
		return res.status(500).json({ ok: false, error: "invite_failed" });
	}
});
export default router;
