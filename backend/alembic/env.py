from alembic import context
from sqlalchemy import engine_from_config, pool
from logging.config import fileConfig
import sys
import os

# --- STEP 1: FIX THE PATH FIRST ---
# This adds the folder ABOVE 'alembic' (which is Filmnance/backend) to the path
# It also adds the root Filmnance folder so 'backend.models' works.
sys.path.insert(0, os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..')))
sys.path.insert(0, os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..')))

# --- STEP 2: NOW DO THE IMPORTS ---

# Now this should work!
try:
    from backend.models.models import Base
except ImportError:
    # Fallback if you are running from inside the backend folder
    from models.models import Base

# --- STEP 3: STANDARD ALEMBIC SETUP ---
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Use the same DATABASE_URL as the application instead of a value stored in the repo.
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', '.env')))
database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL is not set in the environment!")
config.set_main_option("sqlalchemy.url", database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection,
                          target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
