"""Daily forecast from Open-Meteo (free, no key). It only covers the next 16 days."""
from . import http

API = "https://api.open-meteo.com/v1/forecast"
WMO = {0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog",
       51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain",
       65: "Heavy rain", 80: "Showers", 81: "Showers", 82: "Heavy showers", 95: "Thunderstorms",
       96: "Thunderstorms with hail", 99: "Thunderstorms with hail"}


def describe(code):
    return WMO.get(code, "Mixed")


def forecast(lat, lon, start, end, get_json=http.get_json):
    data = get_json(API, {"latitude": lat, "longitude": lon, "timezone": "auto",
                          "start_date": start, "end_date": end,
                          "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum"})
    daily = data["daily"]
    days = []
    for i, date in enumerate(daily["time"]):
        days.append({"date": date, "summary": describe(daily["weather_code"][i]),
                     "high": round(daily["temperature_2m_max"][i]), "low": round(daily["temperature_2m_min"][i]),
                     "rain_mm": round(daily["precipitation_sum"][i] or 0)})
    return days
