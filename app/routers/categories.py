from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth import require_auth
from ..database import get_db
from ..models import Category, Subcategory, SubcategoryPrice
from ..schemas import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    SubcategoryCreate,
    SubcategoryPriceCreate,
    SubcategoryPriceRead,
    SubcategoryRead,
    SubcategoryUpdate,
)
from ..serializers import category_to_schema, subcategory_to_schema

router = APIRouter(
    prefix="/api/categories",
    tags=["categories"],
    dependencies=[Depends(require_auth)],
)


def _all_categories(db: Session) -> list[Category]:
    return (
        db.execute(
            select(Category)
            .options(selectinload(Category.subcategories).selectinload(Subcategory.prices))
            .order_by(Category.name)
        )
        .scalars()
        .all()
    )


@router.get("", response_model=list[CategoryRead])
def list_categories(db: Session = Depends(get_db)):
    return [category_to_schema(c) for c in _all_categories(db)]


@router.post("", response_model=CategoryRead, status_code=201)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)):
    cat = Category(
        name=payload.name.strip(),
        color=payload.color,
        icon=payload.icon,
        google_calendar_id=(payload.google_calendar_id or None),
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return category_to_schema(cat)


@router.put("/{cat_id}", response_model=CategoryRead)
def update_category(cat_id: int, payload: CategoryUpdate, db: Session = Depends(get_db)):
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(404)
    cat.name = payload.name.strip()
    cat.color = payload.color
    cat.icon = payload.icon
    cat.google_calendar_id = payload.google_calendar_id or None
    db.commit()
    db.refresh(cat)
    return category_to_schema(cat)


@router.delete("/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db)):
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(404)
    db.delete(cat)
    db.commit()
    return {"ok": True}


@router.post("/{cat_id}/subcategories", response_model=SubcategoryRead, status_code=201)
def create_subcategory(cat_id: int, payload: SubcategoryCreate, db: Session = Depends(get_db)):
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(404)
    sub = Subcategory(category_id=cat_id, name=payload.name.strip(), icon=payload.icon)
    db.add(sub)
    db.flush()
    db.add(
        SubcategoryPrice(
            subcategory_id=sub.id,
            price_per_hour=payload.initial_price,
            effective_from=payload.effective_from or datetime.now(),
        )
    )
    db.commit()
    db.refresh(sub)
    # reload prices
    sub = (
        db.execute(
            select(Subcategory).options(selectinload(Subcategory.prices)).where(Subcategory.id == sub.id)
        )
        .scalars()
        .one()
    )
    return subcategory_to_schema(sub)


@router.put("/subcategories/{sub_id}", response_model=SubcategoryRead)
def update_subcategory(sub_id: int, payload: SubcategoryUpdate, db: Session = Depends(get_db)):
    sub = db.get(Subcategory, sub_id)
    if not sub:
        raise HTTPException(404)
    sub.name = payload.name.strip()
    sub.icon = payload.icon
    db.commit()
    sub = (
        db.execute(
            select(Subcategory).options(selectinload(Subcategory.prices)).where(Subcategory.id == sub_id)
        )
        .scalars()
        .one()
    )
    return subcategory_to_schema(sub)


@router.delete("/subcategories/{sub_id}")
def delete_subcategory(sub_id: int, db: Session = Depends(get_db)):
    sub = db.get(Subcategory, sub_id)
    if not sub:
        raise HTTPException(404)
    db.delete(sub)
    db.commit()
    return {"ok": True}


@router.post("/subcategories/{sub_id}/prices", response_model=SubcategoryPriceRead, status_code=201)
def add_price(sub_id: int, payload: SubcategoryPriceCreate, db: Session = Depends(get_db)):
    sub = db.get(Subcategory, sub_id)
    if not sub:
        raise HTTPException(404)
    p = SubcategoryPrice(
        subcategory_id=sub_id,
        price_per_hour=payload.price_per_hour,
        effective_from=payload.effective_from,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return SubcategoryPriceRead.model_validate(p)


@router.put("/prices/{price_id}", response_model=SubcategoryPriceRead)
def update_price(price_id: int, payload: SubcategoryPriceCreate, db: Session = Depends(get_db)):
    p = db.get(SubcategoryPrice, price_id)
    if not p:
        raise HTTPException(404)
    p.price_per_hour = payload.price_per_hour
    p.effective_from = payload.effective_from
    db.commit()
    db.refresh(p)
    return SubcategoryPriceRead.model_validate(p)


@router.delete("/prices/{price_id}")
def delete_price(price_id: int, db: Session = Depends(get_db)):
    # Safe for events: they snapshot the rate at creation and hold no link to
    # a price row. Removing the last price just leaves the subcategory with no
    # current price (auto-pricing then errors until a new one is added).
    p = db.get(SubcategoryPrice, price_id)
    if not p:
        raise HTTPException(404)
    db.delete(p)
    db.commit()
    return {"ok": True}
