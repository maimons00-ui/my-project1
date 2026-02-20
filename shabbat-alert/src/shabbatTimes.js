/**
 * Astronomical Shabbat time calculations.
 * Calculates sunset based on latitude/longitude using the NOAA solar equations.
 * Shabbat candle lighting is typically 18 minutes before sunset (configurable).
 */

const CANDLE_LIGHTING_OFFSET_MINUTES = 18;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

function calculateSunset(date, latitude, longitude) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const N1 = Math.floor(275 * month / 9);
  const N2 = Math.floor((month + 9) / 12);
  const N3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);
  const dayOfYear = N1 - N2 * N3 + day - 30;

  const lngHour = longitude / 15;
  const tSunset = dayOfYear + (18 - lngHour) / 24;

  const M = 0.9856 * tSunset - 3.289;
  let L =
    M +
    1.916 * Math.sin(toRadians(M)) +
    0.02 * Math.sin(toRadians(2 * M)) +
    282.634;
  L = ((L % 360) + 360) % 360;

  let RA = toDegrees(Math.atan(0.91764 * Math.tan(toRadians(L))));
  RA = ((RA % 360) + 360) % 360;

  const lQuadrant = Math.floor(L / 90) * 90;
  const raQuadrant = Math.floor(RA / 90) * 90;
  RA = RA + (lQuadrant - raQuadrant);
  RA = RA / 15;

  const sinDec = 0.39782 * Math.sin(toRadians(L));
  const cosDec = Math.cos(Math.asin(sinDec));

  const zenith = 90.833;
  const cosH =
    (Math.cos(toRadians(zenith)) - sinDec * Math.sin(toRadians(latitude))) /
    (cosDec * Math.cos(toRadians(latitude)));

  if (cosH > 1 || cosH < -1) {
    return null;
  }

  const H = toDegrees(Math.acos(cosH));
  const T = H / 15 + RA - 0.06571 * tSunset - 6.622;

  let UT = ((T - lngHour) % 24 + 24) % 24;

  const tzOffset = -date.getTimezoneOffset() / 60;
  let localTime = UT + tzOffset;
  localTime = ((localTime % 24) + 24) % 24;

  const hours = Math.floor(localTime);
  const minutes = Math.round((localTime - hours) * 60);

  const sunset = new Date(date);
  sunset.setHours(hours, minutes, 0, 0);
  return sunset;
}

export function getShabbatTimes(latitude, longitude, fridayDate = null) {
  let friday;
  if (fridayDate) {
    friday = new Date(fridayDate);
  } else {
    friday = getNextFriday();
  }

  const sunset = calculateSunset(friday, latitude, longitude);
  if (!sunset) {
    return null;
  }

  const candleLighting = new Date(sunset.getTime() - CANDLE_LIGHTING_OFFSET_MINUTES * 60 * 1000);

  return {
    friday,
    sunset,
    candleLighting,
    oneHourBefore: new Date(candleLighting.getTime() - 60 * 60 * 1000),
  };
}

export function getNextFriday() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;

  if (dayOfWeek === 5) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const friday = new Date(now);
  friday.setDate(now.getDate() + daysUntilFriday);
  friday.setHours(0, 0, 0, 0);
  return friday;
}

export function isFriday() {
  return new Date().getDay() === 5;
}

export function formatHebrewTime(date) {
  if (!date) return '--:--';
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function getHebrewDayName(date) {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return days[date.getDay()];
}
