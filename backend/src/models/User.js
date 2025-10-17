import { DataTypes } from "sequelize";
import { sequelize } from "../db/sequelize.js";
import { randomUUID } from "crypto";

export const User = sequelize.define(
	"User",
	{
		id: {
			type: DataTypes.UUID,
			primaryKey: true,
			defaultValue: () => randomUUID(),
		},
		username: {
			type: DataTypes.STRING(50),
			unique: true,
			allowNull: false,
			validate: { len: [3, 50] },
		},
		is_online: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
		},
	},
	{
		tableName: "users",
		indexes: [{ unique: true, fields: ["username"] }],
	}
);
