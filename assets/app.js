(() => {
"use strict";
const cfg = window.TERRAX_CONFIG || {};
const $ = id => document.getElementById(id);
const STORAGE_KEY = "terrax.selectedLocation.v1";
const state = { location:null, weather:null, quakeMap:null, quakeLayer:null, disasters:[], disasterFilter:"all", locationSearchResults:[], locationTransition:false };
const fmt = (v,d=0) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : "--";
const dateLabel = (s, opts={weekday:"short",month:"short",day:"numeric"}) => new Date(s).toLocaleDateString(undefined,opts);
const timeLabel = s => new Date(s).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
const set = (id, value) => { const el=$(id); if(el){el.classList.remove("tx-live-skeleton");el.removeAttribute("aria-busy");el.textContent=value;} };
const showError = (id,msg) => { const el=$(id); if(el){el.classList.remove("tx-live-skeleton","tx-live-list-skeleton");el.removeAttribute("aria-busy");el.innerHTML=`<div class="empty-state">${msg}</div>`;} };
function markLiveSkeleton(id){
 const el=$(id);if(el){el.classList.add("tx-live-skeleton");el.setAttribute("aria-busy","true");}
}
function clearLiveSkeleton(id){
 const el=$(id);if(el){el.classList.remove("tx-live-skeleton");el.removeAttribute("aria-busy");}
}
function clearLiveList(id){
 const el=$(id);if(el){el.classList.remove("tx-live-list-skeleton");el.removeAttribute("aria-busy");}
}
function airQualityDetails(data){
 const c=data?.current||{};
 const us=Number(c.us_aqi),eu=Number(c.european_aqi);
 if(Number.isFinite(us)){
  const level=us<=50?"Good":us<=100?"Moderate":us<=150?"Unhealthy for sensitive groups":us<=200?"Unhealthy":us<=300?"Very unhealthy":"Hazardous";
  return {value:Math.round(us),scale:"US AQI",level,pm25:Number.isFinite(Number(c.pm2_5))?Number(c.pm2_5):null,time:c.time||data.current_units?.time||""};
 }
 if(Number.isFinite(eu)){
  const level=eu<=20?"Good":eu<=40?"Fair":eu<=60?"Moderate":eu<=80?"Poor":eu<=100?"Very poor":"Extremely poor";
  return {value:Math.round(eu),scale:"European AQI",level,pm25:Number.isFinite(Number(c.pm2_5))?Number(c.pm2_5):null,time:c.time||""};
 }
 return null;
}
function renderAirQuality(data,prefix){
 const info=airQualityDetails(data);
 if(!info){
  set(`${prefix}-aqi`,"Unavailable");set(`${prefix}-aqi-level`,"Air-quality reading unavailable");set(`${prefix}-pm25`,"PM2.5 · —");
  return;
 }
 set(`${prefix}-aqi`,String(info.value));
 set(`${prefix}-aqi-level`,`${info.level} · ${info.scale} · ${info.time?timeLabel(info.time):"time unavailable"}`);
 set(`${prefix}-pm25`,info.pm25===null?"PM2.5 · —":`PM2.5 · ${info.pm25.toFixed(1)} µg/m³`);
 const el=$(`${prefix}-aqi-level`);if(el)el.dataset.aqiLevel=info.level.toLowerCase().replace(/[^a-z]+/g,"-");
}
async function fetchJSON(url, timeout=14000) {
  const controller = new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout);
  try { const res=await fetch(url,{signal:controller.signal,headers:{Accept:"application/json"}}); if(!res.ok) throw new Error(`HTTP ${res.status}`); return await res.json(); }
  finally { clearTimeout(timer); }
}
function clock(){ const el=$("local-clock"); if(el) el.textContent=new Date().toLocaleTimeString([], {hour12:false}); }
setInterval(clock,1000); clock();
function weatherCode(code){
 const map={0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Depositing rime fog",51:"Light drizzle",53:"Drizzle",55:"Dense drizzle",61:"Slight rain",63:"Moderate rain",65:"Heavy rain",71:"Slight snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Moderate showers",82:"Violent showers",95:"Thunderstorm",96:"Thunderstorm with hail",99:"Thunderstorm with heavy hail"};
 return map[code]||"Conditions unavailable";
}
function windDir(deg){ if(!Number.isFinite(Number(deg)))return "--"; return ["N","NE","E","SE","S","SW","W","NW"][Math.round(Number(deg)/45)%8]; }

async function geocode(name){
 const query=name.trim();
 const photonURL=`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=30&lang=en`;
 const openMeteoURL=`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=30&language=en&format=json`;
 const [photonResult,openMeteoResult]=await Promise.allSettled([
  fetchJSON(photonURL,12000),fetchJSON(openMeteoURL,12000)
 ]);
 const results=[];
 if(photonResult.status==="fulfilled"){
  for(const feature of photonResult.value.features||[]){
   const p=feature.properties||{},coords=feature.geometry?.coordinates||[];
   if(coords.length<2||!Number.isFinite(Number(coords[0]))||!Number.isFinite(Number(coords[1])))continue;
   const placeType=String(p.osm_value||p.type||"").toLowerCase();
   const placeKey=String(p.osm_key||"").toLowerCase();
   // Exclude shops, bakeries, buildings and other POIs; show geographic places only.
   if(placeKey!=="place" || !["city","town","village","municipality","hamlet","suburb"].includes(placeType))continue;
   const placeName=p.name||p.city||p.locality||p.town||p.village;
   if(!placeName || /^\d{4,}$/.test(String(placeName).trim()))continue;
   results.push({name:placeName,admin1:p.state||p.region||"",admin2:p.county||"",country:p.country||"",country_code:p.countrycode||"",latitude:Number(coords[1]),longitude:Number(coords[0]),timezone:"",postal_code:p.postcode||"",_rank:Number(p.rank?.importance)||0,_kind:placeType});
  }
 }
 if(openMeteoResult.status==="fulfilled"){
  for(const r of openMeteoResult.value.results||[]){
   if(!r.name || /^\d{4,}$/.test(String(r.name).trim()))continue;
   results.push({name:r.name,admin1:r.admin1||"",admin2:r.admin2||"",country:r.country||"",country_code:r.country_code||"",latitude:r.latitude,longitude:r.longitude,timezone:r.timezone||"",_rank:Number(r.population)||0,_kind:r.feature_code||""});
  }
 }
 const normalized=s=>String(s||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().trim();
 const q=normalized(query),unique=new Map();
 for(const item of results){
  const identity=[normalized(item.name),normalized(item.admin1),normalized(item.country),Number(item.latitude).toFixed(3),Number(item.longitude).toFixed(3)].join("|");
  if(!unique.has(identity))unique.set(identity,item);
 }
 return [...unique.values()].map(item=>{
  const names=[item.name,item.admin1,item.admin2,item.country].map(normalized);
  const exact=names.some(x=>x===q)?0:1;
  const starts=names.some(x=>x.startsWith(q))?0:1;
  return {...item,_sort:[exact,starts,-item._rank]};
 }).sort((a,b)=>a._sort[0]-b._sort[0]||a._sort[1]-b._sort[1]||b._sort[2]-a._sort[2])
 .map(({_rank,_kind,_sort,...item})=>item);
}
function locationLabel(loc){return [loc.name,loc.admin1,loc.country].filter(Boolean).join(", ");}
function saveLocation(loc){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(loc));}catch(e){}}
function readSavedLocation(){try{const v=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");return v&&Number.isFinite(v.latitude)&&Number.isFinite(v.longitude)?v:null;}catch(e){return null;}}
function setLocationText(loc){
 const name=locationLabel(loc);
 set("location-label",`Showing conditions for ${name} · Change location above`);
 set("weather-place",name.toUpperCase());
}
function ensureLocationSuggestions(){
 const box=$("location-suggestions");
 if(!box)return null;
 box.addEventListener("click",e=>{
   const item=e.target.closest("[data-location-index]");
   if(!item)return;
   const loc=state.locationSearchResults[Number(item.dataset.locationIndex)];
   if(loc)selectLocation(loc);
 });
 document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))box.hidden=true;});
 return box;
}
function countryFlag(code){
 const c=String(code||"").toUpperCase();
 if(!/^[A-Z]{2}$/.test(c))return "🌐";
 return String.fromCodePoint(...[...c].map(ch=>127397+ch.charCodeAt(0)));
}
function renderLocationSuggestions(results){
 const box=$("location-suggestions"); if(!box)return;
 state.locationSearchResults=results;
 if(!results.length){box.innerHTML='<div class="suggestion-empty">No matching cities or places found. Try another spelling.</div>';box.hidden=false;return;}
 box.innerHTML=results.map((r,i)=>`<button type="button" class="suggestion-item" role="option" aria-selected="false" data-location-index="${i}"><span class="suggestion-flag" aria-hidden="true">${countryFlag(r.country_code)}</span><span class="suggestion-copy"><b>${escapeHTML(r.name)}</b><small>${escapeHTML([r.admin1,r.admin2,r.country].filter(Boolean).join(", "))}</small></span><span class="suggestion-arrow" aria-hidden="true">↗</span></button>`).join("");
 box.hidden=false;
}
async function requestLocationSuggestions(){
 const input=$("location-search"); if(!input)return;
 const query=input.value.trim(); if(query.length<2){const box=$("location-suggestions");if(box)box.hidden=true;return;}
 const btn=$("search-location"); if(btn){btn.disabled=true;btn.textContent="Searching…";}
 try{renderLocationSuggestions(await geocode(query));}
 catch(e){renderLocationSuggestions([]);}
 finally{if(btn){btn.disabled=false;btn.textContent=document.body.dataset.page==="home"?"Explore location":"Search";}}
}
async function reverseGeocode(lat,lon){
 try{
  const u=`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=en`;
  const r=await fetchJSON(u,10000);
  return {name:r.city||r.locality||r.localityInfo?.administrative?.[0]?.name||"Current location",admin1:r.principalSubdivision||"",country:r.countryName||"",latitude:lat,longitude:lon,postal_code:r.postcode||"",country_code:r.countryCode||""};
 }catch(e){return {name:"Current location",admin1:"",country:"",latitude:lat,longitude:lon,postal_code:""};}
}
function revealLocationTransition(){
 document.documentElement.classList.remove("location-loading-lock");
 document.body.classList.remove("location-loading","location-loading-lock");
 const overlay=$("location-transition");if(overlay)overlay.remove();
}
async function selectLocation(loc){
 if(!loc||!Number.isFinite(Number(loc.latitude))||!Number.isFinite(Number(loc.longitude)))return;
 startWeatherSkeletons();
 state.location={...loc,latitude:Number(loc.latitude),longitude:Number(loc.longitude)};
 saveLocation(state.location);
 const box=$("location-suggestions");if(box)box.hidden=true;
 const input=$("location-search");if(input)input.value=locationLabel(state.location);
 const overlay=document.createElement("div");overlay.id="location-transition";overlay.className="location-transition";
 overlay.innerHTML='<div class="transition-orbit"><span>✦</span></div><b>Loading location</b><small>'+escapeHTML(locationLabel(state.location))+'</small><i class="transition-line"></i>';
 document.body.appendChild(overlay);
 document.documentElement.classList.add("location-loading-lock");
 document.body.classList.add("location-loading","location-loading-lock");
 const started=Date.now();
 try{await loadWeather();}
 catch(e){weatherLoadFailed("Could not retrieve weather for this location. Check your connection and try again.");}
 const wait=Math.max(0,2200-(Date.now()-started));
 setTimeout(revealLocationTransition,wait);
}
async function loadWeather(){
 if(!state.location)return;
 const loc=state.location,lat=loc.latitude,lon=loc.longitude;
 const params=new URLSearchParams({
  latitude:lat,longitude:lon,
  current:"temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
  hourly:"temperature_2m,precipitation,precipitation_probability,rain,showers,snowfall,relative_humidity_2m,wind_speed_10m,weather_code,uv_index,visibility",
  daily:"weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max",
  forecast_days:7,timezone:"auto",wind_speed_unit:"kmh"
 });
 const [w,air]=await Promise.all([
  fetchJSON(`https://api.open-meteo.com/v1/forecast?${params}`),
  fetchJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,european_aqi,pm2_5,pm10&timezone=auto`).catch(()=>null)
 ]);
 if(!w.current||!w.hourly||!w.daily)throw new Error("Incomplete weather response");
 state.weather=w;
 const c=w.current,d=w.daily,h=w.hourly;
 setLocationText(loc);
 const precip=Number(c.precipitation)||0, rainfall=Number(c.rain)||0;
 const nowIndex=Math.max(0,h.time.findIndex(t=>new Date(t)>=new Date(c.time)));
 const probability=Number(h.precipitation_probability?.[nowIndex]??d.precipitation_probability_max?.[0]);
 set("home-temp",`${fmt(c.temperature_2m)}°`);set("home-weather",weatherCode(c.weather_code));set("home-feels",`${fmt(c.apparent_temperature)}°C`);
 set("home-humidity",fmt(c.relative_humidity_2m));const hm=$("humidity-meter");if(hm)hm.style.width=`${c.relative_humidity_2m}%`;
 set("home-wind",fmt(c.wind_speed_10m));set("home-winddir",windDir(c.wind_direction_10m));set("home-uv",fmt(d.uv_index_max[0],1));const uv=$("uv-meter");if(uv)uv.style.width=`${Math.min(100,d.uv_index_max[0]*10)}%`;
 set("home-precip",fmt(precip,1));set("home-precip-prob",`Current interval · ${fmt(probability)}% chance`);set("home-rainfall",`${fmt(rainfall,1)} mm`);
 set("updated-at",`Open-Meteo model · ${timeLabel(c.time)} · ${w.timezone||"local time"}`);
 set("weather-temp",`${fmt(c.temperature_2m)}°`);set("weather-desc",weatherCode(c.weather_code));set("weather-feels",`Feels like ${fmt(c.apparent_temperature)}°C`);
 set("weather-high",`${fmt(d.temperature_2m_max[0])}°`);set("weather-low",`${fmt(d.temperature_2m_min[0])}°`);set("weather-rain",`${fmt(d.precipitation_probability_max[0])}%`);
 set("w-precip",`${fmt(precip,1)} mm`);set("w-precip-source",`Current interval · ${timeLabel(c.time)} · mm`);set("w-rainfall",`${fmt(d.precipitation_sum[0],1)} mm`);set("w-precip-prob",`${fmt(d.precipitation_probability_max[0])}%`);
 set("w-humidity",`${fmt(c.relative_humidity_2m)}%`);set("w-wind",fmt(c.wind_speed_10m));set("w-winddir",`${windDir(c.wind_direction_10m)} · ${fmt(c.wind_gusts_10m)} km/h gusts`);set("w-uv",fmt(d.uv_index_max[0],1));set("w-cloud",`${fmt(c.cloud_cover)}%`);set("w-pressure",fmt(c.pressure_msl));set("w-visibility",`${fmt((h.visibility?.[nowIndex]||0)/1000,1)}`);
 renderForecast("home-forecast",d,7);renderForecast("weather-week",d,7);renderHours(h);
 if($("home-aqi"))renderAirQuality(air,"home");
 if($("w-aqi"))renderAirQuality(air,"w");
}
function renderForecast(id,d,n){
 const el=$(id);if(!el)return;
 el.classList.remove("tx-live-list-skeleton");el.removeAttribute("aria-busy");
 el.innerHTML=d.time.slice(0,n).map((day,i)=>`<div class="forecast-row"><span class="forecast-day">${i===0?"Today":dateLabel(day,{weekday:"short"})}</span><span class="forecast-icon">${[0,1,2,3].includes(d.weather_code[i])?"☁":"🌧"}</span><span class="forecast-desc">${weatherCode(d.weather_code[i])}</span><span class="forecast-rain">☂ ${fmt(d.precipitation_probability_max[i])}% · ${fmt(d.precipitation_sum[i],1)} mm</span><span class="forecast-temps"><b>${fmt(d.temperature_2m_max[i])}°</b><i>${fmt(d.temperature_2m_min[i])}°</i></span></div>`).join("");
}
function renderHours(h){
 const el=$("weather-hours");if(!el)return;el.classList.remove("tx-live-list-skeleton");el.removeAttribute("aria-busy");const now=new Date();let start=h.time.findIndex(t=>new Date(t)>=now);if(start<0)start=0;
 el.innerHTML=Array.from({length:12},(_,j)=>{const i=start+j;return `<div class="hour-item"><span>${j===0?"Now":timeLabel(h.time[i]||h.time[0])}</span><b>${[0,1,2,3].includes(h.weather_code[i])?"☁":"🌦"}</b><strong>${fmt(h.temperature_2m[i])}°</strong><small>☂ ${fmt(h.precipitation_probability[i])}% · ${fmt(h.precipitation[i],1)} mm</small></div>`}).join("");
}
const searchBox=ensureLocationSuggestions();
$("search-location")?.addEventListener("click",requestLocationSuggestions);
$("location-search")?.addEventListener("input",()=>{clearTimeout(window.__terraxSuggestTimer);window.__terraxSuggestTimer=setTimeout(requestLocationSuggestions,300);});
$("location-search")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();requestLocationSuggestions();}});
async function initializeLocation(){
 const saved=readSavedLocation();
 if(saved){state.location=saved;setLocationText(saved);await loadWeather().catch(()=>weatherLoadFailed("Weather service unavailable. Check your connection and try again."));return;}
 if(!navigator.geolocation){set("location-label","Location unavailable · Search for a city to begin");clearWeatherSkeletons();return;}
 set("location-label","Requesting permission to use your current location…");
 navigator.geolocation.getCurrentPosition(async pos=>{
  const loc=await reverseGeocode(pos.coords.latitude,pos.coords.longitude);
  await selectLocation(loc);
 },()=>{
  set("location-label","Location permission denied · Search for a city to view local conditions");
  clearWeatherSkeletons();
  const input=$("location-search");if(input)input.placeholder="Search and select a city…";
 },{enableHighAccuracy:true,timeout:12000,maximumAge:300000});
}
const WEATHER_LIVE_IDS=["home-temp","home-weather","home-feels","home-humidity","home-wind","home-winddir","home-precip","home-precip-prob","home-rainfall","home-uv","home-aqi","home-aqi-level","home-pm25","updated-at","weather-temp","weather-desc","weather-feels","weather-high","weather-low","weather-rain","w-precip","w-precip-source","w-rainfall","w-precip-prob","w-humidity","w-wind","w-winddir","w-uv","w-cloud","w-pressure","w-visibility","w-aqi","w-aqi-level","w-pm25"];
function startWeatherSkeletons(){
 WEATHER_LIVE_IDS.forEach(markLiveSkeleton);
 ["home-forecast","weather-week","weather-hours"].forEach(id=>{
  const el=$(id);if(el){el.setAttribute("aria-busy","true");el.classList.add("tx-live-list-skeleton");}
 });
}
function clearWeatherSkeletons(){
 WEATHER_LIVE_IDS.forEach(clearLiveSkeleton);
 ["home-forecast","weather-week","weather-hours"].forEach(id=>{const el=$(id);if(el){el.classList.remove("tx-live-list-skeleton");el.removeAttribute("aria-busy");}});
}
function weatherLoadFailed(message){
 ["home-temp","home-weather","home-feels","home-humidity","home-wind","home-winddir","home-precip","home-precip-prob","home-rainfall","home-uv","home-aqi","home-aqi-level","home-pm25","weather-temp","weather-desc","weather-feels","weather-high","weather-low","weather-rain","w-precip","w-precip-source","w-rainfall","w-precip-prob","w-humidity","w-wind","w-winddir","w-uv","w-cloud","w-pressure","w-visibility","w-aqi","w-aqi-level","w-pm25"].forEach(id=>{if($(id))set(id,"Unavailable");});
 ["home-forecast","weather-week","weather-hours"].forEach(id=>{if($(id))showError(id,message);});
}
function startPageSkeletons(page){
 if(page==="home"||page==="weather")startWeatherSkeletons();
 if(page==="home"){
  ["iss-coords","iss-alt","iss-speed","iss-visibility","quake-count","quake-max","neo-count","kp-value","solar-kp","flare-prob","radio-flux"].forEach(markLiveSkeleton);
  ["neo-list","home-quakes","donki-list","kp-chart"].forEach(id=>{const el=$(id);if(el){el.classList.add("tx-live-list-skeleton");el.setAttribute("aria-busy","true");}});
 }
}
async function loadISS(){
 try{
  const x=await fetchJSON("https://api.wheretheiss.at/v1/satellites/25544");
  set("iss-coords",`${fmt(x.latitude,2)}°, ${fmt(x.longitude,2)}°`);set("iss-alt",`Altitude ${fmt(x.altitude)} km`);
  set("iss-speed",`${fmt(x.velocity)} km/h`);set("iss-visibility",x.visibility);
  set("space-iss-lat",`${fmt(x.latitude,3)}°`);set("space-iss-lon",`Longitude ${fmt(x.longitude,3)}°`);
  set("space-iss-alt",`${fmt(x.altitude)} km`);set("space-iss-speed",`${fmt(x.velocity)} km/h`);set("space-iss-vis",x.visibility);
  set("space-iss-time",new Date(x.timestamp*1000).toLocaleTimeString());
 }catch(e){set("iss-coords","ISS telemetry unavailable");set("space-iss-lat","Unavailable");}
}
async function loadQuakes(){
 const range=$("quake-range")?.value||"week"; const days=range==="day"?1:range==="month"?30:7;
 const url=`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${range==="day"?"day":range==="month"?"month":"week"}.geojson`;
 try{
  const data=await fetchJSON(url); const feats=data.features||[]; const max=feats.reduce((m,f)=>Math.max(m,f.properties.mag||0),0);
  set("quake-count",feats.length);set("quake-max",fmt(max,1));
  const list=$("home-quakes");if(list){clearLiveList("home-quakes");list.innerHTML=feats.slice(0,5).map(f=>`<div class="event-row"><span class="magnitude">${fmt(f.properties.mag,1)}</span><div><b>${escapeHTML(f.properties.place||"Unknown location")}</b><small>${timeLabel(f.properties.time)} · ${dateLabel(f.properties.time)}</small></div><a href="${f.properties.url}" target="_blank" rel="noreferrer">↗</a></div>`).join("")||'<div class="empty-state">No events returned for this period.</div>';}
  const table=$("quake-table");if(table)table.innerHTML=feats.slice(0,35).map(f=>`<div class="quake-table-row"><b class="magnitude">${fmt(f.properties.mag,1)}</b><span>${escapeHTML(f.properties.place||"Unknown location")}</span><small>${dateLabel(f.properties.time)} · ${timeLabel(f.properties.time)}</small><a href="${f.properties.url}" target="_blank" rel="noreferrer">Details ↗</a></div>`).join("")||'<div class="empty-state">No events found.</div>';
  if($("quake-map")&&window.L) renderQuakeMap(feats);
 }catch(e){showError("home-quakes","USGS feed could not be loaded. Please retry.");showError("quake-table","USGS feed could not be loaded. Please retry.");}
}
function renderQuakeMap(feats){
 if(!state.quakeMap){state.quakeMap=L.map("quake-map").setView([20,0],2);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap contributors",maxZoom:18}).addTo(state.quakeMap);state.quakeLayer=L.layerGroup().addTo(state.quakeMap);}
 state.quakeLayer.clearLayers();
 feats.forEach(f=>{const [lon,lat,depth]=f.geometry.coordinates,mag=f.properties.mag||0;L.circleMarker([lat,lon],{radius:Math.max(3,mag*2.2),color:mag>=5?"#ff6d72":"#64c8f2",fillOpacity:.55,weight:1}).bindPopup(`<b>M ${fmt(mag,1)}</b><br>${escapeHTML(f.properties.place||"Unknown")}<br>Depth ${fmt(depth)} km`).addTo(state.quakeLayer);});
 setTimeout(()=>state.quakeMap.invalidateSize(),250);
}
$("quake-range")?.addEventListener("change",loadQuakes);
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function renderDisasterSkeleton(){
 const el=$("disaster-list");if(!el)return;
 el.setAttribute("aria-busy","true");
 el.innerHTML=Array.from({length:6},()=>'<div class="tx-disaster-skeleton"><i></i><span><b></b><small></small></span><em></em></div>').join("");
}
async function loadDisasters(){
 const started=Date.now();
 set("disaster-status","Loading");markLiveSkeleton("disaster-count");markLiveSkeleton("disaster-high");
 renderDisasterSkeleton();
 const to=new Date(),from=new Date(Date.now()-7*86400000);const ds=d=>d.toISOString().slice(0,10);
 const url=`https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?fromdate=${ds(from)}&todate=${ds(to)}&alertlevel=red;orange;green`;
 try{
  const data=await fetchJSON(url);const features=data.features||data||[];state.disasters=Array.isArray(features)?features:[];
  const wait=Math.max(0,2200-(Date.now()-started));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
  set("disaster-count",state.disasters.length);set("disaster-high",state.disasters.filter(f=>["Red","Orange","red","orange"].includes(f.properties?.alertlevel)).length);set("disaster-status","Connected");renderDisasters();
 }catch(e){
  const wait=Math.max(0,2200-(Date.now()-started));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
  set("disaster-status","Unavailable");showError("disaster-list","GDACS feed could not be reached from this browser. Try the official GDACS site.");
 }
 const el=$("disaster-list");if(el){el.classList.remove("tx-live-list-skeleton");el.removeAttribute("aria-busy");}
}

function severityClass(value){
 const v=String(value||"").toLowerCase();
 if(v.includes("red")||v.includes("high")||v.includes("critical"))return "red";
 if(v.includes("orange")||v.includes("moderate")||v.includes("medium"))return "orange";
 return "green";
}
function eventDate(p){return p.fromdate||p.fromDate||p.eventdate||p.date||p.datemodified||"Not provided by source";}
function eventLocation(p){
 const coords=p.coordinates||p.geometry?.coordinates;
 let coordText="";
 if(Array.isArray(coords)&&coords.length>=2)coordText=`${Number(coords[1]).toFixed(3)}, ${Number(coords[0]).toFixed(3)}`;
 return [p.name||p.location||p.eventname, p.country, coordText].filter(Boolean).join(" · ")||"Location not specified by source";
}
let disasterModalScrollY=0;
function lockDisasterPage(){
 if(document.body.classList.contains("detail-modal-open"))return;
 disasterModalScrollY=window.scrollY||window.pageYOffset||0;
 document.documentElement.classList.add("detail-modal-open");
 document.body.classList.add("detail-modal-open");
 document.body.style.top=`-${disasterModalScrollY}px`;
}
function unlockDisasterPage(){
 if(!document.body.classList.contains("detail-modal-open"))return;
 document.documentElement.classList.remove("detail-modal-open");
 document.body.classList.remove("detail-modal-open");
 document.body.style.top="";
 window.scrollTo(0,disasterModalScrollY);
}
function closeDisasterModal(){
 const modal=$("disaster-detail-modal");if(modal)modal.hidden=true;
 unlockDisasterPage();
}
function ensureDisasterModal(){
 if($("disaster-detail-modal"))return;
 const m=document.createElement("div");m.id="disaster-detail-modal";m.className="detail-modal";m.hidden=true;
 m.innerHTML='<div class="detail-backdrop" data-close-disaster></div><section class="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title" tabindex="-1"><button class="detail-close" type="button" aria-label="Close" data-close-disaster>×</button><div id="detail-content"></div></section>';
 document.body.appendChild(m);
 m.addEventListener("click",e=>{if(e.target.closest("[data-close-disaster]"))closeDisasterModal();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!m.hidden)closeDisasterModal();});
 // Prevent wheel/touch gestures on the backdrop from scrolling the page behind it.
 const stopBackgroundScroll=e=>{
  if(m.hidden)return;
  const dialog=e.target.closest&&e.target.closest(".detail-dialog");
  if(!dialog)e.preventDefault();
 };
 m.addEventListener("wheel",stopBackgroundScroll,{passive:false});
 m.addEventListener("touchmove",stopBackgroundScroll,{passive:false});
}
function disasterSourceUrl(p){
 const raw=p.url||p.urlreport||p.sourceurl||p.link||"";
 if(raw){
  try{const u=new URL(raw);if(u.protocol==="https:"&&u.hostname!==location.hostname)return u.href;}catch(_){}
 }
 const eventId=p.eventid||p.eventId||p.id;
 const eventType=p.eventtypecode||p.eventtype||p.eventType||"";
 if(eventId)return `https://www.gdacs.org/report.aspx?eventid=${encodeURIComponent(eventId)}&eventtype=${encodeURIComponent(eventType)}`;
 return "https://www.gdacs.org/";
}
function showDisasterDetails(index){
 const f=state.disasters[index];if(!f)return;const p=f.properties||{};
 ensureDisasterModal();
 const level=p.alertlevel||p.alertLevel||"Unspecified";
 const overall=p.severitytext||p.severityText||p.overallseverity||p.severity||"Not provided by source";
 const type=p.eventtype||p.eventType||"Natural hazard";
 const title=p.name||p.eventname||p.eventName||p.country||"Reported event";
 const source=p.source||"GDACS";
 const updated=p.datemodified||p.dateModified||p.updated||"Not provided by source";
 const details=[
  ["Event type",type],["Country",p.country||"Not specified"],["Exact location",eventLocation(p)],
  ["Event date",eventDate(p)],["Latest severity",level],["Overall severity",overall],
  ["Severity value",p.severityvalue??p.severityValue??"Not provided"],["Source",source],
  ["Last updated",updated],["Event ID",p.eventid||p.eventId||"Not provided"],
  ["Description",p.description||p.htmldescription||p.htmlDescription||"No additional description supplied by the source."]
 ];
 const content=$("detail-content");
 content.innerHTML=`<div class="detail-kicker">TERRAX · VERIFIED SOURCE RECORD</div><div class="detail-title-row"><div><h2 id="detail-title">${escapeHTML(title)}</h2><p>${escapeHTML([p.country,type].filter(Boolean).join(" · "))}</p></div><span class="alert-label ${severityClass(level)}">${escapeHTML(String(level).toUpperCase())} ALERT</span></div><div class="detail-grid">${details.map(([k,v])=>`<div class="detail-field"><small>${escapeHTML(k)}</small><b>${escapeHTML(String(v))}</b></div>`).join("")}</div><div class="detail-foot">● Source record · Data shown as supplied by ${escapeHTML(source)}. Missing fields are not estimated.</div><a class="outline-btn detail-source-link" href="${escapeHTML(disasterSourceUrl(p))}" target="_blank" rel="noopener noreferrer">Open source record ↗</a>`;
 const modal=$("disaster-detail-modal");
 modal.hidden=false;
 lockDisasterPage();
 requestAnimationFrame(()=>modal.querySelector(".detail-dialog")?.focus({preventScroll:true}));
}
function renderDisasters(){
 const el=$("disaster-list");if(!el)return;
 el.classList.remove("tx-live-list-skeleton");el.removeAttribute("aria-busy");
 const items=state.disasters.map((f,originalIndex)=>({f,originalIndex})).filter(({f})=>state.disasterFilter==="all"||String(f.properties?.eventtype||"").toUpperCase()===state.disasterFilter);
 el.innerHTML=items.slice(0,80).map(({f,originalIndex})=>{
  const p=f.properties||{},level=p.alertlevel||p.alertLevel||"Reported";
  const title=p.name||p.eventname||p.eventName||p.country||"Reported event";
  const country=p.country||"Global";const date=eventDate(p);const type=p.eventtype||"Natural hazard";
  const sev=severityClass(level);
  return `<button type="button" class="event-row disaster-row disaster-card" data-disaster-index="${originalIndex}"><span class="alert-dot ${sev}"></span><span class="disaster-copy"><b>${escapeHTML(title)}</b><small>${escapeHTML(country)} · ${escapeHTML(date)} · ${escapeHTML(type)}</small></span><span class="alert-label ${sev}">${escapeHTML(String(level).toUpperCase())}</span><span class="disaster-open">Details ↗</span></button>`;
 }).join("")||'<div class="empty-state">No matching events in the current feed window.</div>';
 el.querySelectorAll("[data-disaster-index]").forEach(b=>b.addEventListener("click",()=>showDisasterDetails(Number(b.dataset.disasterIndex))));
}
document.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll("[data-filter]").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.disasterFilter=b.dataset.filter;renderDisasters();}));
$("refresh-disasters")?.addEventListener("click",loadDisasters);
async function loadNEO(){
 const key=encodeURIComponent(cfg.NASA_API_KEY||"DEMO_KEY");const start=new Date().toISOString().slice(0,10);
 try{const d=await fetchJSON(`https://api.nasa.gov/neo/rest/v1/feed?start_date=${start}&api_key=${key}`);const all=Object.values(d.near_earth_objects||{}).flat();set("neo-count",all.length);
  const el=$("neo-list");if(el){clearLiveList("neo-list");el.innerHTML=all.sort((a,b)=>new Date(a.close_approach_data?.[0]?.close_approach_date_full||0)-new Date(b.close_approach_data?.[0]?.close_approach_date_full||0)).slice(0,12).map(n=>{const ca=n.close_approach_data?.[0]||{};const km=ca.miss_distance?.kilometers;return `<div class="event-row"><span class="neo-symbol">✦</span><div><b>${escapeHTML(n.name)}</b><small>Close approach ${escapeHTML(ca.close_approach_date||"Date unavailable")} · ${fmt(km,0)} km</small></div><span class="neo-size">${n.is_potentially_hazardous_asteroid?"Potentially hazardous":"Not flagged hazardous"}</span></div>`}).join("")||'<div class="empty-state">No objects returned for this window.</div>';}
 }catch(e){set("neo-count","—");showError("neo-list","NASA NEO feed unavailable. Check your NASA key or rate limit.");}
}
async function loadSolar(){
 try{
  const [kp,prob,flux,solarWind]=await Promise.all([
   fetchJSON("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"),
   fetchJSON("https://services.swpc.noaa.gov/json/solar_probabilities.json").catch(()=>null),
   fetchJSON("https://services.swpc.noaa.gov/json/f107_cm_flux.json").catch(()=>null),
   fetchJSON("https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json").catch(()=>null)
  ]);

  // NOAA currently returns K-index rows as objects (time_tag, Kp).
  // Keep support for the older header + array format as well.
  let validRows=[];
  if(Array.isArray(kp)){
   if(kp.length && Array.isArray(kp[0])){
    const headers=kp[0].map(v=>String(v).toLowerCase());
    const timeIndex=headers.indexOf("time_tag")>=0?headers.indexOf("time_tag"):0;
    const kpIndex=headers.indexOf("kp")>=0?headers.indexOf("kp"):1;
    validRows=kp.slice(1).map(r=>({time:String(r?.[timeIndex]||""),value:Number(r?.[kpIndex])}));
   }else{
    validRows=kp.map(r=>({time:String(r?.time_tag||r?.time||r?.timestamp||""),value:Number(r?.Kp??r?.kp??r?.value)}));
   }
  }
  validRows=validRows
   .filter(r=>r.time && Number.isFinite(Date.parse(r.time)) && Number.isFinite(r.value) && r.value>=0 && r.value<=9)
   .sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));

  const latest=validRows[validRows.length-1];
  const val=latest?.value;
  const valid=Number.isFinite(val);
  set("kp-value",valid?val.toFixed(1):"Unavailable");
  set("solar-kp",valid?val.toFixed(1):"Unavailable");
  set("kp-level",valid?(val>=5?"Geomagnetic storm threshold reached":val>=4?"Elevated geomagnetic activity":"Quiet to unsettled conditions"):"NOAA has not supplied a valid Kp reading");
  set("kp-updated",valid?`NOAA observation: ${new Date(latest.time).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"})} UTC`:"Latest valid observation unavailable");
  set("solar-feed",valid?"NOAA SWPC connected · reading verified":"NOAA SWPC connected · no valid reading");

  // NOAA solar_probabilities.json is an array of dated forecast objects.
  // Its fields are c_class_1_day, m_class_1_day and x_class_1_day.
  const forecasts=Array.isArray(prob)?prob.filter(p=>p&&p.date):[];
  forecasts.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
  const forecast=forecasts[0];
  const probabilityValue=v=>Number.isFinite(Number(v))?Math.max(0,Math.min(100,Number(v))):null;
  const cProb=probabilityValue(forecast?.c_class_1_day);
  const mProb=probabilityValue(forecast?.m_class_1_day);
  const xProb=probabilityValue(forecast?.x_class_1_day);
  set("flare-prob",mProb!==null?`M ${Math.round(mProb)}%`:"Unavailable");
  const flareDetail=$("flare-prob-detail");
  if(flareDetail){
   flareDetail.textContent=forecast
    ?`1-day forecast · C ${cProb!==null?Math.round(cProb)+"%":"—"} · X ${xProb!==null?Math.round(xProb)+"%":"—"} · ${forecast.date.slice(0,10)}`
    :"NOAA solar flare probability forecast unavailable";
  }

  const fluxRows=Array.isArray(flux)?flux:[];
  const f=fluxRows.length?fluxRows[fluxRows.length-1]:null;
  set("radio-flux",f?fmt(f.flux??f.f107??f[1],1):"--");

  // NOAA's current RTSW endpoint replaced the legacy plasma products.
  // New field names are proton_speed / proton_density; retain legacy compatibility.
  // This feed is isolated so a temporary outage cannot affect the other solar cards.
  const rawPlasma=Array.isArray(solarWind)?solarWind:[];
  let plasmaRows=[];
  if(rawPlasma.length && Array.isArray(rawPlasma[0])){
   const headers=rawPlasma[0].map(v=>String(v).toLowerCase());
   const idx=(...names)=>{for(const n of names){const i=headers.indexOf(n);if(i>=0)return i;}return -1;};
   const ti=idx("time_tag"),si=idx("proton_speed","speed"),di=idx("proton_density","density"),ai=idx("active"),sci=idx("source");
   plasmaRows=rawPlasma.slice(1).map(r=>({time_tag:r[ti],proton_speed:si>=0?r[si]:null,proton_density:di>=0?r[di]:null,active:ai>=0?r[ai]:null,source:sci>=0?r[sci]:null}));
  }else{
   plasmaRows=rawPlasma;
  }
  const validPlasma=plasmaRows.map(r=>({
   time:String(r?.time_tag||r?.time||""),
   speed:Number(r?.proton_speed??r?.speed),
   density:Number(r?.proton_density??r?.density),
   active:r?.active===true||String(r?.active).toLowerCase()==="true",
   source:String(r?.source||"")
  })).filter(r=>r.time&&Number.isFinite(Date.parse(r.time))&&Number.isFinite(r.speed)&&r.speed>0)
   .sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  // Prefer the latest active spacecraft sample when NOAA marks one active.
  const activeRows=validPlasma.filter(r=>r.active);
  const plasmaLatest=(activeRows.length?activeRows:validPlasma).pop();
  const windDetail=$("solar-wind-detail");
  if(plasmaLatest){
   set("solar-wind-speed",Math.round(plasmaLatest.speed).toLocaleString());
   const densityText=Number.isFinite(plasmaLatest.density)&&plasmaLatest.density>=0?`Density ${fmt(plasmaLatest.density,1)} cm⁻³`:"Density unavailable";
   const observed=new Date(plasmaLatest.time).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC"});
   if(windDetail)windDetail.textContent=`${densityText} · NOAA ${observed} UTC${plasmaLatest.source?` · ${plasmaLatest.source}`:""}`;
  }else{
   set("solar-wind-speed","Unavailable");
   if(windDetail)windDetail.textContent="NOAA solar-wind data temporarily unavailable";
  }

  const chart=$("kp-chart");
  if(chart){
   clearLiveList("kp-chart");
   const sample=validRows.slice(-24);
   chart.innerHTML=sample.length?sample.map(r=>`<div class="bar-col" title="${escapeHTML(r.time)}: Kp ${r.value.toFixed(1)}"><i style="height:${Math.max(4,r.value/9*100)}%"></i><small>${new Date(r.time).getUTCHours().toString().padStart(2,"0")}</small></div>`).join(""):'<div class="empty-state">No valid K-index samples returned by NOAA.</div>';
  }
 }catch(e){
  set("solar-feed","Unavailable");
  set("kp-value","Unavailable");set("solar-kp","Unavailable");
  set("kp-level","NOAA K-index feed could not be retrieved");
  set("kp-updated","Source unavailable");
  showError("kp-chart","NOAA SWPC K-index data is temporarily unavailable. No value has been estimated.");
  set("flare-prob","Unavailable");
  const flareDetail=$("flare-prob-detail");
  if(flareDetail)flareDetail.textContent="NOAA solar flare probability forecast unavailable";
 }
}

