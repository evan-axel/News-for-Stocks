// app/api/search/route.js
export async function POST(request) {
  try {
    const { query } = await request.json();
    console.log('Received search query:', query); // Debug log
    
    const searchBody = {
      query,
      index: 'small_caps'
    };
    console.log('Making Orama request with body:', searchBody); // Debug log

    const response = await fetch('https://api.orama.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ORAMA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(searchBody)
    });

    console.log('Orama response status:', response.status); // Debug log
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Orama error response:', errorText); // Debug log
      throw new Error(`Orama API error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Orama response data:', data); // Debug log
    
    return Response.json(data);
    
  } catch (error) {
    console.error('Search error:', error);
    // Return more detailed error information
    return Response.json(
      { 
        error: 'Failed to perform search',
        details: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
