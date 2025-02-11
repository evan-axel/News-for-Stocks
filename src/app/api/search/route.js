// app/api/search/route.js
import { NextResponse } from 'next/server';
import fs from 'fs/promises'; // Import file system module

export async function POST(request) {
    try {
        const { query } = await request.json(); // Get search query

        // 1. Fetch News Data (for a single company for testing)
        const symbol = "IBM"; // Replace with actual symbol later
        const newsData = await fetchNewsData(symbol);

        if (!newsData) {
            return NextResponse.json({ error: "Failed to fetch news data" }, { status: 500 });
        }

        // 2. Filter by Market Cap (Not implemented yet - will be added later)
        const filteredNewsData = newsData; // Placeholder - will filter later

        // 3. Store Data in JSON file
        await fs.writeFile('data.json', JSON.stringify(filteredNewsData, null, 2));

        // 4. Return Data (for now, just return the fetched news data)
        return NextResponse.json({ results: filteredNewsData });

    } catch (error) {
        console.error("Error in POST request:", error);
        return NextResponse.json({ error: "An error occurred" }, { status: 500 });
    }
}

async function fetchNewsData(symbol) {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&symbol=${symbol}&apikey=${apiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Error fetching news for ${symbol}: ${response.status} ${response.statusText}`);
            return null;
        }
        const data = await response.json();
        return data.feed || []; // Return empty array if no news found

    } catch (error) {
        console.error("Error in fetchNewsData:", error);
        return null;
    }
}
