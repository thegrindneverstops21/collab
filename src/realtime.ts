import { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "./config/env";
import { pool } from "./db/pool";
import { activity } from "./modules/workflow/workflow.service";

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 8192 });
  const sessions = new Map<WebSocket, {userId: string; expires: number}>();
  wss.on("connection", socket => {
    const timeout = setTimeout(() => socket.close(1008,"Authentication required"),5000);
    socket.on("error", () => socket.terminate());
    socket.once("message", async raw => {
      try {
        const input = z.object({type:z.literal("authenticate"),token:z.string()}).parse(JSON.parse(raw.toString()));
        const payload = jwt.verify(input.token,env.jwtSecret,{algorithms:["HS256"]});
        if(typeof payload === "string" || !z.string().uuid().safeParse(payload.sub).success || !payload.exp) throw new Error("Invalid token");
        const user = await pool.query("SELECT id FROM users WHERE id=$1",[payload.sub]);
        if(!user.rows[0]) throw new Error("Account not found");
        if(socket.readyState !== WebSocket.OPEN) return;
        sessions.set(socket,{userId:user.rows[0].id,expires:payload.exp*1000});
        clearTimeout(timeout); socket.send(JSON.stringify({type:"authenticated"}));
      } catch { socket.close(1008,"Invalid or expired token"); }
    });
    socket.on("close", () => {clearTimeout(timeout); sessions.delete(socket);});
  });
  const publish = (notification: {user_id:string}) => {
    for(const [socket,session] of sessions) {
      if(session.expires <= Date.now()) {socket.close(1008,"Token expired"); continue;}
      if(session.userId === notification.user_id && socket.readyState === WebSocket.OPEN) {
        if(socket.bufferedAmount > 1024*1024) {socket.terminate(); continue;}
        socket.send(JSON.stringify({type:"notification",notification}));
      }
    }
  };
  activity.on("notification",publish);
  const expiry = setInterval(() => {
    for(const [socket,session] of sessions) if(session.expires <= Date.now()) socket.close(1008,"Token expired");
  },1000);
  expiry.unref();
  wss.on("close",() => {clearInterval(expiry);activity.off("notification",publish);});
  return wss;
}
