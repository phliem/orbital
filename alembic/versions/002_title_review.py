"""Add the title review schema after the original baseline."""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "002_title_review"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Early builds of this branch added these fields to 001_initial.
    # Accept those databases too, without dropping any existing data.
    inspector = None if op.get_context().as_sql else sa.inspect(op.get_bind())
    conversations = (
        {column["name"] for column in inspector.get_columns("conversations")}
        if inspector is not None
        else set()
    )
    documents = (
        {column["name"] for column in inspector.get_columns("documents")}
        if inspector is not None
        else set()
    )
    if "title_source" not in conversations:
        op.add_column(
            "conversations",
            sa.Column("title_source", sa.String(), server_default="default", nullable=False),
        )
        # The old schema did not distinguish manual names from generated names.
        # Preserve any non-default name rather than replacing it on the next upload.
        op.execute(
            sa.text(
                "UPDATE conversations SET title_source = 'custom' WHERE title <> 'New Conversation'"
            )
        )
    if "property_line" not in conversations:
        op.add_column("conversations", sa.Column("property_line", sa.String()))
    if "document_type" not in documents:
        op.add_column(
            "documents",
            sa.Column("document_type", sa.String(), server_default="title-report", nullable=False),
        )
    if inspector is None or not inspector.has_table("title_reports"):
        op.create_table(
            "title_reports",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "conversation_id",
                sa.String(),
                sa.ForeignKey("conversations.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
            ),
            sa.Column("payload", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("title_reports")
    op.drop_column("documents", "document_type")
    op.drop_column("conversations", "property_line")
    op.drop_column("conversations", "title_source")
