import { scrapeInet } from "./scraper";
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from "@langchain/google-genai";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { MongoClient } from "mongodb";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { z } from "zod";
import "dotenv/config";
import { v4 as uuidv4 } from "uuid"; // Glöm inte att installera uuid med 'npm install uuid'

const client = new MongoClient(process.env.MONGODB_ATLAS_URI as string);

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-1.5-flash",
  temperature: 0.7,
  apiKey: process.env.GOOGLE_API_KEY,
});

const itemSchema = z.object({
  item_id: z.string(),
  item_name: z.string(),
  item_description: z.string(),
  productUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  price: z.number(),
  stock: z.number(),
});

type Item = z.infer<typeof itemSchema>;
const parser = StructuredOutputParser.fromZodSchema(z.array(itemSchema));

function sanitizeLLMOutput(text: string): string {
  text = text.replace(/\r?\n/g, " ").replace(/\t/g, " ");
  text = text.replace(/,(\s*])/g, "]");
  const match = text.match(/\[.*\]/s);
  if (match) text = match[0];
  if (!text.startsWith("[")) text = `[${text}]`;
  return text;
}

async function setupDatabaseAndCollection() {
  const db = client.db("inventory_database");
  const collections = await db.listCollections({ name: "items" }).toArray();
  if (!collections.length) {
    await db.createCollection("items");
    console.log("Created collection 'items'");
  } else {
    console.log("Collection 'items' already exists");
  }
}

async function createVectorSearchIndex() {
  const db = client.db("inventory_database");
  const collection = db.collection("items");

  const indexes = await collection.listIndexes().toArray();
  const vectorIndexExists = indexes.some((idx) => idx.name === "vector_index");

  if (vectorIndexExists) {
    console.log("Vector search index already exists ✅");
    return;
  }

  console.warn(
    "⚠️ Skipping vector index creation. Max FTS indexes reached or free-tier limitation."
  );
}

async function generateSynteticData(scrapedData: any[]): Promise<Item[]> {
  const prompt = `You are a helpful assistant. Take the following scraped data and complete it into full item records:
${JSON.stringify(scrapedData)}

Each item must have fields: item_id, item_name, item_description, stock, productUrl, imageUrl, price .
Ensure realistic values and maintain the original scraped info. Add a unique UUID for each item_id.
Return only valid JSON array.`;

  const response = await llm.invoke(prompt);
  let text = sanitizeLLMOutput(response.content as string);

  try {
    return parser.parse(text);
  } catch {
    console.error("Failed to parse LLM output. Using fallback.", text);
    try {
      const fallback = JSON.parse(text).map((item: any) => ({
        ...item,
        price: item.price || 0,
        item_description: item.item_description || "No description available",
        item_id: item.item_id || uuidv4(), // Fallback for item_id
      })) as Item[];
      return fallback;
    } catch (e) {
      console.error("Fallback parsing also failed:", e);
      return [];
    }
  }
}

async function seedDatabase(): Promise<void> {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("You are connected to MongoDB");
    await setupDatabaseAndCollection();
    await createVectorSearchIndex();

    const db = client.db("inventory_database");
    const collection = db.collection("items");

    await collection.deleteMany({});
    console.log("Cleared existing data from items collection");

    const scrapedData: any[] = await scrapeInet();
    console.log("🔍 Scraped data:", scrapedData.length, "items");

    if (!scrapedData.length) {
      console.error("⚠️ No scraped data found.");
      await client.close();
      return;
    }

    const fullItems = await generateSynteticData(scrapedData);
    console.log("✨ Generated synthetic data:", fullItems.length, "items");

    if (!fullItems.length) {
      console.error(
        "⚠️ No synthetic data was generated. Check the LLM output."
      );
      await client.close();
      return;
    }

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      modelName: "text-embedding-004",
    });

    for (const record of fullItems) {
      try {
        const docToEmbed = {
          pageContent: record.item_description,
          metadata: { ...record },
        };

        await MongoDBAtlasVectorSearch.fromDocuments([docToEmbed], embeddings, {
          collection,
          indexName: "vector_index",
          textKey: "embedding_text",
          embeddingKey: "embedding",
        });
        console.log("Saved record with ID:", record.item_id);
      } catch (e) {
        console.error(`❌ Failed to save record with ID ${record.item_id}:`, e);
      }
    }

    console.log("Seeding completed ✅");
  } catch (error) {
    console.error("seedDatabase failed:", error);
  } finally {
    await client.close();
    console.log("Connection to MongoDB closed.");
  }
}

seedDatabase().catch(console.error);
