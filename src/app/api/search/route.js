// app/api/search/route.js
import { NextResponse } from 'next/server';

let newsData = null;

export async function POST(request) {
    try {
        const { query } = await request.json();

        if (!newsData) {
            const symbol = "IBM"; // Replace with actual symbol later
            console.log("Fetching news data for:", symbol); // Log before fetch
            newsData = await fetchNewsData(symbol);
            console.log("News data fetched:", newsData); // Log after fetch

            if (!newsData) {
                console.error("fetchNewsData returned null. Check for API errors."); // Log the error
                return NextResponse.json({ error: "Failed to fetch news data" }, { status: 500 });
            }
        }

        const filteredNewsData = newsData;
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
