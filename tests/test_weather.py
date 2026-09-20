from adventure import weather

PAYLOAD = {"daily": {"time": ["2026-09-25", "2026-09-26"], "weather_code": [95, 61],
                     "temperature_2m_max": [31.4, 29.6], "temperature_2m_min": [24.2, 25.0],
                     "precipitation_sum": [48.7, None]}}


def test_forecast_turns_codes_into_words():
    seen = {}

    def get_json(url, params):
        seen.update(params)
        return PAYLOAD

    days = weather.forecast(10.8, 106.7, "2026-09-25", "2026-09-26", get_json=get_json)
    assert seen["timezone"] == "auto"
    assert days[0] == {"date": "2026-09-25", "summary": "Thunderstorms", "high": 31, "low": 24, "rain_mm": 49}
    assert days[1]["rain_mm"] == 0
    assert weather.describe(12345) == "Mixed"
