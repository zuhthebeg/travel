import { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
  name?: string;
  type?: string;
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
  placeholder,
  className = '',
  regionHint = '',
}: PlaceAutocompleteProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<NominatimResult[]>([]);
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

  // Search with debounce (Nominatim — supports Korean/CJK)
  const searchPlaces = async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const q = regionHint && !searchQuery.includes(regionHint)
        ? `${searchQuery}, ${regionHint}`
        : searchQuery;
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=7&addressdetails=1&accept-language=ko`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Travly/1.0 (https://travly.cocy.io)' },
      });
      if (!response.ok) throw new Error('Search failed');
      
      const data: NominatimResult[] = await response.json();
      setResults(data);
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

  const handleSelect = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const addr = result.address;
    
    // Build concise display name
    const parts: string[] = [];
    const name = result.display_name.split(',')[0]?.trim();
    if (name) parts.push(name);
    const city = addr?.city || addr?.town || addr?.village;
    if (city && city !== name) parts.push(city);
    if (addr?.country) parts.push(addr.country);
    
    const displayName = parts.join(', ');
    const countryCode = addr?.country_code?.toUpperCase();
    
    setQuery(displayName);
    onChange(displayName);
    onSelect({ name: displayName, lat, lng, countryCode, city: city || name || undefined });
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

  const formatResultDisplay = (result: NominatimResult) => {
    const parts = result.display_name.split(',').map(s => s.trim());
    const main = parts[0] || t('place.unknown');
    const sub = parts.slice(1, 4).join(', ');
    return { main, sub };
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
          placeholder={placeholder || t('place.placeholder')}
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
          {t('place.noResults')}
        </div>
      )}
    </div>
  );
}
