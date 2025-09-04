import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from "@langchain/google-genai";
import {
  StringOutputParser,
  StructuredOutputParser,
} from "@langchain/core/output_parsers";
import { MongoClient } from "mongodb";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { z } from "zod";
import "dotenv/config";

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
  brand: z.string(),
  manufacturer_address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    postal_code: z.string(),
    country: z.string(),
  }),
  prices: z.object({
    full_price: z.number(),
    sale_price: z.number(),
  }),
  categories: z.array(z.string()),
  user_reviews: z.array(
    z.object({
      review_date: z.string(),
      rating: z.number(),
      comment: z.string(),
    })
  ),
  notes: z.string(),
});

type Item = z.infer<typeof itemSchema>;
// @ts-ignore

const parser = StructuredOutputParser.fromZodSchema(z.array(itemSchema));
async function setupDatabaseAndCollection(): Promise<void> {
  console.log("Setting up database and collection...");
  const db = client.db("inventory_database");
  const collections = await db.listCollections({ name: "items" }).toArray();

  // create collection
  if (collections.length === 0) {
    await db.createCollection("items");
    console.log("Created collection...");
  } else {
    console.log("Created collection alredy exists");
  }
}

async function createVectorSearchIndex(): Promise<void> {
  try {
    const db = client.db("inventory_database");
    const collection = db.collection("items");
    await collection.dropIndexes();
    const vectorSearchIdx = {
      name: "vector_index",
      type: "vectorSearch",
      definition: {
        fields: [
          {
            type: "vector",
            path: "embedding",
            numdimensions: 768,
            similarity: "cosine",
          },
        ],
      },
    };

    console.log("Createing vector search index");
    await collection.createSearchIndex(vectorSearchIdx);
    console.log("Success Createing vector search index");
  } catch (error) {
    console.error("Failed createVectorSearchIndex", error);
  }
}

async function generateSynteticData(): Promise<Item[]> {
  const promt = `You are a helpful assistant that TAKES DET 
    store item data. Generate 10 motorcycle store items, Each record should
    include the following fields: item_id, item_name, item_description, brand,
    manufacturer_address, prices, categories, user_reviews, notes.
    Ensure variety in the data and realistic values.
    ${parser.getFormatInstructions()}
    `;

  console.log("Generate syntetic data...");

  const response = await llm.invoke(promt);

  return parser.parse(response.content as string);
}

async function createItemSummary(item: Item): Promise<string> {
  return new Promise((resolve) => {
    const manufacturerDetails = `Made in ${item.manufacturer_address.country}`;
    const categories = item.categories.join(", ");
    const userReviews = item.user_reviews
      .map(
        (review) =>
          `Rated ${review.rating} on ${review.review_date}: ${review.comment}`
      )
      .join(" ");
    const basicInfo = `${item.item_name} ${item.item_description} from brand ${item.brand}`;
    const price = `At full price ${item.prices.full_price} SEK, On sale ${item.prices.sale_price} SEK`;
    const notes = item.notes;

    const summary = `${basicInfo}. Manufacturer: ${manufacturerDetails}.
    Categoriews: ${categories}. Revies: ${userReviews}. Price: ${price}.
    Notes: ${notes}`;

    resolve(summary);
  });
}

async function seedDatabase(): Promise<void> {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("You are conncted Mongodb");
    await setupDatabaseAndCollection();
    await createVectorSearchIndex();

    const db = client.db("inventory_database");
    const collection = db.collection("items");

    await collection.deleteMany({});
    console.log("Cleared existing data from items collection");

    const synteticData = await generateSynteticData();

    const recordsWithSummaries = await Promise.all(
      synteticData.map(async (record) => ({
        pageContent: await createItemSummary(record),
        metadata: { ...record },
      }))
    );

    for (const record of recordsWithSummaries) {
      await MongoDBAtlasVectorSearch.fromDocuments(
        [record],
        new GoogleGenerativeAIEmbeddings({
          apiKey: process.env.GOOGLE_API_KEY,
          modelName: "text-embedding-004",
        }),

        {
          collection,
          indexName: "vector_index",
          textKey: "embedding_text",
          embeddingKey: "embedding",
        }
      );
      console.log("saved record", record.metadata.item_id);
    }

    console.log("seeding  completed");
  } catch (error) {
    console.error("seedDatabase", error);
  } finally {
    await client.close();
  }
}

seedDatabase().catch(console.error);
