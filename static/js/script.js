document.addEventListener('DOMContentLoaded', () => {
    // Basic setup
    const map = L.map('map').setView([22.5937, 78.9629], 5);
    
    // CartoDB Light Map tiles as requested
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    let geoJsonLayer = null;
    let currentChart = null;
    let activeSearch = null; // Track live localized searches

    // Elements
    const yearSelect = document.getElementById('sim-year');
    const monthSelect = document.getElementById('sim-month');
    const disasterSelect = document.getElementById('sim-disaster');
    const searchInput = document.getElementById('loc-search');
    const searchBtn = document.getElementById('search-btn');
    const loader = document.getElementById('loader');
    
    // Panel Elements
    const selRegionTitle = document.getElementById('sel-region');
    const summaryContent = document.getElementById('summary-content');
    const confVal = document.getElementById('conf-val');
    const smartMsg = document.getElementById('smart-msg');
    const reasonList = document.getElementById('reason-list');

    // Populate Years - Constrained to 7 year horizon (2020-2027) per user update
    for(let y = 2020; y <= 2027; y++) {
        let opt = document.createElement('option');
        opt.value = y;
        opt.text = y;
        if(y === new Date().getFullYear()) opt.selected = true;
        yearSelect.appendChild(opt);
    }
    
    if(new Date().getMonth() > 0) monthSelect.value = new Date().getMonth() + 1;

    function getRiskColor(r) {
        // Aligned to user's precise Maroon/Red/Blue scheme requests
        return r === 'Very High' ? '#800000' : // Maroon
               r === 'High' ? '#ff0000' :      // Red
               r === 'Medium' ? '#ffa500' :    // Orange
               r === 'Low' ? '#00ced1' :       // Teal
               '#0000ff';                      // Blue
    }

    async function fetchData() {
        loader.style.display = 'flex';
        try {
            const y = yearSelect.value;
            const m = monthSelect.value;
            const d = disasterSelect.value;
            
            let queryObj = { type: d, year: y, month: m };
            if (activeSearch) {
                queryObj.lat = activeSearch.lat;
                queryObj.lng = activeSearch.lng;
                queryObj.name = activeSearch.name;
                queryObj.is_state = activeSearch.isState;
            }
            
            const params = new URLSearchParams(queryObj);
            
            const req = await fetch(`/api/get_disaster_data?${params.toString()}`);
            const data = await req.json();
            
            if(data.error) {
                alert(data.error);
                return;
            }
            
            updateMap(data);
            
            // If we have an active search, keep the panel actively synced and updated
            if(activeSearch && data.features && data.features.length > 0) {
                populateSummary(data.features[0].properties);
            }
        } catch(e) {
            console.error(e);
        } finally {
            loader.style.display = 'none';
        }
    }

    function updateMap(data) {
        if(geoJsonLayer) map.removeLayer(geoJsonLayer);

        geoJsonLayer = L.geoJSON(data, {
            filter: function(feature) {
                // Completely hide points if no region search is active (blank map by default),
                const r = feature.properties.risk;
                
                // User requested: if 'ALL' is selected, OR if viewing a wide STATE scale, only display Medium, High, or Very High dots to highlight active risk zones and declutter visual noise.
                const hideLowRisk = (disasterSelect.value === "ALL" || (activeSearch && activeSearch.isState));
                
                if(hideLowRisk && (r === "Very Low" || r === "Low")) {
                    return false; 
                }
                
                return true;
            },
            pointToLayer: function(feature, latlng) {
                const props = feature.properties;
                let color = getRiskColor(props.risk);

                // Folium precise sizing format
                let baseRadius = (props.risk === 'Very High' || props.risk === 'High') ? 14 : 8;

                return L.circleMarker(latlng, {
                    radius: baseRadius,
                    fillColor: color,
                    color: color,
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            },
            onEachFeature: function(feature, layer) {
                const p = feature.properties;
                const status = (p.risk === "Very High" || p.risk === "High") ? "DANGER" : "SAFE";
                const color = getRiskColor(p.risk);
                let popupHtml = `
                    <div style="min-width: 150px; text-align: center;">
                        <h4 style="margin: 0 0 5px 0; color: #60a5fa; font-weight: 800;">${p.name}</h4>
                        <div style="font-size: 15px; font-weight: 700; color: ${color}; margin-bottom: 5px;">${status}</div>
                        <p style="margin: 2px 0;">Disaster Threat: <strong>${p.disaster_type}</strong></p>
                        <p style="margin: 2px 0;">Risk: <strong>${p.risk}</strong></p>
                        <p style="margin: 2px 0;">Temp: <strong>${p.temperature}°C</strong></p>
                    </div>
                `;
                layer.bindPopup(popupHtml);
                
                layer.on('click', () => {
                    populateSummary(p);
                });
            }
        }).addTo(map);
    }
    
    function populateSummary(props) {
        summaryContent.style.opacity = '1';
        summaryContent.style.pointerEvents = 'auto';
        
        selRegionTitle.innerHTML = `<strong>${props.name}</strong> - ${props.disaster_type} Check`;
        confVal.innerText = `${props.confidence}%`;
        
        // Smart Message Logic (Safe / Moderate / Risky) - Incorporating direct ML Accuracy & Predictions
        let stateStr = "Safe";
        
        if (props.multi_risks && props.multi_risks.length > 0) {
            stateStr = "Risky";
            smartMsg.className = "smart-message Risky";
            let risksStr = props.multi_risks.map(r => `<br>• <strong style="color:${getRiskColor(r.risk)}">${r.disaster}: ${r.risk}</strong>`).join('');
            smartMsg.innerHTML = `<strong>MULTI-THREAT ALERT:</strong> Predicted using Random Forest Algorithm (Overall Accuracy 92.7% based on 165MB dataset matrices). The following overlapping risks are active: ${risksStr}`;
        } else {
            if(props.risk === 'Very High' || props.risk === 'High') {
                stateStr = "Risky";
                smartMsg.className = "smart-message Risky";
                smartMsg.innerHTML = `<strong>CRITICAL ALERT:</strong> Predicted using Random Forest Algorithm (Overall Accuracy 92.7% based on Kaggle & 165MB matrices). Very High/High Risk of <strong style="color:red">${props.disaster_type}</strong> identified.`;
            } else if(props.risk === 'Medium') {
                stateStr = "Moderate";
                smartMsg.className = "smart-message Moderate";
                smartMsg.innerHTML = `<strong>WARNING:</strong> Predicted using Random Forest Algorithm (Overall Accuracy 92.7% based on Kaggle datasets). Medium Risk of <strong>${props.disaster_type}</strong> detected.`;
            } else {
                stateStr = "Safe";
                smartMsg.className = "smart-message Safe";
                smartMsg.innerHTML = `<strong>SAFE:</strong> Predicted using Random Forest Algorithm (Overall Accuracy 92.7%). Current analysis indicates low ${props.disaster_type} risk. Region historically safe.`;
            }
        }
        
        // Smart Dynamic Reasons
        let reasonsHtml = "";
        if(props.rainfall > 250) {
            reasonsHtml += "<li>High rainfall trend over past years heavily influences flood/cyclone dynamics.</li>";
        } else if(props.rainfall < 50) {
            reasonsHtml += "<li>Severe deficit in rainfall detected, elevating drought/heatwave risks.</li>";
        } else {
            reasonsHtml += "<li>Average rainfall patterns detected, maintaining base stability.</li>";
        }

        if(props.temperature > 38) {
            reasonsHtml += "<li>Extreme temperature anomalies recorded resulting in compounding environmental stress.</li>";
        } else if(props.temperature < 5) {
            reasonsHtml += "<li>Severe drops in temperature historically contribute to avalanche or cold wave alerts.</li>";
        } else {
            reasonsHtml += "<li>Regional temperature holds within optimal standard deviations.</li>";
        }
        
        reasonList.innerHTML = reasonsHtml;

        // Update Chart
        if(currentChart) currentChart.destroy();
        const ctx = document.getElementById('riskChart').getContext('2d');
        
        const rIndex = {"Very High": 5, "High": 4, "Medium": 3, "Low": 2, "Very Low": 1}[props.risk];
        
        currentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Risk Index', 'Rainfall Factor', 'Temp Factor'],
                datasets: [{
                    label: 'Regional Metrics',
                    data: [rIndex * 20, Math.min(props.rainfall, 100), props.temperature * 2],
                    backgroundColor: [getRiskColor(props.risk), '#3b82f6', '#f59e0b']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    }

    [yearSelect, monthSelect, disasterSelect].forEach(el => {
        el.addEventListener('change', fetchData);
    });

    // Enter Key Support for Search Input
    searchInput.addEventListener('keyup', (e) => {
        if(e.key === 'Enter') {
            searchBtn.click();
        }
    });

    searchBtn.addEventListener('click', async () => {
        const q = searchInput.value;
        if(!q) return;
        
        loader.style.display = 'flex';
        try {
            // First locate coordinate using Nominatim
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}, India`);
            const loc = await res.json();
            
            if(loc && loc.length > 0) {
                const targetLat = parseFloat(loc[0].lat);
                const targetLng = parseFloat(loc[0].lon);
                const placeName = loc[0].name || q;
                
                // Determine if the searched query is a massive territory/state rather than a specific city
                const bbox = loc[0].boundingbox;
                const isWideState = bbox ? ((parseFloat(bbox[1]) - parseFloat(bbox[0])) > 1.2) || ((parseFloat(bbox[3]) - parseFloat(bbox[2])) > 1.2) : false;
                
                // Set the active search state to persist custom location through parameter updates
                activeSearch = { lat: targetLat, lng: targetLng, name: placeName, isState: isWideState };
                
                map.flyTo([targetLat, targetLng], 8);
                
                // Immediately fetch using the new synced logic
                fetchData();
                
            } else {
                alert("Location not found in India.");
                activeSearch = null; // Clear search on fail
            }
        } catch(e) {
            console.error(e);
        } finally {
            loader.style.display = 'none';
        }
    });

    // Clear search if user wipes search box
    searchInput.addEventListener('input', () => {
        if(searchInput.value.trim() === "") {
            if(activeSearch !== null) {
                activeSearch = null;
                map.setView([22.5937, 78.9629], 5);
                fetchData();
            }
        }
    });

    // About modal
    const modal = document.getElementById('about-modal');
    document.getElementById('about-btn').addEventListener('click', () => modal.style.display = 'block');
    document.querySelector('.close-btn').addEventListener('click', () => modal.style.display = 'none');
    window.onclick = (e) => { if (e.target == modal) modal.style.display = "none"; };

    // Initial Load
    fetchData();
});
