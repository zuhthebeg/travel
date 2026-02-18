import { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';

interface PhotonResult {
  properties: {
    name?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    osm_key?: string;
    osm_value?: string;
  };
  geometry: {
    coordinates: [number, number]; // [lng, lat]
  };
}

interface PlaceAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: { name: string; lat: number; lng: number; countryCode?: string; city?: string }) => void;
  placeholder?: string;
  className?: string;
  regionHint?: string; // e.g. "홍콩", "미국" — Photon 검색 정확도 향상
}

export function PlaceAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = '장소 검색...',
  className = '',
  regionHint = '',
}: PlaceAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<PhotonResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync external value
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search with debounce
  const searchPlaces = async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      // Build Photon API URL — append region hint for accuracy
      const q = regionHint && !searchQuery.includes(regionHint)
        ? `${searchQuery}, ${regionHint}`
        : searchQuery;
      let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=7`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      setResults(data.features || []);
      setIsOpen(true);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Place search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    onChange(newValue);

    // Debounced search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchPlaces(newValue);
    }, 300);
  };

  const handleSelect = (result: PhotonResult) => {
    const props = result.properties;
    const [lng, lat] = result.geometry.coordinates;
    
    // Build display name
    const parts: string[] = [];
    if (props.name) parts.push(props.name);
    if (props.city && props.city !== props.name) parts.push(props.city);
    if (props.state && props.state !== props.city) parts.push(props.state);
    if (props.country) parts.push(props.country);
    
    const displayName = parts.join(', ');
    
    setQuery(displayName);
    onChange(displayName);
    onSelect({ name: displayName, lat, lng, countryCode: props.countrycode?.toUpperCase(), city: props.city || props.name });
    setIsOpen(false);
    setResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const formatResultDisplay = (result: PhotonResult) => {
    const props = result.properties;
    const main = props.name || props.street || '알 수 없는 장소';
    const sub: string[] = [];
    if (props.city) sub.push(props.city);
    if (props.state) sub.push(props.state);
    if (props.country) sub.push(props.country);
    
    return { main, sub: sub.join(', ') };
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="input input-bordered w-full pr-10"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-base-content/50" />
          ) : (
            <Search className="w-5 h-5 text-base-content/50" />
          )}
        </div>
      </div>

      {/* Dropdown results */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {results.map((result, index) => {
            const { main, sub } = formatResultDisplay(result);
            return (
              <button
                key={index}
                type="button"
                onClick={() => handleSelect(result)}
                className={`w-full px-4 py-3 text-left flex items-start gap-3 hover:bg-base-200 transition-colors ${
                  index === selectedIndex ? 'bg-base-200' : ''
                }`}
              >
                <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{main}</div>
                  {sub && <div className="text-sm text-base-content/60 truncate">{sub}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* No results message */}
      {isOpen && query.length >= 2 && results.length === 0 && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg p-4 text-center text-base-content/60">
          검색 결과가 없습니다
        </div>
      )}
    </div>
  );
}
