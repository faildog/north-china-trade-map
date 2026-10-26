(() => {
  const COMPANIES = Array.isArray(window.MAP_COMPANIES) ? window.MAP_COMPANIES : [];
  const LOCAL_EDITS_KEY = 'northChinaTradeMapEditsV1';
  let pendingEdits = {};
  try { pendingEdits = JSON.parse(localStorage.getItem(LOCAL_EDITS_KEY) || '{}'); } catch (_) { pendingEdits = {}; }
  for (const company of COMPANIES) { if (pendingEdits[company.id]) Object.assign(company, pendingEdits[company.id].payload || {}); }
  const CITY_META = window.NORTH_CHINA_CITY_META || {};
  const GEOJSON = window.NORTH_CHINA_GEOJSON;
  const CATEGORY_COLORS = {
    '工厂/制造': '#2563eb',
    '外贸公司': '#059669',
    '货代/物流': '#d97706',
    '外贸服务/平台': '#7c3aed'
  };
  const PAGE_SIZE = 40;
  const state = { region: '全部', city: '全部', category: '全部', status: '全部', confidence: '全部', flowOnly: false, addressStatus: '全部', q: '', page: 1, selectedId: null };
  const els = {
    city: document.getElementById('cityFilter'), search: document.getElementById('searchInput'), category: document.getElementById('categoryFilter'), status: document.getElementById('statusFilter'), confidence: document.getElementById('confidenceFilter'), addressStatus: document.getElementById('addressStatusFilter'), flowOnly: document.getElementById('flowOnly'), reset: document.getElementById('resetBtn'), regionRow: document.getElementById('regionRow'), legend: document.getElementById('legend'), results: document.getElementById('results'), resultCount: document.getElementById('resultCount'), pager: document.getElementById('pager'), prev: document.getElementById('prevPage'), next: document.getElementById('nextPage'), pageInfo: document.getElementById('pageInfo'), detailTitle: document.getElementById('detailTitle'), detailTags: document.getElementById('detailTags'), detailBody: document.getElementById('detailBody'), mapContext: document.getElementById('mapContext'), mapFootnote: document.getElementById('mapFootnote'), cityCountPill: document.getElementById('cityCountPill'), recordCountPill: document.getElementById('recordCountPill'), baseSwitch: document.getElementById('baseSwitch'), fitMapBtn: document.getElementById('fitMapBtn'), fullscreenBtn: document.getElementById('fullscreenBtn'), kpiTotal: document.getElementById('kpiTotal'), kpiFactory: document.getElementById('kpiFactory'), kpiTrader: document.getElementById('kpiTrader'), kpiLogistics: document.getElementById('kpiLogistics'), kpiFlow: document.getElementById('kpiFlow'), kpiAddress: document.getElementById('kpiAddress')
  };
  Object.assign(els, {
    editCompanyBtn: document.getElementById('editCompanyBtn'), editDialog: document.getElementById('editDialog'),
    editNotice: document.getElementById('editNotice'), saveEditBtn: document.getElementById('saveEditBtn'),
    cancelEditBtn: document.getElementById('cancelEditBtn'), closeEditBtn: document.getElementById('closeEditBtn'),
    exportEditsBtn: document.getElementById('exportEditsBtn'), pickMapBtn: document.getElementById('pickMapBtn'),
    pickMapHint: document.getElementById('pickMapHint')
  });
  const EDIT_FIELDS = {
    name:'editName', category:'editCategory', city:'editCity', district:'editDistrict', address:'editAddress',
    phone:'editPhone', website:'editWebsite', product:'editProduct', exportClue:'editExportClue', status:'editStatus',
    confidence:'editConfidence', priority:'editPriority', addressStatus:'editAddressStatus',
    coordinateAccuracy:'editCoordinateAccuracy', coordinateSource:'editCoordinateSource', lat:'editLat', lng:'editLng',
    mapAddress:'editMapAddress', amapPoiId:'editAmapPoiId', geocodeMatch:'editGeocodeMatch', geocodeSourceUrl:'editGeocodeSourceUrl',
    sourceName:'editSourceName', sourceUrl:'editSourceUrl', flow:'editFlow', flowEvidence:'editFlowEvidence',
    flowSourceName:'editFlowSourceName', flowSourceUrl:'editFlowSourceUrl', note:'editNote'
  };
  let editingId = null;
  let editingOriginal = null;
  let pickingLocation = false;
  const nf = new Intl.NumberFormat('zh-CN');
  let currentItems = [];
  let cityBounds = {};
  let map = null;
  let markerCluster = null;
  let selectedLayer = null;
  let boundaryLayer = null;
  let tileLayer = null;
  let clusterRegistry = new Map();
  let clusterSeq = 0;
  let fitOnRender = false;
  let activeBase = 'street';

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
    els.legend.querySelectorAll('[data-category]').forEach(b => b.classList.toggle('active', b.dataset.category === state.category));
  }

  function populateCities() {
    const names = cityOptions();
    if (state.city !== '全部' && !names.includes(state.city)) state.city = '全部';
    els.city.innerHTML = '<option value="全部">全部城市</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    els.city.value = state.city;
  }

  function matches(r) {
    if (state.region !== '全部' && regionOf(r.city) !== state.region) return false;
    if (state.city !== '全部' && r.city !== state.city) return false;
    if (state.category !== '全部' && r.category !== state.category) return false;
    if (state.status !== '全部' && r.status !== state.status) return false;
    if (state.confidence !== '全部' && r.confidence !== state.confidence) return false;
    if (state.addressStatus !== '全部' && r.addressStatus !== state.addressStatus) return false;
    if (state.flowOnly && !r.flow) return false;
    if (state.q) {
      const hay = [r.name,r.city,r.district,r.address,r.mapAddress,r.product,r.exportClue,r.flow,r.note,r.customerType].join(' ').toLowerCase();
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
    els.kpiFactory.textContent = countLabel(items.filter(x => x.category === '工厂/制造').length);
    els.kpiTrader.textContent = countLabel(items.filter(x => x.category === '外贸公司').length);
    els.kpiLogistics.textContent = countLabel(items.filter(x => x.category === '货代/物流').length);
    els.kpiFlow.textContent = countLabel(items.filter(x => x.flow).length);
    els.kpiAddress.textContent = countLabel(items.filter(x => x.addressStatus === '已校准').length);
  }

  function renderList(items) {
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = items.slice(start, start + PAGE_SIZE);
    els.resultCount.textContent = `${countLabel(items.length)} 条${items.length > PAGE_SIZE ? ` · 当前第 ${start + 1}-${start + pageItems.length} 条` : ''}`;
    els.results.innerHTML = pageItems.length ? pageItems.map(r => `
      <button type="button" class="result-item ${state.selectedId === r.id ? 'active' : ''}" data-id="${r.id}">
        <div class="result-name">${esc(r.name)}</div>
        <div class="result-meta">${esc(r.city)}${r.district ? ' · ' + esc(r.district) : ''} · ${esc(r.status)}</div>
        <div class="result-product">${esc(r.product || r.exportClue || r.customerType)}</div>
        <div class="result-bottom"><span class="badge">${esc(r.category)}</span><span class="badge ${r.priority === '高' ? 'high' : r.priority === '低' ? 'low' : ''}">${esc(r.priority || '中')}优先级</span></div>
      </button>`).join('') : '<div class="empty">当前筛选条件下没有记录。请调整区域、分类、核验状态或关键词。</div>';
    els.pageInfo.textContent = `${state.page} / ${totalPages}`;
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
    const list = data.slice(0, 14).map(r => `<button type="button" class="cluster-popup-item" data-company-id="${r.id}"><b>${esc(r.name)}</b><span>${esc(r.category)} · ${esc(r.status)}</span></button>`).join('');
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
    marker.bindTooltip(`<div class="company-marker-tip"><strong>${esc(r.name)}</strong><span>${esc(r.city)}${r.district ? ' · ' + esc(r.district) : ''}<br>${esc(r.category)} · ${esc(r.status)}<br>${esc(r.addressStatus || '地址状态未知')}${r.coordinateAccuracy ? ' · ' + esc(r.coordinateAccuracy) : ''}</span></div>`, { direction: 'top', opacity: 0.98 });
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

  function openEdit(id) {
    const r = COMPANIES.find(x => x.id === id);
    if (!r) return;
    editingId = id;
    editingOriginal = { ...r };
    for (const [key, idName] of Object.entries(EDIT_FIELDS)) {
      const el = document.getElementById(idName);
      if (!el) continue;
      el.value = r[key] ?? '';
    }
    setEditNotice(isStaticHost() ? '当前是在线静态展示版：修改只保存在本浏览器，不会同步给其他人；请用“导出修改补丁”交给管理员合并。' : '修改后会同步写入项目数据，并保留编辑日志。');
    if (!els.editDialog.open) els.editDialog.showModal();
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

  async function saveCurrentEdit() {
    if (!editingId || !editingOriginal) return;
    const payload = {};
    for (const [key, idName] of Object.entries(EDIT_FIELDS)) {
      const el = document.getElementById(idName);
      if (!el) continue;
      payload[key] = typeof el.value === 'string' ? el.value.trim() : el.value;
    }
    payload.lat = Number(payload.lat);
    payload.lng = Number(payload.lng);
    if (!payload.name) { setEditNotice('企业名称不能为空。', 'err'); return; }
    if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) { setEditNotice('请填写有效经纬度，或在地图上点选位置。', 'err'); return; }
    payload.matchedDistrict = payload.district || '';
    payload.locationBasis = ['企业POI','地址/建筑POI','关联厂区POI'].includes(payload.coordinateAccuracy) ? 'POI校准' : (['精确位置','人工校准','地址近似'].includes(payload.coordinateAccuracy) ? '人工校准' : (payload.district ? '区县近似' : '城市近似'));
    if (payload.address && payload.addressStatus === '待补地址') payload.addressStatus = '待校准';
    payload.lastEditedAt = new Date().toISOString();
    payload.lastEditBy = '网页编辑';
    els.saveEditBtn.disabled = true;
    els.saveEditBtn.textContent = '保存中…';
    try {
      const resp = await fetch(`/api/company/${editingId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await resp.json();
      if (!resp.ok || !data.ok) throw new Error(data.error || '保存失败');
      Object.assign(COMPANIES.find(x => x.id === editingId), data.company);
      delete pendingEdits[editingId];
      localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(pendingEdits));
      setEditNotice('已保存到本地项目文件，并记录编辑日志。', 'ok');
      refresh();
      setTimeout(closeEdit, 650);
    } catch (err) {
      Object.assign(COMPANIES.find(x => x.id === editingId), payload);
      pendingEdits[editingId] = { payload, updatedAt: new Date().toISOString() };
      localStorage.setItem(LOCAL_EDITS_KEY, JSON.stringify(pendingEdits));
      setEditNotice(isStaticHost() ? '在线静态版无法直接写入共享数据，修改仅暂存在本浏览器；请导出修改补丁交给管理员。' : '后端保存接口不可用，修改已暂存在本浏览器；可导出补丁，或使用 serve.py 启动项目后重新保存。', 'err');
      refresh();
    } finally {
      els.saveEditBtn.disabled = false;
      els.saveEditBtn.textContent = '保存修改';
    }
  }

  function renderDetail(r) {
    if (!r) {
      els.detailTitle.textContent = '企业详情';
      els.detailTags.innerHTML = '';
      els.detailBody.innerHTML = '<div class="detail-empty">点击地图点位或下方名单中的企业，查看产品、来源、核验状态和公开流向详情。</div>';
      els.editCompanyBtn.hidden = true;
      return;
    }
    els.editCompanyBtn.hidden = false;
    els.detailTitle.textContent = r.name;
    els.detailTags.innerHTML = `<span class="badge">${esc(r.category)}</span> <span class="badge ${r.priority === '高' ? 'high' : r.priority === '低' ? 'low' : ''}">${esc(r.priority || '中')}优先级</span> <span class="badge">${esc(r.status)}</span> <span class="badge ${r.confidence === 'C' ? 'low' : ''}">可信度 ${esc(r.confidence)}</span>`;
    const website = validUrl(r.website) ? `<a href="${esc(r.website)}" target="_blank" rel="noopener">${esc(r.website)}</a>` : esc(r.website || '未公开');
    const source = validUrl(r.sourceUrl) ? `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">打开来源</a>` : '未公开';
    const creditSource = validUrl(r.creditSourceUrl) ? `<a href="${esc(r.creditSourceUrl)}" target="_blank" rel="noopener">打开信用代码来源</a>` : '';
    const flowSource = validUrl(r.flowSourceUrl) ? `<a href="${esc(r.flowSourceUrl)}" target="_blank" rel="noopener">打开流向来源</a>` : '';
    const flowBlock = r.flow ? `<div class="flow-card"><strong>${esc(r.flow)}</strong><div class="section-text">${esc(r.flowEvidence || '')}</div><div style="margin-top:8px;color:var(--muted);font-size:12px">${esc(r.flowSourceName || '')} ${flowSource}</div></div>` : '<div class="section-text" style="color:var(--muted)">未查到可公开核验的具体流向。</div>';
    const locationQuery = [r.name, r.address, r.city, r.district].filter(Boolean).join(' ');
    const amapUrl = validUrl(r.geocodeSourceUrl) ? r.geocodeSourceUrl : ('https://ditu.amap.com/search?query=' + encodeURIComponent(locationQuery));
    const baiduUrl = 'https://map.baidu.com/search/' + encodeURIComponent(locationQuery);
    const locationLinks = `<div class="location-links"><a href="${esc(amapUrl)}" target="_blank" rel="noopener">${validUrl(r.geocodeSourceUrl) ? '打开高德POI' : '高德地图核实'}</a><a href="${esc(baiduUrl)}" target="_blank" rel="noopener">百度地图核实</a></div>`;
    const precision = (r.locationBasis || '行政区近似') + (r.matchedDistrict ? '：' + r.matchedDistrict : (r.district ? '：' + r.district : '：城市中心'));
    els.detailBody.innerHTML = `
      <section class="detail-section"><h3>基本信息</h3><dl class="kv">
        ${detailRow('城市', r.city)}${detailRow('统一社会信用代码', r.creditCode)}${detailHtmlRow('信用代码来源', creditSource)}${detailRow('区县/园区', r.district)}${detailRow('细分类型', r.customerType)}${detailRow('主营产品/服务', r.product)}${detailRow('外贸线索', r.exportClue)}${detailRow('位置精度', precision)}${detailRow('地址校准', r.addressStatus)}${detailRow('坐标精度', r.coordinateAccuracy)}${detailRow('坐标来源', r.coordinateSource)}${detailRow('POI匹配', r.geocodeMatch)}${detailRow('POI编号', r.amapPoiId)}${detailRow('POI核验时间', r.geocodedAt)}
      </dl></section>
      <section class="detail-section"><h3>联系与地址</h3><dl class="kv">${detailHtmlRow('官网', website)}${detailRow('公开电话', r.phone)}${detailRow('地址', r.address)}${detailRow('地图定位地址', r.mapAddress)}${detailHtmlRow('地图核实', locationLinks)}</dl></section>
      <section class="detail-section"><h3>来源与核验</h3><dl class="kv">${detailRow('来源', r.sourceName)}${detailRow('来源等级', r.sourceGrade)}${detailRow('核验状态', r.status)}${detailRow('可信度', r.confidence)}${detailRow('最近编辑', r.lastEditedAt)}${detailHtmlRow('来源链接', source)}</dl></section>
      <section class="detail-section"><h3>公开发运流向</h3>${flowBlock}</section>
      <section class="detail-section"><h3>备注与数据限制</h3><div class="section-text">${esc(r.note || '无补充备注')}</div></section>`;
  }

  function refresh() {
    currentItems = computeItems();
    renderKPIs(currentItems);
    renderList(currentItems);
    renderMap(currentItems);
    const selected = COMPANIES.find(x => x.id === state.selectedId);
    renderDetail(selected);
    els.mapContext.textContent = `${state.region === '全部' ? '全部区域' : state.region}${state.city !== '全部' ? ' · ' + state.city : ''} · ${countLabel(currentItems.length)} 条匹配记录`;
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
    Object.assign(state, { region: '全部', city: '全部', category: '全部', status: '全部', confidence: '全部', flowOnly: false, addressStatus: '全部', q: '', page: 1, selectedId: null });
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
    if (els.mapFootnote) els.mapFootnote.textContent = `底图：高德地图栅格瓦片。点位精度：企业/地址POI ${countLabel(poiCount)} 条，区县近似 ${countLabel(districtCount)} 条，城市近似 ${countLabel(cityCount)} 条；POI点位来自高德公开检索并记录编号，行政近似点仍不代表厂房门牌。`;
  }

  els.regionRow.addEventListener('click', e => { const b = e.target.closest('[data-region]'); if (b) setRegion(b.dataset.region); });
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
