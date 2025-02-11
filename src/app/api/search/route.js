// app/api/search/route.js
import { NextResponse } from 'next/server';

// ... (rest of the code - same as before)

async function fetchFullText(symbol, filingType) {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

    try {
        const marketCapURL = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
        const marketCapResponse = await fetch(marketCapURL);
        if (!marketCapResponse.ok) return null;
        const marketCapData = await marketCapResponse.json();
        const marketCap = parseFloat(marketCapData['Global Quote']['04. price']) * parseFloat(marketCapData['Global Quote']['10. volume']);
        if (isNaN(marketCap) || marketCap > 1000000000) return null;

        const filingsURL = `https://www.alphavantage.co/query?function=${filingType}&symbol=${symbol}&apikey=${apiKey}`;
        const filingsResponse = await fetch(filingsURL);
        if (!filingsResponse.ok) return null;
        const filingsData = await filingsResponse.json();
        return extractTextFromFiling(filingsData, filingType);

    } catch (error) {
        console.error("Error in fetchFullText:", error);
        return null;
    }
}

function extractTextFromFiling(data, filingType) {
    if (!data) return "No data available";

    switch (filingType) {
        case "NEWS": // Example: News (replace with your actual logic)
            if (data.feed && data.feed.length > 0) {
              return data.feed.map(item => `${item.title}\n${item.summary}`).join('\n\n');
            } else {
              return "No news found.";
            }
        // Add other cases for different filing types as needed
        default:
            return JSON.stringify(data); // Default case (for debugging - remove in production)
    }
}

// ... (rest of the code - same as before)
