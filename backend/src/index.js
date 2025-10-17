import express from "express";
import cors from "cors";
import { createServer } from "http";

import roomsRouter from "./routes/rooms.routes.js";

import dotenv from "dotenv";
dotenv.config();

import { testConnection } from "./db/sequelize.js";
import { syncModels } from "./models/index.js";
import { attachSocket } from "./sockets/chat.js";

const app = express();
app.use(express.json());
app.use(
	cors({
		origin: process.env.CLIENT_ORIGIN,
		credentials: true,
	})
);

app.use("/api/rooms", roomsRouter);

app.get("/health", (_, res) => {
	res.json({ ok: true });
});

const httpServer = createServer(app);

async function bootstrap() {
	await testConnection();
	await syncModels();

	attachSocket(httpServer, process.env.CLIENT_ORIGIN, app);

	const PORT = Number(process.env.PORT) || 3000;
	httpServer.listen(PORT, () => {
		console.log(`Server is running on http://localhost:${PORT}`);
	});
}

bootstrap().catch((e) => {
	console.error("Startup error:", e);
	process.exit(1);
});
