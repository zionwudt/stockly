from __future__ import annotations

import pytest

from jiancang.db import DEFAULT_ADMIN_USERNAME, DEFAULT_TENANT_SLUG, get_connection
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


def test_register_user_can_create_tenant_and_switch_into_it(service: InventoryService) -> None:
    principal, session_token = service.register_user(
        {
            "display_name": "测试成员",
            "username": "member_a",
            "password": "password123",
            "password_confirm": "password123",
        }
    )

    registered_principal = service.get_principal_for_session(session_token)
    assert registered_principal is not None
    assert registered_principal.tenant_id is None

    result = service.create_tenant(
        registered_principal,
        {
            "name": "华东分部",
            "slug": "east-branch",
        },
    )
    switched = service.switch_current_tenant(
        session_token,
        registered_principal,
        {"tenant_id": result["tenant"]["id"]},
    )
    profile = service.get_auth_profile(switched)

    assert result["tenant"]["slug"] == "east-branch"
    assert profile["current_tenant"]["slug"] == "east-branch"
    assert profile["available_tenants"][0]["is_owner"] is True


def test_user_can_request_join_tenant_and_owner_can_approve(service: InventoryService) -> None:
    owner_principal, owner_session_token = service.register_user(
        {
            "display_name": "租户创建者",
            "username": "tenant_owner",
            "password": "password123",
            "password_confirm": "password123",
        }
    )
    tenant_result = service.create_tenant(
        owner_principal,
        {
            "name": "审批租户",
            "slug": "approval-tenant",
        },
    )
    owner_principal = service.switch_current_tenant(
        owner_session_token,
        owner_principal,
        {"tenant_id": tenant_result["tenant"]["id"]},
    )

    applicant_principal, applicant_session_token = service.register_user(
        {
            "display_name": "申请成员",
            "username": "tenant_member",
            "password": "password123",
            "password_confirm": "password123",
        }
    )
    service.create_join_request(
        applicant_principal,
        {
            "tenant_slug": "approval-tenant",
            "note": "需要进入租户处理库存。",
        },
    )

    hub = service.get_tenant_hub(owner_principal)
    request_id = hub["pending_approvals"][0]["id"]
    review_result = service.review_join_request(owner_principal, request_id, True)
    switched = service.switch_current_tenant(
        applicant_session_token,
        applicant_principal,
        {"tenant_slug": "approval-tenant"},
    )

    assert review_result["message"].startswith("已同意")
    assert switched.tenant_slug == "approval-tenant"
    assert service.get_auth_profile(switched)["current_tenant"]["slug"] == "approval-tenant"


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


def test_get_statistics_returns_monthly_aggregates_for_selected_range(
    service: InventoryService,
    context,
) -> None:
    customer_id = service.list_partners(context, "customer")[0]["id"]
    product = next(item for item in service.list_products(context) if item["sku"] == "JC-COFFEE-001")

    sale_result = service.create_sale(
        context,
        {
            "partner_id": customer_id,
            "note": "monthly statistics",
            "items": [
                {
                    "product_id": product["id"],
                    "quantity": 6,
                    "unit_price": product["sale_price"],
                }
            ],
        },
    )
    adjustment_result = service.create_adjustment(
        context,
        {
            "product_id": product["id"],
            "quantity_delta": -2,
            "reason": "盘点",
            "note": "月度修正",
        },
    )

    _set_document_timestamp(service, "PO-01-0001", "2026-01-12 09:30:00")
    _set_document_timestamp(service, sale_result["doc_no"], "2026-02-08 14:20:00")
    _set_document_timestamp(service, adjustment_result["doc_no"], "2026-03-06 11:00:00")

    statistics = service.get_statistics(context, start_date="2026-01-01", end_date="2026-03-31")

    assert statistics["range"]["month_count"] == 3
    assert [item["month"] for item in statistics["monthly"]] == ["2026-01", "2026-02", "2026-03"]
    assert statistics["monthly"][0]["purchase_amount"] > 0
    assert statistics["monthly"][1]["sale_amount"] == pytest.approx(product["sale_price"] * 6)
    assert statistics["monthly"][2]["adjustment_docs"] == 1
    assert statistics["overview"]["document_count"] == 3


def test_get_statistics_respects_date_filters(
    service: InventoryService,
    context,
) -> None:
    customer_id = service.list_partners(context, "customer")[0]["id"]
    product = next(item for item in service.list_products(context) if item["sku"] == "JC-COFFEE-001")

    sale_result = service.create_sale(
        context,
        {
            "partner_id": customer_id,
            "note": "range filter",
            "items": [
                {
                    "product_id": product["id"],
                    "quantity": 4,
                    "unit_price": product["sale_price"],
                }
            ],
        },
    )

    _set_document_timestamp(service, "PO-01-0001", "2026-01-12 09:30:00")
    _set_document_timestamp(service, sale_result["doc_no"], "2026-02-08 14:20:00")

    statistics = service.get_statistics(context, start_date="2026-02-01", end_date="2026-02-28")

    assert statistics["overview"]["purchase_amount"] == 0
    assert statistics["overview"]["sale_amount"] == pytest.approx(product["sale_price"] * 4)
    assert statistics["overview"]["document_count"] == 1
    assert len(statistics["monthly"]) == 1
    monthly = statistics["monthly"][0]
    assert monthly["month"] == "2026-02"
    assert monthly["purchase_amount"] == 0
    assert monthly["sale_amount"] == pytest.approx(product["sale_price"] * 4)
    assert monthly["sale_docs"] == 1
    assert monthly["sale_quantity"] == 4
    assert monthly["document_count"] == 1
    assert monthly["net_amount"] == pytest.approx(product["sale_price"] * 4)


def _set_document_timestamp(service: InventoryService, doc_no: str, created_at: str) -> None:
    with get_connection(service.db_path) as connection:
        document_id = connection.execute(
            "SELECT id FROM documents WHERE tenant_id = 1 AND doc_no = ?",
            (doc_no,),
        ).fetchone()[0]
        connection.execute("UPDATE documents SET created_at = ? WHERE id = ?", (created_at, document_id))
        connection.execute("UPDATE stock_movements SET created_at = ? WHERE document_id = ?", (created_at, document_id))
        connection.commit()
