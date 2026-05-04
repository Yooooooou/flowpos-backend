from pathlib import Path


def test_pos_production_backlog_tracks_required_business_features() -> None:
    backlog = Path("POS_PRODUCTION_BACKLOG.md").read_text(encoding="utf-8")

    for section in [
        "Payments",
        "Refunds And Voids",
        "Discounts, Taxes, And Service Fees",
        "Staff Shifts",
        "Device Agent Protocol",
        "Inventory And Availability",
        "Reporting",
    ]:
        assert section in backlog
    assert "Acceptance criteria" in backlog
