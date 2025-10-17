import { sequelize } from "../db/sequelize.js";
import { User } from "./User.js";
import { Room } from "./Room.js";
import { Message } from "./Message.js";
import { UserRoom } from "./UserRoom.js";

User.belongsToMany(Room, { through: UserRoom, foreignKey: "user_id" });
Room.belongsToMany(User, { through: UserRoom, foreignKey: "room_id" });

Message.belongsTo(User, { as: "sender", foreignKey: "sender_id" });
User.hasMany(Message, { as: "sentMessages", foreignKey: "sender_id" });

Message.belongsTo(Room, { foreignKey: "room_id" });
Room.hasMany(Message, { foreignKey: "room_id" });

export async function syncModels() {
	await sequelize.sync({ alter: true });
	console.log("All models were synchronized successfully.");
}

export { sequelize, User, Room, Message, UserRoom };
