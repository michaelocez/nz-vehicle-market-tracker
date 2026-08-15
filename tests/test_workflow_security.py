import re
from pathlib import Path

import pytest

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_DIRECTORY = REPOSITORY_ROOT / ".github" / "workflows"
EXTERNAL_ACTION = re.compile(r"^\s*uses:\s*[^./][^@\s]*@(?P<revision>[^\s#]+)")
IMMUTABLE_COMMIT_SHA = re.compile(r"^[0-9a-fA-F]{40}$")


@pytest.mark.parametrize(
    "workflow_path",
    sorted(WORKFLOW_DIRECTORY.glob("*.yml")),
    ids=lambda path: path.name,
)
def test_workflows_pin_external_actions(workflow_path: Path) -> None:
    workflow = workflow_path.read_text(encoding="utf-8")
    revisions = [
        match.group("revision")
        for line in workflow.splitlines()
        if (match := EXTERNAL_ACTION.match(line))
    ]

    assert revisions, f"No external actions found in {workflow_path}"
    assert all(IMMUTABLE_COMMIT_SHA.fullmatch(revision) for revision in revisions)
