(() => {
  const BASE_COMPANIES = Array.isArray(window.MAP_COMPANIES) ? window.MAP_COMPANIES : [];
  const LOCAL_EDITS_KEY = 'northChinaTradeMapEditsV2';
  const LOCAL_IMPORTS_KEY = 'northChinaTradeMapImportsV2';
  const LOCAL_UPDATED_KEY = 'northChinaTradeMapUpdatedV2';
  function readStore(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } }
  let pendingEdits = readStore(LOCAL_EDITS_KEY, {});
  let localImports = readStore(LOCAL_IMPORTS_KEY, []);
  if (!pendingEdits || typeof pendingEdits !== 'object' || Array.isArray(pendingEdits)) pendingEdits = {};
  if (!Array.isArray(localImports)) localImports = [];
  const COMPANIES = [...BASE_COMPANIES, ...localImports];
  const CITY_META = window.NORTH_CHINA_CITY_META || (window.NORTH_CHINA_CITY_META = {});
  const GEOJSON = window.NORTH_CHINA_GEOJSON;
  const CATEGORY_COLORS = { '工厂/制造': '#2563eb', '外贸公司': '#059669', '货代/物流': '#d97706', '外贸服务/平台': '#7c3aed' };
  const PAGE_SIZE = 40;
  const state = { region: '全部', tradeMode: '全部', city: '全部', category: '全部', status: '全部', confidence: '全部', flowOnly: false, addressStatus: '全部', q: '', page: 1, selectedId: null };
  const els = {
    city: document.getElementById('cityFilter'), search: document.getElementById('searchInput'), category: document.getElementById('categoryFilter'), status: document.getElementById('statusFilter'), confidence: document.getElementById('confidenceFilter'), addressStatus: document.getElementById('addressStatusFilter'), flowOnly: document.getElementById('flowOnly'), reset: document.getElementById('resetBtn'), regionRow: document.getElementById('regionRow'), modeRow: document.getElementById('modeRow'), legend: document.getElementById('legend'), results: document.getElementById('results'), resultCount: document.getElementById('resultCount'), pager: document.getElementById('pager'), prev: document.getElementById('prevPage'), next: document.getElementById('nextPage'), pageInfo: document.getElementById('pageInfo'), detailTitle: document.getElementById('detailTitle'), detailTags: document.getElementById('detailTags'), detailBody: document.getElementById('detailBody'), mapContext: document.getElementById('mapContext'), mapFootnote: document.getElementById('mapFootnote'), cityCountPill: document.getElementById('cityCountPill'), recordCountPill: document.getElementById('recordCountPill'), baseSwitch: document.getElementById('baseSwitch'), fitMapBtn: document.getElementById('fitMapBtn'), fullscreenBtn: document.getElementById('fullscreenBtn'), kpiTotal: document.getElementById('kpiTotal'), kpiForeign: document.getElementById('kpiForeign'), kpiDomestic: document.getElementById('kpiDomestic'), kpiBoth: document.getElementById('kpiBoth'), kpiFactory: document.getElementById('kpiFactory'), kpiLogistics: document.getElementById('kpiLogistics')
  };
  Object.assign(els, {
    editCompanyBtn: document.getElementById('editCompanyBtn'), editDialog: document.getElementById('editDialog'), editNotice: document.getElementById('editNotice'), saveEditBtn: document.getElementById('saveEditBtn'), cancelEditBtn: document.getElementById('cancelEditBtn'), closeEditBtn: document.getElementById('closeEditBtn'), exportEditsBtn: document.getElementById('exportEditsBtn'), pickMapBtn: document.getElementById('pickMapBtn'), pickMapHint: document.getElementById('pickMapHint'), newCompanyBtn: document.getElementById('newCompanyBtn'), openDataBtn: document.getElementById('openDataBtn'), dataDialog: document.getElementById('dataDialog'), closeDataBtn: document.getElementById('closeDataBtn'), pickImportBtn: document.getElementById('pickImportBtn'), importFile: document.getElementById('importFile'), dropZone: document.getElementById('dropZone'), importPreview: document.getElementById('importPreview'), importStatus: document.getElementById('importStatus'), confirmImportBtn: document.getElementById('confirmImportBtn'), exportDataBtn: document.getElementById('exportDataBtn'), clearCacheBtn: document.getElementById('clearCacheBtn'), cachePill: document.getElementById('cachePill'), cacheEditCount: document.getElementById('cacheEditCount'), cacheImportCount: document.getElementById('cacheImportCount'), cacheUpdatedAt: document.getElementById('cacheUpdatedAt')
  });
  const EDIT_FIELDS = {
    name:'editName', category:'editCategory', tradeMode:'editTradeMode', city:'editCity', district:'editDistrict', address:'editAddress', phone:'editPhone', website:'editWebsite', product:'editProduct', exportClue:'editExportClue', status:'editStatus', confidence:'editConfidence', priority:'editPriority', addressStatus:'editAddressStatus', coordinateAccuracy:'editCoordinateAccuracy', coordinateSource:'editCoordinateSource', lat:'editLat', lng:'editLng', mapAddress:'editMapAddress', amapPoiId:'editAmapPoiId', geocodeMatch:'editGeocodeMatch', geocodeSourceUrl:'editGeocodeSourceUrl', sourceName:'editSourceName', sourceUrl:'editSourceUrl', flow:'editFlow', flowEvidence:'editFlowEvidence', flowSourceName:'editFlowSourceName', flowSourceUrl:'editFlowSourceUrl', note:'editNote', visitCount:'editVisitCount', latestVisitDate:'editLatestVisitDate', visitResult:'editVisitResult', logisticsMode:'editLogisticsMode', containerTypes:'editContainerTypes', mainDestination:'editMainDestination', shippingLines:'editShippingLines', truckingCompanies:'editTruckingCompanies', cargoType:'editCargoType', capacity:'editCapacity', factoryInfo:'editFactoryInfo'
  };
  let editingId = null, editingOriginal = null, pickingLocation = false, pendingImportRows = [];
  const nf = new Intl.NumberFormat('zh-CN');
  let currentItems = [], cityBounds = {}, map = null, markerCluster = null, selectedLayer = null, boundaryLayer = null, tileLayer = null, clusterRegistry = new Map(), clusterSeq = 0, fitOnRender = false, activeBase = 'street';
  function tradeModesOf(r) { const modes = Array.isArray(r?.tradeModes) ? r.tradeModes.filter(Boolean) : []; return modes.length ? [...new Set(modes)] : [r?.tradeMode || '外贸']; }
  function modeLabel(r) { const modes = tradeModesOf(r); return modes.includes('内贸') && modes.includes('外贸') ? '内外贸' : (modes.includes('内贸') ? '内贸' : '外贸'); }
  function modeBadge(r) { const label = modeLabel(r); const cls = label === '内外贸' ? 'mode-both' : label === '内贸' ? 'mode-domestic' : 'mode-foreign'; return '<span class="badge ' + cls + '">' + esc(label) + '</span>'; }
  function matchesMode(r, mode) { if (mode === '全部') return true; const modes = tradeModesOf(r); if (mode === '内外贸') return modes.includes('内贸') && modes.includes('外贸'); return modes.includes(mode); }
  function ensureCityMeta(city, lat, lng) { if (!city || CITY_META[city]) return; CITY_META[city] = { region: '其他', center: [Number(lng) || 116.4, Number(lat) || 39.8] }; }
  function approxCoordinate(city, district, seed) {
    ensureCityMeta(city);
    const cityRows = COMPANIES.filter(x => x.city === city && Number.isFinite(Number(x.lat)) && Number.isFinite(Number(x.lng)));
    const districtRows = cityRows.filter(x => district && x.district === district);
    const rows = districtRows.length ? districtRows : cityRows;
    let lat = Number(CITY_META[city]?.center?.[1] ?? 39.8), lng = Number(CITY_META[city]?.center?.[0] ?? 116.4);
    if (rows.length) { lat = rows.reduce((a,b) => a + Number(b.lat), 0) / rows.length; lng = rows.reduce((a,b) => a + Number(b.lng), 0) / rows.length; }
    let h = 2166136261; for (const ch of String(seed || city + district)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const angle = ((h >>> 0) % 360) * Math.PI / 180, dist = (((h >>> 9) % 1000) / 1000) * 0.022;
    return { lat: +(lat + Math.sin(angle) * dist).toFixed(6), lng: +(lng + Math.cos(angle) * dist).toFixed(6) };
  }
  function nextCompanyId() { return Math.max(0, ...COMPANIES.map(x => Number(x.id) || 0)) + 1; }
  function persistLocalCache() { try { localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(pendingEdits)); localStorage.setItem(LOCAL_IMPORTS_KEY, JSON.stringify(localImports)); localStorage.setItem(LOCAL_UPDATED_KEY, new Date().toISOString()); updateCacheUi(); return true; } catch (err) { console.error('local cache failed', err); if (els.editNotice) setEditNotice('浏览器缓存空间不足，请先导出完整数据并清理本机修改。', 'err'); return false; } }
  function updateCacheUi() { if (!els.cacheEditCount) return; const count = Object.keys(pendingEdits).length; els.cacheEditCount.textContent = countLabel(count); els.cacheImportCount.textContent = countLabel(localImports.length); let stamp = ''; try { stamp = localStorage.getItem(LOCAL_UPDATED_KEY) || ''; } catch (_) {} els.cacheUpdatedAt.textContent = stamp ? new Date(stamp).toLocaleString('zh-CN', { hour12: false }) : '—'; if (els.cachePill) els.cachePill.textContent = count || localImports.length ? '本机缓存 ' + (count + localImports.length) + ' 项' : '本机缓存已启用'; }
  for (const company of COMPANIES) { const patch = pendingEdits[company.id]; if (patch?.payload) Object.assign(company, patch.payload); if (!Array.isArray(company.tradeModes) || !company.tradeModes.length) company.tradeModes = company.tradeMode ? [company.tradeMode] : ['外贸']; company.tradeModes = [...new Set(company.tradeModes.filter(Boolean))]; company.tradeModeLabel = modeLabel(company); }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
  function isStaticHost() { return /(^|\.)github\.io$|(^|\.)gitee\.io$|(^|\.)pages\.dev$/i.test(location.hostname); }
  function validUrl(v) { return /^https?:\/\//i.test(String(v || '')); }
  function regionOf(city) { return CITY_META[city]?.region || '其他'; }
  function cityOptions() { return Object.keys(CITY_META).filter(c => state.region === '全部' || CITY_META[c].region === state.region); }

  function featureBBox(feature) {
    const box = [Infinity, -Infinity, -Infinity, Infinity];
    function walk(coords) {
      if (typeof coords[0] === 'number') {
        box[0] = Math.min(box[0], coords[0]); box[1] = Math.max(box[1], coords[1]);
        box[2] = Math.max(box[2], coords[0]); box[3] = Math.min(box[3], coords[1]);
      } else coords.forEach(walk);
    }
    walk(feature.geometry.coordinates); return box;
  }

  function initBounds() {
    if (!GEOJSON?.features) return;
    for (const f of GEOJSON.features) cityBounds[f.properties.name] = featureBBox(f);
  }

  function selectedBBox() {
    const names = state.city !== '全部' ? [state.city] : (state.region !== '全部' ? cityOptions() : Object.keys(CITY_META));
    const boxes = names.map(n => cityBounds[n]).filter(Boolean);
    if (!boxes.length) return null;
    return [Math.min(...boxes.map(b => b[0])), Math.max(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.min(...boxes.map(b => b[3]))];
  }

  function regionButtonSync() {
    els.regionRow.querySelectorAll('[data-region]').forEach(b => b.classList.toggle('active', b.dataset.region === state.region));
    els.modeRow?.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === state.tradeMode));
    els.legend.querySelectorAll('[data-category]').forEach(b => b.classList.toggle('active', b.dataset.category === state.category));
  }

  function populateCities() {
    for (const r of COMPANIES) ensureCityMeta(r.city, r.lat, r.lng);
    const names = Object.keys(CITY_META).filter(c => state.region === '全部' || CITY_META[c].region === state.region);
    if (state.city !== '全部' && !names.includes(state.city)) state.city = '全部';
    els.city.innerHTML = '<option value="全部">全部城市</option>' + names.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('');
    els.city.value = state.city;
  }

  function matches(r) {
    if (!matchesMode(r, state.tradeMode)) return false;
    if (state.region !== '全部' && regionOf(r.city) !== state.region) return false;
    if (state.city !== '全部' && r.city !== state.city) return false;
    if (state.category !== '全部' && r.category !== state.category) return false;
    if (state.status !== '全部' && r.status !== state.status) return false;
    if (state.confidence !== '全部' && r.confidence !== state.confidence) return false;
    if (state.addressStatus !== '全部' && r.addressStatus !== state.addressStatus) return false;
    if (state.flowOnly && !r.flow) return false;
    if (state.q) {
      const hay = [r.name,r.city,r.district,r.address,r.mapAddress,r.product,r.exportClue,r.flow,r.note,r.customerType,r.tradeModeLabel,r.cargoType,r.logisticsMode,r.mainDestination,r.shippingLines,r.truckingCompanies,r.factoryInfo,r.visitResult].join(' ').toLowerCase();
      if (!hay.includes(state.q.trim().toLowerCase())) return false;
    }
    return true;
  }

  function priorityRank(v) { return v === '高' ? 0 : v === '中' ? 1 : 2; }
  function computeItems() {
    return COMPANIES.filter(matches).sort((a,b) => priorityRank(a.priority) - priorityRank(b.priority) || (a.flow ? -1 : 1) - (b.flow ? -1 : 1) || a.name.localeCompare(b.name, 'zh-CN'));
  }
  function countLabel(n) { return nf.format(n); }

  function renderKPIs(items) {
    els.kpiTotal.textContent = countLabel(items.length);
    els.kpiForeign.textContent = countLabel(items.filter(x => tradeModesOf(x).includes('外贸')).length);
    els.kpiDomestic.textContent = countLabel(items.filter(x => tradeModesOf(x).includes('内贸')).length);
    els.kpiBoth.textContent = countLabel(items.filter(x => tradeModesOf(x).includes('外贸') && tradeModesOf(x).includes('内贸')).length);
    els.kpiFactory.textContent = countLabel(items.filter(x => x.category === '工厂/制造').length);
    els.kpiLogistics.textContent = countLabel(items.filter(x => x.category === '货代/物流').length);
  }

  function renderList(items) {
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = items.slice(start, start + PAGE_SIZE);
    els.resultCount.textContent = countLabel(items.length) + ' 条' + (items.length > PAGE_SIZE ? ' · 当前第 ' + (start + 1) + '-' + (start + pageItems.length) + ' 条' : '');
    els.results.innerHTML = pageItems.length ? pageItems.map(r => '<button type="button" class="result-item ' + (state.selectedId === r.id ? 'active' : '') + '" data-id="' + r.id + '"><div class="result-name">' + esc(r.name) + '</div><div class="result-meta">' + esc(r.city) + (r.district ? ' · ' + esc(r.district) : '') + ' · ' + esc(r.status) + (r.internalVisitCount ? ' · 走访 ' + esc(r.internalVisitCount) + ' 次' : '') + '</div><div class="result-mode">' + modeBadge(r) + '<span class="badge">' + esc(r.category) + '</span></div><div class="result-product">' + esc(r.product || r.cargoType || r.exportClue || r.customerType) + '</div><div class="result-bottom"><span class="badge ' + (r.priority === '高' ? 'high' : r.priority === '低' ? 'low' : '') + '">' + esc(r.priority || '中') + '优先级</span><span class="badge">' + (r.flow ? '有流向' : '待补流向') + '</span></div></button>').join('') : '<div class="empty">当前筛选条件下没有记录。请调整业务模式、区域、分类或关键词。</div>';
    els.pageInfo.textContent = state.page + ' / ' + totalPages;
    els.prev.disabled = state.page <= 1;
    els.next.disabled = state.page >= totalPages;
  }

  const BASE_LAYERS = {
    street: { url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}' },
    satellite: { url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}' }
  };

  function setBaseLayer(name) {
    if (!map || !BASE_LAYERS[name]) return;
    if (tileLayer) map.removeLayer(tileLayer);
    activeBase = name;
    tileLayer = L.tileLayer(BASE_LAYERS[name].url, {
      subdomains: ['1','2','3','4'],
      minZoom: 4,
      maxZoom: 18,
      maxNativeZoom: 18,
      attribution: '&copy; 高德地图'
    }).addTo(map);
    tileLayer.bringToBack();
    els.baseSwitch.querySelectorAll('[data-basemap]').forEach(b => b.classList.toggle('active', b.dataset.basemap === name));
  }

  function clusterColor(markers) {
    const counts = {};
    markers.forEach(marker => { const cat = marker.options?.companyData?.category; if (cat) counts[cat] = (counts[cat] || 0) + 1; });
    const dominant = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return CATEGORY_COLORS[dominant] || '#64748b';
  }

  function clusterIcon(cluster) {
    const markers = cluster.getAllChildMarkers();
    const count = cluster.getChildCount();
    const color = clusterColor(markers);
    const size = count >= 500 ? 62 : count >= 100 ? 54 : count >= 20 ? 46 : 38;
    const clusterId = ++clusterSeq;
    clusterRegistry.set(clusterId, cluster);
    return L.divIcon({
      html: `<div class="trade-cluster" data-cluster-id="${clusterId}" style="--cluster-color:${color}"><span>${count >= 1000 ? (count / 1000).toFixed(1) + 'k' : count}</span><small>条线索</small></div>`,
      className: 'trade-cluster-wrap', iconSize: [size, size]
    });
  }

  function updateBoundaryStyle() {
    if (!boundaryLayer) return;
    boundaryLayer.setStyle(feature => {
      const city = feature.properties?.name;
      const inRegion = state.region === '全部' || CITY_META[city]?.region === state.region;
      const active = inRegion && (state.city === '全部' || city === state.city);
      return {
        color: state.city === city ? '#d97706' : (active ? '#6c90bd' : '#b8c7da'),
        weight: state.city === city ? 2.2 : (active ? 1 : .6),
        opacity: active ? .9 : .35,
        fillColor: active ? '#3b82f6' : '#94a3b8',
        fillOpacity: active ? .035 : .008
      };
    });
  }

  function popupCompanyList(data) {
    const counts = data.reduce((acc, r) => { acc[r.category] = (acc[r.category] || 0) + 1; return acc; }, {});
    const meta = Object.keys(counts).map(k => `${k} ${counts[k]}`).join(' · ');
    const place = data[0] ? [data[0].city, data[0].district].filter(Boolean).join(' · ') : '';
    const list = data.slice(0, 14).map(r => `<button type="button" class="cluster-popup-item" data-company-id="${r.id}"><b>${esc(r.name)}</b><span>${esc(modeLabel(r))} · ${esc(r.category)} · ${esc(r.status)}</span></button>`).join('');
    return `<div class="cluster-popup"><div class="cluster-popup-head">${esc(place || '区域聚合')} · ${data.length} 条线索</div><div class="cluster-popup-meta">${esc(meta)}</div><div class="cluster-popup-list">${list}</div></div>`;
  }

  function showClusterPopup(cluster) {
    const data = cluster.getAllChildMarkers().map(m => m.options?.companyData).filter(Boolean);
    if (!data.length) return;
    L.popup({ maxWidth: 360, className: 'trade-popup' })
      .setLatLng(cluster.getLatLng())
      .setContent(popupCompanyList(data))
      .openOn(map);
  }

  function initMap() {
    if (map || !window.L) return;
    map = L.map('map', { preferCanvas: true, zoomControl: false, minZoom: 4, maxZoom: 18, worldCopyJump: false });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', metric: true, imperial: false, maxWidth: 120 }).addTo(map);
    map.setView([39.7, 114.7], 6);
    setBaseLayer('street');
    if (GEOJSON) {
      boundaryLayer = L.geoJSON(GEOJSON, { interactive: false, style: { color: '#6c90bd', weight: 1, opacity: .65, fillColor: '#3b82f6', fillOpacity: .025 } }).addTo(map);
    }
    markerCluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      spiderfyOnMaxZoom: false,
      removeOutsideVisibleBounds: true,
      chunkedLoading: true,
      maxClusterRadius: 36,
      iconCreateFunction: clusterIcon
    }).addTo(map);
    markerCluster.on('clusterclick', e => showClusterPopup(e.layer));
    map.getContainer().addEventListener('click', e => {
      const el = e.target.closest?.('[data-cluster-id]');
      if (!el) return;
      const cluster = clusterRegistry.get(Number(el.dataset.clusterId));
      if (cluster) showClusterPopup(cluster);
    }, true);
    selectedLayer = L.layerGroup().addTo(map);
    map.on('popupopen', e => {
      const root = e.popup.getElement();
      if (!root) return;
      root.querySelectorAll('[data-company-id]').forEach(btn => btn.addEventListener('click', () => selectCompany(Number(btn.dataset.companyId), true, true)));
    });
    map.on('click', e => {
      if (!pickingLocation) return;
      pickingLocation = false;
      els.pickMapHint.classList.remove('show');
      map.getContainer().style.cursor = '';
      document.getElementById('editLat').value = e.latlng.lat.toFixed(6);
      document.getElementById('editLng').value = e.latlng.lng.toFixed(6);
      document.getElementById('editAddressStatus').value = '已校准';
      document.getElementById('editCoordinateAccuracy').value = '精确位置';
      document.getElementById('editCoordinateSource').value = '地图人工点选';
      if (!els.editDialog.open) els.editDialog.showModal();
      setEditNotice('已取得地图点选坐标，请补充地址和来源后保存。', 'ok');
    });
    updateBoundaryStyle();
  }

  function fitMapToSelection() {
    if (!map) return;
    if (state.city !== '全部' && CITY_META[state.city]?.center) {
      const c = CITY_META[state.city].center;
      map.setView([c[1], c[0]], 10, { animate: true });
      return;
    }
    const box = selectedBBox();
    if (!box) return;
    map.fitBounds([[box[3], box[0]], [box[1], box[2]]], { padding: [24, 24], animate: true });
  }

  function companyMarker(r, selected = false) {
    const color = CATEGORY_COLORS[r.category] || '#64748b';
    const icon = L.divIcon({
      html: `<span class="company-pin${selected ? ' selected' : ''}" style="--pin-color:${color}"></span>`,
      className: 'company-pin-wrap',
      iconSize: selected ? [22, 22] : [14, 14],
      iconAnchor: selected ? [11, 11] : [7, 7]
    });
    const marker = L.marker([Number(r.lat), Number(r.lng)], { icon, title: r.name, keyboard: true, riseOnHover: true, companyData: r });
    marker.bindTooltip(`<div class="company-marker-tip"><strong>${esc(r.name)}</strong><span>${esc(r.city)}${r.district ? ' · ' + esc(r.district) : ''}<br>${esc(modeLabel(r))} · ${esc(r.category)} · ${esc(r.status)}<br>${esc(r.addressStatus || '地址状态未知')}${r.coordinateAccuracy ? ' · ' + esc(r.coordinateAccuracy) : ''}${r.internalVisitCount ? '<br>走访 ' + esc(r.internalVisitCount) + ' 次' : ''}</span></div>`, { direction: 'top', opacity: 0.98 });
    marker.on('click', () => selectCompany(r.id, false, true));
    return marker;
  }

  function renderMap(items) {
    initMap();
    if (!map || !markerCluster || !selectedLayer) return;
    markerCluster.clearLayers();
    clusterRegistry.clear();
    clusterSeq = 0;
    selectedLayer.clearLayers();
    const markers = [];
    let selectedRecord = null;
    for (const r of items) {
      if (!Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng))) continue;
      if (state.selectedId === r.id) { selectedRecord = r; continue; }
      markers.push(companyMarker(r, false));
    }
    if (markers.length) markerCluster.addLayers(markers);
    if (selectedRecord) selectedLayer.addLayer(companyMarker(selectedRecord, true));
    updateBoundaryStyle();
    if (fitOnRender) { fitMapToSelection(); fitOnRender = false; }
    window.setTimeout(() => map.invalidateSize(), 0);
  }

  function detailRow(label, value) { return value ? `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>` : ''; }
  function detailHtmlRow(label, html) { return html ? `<dt>${esc(label)}</dt><dd>${html}</dd>` : ''; }

  function setEditNotice(text, kind = '') {
    els.editNotice.textContent = text;
    els.editNotice.className = 'notice' + (kind ? ' ' + kind : '');
  }

  function fillEditForm(r, isNew = false) {
    for (const [key, idName] of Object.entries(EDIT_FIELDS)) {
      const el = document.getElementById(idName); if (!el) continue;
      el.value = key === 'tradeMode' ? modeLabel(r) : r[key] ?? '';
    }
    els.editDialog.querySelector('.edit-dialog-head h2').textContent = isNew ? '新增企业' : '编辑企业信息';
    setEditNotice(isNew ? '填写后保存到本机浏览器缓存。经纬度可留空，系统会按城市/区县近似落点。' : '修改会立即缓存到本机浏览器；需要长期归档时请在数据工具中导出 XLSX。', 'ok');
    if (!els.editDialog.open) els.editDialog.showModal();
  }
  function openEdit(id) {
    const r = COMPANIES.find(x => x.id === id);
    if (!r) return;
    editingId = id; editingOriginal = { ...r }; fillEditForm(r, false);
  }
  function openNew() {
    const city = state.city !== '全部' ? state.city : '';
    const defaultMode = state.tradeMode === '外贸' ? '外贸' : '内贸';
    const rec = { id: nextCompanyId(), name:'', category:'工厂/制造', tradeMode:defaultMode, city, district:'', address:'', phone:'', website:'', product:'', exportClue:'', status:'部分核验', confidence:'B', priority:'中', addressStatus:'待校准', coordinateAccuracy:'行政区近似', coordinateSource:'', lat:'', lng:'', mapAddress:'', amapPoiId:'', geocodeMatch:'', geocodeSourceUrl:'', sourceName:'本机新增', sourceUrl:'', flow:'', flowEvidence:'', flowSourceName:'', flowSourceUrl:'', note:'', visitCount:defaultMode === '内贸' ? 1 : 0, latestVisitDate:new Date().toISOString().slice(0,10), visitResult:'', logisticsMode:'', containerTypes:'', mainDestination:'', shippingLines:'', truckingCompanies:'', cargoType:'', capacity:'', factoryInfo:'' };
    editingId = rec.id; editingOriginal = rec; fillEditForm(rec, true);
  }

  function closeEdit() {
    pickingLocation = false;
    els.pickMapHint.classList.remove('show');
    if (map) map.getContainer().style.cursor = '';
    if (els.editDialog.open) els.editDialog.close();
  }

  function startPickLocation() {
    if (!els.editDialog.open) return;
    pickingLocation = true;
    els.editDialog.close();
    els.pickMapHint.classList.add('show');
    if (map) {
      map.getContainer().style.cursor = 'crosshair';
      map.invalidateSize();
    }
  }

  function exportPendingEdits() {
    const blob = new Blob([JSON.stringify(pendingEdits, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `华北外贸数据修改补丁_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function normalizeHeader(v) { return String(v || '').replace(/\s+/g, '').replace(/[\/／\\\-—:：()（）]/g, '').toLowerCase(); }
  function normalizeKey(v) { return String(v || '').toLowerCase().replace(/\s+/g, '').replace(/[（）()【】\[\]“”"'、，,;；:：\-—_·.]/g, ''); }
  function recordSignature(r) { return [normalizeKey(r.name), normalizeKey(r.city), normalizeKey(r.address)].join('|'); }
  function normalizeDateValue(v) {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
    if (typeof v === 'number' && window.XLSX?.SSF) { const d = XLSX.SSF.parse_date_code(v); if (d) return [d.y, String(d.m).padStart(2,'0'), String(d.d).padStart(2,'0')].join('-'); }
    const s = String(v || '').trim(); const m = s.match(/^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/); return m ? m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0') : s.slice(0, 10);
  }
  function rowValue(row, aliases) { for (const a of aliases) { const key = normalizeHeader(a); if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key]; } return ''; }
  function parseModes(v) { const s = String(v || '').trim(); if (s.includes('内外') || (s.includes('内贸') && s.includes('外贸'))) return ['内贸','外贸']; if (s.includes('内贸')) return ['内贸']; return ['外贸']; }
  function inferCategory(name, text) { const blob = String(name || '') + ' ' + String(text || ''); if (/物流|仓储|仓库|堆场|货运|运输|港|货代|车队|供应链/.test(blob)) return '货代/物流'; if (/贸易|进出口|商贸/.test(blob)) return '外贸公司'; if (/市场|平台|园区|基地|中心/.test(blob)) return '外贸服务/平台'; return '工厂/制造'; }
  function inferCity(address, name) {
    const text = String(address || '') + ' ' + String(name || '');
    const cities = Object.keys(CITY_META).concat(['信阳']);
    for (const c of cities) if (text.includes(c)) return c;
    const aliases = [['宝坻','天津'],['武清','天津'],['宁河','天津'],['北辰','天津'],['西青','天津'],['东丽','天津'],['津南','天津'],['滨海新区','天津'],['雄县','保定'],['定州','保定'],['顺平','保定'],['唐县','保定'],['辛集','石家庄'],['任丘','沧州'],['河间','沧州'],['黄骅','沧州'],['肃宁','沧州'],['南皮','沧州'],['孟村','沧州'],['霸州','廊坊'],['玉田','唐山'],['丰润','唐山'],['丰南','唐山'],['迁安','唐山'],['滦州','唐山'],['乐亭','唐山'],['榆次','晋中'],['清徐','太原'],['交城','吕梁'],['无棣','滨州'],['惠民','滨州']];
    for (const [k,c] of aliases) if (text.includes(k)) return c;
    return '';
  }
  function inferDistrict(address, city) { let a = String(address || '').replace(/^(?:河北省|山西省|内蒙古自治区|山东省|河南省|天津市|北京市)/,''); if (city) a = a.replace(new RegExp('^' + city + '(?:市)?'), ''); const m = a.match(/^([\u4e00-\u9fa5]{1,14}?(?:区|县|旗|开发区|经济开发区|工业园区|产业园))/); return m ? m[1] : ''; }
  function createImportedRecord(row, index) {
    const name = String(rowValue(row, ['企业名称','工厂名称','公司名称','客户名称','name'])).trim();
    if (!name) throw new Error('第 ' + (index + 2) + ' 行缺少企业名称');
    const address = String(rowValue(row, ['详细地址','地址','企业地址','address'])).trim();
    const city = String(rowValue(row, ['城市','所在城市','city'])).trim() || inferCity(address, name) || '其他';
    const district = String(rowValue(row, ['区县/园区','区县','县区','园区','district'])).trim() || inferDistrict(address, city);
    ensureCityMeta(city);
    const modes = parseModes(rowValue(row, ['业务模式','贸易模式','内外贸模式','模式','tradeMode']));
    const givenLat = Number(rowValue(row, ['纬度','lat'])), givenLng = Number(rowValue(row, ['经度','lng']));
    const approx = approxCoordinate(city, district, name + address + index);
    const lat = Number.isFinite(givenLat) && Math.abs(givenLat) <= 90 ? givenLat : approx.lat;
    const lng = Number.isFinite(givenLng) && Math.abs(givenLng) <= 180 ? givenLng : approx.lng;
    const visitCount = Number(rowValue(row, ['走访次数','visitCount'])) || (modes.includes('内贸') ? 1 : 0);
    const categoryInput = String(rowValue(row, ['客户分类','分类','category'])).trim();
    const factoryInfo = String(rowValue(row, ['走访情况/工厂情况','走访情况','工厂情况','factoryInfo'])).trim();
    const cargoType = String(rowValue(row, ['货类','主营产品/服务','产品','cargoType','product'])).trim();
    const sourceName = String(rowValue(row, ['来源名称','数据来源','sourceName'])).trim() || '本机导入';
    const note = String(rowValue(row, ['备注','数据限制','note'])).trim();
    return {
      id: nextCompanyId() + index, name, city, district, matchedDistrict: district, category: categoryInput || inferCategory(name, factoryInfo + ' ' + cargoType),
      customerType: modes.includes('内贸') ? '内贸走访客户' : '外贸客户', product: cargoType, exportClue: String(rowValue(row, ['外贸线索','exportClue'])).trim(), website: String(rowValue(row, ['官网','website'])).trim(), phone: String(rowValue(row, ['公开电话','phone'])).trim(), address: address || (city + district),
      sourceName, sourceUrl: String(rowValue(row, ['来源URL','来源链接','sourceUrl'])).trim(), sourceGrade: '本机导入', status: String(rowValue(row, ['核验状态','status'])).trim() || '部分核验', confidence: String(rowValue(row, ['可信度','confidence'])).trim() || 'B', priority: String(rowValue(row, ['客户优先级','优先级','priority'])).trim() || '中',
      flow: String(rowValue(row, ['公开发运流向','主要发运流向','主要流向','flow'])).trim(), flowEvidence: factoryInfo, flowSourceName: sourceName, flowSourceUrl: '', flowConfidence: 'B', note,
      lat, lng, locationBasis: Number.isFinite(givenLat) && Number.isFinite(givenLng) ? '人工校准' : (district ? '区县近似' : '城市近似'), addressStatus: String(rowValue(row, ['地址校准状态','地址状态','addressStatus'])).trim() || '待校准', coordinateAccuracy: Number.isFinite(givenLat) && Number.isFinite(givenLng) ? '精确位置' : '行政区近似', coordinateSource: Number.isFinite(givenLat) && Number.isFinite(givenLng) ? '导入文件提供' : '按城市/区县近似落点', mapAddress: address, addressType: '导入地址', amapPoiId: '', geocodeMatch: '', geocodeConfidence: '', geocodeSourceUrl: '', geocodedAt: '', creditCode: '',
      tradeModes: modes, tradeModeLabel: modes.includes('内贸') && modes.includes('外贸') ? '内外贸' : (modes.includes('内贸') ? '内贸' : '外贸'), internalVisited: modes.includes('内贸'), internalVisitCount: visitCount, latestVisitDate: normalizeDateValue(rowValue(row, ['最近走访日期','走访时间','实地探点时间','latestVisitDate'])), latestVisitResult: String(rowValue(row, ['最近走访结果','走访结果','实地探点结果','visitResult'])).trim(), visitDates: [], visitAddress: address, internalBusiness: factoryInfo,
      logisticsMode: String(rowValue(row, ['物流模式','logisticsMode'])).trim(), containerTypes: String(rowValue(row, ['常用箱型','箱型','containerTypes'])).trim(), mainDestination: String(rowValue(row, ['主要发运流向','主发区域','mainDestination'])).trim(), shippingLines: String(rowValue(row, ['船公司','shippingLines'])).trim(), truckingCompanies: String(rowValue(row, ['车队','truckingCompanies'])).trim(), cargoType, capacity: String(rowValue(row, ['产能','capacity'])).trim(), visitResult: String(rowValue(row, ['走访结果','visitResult'])).trim(),
      contactPerson: String(rowValue(row, ['联系人','contactPerson'])).trim(), contactPhone: String(rowValue(row, ['联系方式','联系电话','手机号','电话','contactPhone'])).trim(), gridNo: String(rowValue(row, ['网格号','gridNo'])).trim(), shippingCustomer: String(rowValue(row, ['发运客户','shippingCustomer'])).trim(), locationId: String(rowValue(row, ['LOCATION_ID','locationId'])).trim(), lastEditedAt: new Date().toISOString(), lastEditBy: '本机导入'
    };
  }
  async function parseImportFile(file) {
    if (!file) return;
    if (!window.XLSX) throw new Error('Excel 解析组件未加载');
    const isCsv = /\.csv$/i.test(file.name || '');
    const wb = isCsv ? XLSX.read(await file.text(), { type: 'string', cellDates: true }) : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    let headerIndex = matrix.findIndex(row => row.some(v => ['企业名称','工厂名称','公司名称','客户名称'].includes(String(v || '').trim())));
    if (headerIndex < 0) headerIndex = 0;
    const headers = matrix[headerIndex].map(h => normalizeHeader(h));
    const rows = matrix.slice(headerIndex + 1).filter(r => r.some(v => String(v || '').trim())).map(r => { const o = {}; headers.forEach((h,i) => { if (h) o[h] = r[i] ?? ''; }); return o; });
    const errors = [], records = [];
    rows.forEach((row, i) => { try { records.push(createImportedRecord(row, i)); } catch (e) { errors.push(e.message); } });
    pendingImportRows = records;
    const preview = records.slice(0, 8).map(r => '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.city) + '</td><td>' + esc(r.tradeModeLabel) + '</td><td>' + esc(r.address) + '</td></tr>').join('');
    els.importPreview.innerHTML = '<div class="ok">已读取 ' + countLabel(records.length) + ' 条有效记录' + (errors.length ? '，另有 ' + errors.length + ' 条错误' : '') + '。</div>' + (preview ? '<table><thead><tr><th>企业</th><th>城市</th><th>模式</th><th>地址</th></tr></thead><tbody>' + preview + '</tbody></table>' : '');
    if (errors.length) els.importPreview.innerHTML += '<div class="err" style="margin-top:8px">' + errors.slice(0,8).map(esc).join('<br>') + '</div>';
    els.importStatus.textContent = file.name;
    els.confirmImportBtn.disabled = !records.length;
  }
  function commitImport() {
    if (!pendingImportRows.length) return;
    const existing = new Set(COMPANIES.map(recordSignature));
    let added = 0, skipped = 0;
    for (const rec of pendingImportRows) {
      const sig = recordSignature(rec);
      if (existing.has(sig)) { skipped++; continue; }
      rec.id = nextCompanyId(); existing.add(sig); localImports.push(rec); COMPANIES.push(rec); added++;
    }
    persistLocalCache(); refresh(); pendingImportRows = []; els.confirmImportBtn.disabled = true;
    els.importPreview.innerHTML = '<div class="ok">已导入 ' + countLabel(added) + ' 条；跳过重复 ' + countLabel(skipped) + ' 条。数据已缓存到本机浏览器。</div>';
    els.importStatus.textContent = '';
  }
  function exportFullData() {
    const rows = COMPANIES.map(r => ({ '业务模式': modeLabel(r), '企业名称': r.name, '城市': r.city, '区县/园区': r.district, '详细地址': r.address, '客户分类': r.category, '联系人': r.contactPerson || '', '联系方式': r.contactPhone || '', '主营产品/服务': r.product, '物流模式': r.logisticsMode || '', '箱型': r.containerTypes || '', '主要发运流向': r.mainDestination || r.flow || '', '船公司': r.shippingLines || '', '车队': r.truckingCompanies || '', '货类': r.cargoType || '', '产能': r.capacity || '', '走访次数': r.internalVisitCount || 0, '最近走访日期': r.latestVisitDate || '', '走访结果': r.latestVisitResult || r.visitResult || '', '走访情况/工厂情况': r.factoryInfo || r.internalBusiness || '', '核验状态': r.status, '可信度': r.confidence, '来源名称': r.sourceName, '来源URL': r.sourceUrl, '纬度': r.lat, '经度': r.lng, '备注': r.note }));
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '客户数据'); XLSX.writeFile(wb, '华北客户完整数据_' + new Date().toISOString().slice(0,10) + '.xlsx');
  }
  function clearLocalCache() {
    if (!confirm('确定清空当前浏览器中的全部修改和新增记录吗？建议先导出完整数据。')) return;
    try { localStorage.removeItem(LOCAL_EDITS_KEY); localStorage.removeItem(LOCAL_IMPORTS_KEY); localStorage.removeItem(LOCAL_UPDATED_KEY); } catch (_) {}
    location.reload();
  }
  function saveCurrentEdit() {
    if (!editingId || !editingOriginal) return;
    const payload = {};
    for (const [key, idName] of Object.entries(EDIT_FIELDS)) { const el = document.getElementById(idName); if (el) payload[key] = String(el.value ?? '').trim(); }
    if (!payload.name) { setEditNotice('企业名称不能为空。', 'err'); return; }
    payload.tradeModes = payload.tradeMode === '内外贸' ? ['内贸','外贸'] : [payload.tradeMode === '内贸' ? '内贸' : '外贸'];
    payload.tradeModeLabel = payload.tradeMode;
    payload.internalVisited = payload.tradeModes.includes('内贸');
    payload.internalVisitCount = Math.max(0, Number(payload.visitCount) || (payload.internalVisited ? 1 : 0));
    payload.visitCount = payload.internalVisitCount;
    let lat = Number(payload.lat), lng = Number(payload.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { const c = approxCoordinate(payload.city || editingOriginal.city, payload.district, payload.name + payload.address); lat = c.lat; lng = c.lng; payload.coordinateSource = payload.coordinateSource || '按城市/区县近似落点'; payload.coordinateAccuracy = payload.coordinateAccuracy || '行政区近似'; payload.locationBasis = payload.district ? '区县近似' : '城市近似'; }
    else { payload.locationBasis = ['企业POI','地址/建筑POI','关联厂区POI'].includes(payload.coordinateAccuracy) ? 'POI校准' : '人工校准'; }
    payload.lat = +lat.toFixed(6); payload.lng = +lng.toFixed(6); payload.matchedDistrict = payload.district || '';
    if (!payload.mapAddress && payload.address) payload.mapAddress = payload.address;
    payload.lastEditedAt = new Date().toISOString(); payload.lastEditBy = '网页编辑';
    const found = COMPANIES.find(x => Number(x.id) === Number(editingId));
    const importIndex = localImports.findIndex(x => Number(x.id) === Number(editingId));
    if (!found) { const rec = { ...editingOriginal, ...payload }; COMPANIES.push(rec); rec.id = editingId; localImports.push(rec); }
    else if (importIndex >= 0) { Object.assign(localImports[importIndex], payload); Object.assign(found, payload); delete pendingEdits[editingId]; }
    else { pendingEdits[editingId] = { payload, updatedAt: new Date().toISOString() }; Object.assign(found, payload); }
    ensureCityMeta(payload.city, payload.lat, payload.lng);
    if (!persistLocalCache()) return;
    setEditNotice('已缓存到本机浏览器。', 'ok'); refresh(); setTimeout(closeEdit, 550);
  }
  function renderDetail(r) {
    if (!r) {
      els.detailTitle.textContent = '企业详情';
      els.detailTags.innerHTML = '';
      els.detailBody.innerHTML = '<div class="detail-empty">点击地图点位或下方名单中的企业，查看内贸走访、外贸线索、产品、来源和流向详情。</div>';
      els.editCompanyBtn.hidden = true;
      return;
    }
    els.editCompanyBtn.hidden = false;
    els.detailTitle.textContent = r.name;
    els.detailTags.innerHTML = modeBadge(r) + ' <span class="badge">' + esc(r.category) + '</span> <span class="badge ' + (r.priority === '高' ? 'high' : r.priority === '低' ? 'low' : '') + '">' + esc(r.priority || '中') + '优先级</span> <span class="badge">' + esc(r.status) + '</span> <span class="badge ' + (r.confidence === 'C' ? 'low' : '') + '">可信度 ' + esc(r.confidence) + '</span>';
    const website = validUrl(r.website) ? '<a href="' + esc(r.website) + '" target="_blank" rel="noopener">' + esc(r.website) + '</a>' : esc(r.website || '未公开');
    const source = validUrl(r.sourceUrl) ? '<a href="' + esc(r.sourceUrl) + '" target="_blank" rel="noopener">打开来源</a>' : '未公开';
    const creditSource = validUrl(r.creditSourceUrl) ? '<a href="' + esc(r.creditSourceUrl) + '" target="_blank" rel="noopener">打开信用代码来源</a>' : '';
    const flowSource = validUrl(r.flowSourceUrl) ? '<a href="' + esc(r.flowSourceUrl) + '" target="_blank" rel="noopener">打开流向来源</a>' : '';
    const flowBlock = r.flow ? '<div class="flow-card"><strong>' + esc(r.flow) + '</strong><div class="section-text">' + esc(r.flowEvidence || '') + '</div><div style="margin-top:8px;color:var(--muted);font-size:12px">' + esc(r.flowSourceName || '') + ' ' + flowSource + '</div></div>' : '<div class="section-text" style="color:var(--muted)">暂未填写具体流向。</div>';
    const locationQuery = [r.name, r.address, r.city, r.district].filter(Boolean).join(' ');
    const amapUrl = validUrl(r.geocodeSourceUrl) ? r.geocodeSourceUrl : ('https://ditu.amap.com/search?query=' + encodeURIComponent(locationQuery));
    const baiduUrl = 'https://map.baidu.com/search/' + encodeURIComponent(locationQuery);
    const locationLinks = '<div class="location-links"><a href="' + esc(amapUrl) + '" target="_blank" rel="noopener">' + (validUrl(r.geocodeSourceUrl) ? '打开高德POI' : '高德地图核实') + '</a><a href="' + esc(baiduUrl) + '" target="_blank" rel="noopener">百度地图核实</a></div>';
    const precision = (r.locationBasis || '行政区近似') + (r.matchedDistrict ? '：' + r.matchedDistrict : (r.district ? '：' + r.district : '：城市中心'));
    const visitBlock = r.internalVisited ? '<section class="detail-section"><h3>内贸走访信息</h3><dl class="kv">' + detailRow('业务模式', modeLabel(r)) + detailRow('走访次数', r.internalVisitCount ? r.internalVisitCount + ' 次' : '') + detailRow('最近走访', r.latestVisitDate) + detailRow('最近结果', r.latestVisitResult || r.visitResult) + detailRow('物流模式', r.logisticsMode) + detailRow('常用箱型', r.containerTypes) + detailRow('主要流向', r.mainDestination) + detailRow('船公司', r.shippingLines) + detailRow('车队', r.truckingCompanies) + detailRow('货类', r.cargoType) + detailRow('产能', r.capacity) + '</dl>' + (r.factoryInfo || r.internalBusiness ? '<div class="flow-card" style="margin-top:10px"><strong>走访情况</strong><div class="section-text">' + esc(r.factoryInfo || r.internalBusiness) + '</div></div>' : '') + '</section>' : '';
    els.detailBody.innerHTML = '<section class="detail-section"><h3>基本信息</h3><dl class="kv">' + detailRow('城市', r.city) + detailRow('统一社会信用代码', r.creditCode) + detailHtmlRow('信用代码来源', creditSource) + detailRow('区县/园区', r.district) + detailRow('业务模式', modeLabel(r)) + detailRow('细分类型', r.customerType) + detailRow('主营产品/服务', r.product) + detailRow('外贸线索', r.exportClue) + detailRow('位置精度', precision) + detailRow('地址校准', r.addressStatus) + detailRow('坐标精度', r.coordinateAccuracy) + detailRow('坐标来源', r.coordinateSource) + detailRow('POI匹配', r.geocodeMatch) + detailRow('POI编号', r.amapPoiId) + detailRow('POI核验时间', r.geocodedAt) + '</dl></section>' + visitBlock + '<section class="detail-section"><h3>联系与地址</h3><dl class="kv">' + detailHtmlRow('官网', website) + detailRow('公开电话', r.phone) + detailRow('地址', r.address) + detailRow('地图定位地址', r.mapAddress) + detailHtmlRow('地图核实', locationLinks) + '</dl></section><section class="detail-section"><h3>来源与核验</h3><dl class="kv">' + detailRow('来源', r.sourceName) + detailRow('来源等级', r.sourceGrade) + detailRow('核验状态', r.status) + detailRow('可信度', r.confidence) + detailRow('最近编辑', r.lastEditedAt) + detailHtmlRow('来源链接', source) + '</dl></section><section class="detail-section"><h3>发运流向</h3>' + flowBlock + '</section><section class="detail-section"><h3>备注与数据限制</h3><div class="section-text">' + esc(r.note || '无补充备注') + '</div></section>';
  }
  function refresh() {
    currentItems = computeItems();
    renderKPIs(currentItems);
    renderList(currentItems);
    renderMap(currentItems);
    const selected = COMPANIES.find(x => x.id === state.selectedId);
    renderDetail(selected);
    els.mapContext.textContent = (state.tradeMode === '全部' ? '全部业务模式' : state.tradeMode) + ' · ' + (state.region === '全部' ? '全部区域' : state.region) + (state.city !== '全部' ? ' · ' + state.city : '') + ' · ' + countLabel(currentItems.length) + ' 条匹配记录';
  }

  function selectCompany(id, scroll = true, fromMap = false) {
    const r = COMPANIES.find(x => x.id === id);
    if (!r) return;
    state.selectedId = id;
    state.page = Math.max(1, Math.floor(currentItems.findIndex(x => x.id === id) / PAGE_SIZE) + 1);
    renderList(currentItems);
    renderMap(currentItems);
    renderDetail(r);
    if (fromMap && map) map.panTo([Number(r.lat), Number(r.lng)], { animate: true });
    if (scroll) document.getElementById('detailPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setRegion(region) {
    state.region = region; state.city = '全部'; state.page = 1; fitOnRender = region !== '全部';
    regionButtonSync(); populateCities(); refresh();
  }

  function resetAll() {
    Object.assign(state, { region: '全部', tradeMode: '全部', city: '全部', category: '全部', status: '全部', confidence: '全部', flowOnly: false, addressStatus: '全部', q: '', page: 1, selectedId: null });
    els.search.value = ''; els.category.value = '全部'; els.status.value = '全部'; els.confidence.value = '全部'; els.addressStatus.value = '全部'; els.flowOnly.checked = false;
    fitOnRender = false; regionButtonSync(); populateCities(); refresh(); if (map) map.setView([39.7, 114.7], 6, { animate: true });
  }

  function initHeadline() {
    const cities = new Set(COMPANIES.map(r => r.city).filter(Boolean)).size;
    els.cityCountPill.textContent = `${cities} 城市`;
    els.recordCountPill.textContent = `${countLabel(COMPANIES.length)} 条记录`;
    const poiCount = COMPANIES.filter(r => r.locationBasis === 'POI校准').length;
    const districtCount = COMPANIES.filter(r => r.locationBasis === '区县近似').length;
    const cityCount = COMPANIES.filter(r => r.locationBasis === '城市近似').length;
    const domestic = COMPANIES.filter(r => tradeModesOf(r).includes('内贸')).length; if (els.mapFootnote) els.mapFootnote.textContent = '底图：高德地图栅格瓦片。点位精度：企业/地址POI ' + countLabel(poiCount) + ' 条，区县近似 ' + countLabel(districtCount) + ' 条，城市近似 ' + countLabel(cityCount) + ' 条。内贸走访记录 ' + countLabel(domestic) + ' 条；行政近似点不代表厂房门牌，公开看板不展示内部联系人及电话。';
  }

  els.regionRow.addEventListener('click', e => { const b = e.target.closest('[data-region]'); if (b) setRegion(b.dataset.region); });
  els.modeRow.addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; state.tradeMode = b.dataset.mode; state.page = 1; regionButtonSync(); refresh(); });
  els.newCompanyBtn.addEventListener('click', openNew);
  els.openDataBtn.addEventListener('click', () => { updateCacheUi(); els.dataDialog.showModal(); });
  els.closeDataBtn.addEventListener('click', () => els.dataDialog.close());
  els.pickImportBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', async () => { const file = els.importFile.files?.[0]; if (!file) return; try { await parseImportFile(file); } catch (err) { els.importPreview.innerHTML = '<div class="err">' + esc(err.message || err) + '</div>'; els.confirmImportBtn.disabled = true; } });
  els.dropZone.addEventListener('dragover', e => { e.preventDefault(); els.dropZone.classList.add('dragover'); });
  els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('dragover'));
  els.dropZone.addEventListener('drop', async e => { e.preventDefault(); els.dropZone.classList.remove('dragover'); const file = e.dataTransfer.files?.[0]; if (!file) return; try { await parseImportFile(file); } catch (err) { els.importPreview.innerHTML = '<div class="err">' + esc(err.message || err) + '</div>'; } });
  els.confirmImportBtn.addEventListener('click', commitImport);
  els.exportDataBtn.addEventListener('click', exportFullData);
  els.clearCacheBtn.addEventListener('click', clearLocalCache);
  els.legend.addEventListener('click', e => { const b = e.target.closest('[data-category]'); if (!b) return; state.category = b.dataset.category; els.category.value = state.category; state.page = 1; regionButtonSync(); refresh(); });
  els.city.addEventListener('change', e => { state.city = e.target.value; state.page = 1; fitOnRender = true; refresh(); });
  els.search.addEventListener('input', e => { state.q = e.target.value; state.page = 1; refresh(); });
  els.category.addEventListener('change', e => { state.category = e.target.value; state.page = 1; regionButtonSync(); refresh(); });
  els.status.addEventListener('change', e => { state.status = e.target.value; state.page = 1; refresh(); });
  els.confidence.addEventListener('change', e => { state.confidence = e.target.value; state.page = 1; refresh(); });
  els.addressStatus.addEventListener('change', e => { state.addressStatus = e.target.value; state.page = 1; refresh(); });
  els.flowOnly.addEventListener('change', e => { state.flowOnly = e.target.checked; state.page = 1; refresh(); });
  els.reset.addEventListener('click', resetAll);
  els.results.addEventListener('click', e => { const card = e.target.closest('[data-id]'); if (card) selectCompany(Number(card.dataset.id), true); });
  els.prev.addEventListener('click', () => { if (state.page > 1) { state.page--; renderList(currentItems); } });
  els.next.addEventListener('click', () => { const pages = Math.max(1, Math.ceil(currentItems.length / PAGE_SIZE)); if (state.page < pages) { state.page++; renderList(currentItems); } });
  els.baseSwitch.addEventListener('click', e => { const b = e.target.closest('[data-basemap]'); if (b) setBaseLayer(b.dataset.basemap); });
  els.fitMapBtn.addEventListener('click', () => { fitOnRender = true; refresh(); });
  els.editCompanyBtn.addEventListener('click', () => { if (state.selectedId) openEdit(state.selectedId); });
  els.saveEditBtn.addEventListener('click', saveCurrentEdit);
  els.cancelEditBtn.addEventListener('click', closeEdit);
  els.closeEditBtn.addEventListener('click', closeEdit);
  els.pickMapBtn.addEventListener('click', startPickLocation);
  els.exportEditsBtn.addEventListener('click', exportPendingEdits);
  els.fullscreenBtn.addEventListener('click', async () => {
    const el = document.getElementById('map');
    try {
      if (!document.fullscreenElement) await el.requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch (_) {}
  });
  document.addEventListener('fullscreenchange', () => {
    els.fullscreenBtn.textContent = document.fullscreenElement ? '退出全屏' : '全屏';
    window.setTimeout(() => map && map.invalidateSize(), 120);
  });
  window.addEventListener('resize', () => map && map.invalidateSize());

  initBounds();
  initHeadline();
  regionButtonSync();
  populateCities();
  refresh();
})();
