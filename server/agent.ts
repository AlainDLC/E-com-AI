import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from "@langchain/google-genai";
import { StateGraph, Annotation } from "@langchain/langgraph";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";

import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { MongoClient } from "mongodb";
import { z } from "zod"; // scema validation
import "dotenv/config";

async function retryWithBackOff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 429 &&
        attempt < maxRetries
      ) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
        console.error(`Rate limit hit, Retrying in ${delay / 1000} sec`, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }

  throw new Error("Max retries exceeded");
}

export async function callAgent(
  client: MongoClient,
  query: string,
  thread_id: string
) {
  try {
    const dbName = "inventory_database";
    const db = client.db(dbName);
    const collection = db.collection("items");

    const GraphState = Annotation.Root({
      messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
      }),
    });
    // @ts-ignore
    const itemLookUpTool = tool(
      async ({ query, n = 10 }) => {
        try {
          console.log("Item lookup tool called with query", query);

          const totalCount = await collection.countDocuments();
          console.log("Total docs in collection", totalCount);

          if (totalCount === 0) {
            return JSON.stringify({
              error: "No otems found in inventory",
              message: "The inventory database appears to be empty",
              count: 0,
            });
          }

          const sampleDocs = await collection.find({}).limit(3).toArray();
          console.log("Sample docs", sampleDocs);

          const dbConfig = {
            collection: collection,
            indexName: "vector_index",
            textKey: "embedding_text",
            embeddingKey: "embedding",
          };

          const vectorStore = new MongoDBAtlasVectorSearch(
            new GoogleGenerativeAIEmbeddings({
              apiKey: process.env.GOOGLE_API_KEY,
              model: "text-embedding-004",
            }),
            dbConfig
          );
          console.log("Performing vector search");
          const embedding = await vectorStore.embeddings.embedQuery(query);

          // Skicka embedding-arrayen till similaritySearchVectorWithScore
          const result = await vectorStore.similaritySearchVectorWithScore(
            embedding,
            n
          );
          console.log(`Vector search returned ${result.length} result`);

          if (result.length === 0) {
            console.log(`Vector search no result..`);

            const cleanQuery = query.trim(); // ta bort extra mellanslag

            const textResults = await collection
              .find({
                $or: [
                  { item_name: { $regex: cleanQuery, $options: "i" } },
                  { item_description: { $regex: cleanQuery, $options: "i" } },
                  { categories: { $regex: cleanQuery, $options: "i" } },
                  { embedding_text: { $regex: cleanQuery, $options: "i" } },
                ],
              })
              .limit(n)
              .toArray();

            console.log(`Text search returned ${textResults.length} results`);

            return JSON.stringify({
              results: textResults,
              searchType: "text",
              query: query,
              count: textResults.length,
            });
          }
          return JSON.stringify({
            results: result,
            searchType: "vector",
            query: query,
            count: result.length,
          });
        } catch (error) {
          console.error("Error in item lookup", error);
          console.error("Error details:", {
            message: error.message,
            stack: error.stack,
            name: error.name,
          });

          return JSON.stringify({
            error: "Failed to search inventory",
            details: error.message,
            query: query,
          });
        }
      },
      {
        // @ts-ignore
        name: "item_lookup",
        description: "Gathers Games item details from the Inventory database",
        schema: z.object({
          query: z.string().describe("The search query"),
          n: z
            .number()
            .optional()
            .default(10)
            .describe("Number of result to return"),
        }),
      }
    );

    const tools = [itemLookUpTool];
    // @ts-ignore
    const toolNode = new ToolNode<typeof GraphState.State>(tools);

    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      temperature: 0,
      maxRetries: 0,
      apiKey: process.env.GOOGLE_API_KEY,
    }).bindTools(tools);

    function shouldContinue(state: typeof GraphState.State) {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1] as AIMessage;

      if (lastMessage.tool_calls?.length) {
        return "tools";
      }

      return "_end_";
    }

    async function callModel(state: typeof GraphState.State) {
      return retryWithBackOff(async () => {
        const prompt = ChatPromptTemplate.fromMessages([
          [
            "system",
            `You are an E-commerce Chatbot for a gaming store.  
The database name is: inventory_database.  

Each game entry contains:  
- item_id  
- item_name  
- item_description  
- productUrl  
- imageUrl  
- price  
- stock  

Rules:  
1. Always search in item_name and item_description using **exact text match or substring**, case-insensitive.  
2. Only list games that actually exist in inventory_database. Do not invent games.  
3. If the user asks "what games are available", list all item_name values.  
4. If the user asks for a specific genre, platform, or play mode, filter games using the text in item_description or item_name.  
5. When showing details of a game, include: item_name, item_description, price, stock.  
6. Only include productUrl or imageUrl if the user explicitly asks.  
7. Answer in the same language as the user.  

Examples:  

User: "Har du några horror spel?"  
Agent: "Tillgängliga horror-spel: Cronos The New Dawn - PS5"  

User: "Detaljer för Cronos The New Dawn - PS5"  
Agent: "Cronos The New Dawn - PS5: PS5 | Genre: Horror, Third-person shooter, Survival | Play Mode: Singleplayer | PEGI: 16 years | Pris: 629 SEK | Lager: 3"

Current time: {time}
`,
          ],
          new MessagesPlaceholder("messages"),
        ]);

        const formattetPrompt = await prompt.formatMessages({
          time: new Date().toISOString(),
          messages: state.messages,
        });

        const result = await model.invoke(formattetPrompt);
        return { messages: [result] };
      });
    }

    const workflow = new StateGraph(GraphState)
      .addNode("agent", callModel)
      .addNode("tools", toolNode)
      .addEdge("__start__", "agent")
      .addConditionalEdges("agent", shouldContinue)
      .addEdge("tools", "agent");

    const checkpointer = new MongoDBSaver({ client, dbName });
    const app = workflow.compile({ checkpointer });

    const finalState = await app.invoke(
      {
        messages: [new HumanMessage(query)],
      },
      {
        recursionLimit: 15,
        configurable: { thread_id: thread_id },
      }
    );

    const response =
      finalState.messages[finalState.messages.length - 1].content;

    console.log("Agent response", response);
    return response;
  } catch (error) {
    console.error("callAgent", error.message);

    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 429
    ) {
      throw new Error(
        "Service temporaly due to rate limits, Please try agian in a minutes"
      );
    } else if (error.status === 401) {
      throw new Error("Authentication failed. Check API config");
    } else {
      throw new Error(`Agent failed:${error.message}`);
    }
  }
}
