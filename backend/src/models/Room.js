import { DataTypes } from "sequelize";
import { sequelize } from "../db/sequelize.js";
import { randomUUID } from "crypto";

export const Room = sequelize.define(
	"Room",
	{
		id: {
			type: DataTypes.UUID,
			primaryKey: true,
			defaultValue: () => randomUUID(),
		},
		name: {
			type: DataTypes.STRING(100),
			allowNull: false,
		},
		is_group: {
			type: DataTypes.BOOLEAN,
			defaultValue: true,
		},
	},
	{
		tableName: "rooms",
	}
);
