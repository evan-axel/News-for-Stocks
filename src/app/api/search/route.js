export async function POST(request) {
    try {
        const { query } = await request.json();

        // Input Validation (Optional)
        if (typeof query !== 'string' || query.trim() === '') {
            return Response.json({ error: 'Invalid search query' }, { status: 400 });
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
            throw new Error(`Orama API error: ${response.statusText} - ${errorText}`); // Include errorText
        }

        const data = await response.json();
        return Response.json(data);

    } catch (error) {
        console.error('Search error:', error);
        return Response.json(
            {
                error: 'Failed to perform search',
                details: `Orama API returned an error: ${error.message}`, // More specific
                timestamp: new Date().toISOString()
            },
            { status: 502 } // Or 503, depending on the nature of the Orama API error
        );
    }
}
