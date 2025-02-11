// app/api/search/route.js
import { NextResponse } from 'next/server';

// In-memory storage for fetched data
let newsData = null;

export async function POST(request) {
    try {
        const { query } = await request.json();

        // 1. Fetch News Data (if not already fetched or if you want to refresh)
        if (!newsData) { // Or add logic to refresh data daily
            const symbol = "IBM"; // Replace with actual symbol later
            newsData = await fetchNewsData(symbol);

            if (!newsData) {
                return NextResponse.json({ error: "Failed to fetch news data" }, { status: 500 });
            }
        }

        // 2. Filter by Market Cap (Not implemented yet - will be added later)
        const filteredNewsData = newsData; // Placeholder - will filter later

        // 3. Return Data
        return NextResponse.json({ results: filteredNewsData });

    } catch (error) {
        console.error("Error in POST request:", error);
        return NextResponse.json({ error: "An error occurred" }, { status: 500 });
    }
}

// ... (fetchNewsData function remains the same)
