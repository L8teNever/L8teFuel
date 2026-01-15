from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import requests

from . import models, auth, database
from .database import engine, get_db

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="L8teFuel API")

# CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initial Admin Creation & Database Setup
@app.on_event("startup")
def create_initial_admin():
    """Erstellt Datenbank-Tabellen und Admin-User beim Server-Start"""
    try:
        # 1. Erstelle alle Tabellen falls sie nicht existieren
        print("🔄 Erstelle Datenbank-Tabellen...")
        models.Base.metadata.create_all(bind=engine)
        print("✅ Datenbank-Tabellen erstellt/überprüft")
        
        # 2. Erstelle Admin-User falls er nicht existiert
        db = next(database.get_db())
        admin = db.query(models.User).filter(models.User.username == "admin").first()
        
        if not admin:
            print("🔄 Erstelle Admin-User...")
            hashed_pw = auth.get_password_hash("admin123")
            new_admin = models.User(username="admin", hashed_password=hashed_pw, is_admin=True)
            db.add(new_admin)
            db.commit()
            db.refresh(new_admin)
            
            # Create default settings
            settings = models.UserSettings(user_id=new_admin.id)
            db.add(settings)
            db.commit()
            
            print("✅ Admin-User erstellt: admin / admin123")
        else:
            print("✅ Admin-User existiert bereits")
            
    except Exception as e:
        print(f"❌ Fehler beim Startup: {e}")
        raise

# --- Auth Endpoints ---

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer", "is_admin": user.is_admin}

# --- User Management (Admin only) ---

