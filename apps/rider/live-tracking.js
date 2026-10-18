(() => {
  'use strict';
  const panel=document.getElementById('trip-live-tracking');
  if(!panel)return;
  const $=id=>document.getElementById(id);
  const tokenKey='rohny_access_token';
  const active=new Set(['accepted','driver_arriving','in_progress']);
  const labels={accepted:'تم قبول الرحلة',driver_arriving:'الكابتن في الطريق إليك',in_progress:'الرحلة جارية'};
  let map=null,tripId='',pickupMarker=null,destMarker=null,driverMarker=null,routeLine=null,routeKey='',routeAt=0,lastOrigin=null,routeReq=0,busy=false;
  const apiBase=window.ROHNY_API_BASE||'';
  async function api(path){const token=sessionStorage.getItem(tokenKey)||'';if(!token)throw new Error('سجّل الدخول لمتابعة الرحلة.');const r=await fetch(apiBase+path,{headers:{Accept:'application/json',Authorization:'Bearer '+token}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||'تعذّر تحديث متابعة الرحلة.');return d;}
  function icon(kind,label){return L.divIcon({className:'rohny-leaflet-marker',html:'<span class="rohny-map-pin rohny-map-pin--'+kind+'"><span>'+label+'</span></span>',iconSize:[42,48],iconAnchor:[21,42],popupAnchor:[0,-38]});}
  function initMap(){if(map)return;if(!window.L)throw new Error('تعذّر تحميل الخريطة.');map=L.map('rider-live-map').setView([30.0131,31.2089],12);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,className:'rohny-map-tiles',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'}).addTo(map);}
  function distance(a,b){if(!a||!b)return Infinity;const rad=x=>x*Math.PI/180,d1=rad(b[0]-a[0]),d2=rad(b[1]-a[1]),h=Math.sin(d1/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(d2/2)**2;return 12742000*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
  async function route(from,to,key){const id=++routeReq;try{const c=from[1]+','+from[0]+';'+to[1]+','+to[0],r=await fetch('https://router.project-osrm.org/route/v1/driving/'+c+'?overview=full&geometries=geojson&steps=false');if(!r.ok)throw Error();const d=await r.json();if(id!==routeReq||key!==routeKey)return;if(d.code!=='Ok'||!d.routes?.length)throw Error();if(routeLine)map.removeLayer(routeLine);routeLine=L.polyline(d.routes[0].geometry.coordinates.map(p=>[p[1],p[0]]),{color:'#c8f58c',weight:6,opacity:.98,className:'rohny-route-line',lineCap:'round',lineJoin:'round'}).addTo(map);map.fitBounds(routeLine.getBounds(),{padding:[28,28],maxZoom:16});}catch(_){if(id!==routeReq||key!==routeKey)return;if(routeLine)map.removeLayer(routeLine);routeLine=L.polyline([from,to],{color:'#c8f58c',weight:4,opacity:.8,dashArray:'7 8'}).addTo(map);map.fitBounds([from,to],{padding:[28,28],maxZoom:15});$('trip-live-updated').textContent='تعذّر حساب طريق الشوارع الآن؛ يظهر خط تقريبي بين النقطتين.';}}
  async function refresh(){
    if(busy||document.visibilityState!=='visible')return;busy=true;
    try{
      const token=sessionStorage.getItem(tokenKey)||'';if(!token){panel.hidden=true;return;}
      const trips=await api('/trips/mine');if(!Array.isArray(trips))return;
      const trip=trips.find(t=>active.has(t.status));
      if(!trip){panel.hidden=true;return;}
      panel.hidden=false;
      $('trip-live-title').textContent=trip.status==='in_progress'?'مشوارك على الطريق':'الكابتن في طريقه إليك';
      $('trip-live-status-badge').textContent=labels[trip.status]||trip.status;
      $('trip-live-map-subtitle').textContent=trip.status==='in_progress'?'مسار الرحلة إلى وجهتك':'موقع الكابتن ومساره إلى نقطة ركوبك';
      $('trip-live-message').textContent=trip.status==='accepted'?'تم قبول رحلتك! سيظهر موقع الكابتن عند وصول أول تحديث GPS.':trip.status==='driver_arriving'?'الكابتن في الطريق إليك؛ تابع موقعه ومساره هنا.':'بدأت الرحلة؛ يعرض المسار إلى وجهتك وموقع الكابتن الحالي.';
      const d=await api('/trips/'+encodeURIComponent(trip.id)+'/location');if(d.status!==trip.status)return;
      initMap();const p=[Number(d.pickupLatitude),Number(d.pickupLongitude)],dest=[Number(d.destinationLatitude),Number(d.destinationLongitude)];if(![...p,...dest].every(Number.isFinite))throw Error('إحداثيات الرحلة غير مكتملة.');
      if(tripId!==d.tripId){if(routeLine)map.removeLayer(routeLine);[pickupMarker,destMarker,driverMarker].filter(Boolean).forEach(m=>map.removeLayer(m));routeLine=pickupMarker=destMarker=driverMarker=null;tripId=d.tripId;routeKey='';routeAt=0;lastOrigin=null;pickupMarker=L.marker(p,{icon:icon('pickup','A'),zIndexOffset:300}).addTo(map).bindPopup('نقطة ركوبك: '+(d.pickupAddress||'نقطة الانطلاق'));destMarker=L.marker(dest,{icon:icon('destination','B'),zIndexOffset:300}).addTo(map).bindPopup('وجهتك: '+(d.destinationAddress||'الوجهة'));}
      const loc=d.driverLocation,has=loc&&Number.isFinite(Number(loc.latitude))&&Number.isFinite(Number(loc.longitude));
      if(has){const cur=[Number(loc.latitude),Number(loc.longitude)];if(driverMarker)driverMarker.setLatLng(cur);else driverMarker=L.marker(cur,{icon:icon('captain','R'),zIndexOffset:700}).addTo(map).bindPopup('موقع الكابتن الحالي');
        const onRide=d.status==='in_progress',from=onRide?p:cur,to=onRide?dest:p,moved=distance(lastOrigin,cur),need=!routeKey||(!onRide&&moved>180)||Date.now()-routeAt>25000|| (onRide&&routeKey.indexOf(':destination:')<0);
        if(need){routeKey=d.tripId+(onRide?':destination:':':pickup:')+Date.now();lastOrigin=cur;routeAt=Date.now();void route(from,to,routeKey);}
        const when=loc.recordedAt?new Date(loc.recordedAt):null;$('trip-live-updated').textContent=when&&!Number.isNaN(when.getTime())?'آخر تحديث لموقع الكابتن: '+when.toLocaleTimeString('ar-EG'):'موقع الكابتن بيتحدّث تلقائيًا.';
      }else{$('trip-live-updated').textContent='في انتظار أول تحديث لموقع الكابتن. تأكد أن تطبيق الكابتن مفتوح وإذن الموقع مسموح.';if(!routeKey){map.fitBounds([p,dest],{padding:[28,28],maxZoom:15});routeKey=d.tripId+':waiting:'+Date.now();routeAt=Date.now();void route(p,dest,routeKey);}}
      window.setTimeout(()=>map&&map.invalidateSize(),100);
      const previous=window.__rohnyLastTrackedStatus||'';window.__rohnyLastTrackedStatus=trip.status;
      const priorTripId=window.__rohnyLastTrackedTripId||'';window.__rohnyLastTrackedTripId=trip.id;if(priorTripId!==trip.id||(!previous&&trip.status==='accepted')||(previous==='pending'&&trip.status==='accepted')){const tab=document.querySelector('[data-rider-tab="trips"]');if(tab)tab.click();}
    }catch(e){$('trip-live-updated').textContent=e.message||'تعذّر تحديث الموقع؛ ستتم إعادة المحاولة تلقائيًا.';}
    finally{busy=false;}
  }
  refresh();window.setInterval(refresh,5000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
})();