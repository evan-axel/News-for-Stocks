import React, { useState, useEffect } from 'react';
import { Search as SearchIcon, Calendar, Tag } from 'lucide-react';

// Keyword mapping for similar terms
const KeywordMapper = {
  // Corporate Strategic Actions
  "strategic review": ["strategic alternatives", "exploring options", "evaluating options", "strategic process", "potential sale", "strategic evaluation", "financial advisor", "retained banker"],
  "reverse split": ["reverse stock split", "share consolidation", "stock consolidation", "share merger", "nasdaq compliance", "price requirement"],
  "divestiture": ["asset sale", "business sale", "divest", "selling unit", "disposition", "carve-out", "sold division"],
  "spin-off": ["spinoff", "spin out", "tax-free distribution", "separation", "split-off", "new standalone", "separate entity"],
  
  // Management & Leadership Changes
  "CEO": ["chief executive", "executive change", "leadership change", "new CEO", "appointed CEO", "stepping down", "resigned", "interim CEO"],
  "CFO": ["chief financial officer", "finance chief", "financial officer", "new CFO", "appointed CFO", "interim CFO", "finance head", "financial leadership"],
  
  // Market Actions & Corporate Events
  "acquisition": ["merger", "takeover", "buyout", "M&A", "purchased", "acquired"],
  "partnership": ["collaboration", "joint venture", "alliance", "teaming up", "cooperation"],
  "funding": ["investment", "financing", "capital raise", "series", "venture capital", "private placement"]
};

const Search = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTerms, setExpandedTerms] = useState([]);
  const [selectedTerms, setSelectedTerms] = useState([]);
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Expand search terms when query changes
  useEffect(() => {
    const terms = searchQuery.toLowerCase().split(' ');
    const expanded = new Set();
    
    terms.forEach(term => {
      if (KeywordMapper[term]) {
        KeywordMapper[term].forEach(related => expanded.add(related));
      }
      expanded.add(term);
    });
    
    setExpandedTerms(Array.from(expanded));
  }, [searchQuery]);

  const handleSearch = async () => {
    if (!searchQuery.trim() && selectedTerms.length === 0) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const searchTerms = [
        searchQuery,
        ...selectedTerms
      ].filter(Boolean).join(' OR ');

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: searchTerms })
      });

      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      setResults(data.hits || []);
    } catch (err) {
      setError('Failed to perform search. Please try again.');
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTerm = (term) => {
    setSelectedTerms(prev => 
      prev.includes(term) 
        ? prev.filter(t => t !== term)
        : [...prev, term]
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Tag className="h-6 w-6 text-blue-500" />
              <span className="ml-2 text-xl font-semibold">SmallCap Scanner</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Small Cap Stock Search</h1>
          <p className="mt-2 text-gray-600">Search through current week's small cap stocks and news</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <input
                type="text"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Search for keywords (e.g., acquisition, partnership, CEO change...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Searching...
                </span>
              ) : (
                <span className="flex items-center">
                  <SearchIcon className="mr-2" size={18} />
                  Search
                </span>
              )}
            </button>
          </div>

          {/* Similar Terms */}
          {expandedTerms.length > 0 && (
            <div className="space-y-2 mb-6">
              <h3 className="text-sm font-semibold text-gray-700">Related Terms:</h3>
              <div className="flex flex-wrap gap-2">
                {expandedTerms.map((term) => (
                  <button
                    key={term}
                    onClick={() => toggleTerm(term)}
                    className={`px-3 py-1 rounded-full text-sm flex items-center gap-1
                      ${selectedTerms.includes(term) 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {term}
                    {selectedTerms.includes(term) ? '✕' : '+'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Results */}
          <div className="space-y-6">
            {results.map((result) => (
              <div key={result.id} className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{result.symbol}</h3>
                    <p className="text-gray-600">{result.company}</p>
                  </div>
                  <div className="flex items-center text-sm text-gray-500">
                    <Calendar className="h-4 w-4 mr-1" />
                    {result.date}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <span className="text-sm font-medium text-gray-500">Market Cap</span>
                    <p className="text-gray-900">{result.market_cap}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Industry</span>
                    <p className="text-gray-900">{result.industry}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-500">Price</span>
                    <p className="text-gray-900">${result.price}</p>
                  </div>
                </div>

                {result.news && result.news.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Recent News</h4>
                    <ul className="space-y-2">
                      {result.news.map((item, index) => (
                        <li key={index} className="text-sm">
                          <a 
                            href={item.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {item.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}

            {results.length === 0 && !isLoading && searchQuery && (
              <div className="text-center py-12">
                <p className="text-gray-500">No results found for "{searchQuery}"</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Search;
