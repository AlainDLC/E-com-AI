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

import { Embeddings } from "@langchain/core/embeddings";

async function retryWithBackOff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt >= maxRetries; attempt++) {
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
        const delay = Math.min(1000 * Math.pow(2, attempt), 3000);
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
          const result = await vectorStore.similaritySearchVectorWithScore(
            query,
            n
          );
          console.log(`Vector search returned ${result.length} result`);

          if (result.length === 0) {
            console.log(`Vector search no result..`);

            const textResults = await collection
              .find({
                $or: [
                  { item_name: { $regex: query, $options: "i" } },
                  { item_description: { $regex: query, $options: "i" } },
                  { categories: { $regex: query, $options: "i" } },
                  { embedding_text: { $regex: query, $options: "i" } },
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
        description:
          "Gathers motorcykle item details from the Inventory database",
        schema: z.object({
          query: z.string().describe("The search"),
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
      model: "gemini-1.5-flash",
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

      return "__end__";
    }

    async function callModel(state: typeof GraphState.State) {
      return retryWithBackOff(async () => {
        const prompt = ChatPromptTemplate.fromMessages([
          [
            "system",
            `You are a helpful E-commerce Chatbot Agent for a motorcykel store.
            IMPORTANT: You have acces to an item_lookup tool searches the motorcykel inventory database, ALWAYS use this tool  when customers ask about motorcykel items,
            even if the tool returns error or empty results.

            When using the item_lookup tool:
            - If it returns results, provide helpful details the motorcykle items
            - If it return a error or no results, acknowledge this offer to help in other ways
            - If the database appears to be empty, let the customer know that inventory might be being updated 

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

    const workflow = GraphState(GraphState)
      .addNode("agent", callModel)
      .addNode("tools", toolNode)
      .addNode("__start__", "agent")
      .addConditionalEdges("agent", shouldContinue)
      .addNode("tools", "agenr");

    const checkpointer = new MongoDBSaver({ client, dbName });
    const app = workflow.copile({ checkpointer });

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
