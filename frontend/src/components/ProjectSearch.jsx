import { useState, useEffect, useCallback } from 'react';
import { searchProjects, getFilterOptions } from '../services/api';

function ProjectSearch() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    district: '',
    propertyType: '',
    minPrice: '',
    maxPrice: ''
  });
  const [filterOptions, setFilterOptions] = useState({ districts: [], propertyTypes: [] });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Load filter options on mount
  useEffect(() => {
    getFilterOptions().then(setFilterOptions).catch(console.error);
  }, []);

  // Debounced search
  const performSearch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await searchProjects(query, filters);
      setResults(data);
      setSearched(true);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [query, filters]);

  const handleSearch = (e) => {
    e.preventDefault();
    performSearch();
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ district: '', propertyType: '', minPrice: '', maxPrice: '' });
    setQuery('');
  };

  const formatPrice = (price) => {
    if (price >= 1000000) {
      return `S$${(price / 1000000).toFixed(2)}M`;
    }
    return `S$${(price / 1000).toFixed(0)}K`;
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <form onSubmit={handleSearch}>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Projects
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter project name or street..."
                  className="w-full px-4 py-2.5 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
              <select
                value={filters.district}
                onChange={(e) => handleFilterChange('district', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Districts</option>
                {filterOptions.districts.map(d => (
                  <option key={d} value={d}>D{d.padStart(2, '0')}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Type</label>
              <select
                value={filters.propertyType}
                onChange={(e) => handleFilterChange('propertyType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                {filterOptions.propertyTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Price</label>
              <select
                value={filters.minPrice}
                onChange={(e) => handleFilterChange('minPrice', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No Min</option>
                <option value="500000">S$500K</option>
                <option value="1000000">S$1M</option>
                <option value="2000000">S$2M</option>
                <option value="3000000">S$3M</option>
                <option value="5000000">S$5M</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Price</label>
              <select
                value={filters.maxPrice}
                onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No Max</option>
                <option value="1000000">S$1M</option>
                <option value="2000000">S$2M</option>
                <option value="3000000">S$3M</option>
                <option value="5000000">S$5M</option>
                <option value="10000000">S$10M</option>
              </select>
            </div>
          </div>

          {(query || Object.values(filters).some(v => v)) && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear all filters
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : searched && results.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-600">No projects found matching your criteria</p>
          <button onClick={clearFilters} className="mt-4 text-blue-600 hover:text-blue-700 text-sm font-medium">
            Clear filters and try again
          </button>
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Found <span className="font-semibold">{results.length}</span> projects
            </p>
          </div>

          <div className="grid gap-4">
            {results.slice(0, 50).map((project, index) => (
              <div 
                key={`${project.project}-${index}`}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-gray-900">{project.project}</h3>
                      <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                        D{project.district?.padStart(2, '0')}
                      </span>
                      {project.marketSegment && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                          {project.marketSegment}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{project.street}</p>
                    <div className="mt-3 flex flex-wrap gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Type:</span>
                        <span className="ml-1 font-medium text-gray-700">{project.propertyType}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Tenure:</span>
                        <span className="ml-1 font-medium text-gray-700">
                          {project.tenure?.includes('Freehold') ? 'Freehold' : 
                           project.tenure?.match(/\d+\s*yrs?/)?.[0] || project.tenure}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Transactions:</span>
                        <span className="ml-1 font-medium text-gray-700">{project.transactionCount}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-2xl font-bold text-gray-900">{formatPrice(project.avgPrice)}</div>
                    <div className="text-sm text-gray-500">avg price</div>
                    <div className="mt-2 text-lg font-semibold text-blue-600">
                      S${project.avgPsf?.toLocaleString()}/sqft
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Range: {formatPrice(project.minPrice)} - {formatPrice(project.maxPrice)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {results.length > 50 && (
            <p className="text-center text-sm text-gray-500 py-4">
              Showing first 50 of {results.length} results. Refine your search to see more specific results.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-12 text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <p className="text-gray-600 mb-2">Search for Singapore property projects</p>
          <p className="text-sm text-gray-400">Enter a project name, street, or use the filters above</p>
        </div>
      )}
    </div>
  );
}

export default ProjectSearch;
