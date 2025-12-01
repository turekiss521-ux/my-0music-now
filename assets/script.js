// ==================== 全局变量（完整定义） ====================
const APIS = {
  main: "https://music-api.gdstudio.xyz/api.php",
  backup1: "https://api.uomg.com/api/v1/music",
  backup2: "https://music.cyrilstudio.top"  // 2025稳定镜像
};
let currentApi = APIS.main;
let playlist = JSON.parse(localStorage.getItem('playlist') || '[]');  // 统一键名
let currentIndex = parseInt(localStorage.getItem('currentIndex') || '0');
let lyricLines = [];  // 初始化为空数组，避免undefined

// 限流常量（定义在这里，避免ReferenceError）
const RATE_LIMIT_KEY = 'search_requests';
const RATE_LIMIT_WINDOW = 5 * 60 * 1000;  // 5分钟
const RATE_LIMIT_MAX = 60;

// ==================== DOM 选择器（加null检查） ====================
const $ = id => document.getElementById(id);
const searchInput = $('searchInput');
const sourceSelect = $('sourceSelect');
const searchBtn = $('searchBtn');
const results = $('results');
const playBtn = $('playBtn');
const prevBtn = $('prevBtn');
const nextBtn = $('nextBtn');
const titleEl = $('title');
const artistEl = $('artist');
const coverEl = $('cover');
const progressFill = $('progressFill');
const currentTimeEl = $('currentTime');
const durationEl = $('duration');
const volumeSlider = $('volumeSlider');
const playlistUl = $('playlistUl');
const playlistPanel = $('playlist');
const closePlaylist = $('closePlaylist');
const clearPlaylist = $('clearPlaylist');
const lyricContainer = $('lyricContainer');
const progressBar = document.querySelector('.progress-bar');
const playlistBtn = $('playlistBtn');  // 新增定义
const audio = $('audio');  // 新增定义，避免null

// ==================== 初始化（加检查） ====================
if (volumeSlider) {
  volumeSlider.value = localStorage.getItem('volume') || 80;
  if (audio) audio.volume = volumeSlider.value / 100;
}
renderPlaylist();
if (playlist.length > 0 && currentIndex < playlist.length) playCurrent();

// ==================== 限流检查（单一版本，无重复） ====================
function checkRateLimit() {
  let requests = JSON.parse(localStorage.getItem(RATE_LIMIT_KEY) || '[]');
  const now = Date.now();
  requests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
  if (requests.length >= RATE_LIMIT_MAX) {
    const waitTime = Math.ceil((RATE_LIMIT_WINDOW - (now - requests[0])) / 1000 / 60);
    alert(`请求过多，5分钟内最多60次搜索。请${waitTime}分钟后重试。`);
    if (searchBtn) searchBtn.disabled = true;
    setTimeout(() => { if (searchBtn) searchBtn.disabled = false; }, RATE_LIMIT_WINDOW - (now - requests[0]));
    return false;
  }
  requests.push(now);
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(requests));
  return true;
}

// ==================== API 调用包装（统一版本，无冲突） ====================
async function apiFetch(endpoint, params, type = 'search') {
  const apis = [APIS.main, APIS.backup1, APIS.backup2];
  let lastError = null;
  for (let api of apis) {
    try {
      let url;
      if (api === APIS.main || api === APIS.backup2) {
        url = `${api}?${new URLSearchParams({ ...params, types: type }).toString()}`;
      } else if (api === APIS.backup1) {
        if (type === 'search') {
          url = `${api}/music.search?keyword=${params.name}&count=${params.count || 30}&type=${params.source}`;
        } else {
          url = `${api}/music.${type}?mid=${params.id}&format=json&type=${params.source}`;
        }
      }
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 8000);  // 8s超时
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // 统一检查响应
      if (data && (type === 'search' ? (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0) : (data.url || data.lyric || data.cover))) {
        currentApi = api;
        return data;
      }
      lastError = new Error('Empty response');
    } catch (e) {
      lastError = e;
      console.warn(`API ${api} failed for ${type}:`, e.message);
    }
  }
  throw lastError || new Error('All APIs failed');
}

// ==================== 搜索功能 ====================
if (searchBtn) searchBtn.onclick = () => search();
if (searchInput) searchInput.addEventListener('keydown', e => e.key === 'Enter' && search());

