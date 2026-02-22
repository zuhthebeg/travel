import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { Loading } from './Loading';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const containerStyle = {
  width: '100%',
  height: '400px',
};

const defaultCenter = {
  lat: 37.5665,
  lng: 126.9780,
};

interface MapProps {
  places?: string[];
  onError?: () => void;
}

export function Map({ places, onError }: MapProps) {
  const { t } = useTranslation();
  console.log('VITE_GOOGLE_MAPS_API_KEY:', import.meta.env.VITE_GOOGLE_MAPS_API_KEY); // Add this line
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: ['places'] as const,
  });

  const [markers, setMarkers] = useState<{ lat: number; lng: number }[]>([]);
  const [center, setCenter] = useState(defaultCenter);

  useEffect(() => {
    if (loadError && onError) {
      onError();
    }
  }, [loadError, onError]);

  useEffect(() => {
    if (isLoaded && places && places.length > 0) {
      // Geocoding API를 사용하려면 Google Cloud Console에서 활성화 필요
      // https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com

      try {
        const geocoder = new window.google.maps.Geocoder();
        const newMarkers: { lat: number; lng: number }[] = [];
        const bounds = new window.google.maps.LatLngBounds();
        let successCount = 0;

        places.forEach((place, index) => {
          if (!place) return;

          geocoder.geocode({ address: place }, (results, status) => {
            if (status === 'OK' && results && results[0]) {
              const location = results[0].geometry.location;
              const newMarker = { lat: location.lat(), lng: location.lng() };
              newMarkers.push(newMarker);
              bounds.extend(newMarker);
              successCount++;

              // 마지막 장소 처리 완료 시 상태 업데이트
              if (index === places.length - 1) {
                setTimeout(() => {
                  setMarkers(newMarkers);
                  if (newMarkers.length > 0) {
                    setCenter(bounds.getCenter().toJSON());
                  }
                }, 100);
              }
            } else if (status === 'REQUEST_DENIED') {
              console.error('Geocoding API is not enabled. Please enable it in Google Cloud Console.');
              if (onError) onError();
            } else {
              console.warn(`Geocoding failed for "${place}": ${status}`);
            }
          });
        });
      } catch (error) {
        console.error('Geocoding error:', error);
        if (onError) onError();
      }
    }
  }, [isLoaded, places, onError]);

  if (loadError) {
    return (
      <div style={containerStyle} className="flex items-center justify-center bg-base-300 rounded-lg">
        <p className="text-base-content/70">{t('map.loadFailed')}</p>
      </div>
    );
  }

  if (!isLoaded) {
    return <Loading />;
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={places && places.length > 0 ? 12 : 10}
    >
      {markers.map((marker, index) => (
        <Marker key={index} position={marker} />
      ))}
    </GoogleMap>
  );
}
