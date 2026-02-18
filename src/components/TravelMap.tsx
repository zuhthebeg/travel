import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with webpack/vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

export interface MapPoint {
  id: number;
  lat: number;
  lng: number;
  title: string;
  place?: string;
  date: string;
  order: number;
  label?: string; // 텍스트 라벨 (숫자 대신 표시)
}

interface TravelMapProps {
  points: MapPoint[];
  showRoute?: boolean;
  height?: string;
  className?: string;
  onPointClick?: (point: MapPoint) => void;
}

// 날짜별 색상 생성 (무지개 그라데이션)
function getColorForDay(dayIndex: number, totalDays: number): string {
  const hue = (dayIndex / Math.max(1, totalDays - 1)) * 270; // 0 (red) to 270 (violet)
  return `hsl(${hue}, 70%, 50%)`;
}

// 커스텀 마커 아이콘 생성
function createNumberedIcon(number: number, color: string): L.DivIcon {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 12px;
        border: 2px solid white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      ">${number}</div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

// 텍스트 라벨 마커 (여행 제목용)
export function createLabelIcon(label: string, color: string): L.DivIcon {
  const maxLen = 10;
  const display = label.length > maxLen ? label.slice(0, maxLen) + '…' : label;
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        color: white;
        padding: 6px 12px;
        border-radius: 14px;
        white-space: nowrap;
        font-weight: bold;
        font-size: 13px;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.35);
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.2;
      ">${display}</div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 16],
    popupAnchor: [0, -16],
  });
}

export function TravelMap({ 
  points, 
  showRoute = true, 
  height = '400px',
  className = '',
  onPointClick 
}: TravelMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // 기존 맵이 있으면 제거
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    // 포인트가 없으면 기본 위치 (서울)로 표시
    const defaultCenter: L.LatLngExpression = [37.5665, 126.9780];
    const defaultZoom = 10;

    // 맵 초기화
    const map = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
    });
    mapInstanceRef.current = map;

    // 타일 레이어 (OpenStreetMap - 무료)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    if (points.length === 0) {
      return;
    }

    // 날짜별로 그룹화
    const dateGroups = new Map<string, MapPoint[]>();
    points.forEach(point => {
      const existing = dateGroups.get(point.date) || [];
      existing.push(point);
      dateGroups.set(point.date, existing);
    });
    const uniqueDates = Array.from(dateGroups.keys()).sort();
    const totalDays = uniqueDates.length;

    // 정렬된 포인트 (날짜 순 → order 순)
    const sortedPoints = [...points].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.order - b.order;
    });

    // 마커 추가
    const markers: L.Marker[] = [];
    sortedPoints.forEach((point, index) => {
      const dayIndex = uniqueDates.indexOf(point.date);
      const color = getColorForDay(dayIndex, totalDays);
      const icon = point.label
        ? createNumberedIcon(parseInt(point.label) || (index + 1), color)
        : createNumberedIcon(index + 1, color);

      const marker = L.marker([point.lat, point.lng], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="min-width: 150px;">
            <div style="font-weight: bold; margin-bottom: 4px;">${point.title}</div>
            ${point.place ? `<div style="color: #666; font-size: 12px;">📍 ${point.place}</div>` : ''}
            <div style="color: #888; font-size: 11px; margin-top: 4px;">📅 ${point.date}</div>
          </div>
        `);

      if (onPointClick) {
        marker.on('click', () => onPointClick(point));
      }

      markers.push(marker);
    });

    // 경로선 그리기
    if (showRoute && sortedPoints.length > 1) {
      // 그라데이션 효과를 위해 날짜별로 선 색상 다르게
      let prevDate = sortedPoints[0].date;
      let lineCoords: L.LatLngExpression[] = [[sortedPoints[0].lat, sortedPoints[0].lng]];
      
      for (let i = 1; i < sortedPoints.length; i++) {
        lineCoords.push([sortedPoints[i].lat, sortedPoints[i].lng]);
        
        // 날짜가 바뀌면 새로운 선 시작
        if (sortedPoints[i].date !== prevDate || i === sortedPoints.length - 1) {
          const dayIndex = uniqueDates.indexOf(prevDate);
          const color = getColorForDay(dayIndex, totalDays);
          
          L.polyline(lineCoords, {
            color,
            weight: 3,
            opacity: 0.7,
            dashArray: '10, 5',
          }).addTo(map);

          prevDate = sortedPoints[i].date;
          lineCoords = [[sortedPoints[i].lat, sortedPoints[i].lng]];
        }
      }
    }

    // 모든 마커가 보이도록 경계 조정
    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.1));
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [points, showRoute, onPointClick]);

  return (
    <div 
      ref={mapRef} 
      style={{ height, width: '100%' }}
      className={`rounded-lg overflow-hidden ${className}`}
    />
  );
}

// 일정 목록을 MapPoint로 변환하는 헬퍼
export function schedulesToMapPoints(schedules: Array<{
  id: number;
  title: string;
  place?: string | null;
  date: string;
  order_index: number;
  latitude?: number | null;
  longitude?: number | null;
  country_code?: string | null;
}>, excludeCountries?: string[]): MapPoint[] {
  return schedules
    .filter(s => {
      if (s.latitude == null || s.longitude == null) return false;
      const lat = s.latitude, lng = s.longitude;
      if (lat === 0 && lng === 0) return false;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
      if (excludeCountries?.length && s.country_code && excludeCountries.includes(s.country_code)) return false;
      return true;
    })
    .map(s => ({
      id: s.id,
      lat: s.latitude!,
      lng: s.longitude!,
      title: s.title,
      place: s.place || undefined,
      date: s.date,
      order: s.order_index,
    }));
}
