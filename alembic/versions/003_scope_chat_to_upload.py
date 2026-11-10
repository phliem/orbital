"""Keep chat context tied to the PDF that was active when a message was sent."""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "003_scope_chat_to_upload"
down_revision = "002_title_review"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Older messages have no reliable upload association. Leave them unscoped.
    op.add_column("messages", sa.Column("document_id", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "document_id")
