import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { MatchRoom } from "./rooms/MatchRoom";

const PORT = Number(process.env.PORT || 2567);
const app = express();
app.use(cors());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "pixel-dynasty-server", version: "0.3.0" });
});

const server = http.createServer(app);
const gameServer = new Server({ server });

gameServer.define("match", MatchRoom).filterBy(["roomCode"]);

gameServer.listen(PORT).then(() => {
  console.log(`Pixel Dynasty Colyseus server listening on port ${PORT}`);
});