async function loadDONKI(){
 const el=$("donki-list");
 const key=String(cfg.NASA_API_KEY||"").trim();
 if(!key||key==="DEMO_KEY"||key==="YOUR_NEW_NASA_API_KEY"){
  showError("donki-list","NASA DONKI needs a valid personal API key. Add a newly generated key in assets/config.js.");
  return;
 }
 const end=new Date(),start=new Date(Date.now()-14*86400000);
 const params=new URLSearchParams({
  startDate:start.toISOString().slice(0,10),
  endDate:end.toISOString().slice(0,10),
  type:"all",
  api_key:key
 });
 try{
  const data=await fetchJSON(`https://api.nasa.gov/DONKI/notifications?${params.toString()}`);
  if(!Array.isArray(data))throw new Error("Unexpected response format (expected a notification list)");
  if(el){
   clearLiveList("donki-list");
   el.innerHTML=data.slice(0,15).map(x=>`<div class="event-row"><span class="neo-symbol">✦</span><div><b>${escapeHTML(x.messageType||"Space weather event")}</b><small>${escapeHTML(x.messageIssueTime||"")} · ${escapeHTML(x.messageBody||"").slice(0,130)}</small></div><a href="${escapeHTML(x.messageURL||"https://kauai.ccmc.gsfc.nasa.gov/DONKI/")}" target="_blank" rel="noopener noreferrer">↗</a></div>`).join("")||'<div class="empty-state">No DONKI notifications in the last 14 days.</div>';
  }
 }catch(error){
  const detail=String(error?.message||error||"Unknown error");
  console.error("[TerraX] NASA DONKI request failed:",detail);
  let guidance="Check the NASA API key and network connection.";
  if(detail.includes("HTTP 401")||detail.includes("HTTP 403"))guidance="NASA rejected the API key. Generate a fresh key and update assets/config.js.";
  else if(detail.includes("HTTP 429"))guidance="NASA rate limit reached. Wait before retrying.";
  else if(detail.includes("Failed to fetch")||detail.includes("NetworkError"))guidance="Network/CORS connection failed while contacting api.nasa.gov.";
  showError("donki-list",`NASA DONKI unavailable (${escapeHTML(detail)}). ${guidance}`);
 }
}
function showWelcomeOnce(){
  try{
    if(sessionStorage.getItem("terrax.welcomeShown")==="1")return;
    sessionStorage.setItem("terrax.welcomeShown","1");
  }catch(e){}

  const overlay=document.createElement("div");
  overlay.className="welcome-screen";

  // Set final position before adding the overlay to the document.
  overlay.style.cssText=`
    position:fixed!important;
    inset:0!important;
    width:100%!important;
    height:100%!important;
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
    padding:24px!important;
    box-sizing:border-box!important;
    transform:none!important;
    overflow:hidden!important;
    visibility:visible!important;
  `;

  overlay.setAttribute("role","status");
  overlay.setAttribute("aria-label","Welcome to TerraX");

  overlay.innerHTML='<div class="welcome-brand"><span class="welcome-mark">✦</span><strong>TERRA<span>X</span></strong><small>EARTH & SPACE INTELLIGENCE</small><div class="welcome-message">Welcome to TerraX</div><div class="welcome-progress"><i></i></div><span class="welcome-caption">ONE PLATFORM. INFINITE KNOWLEDGE.</span></div>';

  const brand=overlay.querySelector(".welcome-brand");

  if(brand){
    brand.style.cssText=`
      position:relative!important;
      width:100%!important;
      max-width:340px!important;
      flex:0 1 auto!important;
      margin:auto!important;
      transform:none!important;
      text-align:center!important;
    `;
  }

  document.documentElement.classList.add("welcome-lock");
  document.body.classList.add("welcome-lock");

  document.body.appendChild(overlay);

  const finish=()=>{
    overlay.classList.add("welcome-exit");

    setTimeout(()=>{
      overlay.remove();
      document.documentElement.classList.remove("welcome-lock","terrax-booting");
      document.body.classList.remove("welcome-lock");
    },650);
  };

  setTimeout(finish,3500);
}



