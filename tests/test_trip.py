from adventure import trip

TRIP = {
    "id": "KYO-2027", "destination": "Kyoto", "travellers": ["A", "B"],
    "dates": {"depart": "2027-04-01", "return": "2027-04-05"},
    "documents": {"passport_expiry": "2027-08-01"},
    "flights": [{"flight_number": "XX1", "date": "2027-04-05", "status": "to book"}],
    "accommodation": [
        {"name": "Ryokan", "checkin": "2027-04-01", "checkout": "2027-04-02", "status": "booked"},
        {"name": "Old hotel", "checkin": "2027-04-02", "checkout": "2027-04-03", "status": "dropped"},
    ],
    "transport": [{"what": "Night bus", "date": "2027-04-03", "overnight": True, "status": "booked"}],
    "activities": [{"what": "Tea ceremony", "date": "2027-04-02", "status": "to book"}],
}


def test_validate_flags_missing_fields_and_bad_dates():
    assert trip.validate(TRIP) == []
    broken = {"destination": "X", "dates": {"depart": "2027-04-05", "return": "2027-04-01"}}
    problems = trip.validate(broken)
    assert "missing field: id" in problems
    assert "return date is before departure" in problems


def test_nights_without_bed_counts_only_booked_stays_and_overnight_transport():
    assert trip.nights_without_bed(TRIP) == ["2027-04-02", "2027-04-04"]


def test_gaps_lists_everything_a_traveller_should_fix():
    found = trip.gaps(TRIP)
    assert "no bed booked for the night of 2027-04-02" in found
    assert "to book: XX1 (2027-04-05)" in found
    assert "to book: Tea ceremony (2027-04-02)" in found
    assert "passport expires within six months of departure" in found
