import { Sequelize } from "sequelize";
import dotenv from "dotenv";
dotenv.config();

const { DB_HOST, DB_NAME, DB_USER, DB_PASS, DB_PORT, NODE_ENV } = process.env;

export const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
	host: DB_HOST,
	port: Number(DB_PORT) || 5432,
	dialect: "postgres",
	logging: false,
	define: {
		underscored: false,
		freezeTableName: false,
		timestamps: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
	},
	pool: { max: 10, min: 0, idle: 10_000 },
});

export async function testConnection() {
	await sequelize.authenticate();
	console.log("Database connected");
}
