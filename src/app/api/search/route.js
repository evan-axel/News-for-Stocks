// app/api/search/route.js
export async function POST(request) {
  try {
    const { query } = await request.json();
    
    const response = await fetch('https://api.orama.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ORAMA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        index: 'small_caps'  // Your Orama index name
      })
    });
    if (!response.ok) {
      throw new Error(`Orama API error: ${response.statusText}`);
    }
    const data = await response.json();
    return Response.json(data);
    
  } catch (error) {
    console.error('Search error:', error);
    return Response.json(
      { error: 'Failed to perform search' },
      { status: 500 }
    );
  }
}
