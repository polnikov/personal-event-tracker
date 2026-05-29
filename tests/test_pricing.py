from datetime import datetime
from decimal import Decimal

from app.models import Category, Subcategory, SubcategoryPrice
from app.pricing import calc_total, get_price_at


def _make_subcategory(db) -> Subcategory:
    cat = Category(name="Категория", color="#fff")
    db.add(cat)
    db.flush()
    sub = Subcategory(category_id=cat.id, name="Подкатегория")
    db.add(sub)
    db.flush()
    return sub


def test_get_price_at_picks_latest_on_or_before(db_session):
    sub = _make_subcategory(db_session)
    db_session.add_all([
        SubcategoryPrice(subcategory_id=sub.id, price_per_hour=Decimal("100"), effective_from=datetime(2024, 1, 1)),
        SubcategoryPrice(subcategory_id=sub.id, price_per_hour=Decimal("150"), effective_from=datetime(2025, 6, 1)),
        SubcategoryPrice(subcategory_id=sub.id, price_per_hour=Decimal("200"), effective_from=datetime(2026, 6, 1)),
    ])
    db_session.commit()

    assert get_price_at(db_session, sub.id, datetime(2025, 9, 1)) == Decimal("150")
    # boundary is inclusive (effective_from <= at)
    assert get_price_at(db_session, sub.id, datetime(2026, 6, 1)) == Decimal("200")
    # far future falls to the most recent
    assert get_price_at(db_session, sub.id, datetime(2099, 1, 1)) == Decimal("200")


def test_get_price_at_before_first_price_is_none(db_session):
    sub = _make_subcategory(db_session)
    db_session.add(
        SubcategoryPrice(subcategory_id=sub.id, price_per_hour=Decimal("100"), effective_from=datetime(2025, 1, 1))
    )
    db_session.commit()
    assert get_price_at(db_session, sub.id, datetime(2024, 1, 1)) is None


def test_get_price_at_no_prices_is_none(db_session):
    sub = _make_subcategory(db_session)
    db_session.commit()
    assert get_price_at(db_session, sub.id, datetime(2026, 1, 1)) is None


def test_calc_total_rounds_to_cents():
    assert calc_total(Decimal("100"), 90) == Decimal("150.00")
    assert calc_total(Decimal("250"), 60) == Decimal("250.00")
    assert calc_total(Decimal("100"), 50) == Decimal("83.33")
