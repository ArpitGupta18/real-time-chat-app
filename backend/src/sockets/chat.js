import { Server } from "socket.io";
import { findOrCreateUserById, setOnline } from "../services/user.service.js";
import {
	addUserToRoom,
	ensureDirectRoom,
	getUserRooms,
	removeUserFromRoom,
} from "../services/room.service.js";
import {
	createMessage,
	getRecentMessages,
} from "../services/message.service.js";
import { User, UserRoom, Message } from "../models/index.js";

export function attachSocket(server, clientOrigin, app) {
	const io = new Server(server, {
		cors: {
			origin: clientOrigin,
			methods: ["GET", "POST"],
		},
		connectionStateRecovery: {
			maxDisconnectionDuration: 60_000,
			skipMiddlewares: true,
		},
	});

	const session = new Map();

	io.on("connection", (socket) => {
		console.log(`\nSocket connected: ${socket.id}\n`);

		const session = app.get("session");
		// 1. register: from client we send either saved userId OR new username
		socket.on("register_user", async (payload, ack) => {
			try {
				const { userId, username } = payload || {};

				// if client claims an id, try to use it; if not found, DON'T silently create a new account
				if (userId) {
					const existing = await User.findByPk(userId);
					if (existing) {
						socket.data.userId = existing.id;
						session.set(socket.id, existing.id);
						await setOnline(existing.id, true);
						const rooms = await getUserRooms(existing.id);
						rooms.forEach((r) => socket.join(r.id));
						return ack?.({ ok: true, user: existing });
					}
					// id was bad: fail fast (prevents identity drift)
					return ack?.({ ok: false, error: "invalid_user_id" });
				}

				// no id → first-time registration, require a username
				const name = (username || "").trim();
				if (name.length < 3)
					return ack?.({ ok: false, error: "username_required" });

				const created = await User.create({ username: name });
				session.set(socket.id, created.id);
				await setOnline(created.id, true);
				ack?.({ ok: true, user: created });
			} catch (e) {
				ack?.({ ok: false, error: "register_failed" });
			}
		});

		// 2. join a room (group)
		socket.on("join_room", async ({ roomId }, ack) => {
			const userId = session.get(socket.id);
			if (!userId) return ack?.({ ok: false, error: "not_registered" });
			await addUserToRoom(userId, roomId);
			socket.join(roomId);

			const history = await getRecentMessages(roomId, 50);
			socket.emit("chat_history", {
				roomId,
				history: history.map((m) => ({
					id: m.id,
					content: m.content,
					created_at: m.created_at,
					sender: m.sender
						? { id: m.sender.id, username: m.sender.username }
						: null,
					kind: m.meta?.kind,
				})),
			});

			const user = await User.findByPk(userId, {
				attributes: ["id", "username"],
			});
			// socket.to(roomId).emit("user_joined_room", {
			// 	roomId,
			// 	user: user
			// 		? { id: user.id, username: user.username }
			// 		: { id: userId },
			// });

			ack?.({ ok: true });
		});

		socket.on("switch_room", async ({ roomId }, ack) => {
			try {
				socket.leave(roomId);
				ack?.({ ok: true });
			} catch (e) {
				ack?.({ ok: false, error: "switch_failed" });
			}
		});

		// 3. leave a room (explicit)
		socket.on("leave_room", async ({ roomId }, ack) => {
			try {
				const userId = socket.data.userId ?? session.get(socket.id);
				console.log("leave_room 1");
				console.log(userId);
				if (!userId)
					return ack?.({ ok: false, error: "not_registered" });

				console.table("leave_room 2");
				const user = await User.findByPk(userId, {
					attributes: ["id", "username"],
				});

				console.log(user.username);
				await Message.create({
					room_id: roomId,
					sender_id: null,
					type: "system",
					content: `${user?.username ?? "Someone"} left`,
					meta: {
						kind: "leave",
						user: { id: user.id, username: user.username },
					},
				});

				console.log("hereee");
				const result = await removeUserFromRoom(userId, roomId, {
					destroyEmptyRooms: true,
					groupsOnly: true,
				});

				socket.leave(roomId);

				if (!result.roomDeleted) {
					const user = await User.findByPk(userId, {
						attributes: ["id", "username"],
					});
					socket.to(roomId).emit("user_left_room", {
						roomId,
						user: user
							? { id: user.id, username: user.username }
							: { id: userId },
					});
				}

				console.log("Result:", result);
				ack?.({ ok: true, ...result });
			} catch (e) {
				ack?.({ ok: false, error: "leave_room_failed" });
			}
		});

		// socket.on("leave_room", async ({ roomId }, ack) => {
		// 	// minimal validation up front
		// 	if (!roomId) return ack?.({ ok: false, error: "room_required" });

		// 	try {
		// 		const userId =
		// 			socket.data.userId ?? app.get("session")?.get(socket.id);
		// 		console.log(
		// 			"[leave_room] socket.id =",
		// 			socket.id,
		// 			"userId =",
		// 			userId,
		// 			"roomId =",
		// 			roomId
		// 		);

		// 		if (!userId) {
		// 			console.warn(
		// 				"[leave_room] missing userId (not registered yet?)"
		// 			);
		// 			return ack?.({ ok: false, error: "not_registered" });
		// 		}

		// 		// try to fetch user (for username)
		// 		let user = null;
		// 		try {
		// 			user = await User.findByPk(userId, {
		// 				attributes: ["id", "username"],
		// 			});
		// 			console.log(
		// 				"[leave_room] fetched user =",
		// 				user?.toJSON?.() ?? user
		// 			);
		// 		} catch (e) {
		// 			console.error("[leave_room] User.findByPk error:", e);
		// 		}

		// 		// --- persist system message BEFORE membership removal ---
		// 		try {
		// 			const sys = await Message.create({
		// 				room_id: roomId,
		// 				sender_id: null, // allowNull must be true in model/DB
		// 				type: "system", // ENUM must include 'system'
		// 				content: `${user?.username ?? "Someone"} left`,
		// 				meta: {
		// 					kind: "leave",
		// 					user: {
		// 						id: userId,
		// 						username: user?.username ?? null,
		// 					},
		// 				},
		// 			});
		// 			console.log("[leave_group] system message id:", sys.id);
		// 		} catch (e) {
		// 			console.error("[leave_group] Message.create error:", e);
		// 			// Send back the exact reason so you can see it in the client
		// 			return ack?.({
		// 				ok: false,
		// 				error: "message_create_failed",
		// 				details: String(e?.message || e),
		// 			});
		// 		}

		// 		// remove membership (and optionally delete room if now empty)
		// 		let result = null;
		// 		try {
		// 			result = await removeUserFromRoom(userId, roomId, {
		// 				destroyEmptyRooms: true,
		// 				groupsOnly: true,
		// 			});
		// 			console.log("[leave_group] removal result:", result);
		// 		} catch (e) {
		// 			console.error("[leave_group] removeUserFromRoom error:", e);
		// 			return ack?.({
		// 				ok: false,
		// 				error: "remove_membership_failed",
		// 				details: String(e?.message || e),
		// 			});
		// 		}

		// 		socket.leave(roomId);

		// 		if (!result?.roomDeleted) {
		// 			socket.to(roomId).emit("user_left_room", {
		// 				roomId,
		// 				user: { id: userId, username: user?.username ?? null },
		// 			});
		// 		}

		// 		return ack?.({ ok: true, ...result });
		// 	} catch (e) {
		// 		console.error("[leave_group] unexpected error:", e);
		// 		return ack?.({
		// 			ok: false,
		// 			error: "leave_group_failed",
		// 			details: String(e?.message || e),
		// 		});
		// 	}
		// });
		// 4. send a message to a room (scoped)
		socket.on("send_message", async (payload, ack) => {
			const { roomId, content } = payload || {};

			const userId = session.get(socket.id);

			if (!userId || !roomId || !content?.trim()) {
				return ack?.({ ok: false, error: "bad_request" });
			}

			const msg = await createMessage({
				roomId,
				senderId: userId,
				content: content.trim(),
			});

			console.log("Message:", msg);
			io.to(roomId).emit("receive_message", {
				roomId,
				message: {
					id: msg.id,
					content: msg.content,
					created_at: msg.created_at,
					sender: msg.sender
						? { id: msg.sender.id, username: msg.sender.username }
						: null,
				},
			});

			ack?.({
				ok: true,
				message: {
					id: msg.id,
					content: msg.content,
					created_at: msg.created_at,
					sender: msg.sender
						? { id: msg.sender.id, username: msg.sender.username }
						: null,
				},
			});
		});

		socket.on("disconnect", async () => {
			const userId = session.get(socket.id);
			session.delete(socket.id);

			if (userId) await setOnline(userId, false);
			console.log(
				`Socket disconnected: ${socket.id} (userId: ${userId})`
			);
		});
	});

	app.set("io", io);
	app.set("session", session);

	return io;
}
