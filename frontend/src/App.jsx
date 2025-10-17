import { useState, useEffect } from "react";
import { socketApi } from "./helper/socketApi";
import {
	listMyRooms,
	createGroup,
	inviteToRoom,
	ensureDirectRoom,
	findUserByUsername,
} from "./helper/api";

const App = () => {
	const [user, setUser] = useState(null);
	const [rooms, setRooms] = useState([]);
	const [activeRoom, setActiveRoom] = useState(null);
	const [messages, setMessages] = useState([]);
	const [text, setText] = useState("");

	useEffect(() => {
		(async () => {
			const raw = localStorage.getItem("userId");
			const savedId =
				raw && raw !== "null" && raw !== "undefined" ? raw : null;

			let username = null;

			if (!savedId) {
				while (!username) {
					const ask = window.prompt("Pick a username (min 3 chars):");
					if (ask === null) return;
					const clean = ask.trim();
					if (clean.length >= 3) username = clean;
				}
			}

			try {
				const res = await socketApi.registerUser({
					userId: savedId,
					username,
				});
				localStorage.setItem("userId", res.user.id);
				localStorage.setItem("username", res.user.username);
				setUser(res.user);
			} catch (e) {
				alert(e.message || "Registration failed");
			}
		})();

		// (async () => {
		// 	const savedId = localStorage.getItem("userId");
		// 	const username = savedId ? null : prompt("Pick a username");

		// 	try {
		// 		const res = await socketApi.registerUser({
		// 			userId: savedId,
		// 			username,
		// 		});
		// 		setUser(res.user);
		// 		localStorage.setItem("userId", res.user.id);
		// 	} catch (e) {
		// 		alert("Failed to register");
		// 	}
		// })();
	}, []);

	useEffect(() => {
		if (!user) return;
		(async () => {
			try {
				const res = await listMyRooms(user?.id);
				if (res.ok) setRooms(res.rooms);
			} catch (e) {
				alert("Failed to fetch rooms");
			}
		})();
	}, [user]);

	useEffect(() => {
		const onHistory = ({ roomId, history }) => {
			if (!activeRoom || roomId !== activeRoom.id) return;
			setMessages(history);

			const last = history.length ? history[history.length - 1] : null;
			if (last) {
				setRooms((prev) => {
					const next = prev.map((r) =>
						r.id === roomId ? { ...r, lastMessage: last } : r
					);

					return next.sort(
						(a, b) =>
							new Date(b.lastMessage?.created_at || 0) -
							new Date(a.lastMessage?.created_at || 0)
					);
				});
			}
		};

		const onReceive = ({ roomId, message }) => {
			if (!activeRoom || roomId !== activeRoom.id) return;
			setMessages((m) => [...m, message]);

			setRooms((prev) => {
				const next = prev.map((r) =>
					r.id === roomId ? { ...r, lastMessage: message } : r
				);

				return next.sort(
					(a, b) =>
						new Date(b.lastMessage?.created_at || 0) -
						new Date(a.lastMessage?.created_at || 0)
				);
			});
		};

		const onUserJoined = ({ roomId, user }) => {
			if (!activeRoom || roomId !== activeRoom.id) return;

			const name = user?.username ?? user?.id?.slice(0, 6) ?? "someone";
			setMessages((m) => [
				...m,
				{
					id: `sys-j-${Date.now()}`,
					content: `${name} joined`,
					sender: null,
					meta: {
						kind: "join",
					},
				},
			]);

			setRooms((prev) =>
				prev.map((r) =>
					r.id === roomId
						? {
								...r,
								lastMessage: {
									content: `${name} joined`,
									type: "system",
									meta: { kind: "join" },
									created_at: new Date().toISOString(),
									sender: null,
								},
						  }
						: r
				)
			);
		};

		const onUserLeft = ({ roomId, user }) => {
			if (!activeRoom || roomId !== activeRoom.id) return;
			const name = user?.username ?? user?.id?.slice(0, 6) ?? "someone";
			setMessages((m) => [
				...m,
				{
					id: `sys-l-${Date.now()}`,
					content: `${name} left`,
					sender: null,
					meta: {
						kind: "leave",
					},
				},
			]);

			setRooms((prev) =>
				prev.map((r) =>
					r.id === roomId
						? {
								...r,
								lastMessage: {
									content: `${name} left`,
									type: "system",
									meta: { kind: "leave" },
									created_at: new Date().toISOString(),
									sender: null,
								},
						  }
						: r
				)
			);
		};

		socketApi.socket.on("chat_history", onHistory);
		socketApi.socket.on("receive_message", onReceive);
		socketApi.socket.on("user_joined_room", onUserJoined);
		socketApi.socket.on("user_left_room", onUserLeft);

		return () => {
			socketApi.socket.off("chat_history", onHistory);
			socketApi.socket.off("receive_message", onReceive);
			socketApi.socket.off("user_joined_room", onUserJoined);
			socketApi.socket.off("user_left_room", onUserLeft);
		};
	}, [activeRoom?.id]);

	const joinRoom = async (room) => {
		try {
			if (activeRoom && activeRoom.id !== room.id) {
				await socketApi.switchRoom({ roomId: activeRoom.id });
			}
			setActiveRoom(room);
			await socketApi.joinRoom({ roomId: room.id });
		} catch (e) {
			alert("Failed to join room");
		}
	};

	const leaveActiveRoom = async () => {
		if (!activeRoom) return;
		try {
			await socketApi.leaveRoom({ roomId: activeRoom.id });
			const res = await listMyRooms(user.id);
			if (res.ok) setRooms(res.rooms);
			setActiveRoom(null);
			setMessages([]);
		} catch {
			alert("Failed to leave room");
		}
	};

	const send = async (e) => {
		e.preventDefault();
		if (!text.trim() || !activeRoom) return;
		try {
			await socketApi.sendMessage({
				roomId: activeRoom.id,
				content: text.trim(),
			});
			setText("");
		} catch (e) {
			alert("Failed to send message");
		}
	};

	const addDirectUser = async () => {
		const targetName = prompt("Start chat with username:");
		if (!targetName?.trim()) return;
		try {
			const find = await findUserByUsername(targetName.trim());
			if (!find.ok || !find.user) return alert("User not found");

			const targetUser = find.user;

			const res = await ensureDirectRoom(user.id, targetUser.id);
			if (!res.ok) return alert(res.error || "Failed to create DM");

			const room = {
				...res.room,
				is_group: false,
				displayName: targetUser.username,
			};

			await socketApi.joinRoom({ roomId: room.id });

			const updated = await listMyRooms(user.id);
			if (updated.ok) setRooms(updated.rooms);
			// setRooms((prev) => [room, ...prev.filter((r) => r.id !== room.id)]);
			setActiveRoom(room);
		} catch (e) {
			console.error(e);
			alert("Failed to start DM");
		}
	};

	const createSampleGroup = async () => {
		const name = prompt("Group name?");
		if (!name?.trim()) return;

		try {
			const res = await createGroup(name.trim(), user.id);
			if (res.ok) {
				const r = await listMyRooms(user.id);
				if (r.ok) setRooms(r.rooms);
			}
		} catch (e) {
			alert("Failed to create group");
		}
	};

	const inviteUserToActiveRoom = async () => {
		if (!activeRoom?.id) return;
		const name = prompt("Invite by username:");
		if (!name?.trim()) return;

		try {
			const res = await inviteToRoom(activeRoom.id, {
				username: name.trim(),
			});
			if (res.ok) {
				alert(`Invited ${res.invited.username}`);

				const r = await listMyRooms(user.id);
				if (r.ok) setRooms(r.rooms);
			} else {
				alert("Invite failed");
			}
		} catch (e) {
			alert("Invite failed");
		}
	};

	if (!user) return <div style={{ padding: 20 }}>Connecting…</div>;

	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "260px 1fr",
				height: "100vh",
				fontFamily: "system-ui",
			}}
		>
			<aside style={{ borderRight: "1px solid #ddd", padding: 12 }}>
				<div style={{ fontWeight: 700, marginBottom: 8 }}>
					Hi, {user.username}
				</div>
				<button onClick={createSampleGroup}>+ New group</button>

				<button onClick={addDirectUser} style={{ marginLeft: "8px" }}>
					+ New DM
				</button>

				<div style={{ marginTop: 12, fontWeight: 600 }}>My rooms</div>
				<ul style={{ listStyle: "none", padding: 0 }}>
					{rooms.map((r) => {
						const previewUser =
							r.lastMessage?.sender?.username ?? null;
						const previewText = r.lastMessage?.content ?? "";
						return (
							<li key={r.id}>
								<button
									style={{
										width: "100%",
										textAlign: "left",
										padding: "8px 6px",
										background:
											activeRoom?.id === r.id
												? "#eef"
												: "transparent",
									}}
									onClick={() => joinRoom(r)}
								>
									<div style={{ fontWeight: 600 }}>
										{r.is_group
											? r.name
											: r.displayName ||
											  "Direct Message"}{" "}
										{r.members && r.is_group
											? `· ${r.members}`
											: ""}
									</div>

									{previewText ? (
										<div
											style={{
												fontSize: 12,
												color: "#666",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{previewUser
												? `${previewUser}: `
												: ""}
											{previewText}
										</div>
									) : (
										<div
											style={{
												fontSize: 12,
												color: "#999",
											}}
										>
											No messages yet
										</div>
									)}
								</button>
							</li>
						);
					})}
				</ul>
			</aside>

			<main style={{ display: "flex", flexDirection: "column" }}>
				<div
					style={{
						padding: 12,
						borderBottom: "1px solid #ddd",
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					{activeRoom ? (
						<b>{activeRoom.displayName || activeRoom.name}</b>
					) : (
						"Select a room"
					)}

					<div>
						{activeRoom?.is_group && (
							<button
								onClick={inviteUserToActiveRoom}
								className="me-4"
							>
								Invite
							</button>
						)}
						{activeRoom && (
							<button onClick={leaveActiveRoom}>Leave</button>
						)}
					</div>
				</div>

				<div
					style={{
						flex: 1,
						padding: 12,
						overflow: "auto",
						background: "#fafafa",
					}}
				>
					{activeRoom ? (
						messages.map((m) => {
							const isSystem =
								m.type === "system" || m.sender == null;
							const kind = m.meta?.kind ?? m.kind;
							const systemStyle = {
								textAlign: "center",
								fontStyle: "italic",
								color:
									kind === "join" || kind === "invite_join"
										? "#15803d"
										: "#dc2626",
								margin: "6px 0",
							};
							return (
								<div
									key={m.id ?? Math.random()}
									style={{ marginBottom: 6 }}
								>
									{isSystem ? (
										<div style={systemStyle}>
											{m.content}
										</div>
									) : (
										<>
											<span
												style={{
													color: "#555",
													marginRight: 6,
												}}
											>
												{m.sender?.username ?? "system"}
												:
											</span>
											<span>{m.content}</span>
										</>
									)}
								</div>
							);
						})
					) : (
						<div style={{ color: "#666" }}>No room selected</div>
					)}
				</div>

				<form
					onSubmit={send}
					style={{
						padding: 12,
						borderTop: "1px solid #ddd",
						display: "flex",
						gap: 8,
					}}
				>
					<input
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder="Type a message…"
						style={{ flex: 1, padding: 8 }}
					/>
					<button disabled={!activeRoom}>Send</button>
				</form>
			</main>
		</div>
	);
};

export default App;
