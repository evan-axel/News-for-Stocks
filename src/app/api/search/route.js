// app/api/search/route.js
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { query } = await request.json();

        if (typeof query!== 'string' || query.trim() === '') {
            return NextResponse.json({ error: 'Invalid search query' }, { status: 400 });
        }

        const searchBody = { query, index: 'small_caps' };

        const response = await fetch('https://api.orama.com/v1/search', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.ORAMA_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(searchBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Orama API error: ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        const resultsWithFullText = await Promise.all(
            data.hits.map(async (result) => {
                const fullText = await fetchFullText(result.symbol, 'NEWS'); // Assuming 'NEWS' for PRs
                return {...result, fullText };
            })
        );

        return NextResponse.json({...data, hits: resultsWithFullText });

    } catch (error) {
        console.error('Search error:', error);
        return NextResponse.json(
            {
                error: 'Failed to perform search',
                details: `Orama API returned an error: ${error.message}`,
                timestamp: new Date().toISOString()
            },
            { status: 502 }
        );
    }
}

async function fetchFullText(symbol, filingType) {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    console.log("API Key:", apiKey? "Present": "Missing");

    try {
        const marketCapURL = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
        console.log("Market Cap URL:", marketCapURL);
        const marketCapResponse = await fetch(marketCapURL);
        console.log("Market Cap Response Status:", marketCapResponse.status);
        if (!marketCapResponse.ok) return null;
        const marketCapData = await marketCapResponse.json();
        console.log("Market Cap Data:", marketCapData);
        const marketCap = parseFloat(marketCapData['Global Quote']['04. price']) * parseFloat(marketCapData['Global Quote']['10. volume']);
        if (isNaN(marketCap) || marketCap > 1000000000) return null;

        const filingsURL = `https://www.alphavantage.co/query?function=${filingType}&symbol=${symbol}&apikey=${apiKey}`;
        console.log("Filings URL:", filingsURL);
        const filingsResponse = await fetch(filingsURL);
        console.log("Filings Response Status:", filingsResponse.status);
        if (!filingsResponse.ok) return null;
        const filingsData = await filingsResponse.json();
        console.log("Filings Data:", filingsData);
        return extractTextFromFiling(filingsData, filingType);

    } catch (error) {
        console.error("Error in fetchFullText:", error);
        return null;
    }
}

function extractTextFromFiling(data, filingType) {
    if (!data) return "No data available";

    switch (filingType) {
        case "NEWS":
            if (data.feed && data.feed.length > 0) {
                return data.feed.map(item => `${item.title}\n${item.summary}`).join('\n\n');
            } else {
                return "No news found.";
            }
        default:
            return JSON.stringify(data);
    }
}
