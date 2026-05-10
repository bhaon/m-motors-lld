from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

# Création de l'engin de base de données
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# Création de la session locale
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Création de la classe de base pour les modèles
class Base(DeclarativeBase):
    pass


def get_db():
    """Obtient une session de base de données."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
