"""Small builders used across test modules to set up category → subcategory
→ price chains via the public API."""
from __future__ import annotations


def make_category(client, name="Тренировки", color="#3b82f6") -> dict:
    r = client.post("/api/categories", json={"name": name, "color": color})
    assert r.status_code == 201, r.text
    return r.json()


def make_subcategory(
    client,
    category_id: int,
    name="Персональная",
    initial_price="100.00",
    effective_from="2020-01-01T00:00:00",
) -> dict:
    r = client.post(
        f"/api/categories/{category_id}/subcategories",
        json={
            "name": name,
            "initial_price": initial_price,
            "effective_from": effective_from,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def make_client_record(client, first_name="Иван", last_name="Петров") -> dict:
    r = client.post(
        "/api/clients",
        json={"first_name": first_name, "last_name": last_name},
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


def make_subcategory_with_category(client, **kwargs) -> dict:
    """Returns the subcategory dict (which carries category_id)."""
    cat = make_category(client)
    return make_subcategory(client, cat["id"], **kwargs)
