from pathlib import Path


def test_pages_workflow_builds_and_deploys_static_dashboard() -> None:
    workflow = Path(".github/workflows/deploy-pages.yml").read_text(encoding="utf-8")

    assert "workflow_call:" in workflow
    assert "npm ci" in workflow
    assert "npm test" in workflow
    assert "actions/configure-pages@v6" in workflow
    assert "actions/upload-pages-artifact@v5" in workflow
    assert "actions/deploy-pages@v5" in workflow
    assert "path: web/dist" in workflow


def test_monthly_refresh_calls_pages_deployment() -> None:
    workflow = Path(".github/workflows/refresh-data.yml").read_text(encoding="utf-8")

    assert "uses: ./.github/workflows/deploy-pages.yml" in workflow
    assert "pages: write" in workflow
    assert "id-token: write" in workflow