showWelcomeOnce();
// Keep native multi-page navigation (real URL/history entries) and restore the
// exact scroll position when users return with the browser Back/Forward controls.
(function preservePageHistory(){
 try{
  let entry=history.state&&history.state.terraxEntry;
  if(!entry){
   const next=Number(sessionStorage.getItem("terrax.historyCounter")||0)+1;
   sessionStorage.setItem("terrax.historyCounter",String(next));
   entry=`tx-${next}-${location.pathname}`;
   history.replaceState({...history.state,terraxEntry:entry}, "", location.href);
  }
  const key=`terrax.scroll.${entry}`;
  addEventListener("pagehide",()=>{try{sessionStorage.setItem(key,String(window.scrollY||0));}catch(e){}});
  addEventListener("pageshow",event=>{
   try{
    const saved=sessionStorage.getItem(key);
    const navEntry=performance.getEntriesByType("navigation")[0];
    const isBackForward=event.persisted || navEntry?.type==="back_forward";
    if(saved!==null && isBackForward)requestAnimationFrame(()=>window.scrollTo(0,Number(saved)||0));
   }catch(e){}
  });
  if("scrollRestoration" in history)history.scrollRestoration="auto";
 }catch(e){}
})();
// Overview is the navigation root. The first section opened from Overview gets
// one history entry; switching between sections replaces that entry. Therefore
// one browser Back always returns to Overview instead of replaying every tab.
document.addEventListener("click",e=>{
 const link=e.target.closest&&e.target.closest("a.nav-link[href]");
 if(!link)return;
 const target=new URL(link.href,location.href);
 if(target.origin!==location.origin)return;
 const currentPage=document.body.dataset.page;
 const targetFile=target.pathname.split("/").pop();
 const isOverview=targetFile==="index.html"||targetFile===""||targetFile==="/";
 if(currentPage==="home"){
  if(!isOverview){try{sessionStorage.setItem("terrax.overviewBase","1");}catch(_){}}
  return; // keep the first Overview -> section transition as a real history entry
 }
 e.preventDefault();
 if(isOverview){
  let hasOverviewBase=false;
  try{hasOverviewBase=sessionStorage.getItem("terrax.overviewBase")==="1";sessionStorage.removeItem("terrax.overviewBase");}catch(_){}
  if(hasOverviewBase && history.length>1)history.back();
  else location.replace(target.href);
  return;
 }
 // A section-to-section tab change replaces the current section entry.
 location.replace(target.href);
},true);
// External sources always open separately; internal TerraX navigation stays in the current tab.
document.addEventListener("click",e=>{
 const a=e.target.closest&&e.target.closest("a[href]");
 if(!a)return;
 let u;try{u=new URL(a.href,location.href);}catch(_){return;}
 if((u.protocol==="http:"||u.protocol==="https:")&&u.origin!==location.origin){
  a.target="_blank";
  a.rel="noopener noreferrer";
 }
},true);
const page=document.body.dataset.page;
startPageSkeletons(page);
if(page==="home"||page==="weather"){initializeLocation();}
if(page==="home"||page==="space")loadISS(); if(page==="home")setInterval(loadISS,cfg.ISS_REFRESH_MS||10000);
if(page==="home"||page==="earth")loadQuakes();
if(page==="home"||page==="solar")loadSolar();
if(page==="home"||page==="space")loadNEO();
if(page==="home"||page==="solar")loadDONKI();
if(page==="disasters")loadDisasters();
if(page==="space")setInterval(loadISS,cfg.ISS_REFRESH_MS||10000);
if(page==="weather")setInterval(()=>loadWeather().catch(()=>{}),cfg.WEATHER_REFRESH_MS||900000);
document.querySelectorAll(".nav-link").forEach(a=>{if(a.getAttribute("href")===location.pathname.split("/").pop())a.classList.add("active");});
})();