async function search(page = 1) {
  if (!checkRateLimit()) return;

  const keyword = searchInput ? searchInput.value.trim() : '';
  if (!keyword) return alert('请输入关键词');

  if (results) results.innerHTML = '<div class="loading">搜索中...</div>';
  const source = sourceSelect ? sourceSelect.value : 'kuwo';  // 默认kuwo
  const params = { source, name: keyword, count: 30, pages: page };

  try {
    const data = await apiFetch('', params, 'search');

    if (results) results.innerHTML = '';
    if (!data || (Array.isArray(data) ? data.length === 0 : Object.keys(data).length === 0)) {
      if (results) results.innerHTML = '<p>未找到结果，试试换个关键词或音乐源</p>';
      return;
    }

    // 适配响应到统一格式
    const songs = Array.isArray(data) ? data : Object.values(data);
    songs.slice(0, 30).forEach(song => {  // 限30条
      const unifiedSong = {
        id: song.id || song.songmid || song.rid,
        name: song.name || song.songname,
        artist: Array.isArray(song.artist) ? song.artist.map(a => a.name || a) : [song.singer || song.artist || 'Unknown'],
        album: song.album || song.albumname || 'Unknown',
        pic_id: song.pic_id || song.albumpic || song.img,
        lyric_id: song.lyric_id || song.id,
        source
      };

      const div = document.createElement('div');
      div.className = 'song-item';
      div.innerHTML = `
        <img src="${unifiedSong.pic_id ? getPicUrl(unifiedSong) : 'https://via.placeholder.com/60?text=No+Cover'}" 
             onerror="this.src='https://via.placeholder.com/60?text=Error'" alt="cover">
        <div class="info">
          <h4>${unifiedSong.name}</h4>
          <p>${unifiedSong.artist.join(' / ')} - ${unifiedSong.album}</p>
        </div>
      `;
      div.ondblclick = () => addToPlaylist(unifiedSong, false);
      div.onclick = (e) => { if (e.detail === 1) addToPlaylistAndPlay(unifiedSong); };
      if (results) results.appendChild(div);
    });
  } catch (e) {
    if (results) results.innerHTML = '<p style="color:red">搜索失败，所有API不可用。请刷新重试。</p>';
    console.error('Search error:', e);
  }
}

