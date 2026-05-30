import { tavily } from "@tavily/core";
import { env } from "../config/env";

const tvly = tavily({ apiKey: env.TAVILY_API_KEY! });

export async function searchInternet(query: string) {
  try {
    const response = await tvly.search(query, {
      searchDepth: "advanced",
      maxResults: 3,
    });

    // Натижаларни ботга жавоб сифатида бериш учун форматлаймиз
    return response.results
      .map((r) => `Манба: ${r.title}\nКонтент: ${r.content}`)
      .join("\n\n");
  } catch (error) {
    console.error("❌ Интернетдан излашда хатолик:", error);
    return "Узр, интернетдан маълумот ололмадим.";
  }
}
