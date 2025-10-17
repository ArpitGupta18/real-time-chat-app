import { DataTypes } from "sequelize";
import { sequelize } from "../db/sequelize.js";

export const UserRoom = sequelize.define(
	"UserRoom",
	{
		joined_at: {
			type: DataTypes.DATE,
			defaultValue: DataTypes.NOW,
		},
	},
	{
		tableName: "user_rooms",
		timestamps: false,
		indexes: [{ unique: true, fields: ["user_id", "room_id"] }],
	}
);