// ==================== 封面URL生成（缓存版） ====================
function getPicUrl(song, size = 300) {
  const cacheKey = `pic_${song.source}_${song.pic_id}_${size}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;

  // 异步预加载，但返回占位先
  setTimeout(async () => {
    try {
      const params = { source: song.source, id: song.pic_id, size };
      const data = await apiFetch('', params, 'pic');
      const url = data.url || data.cover || 'https://via.placeholder.com/60?text=No+Cover';
      localStorage.setItem(cacheKey, url);
      setTimeout(() => localStorage.removeItem(cacheKey), 3600000);  // 1h过期
      // 更新已加载的img
      document.querySelectorAll(`[data-pic="${cacheKey}"]`).forEach(img => img.src = url);
    } catch (e) {
      console.warn('Cover failed:', e);
    }
  }, 0);

  return 'https://via.placeholder.com/60?text=Loading...';  // 初始占位
}

// ==================== 播放控制 ====================
function addToPlaylist(song, playNow = true) {
  const existIdx = playlist.findIndex(s => s.id === song.id && s.source === song.source);
  if (existIdx !== -1) {
    if (playNow) currentIndex = existIdx;
  } else {
    playlist.push({ ...song });  // 深拷贝，避免修改原song
    if (playNow) currentIndex = playlist.length - 1;
  }
  savePlaylist();
  renderPlaylist();
  if (playNow) playCurrent();
}

function addToPlaylistAndPlay(song) {
  addToPlaylist(song, true);
}

async function playCurrent() {
  const song = playlist[currentIndex];
  if (!song || !titleEl || !artistEl || !coverEl) return;

  titleEl.textContent = song.name;
  artistEl.textContent = song.artist.join(' / ');
  coverEl.src = getPicUrl(song, 500);  // 大图

  // URL获取（降级+备用）
  let urlData = null;
  const brLevels = [999, 320, 128];
  const fallbackSources = ['kuwo', 'migu', 'tencent', 'netease'];
  for (let fbSource of fallbackSources) {
    for (let br of brLevels) {
      try {
        const params = { source: fbSource, id: song.id, br };
        urlData = await apiFetch('', params, 'url');
        if (urlData.url && urlData.url.startsWith('http') && !urlData.url.includes('douyin') && (urlData.url.endsWith('.mp3') || urlData.url.endsWith('.m4a'))) {
          song.source = fbSource;
          console.log('Play success:', urlData.url);
          break;
        }
      } catch (e) {
        console.warn(`URL failed ${fbSource} br=${br}:`, e.message);
      }
    }
    if (urlData?.url) break;
  }

  if (!urlData?.url || !audio) {
    alert('加载歌曲失败：所有源无效。换源重搜试试。');
    return;
  }

  audio.src = urlData.url;
  audio.play().catch(e => {
    console.error('Audio play error:', e);
    alert('播放失败：' + e.message + '（检查浏览器权限）');
  });
  if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';

  // 歌词
  fetchLyric(song);
  highlightPlaylist();
  localStorage.setItem('currentIndex', currentIndex);
}

function fetchLyric(song) {
  if (!lyricContainer) return;
  lyricContainer.classList.remove('show');
  lyricContainer.innerHTML = '<div>加载歌词中...</div>';
  const params = { source: song.source, id: song.lyric_id || song.id };
  apiFetch('', params, 'lyric')
    .then(data => {
      const lrc = data.lyric || data.lrc || '';
      if (lrc) {
        lyricLines = parseLrc(lrc);
        lyricContainer.innerHTML = '<div>歌词加载完成</div>';
      } else {
        lyricContainer.innerHTML = '<div>暂无歌词</div>';
      }
    })
    .catch(() => {
      lyricContainer.innerHTML = '<div>歌词加载失败</div>';
    });
}

// LRC解析
function parseLrc(lrc) {
  const lines = lrc.split('\n');
  const result = [];
  const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
  lines.forEach(line => {
    const match = timeReg.exec(line);
    if (match) {
      const min = parseInt(match[1]);
      const sec = parseInt(match[2]);
      const ms = parseInt(match[3]) / 1000;
      const time = min * 60 + sec + ms;
      const text = line.replace(timeReg, '').trim();
      if (text) result.push({ time, text });
    }
  });
  return result.sort((a, b) => a.time - b.time);
}

// ==================== 事件监听（加null检查） ====================
if (audio) {
  audio.addEventListener('timeupdate', () => {
    const curTime = audio.currentTime;
    // 歌词高亮
    const activeLine = lyricLines.find((line, idx) => line.time <= curTime && (!lyricLines[idx + 1] || lyricLines[idx + 1].time > curTime));
    if (activeLine && lyricContainer) {
      lyricContainer.innerHTML = `<div>${activeLine.text}</div>`;
      lyricContainer.classList.add('show');
    }
    // 进度
    const percent = audio.duration ? (curTime / audio.duration) * 100 : 0;
    if (progressFill) progressFill.style.width = percent + '%';
    if (currentTimeEl) currentTimeEl.textContent = formatTime(curTime);
    if (durationEl) durationEl.textContent = formatTime(audio.duration || 0);
  });

  audio.addEventListener('ended', () => { if (nextBtn) nextBtn.click(); });
}

if (playBtn) playBtn.onclick = () => {
  if (audio && audio.paused) {
    audio.play().catch(e => alert('播放失败：' + e.message));
    playBtn.innerHTML = '<i class="fas fa-pause"></i>';
  } else if (audio) {
    audio.pause();
    playBtn.innerHTML = '<i class="fas fa-play"></i>';
  }
};

if (prevBtn) prevBtn.onclick = () => {
  currentIndex = currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1;
  playCurrent();
};

if (nextBtn) nextBtn.onclick = () => {
  currentIndex = (currentIndex + 1) % playlist.length;
  playCurrent();
};

if (progressBar) progressBar.addEventListener('click', e => {
  if (!audio || !audio.duration) return;
  const rect = progressBar.getBoundingClientRect();
  const percent = (e.clientX - rect.left) / rect.width;
  audio.currentTime = percent * audio.duration;
});

if (volumeSlider) volumeSlider.oninput = () => {
  if (audio) audio.volume = volumeSlider.value / 100;
  localStorage.setItem('volume', volumeSlider.value);
};

// ==================== 播放列表 ====================
function renderPlaylist() {
  if (!playlistUl) return;
  playlistUl.innerHTML = '';
  playlist.forEach((song, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${song.name} - ${song.artist.join(' / ')}</span>`;
    li.onclick = (e) => {
      e.stopPropagation();
      currentIndex = i;
      playCurrent();
    };
    playlistUl.appendChild(li);
  });
}

function highlightPlaylist() {
  if (!playlistUl) return;
  document.querySelectorAll('#playlistUl li').forEach((li, i) => {
    li.classList.toggle('playing', i === currentIndex);
  });
}

function savePlaylist() {
  localStorage.setItem('playlist', JSON.stringify(playlist));
}

if (playlistBtn) playlistBtn.onclick = () => { if (playlistPanel) playlistPanel.classList.add('show'); };
if (closePlaylist) closePlaylist.onclick = () => { if (playlistPanel) playlistPanel.classList.remove('show'); };
if (clearPlaylist) clearPlaylist.onclick = () => {
  if (confirm('清空播放列表？')) {
    playlist = [];
    currentIndex = 0;
    savePlaylist();
    renderPlaylist();
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    if (titleEl) titleEl.textContent = '未播放';
    if (artistEl) artistEl.textContent = '';
    if (coverEl) coverEl.src = 'https://via.placeholder.com/60';
    if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
  }
};

document.addEventListener('click', e => {
  if (!e.target.closest('#playlist') && !e.target.closest('#playlistBtn')) {
    if (playlistPanel) playlistPanel.classList.remove('show');
  }
});

// ==================== 工具函数 ====================
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}