@app.post("/admin/users", status_code=status.HTTP_201_CREATED)
async def create_user(username: str, password: str, current_admin: models.User = Depends(auth.get_current_admin), db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(models.User.username == username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_pw = auth.get_password_hash(password)
    new_user = models.User(username=username, hashed_password=hashed_pw, is_admin=False)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Create default settings
    settings = models.UserSettings(user_id=new_user.id)
    db.add(settings)
    db.commit()
    return {"message": "User created successfully"}

@app.get("/admin/users")
async def list_users(current_admin: models.User = Depends(auth.get_current_admin), db: Session = Depends(get_db)):
    return db.query(models.User).all()

@app.put("/admin/users/{username}/reset-password")
async def reset_password(username: str, new_password: str, current_admin: models.User = Depends(auth.get_current_admin), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = auth.get_password_hash(new_password)
    db.commit()
    return {"message": "Password reset successfully"}

# --- User Endpoints ---

@app.get("/me")
async def get_me(current_user: models.User = Depends(auth.get_current_user)):
    return {
        "username": current_user.username,
        "is_admin": current_user.is_admin,
        "settings": {
            "latitude": current_user.settings.latitude,
            "longitude": current_user.settings.longitude,
            "radius": current_user.settings.radius,
            "target_price": current_user.settings.target_price,
            "is_active": current_user.settings.is_active
        }
    }

@app.put("/me/password")
async def change_password(new_password: str, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    current_user.hashed_password = auth.get_password_hash(new_password)
    db.commit()
    return {"message": "Password updated successfully"}

@app.put("/me/settings")
async def update_settings(latitude: Optional[float] = None, 
                         longitude: Optional[float] = None, 
                         radius: Optional[float] = None, 
                         target_price: Optional[float] = None,
                         is_active: Optional[bool] = None,
                         current_user: models.User = Depends(auth.get_current_user), 
                         db: Session = Depends(get_db)):
    if latitude is not None: current_user.settings.latitude = latitude
    if longitude is not None: current_user.settings.longitude = longitude
    if radius is not None: current_user.settings.radius = radius
    if target_price is not None: current_user.settings.target_price = target_price
    if is_active is not None: current_user.settings.is_active = is_active
    db.commit()
    return {"message": "Settings updated"}

@app.get("/debug/settings")
async def debug_settings(current_user: models.User = Depends(auth.get_current_user)):
    """Debug endpoint to check current user settings and API configuration"""
    api_key = os.getenv("TANKERKOENIG_API_KEY")
    return {
        "user": current_user.username,
        "settings": {
            "latitude": current_user.settings.latitude,
            "longitude": current_user.settings.longitude,
            "radius": current_user.settings.radius,
            "target_price": current_user.settings.target_price,
            "is_active": current_user.settings.is_active
        },
        "api_config": {
            "has_api_key": bool(api_key),
            "api_key_preview": api_key[:8] + "..." if api_key else None,
            "is_test_key": api_key.startswith("0000") if api_key else False
        }
    }

# --- Fuel Price Logic ---

@app.get("/check-prices")
async def check_prices(current_user: models.User = Depends(auth.get_current_user)):
    """Returns ALL stations in radius for map display (Dashboard)"""
    if not current_user.settings.is_active or not current_user.settings.latitude:
        return {"status": "inactive", "all_stations": []}
    
    api_key = os.getenv("TANKERKOENIG_API_KEY")
    
    # Validate radius (Tankerkoenig API max is 25 km)
    search_radius = min(current_user.settings.radius, 25.0)
    
    # Simple Mock fallback / Warning if no key
    if not api_key or api_key.startswith("0000"):
        print(f"⚠️  WARNING: Using MOCK data - No valid API key configured!")
        print(f"   Current API Key: {api_key}")
        print(f"   Get a real API key from: https://creativecommons.tankerkoenig.de")
        # Keep the mock for testing if no valid key is provided
        mock_stations = [
            {"name": "MOCK (No API Key) - Shell", "price": 1.65, "distance": 1.2, "lat": current_user.settings.latitude + 0.01, "lng": current_user.settings.longitude + 0.01},
            {"name": "MOCK (No API Key) - Aral", "price": 1.58, "distance": 3.4, "lat": current_user.settings.latitude + 0.03, "lng": current_user.settings.longitude + 0.02},
            {"name": "MOCK (No API Key) - Esso", "price": 1.72, "distance": 2.1, "lat": current_user.settings.latitude + 0.02, "lng": current_user.settings.longitude + 0.015},
        ]
        # Return ALL stations for map display
        all_in_radius = [s for s in mock_stations if s["distance"] <= current_user.settings.radius]
        return {"status": "active", "all_stations": all_in_radius, "target_price": current_user.settings.target_price, "debug": "Using MOCK data - configure real API key"}

    try:
        url = "https://creativecommons.tankerkoenig.de/json/list.php"
        params = {
            "lat": current_user.settings.latitude,
            "lng": current_user.settings.longitude,
            "rad": search_radius,
            "sort": "dist",
            "type": "all",
            "apikey": api_key
        }
        
        print(f"🔍 Tankerkoenig API Request:")
        print(f"   Location: {params['lat']}, {params['lng']}")
        print(f"   Radius: {params['rad']} km")
        print(f"   API Key: {api_key[:8]}...")
        
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        print(f"📡 API Response Status: {response.status_code}")
        print(f"   OK: {data.get('ok')}")
        print(f"   Message: {data.get('message', 'N/A')}")
        
        if not data.get("ok"):
            error_msg = data.get("message", "Unknown API error")
            print(f"❌ API Error: {error_msg}")
            print(f"   Full response: {data}")
            return {"status": "api_error", "all_stations": [], "error": error_msg}

        stations = data.get("stations", [])
        print(f"✅ Found {len(stations)} stations from API")
        
        all_stations = []
        
        for s in stations:
            if not s.get("isOpen", True):
                continue

            # Default priority: E10 -> E5 -> Diesel
            price = s.get("e10")
            if not price: price = s.get("e5")
            if not price: price = s.get("diesel")
            
            # Skip if no price found (e.g. station doesn't sell standard fuels)
            if not price:
                 continue

            # Return ALL stations (no price filtering here)
            all_stations.append({
                "name": f"{s.get('brand')} - {s.get('street')} {s.get('houseNumber', '')}", 
                "price": price, 
                "distance": s.get("dist"), 
                "lat": s.get("lat"), 
                "lng": s.get("lng")
            })
        
        print(f"📍 Returning {len(all_stations)} stations for map display")
        return {"status": "active", "all_stations": all_stations, "target_price": current_user.settings.target_price}

    except Exception as e:
        print(f"❌ Error fetching prices: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "all_stations": [], "error": str(e)}

@app.get("/search-stations")
async def search_stations(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: Optional[float] = None,
    max_price: Optional[float] = None,
    fuel_type: Optional[str] = "diesel",
    current_user: models.User = Depends(auth.get_current_user)
):
    """Independent search for Explore page with custom filters"""
    
    # Use provided params or fall back to user settings
    search_lat = lat if lat is not None else current_user.settings.latitude
    search_lng = lng if lng is not None else current_user.settings.longitude
    search_radius = radius if radius is not None else current_user.settings.radius
    search_max_price = max_price if max_price is not None else 999.0
    
    if not search_lat or not search_lng:
        return {"status": "no_location", "stations": []}
    
    api_key = os.getenv("TANKERKOENIG_API_KEY")
    
    # Validate radius (Tankerkoenig API max is 25 km)
    search_radius = min(search_radius, 25.0)
    
    # Simple Mock fallback
    if not api_key or api_key.startswith("0000"):
        mock_stations = [
            {"name": "MOCK - Shell", "diesel": 1.65, "e5": 1.75, "e10": 1.72, "distance": 1.2, "lat": search_lat + 0.01, "lng": search_lng + 0.01},
            {"name": "MOCK - Aral", "diesel": 1.58, "e5": 1.68, "e10": 1.65, "distance": 3.4, "lat": search_lat + 0.03, "lng": search_lng + 0.02},
            {"name": "MOCK - Esso", "diesel": 1.72, "e5": 1.82, "e10": 1.79, "distance": 2.1, "lat": search_lat + 0.02, "lng": search_lng + 0.015},
        ]
        
        results = []
        for s in mock_stations:
            if s["distance"] > search_radius:
                continue
            price = s.get(fuel_type, s.get("diesel"))
            if price <= search_max_price:
                results.append({
                    "name": s["name"],
                    "price": price,
                    "distance": s["distance"],
                    "lat": s["lat"],
                    "lng": s["lng"],
                    "fuel_type": fuel_type
                })
        
        return {"status": "active", "stations": results, "debug": "Using MOCK data"}

    try:
        url = "https://creativecommons.tankerkoenig.de/json/list.php"
        params = {
            "lat": search_lat,
            "lng": search_lng,
            "rad": search_radius,
            "sort": "dist",
            "type": "all",
            "apikey": api_key
        }
        
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if not data.get("ok"):
            return {"status": "api_error", "stations": [], "error": data.get("message", "Unknown error")}

        stations = data.get("stations", [])
        results = []
        
        for s in stations:
            if not s.get("isOpen", True):
                continue

            # Get price for selected fuel type
            price = s.get(fuel_type)
            if not price:
                continue
            
            if price <= search_max_price:
                results.append({
                    "name": f"{s.get('brand')} - {s.get('street')} {s.get('houseNumber', '')}", 
                    "price": price, 
                    "distance": s.get("dist"), 
                    "lat": s.get("lat"), 
                    "lng": s.get("lng"),
                    "fuel_type": fuel_type
                })
        
        return {"status": "active", "stations": results}

    except Exception as e:
        print(f"❌ Error searching stations: {e}")
        return {"status": "error", "stations": [], "error": str(e)}

# --- Favorite Locations Endpoints ---

@app.get("/favorite-locations")
async def get_favorite_locations(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    """Get all favorite locations for current user"""
    locations = db.query(models.FavoriteLocation).filter(
        models.FavoriteLocation.user_id == current_user.id
    ).order_by(models.FavoriteLocation.is_home.desc(), models.FavoriteLocation.created_at.desc()).all()
    
    return [{
        "id": loc.id,
        "name": loc.name,
        "city": loc.city,
        "latitude": loc.latitude,
        "longitude": loc.longitude,
        "is_home": loc.is_home,
        "created_at": loc.created_at.isoformat()
    } for loc in locations]

@app.post("/favorite-locations")
async def create_favorite_location(
    name: str,
    city: str,
    latitude: float,
    longitude: float,
    is_home: bool = False,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new favorite location"""
    # If marking as home, unmark all other homes
    if is_home:
        db.query(models.FavoriteLocation).filter(
            models.FavoriteLocation.user_id == current_user.id,
            models.FavoriteLocation.is_home == True
        ).update({"is_home": False})
    
    location = models.FavoriteLocation(
        user_id=current_user.id,
        name=name,
        city=city,
        latitude=latitude,
        longitude=longitude,
        is_home=is_home
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    
    return {"id": location.id, "message": "Location created"}

@app.delete("/favorite-locations/{location_id}")
async def delete_favorite_location(
    location_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a favorite location"""
    location = db.query(models.FavoriteLocation).filter(
        models.FavoriteLocation.id == location_id,
        models.FavoriteLocation.user_id == current_user.id
    ).first()
    
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    
    db.delete(location)
    db.commit()
    return {"message": "Location deleted"}

@app.get("/favorite-locations/{location_id}/prices")
async def get_favorite_location_prices(
    location_id: int,
    fuel_type: str = "diesel",
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get current prices for a favorite location"""
    location = db.query(models.FavoriteLocation).filter(
        models.FavoriteLocation.id == location_id,
        models.FavoriteLocation.user_id == current_user.id
    ).first()
    
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    
    # Use same logic as search-stations
    api_key = os.getenv("TANKERKOENIG_API_KEY")
    radius = 5.0  # Default 5km for favorite locations
    
    if not api_key or api_key.startswith("0000"):
        # Mock data
        return {
            "location_id": location_id,
            "city": location.city,
            "cheapest_price": 1.55,
            "average_price": 1.62,
            "station_count": 5,
            "is_mock": True
        }
    
    try:
        url = "https://creativecommons.tankerkoenig.de/json/list.php"
        params = {
            "lat": location.latitude,
            "lng": location.longitude,
            "rad": radius,
            "sort": "price",
            "type": "all",
            "apikey": api_key
        }
        
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if not data.get("ok"):
            return {"location_id": location_id, "city": location.city, "error": data.get("message")}
        
        stations = data.get("stations", [])
        prices = []
        
        for s in stations:
            if not s.get("isOpen", True):
                continue
            price = s.get(fuel_type)
            if price:
                prices.append(price)
        
        if not prices:
            return {"location_id": location_id, "city": location.city, "station_count": 0}
        
        return {
            "location_id": location_id,
            "city": location.city,
            "cheapest_price": min(prices),
            "average_price": sum(prices) / len(prices),
            "station_count": len(prices),
            "is_mock": False
        }
        
    except Exception as e:
        print(f"Error fetching prices for location: {e}")
        return {"location_id": location_id, "city": location.city, "error": str(e)}

# --- Fuel Log Endpoints (Fahrtenbuch) ---

@app.get("/fuel-logs")
async def get_fuel_logs(
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get all fuel logs for current user"""
    logs = db.query(models.FuelLog).filter(
        models.FuelLog.user_id == current_user.id
    ).order_by(models.FuelLog.date.desc()).limit(limit).all()
    
    return [{
        "id": log.id,
        "station_name": log.station_name,
        "city": log.city,
        "liters": log.liters,
        "price_per_liter": log.price_per_liter,
        "total_price": log.total_price,
        "fuel_type": log.fuel_type,
        "odometer": log.odometer,
        "kilometers_driven": log.kilometers_driven,
        "consumption": log.consumption,
        "date": log.date.isoformat(),
        "notes": log.notes
    } for log in logs]

@app.post("/fuel-logs")
async def create_fuel_log(
    station_name: str,
    liters: float,
    price_per_liter: float,
    fuel_type: str = "diesel",
    city: Optional[str] = None,
    odometer: Optional[float] = None,
    notes: Optional[str] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new fuel log entry"""
    total_price = liters * price_per_liter
    
    # Calculate consumption if odometer provided
    kilometers_driven = None
    consumption = None
    
    if odometer:
        # Get last fuel log
        last_log = db.query(models.FuelLog).filter(
            models.FuelLog.user_id == current_user.id,
            models.FuelLog.odometer != None
        ).order_by(models.FuelLog.date.desc()).first()
        
        if last_log and last_log.odometer:
            kilometers_driven = odometer - last_log.odometer
            if kilometers_driven > 0:
                consumption = (liters / kilometers_driven) * 100
    
    log = models.FuelLog(
        user_id=current_user.id,
        station_name=station_name,
        city=city,
        liters=liters,
        price_per_liter=price_per_liter,
        total_price=total_price,
        fuel_type=fuel_type,
        odometer=odometer,
        kilometers_driven=kilometers_driven,
        consumption=consumption,
        notes=notes
    )
    
    db.add(log)
    db.commit()
    db.refresh(log)
    
    return {"id": log.id, "message": "Fuel log created", "consumption": consumption}

@app.delete("/fuel-logs/{log_id}")
async def delete_fuel_log(
    log_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a fuel log"""
    log = db.query(models.FuelLog).filter(
        models.FuelLog.id == log_id,
        models.FuelLog.user_id == current_user.id
    ).first()
    
    if not log:
        raise HTTPException(status_code=404, detail="Fuel log not found")
    
    db.delete(log)
    db.commit()
    return {"message": "Fuel log deleted"}

@app.get("/fuel-logs/statistics")
async def get_fuel_statistics(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Get fuel consumption statistics"""
    logs = db.query(models.FuelLog).filter(
        models.FuelLog.user_id == current_user.id
    ).all()
    
    if not logs:
        return {"total_logs": 0}
    
    total_liters = sum(log.liters for log in logs)
    total_cost = sum(log.total_price for log in logs)
    avg_price = sum(log.price_per_liter for log in logs) / len(logs)
    
    consumptions = [log.consumption for log in logs if log.consumption]
    avg_consumption = sum(consumptions) / len(consumptions) if consumptions else None
    
    total_km = sum(log.kilometers_driven for log in logs if log.kilometers_driven)
    
    return {
        "total_logs": len(logs),
        "total_liters": round(total_liters, 2),
        "total_cost": round(total_cost, 2),
        "average_price_per_liter": round(avg_price, 3),
        "average_consumption": round(avg_consumption, 2) if avg_consumption else None,
        "total_kilometers": round(total_km, 1) if total_km else None
    }

# --- Settings Update for Heatmap ---

@app.put("/me/settings/heatmap")
async def toggle_heatmap(
    show_heatmap: bool,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle heatmap display"""
    current_user.settings.show_heatmap = show_heatmap
    db.commit()
    return {"show_heatmap": show_heatmap}

# Static Files
app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
