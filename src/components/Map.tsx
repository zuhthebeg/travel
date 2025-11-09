import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { Loading } from './Loading';
import { useState, useEffect } from 'react';

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
}

export function Map({ places }: MapProps) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: ['geocoding'],
  });

  const [markers, setMarkers] = useState<{ lat: number; lng: number }[]>([]);
  const [center, setCenter] = useState(defaultCenter);

  useEffect(() => {
    if (isLoaded && places && places.length > 0) {
      const geocoder = new window.google.maps.Geocoder();
      const newMarkers: { lat: number; lng: number }[] = [];
      const bounds = new window.google.maps.LatLngBounds();

      places.forEach((place) => {
        if (!place) return;
        geocoder.geocode({ address: place }, (results, status) => {
          if (status === 'OK' && results) {
            const location = results[0].geometry.location;
            const newMarker = { lat: location.lat(), lng: location.lng() };
            newMarkers.push(newMarker);
            bounds.extend(newMarker);
          }
        });
      });

      setMarkers(newMarkers);
      if (newMarkers.length > 0) {
        setCenter(bounds.getCenter().toJSON());
      }
    }
  }, [isLoaded, places]);

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
