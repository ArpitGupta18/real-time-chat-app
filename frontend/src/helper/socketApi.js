import { io } from "socket.io-client";

const socket = io(import.meta.env.VITE_BACKEND_URL);

async function ack(event, payload, { timeoutMs = 5000 } = {}) {
	const res = await new Promise((resolve, reject) => {
		const t = setTimeout(() => {
			reject(new Error(`Ack timeout for ${event}`));
		}, timeoutMs);

		socket.emit(event, payload, (reply) => {
			clearTimeout(t);
			resolve(reply);
		});
	});
	if (!res?.ok) {
		throw new Error(res?.error || `Ack failed: ${event}`);
	}
	return res;
}

export const socketApi = {
	socket,
	registerUser: (p) => ack("register_user", p),
	joinRoom: (p) => ack("join_room", p),
	switchRoom: (p) => ack("switch_room", p),
	leaveRoom: (p) => ack("leave_room", p),
	sendMessage: (p) => ack("send_message", p),
};
