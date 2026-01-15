from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_admin = Column(Boolean, default=False)
    
    settings = relationship("UserSettings", back_populates="user", uselist=False)
    favorite_locations = relationship("FavoriteLocation", back_populates="user", cascade="all, delete-orphan")
    fuel_logs = relationship("FuelLog", back_populates="user", cascade="all, delete-orphan")

class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    radius = Column(Float, default=5.0)  # km
    target_price = Column(Float, nullable=True)
    is_active = Column(Boolean, default=False)
    show_heatmap = Column(Boolean, default=False)  # NEW: Heatmap toggle
    
    user = relationship("User", back_populates="settings")

class FavoriteLocation(Base):
    """Favoriten-Orte (Wohnort, Arbeit, etc.)"""
    __tablename__ = "favorite_locations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)  # z.B. "Wohnort", "Arbeit", "Berlin"
    city = Column(String)  # Stadt/Ort
    latitude = Column(Float)
    longitude = Column(Float)
    is_home = Column(Boolean, default=False)  # Ist das der Wohnort?
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="favorite_locations")

class FuelLog(Base):
    """Fahrtenbuch - Tankfüllungen"""
    __tablename__ = "fuel_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    
    # Tankstellen-Info
    station_name = Column(String)
    city = Column(String, nullable=True)
    
    # Tank-Daten
    liters = Column(Float)  # Getankte Liter
    price_per_liter = Column(Float)  # Preis pro Liter
    total_price = Column(Float)  # Gesamtpreis
    fuel_type = Column(String, default="diesel")  # diesel, e5, e10
    
    # Fahrzeug-Daten
    odometer = Column(Float, nullable=True)  # Kilometerstand
    kilometers_driven = Column(Float, nullable=True)  # Gefahrene km seit letzter Tankfüllung
    consumption = Column(Float, nullable=True)  # Verbrauch in L/100km
    
    # Metadaten
    date = Column(DateTime, default=datetime.utcnow)
    notes = Column(String, nullable=True)  # Notizen
    
    user = relationship("User", back_populates="fuel_logs")
