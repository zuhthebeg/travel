/**
 * 사진에서 EXIF GPS 좌표 + 촬영 시간 추출 (순수 JS, 라이브러리 불필요)
 */

interface ExifData {
  lat: number | null;
  lng: number | null;
  datetime: string | null; // "YYYY-MM-DD HH:mm:ss"
}

export function extractExif(file: File): Promise<ExifData> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const view = new DataView(e.target?.result as ArrayBuffer);
        const result = parseExif(view);
        resolve(result);
      } catch {
        resolve({ lat: null, lng: null, datetime: null });
      }
    };
    reader.onerror = () => resolve({ lat: null, lng: null, datetime: null });
    // EXIF is in the first 128KB
    reader.readAsArrayBuffer(file.slice(0, 131072));
  });
}

function parseExif(view: DataView): ExifData {
  const result: ExifData = { lat: null, lng: null, datetime: null };

  // Check JPEG SOI marker
  if (view.getUint16(0) !== 0xFFD8) return result;

  let offset = 2;
  while (offset < view.byteLength - 2) {
    const marker = view.getUint16(offset);
    if (marker === 0xFFE1) {
      // APP1 (EXIF)
      const length = view.getUint16(offset + 2);
      parseApp1(view, offset + 4, length - 2, result);
      break;
    }
    // Skip to next marker
    if ((marker & 0xFF00) !== 0xFF00) break;
    offset += 2 + view.getUint16(offset + 2);
  }

  return result;
}

function parseApp1(view: DataView, start: number, _length: number, result: ExifData) {
  // Check "Exif\0\0"
  if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0x0000) return;

  const tiffStart = start + 6;
  const bigEndian = view.getUint16(tiffStart) === 0x4D4D;

  const getU16 = (o: number) => view.getUint16(o, !bigEndian);
  const getU32 = (o: number) => view.getUint32(o, !bigEndian);

  // IFD0
  const ifd0Offset = tiffStart + getU32(tiffStart + 4);
  const ifd0Count = getU16(ifd0Offset);

  let gpsOffset = 0;
  let exifOffset = 0;

  for (let i = 0; i < ifd0Count; i++) {
    const entryStart = ifd0Offset + 2 + i * 12;
    const tag = getU16(entryStart);
    if (tag === 0x8825) gpsOffset = tiffStart + getU32(entryStart + 8); // GPSInfo
    if (tag === 0x8769) exifOffset = tiffStart + getU32(entryStart + 8); // ExifIFD
  }

  // Parse GPS
  if (gpsOffset) {
    parseGPS(view, tiffStart, gpsOffset, bigEndian, result);
  }

  // Parse DateTime from ExifIFD
  if (exifOffset) {
    parseDatetime(view, tiffStart, exifOffset, bigEndian, result);
  }

  // Fallback: DateTime from IFD0 (tag 0x0132)
  if (!result.datetime) {
    for (let i = 0; i < ifd0Count; i++) {
      const entryStart = ifd0Offset + 2 + i * 12;
      const tag = getU16(entryStart);
      if (tag === 0x0132) { // DateTime
        const strOffset = tiffStart + getU32(entryStart + 8);
        result.datetime = readExifString(view, strOffset, 19);
        break;
      }
    }
  }

  // Format datetime: "2024:01:15 14:30:00" → "2024-01-15 14:30:00"
  if (result.datetime) {
    result.datetime = result.datetime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
  }
}

function parseGPS(view: DataView, tiffStart: number, gpsOffset: number, bigEndian: boolean, result: ExifData) {
  const getU16 = (o: number) => view.getUint16(o, !bigEndian);
  const getU32 = (o: number) => view.getUint32(o, !bigEndian);

  const count = getU16(gpsOffset);
  let latRef = '', lngRef = '';
  let latVals: number[] = [], lngVals: number[] = [];

  for (let i = 0; i < count; i++) {
    const entry = gpsOffset + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;

    const tag = getU16(entry);
    const valOffset = tiffStart + getU32(entry + 8);

    if (tag === 1) latRef = String.fromCharCode(view.getUint8(entry + 8)); // N/S
    if (tag === 3) lngRef = String.fromCharCode(view.getUint8(entry + 8)); // E/W

    if (tag === 2 && valOffset + 24 <= view.byteLength) { // Latitude
      latVals = readRationals(view, valOffset, 3, bigEndian);
    }
    if (tag === 4 && valOffset + 24 <= view.byteLength) { // Longitude
      lngVals = readRationals(view, valOffset, 3, bigEndian);
    }
  }

  if (latVals.length === 3) {
    result.lat = (latVals[0] + latVals[1] / 60 + latVals[2] / 3600) * (latRef === 'S' ? -1 : 1);
  }
  if (lngVals.length === 3) {
    result.lng = (lngVals[0] + lngVals[1] / 60 + lngVals[2] / 3600) * (lngRef === 'W' ? -1 : 1);
  }
}

function parseDatetime(view: DataView, tiffStart: number, exifOffset: number, bigEndian: boolean, result: ExifData) {
  const getU16 = (o: number) => view.getUint16(o, !bigEndian);
  const getU32 = (o: number) => view.getUint32(o, !bigEndian);

  const count = getU16(exifOffset);
  for (let i = 0; i < count; i++) {
    const entry = exifOffset + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;

    const tag = getU16(entry);
    // 0x9003 = DateTimeOriginal, 0x9004 = DateTimeDigitized
    if (tag === 0x9003 || tag === 0x9004) {
      const strOffset = tiffStart + getU32(entry + 8);
      if (strOffset + 19 <= view.byteLength) {
        result.datetime = readExifString(view, strOffset, 19);
        if (tag === 0x9003) break; // Prefer Original
      }
    }
  }
}

function readRationals(view: DataView, offset: number, count: number, bigEndian: boolean): number[] {
  const vals: number[] = [];
  for (let i = 0; i < count; i++) {
    const num = view.getUint32(offset + i * 8, !bigEndian);
    const den = view.getUint32(offset + i * 8 + 4, !bigEndian);
    vals.push(den ? num / den : 0);
  }
  return vals;
}

function readExifString(view: DataView, offset: number, length: number): string {
  let str = '';
  for (let i = 0; i < length && offset + i < view.byteLength; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  return str;
}
