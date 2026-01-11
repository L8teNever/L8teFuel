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

# Initial Admin Creation
@app.on_event("startup")
def create_initial_admin():
    db = next(database.get_db())
    admin = db.query(models.User).filter(models.User.username == "admin").first()
    if not admin:
        hashed_pw = auth.get_password_hash("admin123")
        new_admin = models.User(username="admin", hashed_password=hashed_pw, is_admin=True)
        db.add(new_admin)
        db.commit()
        db.refresh(new_admin)
        # Create default settings
        settings = models.UserSettings(user_id=new_admin.id)
        db.add(settings)
        db.commit()

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
    if not current_user.settings.is_active or not current_user.settings.latitude:
        return {"status": "inactive", "matches": []}
    
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
        ]
        matches = [s for s in mock_stations if s["price"] <= (current_user.settings.target_price or 999) and s["distance"] <= current_user.settings.radius]
        return {"status": "active", "matches": matches, "debug": "Using MOCK data - configure real API key"}

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
            return {"status": "api_error", "matches": [], "error": error_msg}

        stations = data.get("stations", [])
        print(f"✅ Found {len(stations)} stations from API")
        
        matches = []
        target_price = current_user.settings.target_price or 999.0
        
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

            if price <= target_price:
                matches.append({
                    "name": f"{s.get('brand')} - {s.get('street')} {s.get('houseNumber', '')}", 
                    "price": price, 
                    "distance": s.get("dist"), 
                    "lat": s.get("lat"), 
                    "lng": s.get("lng")
                })
        
        print(f"💰 {len(matches)} stations match price criteria (<= {target_price}€)")
        return {"status": "active", "matches": matches, "total_stations": len(stations)}

    except Exception as e:
        print(f"❌ Error fetching prices: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "matches": [], "error": str(e)}

# Static Files
app.mount("/", StaticFiles(directory="frontend", html=True), name="static")
