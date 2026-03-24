from __future__ import annotations

import pytest

from jiancang.db import DEFAULT_ADMIN_USERNAME, DEFAULT_TENANT_SLUG
from jiancang.services import InventoryService, ValidationError


def test_authenticate_user_creates_reusable_session(service: InventoryService) -> None:
    context, session_token = service.authenticate_user(
        {
            "tenant_slug": DEFAULT_TENANT_SLUG,
            "username": DEFAULT_ADMIN_USERNAME,
            "password": "admin123456",
        }
    )

    session_context = service.get_context_for_session(session_token)

    assert context.username == DEFAULT_ADMIN_USERNAME
    assert session_context is not None
    assert session_context.user_id == context.user_id
    assert service.get_auth_profile(context)["tenant"]["slug"] == DEFAULT_TENANT_SLUG


def test_create_sale_updates_stock_and_records_document(
    service: InventoryService,
    context,
) -> None:
    customer_id = service.list_partners(context, "customer")[0]["id"]
    product = next(item for item in service.list_products(context) if item["sku"] == "JC-COFFEE-001")
    starting_stock = next(item for item in service.get_stock_overview(context) if item["id"] == product["id"])["on_hand"]

    result = service.create_sale(
        context,
        {
            "partner_id": customer_id,
            "note": "pytest sale",
            "items": [
                {
                    "product_id": product["id"],
                    "quantity": 5,
                    "unit_price": product["sale_price"],
                }
            ],
        },
    )

    updated_stock = next(item for item in service.get_stock_overview(context) if item["id"] == product["id"])["on_hand"]
    sale_documents = service.list_documents(context, doc_type="sale")

    assert result["doc_no"].startswith("SO-01-")
    assert updated_stock == pytest.approx(starting_stock - 5)
    assert sale_documents[0]["doc_no"] == result["doc_no"]


def test_create_sale_rejects_when_stock_is_insufficient(
    service: InventoryService,
    context,
) -> None:
    customer_id = service.list_partners(context, "customer")[0]["id"]
    product = next(item for item in service.list_products(context) if item["sku"] == "JC-COFFEE-001")

    with pytest.raises(ValidationError, match="商品库存不足"):
        service.create_sale(
            context,
            {
                "partner_id": customer_id,
                "items": [
                    {
                        "product_id": product["id"],
                        "quantity": 500,
                        "unit_price": product["sale_price"],
                    }
                ],
            },
        )
