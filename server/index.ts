import "dotenv/config";
import express, { Express, Request, Response } from "express";
import { MongoClient } from "mongodb";
import { callAgent } from "./agent";

const app: Express = express();

import cors from "cors";
app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_ATLAS_URI as string);

async function startServer() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 }); // verify if mongo is connected
    console.log("You are in!!");

    app.get("/", (req: Request, res: Response) => {
      res.send("LangGraph Agent Server");
    });

    app.post("/chat", async (req: Request, res: Response) => {
      const initailMessage = req.body.message;
      const threadId = Date.now().toString();
      console.log(initailMessage);

      try {
        const response = await callAgent(client, initailMessage, threadId);
        res.json({ threadId, response });
      } catch (error) {
        console.error("post conversation", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.post("/chat/:threadId", async (req: Request, res: Response) => {
      const { threadId } = req.params;
      const { message } = req.body;

      try {
        const response = await callAgent(client, message, threadId);
        res.json({ response });
      } catch (error) {
        console.error("post chat", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    const PORT = process.env.PORT || 8000;

    app.listen(PORT, () => {
      console.log(`Server running in ${PORT}`);
    });
  } catch (error) {
    console.error("Error conevtion to MongoDb", error);
    process.exit(1);
  }
}

startServer();
