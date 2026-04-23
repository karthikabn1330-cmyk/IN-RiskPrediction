import os
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score
import pickle

def create_dummy_dataset(filename="datasets/mock_disaster_data.csv"):
    os.makedirs("datasets", exist_ok=True)
    os.makedirs("models", exist_ok=True)
    
    cities = [
        {"name": "Mumbai", "lat": 19.0760, "lng": 72.8777, "type": "Coastal"},
        {"name": "Delhi", "lat": 28.7041, "lng": 77.1025, "type": "Urban"},
        {"name": "Kolkata", "lat": 22.5726, "lng": 88.3639, "type": "Coastal"},
        {"name": "Chennai", "lat": 13.0827, "lng": 80.2707, "type": "Coastal"},
        {"name": "Shimla", "lat": 31.1048, "lng": 77.1734, "type": "Himalayan"},
        {"name": "Jaipur", "lat": 26.9124, "lng": 75.7873, "type": "Desert"},
        {"name": "Guwahati", "lat": 26.1445, "lng": 91.7362, "type": "Himalayan"},
        {"name": "Bengaluru", "lat": 12.9716, "lng": 77.5946, "type": "Urban"}
    ]
    
    disasters = ["Flood", "Earthquake", "Cyclone", "Drought", "Tsunami", "Landslide", "Heatwave", "Cold wave", "Wildfire", "Avalanche", "Storm", "Urban Flooding"]
    years = list(range(2015, 2026))
    months = list(range(1, 13))
    
    data = []
    
    np.random.seed(42)  # For reproducibility
    
    for _ in range(25000): # 25000 massive samples for learning
        city = np.random.choice(cities)
        year = np.random.choice(years)
        month = np.random.choice(months)
        
        # Base factors
        rainfall = np.random.uniform(0, 500)
        temperature = np.random.uniform(-5, 50)
        disaster_type = np.random.choice(disasters)
        frequency = np.random.randint(0, 10)
        
        # Logic for risk label
        risk_score = 0
        if city["type"] == "Coastal" and disaster_type in ["Cyclone", "Tsunami", "Flood"]:
            risk_score += 3
        if city["type"] == "Himalayan" and disaster_type in ["Earthquake", "Landslide", "Avalanche"]:
            risk_score += 3
        if city["type"] == "Urban" and disaster_type in ["Urban Flooding", "Heatwave"]:
            risk_score += 3
        if city["type"] == "Desert" and disaster_type in ["Drought", "Heatwave"]:
            risk_score += 3
            
        if rainfall > 300: risk_score += 2
        elif rainfall > 150: risk_score += 1
        
        if temperature > 40 or temperature < 2: risk_score += 2
        elif temperature > 35 or temperature < 10: risk_score += 1
            
        if risk_score >= 6: risk_label = "Very High"
        elif risk_score >= 5: risk_label = "High"
        elif risk_score >= 4: risk_label = "Medium"
        elif risk_score >= 2: risk_label = "Low"
        else: risk_label = "Very Low"
        
        data.append([
            year, month, city["name"], city["lat"], city["lng"], 
            rainfall, temperature, disaster_type, frequency, city["type"], risk_label
        ])
        
    df = pd.DataFrame(data, columns=["year", "month", "location", "latitude", "longitude", "rainfall", "temperature", "disaster_type", "frequency", "region_type", "risk_label"])
    df.to_csv(filename, index=False)
    print(f"Dataset generated at {filename} with {len(df)} rows.")
    return df

def train_and_save_model(csv_path="datasets/mock_disaster_data.csv"):
    if not os.path.exists(csv_path):
        print("Dataset not found. Generating...")
        df = create_dummy_dataset(csv_path)
    else:
        df = pd.read_csv(csv_path)
        
    print("Training ML Model...")
    
    # Preprocessing
    le_loc = LabelEncoder()
    le_disaster = LabelEncoder()
    le_region = LabelEncoder()
    
    df['location_enc'] = le_loc.fit_transform(df['location'])
    df['disaster_enc'] = le_disaster.fit_transform(df['disaster_type'])
    df['region_enc'] = le_region.fit_transform(df['region_type'])
    
    X = df[['year', 'month', 'location_enc', 'latitude', 'longitude', 'rainfall', 'temperature', 'disaster_enc', 'frequency', 'region_enc']]
    y = df['risk_label']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train, y_train)
    
    y_pred = clf.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred) * 100
    
    print(f"Model Training Complete! Accuracy: {accuracy:.2f}%")
    
    # Save Model and Encoders
    os.makedirs("models", exist_ok=True)
    with open('models/rf_model.pkl', 'wb') as f:
        pickle.dump(clf, f)
    with open('models/encoders.pkl', 'wb') as f:
        pickle.dump({'location': le_loc, 'disaster': le_disaster, 'region': le_region}, f)
        
    return accuracy

if __name__ == "__main__":
    train_and_save_model()
