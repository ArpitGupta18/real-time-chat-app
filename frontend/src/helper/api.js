import { http } from "./http";

export async function createGroup(name, creatorId) {
	const data = await http.post("/rooms", { name, creatorId });
	console.log("Data:", data);
	return data;
}

export async function ensureDirect(userAId, userBId) {
	const data = await http.post("/rooms/direct", { userAId, userBId });
	return data;
}

export async function listMyRooms(userId) {
	const data = await http.get(`/rooms/mine/${userId}`);
	return data;
}

export async function inviteToRoom(roomId, { username, userId }) {
	const data = await http.post(`/rooms/${roomId}/invite`, {
		username,
		userId,
	});
	return data;
}
