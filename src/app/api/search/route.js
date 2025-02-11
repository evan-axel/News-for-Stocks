// app/api/search/route.js
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { query } = await req.json();
    
    // For now, return a test response to verify the API is working
    return NextResponse.json({
      hits: [
        {
          id: '1',
          symbol: 'TEST',
          company: 'Test Company',
          price: 2.50,
          market_cap: '$150M',
          industry: 'Technology',
          date: new Date().toISOString().split('T')[0],
          news: [
            {
              title: 'Test News Item',
              url: '#'
            }
          ]
        }
      ]
    });

  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Failed to perform search' },
      { status: 500 }
    );
  }
}
