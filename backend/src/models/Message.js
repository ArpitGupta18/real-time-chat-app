import { DataTypes } from "sequelize";
import { sequelize } from "../db/sequelize.js";
import { randomUUID } from "crypto";

export const Message = sequelize.define(
	"Message",
	{
		id: {
			type: DataTypes.UUID,
			primaryKey: true,
			defaultValue: () => randomUUID(),
		},
		content: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
		type: {
			type: DataTypes.ENUM("text", "system"),
			allowNull: false,
			defaultValue: "text",
		},
		meta: {
			type: DataTypes.JSONB,
			allowNull: true,
		},
	},
	{
		tableName: "messages",
		indexes: [{ fields: ["created_at"] }],
	}
);
