"""GET /api/v1/lld-catalog — catalogue public pour la fiche véhicule."""

from fastapi.testclient import TestClient


def test_lld_catalog_public_returns_items(client: TestClient):
    """Après seed implicite, la liste contient les quatre codes métier."""
    r = client.get("/api/v1/lld-catalog")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    codes = {x["code"] for x in data["items"]}
    assert codes >= {"assurance", "assistance", "entretien", "controle_technique"}
    for item in data["items"]:
        assert "label" in item
        assert "surcout_mensuel_ht" in item
        assert "enabled" in item
