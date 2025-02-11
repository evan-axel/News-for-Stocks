// app/api/search/route.js
import { NextResponse } from 'next/server';

// In-memory storage for fetched data (declared OUTSIDE the handler)
let cachedNewsData = null;
let lastFetchTimestamp = null;

export async function POST(request) {
    try {
        const { query } = await request.json();

        const currentTime = Date.now();
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

        // Check if data needs to be refreshed (e.g., every 24 hours)
        if (!cachedNewsData || !lastFetchTimestamp || (currentTime - lastFetchTimestamp > TWENTY_FOUR_HOURS)) {
            const symbol = "IBM"; // Replace with actual symbol later
            console.log("Fetching news data for:", symbol);
            const fetchedNewsData = await fetchNewsData(symbol);

            if (!fetchedNewsData) {
                console.error("fetchNewsData returned null. Check for API errors.");
                return NextResponse.json({ error: "Failed to fetch news data" }, { status: 500 });
            }

            // Update cached data and timestamp ONLY if the fetch was successful
            cachedNewsData = fetchedNewsData;
            lastFetchTimestamp = currentTime;

            console.log("News data fetched and cached:", cachedNewsData);
        } else {
            console.log("Using cached news data.");
        }


        const filteredNewsData = cachedNewsData; // Filter logic comes here later
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
        console.log("Fetching news from URL:", url); // Log the URL
        const response = await fetch(url);
        console.log("Response status:", response.status); // Log the response status

        if (!response.ok) {
            const errorText = await response.text(); // Get error details from API
            console.error(`Error fetching news for ${symbol}: ${response.status} ${response.statusText} - ${errorText}`); // Log detailed error
            return null;
        }

        const data = await response.json();
        console.log("Raw news data:", data); // Log the raw data

        return data.feed || [];

    } catch (error) {
        console.error("Error in fetchNewsData:", error); // Log any errors during fetch
        return null;
    }
}
